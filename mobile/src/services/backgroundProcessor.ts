/**
 * Background Processing Service
 * Handles background document analysis with queue management
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { logger } from '../utils/logger';
import { performanceMonitor } from '../utils/performance';
import { documentProcessor, ProcessedDocument } from './documentProcessor';
import { offlineAnalysisEngine, AnalysisResult } from './offlineAnalysisEngine';
import { ocrService } from './ocrService';

const BACKGROUND_FETCH_TASK = 'background-document-processing';
const QUEUE_STORAGE_KEY = 'processing_queue';
const BACKGROUND_SETTINGS_KEY = 'background_settings';

export interface ProcessingJob {
  id: string;
  type: 'document_analysis' | 'ocr_processing' | 'sync_data' | 'cleanup';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  data: any;
  createdAt: string;
  scheduledFor?: string;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  error?: string;
  result?: any;
}

export interface BackgroundSettings {
  enabled: boolean;
  processingMode: 'battery_saver' | 'balanced' | 'performance';
  maxJobsPerSession: number;
  maxProcessingTime: number; // milliseconds
  enableLowPowerMode: boolean;
  onlyOnWifi: boolean;
  enableAnalyticsReporting: boolean;
}

export interface QueueStats {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  lastProcessingSession?: string;
}

class BackgroundProcessor {
  private processingQueue: ProcessingJob[] = [];
  private isProcessing = false;
  private settings: BackgroundSettings;
  private appStateSubscription: any;
  private backgroundTaskId: number | null = null;

  constructor() {
    this.settings = {
      enabled: true,
      processingMode: 'balanced',
      maxJobsPerSession: 10,
      maxProcessingTime: 30000, // 30 seconds
      enableLowPowerMode: true,
      onlyOnWifi: false,
      enableAnalyticsReporting: true,
    };
  }

  /**
   * Initialize background processing
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing background processor...');

      // Load settings and queue
      await this.loadSettings();
      await this.loadQueue();

      // Register background fetch task
      await this.registerBackgroundTask();

      // Set up app state monitoring
      this.setupAppStateMonitoring();

      logger.info('Background processor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize background processor:', error);
      throw error;
    }
  }

  /**
   * Add a job to the processing queue
   */
  async addJob(
    type: ProcessingJob['type'],
    data: any,
    options: {
      priority?: ProcessingJob['priority'];
      scheduledFor?: string;
      maxAttempts?: number;
    } = {}
  ): Promise<string> {
    const job: ProcessingJob = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      priority: options.priority || 'medium',
      data,
      createdAt: new Date().toISOString(),
      scheduledFor: options.scheduledFor,
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      status: 'pending',
    };

    this.processingQueue.push(job);
    await this.saveQueue();

    logger.info(`Added job ${job.id} to processing queue`);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue().catch(error => {
        logger.error('Failed to start queue processing:', error);
      });
    }

    return job.id;
  }

  /**
   * Process the job queue
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || !this.settings.enabled) {
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();
    let processedCount = 0;

    try {
      logger.info('Starting queue processing session');

      // Sort queue by priority and creation time
      const sortedQueue = this.getSortedQueue();
      const maxJobs = this.settings.maxJobsPerSession;

      for (const job of sortedQueue) {
        if (processedCount >= maxJobs) {
          logger.info(`Reached max jobs limit (${maxJobs}) for this session`);
          break;
        }

        if (Date.now() - startTime > this.settings.maxProcessingTime) {
          logger.info(`Reached max processing time limit`);
          break;
        }

        if (job.status !== 'pending') {
          continue;
        }

        // Check if job is scheduled for future
        if (job.scheduledFor && new Date(job.scheduledFor) > new Date()) {
          continue;
        }

        try {
          await this.processJob(job);
          processedCount++;
        } catch (error) {
          logger.error(`Failed to process job ${job.id}:`, error);
        }
      }

      await this.saveQueue();
      logger.info(`Processing session completed. Processed ${processedCount} jobs`);
    } catch (error) {
      logger.error('Queue processing failed:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: ProcessingJob): Promise<void> {
    const startTime = Date.now();
    job.status = 'processing';
    job.attempts++;

    try {
      logger.info(`Processing job ${job.id} (type: ${job.type}, attempt: ${job.attempts})`);
      performanceMonitor.startTimer(`background_job_${job.type}`);

      let result: any;

      switch (job.type) {
        case 'document_analysis':
          result = await this.processDocumentAnalysis(job);
          break;
        case 'ocr_processing':
          result = await this.processOCR(job);
          break;
        case 'sync_data':
          result = await this.processSyncData(job);
          break;
        case 'cleanup':
          result = await this.processCleanup(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      job.result = result;
      job.status = 'completed';
      job.progress = 100;

      const processingTime = performanceMonitor.endTimer(`background_job_${job.type}`);
      logger.info(`Job ${job.id} completed in ${processingTime}ms`);
    } catch (error) {
      job.error = error.message;
      
      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
        logger.error(`Job ${job.id} failed after ${job.attempts} attempts:`, error);
      } else {
        job.status = 'pending';
        // Schedule for retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, job.attempts - 1), 60000); // Max 1 minute
        job.scheduledFor = new Date(Date.now() + delay).toISOString();
        logger.warn(`Job ${job.id} will retry in ${delay}ms`);
      }
    }
  }

  /**
   * Process document analysis job
   */
  private async processDocumentAnalysis(job: ProcessingJob): Promise<AnalysisResult> {
    const { documentId, ocrResults } = job.data;
    
    if (!documentId || !ocrResults) {
      throw new Error('Invalid document analysis job data');
    }

    return await offlineAnalysisEngine.analyzeDocument(documentId, ocrResults, {
      enableCaching: true,
      minConfidence: 0.5,
    });
  }

  /**
   * Process OCR job
   */
  private async processOCR(job: ProcessingJob): Promise<any> {
    const { imageUris, options } = job.data;
    
    if (!imageUris || !Array.isArray(imageUris)) {
      throw new Error('Invalid OCR job data');
    }

    const results = [];
    for (let i = 0; i < imageUris.length; i++) {
      const imageUri = imageUris[i];
      job.progress = (i / imageUris.length) * 100;
      
      const ocrResult = await ocrService.extractText(imageUri, options);
      results.push(ocrResult);
    }

    return results;
  }

  /**
   * Process data sync job
   */
  private async processSyncData(job: ProcessingJob): Promise<any> {
    // This would sync with backend when connection is available
    logger.info('Processing sync data job');
    return { synced: true };
  }

  /**
   * Process cleanup job
   */
  private async processCleanup(job: ProcessingJob): Promise<any> {
    const { type } = job.data;
    
    switch (type) {
      case 'temp_files':
        await documentProcessor.cleanupTempFiles();
        break;
      case 'old_logs':
        await logger.clearLogs();
        break;
      case 'cache':
        // Clear various caches
        break;
      default:
        throw new Error(`Unknown cleanup type: ${type}`);
    }

    return { cleaned: true };
  }

  /**
   * Register background fetch task
   */
  private async registerBackgroundTask(): Promise<void> {
    try {
      // Define the background task
      TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
        try {
          logger.info('Background fetch task started');
          await this.processQueue();
          return BackgroundFetch.BackgroundFetchResult.NewData;
        } catch (error) {
          logger.error('Background fetch task failed:', error);
          return BackgroundFetch.BackgroundFetchResult.Failed;
        }
      });

      // Register the task
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
      if (!isRegistered) {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
          minimumInterval: 15 * 60, // 15 minutes
          stopOnTerminate: false,
          startOnBoot: true,
        });
        logger.info('Background fetch task registered');
      }
    } catch (error) {
      logger.error('Failed to register background task:', error);
    }
  }

  /**
   * Set up app state monitoring
   */
  private setupAppStateMonitoring(): void {
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        this.onAppBackground();
      } else if (nextAppState === 'active') {
        this.onAppForeground();
      }
    });
  }

  /**
   * Handle app going to background
   */
  private onAppBackground(): void {
    logger.info('App went to background, processing queue');
    
    // Start background processing if there are pending jobs
    const pendingJobs = this.processingQueue.filter(job => job.status === 'pending');
    if (pendingJobs.length > 0 && !this.isProcessing) {
      this.processQueue().catch(error => {
        logger.error('Failed to process queue on background:', error);
      });
    }
  }

  /**
   * Handle app coming to foreground
   */
  private onAppForeground(): void {
    logger.info('App came to foreground');
    
    // Load latest queue state
    this.loadQueue().catch(error => {
      logger.error('Failed to load queue on foreground:', error);
    });
  }

  /**
   * Get sorted queue by priority and creation time
   */
  private getSortedQueue(): ProcessingJob[] {
    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
    
    return [...this.processingQueue].sort((a, b) => {
      // First sort by priority
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by creation time (older first)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  /**
   * Load settings from storage
   */
  private async loadSettings(): Promise<void> {
    try {
      const settingsString = await AsyncStorage.getItem(BACKGROUND_SETTINGS_KEY);
      if (settingsString) {
        this.settings = { ...this.settings, ...JSON.parse(settingsString) };
      }
    } catch (error) {
      logger.error('Failed to load background settings:', error);
    }
  }

  /**
   * Save settings to storage
   */
  async saveSettings(settings: Partial<BackgroundSettings>): Promise<void> {
    try {
      this.settings = { ...this.settings, ...settings };
      await AsyncStorage.setItem(BACKGROUND_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      logger.error('Failed to save background settings:', error);
    }
  }

  /**
   * Load queue from storage
   */
  private async loadQueue(): Promise<void> {
    try {
      const queueString = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (queueString) {
        this.processingQueue = JSON.parse(queueString);
        // Clean up old completed jobs
        this.cleanupOldJobs();
      }
    } catch (error) {
      logger.error('Failed to load processing queue:', error);
    }
  }

  /**
   * Save queue to storage
   */
  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.processingQueue));
    } catch (error) {
      logger.error('Failed to save processing queue:', error);
    }
  }

  /**
   * Clean up old completed/failed jobs
   */
  private cleanupOldJobs(): void {
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoffTime = Date.now() - maxAge;
    
    const originalLength = this.processingQueue.length;
    this.processingQueue = this.processingQueue.filter(job => {
      const jobTime = new Date(job.createdAt).getTime();
      return jobTime > cutoffTime || job.status === 'pending' || job.status === 'processing';
    });
    
    if (this.processingQueue.length < originalLength) {
      logger.info(`Cleaned up ${originalLength - this.processingQueue.length} old jobs`);
    }
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): ProcessingJob | undefined {
    return this.processingQueue.find(job => job.id === jobId);
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.getJob(jobId);
    if (!job) {
      return false;
    }

    if (job.status === 'pending') {
      job.status = 'cancelled';
      await this.saveQueue();
      logger.info(`Job ${jobId} cancelled`);
      return true;
    }

    return false;
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): QueueStats {
    const stats: QueueStats = {
      totalJobs: this.processingQueue.length,
      pendingJobs: 0,
      processingJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      averageProcessingTime: 0,
    };

    this.processingQueue.forEach(job => {
      switch (job.status) {
        case 'pending':
          stats.pendingJobs++;
          break;
        case 'processing':
          stats.processingJobs++;
          break;
        case 'completed':
          stats.completedJobs++;
          break;
        case 'failed':
          stats.failedJobs++;
          break;
      }
    });

    return stats;
  }

  /**
   * Get current settings
   */
  getSettings(): BackgroundSettings {
    return { ...this.settings };
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup(): Promise<void> {
    try {
      // Save current state
      await this.saveQueue();
      
      // Remove app state listener
      if (this.appStateSubscription) {
        this.appStateSubscription.remove();
      }

      // Unregister background task
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
      if (isRegistered) {
        await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
      }

      logger.info('Background processor cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup background processor:', error);
    }
  }
}

export const backgroundProcessor = new BackgroundProcessor();