# Analysis Worker Guide

The analysis worker processes conversation analysis jobs asynchronously, ensuring the user experience remains fast and responsive.

## Architecture

### Components

1. **Worker Process** ([scripts/analysis-worker.ts](scripts/analysis-worker.ts))
   - Polls `conversation_analysis_jobs` table for queued jobs
   - Processes one job at a time with proper locking
   - Implements retry logic with exponential backoff
   - Handles graceful shutdown (SIGTERM/SIGINT)

2. **Analysis Pipeline** ([lib/conversations/server/runConversationAnalysis.ts](lib/conversations/server/runConversationAnalysis.ts))
   - Generates embeddings via OpenAI
   - Reduces dimensions with UMAP
   - Clusters with K-Means
   - Generates themes with GPT-4o-mini
   - Saves results to database

3. **Supporting Modules**
   - [lib/analysis/openai/embeddingsClient.ts](lib/analysis/openai/embeddingsClient.ts) - Embedding generation
   - [lib/analysis/clustering/dimensionReduction.ts](lib/analysis/clustering/dimensionReduction.ts) - UMAP dimension reduction
   - [lib/analysis/clustering/kmeans.ts](lib/analysis/clustering/kmeans.ts) - K-Means clustering
   - [lib/analysis/openai/themeGenerator.ts](lib/analysis/openai/themeGenerator.ts) - Theme generation

## Setup

### Prerequisites

1. ✅ Database migration applied (see [MIGRATION.md](MIGRATION.md))
2. ✅ OpenAI API key configured
3. ✅ Supabase service role key configured

### Environment Variables

Create a `.env` file (or add to existing):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Worker Configuration (optional)
POLL_INTERVAL_MS=5000        # How often to check for jobs (default: 5000)
MAX_RETRIES=3                # Maximum retry attempts (default: 3)
LOG_LEVEL=info               # Logging level: debug, info, warn, error (default: info)
WORKER_ID=worker-1           # Worker identifier for multi-worker setup (default: auto-generated)
```

## Running the Worker

### Development Mode (with auto-reload)

```bash
npm run worker:dev
```

This uses `tsx watch` to automatically restart the worker when code changes.

### Production Mode

```bash
npm run worker
```

### Docker (Recommended for Production)

Create a `Dockerfile.worker`:

```dockerfile
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Run worker
CMD ["npm", "run", "worker"]
```

Build and run:

```bash
docker build -f Dockerfile.worker -t hivemind-worker .
docker run -d --env-file .env --name worker-1 hivemind-worker
```

### Kubernetes Deployment

Example Kubernetes deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analysis-worker
spec:
  replicas: 2  # Run 2 workers for redundancy
  selector:
    matchLabels:
      app: analysis-worker
  template:
    metadata:
      labels:
        app: analysis-worker
    spec:
      containers:
      - name: worker
        image: hivemind-worker:latest
        env:
        - name: SUPABASE_URL
          valueFrom:
            secretKeyRef:
              name: hivemind-secrets
              key: supabase-url
        - name: SUPABASE_SERVICE_ROLE_KEY
          valueFrom:
            secretKeyRef:
              name: hivemind-secrets
              key: supabase-service-key
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: hivemind-secrets
              key: openai-api-key
        - name: POLL_INTERVAL_MS
          value: "5000"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

## Monitoring

### Logging

The worker uses structured JSON logging with Winston. Logs include:

- Job start/completion
- Error details with stack traces
- Worker lifecycle events (start/stop)
- Correlation IDs for tracing

Example log output:

```json
{
  "level": "info",
  "message": "Processing job",
  "jobId": "abc-123",
  "conversationId": "conv-456",
  "attempts": 0,
  "timestamp": "2025-12-16T10:30:00.000Z",
  "service": "analysis-worker",
  "workerId": "worker-1"
}
```

### Metrics (Recommended)

Monitor these metrics in production:

- **Jobs processed per minute** - Track throughput
- **Average processing time** - Detect performance issues
- **Failed jobs rate** - Monitor reliability
- **Queue depth** - Prevent backlog buildup

Query job statistics:

```sql
-- Jobs by status
SELECT status, COUNT(*) as count
FROM conversation_analysis_jobs
GROUP BY status;

-- Average processing time
SELECT
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_seconds
FROM conversation_analysis_jobs
WHERE status = 'succeeded';

-- Failed jobs in last hour
SELECT *
FROM conversation_analysis_jobs
WHERE status = 'failed'
  AND updated_at > NOW() - INTERVAL '1 hour'
ORDER BY updated_at DESC;
```

## Scaling

### Horizontal Scaling

Run multiple workers for higher throughput:

```bash
# Terminal 1
WORKER_ID=worker-1 npm run worker

# Terminal 2
WORKER_ID=worker-2 npm run worker

# Terminal 3
WORKER_ID=worker-3 npm run worker
```

The unique constraint on active jobs prevents race conditions - only one worker will successfully lock each job.

### Vertical Scaling

Adjust worker resources based on workload:

- **CPU**: Needed for UMAP and K-Means calculations
- **Memory**: Needed for large embeddings and clustering
- **Network**: Needed for OpenAI API calls

Typical resource requirements:
- Small (< 100 responses): 512MB RAM, 0.5 CPU
- Medium (100-500 responses): 1GB RAM, 1 CPU
- Large (500+ responses): 2GB RAM, 2 CPU

## Troubleshooting

### Worker Not Processing Jobs

1. Check environment variables are set correctly
2. Verify Supabase connection: `psql $DATABASE_URL`
3. Check for queued jobs:
   ```sql
   SELECT * FROM conversation_analysis_jobs WHERE status = 'queued';
   ```
4. Review worker logs for errors

### Jobs Failing Consistently

1. Check OpenAI API key is valid
2. Verify responses exist for the conversation
3. Check OpenAI rate limits
4. Review error messages in `last_error` column:
   ```sql
   SELECT conversation_id, last_error, attempts
   FROM conversation_analysis_jobs
   WHERE status = 'failed';
   ```

### High Memory Usage

UMAP and K-Means are memory-intensive for large datasets. Solutions:

1. Increase worker memory limits
2. Sample responses (limit to 1000 per conversation)
3. Process in batches with checkpointing

### OpenAI Rate Limits

If hitting rate limits:

1. Add retry logic with exponential backoff (already implemented)
2. Use OpenAI tier upgrades
3. Reduce concurrent workers
4. Add queuing layer (e.g., Bull, BullMQ)

## Testing

### Manual Test

1. Create a conversation and upload CSV
2. Trigger analysis via API or manually insert job:
   ```sql
   INSERT INTO conversation_analysis_jobs (conversation_id, status, created_by)
   VALUES ('your-conversation-id', 'queued', 'your-user-id');
   ```
3. Start worker and monitor logs
4. Verify results in database:
   ```sql
   SELECT analysis_status FROM conversations WHERE id = 'your-conversation-id';
   SELECT * FROM conversation_themes WHERE conversation_id = 'your-conversation-id';
   ```

### Integration Tests

Add worker integration tests:

```typescript
// scripts/__tests__/analysis-worker.test.ts
import { runWorker } from '../analysis-worker';

describe('Analysis Worker', () => {
  it('should process queued jobs', async () => {
    // Test implementation
  });
});
```

## Production Checklist

- [ ] Environment variables configured
- [ ] Database migration applied
- [ ] OpenAI API key tested
- [ ] Worker deployed and running
- [ ] Logging configured (e.g., CloudWatch, Datadog)
- [ ] Monitoring/alerting set up
- [ ] Resource limits configured
- [ ] Multiple workers for redundancy
- [ ] Graceful shutdown tested
- [ ] Rate limit handling verified

## Advanced: Queue-Based Architecture

For high-scale deployments, consider moving to a dedicated queue:

### Using Bull/BullMQ with Redis

```typescript
// lib/analysis/queue.ts
import Queue from 'bull';

const analysisQueue = new Queue('conversation-analysis', {
  redis: process.env.REDIS_URL,
});

// Enqueue
analysisQueue.add({ conversationId: 'conv-123' });

// Process
analysisQueue.process(async (job) => {
  await runConversationAnalysis(supabase, job.data.conversationId);
});
```

Benefits:
- Better visibility (Bull dashboard)
- Advanced features (priority, delayed jobs, rate limiting)
- Proven reliability at scale

## Support

For issues or questions:
1. Check logs first
2. Review this documentation
3. Check database job status
4. Open an issue with logs and context
