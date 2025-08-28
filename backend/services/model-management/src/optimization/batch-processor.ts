/**
 * Batch Processing System for Request Optimization
 */

import { EventEmitter } from 'events';
import pino from 'pino';
import { Redis } from 'ioredis';
import { Worker } from 'worker_threads';
import { Queue, Worker as BullWorker, Job } from 'bullmq';
import { 
  RequestContext, 
  ModelConfig, 
  ModelCapability,
  ComplexityLevel,
  RequestPriority,
  UserTier
} from '../types';

export interface BatchRequest {
  id: string;
  context: RequestContext;
  document: any;
  addedAt: Date;
  priority: number;
  estimatedTokens: number;
  similarity?: number;
}

export interface Batch {
  id: string;
  modelId: string;
  requests: BatchRequest[];
  status: BatchStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  totalTokens: number;
  maxTokens: number;
  processingTime?: number;
  results?: Map<string, any>;
  error?: string;
}

export enum BatchStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL'
}

export interface BatchingStrategy {
  maxBatchSize: number;
  maxWaitTime: number; // ms
  maxTokensPerBatch: number;
  similarityThreshold: number;
  priorityWeight: number;
  enableDynamicBatching: boolean;
}

export interface ProcessingPool {
  workers: Map<string, WorkerInfo>;
  maxWorkers: number;
  workerTimeout: number;
  resourceLimits: {
    maxMemory: number;
    maxCpu: number;
  };
}

export interface WorkerInfo {
  id: string;
  status: 'idle' | 'busy' | 'error';
  currentBatch?: string;
  processedBatches: number;
  errors: number;
  lastActivity: Date;
}

export interface BatchMetrics {
  totalBatches: number;
  successfulBatches: number;
  failedBatches: number;
  partialBatches: number;
  avgBatchSize: number;
  avgProcessingTime: number;
  avgTokensPerBatch: number;
  throughput: number;
  queueDepth: number;
  workerUtilization: number;
}

export class BatchProcessor extends EventEmitter {
  private redis: Redis;
  private logger: pino.Logger;
  private batches: Map<string, Batch> = new Map();
  private pendingRequests: Map<string, BatchRequest[]> = new Map();
  private strategy: BatchingStrategy;
  private pool: ProcessingPool;
  private queue: Queue;
  private worker: BullWorker;
  private metrics: BatchMetrics;
  private batchingTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(redis: Redis, strategy?: Partial<BatchingStrategy>) {
    super();
    this.redis = redis;
    this.logger = pino({ name: 'batch-processor' });
    
    // Default batching strategy
    this.strategy = {
      maxBatchSize: 10,
      maxWaitTime: 5000, // 5 seconds
      maxTokensPerBatch: 4096,
      similarityThreshold: 0.8,
      priorityWeight: 0.3,
      enableDynamicBatching: true,
      ...strategy
    };
    
    // Initialize processing pool
    this.pool = {
      workers: new Map(),
      maxWorkers: 4,
      workerTimeout: 120000, // 2 minutes
      resourceLimits: {
        maxMemory: 512 * 1024 * 1024, // 512MB per worker
        maxCpu: 0.5 // 50% CPU per worker
      }
    };
    
    // Initialize metrics
    this.metrics = {
      totalBatches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      partialBatches: 0,
      avgBatchSize: 0,
      avgProcessingTime: 0,
      avgTokensPerBatch: 0,
      throughput: 0,
      queueDepth: 0,
      workerUtilization: 0
    };
    
    // Initialize BullMQ queue
    this.queue = new Queue('batch-processing', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });
    
    // Initialize worker
    this.worker = new BullWorker(
      'batch-processing',
      async (job: Job) => this.processBatchJob(job),
      {
        connection: redis,
        concurrency: this.pool.maxWorkers,
        limiter: {
          max: 100,
          duration: 60000 // 100 jobs per minute
        }
      }
    );
    
    this.setupWorkerHandlers();
    this.startMetricsCollection();
  }

  /**
   * Add request to batch
   */
  async addRequest(
    request: RequestContext,
    document: any,
    modelId: string
  ): Promise<string> {
    const batchRequest: BatchRequest = {
      id: request.id,
      context: request,
      document,
      addedAt: new Date(),
      priority: this.calculatePriority(request),
      estimatedTokens: this.estimateTokens(document)
    };
    
    // Find or create pending batch for model
    let pendingBatch = this.pendingRequests.get(modelId) || [];
    
    // Check if request can be added to existing batch
    if (this.strategy.enableDynamicBatching) {
      const similarRequest = this.findSimilarRequest(batchRequest, pendingBatch);
      if (similarRequest) {
        batchRequest.similarity = similarRequest.similarity;
      }
    }
    
    pendingBatch.push(batchRequest);
    this.pendingRequests.set(modelId, pendingBatch);
    
    // Check if batch should be processed
    if (this.shouldProcessBatch(modelId, pendingBatch)) {
      await this.createAndQueueBatch(modelId, pendingBatch);
    } else {
      // Set timer for max wait time
      this.setBatchTimer(modelId);
    }
    
    this.emit('request-added', {
      requestId: request.id,
      modelId,
      pendingCount: pendingBatch.length
    });
    
    return request.id;
  }

  /**
   * Process batch immediately
   */
  async processBatchNow(modelId: string): Promise<Batch | null> {
    const pendingBatch = this.pendingRequests.get(modelId);
    if (!pendingBatch || pendingBatch.length === 0) {
      return null;
    }
    
    return await this.createAndQueueBatch(modelId, pendingBatch);
  }

  /**
   * Get batch status
   */
  getBatchStatus(batchId: string): Batch | undefined {
    return this.batches.get(batchId);
  }

  /**
   * Get pending requests for model
   */
  getPendingRequests(modelId: string): BatchRequest[] {
    return this.pendingRequests.get(modelId) || [];
  }

  /**
   * Get batch metrics
   */
  getMetrics(): BatchMetrics {
    return { ...this.metrics };
  }

  /**
   * Optimize batch grouping using similarity
   */
  optimizeBatchGrouping(requests: BatchRequest[]): BatchRequest[][] {
    if (requests.length <= this.strategy.maxBatchSize) {
      return [requests];
    }
    
    const groups: BatchRequest[][] = [];
    const processed = new Set<string>();
    
    for (const request of requests) {
      if (processed.has(request.id)) continue;
      
      const group: BatchRequest[] = [request];
      processed.add(request.id);
      
      // Find similar requests
      for (const other of requests) {
        if (processed.has(other.id)) continue;
        if (group.length >= this.strategy.maxBatchSize) break;
        
        const totalTokens = group.reduce((sum, r) => sum + r.estimatedTokens, 0) + other.estimatedTokens;
        if (totalTokens > this.strategy.maxTokensPerBatch) continue;
        
        const similarity = this.calculateSimilarity(request, other);
        if (similarity >= this.strategy.similarityThreshold) {
          group.push(other);
          processed.add(other.id);
          other.similarity = similarity;
        }
      }
      
      groups.push(group);
    }
    
    // Handle remaining requests
    const remaining = requests.filter(r => !processed.has(r.id));
    if (remaining.length > 0) {
      groups.push(...this.optimizeBatchGrouping(remaining));
    }
    
    return groups;
  }

  /**
   * Enable parallel processing for batch
   */
  async parallelProcess(
    batch: Batch,
    modelConfig: ModelConfig,
    processingFn: (requests: BatchRequest[]) => Promise<Map<string, any>>
  ): Promise<void> {
    const startTime = Date.now();
    batch.status = BatchStatus.PROCESSING;
    batch.startedAt = new Date();
    
    try {
      // Split batch into sub-batches for parallel processing
      const subBatchSize = Math.ceil(batch.requests.length / this.pool.maxWorkers);
      const subBatches: BatchRequest[][] = [];
      
      for (let i = 0; i < batch.requests.length; i += subBatchSize) {
        subBatches.push(batch.requests.slice(i, i + subBatchSize));
      }
      
      // Process sub-batches in parallel
      const results = await Promise.allSettled(
        subBatches.map(subBatch => this.processSubBatch(subBatch, modelConfig, processingFn))
      );
      
      // Combine results
      const combinedResults = new Map<string, any>();
      let hasErrors = false;
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          for (const [key, value] of result.value) {
            combinedResults.set(key, value);
          }
        } else {
          hasErrors = true;
          this.logger.error({ error: result.reason }, 'Sub-batch processing failed');
        }
      }
      
      batch.results = combinedResults;
      batch.processingTime = Date.now() - startTime;
      batch.completedAt = new Date();
      
      if (hasErrors && combinedResults.size > 0) {
        batch.status = BatchStatus.PARTIAL;
      } else if (hasErrors) {
        batch.status = BatchStatus.FAILED;
      } else {
        batch.status = BatchStatus.COMPLETED;
      }
      
      // Update metrics
      this.updateMetrics(batch);
      
      // Emit completion event
      this.emit('batch-completed', {
        batchId: batch.id,
        status: batch.status,
        processingTime: batch.processingTime,
        requestCount: batch.requests.length,
        resultCount: combinedResults.size
      });
      
    } catch (error) {
      batch.status = BatchStatus.FAILED;
      batch.error = error.message;
      batch.completedAt = new Date();
      batch.processingTime = Date.now() - startTime;
      
      this.logger.error({ error, batchId: batch.id }, 'Batch processing failed');
      this.emit('batch-failed', { batchId: batch.id, error: error.message });
    }
  }

  /**
   * Configure resource pooling
   */
  configureResourcePool(config: Partial<ProcessingPool>): void {
    this.pool = { ...this.pool, ...config };
    
    // Update worker concurrency
    if (config.maxWorkers) {
      this.worker.concurrency = config.maxWorkers;
    }
    
    this.logger.info({ pool: this.pool }, 'Resource pool configured');
  }

  // Private methods

  private shouldProcessBatch(modelId: string, requests: BatchRequest[]): boolean {
    if (requests.length >= this.strategy.maxBatchSize) {
      return true;
    }
    
    const totalTokens = requests.reduce((sum, r) => sum + r.estimatedTokens, 0);
    if (totalTokens >= this.strategy.maxTokensPerBatch) {
      return true;
    }
    
    // Check if any high-priority requests
    const hasHighPriority = requests.some(r => 
      r.context.priority === RequestPriority.URGENT ||
      r.context.userTier === UserTier.ENTERPRISE
    );
    
    if (hasHighPriority && requests.length >= Math.floor(this.strategy.maxBatchSize / 2)) {
      return true;
    }
    
    return false;
  }

  private async createAndQueueBatch(
    modelId: string,
    requests: BatchRequest[]
  ): Promise<Batch> {
    // Clear pending requests
    this.pendingRequests.delete(modelId);
    
    // Clear timer
    const timer = this.batchingTimers.get(modelId);
    if (timer) {
      clearTimeout(timer);
      this.batchingTimers.delete(modelId);
    }
    
    // Create batch
    const batch: Batch = {
      id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      modelId,
      requests,
      status: BatchStatus.PENDING,
      createdAt: new Date(),
      totalTokens: requests.reduce((sum, r) => sum + r.estimatedTokens, 0),
      maxTokens: this.strategy.maxTokensPerBatch
    };
    
    this.batches.set(batch.id, batch);
    
    // Queue for processing
    await this.queue.add('process-batch', {
      batchId: batch.id,
      modelId,
      priority: this.calculateBatchPriority(requests)
    });
    
    batch.status = BatchStatus.QUEUED;
    
    this.logger.info({
      batchId: batch.id,
      modelId,
      requestCount: requests.length,
      totalTokens: batch.totalTokens
    }, 'Batch created and queued');
    
    return batch;
  }

  private setBatchTimer(modelId: string): void {
    // Clear existing timer
    const existingTimer = this.batchingTimers.get(modelId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Set new timer
    const timer = setTimeout(async () => {
      const requests = this.pendingRequests.get(modelId);
      if (requests && requests.length > 0) {
        await this.createAndQueueBatch(modelId, requests);
      }
    }, this.strategy.maxWaitTime);
    
    this.batchingTimers.set(modelId, timer);
  }

  private async processBatchJob(job: Job): Promise<void> {
    const { batchId, modelId } = job.data;
    const batch = this.batches.get(batchId);
    
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }
    
    // Update batch status
    batch.status = BatchStatus.PROCESSING;
    batch.startedAt = new Date();
    
    try {
      // Process batch (this would call the actual model)
      // For now, simulate processing
      await this.simulateProcessing(batch);
      
      batch.status = BatchStatus.COMPLETED;
      batch.completedAt = new Date();
      batch.processingTime = batch.completedAt.getTime() - batch.startedAt.getTime();
      
      // Update metrics
      this.updateMetrics(batch);
      
      // Store results in Redis
      await this.storeResults(batch);
      
      this.emit('batch-completed', {
        batchId: batch.id,
        processingTime: batch.processingTime
      });
      
    } catch (error) {
      batch.status = BatchStatus.FAILED;
      batch.error = error.message;
      batch.completedAt = new Date();
      
      this.logger.error({ error, batchId }, 'Batch processing failed');
      throw error;
    }
  }

  private async processSubBatch(
    requests: BatchRequest[],
    modelConfig: ModelConfig,
    processingFn: (requests: BatchRequest[]) => Promise<Map<string, any>>
  ): Promise<Map<string, any>> {
    // Process sub-batch with timeout
    return Promise.race([
      processingFn(requests),
      new Promise<Map<string, any>>((_, reject) => 
        setTimeout(() => reject(new Error('Processing timeout')), this.pool.workerTimeout)
      )
    ]);
  }

  private async simulateProcessing(batch: Batch): Promise<void> {
    // Simulate processing delay based on batch size
    const delay = batch.requests.length * 100 + Math.random() * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Generate mock results
    const results = new Map<string, any>();
    for (const request of batch.requests) {
      results.set(request.id, {
        analysis: 'Mock analysis result',
        patterns: [],
        riskScore: Math.random(),
        processingTime: delay / batch.requests.length
      });
    }
    
    batch.results = results;
  }

  private calculatePriority(request: RequestContext): number {
    let priority = 0;
    
    // User tier priority
    switch (request.userTier) {
      case UserTier.ENTERPRISE:
        priority += 100;
        break;
      case UserTier.PREMIUM:
        priority += 50;
        break;
      case UserTier.FREE:
        priority += 10;
        break;
    }
    
    // Request priority
    switch (request.priority) {
      case RequestPriority.URGENT:
        priority += 40;
        break;
      case RequestPriority.HIGH:
        priority += 30;
        break;
      case RequestPriority.MEDIUM:
        priority += 20;
        break;
      case RequestPriority.LOW:
        priority += 10;
        break;
    }
    
    // Complexity (lower complexity = higher priority for quick wins)
    switch (request.complexity) {
      case ComplexityLevel.SIMPLE:
        priority += 30;
        break;
      case ComplexityLevel.MODERATE:
        priority += 20;
        break;
      case ComplexityLevel.COMPLEX:
        priority += 10;
        break;
      case ComplexityLevel.VERY_COMPLEX:
        priority += 5;
        break;
    }
    
    return priority;
  }

  private calculateBatchPriority(requests: BatchRequest[]): number {
    if (requests.length === 0) return 0;
    
    const totalPriority = requests.reduce((sum, r) => sum + r.priority, 0);
    return Math.round(totalPriority / requests.length);
  }

  private estimateTokens(document: any): number {
    // Rough estimation: 1 token per 4 characters
    const text = JSON.stringify(document);
    return Math.ceil(text.length / 4);
  }

  private findSimilarRequest(
    request: BatchRequest,
    existingRequests: BatchRequest[]
  ): { request: BatchRequest; similarity: number } | null {
    let bestMatch: { request: BatchRequest; similarity: number } | null = null;
    let highestSimilarity = 0;
    
    for (const existing of existingRequests) {
      const similarity = this.calculateSimilarity(request, existing);
      if (similarity > highestSimilarity && similarity >= this.strategy.similarityThreshold) {
        highestSimilarity = similarity;
        bestMatch = { request: existing, similarity };
      }
    }
    
    return bestMatch;
  }

  private calculateSimilarity(request1: BatchRequest, request2: BatchRequest): number {
    let similarity = 0;
    let factors = 0;
    
    // Same user tier
    if (request1.context.userTier === request2.context.userTier) {
      similarity += 0.2;
    }
    factors += 0.2;
    
    // Same request type
    if (request1.context.requestType === request2.context.requestType) {
      similarity += 0.3;
    }
    factors += 0.3;
    
    // Similar complexity
    if (request1.context.complexity === request2.context.complexity) {
      similarity += 0.2;
    }
    factors += 0.2;
    
    // Similar capabilities
    const caps1 = new Set(request1.context.capabilities);
    const caps2 = new Set(request2.context.capabilities);
    const intersection = [...caps1].filter(c => caps2.has(c));
    const union = new Set([...caps1, ...caps2]);
    
    if (union.size > 0) {
      similarity += (intersection.length / union.size) * 0.3;
    }
    factors += 0.3;
    
    return similarity / factors;
  }

  private updateMetrics(batch: Batch): void {
    this.metrics.totalBatches++;
    
    switch (batch.status) {
      case BatchStatus.COMPLETED:
        this.metrics.successfulBatches++;
        break;
      case BatchStatus.FAILED:
        this.metrics.failedBatches++;
        break;
      case BatchStatus.PARTIAL:
        this.metrics.partialBatches++;
        break;
    }
    
    // Update averages
    const alpha = 0.1; // Exponential moving average factor
    
    this.metrics.avgBatchSize = 
      this.metrics.avgBatchSize * (1 - alpha) + batch.requests.length * alpha;
    
    if (batch.processingTime) {
      this.metrics.avgProcessingTime = 
        this.metrics.avgProcessingTime * (1 - alpha) + batch.processingTime * alpha;
    }
    
    this.metrics.avgTokensPerBatch = 
      this.metrics.avgTokensPerBatch * (1 - alpha) + batch.totalTokens * alpha;
    
    // Calculate throughput (requests per second)
    if (batch.processingTime) {
      const requestsPerSecond = (batch.requests.length / batch.processingTime) * 1000;
      this.metrics.throughput = 
        this.metrics.throughput * (1 - alpha) + requestsPerSecond * alpha;
    }
  }

  private async storeResults(batch: Batch): Promise<void> {
    if (!batch.results) return;
    
    try {
      // Store each result in Redis with TTL
      for (const [requestId, result] of batch.results) {
        const key = `batch-result:${requestId}`;
        await this.redis.setex(
          key,
          3600, // 1 hour TTL
          JSON.stringify({
            batchId: batch.id,
            requestId,
            result,
            timestamp: new Date()
          })
        );
      }
      
      // Store batch summary
      const summaryKey = `batch-summary:${batch.id}`;
      await this.redis.setex(
        summaryKey,
        86400, // 24 hour TTL
        JSON.stringify({
          id: batch.id,
          modelId: batch.modelId,
          status: batch.status,
          requestCount: batch.requests.length,
          resultCount: batch.results.size,
          processingTime: batch.processingTime,
          createdAt: batch.createdAt,
          completedAt: batch.completedAt
        })
      );
    } catch (error) {
      this.logger.error({ error, batchId: batch.id }, 'Failed to store batch results');
    }
  }

  private setupWorkerHandlers(): void {
    this.worker.on('completed', (job) => {
      this.logger.info({ jobId: job.id, batchId: job.data.batchId }, 'Job completed');
    });
    
    this.worker.on('failed', (job, error) => {
      this.logger.error({ jobId: job?.id, error }, 'Job failed');
    });
    
    this.worker.on('stalled', (jobId) => {
      this.logger.warn({ jobId }, 'Job stalled');
    });
  }

  private startMetricsCollection(): void {
    setInterval(async () => {
      // Update queue depth
      const waiting = await this.queue.getWaitingCount();
      const active = await this.queue.getActiveCount();
      this.metrics.queueDepth = waiting + active;
      
      // Update worker utilization
      const busyWorkers = Array.from(this.pool.workers.values())
        .filter(w => w.status === 'busy').length;
      this.metrics.workerUtilization = 
        this.pool.workers.size > 0 ? busyWorkers / this.pool.workers.size : 0;
      
      // Emit metrics
      this.emit('metrics-updated', this.metrics);
    }, 10000); // Every 10 seconds
  }

  /**
   * Destroy batch processor
   */
  async destroy(): Promise<void> {
    // Clear all timers
    for (const timer of this.batchingTimers.values()) {
      clearTimeout(timer);
    }
    this.batchingTimers.clear();
    
    // Close queue and worker
    await this.queue.close();
    await this.worker.close();
    
    this.removeAllListeners();
    this.logger.info('Batch processor destroyed');
  }
}