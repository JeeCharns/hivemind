'use client';

import { useHiveActivity } from '@/lib/social/hooks';
import type { ActivityEvent } from '@/lib/social/types';
import { formatRelativeTimestamp } from '@/lib/formatters';

interface ActivitySidebarProps {
  hiveId: string;
  initialActivity?: ActivityEvent[];
}

function getActivityText(event: ActivityEvent): string {
  switch (event.eventType) {
    case 'join':
      return 'Someone joined';
    case 'response':
      return 'Someone shared an idea';
    case 'vote':
      return '+1 vote';
    case 'phase_change':
      return (event.metadata as { message?: string })?.message || 'Phase changed';
    default:
      return 'Activity';
  }
}

export function ActivitySidebar({
  hiveId,
  initialActivity = [],
}: ActivitySidebarProps) {
  const { activity } = useHiveActivity({ hiveId, initialActivity });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Activity</h3>

      {activity.length === 0 && (
        <p className="text-sm text-gray-500">No recent activity</p>
      )}

      <div className="space-y-2">
        {activity.map((event) => (
          <div key={event.id} className="flex items-start justify-between gap-2">
            <p className="text-sm text-gray-700">{getActivityText(event)}</p>
            <span className="shrink-0 text-xs text-gray-400">
              {formatRelativeTimestamp(event.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
