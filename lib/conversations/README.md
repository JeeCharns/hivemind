# Conversations (Core Domain)

This module owns conversation lifecycle logic: creation, response collection, analysis, and reporting.

## Key Concepts

- Conversation types: `types/conversations.ts` (`"understand" | "decide"`)
- Phases: `types/conversations.ts` (e.g. `listen_open`, `report_open`)
- Analysis status: `types/conversations.ts` (`not_started` → `embedding` → `analyzing` → `ready`)

## New Session Flow (Create → Optional CSV → Analysis)

UI entrypoints:

- Wizard UI: `app/components/new-session-wizard.tsx`
- Launcher button/card: `app/components/new-session-launcher.tsx`
- Wizard state/logic: `lib/conversations/react/useNewSessionWizard.ts`

API + services:

1. Create conversation: `app/api/conversations/route.ts` → `lib/conversations/server/createConversation.ts`
2. Optional CSV import: `app/api/conversations/[conversationId]/upload/route.ts` → `lib/conversations/server/importResponsesFromCsv.ts`
3. Trigger analysis: `app/api/conversations/[conversationId]/analyze/route.ts` → `lib/conversations/server/enqueueConversationAnalysis.ts`

Notes:

- CSV imports are limited and validated in `lib/conversations/server/importResponsesFromCsv.ts` (row count, file size, required `response` column).
- Imports are idempotent via `import_batch_id`.
- Analysis runs asynchronously via the worker (`scripts/analysis-worker.ts`).

## Tabs (Listen / Understand / Result)

Server components assemble data and render client views:

- Listen: `app/hives/[hiveId]/conversations/[conversationId]/listen/page.tsx` → API feed at `app/api/conversations/[conversationId]/responses/route.ts`
- Understand: `app/hives/[hiveId]/conversations/[conversationId]/understand/page.tsx` → `lib/conversations/server/getUnderstandViewModel.ts`
- Result/Report: `app/hives/[hiveId]/conversations/[conversationId]/result/page.tsx` → `lib/conversations/server/getReportViewModel.ts`

## Tests

- Create conversation API: `app/tests/api/conversations-create.test.ts`
- Responses API + anonymity: `app/tests/api/responses.test.ts`
- CSV import: `lib/conversations/server/__tests__/importResponsesFromCsv.test.ts`
- Wizard hook: `lib/conversations/react/__tests__/useNewSessionWizard.test.tsx`

