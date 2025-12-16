Hivemind is a Next.js (App Router) app built around hives (groups), conversations, and an async analysis pipeline.

## Docs (Start Here)

- Architecture + “where to look”: `docs/README.md`
- System boundaries: `docs/ARCHITECTURE.md`
- Feature map: `docs/feature-map.md`
- Setup (env, migrations, worker): `docs/setup/README.md`
- Analysis worker: `scripts/README.md`
- Auth module docs: `lib/auth/README.md`

## Getting Started

First, install deps and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Quality Commands

```bash
npm run lint
npm test
```

## Environment

- Copy `.env.example` to `.env.local` and fill in required keys.
- Apply DB migrations: `supabase/README.md`

## Scripts

- `npm run dev`: start app (localhost:3000)
- `npm run build`: production build
- `npm run start`: serve build
- `npm run lint`: ESLint
- `npm test`: Jest
- `npm run test:e2e`: Playwright
