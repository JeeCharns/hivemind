import type { ISessionClient, Session } from "../domain/session.types";

/**
 * Session client implementation
 * Fetches session from server API
 */
export class SessionClient implements ISessionClient {
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  async getSession(): Promise<Session | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/session`, {
        method: "GET",
        credentials: "include", // Include HttpOnly cookies
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401 || response.status === 403) {
        return null; // Unauthenticated
      }

      if (!response.ok) {
        throw new Error(`Session fetch failed: ${response.statusText}`);
      }

      const data = await response.json();
      return this.mapToSession(data);
    } catch (error) {
      // Network errors or server errors
      console.error("Session fetch error:", error);
      throw error;
    }
  }

  async refreshSession(): Promise<Session | null> {
    // Same as getSession for now
    // Could call a different endpoint if needed
    return this.getSession();
  }

  /**
   * Map API response to domain Session type
   * Isolates API shape from domain model
   */
  private mapToSession(data: unknown): Session | null {
    if (!data || typeof data !== "object") {
      return null;
    }

    const userValue = (data as { user?: unknown }).user;
    if (!userValue || typeof userValue !== "object") {
      return null;
    }

    const id = (userValue as { id?: unknown }).id;
    const email = (userValue as { email?: unknown }).email;
    if (typeof id !== "string" || typeof email !== "string") {
      return null;
    }

    const name =
      (userValue as { name?: unknown }).name ||
      (userValue as { user_metadata?: { name?: unknown } }).user_metadata?.name;

    const activeHiveIdValue = (data as { activeHiveId?: unknown }).activeHiveId;
    const activeHiveId = typeof activeHiveIdValue === "string" ? activeHiveIdValue : undefined;

    const rolesValue = (data as { roles?: unknown }).roles;
    const roles = Array.isArray(rolesValue) && rolesValue.every((r) => typeof r === "string")
      ? (rolesValue as string[])
      : [];

    return {
      user: {
        id,
        email,
        name: typeof name === "string" ? name : undefined,
      },
      activeHiveId,
      roles,
    };
  }
}

/**
 * Singleton instance for app-wide use
 */
export const sessionClient = new SessionClient();
