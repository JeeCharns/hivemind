"use client";

import { useState } from "react";
import { X, Plus, Trash, ListBullets, PencilSimple } from "@phosphor-icons/react";
import Button from "@/app/components/button";
import { useDeliberateSetupWizard } from "@/lib/deliberate-space/react/useDeliberateSetupWizard";

interface DeliberateSetupWizardProps {
  open: boolean;
  onClose: () => void;
  hiveId: string;
  hiveSlug?: string | null;
}

export default function DeliberateSetupWizard({
  open,
  onClose,
  hiveId,
  hiveSlug,
}: DeliberateSetupWizardProps) {
  const {
    mode,
    setMode,
    step,
    totalSteps,
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
    toggleStatement,
    selectAllInCluster,
    manualStatements,
    addManualStatement,
    removeManualStatement,
    title,
    setTitle,
    description,
    setDescription,
    onNext,
    onBack,
    onFinish,
  } = useDeliberateSetupWizard({ hiveId, hiveSlug, open });

  // Local state for new statement input
  const [newStatementText, setNewStatementText] = useState("");
  const [newStatementCluster, setNewStatementCluster] = useState("");

  if (!open) return null;

  const handleAddStatement = () => {
    if (!newStatementText.trim()) return;
    addManualStatement(
      newStatementText.trim(),
      newStatementCluster.trim() || undefined
    );
    setNewStatementText("");
    setNewStatementCluster("");
  };

  // Get selected cluster indices for filtering statements
  const selectedClusterIndices = new Set(
    clusters.filter((c) => c.selected).map((c) => c.clusterIndex)
  );

  // Filter statements to only show those from selected clusters
  const visibleStatements = statements.filter((s) =>
    selectedClusterIndices.has(s.clusterIndex)
  );

  // Group statements by cluster for display
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

  // Step labels based on mode
  const getStepLabel = () => {
    if (step === 0) return "Select mode";

    if (mode === "from-understand") {
      const labels = [
        "",
        "Select source",
        "Choose clusters",
        "Pick statements",
        "Session details",
        "Review & create",
      ];
      return labels[step] || "";
    } else {
      const labels = ["", "Add statements", "Session details", "Review & create"];
      return labels[step] || "";
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-[800px] px-6 md:px-10 py-8 flex flex-col gap-6 mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            {step > 0 && (
              <p className="text-body text-text-secondary">
                Step {step} of {totalSteps}
              </p>
            )}
            <h2 className="text-h2 text-text-primary">{getStepLabel()}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 transition"
            aria-label="Close"
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Step Indicator */}
        {step > 0 && (
          <div className="flex gap-2">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  s <= step ? "bg-indigo-600" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body text-red-700">
            {error}
          </div>
        )}

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Step 0: Mode Selection */}
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <p className="text-body text-text-secondary">
                Choose how you want to create your deliberate session.
              </p>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setMode("from-understand")}
                  className={`w-full rounded-lg border p-6 flex items-start gap-4 text-left transition ${
                    mode === "from-understand"
                      ? "border-brand-primary bg-[#EDEFFD]"
                      : "border-slate-200 hover:border-[#cbd5f5]"
                  }`}
                >
                  <span
                    className={`p-3 rounded-lg ${
                      mode === "from-understand"
                        ? "bg-brand-primary text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <ListBullets size={24} weight="bold" />
                  </span>
                  <div className="flex-1">
                    <span className="text-subtitle text-text-primary block">
                      From an existing conversation
                    </span>
                    <span className="text-body text-text-secondary mt-1 block">
                      Select clusters and statements from an existing
                      conversation to gather sentiment on.
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("from-scratch")}
                  className={`w-full rounded-lg border p-6 flex items-start gap-4 text-left transition ${
                    mode === "from-scratch"
                      ? "border-brand-primary bg-[#EDEFFD]"
                      : "border-slate-200 hover:border-[#cbd5f5]"
                  }`}
                >
                  <span
                    className={`p-3 rounded-lg ${
                      mode === "from-scratch"
                        ? "bg-brand-primary text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <PencilSimple size={24} weight="bold" />
                  </span>
                  <div className="flex-1">
                    <span className="text-subtitle text-text-primary block">
                      Start from scratch
                    </span>
                    <span className="text-body text-text-secondary mt-1 block">
                      Add your own statements manually to gather sentiment on.
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* From-understand: Step 1 - Source Selection */}
          {mode === "from-understand" && step === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-body text-text-secondary">
                Select a session with analysed clusters to create deliberation
                statements from.
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

              {/* Empty state */}
              {!sourcesLoading && sourceConversations.length === 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-body text-slate-600 text-center">
                  No ready sessions found. Complete an analysis on an understand
                  or explore session first to create deliberation sessions.
                </div>
              )}

              {/* Source list */}
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
                        <div className="flex items-center gap-2">
                          <span className="text-subtitle text-text-primary">
                            {session.title}
                          </span>
                          <span className="text-label px-2 py-0.5 rounded bg-slate-100 text-slate-600 capitalize">
                            {session.type}
                          </span>
                        </div>
                        {selectedSourceId === session.id && (
                          <span className="text-label text-brand-primary bg-white px-2 py-1 rounded">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="flex gap-4 text-body text-text-secondary">
                        <span>{session.statementCount} statements</span>
                        <span>{session.clusterCount} clusters</span>
                        {session.date && <span>{session.date}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* From-understand: Step 2 - Cluster Selection */}
          {mode === "from-understand" && step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-body text-text-secondary">
                  Choose which clusters to include in the deliberation.
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
                      <span className="text-subtitle text-text-primary block">
                        {cluster.name}
                      </span>
                      {cluster.description && (
                        <p className="text-body text-text-secondary mt-1">
                          {cluster.description}
                        </p>
                      )}
                      <span className="text-info text-slate-500 mt-2 inline-block">
                        {cluster.statementCount} statements
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* From-understand: Step 3 - Statement Selection */}
          {mode === "from-understand" && step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="text-body text-text-secondary">
                Select which statements to include in the deliberation.
              </p>

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
                            <p className="text-body text-text-primary flex-1">
                              {statement.statementText}
                            </p>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* From-scratch: Step 1 - Add Statements */}
          {mode === "from-scratch" && step === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-body text-text-secondary">
                Add the statements you want participants to deliberate on.
              </p>

              {/* Add new statement form */}
              <div className="flex flex-col gap-3 bg-slate-50 rounded-lg p-4">
                <div className="flex flex-col gap-2">
                  <label className="text-subtitle text-text-primary">
                    Statement text <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    value={newStatementText}
                    onChange={(e) => setNewStatementText(e.target.value)}
                    placeholder="Enter a statement for participants to rate..."
                    rows={2}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-body w-full resize-none"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-subtitle text-text-primary">
                    Category (optional)
                  </label>
                  <input
                    value={newStatementCluster}
                    onChange={(e) => setNewStatementCluster(e.target.value)}
                    placeholder="e.g., Product, Process, Culture"
                    className="border border-slate-200 rounded-lg px-3 py-2 text-body w-full"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleAddStatement}
                    disabled={!newStatementText.trim()}
                  >
                    <Plus size={16} weight="bold" className="mr-1" />
                    Add statement
                  </Button>
                </div>
              </div>

              {/* Statement list */}
              {manualStatements.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-body text-slate-600 text-center">
                  No statements added yet. Add at least one statement to
                  continue.
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                  {manualStatements.map((statement, index) => (
                    <div
                      key={statement.id}
                      className="w-full rounded-lg border border-slate-200 p-4 flex items-start gap-3"
                    >
                      <span className="text-body text-text-secondary">
                        {index + 1}.
                      </span>
                      <div className="flex-1">
                        <p className="text-body text-text-primary">
                          {statement.text}
                        </p>
                        {statement.clusterName && (
                          <span className="text-info text-slate-500 mt-1 inline-block">
                            {statement.clusterName}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeManualStatement(statement.id)}
                        className="p-1 text-slate-400 hover:text-red-500 transition"
                        aria-label="Remove statement"
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-info text-text-secondary">
                {manualStatements.length} statement
                {manualStatements.length !== 1 ? "s" : ""} added
              </p>
            </div>
          )}

          {/* Settings Step */}
          {((mode === "from-understand" && step === 4) ||
            (mode === "from-scratch" && step === 2)) && (
            <div className="flex flex-col gap-4">
              <p className="text-body text-text-secondary">
                Set the title and description for your deliberation session.
              </p>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-subtitle text-text-primary">
                    Session title <span className="text-red-600">*</span>
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Q3 Priorities Sentiment Check"
                    className="border border-slate-200 rounded-lg px-3 py-2 text-body w-full"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-subtitle text-text-primary">
                    Description (optional)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this session about?"
                    rows={3}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-body w-full resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Review Step */}
          {((mode === "from-understand" && step === 5) ||
            (mode === "from-scratch" && step === 3)) && (
            <div className="flex flex-col gap-6">
              <p className="text-body text-text-secondary">
                Review your deliberation session before creating it.
              </p>

              <div className="bg-slate-50 p-5 space-y-4 rounded-lg">
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
                  {/* Mode */}
                  <div>
                    <span className="text-info text-text-secondary block mb-1">
                      Mode
                    </span>
                    <span className="text-body text-text-primary">
                      {mode === "from-understand"
                        ? "From Understand session"
                        : "From scratch"}
                    </span>
                  </div>

                  {/* Statement count */}
                  <div>
                    <span className="text-info text-text-secondary block mb-1">
                      Statements
                    </span>
                    <span className="text-body text-text-primary">
                      {mode === "from-understand"
                        ? statements.filter((s) => s.selected).length
                        : manualStatements.length}{" "}
                      statements
                    </span>
                  </div>

                  {/* Clusters (from-understand only) */}
                  {mode === "from-understand" && (
                    <div>
                      <span className="text-info text-text-secondary block mb-1">
                        Clusters
                      </span>
                      <span className="text-body text-text-primary">
                        {clusters.filter((c) => c.selected).length} selected
                      </span>
                    </div>
                  )}
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
          {step > 0 ? (
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
            {step === 0 ? (
              <Button onClick={onNext} disabled={!mode}>
                Continue
              </Button>
            ) : step < totalSteps ? (
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
