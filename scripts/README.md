# Scripts

This folder contains operational scripts that run outside the Next.js request/response cycle.

## Analysis Worker (Optional)

**Note**: As of the auto-execution implementation, the analysis worker is **optional**. Analysis jobs now execute automatically in the background when triggered. The worker is only needed if you want to run jobs in a separate process for better resource isolation.

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

## PostgREST Schema Cache Reload

**Purpose**: Reload PostgREST's schema cache when database schema changes aren't being picked up by the Supabase API.

**When to use**:
- After applying migrations that add/modify columns
- When seeing errors like `column X does not exist` even though the column exists in the database
- The background analysis automatically uses a fallback strategy when it detects schema cache issues, but reloading the cache will restore optimal performance

**Usage**:
```bash
npm run reload-schema
```

**Alternative**: Run this SQL in Supabase SQL editor:
```sql
SELECT pg_notify('pgrst', 'reload schema');
```

Or restart your Supabase project from the dashboard.

## Troubleshooting Scripts

### Check Job Status

Diagnostic script to see the current state of analysis jobs and conversations:

```bash
npx tsx scripts/check-job-status.ts
```

### Clean Failed Jobs

When jobs fail due to PostgREST schema cache issues but the analysis actually completed:

```bash
npx tsx scripts/clean-failed-jobs.ts
```

This script:
1. Finds jobs that failed with PostgREST errors
2. Checks if their conversations actually completed analysis
3. Marks those jobs as succeeded

### Debug Jobs

Detailed diagnostic information about failed jobs:

```bash
npx tsx scripts/debug-jobs.ts
```

## Seed Mock Feedback (Report/Understand UI)

If you want lots of `agree` / `pass` / `disagree` votes so the Report generation + Understand UI look realistic, you can seed `response_feedback` for a specific conversation.

**Warning**: This uses `SUPABASE_SECRET_KEY` (service role). Double-check you're pointing at the right Supabase project.

```bash
# Dry-run (prints what it would do)
npx tsx scripts/seed-response-feedback.ts --conversationId <uuid>

# Actually write (required)
npx tsx scripts/seed-response-feedback.ts --conversationId <uuid> --users 80 --votesPerUser 30 --createUsers --confirm
```

## Common Issues

### Analysis Worker Stuck in Loop

**Symptoms**: Worker keeps retrying the same jobs endlessly with PostgREST schema cache errors.

**Root cause**: PostgREST schema cache is stale after migrations, so jobs can't be properly claimed or updated. However, the analysis completes successfully in the background.

**Solution**:
1. Run `npx tsx scripts/clean-failed-jobs.ts` to mark completed jobs as succeeded
2. Run `npx tsx scripts/reload-postgrest-schema.ts` or manually reload the schema cache
3. The worker now automatically detects this condition and won't retry endlessly

**Prevention**: The worker has been improved to detect when analysis completes despite job claim failures, preventing infinite retry loops.
