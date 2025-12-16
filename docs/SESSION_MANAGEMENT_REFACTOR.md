# Session Management Refactor - Complete Implementation Guide

## Overview

This document describes the complete session management refactor following the SOLID principles and specifications outlined in the original requirements.

## Architecture

### Layers (following SRP)

```
┌─────────────────────────────────────────┐
│         React Components/Pages          │
│   (login, hives, AuthGuard, etc.)       │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│          React Layer (Hooks)            │
│  useSession, useRequireAuth, AuthProvider│
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│         State Layer (Store)             │
│      SessionStore + Observer Pattern    │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│        Data Layer (Client)              │
│        ISessionClient Interface         │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│            Domain Layer                 │
│      Session types and interfaces       │
└─────────────────────────────────────────┘
```

## File Structure

```
lib/auth/
├── domain/
│   └── session.types.ts         # Domain types and interfaces
├── data/
│   └── sessionClient.ts         # ISessionClient implementation
├── state/
│   └── sessionStore.ts          # SessionStore with observers
├── react/
│   ├── AuthProvider.tsx         # Context provider
│   ├── useSession.ts            # Read-only session hook
│   ├── useRequireAuth.ts        # Protected route hook
│   ├── AuthGuard.tsx            # Client-side route guard
│   └── GuestGuard.tsx           # Guest-only route guard
├── server/
│   ├── requireAuth.ts           # Server-side guards
│   └── middleware.ts            # Next.js middleware
└── __tests__/
    └── sessionStore.test.ts     # Unit tests

app/
├── api/auth/session/route.ts    # Session API endpoint
└── layout.tsx                   # Root layout with AuthProvider

middleware.ts                     # Next.js middleware entry
```

## Core Principles Applied

### 1. Single Responsibility Principle (SRP)
- **SessionStore**: Only manages session state
- **SessionClient**: Only fetches session data
- **AuthProvider**: Only wires store to React
- **useSession**: Only reads session
- **useRequireAuth**: Only handles redirects

### 2. Dependency Inversion Principle (DIP)
- Store depends on `ISessionClient` interface, not concrete implementation
- Hooks depend on context, not store directly
- Easy to mock for testing

### 3. Open/Closed Principle (OCP)
- Can extend with new session sources without modifying store
- Can add new auth methods without changing hooks
- Can add new guards without changing core logic

### 4. Observer Pattern
- Store notifies all subscribers of state changes
- Deduplicated updates across components
- Cross-tab sync via BroadcastChannel

## Usage Guide

### 1. Reading Session State

```tsx
import { useSession } from "@/lib/auth/react/useSession";

function MyComponent() {
  const { user, isAuthenticated, isLoading, refresh } = useSession();

  if (isLoading) return <Spinner />;
  if (!isAuthenticated) return <LoginPrompt />;

  return <Dashboard user={user} />;
}
```

### 2. Protecting Client Routes

```tsx
import { AuthGuard } from "@/lib/auth/react/AuthGuard";
import Spinner from "./components/spinner";

export default function ProtectedPage() {
  return (
    <AuthGuard fallback={<Spinner />}>
      <DashboardContent />
    </AuthGuard>
  );
}
```

### 3. Guest-Only Pages

```tsx
import { GuestGuard } from "@/lib/auth/react/GuestGuard";

export default function LoginPage() {
  return (
    <GuestGuard fallback={<Spinner />}>
      <LoginForm />
    </GuestGuard>
  );
}
```

### 4. Protecting Server Components

```tsx
import { requireAuth } from "@/lib/auth/server/requireAuth";

export default async function ServerPage() {
  const session = await requireAuth(); // Redirects if not authenticated

  return <div>Welcome, {session.user.name}</div>;
}
```

### 5. API Route Protection

```tsx
import { requireAuth } from "@/lib/auth/server/requireAuth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await requireAuth();

  return NextResponse.json({
    data: "Protected data",
    userId: session.user.id,
  });
}
```

## Flows

### Login Flow

```
1. User submits email → useAuth.login(email, "")
2. Supabase sends magic link
3. User clicks link → /auth/callback
4. Code exchanged for session
5. refresh() called → Store updated
6. notifySessionChange() → Other tabs refresh
7. Redirect to returnUrl or /hives
```

### Protected Route Access

```
1. User visits /hives
2. Middleware checks auth → Has session → Allow
3. AuthGuard checks session → Authenticated → Render
```

OR

```
1. User visits /hives (not logged in)
2. Middleware checks auth → No session → Redirect to /login?next=/hives
3. Store returnUrl in sessionStorage
4. After login → Redirect to /hives
```

### Cross-Tab Sync

```
1. User logs in on Tab A
2. notifySessionChange() broadcasts "refresh"
3. Tab B receives broadcast
4. Tab B calls refresh()
5. Tab B updates UI with new session
```

## Security Features

### 1. HttpOnly Cookies
- Session tokens stored in HttpOnly cookies (managed by Supabase)
- Not accessible to JavaScript
- Prevents XSS attacks

### 2. Open Redirect Prevention
```typescript
function validateReturnUrl(url: string | null): string | null {
  if (!url) return null;
  if (!url.startsWith("/")) return null;
  if (url.startsWith("//")) return null;
  if (url.includes("://")) return null;
  return url;
}
```

### 3. Middleware Protection
- Protected routes blocked at edge
- Fast redirect before page render
- No content flash

### 4. Deduplicated Requests
- Single in-flight session fetch
- Prevents race conditions
- Reduces server load

## Testing Strategy

### Unit Tests
- ✅ `sessionStore.test.ts` - State management and observers
- Session client with mocked fetch
- Redirect validation functions

### Integration Tests (Next)
```typescript
import { render, screen } from "@testing-library/react";
import { AuthProvider } from "@/lib/auth/react/AuthProvider";
import { useSession } from "@/lib/auth/react/useSession";

test("AuthProvider provides session to children", async () => {
  // Mock session API
  // Render component with AuthProvider
  // Verify session state propagates
});
```

### E2E Tests (Playwright)
```typescript
test("protected route redirects to login", async ({ page }) => {
  await page.goto("/hives");
  await expect(page).toHaveURL(/\/login\?next=%2Fhives/);
});

test("login preserves return URL", async ({ page }) => {
  await page.goto("/hives");
  // Redirected to login with next parameter
  // Perform login
  // Verify redirected back to /hives
});
```

## Migration from Old System

### Before
```tsx
// Old approach - scattered session checks
const { user } = useCurrentUser();
if (!user) router.push("/login");
```

### After
```tsx
// New approach - centralized via guard
<AuthGuard fallback={<Spinner />}>
  <Content />
</AuthGuard>
```

### Benefits
- ✅ Single source of truth
- ✅ No duplicate session fetches
- ✅ Consistent redirect behavior
- ✅ Cross-tab sync
- ✅ Testable boundaries
- ✅ Security-first design

## Performance Optimizations

1. **Request Deduplication**: Only one in-flight session fetch at a time
2. **Observer Pattern**: Minimal re-renders, only subscribers notified
3. **Middleware Protection**: Fast edge redirects
4. **Session Caching**: In-memory cache, refresh on demand
5. **Cross-tab Sync**: BroadcastChannel (no polling)

## Troubleshooting

### Session not updating after login
```typescript
// After login, always call:
await refresh();
notifySessionChange();
```

### Infinite redirect loop
- Check middleware protected routes vs. redirectTo
- Ensure login page is NOT in PROTECTED_PREFIXES
- Validate returnUrl to prevent redirect to itself

### Cross-tab sync not working
- BroadcastChannel not supported in all browsers
- Fallback: Use visibilitychange event (already implemented)

## API Reference

### `useSession()`
Returns:
- `status`: "loading" | "authenticated" | "unauthenticated"
- `session`: Session | null
- `user`: SessionUser | null
- `isLoading`: boolean
- `isAuthenticated`: boolean
- `refresh()`: () => Promise<void>

### `useRequireAuth(options)`
Options:
- `redirectTo`: string (default: "/login")
- `allowWhileLoading`: boolean (default: false)
- `preserveReturnUrl`: boolean (default: true)

### `AuthGuard`
Props:
- `children`: ReactNode
- `redirectTo`: string
- `fallback`: ReactNode
- `preserveReturnUrl`: boolean

### `requireAuth()`
Server-side function that:
- Returns Session if authenticated
- Redirects to /login if not authenticated

## Acceptance Criteria Status

- ✅ Single canonical useSession() across app
- ✅ Protected routes redirect reliably with next parameter
- ✅ Open redirect prevention implemented
- ✅ No sensitive tokens in localStorage
- ✅ API routes enforce auth server-side
- ✅ Unit tests for session store
- ✅ Middleware protection implemented
- ✅ Cross-tab sync via BroadcastChannel
- ✅ Build passes with no TypeScript errors

## Next Steps

1. Add E2E tests with Playwright
2. Add integration tests with React Testing Library
3. Extend session with activeHiveId from database
4. Add role-based access control (RBAC)
5. Add session timeout warnings
6. Add "Remember me" functionality
7. Add OAuth providers (Google, GitHub)
