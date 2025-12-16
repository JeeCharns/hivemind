"use client";

import Image from "next/image";

interface HiveLogoProps {
  src: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export default function HiveLogo({
  src,
  name,
  size = 48,
  className,
}: HiveLogoProps) {
  const label = name?.trim() ? name : "Hive";
  const initials = label.slice(0, 2).toUpperCase();

  const baseClasses = "rounded-full border border-slate-200";
  const imageClasses = `${baseClasses} object-cover ${className ?? ""}`.trim();
  const fallbackTextSize = size >= 64 ? "text-xl" : "text-sm";
  const fallbackClasses =
    `${baseClasses} bg-indigo-100 text-indigo-800 flex items-center justify-center font-semibold ${fallbackTextSize} ${className ?? ""}`.trim();

  if (!src) {
    return (
      <div className={fallbackClasses} style={{ width: size, height: size }}>
        {initials}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={`${label} logo`}
      width={size}
      height={size}
      sizes={`${size}px`}
      className={imageClasses}
    />
  );
}

