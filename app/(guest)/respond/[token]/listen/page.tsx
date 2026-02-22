/**
 * Guest Listen Page
 *
 * Client component for the guest Listen tab.
 * Shows the response feed and a composer for submitting anonymous responses.
 * Uses guest API endpoints instead of authenticated ones.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { LiveResponse, ListenTag } from "@/lib/conversations/domain/listen.types";
import {
  fetchGuestResponses,
  submitGuestResponse,
  toggleGuestLike,
} from "@/lib/conversations/guest/guestApiClient";

const TAG_OPTIONS: { value: ListenTag; label: string; colour: string }[] = [
  { value: "need", label: "Need", colour: "bg-blue-100 text-blue-700" },
  { value: "data", label: "Data", colour: "bg-emerald-100 text-emerald-700" },
  { value: "want", label: "Want", colour: "bg-purple-100 text-purple-700" },
  { value: "problem", label: "Problem", colour: "bg-red-100 text-red-700" },
  { value: "risk", label: "Risk", colour: "bg-amber-100 text-amber-700" },
  { value: "proposal", label: "Proposal", colour: "bg-indigo-100 text-indigo-700" },
];

export default function GuestListenPage() {
  const { token } = useParams<{ token: string }>();

  const [feed, setFeed] = useState<LiveResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [tag, setTag] = useState<ListenTag | null>(null);

  const [feedSort, setFeedSort] = useState<"new" | "top">("new");

  const feedRef = useRef<HTMLDivElement>(null);

  // Load initial feed
  const loadFeed = useCallback(async () => {
    try {
      const data = await fetchGuestResponses(token);
      setFeed(data.responses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load responses");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadFeed();
    // Poll for new responses every 10 seconds (guest can't use authenticated realtime)
    const interval = setInterval(loadFeed, 10_000);
    return () => clearInterval(interval);
  }, [loadFeed]);

  // Submit response
  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const data = await submitGuestResponse(token, {
        text: text.trim(),
        tag,
      });
      setFeed((prev) => [data.response, ...prev]);
      setText("");
      setTag(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle like
  const handleLike = async (responseId: string, currentlyLiked: boolean) => {
    try {
      const result = await toggleGuestLike(token, responseId, currentlyLiked);
      setFeed((prev) =>
        prev.map((r) =>
          r.id === responseId
            ? { ...r, likedByMe: result.liked, likeCount: result.like_count }
            : r
        )
      );
    } catch {
      // Silently ignore like errors
    }
  };

  // Sort feed
  const sortedFeed = [...feed].sort((a, b) => {
    if (feedSort === "top") {
      return b.likeCount - a.likeCount;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Composer */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Share your thoughts…"
            maxLength={500}
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-body text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
          />

          {/* Tag selector */}
          <div className="flex flex-wrap gap-1.5">
            {TAG_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTag(tag === opt.value ? null : opt.value)}
                className={`rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors ${
                  tag === opt.value
                    ? opt.colour
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-caption text-text-tertiary">
              Posting as Guest (anonymous)
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!text.trim() || submitting}
              className="inline-flex h-9 items-center rounded-lg bg-brand-primary px-4 text-subtitle text-white hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-body text-red-700">
          {error}
        </div>
      )}

      {/* Sort toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFeedSort("new")}
          className={`text-subtitle transition-colors ${
            feedSort === "new" ? "text-brand-primary" : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          Newest
        </button>
        <span className="text-slate-300">|</span>
        <button
          type="button"
          onClick={() => setFeedSort("top")}
          className={`text-subtitle transition-colors ${
            feedSort === "top" ? "text-brand-primary" : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          Top
        </button>
        <span className="ml-auto text-caption text-text-tertiary">
          {feed.length} response{feed.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Feed */}
      <div ref={feedRef} className="flex flex-col gap-3">
        {loading && feed.length === 0 && (
          <div className="text-center py-12 text-body text-text-tertiary">
            Loading responses…
          </div>
        )}

        {!loading && feed.length === 0 && (
          <div className="text-center py-12 text-body text-text-tertiary">
            No responses yet. Be the first to share your thoughts!
          </div>
        )}

        {sortedFeed.map((response) => (
          <div
            key={response.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              {/* Avatar placeholder */}
              <div className="h-8 w-8 shrink-0 rounded-full bg-slate-200 flex items-center justify-center text-caption font-medium text-slate-500">
                {response.user.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-subtitle text-text-primary">
                    {response.user.name}
                  </span>
                  {response.tag && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-caption text-slate-600">
                      {response.tag}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-body text-text-primary whitespace-pre-wrap break-words">
                  {response.text}
                </p>

                {/* Like button */}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleLike(response.id, response.likedByMe)}
                    className={`inline-flex items-center gap-1 text-caption transition-colors ${
                      response.likedByMe
                        ? "text-brand-primary"
                        : "text-text-tertiary hover:text-brand-primary"
                    }`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill={response.likedByMe ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    <span>{response.likeCount}</span>
                  </button>

                  {response.isMine && (
                    <span className="text-caption text-text-tertiary italic">
                      Your response
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
