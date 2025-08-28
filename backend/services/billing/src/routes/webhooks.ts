import express from 'express';
import { WebhookService } from '../services/webhook.service';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * Stripe webhook endpoint
 * This endpoint receives and processes Stripe webhook events
 */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      logger.warn('Missing Stripe signature header');
      return res.status(400).json({
        success: false,
        error: 'Missing Stripe signature',
      });
    }

    // Process the webhook
    const result = await WebhookService.processWebhook(req.body, signature as string);

    logger.info('Stripe webhook processed successfully', {
      eventType: result.eventType,
    });

    res.json({
      success: true,
      received: result.received,
      eventType: result.eventType,
    });

  } catch (error) {
    logger.error('Stripe webhook processing failed', { error });
    
    // Return 400 for webhook signature verification failures
    if (error instanceof Error && error.message.includes('signature')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook signature',
      });
    }

    // Return 500 for other processing errors
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed',
    });
  }
});

/**
 * Health check endpoint for webhook service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'billing-webhooks',
    timestamp: new Date().toISOString(),
  });
});

export default router;