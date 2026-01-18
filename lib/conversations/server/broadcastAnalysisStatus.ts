/**
 * Broadcast Analysis Status Service
 *
 * Broadcasts analysis status updates to all subscribers via Supabase Broadcast channel.
 * This provides reliable push-based updates for analysis status changes.
 *
 * Architecture:
 * - Worker/server broadcasts status after DB update
 * - Clients subscribe to channel and update status directly
 * - Fire-and-forget: broadcast failures don't fail the operation
 * - Complements postgres_changes with explicit server-initiated broadcasts
 */

import { createClient } from "@supabase/supabase-js";

/**
 * Channel name format for analysis status broadcasts
 */
export function getAnalysisChannelName(conversationId: string): string {
  return `analysis:${conversationId}`;
}

/**
 * Broadcast event type for analysis status updates
 */
export const ANALYSIS_STATUS_EVENT = "analysis_status" as const;

/**
 * Analysis progress stages with their display percentages and messages
 * Used to communicate granular progress to the UI
 */
export const ANALYSIS_PROGRESS_STAGES = {
  starting: { percent: 0, message: "Starting analysis..." },
  fetching: { percent: 5, message: "Fetching responses" },
  fetched: { percent: 10, message: "Found responses" }, // Will be dynamic: "Found X new responses"
  embedding: { percent: 15, message: "Generating embeddings..." },
  embedding_progress: { percent: 25, message: "Generating embeddings..." }, // Mid-embedding
  embedding_done: { percent: 40, message: "Embeddings complete" },
  clustering: { percent: 45, message: "Clustering responses..." },
  themes: { percent: 55, message: "Generating theme titles" },
  subthemes: { percent: 70, message: "Generating subthemes" },
  consolidating: { percent: 80, message: "Consolidating insights" },
  saving: { percent: 90, message: "Updating database" },
  umap: { percent: 95, message: "Generating 2D visual map" },
  finalizing: { percent: 98, message: "Making it look pretty" },
  complete: { percent: 100, message: "Analysis complete" },
} as const;

export type AnalysisProgressStage = keyof typeof ANALYSIS_PROGRESS_STAGES;

export interface AnalysisProgressPayload {
  /** Progress percentage 0-100 */
  progressPercent: number;
  /** Human-readable status message */
  progressMessage: string;
  /** Optional stage identifier for programmatic handling */
  progressStage?: AnalysisProgressStage;
}

export interface AnalysisStatusPayload {
  analysisStatus: "not_started" | "embedding" | "analyzing" | "ready" | "error";
  analysisError?: string | null;
  responseCount?: number;
  analysisResponseCount?: number;
  /** Granular progress information */
  progress?: AnalysisProgressPayload;
}

interface BroadcastAnalysisStatusInput {
  conversationId: string;
  payload: AnalysisStatusPayload;
}

/**
 * Broadcasts an analysis status update to all subscribers.
 *
 * Uses service role client for reliable server-side broadcasting.
 * Errors are logged but not thrown - the operation should succeed
 * even if broadcast fails (clients have polling as fallback).
 *
 * @param input - The conversation ID and status payload to broadcast
 */
export async function broadcastAnalysisStatus(
  input: BroadcastAnalysisStatusInput
): Promise<void> {
  const { conversationId, payload } = input;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error(
      "[broadcastAnalysisStatus] Missing Supabase environment variables for broadcast"
    );
    return;
  }

  try {
    // Use service role client for server-side broadcast
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const channelName = getAnalysisChannelName(conversationId);
    const channel = supabase.channel(channelName);

    // Subscribe briefly to send the broadcast
    await channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.send({
          type: "broadcast",
          event: ANALYSIS_STATUS_EVENT,
          payload,
        });
      }
    });

    // Small delay to ensure message is sent, then cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
    await supabase.removeChannel(channel);

    const progressInfo = payload.progress
      ? ` (${payload.progress.progressPercent}% - ${payload.progress.progressMessage})`
      : "";
    console.log(
      `[broadcastAnalysisStatus] Broadcast ${payload.analysisStatus}${progressInfo} for ${conversationId}`
    );
  } catch (error) {
    // Log but don't throw - broadcast failure shouldn't fail the operation
    console.error("[broadcastAnalysisStatus] Failed to broadcast:", error);
  }
}

/**
 * Helper to broadcast a progress update during analysis.
 * Wraps broadcastAnalysisStatus with progress-specific payload.
 *
 * @param conversationId - The conversation ID
 * @param stage - The progress stage identifier
 * @param customMessage - Optional custom message override (e.g., "Found 42 new responses")
 */
export async function broadcastAnalysisProgress(
  conversationId: string,
  stage: AnalysisProgressStage,
  customMessage?: string
): Promise<void> {
  const stageInfo = ANALYSIS_PROGRESS_STAGES[stage];

  // Determine the appropriate analysis status based on stage
  let analysisStatus: AnalysisStatusPayload["analysisStatus"] = "analyzing";
  if (stage === "starting" || stage === "fetching" || stage === "fetched") {
    analysisStatus = "embedding"; // Pre-embedding stages
  } else if (
    stage === "embedding" ||
    stage === "embedding_progress" ||
    stage === "embedding_done"
  ) {
    analysisStatus = "embedding";
  } else if (stage === "complete") {
    analysisStatus = "ready";
  }

  await broadcastAnalysisStatus({
    conversationId,
    payload: {
      analysisStatus,
      progress: {
        progressPercent: stageInfo.percent,
        progressMessage: customMessage ?? stageInfo.message,
        progressStage: stage,
      },
    },
  });
}
