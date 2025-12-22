/**
 * Hive Selector Component
 *
 * Presentational dropdown for selecting between user's hives
 * Props-only, no data fetching
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { HiveOption } from "@/types/navbar";

interface HiveSelectorProps {
  hives: HiveOption[];
  currentHiveId?: string;
}

export default function HiveSelector({ hives, currentHiveId }: HiveSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
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

  const currentHive = hives.find((h) => h.id === currentHiveId) || hives[0] || null;
  const displayName = currentHive?.name || "Select hive";
  const initials = (currentHive?.name || "H")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSelect = (hive: HiveOption) => {
    setMenuOpen(false);
    const targetPath = `/hives/${hive.slug || hive.id}`;
    if (pathname !== targetPath) {
      router.push(targetPath);
    }
  };

  if (hives.length === 0) {
    return (
      <div className="flex items-center gap-2 text-body text-slate-600">
        <div className="h-8 w-8 avatar-round bg-slate-100 flex items-center justify-center">
          <span className="text-label">?</span>
        </div>
        <span>No hives</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-50 transition text-body"
      >
        <div className="h-8 w-8 avatar-round bg-indigo-100 text-indigo-800 flex items-center justify-center text-label">
          {initials}
        </div>
        <span className="text-subtitle text-slate-800">{displayName}</span>
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
        <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50">
          <div className="px-3 py-2 text-allcaps text-slate-500">
            Your Hives
          </div>
          <div className="max-h-64 overflow-y-auto">
            {hives.map((hive) => {
              const isSelected = hive.id === currentHiveId;
              const hiveInitials = (hive.name || "H")
                .split(" ")
                .filter(Boolean)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

              return (
                <button
                  key={hive.id}
                  onClick={() => handleSelect(hive)}
                  className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition ${
                    isSelected ? "bg-indigo-50" : ""
                  }`}
                >
                  <div className={`h-8 w-8 avatar-round flex items-center justify-center text-label ${
                    isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}>
                    {hiveInitials}
                  </div>
                  <span className={`text-body ${isSelected ? "text-subtitle text-indigo-600" : "text-slate-700"}`}>
                    {hive.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
