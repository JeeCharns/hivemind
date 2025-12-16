"use client";

/**
 * useHives Hook
 *
 * Manages hive list state and operations
 * Handles fetching hives and creating new hives
 */

import { useState, useEffect } from "react";
import { hiveClient } from "../data/hiveClient";
import type { Hive, CreateHiveInput } from "../domain/hive.types";

/**
 * Hook for managing hive list and creation
 */
export function useHives() {
  const [data, setData] = useState<Hive[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [error, setError] = useState<Error | null>(null);
  const [createStatus, setCreateStatus] = useState<
    "idle" | "creating" | "success" | "error"
  >("idle");
  const [createError, setCreateError] = useState<Error | null>(null);

  const fetchHives = async () => {
    try {
      setStatus("loading");
      const hives = await hiveClient.listHives();
      setData(hives);
      setStatus("success");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch hives"));
      setStatus("error");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHives();
  }, []);

  const createHive = async (input: CreateHiveInput) => {
    try {
      setCreateStatus("creating");
      const newHive = await hiveClient.createHive(input);
      setData((prev) => [...prev, newHive]);
      setCreateStatus("success");
      setCreateError(null);
      return newHive;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to create hive");
      setCreateError(error);
      setCreateStatus("error");
      throw error;
    }
  };

  const refresh = () => fetchHives();

  return {
    data,
    status,
    error,
    createStatus,
    createError,
    createHive,
    refresh,
    isLoading: status === "loading",
    isError: status === "error",
    isSuccess: status === "success",
  };
}
