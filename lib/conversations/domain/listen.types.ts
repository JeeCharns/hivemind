/**
 * Listen Tab Domain Types
 *
 * Types specific to the Listen experience
 * Follows SRP: types separate from logic
 */

export type ListenTag =
  | "need"
  | "data"
  | "want"
  | "problem"
  | "risk"
  | "proposal";

/**
 * Live response in the feed
 */
export interface LiveResponse {
  id: string;
  text: string;
  tag: ListenTag | null;
  createdAt: string;
  user: {
    name: string;
    avatarUrl: string | null;
  };
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean; // Whether the current user owns this response
  isAnonymous?: boolean; // Optional for debugging/moderation, API always normalizes user fields
}

/**
 * Input for submitting a new response
 */
export interface SubmitResponseInput {
  text: string;
  tag: ListenTag | null;
  anonymous?: boolean;
}

/**
 * Response from API after submission
 */
export interface SubmitResponseResult {
  success: boolean;
  response?: LiveResponse;
  error?: string;
}

/**
 * Response from API for like toggle
 */
export interface LikeToggleResult {
  success: boolean;
  liked?: boolean;
  likeCount?: number;
  error?: string;
}

/**
 * Broadcast event payload for new responses
 */
export interface FeedBroadcastPayload {
  response: LiveResponse;
}

/**
 * Realtime connection status
 * - "paused": Intentionally disconnected due to high traffic (graceful degradation)
 */
export type RealtimeStatus =
  | "connecting"
  | "connected"
  | "error"
  | "disconnected"
  | "paused";
