"use client";

import { EyeSlash, Eye } from "@phosphor-icons/react";
import Button from "@/app/components/button";
import { useDecisionSetupWizard } from "@/lib/decision-space/react/useDecisionSetupWizard";
import type { DecisionVisibility } from "@/types/decision-space";

interface DecisionSetupWizardProps {
  open: boolean;
  onClose: () => void;
  hiveId: string;
  hiveSlug?: string | null;
  initialTitle?: string;
  initialDescription?: string;
}

const visibilityOptions: {
  value: DecisionVisibility;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "hidden",
    label: "Hidden",
    description: "Votes not shown until round closes",
    icon: <EyeSlash size={20} weight="bold" />,
  },
  {
    value: "transparent",
    label: "Transparent",
    description: "Show all votes publicly",
    icon: <Eye size={20} weight="bold" />,
  },
];

function Step4Content({
  visibility,
  setVisibility,
  deadline,
  setDeadline,
}: {
  visibility: DecisionVisibility;
  setVisibility: (value: DecisionVisibility) => void;
  deadline: string;
  setDeadline: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-body text-text-secondary">
        Configure how votes will be displayed and set an optional deadline.
      </p>

      <div className="flex flex-col gap-4">
        {/* Visibility */}
        <div className="flex flex-col gap-2">
          <label className="text-subtitle text-text-primary">
            Vote visibility
          </label>
          <div className="flex flex-col gap-2">
            {visibilityOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setVisibility(option.value)}
                className={`w-full border p-4 flex items-center gap-3 text-left transition ${
                  visibility === option.value
                    ? "border-brand-primary bg-[#EDEFFD]"
                    : "border-slate-200 hover:border-[#cbd5f5]"
                }`}
              >
                <span
                  className={
                    visibility === option.value
                      ? "text-brand-primary"
                      : "text-text-secondary"
                  }
                >
                  {option.icon}
                </span>
                <div className="flex-1">
                  <span className="text-subtitle text-text-primary block">
                    {option.label}
                  </span>
                  <span className="text-info text-text-secondary">
                    {option.description}
                  </span>
                </div>
                {visibility === option.value && (
                  <svg
                    className="w-5 h-5 text-brand-primary"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Deadline */}
        <div className="flex flex-col gap-2">
          <label className="text-subtitle text-text-primary">
            Voting deadline (optional)
          </label>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="border border-slate-200 px-3 py-2 text-body w-full"
          />
        </div>
      </div>
    </div>
  );
}

export default function DecisionSetupWizard({
  open,
  onClose,
  hiveId,
  hiveSlug,
  initialTitle = "",
  initialDescription = "",
}: DecisionSetupWizardProps) {
  const {
    step,
    loading,
    sourcesLoading,
    error,
    sourceConversations,
    selectedSourceId,
    setSelectedSourceId,
    clusters,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    statements,
    consensusThreshold,
    setConsensusThreshold,
    toggleStatement,
    selectAllInCluster,
    title,
    description,
    visibility,
    setVisibility,
    deadline,
    setDeadline,
    onNext,
    onBack,
    onFinish,
  } = useDecisionSetupWizard({
    hiveId,
    hiveSlug,
    open,
    initialTitle,
    initialDescription,
  });

  if (!open) return null;

  // Get selected cluster indices for filtering statements in step 3
  const selectedClusterIndices = new Set(
    clusters.filter((c) => c.selected).map((c) => c.clusterIndex)
  );

  // Filter statements to only show those from selected clusters
  const visibleStatements = statements.filter((s) =>
    selectedClusterIndices.has(s.clusterIndex)
  );

  // Group statements by cluster for easier display
  const statementsByCluster = visibleStatements.reduce(
    (acc, s) => {
      if (!acc[s.clusterIndex]) {
        acc[s.clusterIndex] = {
          clusterName: s.clusterName,
          statements: [],
        };
      }
      acc[s.clusterIndex].statements.push(s);
      return acc;
    },
    {} as Record<number, { clusterName: string; statements: typeof statements }>
  );

  const stepLabels = [
    "Select source",
    "Choose clusters",
    "Pick statements",
    "Configure session",
    "Review & create",
  ];

  const selectedVisibilityOption = visibilityOptions.find(
    (opt) => opt.value === visibility
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-[800px] px-6 md:px-10 py-8 flex flex-col gap-6 mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-body text-text-secondary">Step {step} of 5</p>
            <h2 className="text-h2 text-text-primary">
              {stepLabels[step - 1]}
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

        {/* Step Indicator */}
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                s <= step ? "bg-indigo-600" : "bg-slate-200"
              }`}
            />
          ))}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body text-red-700">
            {error}
          </div>
        )}

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Step 1: Source Selection */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-body text-text-secondary">
                Select an understand session with analyzed clusters to create
                decision proposals from.
              </p>

              {/* Skeleton loading state */}
              {sourcesLoading && (
                <div className="flex flex-col gap-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-full rounded-lg border border-slate-200 p-4 animate-pulse"
                    >
                      <div className="h-5 bg-slate-200 rounded w-2/3 mb-3" />
                      <div className="flex gap-4">
                        <div className="h-4 bg-slate-100 rounded w-24" />
                        <div className="h-4 bg-slate-100 rounded w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state - only show after loading completes */}
              {!sourcesLoading && sourceConversations.length === 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-body text-slate-600 text-center">
                  No ready understand sessions found. Complete an analysis first
                  to create decision sessions.
                </div>
              )}

              {!sourcesLoading && sourceConversations.length > 0 && (
                <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
                  {sourceConversations.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setSelectedSourceId(session.id)}
                      className={`w-full rounded-lg border p-4 flex flex-col items-start gap-2 text-left transition ${
                        selectedSourceId === session.id
                          ? "border-brand-primary bg-[#EDEFFD]"
                          : "border-slate-200 hover:border-[#cbd5f5]"
                      }`}
                    >
                      <div className="flex items-start justify-between w-full">
                        <span className="text-subtitle text-text-primary">
                          {session.title || "Untitled Session"}
                        </span>
                        {selectedSourceId === session.id && (
                          <span className="text-label text-brand-primary bg-white px-2 py-1 rounded">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="flex gap-4 text-body text-text-secondary">
                        <span>{session.statementCount} statements</span>
                        <span>{session.votingCoverage}% voting coverage</span>
                        {session.date && <span>{session.date}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Cluster Selection */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-body text-text-secondary">
                  Choose which clusters to include in the decision session.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAllClusters}>
                    Select all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={deselectAllClusters}
                  >
                    Deselect all
                  </Button>
                </div>
              </div>

              {clusters.length === 0 && !loading && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-body text-slate-600 text-center">
                  No clusters found in this session.
                </div>
              )}

              <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto">
                {clusters.map((cluster) => (
                  <label
                    key={cluster.clusterIndex}
                    className={`w-full rounded-lg border p-4 flex items-start gap-3 cursor-pointer transition ${
                      cluster.selected
                        ? "border-brand-primary bg-[#EDEFFD]"
                        : "border-slate-200 hover:border-[#cbd5f5]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={cluster.selected}
                      onChange={() => toggleCluster(cluster.clusterIndex)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <span className="text-subtitle text-text-primary">
                          {cluster.name}
                        </span>
                        <span className="text-body text-text-secondary">
                          {cluster.avgConsensusPercent}% avg consensus
                        </span>
                      </div>
                      <p className="text-body text-text-secondary mt-1">
                        {cluster.description}
                      </p>
                      <span className="text-info text-slate-500 mt-2 inline-block">
                        {cluster.statementCount} statements
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Statement Selection */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <p className="text-body text-text-secondary">
                  Set a consensus threshold to recommend statements, then
                  fine-tune your selection.
                </p>

                <div className="flex items-center gap-4 bg-slate-50 rounded-lg p-4">
                  <label className="text-subtitle text-text-primary whitespace-nowrap">
                    Consensus threshold:
                  </label>
                  <input
                    type="range"
                    min={50}
                    max={90}
                    value={consensusThreshold}
                    onChange={(e) =>
                      setConsensusThreshold(parseInt(e.target.value, 10))
                    }
                    className="flex-1"
                  />
                  <span className="text-subtitle text-text-primary w-12 text-right">
                    {consensusThreshold}%
                  </span>
                </div>
              </div>

              {Object.keys(statementsByCluster).length === 0 && !loading && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-body text-slate-600 text-center">
                  No statements found in selected clusters.
                </div>
              )}

              <div className="flex flex-col gap-6 max-h-[350px] overflow-y-auto">
                {Object.entries(statementsByCluster).map(
                  ([
                    clusterIdx,
                    { clusterName, statements: clusterStatements },
                  ]) => (
                    <div key={clusterIdx} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between sticky top-0 bg-white py-2 border-b border-slate-100">
                        <span className="text-subtitle text-text-primary">
                          {clusterName}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            selectAllInCluster(parseInt(clusterIdx, 10))
                          }
                        >
                          Select all
                        </Button>
                      </div>
                      <div className="flex flex-col gap-2">
                        {clusterStatements.map((statement) => (
                          <label
                            key={statement.bucketId}
                            className={`w-full rounded-lg border p-3 flex items-start gap-3 cursor-pointer transition ${
                              statement.selected
                                ? "border-brand-primary bg-[#EDEFFD]"
                                : "border-slate-200 hover:border-[#cbd5f5]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={statement.selected}
                              onChange={() =>
                                toggleStatement(statement.bucketId)
                              }
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div className="flex-1">
                              <div className="flex items-start gap-2">
                                <p className="text-body text-text-primary flex-1">
                                  {statement.statementText}
                                </p>
                                {statement.recommended && (
                                  <span className="text-label bg-green-100 text-green-700 px-2 py-0.5 rounded whitespace-nowrap">
                                    Recommended
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-4 mt-1 text-info text-slate-500">
                                <span>
                                  {statement.agreePercent !== null
                                    ? `${statement.agreePercent}% agree`
                                    : "No consensus data"}
                                </span>
                                <span>{statement.totalVotes} votes</span>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Step 4: Settings */}
          {step === 4 && (
            <Step4Content
              visibility={visibility}
              setVisibility={setVisibility}
              deadline={deadline}
              setDeadline={setDeadline}
            />
          )}

          {/* Step 5: Summary */}
          {step === 5 && (
            <div className="flex flex-col gap-6">
              <p className="text-body text-text-secondary">
                Review your decision session before creating it.
              </p>

              <div className="bg-slate-50 p-5 space-y-4">
                {/* Title */}
                <div>
                  <span className="text-info text-text-secondary block mb-1">
                    Session title
                  </span>
                  <span className="text-subtitle text-text-primary">
                    {title}
                  </span>
                </div>

                {/* Description */}
                {description && (
                  <div>
                    <span className="text-info text-text-secondary block mb-1">
                      Description
                    </span>
                    <span className="text-body text-text-primary">
                      {description}
                    </span>
                  </div>
                )}

                <div className="border-t border-slate-200 pt-4 grid grid-cols-2 gap-4">
                  {/* Clusters */}
                  <div>
                    <span className="text-info text-text-secondary block mb-1">
                      Clusters
                    </span>
                    <span className="text-body text-text-primary">
                      {clusters.filter((c) => c.selected).length} selected
                    </span>
                  </div>

                  {/* Statements */}
                  <div>
                    <span className="text-info text-text-secondary block mb-1">
                      Proposals
                    </span>
                    <span className="text-body text-text-primary">
                      {statements.filter((s) => s.selected).length} statements
                    </span>
                  </div>

                  {/* Consensus threshold */}
                  <div>
                    <span className="text-info text-text-secondary block mb-1">
                      Consensus threshold
                    </span>
                    <span className="text-body text-text-primary">
                      {consensusThreshold}%
                    </span>
                  </div>

                  {/* Vote visibility */}
                  <div>
                    <span className="text-info text-text-secondary block mb-1">
                      Vote visibility
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-brand-primary">
                        {selectedVisibilityOption?.icon}
                      </span>
                      <span className="text-body text-text-primary">
                        {selectedVisibilityOption?.label}
                      </span>
                    </div>
                  </div>

                  {/* Deadline */}
                  <div className="col-span-2">
                    <span className="text-info text-text-secondary block mb-1">
                      Voting deadline
                    </span>
                    <span className="text-body text-text-primary">
                      {deadline
                        ? new Intl.DateTimeFormat("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(deadline))
                        : "No deadline set"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent" />
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center pt-4 border-t border-slate-100">
          {step > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-text-secondary"
              onClick={onBack}
              disabled={loading}
            >
              &larr; Back
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            {step < 5 ? (
              <Button onClick={onNext} disabled={loading}>
                {loading ? "Loading..." : "Continue"}
              </Button>
            ) : (
              <Button onClick={onFinish} disabled={loading || !title.trim()}>
                {loading ? "Creating..." : "Create Session"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
