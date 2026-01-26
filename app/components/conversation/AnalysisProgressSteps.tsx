"use client";

/**
 * AnalysisProgressSteps - Displays step-based progress during analysis
 *
 * Shows:
 * - Step dots indicating current progress (1-4)
 * - Current step label with spinner
 * - Human-readable step description
 *
 * Maps internal analysis stages to 4 user-facing steps:
 * 1. Embedding responses
 * 2. Clustering responses
 * 3. Generating themes
 * 4. Consolidating statements
 */

import type { AnalysisProgressStage } from "@/lib/conversations/server/broadcastAnalysisStatus";

export interface AnalysisStep {
  current: number;
  total: number;
  label: string;
}

/**
 * Maps internal progress stages to user-facing step numbers
 */
export function getStepFromStage(stage?: AnalysisProgressStage): AnalysisStep {
  const total = 4;

  if (!stage) {
    return { current: 1, total, label: "Embedding responses..." };
  }

  // Step 1: Embedding
  if (
    stage === "starting" ||
    stage === "fetching" ||
    stage === "fetched" ||
    stage === "embedding" ||
    stage === "embedding_progress" ||
    stage === "embedding_done"
  ) {
    return { current: 1, total, label: "Embedding responses..." };
  }

  // Step 2: Clustering
  if (stage === "clustering") {
    return { current: 2, total, label: "Clustering responses..." };
  }

  // Step 3: Generating themes
  if (stage === "themes" || stage === "subthemes") {
    return { current: 3, total, label: "Generating themes..." };
  }

  // Step 4: Consolidating
  if (
    stage === "consolidating" ||
    stage === "saving" ||
    stage === "umap" ||
    stage === "finalizing" ||
    stage === "complete"
  ) {
    return { current: 4, total, label: "Consolidating statements..." };
  }

  // Default fallback
  return { current: 1, total, label: "Processing..." };
}

export interface AnalysisProgressStepsProps {
  /** Current progress stage from broadcast */
  progressStage?: AnalysisProgressStage;
  /** Custom message override */
  customMessage?: string;
  /** Size variant */
  size?: "sm" | "md";
}

export default function AnalysisProgressSteps({
  progressStage,
  customMessage,
  size = "md",
}: AnalysisProgressStepsProps) {
  const step = getStepFromStage(progressStage);
  const displayMessage = customMessage || step.label;

  const dotSize = size === "sm" ? "w-2 h-2" : "w-3 h-3";
  const spinnerSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const textSize = size === "sm" ? "text-sm" : "text-base";
  const stepTextSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Step dots */}
      <div className="flex items-center gap-2">
        {Array.from({ length: step.total }, (_, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === step.current;
          const isComplete = stepNum < step.current;

          return (
            <div
              key={stepNum}
              className={`${dotSize} rounded-full transition-all duration-300 ${
                isActive
                  ? "bg-indigo-600 scale-125"
                  : isComplete
                    ? "bg-indigo-400"
                    : "bg-slate-200"
              }`}
            />
          );
        })}
        <span className={`${stepTextSize} text-slate-500 ml-2`}>
          Step {step.current} of {step.total}
        </span>
      </div>

      {/* Spinner + message */}
      <div className="flex items-center gap-2">
        <svg
          className={`${spinnerSize} animate-spin text-indigo-600`}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className={`${textSize} text-slate-700 font-medium`}>
          {displayMessage}
        </span>
      </div>
    </div>
  );
}
