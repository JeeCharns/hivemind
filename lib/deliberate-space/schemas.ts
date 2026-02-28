// lib/deliberate-space/schemas.ts

import { z } from "zod";

/**
 * Deliberate Space Validation Schemas
 */

// VOTE VALUE
export const voteValueSchema = z.number().int().min(1).max(5);

// MANUAL STATEMENT
export const manualStatementSchema = z.object({
  text: z.string().min(1).max(2000),
  clusterName: z.string().max(100).optional(),
});

// SELECTED STATEMENT (from understand)
export const selectedStatementSchema = z.object({
  bucketId: z.string().uuid(),
  clusterIndex: z.number().int().min(0),
  clusterName: z.string(),
  statementText: z.string().min(1).max(2000),
});

// CREATE SESSION
export const createDeliberateSessionSchema = z
  .object({
    hiveId: z.string().uuid(),
    mode: z.enum(["from-understand", "from-scratch"]),
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    sourceConversationId: z.string().uuid().optional(),
    selectedStatements: z.array(selectedStatementSchema).optional(),
    manualStatements: z.array(manualStatementSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.mode === "from-understand") {
        return (
          data.sourceConversationId &&
          data.selectedStatements &&
          data.selectedStatements.length > 0
        );
      }
      return data.manualStatements && data.manualStatements.length > 0;
    },
    {
      message:
        "from-understand requires sourceConversationId and selectedStatements; from-scratch requires manualStatements",
    }
  );

export type CreateDeliberateSessionInput = z.infer<typeof createDeliberateSessionSchema>;

// VOTING
export const voteOnStatementSchema = z.object({
  statementId: z.string().uuid(),
  voteValue: voteValueSchema.nullable(),
});

export type VoteOnStatementInput = z.infer<typeof voteOnStatementSchema>;

// COMMENTS
export const addCommentSchema = z.object({
  statementId: z.string().uuid(),
  text: z.string().min(1).max(1000),
  isAnonymous: z.boolean().optional().default(false),
});

export type AddCommentInput = z.infer<typeof addCommentSchema>;

export const deleteCommentSchema = z.object({
  commentId: z.coerce.number().int().positive(),
});

export type DeleteCommentInput = z.infer<typeof deleteCommentSchema>;

export const editCommentSchema = z.object({
  commentId: z.coerce.number().int().positive(),
  text: z.string().min(1).max(1000),
});

export type EditCommentInput = z.infer<typeof editCommentSchema>;

export const moderateCommentSchema = z.object({
  commentId: z.coerce.number().int().positive(),
  flag: z.enum(["antisocial", "misleading", "illegal", "spam", "doxing"]),
});

export type ModerateCommentInput = z.infer<typeof moderateCommentSchema>;

// FETCH PARAMS
export const getDeliberateSetupDataSchema = z.object({
  sourceConversationId: z.string().uuid(),
});

export type GetDeliberateSetupDataInput = z.infer<typeof getDeliberateSetupDataSchema>;
