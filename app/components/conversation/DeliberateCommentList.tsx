"use client";

/**
 * DeliberateCommentList - Client Component
 *
 * Comment list with add/delete functionality for deliberate statements
 * Supports anonymous commenting
 */

import { useState, useEffect, useCallback } from "react";
import type { DeliberateComment } from "@/types/deliberate-space";
import { PaperPlaneTilt, Trash } from "@phosphor-icons/react";

interface DeliberateCommentListProps {
  statementId: string;
  conversationId: string;
  /** When true, the comment input is disabled (e.g., user hasn't voted yet) */
  disabled?: boolean;
}

export default function DeliberateCommentList({
  statementId,
  conversationId,
  disabled = false,
}: DeliberateCommentListProps) {
  const [comments, setComments] = useState<DeliberateComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <h4 className="text-label font-medium text-text-secondary">
        Comments ({comments.length})
      </h4>

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
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="p-3 rounded-lg bg-surface-secondary">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-label font-medium text-text-primary">
                    {comment.user.name}
                  </span>
                  <span className="text-info text-text-tertiary">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {comment.isMine && (
                  <button
                    type="button"
                    onClick={() => handleDelete(comment.id)}
                    className="text-text-tertiary hover:text-red-500"
                    aria-label="Delete comment"
                  >
                    <Trash size={16} />
                  </button>
                )}
              </div>
              <p className="text-body text-text-secondary">{comment.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
