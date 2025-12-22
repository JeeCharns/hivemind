/**
 * Conversation Card - Presentational Component
 *
 * Displays a conversation summary card with CTA details
 * Follows SRP: only responsible for rendering
 * All logic delegated to pure functions
 */

"use client";

import Link from "next/link";
import type { ConversationCardData } from "@/types/conversations";
import { getConversationCta } from "@/lib/conversations/getConversationCta";

interface ConversationCardProps {
  hiveKey: string;
  conversation: ConversationCardData;
}

function getStatusLabel(conversation: ConversationCardData): string {
  if (conversation.report_json) return "Report ready";
  if (conversation.analysis_status === "ready") return "Analysis ready";
  if (conversation.analysis_status === "error") return "Analysis error";
  if (
    conversation.analysis_status === "analyzing" ||
    conversation.analysis_status === "embedding"
  ) {
    return "Analysis in progress";
  }
  return "Collecting responses";
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Invalid date";
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    }).format(date);
  } catch {
    return "Invalid date";
  }
}

export default function ConversationCard({
  hiveKey,
  conversation,
}: ConversationCardProps) {
  const cta = getConversationCta(hiveKey, conversation);
  const typeLabel = conversation.type === "decide" ? "SOLUTION SPACE" : "PROBLEM SPACE";
  const title = conversation.title?.trim() || "Untitled Conversation";
  const description =
    conversation.description?.trim() || "No description has been added yet.";
  const statusLabel = getStatusLabel(conversation);

  return (
    <Link
      href={cta.href}
      aria-label={`Open conversation: ${title}`}
      className="group relative flex h-64 cursor-pointer flex-col overflow-hidden border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <div className="flex items-start justify-between mb-4">
        <span
          className={`px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide font-display ${
            conversation.type === "decide"
              ? "bg-emerald-50 text-emerald-600"
              : "bg-red-50 text-red-600"
          }`}
        >
          {typeLabel}
        </span>
        <span className="text-slate-400 text-xs font-medium">
          {formatDate(conversation.created_at)}
        </span>
      </div>

      <h3 className="text-xl font-medium font-display text-slate-900 mb-2 line-clamp-2 transition-colors group-hover:text-indigo-600">
        {title}
      </h3>
      <p className="text-slate-500 text-sm mb-6 line-clamp-3 leading-relaxed">
        {description}
      </p>

      <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-100">
        <span className="text-xs font-medium text-slate-500">{statusLabel}</span>
        <span className="text-xs font-medium font-display text-indigo-600 bg-indigo-50 px-2.5 py-1.5">
          {cta.label}
          <span className="text-indigo-300">→</span>
        </span>
      </div>

      {conversation.report_json && (
        <div className="absolute top-6 right-6 text-indigo-600 bg-indigo-50 px-2 py-1 text-[10px] font-medium uppercase tracking-wide">
          Ready
        </div>
      )}
    </Link>
  );
}
