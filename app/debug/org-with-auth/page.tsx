"use client";

import AuthGuard from "@/components/auth-guard";
import OrgSelector from "@/atoms/org-selector";

export default function Page() {
  return (
    <AuthGuard>
      <div style={{ padding: 24 }}>
        <h1>OrgSelector + AuthGuard debug</h1>
        <OrgSelector
          orgs={[{ id: "1", slug: "debug-hive", name: "Debug Hive" }]}
          currentSlug="debug-hive"
          onChange={(slug) => console.log("[org-with-auth] change", slug)}
        />
      </div>
    </AuthGuard>
  );
}
