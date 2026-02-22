/**
 * Hive Validation Schemas
 *
 * Zod schemas for hive-related validation at API boundaries.
 */

import { z } from "zod";

export const hiveVisibilitySchema = z.enum(["public", "private"]);

export const createHiveNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Hive name is required")
    .max(100, "Hive name must be 100 characters or less"),
});

export const createHiveJsonBodySchema = createHiveNameSchema.extend({
  // Prefer storage paths (e.g. "hiveId/uuid.png"); allow full URLs for backward compatibility.
  logo_url: z.string().trim().min(1).max(500).optional().nullable(),
  visibility: hiveVisibilitySchema.optional(),
});

export const hiveLogoFileSchema = z.object({
  size: z.number().max(2 * 1024 * 1024, "File size must be less than 2MB"),
  type: z
    .string()
    .refine(
      (type) =>
        ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type),
      "File must be a JPEG, PNG, WebP, or GIF image"
    ),
});

export const accessModeSchema = z.enum(["anyone", "invited_only"]);

export const updateShareLinkAccessModeSchema = z.object({
  accessMode: accessModeSchema,
});

export const inviteEmailsSchema = z.object({
  emails: z
    .array(z.string().email("Invalid email format"))
    .min(1, "At least one email is required")
    .max(10, "Cannot invite more than 10 emails at once"),
});

export const inviteTokenSchema = z.object({
  token: z
    .string()
    .min(32, "Invalid token")
    .max(128, "Invalid token")
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid token format"),
});
