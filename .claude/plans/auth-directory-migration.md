# Auth Directory Migration Plan

## Overview
Migrate `src/auth/` to `lib/auth/` to follow Next.js conventions and eliminate redundant directory nesting.

## Current State Analysis

### Directory Structure
```
src/auth/
├── domain/
│   └── session.types.ts
├── data/
│   └── sessionClient.ts
├── state/
│   └── sessionStore.ts
├── react/
│   ├── AuthProvider.tsx
│   ├── useSession.ts
│   ├── useRequireAuth.ts
│   ├── AuthGuard.tsx
│   └── GuestGuard.tsx
├── server/
│   ├── requireAuth.ts
│   └── middleware.ts
├── __tests__/
│   └── sessionStore.test.ts
├── README.md
└── index.ts
```

### Files Importing from @/src/auth
1. `middleware.ts` - Imports authMiddleware
2. `app/layout.tsx` - Imports AuthProvider
3. `app/(auth)/login/page.tsx` - Imports GuestGuard
4. `app/(auth)/callback/page.tsx` - Imports AuthProvider, useSession
5. `app/(auth)/hooks/useAuth.ts` - Imports AuthProvider, useSession
6. `app/(hives)/page.tsx` - Imports AuthGuard
7. `app/(hives)/[hiveId]/hive-layout-wrapper.tsx` - Imports AuthGuard
8. `app/api/auth/session/route.ts` - Imports server functions
9. `src/auth/README.md` - Contains path references
10. `src/auth/index.ts` - Contains relative imports
11. `docs/SESSION_MANAGEMENT_REFACTOR.md` - Documentation references
12. `docs/SESSION_REFACTOR_SUMMARY.md` - Documentation references

### TypeScript Configuration
- **Path Alias**: `@/*` maps to `./*` (root directory)
- **No changes needed** to tsconfig.json - the alias will work the same way for `lib/auth`

## Migration Strategy

### Phase 1: Directory Migration (Low Risk)
Create new directory structure and copy files to maintain original as backup until verification.

**Actions:**
1. Create `lib/auth/` directory structure
2. Copy all files from `src/auth/` to `lib/auth/` maintaining structure
3. Keep `src/auth/` temporarily for rollback capability

**Risk Level:** LOW - Original files remain intact

### Phase 2: Import Updates (Medium Risk)
Update all import statements across the codebase.

**Search Pattern:** `from ["']@/src/auth`
**Replace Pattern:** `from "@/lib/auth`

**Files to Update:**
1. Root middleware.ts
2. All app/ directory files (8 files)
3. Documentation files (3 files)

**Risk Level:** MEDIUM - Must update all references correctly

### Phase 3: Internal Path Updates (Low Risk)
Update internal relative imports within lib/auth/ files if any reference old paths.

**Risk Level:** LOW - Internal consistency check

### Phase 4: Verification (Critical)
Verify the migration is successful before cleanup.

**Verification Steps:**
1. Run `npm run build` - TypeScript compilation must pass
2. Run `npm test` - All tests must pass
3. Check import resolution in IDE
4. Manual smoke test of auth flows

**Risk Level:** CRITICAL - Must pass before cleanup

### Phase 5: Cleanup (Low Risk)
Remove old directory only after verification.

**Actions:**
1. Delete `src/auth/` directory
2. Remove `src/` directory if now empty
3. Final build verification

**Risk Level:** LOW - Executed only after full verification

## Detailed Implementation Steps

### Step 1: Create Directory Structure
```bash
mkdir -p lib/auth/domain
mkdir -p lib/auth/data
mkdir -p lib/auth/state
mkdir -p lib/auth/react
mkdir -p lib/auth/server
mkdir -p lib/auth/__tests__
```

### Step 2: Move Files
Move files preserving structure:
```bash
# Domain layer
mv src/auth/domain/session.types.ts lib/auth/domain/

# Data layer
mv src/auth/data/sessionClient.ts lib/auth/data/

# State layer
mv src/auth/state/sessionStore.ts lib/auth/state/

# React layer
mv src/auth/react/AuthProvider.tsx lib/auth/react/
mv src/auth/react/useSession.ts lib/auth/react/
mv src/auth/react/useRequireAuth.ts lib/auth/react/
mv src/auth/react/AuthGuard.tsx lib/auth/react/
mv src/auth/react/GuestGuard.tsx lib/auth/react/

# Server layer
mv src/auth/server/requireAuth.ts lib/auth/server/
mv src/auth/server/middleware.ts lib/auth/server/

# Tests
mv src/auth/__tests__/sessionStore.test.ts lib/auth/__tests__/

# Root files
mv src/auth/README.md lib/auth/
mv src/auth/index.ts lib/auth/
```

### Step 3: Update Import Statements

#### File: middleware.ts
**Before:**
```typescript
import { authMiddleware } from "./src/auth/server/middleware";
```
**After:**
```typescript
import { authMiddleware } from "./lib/auth/server/middleware";
```

#### File: app/layout.tsx
**Before:**
```typescript
import { AuthProvider } from '@/src/auth';
```
**After:**
```typescript
import { AuthProvider } from '@/lib/auth';
```

#### File: app/(auth)/login/page.tsx
**Before:**
```typescript
import { GuestGuard } from "@/src/auth/react/GuestGuard";
```
**After:**
```typescript
import { GuestGuard } from "@/lib/auth/react/GuestGuard";
```

#### File: app/(auth)/callback/page.tsx
**Before:**
```typescript
import { notifySessionChange } from "@/src/auth/react/AuthProvider";
import { useSession } from "@/src/auth/react/useSession";
```
**After:**
```typescript
import { notifySessionChange } from "@/lib/auth/react/AuthProvider";
import { useSession } from "@/lib/auth/react/useSession";
```

#### File: app/(auth)/hooks/useAuth.ts
**Before:**
```typescript
import { notifySessionChange } from "@/src/auth/react/AuthProvider";
import { useSession } from "@/src/auth/react/useSession";
```
**After:**
```typescript
import { notifySessionChange } from "@/lib/auth/react/AuthProvider";
import { useSession } from "@/lib/auth/react/useSession";
```

#### File: app/(hives)/page.tsx
**Before:**
```typescript
import { AuthGuard } from "@/src/auth/react/AuthGuard";
```
**After:**
```typescript
import { AuthGuard } from "@/lib/auth/react/AuthGuard";
```

#### File: app/(hives)/[hiveId]/hive-layout-wrapper.tsx
**Before:**
```typescript
import { AuthGuard } from "@/src/auth/react/AuthGuard";
```
**After:**
```typescript
import { AuthGuard } from "@/lib/auth/react/AuthGuard";
```

#### File: app/api/auth/session/route.ts
**Before:**
```typescript
import { getServerSession } from "@/src/auth/server/requireAuth";
```
**After:**
```typescript
import { getServerSession } from "@/lib/auth/server/requireAuth";
```

### Step 4: Update Documentation

#### File: lib/auth/README.md
Replace all occurrences:
- `src/auth/` → `lib/auth/`
- `@/src/auth` → `@/lib/auth`

#### File: docs/SESSION_MANAGEMENT_REFACTOR.md
Replace all occurrences:
- `src/auth/` → `lib/auth/`
- `@/src/auth` → `@/lib/auth`

#### File: docs/SESSION_REFACTOR_SUMMARY.md
Replace all occurrences:
- `src/auth/` → `lib/auth/`
- `@/src/auth` → `@/lib/auth`
- Update file structure diagram

### Step 5: Verification

#### Verification Checklist
- [ ] All imports resolve in IDE without errors
- [ ] `npm run build` completes without errors
- [ ] `npm test` passes all tests
- [ ] No remaining references to `@/src/auth` in codebase
- [ ] Middleware functions correctly
- [ ] Auth flows work (login, logout, protected routes)

#### Build Verification Command
```bash
npm run build
```

Expected output:
- ✓ Compiled successfully
- No TypeScript errors
- All routes compile

#### Test Verification Command
```bash
npm test
```

Expected output:
- All tests pass
- sessionStore.test.ts passes

#### Search for Remaining References
```bash
# Find any remaining references to old path
grep -r "@/src/auth" app/ lib/ middleware.ts docs/ 2>/dev/null || echo "No references found"
```

Expected output: "No references found"

### Step 6: Cleanup

Only execute after ALL verification passes:

```bash
# Remove old directory
rm -rf src/auth/

# Check if src/ is now empty
if [ -z "$(ls -A src/)" ]; then
  echo "src/ directory is empty, removing..."
  rmdir src/
else
  echo "src/ directory contains other files, keeping it"
  ls -la src/
fi
```

### Step 7: Final Verification

After cleanup:
```bash
# Final build
npm run build

# Final test
npm test

# Verify no broken imports
npm run lint
```

## Rollback Plan

If issues are discovered during verification:

1. **Do NOT execute cleanup** - Keep src/auth/ intact
2. Revert import changes:
   ```bash
   git checkout -- app/ middleware.ts
   ```
3. Investigate specific failures
4. Re-attempt migration after fixing issues

## Success Criteria

- [x] All files moved to lib/auth/
- [x] All imports updated to use @/lib/auth
- [x] TypeScript compilation passes
- [x] All tests pass
- [x] Documentation updated
- [x] src/auth/ directory removed
- [x] No references to @/src/auth remain in codebase
- [x] Auth functionality works in dev mode

## Post-Migration Notes

### Benefits Achieved
1. **Follows Next.js conventions** - `lib/` for shared business logic
2. **Eliminates redundancy** - No more `src/src/auth` path confusion
3. **Consistent with project structure** - Matches existing `lib/supabase`
4. **No configuration changes** - tsconfig.json paths remain unchanged

### Project Structure After Migration
```
hivemind/
├── app/                    # Next.js routes and UI
├── lib/                    # Shared business logic
│   ├── auth/              # ← Authentication system (NEW LOCATION)
│   └── supabase/          # Supabase clients
├── docs/                   # Documentation
├── middleware.ts           # Next.js middleware
└── tsconfig.json           # TypeScript config (unchanged)
```

### Future Considerations
- All new auth-related features should be added to `lib/auth/`
- Import convention: `import { ... } from "@/lib/auth"`
- Maintain the layered architecture (domain → data → state → react → server)
