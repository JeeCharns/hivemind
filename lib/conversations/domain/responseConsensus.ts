/**
 * Response Consensus - Domain Logic
 *
 * Computes per-response vote totals and percentages from feedback.
 * Also computes consensus for consolidated statements (cluster buckets).
 * Pure functions only; no IO.
 */

import type { ConsensusItem } from "@/types/conversation-report";

export interface ConsensusResponseRow {
  id: string;
  responseText: string;
}

export interface ConsensusFeedbackRow {
  responseId: string;
  feedback: string;
}

export interface ConsensusBucketRow {
  bucketId: string;
  consolidatedStatement: string;
  responseIds: string[];
}

export interface ConsensusUnconsolidatedRow {
  responseId: string;
  responseText: string;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function computeResponseConsensusItems(
  responses: ConsensusResponseRow[],
  feedbackRows: ConsensusFeedbackRow[]
): ConsensusItem[] {
  const responseTextById = new Map<string, string>();
  responses.forEach((r) => responseTextById.set(r.id, r.responseText));

  const countsByResponseId = new Map<
    string,
    { agree: number; pass: number; disagree: number }
  >();
  responses.forEach((r) =>
    countsByResponseId.set(r.id, { agree: 0, pass: 0, disagree: 0 })
  );

  feedbackRows.forEach((row) => {
    const counts = countsByResponseId.get(row.responseId);
    if (!counts) return;
    if (row.feedback === "agree") counts.agree++;
    else if (row.feedback === "pass") counts.pass++;
    else if (row.feedback === "disagree") counts.disagree++;
  });

  return responses
    .map((r): ConsensusItem | null => {
      const counts = countsByResponseId.get(r.id);
      if (!counts) return null;
      const totalVotes = counts.agree + counts.pass + counts.disagree;
      if (totalVotes <= 0) return null;

      const agreePercent = clampPercent(
        Math.round((counts.agree / totalVotes) * 100)
      );
      const disagreePercent = clampPercent(
        Math.round((counts.disagree / totalVotes) * 100)
      );
      const passPercent = clampPercent(100 - agreePercent - disagreePercent);

      return {
        id: r.id,
        responseText: responseTextById.get(r.id) ?? r.responseText,
        agreePercent,
        passPercent,
        disagreePercent,
        agreeVotes: counts.agree,
        passVotes: counts.pass,
        disagreeVotes: counts.disagree,
        totalVotes,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

/**
 * Computes consensus items from consolidated statements (cluster buckets).
 * Aggregates feedback from all responses in each bucket.
 * Also includes unconsolidated responses as individual items.
 * Items with votes appear first, items with no votes appear at the end.
 *
 * @param buckets - Cluster buckets with consolidated statements and their member response IDs
 * @param unconsolidatedResponses - Individual responses not part of any bucket
 * @param feedbackRows - All feedback rows for the conversation
 * @returns ConsensusItem[] with voted items first, then unvoted items
 */
export function computeConsolidatedConsensusItems(
  buckets: ConsensusBucketRow[],
  unconsolidatedResponses: ConsensusUnconsolidatedRow[],
  feedbackRows: ConsensusFeedbackRow[]
): ConsensusItem[] {
  // Build a map of response ID -> feedback counts
  const feedbackByResponseId = new Map<
    string,
    { agree: number; pass: number; disagree: number }
  >();

  feedbackRows.forEach((row) => {
    if (!feedbackByResponseId.has(row.responseId)) {
      feedbackByResponseId.set(row.responseId, {
        agree: 0,
        pass: 0,
        disagree: 0,
      });
    }
    const counts = feedbackByResponseId.get(row.responseId)!;
    if (row.feedback === "agree") counts.agree++;
    else if (row.feedback === "pass") counts.pass++;
    else if (row.feedback === "disagree") counts.disagree++;
  });

  const votedItems: ConsensusItem[] = [];
  const unvotedItems: ConsensusItem[] = [];

  // Process consolidated statements (buckets)
  for (const bucket of buckets) {
    // Only count votes on the representative response (first response in the bucket)
    // Votes are cast on the representative, not aggregated from all original responses
    const representativeId = bucket.responseIds[0];
    const counts = representativeId
      ? feedbackByResponseId.get(representativeId)
      : undefined;

    const totalAgree = counts?.agree ?? 0;
    const totalPass = counts?.pass ?? 0;
    const totalDisagree = counts?.disagree ?? 0;

    const totalVotes = totalAgree + totalPass + totalDisagree;

    if (totalVotes > 0) {
      const agreePercent = clampPercent(
        Math.round((totalAgree / totalVotes) * 100)
      );
      const disagreePercent = clampPercent(
        Math.round((totalDisagree / totalVotes) * 100)
      );
      const passPercent = clampPercent(100 - agreePercent - disagreePercent);

      votedItems.push({
        id: bucket.bucketId,
        responseText: bucket.consolidatedStatement,
        agreePercent,
        passPercent,
        disagreePercent,
        agreeVotes: totalAgree,
        passVotes: totalPass,
        disagreeVotes: totalDisagree,
        totalVotes,
      });
    } else {
      // Include items with no votes
      unvotedItems.push({
        id: bucket.bucketId,
        responseText: bucket.consolidatedStatement,
        agreePercent: 0,
        passPercent: 0,
        disagreePercent: 0,
        agreeVotes: 0,
        passVotes: 0,
        disagreeVotes: 0,
        totalVotes: 0,
      });
    }
  }

  // Process unconsolidated responses (individual responses not in buckets)
  for (const response of unconsolidatedResponses) {
    const counts = feedbackByResponseId.get(response.responseId) || {
      agree: 0,
      pass: 0,
      disagree: 0,
    };

    const totalVotes = counts.agree + counts.pass + counts.disagree;

    if (totalVotes > 0) {
      const agreePercent = clampPercent(
        Math.round((counts.agree / totalVotes) * 100)
      );
      const disagreePercent = clampPercent(
        Math.round((counts.disagree / totalVotes) * 100)
      );
      const passPercent = clampPercent(100 - agreePercent - disagreePercent);

      votedItems.push({
        id: response.responseId,
        responseText: response.responseText,
        agreePercent,
        passPercent,
        disagreePercent,
        agreeVotes: counts.agree,
        passVotes: counts.pass,
        disagreeVotes: counts.disagree,
        totalVotes,
      });
    } else {
      // Include items with no votes
      unvotedItems.push({
        id: response.responseId,
        responseText: response.responseText,
        agreePercent: 0,
        passPercent: 0,
        disagreePercent: 0,
        agreeVotes: 0,
        passVotes: 0,
        disagreeVotes: 0,
        totalVotes: 0,
      });
    }
  }

  // Return voted items first, then unvoted items
  return [...votedItems, ...unvotedItems];
}
