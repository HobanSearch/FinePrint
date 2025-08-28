import { createServiceLogger } from '@fineprintai/shared-logger';
import { KongAdminService } from './kongAdmin';

const logger = createServiceLogger('metrics-service');

export interface MetricsConfig {
  kongAdmin: KongAdminService;
  prometheusPort: number;
}

export class MetricsService {
  private config: MetricsConfig;
  private server?: any;

  constructor(config: MetricsConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    logger.info('Metrics service initialized', {
      prometheusPort: this.config.prometheusPort,
    });
  }

  async startMetricsServer(): Promise<void> {
    logger.info(`Metrics server would start on port ${this.config.prometheusPort}`);
  }

  async shutdown(): Promise<void> {
    if (this.server) {
      await this.server.close();
    }
    logger.info('Metrics service shut down');
  }
}