/**
 * Hive Client Implementation
 *
 * Implements IHiveClient interface for data fetching
 * Handles all API communication for hive operations
 */

import type {
  IHiveClient,
  Hive,
  HiveStats,
  HiveInvite,
  CreateHiveInput,
  UpdateHiveInput,
} from "../domain/hive.types";

/**
 * Client for hive data operations
 * Implements dependency inversion via IHiveClient interface
 */
export class HiveClient implements IHiveClient {
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  async listHives(): Promise<Hive[]> {
    const response = await fetch(`${this.baseUrl}/api/hives`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch hives: ${response.statusText}`);
    }

    return response.json();
  }

  async getHive(hiveId: string): Promise<Hive> {
    const response = await fetch(`${this.baseUrl}/api/hives/${hiveId}`, {
      method: "GET",
      credentials: "include",
    });

    if (response.status === 404) {
      throw new Error("Hive not found");
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch hive: ${response.statusText}`);
    }

    return response.json();
  }

  async getHiveStats(hiveId: string): Promise<HiveStats> {
    const response = await fetch(`${this.baseUrl}/api/hives/${hiveId}/stats`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch hive stats: ${response.statusText}`);
    }

    return response.json();
  }

  async createHive(input: CreateHiveInput): Promise<Hive> {
    const response = await fetch(`${this.baseUrl}/api/hives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Failed to create hive" }));
      throw new Error(error.error || "Failed to create hive");
    }

    return response.json();
  }

  async updateHive(hiveId: string, input: UpdateHiveInput): Promise<Hive> {
    const response = await fetch(`${this.baseUrl}/api/hives/${hiveId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error("Failed to update hive");
    }

    return response.json();
  }

  async deleteHive(hiveId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/hives/${hiveId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to delete hive");
    }
  }

  async listInvites(hiveId: string): Promise<HiveInvite[]> {
    const response = await fetch(`${this.baseUrl}/api/hives/${hiveId}/invites`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch invites");
    }

    return response.json();
  }

  async createInvite(hiveId: string, emails: string[]): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/hives/${hiveId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ emails }),
    });

    if (!response.ok) {
      throw new Error("Failed to create invites");
    }
  }

  async revokeInvite(hiveId: string, inviteId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/hives/${hiveId}/invites/${inviteId}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );

    if (!response.ok) {
      throw new Error("Failed to revoke invite");
    }
  }
}

/**
 * Singleton instance for use throughout the application
 */
export const hiveClient = new HiveClient();
