import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('notification-workers');

export async function setupWorkers(): Promise<void> {
  try {
    // Workers are already set up in the individual services:
    // - notificationService: Main notification processing workers
    // - deliveryTracker: Analytics and metrics workers
    // - abTestService: A/B test processing workers
    // - emailService: Email webhook processing workers
    // - webhookService: Webhook retry workers

    logger.info('All notification workers are running');
  } catch (error) {
    logger.error('Failed to setup workers', { error });
    throw error;
  }
}