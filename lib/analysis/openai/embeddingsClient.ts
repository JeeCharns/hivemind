/**
 * OpenAI Embeddings Client
 *
 * Handles embedding generation with batching and error handling
 * Follows SRP: single responsibility of embedding generation
 */

import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 100; // OpenAI recommends batching for efficiency

/**
 * Initialize OpenAI client
 */
export function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  return new OpenAI({ apiKey });
}

/**
 * Generate embeddings for a batch of texts
 *
 * @param client - OpenAI client
 * @param texts - Array of text strings to embed
 * @returns Array of embedding vectors
 */
export async function generateEmbeddings(
  client: OpenAI,
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const embeddings: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      });

      const batchEmbeddings = response.data.map((item) => item.embedding);
      embeddings.push(...batchEmbeddings);
    } catch (error) {
      console.error(`[generateEmbeddings] Batch ${i / BATCH_SIZE + 1} failed:`, error);
      throw new Error(
        `Failed to generate embeddings for batch ${i / BATCH_SIZE + 1}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  return embeddings;
}

/**
 * Generate embedding for a single text
 *
 * @param client - OpenAI client
 * @param text - Text to embed
 * @returns Embedding vector
 */
export async function generateEmbedding(
  client: OpenAI,
  text: string
): Promise<number[]> {
  const embeddings = await generateEmbeddings(client, [text]);
  return embeddings[0];
}
