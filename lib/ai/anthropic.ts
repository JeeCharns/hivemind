/**
 * Anthropic API client
 *
 * Thin wrapper around the Anthropic SDK for generating AI content.
 */

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured. Set it in your environment variables."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}
