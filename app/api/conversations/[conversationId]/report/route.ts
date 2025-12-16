/**
 * Conversation Report API Route
 *
 * POST - Generate a new report version using OpenAI
 * Requires authentication, admin role, and sufficient responses
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server/requireAuth";
import { supabaseServerClient } from "@/lib/supabase/serverClient";
import { requireHiveAdmin } from "@/lib/conversations/server/requireHiveAdmin";
import { canOpenReport } from "@/lib/conversations/domain/reportRules";
import { MIN_RESPONSES_FOR_REPORT } from "@/lib/conversations/domain/reportRules";
import { jsonError } from "@/lib/api/errors";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    // 1. Verify authentication
    const session = await getServerSession();
    if (!session) {
      return jsonError("Unauthorized: Not authenticated", 401);
    }

    const supabase = await supabaseServerClient();

    // 2. Get conversation with all necessary fields
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, hive_id, type, phase, analysis_status, title")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      return jsonError("Conversation not found", 404);
    }

    // 3. Verify admin membership
    try {
      await requireHiveAdmin(supabase, session.user.id, conversation.hive_id);
    } catch (_err) {
      return jsonError("Unauthorized: Admin access required", 403);
    }

    // 4. Validate conversation type
    if (conversation.type !== "understand") {
      return jsonError(
        "Reports can only be generated for 'understand' conversations",
        409
      );
    }

    // 5. Validate analysis status
    if (conversation.analysis_status !== "ready") {
      return jsonError(
        `Analysis must be ready before generating report (current: ${conversation.analysis_status})`,
        409
      );
    }

    // 6. Count responses and validate gate
    const { count: responseCount, error: countError } = await supabase
      .from("conversation_responses")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    if (countError) {
      return jsonError("Failed to count responses", 500);
    }

    const gate = canOpenReport(conversation.phase, responseCount || 0);
    if (!gate.allowed) {
      return jsonError(
        gate.reason || `Need at least ${MIN_RESPONSES_FOR_REPORT} responses`,
        409
      );
    }

    // 7. Fetch themes and responses for prompt building
    const [themesResult, responsesResult, feedbackResult] = await Promise.all([
      supabase
        .from("conversation_themes")
        .select("cluster_index, name, description, size")
        .eq("conversation_id", conversationId)
        .order("cluster_index", { ascending: true }),

      supabase
        .from("conversation_responses")
        .select("id, response_text, tag, cluster_index")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(100), // Limit for prompt size

      supabase
        .from("response_feedback")
        .select("response_id, feedback")
        .eq("conversation_id", conversationId),
    ]);

    if (themesResult.error || responsesResult.error || feedbackResult.error) {
      return jsonError("Failed to fetch conversation data", 500);
    }

    const themes = themesResult.data || [];
    const responses = responsesResult.data || [];
    const feedbackRows = feedbackResult.data || [];

    // 8. Build feedback summary
    const feedbackCounts = new Map<
      string,
      { agree: number; pass: number; disagree: number }
    >();

    responses.forEach((r) => {
      feedbackCounts.set(r.id, { agree: 0, pass: 0, disagree: 0 });
    });

    feedbackRows.forEach((fb) => {
      const counts = feedbackCounts.get(fb.response_id);
      if (counts) {
        if (fb.feedback === "agree") {
          counts.agree++;
        } else if (fb.feedback === "pass") {
          counts.pass++;
        } else if (fb.feedback === "disagree") {
          counts.disagree++;
        }
      }
    });

    // 9. Build OpenAI prompt
    const themesText = themes
      .map(
        (t) =>
          `Theme ${t.cluster_index}: ${t.name || "Untitled"}\n  Description: ${t.description || "N/A"}\n  Size: ${t.size || 0} responses`
      )
      .join("\n\n");

    const responsesText = responses
      .slice(0, 50) // Top 50 for prompt
      .map((r) => {
        const counts = feedbackCounts.get(r.id);
        return `- [${r.tag || "untagged"}] ${r.response_text}\n  Feedback: ${counts?.agree || 0} agree, ${counts?.pass || 0} pass, ${counts?.disagree || 0} disagree`;
      })
      .join("\n\n");

    const prompt = `You are generating an executive summary report for a conversation titled "${conversation.title || "Untitled Conversation"}".

The conversation has ${responseCount} total responses organized into ${themes.length} themes.

**Themes:**
${themesText}

**Sample Responses with Feedback:**
${responsesText}

Generate a comprehensive HTML executive summary report that:
1. Summarizes the key themes and insights
2. Highlights areas of strong agreement
3. Identifies divisive or contentious points
4. Provides actionable recommendations

Format the output as clean HTML with proper headings, paragraphs, and lists. Use semantic HTML5 tags. Make it professional and easy to read.`;

    // 10. Call OpenAI (using environment variable for API key)
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return jsonError("OpenAI API key not configured", 500);
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an expert at synthesizing conversation data into executive summaries.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!openaiResponse.ok) {
      console.error("[POST report] OpenAI error:", await openaiResponse.text());
      return jsonError("Failed to generate report with AI", 500);
    }

    const openaiData = await openaiResponse.json();
    const reportHtml = openaiData.choices?.[0]?.message?.content || "";

    if (!reportHtml) {
      return jsonError("AI generated empty report", 500);
    }

    // 11. Determine next version number
    const { data: latestVersion } = await supabase
      .from("conversation_reports")
      .select("version")
      .eq("conversation_id", conversationId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latestVersion?.version || 0) + 1;

    // 12. Insert new report version
    const { data: newReport, error: insertError } = await supabase
      .from("conversation_reports")
      .insert({
        conversation_id: conversationId,
        version: nextVersion,
        html: reportHtml,
        created_by: session.user.id,
      })
      .select("version, html, created_at")
      .maybeSingle();

    if (insertError || !newReport) {
      console.error("[POST report] Insert error:", insertError);
      return jsonError("Failed to save report", 500);
    }

    // 13. Update conversation.report_json with latest HTML
    await supabase
      .from("conversations")
      .update({ report_json: reportHtml })
      .eq("id", conversationId);

    // 14. Optionally advance phase if gate says "advance"
    if (gate.reason === "advance" && conversation.phase !== "report_open") {
      await supabase
        .from("conversations")
        .update({ phase: "report_open" })
        .eq("id", conversationId);
    }

    // 15. Return new report
    return NextResponse.json({
      report: newReport.html,
      version: newReport.version,
      createdAt: newReport.created_at,
    });
  } catch (error) {
    console.error("[POST report] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
