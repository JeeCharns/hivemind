"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { DEFAULT_HIVE_ID } from "@/lib/config";
import { PlusIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { getHiveDashboardData } from "@/lib/utils/actions";

type Conversation = {
  id: string;
  title: string;
  phase: string;
  type: "understand" | "decide";
  created_at: string;
};

const phaseToTab = (phase: string) => {
  const normalized = phase.toLowerCase();
  if (normalized.includes("vote")) return "vote";
  if (normalized.includes("respond")) return "respond";
  if (normalized.includes("report") || normalized.includes("result"))
    return "result";
  if (normalized.includes("understand")) return "understand";
  return "listen";
};

const formatDate = (dateString?: string) => {
  if (!dateString) return "26 Nov 25";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "26 Nov 25";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(date);
};

function FeaturedSkeleton() {
  return (
    <div className="flex flex-col justify-between bg-white rounded-2xl border border-[#E6E9F2] p-6 min-h-[300px] shadow-sm animate-pulse">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="h-6 w-28 bg-[#E0E3ED] rounded" />
          <div className="h-5 w-16 bg-[#E0E3ED] rounded" />
        </div>
        <div className="h-6 w-48 bg-[#E0E3ED] rounded" />
        <div className="h-4 w-full bg-[#E0E3ED] rounded" />
        <div className="h-4 w-2/3 bg-[#E0E3ED] rounded" />
        <div className="h-5 w-24 bg-[#E0E3ED] rounded" />
      </div>
      <div className="mt-6 h-10 w-full bg-[#E0E3ED] rounded-sm" />
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2 pt-8">
      <div className="h-8 w-64 bg-[#E0E3ED] rounded-md animate-pulse" />
      <div className="h-4 w-72 bg-[#E0E3ED] rounded-md animate-pulse" />
    </div>
  );
}

export default function HivesPage() {
  const [data, setData] = useState<{
    hiveName: string;
    conversations: Conversation[];
  } | null>(null);

  useEffect(() => {
    let active = true;
    getHiveDashboardData().then((res) => {
      if (active) setData(res);
    });
    return () => {
      active = false;
    };
  }, []);

  const rows: Conversation[] = data?.conversations ?? [];
  const hiveName = data?.hiveName ?? "Brightloop Mobility Co-Op";
  const featured = rows[0];
  const featuredHref = featured
    ? `/hives/${DEFAULT_HIVE_ID}/conversations/${featured.id}/${phaseToTab(
        featured.phase
      )}`
    : "#";
  const isLoading = data === null;

  return (
    <div className="mx-auto max-w-[1440px] relative flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <Suspense fallback={<HeaderSkeleton />}>
            {data ? (
              <div className="flex flex-col gap-2">
                <h1 className="text-[32px] leading-[41px] pt-8 font-medium text-[#172847]">
                  {hiveName}
                </h1>
                <p className="text-sm leading-5 font-normal text-[#566888]">
                  Your collective intelligence sessions live here
                </p>
              </div>
            ) : (
              <HeaderSkeleton />
            )}
          </Suspense>
          <button className="bg-[#3A1DC8] hover:bg-[#2f18a6] text-white font-medium text-sm leading-6 px-4 py-2 rounded-md h-10 w-[117px]">
            New Session
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {isLoading ? (
            <FeaturedSkeleton />
          ) : featured ? (
            <article className="flex flex-col justify-between bg-white rounded-2xl border border-[#E6E9F2] p-6 min-h-[300px] shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <span className="inline-flex items-center gap-2 px-2 py-1 bg-[#FFF1EB] text-[#E46E00] text-[12px] leading-6 font-semibold rounded">
                    {featured.type === "decide"
                      ? "SOLUTION SPACE"
                      : "PROBLEM SPACE"}
                  </span>
                  <span className="text-sm font-medium text-[#566888]">
                    {formatDate(featured.created_at)}
                  </span>
                </div>
                <h3 className="text-xl font-medium text-[#172847]">
                  {featured.title}
                </h3>
                <p className="text-sm leading-[1.4] font-normal text-[#566888]">
                  {featured.type === "decide"
                    ? "As we approach Q3, we're looking to get aligned on the next solutions to ship. What do you see in your work that we should know about?"
                    : "As we approach Q3, we're looking to get aligned on the next problems to solve. What do you see in your work that we should know about?"}
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-[#566888]">
                  <UsersThreeIcon
                    size={18}
                    weight="fill"
                    className="text-[#566888]"
                  />
                  <span>124</span>
                </div>
              </div>

              <Link
                href={featuredHref}
                className="mt-6 bg-[#EDEFFD] hover:bg-[#dfe3ff] text-[#3A1DC8] text-sm font-medium leading-6 rounded-sm py-2 px-4 text-center transition-colors"
              >
                Result ready →
              </Link>
            </article>
          ) : (
            <FeaturedSkeleton />
          )}

          <button className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-[#D7E0F0] p-10 min-h-[300px] bg-white/60 text-[#566888] hover:border-[#b8c7e6] hover:text-[#3A1DC8] transition-colors">
            <span className="w-14 h-14 rounded-lg bg-[#DADDE1] flex items-center justify-center">
              <PlusIcon size={24} className="text-[#566888]" />
            </span>
            <span className="text-sm font-medium">Create New Session</span>
          </button>

          <div className="hidden lg:block opacity-0 pointer-events-none rounded-2xl border-2 border-dashed border-[#D7E0F0]" />
        </div>
      </section>
    </div>
  );
}
