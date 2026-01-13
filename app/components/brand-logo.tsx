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
      src="/HiveLogo.png"
      alt="Hive logo"
      width={size * 4}
      height={size}
      className={className ?? ""}
      style={{ height: size, width: "auto" }}
      priority
    />
  );
}
