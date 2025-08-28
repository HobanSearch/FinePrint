"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataAggregationService = void 0;
const fastify_1 = __importDefault(require("fastify"));
const client_1 = require("@prisma/client");
const routes_1 = require("./routes");
const website_crawler_1 = require("./services/website-crawler");
const document_processor_1 = require("./services/document-processor");
const trend_analysis_1 = require("./services/trend-analysis");
const compliance_monitor_1 = require("./services/compliance-monitor");
const logger_1 = require("./utils/logger");
const config_1 = require("./config");
class DataAggregationService {
    fastify;
    prisma;
    crawlerService;
    processorService;
    trendService;
    complianceService;
    constructor() {
        this.fastify = (0, fastify_1.default)({
            logger: {
                level: config_1.config.logLevel,
            },
        });
        this.prisma = new client_1.PrismaClient();
        this.setupServices();
        this.setupHooks();
    }
    setupServices() {
        this.crawlerService = new website_crawler_1.WebsiteCrawlerService(this.prisma);
        this.processorService = new document_processor_1.DocumentProcessorService(this.prisma);
        this.trendService = new trend_analysis_1.TrendAnalysisService(this.prisma);
        this.complianceService = new compliance_monitor_1.ComplianceMonitorService(this.prisma);
    }
    setupHooks() {
        this.fastify.addHook('onClose', async () => {
            await this.prisma.$disconnect();
            logger_1.logger.info('Data Aggregation Service shutting down');
        });
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
    async checkDatabaseHealth() {
        try {
            await this.prisma.$queryRaw `SELECT 1`;
            return 'connected';
        }
        catch (error) {
            logger_1.logger.error('Database health check failed:', error);
            return 'disconnected';
        }
    }
    async start() {
        try {
            await (0, routes_1.registerRoutes)(this.fastify, {
                prisma: this.prisma,
                crawlerService: this.crawlerService,
                processorService: this.processorService,
                trendService: this.trendService,
                complianceService: this.complianceService,
            });
            await this.startBackgroundServices();
            await this.fastify.listen({
                port: config_1.config.port,
                host: config_1.config.host,
            });
            logger_1.logger.info(`Data Aggregation Service listening on ${config_1.config.host}:${config_1.config.port}`);
        }
        catch (error) {
            logger_1.logger.error('Failed to start Data Aggregation Service:', error);
            process.exit(1);
        }
    }
    async startBackgroundServices() {
        await this.crawlerService.startPeriodicCrawling();
        await this.processorService.startProcessingQueue();
        await this.trendService.startPeriodicAnalysis();
        await this.complianceService.startMonitoring();
        logger_1.logger.info('Background services started');
    }
    async stop() {
        try {
            await this.crawlerService.stop();
            await this.processorService.stop();
            await this.trendService.stop();
            await this.complianceService.stop();
            await this.fastify.close();
            logger_1.logger.info('Data Aggregation Service stopped');
        }
        catch (error) {
            logger_1.logger.error('Error stopping Data Aggregation Service:', error);
        }
    }
}
exports.DataAggregationService = DataAggregationService;
if (require.main === module) {
    const service = new DataAggregationService();
    process.on('SIGTERM', async () => {
        logger_1.logger.info('Received SIGTERM, shutting down gracefully');
        await service.stop();
    });
    process.on('SIGINT', async () => {
        logger_1.logger.info('Received SIGINT, shutting down gracefully');
        await service.stop();
    });
    service.start().catch((error) => {
        logger_1.logger.error('Failed to start service:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map