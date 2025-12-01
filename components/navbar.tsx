"use client";

import OrgSelector from "@/atoms/org-selector";
import UserSelector from "@/atoms/user-selector";
import Image from "next/image";
import Link from "next/link";

type NavbarProps = {
  profileName?: string;
  hiveName?: string;
};

export default function Navbar({ profileName, hiveName }: NavbarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-slate-100">
      <div className="h-full mx-auto max-w-[1440px] px-6 lg:px-10 xl:px-12 flex items-center justify-between py-2">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/HiveMindLogo.png"
              alt="HiveMind logo"
              width={160}
              height={27}
              priority
            />
          </Link>
          <span className="text-slate-200 text-xl font-medium">/</span>
          <OrgSelector hiveName={hiveName} />
        </div>

        <UserSelector displayName={profileName} />
      </div>
    </nav>
  );
}
