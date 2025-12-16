"use client";

/**
 * useHiveOverview Hook
 *
 * Manages single hive overview state
 * Fetches hive details and statistics
 */

import { useState, useEffect } from "react";
import { hiveClient } from "../data/hiveClient";
import type { Hive, HiveStats } from "../domain/hive.types";

/**
 * Hook for fetching hive overview data
 * Loads hive details and stats in parallel
 */
export function useHiveOverview(hiveId: string) {
  const [hive, setHive] = useState<Hive | null>(null);
  const [stats, setStats] = useState<HiveStats | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setStatus("loading");

        // Fetch hive and stats in parallel
        const [hiveData, statsData] = await Promise.all([
          hiveClient.getHive(hiveId),
          hiveClient.getHiveStats(hiveId),
        ]);

        if (!cancelled) {
          setHive(hiveData);
          setStats(statsData);
          setStatus("success");
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err : new Error("Failed to fetch hive")
          );
          setStatus("error");
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [hiveId]);

  return {
    hive,
    stats,
    status,
    error,
    isLoading: status === "loading",
    isError: status === "error",
    isSuccess: status === "success",
  };
}
