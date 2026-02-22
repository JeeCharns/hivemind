"use client";

/**
 * ListenView - Listen Tab Client Component
 *
 * Left column: Response composer with textarea, tag chips, and "Post as" dropdown
 * Right column: Live feed of responses with likes
 * Follows SRP: UI only, business logic in useConversationFeed hook
 *
 * Real-time updates:
 * - Uses broadcast channel for instant response appends (no loading state)
 * - Background sync every 30s ensures eventual consistency
 * - Like updates trigger debounced silent refresh
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ThumbsUp,
  PaperPlaneTilt,
  CaretDown,
  FileText,
  DownloadSimple,
  PencilSimple,
  Trash,
  Check,
  X,
} from "@phosphor-icons/react";
import {
  getTagColors,
  getTagHoverClasses,
  getTagSelectedClasses,
  LISTEN_TAGS,
  TAG_LABELS,
} from "@/lib/conversations/domain/tags";
import type { AnalysisStatus } from "@/types/conversations";
import type {
  ListenTag,
  SubmitResponseInput,
} from "@/lib/conversations/domain/listen.types";
import { useConversationFeed } from "@/lib/conversations/react/useConversationFeed";
import { useConversationFeedRealtime } from "@/lib/conversations/react/useConversationFeedRealtime";
import { useConversationPresence } from "@/lib/conversations/react/useConversationPresence";
import { useAnalysisStatus } from "@/lib/conversations/react/useAnalysisStatus";
import { useIsMobileOrTablet } from "@/lib/hooks/useIsMobile";
import Button from "@/app/components/button";
import MobileComposer from "@/app/components/conversation/MobileComposer";
import ConfirmationModal from "@/app/components/ConfirmationModal";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatRelativeTimestamp } from "@/lib/formatters";

const MAX_LEN = 300;
const THEMES_READY_ALERT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const HIGH_TRAFFIC_VIEWER_THRESHOLD = 50; // Pause realtime when more viewers than this

export interface ListenViewProps {
  conversationId: string;
  currentUserDisplayName: string;
  initialAnalysisStatus: AnalysisStatus | null;
  sourceReportHtml?: string | null;
  sourceReportConversationTitle?: string | null;
  conversationType?: "understand" | "decide";
  sourceConversationId?: string | null;
}

export default function ListenView({
  conversationId,
  currentUserDisplayName,
  initialAnalysisStatus,
  sourceReportConversationTitle,
  conversationType = "understand",
  sourceConversationId,
}: ListenViewProps) {
  const { hiveId: hiveKey, conversationId: conversationKey } = useParams<{
    hiveId: string;
    conversationId: string;
  }>();

  const isMobileOrTablet = useIsMobileOrTablet();

  const {
    feed,
    isLoadingFeed,
    isSubmitting,
    error,
    hasLoadedOnce,
    submit,
    toggleLike,
    appendResponse,
    silentRefresh,
    updateResponseLikeCount,
  } = useConversationFeed({ conversationId });

  const [text, setText] = useState("");
  const [tag, setTag] = useState<ListenTag | null>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [postAs, setPostAs] = useState<"self" | "anon">("self");
  const [postAsOpen, setPostAsOpen] = useState(false);
  const postAsRef = useRef<HTMLDivElement | null>(null);

  // Feed sort filter: 'new' shows newest first, 'top' shows most liked first
  const [feedSort, setFeedSort] = useState<"new" | "top">("new");

  // Edit/delete state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const displayName = currentUserDisplayName || "User";

  // Memoize callbacks for realtime hook to prevent unnecessary re-subscriptions
  const handleNewResponse = useCallback(
    (response: Parameters<typeof appendResponse>[0]) => {
      appendResponse(response);
    },
    [appendResponse]
  );

  // Handle like count updates from broadcast (direct state update, no refetch)
  const handleLikeUpdate = useCallback(
    (responseId: string, likeCount: number) => {
      updateResponseLikeCount(responseId, likeCount);
    },
    [updateResponseLikeCount]
  );

  // Track presence for viewer count (must be before realtime hook to determine paused state)
  const { viewerCount } = useConversationPresence({
    conversationId,
    enabled: hasLoadedOnce,
  });

  // Pause realtime when there are too many viewers (graceful degradation)
  const isHighTraffic = viewerCount > HIGH_TRAFFIC_VIEWER_THRESHOLD;

  // Real-time subscription via broadcast channel (no loading state on updates)
  // Paused when high traffic to reduce connection load
  const { status: realtimeStatus } = useConversationFeedRealtime({
    conversationId,
    enabled: hasLoadedOnce,
    paused: isHighTraffic,
    onNewResponse: handleNewResponse,
    onLikeUpdate: handleLikeUpdate,
  });

  // Background sync every 30 seconds when tab is visible (eventual consistency)
  useEffect(() => {
    if (!hasLoadedOnce) return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        silentRefresh();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [hasLoadedOnce, silentRefresh]);

  // Poll for analysis status
  const { data: statusData } = useAnalysisStatus({
    conversationId,
    enabled: feed.length >= 20,
    interval: 5000,
  });

  const analysisStatus = statusData?.analysisStatus ?? initialAnalysisStatus;
  const analysisUpdatedAt = statusData?.analysisUpdatedAt ?? null;
  const responseCount = statusData?.responseCount ?? feed.length;

  const showSpinner =
    analysisStatus === "embedding" || analysisStatus === "analyzing";

  const remaining = MAX_LEN - text.length;
  const isDecisionSession = conversationType === "decide";
  const canSubmit = text.trim().length > 0 && text.length <= MAX_LEN;

  const submitResponse = async () => {
    if (!canSubmit || isSubmitting) return;

    const input: SubmitResponseInput = {
      text: text.trim(),
      tag: isDecisionSession ? "proposal" : tag,
      anonymous: postAs === "anon",
    };

    await submit(input);

    // Clear form on success
    if (!error) {
      setText("");
      if (!isDecisionSession) {
        setTag(null);
      }
    }
  };

  // Start editing a response
  const startEdit = (responseId: string, currentText: string) => {
    setEditingId(responseId);
    setEditText(currentText);
    setEditError(null);
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditError(null);
  };

  // Save edited response
  const saveEdit = async (responseId: string) => {
    if (!editText.trim() || editText.length > MAX_LEN) return;

    setIsSavingEdit(true);
    setEditError(null);

    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/responses/${responseId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: editText.trim() }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error || "Failed to save changes");
        return;
      }

      // Update local state and close edit mode
      silentRefresh();
      cancelEdit();
    } catch {
      setEditError("Failed to save changes");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete a response
  const confirmDelete = async () => {
    if (!deleteId) return;

    setIsDeleting(true);

    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/responses/${deleteId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const data = await res.json();
        console.error("Delete failed:", data.error);
      }

      // Refresh feed and close modal
      silentRefresh();
      setDeleteId(null);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setIsDeleting(false);
    }
  };

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

  const TagButtons = useMemo(
    () =>
      LISTEN_TAGS.map((t) => {
        const isSelected = tag === t;
        const active = isSelected
          ? getTagSelectedClasses(t)
          : `bg-white text-slate-700 border-slate-200 py-0.5 ${getTagHoverClasses(
              t
            )}`;

        return (
          <Button
            key={t}
            variant="secondary"
            size="sm"
            onClick={() => setTag((prev) => (prev === t ? null : t))}
            aria-pressed={isSelected}
            className={`px-3 rounded-full text-button border transition ${active}`}
          >
            {TAG_LABELS[t]}
          </Button>
        );
      }),
    [tag]
  );

  // Check if analysis was completed recently (within the alert window)
  // Use state to track current time for recency check to avoid impure render function
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Update current time periodically to re-evaluate recency
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const isAnalysisRecent = useMemo(() => {
    if (!analysisUpdatedAt) return false;
    const updatedAt = new Date(analysisUpdatedAt).getTime();
    return currentTime - updatedAt < THEMES_READY_ALERT_WINDOW_MS;
  }, [analysisUpdatedAt, currentTime]);

  // Sort feed based on selected filter
  // 'new' = newest first (default, already sorted from API)
  // 'top' = most liked first (secondary sort by earliest for ties)
  const sortedFeed = useMemo(() => {
    if (feedSort === "new") {
      return feed;
    }
    // Sort by likeCount descending, then by createdAt ascending for ties (earliest first)
    return [...feed].sort((a, b) => {
      if (b.likeCount !== a.likeCount) {
        return b.likeCount - a.likeCount;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [feed, feedSort]);

  // Analysis status pill content
  // Only show "Themes ready" alert if analysis was completed within the last few minutes
  const getStatusPill = () => {
    if (responseCount < 20) return null;

    if (analysisStatus === "ready") {
      // Only show the alert if analysis was completed recently
      if (!isAnalysisRecent) {
        return null;
      }

      return (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-emerald-700 text-subtitle">
              ✓ Themes ready
            </span>
            <span className="text-emerald-600 text-body">
              Your responses have been analyzed
            </span>
          </div>
          <Link
            href={`/hives/${hiveKey}/conversations/${conversationKey}/understand`}
            className="text-emerald-700 hover:text-emerald-800 text-subtitle underline"
          >
            View themes →
          </Link>
        </div>
      );
    }

    if (analysisStatus === "embedding" || analysisStatus === "analyzing") {
      return (
        <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center gap-2">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
          <span className="text-indigo-700 text-body">
            Generating themes... This usually takes 30-60 seconds.
          </span>
        </div>
      );
    }

    return null;
  };

  // Shared feed component for both mobile and desktop
  const FeedContent = (
    <div
      className={`bg-white border border-slate-200 rounded-2xl p-4 md:p-6 h-full overflow-y-auto ${isMobileOrTablet ? "max-h-none" : "max-h-[calc(100vh-220px)]"} space-y-4`}
    >
      {/* High traffic alert - shown when realtime is paused */}
      {realtimeStatus === "paused" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
          <span className="text-amber-600 text-lg leading-none">&#9889;</span>
          <div className="flex-1">
            <p className="text-subtitle text-amber-800">It&apos;s busy here!</p>
            <p className="text-body text-amber-700">
              Live updates paused — the feed refreshes every 30 seconds.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-h4 text-slate-900">Live Feed</h3>
          {viewerCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <span
                className={`w-1.5 h-1.5 rounded-full ${isHighTraffic ? "bg-amber-500" : "bg-emerald-500"}`}
              />
              {viewerCount} viewing
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showSpinner && (
            <span className="inline-block w-4 h-4 aspect-square border-2 border-indigo-200 border-t-indigo-600 spinner-round animate-spin" />
          )}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setFeedSort("new")}
              className={`px-3 py-1 text-label transition-colors ${
                feedSort === "new"
                  ? "bg-indigo-50 text-indigo-700 border-r border-slate-200"
                  : "bg-white text-slate-600 hover:bg-slate-50 border-r border-slate-200"
              }`}
            >
              New
            </button>
            <button
              type="button"
              onClick={() => setFeedSort("top")}
              className={`px-3 py-1 text-label transition-colors ${
                feedSort === "top"
                  ? "bg-indigo-50 text-indigo-700"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Top
            </button>
          </div>
        </div>
      </div>

      {/* Only show skeleton on initial load, not on subsequent refreshes */}
      {isLoadingFeed && !hasLoadedOnce ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 bg-slate-100 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : sortedFeed.length === 0 ? (
        <div className="text-slate-500 text-body">
          No responses yet. Be the first to share.
        </div>
      ) : (
        <div className="space-y-8">
          {sortedFeed.map((resp) => {
            const userName = resp.user?.name ?? "Anonymous";
            const firstInitial = userName.charAt(0).toUpperCase();

            return (
              <div key={resp.id} className="rounded-lg flex gap-3">
                {/* Avatar */}
                <div className="shrink-0">
                  {resp.user?.avatarUrl ? (
                    <img
                      src={resp.user.avatarUrl}
                      alt={userName}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-label font-medium">
                      {firstInitial}
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {resp.tag && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-label border ${getTagColors(
                          resp.tag
                        )}`}
                      >
                        {TAG_LABELS[resp.tag] || resp.tag}
                      </span>
                    )}
                    <span className="text-subtitle text-slate-800">
                      {userName}
                    </span>
                    <span className="text-info text-slate-400">
                      {formatRelativeTimestamp(resp.createdAt)}
                    </span>
                  </div>
                  {/* Inline edit mode or display text */}
                  {editingId === resp.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) =>
                          setEditText(e.target.value.slice(0, MAX_LEN))
                        }
                        maxLength={MAX_LEN}
                        className="w-full border border-slate-200 rounded-lg p-2 text-body text-slate-900 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                        rows={2}
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-info text-slate-500">
                          {MAX_LEN - editText.length} characters left
                        </span>
                        <div className="flex-1" />
                        {editError && (
                          <span className="text-info text-red-600">
                            {editError}
                          </span>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={cancelEdit}
                          disabled={isSavingEdit}
                          className="gap-1"
                        >
                          <X size={14} />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveEdit(resp.id)}
                          disabled={isSavingEdit || !editText.trim()}
                          className="gap-1"
                        >
                          <Check size={14} />
                          {isSavingEdit ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-body text-slate-800">{resp.text}</p>
                  )}
                </div>
                <div className="flex items-start gap-1 shrink-0">
                  {/* Edit/delete buttons for own responses */}
                  {resp.isMine && editingId !== resp.id && (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(resp.id, resp.text)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                        title="Edit"
                      >
                        <PencilSimple size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(resp.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        title="Delete"
                      >
                        <Trash size={16} />
                      </button>
                    </>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => toggleLike(resp.id)}
                    className={`flex items-center gap-1 text-subtitle px-2 py-1 rounded-md ${
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`pt-6 ${isMobileOrTablet ? "pb-20" : ""}`}
      suppressHydrationWarning
    >
      {!mounted ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-28 bg-slate-100 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : isMobileOrTablet ? (
        /* Mobile layout: Feed only + fixed bottom composer */
        <>
          {getStatusPill()}
          {FeedContent}
          <MobileComposer
            text={text}
            setText={setText}
            tag={tag}
            setTag={setTag}
            postAs={postAs}
            setPostAs={setPostAs}
            displayName={displayName}
            isDecisionSession={isDecisionSession}
            isSubmitting={isSubmitting}
            canSubmit={canSubmit}
            onSubmit={submitResponse}
            error={error}
          />
        </>
      ) : (
        /* Desktop layout: Two columns */
        <>
          {getStatusPill()}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column: Composer */}
            <div className="space-y-4">
              {/* Compact document preview for decision sessions */}
              {isDecisionSession && sourceConversationId && (
                <Link
                  href={`#`}
                  className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-3 hover:border-indigo-300 transition group"
                >
                  <div className="shrink-0 w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                    <FileText size={20} className="text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-subtitle text-text-primary truncate">
                      {sourceReportConversationTitle || "Problem Space Report"}
                    </p>
                    <p className="text-info text-text-muted">
                      Reference document
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-indigo-600 hover:text-indigo-700"
                    onClick={(e) => {
                      e.preventDefault();
                      // Download logic will be added
                    }}
                  >
                    <DownloadSimple size={18} weight="bold" />
                  </Button>
                </Link>
              )}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="relative">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        submitResponse();
                      }
                    }}
                    maxLength={MAX_LEN}
                    placeholder="Submit as many thoughts as you can! One at a time"
                    className="w-full h-32 border border-slate-200 rounded-lg p-3 pb-8 text-body text-slate-900 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                  />
                  <span className="absolute bottom-2 left-3 text-info text-slate-500">
                    {remaining} characters left
                  </span>
                </div>

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {!isDecisionSession && (
                    <div className="flex flex-col gap-1">
                      <span className="text-label text-text-primary">
                        Tag your response (optional)
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {TagButtons}
                      </div>
                    </div>
                  )}

                  <div
                    className={`flex items-center gap-4 ${isDecisionSession ? "w-full lg:w-auto" : ""}`}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-label text-text-primary">
                        Post as...
                      </span>
                      <div className="relative" ref={postAsRef}>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="w-36 px-3 justify-between gap-2"
                          onClick={() => setPostAsOpen((o) => !o)}
                        >
                          <span className="w-6 h-6 shrink-0 rounded-full bg-slate-200 inline-flex items-center justify-center text-label-sm text-slate-600">
                            {postAs === "self"
                              ? (displayName[0] ?? "M").toUpperCase()
                              : "A"}
                          </span>
                          <span className="text-label flex-1 truncate text-left">
                            {postAs === "self" ? displayName : "Anonymous"}
                          </span>
                          <CaretDown
                            size={14}
                            className="shrink-0 text-slate-500"
                          />
                        </Button>
                        {postAsOpen && (
                          <div className="absolute mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-sm z-20">
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
                                className={`w-full px-3 py-2 justify-start flex items-center gap-2 text-left text-body hover:bg-slate-50 ${
                                  postAs === opt.key
                                    ? "text-brand-primary bg-indigo-50"
                                    : "text-slate-700"
                                }`}
                              >
                                <span className="w-6 h-6 rounded-full bg-slate-200 inline-flex items-center justify-center text-label-sm text-slate-600">
                                  {opt.badge}
                                </span>
                                <span className="text-label">{opt.label}</span>
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end items-center gap-3">
                  <span className="text-xs text-slate-400">
                    {typeof navigator !== "undefined" &&
                    navigator.platform?.toLowerCase().includes("mac")
                      ? "⌘ Enter"
                      : "Ctrl + Enter"}
                  </span>
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
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* Right column: Live feed */}
            {FeedContent}
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      <ConfirmationModal
        isOpen={deleteId !== null}
        title="Delete response?"
        message="This action cannot be undone. Your response will be permanently removed."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
        isLoading={isDeleting}
        variant="danger"
      />
    </div>
  );
}
