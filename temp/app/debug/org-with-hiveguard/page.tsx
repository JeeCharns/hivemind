"use client";

import HiveClientGuard from "@/app/(dashboard)/hives/[hiveId]/client-guard";
import OrgSelector from "@/atoms/org-selector";

export default function Page() {
  return (
    <HiveClientGuard>
      <div style={{ padding: 24 }}>
        <h1>OrgSelector + HiveClientGuard debug</h1>
        <OrgSelector
          orgs={[{ id: "1", slug: "debug-hive", name: "Debug Hive" }]}
        />
      </div>
    </HiveClientGuard>
  );
}
