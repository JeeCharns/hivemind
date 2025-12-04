"use client";

import OrgSelector from "@/atoms/org-selector";
import PageSelector from "@/atoms/page-selector";
import UserSelector from "@/atoms/user-selector";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

type NavbarProps = {
  profileName?: string;
  profileAvatarPath?: string | null;
  hiveName?: string;
  hiveLogo?: string | null;
  hiveId?: string;
};

export default function Navbar({
  profileName,
  profileAvatarPath,
  hiveName,
  hiveLogo,
  hiveId,
}: NavbarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-slate-100">
      <div className="h-full mx-auto max-w-[1440px] px-6 lg:px-10 xl:px-12 flex items-center justify-between py-2">
        <div className="flex items-center gap-6">
          <Link href="/hives" className="flex items-center gap-2">
            <Image
              src="/HiveMindLogo.png"
              alt="HiveMind logo"
              width={160}
              height={27}
              priority
            />
          </Link>
          <span className="text-slate-200 text-xl font-medium">/</span>
          <Suspense
            fallback={
              <div className="flex items-center gap-3 py-1.5">
                <div className="h-8 w-8 rounded-full bg-slate-200 animate-pulse" />
                <div className="h-4 w-24 rounded bg-slate-200 animate-pulse" />
              </div>
            }
          >
            <OrgSelector hiveName={hiveName} hiveLogo={hiveLogo} />
          </Suspense>
          {hiveId && (
            <>
              <span className="text-slate-200 text-xl font-medium">/</span>
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
            </>
          )}
        </div>

        <UserSelector displayName={profileName} avatarPath={profileAvatarPath ?? null} />
      </div>
    </nav>
  );
}
