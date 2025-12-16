"use client";

import OrgSelector from "@/atoms/org-selector";

export default function DebugOrgSelectorPage() {
  console.log("[debug-org-selector] render");

  return (
    <div style={{ padding: 24 }}>
      <h1>Debug OrgSelector</h1>
      <OrgSelector
        orgs={[{ id: "1", slug: "debug-hive", name: "Debug Hive" }]}
      />
    </div>
  );
}
