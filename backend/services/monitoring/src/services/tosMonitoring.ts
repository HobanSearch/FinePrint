import { createServiceLogger } from '@fineprintai/shared-logger';
import { PrismaClient } from '@prisma/client';
import { MonitoringJobData, DocumentChangeDetected, MonitoringSchedule } from '@fineprintai/shared-types';
import { changeDetectionEngine } from './changeDetection';
import { documentCrawlerService } from './documentCrawler';
import { alertingService } from './alertingService';
import { webhookService } from './webhookService';
import * as crypto from 'crypto';

const logger = createServiceLogger('tos-monitoring-service');

interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  content: string;
  contentHash: string;
  detectedAt: Date;
  changeType: 'minor' | 'major' | 'structural';
  changeSummary?: string;
  riskScore: number;
  metadata: Record<string, any>;
}

interface MonitoringJob {
  id: string;
  documentId: string;
  url: string;
  userId: string;
  teamId?: string;
  frequency: number; // in seconds
  lastCrawledAt?: Date;
  nextCrawlAt: Date;
  isActive: boolean;
  retryCount: number;
  lastError?: string;
  crawlConfig: {
    userAgent: string;
    timeout: number;
    followRedirects: boolean;
    respectRobotsTxt: boolean;
  };
}

class TosMonitoringService {
  private prisma: PrismaClient;
  private initialized = false;
  private monitoringJobs = new Map<string, MonitoringJob>();
  private versionHistory = new Map<string, DocumentVersion[]>();

  constructor() {
    this.prisma = new PrismaClient();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing ToS monitoring service...');
    
    try {
      // Connect to database
      await this.prisma.$connect();

      // Load existing monitoring jobs
      await this.loadMonitoringJobs();

      // Initialize monitoring schedules
      await this.initializeSchedules();

      this.initialized = true;
      logger.info('ToS monitoring service initialized successfully', {
        activeJobs: this.monitoringJobs.size,
      });
    } catch (error) {
      logger.error('Failed to initialize ToS monitoring service', { error });
      throw error;
    }
  }

  async createMonitoringJob(data: {
    documentId: string;
    url: string;
    userId: string;
    teamId?: string;
    frequency: number;
    crawlConfig?: Partial<MonitoringJob['crawlConfig']>;
  }): Promise<MonitoringJob> {
    const jobId = crypto.randomUUID();
    const now = new Date();

    const job: MonitoringJob = {
      id: jobId,
      documentId: data.documentId,
      url: data.url,
      userId: data.userId,
      teamId: data.teamId,
      frequency: data.frequency,
      nextCrawlAt: new Date(now.getTime() + (data.frequency * 1000)),
      isActive: true,
      retryCount: 0,
      crawlConfig: {
        userAgent: 'FinePrintAI-Monitor/1.0',
        timeout: 30000,
        followRedirects: true,
        respectRobotsTxt: true,
        ...data.crawlConfig,
      },
    };

    // Save to database
    await this.prisma.monitoringJob.create({
      data: {
        id: job.id,
        documentId: job.documentId,
        url: job.url,
        userId: job.userId,
        teamId: job.teamId,
        frequency: job.frequency,
        nextCrawlAt: job.nextCrawlAt,
        isActive: job.isActive,
        retryCount: job.retryCount,
        crawlConfig: job.crawlConfig,
      },
    });

    this.monitoringJobs.set(job.id, job);

    logger.info('Created monitoring job', {
      jobId: job.id,
      documentId: job.documentId,
      url: job.url,
      frequency: job.frequency,
    });

    // Perform initial crawl
    await this.performInitialCrawl(job);

    return job;
  }

  async updateMonitoringJob(
    jobId: string,
    updates: Partial<Pick<MonitoringJob, 'frequency' | 'isActive' | 'crawlConfig'>>
  ): Promise<MonitoringJob> {
    const job = this.monitoringJobs.get(jobId);
    if (!job) {
      throw new Error(`Monitoring job not found: ${jobId}`);
    }

    const updatedJob = { ...job, ...updates };
    
    // Update next crawl time if frequency changed
    if (updates.frequency && updates.frequency !== job.frequency) {
      const now = new Date();
      updatedJob.nextCrawlAt = new Date(now.getTime() + (updates.frequency * 1000));
    }

    // Save to database
    await this.prisma.monitoringJob.update({
      where: { id: jobId },
      data: {
        frequency: updatedJob.frequency,
        isActive: updatedJob.isActive,
        nextCrawlAt: updatedJob.nextCrawlAt,
        crawlConfig: updatedJob.crawlConfig,
      },
    });

    this.monitoringJobs.set(jobId, updatedJob);

    logger.info('Updated monitoring job', {
      jobId,
      updates,
    });

    return updatedJob;
  }

  async deleteMonitoringJob(jobId: string): Promise<void> {
    const job = this.monitoringJobs.get(jobId);
    if (!job) {
      throw new Error(`Monitoring job not found: ${jobId}`);
    }

    // Delete from database
    await this.prisma.monitoringJob.delete({
      where: { id: jobId },
    });

    this.monitoringJobs.delete(jobId);

    logger.info('Deleted monitoring job', { jobId });
  }

  async processMonitoringJob(jobId: string): Promise<void> {
    const job = this.monitoringJobs.get(jobId);
    if (!job || !job.isActive) {
      return;
    }

    const startTime = Date.now();
    logger.debug('Processing monitoring job', {
      jobId,
      documentId: job.documentId,
      url: job.url,
    });

    try {
      // Crawl the document
      const crawlResult = await documentCrawlerService.crawlDocument(job.url, {
        userAgent: job.crawlConfig.userAgent,
        timeout: job.crawlConfig.timeout,
        followRedirects: job.crawlConfig.followRedirects,
        respectRobotsTxt: job.crawlConfig.respectRobotsTxt,
        maxRedirects: 5,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      if (!crawlResult.success || !crawlResult.content) {
        await this.handleCrawlError(job, crawlResult.error || 'Failed to crawl document');
        return;
      }

      // Get the latest version from history
      const versions = this.versionHistory.get(job.documentId) || [];
      const latestVersion = versions[versions.length - 1];

      // Calculate content hash
      const contentHash = crypto.createHash('sha256')
        .update(crawlResult.content, 'utf8')
        .digest('hex');

      // Check if content has changed
      if (latestVersion && latestVersion.contentHash === contentHash) {
        logger.debug('No changes detected for document', {
          documentId: job.documentId,
          contentHash,
        });
        
        await this.updateJobAfterSuccessfulCrawl(job);
        return;
      }

      // Analyze changes if we have a previous version
      let changeAnalysis = null;
      if (latestVersion) {
        changeAnalysis = await changeDetectionEngine.analyzeChanges({
          oldContent: latestVersion.content,
          newContent: crawlResult.content,
          documentType: 'html',
        });

        logger.info('Document changes detected', {
          documentId: job.documentId,
          changeType: changeAnalysis.changeType,
          riskChange: changeAnalysis.riskChange,
          significantChanges: changeAnalysis.significantChanges.length,
        });
      }

      // Create new version
      const newVersion: DocumentVersion = {
        id: crypto.randomUUID(),
        documentId: job.documentId,
        version: latestVersion ? latestVersion.version + 1 : 1,
        content: crawlResult.content,
        contentHash,
        detectedAt: new Date(),
        changeType: changeAnalysis?.changeType || 'minor',
        changeSummary: changeAnalysis?.changeSummary,
        riskScore: latestVersion ? 
          latestVersion.riskScore + (changeAnalysis?.riskChange || 0) : 
          50,
        metadata: {
          url: job.url,
          crawledAt: crawlResult.crawledAt,
          statusCode: crawlResult.statusCode,
          redirectUrl: crawlResult.redirectUrl,
        },
      };

      // Save version to database
      await this.prisma.documentVersion.create({
        data: {
          id: newVersion.id,
          documentId: newVersion.documentId,
          version: newVersion.version,
          content: newVersion.content,
          contentHash: newVersion.contentHash,
          detectedAt: newVersion.detectedAt,
          changeType: newVersion.changeType,
          changeSummary: newVersion.changeSummary,
          riskScore: newVersion.riskScore,
          metadata: newVersion.metadata,
        },
      });

      // Update version history
      if (!this.versionHistory.has(job.documentId)) {
        this.versionHistory.set(job.documentId, []);
      }
      this.versionHistory.get(job.documentId)!.push(newVersion);

      // Keep only last 50 versions in memory
      const versions_list = this.versionHistory.get(job.documentId)!;
      if (versions_list.length > 50) {
        this.versionHistory.set(job.documentId, versions_list.slice(-50));
      }

      // Trigger alerts and webhooks if changes detected
      if (changeAnalysis && latestVersion) {
        const changeEvent: DocumentChangeDetected = {
          documentId: job.documentId,
          oldHash: latestVersion.contentHash,
          newHash: contentHash,
          changeType: changeAnalysis.changeType,
          changeSummary: changeAnalysis.changeSummary,
          significantChanges: changeAnalysis.significantChanges,
          riskChange: changeAnalysis.riskChange,
          userId: job.userId,
          teamId: job.teamId,
        };

        // Send alerts
        await alertingService.processDocumentChange(changeEvent);

        // Trigger webhooks
        await webhookService.triggerDocumentChangeWebhook(changeEvent);
      }

      await this.updateJobAfterSuccessfulCrawl(job);
      
      const processingTime = Date.now() - startTime;
      logger.info('Monitoring job processed successfully', {
        jobId,
        documentId: job.documentId,
        version: newVersion.version,
        changeType: newVersion.changeType,
        processingTime,
      });

    } catch (error) {
      logger.error('Error processing monitoring job', {
        jobId,
        documentId: job.documentId,
        error,
      });
      
      await this.handleCrawlError(job, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async performInitialCrawl(job: MonitoringJob): Promise<void> {
    try {
      logger.info('Performing initial crawl for new monitoring job', {
        jobId: job.id,
        documentId: job.documentId,
      });

      await this.processMonitoringJob(job.id);
    } catch (error) {
      logger.error('Initial crawl failed', {
        jobId: job.id,
        error,
      });
    }
  }

  private async updateJobAfterSuccessfulCrawl(job: MonitoringJob): Promise<void> {
    const now = new Date();
    const nextCrawlAt = new Date(now.getTime() + (job.frequency * 1000));

    job.lastCrawledAt = now;
    job.nextCrawlAt = nextCrawlAt;
    job.retryCount = 0;
    job.lastError = undefined;

    await this.prisma.monitoringJob.update({
      where: { id: job.id },
      data: {
        lastCrawledAt: job.lastCrawledAt,
        nextCrawlAt: job.nextCrawlAt,
        retryCount: job.retryCount,
        lastError: job.lastError,
      },
    });

    this.monitoringJobs.set(job.id, job);
  }

  private async handleCrawlError(job: MonitoringJob, error: string): Promise<void> {
    job.retryCount++;
    job.lastError = error;

    // Exponential backoff for retries
    const backoffDelay = Math.min(job.frequency * Math.pow(2, job.retryCount - 1), 3600); // Max 1 hour
    job.nextCrawlAt = new Date(Date.now() + (backoffDelay * 1000));

    // Disable job after too many failures
    if (job.retryCount >= 5) {
      job.isActive = false;
      logger.warn('Disabling monitoring job after repeated failures', {
        jobId: job.id,
        documentId: job.documentId,
        retryCount: job.retryCount,
        lastError: error,
      });

      // Send failure alert
      await alertingService.processMonitoringError({
        documentId: job.documentId,
        alertType: 'monitoring_error',
        severity: 'high',
        title: 'Monitoring Job Disabled',
        description: `Document monitoring has been disabled after ${job.retryCount} failed attempts: ${error}`,
        metadata: {
          jobId: job.id,
          url: job.url,
          retryCount: job.retryCount,
        },
        userId: job.userId,
        teamId: job.teamId,
      });
    }

    await this.prisma.monitoringJob.update({
      where: { id: job.id },
      data: {
        retryCount: job.retryCount,
        lastError: job.lastError,
        nextCrawlAt: job.nextCrawlAt,
        isActive: job.isActive,
      },
    });

    this.monitoringJobs.set(job.id, job);
  }

  private async loadMonitoringJobs(): Promise<void> {
    const jobs = await this.prisma.monitoringJob.findMany({
      where: { isActive: true },
    });

    for (const job of jobs) {
      this.monitoringJobs.set(job.id, {
        id: job.id,
        documentId: job.documentId,
        url: job.url,
        userId: job.userId,
        teamId: job.teamId || undefined,
        frequency: job.frequency,
        lastCrawledAt: job.lastCrawledAt || undefined,
        nextCrawlAt: job.nextCrawlAt,
        isActive: job.isActive,
        retryCount: job.retryCount,
        lastError: job.lastError || undefined,
        crawlConfig: job.crawlConfig as MonitoringJob['crawlConfig'],
      });
    }

    logger.info('Loaded monitoring jobs from database', {
      jobCount: jobs.length,
    });
  }

  private async initializeSchedules(): Promise<void> {
    // Load version history for active documents
    const activeDocuments = Array.from(new Set(
      Array.from(this.monitoringJobs.values()).map(job => job.documentId)
    ));

    for (const documentId of activeDocuments) {
      const versions = await this.prisma.documentVersion.findMany({
        where: { documentId },
        orderBy: { version: 'asc' },
        take: 50, // Keep only recent versions in memory
      });

      const documentVersions: DocumentVersion[] = versions.map(v => ({
        id: v.id,
        documentId: v.documentId,
        version: v.version,
        content: v.content,
        contentHash: v.contentHash,
        detectedAt: v.detectedAt,
        changeType: v.changeType as 'minor' | 'major' | 'structural',
        changeSummary: v.changeSummary || undefined,
        riskScore: v.riskScore,
        metadata: v.metadata as Record<string, any>,
      }));

      this.versionHistory.set(documentId, documentVersions);
    }

    logger.info('Loaded version history for active documents', {
      documentCount: activeDocuments.length,
    });
  }

  async getJobsDueForProcessing(): Promise<MonitoringJob[]> {
    const now = new Date();
    return Array.from(this.monitoringJobs.values()).filter(
      job => job.isActive && job.nextCrawlAt <= now
    );
  }

  async getMonitoringStats(): Promise<{
    totalJobs: number;
    activeJobs: number;
    failedJobs: number;
    totalVersions: number;
    averageRiskScore: number;
  }> {
    const jobs = Array.from(this.monitoringJobs.values());
    const activeJobs = jobs.filter(job => job.isActive);
    const failedJobs = jobs.filter(job => job.retryCount > 0);
    
    const totalVersions = Array.from(this.versionHistory.values())
      .reduce((sum, versions) => sum + versions.length, 0);
    
    const allVersions = Array.from(this.versionHistory.values()).flat();
    const averageRiskScore = allVersions.length > 0 ?
      allVersions.reduce((sum, v) => sum + v.riskScore, 0) / allVersions.length : 0;

    return {
      totalJobs: jobs.length,
      activeJobs: activeJobs.length,
      failedJobs: failedJobs.length,
      totalVersions,
      averageRiskScore,
    };
  }

  async getDocumentVersionHistory(documentId: string, limit = 10): Promise<DocumentVersion[]> {
    const versions = this.versionHistory.get(documentId) || [];
    return versions.slice(-limit).reverse(); // Return latest versions first
  }

  async healthCheck(): Promise<void> {
    if (!this.initialized) {
      throw new Error('ToS monitoring service not initialized');
    }

    // Test database connection
    await this.prisma.$queryRaw`SELECT 1`;

    // Check if we have active jobs
    const activeJobs = Array.from(this.monitoringJobs.values()).filter(job => job.isActive);
    if (activeJobs.length === 0) {
      logger.warn('No active monitoring jobs found');
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down ToS monitoring service...');
    
    await this.prisma.$disconnect();
    this.monitoringJobs.clear();
    this.versionHistory.clear();
    this.initialized = false;
    
    logger.info('ToS monitoring service shutdown complete');
  }
}

export const tosMonitoringService = new TosMonitoringService();