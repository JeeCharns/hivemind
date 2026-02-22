"use client";

/**
 * useHiveSettings Hook
 *
 * Manages hive settings state and operations
 * Handles updating and deleting hives
 */

import { useState, useEffect } from "react";
import { hiveClient } from "../data/hiveClient";
import type { Hive, UpdateHiveInput } from "../domain/hive.types";

/**
 * Hook for managing hive settings
 * Provides update and delete operations
 */
export function useHiveSettings(hiveId: string) {
  const [hive, setHive] = useState<Hive | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [error, setError] = useState<Error | null>(null);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "updating" | "success" | "error"
  >("idle");
  const [updateError, setUpdateError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchHive = async () => {
      try {
        setStatus("loading");
        const hiveData = await hiveClient.getHive(hiveId);
        setHive(hiveData);
        setStatus("success");
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error("Failed to fetch hive")
        );
        setStatus("error");
      }
    };

    fetchHive();
  }, [hiveId]);

  const updateHive = async (input: UpdateHiveInput) => {
    try {
      setUpdateStatus("updating");
      const updated = await hiveClient.updateHive(hiveId, input);
      setHive(updated);
      setUpdateStatus("success");
      setUpdateError(null);
      return updated;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to update hive");
      setUpdateError(error);
      setUpdateStatus("error");
      throw error;
    }
  };

  const deleteHive = async () => {
    try {
      await hiveClient.deleteHive(hiveId);
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to delete hive");
    }
  };

  return {
    hive,
    status,
    error,
    updateStatus,
    updateError,
    updateHive,
    deleteHive,
    isLoading: status === "loading",
    isUpdating: updateStatus === "updating",
  };
}
