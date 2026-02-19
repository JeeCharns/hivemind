# Welcome Hive & Social Homepage Design

**Date:** 2026-02-19
**Status:** Approved
**Goal:** Improve onboarding, retention, and growth by giving new users an immediate home with social features

---

## Overview

Every new user automatically joins a shared **Welcome Hive** where they can experience Hivemind's value firsthand. The hive homepage is enhanced with social features (presence, activity feed, reactions) that make the space feel alive and encourage return visits.

### Success Metrics

| Stage | Metric |
|-------|--------|
| Adoption | % of new users who view Welcome Hive |
| Participation | % who submit ≥1 response in Welcome Hive |
| Return | % who return within 7 days |
| Conversion | % who create their own hive |

---

## 1. Welcome Hive

### Purpose

Give every new user an immediate home where they can experience how collective decision-making works.

### Behaviour

- Created once as a system hive (seeded in database)
- All new users automatically become members on signup
- Contains one multi-step conversation: **"What should Hive build next?"**
  - **Phase 1 (Discuss):** Gather ideas, understand perspectives
  - **Phase 2 (Decide):** Vote on top proposals using quadratic voting
- Users can leave the Welcome Hive if they choose (existing Leave Hive feature)
- Conversation phases cycle: Discuss → Decide → Results → new round starts

### Content

- **Name:** "Welcome to Hivemind" (or similar)
- **Description:** "This is a shared space for all Hivemind users. Experience how collective decisions work, then create your own hive."

### Invite Flow Edge Case

When a new user signs up via an invite link to another hive:
- Silently add them to Welcome Hive
- Redirect to the invited hive (their intended destination)
- Welcome Hive appears in their hives list for later exploration

---

## 2. Multi-Step Conversation Card

### Purpose

Show the Discuss → Decide journey as a single unit with clear progress indication.

### Visual Structure

```
┌─────────────────────────────────────────────┐
│  "What should Hive build next?"             │
│                                             │
│  ◉ Discuss ──────── ○ Decide                │
│  (filled)           (empty/partial)         │
│                                             │
│  "42 ideas shared · Voting opens soon"      │
└─────────────────────────────────────────────┘
```

### Step Indicators

- Two circles (or hexagons for brand alignment) connected by a line
- **Empty:** Phase not started
- **Partial fill:** Phase in progress
- **Full fill:** Phase complete
- Labels below: "Discuss" and "Decide"

### Card Content

- Question title prominently displayed
- Step indicators showing progress
- Summary line: response count, phase status, or outcome teaser

### Click Interaction (Internal Bottom Sheet)

```
┌─────────────────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  ← Dark scrim
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
├─────────────────────────────────────────────┤
│  ◉ View Discussion          42 ideas →      │  ← Menu slides up
│  ○ View Decision            Vote now →      │
└─────────────────────────────────────────────┘
```

- Tap card → overlay slides up from bottom *inside* the card
- Dark scrim covers upper portion of card content
- Full-width menu with "View Discussion" / "View Decision" options
- Two options show step indicators + action hint
- Tap outside (on scrim) to dismiss
- Selecting an option navigates to the full conversation page

---

## 3. Hive Homepage Layout

### Structure

Two-column layout with main content area and right sidebar.

```
┌──────────────────────────────────────┬─────────────────────┐
│  Welcome to Hivemind                 │  Who's here         │
│  ─────────────────────               │  ● Sarah (active)   │
│  This is a shared space for all...   │  ● Mike (active)    │
│                                      │  ○ 12 others        │
│  ┌─────────────────────────────┐     │                     │
│  │ What should Hive build next?│     ├─────────────────────┤
│  │ ◉ Discuss ─── ○ Decide      │     │  Activity           │
│  │ 42 ideas · Voting soon      │     │  ─────────          │
│  └─────────────────────────────┘     │  Sarah joined       │
│                                      │  Mike voted         │
│  ┌─────────────────────────────┐     │  +3 new ideas       │
│  │ [Future conversation card]  │     │  Anna joined        │
│  └─────────────────────────────┘     │                     │
│                                      ├─────────────────────┤
│                                      │  Reactions          │
│  [ + New Conversation ]              │  🎉 Welcome!        │
│                                      │  👋 Hey everyone    │
│                                      │  [ Add reaction ]   │
└──────────────────────────────────────┴─────────────────────┘
```

### Main Area (Left)

- Hive header: name, description
- Multi-step conversation cards (grid or list)
- "New Conversation" button (for admins; hidden or disabled in Welcome Hive)

### Sidebar (Right)

- **Who's here:** Member presence
- **Activity:** Live feed of recent actions
- **Reactions:** Quick kudos/emoji wall

### Responsive Behaviour

- On mobile, sidebar collapses below main content or becomes a bottom sheet/tab

### Create Your Own Hive CTA

- Persistent CTA in Welcome Hive header or below conversations
- Copy: "Ready to start your own? **Create a Hive →**"
- After participating (submitted a response), show a more prominent prompt

---

## 4. Social Features

### Member Presence ("Who's Here")

**Data:**
- Track "last active" timestamp per user per hive
- "Active" = activity within last 5 minutes
- Update on: page view, response submitted, vote cast

**Display:**
- Show up to 3-4 active members with avatar + name
- Overflow: "+ N others online"
- Clicking expands to full member list (existing members page)

**Real-time:** Subscribe to presence channel via Supabase Realtime

---

### Activity Feed

**Events captured:**
- User joined hive
- Response submitted (anonymised: "Someone shared an idea")
- Vote cast (anonymised: "+1 vote on Decide")
- Phase transitions ("Voting is now open!")

**Display:**
- Chronological list, newest at top
- Relative timestamps ("2m ago", "just now")
- Max 10-15 items visible, older items fade or paginate

**Real-time:** Subscribe to hive activity channel, new events prepend to list

---

### Reaction Wall

**Purpose:** Lowest-friction participation — users can engage without committing to a full response.

**Mechanics:**
- Pre-set reactions: 👋 (wave), 🎉 (celebrate), 💡 (idea), ❤️ (love), 🐝 (on-brand)
- Users tap to add a reaction with optional short message (max 50 chars)
- Reactions display in a feed: "🎉 Sarah: Welcome everyone!"
- **Limit:** One reaction per user per emoji type

**Display:**
- Compact list of recent reactions
- "Add reaction" button opens emoji picker + optional message input

**Real-time:** Subscribe to reactions channel, new reactions prepend to list

---

## 5. Technical Implementation

### Database Changes

**New tables:**

```sql
-- Activity events (joins, responses, votes, phase changes)
CREATE TABLE hive_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id UUID REFERENCES hives(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'join', 'response', 'vote', 'phase_change'
  user_id UUID REFERENCES auth.users(id), -- nullable for anonymised events
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User reactions per hive
CREATE TABLE hive_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id UUID REFERENCES hives(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL, -- '👋', '🎉', '💡', '❤️', '🐝'
  message TEXT CHECK (char_length(message) <= 50),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(hive_id, user_id, emoji) -- one per type per user
);

-- User presence (or use Supabase Presence feature)
CREATE TABLE user_presence (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  hive_id UUID REFERENCES hives(id) ON DELETE CASCADE,
  last_active_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, hive_id)
);
```

### Welcome Hive Seeding

- Seed script creates the Welcome Hive with a known UUID (constant or env var)
- Creates linked Discuss + Decide conversations
  - Decide conversation has `source_conversation_id` pointing to Discuss conversation
- Run as part of migrations or deployment

### Auto-Join Logic

On signup (in auth flow):

```
1. User completes signup
2. Insert membership row for Welcome Hive (WELCOME_HIVE_ID constant)
3. If invite token present in session → also join invited hive
4. Redirect to invited hive (if exists) or Welcome Hive
```

### Real-time Subscriptions

**Channels needed:**
- `hive:{hiveId}:presence` — who's online (Supabase Presence or Broadcast)
- `hive:{hiveId}:activity` — live activity feed (Postgres changes on hive_activity)
- `hive:{hiveId}:reactions` — new reactions (Postgres changes on hive_reactions)

### Multi-Step Card Data

**Fetching:**
- Query conversations with their `source_conversation_id` to identify linked pairs
- Return both conversations together for card rendering
- Card component receives: discuss conversation + decide conversation + their statuses

---

## 6. Scope Summary

| Component | Included |
|-----------|----------|
| Welcome Hive (auto-join, seeding) | ✅ |
| Multi-step conversation card | ✅ |
| Internal bottom sheet menu | ✅ |
| Homepage two-column layout | ✅ |
| Member presence sidebar | ✅ |
| Activity feed sidebar | ✅ |
| Reaction wall sidebar | ✅ |
| "Create Your Own Hive" CTA | ✅ |
| Responsive/mobile layout | ✅ |
| Real-time updates | ✅ |

---

## 7. Out of Scope (Future)

- Email notifications for activity
- Gamification / badges
- Hive-to-hive connections (Hive Cluster)
- Video walkthrough
- Quick participation from homepage (always navigate into conversation)
