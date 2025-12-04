"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import { CaretUpDown } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

type HiveRow = {
  hive_id: string;
  hives: { name: string | null; logo_url?: string | null } | null;
};

export default function OrgSelector({
  hiveName,
  hiveLogo,
  hiveId,
}: {
  hiveName?: string;
  hiveLogo?: string | null;
  hiveId?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hives, setHives] = useState<HiveRow[]>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set());
  const supabase = supabaseBrowserClient;
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const resolveLogo = useCallback(
    (logo?: string | null) => {
      if (!logo) return null;
      if (logo.startsWith("http")) return logo;
      if (signedUrls[logo]) return signedUrls[logo];
      // For private buckets, wait for the signed URL effect to populate; avoid returning a likely 403.
      return null;
    },
    [signedUrls]
  );

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }
      const { data: rows } = await supabase
        .from("hive_members")
        .select("hive_id,hives(name,logo_url)")
        .eq("user_id", userId);
      const resolved: HiveRow[] =
        (rows ?? []).map(
          (row: {
            hive_id: string;
            hives:
              | { name: string | null; logo_url?: string | null }
              | { name: string | null; logo_url?: string | null }[]
              | null;
          }) => {
            const hiveRel = Array.isArray(row.hives) ? row.hives[0] : row.hives;
            const rawLogo = hiveRel?.logo_url ?? null;
            const logo_url = resolveLogo(rawLogo);
            return {
              ...row,
              hives: hiveRel ? { name: hiveRel.name ?? null, logo_url } : null,
            } as HiveRow;
          }
        ) ?? [];
      setHives((prev) => {
        const merged = [...prev, ...resolved];
        const deduped = new Map<string, HiveRow>();
        merged.forEach((row) => {
          deduped.set(row.hive_id, row as HiveRow);
        });
        return Array.from(deduped.values());
      });
      setLoading(false);
    });
  }, [resolveLogo, supabase]);

  useEffect(() => {
    if (!supabase) return;
    const logosToSign = new Set<string>();
    hives.forEach((h) => {
      const l = h.hives?.logo_url;
      if (l && !l.startsWith("http") && !signedUrls[l]) logosToSign.add(l);
    });
    if (hiveLogo && !hiveLogo.startsWith("http") && !signedUrls[hiveLogo]) {
      logosToSign.add(hiveLogo);
    }
    logosToSign.forEach((logo) => {
      supabase.storage
        .from("logos")
        .createSignedUrl(logo, 300)
        .then(({ data }) => {
          if (data?.signedUrl) {
            setSignedUrls((prev) => ({ ...prev, [logo]: data.signedUrl }));
          }
        });
    });
  }, [hives, hiveLogo, signedUrls, supabase]);

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      window.addEventListener("click", onClickAway);
    }
    return () => window.removeEventListener("click", onClickAway);
  }, [open]);

  const renderLogo = (
    key: string,
    name?: string | null,
    logo?: string | null,
    size: "sm" | "xs" = "sm"
  ) => {
    const finalLogo = resolveLogo(logo);
    const initials =
      name
        ?.split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() ?? "H";
    if (finalLogo && !failedLogos.has(key)) {
      return (
        <Image
          src={finalLogo}
          alt={name ?? "Hive logo"}
          width={size === "sm" ? 32 : 24}
          height={size === "sm" ? 32 : 24}
          className={`rounded-full object-cover ${
            size === "sm" ? "h-8 w-8" : "h-6 w-6"
          }`}
          onError={() => {
            setFailedLogos((prev) => {
              const next = new Set(prev);
              next.add(key);
              return next;
            });
          }}
        />
      );
    }
    return (
      <div
        className={`rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center font-semibold ${
          size === "sm" ? "h-8 w-8 text-sm" : "h-6 w-6 text-xs"
        }`}
      >
        {initials}
      </div>
    );
  };

  const menuHives = useMemo(() => {
    const list = [...hives];
    const currentId = pathname?.match(/\/hives\/([^/]+)/)?.[1];
    const hasCurrent =
      (currentId && list.some((h) => h.hive_id === currentId)) ||
      list.some(
        (h) => h.hives?.name?.toLowerCase() === (hiveName ?? "").toLowerCase()
      );
    if ((hiveName || hiveLogo) && !hasCurrent) {
      list.unshift({
        hive_id: "current-prop",
        hives: { name: hiveName ?? null, logo_url: resolveLogo(hiveLogo) },
      });
    }
    return list;
  }, [hives, hiveName, hiveLogo, resolveLogo, pathname]);

  const currentHive =
    menuHives.find(
      (h) => h.hive_id === pathname?.match(/\/hives\/([^/]+)/)?.[1]
    ) ??
    menuHives.find(
      (h) => h.hives?.name?.toLowerCase() === (hiveName ?? "").toLowerCase()
    ) ??
    menuHives[0];

  const displayName = currentHive?.hives?.name ?? hiveName ?? "Hive";
  const currentHiveId =
    currentHive?.hive_id ||
    pathname?.match(/\/hives\/([^/]+)/)?.[1] ||
    hives[0]?.hive_id;

  if (loading && !currentHive && !hiveName) {
    return (
      <div className="flex items-center gap-3 py-1.5">
        <div className="h-8 w-8 rounded-full bg-slate-200 animate-pulse" />
        <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative flex items-center" ref={menuRef}>
      <Link
        href={currentHiveId ? `/hives/${currentHiveId}` : "/hives"}
        className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-slate-50 transition-colors"
      >
        {renderLogo(
          currentHive?.hive_id ?? currentHive?.hives?.name ?? "current",
          currentHive?.hives?.name ?? hiveName,
          currentHive?.hives?.logo_url ?? hiveLogo ?? null,
          "sm"
        )}
        <div className="text-sm font-medium text-slate-800 truncate max-w-60">
          {displayName}
        </div>
      </Link>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-12 inline-flex items-center justify-center rounded-md text-slate-600 bg-white hover:bg-slate-50"
        aria-label="Switch hive"
      >
        <CaretUpDown size={16} />
      </button>
      {open && hiveId && (
        <div className="absolute z-50 top-10 right-0 w-56 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="flex flex-col">
            <a
              href={`/hives/${hiveId}`}
              className="px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
            >
              Home
            </a>
            <a
              href={`/hives/${hiveId}/members`}
              className="px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
            >
              Members
            </a>
            <a
              href={`/hives/${hiveId}/settings`}
              className="px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
            >
              Settings
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
