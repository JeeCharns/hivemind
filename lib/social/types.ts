/**
 * Types for social features: activity, reactions, presence.
 */

export type ActivityEventType = "join" | "response" | "vote" | "phase_change";

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

export type ReactionEmoji = "👋" | "🎉" | "💡" | "❤️" | "🐝";

export interface Reaction {
  id: string;
  hiveId: string;
  userId: string;
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
