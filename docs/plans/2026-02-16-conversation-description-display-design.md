# Conversation Description Display

**Date:** 2026-02-16
**Status:** Approved

## Overview

Add an expandable description display directly below the conversation title in `ConversationHeader`. The description shows 1-2 lines initially with inline "Show more" expansion when content is truncated.

## Behaviour

1. **Position**: Directly below the `<h1>` title, before the tabs row
2. **Initial state**: 2-line clamp with CSS `line-clamp-2`
3. **Expansion**: Inline toggle - "Show more" / "Show less" link at end of text
4. **Empty state**: If `description` is null/empty, render nothing (no placeholder)
5. **Truncation detection**: Only show "Show more" if text actually overflows

## Visual Design

```
← All sessions

Why do our customers leave after 3 months?
We want to understand the primary drivers of customer churn,
particularly focusing on the onboarding experience and... Show more

[Listen] [Understand] [Result]                           Share
```

## Technical Approach

1. **Add `description` prop** to `ConversationHeader` interface (optional string)
2. **Create `ExpandableDescription` component**:
   - Uses `useRef` to measure overflow (`scrollHeight > clientHeight`)
   - `useState` for expanded/collapsed state
   - `line-clamp-2` when collapsed, no clamp when expanded
   - "Show more" / "Show less" link styled as subtle inline link
3. **Pass description from layout** - already available in conversation data

## Styling

- Text: `text-body text-text-secondary`
- Link: `text-brand-primary hover:underline cursor-pointer`
- Spacing: `mt-1` below title
- Max-width matches title for visual alignment

## Files Changed

- `app/components/conversation/ConversationHeader.tsx` - add description prop and rendering
- `app/hives/[hiveId]/conversations/[conversationId]/layout.tsx` - pass description to header
