"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationManager = void 0;
const axios_1 = __importDefault(require("axios"));
const events_1 = require("events");
const types_1 = require("@/types");
const logger_1 = require("@/utils/logger");
const cache_1 = require("@/utils/cache");
const config_1 = require("@/config");
class IntegrationManager extends events_1.EventEmitter {
    logger = logger_1.Logger.getInstance();
    cache = new cache_1.Cache('integrations');
    integrations = new Map();
    clients = new Map();
    healthChecks = new Map();
    syncIntervals = new Map();
    constructor() {
        super();
        this.initializeIntegrations();
        this.setupHealthChecks();
    }
    async initializeIntegrations() {
        try {
            await this.initializeDSPyIntegration();
            await this.initializeLoRAIntegration();
            await this.initializeKnowledgeGraphIntegration();
            await this.initializeGitIntegration();
            await this.initializeCICDIntegration();
            await this.initializeMonitoringIntegration();
            this.logger.info('Integration manager initialized', {
                integrationCount: this.integrations.size,
                enabledIntegrations: Array.from(this.integrations.keys()),
            });
            this.startPeriodicSync();
        }
        catch (error) {
            this.logger.error('Failed to initialize integrations', { error: error.message });
            throw error;
        }
    }
    getIntegration(type) {
        return this.integrations.get(type) || null;
    }
    async updateIntegration(type, configuration) {
        try {
            const integration = this.integrations.get(type);
            if (!integration) {
                throw new Error(`Integration ${type} not found`);
            }
            integration.configuration = {
                ...integration.configuration,
                ...configuration,
            };
            if (configuration.endpoint) {
                await this.createClient(type, integration.configuration);
            }
            this.integrations.set(type, integration);
            this.logger.info('Integration updated', { type, configuration });
            this.emit('integration:updated', { type, integration });
            return integration;
        }
        catch (error) {
            this.logger.error('Failed to update integration', { type, error: error.message });
            throw error;
        }
    }
    async testIntegration(type) {
        try {
            const startTime = Date.now();
            const client = this.clients.get(type);
            if (!client) {
                throw new Error(`No client found for integration ${type}`);
            }
            const result = await this.performHealthCheck(type, client);
            const latency = Date.now() - startTime;
            const health = {
                status: result.success ? 'healthy' : 'unhealthy',
                latency,
                errorRate: result.errorRate || 0,
                availability: result.availability || (result.success ? 1 : 0),
                lastCheck: new Date(),
            };
            this.healthChecks.set(type, health);
            this.logger.info('Integration test completed', { type, health });
            this.emit('integration:tested', { type, health });
            return health;
        }
        catch (error) {
            const health = {
                status: 'unhealthy',
                latency: 0,
                errorRate: 1,
                availability: 0,
                lastCheck: new Date(),
            };
            this.healthChecks.set(type, health);
            this.logger.error('Integration test failed', { type, error: error.message });
            return health;
        }
    }
    async syncWithIntegration(type, data) {
        const startTime = Date.now();
        try {
            this.logger.info('Starting integration sync', { type });
            const integration = this.integrations.get(type);
            if (!integration || integration.status !== types_1.IntegrationStatus.ACTIVE) {
                throw new Error(`Integration ${type} is not available for sync`);
            }
            let result;
            switch (type) {
                case types_1.IntegrationType.DSPY:
                    result = await this.syncWithDSPy(data);
                    break;
                case types_1.IntegrationType.LORA:
                    result = await this.syncWithLoRA(data);
                    break;
                case types_1.IntegrationType.KNOWLEDGE_GRAPH:
                    result = await this.syncWithKnowledgeGraph(data);
                    break;
                case types_1.IntegrationType.GIT:
                    result = await this.syncWithGit(data);
                    break;
                case types_1.IntegrationType.CI_CD:
                    result = await this.syncWithCICD(data);
                    break;
                case types_1.IntegrationType.MONITORING:
                    result = await this.syncWithMonitoring(data);
                    break;
                default:
                    throw new Error(`Sync not implemented for integration ${type}`);
            }
            this.updateIntegrationMetrics(type, result);
            await this.executeHooks(type, 'sync_complete', { result, data });
            const duration = Date.now() - startTime;
            this.logger.info('Integration sync completed', { type, duration, result });
            this.emit('integration:synced', { type, result });
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const result = {
                success: false,
                syncedItems: 0,
                errors: [error.message],
                duration,
                timestamp: new Date(),
            };
            this.updateIntegrationMetrics(type, result);
            this.logger.error('Integration sync failed', { type, error: error.message, duration });
            this.emit('integration:sync_failed', { type, error });
            return result;
        }
    }
    async sendToIntegration(type, endpoint, data, options) {
        try {
            const client = this.clients.get(type);
            if (!client) {
                throw new Error(`No client found for integration ${type}`);
            }
            const response = await client.post(endpoint, data, options);
            const integration = this.integrations.get(type);
            if (integration) {
                integration.metrics.requestsSent++;
                integration.lastSync = new Date();
            }
            this.logger.debug('Data sent to integration', { type, endpoint, status: response.status });
            return response.data;
        }
        catch (error) {
            const integration = this.integrations.get(type);
            if (integration) {
                integration.metrics.errorsEncountered++;
                integration.metrics.lastErrorTime = new Date();
                integration.metrics.lastErrorMessage = error.message;
            }
            this.logger.error('Failed to send data to integration', {
                type,
                endpoint,
                error: error.message,
            });
            throw error;
        }
    }
    async receiveFromIntegration(type, endpoint, options) {
        try {
            const client = this.clients.get(type);
            if (!client) {
                throw new Error(`No client found for integration ${type}`);
            }
            const response = await client.get(endpoint, options);
            const integration = this.integrations.get(type);
            if (integration) {
                integration.metrics.requestsReceived++;
                integration.lastSync = new Date();
            }
            this.logger.debug('Data received from integration', { type, endpoint, status: response.status });
            return response.data;
        }
        catch (error) {
            const integration = this.integrations.get(type);
            if (integration) {
                integration.metrics.errorsEncountered++;
                integration.metrics.lastErrorTime = new Date();
                integration.metrics.lastErrorMessage = error.message;
            }
            this.logger.error('Failed to receive data from integration', {
                type,
                endpoint,
                error: error.message,
            });
            throw error;
        }
    }
    getIntegrationHealth(type) {
        return this.healthChecks.get(type) || null;
    }
    getAllIntegrationHealth() {
        return new Map(this.healthChecks);
    }
    async disableIntegration(type) {
        try {
            const integration = this.integrations.get(type);
            if (!integration) {
                throw new Error(`Integration ${type} not found`);
            }
            integration.status = types_1.IntegrationStatus.INACTIVE;
            const interval = this.syncIntervals.get(type);
            if (interval) {
                clearInterval(interval);
                this.syncIntervals.delete(type);
            }
            this.logger.info('Integration disabled', { type });
            this.emit('integration:disabled', { type });
        }
        catch (error) {
            this.logger.error('Failed to disable integration', { type, error: error.message });
            throw error;
        }
    }
    async enableIntegration(type) {
        try {
            const integration = this.integrations.get(type);
            if (!integration) {
                throw new Error(`Integration ${type} not found`);
            }
            integration.status = types_1.IntegrationStatus.ACTIVE;
            await this.testIntegration(type);
            this.startPeriodicSyncForIntegration(type);
            this.logger.info('Integration enabled', { type });
            this.emit('integration:enabled', { type });
        }
        catch (error) {
            this.logger.error('Failed to enable integration', { type, error: error.message });
            throw error;
        }
    }
    async initializeDSPyIntegration() {
        const integration = {
            id: 'dspy-integration',
            name: 'DSPy Integration',
            type: types_1.IntegrationType.DSPY,
            status: types_1.IntegrationStatus.ACTIVE,
            configuration: {
                endpoint: config_1.config.integrations.dspy,
                settings: {
                    timeout: 30000,
                    retries: 3,
                    batchSize: 10,
                },
                hooks: [
                    {
                        event: 'code_generated',
                        action: 'optimize_prompt',
                        config: { enabled: true },
                    },
                    {
                        event: 'quality_check',
                        action: 'update_metrics',
                        config: { enabled: true },
                    },
                ],
            },
            lastSync: new Date(),
            metrics: this.createDefaultMetrics(),
        };
        this.integrations.set(types_1.IntegrationType.DSPY, integration);
        await this.createClient(types_1.IntegrationType.DSPY, integration.configuration);
    }
    async initializeLoRAIntegration() {
        const integration = {
            id: 'lora-integration',
            name: 'LoRA Integration',
            type: types_1.IntegrationType.LORA,
            status: types_1.IntegrationStatus.ACTIVE,
            configuration: {
                endpoint: config_1.config.integrations.lora,
                settings: {
                    timeout: 60000,
                    retries: 2,
                    modelPath: '/models/lora',
                },
                hooks: [
                    {
                        event: 'model_update',
                        action: 'refresh_cache',
                        config: { enabled: true },
                    },
                ],
            },
            lastSync: new Date(),
            metrics: this.createDefaultMetrics(),
        };
        this.integrations.set(types_1.IntegrationType.LORA, integration);
        await this.createClient(types_1.IntegrationType.LORA, integration.configuration);
    }
    async initializeKnowledgeGraphIntegration() {
        const integration = {
            id: 'knowledge-graph-integration',
            name: 'Knowledge Graph Integration',
            type: types_1.IntegrationType.KNOWLEDGE_GRAPH,
            status: types_1.IntegrationStatus.ACTIVE,
            configuration: {
                endpoint: config_1.config.integrations.knowledgeGraph,
                settings: {
                    timeout: 45000,
                    retries: 3,
                    graphDatabase: 'neo4j',
                },
                hooks: [
                    {
                        event: 'pattern_discovered',
                        action: 'update_graph',
                        config: { enabled: true },
                    },
                    {
                        event: 'code_analyzed',
                        action: 'extract_entities',
                        config: { enabled: true },
                    },
                ],
            },
            lastSync: new Date(),
            metrics: this.createDefaultMetrics(),
        };
        this.integrations.set(types_1.IntegrationType.KNOWLEDGE_GRAPH, integration);
        await this.createClient(types_1.IntegrationType.KNOWLEDGE_GRAPH, integration.configuration);
    }
    async initializeGitIntegration() {
        const integration = {
            id: 'git-integration',
            name: 'Git Integration',
            type: types_1.IntegrationType.GIT,
            status: types_1.IntegrationStatus.ACTIVE,
            configuration: {
                endpoint: 'https://api.github.com',
                credentials: {
                    token: config_1.config.env.GITHUB_TOKEN || '',
                },
                settings: {
                    timeout: 30000,
                    retries: 3,
                    defaultBranch: 'main',
                },
                hooks: [
                    {
                        event: 'code_generated',
                        action: 'create_pr',
                        config: { enabled: false },
                    },
                    {
                        event: 'template_created',
                        action: 'commit_template',
                        config: { enabled: true },
                    },
                ],
            },
            lastSync: new Date(),
            metrics: this.createDefaultMetrics(),
        };
        this.integrations.set(types_1.IntegrationType.GIT, integration);
        await this.createClient(types_1.IntegrationType.GIT, integration.configuration);
    }
    async initializeCICDIntegration() {
        const integration = {
            id: 'cicd-integration',
            name: 'CI/CD Integration',
            type: types_1.IntegrationType.CI_CD,
            status: types_1.IntegrationStatus.INACTIVE,
            configuration: {
                endpoint: 'https://api.github.com',
                settings: {
                    timeout: 60000,
                    retries: 2,
                    workflowFile: '.github/workflows/deploy.yml',
                },
                hooks: [
                    {
                        event: 'deployment_ready',
                        action: 'trigger_pipeline',
                        config: { enabled: true },
                    },
                ],
            },
            lastSync: new Date(),
            metrics: this.createDefaultMetrics(),
        };
        this.integrations.set(types_1.IntegrationType.CI_CD, integration);
        await this.createClient(types_1.IntegrationType.CI_CD, integration.configuration);
    }
    async initializeMonitoringIntegration() {
        const integration = {
            id: 'monitoring-integration',
            name: 'Monitoring Integration',
            type: types_1.IntegrationType.MONITORING,
            status: types_1.IntegrationStatus.ACTIVE,
            configuration: {
                endpoint: 'http://localhost:3005',
                settings: {
                    timeout: 15000,
                    retries: 3,
                    metricsInterval: 60000,
                },
                hooks: [
                    {
                        event: 'error_occurred',
                        action: 'send_alert',
                        config: { enabled: true },
                    },
                    {
                        event: 'performance_degraded',
                        action: 'log_metric',
                        config: { enabled: true },
                    },
                ],
            },
            lastSync: new Date(),
            metrics: this.createDefaultMetrics(),
        };
        this.integrations.set(types_1.IntegrationType.MONITORING, integration);
        await this.createClient(types_1.IntegrationType.MONITORING, integration.configuration);
    }
    async createClient(type, configuration) {
        try {
            if (!configuration.endpoint) {
                this.logger.warn('No endpoint configured for integration', { type });
                return;
            }
            const client = axios_1.default.create({
                baseURL: configuration.endpoint,
                timeout: configuration.settings?.timeout || 30000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'FinePrint-FullStack-Agent/1.0.0',
                },
            });
            if (configuration.credentials?.token) {
                client.defaults.headers.Authorization = `Bearer ${configuration.credentials.token}`;
            }
            client.interceptors.request.use((config) => {
                config.metadata = { startTime: Date.now() };
                return config;
            }, (error) => {
                this.logger.error('Request interceptor error', { type, error: error.message });
                return Promise.reject(error);
            });
            client.interceptors.response.use((response) => {
                const duration = Date.now() - response.config.metadata.startTime;
                const integration = this.integrations.get(type);
                if (integration) {
                    integration.metrics.averageResponseTime =
                        (integration.metrics.averageResponseTime + duration) / 2;
                }
                return response;
            }, (error) => {
                const integration = this.integrations.get(type);
                if (integration) {
                    integration.metrics.errorsEncountered++;
                    integration.metrics.lastErrorTime = new Date();
                    integration.metrics.lastErrorMessage = error.message;
                }
                return Promise.reject(error);
            });
            this.clients.set(type, client);
            this.logger.debug('Integration client created', { type, endpoint: configuration.endpoint });
        }
        catch (error) {
            this.logger.error('Failed to create integration client', { type, error: error.message });
            throw error;
        }
    }
    createDefaultMetrics() {
        return {
            requestsSent: 0,
            requestsReceived: 0,
            errorsEncountered: 0,
            averageResponseTime: 0,
        };
    }
    setupHealthChecks() {
        setInterval(async () => {
            for (const [type, integration] of this.integrations) {
                if (integration.status === types_1.IntegrationStatus.ACTIVE) {
                    try {
                        await this.testIntegration(type);
                    }
                    catch (error) {
                        this.logger.warn('Health check failed', { type, error: error.message });
                    }
                }
            }
        }, 5 * 60 * 1000);
    }
    startPeriodicSync() {
        for (const [type, integration] of this.integrations) {
            if (integration.status === types_1.IntegrationStatus.ACTIVE) {
                this.startPeriodicSyncForIntegration(type);
            }
        }
    }
    startPeriodicSyncForIntegration(type) {
        const syncInterval = config_1.config.agent.integrations.syncInterval * 1000;
        const interval = setInterval(async () => {
            try {
                await this.syncWithIntegration(type);
            }
            catch (error) {
                this.logger.warn('Periodic sync failed', { type, error: error.message });
            }
        }, syncInterval);
        this.syncIntervals.set(type, interval);
        this.logger.debug('Periodic sync started', { type, interval: syncInterval });
    }
    async performHealthCheck(type, client) {
        try {
            let endpoint = '/health';
            switch (type) {
                case types_1.IntegrationType.DSPY:
                    endpoint = '/api/v1/health';
                    break;
                case types_1.IntegrationType.KNOWLEDGE_GRAPH:
                    endpoint = '/health';
                    break;
                case types_1.IntegrationType.MONITORING:
                    endpoint = '/health';
                    break;
                default:
                    endpoint = '/health';
            }
            const response = await client.get(endpoint);
            return {
                success: response.status === 200,
                errorRate: response.data?.errorRate || 0,
                availability: response.data?.availability || 1,
            };
        }
        catch (error) {
            return { success: false, errorRate: 1, availability: 0 };
        }
    }
    async syncWithDSPy(data) {
        try {
            const client = this.clients.get(types_1.IntegrationType.DSPY);
            if (!client)
                throw new Error('DSPy client not available');
            const response = await client.post('/api/v1/sync', {
                type: 'code_generation_metrics',
                data: data || {},
                timestamp: new Date().toISOString(),
            });
            return {
                success: true,
                syncedItems: response.data?.syncedItems || 1,
                errors: [],
                duration: 0,
                timestamp: new Date(),
            };
        }
        catch (error) {
            return {
                success: false,
                syncedItems: 0,
                errors: [error.message],
                duration: 0,
                timestamp: new Date(),
            };
        }
    }
    async syncWithLoRA(data) {
        try {
            const client = this.clients.get(types_1.IntegrationType.LORA);
            if (!client)
                throw new Error('LoRA client not available');
            const response = await client.post('/api/v1/sync', {
                type: 'model_feedback',
                data: data || {},
                timestamp: new Date().toISOString(),
            });
            return {
                success: true,
                syncedItems: response.data?.syncedItems || 1,
                errors: [],
                duration: 0,
                timestamp: new Date(),
            };
        }
        catch (error) {
            return {
                success: false,
                syncedItems: 0,
                errors: [error.message],
                duration: 0,
                timestamp: new Date(),
            };
        }
    }
    async syncWithKnowledgeGraph(data) {
        try {
            const client = this.clients.get(types_1.IntegrationType.KNOWLEDGE_GRAPH);
            if (!client)
                throw new Error('Knowledge Graph client not available');
            const response = await client.post('/api/v1/sync', {
                type: 'code_patterns',
                data: data || {},
                timestamp: new Date().toISOString(),
            });
            return {
                success: true,
                syncedItems: response.data?.syncedItems || 1,
                errors: [],
                duration: 0,
                timestamp: new Date(),
            };
        }
        catch (error) {
            return {
                success: false,
                syncedItems: 0,
                errors: [error.message],
                duration: 0,
                timestamp: new Date(),
            };
        }
    }
    async syncWithGit(data) {
        return {
            success: true,
            syncedItems: 0,
            errors: [],
            duration: 0,
            timestamp: new Date(),
        };
    }
    async syncWithCICD(data) {
        return {
            success: true,
            syncedItems: 0,
            errors: [],
            duration: 0,
            timestamp: new Date(),
        };
    }
    async syncWithMonitoring(data) {
        try {
            const client = this.clients.get(types_1.IntegrationType.MONITORING);
            if (!client)
                throw new Error('Monitoring client not available');
            const metrics = this.collectMetrics();
            const response = await client.post('/api/v1/metrics', metrics);
            return {
                success: true,
                syncedItems: Object.keys(metrics).length,
                errors: [],
                duration: 0,
                timestamp: new Date(),
            };
        }
        catch (error) {
            return {
                success: false,
                syncedItems: 0,
                errors: [error.message],
                duration: 0,
                timestamp: new Date(),
            };
        }
    }
    updateIntegrationMetrics(type, result) {
        const integration = this.integrations.get(type);
        if (!integration)
            return;
        if (result.success) {
            integration.metrics.requestsSent++;
        }
        else {
            integration.metrics.errorsEncountered++;
            integration.metrics.lastErrorTime = new Date();
            integration.metrics.lastErrorMessage = result.errors.join('; ');
        }
        integration.lastSync = new Date();
    }
    async executeHooks(type, event, data) {
        try {
            const integration = this.integrations.get(type);
            if (!integration)
                return;
            const relevantHooks = integration.configuration.hooks.filter(hook => hook.event === event && hook.config?.enabled);
            for (const hook of relevantHooks) {
                try {
                    await this.executeHook(type, hook, data);
                }
                catch (error) {
                    this.logger.warn('Hook execution failed', {
                        type,
                        event,
                        action: hook.action,
                        error: error.message,
                    });
                }
            }
        }
        catch (error) {
            this.logger.error('Failed to execute hooks', { type, event, error: error.message });
        }
    }
    async executeHook(type, hook, data) {
        this.logger.debug('Executing hook', { type, event: hook.event, action: hook.action });
        switch (hook.action) {
            case 'optimize_prompt':
                await this.optimizePromptHook(type, data);
                break;
            case 'update_metrics':
                await this.updateMetricsHook(type, data);
                break;
            case 'refresh_cache':
                await this.refreshCacheHook(type, data);
                break;
            case 'update_graph':
                await this.updateGraphHook(type, data);
                break;
            case 'extract_entities':
                await this.extractEntitiesHook(type, data);
                break;
            case 'send_alert':
                await this.sendAlertHook(type, data);
                break;
            case 'log_metric':
                await this.logMetricHook(type, data);
                break;
            default:
                this.logger.warn('Unknown hook action', { action: hook.action });
        }
    }
    async optimizePromptHook(type, data) {
    }
    async updateMetricsHook(type, data) {
    }
    async refreshCacheHook(type, data) {
        await this.cache.clear('*');
    }
    async updateGraphHook(type, data) {
    }
    async extractEntitiesHook(type, data) {
    }
    async sendAlertHook(type, data) {
        this.emit('alert', { type, data });
    }
    async logMetricHook(type, data) {
        this.logger.info('Metric logged via hook', { type, data });
    }
    collectMetrics() {
        const metrics = {};
        for (const [type, integration] of this.integrations) {
            metrics[type] = {
                status: integration.status,
                metrics: integration.metrics,
                health: this.healthChecks.get(type),
                lastSync: integration.lastSync,
            };
        }
        return metrics;
    }
}
exports.IntegrationManager = IntegrationManager;
//# sourceMappingURL=integration-manager.js.map