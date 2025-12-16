# Session Management Documentation

## Overview

The session management system is built on Supabase Auth and follows the SOLID principles outlined in CLAUDE.md. It provides a clean, modular approach to authentication with proper separation of concerns.

## Architecture

### Core Components

#### 1. Supabase Client (`lib/supabase/client.ts`)
- Creates and exports a singleton Supabase client for client-side operations
- Uses environment variables for configuration
- Throws error if environment variables are missing

#### 2. Supabase Server Client (`lib/supabase/serverClient.ts`)
- Creates Supabase client for server-side operations
- Disables session persistence (server-side doesn't need it)
- Used for server components and API routes

### Hooks

#### `useSession` (`app/(auth)/hooks/useSession.ts`)
**Purpose**: Manages user session state

**Returns**:
- `session`: Current Supabase session or null
- `user`: Current user object or null
- `loading`: Boolean indicating if session is being loaded
- `signOut`: Function to sign out the user

**Features**:
- Automatically fetches initial session on mount
- Subscribes to auth state changes
- Updates state when user logs in/out
- Cleans up subscription on unmount

**Usage**:
```tsx
const { user, session, loading, signOut } = useSession();

if (loading) return <Spinner />;
if (!user) return <LoginPrompt />;
return <Dashboard user={user} />;
```

#### `useAuth` (`app/(auth)/hooks/useAuth.ts`)
**Purpose**: Handles authentication operations

**Returns**:
- `login`: Function to log in user (email + password or magic link)
- `logout`: Function to log out user
- `loading`: Boolean indicating if auth operation is in progress
- `error`: Error message if operation failed

**Features**:
- Supports magic link authentication (password-less)
- Supports password-based authentication
- Automatic redirect after login/logout
- Error handling with user-friendly messages

**Usage**:
```tsx
const { login, logout, loading, error } = useAuth();

const handleLogin = async (email: string) => {
  await login(email, ""); // Magic link
};
```

### Guard Components

#### `AuthGuard` (`app/components/auth-guard.tsx`)
**Purpose**: Protects routes that require authentication

**Props**:
- `children`: React nodes to render if authenticated
- `redirectTo`: Where to redirect if not authenticated (default: "/login")

**Behavior**:
- Shows loading spinner while checking auth
- Redirects to login if user not authenticated
- Stores intended destination for post-login redirect
- Renders children if user is authenticated

**Usage**:
```tsx
<AuthGuard>
  <ProtectedContent />
</AuthGuard>
```

#### `GuestGuard` (`app/components/guest-guard.tsx`)
**Purpose**: Protects routes that should only be accessible to non-authenticated users

**Props**:
- `children`: React nodes to render if not authenticated
- `redirectTo`: Where to redirect if authenticated (default: "/hives")

**Behavior**:
- Shows loading spinner while checking auth
- Redirects authenticated users to dashboard
- Checks for stored return URL and redirects there if found
- Renders children if user is not authenticated

**Usage**:
```tsx
<GuestGuard>
  <LoginForm />
</GuestGuard>
```

### Pages

#### Login Page (`app/(auth)/login/page.tsx`)
- Wrapped in `GuestGuard` to prevent authenticated users from accessing
- Uses `useAuth` hook for login operations
- Supports magic link authentication
- Shows error messages

#### Logout Page (`app/(auth)/logout/page.tsx`)
- Calls `logout` function from `useAuth`
- Shows loading spinner during sign out
- Automatically redirects to login page

#### Auth Callback Page (`app/(auth)/callback/page.tsx`)
- Handles OAuth and magic link redirects from Supabase
- Exchanges auth code for session
- Redirects to stored return URL or default to /hives
- Shows error if authentication fails

## Flow Diagrams

### Login Flow (Magic Link)
```
User enters email → useAuth.login() → Supabase sends email
→ User clicks link → /auth/callback → Session created
→ Redirect to return URL or /hives
```

### Protected Route Access
```
User visits /hives → AuthGuard checks session
→ If logged in: Render page
→ If not logged in: Store URL → Redirect to /login
→ After login: Redirect back to stored URL
```

### Logout Flow
```
User clicks logout → /logout page → useAuth.logout()
→ Supabase clears session → Redirect to /login
```

## Security Features

1. **Session Validation**: Uses Supabase's built-in session validation
2. **Secure Storage**: Sessions stored in httpOnly cookies by Supabase
3. **Automatic Refresh**: Supabase automatically refreshes expired tokens
4. **CSRF Protection**: Built into Supabase Auth
5. **Return URL Storage**: Uses sessionStorage (client-side only, not sent to server)

## Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Testing Checklist

- [ ] Unauthenticated user visiting /hives redirects to /login
- [ ] Authenticated user visiting /login redirects to /hives
- [ ] Magic link login works and redirects properly
- [ ] Logout clears session and redirects to /login
- [ ] Return URL is preserved through login flow
- [ ] Auth state updates across all components
- [ ] Loading states show appropriately
- [ ] Error messages display for failed auth

## Best Practices

1. **Always use hooks at component level**: Don't call hooks conditionally
2. **Wrap protected routes in AuthGuard**: Don't manually check auth in pages
3. **Use GuestGuard for login/register**: Prevent authenticated users from seeing auth forms
4. **Handle loading states**: Always show spinner during auth checks
5. **Clear error messages**: Use user-friendly error messages, not technical details
6. **Store minimal session data**: Only store what's necessary
7. **Never store sensitive data in sessionStorage**: Only use for non-sensitive return URLs

## Future Enhancements

- [ ] Add social OAuth providers (Google, GitHub, etc.)
- [ ] Implement role-based access control (RBAC)
- [ ] Add email verification flow
- [ ] Add password reset functionality
- [ ] Add session timeout warnings
- [ ] Add "Remember me" functionality
