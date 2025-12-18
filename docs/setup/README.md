# Setup (Local + Services)

## Environment

- Copy `.env.example` to `.env.local` and fill in required keys.
- Node version is pinned in `.nvmrc` (matches CI).
- Supabase env var naming:
  - Browser/client: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - Server/scripts: `SUPABASE_SECRET_KEY` (service role key)

## Database

- Apply migrations: `supabase/README.md`

## Analysis Worker

- Worker docs + commands: `scripts/README.md`
