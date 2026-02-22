"use client";

/**
 * Notification Bell
 *
 * Bell icon with unread count badge and dropdown.
 * Marks notifications as read when dropdown opens.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Bell } from "@phosphor-icons/react";
import { useNotifications } from "@/lib/notifications/hooks/useNotifications";
import NotificationDropdown from "./NotificationDropdown";

interface NotificationBellProps {
  userId: string;
}

export default function NotificationBell({ userId }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAllRead, clearAll } =
    useNotifications({
      userId,
    });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      window.addEventListener("click", handleClickOutside);
    }

    return () => {
      window.removeEventListener("click", handleClickOutside);
    };
  }, [isOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Mark as read when dropdown opens
  useEffect(() => {
    if (isOpen && unreadCount > 0) {
      markAllRead();
    }
  }, [isOpen, unreadCount, markAllRead]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleClearAll = useCallback(() => {
    clearAll();
    setIsOpen(false);
  }, [clearAll]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative p-2 hover:bg-slate-100 rounded-md transition"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationDropdown
          notifications={notifications}
          onClearAll={handleClearAll}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
