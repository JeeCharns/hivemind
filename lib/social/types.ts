/**
 * Types for social features: activity, reactions, presence.
 */

export type ActivityEventType =
  | "join"
  | "conversation_created"
  | "analysis_complete"
  | "report_generated"
  | "round_closed";

export interface ActivityEvent {
  id: string;
  hiveId: string;
  eventType: ActivityEventType;
  userId: string | null; // null for anonymised events
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityEventInput {
  hiveId: string;
  eventType: ActivityEventType;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ActivityEventMetadata {
  conversationId?: string;
  conversationTitle?: string;
  conversationType?: "understand" | "decide";
  version?: number;
  roundId?: string;
}

export type ReactionEmoji = "👋" | "🎉" | "💡" | "❤️" | "🐝";

export interface Reaction {
  id: string;
  hiveId: string;
  userId: string;
  displayName: string | null;
  emoji: ReactionEmoji;
  message: string | null;
  createdAt: string;
}

export interface ReactionInput {
  hiveId: string;
  emoji: ReactionEmoji;
  message?: string | null;
}

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  lastActiveAt: string;
}
