/**
 * Page Selector Component
 *
 * Navigation within a hive (home, members, settings, invite)
 * Presentational dropdown - receives current page, renders links
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NavbarPage } from "@/types/navbar";
import LeaveHiveButton from "./LeaveHiveButton";

interface PageSelectorProps {
  hiveId: string;
  hiveSlug?: string | null;
  hiveName?: string;
  currentPage?: NavbarPage;
  isAdmin?: boolean;
}

const allPages = [
  { id: "home" as NavbarPage, label: "home", path: "", adminOnly: false },
  { id: "members" as NavbarPage, label: "members", path: "/members", adminOnly: false },
  { id: "settings" as NavbarPage, label: "settings", path: "/settings", adminOnly: true },
  { id: "invite" as NavbarPage, label: "invite", path: "/invite", adminOnly: false },
];

export default function PageSelector({ hiveId, hiveSlug, hiveName, currentPage, isAdmin = false }: PageSelectorProps) {
  const pathname = usePathname();
  const baseKey = hiveSlug || hiveId;
  const basePath = `/hives/${baseKey}`;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const pages = allPages.filter((p) => !p.adminOnly || isAdmin);

  const pageFromPathname = pages.find((p) => {
    const fullPath = basePath + p.path;
    if (p.path === "") {
      return pathname === fullPath || pathname === fullPath + "/";
    }
    return pathname === fullPath || pathname === fullPath + "/" || pathname.startsWith(fullPath + "/");
  })?.id;

  // Prefer URL-derived page so server defaults don't mask the current route
  const activePage = pageFromPathname ?? currentPage ?? "home";

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

  const activeLabel = pages.find((p) => p.id === activePage)?.label ?? "Home";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-50 transition text-body"
      >
        <span className="text-subtitle text-slate-800">{activeLabel}</span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${menuOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50">
          {pages.map((page) => {
            const isActive = page.id === activePage;
            const href = basePath + page.path;
            return (
              <Link
                key={page.id}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`w-full text-left px-4 py-2 text-body hover:bg-slate-50 transition flex items-center gap-2 ${
                  isActive ? "bg-indigo-50 text-indigo-600 text-subtitle" : "text-slate-700"
                }`}
              >
                {page.label}
              </Link>
            );
          })}

          {/* Divider */}
          <div className="my-2 border-t border-slate-200" />

          {/* Leave Hive Button */}
          <LeaveHiveButton
            hiveId={hiveId}
            hiveName={hiveName || "this hive"}
            onMenuClose={() => setMenuOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
