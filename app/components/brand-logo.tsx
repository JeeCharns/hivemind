"use client";

import Image from "next/image";

export default function BrandLogo({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/HiveMindLogo.png"
      alt="HiveMind logo"
      width={size * 4}
      height={size}
      className={className ?? ""}
      style={{ width: "auto", height: "auto" }}
      priority
    />
  );
}
