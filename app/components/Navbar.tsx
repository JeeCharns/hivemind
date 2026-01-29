/**
 * Navbar Component
 *
 * Presentational navbar - composes HiveSelector, PageSelector, and UserMenu
 * Follows SRP: only responsible for layout and rendering
 * All data comes from NavbarViewModel (no fetching)
 *
 * Mobile: Shows logo + hamburger, opens MobileDrawer
 * Desktop: Shows full navigation (hive selector, page selector, user menu)
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { NavbarViewModel } from "@/types/navbar";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import HiveSelector from "./navbar/HiveSelector";
import PageSelector from "./navbar/PageSelector";
import UserMenu from "./navbar/UserMenu";
import MobileDrawer from "./navbar/MobileDrawer";

interface NavbarProps {
  viewModel: NavbarViewModel;
}

export default function Navbar({ viewModel }: NavbarProps) {
  const { user, hives, currentHive, currentPage } = viewModel;
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-slate-100">
        <div className="h-full mx-auto w-full max-w-7xl px-4 md:px-6 flex items-center justify-between">
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

            {/* Breadcrumb-style navigation - hidden on mobile */}
            <div className="hidden md:flex items-center gap-2">
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
                    isAdmin={currentHive.isAdmin}
                  />
                </>
              )}
            </div>
          </div>

          {/* Right: User Menu (desktop) or Hamburger (mobile) */}
          {isMobile ? (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="p-2 -mr-2 hover:bg-slate-100 rounded-md transition"
              aria-label="Open menu"
            >
              <svg
                className="w-6 h-6 text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          ) : (
            user && <UserMenu user={user} />
          )}
        </div>
      </nav>

      {/* Mobile drawer */}
      <MobileDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        viewModel={viewModel}
      />
    </>
  );
}
