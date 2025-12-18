/**
 * Account Validation Schemas
 *
 * Zod schemas for account-related validation
 * Reuses profile schemas for consistency
 */

import { z } from "zod";

// Reuse profile validation schemas
export { upsertProfileFormSchema as updateAccountProfileFormSchema } from "@/lib/profile/schemas";
export { avatarFileSchema } from "@/lib/profile/schemas";

// Account settings response schema (for edge validation)
export const accountSettingsResponseSchema = z.object({
  email: z.string().email(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

// Update account profile response schema
export const updateAccountProfileResponseSchema = z.object({
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
