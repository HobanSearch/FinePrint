import { PrismaClient } from '@prisma/client';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('delivery-tracker');
const prisma = new PrismaClient();

// Redis connection for analytics aggregation
const redis = new IORedis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
});

export interface DeliveryEvent {
  deliveryId: string;
  notificationId: string;
  userId?: string;
  event: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed' | 'unsubscribed';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface DeliveryStats {
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalFailed: number;
  totalBounced: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

export interface AnalyticsJobData {
  type: 'delivery_event' | 'daily_aggregation' | 'user_engagement';
  data: any;
  timestamp: Date;
}

class DeliveryTracker {
  private analyticsQueue: Queue<AnalyticsJobData>;
  private analyticsWorker: Worker<AnalyticsJobData>;
  private initialized = false;

  constructor() {
    // Initialize analytics queue
    this.analyticsQueue = new Queue<AnalyticsJobData>('delivery-analytics', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 500,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Initialize analytics worker
    this.analyticsWorker = new Worker<AnalyticsJobData>(
      'delivery-analytics',
      async (job: Job<AnalyticsJobData>) => {
        return this.processAnalyticsJob(job.data);
      },
      {
        connection: redis,
        concurrency: 5,
        removeOnComplete: 1000,
        removeOnFail: 500,
      }
    );

    // Add error handlers
    this.addWorkerErrorHandlers();
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Test database connection
      await prisma.$connect();
      
      // Test Redis connection
      await redis.ping();

      // Schedule daily aggregation job
      await this.scheduleDailyAggregation();

      this.initialized = true;
      logger.info('Delivery tracker initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize delivery tracker', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      // Close worker and queue
      await this.analyticsWorker.close();
      await this.analyticsQueue.close();

      // Disconnect from databases
      await prisma.$disconnect();
      await redis.quit();

      this.initialized = false;
      logger.info('Delivery tracker shut down successfully');
    } catch (error) {
      logger.error('Error during delivery tracker shutdown', { error });
    }
  }

  // Track delivery events
  public async trackDelivery(notificationId: string, status: string, metadata?: any): Promise<void> {
    try {
      // Update notification status
      await prisma.notification.update({
        where: { id: notificationId },
        data: { status },
      });

      // Queue analytics job
      await this.analyticsQueue.add('delivery-event', {
        type: 'delivery_event',
        data: {
          notificationId,
          status,
          metadata,
        },
        timestamp: new Date(),
      });

      logger.debug('Delivery tracked', { notificationId, status });
    } catch (error) {
      logger.error('Failed to track delivery', { error, notificationId, status });
    }
  }

  // Track engagement events (opens, clicks)
  public async trackEngagement(
    deliveryId: string,
    event: 'opened' | 'clicked',
    metadata?: any
  ): Promise<void> {
    try {
      const updateData: any = {};
      
      switch (event) {
        case 'opened':
          updateData.status = 'opened';
          updateData.openedAt = new Date();
          break;
        case 'clicked':
          updateData.status = 'clicked';
          updateData.clickedAt = new Date();
          break;
      }

      // Update delivery record
      await prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: updateData,
      });

      // Queue analytics job
      await this.analyticsQueue.add('engagement-event', {
        type: 'user_engagement',
        data: {
          deliveryId,
          event,
          metadata,
        },
        timestamp: new Date(),
      });

      logger.debug('Engagement tracked', { deliveryId, event });
    } catch (error) {
      logger.error('Failed to track engagement', { error, deliveryId, event });
    }
  }

  // Track email-specific events from webhooks
  public async trackEmailEvent(
    deliveryId: string,
    event: string,
    providerId?: string,
    metadata?: any
  ): Promise<void> {
    try {
      const updateData: any = {
        providerStatus: event,
      };

      switch (event.toLowerCase()) {
        case 'delivered':
          updateData.status = 'delivered';
          updateData.deliveredAt = new Date();
          break;
        case 'opened':
          updateData.status = 'opened';
          updateData.openedAt = new Date();
          break;
        case 'clicked':
          updateData.status = 'clicked';
          updateData.clickedAt = new Date();
          break;
        case 'bounced':
        case 'bounce':
          updateData.status = 'bounced';
          updateData.failedAt = new Date();
          updateData.errorMessage = metadata?.reason || 'Email bounced';
          break;
        case 'dropped':
        case 'blocked':
          updateData.status = 'failed';
          updateData.failedAt = new Date();
          updateData.errorMessage = metadata?.reason || 'Email dropped/blocked';
          break;
        case 'unsubscribed':
          // Handle unsubscribe separately
          await this.handleUnsubscribeEvent(deliveryId, metadata);
          break;
      }

      if (providerId) {
        updateData.providerId = providerId;
      }

      await prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: updateData,
      });

      // Queue analytics job
      await this.analyticsQueue.add('email-event', {
        type: 'delivery_event',
        data: {
          deliveryId,
          event,
          providerId,
          metadata,
        },
        timestamp: new Date(),
      });

      logger.debug('Email event tracked', { deliveryId, event, providerId });
    } catch (error) {
      logger.error('Failed to track email event', { error, deliveryId, event });
    }
  }

  // Get delivery statistics
  public async getDeliveryStats(options: {
    userId?: string;
    notificationId?: string;
    channel?: string;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<DeliveryStats> {
    try {
      const {
        userId,
        notificationId,
        channel,
        dateFrom,
        dateTo,
      } = options;

      const whereClause: any = {};
      
      if (userId) {
        whereClause.notification = { userId };
      }
      
      if (notificationId) {
        whereClause.notificationId = notificationId;
      }
      
      if (channel) {
        whereClause.channel = channel;
      }
      
      if (dateFrom || dateTo) {
        whereClause.createdAt = {};
        if (dateFrom) whereClause.createdAt.gte = dateFrom;
        if (dateTo) whereClause.createdAt.lte = dateTo;
      }

      const stats = await prisma.notificationDelivery.groupBy({
        by: ['status'],
        where: whereClause,
        _count: { _all: true },
      });

      const statusCounts = stats.reduce((acc, stat) => {
        acc[stat.status] = stat._count._all;
        return acc;
      }, {} as Record<string, number>);

      const totalSent = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
      const totalDelivered = (statusCounts.delivered || 0) + (statusCounts.opened || 0) + (statusCounts.clicked || 0);
      const totalOpened = (statusCounts.opened || 0) + (statusCounts.clicked || 0);
      const totalClicked = statusCounts.clicked || 0;
      const totalFailed = statusCounts.failed || 0;
      const totalBounced = statusCounts.bounced || 0;

      return {
        totalSent,
        totalDelivered,
        totalOpened,
        totalClicked,
        totalFailed,
        totalBounced,
        deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
        openRate: totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0,
        clickRate: totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0,
        bounceRate: totalSent > 0 ? (totalBounced / totalSent) * 100 : 0,
      };
    } catch (error) {
      logger.error('Failed to get delivery stats', { error, options });
      throw error;
    }
  }

  // Get delivery timeline for a notification
  public async getDeliveryTimeline(notificationId: string): Promise<Array<{
    timestamp: Date;
    event: string;
    channel: string;
    status: string;
    metadata?: any;
  }>> {
    try {
      const deliveries = await prisma.notificationDelivery.findMany({
        where: { notificationId },
        orderBy: { createdAt: 'asc' },
        select: {
          channel: true,
          status: true,
          createdAt: true,
          sentAt: true,
          deliveredAt: true,
          openedAt: true,
          clickedAt: true,
          failedAt: true,
          errorMessage: true,
        },
      });

      const timeline: Array<{
        timestamp: Date;
        event: string;
        channel: string;
        status: string;
        metadata?: any;
      }> = [];

      for (const delivery of deliveries) {
        // Add creation event
        timeline.push({
          timestamp: delivery.createdAt,
          event: 'created',
          channel: delivery.channel,
          status: 'pending',
        });

        // Add sent event
        if (delivery.sentAt) {
          timeline.push({
            timestamp: delivery.sentAt,
            event: 'sent',
            channel: delivery.channel,
            status: 'sent',
          });
        }

        // Add delivered event
        if (delivery.deliveredAt) {
          timeline.push({
            timestamp: delivery.deliveredAt,
            event: 'delivered',
            channel: delivery.channel,
            status: 'delivered',
          });
        }

        // Add opened event
        if (delivery.openedAt) {
          timeline.push({
            timestamp: delivery.openedAt,
            event: 'opened',
            channel: delivery.channel,
            status: 'opened',
          });
        }

        // Add clicked event
        if (delivery.clickedAt) {
          timeline.push({
            timestamp: delivery.clickedAt,
            event: 'clicked',
            channel: delivery.channel,
            status: 'clicked',
          });
        }

        // Add failed event
        if (delivery.failedAt) {
          timeline.push({
            timestamp: delivery.failedAt,
            event: 'failed',
            channel: delivery.channel,
            status: 'failed',
            metadata: { error: delivery.errorMessage },
          });
        }
      }

      return timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      logger.error('Failed to get delivery timeline', { error, notificationId });
      throw error;
    }
  }

  // Get user engagement metrics
  public async getUserEngagementMetrics(userId: string, days: number = 30): Promise<{
    totalNotifications: number;
    emailMetrics: DeliveryStats;
    pushMetrics: DeliveryStats;
    overallEngagement: number;
    recentActivity: Array<{
      date: string;
      sent: number;
      opened: number;
      clicked: number;
    }>;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get total notifications for user
      const totalNotifications = await prisma.notification.count({
        where: { userId },
      });

      // Get email metrics
      const emailMetrics = await this.getDeliveryStats({
        userId,
        channel: 'email',
        dateFrom: startDate,
      });

      // Get push metrics
      const pushMetrics = await this.getDeliveryStats({
        userId,
        channel: 'push',
        dateFrom: startDate,
      });

      // Calculate overall engagement
      const totalInteractions = emailMetrics.totalOpened + emailMetrics.totalClicked + 
                               pushMetrics.totalOpened + pushMetrics.totalClicked;
      const totalSent = emailMetrics.totalSent + pushMetrics.totalSent;
      const overallEngagement = totalSent > 0 ? (totalInteractions / totalSent) * 100 : 0;

      // Get recent activity (daily breakdown)
      const recentActivity = await this.getDailyActivity(userId, days);

      return {
        totalNotifications,
        emailMetrics,
        pushMetrics,
        overallEngagement,
        recentActivity,
      };
    } catch (error) {
      logger.error('Failed to get user engagement metrics', { error, userId, days });
      throw error;
    }
  }

  // Get aggregated metrics by date
  public async getMetricsByDate(
    dateFrom: Date,
    dateTo: Date,
    groupBy: 'day' | 'week' | 'month' = 'day'
  ): Promise<Array<{
    date: string;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    failed: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
  }>> {
    try {
      // This would typically use a dedicated metrics table for better performance
      // For now, we'll aggregate from the delivery table
      const metrics = await prisma.notificationMetrics.findMany({
        where: {
          date: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        orderBy: { date: 'asc' },
      });

      return metrics.map(metric => ({
        date: metric.date.toISOString().split('T')[0],
        sent: metric.sent,
        delivered: metric.delivered,
        opened: metric.opened,
        clicked: metric.clicked,
        failed: metric.failed,
        deliveryRate: metric.deliveryRate,
        openRate: metric.openRate,
        clickRate: metric.clickRate,
      }));
    } catch (error) {
      logger.error('Failed to get metrics by date', { error, dateFrom, dateTo, groupBy });
      throw error;
    }
  }

  // Private methods
  private addWorkerErrorHandlers(): void {
    this.analyticsWorker.on('error', (error) => {
      logger.error('Analytics worker error', { error });
    });

    this.analyticsWorker.on('failed', (job, error) => {
      logger.error('Analytics job failed', {
        jobId: job?.id,
        jobData: job?.data,
        error: error.message,
      });
    });

    this.analyticsWorker.on('completed', (job) => {
      logger.debug('Analytics job completed', {
        jobId: job.id,
        type: job.data.type,
      });
    });
  }

  private async processAnalyticsJob(jobData: AnalyticsJobData): Promise<void> {
    try {
      switch (jobData.type) {
        case 'delivery_event':
          await this.processDeliveryEvent(jobData.data);
          break;
        case 'user_engagement':
          await this.processEngagementEvent(jobData.data);
          break;
        case 'daily_aggregation':
          await this.processDailyAggregation(jobData.data);
          break;
        default:
          logger.warn('Unknown analytics job type', { type: jobData.type });
      }
    } catch (error) {
      logger.error('Failed to process analytics job', { error, jobData });
      throw error;
    }
  }

  private async processDeliveryEvent(data: any): Promise<void> {
    // Update real-time metrics in Redis
    const date = new Date().toISOString().split('T')[0];
    const key = `metrics:${date}`;
    
    await redis.hincrby(key, `${data.status}_count`, 1);
    await redis.expire(key, 86400 * 7); // Keep for 7 days
  }

  private async processEngagementEvent(data: any): Promise<void> {
    // Track user engagement patterns
    const userId = data.userId;
    const date = new Date().toISOString().split('T')[0];
    const key = `engagement:${userId}:${date}`;
    
    await redis.hincrby(key, `${data.event}_count`, 1);
    await redis.expire(key, 86400 * 30); // Keep for 30 days
  }

  private async processDailyAggregation(data: any): Promise<void> {
    const date = data.date || new Date();
    const dateStr = new Date(date).toISOString().split('T')[0];

    // Aggregate daily metrics for each channel
    const channels = ['email', 'push', 'webhook', 'in_app'];
    
    for (const channel of channels) {
      const stats = await this.getDeliveryStats({
        channel,
        dateFrom: new Date(dateStr),
        dateTo: new Date(dateStr + 'T23:59:59Z'),
      });

      await prisma.notificationMetrics.upsert({
        where: {
          date_type_channel: {
            date: new Date(dateStr),
            type: 'all',
            channel,
          },
        },
        update: {
          sent: stats.totalSent,
          delivered: stats.totalDelivered,
          opened: stats.totalOpened,
          clicked: stats.totalClicked,
          failed: stats.totalFailed,
          bounced: stats.totalBounced,
          deliveryRate: stats.deliveryRate,
          openRate: stats.openRate,
          clickRate: stats.clickRate,
          bounceRate: stats.bounceRate,
          updatedAt: new Date(),
        },
        create: {
          id: uuidv4(),
          date: new Date(dateStr),
          type: 'all',
          channel,
          sent: stats.totalSent,
          delivered: stats.totalDelivered,
          opened: stats.totalOpened,
          clicked: stats.totalClicked,
          failed: stats.totalFailed,
          bounced: stats.totalBounced,
          deliveryRate: stats.deliveryRate,
          openRate: stats.openRate,
          clickRate: stats.clickRate,
          bounceRate: stats.bounceRate,
        },
      });
    }

    logger.info('Daily aggregation completed', { date: dateStr });
  }

  private async handleUnsubscribeEvent(deliveryId: string, metadata: any): Promise<void> {
    try {
      // Get delivery record to find user
      const delivery = await prisma.notificationDelivery.findUnique({
        where: { id: deliveryId },
        include: { notification: true },
      });

      if (!delivery) return;

      // Create unsubscribe record
      await prisma.unsubscribeRecord.create({
        data: {
          id: uuidv4(),
          userId: delivery.notification.userId,
          email: metadata?.email || 'unknown',
          type: 'all',
          reason: 'webhook_unsubscribe',
          source: 'email_link',
        },
      });

      // Update user preferences to disable email
      await prisma.notificationPreference.upsert({
        where: { userId: delivery.notification.userId },
        update: {
          emailEnabled: false,
          optOutDate: new Date(),
        },
        create: {
          id: uuidv4(),
          userId: delivery.notification.userId,
          emailEnabled: false,
          consentGiven: false,
          optOutDate: new Date(),
        },
      });

      logger.info('Unsubscribe processed', {
        userId: delivery.notification.userId,
        deliveryId,
      });
    } catch (error) {
      logger.error('Failed to handle unsubscribe event', { error, deliveryId, metadata });
    }
  }

  private async scheduleDailyAggregation(): Promise<void> {
    try {
      // Schedule daily aggregation job at midnight
      await this.analyticsQueue.add(
        'daily-aggregation',
        {
          type: 'daily_aggregation',
          data: { date: new Date() },
          timestamp: new Date(),
        },
        {
          repeat: {
            pattern: '0 0 * * *', // Daily at midnight
          },
          removeOnComplete: 10,
          removeOnFail: 5,
        }
      );

      logger.info('Daily aggregation scheduled');
    } catch (error) {
      logger.error('Failed to schedule daily aggregation', { error });
    }
  }

  private async getDailyActivity(userId: string, days: number): Promise<Array<{
    date: string;
    sent: number;
    opened: number;
    clicked: number;
  }>> {
    try {
      const activity: Array<{
        date: string;
        sent: number;
        opened: number;
        clicked: number;
      }> = [];

      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const stats = await this.getDeliveryStats({
          userId,
          dateFrom: new Date(dateStr),
          dateTo: new Date(dateStr + 'T23:59:59Z'),
        });

        activity.push({
          date: dateStr,
          sent: stats.totalSent,
          opened: stats.totalOpened,
          clicked: stats.totalClicked,
        });
      }

      return activity.reverse();
    } catch (error) {
      logger.error('Failed to get daily activity', { error, userId, days });
      return [];
    }
  }

  // Real-time delivery status tracking
  public async getRealtimeDeliveryStatus(notificationId: string): Promise<{
    status: string;
    progress: {
      total: number;
      sent: number;
      delivered: number;
      failed: number;
    };
    channels: Array<{
      channel: string;
      status: string;
      attempts: number;
      lastAttempt?: Date;
      nextRetry?: Date;
    }>;
  }> {
    try {
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        include: { channels: true },
      });

      if (!notification) {
        throw new Error(`Notification ${notificationId} not found`);
      }

      const total = notification.channels.length;
      const sent = notification.channels.filter(c => 
        ['sent', 'delivered', 'opened', 'clicked'].includes(c.status)
      ).length;
      const delivered = notification.channels.filter(c => 
        ['delivered', 'opened', 'clicked'].includes(c.status)
      ).length;
      const failed = notification.channels.filter(c => 
        ['failed', 'bounced'].includes(c.status)
      ).length;

      return {
        status: notification.status,
        progress: {
          total,
          sent,
          delivered,
          failed,
        },
        channels: notification.channels.map(channel => ({
          channel: channel.channel,
          status: channel.status,
          attempts: channel.attempts,
          lastAttempt: channel.lastAttemptAt,
          nextRetry: channel.nextRetryAt,
        })),
      };
    } catch (error) {
      logger.error('Failed to get realtime delivery status', { error, notificationId });
      throw error;
    }
  }
}

export const deliveryTracker = new DeliveryTracker();