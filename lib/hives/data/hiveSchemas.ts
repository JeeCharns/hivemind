/**
 * Hive Data Validation Schemas
 *
 * Zod schemas for runtime validation of hive operations
 * Used in API endpoints and form validation
 */

import { z } from "zod";

/**
 * Schema for creating a new hive
 */
export const createHiveSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  logo_url: z.string().url().optional().nullable(),
});

/**
 * Schema for updating an existing hive
 */
export const updateHiveSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  logo_url: z.string().url().optional().nullable(),
});

/**
 * Schema for inviting members via email
 */
export const inviteEmailsSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(10),
});

export type CreateHiveInput = z.infer<typeof createHiveSchema>;
export type UpdateHiveInput = z.infer<typeof updateHiveSchema>;
export type InviteEmailsInput = z.infer<typeof inviteEmailsSchema>;
