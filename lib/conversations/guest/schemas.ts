/**
 * Guest Access Schemas
 *
 * Zod schemas for runtime validation of guest access API boundaries.
 */

import { z } from "zod";

// ── Share Link Schemas ────────────────────────────────────

/**
 * Valid expiry durations for conversation share links.
 */
export const shareLinkExpirySchema = z.enum(["1d", "7d", "28d"]);

export type ShareLinkExpiryInput = z.infer<typeof shareLinkExpirySchema>;

/**
 * Schema for creating a conversation share link.
 */
export const createShareLinkSchema = z.object({
  expiresIn: shareLinkExpirySchema,
});

export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;

/**
 * Validates a share token format (32–128 chars, base64url-safe).
 * Matches the pattern used by hive invite tokens.
 */
export const shareTokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid token format");

// ── Guest Session Schemas ─────────────────────────────────

/**
 * Schema for the guest session cookie value.
 */
export const guestSessionCookieSchema = z
  .string()
  .min(32)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid session token format");

/**
 * Guest response submission — same shape as authenticated responses,
 * but `anonymous` is always forced to true on the server side.
 */
export const guestCreateResponseSchema = z
  .object({
    text: z.string().min(1, "Response text is required").max(500),
    tag: z
      .enum(["need", "data", "want", "problem", "risk", "proposal"])
      .nullable()
      .optional(),
  })
  .transform((data) => ({
    ...data,
    tag:
      data.tag && typeof data.tag === "string" && data.tag.trim()
        ? data.tag
        : null,
  }));

export type GuestCreateResponseInput = z.infer<
  typeof guestCreateResponseSchema
>;

/**
 * Guest feedback submission — same shape as authenticated feedback.
 */
export const guestSubmitFeedbackSchema = z.object({
  responseId: z
    .union([z.string().min(1), z.number().int().positive()])
    .transform((value) => String(value)),
  feedback: z.enum(["agree", "pass", "disagree"]),
});

export type GuestSubmitFeedbackInput = z.infer<
  typeof guestSubmitFeedbackSchema
>;
