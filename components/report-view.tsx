"use client";

import { useState, useTransition } from "react";

type ReportContent =
  | string
  | {
      markdown?: string;
      [key: string]: unknown;
    }
  | null;

export default function ReportView({
  report,
  conversationId,
  canGenerate,
}: {
  report: ReportContent | null;
  conversationId: string;
  canGenerate: boolean;
}) {
  const [current, setCurrent] = useState<ReportContent | null>(report);
  const [error, setError] = useState<string | null>(null);
  const [loading, startTransition] = useTransition();

  const generate = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/conversations/${conversationId}/report`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Failed to generate report");
        return;
      }
      const body = await res.json();
      setCurrent(body.report ?? null);
    });
  };

  const renderContent = () => {
    if (!current) return null;
    if (typeof current === "string") {
      return <pre className="whitespace-pre-wrap text-slate-800">{current}</pre>;
    }
    if (current.markdown) {
      return (
        <pre className="whitespace-pre-wrap text-slate-800">
          {current.markdown}
        </pre>
      );
    }
    return (
      <pre className="whitespace-pre-wrap text-slate-800">
        {JSON.stringify(current, null, 2)}
      </pre>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-medium text-slate-900">Report</h2>
          <p className="text-sm text-slate-500">
            Generated summary of consensus, tension, and themes.
          </p>
        </div>
        {canGenerate && (
          <button
            onClick={generate}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Generating…" : current ? "Regenerate report" : "Generate report"}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!current ? (
        <div className="text-slate-600">
          {canGenerate
            ? "No report yet. Generate one to see insights."
            : "Waiting for admin to generate a report."}
        </div>
      ) : (
        <article className="bg-white border border-slate-200 rounded-2xl p-4">
          {renderContent()}
        </article>
      )}
    </div>
  );
}
