"use client";

import Image from "next/image";

export default function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <Image
      src="/HiveMindLogo.png"
      alt="HiveMind logo"
      width={size * 4}
      height={size}
      className="h-10 w-auto"
      priority
    />
  );
}
