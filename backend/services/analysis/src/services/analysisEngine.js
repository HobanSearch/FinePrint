"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unifiedAnalysisEngine = exports.UnifiedAnalysisEngine = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const client_1 = require("@prisma/client");
const websocket_1 = require("@fineprintai/websocket");
const notification_1 = require("@fineprintai/notification");
const enhancedAnalysis_1 = require("./enhancedAnalysis");
const textProcessor_1 = require("./textProcessor");
const embeddings_1 = require("./embeddings");
const analysis_1 = require("./analysis");
const crypto_1 = __importDefault(require("crypto"));
const logger = (0, logger_1.createServiceLogger)('unified-analysis-engine');
const prisma = new client_1.PrismaClient();
class UnifiedAnalysisEngine {
    analysisService;
    wsService;
    notificationService;
    processingQueue = new Map();
    constructor() {
        this.analysisService = new analysis_1.AnalysisService();
    }
    async initialize() {
        logger.info('Initializing Unified Analysis Engine');
        try {
            await Promise.all([
                enhancedAnalysis_1.enhancedAnalysisEngine.initialize(),
                embeddings_1.embeddingService.initialize()
            ]);
            try {
                this.wsService = new websocket_1.WebSocketService();
                this.notificationService = new notification_1.NotificationService();
            }
            catch (error) {
                logger.warn('Optional services not available', { error: error.message });
            }
            logger.info('Unified Analysis Engine initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize Unified Analysis Engine', { error: error.message });
            throw error;
        }
    }
    async createAnalysis(request) {
        const analysisId = crypto_1.default.randomUUID();
        logger.info('Creating new unified analysis', {
            analysisId,
            userId: request.userId,
            hasContent: !!request.content,
            hasUrl: !!request.url,
            hasFile: !!request.fileBuffer,
            documentType: request.documentType
        });
        try {
            const quotaStatus = await this.checkUserQuota(request.userId);
            if (!quotaStatus.allowed) {
                throw new Error(`Analysis quota exceeded. Limit: ${quotaStatus.limit}, Used: ${quotaStatus.used}`);
            }
            if (!request.content && !request.url && !request.fileBuffer) {
                throw new Error('No content source provided (content, URL, or file required)');
            }
            let documentId;
            let documentTitle;
            let extractedContent;
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
            }
            else if (request.url) {
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
            }
            else if (request.fileBuffer && request.filename) {
                const extractionResult = await textProcessor_1.textProcessor.extractFromBuffer(request.fileBuffer, request.filename, {
                    documentType: request.documentType,
                    language: request.language
                });
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
            }
            else {
                throw new Error('Invalid input configuration');
            }
            const analysis = await this.analysisService.createAnalysis({
                documentId,
                userId: request.userId
            });
            const response = {
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
            const processingPromise = this.processAnalysisAsync(analysis.id, jobData);
            this.processingQueue.set(analysis.id, processingPromise);
            await cache_1.queueManager.addJob('unified-analysis', analysis.id, jobData, {
                priority,
                attempts: 3,
                removeOnComplete: 10,
                removeOnFail: 5
            });
            await this.updateUserQuota(request.userId);
            if (request.options?.enableChangeMonitoring && request.url) {
                await this.enableChangeMonitoring(analysis.id, request.url, request.userId);
                response.changeAlert = {
                    enabled: true
                };
            }
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
        }
        catch (error) {
            logger.error('Failed to create analysis', {
                error: error.message,
                userId: request.userId
            });
            throw error;
        }
    }
    async getAnalysis(analysisId, userId) {
        try {
            const cacheKey = `unified_analysis:${analysisId}`;
            const cached = await cache_1.analysisCache.get(cacheKey);
            if (cached) {
                logger.debug('Analysis found in cache', { analysisId });
                return cached;
            }
            const analysis = await this.analysisService.getAnalysisById(analysisId, userId);
            if (!analysis) {
                return null;
            }
            const response = {
                id: analysis.id,
                status: analysis.status,
                documentId: analysis.documentId,
                createdAt: analysis.createdAt,
                completedAt: analysis.completedAt || undefined
            };
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
                    confidence: 0.8,
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
            if (analysis.status === 'pending' || analysis.status === 'processing') {
                const queueInfo = await this.getQueueInfo(analysisId);
                response.queuePosition = queueInfo.position;
                response.progress = queueInfo.progress;
            }
            const quotaStatus = await this.checkUserQuota(userId);
            response.quota = {
                used: quotaStatus.used,
                limit: quotaStatus.limit,
                resetDate: quotaStatus.resetDate
            };
            if (analysis.status === 'completed') {
                await cache_1.analysisCache.set(cacheKey, response, 3600);
            }
            return response;
        }
        catch (error) {
            logger.error('Failed to get analysis', {
                error: error.message,
                analysisId,
                userId
            });
            throw error;
        }
    }
    async getUserAnalyses(userId, options = {}) {
        try {
            const { page = 1, limit = 20 } = options;
            const result = await this.analysisService.getUserAnalyses(userId, {
                page,
                limit,
                status: options.status
            });
            const analyses = result.analyses.map(analysis => ({
                id: analysis.id,
                status: analysis.status,
                documentId: analysis.documentId,
                createdAt: analysis.createdAt,
                completedAt: analysis.completedAt || undefined
            }));
            const stats = await this.getUserAnalysisStats(userId);
            return {
                analyses,
                pagination: result.pagination,
                stats
            };
        }
        catch (error) {
            logger.error('Failed to get user analyses', {
                error: error.message,
                userId,
                options
            });
            throw error;
        }
    }
    async cancelAnalysis(analysisId, userId) {
        try {
            const analysis = await this.analysisService.getAnalysisById(analysisId, userId);
            if (!analysis) {
                throw new Error('Analysis not found');
            }
            if (analysis.status === 'completed' || analysis.status === 'failed') {
                throw new Error('Cannot cancel completed or failed analysis');
            }
            await cache_1.queueManager.removeJob('unified-analysis', analysisId);
            this.processingQueue.delete(analysisId);
            await this.analysisService.updateAnalysisStatus(analysisId, 'failed', 'Cancelled by user');
            if (this.wsService) {
                this.wsService.sendToUser(userId, 'analysis_cancelled', {
                    analysisId,
                    status: 'cancelled'
                });
            }
            logger.info('Analysis cancelled successfully', { analysisId, userId });
            return true;
        }
        catch (error) {
            logger.error('Failed to cancel analysis', {
                error: error.message,
                analysisId,
                userId
            });
            throw error;
        }
    }
    async processAnalysisAsync(analysisId, jobData) {
        const startTime = Date.now();
        try {
            logger.info('Starting analysis processing', { analysisId });
            await this.analysisService.updateAnalysisStatus(analysisId, 'processing');
            const sendProgress = (step, percentage, message) => {
                if (this.wsService) {
                    this.wsService.sendToUser(jobData.userId, 'analysis_progress', {
                        analysisId,
                        progress: { step, percentage, message }
                    });
                }
            };
            const analysisRequest = {
                content: jobData.content,
                documentId: jobData.documentId,
                analysisId,
                userId: jobData.userId,
                options: jobData.options
            };
            const result = await enhancedAnalysis_1.enhancedAnalysisEngine.analyzeDocumentWithProgress(analysisRequest, sendProgress);
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
            if (jobData.options.generateReport) {
                await this.generateAnalysisReport(analysisId, result);
            }
            if (this.wsService) {
                this.wsService.sendToUser(jobData.userId, 'analysis_completed', {
                    analysisId,
                    status: 'completed',
                    overallRiskScore: result.overallRiskScore,
                    findingsCount: result.findings.length
                });
            }
            if (jobData.options.webhookUrl) {
                await this.sendWebhook(jobData.options.webhookUrl, {
                    analysisId,
                    status: 'completed',
                    results: result
                });
            }
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
        }
        catch (error) {
            logger.error('Analysis processing failed', {
                error: error.message,
                analysisId,
                processingTime: Date.now() - startTime
            });
            await this.analysisService.updateAnalysisStatus(analysisId, 'failed', error.message);
            if (this.wsService) {
                this.wsService.sendToUser(jobData.userId, 'analysis_failed', {
                    analysisId,
                    status: 'failed',
                    error: error.message
                });
            }
            this.processingQueue.delete(analysisId);
            throw error;
        }
    }
    async createDocumentRecord(data) {
        const document = await prisma.document.create({
            data: {
                title: data.title,
                content: data.content,
                url: data.url,
                documentType: data.documentType,
                language: data.language,
                userId: data.userId,
                teamId: data.teamId,
                contentHash: crypto_1.default.createHash('sha256').update(data.content).digest('hex'),
                wordCount: data.content.split(/\s+/).length,
            }
        });
        return document.id;
    }
    async fetchDocumentFromUrl(url) {
        try {
            const extractionResult = await textProcessor_1.textProcessor.extractFromURL(url);
            return {
                title: extractionResult.metadata.title || new URL(url).hostname,
                content: extractionResult.content,
                detectedType: extractionResult.metadata.documentType,
                language: extractionResult.metadata.language
            };
        }
        catch (error) {
            logger.error('Failed to fetch document from URL', { error: error.message, url });
            throw new Error(`Failed to fetch document from URL: ${error.message}`);
        }
    }
    async checkUserQuota(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true }
        });
        if (!user) {
            throw new Error('User not found');
        }
        const quotaLimits = {
            free: 5,
            starter: 100,
            professional: 500,
            team: 1000,
            enterprise: 10000
        };
        const planType = user.subscription?.planType || 'free';
        const limit = quotaLimits[planType] || quotaLimits.free;
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
    async updateUserQuota(userId) {
        const cacheKey = `quota:${userId}`;
        const current = await cache_1.analysisCache.get(cacheKey) || 0;
        await cache_1.analysisCache.set(cacheKey, current + 1, 86400);
    }
    getPriorityScore(priority) {
        const scores = { low: 1, normal: 5, high: 10 };
        return scores[priority] || 5;
    }
    getRiskLevel(score) {
        if (score >= 80)
            return 'critical';
        if (score >= 60)
            return 'high';
        if (score >= 40)
            return 'moderate';
        if (score >= 20)
            return 'low';
        return 'minimal';
    }
    async getQueueInfo(analysisId) {
        try {
            const queueStats = await cache_1.queueManager.getQueueStats('unified-analysis');
            const jobStatus = await cache_1.queueManager.getJobStatus('unified-analysis', analysisId);
            return {
                position: queueStats.waiting || 0,
                progress: jobStatus?.progress
            };
        }
        catch (error) {
            logger.warn('Failed to get queue info', { error: error.message, analysisId });
            return { position: 0 };
        }
    }
    async getUserAnalysisStats(userId) {
        try {
            const stats = await this.analysisService.getAnalysisStats(userId);
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
                avgProcessingTime: 30000,
                topCategories,
                riskDistribution,
                recentTrends
            };
        }
        catch (error) {
            logger.error('Failed to get user analysis stats', { error: error.message, userId });
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
    async getTopCategories(userId) {
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
        }
        catch (error) {
            logger.warn('Failed to get top categories', { error: error.message, userId });
            return [];
        }
    }
    async getRiskDistribution(userId) {
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
        }
        catch (error) {
            logger.warn('Failed to get risk distribution', { error: error.message, userId });
            return {};
        }
    }
    async getRecentTrends(userId) {
        try {
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
            const dailyStats = new Map();
            for (const analysis of analyses) {
                if (!analysis.completedAt)
                    continue;
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
        }
        catch (error) {
            logger.warn('Failed to get recent trends', { error: error.message, userId });
            return [];
        }
    }
    async enableChangeMonitoring(analysisId, url, userId) {
        try {
            await prisma.documentChangeMonitor.create({
                data: {
                    analysisId,
                    url,
                    userId,
                    enabled: true,
                    checkInterval: 86400,
                    lastCheck: new Date(),
                    nextCheck: new Date(Date.now() + 86400000)
                }
            });
            logger.info('Change monitoring enabled', { analysisId, url, userId });
        }
        catch (error) {
            logger.error('Failed to enable change monitoring', {
                error: error.message,
                analysisId,
                url,
                userId
            });
        }
    }
    async generateAnalysisReport(analysisId, result) {
        try {
            logger.info('Report generation requested', { analysisId });
        }
        catch (error) {
            logger.error('Failed to generate report', { error: error.message, analysisId });
        }
    }
    async sendWebhook(url, data) {
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
        }
        catch (error) {
            logger.error('Failed to send webhook', { error: error.message, url });
        }
    }
}
exports.UnifiedAnalysisEngine = UnifiedAnalysisEngine;
exports.unifiedAnalysisEngine = new UnifiedAnalysisEngine();
//# sourceMappingURL=analysisEngine.js.map