# Fine Print AI - Enhanced Queue Package

Enterprise-grade BullMQ job queue system with advanced features for scalable job processing, monitoring, and management.

## Features

### Core Functionality
- **Enterprise Queue Manager**: Enhanced BullMQ wrapper with advanced features
- **Priority-based Processing**: Subscription tier-based job prioritization
- **Dead Letter Queue**: Comprehensive failed job handling and recovery
- **Auto-scaling Workers**: Dynamic worker scaling based on queue depth
- **Job Scheduling**: Cron-based recurring job execution
- **Comprehensive Monitoring**: Real-time metrics and health checks
- **Bulk Operations**: High-throughput batch job processing

### Advanced Features
- **Subscription Tier Support**: Priority queues for Free, Starter, Professional, Team, and Enterprise tiers
- **Progress Tracking**: Real-time job progress updates with cancellation support
- **Metrics Collection**: Prometheus-compatible metrics with time-series data
- **Health Monitoring**: Automated queue health checks with alerting
- **Worker Management**: Intelligent worker scaling and load balancing
- **Error Recovery**: Advanced retry strategies with exponential backoff
- **Job Scheduling**: Flexible cron-based scheduling with timezone support

## Installation

```bash
npm install @fineprintai/queue
```

## Quick Start

### Basic Usage (Legacy API)

```typescript
import { queueManager, addAnalysisJob } from '@fineprintai/queue';

// Add a job to the analysis queue
const job = await addAnalysisJob({
  analysisId: 'analysis-123',
  documentId: 'doc-456',
  userId: 'user-789',
  content: 'Terms of Service content...',
  documentType: 'tos',
  language: 'en'
});

console.log(`Job ${job.id} added to analysis queue`);
```

### Enhanced Usage (Enterprise API)

```typescript
import { 
  enhancedQueueManager, 
  SubscriptionTier,
  addAnalysisJob 
} from '@fineprintai/queue';

// Add a prioritized job based on subscription tier
const job = await addAnalysisJob({
  analysisId: 'analysis-123',
  documentId: 'doc-456',
  userId: 'user-789',
  content: 'Terms of Service content...',
  documentType: 'tos',
  language: 'en',
  subscriptionTier: SubscriptionTier.ENTERPRISE
}, {
  priority: 20, // Enterprise tier gets highest priority
  attempts: 5,
  timeout: 300000, // 5 minutes
  tags: ['urgent', 'enterprise-customer']
});

// Monitor job progress
const status = await enhancedQueueManager.getJobStatus('analysis', job.id!);
console.log(`Job ${job.id} status:`, status);
```

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_MAX_RETRIES_PER_REQUEST=3
REDIS_RETRY_DELAY_ON_FAILOVER=100
REDIS_QUEUE_DB=1

# Queue Configuration
QUEUE_CHECK_INTERVAL=30000
QUEUE_METRICS_RETENTION_DAYS=7
PROMETHEUS_METRICS_ENABLED=true

# Worker Scaling
WORKER_MIN_SCALE=1
WORKER_MAX_SCALE=10
WORKER_SCALE_UP_THRESHOLD=20
WORKER_SCALE_DOWN_THRESHOLD=5
```

### Queue Configuration

```typescript
import { enhancedQueueManager } from '@fineprintai/queue';

// Create a custom queue with enterprise features
const customQueue = enhancedQueueManager.createQueue('custom-processing', {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  },
  deadLetterQueue: {
    enabled: true,
    maxAttempts: 5,
    retentionDays: 7,
    alertThreshold: 50
  },
  workerScaling: {
    minWorkers: 2,
    maxWorkers: 10,
    scaleUpThreshold: 20,
    scaleDownThreshold: 5,
    scaleUpDelay: 30000,
    scaleDownDelay: 60000
  }
});
```

## API Reference

### EnhancedQueueManager

The main class providing enterprise queue functionality.

#### Methods

##### `createQueue(name, options)`
Creates a new queue with enterprise features.

```typescript
const queue = enhancedQueueManager.createQueue('my-queue', {
  deadLetterQueue: { enabled: true, maxAttempts: 3 },
  workerScaling: { minWorkers: 1, maxWorkers: 5 }
});
```

##### `addJob(queueName, jobName, data, options)`
Adds a job to the specified queue with priority handling.

```typescript
const job = await enhancedQueueManager.addJob('analysis', 'analyze-doc', {
  documentId: 'doc-123',
  userId: 'user-456',
  subscriptionTier: SubscriptionTier.PROFESSIONAL
}, {
  priority: 10,
  attempts: 3,
  timeout: 120000
});
```

##### `bulkAddJobs(queueName, operation)`
Performs bulk job operations for high-throughput scenarios.

```typescript
const jobs = await enhancedQueueManager.bulkAddJobs('processing', {
  action: 'add',
  jobs: [
    { name: 'process-1', data: { id: 1 } },
    { name: 'process-2', data: { id: 2 } },
    { name: 'process-3', data: { id: 3 } }
  ],
  batchSize: 50
});
```

##### `getQueueMetrics(queueName)`
Retrieves comprehensive queue metrics.

```typescript
const metrics = await enhancedQueueManager.getQueueMetrics('analysis');
console.log(`Queue throughput: ${metrics.throughput} jobs/min`);
console.log(`Error rate: ${metrics.errorRate.toFixed(2)}%`);
```

##### `performHealthCheck(queueName)`
Performs health check on the specified queue.

```typescript
const health = await enhancedQueueManager.performHealthCheck('analysis');
if (!health.isHealthy) {
  console.error('Queue issues:', health.issues);
}
```

### Priority Management

```typescript
import { priorityManager, SubscriptionTier } from '@fineprintai/queue';

// Set custom priority configuration for a queue
priorityManager.setQueuePriorityConfig('analysis', {
  [SubscriptionTier.FREE]: 1,
  [SubscriptionTier.STARTER]: 5,
  [SubscriptionTier.PROFESSIONAL]: 10,
  [SubscriptionTier.TEAM]: 15,
  [SubscriptionTier.ENTERPRISE]: 20
});

// Calculate dynamic priority
const priority = priorityManager.calculateDynamicPriority({
  subscriptionTier: SubscriptionTier.ENTERPRISE,
  urgency: 'high',
  businessValue: 8,
  deadline: new Date(Date.now() + 3600000) // 1 hour from now
});
```

### Dead Letter Queue Management

```typescript
import { DeadLetterHandler } from '@fineprintai/queue';

const dlqHandler = new DeadLetterHandler(redisConnection);

// Get dead letter queue statistics
const stats = await dlqHandler.getDeadLetterStats('analysis');
console.log(`Total failed jobs: ${stats.totalJobs}`);

// Retry failed jobs with filters
const result = await dlqHandler.retryDeadLetterJobs('analysis', {
  errorPattern: /timeout/i,
  maxJobs: 10,
  subscriptionTier: SubscriptionTier.ENTERPRISE
});

console.log(`Retried ${result.succeeded} jobs, ${result.failed} failed`);
```

### Metrics and Monitoring

```typescript
import { MetricsCollector } from '@fineprintai/queue';

const metricsCollector = new MetricsCollector({
  collectInterval: 30000,
  retentionDays: 7,
  enablePrometheus: true
});

// Get performance insights
const insights = await metricsCollector.getPerformanceInsights('analysis');
console.log(`Performance score: ${insights.score}/100`);
console.log('Recommendations:', insights.recommendations);

// Export metrics
const prometheusMetrics = metricsCollector.exportMetrics(undefined, 'prometheus');
```

### Job Scheduling

```typescript
import { JobScheduler } from '@fineprintai/queue';

const scheduler = new JobScheduler();

// Schedule a recurring job
scheduler.scheduleJob({
  name: 'daily-cleanup',
  cron: '0 2 * * *', // Daily at 2 AM
  timezone: 'America/New_York',
  data: { type: 'cleanup', olderThan: '7d' },
  enabled: true
}, cleanupQueue);

// Get upcoming executions
const upcoming = scheduler.getUpcomingExecutions(60); // Next hour
console.log('Upcoming jobs:', upcoming);
```

### Worker Auto-scaling

```typescript
import { WorkerScaler } from '@fineprintai/queue';

const scaler = new WorkerScaler(redisConnection);

// Register queue for auto-scaling
scaler.registerQueue('analysis', {
  minWorkers: 2,
  maxWorkers: 10,
  scaleUpThreshold: 20,
  scaleDownThreshold: 5,
  scaleUpDelay: 30000,
  scaleDownDelay: 60000
}, processorFunction);

// Manual scaling
await scaler.scaleWorkers('analysis', 5, 'manual');

// Get scaling statistics
const stats = scaler.getScalingStats('analysis');
console.log(`Current workers: ${stats.currentWorkers}`);
```

## Subscription Tiers

The queue system supports five subscription tiers with different priority levels:

| Tier | Priority | Features |
|------|----------|----------|
| Free | 1 | Basic job processing |
| Starter | 5 | Priority processing |
| Professional | 10 | Enhanced monitoring |
| Team | 15 | Advanced features |
| Enterprise | 20 | All features + highest priority |

## Monitoring and Alerting

### Prometheus Metrics

The system exports comprehensive metrics compatible with Prometheus:

- `fineprint_queue_jobs_total` - Total jobs processed
- `fineprint_queue_job_duration_seconds` - Job processing duration
- `fineprint_queue_depth` - Current queue depth
- `fineprint_queue_error_rate` - Error rate percentage
- `fineprint_queue_throughput_jobs_per_minute` - Queue throughput
- `fineprint_queue_worker_utilization` - Worker utilization

### Health Checks

Automated health checks monitor:
- Redis connection health
- Queue responsiveness
- Worker availability
- Error rates and thresholds
- Memory usage and performance

## Error Handling and Recovery

### Retry Strategies

```typescript
const job = await addAnalysisJob(data, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  retryCondition: (error, attempt) => {
    // Custom retry logic
    return attempt < 3 && !error.message.includes('permanent');
  }
});
```

### Dead Letter Queue

Failed jobs are automatically moved to dead letter queues after exceeding retry attempts:

```typescript
// Monitor dead letter queue
const dlqStats = await dlqHandler.getDeadLetterStats();

// Retry jobs from DLQ
await dlqHandler.retryDeadLetterJobs('analysis', {
  olderThan: new Date(Date.now() - 3600000), // Older than 1 hour
  maxJobs: 50
});
```

## Performance Optimization

### Bulk Operations

For high-throughput scenarios, use bulk operations:

```typescript
const result = await enhancedQueueManager.bulkAddJobs('processing', {
  action: 'add',
  jobs: largeJobArray,
  batchSize: 100 // Process in batches of 100
});
```

### Worker Scaling

Configure automatic worker scaling:

```typescript
const scalingConfig = {
  minWorkers: 2,
  maxWorkers: 20,
  scaleUpThreshold: 50, // Scale up when 50+ jobs waiting
  scaleDownThreshold: 10, // Scale down when <10 jobs waiting
  scaleUpDelay: 30000, // Wait 30s between scale-ups
  scaleDownDelay: 120000 // Wait 2m between scale-downs
};
```

## Docker Support

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --production

# Copy source code
COPY dist/ ./dist/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Queue system healthy')" || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  queue-system:
    build: .
    environment:
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=production
    depends_on:
      - redis
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

volumes:
  redis_data:
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- Documentation: [Fine Print AI Docs](https://docs.fineprintai.com)
- Issues: [GitHub Issues](https://github.com/fineprintai/issues)
- Email: support@fineprintai.com