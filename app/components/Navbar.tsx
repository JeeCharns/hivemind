/**
 * Navbar Component
 *
 * Presentational navbar - composes HiveSelector, PageSelector, and UserMenu
 * Follows SRP: only responsible for layout and rendering
 * All data comes from NavbarViewModel (no fetching)
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import type { NavbarViewModel } from "@/types/navbar";
import HiveSelector from "./navbar/HiveSelector";
import PageSelector from "./navbar/PageSelector";
import UserMenu from "./navbar/UserMenu";

interface NavbarProps {
  viewModel: NavbarViewModel;
}

export default function Navbar({ viewModel }: NavbarProps) {
  const { user, hives, currentHive, currentPage } = viewModel;

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-slate-100">
      <div className="h-full mx-auto w-full max-w-7xl px-6 flex items-center justify-between">
        {/* Left: Logo + Navigation */}
        <div className="flex items-center gap-6">
          <Link href="/hives" className="flex items-center">
            <Image
              src="/HiveLogo.png"
              alt="Hive"
              width={160}
              height={27}
              style={{ width: "auto", height: "auto" }}
              priority
            />
          </Link>

          {/* Breadcrumb-style navigation */}
          <div className="flex items-center gap-2">
            {/* Hive Selector */}
            <HiveSelector hives={hives} currentHiveId={currentHive?.id} />

            {/* Page Selector (only show if we're in a hive) */}
            {currentHive && (
              <>
                <span className="text-slate-300">/</span>
                <PageSelector
                  hiveId={currentHive.id}
                  hiveSlug={currentHive.slug}
                  currentPage={currentPage}
                />
              </>
            )}
          </div>
        </div>

        {/* Right: User Menu */}
        {user && <UserMenu user={user} />}
      </div>
    </nav>
  );
}
