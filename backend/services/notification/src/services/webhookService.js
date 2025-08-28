"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookService = void 0;
const axios_1 = __importDefault(require("axios"));
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const uuid_1 = require("uuid");
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('webhook-service');
const prisma = new client_1.PrismaClient();
class WebhookService {
    initialized = false;
    axiosInstance = axios_1.default.create({
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
    });
    constructor() {
        this.setupAxiosInterceptors();
    }
    setupAxiosInterceptors() {
        this.axiosInstance.interceptors.request.use((config) => {
            logger.debug('Webhook request', {
                url: config.url,
                method: config.method?.toUpperCase(),
                headers: this.sanitizeHeaders(config.headers),
            });
            return config;
        }, (error) => {
            logger.error('Webhook request setup failed', { error: error.message });
            return Promise.reject(error);
        });
        this.axiosInstance.interceptors.response.use((response) => {
            logger.debug('Webhook response', {
                url: response.config.url,
                status: response.status,
                statusText: response.statusText,
                responseTime: response.headers['x-response-time'],
            });
            return response;
        }, (error) => {
            logger.debug('Webhook request failed', {
                url: error.config?.url,
                status: error.response?.status,
                statusText: error.response?.statusText,
                error: error.message,
            });
            return Promise.reject(error);
        });
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            await prisma.$connect();
            this.initialized = true;
            logger.info('Webhook service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize webhook service', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            await prisma.$disconnect();
            this.initialized = false;
            logger.info('Webhook service shut down successfully');
        }
        catch (error) {
            logger.error('Error during webhook service shutdown', { error });
        }
    }
    async sendWebhook(request) {
        try {
            if (!this.isValidWebhookUrl(request.url)) {
                throw new Error(`Invalid webhook URL: ${request.url}`);
            }
            const endpoint = await this.getWebhookEndpoint(request.url);
            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': `FinePrintAI-Webhooks/1.0`,
                'X-Webhook-Delivery-Id': request.deliveryId,
                'X-Webhook-Timestamp': Date.now().toString(),
                ...request.headers,
                ...(endpoint?.headers || {}),
            };
            if (endpoint?.secret) {
                const signature = this.generateSignature(request.payload, endpoint.secret);
                headers['X-Webhook-Signature-256'] = signature;
            }
            const startTime = Date.now();
            const response = await this.axiosInstance.request({
                method: request.method,
                url: request.url,
                headers,
                data: request.payload,
                timeout: request.timeout || endpoint?.timeout || 30000,
            });
            const responseTime = Date.now() - startTime;
            logger.info('Webhook sent successfully', {
                url: request.url,
                deliveryId: request.deliveryId,
                method: request.method,
                statusCode: response.status,
                responseTime,
            });
            return {
                success: true,
                statusCode: response.status,
                responseBody: this.sanitizeResponseBody(response.data),
            };
        }
        catch (error) {
            const axiosError = error;
            const statusCode = axiosError.response?.status;
            const responseBody = axiosError.response?.data;
            logger.error('Webhook send failed', {
                url: request.url,
                deliveryId: request.deliveryId,
                method: request.method,
                statusCode,
                error: error.message,
                responseBody: this.sanitizeResponseBody(responseBody),
            });
            return {
                success: false,
                statusCode,
                responseBody: this.sanitizeResponseBody(responseBody),
                errorCode: axiosError.code || 'WEBHOOK_ERROR',
                errorMessage: error.message,
                retryable: this.isRetryableError(error),
            };
        }
    }
    async createWebhookEndpoint(data) {
        try {
            if (!this.isValidWebhookUrl(data.url)) {
                throw new Error(`Invalid webhook URL: ${data.url}`);
            }
            const testResult = await this.testWebhookEndpoint(data.url, data.headers);
            if (!testResult.success) {
                logger.warn('Webhook endpoint test failed but proceeding with creation', {
                    url: data.url,
                    error: testResult.error,
                });
            }
            const endpoint = await prisma.webhookEndpoint.create({
                data: {
                    id: (0, uuid_1.v4)(),
                    userId: data.userId,
                    url: data.url,
                    secret: data.secret,
                    events: JSON.stringify(data.events),
                    headers: data.headers ? JSON.stringify(data.headers) : null,
                    timeout: data.timeout || 30000,
                    maxRetries: data.maxRetries || 3,
                    isActive: true,
                },
            });
            logger.info('Webhook endpoint created', {
                endpointId: endpoint.id,
                userId: data.userId,
                url: data.url,
                events: data.events,
            });
            return {
                id: endpoint.id,
                userId: endpoint.userId,
                url: endpoint.url,
                secret: endpoint.secret,
                isActive: endpoint.isActive,
                events: JSON.parse(endpoint.events),
                headers: endpoint.headers ? JSON.parse(endpoint.headers) : undefined,
                timeout: endpoint.timeout,
                maxRetries: endpoint.maxRetries,
            };
        }
        catch (error) {
            logger.error('Failed to create webhook endpoint', { error, data });
            throw error;
        }
    }
    async updateWebhookEndpoint(endpointId, updates) {
        try {
            if (updates.url && !this.isValidWebhookUrl(updates.url)) {
                throw new Error(`Invalid webhook URL: ${updates.url}`);
            }
            if (updates.url) {
                const testResult = await this.testWebhookEndpoint(updates.url, updates.headers);
                if (!testResult.success) {
                    logger.warn('Webhook endpoint test failed but proceeding with update', {
                        url: updates.url,
                        error: testResult.error,
                    });
                }
            }
            const updateData = { ...updates };
            if (updates.events) {
                updateData.events = JSON.stringify(updates.events);
            }
            if (updates.headers) {
                updateData.headers = JSON.stringify(updates.headers);
            }
            const endpoint = await prisma.webhookEndpoint.update({
                where: { id: endpointId },
                data: updateData,
            });
            logger.info('Webhook endpoint updated', {
                endpointId,
                updates: Object.keys(updates),
            });
            return {
                id: endpoint.id,
                userId: endpoint.userId,
                url: endpoint.url,
                secret: endpoint.secret,
                isActive: endpoint.isActive,
                events: JSON.parse(endpoint.events),
                headers: endpoint.headers ? JSON.parse(endpoint.headers) : undefined,
                timeout: endpoint.timeout,
                maxRetries: endpoint.maxRetries,
            };
        }
        catch (error) {
            logger.error('Failed to update webhook endpoint', { error, endpointId, updates });
            throw error;
        }
    }
    async deleteWebhookEndpoint(endpointId) {
        try {
            await prisma.webhookEndpoint.delete({
                where: { id: endpointId },
            });
            logger.info('Webhook endpoint deleted', { endpointId });
        }
        catch (error) {
            logger.error('Failed to delete webhook endpoint', { error, endpointId });
            throw error;
        }
    }
    async getUserWebhookEndpoints(userId) {
        try {
            const endpoints = await prisma.webhookEndpoint.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
            });
            return endpoints.map(endpoint => ({
                id: endpoint.id,
                userId: endpoint.userId,
                url: endpoint.url,
                secret: endpoint.secret,
                isActive: endpoint.isActive,
                events: JSON.parse(endpoint.events),
                headers: endpoint.headers ? JSON.parse(endpoint.headers) : undefined,
                timeout: endpoint.timeout,
                maxRetries: endpoint.maxRetries,
            }));
        }
        catch (error) {
            logger.error('Failed to get user webhook endpoints', { error, userId });
            throw error;
        }
    }
    async testWebhookEndpoint(url, headers) {
        try {
            const testPayload = {
                type: 'webhook.test',
                timestamp: new Date().toISOString(),
                data: {
                    message: 'This is a test webhook from Fine Print AI',
                },
            };
            const testHeaders = {
                'Content-Type': 'application/json',
                'User-Agent': 'FinePrintAI-Webhooks/1.0',
                'X-Webhook-Test': 'true',
                ...headers,
            };
            const response = await this.axiosInstance.post(url, testPayload, {
                headers: testHeaders,
                timeout: 10000,
            });
            return {
                success: response.status >= 200 && response.status < 300,
                statusCode: response.status,
            };
        }
        catch (error) {
            const axiosError = error;
            return {
                success: false,
                error: error.message,
                statusCode: axiosError.response?.status,
            };
        }
    }
    async getWebhookEndpoint(url) {
        try {
            const endpoint = await prisma.webhookEndpoint.findFirst({
                where: { url, isActive: true },
            });
            if (!endpoint)
                return null;
            return {
                id: endpoint.id,
                userId: endpoint.userId,
                url: endpoint.url,
                secret: endpoint.secret,
                isActive: endpoint.isActive,
                events: JSON.parse(endpoint.events),
                headers: endpoint.headers ? JSON.parse(endpoint.headers) : undefined,
                timeout: endpoint.timeout,
                maxRetries: endpoint.maxRetries,
            };
        }
        catch (error) {
            logger.error('Failed to get webhook endpoint', { error, url });
            return null;
        }
    }
    generateSignature(payload, secret) {
        const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
        return 'sha256=' + crypto_1.default
            .createHmac('sha256', secret)
            .update(payloadString, 'utf8')
            .digest('hex');
    }
    isValidWebhookUrl(url) {
        try {
            const parsedUrl = new URL(url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                return false;
            }
            if (config_1.config.NODE_ENV === 'production') {
                const hostname = parsedUrl.hostname.toLowerCase();
                if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
                    return false;
                }
                if (this.isPrivateIP(hostname)) {
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            return false;
        }
    }
    isPrivateIP(hostname) {
        const privateRanges = [
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./,
            /^169\.254\./,
            /^::1$/,
            /^fc00:/,
            /^fe80:/,
        ];
        return privateRanges.some(range => range.test(hostname));
    }
    isRetryableError(error) {
        const axiosError = error;
        const statusCode = axiosError.response?.status;
        if (statusCode) {
            const retryableStatusCodes = [
                408,
                429,
                500,
                502,
                503,
                504,
            ];
            return retryableStatusCodes.includes(statusCode);
        }
        const retryableErrorCodes = [
            'ECONNRESET',
            'ECONNREFUSED',
            'ENOTFOUND',
            'ETIMEDOUT',
            'ECONNABORTED',
        ];
        return retryableErrorCodes.includes(axiosError.code || '');
    }
    sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        const sensitiveHeaders = ['authorization', 'x-api-key', 'x-webhook-signature'];
        sensitiveHeaders.forEach(header => {
            if (sanitized[header]) {
                sanitized[header] = '[REDACTED]';
            }
            if (sanitized[header.toLowerCase()]) {
                sanitized[header.toLowerCase()] = '[REDACTED]';
            }
        });
        return sanitized;
    }
    sanitizeResponseBody(body) {
        if (!body)
            return body;
        const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
        if (bodyString.length > 1000) {
            return bodyString.substring(0, 1000) + '... [truncated]';
        }
        return body;
    }
    async getWebhookStats(endpointId, days = 7) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            const deliveries = await prisma.notificationDelivery.findMany({
                where: {
                    channel: 'webhook',
                    webhookUrl: {
                        endsWith: endpointId,
                    },
                    createdAt: {
                        gte: startDate,
                    },
                },
                select: {
                    status: true,
                    sentAt: true,
                    deliveredAt: true,
                    failedAt: true,
                },
            });
            const totalDeliveries = deliveries.length;
            const successfulDeliveries = deliveries.filter(d => ['sent', 'delivered'].includes(d.status)).length;
            const failedDeliveries = totalDeliveries - successfulDeliveries;
            const responseTimes = deliveries
                .filter(d => d.sentAt && d.deliveredAt)
                .map(d => d.deliveredAt.getTime() - d.sentAt.getTime());
            const averageResponseTime = responseTimes.length > 0
                ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
                : 0;
            const successRate = totalDeliveries > 0
                ? (successfulDeliveries / totalDeliveries) * 100
                : 0;
            return {
                totalDeliveries,
                successfulDeliveries,
                failedDeliveries,
                averageResponseTime: Math.round(averageResponseTime),
                successRate: Math.round(successRate * 100) / 100,
            };
        }
        catch (error) {
            logger.error('Failed to get webhook stats', { error, endpointId });
            throw error;
        }
    }
    verifyWebhookSignature(payload, signature, secret) {
        try {
            const expectedSignature = this.generateSignature(payload, secret);
            return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
        }
        catch (error) {
            logger.error('Failed to verify webhook signature', { error });
            return false;
        }
    }
    async sendBatchWebhooks(requests) {
        const results = [];
        const batchSize = 5;
        for (let i = 0; i < requests.length; i += batchSize) {
            const batch = requests.slice(i, i + batchSize);
            const batchPromises = batch.map(request => this.sendWebhook(request).catch(error => ({
                success: false,
                errorCode: 'BATCH_ERROR',
                errorMessage: error.message,
                retryable: true,
            })));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            if (i + batchSize < requests.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        return results;
    }
}
exports.webhookService = new WebhookService();
//# sourceMappingURL=webhookService.js.map