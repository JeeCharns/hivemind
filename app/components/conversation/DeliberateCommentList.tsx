"use client";

/**
 * DeliberateCommentList - Client Component
 *
 * Comment list with add/delete functionality for deliberate statements
 * Supports anonymous commenting with vote labels and filtering
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { DeliberateComment, VoteValue } from "@/types/deliberate-space";
import { VOTE_LABELS } from "@/types/deliberate-space";
import {
  PaperPlaneTilt,
  Trash,
  User,
  CaretDown,
  PencilSimple,
  Flag,
  Check,
  X,
} from "@phosphor-icons/react";
import ModerationFlagMenu from "@/app/components/conversation/ModerationFlagMenu";
import type { ModerationFlag } from "@/types/moderation";

/** Get colour class for vote value */
function getVoteColor(vote: VoteValue): string {
  switch (vote) {
    case 5:
      return "text-emerald-600";
    case 4:
      return "text-green-500";
    case 3:
      return "text-amber-500";
    case 2:
      return "text-orange-500";
    case 1:
      return "text-red-500";
    default:
      return "text-slate-500";
  }
}

/** Filter option type */
type FilterOption = "all" | VoteValue;

/** Format a timestamp as a relative time string */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "just now";
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return "yesterday";
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

interface DeliberateCommentListProps {
  statementId: string;
  conversationId: string;
  /** When true, the comment input is disabled (e.g., user hasn't voted yet) */
  disabled?: boolean;
  /** Whether the current user is an admin (can moderate comments) */
  isAdmin?: boolean;
}

export default function DeliberateCommentList({
  statementId,
  conversationId,
  disabled = false,
  isAdmin = false,
}: DeliberateCommentListProps) {
  const [comments, setComments] = useState<DeliberateComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterOption>("all");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Moderation state
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [isModerating, setIsModerating] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isDropdownOpen]);

  // Calculate vote counts for filter dropdown
  const voteCounts = useMemo(() => {
    const counts: Record<VoteValue | "none", number> = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
      none: 0,
    };
    for (const comment of comments) {
      if (comment.userVote !== null) {
        counts[comment.userVote]++;
      } else {
        counts.none++;
      }
    }
    return counts;
  }, [comments]);

  // Filter comments based on selected filter
  const filteredComments = useMemo(() => {
    if (filter === "all") return comments;
    return comments.filter((c) => c.userVote === filter);
  }, [comments, filter]);

  useEffect(() => {
    async function fetchComments() {
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/deliberate/statements/${statementId}/comments`
        );
        if (response.ok) {
          const data = await response.json();
          setComments(data.comments || []);
        }
      } catch (error) {
        console.error("[DeliberateCommentList] Failed to fetch comments:", error);
      } finally {
        setIsLoading(false);
      }
    }
    setIsLoading(true);
    fetchComments();
  }, [conversationId, statementId]);

  const handleSubmit = useCallback(async () => {
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/deliberate/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            statementId,
            text: newComment.trim(),
            isAnonymous,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[DeliberateCommentList] POST failed:", response.status, errorData);
        setError(errorData.error || "Failed to post comment");
        return;
      }

      setNewComment("");

      // Refetch comments
      const refreshResponse = await fetch(
        `/api/conversations/${conversationId}/deliberate/statements/${statementId}/comments`
      );
      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        setComments(data.comments || []);
      } else {
        console.error("[DeliberateCommentList] Refresh failed:", refreshResponse.status);
      }
    } catch (err) {
      console.error("[DeliberateCommentList] Failed to post comment:", err);
      setError("Failed to post comment");
    } finally {
      setIsSubmitting(false);
    }
  }, [conversationId, statementId, newComment, isAnonymous, isSubmitting]);

  const handleDelete = useCallback(
    async (commentId: string) => {
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/deliberate/comments?commentId=${commentId}`,
          { method: "DELETE" }
        );
        if (response.ok) {
          setComments((prev) => prev.filter((c) => c.id !== commentId));
        }
      } catch (error) {
        console.error("[DeliberateCommentList] Failed to delete comment:", error);
      }
    },
    [conversationId]
  );

  const startEdit = useCallback((commentId: string, currentText: string) => {
    setEditingId(commentId);
    setEditText(currentText);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText("");
  }, []);

  const handleSaveEdit = useCallback(
    async (commentId: string) => {
      if (!editText.trim() || isSavingEdit) return;

      setIsSavingEdit(true);
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/deliberate/comments`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              commentId: parseInt(commentId, 10),
              text: editText.trim(),
            }),
          }
        );

        if (response.ok) {
          setComments((prev) =>
            prev.map((c) =>
              c.id === commentId ? { ...c, text: editText.trim() } : c
            )
          );
          setEditingId(null);
          setEditText("");
        }
      } catch (error) {
        console.error("[DeliberateCommentList] Failed to edit comment:", error);
      } finally {
        setIsSavingEdit(false);
      }
    },
    [conversationId, editText, isSavingEdit]
  );

  const handleModerate = useCallback(
    async (commentId: string, flag: ModerationFlag) => {
      setIsModerating(true);
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/deliberate/comments/${commentId}/moderate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ flag }),
          }
        );

        if (response.ok) {
          // Remove the moderated comment from the list
          setComments((prev) => prev.filter((c) => c.id !== commentId));
        }
      } catch (error) {
        console.error("[DeliberateCommentList] Failed to moderate comment:", error);
      } finally {
        setIsModerating(false);
        setModeratingId(null);
      }
    },
    [conversationId]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-label font-medium text-text-secondary">
          Comments ({comments.length})
        </h4>

        {/* Filter dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-text-secondary border border-border-secondary rounded-lg hover:bg-surface-secondary"
          >
            {filter === "all" ? "All" : VOTE_LABELS[filter]}
            <CaretDown size={14} />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-1 w-52 bg-white border border-border-secondary rounded-lg shadow-lg z-20">
              <button
                type="button"
                onClick={() => {
                  setFilter("all");
                  setIsDropdownOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary flex justify-between ${
                  filter === "all" ? "bg-surface-secondary font-medium" : ""
                }`}
              >
                <span>All</span>
                <span className="text-text-tertiary">{comments.length}</span>
              </button>
              {([5, 4, 3, 2, 1] as VoteValue[]).map((vote) => (
                <button
                  key={vote}
                  type="button"
                  onClick={() => {
                    setFilter(vote);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary flex justify-between ${
                    filter === vote ? "bg-surface-secondary font-medium" : ""
                  }`}
                >
                  <span className={getVoteColor(vote)}>{VOTE_LABELS[vote]}</span>
                  <span className="text-text-tertiary">{voteCounts[vote]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={
              disabled
                ? "Vote on the statement to leave a comment"
                : "Why did you give that result?"
            }
            disabled={disabled}
            className={`flex-1 px-3 py-2 rounded-lg border border-border-secondary focus:border-brand-primary focus:outline-none text-body ${
              disabled ? "bg-slate-50 text-slate-400 cursor-not-allowed" : ""
            }`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !disabled) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || !newComment.trim() || isSubmitting}
            className="px-4 py-2 rounded-lg bg-brand-primary text-white disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send comment"
          >
            <PaperPlaneTilt size={16} />
          </button>
        </div>
        {!disabled && (
          <label className="flex items-center gap-2 text-info text-text-tertiary">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="rounded"
            />
            Post anonymously
          </label>
        )}
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>

      {isLoading ? (
        <p className="text-info text-text-tertiary">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-info text-text-tertiary">No comments yet</p>
      ) : filteredComments.length === 0 ? (
        <p className="text-info text-text-tertiary">No comments with this vote</p>
      ) : (
        <div className="space-y-2">
          {filteredComments.map((comment) => (
            <div
              key={comment.id}
              className="group py-2 px-0"
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {comment.user.avatarUrl ? (
                    <img
                      src={comment.user.avatarUrl}
                      alt={comment.user.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                      <User size={16} className="text-slate-500" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-label font-medium text-text-primary">
                        {comment.user.name}
                      </span>
                      {comment.userVote && (
                        <span
                          className={`text-info font-medium ${getVoteColor(comment.userVote)}`}
                        >
                          {VOTE_LABELS[comment.userVote]}
                        </span>
                      )}
                      <span className="text-info text-text-tertiary">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>

                    {/* Action buttons - visible on hover only */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Edit button - for own comments */}
                      {comment.isMine && editingId !== comment.id && (
                        <button
                          type="button"
                          onClick={() => startEdit(comment.id, comment.text)}
                          className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                          title="Edit"
                        >
                          <PencilSimple size={16} />
                        </button>
                      )}

                      {/* Delete button - for own comments */}
                      {comment.isMine && editingId !== comment.id && (
                        <button
                          type="button"
                          onClick={() => handleDelete(comment.id)}
                          className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                          title="Delete"
                        >
                          <Trash size={16} />
                        </button>
                      )}

                      {/* Moderate button - for admins */}
                      {isAdmin && editingId !== comment.id && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setModeratingId(
                                moderatingId === comment.id ? null : comment.id
                              )
                            }
                            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition"
                            title="Moderate"
                          >
                            <Flag size={16} />
                          </button>
                          <ModerationFlagMenu
                            isOpen={moderatingId === comment.id}
                            onClose={() => setModeratingId(null)}
                            onSelect={(flag) => handleModerate(comment.id, flag)}
                            isLoading={isModerating}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Comment text or edit form */}
                  {editingId === comment.id ? (
                    <div className="mt-2 space-y-2">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border-secondary focus:border-brand-primary focus:outline-none text-body"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSaveEdit(comment.id);
                          } else if (e.key === "Escape") {
                            cancelEdit();
                          }
                        }}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(comment.id)}
                          disabled={isSavingEdit || !editText.trim()}
                          className="flex items-center gap-1 px-3 py-1 text-sm bg-brand-primary text-white rounded-lg disabled:opacity-50"
                        >
                          <Check size={14} />
                          {isSavingEdit ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="flex items-center gap-1 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                          <X size={14} />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-body text-text-secondary mt-0.5">
                      {comment.text}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
