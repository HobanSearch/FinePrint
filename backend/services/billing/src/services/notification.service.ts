import sgMail from '@sendgrid/mail';
import { PrismaClient } from '@prisma/client';
import config from '../config';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
sgMail.setApiKey(config.SENDGRID_API_KEY);

export interface EmailTemplateData {
  [key: string]: any;
}

export class NotificationService {
  /**
   * Send subscription welcome email
   */
  static async sendSubscriptionWelcome(userId: string, tier: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });

      if (!user) throw new Error('User not found');

      const emailData = {
        to: user.email,
        from: {
          email: 'billing@fineprintai.com',
          name: 'Fine Print AI Billing',
        },
        templateId: 'd-subscription-welcome',
        dynamicTemplateData: {
          displayName: user.displayName || 'User',
          tier: tier.charAt(0).toUpperCase() + tier.slice(1),
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
          billingUrl: `${process.env.FRONTEND_URL}/billing`,
        },
      };

      await sgMail.send(emailData);

      // Create notification record
      await prisma.notification.create({
        data: {
          userId,
          type: 'subscription_update',
          title: `Welcome to Fine Print AI ${tier.charAt(0).toUpperCase() + tier.slice(1)}!`,
          message: `Your subscription has been activated. You now have access to all ${tier} features.`,
          data: JSON.stringify({ tier }),
        },
      });

      logger.info('Subscription welcome email sent', { userId, tier });

    } catch (error) {
      logger.error('Failed to send subscription welcome email', { error, userId, tier });
    }
  }

  /**
   * Send payment success notification
   */
  static async sendPaymentSuccess(
    userId: string,
    paymentDetails: { amount: number; currency: string }
  ): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });

      if (!user) throw new Error('User not found');

      const emailData = {
        to: user.email,
        from: {
          email: 'billing@fineprintai.com',
          name: 'Fine Print AI Billing',
        },
        templateId: 'd-payment-success',
        dynamicTemplateData: {
          displayName: user.displayName || 'User',
          amount: paymentDetails.amount.toFixed(2),
          currency: paymentDetails.currency.toUpperCase(),
          invoicesUrl: `${process.env.FRONTEND_URL}/billing/invoices`,
        },
      };

      await sgMail.send(emailData);

      // Create notification record
      await prisma.notification.create({
        data: {
          userId,
          type: 'subscription_update',
          title: 'Payment Successful',
          message: `Your payment of ${paymentDetails.currency.toUpperCase()} ${paymentDetails.amount.toFixed(2)} has been processed successfully.`,
          data: JSON.stringify(paymentDetails),
        },
      });

      logger.info('Payment success email sent', { userId, amount: paymentDetails.amount });

    } catch (error) {
      logger.error('Failed to send payment success email', { error, userId });
    }
  }

  /**
   * Send payment failed notification
   */
  static async sendPaymentFailed(userId: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });

      if (!user) throw new Error('User not found');

      const emailData = {
        to: user.email,
        from: {
          email: 'billing@fineprintai.com',
          name: 'Fine Print AI Billing',
        },
        templateId: 'd-payment-failed',
        dynamicTemplateData: {
          displayName: user.displayName || 'User',
          billingUrl: `${process.env.FRONTEND_URL}/billing`,
          supportUrl: `${process.env.FRONTEND_URL}/support`,
        },
      };

      await sgMail.send(emailData);

      // Create notification record
      await prisma.notification.create({
        data: {
          userId,
          type: 'action_required',
          title: 'Payment Failed',
          message: 'Your recent payment could not be processed. Please update your payment method.',
          actionUrl: `${process.env.FRONTEND_URL}/billing`,
        },
      });

      logger.info('Payment failed email sent', { userId });

    } catch (error) {
      logger.error('Failed to send payment failed email', { error, userId });
    }
  }

  /**
   * Send upcoming invoice notification
   */
  static async sendUpcomingInvoice(
    userId: string,
    invoiceDetails: { amount: number; currency: string; dueDate: Date }
  ): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });

      if (!user) throw new Error('User not found');

      const emailData = {
        to: user.email,
        from: {
          email: 'billing@fineprintai.com',
          name: 'Fine Print AI Billing',
        },
        templateId: 'd-upcoming-invoice',
        dynamicTemplateData: {
          displayName: user.displayName || 'User',
          amount: invoiceDetails.amount.toFixed(2),
          currency: invoiceDetails.currency.toUpperCase(),
          dueDate: invoiceDetails.dueDate.toLocaleDateString(),
          billingUrl: `${process.env.FRONTEND_URL}/billing`,
        },
      };

      await sgMail.send(emailData);

      // Create notification record
      await prisma.notification.create({
        data: {
          userId,
          type: 'subscription_update',
          title: 'Upcoming Invoice',
          message: `Your next invoice for ${invoiceDetails.currency.toUpperCase()} ${invoiceDetails.amount.toFixed(2)} is due on ${invoiceDetails.dueDate.toLocaleDateString()}.`,
          data: JSON.stringify(invoiceDetails),
        },
      });

      logger.info('Upcoming invoice email sent', { userId, amount: invoiceDetails.amount });

    } catch (error) {
      logger.error('Failed to send upcoming invoice email', { error, userId });
    }
  }

  /**
   * Send trial ending notification
   */
  static async sendTrialEnding(userId: string, trialEndDate: Date): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });

      if (!user) throw new Error('User not found');

      const daysLeft = Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      const emailData = {
        to: user.email,
        from: {
          email: 'billing@fineprintai.com',
          name: 'Fine Print AI Billing',
        },
        templateId: 'd-trial-ending',
        dynamicTemplateData: {
          displayName: user.displayName || 'User',
          daysLeft,
          trialEndDate: trialEndDate.toLocaleDateString(),
          subscribeUrl: `${process.env.FRONTEND_URL}/billing/subscribe`,
        },
      };

      await sgMail.send(emailData);

      // Create notification record
      await prisma.notification.create({
        data: {
          userId,
          type: 'action_required',
          title: 'Trial Ending Soon',
          message: `Your free trial ends in ${daysLeft} days. Subscribe now to continue using Fine Print AI.`,
          actionUrl: `${process.env.FRONTEND_URL}/billing/subscribe`,
        },
      });

      logger.info('Trial ending email sent', { userId, daysLeft });

    } catch (error) {
      logger.error('Failed to send trial ending email', { error, userId });
    }
  }

  /**
   * Send subscription canceled notification
   */
  static async sendSubscriptionCanceled(userId: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true, subscriptionExpiresAt: true },
      });

      if (!user) throw new Error('User not found');

      const emailData = {
        to: user.email,
        from: {
          email: 'billing@fineprintai.com',
          name: 'Fine Print AI Billing',
        },
        templateId: 'd-subscription-canceled',
        dynamicTemplateData: {
          displayName: user.displayName || 'User',
          accessUntil: user.subscriptionExpiresAt?.toLocaleDateString(),
          reactivateUrl: `${process.env.FRONTEND_URL}/billing/reactivate`,
        },
      };

      await sgMail.send(emailData);

      // Create notification record
      await prisma.notification.create({
        data: {
          userId,
          type: 'subscription_update',
          title: 'Subscription Canceled',
          message: 'Your subscription has been canceled. You can reactivate it anytime before it expires.',
          actionUrl: `${process.env.FRONTEND_URL}/billing/reactivate`,
        },
      });

      logger.info('Subscription canceled email sent', { userId });

    } catch (error) {
      logger.error('Failed to send subscription canceled email', { error, userId });
    }
  }

  /**
   * Send subscription ended notification
   */
  static async sendSubscriptionEnded(userId: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });

      if (!user) throw new Error('User not found');

      const emailData = {
        to: user.email,
        from: {
          email: 'billing@fineprintai.com',
          name: 'Fine Print AI Billing',
        },
        templateId: 'd-subscription-ended',
        dynamicTemplateData: {
          displayName: user.displayName || 'User',
          subscribeUrl: `${process.env.FRONTEND_URL}/billing/subscribe`,
          exportUrl: `${process.env.FRONTEND_URL}/account/export`,
        },
      };

      await sgMail.send(emailData);

      // Create notification record
      await prisma.notification.create({
        data: {
          userId,
          type: 'subscription_update',
          title: 'Subscription Ended',
          message: 'Your subscription has ended. You now have access to the free tier features.',
          actionUrl: `${process.env.FRONTEND_URL}/billing/subscribe`,
        },
      });

      logger.info('Subscription ended email sent', { userId });

    } catch (error) {
      logger.error('Failed to send subscription ended email', { error, userId });
    }
  }

  /**
   * Send payment method added notification
   */
  static async sendPaymentMethodAdded(userId: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });

      if (!user) throw new Error('User not found');

      // Create notification record (no email for this event)
      await prisma.notification.create({
        data: {
          userId,
          type: 'subscription_update',
          title: 'Payment Method Added',
          message: 'A new payment method has been added to your account.',
        },
      });

      logger.info('Payment method added notification created', { userId });

    } catch (error) {
      logger.error('Failed to create payment method added notification', { error, userId });
    }
  }

  /**
   * Send dunning reminder email
   */
  static async sendDunningReminder(
    userId: string,
    reminderData: {
      attemptNumber: number;
      amount: number;
      currency: string;
      dueDate: Date;
      invoiceUrl: string;
    }
  ): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });

      if (!user) throw new Error('User not found');

      const emailData = {
        to: user.email,
        from: {
          email: 'billing@fineprintai.com',
          name: 'Fine Print AI Billing',
        },
        templateId: 'd-dunning-reminder',
        dynamicTemplateData: {
          displayName: user.displayName || 'User',
          attemptNumber: reminderData.attemptNumber,
          amount: reminderData.amount.toFixed(2),
          currency: reminderData.currency.toUpperCase(),
          dueDate: reminderData.dueDate.toLocaleDateString(),
          invoiceUrl: reminderData.invoiceUrl,
          supportUrl: `${process.env.FRONTEND_URL}/support`,
        },
      };

      await sgMail.send(emailData);

      logger.info('Dunning reminder email sent', { 
        userId, 
        attemptNumber: reminderData.attemptNumber 
      });

    } catch (error) {
      logger.error('Failed to send dunning reminder email', { error, userId });
    }
  }

  /**
   * Send final notice before account suspension
   */
  static async sendFinalNotice(
    userId: string,
    noticeData: {
      amount: number;
      currency: string;
      suspensionDate: Date;
      paymentUrl: string;
    }
  ): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });

      if (!user) throw new Error('User not found');

      const emailData = {
        to: user.email,
        from: {
          email: 'billing@fineprintai.com',
          name: 'Fine Print AI Billing',
        },
        templateId: 'd-final-notice',
        dynamicTemplateData: {
          displayName: user.displayName || 'User',
          amount: noticeData.amount.toFixed(2),
          currency: noticeData.currency.toUpperCase(),
          suspensionDate: noticeData.suspensionDate.toLocaleDateString(),
          paymentUrl: noticeData.paymentUrl,
          supportUrl: `${process.env.FRONTEND_URL}/support`,
        },
      };

      await sgMail.send(emailData);

      // Create urgent notification
      await prisma.notification.create({
        data: {
          userId,
          type: 'action_required',
          title: 'URGENT: Account Suspension Notice',
          message: `Your account will be suspended on ${noticeData.suspensionDate.toLocaleDateString()} due to unpaid invoices. Please update your payment immediately.`,
          actionUrl: noticeData.paymentUrl,
        },
      });

      logger.info('Final notice email sent', { userId });

    } catch (error) {
      logger.error('Failed to send final notice email', { error, userId });
    }
  }

  /**
   * Send account suspended notification
   */
  static async sendAccountSuspended(userId: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });

      if (!user) throw new Error('User not found');

      const emailData = {
        to: user.email,
        from: {
          email: 'billing@fineprintai.com',
          name: 'Fine Print AI Billing',
        },
        templateId: 'd-account-suspended',
        dynamicTemplateData: {
          displayName: user.displayName || 'User',
          reactivateUrl: `${process.env.FRONTEND_URL}/billing/reactivate`,
          supportUrl: `${process.env.FRONTEND_URL}/support`,
        },
      };

      await sgMail.send(emailData);

      // Create urgent notification
      await prisma.notification.create({
        data: {
          userId,
          type: 'system_alert',
          title: 'Account Suspended',
          message: 'Your account has been suspended due to unpaid invoices. Contact support to reactivate.',
          actionUrl: `${process.env.FRONTEND_URL}/support`,
        },
      });

      logger.info('Account suspended email sent', { userId });

    } catch (error) {
      logger.error('Failed to send account suspended email', { error, userId });
    }
  }

  /**
   * Send chargeback alert
   */
  static async sendChargebackAlert(userId: string, dispute: any): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });

      if (!user) throw new Error('User not found');

      // Create urgent notification (no email sent to customer for chargebacks)
      await prisma.notification.create({
        data: {
          userId,
          type: 'system_alert',
          title: 'Payment Dispute',
          message: 'A payment dispute has been filed. Our team will handle this matter.',
        },
      });

      // Send internal alert to billing team
      const internalEmailData = {
        to: 'billing-alerts@fineprintai.com',
        from: {
          email: 'noreply@fineprintai.com',
          name: 'Fine Print AI System',
        },
        subject: `Chargeback Alert: ${dispute.id}`,
        text: `
          Chargeback Created:
          - Dispute ID: ${dispute.id}
          - User ID: ${userId}
          - Amount: ${dispute.currency.toUpperCase()} ${(dispute.amount / 100).toFixed(2)}
          - Reason: ${dispute.reason}
          - Status: ${dispute.status}
        `,
      };

      await sgMail.send(internalEmailData);

      logger.info('Chargeback alert sent', { userId, disputeId: dispute.id });

    } catch (error) {
      logger.error('Failed to send chargeback alert', { error, userId });
    }
  }

  /**
   * Send usage limit warning
   */
  static async sendUsageLimitWarning(
    userId: string,
    usageData: {
      metricType: string;
      usage: number;
      limit: number;
      warningThreshold: number;
    }
  ): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });

      if (!user) throw new Error('User not found');

      const percentageUsed = (usageData.usage / usageData.limit) * 100;

      const emailData = {
        to: user.email,
        from: {
          email: 'billing@fineprintai.com',
          name: 'Fine Print AI Billing',
        },
        templateId: 'd-usage-warning',
        dynamicTemplateData: {
          displayName: user.displayName || 'User',
          metricType: usageData.metricType,
          usage: usageData.usage,
          limit: usageData.limit,
          percentageUsed: Math.round(percentageUsed),
          upgradeUrl: `${process.env.FRONTEND_URL}/billing/upgrade`,
        },
      };

      await sgMail.send(emailData);

      // Create notification record
      await prisma.notification.create({
        data: {
          userId,
          type: 'action_required',
          title: 'Usage Limit Warning',
          message: `You've used ${Math.round(percentageUsed)}% of your ${usageData.metricType} limit. Consider upgrading your plan.`,
          actionUrl: `${process.env.FRONTEND_URL}/billing/upgrade`,
        },
      });

      logger.info('Usage limit warning email sent', { userId, metricType: usageData.metricType });

    } catch (error) {
      logger.error('Failed to send usage limit warning email', { error, userId });
    }
  }

  /**
   * Get user's notification preferences
   */
  static async getNotificationPreferences(userId: string) {
    return prisma.notificationPreference.findUnique({
      where: { userId },
    });
  }

  /**
   * Update user's notification preferences
   */
  static async updateNotificationPreferences(
    userId: string,
    preferences: Partial<{
      emailEnabled: boolean;
      browserEnabled: boolean;
      webhookEnabled: boolean;
      webhookUrl: string;
      analysisComplete: boolean;
      documentChanges: boolean;
      highRiskFindings: boolean;
      weeklySummary: boolean;
      marketingEmails: boolean;
    }>
  ) {
    return prisma.notificationPreference.upsert({
      where: { userId },
      update: preferences,
      create: {
        userId,
        ...preferences,
      },
    });
  }

  /**
   * Mark notification as read
   */
  static async markNotificationAsRead(notificationId: string) {
    return prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  /**
   * Get user's notifications
   */
  static async getUserNotifications(
    userId: string,
    limit = 50,
    offset = 0,
    unreadOnly = false
  ) {
    const whereClause: any = { userId };
    if (unreadOnly) {
      whereClause.readAt = null;
    }

    return prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }
}

export default NotificationService;