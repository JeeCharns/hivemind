"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/client";
import Button from "@/components/button";

export default function DeleteHiveButton({ hiveId }: { hiveId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const supabase = supabaseBrowserClient;

  const handleDelete = async () => {
    if (!hiveId) return;
    const confirmed = window.confirm(
      "Are you sure you want to delete this hive? All data will be removed."
    );
    if (!confirmed) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/hives/${hiveId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to delete hive");
      }

      if (supabase) {
        const { data: session } = await supabase.auth.getSession();
        const userId = session.session?.user?.id;
        if (userId) {
          const { data: memberships } = await supabase
            .from("hive_members")
            .select("hive_id")
            .eq("user_id", userId);
          const remaining = memberships ?? [];
          if (remaining.length > 1) {
            router.replace("/hives");
            return;
          }
          if (remaining.length === 1) {
            router.replace(`/hives/${remaining[0].hive_id}`);
            return;
          }
        }
      }

      // Fallback if no memberships found or supabase unavailable
      router.replace("/hives");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete hive";
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" variant="danger" onClick={handleDelete} disabled={loading}>
      {loading ? "Deleting…" : "Delete Hive"}
    </Button>
  );
}
