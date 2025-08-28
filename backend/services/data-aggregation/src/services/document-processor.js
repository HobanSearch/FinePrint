"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentProcessorService = void 0;
const bull_1 = __importDefault(require("bull"));
const logger_1 = require("../utils/logger");
const ollama_1 = require("../../../shared/services/ollama");
const patterns_1 = require("../../../analysis/src/services/patterns");
const riskScoring_1 = require("../../../analysis/src/services/riskScoring");
class DocumentProcessorService {
    prisma;
    processingQueue;
    ollamaService;
    patternService;
    riskService;
    isRunning = false;
    concurrency = 3;
    constructor(prisma) {
        this.prisma = prisma;
        this.ollamaService = new ollama_1.OllamaService();
        this.patternService = new patterns_1.PatternDetectionService();
        this.riskService = new riskScoring_1.RiskScoringService();
        this.processingQueue = new bull_1.default('document-processing', {
            redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
            },
            defaultJobOptions: {
                removeOnComplete: 100,
                removeOnFail: 50,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
            },
        });
        this.setupQueueHandlers();
    }
    async startProcessingQueue() {
        if (this.isRunning) {
            logger_1.logger.warn('Document processor is already running');
            return;
        }
        this.isRunning = true;
        this.processingQueue.process(this.concurrency, this.processDocument.bind(this));
        setInterval(async () => {
            await this.queuePendingDocuments();
        }, 5 * 60 * 1000);
        logger_1.logger.info('Document processing queue started');
        await this.queuePendingDocuments();
    }
    async stop() {
        this.isRunning = false;
        if (this.processingQueue) {
            await this.processingQueue.close();
        }
        logger_1.logger.info('Document processor stopped');
    }
    setupQueueHandlers() {
        this.processingQueue.on('completed', (job, result) => {
            logger_1.logger.info(`Document processing completed: ${job.data.documentId}`, {
                processingTime: result.processingTime,
                riskScore: result.riskScore,
            });
        });
        this.processingQueue.on('failed', (job, error) => {
            logger_1.logger.error(`Document processing failed: ${job.data.documentId}`, error);
        });
        this.processingQueue.on('stalled', (job) => {
            logger_1.logger.warn(`Document processing stalled: ${job.data.documentId}`);
        });
        this.processingQueue.on('error', (error) => {
            logger_1.logger.error('Queue error:', error);
        });
    }
    async processDocument(job) {
        const startTime = Date.now();
        const { documentId, processingType } = job.data;
        try {
            logger_1.logger.info(`Starting document processing: ${documentId} (${processingType})`);
            const document = await this.prisma.aggregatedDocument.findUnique({
                where: { id: documentId },
            });
            if (!document) {
                throw new Error(`Document not found: ${documentId}`);
            }
            const analysis = await this.prisma.documentAnalysis.create({
                data: {
                    documentId: document.id,
                    status: 'processing',
                    startedAt: new Date(),
                    processingType,
                    metadata: {
                        documentType: document.documentType,
                        websiteName: document.websiteName,
                        wordCount: document.wordCount,
                    },
                },
            });
            const analysisResult = await this.analyzeDocument(document, analysis.id);
            await this.prisma.documentAnalysis.update({
                where: { id: analysis.id },
                data: {
                    status: 'completed',
                    completedAt: new Date(),
                    riskScore: analysisResult.riskScore,
                    patterns: analysisResult.patterns,
                    insights: analysisResult.insights,
                    processingTimeMs: Date.now() - startTime,
                },
            });
            await this.prisma.aggregatedDocument.update({
                where: { id: documentId },
                data: {
                    lastAnalyzed: new Date(),
                    latestRiskScore: analysisResult.riskScore,
                    analysisCount: { increment: 1 },
                },
            });
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
        }
        catch (error) {
            logger_1.logger.error(`Error processing document ${documentId}:`, error);
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
                        processingTimeMs: Date.now() - startTime,
                    },
                });
            }
            catch (updateError) {
                logger_1.logger.error('Failed to update analysis with error:', updateError);
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
    async analyzeDocument(document, analysisId) {
        const content = document.content;
        const documentType = document.documentType;
        const patterns = await this.patternService.analyzeDocument({
            content,
            documentType,
            metadata: {
                websiteName: document.websiteName,
                url: document.url,
                title: document.title,
            },
        });
        const riskScore = await this.riskService.calculateRiskScore({
            patterns,
            documentType,
            content,
            metadata: {
                websiteName: document.websiteName,
                wordCount: document.wordCount,
            },
        });
        const insights = await this.generateAIInsights(content, patterns, documentType);
        return {
            riskScore,
            patterns,
            insights,
        };
    }
    async generateAIInsights(content, patterns, documentType) {
        try {
            const prompt = this.buildInsightsPrompt(content, patterns, documentType);
            const response = await this.ollamaService.generateResponse(prompt, {
                model: 'llama2',
                max_tokens: 1000,
                temperature: 0.3,
            });
            return this.parseInsightsResponse(response);
        }
        catch (error) {
            logger_1.logger.error('Error generating AI insights:', error);
            return [];
        }
    }
    buildInsightsPrompt(content, patterns, documentType) {
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
    parseInsightsResponse(response) {
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
        }
        catch (error) {
            logger_1.logger.error('Error parsing AI insights:', error);
            return [];
        }
    }
    async generateComparisonAnalysis(documentId, currentAnalysisId) {
        try {
            const previousAnalysis = await this.prisma.documentAnalysis.findFirst({
                where: {
                    documentId,
                    status: 'completed',
                    id: { not: currentAnalysisId },
                },
                orderBy: { completedAt: 'desc' },
            });
            if (!previousAnalysis) {
                logger_1.logger.info('No previous analysis found for comparison');
                return;
            }
            const currentAnalysis = await this.prisma.documentAnalysis.findUnique({
                where: { id: currentAnalysisId },
            });
            if (!currentAnalysis) {
                logger_1.logger.error('Current analysis not found');
                return;
            }
            const comparison = await this.generateComparisonInsights(previousAnalysis, currentAnalysis);
            await this.prisma.documentComparison.create({
                data: {
                    documentId,
                    previousAnalysisId: previousAnalysis.id,
                    currentAnalysisId: currentAnalysisId,
                    riskScoreChange: (currentAnalysis.riskScore || 0) - (previousAnalysis.riskScore || 0),
                    changesDetected: comparison.changesDetected,
                    significantChanges: comparison.significantChanges,
                    newPatterns: comparison.newPatterns,
                    removedPatterns: comparison.removedPatterns,
                    summary: comparison.summary,
                    createdAt: new Date(),
                },
            });
            logger_1.logger.info(`Comparison analysis generated for document ${documentId}`);
        }
        catch (error) {
            logger_1.logger.error('Error generating comparison analysis:', error);
        }
    }
    async generateComparisonInsights(previousAnalysis, currentAnalysis) {
        const previousPatterns = previousAnalysis.patterns || [];
        const currentPatterns = currentAnalysis.patterns || [];
        const newPatterns = currentPatterns.filter((current) => !previousPatterns.some((prev) => prev.type === current.type));
        const removedPatterns = previousPatterns.filter((prev) => !currentPatterns.some((current) => current.type === prev.type));
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
                patterns: newPatterns.map((p) => p.type),
            });
        }
        if (removedPatterns.length > 0) {
            significantChanges.push({
                type: 'removed_patterns',
                count: removedPatterns.length,
                patterns: removedPatterns.map((p) => p.type),
            });
        }
        const summary = this.generateComparisonSummary(riskScoreChange, newPatterns, removedPatterns, significantChanges);
        return {
            changesDetected: significantChanges.length > 0 || newPatterns.length > 0 || removedPatterns.length > 0,
            significantChanges,
            newPatterns,
            removedPatterns,
            summary,
        };
    }
    generateComparisonSummary(riskScoreChange, newPatterns, removedPatterns, significantChanges) {
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
    async queuePendingDocuments() {
        try {
            const unprocessedDocs = await this.prisma.aggregatedDocument.findMany({
                where: {
                    lastAnalyzed: null,
                },
                take: 50,
                orderBy: { crawledAt: 'desc' },
            });
            const reprocessDocs = await this.prisma.aggregatedDocument.findMany({
                where: {
                    lastAnalyzed: { not: null },
                    crawledAt: { gt: this.prisma.aggregatedDocument.fields.lastAnalyzed },
                },
                take: 25,
                orderBy: { crawledAt: 'desc' },
            });
            for (const doc of unprocessedDocs) {
                await this.queueProcessingJob({
                    documentId: doc.id,
                    priority: this.getPriority(doc.websiteName),
                    processingType: 'initial',
                });
            }
            for (const doc of reprocessDocs) {
                await this.queueProcessingJob({
                    documentId: doc.id,
                    priority: this.getPriority(doc.websiteName),
                    processingType: 'reprocess',
                });
            }
            if (unprocessedDocs.length > 0 || reprocessDocs.length > 0) {
                logger_1.logger.info(`Queued ${unprocessedDocs.length + reprocessDocs.length} documents for processing`);
            }
        }
        catch (error) {
            logger_1.logger.error('Error queuing pending documents:', error);
        }
    }
    async queueProcessingJob(job) {
        const priority = this.getPriorityValue(job.priority);
        await this.processingQueue.add(job, {
            priority,
            delay: job.priority === 'low' ? 60000 : 0,
        });
    }
    getPriorityValue(priority) {
        switch (priority) {
            case 'high': return 1;
            case 'medium': return 2;
            case 'low': return 3;
            default: return 2;
        }
    }
    getPriority(websiteName) {
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
    async getQueueStatus() {
        const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
            this.processingQueue.getWaiting(),
            this.processingQueue.getActive(),
            this.processingQueue.getCompleted(),
            this.processingQueue.getFailed(),
            this.processingQueue.getDelayed(),
            this.processingQueue.getPaused(),
        ]);
        return {
            waiting: waiting.length,
            active: active.length,
            completed: completed.length,
            failed: failed.length,
            delayed: delayed.length,
            paused: paused.length,
        };
    }
    async getProcessingStats(days = 7) {
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
                _avg: { processingTimeMs: true },
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
            avgProcessingTime: avgProcessingTime._avg.processingTimeMs || 0,
            riskScoreDistribution,
            periodDays: days,
        };
    }
    async reprocessDocument(documentId) {
        await this.queueProcessingJob({
            documentId,
            priority: 'high',
            processingType: 'reprocess',
        });
    }
    async getRecentAnalyses(limit = 50) {
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
exports.DocumentProcessorService = DocumentProcessorService;
//# sourceMappingURL=document-processor.js.map