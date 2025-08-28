import { createServiceLogger } from '@fineprintai/shared-logger';
import { analysisCache, queueManager } from '@fineprintai/shared-cache';
import { PrismaClient } from '@prisma/client';
import { WebSocketService } from '@fineprintai/websocket';
import { NotificationService } from '@fineprintai/notification';
import { enhancedAnalysisEngine, EnhancedAnalysisResult, AnalysisRequest } from './enhancedAnalysis';
import { textProcessor } from './textProcessor';
import { embeddingService } from './embeddings';
import { riskScoringEngine } from './riskScoring';
import { AnalysisService } from './analysis';
import crypto from 'crypto';

const logger = createServiceLogger('unified-analysis-engine');
const prisma = new PrismaClient();

export interface UnifiedAnalysisRequest {
  // Input types
  content?: string;
  url?: string;
  fileBuffer?: Buffer;
  filename?: string;
  
  // Metadata
  userId: string;
  teamId?: string;
  documentType?: 'terms_of_service' | 'privacy_policy' | 'eula' | 'cookie_policy' | 'data_processing_agreement' | 'service_agreement' | 'other';
  language?: string;
  priority?: 'low' | 'normal' | 'high';
  
  // Options
  options?: {
    modelPreference?: 'speed' | 'accuracy' | 'balanced';
    includeEmbeddings?: boolean;
    includeSimilarDocuments?: boolean;
    enableChangeMonitoring?: boolean;
    generateReport?: boolean;
    customPatterns?: string[];
    webhookUrl?: string;
  };
}

export interface UnifiedAnalysisResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  documentId: string;
  progress?: {
    percentage: number;
    stage: string;
    message: string;
    estimatedTimeRemaining?: number;
  };
  queuePosition?: number;
  createdAt: Date;
  completedAt?: Date;
  
  // Results (available when completed)
  results?: EnhancedAnalysisResult;
  
  // Business features
  quota?: {
    used: number;
    limit: number;
    resetDate: Date;
  };
  
  // Monitoring
  changeAlert?: {
    enabled: boolean;
    lastChecked?: Date;
  };
}

export interface AnalysisStats {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  avgRiskScore: number;
  avgProcessingTime: number;
  topCategories: Array<{ category: string; count: number }>;
  riskDistribution: { [level: string]: number };
  recentTrends: Array<{
    date: string;
    count: number;
    avgRisk: number;
  }>;
}

export class UnifiedAnalysisEngine {
  private analysisService: AnalysisService;
  private wsService?: WebSocketService;
  private notificationService?: NotificationService;
  private processingQueue = new Map<string, Promise<UnifiedAnalysisResponse>>();

  constructor() {
    this.analysisService = new AnalysisService();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Unified Analysis Engine');
    
    try {
      // Initialize all dependent services
      await Promise.all([
        enhancedAnalysisEngine.initialize(),
        embeddingService.initialize()
      ]);
      
      // Initialize optional services
      try {
        this.wsService = new WebSocketService();
        this.notificationService = new NotificationService();
      } catch (error) {
        logger.warn('Optional services not available', { error: error.message });
      }
      
      logger.info('Unified Analysis Engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Unified Analysis Engine', { error: error.message });
      throw error;
    }
  }

  async createAnalysis(request: UnifiedAnalysisRequest): Promise<UnifiedAnalysisResponse> {
    const analysisId = crypto.randomUUID();
    
    logger.info('Creating new unified analysis', {
      analysisId,
      userId: request.userId,
      hasContent: !!request.content,
      hasUrl: !!request.url,
      hasFile: !!request.fileBuffer,
      documentType: request.documentType
    });

    try {
      // Check user quota
      const quotaStatus = await this.checkUserQuota(request.userId);
      if (!quotaStatus.allowed) {
        throw new Error(`Analysis quota exceeded. Limit: ${quotaStatus.limit}, Used: ${quotaStatus.used}`);
      }

      // Validate input
      if (!request.content && !request.url && !request.fileBuffer) {
        throw new Error('No content source provided (content, URL, or file required)');
      }

      // Create document record first
      let documentId: string;
      let documentTitle: string;
      let extractedContent: string;

      if (request.content) {
        documentTitle = 'Direct Input Document';
        extractedContent = request.content;
        documentId = await this.createDocumentRecord({
          title: documentTitle,
          content: extractedContent,
          documentType: request.documentType || 'other',
          language: request.language || 'en',
          userId: request.userId,
          teamId: request.teamId
        });
      } else if (request.url) {
        const fetchResult = await this.fetchDocumentFromUrl(request.url);
        documentTitle = fetchResult.title;
        extractedContent = fetchResult.content;
        documentId = await this.createDocumentRecord({
          title: documentTitle,
          content: extractedContent,
          url: request.url,
          documentType: request.documentType || fetchResult.detectedType || 'other',
          language: request.language || fetchResult.language || 'en',
          userId: request.userId,
          teamId: request.teamId
        });
      } else if (request.fileBuffer && request.filename) {
        const extractionResult = await textProcessor.extractFromBuffer(
          request.fileBuffer,
          request.filename,
          {
            documentType: request.documentType,
            language: request.language
          }
        );
        documentTitle = request.filename;
        extractedContent = extractionResult.content;
        documentId = await this.createDocumentRecord({
          title: documentTitle,
          content: extractedContent,
          documentType: request.documentType || extractionResult.metadata.documentType,
          language: request.language || extractionResult.metadata.language || 'en',
          userId: request.userId,
          teamId: request.teamId
        });
      } else {
        throw new Error('Invalid input configuration');
      }

      // Create analysis record
      const analysis = await this.analysisService.createAnalysis({
        documentId,
        userId: request.userId
      });

      // Create response object
      const response: UnifiedAnalysisResponse = {
        id: analysis.id,
        status: 'pending',
        documentId,
        createdAt: analysis.createdAt,
        quota: {
          used: quotaStatus.used + 1,
          limit: quotaStatus.limit,
          resetDate: quotaStatus.resetDate
        }
      };

      // Queue the analysis job
      const priority = this.getPriorityScore(request.priority || 'normal');
      const jobData = {
        analysisId: analysis.id,
        documentId,
        userId: request.userId,
        content: extractedContent,
        documentType: request.documentType || 'other',
        language: request.language || 'en',
        options: request.options || {}
      };

      // Add to processing queue
      const processingPromise = this.processAnalysisAsync(analysis.id, jobData);
      this.processingQueue.set(analysis.id, processingPromise);

      // Add to queue manager
      await queueManager.addJob('unified-analysis', analysis.id, jobData, {
        priority,
        attempts: 3,
        removeOnComplete: 10,
        removeOnFail: 5
      });

      // Update quota
      await this.updateUserQuota(request.userId);

      // Set up change monitoring if requested
      if (request.options?.enableChangeMonitoring && request.url) {
        await this.enableChangeMonitoring(analysis.id, request.url, request.userId);
        response.changeAlert = {
          enabled: true
        };
      }

      // Send initial WebSocket notification
      if (this.wsService) {
        this.wsService.sendToUser(request.userId, 'analysis_created', {
          analysisId: analysis.id,
          documentId,
          status: 'pending'
        });
      }

      logger.info('Analysis created successfully', {
        analysisId: analysis.id,
        documentId,
        userId: request.userId,
        priority: request.priority
      });

      return response;

    } catch (error) {
      logger.error('Failed to create analysis', {
        error: error.message,
        userId: request.userId
      });
      throw error;
    }
  }

  async getAnalysis(analysisId: string, userId: string): Promise<UnifiedAnalysisResponse | null> {
    try {
      // Check cache first
      const cacheKey = `unified_analysis:${analysisId}`;
      const cached = await analysisCache.get<UnifiedAnalysisResponse>(cacheKey);
      if (cached) {
        logger.debug('Analysis found in cache', { analysisId });
        return cached;
      }

      // Get from database
      const analysis = await this.analysisService.getAnalysisById(analysisId, userId);
      if (!analysis) {
        return null;
      }

      // Build response
      const response: UnifiedAnalysisResponse = {
        id: analysis.id,
        status: analysis.status as any,
        documentId: analysis.documentId,
        createdAt: analysis.createdAt,
        completedAt: analysis.completedAt || undefined
      };

      // Add results if completed
      if (analysis.status === 'completed') {
        response.results = {
          analysisId: analysis.id,
          documentId: analysis.documentId,
          status: 'completed',
          overallRiskScore: analysis.overallRiskScore || 0,
          riskLevel: this.getRiskLevel(analysis.overallRiskScore || 0),
          executiveSummary: analysis.executiveSummary || '',
          keyFindings: analysis.keyFindings || [],
          recommendations: analysis.recommendations || [],
          findings: analysis.findings || [],
          processingTimeMs: analysis.processingTimeMs || 0,
          modelUsed: analysis.modelUsed || 'unknown',
          confidence: 0.8, // Default confidence
          categoryScores: {},
          patternMatches: { total: 0, byCategory: {}, bySeverity: {} },
          extractionQuality: {
            textLength: 0,
            wordCount: 0,
            chunksProcessed: 0,
            languageDetected: 'unknown',
            documentTypeDetected: 'unknown'
          }
        };
      }

      // Add progress info if processing
      if (analysis.status === 'pending' || analysis.status === 'processing') {
        const queueInfo = await this.getQueueInfo(analysisId);
        response.queuePosition = queueInfo.position;
        response.progress = queueInfo.progress;
      }

      // Add quota info
      const quotaStatus = await this.checkUserQuota(userId);
      response.quota = {
        used: quotaStatus.used,
        limit: quotaStatus.limit,
        resetDate: quotaStatus.resetDate
      };

      // Cache if completed
      if (analysis.status === 'completed') {
        await analysisCache.set(cacheKey, response, 3600); // Cache for 1 hour
      }

      return response;

    } catch (error) {
      logger.error('Failed to get analysis', {
        error: error.message,
        analysisId,
        userId
      });
      throw error;
    }
  }

  async getUserAnalyses(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      documentType?: string;
      sortBy?: 'created' | 'completed' | 'risk_score';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{
    analyses: UnifiedAnalysisResponse[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    stats: AnalysisStats;
  }> {
    try {
      const { page = 1, limit = 20 } = options;
      
      // Get analyses from service
      const result = await this.analysisService.getUserAnalyses(userId, {
        page,
        limit,
        status: options.status
      });

      // Convert to unified response format
      const analyses: UnifiedAnalysisResponse[] = result.analyses.map(analysis => ({
        id: analysis.id,
        status: analysis.status as any,
        documentId: analysis.documentId,
        createdAt: analysis.createdAt,
        completedAt: analysis.completedAt || undefined
      }));

      // Get user stats
      const stats = await this.getUserAnalysisStats(userId);

      return {
        analyses,
        pagination: result.pagination,
        stats
      };

    } catch (error) {
      logger.error('Failed to get user analyses', {
        error: error.message,
        userId,
        options
      });
      throw error;
    }
  }

  async cancelAnalysis(analysisId: string, userId: string): Promise<boolean> {
    try {
      const analysis = await this.analysisService.getAnalysisById(analysisId, userId);
      if (!analysis) {
        throw new Error('Analysis not found');
      }

      if (analysis.status === 'completed' || analysis.status === 'failed') {
        throw new Error('Cannot cancel completed or failed analysis');
      }

      // Remove from queue
      await queueManager.removeJob('unified-analysis', analysisId);
      
      // Remove from processing queue
      this.processingQueue.delete(analysisId);

      // Update status
      await this.analysisService.updateAnalysisStatus(analysisId, 'failed', 'Cancelled by user');

      // Send WebSocket notification
      if (this.wsService) {
        this.wsService.sendToUser(userId, 'analysis_cancelled', {
          analysisId,
          status: 'cancelled'
        });
      }

      logger.info('Analysis cancelled successfully', { analysisId, userId });
      return true;

    } catch (error) {
      logger.error('Failed to cancel analysis', {
        error: error.message,
        analysisId,
        userId
      });
      throw error;
    }
  }

  private async processAnalysisAsync(
    analysisId: string,
    jobData: any
  ): Promise<UnifiedAnalysisResponse> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting analysis processing', { analysisId });

      // Update status to processing
      await this.analysisService.updateAnalysisStatus(analysisId, 'processing');

      // Send progress updates via WebSocket
      const sendProgress = (step: string, percentage: number, message: string) => {
        if (this.wsService) {
          this.wsService.sendToUser(jobData.userId, 'analysis_progress', {
            analysisId,
            progress: { step, percentage, message }
          });
        }
      };

      // Create analysis request
      const analysisRequest: AnalysisRequest = {
        content: jobData.content,
        documentId: jobData.documentId,
        analysisId,
        userId: jobData.userId,
        options: jobData.options
      };

      // Perform enhanced analysis with progress tracking
      const result = await enhancedAnalysisEngine.analyzeDocumentWithProgress(
        analysisRequest,
        sendProgress
      );

      // Save results to database
      await this.analysisService.saveAnalysisResults(analysisId, {
        overallRiskScore: result.overallRiskScore,
        executiveSummary: result.executiveSummary,
        keyFindings: result.keyFindings,
        recommendations: result.recommendations,
        findings: result.findings.map(f => ({
          category: f.category,
          title: f.title,
          description: f.description,
          severity: f.severity,
          confidenceScore: f.confidenceScore,
          textExcerpt: f.textExcerpt,
          positionStart: f.positionStart,
          positionEnd: f.positionEnd,
          recommendation: f.recommendation,
          impactExplanation: f.impactExplanation,
          patternId: f.patternId
        })),
        processingTimeMs: Date.now() - startTime,
        modelUsed: result.modelUsed
      });

      // Generate report if requested
      if (jobData.options.generateReport) {
        await this.generateAnalysisReport(analysisId, result);
      }

      // Send completion notification
      if (this.wsService) {
        this.wsService.sendToUser(jobData.userId, 'analysis_completed', {
          analysisId,
          status: 'completed',
          overallRiskScore: result.overallRiskScore,
          findingsCount: result.findings.length
        });
      }

      // Send webhook if configured
      if (jobData.options.webhookUrl) {
        await this.sendWebhook(jobData.options.webhookUrl, {
          analysisId,
          status: 'completed',
          results: result
        });
      }

      // Remove from processing queue
      this.processingQueue.delete(analysisId);

      logger.info('Analysis processing completed', {
        analysisId,
        processingTime: Date.now() - startTime,
        overallRiskScore: result.overallRiskScore,
        findingsCount: result.findings.length
      });

      return {
        id: analysisId,
        status: 'completed',
        documentId: jobData.documentId,
        createdAt: new Date(),
        completedAt: new Date(),
        results: result
      };

    } catch (error) {
      logger.error('Analysis processing failed', {
        error: error.message,
        analysisId,
        processingTime: Date.now() - startTime
      });

      // Update status to failed
      await this.analysisService.updateAnalysisStatus(analysisId, 'failed', error.message);

      // Send failure notification
      if (this.wsService) {
        this.wsService.sendToUser(jobData.userId, 'analysis_failed', {
          analysisId,
          status: 'failed',
          error: error.message
        });
      }

      // Remove from processing queue
      this.processingQueue.delete(analysisId);

      throw error;
    }
  }

  private async createDocumentRecord(data: {
    title: string;
    content: string;
    url?: string;
    documentType: string;
    language: string;
    userId: string;
    teamId?: string;
  }): Promise<string> {
    const document = await prisma.document.create({
      data: {
        title: data.title,
        content: data.content,
        url: data.url,
        documentType: data.documentType,
        language: data.language,
        userId: data.userId,
        teamId: data.teamId,
        contentHash: crypto.createHash('sha256').update(data.content).digest('hex'),
        wordCount: data.content.split(/\s+/).length,
      }
    });

    return document.id;
  }

  private async fetchDocumentFromUrl(url: string): Promise<{
    title: string;
    content: string;
    detectedType?: string;
    language?: string;
  }> {
    try {
      const extractionResult = await textProcessor.extractFromURL(url);
      
      return {
        title: extractionResult.metadata.title || new URL(url).hostname,
        content: extractionResult.content,
        detectedType: extractionResult.metadata.documentType,
        language: extractionResult.metadata.language
      };
    } catch (error) {
      logger.error('Failed to fetch document from URL', { error: error.message, url });
      throw new Error(`Failed to fetch document from URL: ${error.message}`);
    }
  }

  private async checkUserQuota(userId: string): Promise<{
    allowed: boolean;
    used: number;
    limit: number;
    resetDate: Date;
  }> {
    // Get user subscription info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Default quota limits by plan
    const quotaLimits = {
      free: 5,
      starter: 100,
      professional: 500,
      team: 1000,
      enterprise: 10000
    };

    const planType = user.subscription?.planType || 'free';
    const limit = quotaLimits[planType] || quotaLimits.free;

    // Get usage for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const used = await prisma.documentAnalysis.count({
      where: {
        userId,
        createdAt: {
          gte: startOfMonth
        }
      }
    });

    const resetDate = new Date(startOfMonth);
    resetDate.setMonth(resetDate.getMonth() + 1);

    return {
      allowed: used < limit,
      used,
      limit,
      resetDate
    };
  }

  private async updateUserQuota(userId: string): Promise<void> {
    // Update usage tracking
    const cacheKey = `quota:${userId}`;
    const current = await analysisCache.get<number>(cacheKey) || 0;
    await analysisCache.set(cacheKey, current + 1, 86400); // Cache for 24 hours
  }

  private getPriorityScore(priority: string): number {
    const scores = { low: 1, normal: 5, high: 10 };
    return scores[priority] || 5;
  }

  private getRiskLevel(score: number): 'minimal' | 'low' | 'moderate' | 'high' | 'critical' {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'moderate';
    if (score >= 20) return 'low';
    return 'minimal';
  }

  private async getQueueInfo(analysisId: string): Promise<{
    position: number;
    progress?: { percentage: number; stage: string; message: string };
  }> {
    try {
      const queueStats = await queueManager.getQueueStats('unified-analysis');
      const jobStatus = await queueManager.getJobStatus('unified-analysis', analysisId);
      
      return {
        position: queueStats.waiting || 0,
        progress: jobStatus?.progress
      };
    } catch (error) {
      logger.warn('Failed to get queue info', { error: error.message, analysisId });
      return { position: 0 };
    }
  }

  private async getUserAnalysisStats(userId: string): Promise<AnalysisStats> {
    try {
      const stats = await this.analysisService.getAnalysisStats(userId);
      
      // Get additional stats
      const [topCategories, riskDistribution, recentTrends] = await Promise.all([
        this.getTopCategories(userId),
        this.getRiskDistribution(userId),
        this.getRecentTrends(userId)
      ]);

      return {
        total: stats.totalAnalyses,
        completed: stats.completedAnalyses,
        pending: stats.pendingAnalyses,
        failed: stats.failedAnalyses,
        avgRiskScore: stats.avgRiskScore,
        avgProcessingTime: 30000, // Default 30 seconds
        topCategories,
        riskDistribution,
        recentTrends
      };
    } catch (error) {
      logger.error('Failed to get user analysis stats', { error: error.message, userId });
      
      // Return default stats
      return {
        total: 0,
        completed: 0,
        pending: 0,
        failed: 0,
        avgRiskScore: 0,
        avgProcessingTime: 0,
        topCategories: [],
        riskDistribution: {},
        recentTrends: []
      };
    }
  }

  private async getTopCategories(userId: string): Promise<Array<{ category: string; count: number }>> {
    try {
      const findings = await prisma.analysisFinding.groupBy({
        by: ['category'],
        where: {
          analysis: {
            userId,
            status: 'completed'
          }
        },
        _count: {
          category: true
        },
        orderBy: {
          _count: {
            category: 'desc'
          }
        },
        take: 10
      });

      return findings.map(f => ({
        category: f.category,
        count: f._count.category
      }));
    } catch (error) {
      logger.warn('Failed to get top categories', { error: error.message, userId });
      return [];
    }
  }

  private async getRiskDistribution(userId: string): Promise<{ [level: string]: number }> {
    try {
      const analyses = await prisma.documentAnalysis.findMany({
        where: {
          userId,
          status: 'completed',
          overallRiskScore: { not: null }
        },
        select: { overallRiskScore: true }
      });

      const distribution = { minimal: 0, low: 0, moderate: 0, high: 0, critical: 0 };
      
      for (const analysis of analyses) {
        const score = analysis.overallRiskScore?.toNumber() || 0;
        const level = this.getRiskLevel(score);
        distribution[level]++;
      }

      return distribution;
    } catch (error) {
      logger.warn('Failed to get risk distribution', { error: error.message, userId });
      return {};
    }
  }

  private async getRecentTrends(userId: string): Promise<Array<{
    date: string;
    count: number;
    avgRisk: number;
  }>> {
    try {
      // Get last 30 days of data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const analyses = await prisma.documentAnalysis.findMany({
        where: {
          userId,
          status: 'completed',
          completedAt: { gte: thirtyDaysAgo }
        },
        select: {
          completedAt: true,
          overallRiskScore: true
        },
        orderBy: { completedAt: 'asc' }
      });

      // Group by date
      const dailyStats = new Map<string, { count: number; totalRisk: number }>();
      
      for (const analysis of analyses) {
        if (!analysis.completedAt) continue;
        
        const date = analysis.completedAt.toISOString().split('T')[0];
        const risk = analysis.overallRiskScore?.toNumber() || 0;
        
        const existing = dailyStats.get(date) || { count: 0, totalRisk: 0 };
        dailyStats.set(date, {
          count: existing.count + 1,
          totalRisk: existing.totalRisk + risk
        });
      }

      return Array.from(dailyStats.entries()).map(([date, stats]) => ({
        date,
        count: stats.count,
        avgRisk: stats.count > 0 ? stats.totalRisk / stats.count : 0
      }));
    } catch (error) {
      logger.warn('Failed to get recent trends', { error: error.message, userId });
      return [];
    }
  }

  private async enableChangeMonitoring(analysisId: string, url: string, userId: string): Promise<void> {
    try {
      await prisma.documentChangeMonitor.create({
        data: {
          analysisId,
          url,
          userId,
          enabled: true,
          checkInterval: 86400, // Check daily
          lastCheck: new Date(),
          nextCheck: new Date(Date.now() + 86400000) // 24 hours from now
        }
      });

      logger.info('Change monitoring enabled', { analysisId, url, userId });
    } catch (error) {
      logger.error('Failed to enable change monitoring', {
        error: error.message,
        analysisId,
        url,
        userId
      });
    }
  }

  private async generateAnalysisReport(analysisId: string, result: EnhancedAnalysisResult): Promise<void> {
    try {
      // This would integrate with a report generation service
      logger.info('Report generation requested', { analysisId });
      // Implementation would depend on report generation service
    } catch (error) {
      logger.error('Failed to generate report', { error: error.message, analysisId });
    }
  }

  private async sendWebhook(url: string, data: any): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'FinePrintAI-Webhook/1.0'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status ${response.status}`);
      }

      logger.info('Webhook sent successfully', { url, status: response.status });
    } catch (error) {
      logger.error('Failed to send webhook', { error: error.message, url });
    }
  }
}

// Singleton instance
export const unifiedAnalysisEngine = new UnifiedAnalysisEngine();