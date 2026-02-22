/**
 * Diagnostic Script: Check Cluster Assignments
 *
 * Usage: npx tsx scripts/diagnose-cluster-assignment.ts <conversation-id>
 *
 * This script helps diagnose cluster assignment issues by:
 * 1. Finding specific responses by text content
 * 2. Showing their cluster assignments
 * 3. Comparing with other responses in the same visual area
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing environment variables:");
  console.error("- NEXT_PUBLIC_SUPABASE_URL");
  console.error("- SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnoseClusterAssignment(conversationId: string) {
  console.log(
    `\n🔍 Diagnosing cluster assignments for conversation: ${conversationId}\n`
  );

  // 1. Get all responses with their cluster info
  const { data: responses, error } = await supabase
    .from("conversation_responses")
    .select(
      "id, response_text, cluster_index, x_umap, y_umap, is_misc, distance_to_centroid, outlier_score"
    )
    .eq("conversation_id", conversationId)
    .order("cluster_index", { ascending: true });

  if (error) {
    console.error("Error fetching responses:", error);
    process.exit(1);
  }

  if (!responses || responses.length === 0) {
    console.error("No responses found for this conversation");
    process.exit(1);
  }

  console.log(`📊 Total responses: ${responses.length}\n`);

  // 2. Get theme information
  const { data: themes, error: themesError } = await supabase
    .from("conversation_themes")
    .select("cluster_index, name, description, size")
    .eq("conversation_id", conversationId)
    .order("cluster_index", { ascending: true });

  if (themesError) {
    console.error("Error fetching themes:", themesError);
  }

  // Create theme lookup
  const themeByCluster = new Map(
    themes?.map((t) => [t.cluster_index, t]) || []
  );

  // 3. Search for specific responses
  console.log("🔎 Searching for key responses:\n");

  // Search for "people will be free"
  const freedomResponse = responses.find((r) =>
    r.response_text.toLowerCase().includes("people will be free")
  );

  if (freedomResponse) {
    const theme = themeByCluster.get(freedomResponse.cluster_index);
    console.log('✅ Found: "People will be free"');
    console.log(`   Text: "${freedomResponse.response_text}"`);
    console.log(`   Cluster Index: ${freedomResponse.cluster_index}`);
    console.log(`   Theme: ${theme?.name || "Unknown"}`);
    console.log(`   Is Misc: ${freedomResponse.is_misc}`);
    console.log(
      `   Position: (${freedomResponse.x_umap?.toFixed(2)}, ${freedomResponse.y_umap?.toFixed(2)})`
    );
    console.log(
      `   Distance to Centroid: ${freedomResponse.distance_to_centroid?.toFixed(4)}`
    );
    console.log(
      `   Outlier Score: ${freedomResponse.outlier_score?.toFixed(2) || "N/A"}`
    );
    console.log("");
  } else {
    console.log('❌ "People will be free" not found');
    console.log("");
  }

  // Search for responses containing "test"
  const testResponses = responses.filter((r) =>
    r.response_text.toLowerCase().includes("test")
  );

  console.log(
    `📝 Found ${testResponses.length} responses containing "test":\n`
  );

  // Group by cluster
  const testByCluster = new Map<number, typeof testResponses>();
  for (const resp of testResponses) {
    if (!testByCluster.has(resp.cluster_index)) {
      testByCluster.set(resp.cluster_index, []);
    }
    testByCluster.get(resp.cluster_index)!.push(resp);
  }

  for (const [clusterIdx, resps] of testByCluster.entries()) {
    const theme = themeByCluster.get(clusterIdx);
    console.log(
      `Cluster ${clusterIdx}: ${theme?.name || "Unknown"} (${resps.length} responses)`
    );
    for (const r of resps.slice(0, 5)) {
      // Show first 5
      console.log(
        `   - "${r.response_text.substring(0, 60)}${r.response_text.length > 60 ? "..." : ""}"`
      );
    }
    if (resps.length > 5) {
      console.log(`   ... and ${resps.length - 5} more`);
    }
    console.log("");
  }

  // 4. Show cluster distribution
  console.log("📈 Cluster Distribution:\n");
  const clusterCounts = new Map<number, number>();
  for (const r of responses) {
    clusterCounts.set(
      r.cluster_index,
      (clusterCounts.get(r.cluster_index) || 0) + 1
    );
  }

  const sortedClusters = Array.from(clusterCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  for (const [clusterIdx, count] of sortedClusters) {
    const theme = themeByCluster.get(clusterIdx);
    const percentage = ((count / responses.length) * 100).toFixed(1);
    console.log(`Cluster ${clusterIdx}: ${theme?.name || "Unknown"}`);
    console.log(`   ${count} responses (${percentage}%)`);
    if (theme?.description) {
      console.log(`   "${theme.description}"`);
    }
    console.log("");
  }

  // 5. Interactive search
  console.log("💡 To search for a specific text, you can use:");
  console.log(`   SELECT response_text, cluster_index, x_umap, y_umap
   FROM conversation_responses
   WHERE conversation_id = '${conversationId}'
   AND response_text ILIKE '%your search term%';`);
  console.log("");

  // 6. Check for potential misclassifications
  console.log("⚠️  Potential Issues:\n");

  if (freedomResponse) {
    const freedomCluster = freedomResponse.cluster_index;
    const freedomTheme = themeByCluster.get(freedomCluster);

    // Check if there are other "freedom" related responses in different clusters
    const freedomRelated = responses.filter((r) =>
      r.response_text.toLowerCase().match(/free|freedom|liberty|quality.*life/i)
    );

    const freedomClusters = new Set(freedomRelated.map((r) => r.cluster_index));

    if (freedomClusters.size > 1) {
      console.log(
        `🔴 "Freedom" related responses split across ${freedomClusters.size} clusters:`
      );
      for (const clusterIdx of freedomClusters) {
        const theme = themeByCluster.get(clusterIdx);
        const count = freedomRelated.filter(
          (r) => r.cluster_index === clusterIdx
        ).length;
        console.log(
          `   Cluster ${clusterIdx} (${theme?.name}): ${count} responses`
        );
      }
      console.log("");
    }
  }

  // Check if "test" responses are split
  if (testByCluster.size > 1) {
    console.log(
      `🔴 "Test" related responses split across ${testByCluster.size} clusters:`
    );
    for (const [clusterIdx, resps] of testByCluster.entries()) {
      const theme = themeByCluster.get(clusterIdx);
      console.log(
        `   Cluster ${clusterIdx} (${theme?.name}): ${resps.length} responses`
      );
    }
    console.log("");
  }
}

// Get conversation ID from command line
const conversationId = process.argv[2];

if (!conversationId) {
  console.error(
    "Usage: npx tsx scripts/diagnose-cluster-assignment.ts <conversation-id>"
  );
  console.error(
    "\nExample: npx tsx scripts/diagnose-cluster-assignment.ts abc-123-def-456"
  );
  process.exit(1);
}

diagnoseClusterAssignment(conversationId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
