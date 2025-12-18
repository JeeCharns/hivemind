# Scripts

This folder contains operational scripts that run outside the Next.js request/response cycle.

## Analysis Worker

The analysis worker processes conversation analysis jobs asynchronously so the UI stays responsive.

### Key Components

- Worker loop: `scripts/analysis-worker.ts`
- Analysis pipeline orchestrator: `lib/conversations/server/runConversationAnalysis.ts`
- OpenAI embeddings: `lib/analysis/openai/embeddingsClient.ts`
- Dimension reduction: `lib/analysis/clustering/dimensionReduction.ts`
- Clustering: `lib/analysis/clustering/kmeans.ts`
- Theme generation: `lib/analysis/openai/themeGenerator.ts`

### Prerequisites

- Database migrations applied (see `supabase/README.md`)
- `OPENAI_API_KEY` configured
- `SUPABASE_SECRET_KEY` configured (worker runs server-side; legacy alias `SUPABASE_SERVICE_ROLE_KEY` supported)

### Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SECRET_KEY=your_service_role_key
# (optional legacy alias supported by some scripts)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Worker Configuration (optional)
POLL_INTERVAL_MS=5000
MAX_RETRIES=3
LOG_LEVEL=info
WORKER_ID=worker-1
```

### Run

```bash
npm run worker:dev
npm run worker
```
