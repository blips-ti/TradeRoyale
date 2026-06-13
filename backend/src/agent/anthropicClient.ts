import Anthropic from "@anthropic-ai/sdk";

import { env } from "../env.js";

let client: Anthropic | undefined;

export class MissingAnthropicKeyError extends Error {}

// Lazy so the app boots without ANTHROPIC_API_KEY; the key is only required once a game
// starts and the AgentRunner begins ticking.
export function getAnthropicClient(): Anthropic {
  if (client) return client;
  if (!env.ANTHROPIC_API_KEY) {
    throw new MissingAnthropicKeyError(
      "ANTHROPIC_API_KEY is not set; cannot run trading agents",
    );
  }
  client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}
