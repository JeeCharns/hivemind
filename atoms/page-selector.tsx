"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
  const [conversationTitle, setConversationTitle] = useState<string | null>(
    null
  );
  const match = pathname?.match(/\/hives\/([^/]+)\/conversations\/([^/]+)/);
  const hiveKey = match?.[1] ?? null;
  const conversationKey = match?.[2] ?? null;

  useEffect(() => {
    if (!conversationKey || !hiveKey) return;
    const supabase = supabaseBrowserClient;
    if (!supabase) return;
    let active = true;
    supabase
      .from("conversations")
      .select("title")
      .or(
        `and(id.eq.${conversationKey},hive_id.eq.${hiveKey}),and(slug.eq.${conversationKey},hive_id.eq.${hiveKey})`
      )
      .maybeSingle()
      .then(({ data }) => {
        if (active) setConversationTitle(data?.title ?? null);
      });
    return () => {
      active = false;
    };
  }, [conversationKey, hiveKey]);

  const pageLabel = (() => {
    if (conversationTitle) return conversationTitle;
    if (conversationKey) return conversationKey;
    if (pathname?.includes("/members")) return "Members";
    if (pathname?.includes("/settings")) return "Settings";
    const current = pages.find((p) =>
      pathname?.endsWith(`/hives/${hiveId}/${p.slug}`.replace(/\/$/, ""))
    );
    return current?.label;
  })();

  return (
    <div className="text-sm font-medium text-slate-800 truncate max-w-40">
      {pageLabel}
    </div>
  );
}
