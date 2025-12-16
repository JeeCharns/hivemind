"use client";

/**
 * ReportView - Report/Result Tab Client Component
 *
 * Left: Placeholder for analysis + optional agreement summaries
 * Right: Report viewer with version selector, regenerate, and download
 * Follows SRP: UI only, business logic in useConversationReport hook
 */

import {
  ArrowClockwise,
  DownloadSimple,
  FileText,
  Handshake,
  SpinnerGap,
} from "@phosphor-icons/react";
import { MIN_RESPONSES_FOR_REPORT } from "@/lib/conversations/domain/reportRules";
import { useConversationReport } from "@/lib/conversations/react/useConversationReport";
import type { ResultViewModel, AgreementSummary } from "@/types/conversation-report";
import Button from "@/app/components/button";

export interface ReportViewProps {
  viewModel: ResultViewModel;
}

export default function ReportView({ viewModel }: ReportViewProps) {
  const { currentHtml, selectedVersion, versions, loading, error, generate, download, selectVersion } =
    useConversationReport({ viewModel });

  const hasEnoughResponses = viewModel.responseCount >= MIN_RESPONSES_FOR_REPORT;
  const hasFeedbackData =
    (viewModel.agreementSummaries?.filter((s) => s.type === "agreement").length ?? 0) > 0 ||
    (viewModel.agreementSummaries?.filter((s) => s.type === "divisive").length ?? 0) > 0;

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return "Unknown time";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "Unknown time";
    return d
      .toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .replace(",", "");
  };

  const handleVersionChange = (value: string) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;
    selectVersion(parsed);
  };

  const renderResponseList = (
    title: string,
    items: AgreementSummary[]
  ) => (
    <div className="flex flex-col justify-end items-start bg-white rounded-xl border border-slate-200 px-4 md:px-6 py-5 gap-4 shadow-sm">
      <h4 className="text-[#172847] text-base font-medium">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">
          No responses meet this threshold yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3 w-full">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-row items-center gap-3 px-1"
            >
              <div className="flex-1 rounded-xl px-0 py-2">
                <p className="text-sm md:text-base text-[#413E65] leading-[19px]">
                  {item.responseText}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-2.5 py-1 rounded-md bg-[#EBFFED] text-[#08B03A] text-sm font-medium min-w-[52px] text-center">
                  {item.agreePercent}%
                </div>
                <div className="px-2.5 py-1 rounded-md bg-[#FFE1E1] text-[#DA5757] text-sm font-medium min-w-[52px] text-center">
                  {100 - item.agreePercent}%
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const agreementItems = viewModel.agreementSummaries?.filter((s) => s.type === "agreement") ?? [];
  const divisiveItems = viewModel.agreementSummaries?.filter((s) => s.type === "divisive") ?? [];

  return (
    <div className="pt-10">
      <div className="mx-auto w-full max-w-7xl flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left column: Analysis placeholder */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-center items-center min-h-[200px]">
              <Handshake size={56} className="text-[#9498B0]" />
              <p className="mt-4 text-base leading-[22px] text-[#566888]">
                Analysis of the most agreed-upon themes will appear here.
              </p>
            </div>
            {hasFeedbackData ? (
              <div className="flex flex-col gap-4">
                {renderResponseList(
                  "Where do most people agree?",
                  agreementItems
                )}
                {renderResponseList(
                  "What are the most divisive?",
                  divisiveItems
                )}
              </div>
            ) : null}
          </div>

          {/* Right column: Report viewer */}
          <div className="lg:col-span-2 w-full bg-white text-slate-900 rounded-2xl overflow-hidden flex flex-col shadow-xl border border-slate-200 max-h-180">
            <div className="bg-slate-50 p-5 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-2 text-slate-800 font-medium">
                <FileText size={18} className="text-[#3A1DC8]" />
                <span>Executive Summary</span>
              </div>
              <div className="flex gap-2 items-center">
                {versions.length > 0 && (
                  <select
                    value={selectedVersion ?? ""}
                    onChange={(e) => handleVersionChange(e.target.value)}
                    className="h-9 text-sm rounded-md border border-slate-200 bg-white px-2 text-slate-700"
                    title="Select report version"
                  >
                    {versions.map((v) => (
                      <option key={v.version} value={v.version}>
                        {formatTimestamp(v.createdAt)}
                      </option>
                    ))}
                  </select>
                )}
                {viewModel.canGenerate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={generate}
                    disabled={loading || !hasEnoughResponses}
                    title="Regenerate"
                    className="p-2 h-9 w-9"
                  >
                    <ArrowClockwise
                      size={18}
                      className={loading ? "animate-spin" : ""}
                    />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={download}
                  disabled={!currentHtml}
                  title="Download"
                  className="p-2 h-9 w-9"
                >
                  <DownloadSimple size={18} />
                </Button>
              </div>
            </div>
            {error && (
              <div className="px-6 pt-4">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              </div>
            )}
            <div className="flex-1 p-6 md:p-8 overflow-y-auto min-h-[320px]">
              {!hasEnoughResponses ? (
                <p className="text-slate-500 italic">
                  At least 30 responses are required before generating the
                  executive summary.
                </p>
              ) : loading ? (
                <div className="h-full flex items-center justify-center flex-col gap-3 text-slate-400">
                  <SpinnerGap
                    className="animate-spin text-[#3A1DC8]"
                    size={32}
                  />
                  <p className="font-medium">Synthesizing insights...</p>
                </div>
              ) : currentHtml ? (
                <article className="prose prose-slate prose-sm max-w-none font-sans prose-headings:font-sans prose-headings:font-semibold prose-p:font-sans prose-li:font-sans prose-strong:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg">
                  <div dangerouslySetInnerHTML={{ __html: currentHtml }} />
                </article>
              ) : (
                <p className="text-slate-400 italic text-center mt-10">
                  No report available. Generate a summary to see insights here.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
