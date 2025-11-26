"use client";

import { useState } from "react";

type Feedback = "agree" | "pass" | "disagree";

type ResponseItem = {
  id: number;
  response_text: string;
  tag: string | null;
  cluster_index: number | null;
  counts: Record<Feedback, number>;
  current?: Feedback | null;
};

type ThemeRow = {
  cluster_index: number;
  name: string | null;
  description: string | null;
  size?: number | null;
};

const tagColors: Record<string, string> = {
  data: "bg-blue-50 text-blue-700 border-blue-100",
  problem: "bg-red-50 text-red-700 border-red-100",
  need: "bg-amber-50 text-amber-700 border-amber-100",
  want: "bg-emerald-50 text-emerald-700 border-emerald-100",
  risk: "bg-orange-50 text-orange-700 border-orange-100",
  proposal: "bg-indigo-50 text-indigo-700 border-indigo-100",
};

export default function RespondView({
  responses,
  themes,
  conversationId,
}: {
  responses: ResponseItem[];
  themes: ThemeRow[];
  conversationId: string;
}) {
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [items, setItems] = useState(responses);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const filtered =
    selectedCluster === null
      ? items
      : items.filter((r) => r.cluster_index === selectedCluster);

  const updateFeedback = async (responseId: number, feedback: Feedback) => {
    setLoadingId(responseId);
    setItems((prev) =>
      prev.map((r) => {
        if (r.id !== responseId) return r;
        const prevChoice = r.current;
        const nextCounts = { ...r.counts };
        if (prevChoice)
          nextCounts[prevChoice] = Math.max(0, nextCounts[prevChoice] - 1);
        nextCounts[feedback] = (nextCounts[feedback] ?? 0) + 1;
        return { ...r, counts: nextCounts, current: feedback };
      })
    );

    const res = await fetch(`/api/conversations/${conversationId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseId, feedback }),
    });

    if (!res.ok) {
      // revert on failure
      setItems((prev) =>
        prev.map((r) =>
          r.id === responseId ? responses.find((o) => o.id === responseId)! : r
        )
      );
      setLoadingId(null);
      return;
    }

    const body = await res.json().catch(() => null);
    if (body?.counts) {
      setItems((prev) =>
        prev.map((r) =>
          r.id === responseId
            ? {
                ...r,
                counts: body.counts,
                current: feedback,
              }
            : r
        )
      );
    }
    setLoadingId(null);
  };

  return (
    <div className="grid grid-cols-1 gap-6 p-8">
      <div className="bg-white rounded-2xl p-0 space-y-3">
        <h2 className="text-lg font-medium text-slate-900">Themes</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCluster(null)}
            className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
              selectedCluster === null
                ? "border-indigo-200 bg-indigo-50"
                : "border-slate-200 hover:border-indigo-200"
            }`}
          >
            All themes
          </button>
          {themes.map((theme) => (
            <button
              key={theme.cluster_index}
              onClick={() =>
                setSelectedCluster(
                  selectedCluster === theme.cluster_index
                    ? null
                    : theme.cluster_index
                )
              }
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                selectedCluster === theme.cluster_index
                  ? "border-indigo-200 bg-indigo-50"
                  : "border-slate-200 hover:border-indigo-200"
              }`}
            >
              {theme.name || `Theme ${theme.cluster_index}`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="text-slate-600">
            No responses yet. Upload on Listen to get started.
          </div>
        ) : (
          filtered.map((resp) => (
            <div
              key={resp.id}
              className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-white"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border ${
                    resp.tag && tagColors[resp.tag]
                      ? tagColors[resp.tag]
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}
                >
                  {resp.tag ?? "response"}
                </span>
                <span className="text-xs text-slate-500">
                  {resp.counts.agree} agree · {resp.counts.pass} pass ·{" "}
                  {resp.counts.disagree} disagree
                </span>
              </div>

              <p className="text-slate-800 leading-relaxed line-clamp-3">
                {resp.response_text}
              </p>

              <div className="flex gap-2">
                {(["agree", "pass", "disagree"] as Feedback[]).map((fb) => {
                  const active = resp.current === fb;
                  const base =
                    fb === "agree"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : fb === "disagree"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-slate-50 text-slate-700 border-slate-200";
                  return (
                    <button
                      key={fb}
                      disabled={loadingId === resp.id}
                      onClick={() => updateFeedback(resp.id, fb)}
                      className={`flex-1 px-3 py-2 text-sm font-medium border rounded-lg transition ${
                        active
                          ? base
                          : "bg-white text-slate-700 border-slate-200 hover:border-indigo-200"
                      } disabled:opacity-50`}
                    >
                      {fb === "agree" && "Agree"}
                      {fb === "pass" && "Pass"}
                      {fb === "disagree" && "Disagree"}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
