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
import type { ResultViewModel } from "@/types/conversation-report";
import Button from "@/app/components/button";
import ConsensusMatrix from "./ConsensusMatrix";

export interface ReportViewProps {
  viewModel: ResultViewModel;
}

export default function ReportView({ viewModel }: ReportViewProps) {
  const {
    currentHtml,
    selectedVersion,
    versions,
    consensusItems,
    totalInteractions,
    loading,
    error,
    generate,
    download,
    selectVersion,
  } = useConversationReport({ viewModel });

  const hasEnoughResponses =
    viewModel.responseCount >= MIN_RESPONSES_FOR_REPORT;
  const hasFeedbackData = consensusItems.length > 0;

  const shouldShowAnalysisPlaceholder = viewModel.analysisStatus !== "ready";
  const shouldShowFeedbackEmptyState =
    viewModel.analysisStatus === "ready" && !hasFeedbackData;

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

  return (
    <div className="pt-10">
      <div className="mx-auto w-full max-w-7xl flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left column: Analysis placeholder */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {shouldShowAnalysisPlaceholder ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-center items-center min-h-[200px]">
                <Handshake size={56} className="text-[#9498B0]" />
                <p className="mt-4 text-body text-text-secondary">
                  Analysis of the most agreed-upon themes will appear here.
                </p>
              </div>
            ) : shouldShowFeedbackEmptyState ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-center items-center min-h-[200px]">
                <Handshake size={56} className="text-[#9498B0]" />
                <p className="mt-4 text-body text-text-secondary">
                  No feedback yet. Vote on responses to see where people agree
                  or disagree.
                </p>
              </div>
            ) : null}
            {hasFeedbackData ? (
              <ConsensusMatrix
                items={consensusItems}
                totalInteractions={totalInteractions}
              />
            ) : null}
          </div>

          {/* Right column: Report viewer */}
          <div className="lg:col-span-2 w-full bg-white text-slate-900 rounded-2xl overflow-hidden flex flex-col shadow-xl border border-slate-200 max-h-180">
            <div className="bg-slate-50 p-5 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-2 text-slate-800">
                <FileText size={18} className="text-brand-primary" />
                <span className="text-subtitle">Executive Summary</span>
              </div>
              <div className="flex gap-2 items-center">
                {versions.length > 0 && (
                  <select
                    value={selectedVersion ?? ""}
                    onChange={(e) => handleVersionChange(e.target.value)}
                    className="h-9 text-body rounded-md border border-slate-200 bg-white px-2 text-slate-700"
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
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body text-red-700">
                  {error}
                </div>
              </div>
            )}
            <div className="flex-1 p-6 md:p-8 overflow-y-auto min-h-80">
              {!hasEnoughResponses ? (
                <p className="text-body text-slate-500 italic">
                  At least {MIN_RESPONSES_FOR_REPORT} responses are required before generating the
                  executive summary.
                </p>
              ) : loading ? (
                <div className="h-full flex items-center justify-center flex-col gap-3 text-slate-400">
                  <SpinnerGap
                    className="animate-spin text-brand-primary"
                    size={32}
                  />
                  <p className="text-subtitle">Synthesizing insights...</p>
                </div>
              ) : currentHtml ? (
                <article>
                  <style dangerouslySetInnerHTML={{
                    __html: `
                      .report-content h1 {
                        font-size: 1.5rem;
                        font-weight: 600;
                        margin-bottom: 1rem;
                        margin-top: 0;
                        color: #1e293b;
                      }
                      .report-content h2 {
                        font-size: 1.25rem;
                        font-weight: 600;
                        margin-top: 1.5rem;
                        margin-bottom: 0.75rem;
                        color: #334155;
                      }
                      .report-content h3 {
                        font-size: 1.125rem;
                        font-weight: 600;
                        margin-top: 1.25rem;
                        margin-bottom: 0.5rem;
                        color: #475569;
                      }
                      .report-content p {
                        margin-bottom: 1rem;
                        line-height: 1.6;
                        color: #475569;
                      }
                      .report-content ul,
                      .report-content ol {
                        margin-bottom: 1rem;
                        padding-left: 1.5rem;
                      }
                      .report-content li {
                        margin-bottom: 0.5rem;
                        line-height: 1.6;
                        color: #475569;
                      }
                      .report-content ul li {
                        list-style-type: disc;
                      }
                      .report-content ol li {
                        list-style-type: decimal;
                      }
                    `
                  }} />
                  <div className="report-content" dangerouslySetInnerHTML={{ __html: currentHtml }} />
                </article>
              ) : (
                <p className="text-body text-slate-400 italic text-center mt-10">
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
