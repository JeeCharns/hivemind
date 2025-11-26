"use client";

import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { DEFAULT_HIVE_ID } from "@/lib/config";
import { GlobeIcon, PlusIcon, UsersThreeIcon } from "@phosphor-icons/react";
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
  if (normalized.includes("report")) return "report";
  if (normalized.includes("understand")) return "understand";
  return "listen";
};

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-64 bg-slate-100 rounded" />
      <div className="h-4 w-96 bg-slate-100 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 bg-slate-100 border border-slate-200 rounded-2xl"
          />
        ))}
      </div>
      <div className="h-6 w-40 bg-slate-100 rounded" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-64 bg-slate-100 border border-slate-200 rounded-2xl"
          />
        ))}
      </div>
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
  const hiveName = data?.hiveName ?? "Hive";

  const stats = {
    participants: "1",
    consensus: "–",
    resolved: rows.length.toString(),
    resolvedDelta: "+0 this month",
  };

  return (
    <main className="flex-1 flex flex-col p-8 overflow-hidden relative">
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-3xl font-medium text-slate-900">
                {hiveName}
              </h1>
              <p className="text-slate-500 leading-relaxed max-w-2xl">
                Overview of your organization&apos;s collective intelligence
                sessions and active initiatives.
              </p>
            </div>

            <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-200 hover:shadow-indigo-300 whitespace-nowrap">
              <PlusIcon size={24} />
              New Hive
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
                Active Participants
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-3xl font-medium text-slate-900">
                  {stats.participants}
                </div>
                <div className="text-green-600 text-xs font-medium bg-green-50 px-2 py-0.5 rounded-full">
                  +0%
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
                Avg Consensus
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-3xl font-medium text-slate-900">
                  {stats.consensus}
                </div>
                <div className="text-slate-500 text-xs font-medium bg-slate-100 px-2 py-0.5 rounded-full">
                  Steady
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
                Resolved Issues
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-3xl font-medium text-slate-900">
                  {stats.resolved}
                </div>
                <div className="text-green-600 text-xs font-medium bg-green-50 px-2 py-0.5 rounded-full">
                  {stats.resolvedDelta}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <h2 className="text-xl font-medium text-slate-900">Active Hives</h2>
            <span className="bg-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded-full">
              {rows.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
            <Suspense fallback={<DashboardSkeleton />}>
              {rows.map((session) => {
                const tab = phaseToTab(session.phase);
                const href = `/hives/${DEFAULT_HIVE_ID}/conversations/${session.id}/${tab}`;
                return (
                  <Link
                    key={session.id}
                    href={href}
                    className="bg-white border border-slate-200 rounded-2xl p-6 transition-all relative overflow-hidden flex flex-col h-64 cursor-pointer hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-50"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wide bg-red-50 text-red-600">
                        {session.type === "decide"
                          ? "Solution Space"
                          : "Problem Space"}
                      </span>
                      <span className="text-slate-400 text-xs font-medium">
                        {new Date(session.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="text-xl font-medium text-slate-900 mb-2">
                      {session.title}
                    </h3>
                    <p className="text-slate-500 text-sm mb-6 leading-relaxed line-clamp-3">
                      {session.type === "decide"
                        ? "Decide track conversation."
                        : "Understand track conversation."}
                    </p>

                    <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <UsersThreeIcon size={16} className="text-slate-400" />
                        <span>1</span>
                      </div>
                      <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                        {session.type === "decide" && <GlobeIcon size={12} />}
                        {session.phase.replace("_", " ")}
                        <span className="text-indigo-300">→</span>
                      </span>
                    </div>
                  </Link>
                );
              })}
            </Suspense>

            <button className="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-slate-400 hover:text-indigo-600 h-64 w-full">
              <div className="w-14 h-14 rounded-full bg-slate-100 hover:bg-indigo-100 flex items-center justify-center transition-all duration-300 text-slate-400 hover:text-indigo-600">
                <PlusIcon size={28} />
              </div>
              <span className="font-medium text-sm">Create New Session</span>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
