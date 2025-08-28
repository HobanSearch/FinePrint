import { WebSocketService } from '../services/websocketService';
import { MessageQueueService } from '../services/messageQueueService';
import { MetricsService } from '../services/metricsService';
import { ConnectionManager } from '../services/connectionManager';
import { AuthenticationService } from '../services/authService';
import { RateLimiter } from '../services/rateLimiter';

// Mock dependencies
jest.mock('@fineprintai/shared-logger');
jest.mock('@fineprintai/shared-cache');
jest.mock('@fineprintai/shared-config');

describe('WebSocket Service', () => {
  let messageQueueService: MessageQueueService;
  let metricsService: MetricsService;
  let mockHttpServer: any;

  beforeEach(() => {
    messageQueueService = new MessageQueueService();
    metricsService = new MetricsService();
    mockHttpServer = {
      listen: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should initialize all services successfully', async () => {
      const wsService = new WebSocketService(mockHttpServer, messageQueueService, metricsService);
      
      // Mock successful initialization
      jest.spyOn(messageQueueService, 'initialize').mockResolvedValue();
      jest.spyOn(metricsService, 'initialize').mockResolvedValue();
      
      await expect(wsService.initialize()).resolves.not.toThrow();
    });

    it('should handle initialization failures gracefully', async () => {
      const wsService = new WebSocketService(mockHttpServer, messageQueueService, metricsService);
      
      // Mock failed initialization
      jest.spyOn(messageQueueService, 'initialize').mockRejectedValue(new Error('Redis connection failed'));
      
      await expect(wsService.initialize()).rejects.toThrow('Redis connection failed');
    });
  });

  describe('Message Queue Service', () => {
    it('should queue messages for offline users', async () => {
      const queueService = new MessageQueueService();
      jest.spyOn(queueService, 'initialize').mockResolvedValue();
      
      await queueService.initialize();
      
      const mockMessage = {
        type: 'notification',
        payload: {
          id: '123',
          title: 'Test',
          message: 'Test message',
        },
        timestamp: new Date(),
      };

      jest.spyOn(queueService, 'queueMessage').mockResolvedValue('job-123');
      
      const jobId = await queueService.queueMessage('user123', mockMessage);
      expect(jobId).toBe('job-123');
    });

    it('should handle queue size limits', async () => {
      const queueService = new MessageQueueService();
      jest.spyOn(queueService, 'initialize').mockResolvedValue();
      jest.spyOn(queueService, 'getUserQueueSize').mockResolvedValue(10000);
      
      await queueService.initialize();
      
      const mockMessage = {
        type: 'notification',
        payload: { test: 'data' },
        timestamp: new Date(),
      };

      // Should handle queue size limit
      jest.spyOn(queueService, 'removeOldestMessages').mockResolvedValue();
      jest.spyOn(queueService, 'queueMessage').mockResolvedValue('job-123');
      
      const jobId = await queueService.queueMessage('user123', mockMessage);
      expect(jobId).toBe('job-123');
    });
  });

  describe('Connection Manager', () => {
    it('should track user connections', async () => {
      const connectionManager = new ConnectionManager();
      jest.spyOn(connectionManager, 'initialize').mockResolvedValue();
      
      await connectionManager.initialize();
      
      const mockSocket = {
        id: 'socket123',
        userId: 'user123',
        teamId: 'team123',
      } as any;

      jest.spyOn(connectionManager, 'addConnection').mockResolvedValue();
      jest.spyOn(connectionManager, 'isUserOnline').mockReturnValue(true);
      
      await connectionManager.addConnection(mockSocket);
      expect(connectionManager.isUserOnline('user123')).toBe(true);
    });

    it('should cleanup inactive connections', async () => {
      const connectionManager = new ConnectionManager();
      jest.spyOn(connectionManager, 'initialize').mockResolvedValue();
      jest.spyOn(connectionManager, 'cleanupInactive').mockReturnValue(5);
      
      await connectionManager.initialize();
      
      const cleanedCount = connectionManager.cleanupInactive(30);
      expect(cleanedCount).toBe(5);
    });
  });

  describe('Authentication Service', () => {
    it('should authenticate valid JWT tokens', async () => {
      const authService = new AuthenticationService();
      jest.spyOn(authService, 'initialize').mockResolvedValue();
      
      await authService.initialize();
      
      const mockSocket = {
        id: 'socket123',
        handshake: {
          auth: { token: 'valid-jwt-token' },
          address: '127.0.0.1',
        },
      } as any;

      jest.spyOn(authService, 'authenticateSocket').mockResolvedValue();
      
      await expect(authService.authenticateSocket(mockSocket)).resolves.not.toThrow();
    });

    it('should reject invalid tokens', async () => {
      const authService = new AuthenticationService();
      jest.spyOn(authService, 'initialize').mockResolvedValue();
      
      await authService.initialize();
      
      const mockSocket = {
        id: 'socket123',
        handshake: {
          auth: { token: 'invalid-token' },
          address: '127.0.0.1',
        },
      } as any;

      jest.spyOn(authService, 'authenticateSocket').mockRejectedValue(new Error('Invalid token'));
      
      await expect(authService.authenticateSocket(mockSocket)).rejects.toThrow('Invalid token');
    });
  });

  describe('Rate Limiter', () => {
    it('should allow requests within limits', async () => {
      const rateLimiter = new RateLimiter();
      jest.spyOn(rateLimiter, 'initialize').mockResolvedValue();
      
      await rateLimiter.initialize();
      
      const mockSocket = {
        id: 'socket123',
        userId: 'user123',
        handshake: { address: '127.0.0.1' },
      } as any;

      jest.spyOn(rateLimiter, 'checkLimit').mockResolvedValue(true);
      
      const allowed = await rateLimiter.checkLimit(mockSocket, 'message');
      expect(allowed).toBe(true);
    });

    it('should block requests exceeding limits', async () => {
      const rateLimiter = new RateLimiter();
      jest.spyOn(rateLimiter, 'initialize').mockResolvedValue();
      
      await rateLimiter.initialize();
      
      const mockSocket = {
        id: 'socket123',
        userId: 'user123',
        handshake: { address: '127.0.0.1' },
      } as any;

      jest.spyOn(rateLimiter, 'checkLimit').mockResolvedValue(false);
      
      const allowed = await rateLimiter.checkLimit(mockSocket, 'message');
      expect(allowed).toBe(false);
    });
  });

  describe('Metrics Service', () => {
    it('should record and retrieve metrics', async () => {
      const metricsService = new MetricsService();
      jest.spyOn(metricsService, 'initialize').mockResolvedValue();
      
      await metricsService.initialize();
      
      metricsService.incrementCounter('test_counter', { label: 'test' }, 5);
      metricsService.recordGauge('test_gauge', 100, { label: 'test' });
      metricsService.recordHistogram('test_histogram', 50, { label: 'test' });
      
      expect(metricsService.getCounter('test_counter', { label: 'test' })).toBe(5);
      expect(metricsService.getGauge('test_gauge', { label: 'test' })).toBe(100);
      
      const histStats = metricsService.getHistogramStats('test_histogram', { label: 'test' });
      expect(histStats.count).toBe(1);
      expect(histStats.avg).toBe(50);
    });

    it('should generate Prometheus metrics', async () => {
      const metricsService = new MetricsService();
      jest.spyOn(metricsService, 'initialize').mockResolvedValue();
      
      await metricsService.initialize();
      
      metricsService.incrementCounter('test_counter');
      const prometheus = metricsService.getPrometheusMetrics();
      
      expect(prometheus).toContain('test_counter');
      expect(prometheus).toContain('# TYPE test_counter counter');
    });
  });

  describe('Health Checks', () => {
    it('should return healthy status when all services are running', async () => {
      const wsService = new WebSocketService(mockHttpServer, messageQueueService, metricsService);
      
      jest.spyOn(wsService, 'getHealthStatus').mockResolvedValue({
        healthy: true,
        redis: true,
        connections: 5,
        memory: process.memoryUsage(),
        uptime: 100,
      });

      const health = await wsService.getHealthStatus();
      expect(health.healthy).toBe(true);
      expect(health.connections).toBe(5);
    });

    it('should return unhealthy status when services are down', async () => {
      const wsService = new WebSocketService(mockHttpServer, messageQueueService, metricsService);
      
      jest.spyOn(wsService, 'getHealthStatus').mockResolvedValue({
        healthy: false,
        redis: false,
        connections: 0,
        memory: process.memoryUsage(),
        uptime: 100,
      });

      const health = await wsService.getHealthStatus();
      expect(health.healthy).toBe(false);
      expect(health.redis).toBe(false);
    });
  });
});

describe('Integration Tests', () => {
  it('should handle full message flow', async () => {
    // This would be a more comprehensive integration test
    // that tests the full flow from HTTP API to WebSocket delivery
    
    const messageQueueService = new MessageQueueService();
    const metricsService = new MetricsService();
    
    jest.spyOn(messageQueueService, 'initialize').mockResolvedValue();
    jest.spyOn(metricsService, 'initialize').mockResolvedValue();
    
    await messageQueueService.initialize();
    await metricsService.initialize();
    
    // Mock a message flow
    const mockMessage = {
      type: 'notification',
      payload: { title: 'Test', message: 'Integration test' },
      timestamp: new Date(),
    };

    jest.spyOn(messageQueueService, 'queueMessage').mockResolvedValue('job-123');
    jest.spyOn(messageQueueService, 'getQueuedMessages').mockResolvedValue([
      { ...mockMessage, userId: 'user123', priority: 'medium' as const }
    ]);
    
    // Queue message
    const jobId = await messageQueueService.queueMessage('user123', mockMessage);
    expect(jobId).toBe('job-123');
    
    // Retrieve queued messages
    const messages = await messageQueueService.getQueuedMessages('user123');
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('notification');
  });
});