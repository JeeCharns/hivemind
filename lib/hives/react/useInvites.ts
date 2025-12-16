"use client";

/**
 * useInvites Hook
 *
 * Manages hive invite state and operations
 * Handles fetching, creating, and revoking invites
 */

import { useState, useEffect } from "react";
import { hiveClient } from "../data/hiveClient";
import type { HiveInvite } from "../domain/hive.types";

/**
 * Hook for managing hive invitations
 * Provides create and revoke operations
 */
export function useInvites(hiveId: string) {
  const [invites, setInvites] = useState<HiveInvite[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [error, setError] = useState<Error | null>(null);
  const [createStatus, setCreateStatus] = useState<
    "idle" | "creating" | "success" | "error"
  >("idle");

  const fetchInvites = async () => {
    try {
      setStatus("loading");
      const data = await hiveClient.listInvites(hiveId);
      setInvites(data);
      setStatus("success");
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to fetch invites")
      );
      setStatus("error");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInvites();
  }, [hiveId]);

  const createInvite = async (emails: string[]) => {
    try {
      setCreateStatus("creating");
      await hiveClient.createInvite(hiveId, emails);
      await fetchInvites(); // Refresh list
      setCreateStatus("success");
    } catch (err) {
      setCreateStatus("error");
      throw err instanceof Error ? err : new Error("Failed to create invites");
    }
  };

  const revokeInvite = async (inviteId: string) => {
    try {
      await hiveClient.revokeInvite(hiveId, inviteId);
      await fetchInvites(); // Refresh list
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to revoke invite");
    }
  };

  return {
    invites,
    status,
    error,
    createStatus,
    createInvite,
    revokeInvite,
    refresh: fetchInvites,
    isLoading: status === "loading",
    isCreating: createStatus === "creating",
  };
}
