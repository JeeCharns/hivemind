/**
 * Conversation API Schemas
 *
 * Zod schemas for runtime validation of API requests/responses
 * Follows SRP: validation logic separate from business logic
 */

import { z } from "zod";

/**
 * Schema for creating a new conversation
 */
export const createConversationSchema = z.object({
  hiveId: z.string().uuid(),
  type: z.enum(["understand", "decide"]),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
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
 * Standard API error response
 */
export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
