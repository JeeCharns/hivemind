"use client";

import OrgSelector from "@/atoms/org-selector";
import UserSelector from "@/atoms/user-selector";
import {
  DiamondsFourIcon,
  IntersectIcon,
  GitForkIcon,
  FileIcon,
  UsersThreeIcon,
  GearFineIcon,
} from "@phosphor-icons/react";
import NavLink from "@/atoms/nav-link";

export default function Navbar() {
  return (
    <nav
      className="
        fixed      /* keep it locked to the left side */
        top-8
        left-8
        bottom-8
        w-80       /* pick a width; adjust to your design */
        rounded-2xl
        bg-white
      "
    >
      <div className="flex flex-col h-full justify-between">
        <div>
          <OrgSelector />
          <div className="p-2">
            <NavLink
              href="/"
              icon={<DiamondsFourIcon size={24} />}
              label="Home"
            />
            <NavLink
              href="/understand"
              icon={<IntersectIcon size={24} />}
              label="Understand"
            />
            <NavLink
              href="/decide"
              icon={<GitForkIcon size={24} />}
              label="Decide"
            />
            <NavLink
              href="/report"
              icon={<FileIcon size={24} />}
              label="Report"
            />
            <NavLink
              href="/members"
              icon={<UsersThreeIcon size={24} />}
              label="Members"
            />
            <NavLink
              href="/settings"
              icon={<GearFineIcon size={24} />}
              label="Settings"
            />
          </div>
        </div>

        <UserSelector />
      </div>
    </nav>
  );
}
