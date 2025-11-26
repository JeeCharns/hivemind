import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { openai } from "@/lib/openai/client";
import { UMAP } from "umap-js";
import kmeans from "ml-kmeans";

export const runtime = "nodejs";

type ConversationRow = {
  id: string;
  type: string;
  phase: string;
  analysis_status: string;
  analysis_error: string | null;
};

type ResponseRow = {
  id: number;
  response_text: string;
  embedding: number[] | null;
  tag: string;
  original_row_index: number | null;
};

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-4.1-mini";
const BATCH_SIZE = 64;
const K = 5;

const cosine = (a: number[], b: number[]) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const chunk = <T>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

const embedBatch = async (inputs: string[]) => {
  const { data } = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs,
  });
  return data.map((d) => d.embedding as number[]);
};

const buildThemes = async (
  clusters: Record<number, { samples: string[]; size: number; avgSim: number }>,
  conversationId: string,
  supabase: ReturnType<typeof supabaseServerClient>
) => {
  const rows = await Promise.all(
    Object.entries(clusters).map(async ([idx, { samples, size, avgSim }]) => {
      let name: string | null = null;
      let description: string | null = null;
      try {
        const prompt = [
          {
            role: "system" as const,
            content:
              'You are summarizing a cluster of survey responses into a theme. Respond with JSON: {"name": "short name <= 6 words", "description": "1-2 sentence summary"}.',
          },
          {
            role: "user" as const,
            content: `Responses:\n${samples
              .map((s, i) => `${i + 1}. ${s}`)
              .join("\n")}`,
          },
        ];

        const chat = await openai.chat.completions.create({
          model: CHAT_MODEL,
          temperature: 0.2,
          messages: prompt,
          response_format: { type: "json_object" },
        });

        const content = chat.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          name = parsed.name ?? null;
          description = parsed.description ?? null;
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Theme labeling failed";
        name = null;
        description = msg;
      }

      return {
        conversation_id: conversationId,
        cluster_index: Number(idx),
        name,
        description,
        size,
        avg_similarity: avgSim,
      };
    })
  );

  // Remove existing themes for this conversation then insert new ones
  await supabase
    .from("conversation_themes")
    .delete()
    .eq("conversation_id", conversationId);

  const { error } = await supabase.from("conversation_themes").upsert(rows);
  if (error) {
    throw new Error("Failed to upsert themes");
  }
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const supabase = supabaseServerClient();
  const { conversationId } = await params;

  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("id,type,phase,analysis_status,analysis_error")
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (convoError || !conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  if (conversation.type !== "understand") {
    return NextResponse.json(
      { error: "Analysis only for understand conversations" },
      { status: 400 }
    );
  }

  if (
    ["embedding", "analyzing", "ready"].includes(conversation.analysis_status)
  ) {
    return NextResponse.json(
      { error: "Analysis already in progress or complete" },
      { status: 409 }
    );
  }

  const updateStatus = async (status: string, errorMsg: string | null = null) =>
    supabase
      .from("conversations")
      .update({ analysis_status: status, analysis_error: errorMsg })
      .eq("id", conversationId);

  try {
    await updateStatus("embedding");

    const { data: responses, error: respError } = await supabase
      .from("conversation_responses")
      .select("id,response_text,embedding,tag,original_row_index")
      .eq("conversation_id", conversationId)
      .order("id", { ascending: true })
      .returns<ResponseRow[]>();

    if (respError) {
      throw new Error("Failed to fetch responses");
    }

    if (!responses || responses.length === 0) {
      await updateStatus("ready", null);
      return NextResponse.json({ message: "No responses to analyze" });
    }

    // Step A: embeddings
    const texts = responses.map((r) => r.response_text);
    const batches = chunk(texts, BATCH_SIZE);
    const allEmbeddings: number[][] = [];

    for (const batch of batches) {
      const embeds = await embedBatch(batch);
      allEmbeddings.push(...embeds);
    }

    const updates = responses.map((r, idx) => ({
      id: r.id,
      conversation_id: conversationId,
      response_text: r.response_text,
      tag: r.tag,
      original_row_index: r.original_row_index,
      embedding: allEmbeddings[idx],
    }));

    const { error: embedUpdateError } = await supabase
      .from("conversation_responses")
      .upsert(updates, { onConflict: "id" });

    if (embedUpdateError) {
      await updateStatus("error", `Store embeddings failed: ${embedUpdateError.message}`);
      return NextResponse.json(
        { error: "Failed to store embeddings", details: embedUpdateError.message },
        { status: 500 },
      );
    }

    await updateStatus("analyzing");

    // Step B: UMAP
    const umap = new UMAP({ nComponents: 2, nNeighbors: 15, minDist: 0.1 });
    const coords = umap.fit(allEmbeddings) as number[][];

    // Step C: KMeans
    const k = Math.min(K, coords.length);
    const km = kmeans(coords, k);

    // Cluster stats
    const clusterStats: Record<
      number,
      { size: number; avgSim: number; samples: string[]; centroid: number[] }
    > = {};

    km.clusters.forEach((clusterIdx: number, i: number) => {
      if (!clusterStats[clusterIdx]) {
        clusterStats[clusterIdx] = {
          size: 0,
          avgSim: 0,
          samples: [],
          centroid: km.centroids[clusterIdx].centroid as number[],
        };
      }
      const entry = clusterStats[clusterIdx];
      entry.size += 1;
      entry.samples.push(responses[i].response_text);
      entry.avgSim += cosine(coords[i], entry.centroid);
    });

    Object.values(clusterStats).forEach((stat) => {
      stat.avgSim = stat.size ? stat.avgSim / stat.size : 0;
      stat.samples = stat.samples.slice(0, 10);
    });

    // Step E: persist clustering + coords
    const clusteringUpdates = responses.map((r, idx) => ({
      id: r.id,
      conversation_id: conversationId,
      response_text: r.response_text,
      tag: r.tag,
      original_row_index: r.original_row_index,
      cluster_index: km.clusters[idx],
      x_umap: coords[idx][0],
      y_umap: coords[idx][1],
      is_cluster_central: false,
    }));

    const { error: clusterUpdateError } = await supabase
      .from("conversation_responses")
      .upsert(clusteringUpdates);

    if (clusterUpdateError) {
      throw new Error("Failed to persist clustering");
    }

    // Step D: theme labeling
    await buildThemes(
      Object.entries(clusterStats).reduce((acc, [idx, val]) => {
        acc[Number(idx)] = {
          samples: val.samples,
          size: val.size,
          avgSim: val.avgSim,
        };
        return acc;
      }, {} as Record<number, { samples: string[]; size: number; avgSim: number }>),
      conversationId,
      supabase
    );

    const nextPhase =
      conversation.phase === "listen_open" || conversation.phase === "understand_open"
        ? "respond_open"
        : conversation.phase;

    await supabase
      .from("conversations")
      .update({
        analysis_status: "ready",
        analysis_error: null,
        phase: nextPhase,
      })
      .eq("id", conversationId);

    return NextResponse.json({ message: "Analysis complete", phase: nextPhase });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to analyze conversation";
    await updateStatus("error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
