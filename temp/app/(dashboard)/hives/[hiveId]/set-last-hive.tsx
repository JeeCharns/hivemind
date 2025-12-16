"use client";

import { useEffect } from "react";

export default function SetLastHive({ hiveId }: { hiveId: string }) {
  useEffect(() => {
    if (!hiveId) return;
    try {
      console.log("[set-last-hive] setting localStorage last_hive_id", hiveId);
      localStorage.setItem("last_hive_id", hiveId);
    } catch {
      // ignore
    }
    try {
      document.cookie = `last_hive_id=${hiveId}; path=/; max-age=${
        60 * 60 * 24 * 30
      }`;
      console.log("[set-last-hive] document.cookie set last_hive_id", hiveId);
    } catch {
      // ignore
    }
    console.log("[set-last-hive] POST /api/last-hive", { hiveId });
    fetch("/api/last-hive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hiveId }),
    }).catch(() => {});
  }, [hiveId]);

  return null;
}
