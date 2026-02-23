/**
 * Guest Likes Client - Data Access Layer
 *
 * Implements IResponseLikesClient for guest users,
 * hitting /api/guest/[token]/responses/[id]/like instead of authenticated endpoints.
 * Follows DIP: same interface as the authenticated client.
 */

import type { LikeToggleResult } from "../domain/listen.types";
import type { IResponseLikesClient } from "../data/likesClient";

/**
 * Guest implementation of the likes client.
 * Routes like/unlike through the guest API using the share token.
 */
export class GuestLikesClient implements IResponseLikesClient {
  constructor(private readonly token: string) {}

  async like(responseId: string): Promise<LikeToggleResult> {
    const res = await fetch(
      `/api/guest/${this.token}/responses/${responseId}/like`,
      { method: "POST", credentials: "include" }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return {
        success: false,
        error: body?.error ?? "Failed to like response",
      };
    }
    const data = await res.json();
    return {
      success: true,
      liked: data.liked,
      likeCount: data.like_count,
    };
  }

  async unlike(responseId: string): Promise<LikeToggleResult> {
    const res = await fetch(
      `/api/guest/${this.token}/responses/${responseId}/like`,
      { method: "DELETE", credentials: "include" }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return {
        success: false,
        error: body?.error ?? "Failed to unlike response",
      };
    }
    const data = await res.json();
    return {
      success: true,
      liked: data.liked,
      likeCount: data.like_count,
    };
  }
}
