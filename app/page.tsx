"use client";

import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import {
  CheckIcon,
  GlobeIcon,
  PlusIcon,
  SignInIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";

type Session = {
  id: string;
  title: string;
  stage: "Problem Space" | "Solution Space";
  description: string;
  participants: number;
  currentPhase: string;
  isJoined: boolean;
  isPublic: boolean;
  scope: "org" | "public";
  lastUpdated: string;
};

const initialSessions: Session[] = [
  {
    id: "1",
    title: "Bottlenecks and Blockers",
    stage: "Problem Space",
    description:
      "Map the failure points that are preventing us form moving forward.",
    participants: 1204,
    currentPhase: "Synthesis",
    isJoined: true,
    isPublic: false,
    scope: "org",
    lastUpdated: "2025-02-10",
  },
];

const statsByView = {
  org: {
    participants: "1,204",
    consensus: "76%",
    resolved: "42",
    resolvedDelta: "+8 this month",
  },
  public: {
    participants: "34,201",
    consensus: "62%",
    resolved: "1,029",
    resolvedDelta: "+38 this month",
  },
};

const formatDate = (dateString: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateString}T00:00:00Z`));

export default function Home() {
  const [currentView, setCurrentView] = useState<"org" | "public">("org");
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const visibleSessions = useMemo(
    () => sessions.filter((session) => session.scope === currentView),
    [sessions, currentView]
  );

  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? null;

  const handleJoin = (event: MouseEvent, id: string) => {
    event.stopPropagation();
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id ? { ...session, isJoined: true } : session
      )
    );
  };

  const handleOpenSession = (session: Session) => {
    if (!session.isJoined) return;
    setActiveSessionId(session.id);
  };

  const { participants, consensus, resolved, resolvedDelta } =
    statsByView[currentView];

  const renderActiveSession = (session: Session) => (
    <section className="space-y-6">
      <button
        onClick={() => setActiveSessionId(null)}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        ← Back to hives
      </button>

      <div className="flex items-center gap-3">
        <span
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
            session.stage === "Problem Space"
              ? "bg-red-50 text-red-600"
              : "bg-emerald-50 text-emerald-600"
          }`}
        >
          {session.stage}
        </span>
        {session.isPublic && (
          <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
            <GlobeIcon size={14} /> Public
          </span>
        )}
      </div>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">
          {session.title}
        </h1>
        <p className="text-slate-600 leading-relaxed">{session.description}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">
            Participants
          </p>
          <p className="text-xl font-semibold text-slate-900">
            {session.participants.toLocaleString()}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">
            Phase
          </p>
          <p className="text-xl font-semibold text-slate-900">
            {session.currentPhase}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">
            Updated
          </p>
          <p className="text-xl font-semibold text-slate-900">
            {formatDate(session.lastUpdated)}
          </p>
        </div>
      </div>
    </section>
  );

  const renderHiveList = () => (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">
            {currentView === "org"
              ? "Nebula Industries"
              : "Explore Public Hives"}
          </h1>
          <p className="text-slate-500 leading-relaxed max-w-2xl">
            {currentView === "org"
              ? "Overview of your organization's collective intelligence sessions and active initiatives."
              : "Join global conversations and help solve the world's most pressing problems."}
          </p>
          <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1 py-1 text-sm font-medium text-slate-700">
            <button
              className={`px-3 py-1 rounded-full transition ${
                currentView === "org"
                  ? "bg-white shadow-sm"
                  : "hover:bg-white/60"
              }`}
              onClick={() => setCurrentView("org")}
            >
              Org hives
            </button>
            <button
              className={`px-3 py-1 rounded-full transition ${
                currentView === "public"
                  ? "bg-white shadow-sm"
                  : "hover:bg-white/60"
              }`}
              onClick={() => setCurrentView("public")}
            >
              Public
            </button>
          </div>
        </div>

        {currentView === "org" && (
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-200 hover:shadow-indigo-300 whitespace-nowrap">
            <PlusIcon size={24} />
            New Hive
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            Active Participants
          </div>
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-semibold text-slate-900">
              {participants}
            </div>
            <div className="text-green-600 text-xs font-semibold bg-green-50 px-2 py-0.5 rounded-full">
              +12%
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            Avg Consensus
          </div>
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-semibold text-slate-900">
              {consensus}
            </div>
            <div className="text-slate-500 text-xs font-semibold bg-slate-100 px-2 py-0.5 rounded-full">
              Steady
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            Resolved Issues
          </div>
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-semibold text-slate-900">
              {resolved}
            </div>
            <div className="text-green-600 text-xs font-semibold bg-green-50 px-2 py-0.5 rounded-full">
              {resolvedDelta}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold text-slate-900">
          {currentView === "org" ? "Active Hives" : "Trending Communities"}
        </h2>
        <span className="bg-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded-full">
          {visibleSessions.length}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
        {visibleSessions.map((session) => (
          <div
            key={session.id}
            onClick={() => handleOpenSession(session)}
            className={`bg-white border rounded-2xl p-6 transition-all relative overflow-hidden flex flex-col h-64 ${
              session.isJoined
                ? "cursor-pointer border-slate-200 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-50"
                : "border-slate-100 opacity-80 hover:opacity-100"
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                  session.stage === "Problem Space"
                    ? "bg-red-50 text-red-600"
                    : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {session.stage}
              </span>
              <span className="text-slate-400 text-xs font-semibold">
                {formatDate(session.lastUpdated)}
              </span>
            </div>

            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              {session.title}
            </h3>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed line-clamp-3">
              {session.description}
            </p>

            <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <UsersThreeIcon size={16} className="text-slate-400" />
                <span>{session.participants.toLocaleString()}</span>
              </div>

              {session.isJoined ? (
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
                  {session.isPublic && <GlobeIcon size={12} />}
                  {session.currentPhase}
                  <span className="text-indigo-300">→</span>
                </span>
              ) : (
                <button
                  onClick={(event) => handleJoin(event, session.id)}
                  className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-sm"
                >
                  <SignInIcon size={12} />
                  Join Hive
                </button>
              )}
            </div>

            {session.isJoined && session.isPublic && (
              <div
                className="absolute top-6 right-6 text-indigo-600 bg-indigo-50 p-1 rounded-full"
                title="Joined"
              >
                <CheckIcon size={14} />
              </div>
            )}
          </div>
        ))}

        {currentView === "org" && (
          <button className="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-slate-400 hover:text-indigo-600 h-64 w-full">
            <div className="w-14 h-14 rounded-full bg-slate-100 hover:bg-indigo-100 flex items-center justify-center transition-all duration-300 text-slate-400 hover:text-indigo-600">
              <PlusIcon size={28} />
            </div>
            <span className="font-semibold text-sm">Create New Session</span>
          </button>
        )}
      </div>
    </section>
  );

  return (
    <main className="flex-1 flex flex-col overflow-hidden relative">
      <div className="flex flex-col gap-8">
        {activeSession ? renderActiveSession(activeSession) : renderHiveList()}
      </div>
    </main>
  );
}
