# Typography System Cheat Sheet

Quick reference for the Hivemind typography system.

## Font Sizes

| Use Case           | Class             | Size | Line Height | Weight | Font              |
| ------------------ | ----------------- | ---- | ----------- | ------ | ----------------- |
| **Hero text**      | `text-display-lg` | 60px | 1.1         | 600    | Space Grotesk     |
| **Large display**  | `text-display-md` | 48px | 1.1         | 600    | Space Grotesk     |
| **Small display**  | `text-display-sm` | 32px | 1.2         | 600    | Space Grotesk     |
| **Page title**     | `text-h1`         | 30px | 1.3         | 600    | Space Grotesk     |
| **Section title**  | `text-h2`         | 24px | 1.3         | 600    | Space Grotesk     |
| **Subsection**     | `text-h3`         | 20px | 1.4         | 600    | Space Grotesk     |
| **Card heading**   | `text-h4`         | 18px | 1.4         | 600    | Space Grotesk     |
| **Large body**     | `text-body-lg`    | 16px | 1.5         | 400    | Inter             |
| **Body text**      | `text-body`       | 14px | 1.5         | 400    | Inter             |
| **Small body**     | `text-body-sm`    | 13px | 1.4         | 400    | Inter             |
| **Emphasis**       | `text-subtitle`   | 14px | 1.4         | 500    | Inter             |
| **Form label**     | `text-label`      | 12px | 1.4         | 600    | Space Grotesk     |
| **Small label**    | `text-label-sm`   | 11px | 1.3         | 600    | Space Grotesk     |
| **Badge/pill**     | `text-pill`       | 10px | 1.2         | 600    | Inter             |
| **Large button**   | `text-button-lg`  | 16px | 1.25        | 500    | Inter             |
| **Button**         | `text-button`     | 14px | 1.25        | 500    | Inter             |
| **Small button**   | `text-button-sm`  | 14px | 1.25        | 500    | Inter             |
| **Section header** | `text-allcaps`    | 12px | 1.4         | 500    | Inter (UPPERCASE) |
| **Helper text**    | `text-info`       | 12px | 1.4         | 400    | Inter             |

## Colors

| Use Case             | Class                 | Hex     |
| -------------------- | --------------------- | ------- |
| Primary text         | `text-text-primary`   | #172847 |
| Secondary text       | `text-text-secondary` | #566175 |
| Tertiary text        | `text-text-tertiary`  | #9498B0 |
| Muted text           | `text-text-muted`     | #566888 |
| Disabled/placeholder | `text-text-disabled`  | #A0AEC0 |
| Brand/links          | `text-brand-primary`  | #3A1DC8 |

## Quick Examples

### Headings

```tsx
<h1 className="text-h1 text-text-primary">Page Title</h1>
<h2 className="text-h2 text-text-primary">Section</h2>
<h3 className="text-h3 text-text-primary">Subsection</h3>
<h4 className="text-h4 text-text-primary">Card Title</h4>
```

### Body Text

```tsx
<p className="text-body text-text-primary">Main content</p>
<p className="text-body text-text-secondary">Supporting info</p>
<p className="text-body-lg text-text-primary">Larger body text</p>
```

### UI Elements

```tsx
<label className="text-label text-text-secondary font-display">Email</label>
<span className="text-pill">New</span>
<span className="text-allcaps text-slate-500">Section</span>
<p className="text-info text-text-tertiary">Helper text</p>
```

### Buttons

```tsx
<Button size="lg">Large</Button>      {/* text-button-lg */}
<Button size="md">Medium</Button>     {/* text-button */}
<Button size="sm">Small</Button>      {/* text-button-sm */}
```

## Font Families

```tsx
{/* Default: Inter (no class needed) */}
<p className="text-body">Uses Inter</p>

{/* Space Grotesk for headings/labels */}
<h1 className="text-h1">Uses Space Grotesk automatically</h1>
<label className="text-label font-display">Uses Space Grotesk</label>

{/* Manual override */}
<p className="font-display">Force Space Grotesk</p>
<h1 className="font-sans">Force Inter</h1>
```

## Migration Quick Reference

| Old Pattern                                             | New Pattern                                   |
| ------------------------------------------------------- | --------------------------------------------- |
| `text-[24px] leading-[31px] font-medium text-[#172847]` | `text-h2 text-text-primary`                   |
| `text-sm font-medium text-slate-800`                    | `text-subtitle text-slate-800`                |
| `text-xs font-semibold text-[#566175]`                  | `text-label text-text-secondary font-display` |
| `text-base leading-[22px] text-[#566888]`               | `text-body-lg text-text-muted`                |
| `text-[16px] font-medium leading-5`                     | `text-subtitle` or `text-button-lg`           |
| `text-[12px] font-semibold`                             | `text-label`                                  |
| `text-xs text-slate-500 uppercase tracking-wide`        | `text-allcaps text-slate-500`                 |
| `style={{ fontFamily: "'Space Grotesk', ..." }}`        | `font-display`                                |

## When to Use What

### Headings (h1-h4)

- Use for semantic HTML headings
- Always pair with `text-text-primary` or other color
- Automatically use Space Grotesk font

### Body Text (body-lg, body, body-sm)

- Use for paragraphs, descriptions
- Primary content: `text-text-primary`
- Secondary content: `text-text-secondary` or `text-text-muted`

### Subtitle

- Emphasized body text (medium weight)
- Menu items, card descriptions
- Slightly bolder than body

### Label

- Form labels, tags, badges
- Use with `font-display` for Space Grotesk
- Always semibold (600)

### Allcaps

- Section headers in menus/sidebars
- Always uppercase, wider letter spacing
- Use with muted colors (slate-500, text-tertiary)

### Info

- Helper text, hints, metadata
- Smallest readable size
- Use with tertiary or muted colors

### Button Sizes

- Applied automatically by Button component
- Match button size to context
- All have medium weight (500)

## Common Mistakes

❌ **Don't do this:**

```tsx
<h1 className="text-[24px] leading-[31px] font-semibold text-[#172847]">
```

✅ **Do this instead:**

```tsx
<h1 className="text-h2 text-text-primary">
```

❌ **Don't mix arbitrary with tokens:**

```tsx
<p className="text-body leading-5 font-bold">
```

✅ **Use tokens or override completely:**

```tsx
<p className="text-body">  {/* Uses built-in line-height */}
{/* OR */}
<p className="text-[14px] leading-5 font-bold">  {/* If truly custom */}
```

❌ **Don't forget font-display for labels:**

```tsx
<label className="text-label">Email</label>
```

✅ **Add font-display:**

```tsx
<label className="text-label font-display text-text-secondary">Email</label>
```

## Tips

1. **Start with semantic HTML**: Use proper heading levels (h1-h6)
2. **Apply typography class**: Match visual weight to semantic meaning
3. **Add color**: Use text color tokens for consistency
4. **Consider font family**: Headings/labels use Space Grotesk, body uses Inter
5. **Test responsiveness**: Ensure text is readable at all sizes

## Files Already Using New System

✅ Core Components:

- `app/components/button.tsx`
- `app/components/input.tsx`
- `app/components/alert.tsx`

✅ Navigation:

- `app/components/navbar/HiveSelector.tsx`
- `app/components/navbar/PageSelector.tsx`
- `app/components/navbar/UserMenu.tsx`

✅ Pages:

- `app/components/conversation/ConversationHeader.tsx`
- `app/(auth)/login/LoginPageClient.tsx`
- `app/hives/[hiveId]/HiveHome.tsx`

See [TYPOGRAPHY_MIGRATION_SUMMARY.md](../TYPOGRAPHY_MIGRATION_SUMMARY.md) for complete list and migration guide.
