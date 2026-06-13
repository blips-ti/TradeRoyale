import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "../env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PAYLOAD_PARTS = 3;

const key = Buffer.from(env.MNEMONIC_ENCRYPTION_KEY, "hex");

// Encrypts a secret to the format `iv:authTag:ciphertext`, each part base64.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString(
    "base64",
  )}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== PAYLOAD_PARTS) {
    throw new Error(
      "Malformed encrypted payload: expected iv:authTag:ciphertext",
    );
  }
  const [ivPart, tagPart, cipherPart] = parts as [string, string, string];
  const iv = Buffer.from(ivPart, "base64");
  const authTag = Buffer.from(tagPart, "base64");
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Malformed encrypted payload: invalid auth tag length");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(cipherPart, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
