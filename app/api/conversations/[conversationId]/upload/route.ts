import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/serverClient";

type ConversationRow = {
  id: string;
  type: string;
  phase: string;
  analysis_status: string;
};

const MAX_ROWS = 1000;

const parseCsv = (text: string) => {
  // Minimal CSV parser with quoted field support
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        current.push(field);
        field = "";
      } else if (char === "\n") {
        current.push(field);
        rows.push(current);
        current = [];
        field = "";
      } else if (char === "\r") {
        // ignore
      } else {
        field += char;
      }
    }
  }
  // push last field/row
  if (field.length > 0 || current.length > 0) {
    current.push(field);
  }
  if (current.length) {
    rows.push(current);
  }

  return rows;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const supabase = supabaseServerClient();
  const { conversationId } = await params;

  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("id,type,phase,analysis_status")
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (convoError) {
    return NextResponse.json(
      { error: "Failed to load conversation" },
      { status: 500 },
    );
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (conversation.type !== "understand") {
    return NextResponse.json(
      { error: "Uploads allowed only for understand conversations" },
      { status: 400 },
    );
  }

  if (!["not_started", "error"].includes(conversation.analysis_status)) {
    return NextResponse.json(
      { error: "Conversation already processing or ready" },
      { status: 409 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Only .csv files are supported" }, { status: 400 });
  }

  const csvText = Buffer.from(await file.arrayBuffer()).toString("utf-8");
  const rows = parseCsv(csvText);

  if (rows.length < 2) {
    return NextResponse.json(
      { error: "CSV must include a header row and at least one data row" },
      { status: 400 },
    );
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const responseColIndex = header.findIndex((h) => h === "response" || h === "response_text");
  const tagColIndex = header.findIndex((h) => h === "tag");

  if (responseColIndex === -1) {
    return NextResponse.json(
      { error: "CSV must contain a 'response' column" },
      { status: 400 },
    );
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `CSV row limit exceeded (${MAX_ROWS} max)` },
      { status: 400 },
    );
  }

  const allowedTags = new Set([
    "data",
    "problem",
    "need",
    "want",
    "risk",
    "proposal",
  ]);

  const payload = dataRows
    .map((cols, idx) => {
      const response_text = cols[responseColIndex]?.trim() ?? "";
      const rawTag =
        tagColIndex >= 0 ? cols[tagColIndex]?.trim().toLowerCase() : "";
      const tag = allowedTags.has(rawTag) ? rawTag : "proposal";
      return {
        response_text,
        original_row_index: idx + 1,
        tag,
      };
    })
    .filter((row) => row.response_text.length > 0);

  if (!payload.length) {
    return NextResponse.json(
      { error: "No responses found in CSV" },
      { status: 400 },
    );
  }

  const { error: insertError } = await supabase
    .from("conversation_responses")
    .insert(
      payload.map((row) => ({
        conversation_id: conversationId,
        response_text: row.response_text,
        original_row_index: row.original_row_index,
        tag: row.tag,
      })),
    );

  if (insertError) {
    return NextResponse.json(
      {
        error: "Failed to insert responses",
        details: insertError.message ?? insertError,
        hint:
          "Check Supabase service key / RLS configuration and table schema (conversation_responses).",
      },
      { status: 500 },
    );
  }

  const { error: updateError } = await supabase
    .from("conversations")
    .update({ analysis_status: "not_started", analysis_error: null })
    .eq("id", conversationId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update conversation state" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    message: "Import successful, starting analysis",
    imported: payload.length,
  });
}
