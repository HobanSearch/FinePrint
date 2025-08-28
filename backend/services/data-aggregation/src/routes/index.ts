/**
 * Fine Print AI - Data Aggregation Service Routes
 * 
 * API routes for data aggregation service including crawling, analysis,
 * trends, and public website data access
 */

import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { WebsiteCrawlerService } from '../services/website-crawler';
import { DocumentProcessorService } from '../services/document-processor';
import { TrendAnalysisService } from '../services/trend-analysis';
import { ComplianceMonitorService } from '../services/compliance-monitor';
import { WebsiteTargets } from '../config/website-targets';
import { logger } from '../utils/logger';

interface ServiceContext {
  prisma: PrismaClient;
  crawlerService: WebsiteCrawlerService;
  processorService: DocumentProcessorService;
  trendService: TrendAnalysisService;
  complianceService: ComplianceMonitorService;
}

export async function registerRoutes(
  fastify: FastifyInstance,
  context: ServiceContext
): Promise<void> {
  const { prisma, crawlerService, processorService, trendService, complianceService } = context;

  // Add authentication hook for protected routes
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip auth for health check and public routes
    if (request.url.startsWith('/health') || request.url.startsWith('/public/')) {
      return;
    }

    // Add authentication logic here
    const authToken = request.headers.authorization?.replace('Bearer ', '');
    if (!authToken || authToken !== process.env['SERVICE_AUTH_TOKEN']) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // =============================================================================
  // WEBSITE CRAWLING ROUTES
  // =============================================================================

  // Get all website targets
  fastify.get('/websites', async (_request, reply) => {
    try {
      return {
        websites: WebsiteTargets.getAllTargets(),
        statistics: WebsiteTargets.getStatistics(),
      };
    } catch (error) {
      logger.error('Error fetching websites:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get websites by category
  fastify.get<{ Params: { category: string } }>('/websites/category/:category', async (request, reply) => {
    try {
      const { category } = request.params;
      const websites = WebsiteTargets.getTargetsByCategory(category);
      
      return { websites, category };
    } catch (error) {
      logger.error('Error fetching websites by category:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Start crawling all websites
  fastify.post('/crawl/start', async (request, reply) => {
    try {
      const stats = await crawlerService.crawlAllWebsites();
      return { message: 'Crawling completed', stats };
    } catch (error) {
      logger.error('Error starting crawl:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Crawl specific website
  fastify.post<{ Params: { websiteName: string } }>('/crawl/:websiteName', async (request, reply) => {
    try {
      const { websiteName } = request.params;
      const results = await crawlerService.crawlSpecificWebsite(websiteName);
      
      return { message: 'Crawling completed', websiteName, results };
    } catch (error) {
      logger.error('Error crawling specific website:', error);
      return reply.code(500).send({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  // Get crawl statistics
  fastify.get('/crawl/stats', async (request, reply) => {
    try {
      const stats = await crawlerService.getRecentStats(20);
      return { stats };
    } catch (error) {
      logger.error('Error fetching crawl stats:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get documents for specific website
  fastify.get<{ 
    Params: { websiteName: string };
    Querystring: { limit?: number };
  }>('/documents/:websiteName', async (request, reply) => {
    try {
      const { websiteName } = request.params;
      const limit = request.query.limit || 50;
      
      const documents = await crawlerService.getWebsiteDocuments(websiteName, limit);
      return { websiteName, documents };
    } catch (error) {
      logger.error('Error fetching website documents:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // =============================================================================
  // DOCUMENT PROCESSING ROUTES
  // =============================================================================

  // Get processing queue status
  fastify.get('/processing/status', async (request, reply) => {
    try {
      const queueStatus = await processorService.getQueueStatus();
      const stats = await processorService.getProcessingStats();
      
      return { queueStatus, stats };
    } catch (error) {
      logger.error('Error fetching processing status:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Reprocess specific document
  fastify.post<{ Params: { documentId: string } }>('/processing/reprocess/:documentId', async (request, reply) => {
    try {
      const { documentId } = request.params;
      await processorService.reprocessDocument(documentId);
      
      return { message: 'Document queued for reprocessing', documentId };
    } catch (error) {
      logger.error('Error reprocessing document:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get recent analyses
  fastify.get<{ Querystring: { limit?: number } }>('/processing/analyses', async (request, reply) => {
    try {
      const limit = request.query.limit || 50;
      const analyses = await processorService.getRecentAnalyses(limit);
      
      return { analyses };
    } catch (error) {
      logger.error('Error fetching recent analyses:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // =============================================================================
  // TREND ANALYSIS ROUTES
  // =============================================================================

  // Get industry trends
  fastify.get<{ Querystring: { category?: string; days?: number } }>('/trends/industry', async (request, reply) => {
    try {
      const { category, days = 30 } = request.query;
      const trends = await trendService.getIndustryTrends(category, days);
      
      return { trends, category, periodDays: days };
    } catch (error) {
      logger.error('Error fetching industry trends:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get risk score trends
  fastify.get<{ Querystring: { websiteName?: string; days?: number } }>('/trends/risk-scores', async (request, reply) => {
    try {
      const { websiteName, days = 30 } = request.query;
      const trends = await trendService.getRiskScoreTrends(websiteName, days);
      
      return { trends, websiteName, periodDays: days };
    } catch (error) {
      logger.error('Error fetching risk score trends:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get pattern evolution
  fastify.get<{ Querystring: { patternType?: string; days?: number } }>('/trends/patterns', async (request, reply) => {
    try {
      const { patternType, days = 90 } = request.query;
      const evolution = await trendService.getPatternEvolution(patternType, days);
      
      return { evolution, patternType, periodDays: days };
    } catch (error) {
      logger.error('Error fetching pattern evolution:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Generate trend report
  fastify.post<{ Body: { category?: string; websites?: string[]; days?: number } }>('/trends/report', async (request, reply) => {
    try {
      const { category, websites, days = 30 } = request.body;
      const report = await trendService.generateTrendReport({ category, websites, days });
      
      return { report };
    } catch (error) {
      logger.error('Error generating trend report:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // =============================================================================
  // COMPLIANCE MONITORING ROUTES
  // =============================================================================

  // Get compliance alerts
  fastify.get<{ Querystring: { severity?: string; limit?: number } }>('/compliance/alerts', async (request, reply) => {
    try {
      const { severity, limit = 50 } = request.query;
      const alerts = await complianceService.getRecentAlerts(severity, limit);
      
      return { alerts };
    } catch (error) {
      logger.error('Error fetching compliance alerts:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get compliance scores by category
  fastify.get('/compliance/scores', async (request, reply) => {
    try {
      const scores = await complianceService.getComplianceScores();
      return { scores };
    } catch (error) {
      logger.error('Error fetching compliance scores:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get regulatory changes
  fastify.get<{ Querystring: { region?: string; days?: number } }>('/compliance/changes', async (request, reply) => {
    try {
      const { region, days = 30 } = request.query;
      const changes = await complianceService.getRegulatoryChanges(region, days);
      
      return { changes, region, periodDays: days };
    } catch (error) {
      logger.error('Error fetching regulatory changes:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // =============================================================================
  // PUBLIC DATA ACCESS ROUTES (No authentication required)
  // =============================================================================

  // Get public website statistics
  fastify.get('/public/stats', async (request, reply) => {
    try {
      const [totalDocuments, lastWeekAnalyses, categories] = await Promise.all([
        prisma.aggregatedDocument.count(),
        prisma.documentAnalysis.count({
          where: {
            completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            status: 'completed',
          },
        }),
        prisma.aggregatedDocument.groupBy({
          by: ['websiteName'],
          _count: true,
          orderBy: { _count: { websiteName: 'desc' } },
          take: 10,
        }),
      ]);

      return {
        totalDocuments,
        lastWeekAnalyses,
        topWebsites: categories.map(c => ({
          name: c.websiteName,
          documentCount: c._count,
        })),
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error fetching public stats:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get public risk score comparison
  fastify.get<{ Querystring: { websites?: string } }>('/public/risk-comparison', async (request, reply) => {
    try {
      const websiteNames = request.query.websites?.split(',') || [];
      
      if (websiteNames.length === 0 || websiteNames.length > 10) {
        return reply.code(400).send({ 
          error: 'Please provide 1-10 website names separated by commas' 
        });
      }

      const comparisons = await Promise.all(
        websiteNames.map(async (name) => {
          const latestDoc = await prisma.aggregatedDocument.findFirst({
            where: { websiteName: name.trim() },
            orderBy: { crawledAt: 'desc' },
            select: {
              websiteName: true,
              riskScore: true,
              lastAnalyzed: true,
              documentType: true,
            },
          });

          return latestDoc ? {
            website: latestDoc.websiteName,
            riskScore: latestDoc.riskScore || 0,
            lastAnalyzed: latestDoc.lastAnalyzed,
            documentType: latestDoc.documentType,
          } : {
            website: name.trim(),
            riskScore: null,
            lastAnalyzed: null,
            documentType: null,
            error: 'Website not found',
          };
        })
      );

      return { comparisons };
    } catch (error) {
      logger.error('Error fetching risk comparison:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get public industry averages
  fastify.get('/public/industry-averages', async (request, reply) => {
    try {
      const averages = await prisma.aggregatedDocument.groupBy({
        by: ['websiteName'],
        where: {
          riskScore: { not: null },
          lastAnalyzed: { not: null },
        },
        _avg: { riskScore: true },
        _count: true,
      });

      // Group by categories from WebsiteTargets
      const categoryAverages: Record<string, { average: number; count: number; websites: string[] }> = {};
      
      averages.forEach(avg => {
        const target = WebsiteTargets.getTarget(avg.websiteName);
        const category = target?.category || 'unknown';
        
        if (!categoryAverages[category]) {
          categoryAverages[category] = { average: 0, count: 0, websites: [] };
        }
        
        categoryAverages[category].average += avg._avg.riskScore || 0;
        categoryAverages[category].count += 1;
        categoryAverages[category].websites.push(avg.websiteName);
      });

      // Calculate final averages
      Object.keys(categoryAverages).forEach(category => {
        categoryAverages[category].average = 
          categoryAverages[category].average / categoryAverages[category].count;
      });

      return { categoryAverages };
    } catch (error) {
      logger.error('Error fetching industry averages:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // =============================================================================
  // SEARCH AND DISCOVERY ROUTES
  // =============================================================================

  // Search documents
  fastify.get<{ 
    Querystring: { 
      q?: string; 
      category?: string; 
      riskLevel?: 'low' | 'medium' | 'high';
      limit?: number;
      offset?: number;
    } 
  }>('/search/documents', async (request, reply) => {
    try {
      const { q, category, riskLevel, limit = 20, offset = 0 } = request.query;
      
      const whereClause: any = {};
      
      if (q) {
        whereClause.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { websiteName: { contains: q, mode: 'insensitive' } },
          { content: { contains: q, mode: 'insensitive' } },
        ];
      }
      
      if (category) {
        // Get websites in category
        const websites = WebsiteTargets.getTargetsByCategory(category);
        whereClause.websiteName = { in: websites.map(w => w.name) };
      }
      
      if (riskLevel) {
        const riskRanges = {
          low: { gte: 0, lt: 0.33 },
          medium: { gte: 0.33, lt: 0.67 },
          high: { gte: 0.67, lte: 1 },
        };
        whereClause.riskScore = riskRanges[riskLevel];
      }

      const [documents, total] = await Promise.all([
        prisma.aggregatedDocument.findMany({
          where: whereClause,
          take: limit,
          skip: offset,
          orderBy: { crawledAt: 'desc' },
          select: {
            id: true,
            websiteName: true,
            documentType: true,
            title: true,
            url: true,
            riskScore: true,
            lastAnalyzed: true,
            crawledAt: true,
          },
        }),
        prisma.aggregatedDocument.count({ where: whereClause }),
      ]);

      return {
        documents,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };
    } catch (error) {
      logger.error('Error searching documents:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get document details
  fastify.get<{ Params: { documentId: string } }>('/documents/details/:documentId', async (request, reply) => {
    try {
      const { documentId } = request.params;
      
      const [document, analyses] = await Promise.all([
        prisma.aggregatedDocument.findUnique({
          where: { id: documentId },
        }),
        prisma.documentAnalysis.findMany({
          where: { documentId },
          orderBy: { completedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            riskScore: true,
            problematicClauses: true,
            recommendations: true,
            completedAt: true,
          },
        }),
      ]);

      if (!document) {
        return reply.code(404).send({ error: 'Document not found' });
      }

      return { document, recentAnalyses: analyses };
    } catch (error) {
      logger.error('Error fetching document details:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  logger.info('Data aggregation routes registered successfully');
}