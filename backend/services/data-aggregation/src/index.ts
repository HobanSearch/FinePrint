/**
 * Fine Print AI - Data Aggregation Service
 * 
 * Aggregates publicly available legal documents from popular websites
 * for analysis, comparison, and trend monitoring
 */

import Fastify, { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { registerRoutes } from './routes';
import { WebsiteCrawlerService } from './services/website-crawler';
import { DocumentProcessorService } from './services/document-processor';
import { TrendAnalysisService } from './services/trend-analysis';
import { ComplianceMonitorService } from './services/compliance-monitor';
import { logger } from './utils/logger';
import { config } from './config';

class DataAggregationService {
  private fastify: FastifyInstance;
  private prisma: PrismaClient;
  private crawlerService!: WebsiteCrawlerService;
  private processorService!: DocumentProcessorService;
  private trendService!: TrendAnalysisService;
  private complianceService!: ComplianceMonitorService;

  constructor() {
    this.fastify = Fastify({
      logger: {
        level: config.logLevel,
      },
    });

    this.prisma = new PrismaClient();
    this.setupServices();
    this.setupHooks();
  }

  private setupServices(): void {
    this.crawlerService = new WebsiteCrawlerService(this.prisma);
    this.processorService = new DocumentProcessorService(this.prisma);
    this.trendService = new TrendAnalysisService(this.prisma);
    this.complianceService = new ComplianceMonitorService(this.prisma);
  }

  private setupHooks(): void {
    // Graceful shutdown
    this.fastify.addHook('onClose', async () => {
      await this.prisma.$disconnect();
      logger.info('Data Aggregation Service shutting down');
    });

    // Health check
    this.fastify.get('/health', async () => {
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: await this.checkDatabaseHealth(),
          crawler: this.crawlerService.getStatus(),
          processor: this.processorService.getQueueStatus(),
        },
      };
    });
  }

  private async checkDatabaseHealth(): Promise<string> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'connected';
    } catch (error) {
      logger.error('Database health check failed:', error);
      return 'disconnected';
    }
  }

  public async start(): Promise<void> {
    try {
      // Register routes
      await registerRoutes(this.fastify, {
        prisma: this.prisma,
        crawlerService: this.crawlerService,
        processorService: this.processorService,
        trendService: this.trendService,
        complianceService: this.complianceService,
      });

      // Start background services
      await this.startBackgroundServices();

      // Start server
      await this.fastify.listen({
        port: config.port,
        host: config.host,
      });

      logger.info(`Data Aggregation Service listening on ${config.host}:${config.port}`);
    } catch (error) {
      logger.error('Failed to start Data Aggregation Service:', error);
      process.exit(1);
    }
  }

  private async startBackgroundServices(): Promise<void> {
    // Start periodic crawling
    await this.crawlerService.startPeriodicCrawling();
    
    // Start document processing queue
    await this.processorService.startProcessingQueue();
    
    // Start trend analysis
    await this.trendService.startPeriodicAnalysis();
    
    // Start compliance monitoring
    await this.complianceService.startMonitoring();

    logger.info('Background services started');
  }

  public async stop(): Promise<void> {
    try {
      await this.crawlerService.stop();
      await this.processorService.stop();
      await this.trendService.stop();
      await this.complianceService.stop();
      await this.fastify.close();
      
      logger.info('Data Aggregation Service stopped');
    } catch (error) {
      logger.error('Error stopping Data Aggregation Service:', error);
    }
  }
}

// Start service if running directly
if (require.main === module) {
  const service = new DataAggregationService();
  
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    await service.stop();
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully');
    await service.stop();
  });

  service.start().catch((error) => {
    logger.error('Failed to start service:', error);
    process.exit(1);
  });
}

export { DataAggregationService };