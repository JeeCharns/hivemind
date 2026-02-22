/**
 * Guest Navbar
 *
 * Stripped-down navigation bar for anonymous guest access.
 * Shows Hivemind logo, guest badge, and sign-up CTA.
 * No hive selector, user menu, or settings links.
 */

"use client";

import Link from "next/link";
import Image from "next/image";

interface GuestNavbarProps {
  guestNumber: number;
}

export default function GuestNavbar({ guestNumber }: GuestNavbarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-slate-100">
      <div className="h-full mx-auto w-full max-w-7xl px-4 md:px-6 flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex items-center gap-4">
          <Link href="/login" className="flex items-center">
            <Image
              src="/HiveLogo.png"
              alt="Hive"
              width={160}
              height={27}
              style={{ width: "auto", height: "auto" }}
              priority
            />
          </Link>
        </div>

        {/* Right: Guest badge + sign-up */}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-subtitle text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Guest {guestNumber}
          </span>
          <Link
            href="/login"
            className="hidden sm:inline-flex h-9 items-center rounded-lg bg-brand-primary px-4 text-subtitle text-white hover:bg-brand-primary/90 transition-colors"
          >
            Sign up
          </Link>
        </div>
      </div>
    </nav>
  );
}
