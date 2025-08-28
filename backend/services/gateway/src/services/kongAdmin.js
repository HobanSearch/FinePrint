"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KongAdminService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('kong-admin');
class KongAdminService {
    client;
    config;
    constructor(config) {
        this.config = config;
        this.client = axios_1.default.create({
            baseURL: config.adminUrl,
            timeout: config.timeout || 10000,
            headers: {
                'Content-Type': 'application/json',
                ...(config.adminToken && { Authorization: `Bearer ${config.adminToken}` }),
            },
        });
        this.client.interceptors.request.use((config) => {
            logger.debug('Kong Admin API request', {
                method: config.method?.toUpperCase(),
                url: config.url,
                baseURL: config.baseURL,
            });
            return config;
        }, (error) => {
            logger.error('Kong Admin API request error', { error });
            return Promise.reject(error);
        });
        this.client.interceptors.response.use((response) => {
            logger.debug('Kong Admin API response', {
                status: response.status,
                url: response.config.url,
                data: response.data,
            });
            return response;
        }, (error) => {
            logger.error('Kong Admin API response error', {
                status: error.response?.status,
                url: error.config?.url,
                message: error.message,
                data: error.response?.data,
            });
            return Promise.reject(error);
        });
    }
    async initialize() {
        try {
            const status = await this.getStatus();
            logger.info('Kong Admin API connection established', {
                version: status.version,
                hostname: status.hostname,
                plugins: status.plugins?.available_on_server?.length || 0,
            });
        }
        catch (error) {
            logger.error('Failed to connect to Kong Admin API', { error });
            throw error;
        }
    }
    async shutdown() {
        logger.info('Kong Admin Service shutting down');
    }
    async getStatus() {
        const response = await this.client.get('/status');
        return response.data;
    }
    async getHealth() {
        const response = await this.client.get('/');
        return response.data;
    }
    async getServices() {
        const response = await this.client.get('/services');
        return response.data.data;
    }
    async getService(id) {
        const response = await this.client.get(`/services/${id}`);
        return response.data;
    }
    async createService(service) {
        const response = await this.client.post('/services', service);
        return response.data;
    }
    async updateService(id, service) {
        const response = await this.client.patch(`/services/${id}`, service);
        return response.data;
    }
    async deleteService(id) {
        await this.client.delete(`/services/${id}`);
    }
    async getRoutes() {
        const response = await this.client.get('/routes');
        return response.data.data;
    }
    async getRoute(id) {
        const response = await this.client.get(`/routes/${id}`);
        return response.data;
    }
    async createRoute(route) {
        const response = await this.client.post('/routes', route);
        return response.data;
    }
    async updateRoute(id, route) {
        const response = await this.client.patch(`/routes/${id}`, route);
        return response.data;
    }
    async deleteRoute(id) {
        await this.client.delete(`/routes/${id}`);
    }
    async getUpstreams() {
        const response = await this.client.get('/upstreams');
        return response.data.data;
    }
    async getUpstream(id) {
        const response = await this.client.get(`/upstreams/${id}`);
        return response.data;
    }
    async createUpstream(upstream) {
        const response = await this.client.post('/upstreams', upstream);
        return response.data;
    }
    async updateUpstream(id, upstream) {
        const response = await this.client.patch(`/upstreams/${id}`, upstream);
        return response.data;
    }
    async deleteUpstream(id) {
        await this.client.delete(`/upstreams/${id}`);
    }
    async getTargets(upstreamId) {
        const response = await this.client.get(`/upstreams/${upstreamId}/targets`);
        return response.data.data;
    }
    async addTarget(upstreamId, target) {
        const response = await this.client.post(`/upstreams/${upstreamId}/targets`, target);
        return response.data;
    }
    async updateTarget(upstreamId, targetId, target) {
        const response = await this.client.patch(`/upstreams/${upstreamId}/targets/${targetId}`, target);
        return response.data;
    }
    async deleteTarget(upstreamId, targetId) {
        await this.client.delete(`/upstreams/${upstreamId}/targets/${targetId}`);
    }
    async getPlugins() {
        const response = await this.client.get('/plugins');
        return response.data.data;
    }
    async getPlugin(id) {
        const response = await this.client.get(`/plugins/${id}`);
        return response.data;
    }
    async createPlugin(plugin) {
        const response = await this.client.post('/plugins', plugin);
        return response.data;
    }
    async updatePlugin(id, plugin) {
        const response = await this.client.patch(`/plugins/${id}`, plugin);
        return response.data;
    }
    async deletePlugin(id) {
        await this.client.delete(`/plugins/${id}`);
    }
    async getConsumers() {
        const response = await this.client.get('/consumers');
        return response.data.data;
    }
    async getConsumer(id) {
        const response = await this.client.get(`/consumers/${id}`);
        return response.data;
    }
    async createConsumer(consumer) {
        const response = await this.client.post('/consumers', consumer);
        return response.data;
    }
    async updateConsumer(id, consumer) {
        const response = await this.client.patch(`/consumers/${id}`, consumer);
        return response.data;
    }
    async deleteConsumer(id) {
        await this.client.delete(`/consumers/${id}`);
    }
    async getConfigValidation() {
        const response = await this.client.post('/config', { validate: true });
        return response.data;
    }
    async reloadConfiguration() {
        const response = await this.client.post('/config/reload');
        return response.data;
    }
    async getMetrics() {
        try {
            const response = await this.client.get('/metrics');
            return response.data;
        }
        catch (error) {
            logger.warn('Metrics endpoint not available', { error });
            return null;
        }
    }
    async getServicesByTag(tag) {
        const response = await this.client.get(`/services?tags=${tag}`);
        return response.data.data;
    }
    async getRoutesByTag(tag) {
        const response = await this.client.get(`/routes?tags=${tag}`);
        return response.data.data;
    }
    async getPluginsByTag(tag) {
        const response = await this.client.get(`/plugins?tags=${tag}`);
        return response.data.data;
    }
    async bulkCreateServices(services) {
        const results = await Promise.allSettled(services.map(service => this.createService(service)));
        const successful = results
            .filter((result) => result.status === 'fulfilled')
            .map(result => result.value);
        const failed = results
            .filter((result) => result.status === 'rejected')
            .map(result => result.reason);
        if (failed.length > 0) {
            logger.warn(`${failed.length} services failed to create`, { errors: failed });
        }
        return successful;
    }
    async bulkDeleteServices(serviceIds) {
        const results = await Promise.allSettled(serviceIds.map(id => this.deleteService(id)));
        const failed = results
            .filter((result) => result.status === 'rejected')
            .map(result => result.reason);
        if (failed.length > 0) {
            logger.warn(`${failed.length} services failed to delete`, { errors: failed });
        }
    }
}
exports.KongAdminService = KongAdminService;
//# sourceMappingURL=kongAdmin.js.map