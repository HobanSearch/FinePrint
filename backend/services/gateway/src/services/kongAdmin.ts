import axios, { AxiosInstance } from 'axios';
import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('kong-admin');

export interface KongService {
  id: string;
  name: string;
  protocol: string;
  host: string;
  port: number;
  path?: string;
  retries?: number;
  connect_timeout?: number;
  write_timeout?: number;
  read_timeout?: number;
  tags?: string[];
}

export interface KongRoute {
  id: string;
  name: string;
  protocols: string[];
  methods?: string[];
  hosts?: string[];
  paths?: string[];
  service: { id: string };
  strip_path?: boolean;
  preserve_host?: boolean;
  tags?: string[];
}

export interface KongUpstream {
  id: string;
  name: string;
  algorithm: string;
  healthchecks?: {
    active?: {
      type: string;
      http_path: string;
      healthy: { interval: number; successes: number };
      unhealthy: { interval: number; http_failures: number; timeouts: number };
    };
    passive?: {
      healthy: { successes: number };
      unhealthy: { http_failures: number; timeouts: number };
    };
  };
  tags?: string[];
}

export interface KongTarget {
  id: string;
  upstream: { id: string };
  target: string;
  weight: number;
  tags?: string[];
}

export interface KongPlugin {
  id: string;
  name: string;
  config: Record<string, any>;
  service?: { id: string };
  route?: { id: string };
  consumer?: { id: string };
  enabled: boolean;
  tags?: string[];
}

export interface KongConsumer {
  id: string;
  username: string;
  custom_id?: string;
  tags?: string[];
}

interface KongAdminConfig {
  adminUrl: string;
  adminToken?: string;
  timeout?: number;
}

export class KongAdminService {
  private client: AxiosInstance;
  private config: KongAdminConfig;

  constructor(config: KongAdminConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.adminUrl,
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.adminToken && { Authorization: `Bearer ${config.adminToken}` }),
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Kong Admin API request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
        });
        return config;
      },
      (error) => {
        logger.error('Kong Admin API request error', { error });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Kong Admin API response', {
          status: response.status,
          url: response.config.url,
          data: response.data,
        });
        return response;
      },
      (error) => {
        logger.error('Kong Admin API response error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
  }

  async initialize(): Promise<void> {
    try {
      const status = await this.getStatus();
      logger.info('Kong Admin API connection established', {
        version: status.version,
        hostname: status.hostname,
        plugins: status.plugins?.available_on_server?.length || 0,
      });
    } catch (error) {
      logger.error('Failed to connect to Kong Admin API', { error });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Kong Admin Service shutting down');
    // No explicit cleanup needed for axios
  }

  // Status and health endpoints
  async getStatus(): Promise<any> {
    const response = await this.client.get('/status');
    return response.data;
  }

  async getHealth(): Promise<any> {
    const response = await this.client.get('/');
    return response.data;
  }

  // Service management
  async getServices(): Promise<KongService[]> {
    const response = await this.client.get('/services');
    return response.data.data;
  }

  async getService(id: string): Promise<KongService> {
    const response = await this.client.get(`/services/${id}`);
    return response.data;
  }

  async createService(service: Partial<KongService>): Promise<KongService> {
    const response = await this.client.post('/services', service);
    return response.data;
  }

  async updateService(id: string, service: Partial<KongService>): Promise<KongService> {
    const response = await this.client.patch(`/services/${id}`, service);
    return response.data;
  }

  async deleteService(id: string): Promise<void> {
    await this.client.delete(`/services/${id}`);
  }

  // Route management
  async getRoutes(): Promise<KongRoute[]> {
    const response = await this.client.get('/routes');
    return response.data.data;
  }

  async getRoute(id: string): Promise<KongRoute> {
    const response = await this.client.get(`/routes/${id}`);
    return response.data;
  }

  async createRoute(route: Partial<KongRoute>): Promise<KongRoute> {
    const response = await this.client.post('/routes', route);
    return response.data;
  }

  async updateRoute(id: string, route: Partial<KongRoute>): Promise<KongRoute> {
    const response = await this.client.patch(`/routes/${id}`, route);
    return response.data;
  }

  async deleteRoute(id: string): Promise<void> {
    await this.client.delete(`/routes/${id}`);
  }

  // Upstream management
  async getUpstreams(): Promise<KongUpstream[]> {
    const response = await this.client.get('/upstreams');
    return response.data.data;
  }

  async getUpstream(id: string): Promise<KongUpstream> {
    const response = await this.client.get(`/upstreams/${id}`);
    return response.data;
  }

  async createUpstream(upstream: Partial<KongUpstream>): Promise<KongUpstream> {
    const response = await this.client.post('/upstreams', upstream);
    return response.data;
  }

  async updateUpstream(id: string, upstream: Partial<KongUpstream>): Promise<KongUpstream> {
    const response = await this.client.patch(`/upstreams/${id}`, upstream);
    return response.data;
  }

  async deleteUpstream(id: string): Promise<void> {
    await this.client.delete(`/upstreams/${id}`);
  }

  // Target management
  async getTargets(upstreamId: string): Promise<KongTarget[]> {
    const response = await this.client.get(`/upstreams/${upstreamId}/targets`);
    return response.data.data;
  }

  async addTarget(upstreamId: string, target: Partial<KongTarget>): Promise<KongTarget> {
    const response = await this.client.post(`/upstreams/${upstreamId}/targets`, target);
    return response.data;
  }

  async updateTarget(upstreamId: string, targetId: string, target: Partial<KongTarget>): Promise<KongTarget> {
    const response = await this.client.patch(`/upstreams/${upstreamId}/targets/${targetId}`, target);
    return response.data;
  }

  async deleteTarget(upstreamId: string, targetId: string): Promise<void> {
    await this.client.delete(`/upstreams/${upstreamId}/targets/${targetId}`);
  }

  // Plugin management
  async getPlugins(): Promise<KongPlugin[]> {
    const response = await this.client.get('/plugins');
    return response.data.data;
  }

  async getPlugin(id: string): Promise<KongPlugin> {
    const response = await this.client.get(`/plugins/${id}`);
    return response.data;
  }

  async createPlugin(plugin: Partial<KongPlugin>): Promise<KongPlugin> {
    const response = await this.client.post('/plugins', plugin);
    return response.data;
  }

  async updatePlugin(id: string, plugin: Partial<KongPlugin>): Promise<KongPlugin> {
    const response = await this.client.patch(`/plugins/${id}`, plugin);
    return response.data;
  }

  async deletePlugin(id: string): Promise<void> {
    await this.client.delete(`/plugins/${id}`);
  }

  // Consumer management
  async getConsumers(): Promise<KongConsumer[]> {
    const response = await this.client.get('/consumers');
    return response.data.data;
  }

  async getConsumer(id: string): Promise<KongConsumer> {
    const response = await this.client.get(`/consumers/${id}`);
    return response.data;
  }

  async createConsumer(consumer: Partial<KongConsumer>): Promise<KongConsumer> {
    const response = await this.client.post('/consumers', consumer);
    return response.data;
  }

  async updateConsumer(id: string, consumer: Partial<KongConsumer>): Promise<KongConsumer> {
    const response = await this.client.patch(`/consumers/${id}`, consumer);
    return response.data;
  }

  async deleteConsumer(id: string): Promise<void> {
    await this.client.delete(`/consumers/${id}`);
  }

  // Configuration management
  async getConfigValidation(): Promise<any> {
    const response = await this.client.post('/config', { validate: true });
    return response.data;
  }

  async reloadConfiguration(): Promise<any> {
    const response = await this.client.post('/config/reload');
    return response.data;
  }

  // Metrics and monitoring
  async getMetrics(): Promise<any> {
    try {
      const response = await this.client.get('/metrics');
      return response.data;
    } catch (error) {
      // Metrics endpoint might not be available in all Kong versions
      logger.warn('Metrics endpoint not available', { error });
      return null;
    }
  }

  // Tag-based filtering
  async getServicesByTag(tag: string): Promise<KongService[]> {
    const response = await this.client.get(`/services?tags=${tag}`);
    return response.data.data;
  }

  async getRoutesByTag(tag: string): Promise<KongRoute[]> {
    const response = await this.client.get(`/routes?tags=${tag}`);
    return response.data.data;
  }

  async getPluginsByTag(tag: string): Promise<KongPlugin[]> {
    const response = await this.client.get(`/plugins?tags=${tag}`);
    return response.data.data;
  }

  // Bulk operations
  async bulkCreateServices(services: Partial<KongService>[]): Promise<KongService[]> {
    const results = await Promise.allSettled(
      services.map(service => this.createService(service))
    );

    const successful = results
      .filter((result): result is PromiseFulfilledResult<KongService> => result.status === 'fulfilled')
      .map(result => result.value);

    const failed = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason);

    if (failed.length > 0) {
      logger.warn(`${failed.length} services failed to create`, { errors: failed });
    }

    return successful;
  }

  async bulkDeleteServices(serviceIds: string[]): Promise<void> {
    const results = await Promise.allSettled(
      serviceIds.map(id => this.deleteService(id))
    );

    const failed = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason);

    if (failed.length > 0) {
      logger.warn(`${failed.length} services failed to delete`, { errors: failed });
    }
  }
}