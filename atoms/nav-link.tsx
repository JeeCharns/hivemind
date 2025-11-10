"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { ReactNode } from "react";

interface NavLinkProps {
  href: string;
  icon: ReactNode; // <Icon size={20} />
  label: string;
  active?: boolean;
}

export default function NavLink({ href, icon, label, active }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={`
        flex items-center justify-between
        w-full px-4 py-3
        rounded-xl
        transition-colors
        ${active ? "bg-gray-100" : "hover:bg-gray-100"}
      `}
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <span className="">{icon}</span>

        {/* Label */}
        <span className="text-base">{label}</span>
      </div>

      {/* Chevron */}
      <CaretRightIcon size={18} className="text/70" />
    </Link>
  );
}
