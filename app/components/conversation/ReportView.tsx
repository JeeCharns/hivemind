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
    consensusMetrics,
    loading,
    error,
    generate,
    download,
    selectVersion,
  } = useConversationReport({ viewModel });

  const hasEnoughResponses =
    viewModel.responseCount >= MIN_RESPONSES_FOR_REPORT;
  const hasFeedbackData = consensusItems.length > 0;

  const isExplore = viewModel.conversationType === "explore";

  // Extract "Recommended Next Steps" section from report HTML
  const extractRecommendedNextSteps = (html: string | null): string | null => {
    if (!html) return null;
    // Look for the Recommended Next Steps heading and extract content until next h1/h2 or end
    const regex =
      /<h[12][^>]*>.*?Recommended Next Steps.*?<\/h[12]>([\s\S]*?)(?=<h[12]|$)/i;
    const match = html.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
    return null;
  };

  const recommendedNextStepsHtml = extractRecommendedNextSteps(currentHtml);

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
    <div className="pt-4">
      <div className="mx-auto w-full max-w-7xl flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left column: Analysis placeholder or Recommended Next Steps for explore */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {isExplore ? (
              <div className="bg-white rounded-xl p-6">
                <h3 className="text-subtitle text-text-primary mb-4">
                  Recommended Next Steps
                </h3>
                {recommendedNextStepsHtml ? (
                  <div className="space-y-4">
                    <style
                      dangerouslySetInnerHTML={{
                        __html: `
                        .next-steps-content p {
                          margin-bottom: 0.75rem;
                          line-height: 1.6;
                          color: #475569;
                        }
                        .next-steps-content ul,
                        .next-steps-content ol {
                          margin-bottom: 0.75rem;
                          padding-left: 1.25rem;
                        }
                        .next-steps-content li {
                          margin-bottom: 0.5rem;
                          line-height: 1.5;
                          color: #475569;
                        }
                        .next-steps-content ul li {
                          list-style-type: disc;
                        }
                        .next-steps-content ol li {
                          list-style-type: decimal;
                        }
                        .next-steps-content strong {
                          color: #334155;
                        }
                      `,
                      }}
                    />
                    <div
                      className="next-steps-content"
                      dangerouslySetInnerHTML={{ __html: recommendedNextStepsHtml }}
                    />
                    <div className="pt-4 border-t border-slate-100">
                      <Button
                        variant="secondary"
                        disabled
                        title="Coming soon"
                        className="w-full"
                      >
                        Continue conversation
                        <span className="ml-2 text-xs font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                          Coming soon
                        </span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-body text-text-secondary">
                      Generate an executive summary to see recommended next steps.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {shouldShowAnalysisPlaceholder ? (
                  <div className="bg-white rounded-xl p-6 flex flex-col justify-center items-center min-h-[200px]">
                    <Handshake size={56} className="text-[#9498B0]" />
                    <p className="mt-4 text-body text-text-secondary">
                      Analysis of the most agreed-upon themes will appear here.
                    </p>
                  </div>
                ) : shouldShowFeedbackEmptyState ? (
                  <div className="bg-white rounded-xl p-6 flex flex-col justify-center items-center min-h-[200px]">
                    <Handshake size={56} className="text-[#9498B0]" />
                    <p className="mt-4 text-body text-text-secondary">
                      No feedback yet. Vote on responses to see where people
                      agree or disagree.
                    </p>
                  </div>
                ) : null}
                {hasFeedbackData ? (
                  <ConsensusMatrix
                    items={consensusItems}
                    metrics={consensusMetrics}
                  />
                ) : null}
              </>
            )}
          </div>

          {/* Right column: Report viewer */}
          <div className="lg:col-span-2 w-full bg-white text-text-primary rounded-2xl overflow-hidden flex flex-col max-h-180">
            <div className="bg-slate-50 p-5 flex justify-between items-center">
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
                  At least {MIN_RESPONSES_FOR_REPORT} responses are required
                  before generating the executive summary.
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
                  <style
                    dangerouslySetInnerHTML={{
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
                    `,
                    }}
                  />
                  <div
                    className="report-content"
                    dangerouslySetInnerHTML={{ __html: currentHtml }}
                  />
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
