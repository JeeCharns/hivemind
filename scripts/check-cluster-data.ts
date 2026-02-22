#!/usr/bin/env tsx
/**
 * Check cluster data for a conversation
 */

import { createClient } from "@supabase/supabase-js";

async function main() {
  const conversationId =
    process.argv[2] || "f17c2645-1d6d-4f0f-9305-8cb72cb310bc";

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error("❌ Missing environment variables");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`🔍 Checking cluster data for conversation: ${conversationId}\n`);

  // Get responses grouped by cluster
  const { data: responses, error } = await supabase
    .from("conversation_responses")
    .select("id, cluster_index, response_text, x_umap, y_umap")
    .eq("conversation_id", conversationId)
    .order("cluster_index");

  if (error) {
    console.error("❌ Error fetching responses:", error);
    process.exit(1);
  }

  if (!responses || responses.length === 0) {
    console.log("No responses found");
    process.exit(0);
  }

  // Group by cluster
  const byCluster = new Map<number | null, typeof responses>();
  responses.forEach((r) => {
    const cluster = r.cluster_index;
    if (!byCluster.has(cluster)) {
      byCluster.set(cluster, []);
    }
    byCluster.get(cluster)!.push(r);
  });

  console.log(`📊 Total responses: ${responses.length}\n`);
  console.log("Cluster distribution:");
  console.log("=".repeat(80));

  Array.from(byCluster.entries())
    .sort(([a], [b]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    })
    .forEach(([cluster, items]) => {
      const clusterLabel =
        cluster === null ? "NULL" : cluster === -1 ? "MISC" : cluster;
      console.log(`\nCluster ${clusterLabel}: ${items.length} responses`);

      // Check for missing coordinates
      const missingCoords = items.filter(
        (r) => r.x_umap === null || r.y_umap === null
      );
      if (missingCoords.length > 0) {
        console.log(
          `  ⚠️  ${missingCoords.length} responses missing UMAP coordinates`
        );
      }

      // Show first 3 responses
      items.slice(0, 3).forEach((r, i) => {
        const preview = r.response_text.slice(0, 60).replace(/\n/g, " ");
        const coords =
          r.x_umap !== null && r.y_umap !== null
            ? `(${r.x_umap.toFixed(2)}, ${r.y_umap.toFixed(2)})`
            : "(no coords)";
        console.log(`  ${i + 1}. ${preview}... ${coords}`);
      });

      if (items.length > 3) {
        console.log(`  ... and ${items.length - 3} more`);
      }
    });

  console.log("\n" + "=".repeat(80));

  // Get themes
  const { data: themes } = await supabase
    .from("conversation_themes")
    .select("cluster_index, name, size")
    .eq("conversation_id", conversationId)
    .order("cluster_index");

  if (themes && themes.length > 0) {
    console.log("\n📋 Themes:");
    console.log("=".repeat(80));
    themes.forEach((t) => {
      console.log(`Cluster ${t.cluster_index}: "${t.name}" (size: ${t.size})`);
    });
  }
}

main().catch((err) => {
  console.error("💥 Error:", err);
  process.exit(1);
});
