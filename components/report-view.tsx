"use client";

import { FileTextIcon, HandshakeIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";

export type ReportContent =
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
      const res = await fetch(`/api/conversations/${conversationId}/report`, {
        method: "POST",
      });
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
      return (
        <pre className="whitespace-pre-wrap text-slate-800">{current}</pre>
      );
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
    <div className="pt-10">
      <div className="mx-auto max-w-[1440px] flex flex-col gap-6">
        {canGenerate && (
          <div className="flex justify-end">
            <button
              onClick={generate}
              disabled={loading}
              className="px-4 py-2 rounded-md bg-[#3A1DC8] text-white text-sm font-medium hover:bg-[#2f18a6] disabled:opacity-50"
            >
              {loading ? "Generating…" : current ? "Regenerate" : "Generate"}
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg p-10 flex flex-col items-center justify-center text-center max-h-60">
            <HandshakeIcon size={56} className="text-[#9498B0]" />
            <p className="mt-6 text-base leading-[22px] text-[#566888] max-w-[418px]">
              Analysis of the most agreed-upon themes will appear here
            </p>
          </div>

          <div className="bg-white rounded-lg p-10 flex flex-col items-center justify-center text-center min-h-120">
            {current ? (
              <article className="w-full text-left space-y-3">
                {renderContent()}
              </article>
            ) : (
              <>
                <FileTextIcon size={56} className="text-[#9498B0]" />
                <p className="mt-6 text-base leading-[22px] text-[#566888] max-w-[418px]">
                  A consensus-based summary of findings
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
