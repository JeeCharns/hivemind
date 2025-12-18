/**
 * Profile Validation Schemas
 *
 * Zod schemas for profile-related validation
 */

import { z } from "zod";

// Profile status response schema
export const profileStatusResponseSchema = z.object({
  hasProfile: z.boolean(),
  needsSetup: z.boolean(),
});

// Upsert profile form schema (for display name)
export const upsertProfileFormSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(60, "Display name must be 60 characters or less"),
});

// Avatar file validation (runtime checks)
export const avatarFileSchema = z.object({
  size: z.number().max(2 * 1024 * 1024, "File size must be less than 2MB"),
  type: z
    .string()
    .refine(
      (type) =>
        ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type),
      "File must be a JPEG, PNG, WebP, or GIF image"
    ),
});

// Profile update input
export interface ProfileUpdateInput {
  displayName: string;
  avatarFile?: File | null;
}
