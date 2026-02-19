'use client';

/**
 * Notification Dropdown
 *
 * Dropdown list showing recent notifications with click navigation.
 * Memoized to prevent unnecessary re-renders.
 */

import { memo } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  ChatCircle,
  ChartBar,
  FileText,
  Heart,
  Trash,
} from '@phosphor-icons/react';
import type { Notification, NotificationType } from '@/lib/notifications/domain/notification.types';

interface NotificationDropdownProps {
  notifications: Notification[];
  onClearAll: () => void;
  onClose: () => void;
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'new_conversation':
      return <ChatCircle className="w-4 h-4 text-blue-500" weight="fill" />;
    case 'analysis_complete':
      return <ChartBar className="w-4 h-4 text-green-500" weight="fill" />;
    case 'report_generated':
      return <FileText className="w-4 h-4 text-purple-500" weight="fill" />;
    case 'opinion_liked':
      return <Heart className="w-4 h-4 text-red-500" weight="fill" />;
    default:
      return <ChatCircle className="w-4 h-4 text-slate-500" />;
  }
}

export default memo(function NotificationDropdown({
  notifications,
  onClearAll,
  onClose,
}: NotificationDropdownProps) {
  const router = useRouter();

  const handleNotificationClick = (notification: Notification) => {
    router.push(notification.linkPath);
    onClose();
  };

  return (
    <div
      className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-50"
      role="menu"
      aria-label="Notifications"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-medium text-slate-900">Notifications</h3>
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <Trash className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Notification list */}
      <div className="max-h-96 overflow-y-auto" role="list">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500">
            No notifications
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              role="listitem"
              onClick={() => handleNotificationClick(notification)}
              className={`w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-50 last:border-b-0 flex gap-3 ${
                !notification.readAt ? 'bg-blue-50/50' : ''
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getNotificationIcon(notification.type as NotificationType)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {notification.title}
                </p>
                {notification.body && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {notification.body}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                </p>
              </div>
              {!notification.readAt && (
                <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-1.5" aria-hidden="true" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
});
