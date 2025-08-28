import { createServiceLogger } from '@fineprintai/shared-logger';
import { analysisCache } from '@fineprintai/shared-cache';
import { enhancedAnalysisEngine, AnalysisRequest, EnhancedAnalysisResult } from './enhancedAnalysis';
import { modelManager } from './modelManager';
import { EventEmitter } from 'events';

const logger = createServiceLogger('queue-manager');

export interface QueueJob {
  id: string;
  analysisId: string;
  documentId: string;
  userId: string;
  request: AnalysisRequest;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  result?: EnhancedAnalysisResult;
  error?: string;
  attempts: number;
  maxAttempts: number;
  estimatedDuration?: number;
  actualDuration?: number;
  assignedModel?: string;
}

export interface QueueStats {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  queueThroughput: number; // jobs per minute
  modelUtilization: { [model: string]: number };
  currentLoad: number; // 0-1 scale
}

export interface BatchJobRequest {
  jobs: Array<{
    analysisId: string;
    documentId: string;
    userId: string;
    request: AnalysisRequest;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  }>;
  batchId?: string;
  maxConcurrency?: number;
  completionCallback?: (results: EnhancedAnalysisResult[]) => void;
}

export class QueueManager extends EventEmitter {
  private jobs: Map<string, QueueJob> = new Map();
  private queues: { [priority: string]: string[] } = {
    urgent: [],
    high: [],
    normal: [],
    low: []
  };
  
  private processing: Set<string> = new Set();
  private maxConcurrentJobs: number;
  private processingIntervalId?: NodeJS.Timeout;
  private statsIntervalId?: NodeJS.Timeout;
  private isProcessing = false;
  
  // Performance tracking
  private completedJobsLastHour: number[] = Array(60).fill(0);
  private currentMinute = new Date().getMinutes();

  constructor(maxConcurrentJobs: number = 5) {
    super();
    this.maxConcurrentJobs = maxConcurrentJobs;
    
    logger.info('Queue Manager initialized', { 
      maxConcurrentJobs: this.maxConcurrentJobs 
    });
  }

  async initialize(): Promise<void> {
    logger.info('Starting Queue Manager');
    
    try {
      // Start processing loop
      this.startProcessingLoop();
      
      // Start stats collection
      this.startStatsCollection();
      
      // Set up cleanup interval
      this.startCleanupTask();
      
      logger.info('Queue Manager started successfully');
    } catch (error) {
      logger.error('Failed to start Queue Manager', { error: error.message });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Queue Manager');
    
    this.isProcessing = false;
    
    if (this.processingIntervalId) {
      clearInterval(this.processingIntervalId);
    }
    
    if (this.statsIntervalId) {
      clearInterval(this.statsIntervalId);
    }
    
    // Wait for current jobs to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.processing.size > 0 && Date.now() - startTime < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      logger.info('Waiting for jobs to complete', { remainingJobs: this.processing.size });
    }
    
    if (this.processing.size > 0) {
      logger.warn('Force shutting down with jobs still processing', { 
        jobCount: this.processing.size 
      });
    }
    
    logger.info('Queue Manager shut down');
  }

  async addJob(
    analysisId: string,
    documentId: string,
    userId: string,
    request: AnalysisRequest,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: QueueJob = {
      id: jobId,
      analysisId,
      documentId,
      userId,
      request,
      priority,
      createdAt: new Date(),
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      estimatedDuration: this.estimateJobDuration(request)
    };

    this.jobs.set(jobId, job);
    this.queues[priority].push(jobId);

    logger.info('Job added to queue', {
      jobId,
      analysisId,
      documentId,
      userId,
      priority,
      queueSize: this.getTotalQueueSize(),
      estimatedDuration: job.estimatedDuration
    });

    this.emit('jobAdded', job);
    
    // Try to process immediately if capacity available
    if (this.processing.size < this.maxConcurrentJobs) {
      setImmediate(() => this.processNext());
    }

    return jobId;
  }

  async addBatchJobs(batchRequest: BatchJobRequest): Promise<string[]> {
    const batchId = batchRequest.batchId || `batch_${Date.now()}`;
    const jobIds: string[] = [];

    logger.info('Adding batch jobs', {
      batchId,
      jobCount: batchRequest.jobs.length,
      maxConcurrency: batchRequest.maxConcurrency
    });

    for (const jobRequest of batchRequest.jobs) {
      const jobId = await this.addJob(
        jobRequest.analysisId,
        jobRequest.documentId,
        jobRequest.userId,
        jobRequest.request,
        jobRequest.priority || 'normal'
      );
      
      jobIds.push(jobId);
      
      // Add batch metadata
      const job = this.jobs.get(jobId);
      if (job) {
        (job as any).batchId = batchId;
      }
    }

    // Track batch completion if callback provided
    if (batchRequest.completionCallback) {
      this.trackBatchCompletion(batchId, jobIds, batchRequest.completionCallback);
    }

    this.emit('batchJobsAdded', { batchId, jobIds });
    
    return jobIds;
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    if (job.status === 'processing') {
      logger.warn('Cannot cancel job that is currently processing', { jobId });
      return false;
    }

    if (job.status === 'pending') {
      // Remove from queue
      const queue = this.queues[job.priority];
      const index = queue.indexOf(jobId);
      if (index > -1) {
        queue.splice(index, 1);
      }
    }

    job.status = 'cancelled';
    job.completedAt = new Date();

    logger.info('Job cancelled', { jobId, analysisId: job.analysisId });
    this.emit('jobCancelled', job);

    return true;
  }

  getJob(jobId: string): QueueJob | undefined {
    return this.jobs.get(jobId);
  }

  getJobsByUser(userId: string): QueueJob[] {
    return Array.from(this.jobs.values()).filter(job => job.userId === userId);
  }

  getJobsByAnalysis(analysisId: string): QueueJob[] {
    return Array.from(this.jobs.values()).filter(job => job.analysisId === analysisId);
  }

  getQueueStats(): QueueStats {
    const allJobs = Array.from(this.jobs.values());
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Filter recent jobs for accurate statistics
    const recentJobs = allJobs.filter(job => job.createdAt.getTime() > oneHourAgo);
    
    const totalJobs = allJobs.length;
    const pendingJobs = allJobs.filter(job => job.status === 'pending').length;
    const processingJobs = allJobs.filter(job => job.status === 'processing').length;
    const completedJobs = allJobs.filter(job => job.status === 'completed').length;
    const failedJobs = allJobs.filter(job => job.status === 'failed').length;

    // Calculate average processing time
    const completedWithDuration = allJobs.filter(job => 
      job.status === 'completed' && job.actualDuration
    );
    const averageProcessingTime = completedWithDuration.length > 0
      ? completedWithDuration.reduce((sum, job) => sum + (job.actualDuration || 0), 0) / completedWithDuration.length
      : 0;

    // Calculate throughput (jobs per minute)
    const completedLastHour = this.completedJobsLastHour.reduce((sum, count) => sum + count, 0);
    const queueThroughput = completedLastHour;

    // Model utilization
    const modelUtilization = this.calculateModelUtilization();

    // Current load (0-1 scale)
    const currentLoad = Math.min(1, processingJobs / this.maxConcurrentJobs);

    return {
      totalJobs,
      pendingJobs,
      processingJobs,
      completedJobs,
      failedJobs,
      averageProcessingTime,
      queueThroughput,
      modelUtilization,
      currentLoad
    };
  }

  private startProcessingLoop(): void {
    this.isProcessing = true;
    
    this.processingIntervalId = setInterval(() => {
      if (this.isProcessing && this.processing.size < this.maxConcurrentJobs) {
        this.processNext();
      }
    }, 1000); // Check every second
  }

  private async processNext(): Promise<void> {
    if (this.processing.size >= this.maxConcurrentJobs) {
      return;
    }

    // Get next job by priority
    const jobId = this.getNextJobId();
    if (!jobId) {
      return;
    }

    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'pending') {
      return;
    }

    // Start processing
    job.status = 'processing';
    job.startedAt = new Date();
    this.processing.add(jobId);

    logger.info('Starting job processing', {
      jobId,
      analysisId: job.analysisId,
      priority: job.priority,
      attempt: job.attempts + 1
    });

    this.emit('jobStarted', job);

    try {
      // Get progress callback for real-time updates
      const progressCallback = (progress: { step: string; percentage: number; message: string }) => {
        this.emit('jobProgress', { jobId, ...progress });
      };

      // Process the job
      const startTime = Date.now();
      const result = await enhancedAnalysisEngine.analyzeDocumentWithProgress(
        job.request,
        progressCallback
      );
      const processingTime = Date.now() - startTime;

      // Job completed successfully
      job.status = 'completed';
      job.completedAt = new Date();
      job.result = result;
      job.actualDuration = processingTime;

      logger.info('Job completed successfully', {
        jobId,
        analysisId: job.analysisId,
        processingTime,
        overallScore: result.overallRiskScore
      });

      this.emit('jobCompleted', job);
      
      // Update throughput tracking
      this.updateThroughputStats();

    } catch (error) {
      logger.error('Job processing failed', {
        jobId,
        analysisId: job.analysisId,
        error: error.message,
        attempt: job.attempts + 1
      });

      job.attempts++;
      job.error = error.message;

      if (job.attempts >= job.maxAttempts) {
        // Job failed permanently
        job.status = 'failed';
        job.completedAt = new Date();
        
        logger.error('Job failed permanently', {
          jobId,
          analysisId: job.analysisId,
          totalAttempts: job.attempts
        });

        this.emit('jobFailed', job);
      } else {
        // Retry job
        job.status = 'pending';
        
        // Add back to queue with delay
        setTimeout(() => {
          this.queues[job.priority].push(jobId);
          logger.info('Job queued for retry', {
            jobId,
            analysisId: job.analysisId,
            attempt: job.attempts + 1
          });
        }, Math.pow(2, job.attempts) * 1000); // Exponential backoff
      }
    } finally {
      this.processing.delete(jobId);
      
      // Release assigned model if any
      if (job.assignedModel) {
        modelManager.releaseModel(job.assignedModel);
        job.assignedModel = undefined;
      }
    }
  }

  private getNextJobId(): string | null {
    // Process by priority: urgent -> high -> normal -> low
    const priorityOrder = ['urgent', 'high', 'normal', 'low'];
    
    for (const priority of priorityOrder) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        return queue.shift()!;
      }
    }
    
    return null;
  }

  private getTotalQueueSize(): number {
    return Object.values(this.queues).reduce((total, queue) => total + queue.length, 0);
  }

  private estimateJobDuration(request: AnalysisRequest): number {
    // Base estimate on content length and options
    let baseTime = 5000; // 5 seconds base
    
    if (request.content) {
      baseTime += Math.min(10000, request.content.length / 100); // 1ms per 100 chars, max 10s
    } else if (request.fileBuffer) {
      baseTime += Math.min(15000, request.fileBuffer.length / 1000); // 1ms per KB, max 15s
    } else if (request.url) {
      baseTime += 10000; // 10s for URL processing
    }
    
    // Adjust for options
    if (request.options?.includeEmbeddings) {
      baseTime += 5000; // 5s for embeddings
    }
    
    if (request.options?.includeSimilarDocuments) {
      baseTime += 3000; // 3s for similarity search
    }
    
    if (request.options?.modelPreference === 'accuracy') {
      baseTime *= 1.5; // Slower but more accurate models
    }
    
    return Math.round(baseTime);
  }

  private trackBatchCompletion(
    batchId: string,
    jobIds: string[],
    callback: (results: EnhancedAnalysisResult[]) => void
  ): void {
    const checkCompletion = () => {
      const jobs = jobIds.map(id => this.jobs.get(id)).filter(Boolean) as QueueJob[];
      const completedJobs = jobs.filter(job => 
        job.status === 'completed' || job.status === 'failed'
      );

      if (completedJobs.length === jobIds.length) {
        // All jobs completed
        const results = jobs
          .filter(job => job.status === 'completed' && job.result)
          .map(job => job.result!);
        
        logger.info('Batch completed', {
          batchId,
          totalJobs: jobIds.length,
          successfulJobs: results.length,
          failedJobs: completedJobs.length - results.length
        });

        callback(results);
        this.emit('batchCompleted', { batchId, jobIds, results });
      }
    };

    // Check completion periodically
    const checkInterval = setInterval(checkCompletion, 5000);
    
    // Also check on job completion events
    const completionHandler = (job: QueueJob) => {
      if (jobIds.includes(job.id)) {
        checkCompletion();
        if (jobIds.every(id => {
          const j = this.jobs.get(id);
          return j && (j.status === 'completed' || j.status === 'failed');
        })) {
          clearInterval(checkInterval);
          this.off('jobCompleted', completionHandler);
          this.off('jobFailed', completionHandler);
        }
      }
    };

    this.on('jobCompleted', completionHandler);
    this.on('jobFailed', completionHandler);
  }

  private calculateModelUtilization(): { [model: string]: number } {
    const utilization: { [model: string]: number } = {};
    const modelStatus = modelManager.getModelStatus();
    
    for (const [model, status] of Object.entries(modelStatus)) {
      utilization[model] = status.busy ? 1.0 : 0.0;
    }
    
    return utilization;
  }

  private updateThroughputStats(): void {
    const currentMinute = new Date().getMinutes();
    
    if (currentMinute !== this.currentMinute) {
      // New minute, reset counter
      this.currentMinute = currentMinute;
      this.completedJobsLastHour[currentMinute] = 1;
    } else {
      this.completedJobsLastHour[currentMinute]++;
    }
  }

  private startStatsCollection(): void {
    this.statsIntervalId = setInterval(() => {
      const stats = this.getQueueStats();
      
      logger.debug('Queue statistics', stats);
      this.emit('statsUpdate', stats);
      
      // Log warnings for high load
      if (stats.currentLoad > 0.8) {
        logger.warn('High queue load detected', {
          currentLoad: stats.currentLoad,
          pendingJobs: stats.pendingJobs,
          processingJobs: stats.processingJobs
        });
      }
      
    }, 30000); // Every 30 seconds
  }

  private startCleanupTask(): void {
    // Clean up old completed jobs every hour
    setInterval(() => {
      this.cleanupOldJobs();
    }, 60 * 60 * 1000);
  }

  private cleanupOldJobs(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    let cleanedCount = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt &&
        job.completedAt.getTime() < cutoffTime
      ) {
        this.jobs.delete(jobId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up old jobs', { cleanedCount });
      this.emit('jobsCleanedUp', { cleanedCount });
    }
  }

  // Methods for external monitoring
  async getDetailedStats(): Promise<any> {
    const stats = this.getQueueStats();
    const modelStats = modelManager.getModelStatus();
    
    return {
      ...stats,
      models: modelStats,
      queueSizes: {
        urgent: this.queues.urgent.length,
        high: this.queues.high.length,
        normal: this.queues.normal.length,
        low: this.queues.low.length
      },
      systemCapacity: {
        maxConcurrentJobs: this.maxConcurrentJobs,
        currentlyProcessing: this.processing.size,
        availableSlots: this.maxConcurrentJobs - this.processing.size
      }
    };
  }

  async adjustCapacity(newMaxConcurrency: number): Promise<void> {
    if (newMaxConcurrency < 1) {
      throw new Error('Max concurrency must be at least 1');
    }
    
    logger.info('Adjusting queue capacity', {
      oldCapacity: this.maxConcurrentJobs,
      newCapacity: newMaxConcurrency
    });
    
    this.maxConcurrentJobs = newMaxConcurrency;
    
    // If we increased capacity, try to process more jobs
    if (newMaxConcurrency > this.processing.size) {
      setImmediate(() => this.processNext());
    }
  }
}

// Singleton instance
export const queueManager = new QueueManager();