# Deliberate Space

This module handles deliberate conversations - sentiment-based deliberation with 5-point voting.

## Overview

Deliberate conversations let users:
- Vote on statements with a 5-point scale (1=Strong aversion to 5=Deeply resonates)
- Add comments to statements (with optional anonymity)
- View aggregated sentiment (future)

## Key Components

### Server (`server/`)
- `createDeliberateSession.ts` - Create session with statements
- `getDeliberateViewModel.ts` - Build view model for discuss tab
- `voteOnStatement.ts` - Cast/update/remove votes
- `addComment.ts` - Add/delete comments

### React Hooks (`react/`)
- `useDeliberateSetupWizard.ts` - Wizard state management for creating deliberate sessions

### Schemas (`schemas.ts`)
- Zod validation for all inputs:
  - `createDeliberateSessionSchema` - Session creation
  - `voteOnStatementSchema` - Vote casting
  - `addCommentSchema` - Comment creation
  - `deleteCommentSchema` - Comment deletion

## Database Tables

- `deliberation_statements` - Statements to deliberate on
  - `conversation_id` - FK to conversations
  - `text` - Statement content
  - `display_order` - Ordering for UI
- `deliberation_votes` - User votes (1-5 scale)
  - `statement_id` - FK to statements
  - `user_id` - FK to auth.users
  - `value` - Vote value (1-5)
- `deliberation_comments` - Comments on statements
  - `statement_id` - FK to statements
  - `user_id` - FK to auth.users
  - `text` - Comment content
  - `is_anonymous` - Whether to hide author identity

## API Routes

- `POST /api/deliberate-space` - Create session
- `GET /api/deliberate-space/setup` - Get setup data from source (understand session)
- `GET /api/conversations/[id]/deliberate` - Get view model
- `POST /api/conversations/[id]/deliberate/votes` - Cast/update/remove vote
- `POST /api/conversations/[id]/deliberate/comments` - Add comment
- `DELETE /api/conversations/[id]/deliberate/comments` - Delete comment

## Vote Scale

The 5-point voting scale represents sentiment:

| Value | Meaning |
|-------|---------|
| 1 | Strong aversion |
| 2 | Disagree |
| 3 | Neutral |
| 4 | Agree |
| 5 | Deeply resonates |

Users can remove their vote by submitting `value: null`.

## Session Creation Modes

### From Scratch
- Admin enters statements manually
- No source conversation required

### From Understand (future)
- Extracts themes/statements from an understand session's report
- Links via `sourceConversationId` and `sourceReportVersion`

## Related Files

- Types: `types/deliberate.ts`
- Migration: `supabase/migrations/049_deliberate_tables.sql`
- UI Components:
  - `app/components/conversation/DiscussView.tsx`
  - `app/components/conversation/DiscussViewContainer.tsx`
  - `app/components/conversation/StatementListCard.tsx`
  - `app/components/conversation/StatementDetailPanel.tsx`
  - `app/components/conversation/VoteSlider.tsx`
  - `app/components/conversation/DeliberateCommentList.tsx`
  - `app/components/deliberate-setup-wizard.tsx`
