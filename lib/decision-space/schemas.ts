// lib/decision-space/schemas.ts

import { z } from "zod";

/**
 * Decision Space Validation Schemas
 */

// ============================================
// ENUMS
// ============================================

export const decisionVisibilitySchema = z.enum(["hidden", "transparent"]);

// ============================================
// CREATE DECISION SESSION
// ============================================

export const selectedStatementSchema = z.object({
  bucketId: z.string().uuid(),
  clusterIndex: z.number().int().min(0),
  statementText: z.string().min(1).max(2000),
  agreePercent: z.number().min(0).max(100).nullable(),
});

export const createDecisionSessionSchema = z.object({
  hiveId: z.string().uuid(),
  sourceConversationId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  selectedClusters: z.array(z.number().int().min(0)).min(1),
  selectedStatements: z.array(selectedStatementSchema).min(1),
  consensusThreshold: z.number().int().min(50).max(90),
  visibility: decisionVisibilitySchema,
  deadline: z.string().datetime().optional(),
});

export type CreateDecisionSessionInput = z.infer<typeof createDecisionSessionSchema>;

// ============================================
// VOTING
// ============================================

export const voteOnProposalSchema = z.object({
  roundId: z.string().uuid(),
  proposalId: z.string().uuid(),
  delta: z.number().int().refine((v) => v === 1 || v === -1, {
    message: "Delta must be 1 or -1",
  }),
});

export type VoteOnProposalInput = z.infer<typeof voteOnProposalSchema>;

// ============================================
// ROUND MANAGEMENT
// ============================================

export const closeRoundSchema = z.object({
  roundId: z.string().uuid(),
});

export type CloseRoundInput = z.infer<typeof closeRoundSchema>;

export const startNewRoundSchema = z.object({
  conversationId: z.string().uuid(),
  keepProposals: z.boolean(),
  selectedStatements: z.array(selectedStatementSchema).optional(),
}).refine(
  (data) => data.keepProposals || (data.selectedStatements && data.selectedStatements.length > 0),
  { message: "selectedStatements required when keepProposals is false" }
);

export type StartNewRoundInput = z.infer<typeof startNewRoundSchema>;

// ============================================
// FETCH PARAMS
// ============================================

export const getDecisionSetupDataSchema = z.object({
  sourceConversationId: z.string().uuid(),
});

export type GetDecisionSetupDataInput = z.infer<typeof getDecisionSetupDataSchema>;
