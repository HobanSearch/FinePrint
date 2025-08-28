/**
 * Unit tests for Notification Service
 * Tests all core functionality of the notification and communication service
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, jest } from '@jest/globals';
import { createMockUser, createMockNotification } from '../../mocks/factories';
import { resetAllMocks, setupMockDefaults } from '../../mocks/utils/mock-utils';

// Mock dependencies
const mockPrisma = {
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  notificationPreference: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockEmailService = {
  send: jest.fn(),
  sendTemplate: jest.fn(),
  validateEmail: jest.fn(),
};

const mockPushService = {
  send: jest.fn(),
  sendToDevice: jest.fn(),
  sendToTopic: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
};

const mockSmsService = {
  send: jest.fn(),
  validatePhoneNumber: jest.fn(),
};

const mockWebsocketService = {
  sendToUser: jest.fn(),
  sendToRoom: jest.fn(),
  broadcast: jest.fn(),
};

const mockTemplateEngine = {
  render: jest.fn(),
  registerTemplate: jest.fn(),
  getTemplate: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockMetrics = {
  increment: jest.fn(),
  timing: jest.fn(),
  gauge: jest.fn(),
};

const mockQueue = {
  add: jest.fn(),
  process: jest.fn(),
};

// Mock the Notification Service
class NotificationService {
  constructor(
    private prisma: any,
    private emailService: any,
    private pushService: any,
    private smsService: any,
    private websocketService: any,
    private templateEngine: any,
    private logger: any,
    private metrics: any,
    private queue: any
  ) {}

  async createNotification(
    userId: string,
    type: string,
    title: string,
    message: string,
    options: any = {}
  ): Promise<any> {
    this.logger.info('Creating notification', { userId, type, title });

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        priority: options.priority || 'medium',
        status: 'unread',
        metadata: options.metadata || {},
        expiresAt: options.expiresAt,
        actionUrl: options.actionUrl,
        actionText: options.actionText,
      },
    });

    // Send immediate notifications based on user preferences
    if (options.sendImmediately !== false) {
      await this.sendNotification(notification.id);
    }

    this.metrics.increment('notification.created', 1, { type });
    return notification;
  }

  async sendNotification(notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            deviceTokens: true,
          },
        },
      },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    if (notification.status === 'sent') {
      this.logger.warn('Notification already sent', { notificationId });
      return;
    }

    const user = notification.user;
    const preferences = await this.getUserPreferences(user.id);

    // Send via different channels based on preferences
    const sendPromises: Promise<any>[] = [];

    // Real-time notification (WebSocket)
    if (preferences.realtime && this.websocketService) {
      sendPromises.push(
        this.sendWebsocketNotification(user.id, notification)
          .catch(error => this.logger.warn('WebSocket notification failed', { error }))
      );
    }

    // Email notification
    if (preferences.email && user.email) {
      sendPromises.push(
        this.sendEmailNotification(user, notification)
          .catch(error => this.logger.warn('Email notification failed', { error }))
      );
    }

    // Push notification
    if (preferences.push && user.deviceTokens?.length > 0) {
      sendPromises.push(
        this.sendPushNotification(user, notification)
          .catch(error => this.logger.warn('Push notification failed', { error }))
      );
    }

    // SMS notification (for high priority)
    if (preferences.sms && user.phoneNumber && notification.priority === 'urgent') {
      sendPromises.push(
        this.sendSmsNotification(user, notification)
          .catch(error => this.logger.warn('SMS notification failed', { error }))
      );
    }

    // Wait for all notifications to be sent
    await Promise.allSettled(sendPromises);

    // Update notification status
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: 'sent',
        sentAt: new Date(),
      },
    });

    this.metrics.increment('notification.sent', 1, { type: notification.type });
    this.logger.info('Notification sent', { notificationId, userId: user.id });
  }

  private async sendWebsocketNotification(userId: string, notification: any): Promise<void> {
    await this.websocketService.sendToUser(userId, 'notification', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      createdAt: notification.createdAt,
      actionUrl: notification.actionUrl,
      actionText: notification.actionText,
    });

    this.metrics.increment('notification.websocket.sent');
  }

  private async sendEmailNotification(user: any, notification: any): Promise<void> {
    const templateName = this.getEmailTemplate(notification.type);
    const templateData = {
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
      notification: {
        title: notification.title,
        message: notification.message,
        actionUrl: notification.actionUrl,
        actionText: notification.actionText,
      },
      metadata: notification.metadata,
    };

    await this.emailService.sendTemplate(
      user.email,
      templateName,
      templateData,
      {
        priority: notification.priority,
        tags: [`notification-${notification.type}`],
      }
    );

    this.metrics.increment('notification.email.sent');
  }

  private async sendPushNotification(user: any, notification: any): Promise<void> {
    const pushPayload = {
      title: notification.title,
      body: notification.message,
      data: {
        notificationId: notification.id,
        type: notification.type,
        actionUrl: notification.actionUrl,
      },
      priority: notification.priority === 'urgent' ? 'high' : 'normal',
    };

    // Send to all user devices
    const sendPromises = user.deviceTokens.map((token: string) =>
      this.pushService.sendToDevice(token, pushPayload)
        .catch((error: Error) => {
          this.logger.warn('Push notification failed for device', { token, error });
        })
    );

    await Promise.allSettled(sendPromises);
    this.metrics.increment('notification.push.sent');
  }

  private async sendSmsNotification(user: any, notification: any): Promise<void> {
    const message = `${notification.title}: ${notification.message}`;
    
    await this.smsService.send(user.phoneNumber, message, {
      priority: notification.priority,
    });

    this.metrics.increment('notification.sms.sent');
  }

  private getEmailTemplate(notificationType: string): string {
    const templateMap: Record<string, string> = {
      'analysis_complete': 'analysis-completed',
      'subscription_updated': 'subscription-updated',
      'security_alert': 'security-alert',
      'system_update': 'system-update',
      'payment_failed': 'payment-failed',
      'trial_ending': 'trial-ending',
    };

    return templateMap[notificationType] || 'generic-notification';
  }

  async getNotifications(
    userId: string,
    options: {
      status?: string;
      type?: string;
      priority?: string;
      limit?: number;
      offset?: number;
      includeRead?: boolean;
    } = {}
  ): Promise<any> {
    const where: any = { userId };

    if (options.status) {
      where.status = options.status;
    } else if (!options.includeRead) {
      where.status = { not: 'read' };
    }

    if (options.type) {
      where.type = options.type;
    }

    if (options.priority) {
      where.priority = options.priority;
    }

    // Only show non-expired notifications
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ];

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: options.offset || 0,
        take: options.limit || 20,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      notifications,
      total,
      unreadCount: await this.getUnreadCount(userId),
      hasMore: total > (options.offset || 0) + notifications.length,
    };
  }

  async markAsRead(notificationId: string, userId: string): Promise<any> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new Error('Unauthorized');
    }

    if (notification.status === 'read') {
      return notification;
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: 'read',
        readAt: new Date(),
      },
    });

    this.metrics.increment('notification.read');
    
    // Send real-time update to user
    if (this.websocketService) {
      this.websocketService.sendToUser(userId, 'notification_read', {
        notificationId,
        unreadCount: await this.getUnreadCount(userId),
      }).catch(error => this.logger.debug('WebSocket update failed', { error }));
    }

    return updated;
  }

  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        status: 'unread',
      },
      data: {
        status: 'read',
        readAt: new Date(),
      },
    });

    this.metrics.increment('notification.marked_all_read');
    
    // Send real-time update
    if (this.websocketService) {
      this.websocketService.sendToUser(userId, 'all_notifications_read', {
        count: result.count,
        unreadCount: 0,
      }).catch(error => this.logger.debug('WebSocket update failed', { error }));
    }

    return { count: result.count };
  }

  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new Error('Unauthorized');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    this.metrics.increment('notification.deleted');
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        status: 'unread',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });
  }

  async getUserPreferences(userId: string): Promise<any> {
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    // Return defaults if no preferences found
    return preferences || {
      email: true,
      push: true,
      sms: false,
      realtime: true,
      frequency: 'immediate',
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00',
      },
      categories: {
        analysis_complete: true,
        subscription_updated: true,
        security_alert: true,
        system_update: false,
        marketing: false,
      },
    };
  }

  async updateUserPreferences(userId: string, preferences: any): Promise<any> {
    const updated = await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {
        ...preferences,
        updatedAt: new Date(),
      },
      create: {
        userId,
        ...preferences,
      },
    });

    this.logger.info('Notification preferences updated', { userId });
    return updated;
  }

  async sendBulkNotification(
    userIds: string[],
    type: string,
    title: string,
    message: string,
    options: any = {}
  ): Promise<{ sent: number; failed: number; results: any[] }> {
    this.logger.info('Sending bulk notification', { 
      userCount: userIds.length,
      type,
      title 
    });

    const results = [];
    let sent = 0;
    let failed = 0;

    // Process in batches to avoid overwhelming the system
    const batchSize = options.batchSize || 100;
    const batches = [];
    
    for (let i = 0; i < userIds.length; i += batchSize) {
      batches.push(userIds.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(async (userId) => {
        try {
          const notification = await this.createNotification(
            userId,
            type,
            title,
            message,
            { ...options, sendImmediately: false }
          );
          
          await this.sendNotification(notification.id);
          sent++;
          return { userId, success: true, notificationId: notification.id };
        } catch (error) {
          failed++;
          this.logger.warn('Bulk notification failed for user', { userId, error });
          return { userId, success: false, error: (error as Error).message };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(result => 
        result.status === 'fulfilled' ? result.value : { success: false, error: 'Promise rejected' }
      ));

      // Small delay between batches
      if (options.delayBetweenBatches) {
        await new Promise(resolve => setTimeout(resolve, options.delayBetweenBatches));
      }
    }

    this.metrics.increment('notification.bulk.sent', sent);
    this.metrics.increment('notification.bulk.failed', failed);

    return { sent, failed, results };
  }

  async cleanupExpiredNotifications(): Promise<{ deleted: number }> {
    const result = await this.prisma.notification.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    this.logger.info('Expired notifications cleaned up', { count: result.count });
    this.metrics.gauge('notification.expired.cleaned', result.count);

    return { deleted: result.count };
  }

  async getNotificationStats(userId?: string): Promise<any> {
    const where = userId ? { userId } : {};

    const [total, unread, sent, byType, byPriority] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, status: 'unread' } }),
      this.prisma.notification.count({ where: { ...where, status: 'sent' } }),
      this.prisma.notification.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
      }),
      this.prisma.notification.groupBy({
        by: ['priority'],
        where,
        _count: { id: true },
      }),
    ]);

    const typeStats = byType.reduce((acc, item) => {
      acc[item.type] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    const priorityStats = byPriority.reduce((acc, item) => {
      acc[item.priority] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      unread,
      sent,
      read: total - unread,
      byType: typeStats,
      byPriority: priorityStats,
    };
  }
}

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockUser: any;
  let mockNotificationData: any;

  beforeAll(() => {
    setupMockDefaults();
  });

  beforeEach(() => {
    resetAllMocks();
    
    notificationService = new NotificationService(
      mockPrisma,
      mockEmailService,
      mockPushService,
      mockSmsService,
      mockWebsocketService,
      mockTemplateEngine,
      mockLogger,
      mockMetrics,
      mockQueue
    );

    mockUser = createMockUser();
    mockNotificationData = createMockNotification({ userId: mockUser.id });

    // Setup default mock responses
    mockPrisma.notification.create.mockResolvedValue(mockNotificationData);
    mockPrisma.notification.findUnique.mockResolvedValue({
      ...mockNotificationData,
      user: mockUser,
    });
    mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    resetAllMocks();
  });

  describe('createNotification', () => {
    test('should create notification with default options', async () => {
      const result = await notificationService.createNotification(
        mockUser.id,
        'analysis_complete',
        'Analysis Complete',
        'Your document analysis is ready'
      );

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          type: 'analysis_complete',
          title: 'Analysis Complete',
          message: 'Your document analysis is ready',
          priority: 'medium',
          status: 'unread',
          metadata: {},
          expiresAt: undefined,
          actionUrl: undefined,
          actionText: undefined,
        },
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'notification.created',
        1,
        { type: 'analysis_complete' }
      );

      expect(result).toEqual(mockNotificationData);
    });

    test('should create notification with custom options', async () => {
      const options = {
        priority: 'high',
        metadata: { documentId: 'doc_123' },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        actionUrl: '/documents/doc_123',
        actionText: 'View Document',
        sendImmediately: false,
      };

      await notificationService.createNotification(
        mockUser.id,
        'security_alert',
        'Security Alert',
        'Suspicious activity detected',
        options
      );

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          type: 'security_alert',
          title: 'Security Alert',
          message: 'Suspicious activity detected',
          priority: 'high',
          status: 'unread',
          metadata: { documentId: 'doc_123' },
          expiresAt: options.expiresAt,
          actionUrl: '/documents/doc_123',
          actionText: 'View Document',
        },
      });
    });
  });

  describe('sendNotification', () => {
    beforeEach(() => {
      mockUser.deviceTokens = ['token1', 'token2'];
      mockUser.phoneNumber = '+1234567890';
      
      mockPrisma.notification.findUnique.mockResolvedValue({
        ...mockNotificationData,
        user: mockUser,
      });
      
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        email: true,
        push: true,
        sms: true,
        realtime: true,
      });

      mockEmailService.sendTemplate.mockResolvedValue({});
      mockPushService.sendToDevice.mockResolvedValue({});
      mockSmsService.send.mockResolvedValue({});
      mockWebsocketService.sendToUser.mockResolvedValue({});
      mockPrisma.notification.update.mockResolvedValue({});
    });

    test('should send notification via all enabled channels', async () => {
      await notificationService.sendNotification(mockNotificationData.id);

      expect(mockWebsocketService.sendToUser).toHaveBeenCalledWith(
        mockUser.id,
        'notification',
        expect.objectContaining({
          id: mockNotificationData.id,
          type: mockNotificationData.type,
          title: mockNotificationData.title,
        })
      );

      expect(mockEmailService.sendTemplate).toHaveBeenCalled();
      expect(mockPushService.sendToDevice).toHaveBeenCalledTimes(2); // Two device tokens
      expect(mockSmsService.send).not.toHaveBeenCalled(); // Only for urgent notifications

      expect(mockPrisma.notification.update).toHaveBeenCalledWith({
        where: { id: mockNotificationData.id },
        data: {
          status: 'sent',
          sentAt: expect.any(Date),
        },
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'notification.sent',
        1,
        { type: mockNotificationData.type }
      );
    });

    test('should send SMS for urgent notifications', async () => {
      const urgentNotification = {
        ...mockNotificationData,
        priority: 'urgent',
        user: mockUser,
      };
      
      mockPrisma.notification.findUnique.mockResolvedValue(urgentNotification);

      await notificationService.sendNotification(mockNotificationData.id);

      expect(mockSmsService.send).toHaveBeenCalledWith(
        mockUser.phoneNumber,
        `${mockNotificationData.title}: ${mockNotificationData.message}`,
        { priority: 'urgent' }
      );
    });

    test('should handle individual channel failures gracefully', async () => {
      mockEmailService.sendTemplate.mockRejectedValue(new Error('Email failed'));
      mockPushService.sendToDevice.mockRejectedValue(new Error('Push failed'));

      await notificationService.sendNotification(mockNotificationData.id);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Email notification failed',
        { error: expect.any(Error) }
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Push notification failed',
        { error: expect.any(Error) }
      );

      // Should still mark as sent
      expect(mockPrisma.notification.update).toHaveBeenCalledWith({
        where: { id: mockNotificationData.id },
        data: {
          status: 'sent',
          sentAt: expect.any(Date),
        },
      });
    });

    test('should not send already sent notification', async () => {
      const sentNotification = {
        ...mockNotificationData,
        status: 'sent',
        user: mockUser,
      };
      
      mockPrisma.notification.findUnique.mockResolvedValue(sentNotification);

      await notificationService.sendNotification(mockNotificationData.id);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Notification already sent',
        { notificationId: mockNotificationData.id }
      );

      expect(mockWebsocketService.sendToUser).not.toHaveBeenCalled();
      expect(mockEmailService.sendTemplate).not.toHaveBeenCalled();
    });

    test('should throw error for non-existent notification', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue(null);

      await expect(
        notificationService.sendNotification('non-existent-id')
      ).rejects.toThrow('Notification not found');
    });
  });

  describe('getNotifications', () => {
    test('should return paginated notifications', async () => {
      const notifications = [mockNotificationData];
      mockPrisma.notification.findMany.mockResolvedValue(notifications);
      mockPrisma.notification.count
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1); // unread count

      const result = await notificationService.getNotifications(mockUser.id);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          status: { not: 'read' },
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: expect.any(Date) } },
          ],
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: 0,
        take: 20,
      });

      expect(result).toEqual({
        notifications,
        total: 1,
        unreadCount: 1,
        hasMore: false,
      });
    });

    test('should apply filters correctly', async () => {
      const options = {
        status: 'unread',
        type: 'analysis_complete',
        priority: 'high',
        limit: 10,
        offset: 5,
      };

      await notificationService.getNotifications(mockUser.id, options);

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          status: 'unread',
          type: 'analysis_complete',
          priority: 'high',
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: expect.any(Date) } },
          ],
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: 5,
        take: 10,
      });
    });
  });

  describe('markAsRead', () => {
    test('should mark notification as read', async () => {
      const updatedNotification = { ...mockNotificationData, status: 'read' };
      mockPrisma.notification.findUnique.mockResolvedValue(mockNotificationData);
      mockPrisma.notification.update.mockResolvedValue(updatedNotification);
      mockPrisma.notification.count.mockResolvedValue(5); // unread count

      const result = await notificationService.markAsRead(
        mockNotificationData.id,
        mockUser.id
      );

      expect(mockPrisma.notification.update).toHaveBeenCalledWith({
        where: { id: mockNotificationData.id },
        data: {
          status: 'read',
          readAt: expect.any(Date),
        },
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('notification.read');

      expect(mockWebsocketService.sendToUser).toHaveBeenCalledWith(
        mockUser.id,
        'notification_read',
        {
          notificationId: mockNotificationData.id,
          unreadCount: 5,
        }
      );

      expect(result).toEqual(updatedNotification);
    });

    test('should throw error for unauthorized access', async () => {
      const otherUserNotification = {
        ...mockNotificationData,
        userId: 'other-user-id',
      };
      
      mockPrisma.notification.findUnique.mockResolvedValue(otherUserNotification);

      await expect(
        notificationService.markAsRead(mockNotificationData.id, mockUser.id)
      ).rejects.toThrow('Unauthorized');
    });

    test('should return notification if already read', async () => {
      const readNotification = { ...mockNotificationData, status: 'read' };
      mockPrisma.notification.findUnique.mockResolvedValue(readNotification);

      const result = await notificationService.markAsRead(
        mockNotificationData.id,
        mockUser.id
      );

      expect(mockPrisma.notification.update).not.toHaveBeenCalled();
      expect(result).toEqual(readNotification);
    });
  });

  describe('markAllAsRead', () => {
    test('should mark all notifications as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await notificationService.markAllAsRead(mockUser.id);

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          status: 'unread',
        },
        data: {
          status: 'read',
          readAt: expect.any(Date),
        },
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('notification.marked_all_read');

      expect(mockWebsocketService.sendToUser).toHaveBeenCalledWith(
        mockUser.id,
        'all_notifications_read',
        {
          count: 5,
          unreadCount: 0,
        }
      );

      expect(result).toEqual({ count: 5 });
    });
  });

  describe('sendBulkNotification', () => {
    test('should send notifications to multiple users', async () => {
      const userIds = ['user1', 'user2', 'user3'];
      
      mockPrisma.notification.create
        .mockResolvedValueOnce({ id: 'notif1' })
        .mockResolvedValueOnce({ id: 'notif2' })
        .mockResolvedValueOnce({ id: 'notif3' });

      // Mock the private sendNotification method calls
      const sendNotificationSpy = jest.spyOn(notificationService as any, 'sendNotification')
        .mockResolvedValue(undefined);

      const result = await notificationService.sendBulkNotification(
        userIds,
        'system_update',
        'System Update',
        'The system has been updated'
      );

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(3);
      expect(sendNotificationSpy).toHaveBeenCalledTimes(3);

      expect(result).toEqual({
        sent: 3,
        failed: 0,
        results: expect.arrayContaining([
          expect.objectContaining({ success: true }),
          expect.objectContaining({ success: true }),
          expect.objectContaining({ success: true }),
        ]),
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('notification.bulk.sent', 3);

      sendNotificationSpy.mockRestore();
    });

    test('should handle failures gracefully in bulk send', async () => {
      const userIds = ['user1', 'user2'];
      
      mockPrisma.notification.create
        .mockResolvedValueOnce({ id: 'notif1' })
        .mockRejectedValueOnce(new Error('Database error'));

      const sendNotificationSpy = jest.spyOn(notificationService as any, 'sendNotification')
        .mockResolvedValue(undefined);

      const result = await notificationService.sendBulkNotification(
        userIds,
        'system_update',
        'System Update',
        'The system has been updated'
      );

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results).toHaveLength(2);

      expect(mockMetrics.increment).toHaveBeenCalledWith('notification.bulk.sent', 1);
      expect(mockMetrics.increment).toHaveBeenCalledWith('notification.bulk.failed', 1);

      sendNotificationSpy.mockRestore();
    });
  });

  describe('getUserPreferences', () => {
    test('should return user preferences', async () => {
      const preferences = {
        email: true,
        push: false,
        sms: true,
        realtime: true,
      };
      
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(preferences);

      const result = await notificationService.getUserPreferences(mockUser.id);

      expect(result).toEqual(preferences);
    });

    test('should return default preferences if none found', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);

      const result = await notificationService.getUserPreferences(mockUser.id);

      expect(result).toMatchObject({
        email: true,
        push: true,
        sms: false,
        realtime: true,
        frequency: 'immediate',
      });
    });
  });

  describe('updateUserPreferences', () => {
    test('should update user preferences', async () => {
      const newPreferences = {
        email: false,
        push: true,
        sms: false,
        realtime: true,
      };

      const updatedPreferences = { ...newPreferences, userId: mockUser.id };
      mockPrisma.notificationPreference.upsert.mockResolvedValue(updatedPreferences);

      const result = await notificationService.updateUserPreferences(
        mockUser.id,
        newPreferences
      );

      expect(mockPrisma.notificationPreference.upsert).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        update: {
          ...newPreferences,
          updatedAt: expect.any(Date),
        },
        create: {
          userId: mockUser.id,
          ...newPreferences,
        },
      });

      expect(result).toEqual(updatedPreferences);
    });
  });

  describe('Performance Tests', () => {
    test('should create notification within performance threshold', async () => {
      const { result, duration } = await measurePerformance(async () => {
        return notificationService.createNotification(
          mockUser.id,
          'test_notification',
          'Test',
          'Test message'
        );
      });

      expect(duration).toBeWithinPerformanceThreshold(TEST_CONFIG.API_RESPONSE_THRESHOLD);
      expect(result).toBeDefined();
    });

    test('should handle bulk notifications efficiently', async () => {
      const userIds = Array.from({ length: 50 }, (_, i) => `user${i}`);
      
      mockPrisma.notification.create.mockResolvedValue({ id: 'test-notif' });
      const sendNotificationSpy = jest.spyOn(notificationService as any, 'sendNotification')
        .mockResolvedValue(undefined);

      const { result, duration } = await measurePerformance(async () => {
        return notificationService.sendBulkNotification(
          userIds,
          'bulk_test',
          'Bulk Test',
          'Bulk test message',
          { batchSize: 10 }
        );
      });

      expect(duration).toBeWithinPerformanceThreshold(5000); // 5 seconds for bulk
      expect(result.sent).toBe(50);

      sendNotificationSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.notification.create.mockRejectedValue(dbError);

      await expect(
        notificationService.createNotification(
          mockUser.id,
          'test',
          'Test',
          'Test message'
        )
      ).rejects.toThrow('Database connection failed');
    });

    test('should handle external service failures', async () => {
      mockPrisma.notification.findUnique.mockResolvedValue({
        ...mockNotificationData,
        user: mockUser,
      });
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        email: true,
        push: false,
        sms: false,
        realtime: false,
      });

      mockEmailService.sendTemplate.mockRejectedValue(new Error('Email service down'));

      // Should not throw, just log warning
      await expect(
        notificationService.sendNotification(mockNotificationData.id)
      ).resolves.not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Email notification failed',
        { error: expect.any(Error) }
      );
    });
  });
});