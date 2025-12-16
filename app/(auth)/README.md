# `(auth)` Route Group

This folder owns the login/register/logout/callback UI and should stay thin.

## Responsibilities

- Render auth pages and forms.
- Delegate auth state + side effects to `lib/auth/*` (preferred) and/or `app/(auth)/hooks/*` (legacy).

## Key Code Pointers

- Pages: `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `app/(auth)/logout/page.tsx`, `app/(auth)/callback/page.tsx`
- Components: `app/(auth)/components/*`
- Auth module (canonical): `lib/auth/*`

## Guardrail

Avoid putting business logic (session parsing, redirects, Supabase calls) directly in page components; keep it in `lib/auth/*` and call through hooks/components.

