'use client';

import { ActivitySidebar, ReactionsSidebar } from '@/components/social';
import { useHivePresence } from '@/lib/social/hooks';
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
  // Track presence to get viewer count
  const { activeUsers } = useHivePresence({
    hiveId,
    userId,
    displayName,
    avatarUrl,
  });

  return (
    <aside className="space-y-4">
      <ActivitySidebar hiveId={hiveId} initialActivity={initialActivity} />
      <ReactionsSidebar
        hiveId={hiveId}
        userId={userId}
        viewerCount={activeUsers.length}
        initialReactions={initialReactions}
        onAddReaction={onAddReaction}
      />
    </aside>
  );
}
