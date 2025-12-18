/**
 * Conversation API Schemas
 *
 * Zod schemas for runtime validation of API requests/responses
 * Follows SRP: validation logic separate from business logic
 */

import { z } from "zod";
import { LISTEN_TAGS } from "@/lib/conversations/domain/tags";
import type { ListenTag } from "@/lib/conversations/domain/listen.types";

/**
 * Schema for creating a new conversation
 */
export const createConversationSchema = z.object({
  hiveId: z.string().uuid(),
  type: z.enum(["understand", "decide"]),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  // Solution space (decision session) fields
  sourceConversationId: z.string().uuid().optional(),
  sourceReportVersion: z.number().int().positive().optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

/**
 * Schema for conversation creation response
 */
export const createConversationResponseSchema = z.object({
  id: z.string().uuid(),
});

export type CreateConversationResponse = z.infer<
  typeof createConversationResponseSchema
>;

/**
 * Schema for CSV upload response
 */
export const uploadCsvResponseSchema = z.object({
  importedCount: z.number().int().nonnegative(),
});

export type UploadCsvResponse = z.infer<typeof uploadCsvResponseSchema>;

/**
 * Schema for analysis trigger response
 */
export const triggerAnalysisResponseSchema = z.object({
  status: z.enum(["queued", "already_running", "already_complete"]),
});

export type TriggerAnalysisResponse = z.infer<
  typeof triggerAnalysisResponseSchema
>;

/**
 * Schema for creating a new response
 */
export const createResponseSchema = z.object({
  text: z.string().min(1).max(500),
  tag: z.enum(LISTEN_TAGS as [ListenTag, ...ListenTag[]]).nullable().optional(),
  anonymous: z.boolean().optional(),
});

export type CreateResponseInput = z.infer<typeof createResponseSchema>;

/**
 * Schema for analysis status in response
 */
export const analysisStatusSchema = z.object({
  triggered: z.boolean(),
  status: z.enum(["queued", "already_running", "already_complete", "skipped"]),
});

export type AnalysisStatusResponse = z.infer<typeof analysisStatusSchema>;

/**
 * Schema for analysis status endpoint response
 */
export const getAnalysisStatusResponseSchema = z.object({
  analysisStatus: z.enum(["not_started", "embedding", "analyzing", "ready", "error"]).nullable(),
  analysisError: z.string().nullable(),
  responseCount: z.number().int().nonnegative(),
  threshold: z.number().int().positive(),
});

export type GetAnalysisStatusResponse = z.infer<typeof getAnalysisStatusResponseSchema>;

/**
 * Standard API error response
 */
export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Schema for voting on a proposal (quadratic voting)
 */
export const voteOnProposalSchema = z.object({
  responseId: z.string(), // BIGINT as string (not UUID)
  delta: z.union([z.literal(1), z.literal(-1)]),
});

export type VoteOnProposalInput = z.infer<typeof voteOnProposalSchema>;

/**
 * Schema for vote response
 */
export const voteResponseSchema = z.object({
  success: z.boolean(),
  newVotes: z.number().int().nonnegative(),
  remainingCredits: z.number().int().nonnegative(),
  errorCode: z.string().optional(),
});

export type VoteResponse = z.infer<typeof voteResponseSchema>;

/**
 * Schema for get votes response
 */
export const getVotesResponseSchema = z.object({
  votes: z.record(z.string(), z.number().int().nonnegative()),
  totalCreditsSpent: z.number().int().nonnegative(),
  remainingCredits: z.number().int().nonnegative(),
});

export type GetVotesResponse = z.infer<typeof getVotesResponseSchema>;

/**
 * Schema for problem report list item
 */
export const problemReportListItemSchema = z.object({
  conversationId: z.string().uuid(),
  conversationSlug: z.string().nullable(),
  title: z.string().nullable(),
  latestReportVersion: z.number().int().positive(),
  latestReportCreatedAt: z.string().nullable(),
});

export type ProblemReportListItem = z.infer<typeof problemReportListItemSchema>;

/**
 * Schema for report preview response
 */
export const reportPreviewResponseSchema = z.object({
  version: z.number().int().positive(),
  html: z.string(),
  createdAt: z.string().nullable(),
});

export type ReportPreviewResponse = z.infer<typeof reportPreviewResponseSchema>;
