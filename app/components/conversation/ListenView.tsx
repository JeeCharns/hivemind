"use client";

/**
 * ListenView - Listen Tab Client Component
 *
 * Left column: Response composer with textarea, tag chips, and "Post as" dropdown
 * Right column: Live feed of responses with likes
 * Follows SRP: UI only, business logic in useConversationFeed hook
 */

import { useEffect, useMemo, useState, useRef } from "react";
import { ThumbsUp, PaperPlaneTilt, CaretDown } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase/client";
import { getTagColors, LISTEN_TAGS, TAG_LABELS } from "@/lib/conversations/domain/tags";
import type { AnalysisStatus } from "@/types/conversations";
import type { ListenTag, SubmitResponseInput } from "@/lib/conversations/domain/listen.types";
import { useConversationFeed } from "@/lib/conversations/react/useConversationFeed";
import Button from "@/app/components/button";

const MAX_LEN = 500;

export interface ListenViewProps {
  conversationId: string;
  currentUserDisplayName: string;
  initialAnalysisStatus: AnalysisStatus | null;
}

export default function ListenView({
  conversationId,
  currentUserDisplayName,
  initialAnalysisStatus,
}: ListenViewProps) {
  const { feed, isLoadingFeed, isSubmitting, error, submit, toggleLike, refresh } =
    useConversationFeed({ conversationId });

  const [text, setText] = useState("");
  const [tag, setTag] = useState<ListenTag | null>(null);
  const [mounted, setMounted] = useState(false);
  const [postAs, setPostAs] = useState<"self" | "anon">("self");
  const [postAsOpen, setPostAsOpen] = useState(false);
  const postAsRef = useRef<HTMLDivElement | null>(null);

  const displayName = currentUserDisplayName || "User";

  const showSpinner =
    initialAnalysisStatus === "embedding" || initialAnalysisStatus === "analyzing";

  const remaining = MAX_LEN - text.length;
  const canSubmit = text.trim().length > 0 && !!tag && text.length <= MAX_LEN;

  const submitResponse = async () => {
    if (!canSubmit || isSubmitting) return;

    const input: SubmitResponseInput = {
      text: text.trim(),
      tag,
      anonymous: postAs === "anon",
    };

    await submit(input);

    // Clear form on success
    if (!error) {
      setText("");
      setTag(null);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close "Post as" dropdown on click outside
  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (postAsRef.current && !postAsRef.current.contains(e.target as Node)) {
        setPostAsOpen(false);
      }
    };
    if (postAsOpen) {
      window.addEventListener("click", onClickAway);
    }
    return () => window.removeEventListener("click", onClickAway);
  }, [postAsOpen]);

  // Real-time subscription to refresh feed on new responses or likes
  useEffect(() => {
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
        () => refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "response_likes",
        },
        () => refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, refresh]);

  const TagButtons = useMemo(
    () =>
      LISTEN_TAGS.map((t) => {
        const active =
          tag === t
            ? getTagColors(t)
            : "bg-white text-slate-700 border-slate-200 hover:border-indigo-200 py-0.5";

        return (
          <Button
            key={t}
            variant="secondary"
            size="sm"
            onClick={() => setTag((prev) => (prev === t ? null : t))}
            className={`px-3 rounded-full text-sm font-medium border transition ${active}`}
          >
            {TAG_LABELS[t]}
          </Button>
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
          {/* Left column: Composer */}
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
                    <div className="relative" ref={postAsRef}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-36 px-3 justify-between"
                        onClick={() => setPostAsOpen((o) => !o)}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-200 inline-flex items-center justify-center text-[11px] text-slate-600">
                            {postAs === "self"
                              ? (displayName[0] ?? "M").toUpperCase()
                              : "A"}
                          </span>
                          <span className="text-[12px] max-w-32 truncate text-left">
                            {postAs === "self" ? displayName : "Anonymous"}
                          </span>
                        </span>
                        <CaretDown size={14} className="text-slate-500" />
                      </Button>
                      {postAsOpen && (
                        <div className="absolute mt-1 w-40 rounded-lg border border-slate-200 bg-white shadow-sm z-20">
                          {[
                            {
                              key: "self",
                              label: displayName,
                              badge:
                                (displayName[0] ?? "M").toUpperCase() || "M",
                            },
                            { key: "anon", label: "Anonymous", badge: "A" },
                          ].map((opt) => (
                            <Button
                              key={opt.key}
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setPostAs(opt.key as "self" | "anon");
                                setPostAsOpen(false);
                              }}
                              className={`w-full px-3 py-2 justify-start flex items-center gap-2 text-left text-sm hover:bg-slate-50 ${
                                postAs === opt.key
                                  ? "text-[#3A1DC8] bg-indigo-50"
                                  : "text-slate-700"
                              }`}
                            >
                              <span className="w-6 h-6 rounded-full bg-slate-200 inline-flex items-center justify-center text-[11px] text-slate-600">
                                {opt.badge}
                              </span>
                              <span className="text-[12px]">{opt.label}</span>
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  disabled={!canSubmit || isSubmitting}
                  onClick={submitResponse}
                  className="gap-2"
                >
                  <PaperPlaneTilt size={16} />
                  Submit
                </Button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Right column: Live feed */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 h-full overflow-y-auto max-h-[calc(100vh-220px)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-slate-900">Live Feed</h3>
              {showSpinner && (
                <span className="inline-block w-4 h-4 aspect-square border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              )}
            </div>

            {isLoadingFeed ? (
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
                  <div key={resp.id} className="rounded-lg flex gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {resp.tag && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${getTagColors(
                              resp.tag
                            )}`}
                          >
                            {TAG_LABELS[resp.tag] || resp.tag}
                          </span>
                        )}
                        <span className="text-sm font-medium text-slate-800">
                          {resp.user?.name ?? "Anonymous"}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(resp.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800">{resp.text}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => toggleLike(resp.id)}
                      className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-md ${
                        resp.likedByMe
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-slate-200 text-slate-500 hover:border-indigo-200"
                      }`}
                    >
                      <ThumbsUp
                        size={16}
                        weight={resp.likedByMe ? "fill" : "regular"}
                      />
                      <span>{resp.likeCount}</span>
                    </Button>
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
