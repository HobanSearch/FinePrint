import { config } from '../config';
import { logger } from '../utils/logger';

export async function initializeJaeger(): Promise<void> {
  logger.info('Initializing Jaeger tracing', {
    endpoint: config.jaeger.endpoint,
    serviceName: config.jaeger.serviceName,
    sampleRate: config.jaeger.sampleRate,
  });

  // Jaeger initialization is handled by OpenTelemetry
  // This file provides additional Jaeger-specific configurations if needed
}