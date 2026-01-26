/**
 * Mobile Composer Component
 *
 * Fixed bottom bar with expandable drawer for mobile response composition.
 * - Collapsed: Single line input bar fixed at bottom
 * - Expanded: Drawer slides up with full composer (textarea, tags, post-as, submit)
 * - Adaptive height: grows with content up to ~70% viewport
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { PaperPlaneTilt, CaretDown, X } from "@phosphor-icons/react";
import {
  getTagHoverClasses,
  getTagSelectedClasses,
  LISTEN_TAGS,
  TAG_LABELS,
} from "@/lib/conversations/domain/tags";
import type { ListenTag } from "@/lib/conversations/domain/listen.types";
import Button from "@/app/components/button";

const MAX_LEN = 500;

interface MobileComposerProps {
  text: string;
  setText: (text: string) => void;
  tag: ListenTag | null;
  setTag: (tag: ListenTag | null) => void;
  postAs: "self" | "anon";
  setPostAs: (postAs: "self" | "anon") => void;
  displayName: string;
  isDecisionSession: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  error: string | null;
}

export default function MobileComposer({
  text,
  setText,
  tag,
  setTag,
  postAs,
  setPostAs,
  displayName,
  isDecisionSession,
  isSubmitting,
  canSubmit,
  onSubmit,
  error,
}: MobileComposerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [postAsOpen, setPostAsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const postAsRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const remaining = MAX_LEN - text.length;

  // Lock body scroll when drawer is expanded
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isExpanded]);

  // Focus textarea when drawer expands
  useEffect(() => {
    if (isExpanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isExpanded]);

  // Close post-as dropdown on click outside
  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (postAsRef.current && !postAsRef.current.contains(e.target as Node)) {
        setPostAsOpen(false);
      }
    };
    if (postAsOpen) {
      window.addEventListener("click", onClickAway);
    }
    return () => window.removeEventListener("click", onClickAway);
  }, [postAsOpen]);

  const handleSubmit = () => {
    onSubmit();
    // Close drawer after successful submit (when canSubmit becomes false)
    if (canSubmit) {
      setIsExpanded(false);
    }
  };

  const handleBarClick = () => {
    setIsExpanded(true);
  };

  return (
    <>
      {/* Overlay when expanded */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setIsExpanded(false)}
          aria-hidden="true"
        />
      )}

      {/* Fixed bottom bar (collapsed state) */}
      {!isExpanded && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 p-3 safe-area-bottom">
          <button
            type="button"
            onClick={handleBarClick}
            className="w-full flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-left"
          >
            <span className="flex-1 text-body text-slate-500">
              {text || "Share your thoughts..."}
            </span>
            <PaperPlaneTilt size={20} className="text-slate-400 shrink-0" />
          </button>
        </div>
      )}

      {/* Drawer (expanded state) */}
      {isExpanded && (
        <div
          ref={drawerRef}
          className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 rounded-t-2xl shadow-xl max-h-[70vh] flex flex-col safe-area-bottom"
          role="dialog"
          aria-modal="true"
          aria-label="Compose response"
        >
          {/* Drawer handle and close */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto" />
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="absolute right-3 top-3 p-2 text-slate-500 hover:text-slate-700"
              aria-label="Close composer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Composer content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
                maxLength={MAX_LEN}
                placeholder="Submit your thoughts, one at a time!"
                className="w-full min-h-[120px] border border-slate-200 rounded-lg p-3 pb-8 text-body text-slate-900 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
                style={{ height: "auto" }}
              />
              <span className="absolute bottom-2 left-3 text-info text-slate-500">
                {remaining} characters left
              </span>
            </div>

            {/* Tag buttons (non-decision sessions only) */}
            {!isDecisionSession && (
              <div className="space-y-2">
                <span className="text-label text-text-primary">
                  Tag your response (optional)
                </span>
                <div className="flex flex-wrap gap-2">
                  {LISTEN_TAGS.map((t) => {
                    const isSelected = tag === t;
                    const active = isSelected
                      ? getTagSelectedClasses(t)
                      : `bg-white text-slate-700 border-slate-200 py-0.5 ${getTagHoverClasses(t)}`;

                    return (
                      <Button
                        key={t}
                        variant="secondary"
                        size="sm"
                        onClick={() => setTag(tag === t ? null : t)}
                        aria-pressed={isSelected}
                        className={`px-3 rounded-full text-button border transition ${active}`}
                      >
                        {TAG_LABELS[t]}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Post as dropdown */}
            <div className="space-y-2">
              <span className="text-label text-text-primary">Post as...</span>
              <div className="relative" ref={postAsRef}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full px-3 justify-between gap-2"
                  onClick={() => setPostAsOpen((o) => !o)}
                >
                  <span className="w-6 h-6 shrink-0 rounded-full bg-slate-200 inline-flex items-center justify-center text-label-sm text-slate-600">
                    {postAs === "self"
                      ? (displayName[0] ?? "M").toUpperCase()
                      : "A"}
                  </span>
                  <span className="text-label flex-1 truncate text-left">
                    {postAs === "self" ? displayName : "Anonymous"}
                  </span>
                  <CaretDown size={14} className="shrink-0 text-slate-500" />
                </Button>
                {postAsOpen && (
                  <div className="absolute bottom-full mb-1 w-full rounded-lg border border-slate-200 bg-white shadow-sm z-20">
                    {[
                      {
                        key: "self",
                        label: displayName,
                        badge: (displayName[0] ?? "M").toUpperCase() || "M",
                      },
                      { key: "anon", label: "Anonymous", badge: "A" },
                    ].map((opt) => (
                      <Button
                        key={opt.key}
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPostAs(opt.key as "self" | "anon");
                          setPostAsOpen(false);
                        }}
                        className={`w-full px-3 py-2 justify-start flex items-center gap-2 text-left text-body hover:bg-slate-50 ${
                          postAs === opt.key
                            ? "text-brand-primary bg-indigo-50"
                            : "text-slate-700"
                        }`}
                      >
                        <span className="w-6 h-6 rounded-full bg-slate-200 inline-flex items-center justify-center text-label-sm text-slate-600">
                          {opt.badge}
                        </span>
                        <span className="text-label">{opt.label}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Submit button - fixed at bottom of drawer */}
          <div className="p-4 border-t border-slate-100">
            <Button
              disabled={!canSubmit || isSubmitting}
              onClick={handleSubmit}
              className="w-full gap-2"
            >
              <PaperPlaneTilt size={16} />
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
