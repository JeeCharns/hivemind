"use client";

import Button from "@/app/components/button";
import { useDecisionSetupWizard } from "@/lib/decision-space/react/useDecisionSetupWizard";
import type { DecisionVisibility } from "@/types/decision-space";

interface DecisionSetupWizardProps {
  open: boolean;
  onClose: () => void;
  hiveId: string;
  hiveSlug?: string | null;
}

export default function DecisionSetupWizard({
  open,
  onClose,
  hiveId,
  hiveSlug,
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
    setTitle,
    description,
    setDescription,
    visibility,
    setVisibility,
    deadline,
    setDeadline,
    onNext,
    onBack,
    onFinish,
  } = useDecisionSetupWizard({ hiveId, hiveSlug, open });

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
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-[800px] px-6 md:px-10 py-8 flex flex-col gap-6 mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-body text-text-secondary">Step {step} of 4</p>
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
          {[1, 2, 3, 4].map((s) => (
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
                        <div className="h-4 bg-slate-100 rounded w-20" />
                        <div className="h-4 bg-slate-100 rounded w-24" />
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
                        <span>{session.clusterCount} clusters</span>
                        <span>{session.date}</span>
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
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4">
                {/* Title */}
                <div className="flex flex-col gap-2">
                  <label className="text-subtitle text-text-primary">
                    Session title{" "}
                    <span className="text-red-600 text-info">*</span>
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-body w-full"
                    placeholder="e.g., Q3 Priority Decisions"
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-2">
                  <label className="text-subtitle text-text-primary">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-body w-full resize-none"
                    placeholder="What is this decision session about?"
                  />
                </div>

                {/* Visibility */}
                <div className="flex flex-col gap-2">
                  <label className="text-subtitle text-text-primary">
                    Vote visibility
                  </label>
                  <select
                    value={visibility}
                    onChange={(e) =>
                      setVisibility(e.target.value as DecisionVisibility)
                    }
                    className="border border-slate-200 rounded-lg px-3 py-2 text-body w-full bg-white"
                  >
                    <option value="hidden">
                      Hidden - Votes not shown until round closes
                    </option>
                    <option value="aggregate">
                      Aggregate - Show totals, not individual votes
                    </option>
                    <option value="transparent">
                      Transparent - Show all votes publicly
                    </option>
                  </select>
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
                    className="border border-slate-200 rounded-lg px-3 py-2 text-body w-full"
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-subtitle text-text-primary mb-2">Summary</p>
                <ul className="text-body text-text-secondary space-y-1">
                  <li>
                    {clusters.filter((c) => c.selected).length} clusters
                    selected
                  </li>
                  <li>
                    {statements.filter((s) => s.selected).length} statements as
                    proposals
                  </li>
                  <li>Consensus threshold: {consensusThreshold}%</li>
                </ul>
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
            {step < 4 ? (
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
