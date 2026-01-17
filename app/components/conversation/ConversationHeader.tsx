/**
 * Conversation Header - Client Component
 *
 * Header with tabs and delete action
 * Copies JSX/styling from temp, rebuilds logic with clean separation
 */

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowsClockwise,
  DotsThreeOutlineVertical,
  ExportIcon,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, useTransition } from "react";
import Button from "@/app/components/button";
import Alert from "@/app/components/alert";
import HiveShareInvitePanel from "@/app/hives/components/HiveShareInvitePanel";

interface ConversationHeaderProps {
  conversationId: string;
  hiveKey: string;
  conversationKey: string;
  title: string;
  conversationType?: "understand" | "decide";
  isAdmin?: boolean;
  showRegenerateButton?: boolean;
  isRegenerating?: boolean;
  onRegenerate?: () => void;
}

export default function ConversationHeader({
  conversationId,
  hiveKey,
  conversationKey,
  title,
  conversationType = "understand",
  isAdmin = false,
  showRegenerateButton = false,
  isRegenerating = false,
  onRegenerate,
}: ConversationHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Tab configuration depends on conversation type
  const tabs =
    conversationType === "decide"
      ? [
          { slug: "listen", label: "Listen" },
          { slug: "understand", label: "Understand" },
          { slug: "vote", label: "Vote" },
          { slug: "result", label: "Result" },
        ]
      : [
          { slug: "listen", label: "Listen" },
          { slug: "understand", label: "Understand" },
          { slug: "result", label: "Result" },
        ];

  const basePath = `/hives/${hiveKey}/conversations/${conversationKey}`;

  const activeFromPath = () => {
    const match = tabs.find((tab) => pathname?.includes(`/${tab.slug}`));
    return match?.slug ?? "listen";
  };

  const activeSlug = activeFromPath();

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      window.addEventListener("click", onClickAway);
    }
    return () => window.removeEventListener("click", onClickAway);
  }, [menuOpen]);

  const deleteConversation = async () => {
    setDeleting(true);
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to delete");
        }

        router.push(`/hives/${hiveKey}`);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to delete";
        setError(msg);
        setDeleting(false);
      } finally {
        setConfirmOpen(false);
      }
    });
  };

  const isRegeneratingState = isRegenerating || regenerating;

  const regenerateAnalysis = async () => {
    if (isRegeneratingState) return;

    setError(null);

    if (onRegenerate) {
      onRegenerate();
      return;
    }

    setRegenerating(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "regenerate", strategy: "full" }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to regenerate analysis");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to regenerate analysis";
      setError(msg);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="pt-4 pb-4">
      <div className="mx-auto w-full max-w-7xl px-6 flex flex-col">
        <Link
          href={`/hives/${hiveKey}`}
          className="inline-flex items-center gap-2 text-body-lg text-text-primary hover:text-brand-primary transition-colors"
        >
          <ArrowLeftIcon size={16} weight="bold" className="text-[#989898]" />
          All sessions
        </Link>

        <div className="flex flex-row items-start justify-between gap-6">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <h1 className="text-h2 text-text-primary wrap-break-word">
              {title}
            </h1>
            <div className="relative" ref={menuRef}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-full p-0 text-[#566888]"
                onClick={() => {
                  setMenuOpen((o) => !o);
                  setError(null);
                }}
                aria-label="Conversation actions"
              >
                <DotsThreeOutlineVertical
                  weight="fill"
                  className="h-3 w-3 shrink-0 rotate-90"
                />
              </Button>
              {menuOpen && (
                <div className="absolute left-0 z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg">
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start rounded-lg px-3 py-2 text-left text-body text-text-primary hover:bg-slate-50"
                      onClick={() => {
                        setMenuOpen(false);
                        regenerateAnalysis();
                      }}
                      disabled={isRegeneratingState}
                    >
                      <span className="flex items-center gap-2">
                        <ArrowsClockwise
                          size={16}
                          className={isRegeneratingState ? "animate-spin" : ""}
                        />
                        {isRegeneratingState
                          ? "Regenerating..."
                          : "Regenerate analysis"}
                      </span>
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start rounded-lg px-3 py-2 text-left text-body text-red-600 hover:bg-red-50"
                      onClick={() => {
                        setConfirmOpen(true);
                        setMenuOpen(false);
                      }}
                    >
                      Delete conversation
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-nowrap items-center gap-4 shrink-0">
            <div className="flex items-center gap-1 bg-white border border-white px-1 py-1 rounded-sm">
              {tabs.map((tab) => {
                const isActive = activeSlug === tab.slug;
                return (
                  <Link
                    key={tab.slug}
                    href={`${basePath}/${tab.slug}`}
                    className={`inline-flex h-9 items-center justify-center rounded-sm px-3 text-subtitle transition-colors ${
                      isActive
                        ? "bg-[#EDEFFD] text-brand-primary"
                        : "bg-[#FDFDFD] text-text-tertiary hover:text-brand-primary"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            {showRegenerateButton && onRegenerate && isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="h-11 w-11 p-0 text-[#9498B0] hover:text-[#3A1DC8] disabled:opacity-50"
                onClick={regenerateAnalysis}
                disabled={isRegeneratingState}
                title="Regenerate analysis with new responses"
                aria-label="Regenerate analysis"
              >
                <ArrowsClockwise
                  size={20}
                  className={isRegeneratingState ? "animate-spin" : ""}
                />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-11 gap-2 text-[#9498B0] hover:text-[#3A1DC8]"
              onClick={() => setShareModalOpen(true)}
            >
              <ExportIcon size={16} className="text-inherit" />
              Share
            </Button>
          </div>
        </div>
        {error && (
          <Alert variant="error" className="mt-3">
            {error}
          </Alert>
        )}
      </div>

      {confirmOpen && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md p-6">
            <h3 className="text-h4 text-text-primary mb-2">
              Delete conversation?
            </h3>
            <p className="text-body text-text-muted mb-4">
              Are you sure you want to delete the session? This is a destructive
              action and the session will not be recoverable.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={deleteConversation}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {shareModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-h4 text-text-primary">Share to {title}</h3>
              <button
                onClick={() => setShareModalOpen(false)}
                className="text-slate-500 hover:text-slate-700 transition-colors"
                aria-label="Close"
              >
                <X size={20} weight="bold" />
              </button>
            </div>

            <HiveShareInvitePanel hiveKey={hiveKey} isAdmin={isAdmin} />

            <div className="mt-6 flex justify-end">
              <Button
                variant="secondary"
                onClick={() => setShareModalOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
