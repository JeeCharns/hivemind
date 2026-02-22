/**
 * Guest Conversation Header
 *
 * Simplified conversation header for guest access.
 * Shows title, description, and tab switcher.
 * No back arrow, share button, delete, or regenerate actions.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface GuestConversationHeaderProps {
  token: string;
  title: string;
  description?: string | null;
}

export default function GuestConversationHeader({
  token,
  title,
  description,
}: GuestConversationHeaderProps) {
  const pathname = usePathname();

  const tabs = [
    { slug: "listen", label: "Listen" },
    { slug: "understand", label: "Understand" },
    { slug: "result", label: "Result" },
  ];

  const basePath = `/respond/${token}`;
  const activeSlug =
    tabs.find((tab) => pathname?.includes(`/${tab.slug}`))?.slug ?? "listen";

  return (
    <div className="pt-4 pb-4">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6 flex flex-col">
        {/* Title + tabs row */}
        <div className="flex flex-row items-start justify-between gap-4 md:gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-h3 md:text-h2 text-text-primary wrap-break-word">
              {title}
            </h1>
            {description?.trim() && (
              <p className="mt-1 text-body text-text-secondary line-clamp-2">
                {description.trim()}
              </p>
            )}
          </div>

          {/* Desktop/Tablet: tabs inline */}
          <div className="hidden md:flex flex-nowrap items-center gap-4 shrink-0">
            <div className="flex items-center gap-1 bg-white border border-white px-1 py-1 rounded-sm">
              {tabs.map((tab) => {
                const isActive = activeSlug === tab.slug;
                return (
                  <Link
                    key={tab.slug}
                    href={`${basePath}/${tab.slug}`}
                    className={`inline-flex h-9 items-center justify-center rounded-sm px-3 text-subtitle transition-colors ${
                      isActive
                        ? "bg-[#EDEFFD] text-brand-primary"
                        : "bg-[#FDFDFD] text-text-tertiary hover:text-brand-primary"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mobile: Tabs in separate row */}
        <div className="mt-3 flex md:hidden items-center gap-1 bg-white border border-slate-100 px-1 py-1 rounded-sm w-full">
          {tabs.map((tab) => {
            const isActive = activeSlug === tab.slug;
            return (
              <Link
                key={tab.slug}
                href={`${basePath}/${tab.slug}`}
                className={`flex-1 inline-flex h-9 items-center justify-center rounded-sm px-3 text-subtitle transition-colors ${
                  isActive
                    ? "bg-[#EDEFFD] text-brand-primary"
                    : "bg-[#FDFDFD] text-text-tertiary hover:text-brand-primary"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Guest info banner */}
        <div className="mt-3 rounded-lg bg-blue-50 border border-blue-100 px-4 py-2.5 text-body text-blue-700">
          You&apos;re viewing this conversation as a guest.{" "}
          <Link
            href="/login"
            className="font-medium underline hover:text-blue-800"
          >
            Sign up
          </Link>{" "}
          to create your own conversations.
        </div>
      </div>
    </div>
  );
}
