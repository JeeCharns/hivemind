"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function RouteLogger() {
  const pathname = usePathname();
  useEffect(() => {
    console.log("[route-logger] navigated to", pathname);
  }, [pathname]);
  return null;
}
