/**
 * User Menu Component
 *
 * Displays user avatar/name with dropdown for account actions
 * Presentational - no auth logic, just UI
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { NavbarUser } from "@/types/navbar";

interface UserMenuProps {
  user: NavbarUser;
}

export default function UserMenu({ user }: UserMenuProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      window.addEventListener("click", handleClickAway);
    }
    return () => window.removeEventListener("click", handleClickAway);
  }, [menuOpen]);

  const baseName =
    user.displayName?.trim() || user.email?.split("@")[0]?.trim() || "User";
  const firstInitial =
    baseName.split(/\s+/).filter(Boolean)[0]?.[0]?.toUpperCase() ?? "U";

  const handleSettings = () => {
    setMenuOpen(false);
    router.push("/settings");
  };

  const handleLogout = () => {
    setMenuOpen(false);
    router.push("/api/auth/logout");
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-50 transition"
      >
        {user.avatarUrl && !avatarError ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user.avatarUrl}
              alt={baseName}
              onError={() => setAvatarError(true)}
              className="h-8 w-8 avatar-round object-cover"
            />
          </>
        ) : (
          <div className="h-8 w-8 avatar-round bg-slate-700 text-white flex items-center justify-center text-label">
            {firstInitial}
          </div>
        )}
        <span className="text-subtitle text-slate-800 max-w-[120px] truncate">
          {baseName}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${menuOpen ? "rotate-180" : ""}`}
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
      </button>

      {menuOpen && (
        <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-subtitle text-slate-800">{user.displayName}</p>
            {user.email && (
              <p className="text-info text-slate-500 truncate">{user.email}</p>
            )}
          </div>
          <button
            onClick={handleSettings}
            className="w-full text-left px-4 py-2 text-body text-slate-700 hover:bg-slate-50 transition flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Account settings
          </button>
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-body text-slate-700 hover:bg-slate-50 transition flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
