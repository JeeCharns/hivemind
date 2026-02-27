/**
 * ModerationFlagMenu - Popover menu for selecting moderation flags
 *
 * Displays 5 flag options as icon buttons
 * Triggers onSelect callback when a flag is chosen
 */

"use client";

import { useEffect, useRef } from "react";
import {
  MODERATION_FLAGS,
  MODERATION_FLAG_LABELS,
  type ModerationFlag,
} from "@/types/moderation";

interface ModerationFlagMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (flag: ModerationFlag) => void;
  isLoading?: boolean;
}

export default function ModerationFlagMenu({
  isOpen,
  onClose,
  onSelect,
  isLoading = false,
}: ModerationFlagMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-3 flex gap-2"
    >
      {MODERATION_FLAGS.map((flag) => {
        const { emoji, label } = MODERATION_FLAG_LABELS[flag];
        return (
          <button
            key={flag}
            type="button"
            onClick={() => onSelect(flag)}
            disabled={isLoading}
            className="flex flex-col items-center gap-1 px-2 py-1.5 hover:bg-slate-100 rounded transition disabled:opacity-50"
          >
            <span className="text-xl">{emoji}</span>
            <span className="text-xs text-slate-600">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
