/**
 * Agreement Summaries - Domain Logic
 *
 * Computes "most agreed" and "most divisive" response summaries from feedback.
 * Pure functions only; no IO.
 */

import type { AgreementSummary } from "@/types/conversation-report";

export type Feedback = "agree" | "pass" | "disagree";

export interface SummaryResponseRow {
  id: string;
  responseText: string;
}

export interface SummaryFeedbackRow {
  responseId: string;
  feedback: string;
}

export interface AgreementSummaryOptions {
  minVotes: number;
  maxPerType: number;
  agreementAgreePercentMin: number;
  divisiveAgreePercentMin: number;
  divisiveAgreePercentMax: number;
  divisiveDisagreePercentMin: number;
}

const DEFAULT_OPTIONS: AgreementSummaryOptions = {
  minVotes: 5,
  maxPerType: 5,
  agreementAgreePercentMin: 70,
  divisiveAgreePercentMin: 40,
  divisiveAgreePercentMax: 60,
  divisiveDisagreePercentMin: 35,
};

function toCounts() {
  return { agree: 0, pass: 0, disagree: 0 };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function computeAgreementSummaries(
  responses: SummaryResponseRow[],
  feedbackRows: SummaryFeedbackRow[],
  options: Partial<AgreementSummaryOptions> = {}
): AgreementSummary[] {
  const mergedOptions: AgreementSummaryOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const responseTextById = new Map<string, string>();
  responses.forEach((r) => responseTextById.set(r.id, r.responseText));

  const countsByResponseId = new Map<string, ReturnType<typeof toCounts>>();
  responses.forEach((r) => countsByResponseId.set(r.id, toCounts()));

  feedbackRows.forEach((row) => {
    const counts = countsByResponseId.get(row.responseId);
    if (!counts) return;
    if (row.feedback === "agree") counts.agree++;
    else if (row.feedback === "pass") counts.pass++;
    else if (row.feedback === "disagree") counts.disagree++;
  });

  const rows = responses
    .map((r) => {
      const counts = countsByResponseId.get(r.id) ?? toCounts();
      const totalVotes = counts.agree + counts.pass + counts.disagree;
      if (totalVotes < mergedOptions.minVotes) return null;

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
        counts,
        totalVotes,
        agreePercent,
        passPercent,
        disagreePercent,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const agreement = rows
    .filter((r) => r.agreePercent >= mergedOptions.agreementAgreePercentMin)
    .sort((a, b) => {
      if (b.agreePercent !== a.agreePercent)
        return b.agreePercent - a.agreePercent;
      if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes;
      return a.id.localeCompare(b.id);
    })
    .slice(0, mergedOptions.maxPerType)
    .map(
      (r): AgreementSummary => ({
        id: r.id,
        responseText: r.responseText,
        agreePercent: r.agreePercent,
        passPercent: r.passPercent,
        disagreePercent: r.disagreePercent,
        totalVotes: r.totalVotes,
        type: "agreement",
      })
    );

  const divisive = rows
    .filter((r) => {
      const agreeInBand =
        r.agreePercent >= mergedOptions.divisiveAgreePercentMin &&
        r.agreePercent <= mergedOptions.divisiveAgreePercentMax;
      const enoughDisagree =
        r.disagreePercent >= mergedOptions.divisiveDisagreePercentMin;
      return agreeInBand && enoughDisagree;
    })
    .sort((a, b) => {
      const aDistance = Math.abs(a.agreePercent - 50);
      const bDistance = Math.abs(b.agreePercent - 50);
      if (aDistance !== bDistance) return aDistance - bDistance;
      const aSplit = Math.min(a.counts.agree, a.counts.disagree);
      const bSplit = Math.min(b.counts.agree, b.counts.disagree);
      if (bSplit !== aSplit) return bSplit - aSplit;
      if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes;
      return a.id.localeCompare(b.id);
    })
    .slice(0, mergedOptions.maxPerType)
    .map(
      (r): AgreementSummary => ({
        id: r.id,
        responseText: r.responseText,
        agreePercent: r.agreePercent,
        passPercent: r.passPercent,
        disagreePercent: r.disagreePercent,
        totalVotes: r.totalVotes,
        type: "divisive",
      })
    );

  return [...agreement, ...divisive];
}
