"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { ReactNode } from "react";

interface NavLinkProps {
  href: string;
  icon: ReactNode; // <Icon size={20} />
  label: string;
  active?: boolean;
  disabled?: boolean;
  pillText?: string;
}

export default function NavLink({
  href,
  icon,
  label,
  active,
  disabled,
  pillText,
}: NavLinkProps) {
  const baseClasses = `
    flex items-center justify-between
    w-full px-4 py-3
    rounded-xl
    transition-colors
    ${active ? "bg-gray-100" : "hover:bg-gray-100"}
    ${disabled ? "opacity-60 pointer-events-none" : ""}
  `;

  const content = (
    <>
      <div className="flex items-center gap-3">
        <span>{icon}</span>
        <span className="text-base">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {pillText && (
          <span className="text-[10px] uppercase font-semibold tracking-wide bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
            {pillText}
          </span>
        )}
        <CaretRightIcon size={18} className="text/70" />
      </div>
    </>
  );

  if (disabled) {
    return (
      <div className={baseClasses} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className={baseClasses}>
      {content}
    </Link>
  );
}
