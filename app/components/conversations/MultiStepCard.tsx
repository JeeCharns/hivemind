"use client";

import { useState } from "react";
import Link from "next/link";

interface ConversationSummary {
  id: string;
  slug: string;
  type: "understand" | "decide";
  title: string;
  phase: string;
  responseCount?: number;
}

interface MultiStepCardProps {
  hiveKey: string;
  discussConversation: ConversationSummary;
  decideConversation: ConversationSummary;
}

type StepStatus = "empty" | "partial" | "complete";

function getStepStatus(
  phase: string,
  type: "understand" | "decide"
): StepStatus {
  if (type === "understand") {
    if (phase === "report_open") return "complete";
    if (phase === "listen_open") return "partial";
    return "partial";
  } else {
    if (phase === "result_open") return "complete";
    if (phase === "vote_open") return "partial";
    if (phase === "listen_open") return "partial";
    return "empty";
  }
}

function StepIndicator({
  label,
  status,
}: {
  label: string;
  status: StepStatus;
}) {
  const bgColor =
    status === "complete"
      ? "bg-green-500"
      : status === "partial"
        ? "bg-amber-400"
        : "bg-gray-200";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`h-4 w-4 rounded-full ${bgColor}`} />
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  );
}

export function MultiStepCard({
  hiveKey,
  discussConversation,
  decideConversation,
}: MultiStepCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const discussStatus = getStepStatus(discussConversation.phase, "understand");
  const decideStatus = getStepStatus(decideConversation.phase, "decide");

  const responseCount = discussConversation.responseCount ?? 0;
  const summaryText =
    responseCount > 0
      ? `${responseCount} ideas shared`
      : "Be the first to share an idea";

  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Card content (clickable) */}
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className="w-full p-4 text-left hover:bg-gray-50"
      >
        <h3 className="mb-3 text-lg font-semibold text-gray-900">
          {discussConversation.title}
        </h3>

        {/* Step indicators */}
        <div className="mb-3 flex items-center gap-2">
          <StepIndicator label="Discuss" status={discussStatus} />
          <div className="h-px flex-1 bg-gray-200" />
          <StepIndicator label="Decide" status={decideStatus} />
        </div>

        <p className="text-sm text-gray-500">{summaryText}</p>
      </button>

      {/* Internal bottom sheet menu */}
      {menuOpen && (
        <>
          {/* Scrim */}
          <div
            data-testid="card-scrim"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMenuOpen(false)}
          />

          {/* Menu */}
          <div className="absolute inset-x-0 bottom-0 rounded-t-lg bg-white p-3 shadow-lg">
            <Link
              href={`/hives/${hiveKey}/conversations/${discussConversation.slug || discussConversation.id}`}
              className="flex items-center justify-between rounded-lg p-3 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-3 w-3 rounded-full ${discussStatus === "complete" ? "bg-green-500" : "bg-amber-400"}`}
                />
                <span className="font-medium">View Discussion</span>
              </div>
              <span className="text-sm text-gray-500">
                {responseCount} ideas
              </span>
            </Link>

            <Link
              href={`/hives/${hiveKey}/conversations/${decideConversation.slug || decideConversation.id}`}
              className="flex items-center justify-between rounded-lg p-3 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <div
                  className={`h-3 w-3 rounded-full ${decideStatus === "complete" ? "bg-green-500" : decideStatus === "partial" ? "bg-amber-400" : "bg-gray-200"}`}
                />
                <span className="font-medium">View Decision</span>
              </div>
              <span className="text-sm text-gray-500">
                {decideConversation.phase === "vote_open"
                  ? "Vote now"
                  : "Coming soon"}
              </span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
