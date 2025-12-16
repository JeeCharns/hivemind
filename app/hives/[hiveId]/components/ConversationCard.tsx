/**
 * Conversation Card - Presentational Component
 *
 * Displays a conversation summary card with CTA button
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

  return (
    <article className="flex flex-col justify-between bg-white rounded-2xl border border-[#E6E9F2] p-6 min-h-[260px] shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-col gap-4">
        {/* Header: Type badge and date */}
        <div className="flex items-start justify-between">
          <span className="inline-flex items-center gap-2 px-2 py-1 bg-[#FFF1EB] text-[#E46E00] text-[12px] leading-6 font-semibold rounded">
            {typeLabel}
          </span>
          <span className="text-xs text-slate-500">
            {formatDate(conversation.created_at)}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-xl font-medium text-[#172847] line-clamp-2">
          {conversation.title || "Untitled Conversation"}
        </h3>

        {/* Description */}
        {conversation.description && (
          <p className="text-sm leading-[1.4] font-normal text-[#566888] line-clamp-3">
            {conversation.description}
          </p>
        )}
      </div>

      {/* CTA Button */}
      <Link
        href={cta.href}
        className="mt-6 bg-[#EDEFFD] hover:bg-[#dfe3ff] text-[#3A1DC8] text-sm font-medium leading-6 rounded-sm py-2 px-4 text-center transition-colors"
      >
        {cta.label} →
      </Link>
    </article>
  );
}
