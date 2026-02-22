"use client";

import { PlusIcon } from "@phosphor-icons/react";
import Button from "@/app/components/button";
import { useNewSessionWizard } from "@/lib/conversations/react/useNewSessionWizard";
import type { ConversationType } from "@/types/conversations";
import { fetchProblemReports } from "@/lib/conversations/client/problemReportsApi";
import { useState, useEffect } from "react";
import type { ProblemReportListItem } from "@/lib/conversations/schemas";
import DecisionSetupWizard from "@/app/components/decision-setup-wizard";

export default function NewSessionWizard({
  open,
  onClose,
  hiveId,
  hiveSlug,
}: {
  open: boolean;
  onClose: () => void;
  hiveId: string;
  hiveSlug?: string | null;
}) {
  const {
    step,
    loading,
    wizardError,
    titleError,
    typeError,
    type,
    title,
    description,
    file,
    uploadError,
    uploadStatus,
    selectedReportConversationId,
    selectedReportVersion,
    setType,
    setTitle,
    setDescription,
    setSelectedReport,
    onContinue,
    onBack,
    onFileSelected,
    onFileDropped,
    onSkipImport,
    onFinish,
  } = useNewSessionWizard({ hiveId, hiveSlug, open });

  // State for decision setup wizard
  const [showDecisionWizard, setShowDecisionWizard] = useState(false);

  // Fetch problem reports for decision sessions
  const [reports, setReports] = useState<ProblemReportListItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 2 || type !== "decide" || !open) return;

    let cancelled = false;

    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setReportsLoading(true);
        setReportsError(null);
        return fetchProblemReports(hiveId);
      })
      .then((data) => {
        if (!data || cancelled) return;
        setReports(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[NewSessionWizard] Failed to fetch reports:", err);
        setReportsError("Failed to load available reports");
      })
      .finally(() => {
        if (cancelled) return;
        setReportsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [step, type, open, hiveId]);

  if (!open) return null;

  // Show DecisionSetupWizard for "decide" type
  if (showDecisionWizard) {
    return (
      <DecisionSetupWizard
        open={true}
        hiveId={hiveId}
        hiveSlug={hiveSlug}
        initialTitle={title}
        initialDescription={description}
        onClose={() => {
          setShowDecisionWizard(false);
          onClose();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-[800px] px-6 md:px-10 py-8 flex flex-col gap-6 mx-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-body text-text-secondary">Step {step} of 2</p>
            <h2 className="text-h2 text-text-primary">
              {step === 1
                ? "Create your session"
                : type === "decide"
                  ? "Link problem report (optional)"
                  : "Import data (optional)"}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-body text-text-secondary hover:text-text-primary"
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        {wizardError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body text-red-700">
            {wizardError}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    key: "understand",
                    title: "Discuss a Problem",
                    desc: "Collect signals to clarify a problem space.",
                    disabled: false,
                  },
                  {
                    key: "decide",
                    title: "Make a Decision",
                    desc: "Gather inputs to choose between options.",
                    disabled: false,
                  },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() =>
                      !opt.disabled && setType(opt.key as ConversationType)
                    }
                    disabled={opt.disabled}
                    className={`w-full rounded-xl border p-4 flex flex-col items-start gap-1 text-left transition relative ${
                      opt.disabled
                        ? "border-slate-200 bg-slate-50 cursor-not-allowed opacity-60"
                        : type === opt.key
                          ? "border-brand-primary bg-[#EDEFFD]"
                          : "border-slate-200 hover:border-[#cbd5f5]"
                    }`}
                  >
                    {opt.disabled && (
                      <span className="absolute top-2 right-2 text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        Coming Soon
                      </span>
                    )}
                    <span className="text-subtitle text-text-primary">
                      {opt.title}
                    </span>
                    <span className="text-body text-text-secondary">
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>

              {typeError && (
                <div className="text-body text-red-600">{typeError}</div>
              )}

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 w-full">
                  <label className="text-subtitle text-text-primary">
                    Session title{" "}
                    <span className="text-red-600 text-info">*</span>
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-body w-full"
                    placeholder="e.g., Align on Q3 focus"
                  />
                  {titleError && (
                    <span className="text-info text-red-600">{titleError}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <label className="text-subtitle text-text-primary">
                    Description
                  </label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-body w-full"
                    placeholder="What is this session about?"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!title.trim() || loading}
                onClick={() => {
                  if (type === "decide") {
                    setShowDecisionWizard(true);
                  } else {
                    onContinue();
                  }
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 2 && type === "understand" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <p className="text-body text-text-secondary">
                  Optionally import a CSV to pre-populate responses and the live
                  feed.
                </p>
              </div>

              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={onFileDropped}
                className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 rounded-xl px-6 py-10 cursor-pointer hover:border-indigo-300 transition"
              >
                <div className="p-3 rounded-full bg-slate-100 text-slate-500">
                  <PlusIcon size={24} />
                </div>
                <div className="text-center">
                  <p className="text-subtitle text-slate-900">
                    Drag & drop CSV
                  </p>
                  <p className="text-body text-slate-500">
                    or click to choose a CSV file
                  </p>
                </div>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    onFileSelected(files[0]);
                  }}
                />
              </label>

              <div className="text-body text-slate-600">
                <p>Requirements:</p>
                <ul className="list-disc list-inside text-slate-500">
                  <li>Must include a column named &quot;response&quot;</li>
                  <li>
                    Optional column: &quot;tag&quot;
                    (data/problem/need/want/risk/proposal)
                  </li>
                  <li>Up to 1000 rows</li>
                </ul>
              </div>

              {file && (
                <div className="flex items-center gap-3 text-body text-slate-700">
                  <span className="text-subtitle">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onFileSelected(null)}
                  >
                    Remove
                  </Button>
                </div>
              )}

              {uploadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body text-red-700">
                  {uploadError}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-text-secondary"
                onClick={onBack}
              >
                ← Back
              </Button>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={onSkipImport}>
                  Skip import
                </Button>
                <Button
                  disabled={loading || uploadStatus === "uploading"}
                  onClick={onFinish}
                >
                  {uploadStatus === "uploading" ? "Uploading…" : "Finish"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && type === "decide" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <p className="text-body text-text-secondary">
                  Optionally link an executive summary from a problem space
                  conversation to provide context for decision makers.
                </p>
              </div>

              {reportsLoading && (
                <div className="text-body text-text-secondary text-center py-8">
                  Loading available reports...
                </div>
              )}

              {reportsError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body text-red-700">
                  {reportsError}
                </div>
              )}

              {!reportsLoading && !reportsError && reports.length === 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-body text-slate-600 text-center">
                  No problem space reports available yet. Create an
                  &quot;Understand a Problem&quot; session first to generate
                  reports.
                </div>
              )}

              {!reportsLoading && !reportsError && reports.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-subtitle text-text-primary">
                    Available problem reports:
                  </p>
                  <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                    {reports.map((report) => (
                      <button
                        key={`${report.conversationId}-${report.latestReportVersion}`}
                        type="button"
                        onClick={() =>
                          setSelectedReport(
                            report.conversationId,
                            report.latestReportVersion
                          )
                        }
                        className={`w-full rounded-lg border p-4 flex flex-col items-start gap-2 text-left transition ${
                          selectedReportConversationId ===
                            report.conversationId &&
                          selectedReportVersion === report.latestReportVersion
                            ? "border-brand-primary bg-[#EDEFFD]"
                            : "border-slate-200 hover:border-[#cbd5f5]"
                        }`}
                      >
                        <div className="flex items-start justify-between w-full">
                          <span className="text-subtitle text-text-primary">
                            {report.title || "Untitled"}
                          </span>
                          {selectedReportConversationId ===
                            report.conversationId &&
                            selectedReportVersion ===
                              report.latestReportVersion && (
                              <span className="text-label text-brand-primary bg-white px-2 py-1 rounded">
                                Selected
                              </span>
                            )}
                        </div>
                        <span className="text-body text-text-secondary">
                          Version {report.latestReportVersion}
                          {report.latestReportCreatedAt &&
                            ` • ${new Date(report.latestReportCreatedAt).toLocaleDateString()}`}
                        </span>
                      </button>
                    ))}
                  </div>
                  {selectedReportConversationId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedReport(null, null)}
                      className="text-sm text-[#566888]"
                    >
                      Clear selection
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-text-secondary"
                onClick={onBack}
              >
                ← Back
              </Button>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={onSkipImport}>
                  Skip linking
                </Button>
                <Button disabled={loading} onClick={onFinish}>
                  Finish
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
