# New Session Flow - Migration Guide

## ✅ Completed Steps

### 1. Frontend Components
- ✅ Created [app/components/new-session-wizard.tsx](app/components/new-session-wizard.tsx)
- ✅ Created [app/components/new-session-launcher.tsx](app/components/new-session-launcher.tsx)
- ✅ Created [lib/conversations/react/useNewSessionWizard.ts](lib/conversations/react/useNewSessionWizard.ts)
- ✅ Integrated into [app/hives/[hiveId]/HiveHome.tsx](app/hives/[hiveId]/HiveHome.tsx)

### 2. Backend Services
- ✅ Created [lib/conversations/client/conversationApi.ts](lib/conversations/client/conversationApi.ts)
- ✅ Created [lib/conversations/schemas.ts](lib/conversations/schemas.ts)
- ✅ Created [lib/conversations/server/createConversation.ts](lib/conversations/server/createConversation.ts)
- ✅ Created [lib/conversations/server/importResponsesFromCsv.ts](lib/conversations/server/importResponsesFromCsv.ts)
- ✅ Created [lib/conversations/server/enqueueConversationAnalysis.ts](lib/conversations/server/enqueueConversationAnalysis.ts)

### 3. API Routes
- ✅ Created [app/api/conversations/route.ts](app/api/conversations/route.ts) (POST)
- ✅ Created [app/api/conversations/[conversationId]/upload/route.ts](app/api/conversations/[conversationId]/upload/route.ts) (POST)
- ✅ Created [app/api/conversations/[conversationId]/analyze/route.ts](app/api/conversations/[conversationId]/analyze/route.ts) (POST)

### 4. Tests
- ✅ Created comprehensive unit tests
- ✅ Created integration tests
- ✅ Created hook tests

### 5. Build Verification
- ✅ TypeScript compilation successful
- ✅ Next.js production build successful
- ✅ All routes rendering correctly

## 🔄 Required: Database Migrations

You **must** apply the database migrations to enable the new functionality:

### Option 1: Using Supabase CLI (Recommended)

```bash
# If you have Supabase CLI installed
supabase db push
```

### Option 2: Manual Migration

Execute the SQL files in order:

1. [supabase/migrations/002_create_conversation_analysis_jobs.sql](supabase/migrations/002_create_conversation_analysis_jobs.sql)
2. [supabase/migrations/003_add_analysis_fields.sql](supabase/migrations/003_add_analysis_fields.sql)

In Supabase Dashboard → SQL Editor:
1. Copy the contents of each migration file
2. Execute them in order

**What the migrations do:**

**Migration 002:**
- Creates `conversation_analysis_jobs` table for async analysis queue
- Adds `import_batch_id` column to `conversation_responses` for idempotency
- Adds `analysis_error` and `created_by` columns to `conversations`
- Creates necessary indexes for performance

**Migration 003:**
- Adds `x`, `y`, `cluster_index` columns to `conversation_responses`
- Creates `conversation_themes` table
- Creates indexes for efficient queries

## 📋 Next Steps

### 1. ✅ Analysis Worker (IMPLEMENTED!)

**A complete, production-ready analysis worker has been implemented!**

**What's included:**
- ✅ Full analysis pipeline with OpenAI embeddings, UMAP, K-Means, and GPT-4o-mini theming
- ✅ Robust job processing with retry logic and error handling
- ✅ Graceful shutdown support (SIGTERM/SIGINT)
- ✅ Structured logging with Winston
- ✅ Concurrency-safe with proper job locking
- ✅ Configurable via environment variables
- ✅ Ready for Docker/Kubernetes deployment

**Quick Start:**

1. **Set up environment variables** (see [.env.example](.env.example)):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your_url
   SUPABASE_SERVICE_ROLE_KEY=your_key
   OPENAI_API_KEY=your_openai_key
   ```

2. **Run the worker**:
   ```bash
   # Development (with auto-reload)
   npm run worker:dev

   # Production
   npm run worker
   ```

3. **Test it**: Upload a CSV to a conversation and watch the logs!

**Full documentation:** See [WORKER.md](WORKER.md) for:
- Architecture overview
- Deployment guides (Docker, Kubernetes)
- Scaling strategies
- Monitoring and troubleshooting
- Production checklist

**Files created:**
- [scripts/analysis-worker.ts](scripts/analysis-worker.ts) - Main worker process
- [lib/conversations/server/runConversationAnalysis.ts](lib/conversations/server/runConversationAnalysis.ts) - Analysis orchestrator
- [lib/analysis/openai/embeddingsClient.ts](lib/analysis/openai/embeddingsClient.ts) - Embedding generation
- [lib/analysis/clustering/dimensionReduction.ts](lib/analysis/clustering/dimensionReduction.ts) - UMAP
- [lib/analysis/clustering/kmeans.ts](lib/analysis/clustering/kmeans.ts) - K-Means clustering
- [lib/analysis/openai/themeGenerator.ts](lib/analysis/openai/themeGenerator.ts) - Theme generation

### 2. Remove Temp Files (After Testing)

Once you've verified the new implementation works:

```bash
rm -rf temp/components/new-session-*.tsx
rm -rf temp/app
```

### 3. Update Other Pages (If Needed)

Check if any other pages need the new session launcher:
- Main hives list page
- Dashboard pages
- Settings pages

## 🎉 What's Working Now

### User Flow
1. User clicks "New Session" button or card
2. Modal opens with Step 1: Session details
3. User fills in title, type (understand/decide), and optional description
4. Click "Continue" → creates conversation via API
5. Step 2: Optional CSV import
6. User can skip or upload CSV with responses
7. On finish, navigates to `/hives/{hiveId}/conversations/{conversationId}/listen`
8. Analysis job is queued (if CSV was uploaded)

### Key Features
- ✅ Real-time client-side validation
- ✅ File size and type validation
- ✅ CSV parsing with tag normalization
- ✅ Import idempotency (duplicate protection)
- ✅ Concurrent analysis job safety
- ✅ Typed errors with user-friendly messages
- ✅ Router navigation with slug support
- ✅ Fire-and-forget analysis trigger

### Security
- ✅ Server-side authentication required
- ✅ Hive membership verification
- ✅ Input validation with Zod schemas
- ✅ SQL injection protection via parameterized queries
- ✅ File upload size limits
- ✅ Row count limits for CSV imports

## 📞 Need Help?

If you encounter any issues:

1. Check TypeScript compilation: `npx tsc --noEmit`
2. Check build: `npm run build`
3. Verify database migration was applied
4. Check browser console for client errors
5. Check server logs for API errors
6. Review the comprehensive tests for usage examples
