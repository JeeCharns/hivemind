# Typography System

## Overview

The Hivemind app now has a standardized typography system configured in [tailwind.config.ts](../tailwind.config.ts:14-44) and [app/globals.css](../app/globals.css:17-98). This system provides consistent font sizes, weights, line heights, and spacing across the entire application.

## Typography Tokens

### Display Sizes
Large, attention-grabbing text for hero sections and major headings.

- `text-display-lg` - 60px, line-height 1.1, -0.02em tracking, font-weight 600, uses Space Grotesk
- `text-display-md` - 48px, line-height 1.1, -0.02em tracking, font-weight 600, uses Space Grotesk
- `text-display-sm` - 32px, line-height 1.2, -0.01em tracking, font-weight 600, uses Space Grotesk

### Headings
Structured heading hierarchy for content organization.

- `text-h1` - 30px (1.875rem), line-height 1.3, -0.01em tracking, font-weight 600, uses Space Grotesk
- `text-h2` - 24px (1.5rem), line-height 1.3, -0.01em tracking, font-weight 600, uses Space Grotesk
- `text-h3` - 20px (1.25rem), line-height 1.4, font-weight 600, uses Space Grotesk
- `text-h4` - 18px (1.125rem), line-height 1.4, font-weight 600, uses Space Grotesk

### Body Text
Standard content text in varying sizes.

- `text-body-lg` - 16px (1rem), line-height 1.5, font-weight 400
- `text-body` - 14px (0.875rem), line-height 1.5, font-weight 400
- `text-body-sm` - 13px (0.8125rem), line-height 1.4, font-weight 400

### UI Elements
Specialized text for interface components.

- `text-subtitle` - 14px medium weight for emphasized body text
- `text-label` - 12px semibold for form labels and tags
- `text-label-sm` - 11px semibold for small labels
- `text-pill` - 10px semibold for badges and pills
- `text-button-lg` - 16px medium for large buttons
- `text-button` - 14px medium for standard buttons
- `text-button-sm` - 14px medium for small buttons
- `text-allcaps` - 12px medium uppercase with 0.05em tracking for section headers
- `text-info` - 12px normal for helper text and metadata

## Color Tokens

### Text Colors
Standardized text color palette.

- `text-text-primary` - #172847 (dark navy, main content)
- `text-text-secondary` - #566175 (muted gray-blue, secondary content)
- `text-text-tertiary` - #9498B0 (light gray-blue, tertiary content)
- `text-text-muted` - #566888 (muted blue-gray, de-emphasized content)
- `text-text-disabled` - #A0AEC0 (placeholder text, disabled states)

### Brand Colors
- `text-brand-primary` - #3A1DC8 (primary brand purple)
- `bg-brand-primary` - #3A1DC8
- `border-brand-primary` - #3A1DC8
- `ring-brand-primary` - #3A1DC8 (for focus rings, use with opacity like `/20`)

## Font Families

- `font-sans` - Inter (default, for body text)
- `font-display` - Space Grotesk (for headings and labels)

## Migration Guide

### Before (Old Patterns)

```tsx
// ❌ Old: Arbitrary sizes, inline styles, hardcoded colors
<h1 className="text-[24px] leading-[31px] font-medium text-[#172847]">
  Title
</h1>

<span className="text-xs font-semibold text-[#566175]" style={{ fontFamily: "'Space Grotesk', Inter, system-ui" }}>
  Label
</span>

<p className="text-sm text-[#566888]">
  Body text
</p>

<button className="text-sm font-medium">
  Click me
</button>
```

### After (New System)

```tsx
// ✅ New: Standardized tokens
<h1 className="text-h2 text-text-primary">
  Title
</h1>

<span className="text-label text-secondary font-display">
  Label
</span>

<p className="text-body text-text-muted">
  Body text
</p>

<button className="text-button">
  Click me
</button>
```

## Component-Specific Examples

### Buttons
Already updated in [app/components/button.tsx](../app/components/button.tsx:18-20).
```tsx
// Button sizes automatically use typography system
<Button size="sm">Small</Button>  // text-button-sm
<Button size="md">Medium</Button>  // text-button
<Button size="lg">Large</Button>  // text-button-lg
```

### Form Inputs
Already updated in [app/components/input.tsx](../app/components/input.tsx:12-23).
```tsx
<Input label="Email" helperText="We'll never share your email" />
// Label uses: text-label font-display
// Input uses: text-body
// Helper uses: text-info font-display
```

### Alerts
Already updated in [app/components/alert.tsx](../app/components/alert.tsx:20).
```tsx
<Alert variant="error">Error message</Alert>
// Uses: text-body
```

### Navigation
Already updated in [app/components/navbar/*.tsx](../app/components/navbar/).
```tsx
// Menu labels
<span className="text-subtitle text-slate-800">Menu Item</span>

// Section headers
<div className="text-allcaps text-slate-500">Section</div>

// User info
<p className="text-info text-slate-500">email@example.com</p>
```

### Page Headings
```tsx
// Page title
<h1 className="text-h1 text-text-primary">Page Title</h1>

// Section heading
<h2 className="text-h2 text-text-primary">Section</h2>

// Subsection
<h3 className="text-h3 text-text-primary">Subsection</h3>

// Card heading
<h4 className="text-h4 text-text-primary">Card Title</h4>
```

### Content Text
```tsx
// Primary body text
<p className="text-body text-text-primary">Main content</p>

// Secondary description
<p className="text-body text-text-secondary">Supporting text</p>

// Muted metadata
<span className="text-info text-text-tertiary">Last updated 2 days ago</span>
```

## Font Family Rules

The typography system uses two font families strategically:

### Space Grotesk (font-display)
Used for:
- All display sizes (display-lg, display-md, display-sm)
- All headings (h1, h2, h3, h4)
- Labels (label, label-sm)
- **Applied automatically** when using heading/display/label utility classes

### Inter (font-sans, default)
Used for:
- All body text (body-lg, body, body-sm)
- Subtitles
- Buttons
- Pills
- Allcaps
- Info text
- **Default font** - no class needed

## Files Already Updated

✅ **Core Configuration:**
- [tailwind.config.ts](../tailwind.config.ts) - Typography tokens defined with font families
- [app/globals.css](../app/globals.css) - Utility classes with font-display auto-applied

✅ **Core Components (10 files):**
- [app/components/button.tsx](../app/components/button.tsx) - Button sizes
- [app/components/input.tsx](../app/components/input.tsx) - Form inputs (labels use Space Grotesk)
- [app/components/alert.tsx](../app/components/alert.tsx) - Alerts
- [app/components/navbar/HiveSelector.tsx](../app/components/navbar/HiveSelector.tsx) - Navigation (labels use Space Grotesk)
- [app/components/navbar/PageSelector.tsx](../app/components/navbar/PageSelector.tsx) - Navigation
- [app/components/navbar/UserMenu.tsx](../app/components/navbar/UserMenu.tsx) - Navigation
- [app/components/conversation/ConversationHeader.tsx](../app/components/conversation/ConversationHeader.tsx) - Conversation UI (headings use Space Grotesk)
- [app/(auth)/login/LoginPageClient.tsx](../app/(auth)/login/LoginPageClient.tsx) - Auth pages (heading and subtitle use Space Grotesk)
- Documentation files created

## Files Still To Update

The following files contain typography that should be migrated to the new system:

### High Priority (Core UI)
- `app/components/conversation/ListenView.tsx` - Tags, response text
- `app/components/conversation/ReportView.tsx` - Report content
- `app/components/conversation/UnderstandView.tsx` - Analysis visualization
- `app/components/conversation/ConsensusMatrix.tsx` - Chart labels, numbers
- `app/components/conversation/FrequentlyMentionedGroupCard.tsx` - Group labels
- `app/components/new-session-wizard.tsx` - Wizard steps, labels
- `app/hives/HivesHome.tsx` - Page title, cards
- `app/hives/[hiveId]/HiveHome.tsx` - Hive overview
- `app/hives/components/HiveCard.tsx` - Card typography

### Medium Priority (Settings & Forms)
- `app/settings/**/*.tsx` - Settings pages
- `app/hives/components/SettingsForm.tsx` - Form labels
- `app/hives/components/InviteForm.tsx` - Form labels

### Migration Pattern

For each file, apply these transformations:

1. **Remove inline fontFamily styles**
   ```diff
   - style={{ fontFamily: "'Space Grotesk', Inter, system-ui" }}
   + font-display (if it was Space Grotesk)
   ```

2. **Replace arbitrary font sizes**
   ```diff
   - text-[24px] leading-[31px] font-medium
   + text-h2

   - text-sm font-medium
   + text-subtitle

   - text-xs font-semibold
   + text-label
   ```

3. **Replace hardcoded colors**
   ```diff
   - text-[#172847]
   + text-text-primary

   - text-[#566175] or text-[#566888]
   + text-text-secondary or text-text-muted

   - text-[#9498B0]
   + text-text-tertiary

   - text-[#3A1DC8]
   + text-brand-primary
   ```

4. **Simplify combined classes**
   ```diff
   - text-sm font-medium text-slate-800
   + text-subtitle text-slate-800

   - text-xs font-semibold text-slate-500 uppercase tracking-wide
   + text-allcaps text-slate-500
   ```

## Benefits

1. **Single Source of Truth**: All typography defined in [tailwind.config.ts](../tailwind.config.ts:14-44)
2. **Easy Global Updates**: Change font size/weight in one place, updates everywhere
3. **Consistency**: Prevents arbitrary sizes and ensures visual harmony
4. **Developer Experience**: Semantic class names (text-h2) vs cryptic (text-[24px] leading-[31px])
5. **Accessibility**: Consistent hierarchy aids screen readers
6. **Maintainability**: Easier to enforce design system compliance

## Testing Checklist

After migrating a component:
- [ ] Visual appearance unchanged (compare before/after screenshots)
- [ ] Font sizes render correctly at all breakpoints
- [ ] Line heights don't cause overlapping text
- [ ] Color contrast meets WCAG standards
- [ ] Space Grotesk loads for display text
- [ ] Inter loads for body text

## Future Enhancements

- Add responsive typography variants (e.g., `md:text-h1`, `lg:text-display-lg`)
- Create composite patterns for common layouts
- Document typography for dark mode (when implemented)
- Add animation/transition utilities for type changes
