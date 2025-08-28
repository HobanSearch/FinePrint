"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.integrationService = exports.IntegrationService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const modelManager_1 = require("./modelManager");
const textProcessor_1 = require("./textProcessor");
const patterns_1 = require("./patterns");
const embeddings_1 = require("./embeddings");
const riskScoring_1 = require("./riskScoring");
const enhancedAnalysis_1 = require("./enhancedAnalysis");
const queueManager_1 = require("./queueManager");
const progressTracker_1 = require("./progressTracker");
const performanceMonitor_1 = require("./performanceMonitor");
const analysis_1 = require("./analysis");
const logger = (0, logger_1.createServiceLogger)('integration-service');
class IntegrationService {
    config;
    isInitialized = false;
    startTime;
    analysisService;
    healthCheckIntervalId;
    constructor(config = {}) {
        this.config = {
            maxConcurrentJobs: 5,
            cacheEnabled: true,
            monitoringEnabled: true,
            websocketPort: 8001,
            defaultModelPreference: 'balanced',
            enableEmbeddings: true,
            enableProgressTracking: true,
            ...config
        };
        this.startTime = new Date();
        this.analysisService = new analysis_1.AnalysisService();
        logger.info('Integration Service created', { config: this.config });
    }
    async initialize() {
        if (this.isInitialized) {
            logger.warn('Integration Service already initialized');
            return;
        }
        logger.info('Initializing Fine Print AI Analysis System');
        try {
            logger.info('Step 1/8: Initializing Model Manager');
            await modelManager_1.modelManager.initialize();
            logger.info('Step 2/8: Initializing Embedding Service');
            await embeddings_1.embeddingService.initialize();
            logger.info('Step 3/8: Initializing Enhanced Analysis Engine');
            await enhancedAnalysis_1.enhancedAnalysisEngine.initialize();
            logger.info('Step 4/8: Initializing Queue Manager');
            await queueManager_1.queueManager.initialize();
            if (this.config.enableProgressTracking) {
                logger.info('Step 5/8: Starting Progress Tracker');
                await progressTracker_1.progressTracker.start();
            }
            else {
                logger.info('Step 5/8: Progress tracking disabled, skipping');
            }
            if (this.config.monitoringEnabled) {
                logger.info('Step 6/8: Starting Performance Monitor');
                await performanceMonitor_1.performanceMonitor.start();
            }
            else {
                logger.info('Step 6/8: Performance monitoring disabled, skipping');
            }
            logger.info('Step 7/8: Setting up service integrations');
            await this.setupServiceIntegrations();
            logger.info('Step 8/8: Starting health monitoring');
            this.startHealthMonitoring();
            this.isInitialized = true;
            logger.info('Fine Print AI Analysis System initialized successfully', {
                initializationTime: Date.now() - this.startTime.getTime(),
                enabledServices: this.getEnabledServices(),
                config: this.config
            });
        }
        catch (error) {
            logger.error('Failed to initialize Integration Service', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
    async shutdown() {
        if (!this.isInitialized) {
            logger.warn('Integration Service not initialized, nothing to shutdown');
            return;
        }
        logger.info('Shutting down Fine Print AI Analysis System');
        try {
            if (this.healthCheckIntervalId) {
                clearInterval(this.healthCheckIntervalId);
            }
            if (this.config.monitoringEnabled) {
                logger.info('Stopping Performance Monitor');
                await performanceMonitor_1.performanceMonitor.stop();
            }
            if (this.config.enableProgressTracking) {
                logger.info('Stopping Progress Tracker');
                await progressTracker_1.progressTracker.stop();
            }
            logger.info('Stopping Queue Manager');
            await queueManager_1.queueManager.shutdown();
            logger.info('System shutdown completed');
            this.isInitialized = false;
        }
        catch (error) {
            logger.error('Error during shutdown', { error: error.message });
            throw error;
        }
    }
    async analyzeDocument(request) {
        if (!this.isInitialized) {
            throw new Error('Integration Service not initialized');
        }
        logger.info('Starting document analysis', {
            analysisId: request.analysisId,
            documentId: request.documentId,
            userId: request.userId,
            hasContent: !!request.content,
            hasFile: !!request.fileBuffer,
            hasUrl: !!request.url
        });
        try {
            const jobId = await queueManager_1.queueManager.addJob(request.analysisId, request.documentId, request.userId, request, this.determinePriority(request));
            logger.info('Analysis job queued', {
                jobId,
                analysisId: request.analysisId,
                queuePosition: this.getQueuePosition(jobId)
            });
            return jobId;
        }
        catch (error) {
            logger.error('Failed to queue analysis', {
                error: error.message,
                analysisId: request.analysisId
            });
            if (this.config.monitoringEnabled) {
                performanceMonitor_1.performanceMonitor.trackError('queueing', error.message);
            }
            throw error;
        }
    }
    async analyzeBatch(requests) {
        if (!this.isInitialized) {
            throw new Error('Integration Service not initialized');
        }
        logger.info('Starting batch analysis', {
            batchSize: requests.length,
            userIds: [...new Set(requests.map(r => r.userId))]
        });
        try {
            const jobIds = await queueManager_1.queueManager.addBatchJobs({
                jobs: requests,
                maxConcurrency: this.config.maxConcurrentJobs
            });
            logger.info('Batch analysis jobs queued', {
                batchSize: requests.length,
                jobIds: jobIds.length
            });
            return jobIds;
        }
        catch (error) {
            logger.error('Failed to queue batch analysis', {
                error: error.message,
                batchSize: requests.length
            });
            throw error;
        }
    }
    async getAnalysisStatus(analysisId, userId) {
        try {
            const analysis = await this.analysisService.getAnalysisById(analysisId, userId);
            if (analysis) {
                return {
                    status: analysis.status,
                    result: analysis.status === 'completed' ? analysis : undefined,
                    error: analysis.status === 'failed' ? 'Analysis failed' : undefined
                };
            }
            const queueJobs = queueManager_1.queueManager.getJobsByAnalysis(analysisId);
            const userJob = queueJobs.find(job => job.userId === userId);
            if (userJob) {
                const progress = this.config.enableProgressTracking
                    ? progressTracker_1.progressTracker.getAnalysisProgress(analysisId)
                    : null;
                return {
                    status: userJob.status,
                    progress,
                    result: userJob.result,
                    error: userJob.error
                };
            }
            return {
                status: 'failed',
                error: 'Analysis not found'
            };
        }
        catch (error) {
            logger.error('Failed to get analysis status', {
                error: error.message,
                analysisId,
                userId
            });
            return {
                status: 'failed',
                error: error.message
            };
        }
    }
    async cancelAnalysis(analysisId, userId) {
        try {
            const queueJobs = queueManager_1.queueManager.getJobsByAnalysis(analysisId);
            const userJob = queueJobs.find(job => job.userId === userId);
            if (userJob) {
                const cancelled = await queueManager_1.queueManager.cancelJob(userJob.id);
                if (cancelled) {
                    logger.info('Analysis cancelled', { analysisId, userId });
                    return true;
                }
            }
            return false;
        }
        catch (error) {
            logger.error('Failed to cancel analysis', {
                error: error.message,
                analysisId,
                userId
            });
            return false;
        }
    }
    async getSystemStatus() {
        const services = [];
        try {
            const modelStatus = modelManager_1.modelManager.getModelStatus();
            const availableModels = Object.keys(modelStatus).length;
            services.push({
                service: 'Model Manager',
                status: availableModels > 0 ? 'healthy' : 'degraded',
                message: `${availableModels} models available`,
                lastCheck: new Date(),
                metadata: { availableModels, modelStatus }
            });
        }
        catch (error) {
            services.push({
                service: 'Model Manager',
                status: 'unhealthy',
                message: error.message,
                lastCheck: new Date()
            });
        }
        try {
            const startTime = Date.now();
            const isHealthy = await embeddings_1.embeddingService.healthCheck();
            const responseTime = Date.now() - startTime;
            services.push({
                service: 'Embedding Service',
                status: isHealthy ? 'healthy' : 'unhealthy',
                message: isHealthy ? 'Service operational' : 'Service unavailable',
                lastCheck: new Date(),
                responseTime,
                metadata: await embeddings_1.embeddingService.getEmbeddingStats()
            });
        }
        catch (error) {
            services.push({
                service: 'Embedding Service',
                status: 'unhealthy',
                message: error.message,
                lastCheck: new Date()
            });
        }
        try {
            const queueStats = queueManager_1.queueManager.getStats();
            const status = queueStats.currentLoad > 0.9 ? 'degraded' : 'healthy';
            services.push({
                service: 'Queue Manager',
                status,
                message: `${queueStats.processingJobs}/${queueStats.totalJobs} jobs, ${Math.round(queueStats.currentLoad * 100)}% load`,
                lastCheck: new Date(),
                metadata: queueStats
            });
        }
        catch (error) {
            services.push({
                service: 'Queue Manager',
                status: 'unhealthy',
                message: error.message,
                lastCheck: new Date()
            });
        }
        if (this.config.enableProgressTracking) {
            try {
                const trackerStats = progressTracker_1.progressTracker.getStats();
                services.push({
                    service: 'Progress Tracker',
                    status: 'healthy',
                    message: `${trackerStats.totalConnections} active connections`,
                    lastCheck: new Date(),
                    metadata: trackerStats
                });
            }
            catch (error) {
                services.push({
                    service: 'Progress Tracker',
                    status: 'unhealthy',
                    message: error.message,
                    lastCheck: new Date()
                });
            }
        }
        if (this.config.monitoringEnabled) {
            try {
                const healthStatus = performanceMonitor_1.performanceMonitor.getHealthStatus();
                services.push({
                    service: 'Performance Monitor',
                    status: healthStatus.status === 'healthy' ? 'healthy' :
                        healthStatus.status === 'warning' ? 'degraded' : 'unhealthy',
                    message: `${Object.keys(healthStatus.checks).length} health checks`,
                    lastCheck: new Date(),
                    metadata: healthStatus
                });
            }
            catch (error) {
                services.push({
                    service: 'Performance Monitor',
                    status: 'unhealthy',
                    message: error.message,
                    lastCheck: new Date()
                });
            }
        }
        const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
        const degradedCount = services.filter(s => s.status === 'degraded').length;
        let overall;
        if (unhealthyCount > 0) {
            overall = 'unhealthy';
        }
        else if (degradedCount > 0) {
            overall = 'degraded';
        }
        else {
            overall = 'healthy';
        }
        return {
            overall,
            services,
            lastUpdate: new Date(),
            version: '1.0.0',
            uptime: Date.now() - this.startTime.getTime()
        };
    }
    updateConfiguration(updates) {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...updates };
        logger.info('Configuration updated', {
            oldConfig,
            newConfig: this.config,
            changes: Object.keys(updates)
        });
        if (updates.maxConcurrentJobs && updates.maxConcurrentJobs !== oldConfig.maxConcurrentJobs) {
            queueManager_1.queueManager.adjustCapacity(updates.maxConcurrentJobs);
        }
    }
    getConfiguration() {
        return { ...this.config };
    }
    async getSystemStatistics() {
        const stats = {
            analysis: await this.analysisService.getAnalysisStats(),
            queue: queueManager_1.queueManager.getStats(),
            models: modelManager_1.modelManager.getModelStatus()
        };
        if (this.config.monitoringEnabled) {
            stats.system = performanceMonitor_1.performanceMonitor.getCurrentSystemMetrics();
            stats.cache = performanceMonitor_1.performanceMonitor.getCurrentCacheMetrics();
        }
        return stats;
    }
    async setupServiceIntegrations() {
        if (this.config.enableProgressTracking) {
            queueManager_1.queueManager.on('jobProgress', (data) => {
                const progressUpdate = {
                    analysisId: data.analysisId || data.jobId,
                    userId: data.userId || 'unknown',
                    step: data.step,
                    percentage: data.percentage,
                    message: data.message,
                    timestamp: new Date()
                };
                progressTracker_1.progressTracker.broadcastProgress(progressUpdate);
            });
        }
        if (this.config.monitoringEnabled) {
            queueManager_1.queueManager.on('jobStarted', (job) => {
                performanceMonitor_1.performanceMonitor.trackRequest('analysis', job.assignedModel);
            });
            queueManager_1.queueManager.on('jobCompleted', (job) => {
                if (job.actualDuration) {
                    performanceMonitor_1.performanceMonitor.trackResponse('analysis', job.actualDuration, job.assignedModel);
                }
            });
            queueManager_1.queueManager.on('jobFailed', (job) => {
                performanceMonitor_1.performanceMonitor.trackError('analysis', job.error || 'Unknown error', job.assignedModel);
            });
        }
        logger.info('Service integrations setup completed');
    }
    determinePriority(request) {
        if (request.options?.modelPreference === 'accuracy') {
            return 'high';
        }
        if (request.fileBuffer && request.fileBuffer.length > 10 * 1024 * 1024) {
            return 'low';
        }
        return 'normal';
    }
    getQueuePosition(jobId) {
        return 0;
    }
    getEnabledServices() {
        const services = ['Model Manager', 'Text Processor', 'Pattern Library', 'Risk Scoring Engine', 'Queue Manager'];
        if (this.config.enableEmbeddings)
            services.push('Embedding Service');
        if (this.config.enableProgressTracking)
            services.push('Progress Tracker');
        if (this.config.monitoringEnabled)
            services.push('Performance Monitor');
        return services;
    }
    startHealthMonitoring() {
        this.healthCheckIntervalId = setInterval(async () => {
            try {
                const status = await this.getSystemStatus();
                if (status.overall !== 'healthy') {
                    logger.warn('System health check failed', {
                        overall: status.overall,
                        unhealthyServices: status.services.filter(s => s.status === 'unhealthy').map(s => s.service)
                    });
                }
            }
            catch (error) {
                logger.error('Health monitoring error', { error: error.message });
            }
        }, 60000);
        logger.info('Health monitoring started');
    }
    get services() {
        return {
            modelManager: modelManager_1.modelManager,
            textProcessor: textProcessor_1.textProcessor,
            patternLibrary: patterns_1.patternLibrary,
            embeddingService: embeddings_1.embeddingService,
            riskScoringEngine: riskScoring_1.riskScoringEngine,
            enhancedAnalysisEngine: enhancedAnalysis_1.enhancedAnalysisEngine,
            queueManager: queueManager_1.queueManager,
            progressTracker: this.config.enableProgressTracking ? progressTracker_1.progressTracker : null,
            performanceMonitor: this.config.monitoringEnabled ? performanceMonitor_1.performanceMonitor : null,
            analysisService: this.analysisService
        };
    }
}
exports.IntegrationService = IntegrationService;
exports.integrationService = new IntegrationService();
//# sourceMappingURL=integration.js.map