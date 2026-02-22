# Typography System - Quick Start

## Overview

The Hivemind app now has a **standardized typography system** that makes fonts consistent and easy to update globally.

## Quick Reference

### Using the System

```tsx
// ❌ OLD WAY
<h1 className="text-[24px] leading-[31px] font-medium text-[#172847]"
    style={{ fontFamily: "'Space Grotesk', Inter, system-ui" }}>
  Title
</h1>

// ✅ NEW WAY
<h1 className="text-h2 text-text-primary">
  Title
</h1>
```

### Common Tokens

| Element      | Class                            | Example                                                    |
| ------------ | -------------------------------- | ---------------------------------------------------------- |
| Page title   | `text-h1 text-text-primary`      | `<h1 className="text-h1 text-text-primary">Dashboard</h1>` |
| Section      | `text-h2 text-text-primary`      | `<h2 className="text-h2 text-text-primary">Settings</h2>`  |
| Card heading | `text-h4 text-text-primary`      | `<h4 className="text-h4 text-text-primary">Profile</h4>`   |
| Body text    | `text-body text-text-primary`    | `<p className="text-body text-text-primary">Content</p>`   |
| Emphasized   | `text-subtitle text-slate-800`   | `<span className="text-subtitle">Important</span>`         |
| Label        | `text-label text-text-secondary` | `<label className="text-label">Email</label>`              |
| Helper text  | `text-info text-slate-500`       | `<span className="text-info">Optional</span>`              |

### Font Families

- **Headings & Labels:** Space Grotesk (auto-applied with heading/label classes)
- **Body Text:** Inter (default, no class needed)

## Documentation

- 📘 **[TYPOGRAPHY_SYSTEM.md](docs/TYPOGRAPHY_SYSTEM.md)** - Complete system reference
- 📝 **[TYPOGRAPHY_CHEATSHEET.md](docs/TYPOGRAPHY_CHEATSHEET.md)** - Quick lookup table
- 📋 **[TYPOGRAPHY_MIGRATION_BATCH.md](docs/TYPOGRAPHY_MIGRATION_BATCH.md)** - Remaining work guide
- 📊 **[TYPOGRAPHY_MIGRATION_SUMMARY.md](TYPOGRAPHY_MIGRATION_SUMMARY.md)** - Project status

## Files Modified

### ✅ Complete (10 files)

- Core components: Button, Input, Alert
- Navigation: HiveSelector, PageSelector, UserMenu
- Pages: ConversationHeader, Login, Hive Overview
- Config: tailwind.config.ts, app/globals.css

### 📋 To Do (~12 files)

See [TYPOGRAPHY_MIGRATION_BATCH.md](docs/TYPOGRAPHY_MIGRATION_BATCH.md) for line-by-line instructions.

## Key Benefits

1. **Update fonts globally** - Change in tailwind.config.ts, updates everywhere
2. **Consistent design** - No more arbitrary font sizes
3. **Better code** - `text-h2` vs `text-[24px] leading-[31px] font-medium`
4. **Proper fonts** - Space Grotesk for headings, Inter for body

## Quick Start Migration

1. Find old typography (e.g., `text-sm font-medium text-[#172847]`)
2. Look up replacement in [TYPOGRAPHY_CHEATSHEET.md](docs/TYPOGRAPHY_CHEATSHEET.md)
3. Replace with new token (e.g., `text-subtitle text-text-primary`)
4. Remove inline `fontFamily` styles
5. Test visually

## Need Help?

- Check examples in migrated files (Button, Input, ConversationHeader)
- Review [TYPOGRAPHY_CHEATSHEET.md](docs/TYPOGRAPHY_CHEATSHEET.md) for patterns
- See [TYPOGRAPHY_MIGRATION_BATCH.md](docs/TYPOGRAPHY_MIGRATION_BATCH.md) for specific files

## Testing

```bash
npm run typecheck  # ✅ Passing
npm run lint       # ✅ Passing for migrated files
npm run dev        # Visual check
```

---

**Status:** Core system complete and production-ready. Remaining files can be migrated incrementally.
