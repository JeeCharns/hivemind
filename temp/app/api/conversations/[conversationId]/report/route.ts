import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { openai } from "@/lib/openai/client";
import { getCurrentUserProfile } from "@/lib/utils/user";
import { canOpenReport } from "@/lib/utils/report-rules";

export const runtime = "nodejs";

type ConversationRow = {
  id: string;
  hive_id: string;
  type: string;
  phase: string;
  analysis_status: string;
  report_json: unknown | null;
  title: string | null;
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const supabase = supabaseServerClient();
  const currentUser = await getCurrentUserProfile(supabase);
  const userId = currentUser?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("id,hive_id,type,phase,analysis_status,report_json,title")
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
      { error: "Report generation only for understand conversations" },
      { status: 400 }
    );
  }

  // Ensure report phase opens automatically when enough responses are present
  const { count: responseCount, error: countError } = await supabase
    .from("conversation_responses")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id);

  if (countError) {
    return NextResponse.json(
      { error: "Failed to count responses" },
      { status: 500 }
    );
  }

  const reportGate = canOpenReport(conversation.phase, responseCount);
  if (!reportGate.allowed) {
    return NextResponse.json({ error: reportGate.reason }, { status: 409 });
  }
  if (reportGate.reason === "Advance phase to report_open") {
    const { error: phaseError } = await supabase
      .from("conversations")
      .update({ phase: "report_open" })
      .eq("id", conversation.id);
    if (!phaseError) conversation.phase = "report_open";
  }

  if (conversation.analysis_status !== "ready") {
    return NextResponse.json(
      { error: "Analysis must be ready before generating a report" },
      { status: 409 }
    );
  }

  const { data: membership } = await supabase
    .from("hive_members")
    .select("role")
    .eq("hive_id", conversation.hive_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can generate reports" },
      { status: 403 }
    );
  }

  const [{ data: themes }, { data: responses }, { data: feedback }] =
    await Promise.all([
      supabase
        .from("conversation_themes")
        .select("cluster_index,name,description,size")
        .eq("conversation_id", conversation.id)
        .order("cluster_index", { ascending: true }),
      supabase
        .from("conversation_responses")
        .select("id,cluster_index,response_text,tag")
        .eq("conversation_id", conversation.id),
      supabase.from("response_feedback").select("response_id,feedback"),
    ]);

  if (!responses || responses.length === 0) {
    return NextResponse.json(
      { error: "No responses available to generate a report" },
      { status: 400 }
    );
  }

  const feedbackMap: Record<
    number,
    { agree: number; pass: number; disagree: number }
  > = {};
  feedback?.forEach(
    (row: { response_id: number; feedback: "agree" | "pass" | "disagree" }) => {
      if (!feedbackMap[row.response_id]) {
        feedbackMap[row.response_id] = { agree: 0, pass: 0, disagree: 0 };
      }
      feedbackMap[row.response_id][row.feedback] += 1;
    }
  );

  const themedResponses =
    (responses ?? []).map(
      (r: {
        id: number;
        cluster_index: number;
        response_text: string;
        tag: string | null;
      }) => ({
        id: r.id,
        cluster_index: r.cluster_index,
        response_text: r.response_text,
        tag: r.tag,
        counts: feedbackMap[r.id] ?? { agree: 0, pass: 0, disagree: 0 },
      })
    ) ?? [];

  const responseSummaries = themedResponses.map((resp) => {
    const { agree = 0, pass = 0, disagree = 0 } = resp.counts;
    const totalVotes = agree + pass + disagree;
    const agreementScore =
      totalVotes === 0
        ? 0
        : Math.round((agree / Math.max(1, totalVotes)) * 100);
    return {
      id: resp.id,
      clusterIndex: resp.cluster_index,
      tag: resp.tag,
      text: resp.response_text,
      totalVotes,
      agreementScore,
      counts: resp.counts,
    };
  });

  const prompt = [
    {
      role: "system" as const,
      content:
        "You are a facilitator summarizing survey responses. Generate a concise HTML report (no markdown code fences) with exactly these sections: <h3>Executive Summary</h3>, <h3>Key Areas of Agreement</h3>, <h3>Contention Points</h3>, <h3>Recommended Next Steps</h3>. Use clear paragraphs and bullet lists (<ul><li>) where helpful. Base all insights only on the provided responses and tags. Keep language succinct and avoid repeating similar points.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        title: conversation.title,
        themes: themes ?? [],
        responses: responseSummaries.slice(0, 200), // trim to reasonable size
      }),
    },
  ];

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-5.1",
      temperature: 0.2,
      messages: prompt,
    });

    const content = (chat.choices[0]?.message?.content ?? "").replace(
      /```(?:html)?|```/gi,
      ""
    );
    const bodyHtml =
      content.trim() ||
      "<p>Unable to generate a report from the available responses.</p>";

    const titleText =
      conversation.title?.trim() || `Conversation ${conversation.id}`;
    const generatedOn = new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    });

    const styleBlock = `<style>
.report-doc { font-family: "Times New Roman", serif; color: #111827; line-height: 1.6; }
.report-doc h1 { font-size: 28px; margin: 0 0 12px; font-weight: 600; }
.report-doc .meta { margin: 0 0 24px; color: #4b5563; font-size: 14px; }
.report-doc h2 { font-size: 22px; margin: 28px 0 14px; font-weight: 600; }
.report-doc h3 { font-size: 18px; margin: 24px 0 12px; font-weight: 600; }
.report-doc p { margin: 0 0 14px; }
.report-doc ul { margin: 0 0 16px 20px; padding: 0; }
.report-doc li { margin: 6px 0; }
</style>`;

    const reportHtml = `${styleBlock}<div class="report-doc"><h1>${escapeHtml(
      titleText
    )} — Executive Summary</h1><p class="meta">Generated on ${escapeHtml(
      generatedOn
    )}</p>${bodyHtml}</div>`;

    const { data: latestVersionRow, error: versionFetchError } = await supabase
      .from("conversation_reports")
      .select("version")
      .eq("conversation_id", conversation.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (versionFetchError) {
      return NextResponse.json(
        { error: "Generated but failed to read report versions" },
        { status: 500 }
      );
    }

    const nextVersion = (latestVersionRow?.version ?? 0) + 1;

    const { error: insertVersionError } = await supabase
      .from("conversation_reports")
      .insert({
        conversation_id: conversation.id,
        version: nextVersion,
        html: reportHtml,
        created_by: userId,
      });

    if (insertVersionError) {
      return NextResponse.json(
        { error: "Generated but failed to save report version" },
        { status: 500 }
      );
    }

    const { error: updateError } = await supabase
      .from("conversations")
      .update({ report_json: reportHtml })
      .eq("id", conversation.id);

    if (updateError) {
      return NextResponse.json(
        { error: "Generated but failed to save report" },
        { status: 500 }
      );
    }

    return NextResponse.json({ report: reportHtml, version: nextVersion });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
