/**
 * Notification Domain Types
 *
 * Core types for the notification system.
 */

export type NotificationType =
  | 'new_conversation'
  | 'analysis_complete'
  | 'report_generated'
  | 'opinion_liked';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  hiveId: string | null;
  conversationId: string | null;
  responseId: string | null;
  linkPath: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  hive_id: string | null;
  conversation_id: string | null;
  response_id: string | null;
  link_path: string;
  read_at: string | null;
  created_at: string;
}

export interface EmailPreferences {
  new_conversation: boolean;
  conversation_progress: boolean;
}

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  new_conversation: true,
  conversation_progress: true,
};
