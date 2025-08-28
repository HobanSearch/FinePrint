"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const p_retry_1 = __importDefault(require("p-retry"));
const circuitBreaker_1 = require("./circuitBreaker");
const logger = (0, logger_1.createServiceLogger)('webhook-service');
class WebhookService {
    prisma;
    httpClient;
    initialized = false;
    webhookEndpoints = new Map();
    deliveryQueue = new Map();
    constructor() {
        this.prisma = new client_1.PrismaClient();
        this.httpClient = axios_1.default.create({
            timeout: 30000,
            maxRedirects: 3,
            headers: {
                'User-Agent': 'FinePrintAI-Webhook/1.0',
                'Content-Type': 'application/json',
            },
        });
        this.httpClient.interceptors.request.use((config) => {
            logger.debug('Webhook request initiated', {
                url: config.url,
                method: config.method,
                headers: Object.keys(config.headers || {}),
            });
            return config;
        });
        this.httpClient.interceptors.response.use((response) => {
            logger.debug('Webhook request successful', {
                url: response.config.url,
                status: response.status,
                responseTime: response.headers['x-response-time'],
            });
            return response;
        }, (error) => {
            logger.warn('Webhook request failed', {
                url: error.config?.url,
                status: error.response?.status,
                message: error.message,
            });
            return Promise.reject(error);
        });
    }
    async initialize() {
        if (this.initialized)
            return;
        logger.info('Initializing webhook service...');
        try {
            await this.prisma.$connect();
            await this.loadWebhookEndpoints();
            await this.loadPendingDeliveries();
            this.initialized = true;
            logger.info('Webhook service initialized successfully', {
                endpointCount: this.webhookEndpoints.size,
                pendingDeliveries: this.deliveryQueue.size,
            });
        }
        catch (error) {
            logger.error('Failed to initialize webhook service', { error });
            throw error;
        }
    }
    async createWebhookEndpoint(data) {
        const webhookId = crypto_1.default.randomUUID();
        const now = new Date();
        const endpoint = {
            id: webhookId,
            userId: data.userId,
            teamId: data.teamId,
            url: data.url,
            secret: data.secret,
            events: data.events,
            isActive: true,
            retryConfig: {
                maxAttempts: 5,
                backoffMultiplier: 2,
                maxDelay: 300000,
            },
            headers: data.headers || {},
            createdAt: now,
            failureCount: 0,
        };
        await this.prisma.webhookEndpoint.create({
            data: {
                id: endpoint.id,
                userId: endpoint.userId,
                teamId: endpoint.teamId,
                url: endpoint.url,
                secret: endpoint.secret,
                events: endpoint.events,
                isActive: endpoint.isActive,
                retryConfig: endpoint.retryConfig,
                headers: endpoint.headers,
                createdAt: endpoint.createdAt,
                failureCount: endpoint.failureCount,
            },
        });
        this.webhookEndpoints.set(webhookId, endpoint);
        logger.info('Created webhook endpoint', {
            webhookId,
            url: endpoint.url,
            events: endpoint.events,
            userId: endpoint.userId,
        });
        await this.testWebhookEndpoint(webhookId);
        return endpoint;
    }
    async updateWebhookEndpoint(webhookId, updates) {
        const endpoint = this.webhookEndpoints.get(webhookId);
        if (!endpoint) {
            throw new Error(`Webhook endpoint not found: ${webhookId}`);
        }
        const updatedEndpoint = { ...endpoint, ...updates };
        await this.prisma.webhookEndpoint.update({
            where: { id: webhookId },
            data: {
                url: updatedEndpoint.url,
                secret: updatedEndpoint.secret,
                events: updatedEndpoint.events,
                isActive: updatedEndpoint.isActive,
                headers: updatedEndpoint.headers,
            },
        });
        this.webhookEndpoints.set(webhookId, updatedEndpoint);
        logger.info('Updated webhook endpoint', {
            webhookId,
            updates,
        });
        return updatedEndpoint;
    }
    async deleteWebhookEndpoint(webhookId) {
        const endpoint = this.webhookEndpoints.get(webhookId);
        if (!endpoint) {
            throw new Error(`Webhook endpoint not found: ${webhookId}`);
        }
        await this.prisma.webhookEndpoint.delete({
            where: { id: webhookId },
        });
        this.webhookEndpoints.delete(webhookId);
        logger.info('Deleted webhook endpoint', { webhookId });
    }
    async triggerDocumentChangeWebhook(changeEvent) {
        const event = 'document.change.detected';
        logger.info('Triggering document change webhooks', {
            documentId: changeEvent.documentId,
            changeType: changeEvent.changeType,
            userId: changeEvent.userId,
        });
        const relevantEndpoints = this.getWebhookEndpointsForEvent(event, changeEvent.userId, changeEvent.teamId);
        const deliveryPromises = relevantEndpoints.map(endpoint => this.deliverWebhook(endpoint, event, {
            documentId: changeEvent.documentId,
            changeType: changeEvent.changeType,
            changeSummary: changeEvent.changeSummary,
            significantChanges: changeEvent.significantChanges,
            riskChange: changeEvent.riskChange,
            oldHash: changeEvent.oldHash,
            newHash: changeEvent.newHash,
            detectedAt: new Date().toISOString(),
        }));
        await Promise.allSettled(deliveryPromises);
    }
    async triggerRiskChangeWebhook(documentId, userId, teamId, riskChange, newRiskScore) {
        const event = riskChange > 0 ? 'document.risk.increased' : 'document.risk.decreased';
        logger.info('Triggering risk change webhooks', {
            documentId,
            riskChange,
            newRiskScore,
            event,
        });
        const relevantEndpoints = this.getWebhookEndpointsForEvent(event, userId, teamId);
        const deliveryPromises = relevantEndpoints.map(endpoint => this.deliverWebhook(endpoint, event, {
            documentId,
            riskChange,
            newRiskScore,
            previousRiskScore: newRiskScore - riskChange,
            changedAt: new Date().toISOString(),
        }));
        await Promise.allSettled(deliveryPromises);
    }
    async triggerMonitoringErrorWebhook(alert) {
        const event = 'monitoring.error';
        logger.info('Triggering monitoring error webhooks', {
            documentId: alert.documentId,
            severity: alert.severity,
            userId: alert.userId,
        });
        const relevantEndpoints = this.getWebhookEndpointsForEvent(event, alert.userId, alert.teamId);
        const deliveryPromises = relevantEndpoints.map(endpoint => this.deliverWebhook(endpoint, event, {
            documentId: alert.documentId,
            alertType: alert.alertType,
            severity: alert.severity,
            title: alert.title,
            description: alert.description,
            metadata: alert.metadata,
            occurredAt: new Date().toISOString(),
        }));
        await Promise.allSettled(deliveryPromises);
    }
    getWebhookEndpointsForEvent(event, userId, teamId) {
        return Array.from(this.webhookEndpoints.values()).filter(endpoint => {
            if (!endpoint.isActive || !endpoint.events.includes(event)) {
                return false;
            }
            return endpoint.userId === userId || (teamId && endpoint.teamId === teamId);
        });
    }
    async deliverWebhook(endpoint, event, data) {
        const deliveryId = crypto_1.default.randomUUID();
        const timestamp = new Date().toISOString();
        const payload = {
            event,
            timestamp,
            data,
            webhook: {
                id: endpoint.id,
                deliveryId,
            },
        };
        const delivery = {
            id: deliveryId,
            webhookId: endpoint.id,
            event,
            payload,
            attempt: 1,
        };
        await this.prisma.webhookDelivery.create({
            data: {
                id: delivery.id,
                webhookId: delivery.webhookId,
                event: delivery.event,
                payload: delivery.payload,
                attempt: delivery.attempt,
            },
        });
        this.deliveryQueue.set(deliveryId, delivery);
        try {
            await this.executeWebhookDelivery(delivery, endpoint);
        }
        catch (error) {
            logger.error('Webhook delivery failed', {
                deliveryId,
                webhookId: endpoint.id,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            if (delivery.attempt < endpoint.retryConfig.maxAttempts) {
                await this.scheduleWebhookRetry(delivery, endpoint);
            }
            else {
                await this.markWebhookDeliveryFailed(delivery, endpoint, 'Max retry attempts exceeded');
            }
        }
    }
    async executeWebhookDelivery(delivery, endpoint) {
        const startTime = Date.now();
        const headers = {
            ...endpoint.headers,
            'X-Webhook-Delivery': delivery.id,
            'X-Webhook-Event': delivery.event,
            'X-Webhook-Timestamp': new Date().toISOString(),
        };
        if (endpoint.secret) {
            const payloadString = JSON.stringify(delivery.payload);
            const signature = crypto_1.default
                .createHmac('sha256', endpoint.secret)
                .update(payloadString)
                .digest('hex');
            headers['X-Webhook-Signature'] = `sha256=${signature}`;
        }
        const response = await circuitBreaker_1.circuitBreakerService.execute(`webhook-${endpoint.id}`, async () => {
            return await (0, p_retry_1.default)(async () => {
                return await this.httpClient.post(endpoint.url, delivery.payload, {
                    headers,
                    timeout: 30000,
                });
            }, {
                retries: 2,
                factor: 1.5,
                minTimeout: 1000,
                maxTimeout: 5000,
            });
        }, {
            timeout: 35000,
            errorThresholdPercentage: 50,
            resetTimeout: 60000,
        });
        const deliveryTime = Date.now() - startTime;
        delivery.httpStatus = response.status;
        delivery.responseBody = JSON.stringify(response.data).substring(0, 1000);
        delivery.deliveredAt = new Date();
        await this.prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
                httpStatus: delivery.httpStatus,
                responseBody: delivery.responseBody,
                deliveredAt: delivery.deliveredAt,
            },
        });
        endpoint.lastTriggeredAt = new Date();
        endpoint.failureCount = 0;
        await this.prisma.webhookEndpoint.update({
            where: { id: endpoint.id },
            data: {
                lastTriggeredAt: endpoint.lastTriggeredAt,
                failureCount: endpoint.failureCount,
            },
        });
        this.webhookEndpoints.set(endpoint.id, endpoint);
        this.deliveryQueue.delete(delivery.id);
        logger.info('Webhook delivered successfully', {
            deliveryId: delivery.id,
            webhookId: endpoint.id,
            url: endpoint.url,
            httpStatus: response.status,
            deliveryTime,
        });
    }
    async scheduleWebhookRetry(delivery, endpoint) {
        delivery.attempt++;
        const baseDelay = 1000;
        const backoffDelay = Math.min(baseDelay * Math.pow(endpoint.retryConfig.backoffMultiplier, delivery.attempt - 1), endpoint.retryConfig.maxDelay);
        delivery.nextRetryAt = new Date(Date.now() + backoffDelay);
        await this.prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
                attempt: delivery.attempt,
                nextRetryAt: delivery.nextRetryAt,
            },
        });
        this.deliveryQueue.set(delivery.id, delivery);
        logger.info('Webhook delivery scheduled for retry', {
            deliveryId: delivery.id,
            attempt: delivery.attempt,
            nextRetryAt: delivery.nextRetryAt,
            backoffDelay,
        });
        setTimeout(() => {
            this.retryWebhookDelivery(delivery.id).catch(error => {
                logger.error('Webhook retry failed', {
                    deliveryId: delivery.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            });
        }, backoffDelay);
    }
    async retryWebhookDelivery(deliveryId) {
        const delivery = this.deliveryQueue.get(deliveryId);
        if (!delivery) {
            logger.warn('Webhook delivery not found for retry', { deliveryId });
            return;
        }
        const endpoint = this.webhookEndpoints.get(delivery.webhookId);
        if (!endpoint || !endpoint.isActive) {
            logger.warn('Webhook endpoint not found or inactive for retry', {
                deliveryId,
                webhookId: delivery.webhookId,
            });
            return;
        }
        try {
            await this.executeWebhookDelivery(delivery, endpoint);
        }
        catch (error) {
            logger.error('Webhook retry failed', {
                deliveryId,
                attempt: delivery.attempt,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            if (delivery.attempt < endpoint.retryConfig.maxAttempts) {
                await this.scheduleWebhookRetry(delivery, endpoint);
            }
            else {
                await this.markWebhookDeliveryFailed(delivery, endpoint, 'Max retry attempts exceeded');
            }
        }
    }
    async markWebhookDeliveryFailed(delivery, endpoint, error) {
        delivery.error = error;
        await this.prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
                error: delivery.error,
            },
        });
        endpoint.failureCount++;
        if (endpoint.failureCount >= 10) {
            endpoint.isActive = false;
            logger.warn('Webhook endpoint disabled due to repeated failures', {
                webhookId: endpoint.id,
                failureCount: endpoint.failureCount,
            });
        }
        await this.prisma.webhookEndpoint.update({
            where: { id: endpoint.id },
            data: {
                failureCount: endpoint.failureCount,
                isActive: endpoint.isActive,
            },
        });
        this.webhookEndpoints.set(endpoint.id, endpoint);
        this.deliveryQueue.delete(delivery.id);
        logger.error('Webhook delivery marked as failed', {
            deliveryId: delivery.id,
            webhookId: endpoint.id,
            error,
            failureCount: endpoint.failureCount,
        });
    }
    async testWebhookEndpoint(webhookId) {
        const endpoint = this.webhookEndpoints.get(webhookId);
        if (!endpoint) {
            throw new Error(`Webhook endpoint not found: ${webhookId}`);
        }
        const startTime = Date.now();
        const testPayload = {
            event: 'webhook.test',
            timestamp: new Date().toISOString(),
            data: {
                message: 'This is a test webhook delivery',
                webhookId: endpoint.id,
            },
            webhook: {
                id: endpoint.id,
                deliveryId: 'test-' + crypto_1.default.randomUUID(),
            },
        };
        try {
            const headers = {
                ...endpoint.headers,
                'X-Webhook-Event': 'webhook.test',
                'X-Webhook-Test': 'true',
            };
            if (endpoint.secret) {
                const payloadString = JSON.stringify(testPayload);
                const signature = crypto_1.default
                    .createHmac('sha256', endpoint.secret)
                    .update(payloadString)
                    .digest('hex');
                headers['X-Webhook-Signature'] = `sha256=${signature}`;
            }
            const response = await this.httpClient.post(endpoint.url, testPayload, {
                headers,
                timeout: 10000,
            });
            const responseTime = Date.now() - startTime;
            logger.info('Webhook test successful', {
                webhookId,
                httpStatus: response.status,
                responseTime,
            });
            return {
                success: true,
                httpStatus: response.status,
                responseTime,
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.warn('Webhook test failed', {
                webhookId,
                error: errorMessage,
                responseTime,
            });
            return {
                success: false,
                responseTime,
                error: errorMessage,
            };
        }
    }
    async loadWebhookEndpoints() {
        const endpoints = await this.prisma.webhookEndpoint.findMany({
            where: { isActive: true },
        });
        for (const endpoint of endpoints) {
            this.webhookEndpoints.set(endpoint.id, {
                id: endpoint.id,
                userId: endpoint.userId,
                teamId: endpoint.teamId || undefined,
                url: endpoint.url,
                secret: endpoint.secret || undefined,
                events: endpoint.events,
                isActive: endpoint.isActive,
                retryConfig: endpoint.retryConfig,
                headers: endpoint.headers,
                createdAt: endpoint.createdAt,
                lastTriggeredAt: endpoint.lastTriggeredAt || undefined,
                failureCount: endpoint.failureCount,
            });
        }
        logger.info('Loaded webhook endpoints from database', {
            endpointCount: endpoints.length,
        });
    }
    async loadPendingDeliveries() {
        const deliveries = await this.prisma.webhookDelivery.findMany({
            where: {
                deliveredAt: null,
                nextRetryAt: {
                    lte: new Date(),
                },
            },
        });
        for (const delivery of deliveries) {
            this.deliveryQueue.set(delivery.id, {
                id: delivery.id,
                webhookId: delivery.webhookId,
                event: delivery.event,
                payload: delivery.payload,
                httpStatus: delivery.httpStatus || undefined,
                responseBody: delivery.responseBody || undefined,
                attempt: delivery.attempt,
                deliveredAt: delivery.deliveredAt || undefined,
                error: delivery.error || undefined,
                nextRetryAt: delivery.nextRetryAt || undefined,
            });
        }
        logger.info('Loaded pending webhook deliveries', {
            deliveryCount: deliveries.length,
        });
    }
    async getWebhookStats() {
        const totalEndpoints = this.webhookEndpoints.size;
        const activeEndpoints = Array.from(this.webhookEndpoints.values()).filter(e => e.isActive).length;
        const pendingDeliveries = this.deliveryQueue.size;
        const deliveryStats = await this.prisma.webhookDelivery.aggregate({
            _count: { id: true },
            where: {
                createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
            },
        });
        const successfulDeliveries = await this.prisma.webhookDelivery.count({
            where: {
                deliveredAt: { not: null },
                error: null,
                createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
            },
        });
        const totalDeliveries = deliveryStats._count.id;
        const successRate = totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 0;
        return {
            totalEndpoints,
            activeEndpoints,
            totalDeliveries,
            pendingDeliveries,
            successRate,
        };
    }
    async healthCheck() {
        if (!this.initialized) {
            throw new Error('Webhook service not initialized');
        }
        await this.prisma.$queryRaw `SELECT 1`;
        try {
            await this.httpClient.get('https://httpbin.org/status/200', { timeout: 5000 });
        }
        catch (error) {
            throw new Error(`HTTP client health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async shutdown() {
        logger.info('Shutting down webhook service...');
        await this.prisma.$disconnect();
        this.webhookEndpoints.clear();
        this.deliveryQueue.clear();
        this.initialized = false;
        logger.info('Webhook service shutdown complete');
    }
}
exports.webhookService = new WebhookService();
//# sourceMappingURL=webhookService.js.map