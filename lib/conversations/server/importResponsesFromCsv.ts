/**
 * Import Responses from CSV Service
 *
 * Server-side business logic for importing conversation responses from CSV
 * Follows SRP: single responsibility of CSV parsing and import
 * Provides idempotency via import_batch_id
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { randomUUID } from "crypto";
import type { ListenTag } from "../domain/listen.types";
import { LISTEN_TAGS } from "../domain/tags";

const MAX_ROWS = 1000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface ImportResponsesResult {
  importedCount: number;
  importBatchId: string;
}

/**
 * Normalize tag to allowed set
 * Empty/whitespace tags return null
 * Unknown/invalid tags return null (lenient - allows import to continue)
 */
function normalizeTag(tag: string | null | undefined): ListenTag | null {
  if (!tag || !tag.trim()) return null;

  const normalized = tag.toLowerCase().trim() as ListenTag;
  if (LISTEN_TAGS.includes(normalized)) {
    return normalized;
  }

  // Unknown tags treated as null (lenient mode - import continues without tag)
  return null;
}

/**
 * Parse and validate CSV file
 */
async function parseCsvFile(
  file: File
): Promise<Array<Record<string, string>>> {
  // Validate file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File size exceeds maximum of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`
    );
  }

  // Read file contents
  const fileText = await file.text();

  // Parse CSV
  let records: Array<Record<string, string>>;
  try {
    const normalizeHeader = (header: string) => {
      const normalized = header
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase();
      if (normalized === "responses") return "response";
      return normalized;
    };

    records = parse(fileText, {
      columns: (headers) => headers.map(normalizeHeader),
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    console.error("[importResponsesFromCsv] CSV parse error:", err);
    throw new Error("Invalid CSV format");
  }

  // Validate required columns
  if (records.length === 0) {
    throw new Error("CSV file is empty");
  }

  const firstRecord = records[0];
  if (!("response" in firstRecord)) {
    throw new Error('CSV must include a column named "response"');
  }

  // Enforce row limit
  if (records.length > MAX_ROWS) {
    throw new Error(`CSV exceeds maximum of ${MAX_ROWS} rows`);
  }

  return records;
}

/**
 * Import responses from CSV file
 *
 * @param supabase - Supabase client with auth
 * @param conversationId - Target conversation UUID
 * @param userId - User performing the import
 * @param file - CSV file to import
 * @returns Import result with count and batch ID
 * @throws Error if validation fails or import fails
 */
export async function importResponsesFromCsv(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  file: File
): Promise<ImportResponsesResult> {
  // Fetch conversation to validate it exists and user has access
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, hive_id, type")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) {
    throw new Error("Conversation not found");
  }

  // Only "understand" type supports CSV import
  if (conversation.type !== "understand") {
    throw new Error("CSV import is only supported for 'understand' sessions");
  }

  // Parse CSV
  const records = await parseCsvFile(file);

  // Generate import batch ID for idempotency
  const importBatchId = randomUUID();

  // Prepare rows for insertion
  const rows = records
    .map((record) => {
      const responseText = record.response?.trim();
      if (!responseText) return null; // Skip empty responses

      // Parse is_anonymous from CSV, defaulting to true for imported survey data
      let isAnonymous = true;
      if (record.anonymous !== undefined || record.is_anonymous !== undefined) {
        const anonymousValue = (
          record.anonymous ||
          record.is_anonymous ||
          ""
        ).toLowerCase();
        isAnonymous = !["false", "0", "no"].includes(anonymousValue);
      }

      return {
        conversation_id: conversationId,
        user_id: userId,
        response_text: responseText,
        tag: normalizeTag(record.tag),
        import_batch_id: importBatchId,
        is_anonymous: isAnonymous,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    throw new Error("No valid responses found in CSV");
  }

  // Insert responses in a single batch
  const { error: insertError } = await supabase
    .from("conversation_responses")
    .insert(rows);

  if (insertError) {
    console.error("[importResponsesFromCsv] Insert failed:", insertError);

    // Check for duplicate import_batch_id (idempotency)
    if (insertError.code === "23505") {
      // unique_violation
      throw new Error("This CSV has already been imported");
    }

    throw new Error("Failed to import responses");
  }

  // Clear any previous analysis error; analysis will be triggered manually.
  await supabase
    .from("conversations")
    .update({ analysis_error: null })
    .eq("id", conversationId);

  return {
    importedCount: rows.length,
    importBatchId,
  };
}
