"use client";

import { useState } from "react";
import { useHiveActivity } from "@/lib/social/hooks";
import type { ActivityEvent, ActivityEventMetadata } from "@/lib/social/types";
import { formatRelativeTimestamp } from "@/lib/formatters";

const INITIAL_LIMIT = 3;

interface ActivitySidebarProps {
  hiveId: string;
  initialActivity?: ActivityEvent[];
}

function getActivityText(event: ActivityEvent): string {
  const meta = event.metadata as ActivityEventMetadata;
  const title = meta.conversationTitle
    ? `'${meta.conversationTitle}'`
    : "a conversation";

  switch (event.eventType) {
    case "join":
      return "Someone joined";
    case "conversation_created":
      return `New conversation: ${title}`;
    case "analysis_complete":
      return `Analysis complete for ${title}`;
    case "report_generated":
      return `Report generated for ${title}`;
    case "round_closed":
      return `Voting closed for ${title}`;
    default:
      return "Activity";
  }
}

export function ActivitySidebar({
  hiveId,
  initialActivity = [],
}: ActivitySidebarProps) {
  const { activity } = useHiveActivity({ hiveId, initialActivity });
  const [showAll, setShowAll] = useState(false);

  const visibleActivity = showAll ? activity : activity.slice(0, INITIAL_LIMIT);
  const hasMore = activity.length > INITIAL_LIMIT;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Activity</h3>

      {activity.length === 0 && (
        <p className="text-sm text-gray-500">No recent activity</p>
      )}

      <div className="space-y-2">
        {visibleActivity.map((event) => (
          <div
            key={event.id}
            className="flex items-start justify-between gap-2"
          >
            <p className="text-sm text-gray-700">{getActivityText(event)}</p>
            <span className="shrink-0 text-xs text-gray-400">
              {formatRelativeTimestamp(event.createdAt)}
            </span>
          </div>
        ))}
      </div>

      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-sm text-amber-600 hover:text-amber-700"
        >
          Load more
        </button>
      )}
    </div>
  );
}
