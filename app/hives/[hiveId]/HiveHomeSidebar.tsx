"use client";

import { ActivitySidebar } from "@/components/social";
import type { ActivityEvent } from "@/lib/social/types";

interface HiveHomeSidebarProps {
  hiveId: string;
  initialActivity: ActivityEvent[];
}

export function HiveHomeSidebar({
  hiveId,
  initialActivity,
}: HiveHomeSidebarProps) {
  return (
    <aside className="space-y-4">
      <ActivitySidebar hiveId={hiveId} initialActivity={initialActivity} />
    </aside>
  );
}
