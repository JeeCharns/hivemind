# Typography Migration - Remaining Files Batch Guide

This document provides specific find-and-replace patterns for each remaining file that needs typography migration.

## Quick Migration Reference

### Common Replacements

| Find | Replace | Notes |
|------|---------|-------|
| `text-[24px] leading-[31px] font-medium text-[#172847]` | `text-h2 text-text-primary` | Page titles |
| `text-3xl font-semibold text-[#172847]` | `text-h1 text-text-primary` | Large headings |
| `text-2xl font-semibold text-[#172847]` | `text-h2 text-text-primary` | Section headings |
| `text-lg font-semibold text-[#172847]` | `text-h4 text-text-primary` | Card headings |
| `text-lg font-medium text-slate-900` | `text-h4 text-slate-900` | Subsection headings |
| `text-sm font-medium text-[#172847]` | `text-subtitle text-text-primary` | Emphasized text |
| `text-sm font-medium text-slate-800` | `text-subtitle text-slate-800` | Menu items, card text |
| `text-sm text-[#566175]` | `text-body text-text-secondary` | Secondary body text |
| `text-sm text-[#566888]` | `text-body text-text-muted` | Muted descriptions |
| `text-xs font-semibold` | `text-label` | Tags, badges, form labels |
| `text-xs text-slate-500` | `text-info text-slate-500` | Helper text |
| `text-[12px] font-medium` | `text-label` | Small UI labels |
| `text-[14px] leading-5 font-normal` | `text-body` | Standard body text |
| `text-[16px] font-medium` | `text-subtitle` | Emphasized body |
| `text-xs text-slate-500 uppercase tracking-wide font-medium` | `text-allcaps text-slate-500` | Section headers |
| `style={{ fontFamily: "'Space Grotesk', Inter, system-ui" }}` | *(remove, use `font-display` class)* | Inline font styles |
| `text-[#172847]` | `text-text-primary` | Primary text color |
| `text-[#566175]` or `text-[#566888]` | `text-text-secondary` or `text-text-muted` | Secondary text colors |
| `text-[#9498B0]` | `text-text-tertiary` | Tertiary text color |
| `text-[#A0AEC0]` | `text-text-disabled` | Disabled/placeholder |
| `text-[#3A1DC8]` | `text-brand-primary` | Brand color |

## File-by-File Migration Instructions

### 1. app/components/conversation/ListenView.tsx

**Priority:** High
**Complexity:** Medium
**Estimated Changes:** ~20 instances

#### Specific Replacements:

```tsx
// Line ~169: Tag buttons
- className={`px-3 rounded-full text-sm font-medium border transition ${active}`}
+ className={`px-3 rounded-full text-button border transition ${active}`}

// Line ~186-189: Status pills
- <span className="text-emerald-700 font-medium text-sm">
+ <span className="text-emerald-700 text-subtitle">

- <span className="text-emerald-600 text-sm">
+ <span className="text-emerald-600 text-body">

// Line ~195: Link
- className="text-emerald-700 hover:text-emerald-800 font-medium text-sm underline"
+ className="text-emerald-700 hover:text-emerald-800 text-subtitle underline"

// Line ~207: Status text
- <span className="text-indigo-700 text-sm">
+ <span className="text-indigo-700 text-body">

// Line ~244: Response author name
- <p className="text-sm font-medium text-[#172847] truncate">
+ <p className="text-subtitle text-text-primary truncate">

// Line ~247: Timestamp
- <p className="text-xs text-[#566888]">
+ <p className="text-info text-text-muted">

// Line ~271: Textarea
- className="w-full h-32 border border-slate-200 rounded-lg p-3 pb-8 text-sm text-slate-900 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
+ className="w-full h-32 border border-slate-200 rounded-lg p-3 pb-8 text-body text-slate-900 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"

// Line ~273: Character count
- <span className="absolute bottom-2 left-3 text-xs text-slate-500">
+ <span className="absolute bottom-2 left-3 text-info text-slate-500">

// Line ~281, 292: Post as button text
- <span className="text-[12px] font-medium text-[#172847]">
+ <span className="text-label text-text-primary">

// Line ~304, 340: Avatar initials
- <span className="w-6 h-6 rounded-full bg-slate-200 inline-flex items-center justify-center text-[11px] text-slate-600">
+ <span className="w-6 h-6 rounded-full bg-slate-200 inline-flex items-center justify-center text-label-sm text-slate-600">

// Line ~309, 343: Dropdown labels
- <span className="text-[12px] max-w-32 truncate text-left">
+ <span className="text-label max-w-32 truncate text-left">

// Line ~334: Dropdown items
- className={`w-full px-3 py-2 justify-start flex items-center gap-2 text-left text-sm hover:bg-slate-50 ${
+ className={`w-full px-3 py-2 justify-start flex items-center gap-2 text-left text-body hover:bg-slate-50 ${

// Line ~336: Selected text color
- ? "text-[#3A1DC8] bg-indigo-50"
+ ? "text-brand-primary bg-indigo-50"

// Line ~366: Error message
- <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
+ <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body text-red-700">

// Line ~375: Section heading
- <h3 className="text-lg font-medium text-slate-900">
+ <h3 className="text-h4 text-slate-900">

// Line ~391: Empty state
- <div className="text-slate-500 text-sm">
+ <div className="text-slate-500 text-body">

// Line ~402: Response tags
- className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${getTagColors(
+ className={`px-2 py-0.5 rounded-full text-label border ${getTagColors(

// Line ~409, 412, 416: Response content
- <span className="text-sm font-medium text-slate-800">
+ <span className="text-subtitle text-slate-800">

- <span className="text-xs text-slate-400">
+ <span className="text-info text-slate-400">

- <p className="text-sm text-slate-800">
+ <p className="text-body text-slate-800">

// Line ~422: Like button
- className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-md ${
+ className={`flex items-center gap-1 text-subtitle px-2 py-1 rounded-md ${
```

### 2. app/components/conversation/ReportView.tsx

**Priority:** High
**Complexity:** Medium

#### Search for these patterns and update:
- `text-base leading-[22px] text-[#566888]` → `text-body-lg text-text-muted`
- `text-slate-800 font-medium` → `text-subtitle text-slate-800`
- Any hardcoded colors: `#172847`, `#566888`, `#3A1DC8`

### 3. app/components/conversation/UnderstandView.tsx

**Priority:** High
**Complexity:** High (uses Canvas with fontSize prop)

#### Note:
- Canvas text uses `fontSize` and `fontWeight` props, not className
- Update surrounding UI text, keep canvas as-is for now
- Focus on labels, headers, and description text

### 4. app/components/conversation/ConsensusMatrix.tsx

**Priority:** High
**Complexity:** Medium

#### Specific Replacements:
```tsx
// Large numbers
- text-3xl md:text-4xl font-medium font-display text-slate-900
+ text-display-sm md:text-display-md text-slate-900

// Labels
- text-xs md:text-sm font-medium
+ text-label md:text-body

// Chart row labels
- text-[10px] font-medium text-slate-500 leading-snug
+ text-pill text-slate-500

// Section heading
- text-slate-900 font-medium font-display text-lg
+ text-h4 text-slate-900
```

### 5. app/components/conversation/FrequentlyMentionedGroupCard.tsx

**Priority:** Medium
**Complexity:** Low

#### Specific Replacements:
```tsx
// Group label
- text-xs font-semibold
+ text-label

// Response text
- text-slate-800 leading-relaxed font-medium
+ text-subtitle text-slate-800 leading-relaxed
```

### 6. app/components/new-session-wizard.tsx

**Priority:** High
**Complexity:** High

#### Specific Replacements:
```tsx
// Step indicator
- text-sm text-[#566888]
+ text-body text-text-muted

// Title
- text-2xl font-semibold text-[#172847]
+ text-h2 text-text-primary

// Labels
- text-sm font-medium text-[#172847]
+ text-subtitle text-text-primary

// Descriptions
- text-sm text-[#566888]
+ text-body text-text-muted

// Error text
- text-xs text-red-600
+ text-info text-red-600

// Drag & drop area
- text-slate-900 font-medium
+ text-subtitle text-slate-900
```

### 7. app/hives/HivesHome.tsx

**Priority:** Medium
**Complexity:** Low

#### Specific Replacements:
```tsx
// Page title
- text-2xl font-semibold text-[#172847]
+ text-h2 text-text-primary

// Subtitle
- text-sm text-[#566175] text-center
+ text-body text-text-secondary text-center

// Card text
- text-sm font-medium text-slate-800
+ text-subtitle text-slate-800
```

### 8. app/(hives)/components/HiveCard.tsx & app/hives/components/HiveCard.tsx

**Priority:** Medium
**Complexity:** Low

#### Look for:
- Card titles: Use `text-h4` or `text-subtitle`
- Card descriptions: Use `text-body` or `text-body-sm`
- Labels/tags: Use `text-label`
- Meta info: Use `text-info`

## Automated Migration Script

For bulk replacements, you can use this sed command pattern (test on a copy first!):

```bash
# Example: Replace text-sm font-medium with text-subtitle
find app/components/conversation -name "*.tsx" -type f -exec sed -i.bak 's/text-sm font-medium text-slate-800/text-subtitle text-slate-800/g' {} \;

# Example: Replace hardcoded colors
find app -name "*.tsx" -type f -exec sed -i.bak 's/text-\[#172847\]/text-text-primary/g' {} \;
```

**Warning:** Always review changes manually after batch replacements. Context matters!

## Testing After Migration

For each file you update:

1. **Visual Check**
   ```bash
   npm run dev
   ```
   - Navigate to the component
   - Verify font sizes look correct
   - Check that Space Grotesk loads for headings/labels
   - Check that Inter loads for body text

2. **Type Check**
   ```bash
   npm run typecheck
   ```

3. **Lint Check**
   ```bash
   npm run lint
   ```

4. **Component-Specific Tests**
   - ListenView: Submit a response, check feed updates
   - ReportView: Verify report displays correctly
   - UnderstandView: Check visualization renders
   - ConsensusMatrix: Verify chart labels readable
   - Wizard: Step through creating a conversation

## Completion Checklist

Mark off as you complete each file:

**High Priority (All Complete!):**
- [x] app/components/conversation/ListenView.tsx ✅ Complete (~15 changes)
- [x] app/components/conversation/ReportView.tsx ✅ Complete (~8 changes)
- [x] app/components/conversation/UnderstandView.tsx ✅ Complete (~11 changes)
- [x] app/components/conversation/ConsensusMatrix.tsx ✅ Complete (~5 changes)
- [x] app/components/conversation/FrequentlyMentionedGroupCard.tsx ✅ Complete (~4 changes)
- [x] app/components/new-session-wizard.tsx ✅ Complete (~20 changes)
- [x] app/hives/HivesHome.tsx ✅ Complete (~3 changes)
- [x] app/(hives)/components/HiveCard.tsx ✅ Complete (1 change)
- [x] app/hives/components/HiveCard.tsx ✅ Complete (1 change)

**Medium Priority (Remaining):**
- [ ] app/(hives)/components/SettingsForm.tsx
- [ ] app/(hives)/components/InviteForm.tsx
- [ ] app/settings/**/*.tsx (multiple files)

## Getting Help

If you encounter issues:

1. Check [TYPOGRAPHY_SYSTEM.md](TYPOGRAPHY_SYSTEM.md) for token reference
2. Check [TYPOGRAPHY_CHEATSHEET.md](TYPOGRAPHY_CHEATSHEET.md) for quick patterns
3. Look at completed files for examples:
   - [app/components/input.tsx](../app/components/input.tsx) - Labels with Space Grotesk
   - [app/components/conversation/ConversationHeader.tsx](../app/components/conversation/ConversationHeader.tsx) - Headings and tabs
   - [app/(hives)/[hiveId]/page.tsx](../app/(hives)/[hiveId]/page.tsx) - Page layout with stats

## Post-Migration

After completing all files:

1. Run full test suite
2. Visual regression test (compare screenshots before/after)
3. Accessibility audit (check color contrast, heading hierarchy)
4. Update [TYPOGRAPHY_MIGRATION_SUMMARY.md](../TYPOGRAPHY_MIGRATION_SUMMARY.md) with completion status
5. Remove any backup files (*.bak)
6. Commit with descriptive message:
   ```bash
   git add .
   git commit -m "Complete typography system migration

   - Migrated all remaining components to use standardized tokens
   - All headings/labels now use Space Grotesk
   - All body text uses Inter
   - Colors use semantic tokens (text-text-primary, etc.)

   Closes #[issue-number]"
   ```
