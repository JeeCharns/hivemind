'use client';

import { useState } from 'react';
import { useHiveReactions } from '@/lib/social/hooks';
import { formatRelativeTimestamp } from '@/lib/formatters';
import type { Reaction, ReactionEmoji } from '@/lib/social/types';

interface ReactionsSidebarProps {
  hiveId: string;
  initialReactions?: Reaction[];
  onAddReaction: (emoji: ReactionEmoji, message?: string) => Promise<void>;
}

const EMOJI_OPTIONS: ReactionEmoji[] = ['👋', '🎉', '💡', '❤️', '🐝'];

export function ReactionsSidebar({
  hiveId,
  initialReactions = [],
  onAddReaction,
}: ReactionsSidebarProps) {
  const { reactions } = useHiveReactions({ hiveId, initialReactions });
  const [showPicker, setShowPicker] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<ReactionEmoji | null>(null);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedEmoji) return;

    setIsSubmitting(true);
    try {
      await onAddReaction(selectedEmoji, message || undefined);
      setShowPicker(false);
      setSelectedEmoji(null);
      setMessage('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Chat</h3>

      {/* Chat messages list - newest first */}
      <div className="mb-3 space-y-3">
        {reactions.slice(0, 5).map((reaction) => (
          <div key={reaction.id} className="flex items-start gap-2">
            <span className="text-lg">{reaction.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">
                  {reaction.displayName || 'Anonymous'}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatRelativeTimestamp(reaction.createdAt)}
                </span>
              </div>
              {reaction.message && (
                <p className="text-sm text-gray-700 mt-0.5">{reaction.message}</p>
              )}
            </div>
          </div>
        ))}
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
                  selectedEmoji === emoji ? 'bg-amber-100' : ''
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
            maxLength={50}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowPicker(false);
                setSelectedEmoji(null);
                setMessage('');
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
              {isSubmitting ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
