"use client";

import OrgSelector from "@/atoms/org-selector";
import UserSelector from "@/atoms/user-selector";
import {
  DiamondsFourIcon,
  FileIcon,
  UsersThreeIcon,
  GearFineIcon,
} from "@phosphor-icons/react";
import NavLink from "@/atoms/nav-link";

type NavbarProps = {
  profileName?: string;
  hiveName?: string;
};

export default function Navbar({ profileName, hiveName }: NavbarProps) {
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
          <OrgSelector hiveName={hiveName} />
          <div className="p-2">
            <NavLink
              href="/hives"
              icon={<DiamondsFourIcon size={24} />}
              label={"Home"}
            />
            <NavLink
              href="/reports"
              icon={<FileIcon size={24} />}
              label="Reports"
              disabled
              pillText="Coming soon"
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

        <UserSelector displayName={profileName} />
      </div>
    </nav>
  );
}
