import { PrismaClient } from '@prisma/client';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { 
  NotificationRequest, 
  NotificationResponse, 
  BulkNotificationRequest,
  NotificationChannel 
} from '@fineprintai/shared-types';

import { emailService } from './emailService';
import { webhookService } from './webhookService';
import { pushService } from './pushService';
import { preferenceService } from './preferenceService';
import { deliveryTracker } from './deliveryTracker';
import { abTestService } from './abTestService';
import { templateService } from './templateService';

const logger = createServiceLogger('notification-service');
const prisma = new PrismaClient();

// Redis connection for BullMQ
const redis = new IORedis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
});

export interface NotificationJobData {
  notificationId: string;
  userId: string;
  channels: NotificationChannel[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  scheduledAt?: Date;
  retryAttempts?: number;
}

export interface BatchNotificationJobData {
  notifications: NotificationJobData[];
  batchId: string;
  userId: string;
}

class NotificationService {
  private notificationQueue: Queue<NotificationJobData>;
  private batchQueue: Queue<BatchNotificationJobData>;
  private priorityQueue: Queue<NotificationJobData>;
  private retryQueue: Queue<NotificationJobData>;
  
  private notificationWorker: Worker<NotificationJobData>;
  private batchWorker: Worker<BatchNotificationJobData>;
  private priorityWorker: Worker<NotificationJobData>;
  private retryWorker: Worker<NotificationJobData>;
  
  private initialized = false;

  constructor() {
    // Initialize queues
    this.notificationQueue = new Queue<NotificationJobData>('notifications', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.batchQueue = new Queue<BatchNotificationJobData>('batch-notifications', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    });

    this.priorityQueue = new Queue<NotificationJobData>('priority-notifications', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 100,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });

    this.retryQueue = new Queue<NotificationJobData>('retry-notifications', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 50,
        attempts: 1, // Single retry attempt
      },
    });

    // Initialize workers
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    // Main notification worker
    this.notificationWorker = new Worker<NotificationJobData>(
      'notifications',
      async (job: Job<NotificationJobData>) => {
        return this.processNotification(job.data);
      },
      {
        connection: redis,
        concurrency: 10,
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    // Batch notification worker
    this.batchWorker = new Worker<BatchNotificationJobData>(
      'batch-notifications',
      async (job: Job<BatchNotificationJobData>) => {
        return this.processBatchNotifications(job.data);
      },
      {
        connection: redis,
        concurrency: 5,
        removeOnComplete: 50,
        removeOnFail: 25,
      }
    );

    // Priority notification worker (higher concurrency)
    this.priorityWorker = new Worker<NotificationJobData>(
      'priority-notifications',
      async (job: Job<NotificationJobData>) => {
        return this.processNotification(job.data);
      },
      {
        connection: redis,
        concurrency: 20,
        removeOnComplete: 200,
        removeOnFail: 100,
      }
    );

    // Retry worker
    this.retryWorker = new Worker<NotificationJobData>(
      'retry-notifications',
      async (job: Job<NotificationJobData>) => {
        return this.processNotification(job.data);
      },
      {
        connection: redis,
        concurrency: 5,
        removeOnComplete: 50,
        removeOnFail: 50,
      }
    );

    // Add error handlers
    this.addWorkerErrorHandlers();
  }

  private addWorkerErrorHandlers(): void {
    const workers = [
      this.notificationWorker,
      this.batchWorker,
      this.priorityWorker,
      this.retryWorker,
    ];

    workers.forEach((worker, index) => {
      const workerNames = ['notification', 'batch', 'priority', 'retry'];
      const workerName = workerNames[index];

      worker.on('error', (error) => {
        logger.error(`${workerName} worker error`, { error });
      });

      worker.on('failed', (job, error) => {
        logger.error(`${workerName} job failed`, {
          jobId: job?.id,
          jobData: job?.data,
          error: error.message,
        });
      });

      worker.on('completed', (job) => {
        logger.info(`${workerName} job completed`, {
          jobId: job.id,
          duration: job.processedOn ? Date.now() - job.processedOn : 0,
        });
      });
    });
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Test database connection
      await prisma.$connect();
      
      // Test Redis connection
      await redis.ping();
      
      // Initialize dependent services
      await Promise.all([
        emailService.initialize(),
        webhookService.initialize(),
        pushService.initialize(),
        preferenceService.initialize(),
        deliveryTracker.initialize(),
        abTestService.initialize(),
        templateService.initialize(),
      ]);

      this.initialized = true;
      logger.info('Notification service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize notification service', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      // Close workers
      await Promise.all([
        this.notificationWorker.close(),
        this.batchWorker.close(),
        this.priorityWorker.close(),
        this.retryWorker.close(),
      ]);

      // Close queues
      await Promise.all([
        this.notificationQueue.close(),
        this.batchQueue.close(),
        this.priorityQueue.close(),
        this.retryQueue.close(),
      ]);

      // Disconnect from databases
      await prisma.$disconnect();
      await redis.quit();

      this.initialized = false;
      logger.info('Notification service shut down successfully');
    } catch (error) {
      logger.error('Error during notification service shutdown', { error });
      throw error;
    }
  }

  // Create and queue a single notification
  public async createNotification(request: NotificationRequest): Promise<NotificationResponse> {
    try {
      // Check user preferences and GDPR compliance
      const preferences = await preferenceService.getUserPreferences(request.userId);
      if (!preferences?.consentGiven) {
        throw new Error('User has not given consent for notifications');
      }

      // Filter channels based on user preferences
      const allowedChannels = this.filterChannelsByPreferences(
        request.channels,
        preferences
      );

      if (allowedChannels.length === 0) {
        throw new Error('No allowed channels for this user');
      }

      // Apply A/B testing if configured
      const processedRequest = await abTestService.processNotificationForTest(request);

      // Create notification record
      const notification = await prisma.notification.create({
        data: {
          id: uuidv4(),
          userId: request.userId,
          type: request.type,
          category: this.getCategoryFromType(request.type),
          priority: this.getPriorityFromType(request.type),
          title: processedRequest.title,
          message: processedRequest.message,
          data: request.data ? JSON.stringify(request.data) : null,
          actionUrl: request.actionUrl,
          scheduledAt: request.scheduledAt || new Date(),
          expiresAt: request.expiresAt,
          templateId: processedRequest.templateId,
          abTestGroup: processedRequest.abTestGroup,
          abTestId: processedRequest.abTestId,
        },
      });

      // Create delivery records for each channel
      await Promise.all(
        allowedChannels.map(channel =>
          prisma.notificationDelivery.create({
            data: {
              id: uuidv4(),
              notificationId: notification.id,
              channel: channel.type,
              webhookUrl: channel.type === 'webhook' ? channel.config.url : null,
            },
          })
        )
      );

      // Queue the notification
      const jobData: NotificationJobData = {
        notificationId: notification.id,
        userId: request.userId,
        channels: allowedChannels,
        priority: notification.priority as 'low' | 'normal' | 'high' | 'urgent',
        scheduledAt: notification.scheduledAt,
      };

      const queue = this.getQueueByPriority(notification.priority);
      const delay = notification.scheduledAt 
        ? Math.max(0, notification.scheduledAt.getTime() - Date.now())
        : 0;

      await queue.add(`notification-${notification.id}`, jobData, {
        delay,
        priority: this.getPriorityScore(notification.priority),
      });

      logger.info('Notification created and queued', {
        notificationId: notification.id,
        userId: request.userId,
        type: request.type,
        channels: allowedChannels.length,
      });

      return {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data ? JSON.parse(notification.data) : null,
        readAt: notification.readAt,
        actionUrl: notification.actionUrl,
        expiresAt: notification.expiresAt,
        createdAt: notification.createdAt,
      };
    } catch (error) {
      logger.error('Failed to create notification', { error, request });
      throw error;
    }
  }

  // Create and queue bulk notifications
  public async createBulkNotifications(request: BulkNotificationRequest): Promise<{
    batchId: string;
    queued: number;
    skipped: number;
  }> {
    try {
      const batchId = uuidv4();
      const batchSize = request.batchSize || 100;
      let queued = 0;
      let skipped = 0;

      // Process users in batches
      for (let i = 0; i < request.userIds.length; i += batchSize) {
        const userBatch = request.userIds.slice(i, i + batchSize);
        const notifications: NotificationJobData[] = [];

        for (const userId of userBatch) {
          try {
            // Check user preferences
            const preferences = await preferenceService.getUserPreferences(userId);
            if (!preferences?.consentGiven) {
              skipped++;
              continue;
            }

            // Filter channels
            const allowedChannels = this.filterChannelsByPreferences(
              request.channels,
              preferences
            );

            if (allowedChannels.length === 0) {
              skipped++;
              continue;
            }

            // Create notification record
            const notification = await prisma.notification.create({
              data: {
                id: uuidv4(),
                userId,
                type: request.type,
                category: this.getCategoryFromType(request.type),
                priority: this.getPriorityFromType(request.type),
                title: request.title,
                message: request.message,
                data: request.data ? JSON.stringify(request.data) : null,
                actionUrl: request.actionUrl,
              },
            });

            // Create delivery records
            await Promise.all(
              allowedChannels.map(channel =>
                prisma.notificationDelivery.create({
                  data: {
                    id: uuidv4(),
                    notificationId: notification.id,
                    channel: channel.type,
                    webhookUrl: channel.type === 'webhook' ? channel.config.url : null,
                  },
                })
              )
            );

            notifications.push({
              notificationId: notification.id,
              userId,
              channels: allowedChannels,
              priority: notification.priority as 'low' | 'normal' | 'high' | 'urgent',
            });

            queued++;
          } catch (error) {
            logger.warn('Failed to create notification for user', { userId, error });
            skipped++;
          }
        }

        // Queue batch if we have notifications
        if (notifications.length > 0) {
          await this.batchQueue.add(
            `batch-${batchId}-${i}`,
            {
              notifications,
              batchId,
              userId: 'bulk', // Placeholder for bulk operations
            },
            {
              priority: 50, // Medium priority for bulk operations
            }
          );
        }
      }

      logger.info('Bulk notifications created', {
        batchId,
        totalUsers: request.userIds.length,
        queued,
        skipped,
      });

      return { batchId, queued, skipped };
    } catch (error) {
      logger.error('Failed to create bulk notifications', { error, request });
      throw error;
    }
  }

  // Process individual notification
  private async processNotification(jobData: NotificationJobData): Promise<void> {
    try {
      const notification = await prisma.notification.findUnique({
        where: { id: jobData.notificationId },
        include: {
          template: true,
          channels: true,
        },
      });

      if (!notification) {
        throw new Error(`Notification ${jobData.notificationId} not found`);
      }

      // Check if notification has expired
      if (notification.expiresAt && notification.expiresAt < new Date()) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'expired' },
        });
        return;
      }

      // Update status to processing
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'processing' },
      });

      // Process each channel
      const deliveryPromises = jobData.channels.map(async (channel) => {
        try {
          const deliveryRecord = await prisma.notificationDelivery.findFirst({
            where: {
              notificationId: notification.id,
              channel: channel.type,
            },
          });

          if (!deliveryRecord) {
            throw new Error(`Delivery record not found for channel ${channel.type}`);
          }

          await this.processChannel(notification, channel, deliveryRecord.id);
        } catch (error) {
          logger.error('Failed to process channel', {
            notificationId: notification.id,
            channel: channel.type,
            error,
          });
        }
      });

      await Promise.allSettled(deliveryPromises);

      // Update notification status
      const deliveries = await prisma.notificationDelivery.findMany({
        where: { notificationId: notification.id },
      });

      const allFailed = deliveries.every(d => d.status === 'failed');
      const anyDelivered = deliveries.some(d => 
        ['sent', 'delivered', 'opened', 'clicked'].includes(d.status)
      );

      const finalStatus = allFailed ? 'failed' : anyDelivered ? 'sent' : 'processing';

      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: finalStatus },
      });

      // Track delivery metrics
      await deliveryTracker.trackDelivery(notification.id, finalStatus);

      logger.info('Notification processed', {
        notificationId: notification.id,
        status: finalStatus,
        channelsProcessed: jobData.channels.length,
      });
    } catch (error) {
      logger.error('Failed to process notification', {
        notificationId: jobData.notificationId,
        error,
      });

      // Update notification status to failed
      await prisma.notification.update({
        where: { id: jobData.notificationId },
        data: { status: 'failed' },
      }).catch(() => {}); // Ignore secondary errors

      throw error;
    }
  }

  // Process batch notifications
  private async processBatchNotifications(jobData: BatchNotificationJobData): Promise<void> {
    try {
      logger.info('Processing batch notifications', {
        batchId: jobData.batchId,
        count: jobData.notifications.length,
      });

      // Process notifications in smaller sub-batches to avoid overwhelming services
      const subBatchSize = 10;
      
      for (let i = 0; i < jobData.notifications.length; i += subBatchSize) {
        const subBatch = jobData.notifications.slice(i, i + subBatchSize);
        
        const processingPromises = subBatch.map(notification =>
          this.processNotification(notification).catch(error => {
            logger.error('Failed to process notification in batch', {
              notificationId: notification.notificationId,
              batchId: jobData.batchId,
              error,
            });
          })
        );

        await Promise.allSettled(processingPromises);
        
        // Small delay between sub-batches to avoid rate limits
        if (i + subBatchSize < jobData.notifications.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      logger.info('Batch notifications processed', {
        batchId: jobData.batchId,
        count: jobData.notifications.length,
      });
    } catch (error) {
      logger.error('Failed to process batch notifications', {
        batchId: jobData.batchId,
        error,
      });
      throw error;
    }
  }

  // Process individual channel delivery
  private async processChannel(
    notification: any,
    channel: NotificationChannel,
    deliveryId: string
  ): Promise<void> {
    try {
      // Update delivery status to processing
      await prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'processing',
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });

      let result;
      
      switch (channel.type) {
        case 'email':
          result = await emailService.sendEmail({
            userId: notification.userId,
            notificationId: notification.id,
            template: notification.template,
            data: notification.data ? JSON.parse(notification.data) : {},
            deliveryId,
          });
          break;

        case 'webhook':
          result = await webhookService.sendWebhook({
            url: channel.config.url,
            method: channel.config.method || 'POST',
            headers: channel.config.headers || {},
            payload: {
              notificationId: notification.id,
              userId: notification.userId,
              type: notification.type,
              title: notification.title,
              message: notification.message,
              data: notification.data ? JSON.parse(notification.data) : null,
              actionUrl: notification.actionUrl,
              createdAt: notification.createdAt,
            },
            deliveryId,
          });
          break;

        case 'push':
          result = await pushService.sendPushNotification({
            userId: notification.userId,
            title: notification.title,
            body: notification.message,
            data: notification.data ? JSON.parse(notification.data) : {},
            actionUrl: notification.actionUrl,
            deliveryId,
          });
          break;

        default:
          throw new Error(`Unsupported channel type: ${channel.type}`);
      }

      // Update delivery status based on result
      await prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: result.success ? 'sent' : 'failed',
          providerId: result.providerId,
          providerStatus: result.providerStatus,
          sentAt: result.success ? new Date() : null,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        },
      });

      if (!result.success && result.retryable) {
        // Schedule retry if the error is retryable
        await this.scheduleRetry(notification.id, channel, deliveryId);
      }
    } catch (error) {
      logger.error('Failed to process channel', {
        notificationId: notification.id,
        channel: channel.type,
        deliveryId,
        error,
      });

      // Update delivery status to failed
      await prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'failed',
          errorMessage: error.message,
          failedAt: new Date(),
        },
      });
    }
  }

  // Schedule retry for failed delivery
  private async scheduleRetry(
    notificationId: string,
    channel: NotificationChannel,
    deliveryId: string
  ): Promise<void> {
    try {
      const delivery = await prisma.notificationDelivery.findUnique({
        where: { id: deliveryId },
      });

      if (!delivery || delivery.attempts >= delivery.maxAttempts) {
        return; // No more retries
      }

      // Calculate retry delay (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, delivery.attempts), 300000); // Max 5 minutes
      const nextRetryAt = new Date(Date.now() + delay);

      await prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: { nextRetryAt },
      });

      // Queue retry
      await this.retryQueue.add(
        `retry-${deliveryId}`,
        {
          notificationId,
          userId: delivery.id, // Placeholder - will be fetched in worker
          channels: [channel],
          priority: 'normal',
          retryAttempts: delivery.attempts,
        },
        { delay }
      );

      logger.info('Retry scheduled', {
        notificationId,
        deliveryId,
        attempt: delivery.attempts + 1,
        delay,
      });
    } catch (error) {
      logger.error('Failed to schedule retry', {
        notificationId,
        deliveryId,
        error,
      });
    }
  }

  // Helper methods
  private filterChannelsByPreferences(
    channels: NotificationChannel[],
    preferences: any
  ): NotificationChannel[] {
    return channels.filter(channel => {
      switch (channel.type) {
        case 'email':
          return preferences.emailEnabled;
        case 'push':
          return preferences.pushEnabled;
        case 'webhook':
          return preferences.webhookEnabled;
        default:
          return preferences.inAppEnabled;
      }
    });
  }

  private getCategoryFromType(type: string): string {
    const transactionalTypes = [
      'analysis_complete',
      'document_changed',
      'action_required',
      'system_alert'
    ];
    
    return transactionalTypes.includes(type) ? 'transactional' : 'marketing';
  }

  private getPriorityFromType(type: string): string {
    const priorityMap: Record<string, string> = {
      system_alert: 'urgent',
      action_required: 'high',
      analysis_complete: 'normal',
      document_changed: 'normal',
      subscription_update: 'low',
    };

    return priorityMap[type] || 'normal';
  }

  private getQueueByPriority(priority: string): Queue<NotificationJobData> {
    return priority === 'urgent' || priority === 'high' 
      ? this.priorityQueue 
      : this.notificationQueue;
  }

  private getPriorityScore(priority: string): number {
    const scores = {
      urgent: 100,
      high: 75,
      normal: 50,
      low: 25,
    };
    return scores[priority as keyof typeof scores] || 50;
  }

  // Public API methods for getting notifications
  public async getUserNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      type?: string;
      category?: string;
    } = {}
  ): Promise<NotificationResponse[]> {
    const {
      limit = 50,
      offset = 0,
      unreadOnly = false,
      type,
      category,
    } = options;

    const whereClause: any = { userId };
    
    if (unreadOnly) {
      whereClause.readAt = null;
    }
    
    if (type) {
      whereClause.type = type;
    }
    
    if (category) {
      whereClause.category = category;
    }

    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        data: true,
        readAt: true,
        actionUrl: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return notifications.map(notification => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data ? JSON.parse(notification.data) : null,
      readAt: notification.readAt,
      actionUrl: notification.actionUrl,
      expiresAt: notification.expiresAt,
      createdAt: notification.createdAt,
    }));
  }

  public async markNotificationAsRead(notificationId: string): Promise<void> {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });

    // Track engagement
    await deliveryTracker.trackEngagement(notificationId, 'read');
  }

  public async getNotificationStats(userId?: string): Promise<any> {
    const whereClause = userId ? { userId } : {};

    const stats = await prisma.notification.groupBy({
      by: ['status'],
      where: whereClause,
      _count: { _all: true },
    });

    return stats.reduce((acc, stat) => {
      acc[stat.status] = stat._count._all;
      return acc;
    }, {} as Record<string, number>);
  }
}

export const notificationService = new NotificationService();