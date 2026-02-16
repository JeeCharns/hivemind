# Session Management Module

Enterprise-grade session management for Next.js applications, built following SOLID principles and security best practices.

## Quick Start

### 1. Setup AuthProvider

Wrap your app with `AuthProvider` in the root layout:

```tsx
// app/layout.tsx
import { AuthProvider } from '@/lib/auth';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

### 2. Protect Client Routes

```tsx
// app/dashboard/page.tsx
import { AuthGuard } from '@/lib/auth';

export default function DashboardPage() {
  return (
    <AuthGuard fallback={<Loading />}>
      <DashboardContent />
    </AuthGuard>
  );
}
```

### 3. Protect Server Routes

```tsx
// app/api/data/route.ts
import { requireAuth } from '@/lib/auth';

export async function GET() {
  const session = await requireAuth(); // Redirects if not authenticated
  return Response.json({ userId: session.user.id });
}
```

### 4. Read Session State

```tsx
import { useSession } from '@/lib/auth';

function Profile() {
  const { user, isAuthenticated, isLoading } = useSession();

  if (isLoading) return <Spinner />;
  if (!isAuthenticated) return <LoginPrompt />;

  return <div>Welcome, {user.name}!</div>;
}
```

## Auth Flows

### OTP Authentication (Primary)

The primary authentication method uses one-time passcodes (OTP) sent via email:

1. User enters email on `/login`
2. `sendOtp()` calls Supabase `signInWithOtp()` (no redirect URL = sends 6-digit code)
3. User enters 6-digit code on same page using `OtpInput` component
4. `verifyOtp()` exchanges code for session
5. Session stored in cookies, user redirected to destination

**Files:**
- `app/(auth)/login/LoginPageClient.tsx` - Two-step login flow (email → OTP)
- `app/(auth)/components/OtpInput.tsx` - 6-box code input component
- `app/(auth)/hooks/useAuth.ts` - `sendOtp()`, `verifyOtp()` functions

**Benefits over magic link:**
- No redirect issues across email clients
- User stays in same browser tab
- Better mobile experience

### Password Authentication

For users with passwords (rare):

1. User enters email and password on `/login`
2. `signInWithPassword()` authenticates directly
3. Session stored in cookies, user redirected to `/hives`

## API Reference

### Hooks

#### `useSession()`

Read-only hook for accessing session state. Safe to use anywhere.

```tsx
const {
  status,        // "loading" | "authenticated" | "unauthenticated"
  session,       // Session | null
  user,          // SessionUser | null
  activeHiveId,  // string | null
  roles,         // string[]
  error,         // Error | null
  isLoading,     // boolean
  isAuthenticated, // boolean
  refresh,       // () => Promise<void>
} = useSession();
```

#### `useRequireAuth(options?)`

Hook for protected pages. Automatically redirects unauthenticated users.

```tsx
useRequireAuth({
  redirectTo: "/login",           // Where to redirect
  allowWhileLoading: false,       // Allow rendering while loading
  preserveReturnUrl: true,        // Store current URL for post-login redirect
});
```

### Components

#### `<AuthGuard>`

Client-side route protection. Redirects unauthenticated users to login.

```tsx
<AuthGuard
  redirectTo="/login"             // Redirect destination
  fallback={<Spinner />}          // Show while loading
  preserveReturnUrl={true}        // Preserve current URL
>
  <ProtectedContent />
</AuthGuard>
```

#### `<GuestGuard>`

Guest-only routes. Redirects authenticated users away.

```tsx
<GuestGuard
  redirectTo="/hives"            // Redirect destination for authenticated users
  fallback={<Spinner />}         // Show while loading
>
  <LoginForm />
</GuestGuard>
```

### Server Functions

#### `requireAuth()`

Server-side auth guard. Throws redirect if not authenticated.

```tsx
import { requireAuth } from '@/lib/auth';

export default async function Page() {
  const session = await requireAuth();
  return <div>User ID: {session.user.id}</div>;
}
```

#### `getServerSession()`

Get session without redirecting. Returns null if not authenticated.

```tsx
import { getServerSession } from '@/lib/auth';

export default async function Page() {
  const session = await getServerSession();

  if (!session) {
    return <PublicView />;
  }

  return <AuthenticatedView user={session.user} />;
}
```

### Utilities

#### `notifySessionChange()`

Notify other tabs to refresh their session. Call after login/logout.

```tsx
import { notifySessionChange } from '@/lib/auth';

async function handleLogin() {
  await loginUser();
  await refresh();
  notifySessionChange(); // Sync other tabs
}
```

## Architecture

### Layers

```
┌─────────────────────────────────────┐
│   React Components (Pages, UI)     │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  React Layer (Hooks, Guards)        │
│  - useSession                       │
│  - useRequireAuth                   │
│  - AuthGuard, GuestGuard            │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  State Layer (SessionStore)         │
│  - Observable state                 │
│  - Request deduplication            │
│  - Observer pattern                 │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Data Layer (SessionClient)         │
│  - API communication                │
│  - Response mapping                 │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Domain Layer (Types)               │
│  - Session, SessionUser             │
│  - Interfaces (DIP)                 │
└─────────────────────────────────────┘
```

### SOLID Principles Applied

**Single Responsibility**
- SessionStore: State management only
- SessionClient: Data fetching only
- AuthProvider: React integration only

**Open/Closed**
- Extend with new auth methods without modifying core
- Add new guards without changing store

**Liskov Substitution**
- Any ISessionClient can replace SessionClient
- Mockable for testing

**Interface Segregation**
- Separate read (useSession) from write (refresh)
- Minimal interfaces

**Dependency Inversion**
- Store depends on ISessionClient interface
- Easy to mock and test

## Security Features

### ✅ HttpOnly Cookies
Session tokens stored in HttpOnly cookies (managed by Supabase), not accessible to JavaScript.

### ✅ Open Redirect Prevention
All return URLs validated to prevent open redirects:
```typescript
// Only allows same-origin paths starting with /
if (!url.startsWith("/")) return null;
if (url.startsWith("//")) return null;
if (url.includes("://")) return null;
```

### ✅ Server-Side Enforcement
API routes always check auth server-side, regardless of client state.

### ✅ CSRF Protection
SameSite cookies + Supabase built-in CSRF protection.

### ✅ Request Deduplication
Prevents concurrent session fetches and race conditions.

## Performance Optimizations

1. **Request Deduplication**: Single in-flight session fetch
2. **Observer Pattern**: Components only re-render when state changes
3. **In-Memory Cache**: Session cached in memory
4. **Cross-Tab Sync**: BroadcastChannel (no polling)
5. **Middleware Protection**: Fast edge redirects

## Testing

### Unit Tests

```typescript
import { SessionStore } from './state/sessionStore';
import { MockSessionClient } from './test-utils';

test('refreshes session and notifies observers', async () => {
  const client = new MockSessionClient();
  const store = new SessionStore(client);

  const observer = jest.fn();
  store.subscribe(observer);

  await store.refresh();

  expect(observer).toHaveBeenCalled();
  expect(store.getState().status).toBe('authenticated');
});
```

### Integration Tests

```typescript
import { render, screen } from '@testing-library/react';
import { AuthProvider, useSession } from '@/lib/auth';

test('provides session to children', async () => {
  // Mock /api/auth/session
  // Render with AuthProvider
  // Verify session propagates
});
```

## Troubleshooting

### Session not updating after login

Always call `refresh()` and `notifySessionChange()` after login/logout:

```tsx
await supabase.auth.signIn({ email, password });
await refresh();
notifySessionChange();
```

### Infinite redirect loop

- This repo uses local token validation in middleware to avoid middleware/server disagreements (expired cookie loops).
- If you see loops, verify middleware validation is being used and that the route classification (guest vs protected) is correct.

#### Middleware token validation (prevents auth redirect loops)

The middleware makes auth decisions based on **validated** Supabase JWTs, not just the presence of cookies.

- Validation lives in `lib/auth/server/sessionValidation.ts`
- Middleware routing decisions live in `lib/auth/server/middleware.ts`
- Next.js entrypoint is `proxy.ts` (do not add `middleware.ts`; having both causes a startup error)

Validation is conservative:

- token must be a JWT with `sub` and `exp`
- token must not be expired (small clock-skew buffer)
- anything uncertain is treated as unauthenticated

Debug middleware decisions with:

```bash
DEBUG_AUTH_MW=true
```

### Cross-tab sync not working

BroadcastChannel not supported in all browsers. Fallback to `visibilitychange` event (already implemented in AuthProvider).

## Migration Guide

### From Old System

**Before:**
```tsx
const { user } = useCurrentUser();
if (!user) router.push("/login");
```

**After:**
```tsx
<AuthGuard>
  <Content />
</AuthGuard>
```

**Benefits:**
- ✅ Centralized auth logic
- ✅ No duplicate fetches
- ✅ Consistent redirects
- ✅ Cross-tab sync
- ✅ Easier to test

## Examples

### Protected Dashboard

```tsx
import { AuthGuard, useSession } from '@/lib/auth';

export default function Dashboard() {
  return (
    <AuthGuard fallback={<Loading />}>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const { user } = useSession();
  return <h1>Welcome, {user?.name}</h1>;
}
```

### Login Page

```tsx
import { GuestGuard } from '@/lib/auth';

export default function LoginPage() {
  return (
    <GuestGuard fallback={<Loading />}>
      <LoginForm />
    </GuestGuard>
  );
}
```

### Conditional Rendering

```tsx
import { useSession } from '@/lib/auth';

function Navbar() {
  const { user, isAuthenticated } = useSession();

  return (
    <nav>
      {isAuthenticated ? (
        <UserMenu user={user} />
      ) : (
        <LoginButton />
      )}
    </nav>
  );
}
```

### API Route

```tsx
import { requireAuth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await requireAuth();

  const data = await fetchUserData(session.user.id);

  return NextResponse.json(data);
}
```

## License

MIT

## Support

Start at `docs/README.md` and `docs/feature-map.md` for repo-level navigation.
