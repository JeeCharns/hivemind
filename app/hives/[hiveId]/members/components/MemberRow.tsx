/**
 * Member Row Component
 *
 * Presentational component for displaying a single member
 * Follows SRP: only responsible for UI rendering
 * All actions delegated via callbacks
 */

"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import type { HiveMemberRole } from "@/types/members";
import Button from "@/app/components/button";

interface MemberRowProps {
  userId: string;
  name: string;
  role: HiveMemberRole;
  avatarUrl: string | null;
  isOnlyAdmin: boolean;
  onChangeRole: (userId: string, role: HiveMemberRole) => void;
  onRemove: (userId: string) => void;
  isPending?: boolean;
  showActions?: boolean;
}

const ROLE_OPTIONS: HiveMemberRole[] = ["admin", "member"];

export default function MemberRow({
  userId,
  name,
  role,
  avatarUrl,
  isOnlyAdmin,
  onChangeRole,
  onRemove,
  isPending = false,
  showActions = true,
}: MemberRowProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    if (actionsOpen) {
      window.addEventListener("click", handleClickAway);
    }
    return () => window.removeEventListener("click", handleClickAway);
  }, [actionsOpen]);

  const initials = (name || "U")
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-b-0">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="relative h-9 w-9 avatar-round bg-slate-200 overflow-hidden flex items-center justify-center text-sm font-semibold text-slate-700">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={name}
              fill
              sizes="36px"
              className="object-cover"
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>

        {/* Name & Role */}
        <div className="flex flex-col">
          <span className="text-sm font-medium text-slate-900">{name}</span>
          <span className="text-xs text-slate-500 capitalize">{role}</span>
        </div>
      </div>

      {/* Actions Dropdown (admin only) */}
      {showActions && (
        <div className="relative" ref={menuRef}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setActionsOpen(!actionsOpen)}
            disabled={isPending}
          >
            Actions
            <svg
              className={`w-4 h-4 ml-1 transition-transform ${actionsOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </Button>

          {actionsOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-20">
              {/* Header */}
              <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-100 truncate">
                {name}
              </div>

              {/* Change Role Section */}
              <div className="py-1">
                <div className="px-3 py-2 text-xs text-slate-500 uppercase tracking-wide">
                  Change role
                </div>
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={opt === role || isPending}
                    onClick={() => {
                      onChangeRole(userId, opt);
                      setActionsOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed capitalize"
                  >
                    {opt === role ? `✓ Current: ${opt}` : `Set to ${opt}`}
                  </button>
                ))}
              </div>

              {/* Remove Section */}
              <div className="border-t border-slate-100">
                <button
                  type="button"
                  disabled={isOnlyAdmin || isPending}
                  onClick={() => {
                    if (confirm(`Remove ${name} from this hive?`)) {
                      onRemove(userId);
                      setActionsOpen(false);
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={
                    isOnlyAdmin ? "Cannot remove the only admin" : undefined
                  }
                >
                  Remove from hive
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
