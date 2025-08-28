import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { WebsiteCrawlerService } from '../services/website-crawler';
import { DocumentProcessorService } from '../services/document-processor';
import { TrendAnalysisService } from '../services/trend-analysis';
import { ComplianceMonitorService } from '../services/compliance-monitor';
interface ServiceContext {
    prisma: PrismaClient;
    crawlerService: WebsiteCrawlerService;
    processorService: DocumentProcessorService;
    trendService: TrendAnalysisService;
    complianceService: ComplianceMonitorService;
}
export declare function registerRoutes(fastify: FastifyInstance, context: ServiceContext): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map