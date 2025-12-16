# `types/` (Shared Contracts)

`types/` contains shared, stable TypeScript types used across UI, services, and API routes.

## What Goes Here

- View models returned by `lib/**/server/*` and consumed by components/hooks
- Domain-adjacent types that are shared across multiple features (e.g. conversations, members, navbar)
- API contracts (request/response shapes) in `types/<domain>-api.ts` (shared shapes in `types/api.ts`)

## What Should Not Go Here

- IO implementation details (put those in `lib/**/data/*`)
- Logic (put it in `lib/**/domain/*` or `lib/**/server/*`)
