/**
 * GuestResultContainer - Guest wrapper for ReportView
 *
 * Fetches the full ResultViewModel from the guest report API
 * and renders the same ReportView used by authenticated users.
 *
 * Guests cannot generate/regenerate reports — they see the current state.
 * Polls every 30s so guests can see updates if the host regenerates.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import type { ResultViewModel } from "@/types/conversation-report";
import ReportView from "@/app/components/conversation/ReportView";
import Link from "next/link";

interface GuestResultContainerProps {
  token: string;
}

export default function GuestResultContainer({
  token,
}: GuestResultContainerProps) {
  const [viewModel, setViewModel] = useState<ResultViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/guest/${token}/report`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to fetch report");
      }
      const data: ResultViewModel = await res.json();
      setViewModel(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch report");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial fetch + poll every 30s
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Loading ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-body text-text-tertiary">Loading report…</p>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-body text-red-700">
        {error}
      </div>
    );
  }

  if (!viewModel) return null;

  // ── Render the real ReportView ──────────────────────────
  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
        <ReportView viewModel={viewModel} />
      </div>

      {/* CTA */}
      <div className="text-center py-4">
        <p className="text-body text-text-tertiary mb-2">
          Want to create conversations and generate your own reports?
        </p>
        <Link
          href="/login"
          className="inline-flex h-9 items-center rounded-lg bg-brand-primary px-4 text-subtitle text-white hover:bg-brand-primary/90 transition-colors"
        >
          Sign up for Hive
        </Link>
      </div>
    </>
  );
}
