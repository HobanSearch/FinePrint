import { logger } from '../utils/logger';
import { scoringWorker } from './scoring-worker';

async function startWorker() {
  try {
    await scoringWorker.start();
    logger.info('Privacy scoring worker process started');
  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down worker');
  await scoringWorker.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down worker');
  await scoringWorker.stop();
  process.exit(0);
});

// Start the worker
startWorker();