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
  DotsThreeOutlineVertical,
  ExportIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, useTransition } from "react";
import Button from "@/app/components/button";
import Alert from "@/app/components/alert";

interface ConversationHeaderProps {
  conversationId: string;
  hiveKey: string;
  conversationKey: string;
  title: string;
}

export default function ConversationHeader({
  conversationId,
  hiveKey,
  conversationKey,
  title,
}: ConversationHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const tabs = [
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

        router.push("/hives");
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

  return (
    <div className="pt-4">
      <div className="mx-auto w-full max-w-7xl px-6 flex flex-col">
        <Link
          href={`/hives/${hiveKey}`}
          className="inline-flex items-center gap-2 text-base leading-[22px] font-normal text-[#172847] hover:text-[#3A1DC8] transition-colors"
        >
          <ArrowLeftIcon size={16} weight="bold" className="text-[#989898]" />
          All sessions
        </Link>

        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-[24px] leading-[31px] font-medium text-[#172847]">
              {title}
            </h1>
            <div className="relative" ref={menuRef}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-8 h-8 rounded-full text-[#566888] p-0"
                onClick={() => {
                  setMenuOpen((o) => !o);
                  setError(null);
                }}
                aria-label="Conversation actions"
              >
                <DotsThreeOutlineVertical
                  size={18}
                  weight="regular"
                  className="rotate-90"
                />
              </Button>
              {menuOpen && (
                <div className="absolute z-50 mt-2 w-48 rounded-lg border border-slate-200 bg-white shadow-lg left-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                    onClick={() => {
                      setConfirmOpen(true);
                      setMenuOpen(false);
                    }}
                  >
                    Delete conversation
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1 bg-white border border-white px-1 py-1 rounded-sm">
              {tabs.map((tab) => {
                const isActive = activeSlug === tab.slug;
                return (
                  <Link
                    key={tab.slug}
                    href={`${basePath}/${tab.slug}`}
                    className={`inline-flex h-9 items-center justify-center rounded-sm px-3 text-[16px] font-medium leading-5 transition-colors ${
                      isActive
                        ? "bg-[#EDEFFD] text-[#3A1DC8]"
                        : "bg-[#FDFDFD] text-[#9498B0] hover:text-[#3A1DC8]"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            <Button variant="ghost" size="sm" className="h-11 gap-2 text-[#9498B0] hover:text-[#3A1DC8]">
              <ExportIcon size={16} className="text-inherit" />
              Share
            </Button>
          </div>
        </div>
        {error && <Alert variant="error" className="mt-3">{error}</Alert>}
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-[#172847] mb-2">
              Delete conversation?
            </h3>
            <p className="text-sm text-[#566888] mb-4">
              Are you sure you want to delete the session? This is a destructive action and the session will not be recoverable.
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
    </div>
  );
}
