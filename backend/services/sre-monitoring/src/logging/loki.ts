import { config } from '../config';
import { logger } from '../utils/logger';

export async function initializeLoki(): Promise<void> {
  logger.info('Initializing Loki log aggregation', {
    host: config.loki.host,
    port: config.loki.port,
    labels: config.loki.labels,
  });

  // Loki initialization is handled by the logger transport
  // This file provides additional Loki-specific configurations if needed
}