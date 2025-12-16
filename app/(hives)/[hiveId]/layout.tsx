import type { ReactNode } from "react";
import HiveLayoutWrapper from "./hive-layout-wrapper";

export default async function HiveLayout({
  children,
}: {
  children: ReactNode;
  params: Promise<{ hiveId: string }>;
}) {
  return (
    <HiveLayoutWrapper>
      <div className="min-h-screen">
        {children}
      </div>
    </HiveLayoutWrapper>
  );
}
