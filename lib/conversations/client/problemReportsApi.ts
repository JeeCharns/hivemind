/**
 * Problem Reports API Client
 *
 * Client-side wrapper for fetching problem space reports for decision sessions
 */

import type { ProblemReportListItem } from "../schemas";

export class ProblemReportsApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "ProblemReportsApiError";
  }
}

/**
 * Fetch list of problem space reports in a hive
 *
 * @param hiveId - Hive ID
 * @returns List of conversations with reports
 * @throws ProblemReportsApiError on failure
 */
export async function fetchProblemReports(
  hiveId: string
): Promise<ProblemReportListItem[]> {
  const response = await fetch(`/api/hives/${hiveId}/problem-reports`);

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ProblemReportsApiError(
      body?.error ?? "Failed to fetch problem reports",
      response.status
    );
  }

  return response.json();
}

/**
 * Fetch report preview HTML
 *
 * @param conversationId - Conversation ID
 * @param version - Optional version number (defaults to latest)
 * @returns Report HTML and metadata
 * @throws ProblemReportsApiError on failure
 */
export async function fetchReportPreview(
  conversationId: string,
  version?: number
): Promise<{ version: number; html: string; createdAt: string | null }> {
  const url = version
    ? `/api/conversations/${conversationId}/report-preview?version=${version}`
    : `/api/conversations/${conversationId}/report-preview`;

  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ProblemReportsApiError(
      body?.error ?? "Failed to fetch report preview",
      response.status
    );
  }

  return response.json();
}
