/**
 * Save Response Embeddings
 *
 * Persists response embeddings to database for similarity grouping
 * Called during analysis pipeline after embeddings are generated
 */

import type { SupabaseClient } from "@supabase/supabase-js";

interface ResponseData {
  id: string;
  text: string;
}

/**
 * Save embeddings for responses to database
 *
 * @param supabase - Supabase client (service role)
 * @param conversationId - Conversation UUID
 * @param responses - Response data
 * @param embeddings - Normalized embedding vectors
 */
export async function saveResponseEmbeddings(
  supabase: SupabaseClient,
  conversationId: string,
  responses: ResponseData[],
  embeddings: number[][]
): Promise<void> {
  if (responses.length !== embeddings.length) {
    throw new Error(
      `Mismatch: ${responses.length} responses but ${embeddings.length} embeddings`
    );
  }

  console.log(
    `[saveResponseEmbeddings] Saving ${embeddings.length} embeddings for ${conversationId}`
  );

  // Idempotent write path: upsert on primary key (response_id).
  // This avoids hard failures if the analysis is re-run or overlapping writes occur.
  const unique = new Map<string, number[]>();
  for (let i = 0; i < responses.length; i++) {
    unique.set(responses[i].id, embeddings[i]);
  }

  if (unique.size !== responses.length) {
    console.warn("[saveResponseEmbeddings] Duplicate response IDs detected; de-duping", {
      original: responses.length,
      unique: unique.size,
    });
  }

  // Insert new embeddings in batches (avoid overwhelming database)
  const BATCH_SIZE = 100;
  const entries = Array.from(unique.entries());
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, Math.min(i + BATCH_SIZE, entries.length));

    const rows = batch.map(([responseId, embedding]) => ({
      response_id: responseId,
      conversation_id: conversationId,
      embedding,
    }));

    const { error } = await supabase
      .from("conversation_response_embeddings")
      .upsert(rows, { onConflict: "response_id" });

    if (error) {
      console.error(
        `[saveResponseEmbeddings] Failed to save batch ${i / BATCH_SIZE + 1}:`,
        error
      );
      throw new Error(`Failed to save embeddings batch: ${error.message}`);
    }

    console.log(
      `[saveResponseEmbeddings] Saved batch ${i / BATCH_SIZE + 1} (${rows.length} embeddings)`
    );
  }

  console.log(
    `[saveResponseEmbeddings] Successfully saved all ${entries.length} embeddings`
  );
}
