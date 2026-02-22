"use client";

import { useState } from "react";
import { PencilSimple, Trash, Check, X } from "@phosphor-icons/react";
import { useHiveReactions } from "@/lib/social/hooks";
import { formatRelativeTimestamp } from "@/lib/formatters";
import ConfirmationModal from "@/app/components/ConfirmationModal";
import type { Reaction, ReactionEmoji } from "@/lib/social/types";

const MAX_MESSAGE_LENGTH = 50;

interface ReactionsSidebarProps {
  hiveId: string;
  userId: string;
  viewerCount?: number;
  initialReactions?: Reaction[];
  onAddReaction: (emoji: ReactionEmoji, message?: string) => Promise<void>;
}

const EMOJI_OPTIONS: ReactionEmoji[] = ["👋", "🎉", "💡", "❤️", "🐝"];

export function ReactionsSidebar({
  hiveId,
  userId,
  viewerCount = 0,
  initialReactions = [],
  onAddReaction,
}: ReactionsSidebarProps) {
  const { reactions, refresh } = useHiveReactions({ hiveId, initialReactions });

  // Add reaction state
  const [showPicker, setShowPicker] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<ReactionEmoji | null>(
    null
  );
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedEmoji) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onAddReaction(selectedEmoji, message || undefined);
      setShowPicker(false);
      setSelectedEmoji(null);
      setMessage("");
      refresh();
    } catch (err) {
      console.error("[ReactionsSidebar] Failed to add reaction:", err);
      setError("Failed to send. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (reactionId: string, currentMessage: string | null) => {
    setEditingId(reactionId);
    setEditText(currentMessage || "");
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditError(null);
  };

  const saveEdit = async (reactionId: string) => {
    if (editText.length > MAX_MESSAGE_LENGTH) return;

    setIsSavingEdit(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/hives/${hiveId}/reactions/${reactionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: editText }),
      });

      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error || "Failed to save changes");
        return;
      }

      refresh();
      cancelEdit();
    } catch {
      setEditError("Failed to save changes");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    setIsDeleting(true);

    try {
      const res = await fetch(`/api/hives/${hiveId}/reactions/${deleteId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        console.error("Delete failed:", data.error);
      }

      refresh();
      setDeleteId(null);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Chat</h3>
        {viewerCount > 0 && (
          <span className="text-xs text-gray-500">
            {viewerCount} {viewerCount === 1 ? "viewer" : "viewers"}
          </span>
        )}
      </div>

      {/* Chat messages list - newest first */}
      <div className="mb-3 space-y-3">
        {reactions.slice(0, 10).map((reaction) => {
          const isMine = reaction.userId === userId;
          const isEditing = editingId === reaction.id;

          return (
            <div key={reaction.id} className="group flex items-start gap-2">
              <span className="text-lg flex-shrink-0">{reaction.emoji}</span>
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  // Edit mode
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) =>
                        setEditText(e.target.value.slice(0, MAX_MESSAGE_LENGTH))
                      }
                      maxLength={MAX_MESSAGE_LENGTH}
                      className="w-full border border-gray-200 rounded-lg p-2 text-sm text-gray-900 focus:border-amber-300 focus:ring-2 focus:ring-amber-100 outline-none resize-none"
                      rows={2}
                      autoFocus
                    />
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400">
                        {MAX_MESSAGE_LENGTH - editText.length} left
                      </span>
                      <div className="flex-1" />
                      {editError && (
                        <span className="text-red-500">{editError}</span>
                      )}
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={isSavingEdit}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(reaction.id)}
                        disabled={isSavingEdit}
                        className="p-1 text-amber-500 hover:text-amber-600 disabled:opacity-50"
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  // Display mode
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {reaction.displayName || "Anonymous"}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatRelativeTimestamp(reaction.createdAt)}
                      </span>
                      {/* Edit/Delete buttons - right-aligned, only for own messages */}
                      {isMine && (
                        <div className="ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              startEdit(reaction.id, reaction.message)
                            }
                            className="p-1 text-gray-400 hover:text-amber-500 rounded"
                            title="Edit"
                          >
                            <PencilSimple size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteId(reaction.id)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded"
                            title="Delete"
                          >
                            <Trash size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    {reaction.message && (
                      <p className="text-sm text-gray-700 mt-0.5">
                        {reaction.message}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        {reactions.length === 0 && (
          <p className="text-sm text-gray-500">Be the first to say hello!</p>
        )}
      </div>

      {/* Add reaction button/picker */}
      {!showPicker ? (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="w-full rounded-lg border border-dashed border-gray-300 p-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600"
        >
          + Add reaction
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-1">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setSelectedEmoji(emoji)}
                className={`rounded-lg p-2 text-xl hover:bg-gray-100 ${
                  selectedEmoji === emoji ? "bg-amber-100" : ""
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a message (optional)"
            maxLength={MAX_MESSAGE_LENGTH}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowPicker(false);
                setSelectedEmoji(null);
                setMessage("");
                setError(null);
              }}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedEmoji || isSubmitting}
              className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {isSubmitting ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      <ConfirmationModal
        isOpen={deleteId !== null}
        title="Delete message?"
        message="This action cannot be undone. Your message will be permanently removed."
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
