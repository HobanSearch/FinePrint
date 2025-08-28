/**
 * Fine Print AI - Document Processor Service
 * 
 * Processes aggregated documents through AI analysis pipeline
 * Extracts patterns, risks, and insights from legal documents
 */

import { PrismaClient } from '@prisma/client';
import Bull, { Queue, Job } from 'bull';
import { logger } from '../utils/logger';
// TODO: Import these services when available in the training pipeline
// import { OllamaService } from '../../../shared/services/ollama';
// import { PatternDetectionService } from '../../../analysis/src/services/patterns';
// import { RiskScoringService } from '../../../analysis/src/services/riskScoring';

// Mock service implementations for now
class MockOllamaService {
  async analyzeDocument(content: string): Promise<string> {
    // Mock AI analysis response
    return JSON.stringify({
      concerns: ['Data collection practices', 'Third-party sharing', 'User rights'],
      unusual_clauses: ['Broad data usage rights', 'Limited user control'],
      industry_comparison: 'Above average data collection',
      recommendations: ['Review privacy settings', 'Consider data minimization']
    });
  }
}

class MockPatternDetectionService {
  async detectPatterns(content: string): Promise<any[]> {
    // Mock pattern detection
    const patterns = [];
    if (content.toLowerCase().includes('collect')) {
      patterns.push({ type: 'data_collection', severity: 'medium' });
    }
    if (content.toLowerCase().includes('share')) {
      patterns.push({ type: 'data_sharing', severity: 'high' });
    }
    return patterns;
  }
}

class MockRiskScoringService {
  async calculateRiskScore(patterns: any[]): Promise<number> {
    // Mock risk scoring based on pattern count and severity
    let score = 0.1;
    patterns.forEach(pattern => {
      switch (pattern.severity) {
        case 'high': score += 0.3; break;
        case 'medium': score += 0.2; break;
        case 'low': score += 0.1; break;
      }
    });
    return Math.min(score, 1.0);
  }
}

export interface ProcessingJob {
  documentId: string;
  priority: 'high' | 'medium' | 'low';
  processingType: 'initial' | 'reprocess' | 'comparison';
  metadata?: Record<string, any>;
}

export interface ProcessingResult {
  documentId: string;
  analysisId: string;
  riskScore: number;
  patterns: any[];
  insights: any[];
  processingTime: number;
  success: boolean;
  errorMessage?: string;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export class DocumentProcessorService {
  private prisma: PrismaClient;
  private processingQueue: Queue<ProcessingJob>;
  private ollamaService: MockOllamaService;
  private patternService: MockPatternDetectionService;
  private riskService: MockRiskScoringService;
  private isRunning: boolean = false;
  private concurrency: number = 3; // Process 3 documents simultaneously

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.ollamaService = new MockOllamaService();
    this.patternService = new MockPatternDetectionService();
    this.riskService = new MockRiskScoringService();

    // Initialize Bull queue with Redis
    this.processingQueue = new Bull('document-processing', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.setupQueueHandlers();
  }

  /**
   * Start the document processing queue
   */
  async startProcessingQueue(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Document processor is already running');
      return;
    }

    this.isRunning = true;

    // Start processing jobs
    this.processingQueue.process(this.concurrency, this.processDocument.bind(this));

    // Schedule periodic processing of pending documents
    setInterval(async () => {
      await this.queuePendingDocuments();
    }, 5 * 60 * 1000); // Every 5 minutes

    logger.info('Document processing queue started');

    // Initial queue of pending documents
    await this.queuePendingDocuments();
  }

  /**
   * Stop the document processing queue
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.processingQueue) {
      await this.processingQueue.close();
    }

    logger.info('Document processor stopped');
  }

  /**
   * Setup queue event handlers
   */
  private setupQueueHandlers(): void {
    this.processingQueue.on('completed', (job: Job<ProcessingJob>, result: ProcessingResult) => {
      logger.info(`Document processing completed: ${job.data.documentId}`, {
        processingTime: result.processingTime,
        riskScore: result.riskScore,
      });
    });

    this.processingQueue.on('failed', (job: Job<ProcessingJob>, error: Error) => {
      logger.error(`Document processing failed: ${job.data.documentId}`, error);
    });

    this.processingQueue.on('stalled', (job: Job<ProcessingJob>) => {
      logger.warn(`Document processing stalled: ${job.data.documentId}`);
    });

    this.processingQueue.on('error', (error: Error) => {
      logger.error('Queue error:', error);
    });
  }

  /**
   * Process a single document
   */
  private async processDocument(job: Job<ProcessingJob>): Promise<ProcessingResult> {
    const startTime = Date.now();
    const { documentId, processingType } = job.data;

    try {
      logger.info(`Starting document processing: ${documentId} (${processingType})`);

      // Fetch document from database
      const document = await this.prisma.aggregatedDocument.findUnique({
        where: { id: documentId },
      });

      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // Create analysis record
      const analysis = await this.prisma.documentAnalysis.create({
        data: {
          documentId: document.id,
          status: 'processing',
          startedAt: new Date(),
          // processingType, metadata fields don't exist in schema
        },
      });

      // Process document content
      const analysisResult = await this.analyzeDocument(document, analysis.id);

      // Update analysis with results
      await this.prisma.documentAnalysis.update({
        where: { id: analysis.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          riskScore: analysisResult.riskScore,
          problematicClauses: analysisResult.patterns,
          // insights: analysisResult.insights, // Field doesn't exist in schema - using recommendations instead
          recommendations: analysisResult.insights,
        },
      });

      // Update document with latest analysis
      await this.prisma.aggregatedDocument.update({
        where: { id: documentId },
        data: {
          lastAnalyzed: new Date(),
          riskScore: analysisResult.riskScore,
        },
      });

      // Generate comparison analysis if this is a reprocess
      if (processingType === 'reprocess') {
        await this.generateComparisonAnalysis(documentId, analysis.id);
      }

      const processingTime = Date.now() - startTime;

      return {
        documentId,
        analysisId: analysis.id,
        riskScore: analysisResult.riskScore,
        patterns: analysisResult.patterns,
        insights: analysisResult.insights,
        processingTime,
        success: true,
      };
    } catch (error) {
      logger.error(`Error processing document ${documentId}:`, error);

      // Update analysis with error
      try {
        await this.prisma.documentAnalysis.updateMany({
          where: {
            documentId,
            status: 'processing',
          },
          data: {
            status: 'failed',
            completedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } catch (updateError) {
        logger.error('Failed to update analysis with error:', updateError);
      }

      return {
        documentId,
        analysisId: '',
        riskScore: 0,
        patterns: [],
        insights: [],
        processingTime: Date.now() - startTime,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Analyze document content using AI pipeline
   */
  private async analyzeDocument(document: any, analysisId: string): Promise<{
    riskScore: number;
    patterns: any[];
    insights: any[];
  }> {
    const content = document.content;
    const documentType = document.documentType;

    // Extract patterns using pattern detection service (mock implementation for now)
    const patterns = await this.patternService.detectPatterns(content);

    // Calculate risk score
    const riskScore = await this.riskService.calculateRiskScore(patterns);

    // Generate AI insights
    const insights = await this.generateAIInsights(content, patterns, documentType);

    return {
      riskScore,
      patterns,
      insights,
    };
  }

  /**
   * Generate AI insights using Ollama
   */
  private async generateAIInsights(
    content: string,
    patterns: any[],
    documentType: string
  ): Promise<any[]> {
    try {
      const prompt = this.buildInsightsPrompt(content, patterns, documentType);
      const response = await this.ollamaService.analyzeDocument(prompt);

      return this.parseInsightsResponse(response);
    } catch (error) {
      logger.error('Error generating AI insights:', error);
      return [];
    }
  }

  /**
   * Build prompt for AI insights generation
   */
  private buildInsightsPrompt(content: string, patterns: any[], documentType: string): string {
    const patternSummary = patterns.map(p => `${p.type}: ${p.severity}`).join(', ');
    
    return `
Analyze this ${documentType} document and provide key insights:

Document excerpt: ${content.substring(0, 2000)}...

Detected patterns: ${patternSummary}

Please provide:
1. Top 3 consumer concerns
2. Unusual or problematic clauses
3. Comparison to industry standards
4. Recommendations for users

Format as JSON with keys: concerns, unusual_clauses, industry_comparison, recommendations
`;
  }

  /**
   * Parse AI insights response
   */
  private parseInsightsResponse(response: string): any[] {
    try {
      const parsed = JSON.parse(response);
      return [
        {
          type: 'consumer_concerns',
          items: parsed.concerns || [],
        },
        {
          type: 'unusual_clauses',
          items: parsed.unusual_clauses || [],
        },
        {
          type: 'industry_comparison',
          content: parsed.industry_comparison || '',
        },
        {
          type: 'recommendations',
          items: parsed.recommendations || [],
        },
      ];
    } catch (error) {
      logger.error('Error parsing AI insights:', error);
      return [];
    }
  }

  /**
   * Generate comparison analysis between document versions
   */
  private async generateComparisonAnalysis(documentId: string, currentAnalysisId: string): Promise<void> {
    try {
      // Get previous analysis for comparison
      const previousAnalysis = await this.prisma.documentAnalysis.findFirst({
        where: {
          documentId,
          status: 'completed',
          id: { not: currentAnalysisId },
        },
        orderBy: { completedAt: 'desc' },
      });

      if (!previousAnalysis) {
        logger.info('No previous analysis found for comparison');
        return;
      }

      // Get current analysis
      const currentAnalysis = await this.prisma.documentAnalysis.findUnique({
        where: { id: currentAnalysisId },
      });

      if (!currentAnalysis) {
        logger.error('Current analysis not found');
        return;
      }

      // Generate comparison insights
      const comparison = await this.generateComparisonInsights(
        previousAnalysis,
        currentAnalysis
      );

      // TODO: Save comparison analysis when DocumentComparison model is available
      // await this.prisma.documentComparison.create({
      //   data: {
      //     documentId,
      //     previousAnalysisId: previousAnalysis.id,
      //     currentAnalysisId: currentAnalysisId,
      //     riskScoreChange: (currentAnalysis.riskScore || 0) - (previousAnalysis.riskScore || 0),
      //     changesDetected: comparison.changesDetected,
      //     significantChanges: comparison.significantChanges,
      //     newPatterns: comparison.newPatterns,
      //     removedPatterns: comparison.removedPatterns,
      //     summary: comparison.summary,
      //     createdAt: new Date(),
      //   },
      // });

      logger.info(`Comparison analysis generated for document ${documentId}`);
    } catch (error) {
      logger.error('Error generating comparison analysis:', error);
    }
  }

  /**
   * Generate comparison insights between two analyses
   */
  private async generateComparisonInsights(
    previousAnalysis: any,
    currentAnalysis: any
  ): Promise<{
    changesDetected: boolean;
    significantChanges: any[];
    newPatterns: any[];
    removedPatterns: any[];
    summary: string;
  }> {
    const previousPatterns = previousAnalysis.problematicClauses || [];
    const currentPatterns = currentAnalysis.problematicClauses || [];

    // Find new patterns
    const newPatterns = currentPatterns.filter((current: any) =>
      !previousPatterns.some((prev: any) => prev.type === current.type)
    );

    // Find removed patterns
    const removedPatterns = previousPatterns.filter((prev: any) =>
      !currentPatterns.some((current: any) => current.type === prev.type)
    );

    // Detect significant changes
    const significantChanges = [];
    const riskScoreChange = (currentAnalysis.riskScore || 0) - (previousAnalysis.riskScore || 0);

    if (Math.abs(riskScoreChange) > 0.1) {
      significantChanges.push({
        type: 'risk_score_change',
        change: riskScoreChange > 0 ? 'increased' : 'decreased',
        amount: Math.abs(riskScoreChange),
      });
    }

    if (newPatterns.length > 0) {
      significantChanges.push({
        type: 'new_patterns',
        count: newPatterns.length,
        patterns: newPatterns.map((p: any) => p.type),
      });
    }

    if (removedPatterns.length > 0) {
      significantChanges.push({
        type: 'removed_patterns',
        count: removedPatterns.length,
        patterns: removedPatterns.map((p: any) => p.type),
      });
    }

    // Generate summary
    const summary = this.generateComparisonSummary(
      riskScoreChange,
      newPatterns,
      removedPatterns,
      significantChanges
    );

    return {
      changesDetected: significantChanges.length > 0 || newPatterns.length > 0 || removedPatterns.length > 0,
      significantChanges,
      newPatterns,
      removedPatterns,
      summary,
    };
  }

  /**
   * Generate comparison summary text
   */
  private generateComparisonSummary(
    riskScoreChange: number,
    newPatterns: any[],
    removedPatterns: any[],
    significantChanges: any[]
  ): string {
    const parts = [];

    if (Math.abs(riskScoreChange) > 0.1) {
      const direction = riskScoreChange > 0 ? 'increased' : 'decreased';
      parts.push(`Risk score ${direction} by ${Math.abs(riskScoreChange).toFixed(2)}`);
    }

    if (newPatterns.length > 0) {
      parts.push(`${newPatterns.length} new problematic patterns detected`);
    }

    if (removedPatterns.length > 0) {
      parts.push(`${removedPatterns.length} previous patterns no longer detected`);
    }

    if (parts.length === 0) {
      return 'No significant changes detected in this document update';
    }

    return parts.join('. ') + '.';
  }

  /**
   * Queue pending documents for processing
   */
  private async queuePendingDocuments(): Promise<void> {
    try {
      // Find documents that need initial processing
      const unprocessedDocs = await this.prisma.aggregatedDocument.findMany({
        where: {
          lastAnalyzed: null,
        },
        take: 50,
        orderBy: { crawledAt: 'desc' },
      });

      // Find documents that need reprocessing (new versions) - simplified query
      const reprocessDocs = await this.prisma.aggregatedDocument.findMany({
        where: {
          lastAnalyzed: { not: null },
          // TODO: Add proper comparison query when Prisma supports field references
        },
        take: 25,
        orderBy: { crawledAt: 'desc' },
      });

      // Queue initial processing jobs
      for (const doc of unprocessedDocs) {
        await this.queueProcessingJob({
          documentId: doc.id,
          priority: this.getPriority(doc.websiteName),
          processingType: 'initial',
        });
      }

      // Queue reprocessing jobs
      for (const doc of reprocessDocs) {
        await this.queueProcessingJob({
          documentId: doc.id,
          priority: this.getPriority(doc.websiteName),
          processingType: 'reprocess',
        });
      }

      if (unprocessedDocs.length > 0 || reprocessDocs.length > 0) {
        logger.info(`Queued ${unprocessedDocs.length + reprocessDocs.length} documents for processing`);
      }
    } catch (error) {
      logger.error('Error queuing pending documents:', error);
    }
  }

  /**
   * Queue a processing job
   */
  async queueProcessingJob(job: ProcessingJob): Promise<void> {
    const priority = this.getPriorityValue(job.priority);
    
    await this.processingQueue.add(job, {
      priority,
      delay: job.priority === 'low' ? 60000 : 0, // Delay low priority jobs by 1 minute
    });
  }

  /**
   * Get priority value for queue
   */
  private getPriorityValue(priority: 'high' | 'medium' | 'low'): number {
    switch (priority) {
      case 'high': return 1;
      case 'medium': return 2;
      case 'low': return 3;
      default: return 2;
    }
  }

  /**
   * Get processing priority based on website
   */
  private getPriority(websiteName: string): 'high' | 'medium' | 'low' {
    const highPriorityWebsites = ['Google', 'Facebook', 'Apple', 'Microsoft', 'Amazon'];
    const lowPriorityWebsites = ['New York Times', 'CNN', 'DoorDash'];

    if (highPriorityWebsites.includes(websiteName)) {
      return 'high';
    }

    if (lowPriorityWebsites.includes(websiteName)) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<QueueStats> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.processingQueue.getWaiting(),
      this.processingQueue.getActive(),
      this.processingQueue.getCompleted(),
      this.processingQueue.getFailed(),
      this.processingQueue.getDelayed(),
      [], // this.processingQueue.getPaused(), // Method doesn't exist in Bull
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: 0, // paused.length, // Paused queue method doesn't exist
    };
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(days: number = 7): Promise<any> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalProcessed, avgProcessingTime, riskScoreDistribution] = await Promise.all([
      this.prisma.documentAnalysis.count({
        where: {
          completedAt: { gte: since },
          status: 'completed',
        },
      }),
      this.prisma.documentAnalysis.aggregate({
        where: {
          completedAt: { gte: since },
          status: 'completed',
        },
        _avg: { riskScore: true }, // processingTimeMs field doesn't exist
      }),
      this.prisma.documentAnalysis.groupBy({
        by: ['riskScore'],
        where: {
          completedAt: { gte: since },
          status: 'completed',
        },
        _count: true,
      }),
    ]);

    return {
      totalProcessed,
      avgProcessingTime: 0, // avgProcessingTime._avg.processingTimeMs || 0, // Field doesn't exist
      riskScoreDistribution,
      periodDays: days,
    };
  }

  /**
   * Reprocess specific document
   */
  async reprocessDocument(documentId: string): Promise<void> {
    await this.queueProcessingJob({
      documentId,
      priority: 'high',
      processingType: 'reprocess',
    });
  }

  /**
   * Get recent analyses
   */
  async getRecentAnalyses(limit: number = 50): Promise<any[]> {
    return await this.prisma.documentAnalysis.findMany({
      take: limit,
      orderBy: { completedAt: 'desc' },
      include: {
        document: {
          select: {
            websiteName: true,
            documentType: true,
            title: true,
            url: true,
          },
        },
      },
    });
  }
}