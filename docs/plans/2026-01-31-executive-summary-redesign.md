# Executive Summary Redesign

**Date:** 2026-01-31
**Status:** Approved

## Overview

Redesign the executive summary from a rigid, list-based output (GPT-4, fixed sections with 3 items each) into a free-form narrative document that explains the collective will of participants. Uses Claude Sonnet 4 via the Anthropic API.

## Goals

- Produce a cohesive narrative, not a list of results
- Draw connections between themes and surface meaningful insights
- Adapt length and depth to the complexity of the conversation data
- Use a neutral reporter tone with empathetic warmth where appropriate
- Ground all claims in specific vote data

## Model Choice

**Claude Sonnet 4** (`claude-sonnet-4-20250514`) via `@anthropic-ai/sdk`.

Selected for strong performance in synthesising disparate data into cohesive narrative, natural tone control, and nuanced writing. Replaces GPT-4 via OpenAI.

## Prompt Design

### System Message

> You are a skilled analyst writing for participants of a collective conversation. Your role is to help them understand what the group collectively expressed. Write in a natural narrative style — not a list of results, but a cohesive document that synthesises findings, draws connections between themes, and surfaces meaningful insights. Use a neutral, evidence-grounded tone that shifts to empathetic warmth when discussing points of genuine concern or division. Always reference specific vote data to support your narrative (e.g. "78% agreed that..."). Output valid HTML only — no markdown, no code fences. Scale the depth and length of your writing to match the complexity of the data: a small simple conversation warrants a focused summary, a large complex one warrants deeper analysis.

### User Message Structure

```
# Conversation: {title}
{description}

## Participants
- {totalParticipants} total participants
- {uniqueVoters} voted on statements
- {totalStatements} consolidated statements
- {voteCoveragePercent}% vote coverage

## Themes
{for each theme: name, description, number of participants}

## Consolidated Statements with Votes
{for each statement: text, theme, agree/pass/disagree counts and percentages, total votes}

## Sample of Participant Responses
{up to 50 raw responses, sampled across themes}

---

Write a narrative executive summary of this conversation for its participants.
Do not simply list statements — synthesise, draw connections, and explain
what the collective voice is saying. Cover what the data warrants: areas of
agreement, points of division, cross-theme connections, notable minority
viewpoints, and the overall direction of the group.
```

### Data Passed to the Model

- Conversation title and description
- All themes with descriptions and participant counts
- All consolidated statements with full vote breakdowns (agree/pass/disagree counts and percentages)
- Up to 50 raw responses, sampled proportionally across themes
- Summary statistics (total participants, voters, statements, vote coverage)

## Technical Implementation

### New Dependency

```bash
npm install @anthropic-ai/sdk
```

### New Environment Variable

```
ANTHROPIC_API_KEY=sk-ant-...
```

Required in `.env.local` and production environment (Vercel, etc.). Obtain from [console.anthropic.com](https://console.anthropic.com).

### New File: `lib/ai/anthropic.ts`

Thin client wrapper for initialising the Anthropic SDK, consistent with existing patterns.

### Changes to Report Route

**File:** `app/api/conversations/[conversationId]/report/route.ts`

1. Replace OpenAI `chat/completions` call with Anthropic `messages.create`
2. Model: `claude-sonnet-4-20250514`
3. `max_tokens`: 8000 (allows adaptive length up to ~5,000 words)
4. Temperature: 0.4 (grounded synthesis, not creative embellishment)
5. Build new prompt structure (system + user message with data and instructions)
6. Remove 100-response cap; add sampling function for up to 50 raw responses distributed across themes
7. Pass all consolidated statements with full vote data (no cap)
8. Keep existing HTML post-processing, sanitisation, and versioning pipeline

### No Changes To

- UI components (`ReportView.tsx`, `ConsensusMatrix.tsx`)
- Database schema or versioning system
- Download functionality
- Result page structure

## Migration

- Existing report versions in the database are unaffected (still viewable via version selector)
- OpenAI code for summary generation removed entirely (not used elsewhere)
- If `ANTHROPIC_API_KEY` is not set, the route returns a clear error message

## Scope Summary

- One new dependency (`@anthropic-ai/sdk`)
- One new env var (`ANTHROPIC_API_KEY`)
- One new file (`lib/ai/anthropic.ts`)
- Modifications to the report route (prompt, model call, data assembly)
- No UI changes, no DB changes, no new routes
