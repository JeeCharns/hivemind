"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Button from "@/components/button";

export type OrgOption = { id: string; slug: string; name: string };

type OrgSelectorProps = {
  orgs: OrgOption[];
};

export default function OrgSelector({ orgs }: OrgSelectorProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentSlugFromUrl = useMemo(() => {
    if (pathname?.startsWith("/hives/")) {
      const parts = pathname.split("/");
      return parts[2] ?? null;
    }
    return null;
  }, [pathname]);

  const [selectedSlug, setSelectedSlug] = useState<string>(
    currentSlugFromUrl ?? ""
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (currentSlugFromUrl && currentSlugFromUrl !== selectedSlug) {
      setSelectedSlug(currentSlugFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlugFromUrl]);

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

  const currentOrg =
    orgs.find((o) => o.slug === selectedSlug) || orgs[0] || null;
  const displayName = currentOrg?.name ?? "Select hive";
  const initials =
    (currentOrg?.name || currentOrg?.slug || "H")
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const handleSelect = (next: string) => {
    if (!next || next === currentSlugFromUrl) {
      setMenuOpen(false);
      return;
    }
    setSelectedSlug(next);
    setMenuOpen(false);
    router.push(`/hives/${next}`);
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-3 px-0"
        onClick={() => setMenuOpen((o) => !o)}
      >
        <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center font-semibold text-sm">
          {initials}
        </div>
        <div className="text-[14px] leading-[18px] font-medium text-[#172847] truncate text-left">
          {displayName}
        </div>
      </Button>
      {menuOpen && (
        <div className="absolute left-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg z-50">
          {orgs.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">No hives</div>
          ) : (
            orgs.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => handleSelect(org.slug)}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-800 flex items-center justify-center font-semibold text-xs">
                  {(org.name || org.slug || "H")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <span className="truncate">{org.name || org.slug}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function OrgSelectorSkeleton() {
  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-white">
      <div className="h-8 w-8 rounded-full bg-slate-200 animate-pulse" />
      <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
    </div>
  );
}
