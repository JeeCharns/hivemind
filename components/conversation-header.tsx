"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon, DotsThreeIcon } from "@phosphor-icons/react";

type ConversationHeaderProps = {
  hiveId: string;
  conversationId: string;
  title?: string;
  lastUpdatedLabel?: string;
};

export default function ConversationHeader({
  hiveId,
  conversationId,
  title = "Conversation",
}: ConversationHeaderProps) {
  const pathname = usePathname();

  const tabs = [
    { slug: "listen", label: "Listen" },
    { slug: "understand", label: "Understand" },
    { slug: "respond", label: "Respond" },
    { slug: "report", label: "Report" },
  ];

  const basePath = `/hives/${hiveId}/conversations/${conversationId}`;

  const activeFromPath = () => {
    const match = tabs.find((tab) => pathname?.includes(`/${tab.slug}`));
    return match?.slug ?? "listen";
  };

  const activeSlug = activeFromPath();

  return (
    <div className="bg-white border-b border-slate-200 rounded-t-2xl px-10 pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Link
            href="/hives"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-800 text-sm font-medium"
          >
            <ArrowLeftIcon size={16} weight="bold" />
            Back to hives
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          </div>
        </div>
        <button
          type="button"
          className="w-9 h-9 rounded-md border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50"
          aria-label="Conversation actions"
        >
          <DotsThreeIcon size={18} weight="bold" />
        </button>
      </div>

      <div className="flex items-center gap-6 text-base font-medium text-slate-500">
        {tabs.map((tab) => {
          const isActive = activeSlug === tab.slug;
          return (
            <Link
              key={tab.slug}
              href={`${basePath}/${tab.slug}`}
              className={`pb-2 border-b-2 transition-colors ${
                isActive
                  ? "text-slate-900 border-slate-900"
                  : "text-slate-400 border-transparent hover:text-slate-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
