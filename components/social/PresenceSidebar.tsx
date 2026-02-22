"use client";

import Image from "next/image";
import { useHivePresence } from "@/lib/social/hooks";
import type { PresenceUser } from "@/lib/social/types";

interface PresenceSidebarProps {
  hiveId: string;
  userId: string;
  displayName?: string;
  avatarUrl?: string | null;
}

function UserAvatar({ user }: { user: PresenceUser }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={user.displayName}
            width={32}
            height={32}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
            {user.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
      </div>
      <span className="text-sm text-gray-700">{user.displayName}</span>
    </div>
  );
}

export function PresenceSidebar({
  hiveId,
  userId,
  displayName,
  avatarUrl,
}: PresenceSidebarProps) {
  const { activeUsers, status } = useHivePresence({
    hiveId,
    userId,
    displayName,
    avatarUrl,
  });

  const visibleUsers = activeUsers.slice(0, 4);
  const overflowCount = Math.max(0, activeUsers.length - 4);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">
        Who&apos;s here
      </h3>

      {status === "connecting" && (
        <p className="text-sm text-gray-500">Connecting...</p>
      )}

      {status === "connected" && activeUsers.length === 0 && (
        <p className="text-sm text-gray-500">Just you for now</p>
      )}

      <div className="space-y-2">
        {visibleUsers.map((user) => (
          <UserAvatar key={user.userId} user={user} />
        ))}
      </div>

      {overflowCount > 0 && (
        <p className="mt-2 text-sm text-gray-500">and {overflowCount} others</p>
      )}
    </div>
  );
}
