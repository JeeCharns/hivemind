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

  return (
    <div className="text-sm font-medium text-slate-800 truncate max-w-40">
      {conversationTitle ?? current?.label ?? "Home"}
    </div>
  );
}
