/**
 * Config Service Unit Tests
 */

import { ConfigService } from '../src/services/config-service';
import Redis from 'ioredis-mock';
import { WebSocket } from 'ws';

// Mock Redis
jest.mock('ioredis', () => require('ioredis-mock'));

// Mock WebSocket
jest.mock('ws', () => ({
  WebSocket: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    readyState: 1,
  })),
  WebSocketServer: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    clients: new Set(),
  })),
}));

describe('ConfigService', () => {
  let configService: ConfigService;
  let redisClient: Redis;

  beforeEach(async () => {
    // Create fresh instances
    redisClient = new Redis();
    configService = new ConfigService(redisClient);
    await configService.initialize();
  });

  afterEach(async () => {
    await configService.cleanup();
    redisClient.disconnect();
  });

  describe('Configuration Management', () => {
    it('should get configuration value', async () => {
      await configService.set('api.timeout', 5000);
      const value = await configService.get('api.timeout');
      expect(value).toBe(5000);
    });

    it('should return default value when key not found', async () => {
      const value = await configService.get('nonexistent.key', 'default');
      expect(value).toBe('default');
    });

    it('should set configuration value', async () => {
      await configService.set('api.version', '2.0');
      const value = await configService.get('api.version');
      expect(value).toBe('2.0');
    });

    it('should handle nested configuration paths', async () => {
      await configService.set('database.postgres.host', 'localhost');
      await configService.set('database.postgres.port', 5432);
      
      const host = await configService.get('database.postgres.host');
      const port = await configService.get('database.postgres.port');
      
      expect(host).toBe('localhost');
      expect(port).toBe(5432);
    });

    it('should validate configuration against schema', async () => {
      const schema = {
        type: 'object',
        properties: {
          port: { type: 'number', minimum: 1, maximum: 65535 },
          host: { type: 'string' },
        },
        required: ['port', 'host'],
      };

      await configService.registerSchema('server', schema);

      // Valid configuration
      await expect(
        configService.set('server', { port: 3000, host: 'localhost' })
      ).resolves.not.toThrow();

      // Invalid configuration
      await expect(
        configService.set('server', { port: 70000, host: 'localhost' })
      ).rejects.toThrow();
    });
  });

  describe('Feature Flags', () => {
    it('should check if feature is enabled', async () => {
      await configService.setFeatureFlag('newUI', true);
      const enabled = await configService.isFeatureEnabled('newUI');
      expect(enabled).toBe(true);
    });

    it('should handle feature flag with percentage rollout', async () => {
      await configService.setFeatureFlag('betaFeature', {
        enabled: true,
        percentage: 50,
      });

      // Mock Math.random to test percentage
      const originalRandom = Math.random;
      let enabledCount = 0;

      // Test with 49% (should be enabled)
      Math.random = () => 0.49;
      if (await configService.isFeatureEnabled('betaFeature')) enabledCount++;

      // Test with 51% (should be disabled)
      Math.random = () => 0.51;
      if (await configService.isFeatureEnabled('betaFeature')) enabledCount++;

      Math.random = originalRandom;
      expect(enabledCount).toBe(1);
    });

    it('should handle feature flag with user whitelist', async () => {
      await configService.setFeatureFlag('premiumFeature', {
        enabled: true,
        whitelist: ['user123', 'user456'],
      });

      const enabled1 = await configService.isFeatureEnabled('premiumFeature', 'user123');
      const enabled2 = await configService.isFeatureEnabled('premiumFeature', 'user789');

      expect(enabled1).toBe(true);
      expect(enabled2).toBe(false);
    });

    it('should handle feature flag with condition', async () => {
      await configService.setFeatureFlag('conditionalFeature', {
        enabled: true,
        condition: 'env === "production"',
      });

      const enabledProd = await configService.isFeatureEnabled('conditionalFeature', null, {
        env: 'production',
      });
      const enabledDev = await configService.isFeatureEnabled('conditionalFeature', null, {
        env: 'development',
      });

      expect(enabledProd).toBe(true);
      expect(enabledDev).toBe(false);
    });
  });

  describe('Configuration Watching', () => {
    it('should notify watchers on configuration change', async () => {
      const watcher = jest.fn();
      const unwatch = configService.watch('api.timeout', watcher);

      await configService.set('api.timeout', 3000);
      
      // Wait for async notification
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(watcher).toHaveBeenCalledWith('api.timeout', 3000, undefined);

      unwatch();
    });

    it('should support pattern watching', async () => {
      const watcher = jest.fn();
      configService.watchPattern('database.*', watcher);

      await configService.set('database.host', 'localhost');
      await configService.set('database.port', 5432);
      await configService.set('api.timeout', 3000); // Should not trigger

      // Wait for async notifications
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(watcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('Environment Management', () => {
    it('should override with environment-specific config', async () => {
      await configService.set('api.url', 'http://localhost:3000');
      await configService.setEnvironmentOverride('production', 'api.url', 'https://api.fineprintai.com');

      const devUrl = await configService.get('api.url');
      expect(devUrl).toBe('http://localhost:3000');

      // Simulate production environment
      process.env.NODE_ENV = 'production';
      const prodUrl = await configService.get('api.url');
      expect(prodUrl).toBe('https://api.fineprintai.com');

      // Reset
      process.env.NODE_ENV = 'test';
    });
  });

  describe('Bulk Operations', () => {
    it('should get multiple configuration values', async () => {
      await configService.set('api.timeout', 5000);
      await configService.set('api.version', 'v2');
      await configService.set('api.key', 'secret');

      const values = await configService.getMultiple(['api.timeout', 'api.version', 'api.key']);

      expect(values).toEqual({
        'api.timeout': 5000,
        'api.version': 'v2',
        'api.key': 'secret',
      });
    });

    it('should set multiple configuration values', async () => {
      await configService.setMultiple({
        'cache.ttl': 3600,
        'cache.maxSize': 1000,
        'cache.enabled': true,
      });

      const ttl = await configService.get('cache.ttl');
      const maxSize = await configService.get('cache.maxSize');
      const enabled = await configService.get('cache.enabled');

      expect(ttl).toBe(3600);
      expect(maxSize).toBe(1000);
      expect(enabled).toBe(true);
    });
  });

  describe('Configuration Export/Import', () => {
    it('should export configuration', async () => {
      await configService.set('api.timeout', 5000);
      await configService.set('api.version', 'v2');
      await configService.setFeatureFlag('newUI', true);

      const exported = await configService.exportConfig();

      expect(exported.configs['api.timeout']).toBe(5000);
      expect(exported.configs['api.version']).toBe('v2');
      expect(exported.featureFlags['newUI']).toBe(true);
    });

    it('should import configuration', async () => {
      const configData = {
        configs: {
          'api.timeout': 3000,
          'api.version': 'v3',
        },
        featureFlags: {
          betaFeature: true,
        },
        version: '1.0.0',
      };

      await configService.importConfig(configData);

      const timeout = await configService.get('api.timeout');
      const version = await configService.get('api.version');
      const betaEnabled = await configService.isFeatureEnabled('betaFeature');

      expect(timeout).toBe(3000);
      expect(version).toBe('v3');
      expect(betaEnabled).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      // Force Redis error
      redisClient.disconnect();

      // Should fallback to in-memory cache
      await configService.set('test.key', 'value');
      const value = await configService.get('test.key');
      expect(value).toBe('value');
    });

    it('should validate configuration types', async () => {
      const schema = {
        type: 'object',
        properties: {
          port: { type: 'number' },
        },
      };

      await configService.registerSchema('server', schema);

      await expect(
        configService.set('server.port', 'not-a-number')
      ).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should cache configuration values in memory', async () => {
      // Set value in Redis
      await configService.set('cache.test', 'cached-value');

      // Clear Redis to ensure we're using cache
      await redisClient.flushall();

      // Should still get value from memory cache
      const value = await configService.get('cache.test');
      expect(value).toBe('cached-value');
    });

    it('should handle high-frequency reads efficiently', async () => {
      await configService.set('perf.test', 'value');

      const start = Date.now();
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        await configService.get('perf.test');
      }

      const duration = Date.now() - start;
      const avgTime = duration / iterations;

      // Should be very fast due to caching (< 0.1ms per read)
      expect(avgTime).toBeLessThan(0.1);
    });
  });

  describe('Security', () => {
    it('should encrypt sensitive configuration values', async () => {
      await configService.setSecure('api.secret', 'sensitive-data');

      // Get raw value from Redis
      const rawValue = await redisClient.get('config:api.secret');
      
      // Should be encrypted
      expect(rawValue).not.toBe('sensitive-data');
      expect(rawValue).toContain('encrypted:');

      // Should decrypt when getting
      const value = await configService.get('api.secret');
      expect(value).toBe('sensitive-data');
    });

    it('should mask sensitive values in logs', async () => {
      configService.registerSensitiveKeys(['api.key', 'database.password']);

      await configService.set('api.key', 'secret-key');
      await configService.set('database.password', 'db-password');

      const exported = await configService.exportConfig({ maskSensitive: true });

      expect(exported.configs['api.key']).toBe('***');
      expect(exported.configs['database.password']).toBe('***');
    });
  });
});