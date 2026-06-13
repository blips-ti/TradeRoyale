import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret } from './crypto.js';

describe('crypto', () => {
  it('round-trips a secret through encrypt then decrypt', () => {
    const mnemonic = 'test test test test test test test test test test test junk';
    const encrypted = encryptSecret(mnemonic);
    expect(encrypted).not.toContain(mnemonic);
    expect(decryptSecret(encrypted)).toBe(mnemonic);
  });

  it('produces the iv:authTag:ciphertext base64 payload shape', () => {
    const encrypted = encryptSecret('hello');
    expect(encrypted.split(':')).toHaveLength(3);
  });

  it('rejects a payload whose ciphertext was tampered', () => {
    const [iv, tag, ciphertext] = encryptSecret('hello').split(':') as [string, string, string];
    const flipped = ciphertext[0] === 'A' ? 'B' : 'A';
    const tampered = `${iv}:${tag}:${flipped}${ciphertext.slice(1)}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => decryptSecret('not-a-valid-payload')).toThrow();
  });
});
