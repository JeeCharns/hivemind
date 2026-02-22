/**
 * Likes Client - Data Access Layer
 *
 * Client for toggling likes on responses
 * Follows DIP: interface allows for mocking in tests
 */

import type { LikeToggleResult } from "../domain/listen.types";

/**
 * Interface for response likes client
 * Allows for dependency injection and testing
 */
export interface IResponseLikesClient {
  like(responseId: string): Promise<LikeToggleResult>;
  unlike(responseId: string): Promise<LikeToggleResult>;
}

/**
 * Default implementation using fetch API
 */
export class ResponseLikesClient implements IResponseLikesClient {
  async like(responseId: string): Promise<LikeToggleResult> {
    const response = await fetch(`/api/responses/${responseId}/like`, {
      method: "POST",
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to like response" }));
      return {
        success: false,
        error: error.error || "Failed to like response",
      };
    }

    const data = await response.json();
    return {
      success: true,
      liked: data.liked,
      likeCount: data.like_count,
    };
  }

  async unlike(responseId: string): Promise<LikeToggleResult> {
    const response = await fetch(`/api/responses/${responseId}/like`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to unlike response" }));
      return {
        success: false,
        error: error.error || "Failed to unlike response",
      };
    }

    const data = await response.json();
    return {
      success: true,
      liked: data.liked,
      likeCount: data.like_count,
    };
  }
}

/**
 * Default client instance
 */
export const likesClient = new ResponseLikesClient();
