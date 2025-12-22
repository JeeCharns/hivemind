/**
 * Response Consensus - Domain Logic
 *
 * Computes per-response vote totals and percentages from feedback.
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

