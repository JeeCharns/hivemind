/**
 * Explore Report Prompt
 *
 * Generates the prompt for explore conversation reports.
 * Unlike understand reports, explore reports don't include voting data.
 */

export interface ExploreReportPromptData {
  title: string;
  responseCount: number;
  participantCount: number;
  themes: Array<{
    name: string;
    description: string;
    size: number;
  }>;
  consolidatedStatements: Array<{
    statement: string;
    responseCount: number;
  }>;
  sampleResponses: string[];
}

export function buildExploreReportPrompt(
  data: ExploreReportPromptData
): string {
  const themesText = data.themes
    .map(
      (t) =>
        `- ${t.name || "Untitled"}: ${t.description || "N/A"} (${t.size || 0} responses)`
    )
    .join("\n");

  const statementsText = data.consolidatedStatements
    .map((s) => `- "${s.statement}" (from ${s.responseCount} responses)`)
    .join("\n\n");

  const sampleResponsesText = data.sampleResponses
    .map((r) => `- "${r}"`)
    .join("\n");

  return `# Conversation: ${data.title || "Untitled Conversation"}

## Participants
- ${data.participantCount} total participants
- ${data.responseCount} responses collected

## Themes
${themesText || "No themes identified."}

## Consolidated Statements
${statementsText || "No statements yet."}

## Sample of Participant Responses
${sampleResponsesText || "No responses available."}

---

Write a narrative executive summary of this conversation for its participants.
Do not simply list statements — synthesise, draw connections, and explain
what the collective voice is saying.

Structure the document with the following sections (using HTML headings):
1. Executive Summary — a concise overview of the conversation, participation, and headline findings
2. Key Themes — the main themes that emerged, with narrative connecting them
3. Common Perspectives — the most commonly expressed viewpoints, with context about what participants are saying
4. Recommended Next Steps — actionable suggestions for what the group should do next. Consider recommending:
   - Running a follow-up session to explore specific themes in more depth
   - Areas that need further discussion or clarification
   Be specific about which statements or themes each recommendation relates to.

Use whatever writing style best communicates each point — narrative prose, lists, or a mix.`;
}

export const EXPLORE_REPORT_SYSTEM_PROMPT =
  "You are a skilled analyst writing for participants of a collective conversation. Your role is to help them understand what the group collectively expressed. Write in a natural narrative style — not a list of results, but a cohesive document that synthesises findings, draws connections between themes, and surfaces meaningful insights. Use a neutral, evidence-grounded tone. Output valid HTML only — no markdown, no code fences, no preamble. Scale the depth and length of your writing to match the complexity of the data: a small simple conversation warrants a focused summary, a large complex one warrants deeper analysis.";
