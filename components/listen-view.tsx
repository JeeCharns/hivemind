"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import {
  UploadSimple,
  FileCsv,
  ThumbsUp,
  PaperPlaneTilt,
  CaretDown,
} from "@phosphor-icons/react";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import { tagColors } from "./understand-view";

type UploadState =
  | "idle"
  | "file_selected"
  | "uploading"
  | "uploaded_success"
  | "upload_error";

type AnalysisStatus =
  | "not_started"
  | "embedding"
  | "analyzing"
  | "ready"
  | "error";

type LiveResponse = {
  id: number;
  text: string;
  tag: string | null;
  created_at: string;
  user: { name: string; avatar_url: string | null };
  like_count: number;
  liked_by_me: boolean;
};

const TAGS = ["need", "data", "want", "problem", "risk", "proposal"];
const MAX_LEN = 200;

export default function ListenView({
  conversationId,
  hiveId,
  currentUserName = "User",
  initialAnalysisStatus,
}: {
  conversationId: string;
  hiveId: string;
  currentUserName?: string;
  initialAnalysisStatus: AnalysisStatus;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>(
    initialAnalysisStatus
  );
  const [isPending, startTransition] = useTransition();

  const [text, setText] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feed, setFeed] = useState<LiveResponse[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [postAs, setPostAs] = useState<"self" | "anon">("self");
  const [postAsOpen, setPostAsOpen] = useState(false);

  const handleFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = files[0];
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files are supported");
      setFile(null);
      setStatus("idle");
      return;
    }
    setFile(selected);
    setError(null);
    setStatus("file_selected");
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files);
  };

  const upload = async () => {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/conversations/${conversationId}/upload`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed");
      setStatus("upload_error");
      return;
    }

    setStatus("uploaded_success");
    setAnalysisStatus("embedding");

    startTransition(async () => {
      await fetch(`/api/conversations/${conversationId}/analyze`, {
        method: "POST",
      }).catch(() => null);
      setAnalysisStatus("analyzing");
      router.push(
        `/hives/${hiveId}/conversations/${conversationId}/understand`
      );
    });
  };

  const disabled = status === "uploading" || isPending;

  const showSpinner =
    analysisStatus === "embedding" || analysisStatus === "analyzing";

  const remaining = MAX_LEN - text.length;
  const canSubmit = text.trim().length > 0 && !!tag && text.length <= MAX_LEN;

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/responses`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Failed to load feed");
        return;
      }
      const body = await res.json();
      setFeed(body.responses ?? []);
    } finally {
      setLoadingFeed(false);
    }
  }, [conversationId]);

  const submitResponse = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const payload = { text: text.trim(), tag, anonymous: postAs === "anon" };
    const res = await fetch(`/api/conversations/${conversationId}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to submit response");
      setSubmitting(false);
      return;
    }
    const body = await res.json().catch(() => null);
    if (body?.response) {
      setFeed((prev) => [body.response, ...prev]);
    }
    setText("");
    setTag(null);
    setSubmitting(false);
  };

  const toggleLike = async (resp: LiveResponse) => {
    const liked = resp.liked_by_me;
    setFeed((prev) =>
      prev.map((r) =>
        r.id === resp.id
          ? {
              ...r,
              liked_by_me: !liked,
              like_count: liked
                ? Math.max(0, r.like_count - 1)
                : r.like_count + 1,
            }
          : r
      )
    );
    const endpoint = `/api/responses/${resp.id}/like`;
    const res = await fetch(endpoint, {
      method: liked ? "DELETE" : "POST",
    }).catch(() => null);
    if (!res || !res.ok) {
      // revert on failure
      setFeed((prev) =>
        prev.map((r) =>
          r.id === resp.id
            ? {
                ...r,
                liked_by_me: liked,
                like_count: resp.like_count,
              }
            : r
        )
      );
      return;
    }
    const body = await res.json().catch(() => null);
    if (body?.like_count !== undefined) {
      setFeed((prev) =>
        prev.map((r) =>
          r.id === resp.id
            ? {
                ...r,
                liked_by_me: body.liked ?? !liked,
                like_count: body.like_count,
              }
            : r
        )
      );
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    fetchFeed();
  }, [mounted, fetchFeed]);

  useEffect(() => {
    const supabase = supabaseBrowserClient;
    if (!supabase) return;
    const channel = supabase
      .channel(`conversation-${conversationId}-responses`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_responses",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => fetchFeed()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "response_likes",
        },
        () => fetchFeed()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchFeed]);

  const TagButtons = useMemo(
    () =>
      TAGS.map((t) => {
        const active =
          tag === t
            ? tagColors[t] ??
              "bg-slate-100 text-slate-700 border-slate-200 py-0.5"
            : "bg-white text-slate-700 border-slate-200 hover:border-indigo-200 py-0.5";

        return (
          <button
            key={t}
            onClick={() => setTag((prev) => (prev === t ? null : t))}
            className={`px-3 py-0.5 rounded-full text-sm font-medium border transition ${active}`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        );
      }),
    [tag]
  );

  return (
    <div className="pt-6" suppressHydrationWarning>
      {!mounted ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-28 bg-slate-100 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
                  maxLength={MAX_LEN}
                  placeholder="Submit your thoughts, one at a time!"
                  className="w-full h-32 border border-slate-200 rounded-lg p-3 pb-8 text-sm text-slate-900 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                />
                <span className="absolute bottom-2 left-3 text-xs text-slate-500">
                  {remaining} characters left
                </span>
              </div>

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-[#172847]">
                    Tag your response for more clarity
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {TagButtons}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-[#172847]">
                      Post as...
                    </span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setPostAsOpen((o) => !o)}
                        className="w-36 h-9 px-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:border-indigo-200"
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-200 inline-flex items-center justify-center text-[11px] text-slate-600">
                            {postAs === "self"
                              ? (currentUserName[0] ?? "M").toUpperCase()
                              : "A"}
                          </span>
                          <span className="text-[12px] max-w-32 truncate text-left">
                            {postAs === "self" ? currentUserName : "Anonymous"}
                          </span>
                        </span>
                        <CaretDown size={14} className="text-slate-500" />
                      </button>
                      {postAsOpen && (
                        <div className="absolute mt-1 w-40 rounded-lg border border-slate-200 bg-white shadow-sm z-20">
                          {[
                            {
                              key: "self",
                              label: currentUserName,
                              badge:
                                (currentUserName[0] ?? "M").toUpperCase() ||
                                "M",
                            },
                            { key: "anon", label: "Anonymous", badge: "A" },
                          ].map((opt) => (
                            <button
                              key={opt.key}
                              onClick={() => {
                                setPostAs(opt.key as "self" | "anon");
                                setPostAsOpen(false);
                              }}
                              className={`w-full px-3 py-2 flex items-center gap-2 text-left text-sm hover:bg-slate-50 ${
                                postAs === opt.key
                                  ? "text-[#3A1DC8] bg-indigo-50"
                                  : "text-slate-700"
                              }`}
                            >
                              <span className="w-6 h-6 rounded-full bg-slate-200 inline-flex items-center justify-center text-[11px] text-slate-600">
                                {opt.badge}
                              </span>
                              <span className="text-[12px]">{opt.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  disabled={!canSubmit || submitting}
                  onClick={submitResponse}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#3A1DC8] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PaperPlaneTilt size={16} />
                  Submit
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 rounded-xl px-6 py-10 cursor-pointer hover:border-indigo-300 transition"
              >
                <div className="p-3 rounded-full bg-slate-100 text-slate-500">
                  <FileCsv size={28} />
                </div>
                <div className="text-center">
                  <p className="text-slate-900 font-medium">Drag & drop CSV</p>
                  <p className="text-sm text-slate-500">
                    or click to choose a CSV file
                  </p>
                </div>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files)}
                />
              </label>

              <div className="text-sm text-slate-600">
                <p>Requirements:</p>
                <ul className="list-disc list-inside text-slate-500">
                  <li>Must include a column named &quot;response&quot;</li>
                  <li>
                    Optional column: &quot;tag&quot;
                    (data/problem/need/want/risk/proposal)
                  </li>
                  <li>Up to 1000 rows</li>
                </ul>
              </div>

              {file && (
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <UploadSimple size={18} className="text-indigo-600" />
                  <span className="font-medium">{file.name}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={upload}
                  disabled={!file || disabled}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === "uploading" ? "Uploading…" : "Upload & analyze"}
                </button>
              </div>

              {status === "uploaded_success" && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                  Import successful, starting analysis…
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 h-full overflow-y-auto max-h-[calc(100vh-220px)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-slate-900">Live Feed</h3>
              {showSpinner && (
                <span className="inline-block w-4 h-4 aspect-square border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              )}
            </div>

            {loadingFeed ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-16 bg-slate-100 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : feed.length === 0 ? (
              <div className="text-slate-500 text-sm">
                No responses yet. Be the first to share.
              </div>
            ) : (
              <div className="space-y-8">
                {feed.map((resp) => (
                  <div key={resp.id} className=" rounded-lg flex gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {resp.tag && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                              tagColors[resp.tag] ??
                              "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {resp.tag[0].toUpperCase() + resp.tag.slice(1)}
                          </span>
                        )}
                        <span className="text-sm font-medium text-slate-800">
                          {resp.user?.name ?? "Anonymous"}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(resp.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800">{resp.text}</p>
                    </div>
                    <button
                      onClick={() => toggleLike(resp)}
                      className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-md border ${
                        resp.liked_by_me
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-slate-200 text-slate-500 hover:border-indigo-200"
                      }`}
                    >
                      <ThumbsUp
                        size={16}
                        weight={resp.liked_by_me ? "fill" : "regular"}
                      />
                      <span>{resp.like_count}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
