import { PrismaClient } from '@prisma/client';
import { createHmac } from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';
import { PrivacyScore } from '../types';

const prisma = new PrismaClient();

export class WebhookService {
  /**
   * Send score change notification
   */
  async sendScoreChangeNotification(
    website: any,
    newScore: PrivacyScore,
    previousScore: any
  ): Promise<void> {
    const subscriptions = await prisma.webhookSubscription.findMany({
      where: {
        OR: [
          { websiteId: website.id },
          { websiteId: null }, // Global subscriptions
        ],
        active: true,
        events: { has: 'score_changed' },
      },
    });

    const payload = {
      event: 'score_changed',
      website: {
        id: website.id,
        name: website.name,
        domain: website.domain,
      },
      score: {
        current: {
          value: newScore.overallScore,
          grade: newScore.grade,
          breakdown: newScore.breakdown,
        },
        previous: {
          value: previousScore.overallScore,
          grade: previousScore.grade,
        },
        change: newScore.overallScore - previousScore.overallScore,
        trending: newScore.trending,
      },
      timestamp: new Date().toISOString(),
    };

    for (const subscription of subscriptions) {
      await this.sendWebhook(subscription, payload);
    }
  }

  /**
   * Send document update notification
   */
  async sendDocumentUpdateNotification(
    website: any,
    documentType: 'privacy_policy' | 'terms_of_service',
    changes: any
  ): Promise<void> {
    const subscriptions = await prisma.webhookSubscription.findMany({
      where: {
        OR: [
          { websiteId: website.id },
          { websiteId: null },
        ],
        active: true,
        events: { has: 'document_updated' },
      },
    });

    const payload = {
      event: 'document_updated',
      website: {
        id: website.id,
        name: website.name,
        domain: website.domain,
      },
      document: {
        type: documentType,
        changes: changes,
      },
      timestamp: new Date().toISOString(),
    };

    for (const subscription of subscriptions) {
      await this.sendWebhook(subscription, payload);
    }
  }

  /**
   * Send new pattern detected notification
   */
  async sendNewPatternNotification(
    website: any,
    pattern: any
  ): Promise<void> {
    const subscriptions = await prisma.webhookSubscription.findMany({
      where: {
        OR: [
          { websiteId: website.id },
          { websiteId: null },
        ],
        active: true,
        events: { has: 'new_pattern_detected' },
      },
    });

    const payload = {
      event: 'new_pattern_detected',
      website: {
        id: website.id,
        name: website.name,
        domain: website.domain,
      },
      pattern: {
        id: pattern.patternId,
        name: pattern.patternName,
        severity: pattern.severity,
        description: pattern.description,
        impact: pattern.impact,
      },
      timestamp: new Date().toISOString(),
    };

    for (const subscription of subscriptions) {
      await this.sendWebhook(subscription, payload);
    }
  }

  /**
   * Send webhook with retry logic
   */
  private async sendWebhook(subscription: any, payload: any): Promise<void> {
    const notification = await prisma.webhookNotification.create({
      data: {
        subscriptionId: subscription.id,
        eventType: payload.event,
        payload: payload,
        status: 'pending',
      },
    });

    try {
      const signature = this.generateSignature(payload, subscription.secret);
      
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FinePrint-Signature': signature,
          'X-FinePrint-Event': payload.event,
          'X-FinePrint-Timestamp': payload.timestamp,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.webhooks.timeout),
      });

      if (response.ok) {
        await prisma.webhookNotification.update({
          where: { id: notification.id },
          data: {
            status: 'sent',
            sentAt: new Date(),
            attempts: 1,
          },
        });
        
        logger.info(`Webhook sent successfully to ${subscription.url}`);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      logger.error(`Failed to send webhook to ${subscription.url}:`, error);
      
      const attempts = notification.attempts + 1;
      const shouldRetry = attempts < config.webhooks.maxRetries;
      
      await prisma.webhookNotification.update({
        where: { id: notification.id },
        data: {
          status: shouldRetry ? 'pending' : 'failed',
          attempts,
          lastAttempt: new Date(),
          nextRetry: shouldRetry 
            ? new Date(Date.now() + config.webhooks.retryDelay * attempts)
            : null,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      if (shouldRetry) {
        // Schedule retry (would be handled by a separate retry worker)
        logger.info(`Webhook will be retried (attempt ${attempts + 1}/${config.webhooks.maxRetries})`);
      }
    }
  }

  /**
   * Generate HMAC signature for webhook payload
   */
  private generateSignature(payload: any, secret?: string | null): string {
    if (!secret) {
      return '';
    }

    const hmac = createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  /**
   * Process webhook retries
   */
  async processRetries(): Promise<void> {
    const pendingRetries = await prisma.webhookNotification.findMany({
      where: {
        status: 'pending',
        nextRetry: { lte: new Date() },
      },
      include: {
        subscription: true,
      },
    });

    for (const notification of pendingRetries) {
      if (notification.subscription.active) {
        await this.sendWebhook(notification.subscription, notification.payload);
      }
    }
  }
}

export const webhookService = new WebhookService();