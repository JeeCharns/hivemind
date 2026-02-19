'use client';

import {
  PresenceSidebar,
  ActivitySidebar,
  ReactionsSidebar,
} from '@/components/social';
import type { ActivityEvent, Reaction, ReactionEmoji } from '@/lib/social/types';

interface HiveHomeSidebarProps {
  hiveId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  initialActivity: ActivityEvent[];
  initialReactions: Reaction[];
  onAddReaction: (emoji: ReactionEmoji, message?: string) => Promise<void>;
}

export function HiveHomeSidebar({
  hiveId,
  userId,
  displayName,
  avatarUrl,
  initialActivity,
  initialReactions,
  onAddReaction,
}: HiveHomeSidebarProps) {
  return (
    <aside className="space-y-4">
      <PresenceSidebar
        hiveId={hiveId}
        userId={userId}
        displayName={displayName}
        avatarUrl={avatarUrl}
      />
      <ActivitySidebar hiveId={hiveId} initialActivity={initialActivity} />
      <ReactionsSidebar
        hiveId={hiveId}
        initialReactions={initialReactions}
        onAddReaction={onAddReaction}
      />
    </aside>
  );
}
