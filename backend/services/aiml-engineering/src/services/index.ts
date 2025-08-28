import { CacheService } from '@fineprintai/shared-cache';
import { QueueService } from '@fineprintai/queue';
import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('aiml-services');

export async function initializeServices(): Promise<void> {
  try {
    logger.info('Initializing shared services');

    // Initialize cache service
    const cache = new CacheService();
    await cache.ping();
    logger.info('Cache service initialized');

    // Initialize queue service
    const queue = new QueueService();
    logger.info('Queue service initialized');

    logger.info('All shared services initialized successfully');
  } catch (error: any) {
    logger.error('Failed to initialize shared services', { error: error.message });
    throw error;
  }
}