/**
 * GuestUnderstandContainer - Guest wrapper for UnderstandView
 *
 * A lightweight container that:
 * - Fetches the UnderstandViewModel from the guest API
 * - Polls periodically for updates (realtime is unavailable for guests)
 * - Renders the same UnderstandView used by authenticated users
 * - Injects a GuestFeedbackClient so feedback routes through guest endpoints
 *
 * Guests cannot generate/regenerate analysis — they see the current state.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { UnderstandViewModel } from "@/types/conversation-understand";
import UnderstandView from "@/app/components/conversation/UnderstandView";
import { GuestFeedbackClient } from "@/lib/conversations/guest/guestFeedbackClient";
import { UNDERSTAND_MIN_RESPONSES } from "@/lib/conversations/domain/thresholds";
import Link from "next/link";

interface GuestUnderstandContainerProps {
  token: string;
}

export default function GuestUnderstandContainer({
  token,
}: GuestUnderstandContainerProps) {
  const [viewModel, setViewModel] = useState<UnderstandViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable feedback client instance
  const feedbackClient = useMemo(
    () => new GuestFeedbackClient(token),
    [token]
  );

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/guest/${token}/understand`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to load analysis");
      }
      const data: UnderstandViewModel = await res.json();
      setViewModel(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial fetch + poll every 30s for updates (no realtime for guests)
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Loading ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-body text-text-tertiary">Loading analysis…</p>
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

  const {
    analysisStatus,
    responseCount = 0,
    threshold = UNDERSTAND_MIN_RESPONSES,
  } = viewModel;

  // ── Below threshold ─────────────────────────────────────
  if (responseCount < threshold) {
    return (
      <div className="flex flex-col gap-6 pt-6 h-[calc(100vh-180px)]">
        <div className="bg-white rounded-2xl p-12 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-2xl font-semibold text-slate-800">
              Need {threshold} Responses for Themes
            </h2>
            <p className="text-slate-600">
              You currently have {responseCount} response
              {responseCount !== 1 ? "s" : ""}. Once you reach {threshold}{" "}
              responses, a theme map can be generated for analysis.
            </p>
            <p className="text-sm text-slate-500 mt-4">
              Add more responses in the Listen tab to get started.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Analysis in progress ────────────────────────────────
  if (
    !analysisStatus ||
    analysisStatus === "not_started" ||
    analysisStatus === "embedding" ||
    analysisStatus === "analyzing"
  ) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="h-10 w-10 rounded-full border-4 border-brand-primary border-t-transparent animate-spin" />
        <p className="text-body text-text-secondary">
          Analysis is in progress. This page will update automatically.
        </p>
      </div>
    );
  }

  // ── Analysis error ──────────────────────────────────────
  if (analysisStatus === "error") {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-body text-amber-700">
        Analysis encountered an error. The conversation host can regenerate it.
      </div>
    );
  }

  // ── Ready — render the real cluster map ─────────────────
  return (
    <>
      <UnderstandView
        viewModel={viewModel}
        conversationType="understand"
        analysisInProgress={false}
        uiState="idle"
        feedbackClient={feedbackClient}
      />

      {/* CTA */}
      <div className="text-center py-4">
        <p className="text-body text-text-tertiary mb-2">
          Want to create conversations and analyse responses?
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
