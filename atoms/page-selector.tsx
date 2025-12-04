"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CaretUpDown } from "@phosphor-icons/react";
import { supabaseBrowserClient } from "@/lib/supabase/client";

type PageSelectorProps = {
  hiveId: string;
};

const pages = [
  { label: "Home", slug: "" },
  { label: "Members", slug: "members" },
  { label: "Settings", slug: "settings" },
];

export default function PageSelector({ hiveId }: PageSelectorProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(
    null
  );
  const match = pathname?.match(/\/hives\/([^/]+)\/conversations\/([^/]+)/);
  const conversationId = match?.[2] ?? null;

  useEffect(() => {
    if (!conversationId) return;
    const supabase = supabaseBrowserClient;
    if (!supabase) return;
    let active = true;
    supabase
      .from("conversations")
      .select("title")
      .eq("id", conversationId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setConversationTitle(data?.title ?? null);
      });
    return () => {
      active = false;
      setConversationTitle(null);
    };
  }, [conversationId]);

  const current = pages.find((p) =>
    pathname?.endsWith(`/hives/${hiveId}/${p.slug}`.replace(/\/$/, ""))
  );

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) window.addEventListener("click", onClickAway);
    return () => window.removeEventListener("click", onClickAway);
  }, [open]);

  return (
    <div className="relative flex items-center gap-2" ref={menuRef}>
      <div className="text-sm font-medium text-slate-800 truncate max-w-40">
        {conversationTitle ?? current?.label ?? "Home"}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
        aria-label="Switch page"
      >
        <CaretUpDown size={16} />
      </button>
      {open && (
        <div className="absolute z-50 top-10 right-0 w-48 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {pages.map((p) => {
            const href =
              p.slug === "" ? `/hives/${hiveId}` : `/hives/${hiveId}/${p.slug}`;
            return (
              <Link
                key={p.label}
                href={href}
                className="block px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
