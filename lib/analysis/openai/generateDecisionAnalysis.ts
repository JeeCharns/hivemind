/**
 * Decision Analysis Generator with OpenAI
 *
 * Generates AI-powered analysis of decision voting results.
 * Follows patterns from statementSynthesizer.ts:
 * - Client injection for testability
 * - Graceful error handling with fallback
 * - Structured prompt engineering
 */

import type OpenAI from "openai";
import type { ProposalRanking } from "@/types/decision-space";

export interface GenerateDecisionAnalysisInput {
  sessionTitle: string;
  rankings: ProposalRanking[];
  previousRankings: ProposalRanking[] | null;
  sourceConsensusData: { statementText: string; agreePercent: number }[];
  roundNumber: number;
  totalVoters: number;
}

/**
 * Generate AI analysis of decision results
 *
 * @param client - OpenAI client (injected for testability)
 * @param input - Decision results data
 * @returns AI-generated analysis in markdown format
 */
export async function generateDecisionAnalysis(
  client: OpenAI,
  input: GenerateDecisionAnalysisInput
): Promise<string> {
  const {
    sessionTitle,
    rankings,
    previousRankings,
    sourceConsensusData,
    roundNumber,
    totalVoters,
  } = input;

  // Edge case: no rankings
  if (rankings.length === 0) {
    return "No voting data available for analysis.";
  }

  const topResults = rankings.slice(0, 5);
  const minorityResults = rankings.filter(
    (r) => r.votePercent >= 10 && r.rank > 3
  );

  const prompt = `You are analysing the results of a group decision-making session titled "${sessionTitle}".

## Voting Results (Round ${roundNumber})

Total voters: ${totalVoters}

### Top Outcomes (by vote count):
${topResults.map((r) => `${r.rank}. "${r.statementText}" - ${r.totalVotes} votes (${r.votePercent}%)${r.changeFromPrevious !== undefined ? ` [${r.changeFromPrevious > 0 ? "+" : ""}${r.changeFromPrevious} from previous round]` : ""}`).join("\n")}

${
  minorityResults.length > 0
    ? `### Notable Minority Positions (10%+ votes but not top 3):
${minorityResults.map((r) => `- "${r.statementText}" - ${r.totalVotes} votes (${r.votePercent}%)`).join("\n")}`
    : ""
}

${
  sourceConsensusData.length > 0
    ? `### Original Consensus Data (from understand session):
${sourceConsensusData
  .slice(0, 10)
  .map(
    (s) =>
      `- "${s.statementText.substring(0, 100)}${s.statementText.length > 100 ? "..." : ""}" - ${s.agreePercent}% agreement`
  )
  .join("\n")}`
    : ""
}

${
  previousRankings
    ? `### Comparison to Previous Round:
${rankings
  .slice(0, 5)
  .map((r) => {
    const change = r.changeFromPrevious;
    if (change === undefined) return "";
    if (change > 0)
      return `- "${r.statementText.substring(0, 50)}${r.statementText.length > 50 ? "..." : ""}" moved UP ${change} position(s)`;
    if (change < 0)
      return `- "${r.statementText.substring(0, 50)}${r.statementText.length > 50 ? "..." : ""}" moved DOWN ${Math.abs(change)} position(s)`;
    return `- "${r.statementText.substring(0, 50)}${r.statementText.length > 50 ? "..." : ""}" stayed at same position`;
  })
  .filter(Boolean)
  .join("\n")}`
    : ""
}

---

Generate a decision analysis document with these sections:

## Decision Summary
1-2 paragraphs summarizing what was decided, participation, and vote distribution.

## Top Outcomes
Explain the top 3-5 voted items and why they may have resonated with the group.

## Minority Perspectives
Acknowledge items that received significant (10%+) votes but didn't win. These represent important dissent.

## Comparison to Original Consensus
How do the voting results align with the original understand session's feedback consensus? Note any interesting validations or tensions.

## Recommended Next Steps
Concrete actionable items based on results.

## Suggested Follow-up Sessions
Recommend 2-3 specific Hivemind sessions to continue the process, such as:
- "Run an understand session to explore [topic] further"
- "Create a decide session focused on implementation options for [winning proposal]"
- "Gather feedback on [area of tension] before proceeding"

Keep the analysis concise but actionable. Use markdown formatting.`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that analyzes group decision-making results. You provide actionable insights while acknowledging minority perspectives.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    return content;
  } catch (error) {
    console.error("[generateDecisionAnalysis] Failed:", error);

    // Fallback: generate basic markdown summary
    return generateFallbackAnalysis(input);
  }
}

/**
 * Generate a basic fallback analysis when AI generation fails
 */
function generateFallbackAnalysis(
  input: GenerateDecisionAnalysisInput
): string {
  const { sessionTitle, rankings, roundNumber, totalVoters } = input;

  const topResults = rankings.slice(0, 3);

  return `# Decision Analysis: ${sessionTitle}

## Decision Summary
Round ${roundNumber} completed with ${totalVoters} participants. The group distributed their votes across ${rankings.length} proposals.

## Top Outcomes
${topResults
  .map(
    (r, i) =>
      `${i + 1}. **${r.statementText}** - ${r.totalVotes} votes (${r.votePercent}%)`
  )
  .join("\n")}

## Recommended Next Steps
- Review the top voted outcomes
- Consider implementation planning for winning proposals
- Gather additional feedback if needed

*Note: Detailed AI analysis unavailable. This is a basic summary of voting results.*`;
}
