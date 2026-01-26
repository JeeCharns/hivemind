/**
 * Mobile Navigation Drawer Component
 *
 * Slide-in drawer from right for mobile navigation
 * Contains: hive name, page links, user section
 */

"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NavbarViewModel, NavbarPage } from "@/types/navbar";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  viewModel: NavbarViewModel;
}

const pages: { id: NavbarPage; label: string; path: string }[] = [
  { id: "home", label: "Home", path: "" },
  { id: "members", label: "Members", path: "/members" },
  { id: "settings", label: "Settings", path: "/settings" },
  { id: "invite", label: "Invite", path: "/invite" },
];

export default function MobileDrawer({ isOpen, onClose, viewModel }: MobileDrawerProps) {
  const { user, hives, currentHive, currentPage } = viewModel;
  const router = useRouter();
  const drawerRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleNavigation = (href: string) => {
    onClose();
    router.push(href);
  };

  const handleLogout = () => {
    onClose();
    router.push("/api/auth/logout");
  };

  const basePath = currentHive
    ? `/hives/${currentHive.slug || currentHive.id}`
    : "/hives";

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed top-0 right-0 z-50 h-full w-[280px] bg-white shadow-xl transform transition-transform duration-300 ease-out flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Header with close button */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          {currentHive ? (
            <span className="text-subtitle text-slate-800 truncate">
              {currentHive.name}
            </span>
          ) : (
            <span className="text-subtitle text-slate-800">Hivemind</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 hover:bg-slate-100 rounded-md transition"
            aria-label="Close menu"
          >
            <svg
              className="w-5 h-5 text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {currentHive ? (
            // Show page links when in a hive
            <>
              {pages.map((page) => {
                const isActive = page.id === currentPage;
                const href = basePath + page.path;
                return (
                  <Link
                    key={page.id}
                    href={href}
                    onClick={() => onClose()}
                    className={`flex items-center px-4 py-3 text-body transition ${
                      isActive
                        ? "bg-indigo-50 text-indigo-600 font-medium"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {page.label}
                  </Link>
                );
              })}

              {/* Hive switcher */}
              {hives.length > 1 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="px-4 pb-2 text-label text-slate-500 uppercase tracking-wide">
                    Switch Hive
                  </p>
                  {hives
                    .filter((h) => h.id !== currentHive.id)
                    .map((hive) => (
                      <Link
                        key={hive.id}
                        href={`/hives/${hive.slug || hive.id}`}
                        onClick={() => onClose()}
                        className="flex items-center gap-3 px-4 py-3 text-body text-slate-700 hover:bg-slate-50 transition"
                      >
                        <span className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-label text-slate-600 shrink-0">
                          {hive.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate">{hive.name}</span>
                      </Link>
                    ))}
                </div>
              )}
            </>
          ) : (
            // Show all hives when not in a hive context
            <>
              <p className="px-4 py-2 text-label text-slate-500 uppercase tracking-wide">
                My Hives
              </p>
              {hives.length > 0 ? (
                hives.map((hive) => (
                  <Link
                    key={hive.id}
                    href={`/hives/${hive.slug || hive.id}`}
                    onClick={() => onClose()}
                    className="flex items-center gap-3 px-4 py-3 text-body text-slate-700 hover:bg-slate-50 transition"
                  >
                    <span className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-label text-slate-600 shrink-0">
                      {hive.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{hive.name}</span>
                  </Link>
                ))
              ) : (
                <p className="px-4 py-3 text-body text-slate-500">
                  No hives yet
                </p>
              )}
            </>
          )}
        </nav>

        {/* User section */}
        {user && (
          <div className="border-t border-slate-100">
            {/* User info */}
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-subtitle text-slate-800">{user.displayName}</p>
              {user.email && (
                <p className="text-info text-slate-500 truncate">{user.email}</p>
              )}
            </div>

            {/* Account actions */}
            <button
              onClick={() => handleNavigation("/settings")}
              className="w-full flex items-center gap-3 px-4 py-3 text-body text-slate-700 hover:bg-slate-50 transition"
            >
              <svg
                className="w-5 h-5 text-slate-400"
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
              className="w-full flex items-center gap-3 px-4 py-3 text-body text-slate-700 hover:bg-slate-50 transition"
            >
              <svg
                className="w-5 h-5 text-slate-400"
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
    </>
  );
}
