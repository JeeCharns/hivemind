/**
 * Moderation Types
 *
 * Types for response moderation feature
 */

export const MODERATION_FLAGS = [
  'antisocial',
  'misleading',
  'illegal',
  'spam',
  'doxing',
] as const;

export type ModerationFlag = (typeof MODERATION_FLAGS)[number];

export const MODERATION_FLAG_LABELS: Record<ModerationFlag, { emoji: string; label: string }> = {
  antisocial: { emoji: '🤬', label: 'Antisocial' },
  misleading: { emoji: '🤥', label: 'Misleading' },
  illegal: { emoji: '🚩', label: 'Illegal' },
  spam: { emoji: '🗑️', label: 'Spam' },
  doxing: { emoji: '🔏', label: 'Doxing' },
};

export type ModerationAction = 'moderated' | 'reinstated';

export interface ModerationLogEntry {
  id: number;
  responseId: number;
  responseText: string;
  action: ModerationAction;
  flag: ModerationFlag;
  performedBy: {
    id: string;
    name: string;
  };
  performedAt: string;
}

export interface ModerationHistoryResponse {
  history: ModerationLogEntry[];
}

export interface ModerateRequestBody {
  flag: ModerationFlag;
}
