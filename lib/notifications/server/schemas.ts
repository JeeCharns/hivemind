/**
 * Notification Zod Schemas
 *
 * Runtime validation for notification-related API requests.
 */

import { z } from "zod";

export const emailPreferencesSchema = z.object({
  new_conversation: z.boolean().optional(),
  conversation_progress: z.boolean().optional(),
});

export const updateEmailPreferencesSchema = z.object({
  email_preferences: emailPreferencesSchema,
});

export const sendEmailRequestSchema = z.object({
  notification_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

export type UpdateEmailPreferencesInput = z.infer<
  typeof updateEmailPreferencesSchema
>;
export type SendEmailRequestInput = z.infer<typeof sendEmailRequestSchema>;
