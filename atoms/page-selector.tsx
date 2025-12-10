"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Button from "@/components/button";

type PageSelectorProps = {
  hiveSlug?: string | null;
  hiveId?: string;
};

const pages = [
  { label: "Home", slug: "" },
  { label: "Members", slug: "members" },
  { label: "Settings", slug: "settings" },
];

export default function PageSelector({ hiveSlug, hiveId }: PageSelectorProps) {
  const pathname = usePathname();
  const router = useRouter();
  const hiveKey = hiveSlug ?? hiveId ?? "";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const currentFromPath = (() => {
    if (pathname?.includes("/members")) return "members";
    if (pathname?.includes("/settings")) return "settings";
    return "";
  })();

  const [selected, setSelected] = useState<string>(currentFromPath);

  useEffect(() => {
    if (currentFromPath !== selected) {
      setSelected(currentFromPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFromPath]);

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) window.addEventListener("click", onClickAway);
    return () => window.removeEventListener("click", onClickAway);
  }, [menuOpen]);

  const handleSelect = (slug: string) => {
    if (!hiveKey) return;
    if (slug === selected) return;
    setSelected(slug);
    const target =
      slug === "" ? `/hives/${hiveKey}` : `/hives/${hiveKey}/${slug}`;
    router.push(target);
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        size="sm"
        className="flex items-center gap-2 px-0 text-[14px] leading-[18px] font-medium text-[#172847]"
        onClick={() => setMenuOpen((o) => !o)}
      >
        <span className="truncate">{pages.find((p) => p.slug === selected)?.label ?? "Home"}</span>
      </Button>
      {menuOpen && (
        <div className="absolute mt-1 w-40 rounded-lg border border-slate-200 bg-white shadow-sm z-50">
          {pages.map((page) => (
            <button
              key={page.slug}
              type="button"
              onClick={() => handleSelect(page.slug)}
              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-slate-50 ${
                selected === page.slug ? "text-[#3A1DC8] bg-indigo-50" : "text-slate-700"
              }`}
            >
              <span className="text-[12px]">{page.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
