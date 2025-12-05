"use client";

import OrgSelector from "@/atoms/org-selector";
import PageSelector from "@/atoms/page-selector";
import UserSelector from "@/atoms/user-selector";
import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import Breadcrumb from "./breadcrumb";
import RouteLogger from "./route-logger";

type NavbarProps = {
  profileName?: string;
  profileAvatarPath?: string | null;
  hiveName?: string;
  hiveLogo?: string | null;
  hiveId?: string;
  hiveSlug?: string | null;
};

export default function Navbar({
  profileName,
  profileAvatarPath,
  hiveName,
  hiveLogo,
  hiveId,
  hiveSlug,
}: NavbarProps) {
  const pathname = usePathname();
  const isHivesHome = pathname === "/hives";
  const isAccount = pathname === "/account";
  const isHiveRoot =
    !!hiveId &&
    (pathname === `/hives/${hiveId}` || pathname === `/hives/${hiveId}/`);

  // Persist last visited hive for layouts that need a fallback
  useEffect(() => {
    if (!hiveId) return;
    try {
      localStorage.setItem("last_hive_id", hiveId);
      fetch("/api/last-hive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiveId }),
      }).catch(() => {});
    } catch {
      // ignore storage errors
    }
  }, [hiveId]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-slate-100">
      <RouteLogger />
      <div className="h-full mx-auto max-w-[1440px] px-6 lg:px-10 xl:px-12 flex items-center justify-between py-1">
        <div className="flex items-center gap-3">
          <Link href="/hives" className="flex items-center gap-2">
            <Image
              src="/HiveMindLogo.png"
              alt="HiveMind logo"
              width={160}
              height={27}
              style={{ width: "auto", height: "auto" }}
              priority
            />
          </Link>
          <Breadcrumb
            segments={[
              hiveId ? (
                <Suspense
                  fallback={
                    <div className="flex items-center gap-3 py-1.5">
                      <div className="h-8 w-8 rounded-full bg-slate-200 animate-pulse" />
                      <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
                    </div>
                  }
                >
                  <OrgSelector
                    hiveName={hiveName}
                    hiveLogo={hiveLogo}
                    hiveId={hiveId}
                    hiveSlug={hiveSlug ?? undefined}
                  />
                </Suspense>
              ) : null,
              !isAccount && hiveId && !isHivesHome && !isHiveRoot ? (
                <Suspense
                  fallback={
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-20 rounded bg-slate-200 animate-pulse" />
                      <div className="h-8 w-8 rounded-md border border-slate-200 bg-slate-50 animate-pulse" />
                    </div>
                  }
                >
                  <PageSelector hiveId={hiveId} />
                </Suspense>
              ) : null,
            ]}
          />
        </div>

        <UserSelector
          displayName={profileName}
          avatarPath={profileAvatarPath ?? null}
        />
      </div>
    </nav>
  );
}
