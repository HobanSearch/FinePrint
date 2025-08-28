import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { ModelRegistry } from '../../src/services/model-registry';
import { ModelVersionManager } from '../../src/services/model-version-manager';
import { ModelDeploymentService } from '../../src/services/model-deployment-service';
import { ModelMonitor } from '../../src/services/model-monitor';
import { prisma } from '../../src/lib/prisma';
import { redis } from '../../src/lib/redis';
import { logger } from '../../src/lib/logger';

// Mock external dependencies
vi.mock('../../src/lib/prisma');
vi.mock('../../src/lib/redis');
vi.mock('../../src/lib/logger');

describe('Model Management Service', () => {
  let modelRegistry: ModelRegistry;
  let versionManager: ModelVersionManager;
  let deploymentService: ModelDeploymentService;
  let modelMonitor: ModelMonitor;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Initialize services
    modelRegistry = new ModelRegistry(prisma, redis, logger);
    versionManager = new ModelVersionManager(prisma, logger);
    deploymentService = new ModelDeploymentService(prisma, redis, logger);
    modelMonitor = new ModelMonitor(redis, logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ModelRegistry', () => {
    describe('registerModel', () => {
      it('should register a new model successfully', async () => {
        // Arrange
        const modelData = {
          name: 'phi-2-fine-tuned',
          version: '1.0.0',
          type: 'language',
          framework: 'pytorch',
          size: 2700000000, // 2.7B parameters
          metadata: {
            baseModel: 'microsoft/phi-2',
            trainedOn: 'legal-documents',
            accuracy: 0.92
          }
        };

        const mockModel = {
          id: 'model-123',
          ...modelData,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        (prisma.model.create as MockedFunction<any>).mockResolvedValue(mockModel);
        (redis.setex as MockedFunction<any>).mockResolvedValue('OK');

        // Act
        const result = await modelRegistry.registerModel(modelData);

        // Assert
        expect(result).toEqual(mockModel);
        expect(prisma.model.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            name: modelData.name,
            version: modelData.version,
            type: modelData.type
          })
        });
        expect(redis.setex).toHaveBeenCalledWith(
          `model:${mockModel.id}`,
          3600,
          JSON.stringify(mockModel)
        );
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({ modelId: mockModel.id }),
          'Model registered successfully'
        );
      });

      it('should reject duplicate model registration', async () => {
        // Arrange
        const modelData = {
          name: 'existing-model',
          version: '1.0.0',
          type: 'language',
          framework: 'pytorch',
          size: 1000000000
        };

        (prisma.model.findFirst as MockedFunction<any>).mockResolvedValue({
          id: 'existing-123',
          ...modelData
        });

        // Act & Assert
        await expect(modelRegistry.registerModel(modelData))
          .rejects.toThrow('Model with name and version already exists');
        
        expect(prisma.model.create).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalled();
      });

      it('should validate model metadata', async () => {
        // Arrange
        const invalidModelData = {
          name: '', // Invalid: empty name
          version: 'invalid-version', // Invalid: not semver
          type: 'unknown', // Invalid: unknown type
          framework: 'pytorch',
          size: -1 // Invalid: negative size
        };

        // Act & Assert
        await expect(modelRegistry.registerModel(invalidModelData))
          .rejects.toThrow('Invalid model data');
        
        expect(prisma.model.create).not.toHaveBeenCalled();
      });
    });

    describe('getModel', () => {
      it('should retrieve model from cache if available', async () => {
        // Arrange
        const modelId = 'model-123';
        const cachedModel = {
          id: modelId,
          name: 'cached-model',
          version: '1.0.0'
        };

        (redis.get as MockedFunction<any>).mockResolvedValue(JSON.stringify(cachedModel));

        // Act
        const result = await modelRegistry.getModel(modelId);

        // Assert
        expect(result).toEqual(cachedModel);
        expect(redis.get).toHaveBeenCalledWith(`model:${modelId}`);
        expect(prisma.model.findUnique).not.toHaveBeenCalled();
      });

      it('should retrieve model from database if not in cache', async () => {
        // Arrange
        const modelId = 'model-456';
        const dbModel = {
          id: modelId,
          name: 'db-model',
          version: '2.0.0'
        };

        (redis.get as MockedFunction<any>).mockResolvedValue(null);
        (prisma.model.findUnique as MockedFunction<any>).mockResolvedValue(dbModel);
        (redis.setex as MockedFunction<any>).mockResolvedValue('OK');

        // Act
        const result = await modelRegistry.getModel(modelId);

        // Assert
        expect(result).toEqual(dbModel);
        expect(redis.get).toHaveBeenCalledWith(`model:${modelId}`);
        expect(prisma.model.findUnique).toHaveBeenCalledWith({
          where: { id: modelId }
        });
        expect(redis.setex).toHaveBeenCalledWith(
          `model:${modelId}`,
          3600,
          JSON.stringify(dbModel)
        );
      });

      it('should return null for non-existent model', async () => {
        // Arrange
        const modelId = 'non-existent';
        
        (redis.get as MockedFunction<any>).mockResolvedValue(null);
        (prisma.model.findUnique as MockedFunction<any>).mockResolvedValue(null);

        // Act
        const result = await modelRegistry.getModel(modelId);

        // Assert
        expect(result).toBeNull();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ modelId }),
          'Model not found'
        );
      });
    });

    describe('listModels', () => {
      it('should list models with pagination', async () => {
        // Arrange
        const models = [
          { id: '1', name: 'model-1', version: '1.0.0' },
          { id: '2', name: 'model-2', version: '1.0.0' },
          { id: '3', name: 'model-3', version: '1.0.0' }
        ];

        (prisma.model.findMany as MockedFunction<any>).mockResolvedValue(models);
        (prisma.model.count as MockedFunction<any>).mockResolvedValue(3);

        // Act
        const result = await modelRegistry.listModels({ page: 1, limit: 10 });

        // Assert
        expect(result).toEqual({
          models,
          total: 3,
          page: 1,
          limit: 10,
          pages: 1
        });
        expect(prisma.model.findMany).toHaveBeenCalledWith({
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' }
        });
      });

      it('should filter models by type', async () => {
        // Arrange
        const languageModels = [
          { id: '1', name: 'llm-1', type: 'language', version: '1.0.0' },
          { id: '2', name: 'llm-2', type: 'language', version: '1.0.0' }
        ];

        (prisma.model.findMany as MockedFunction<any>).mockResolvedValue(languageModels);
        (prisma.model.count as MockedFunction<any>).mockResolvedValue(2);

        // Act
        const result = await modelRegistry.listModels({ 
          type: 'language',
          page: 1,
          limit: 10 
        });

        // Assert
        expect(result.models).toEqual(languageModels);
        expect(prisma.model.findMany).toHaveBeenCalledWith({
          where: { type: 'language' },
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' }
        });
      });
    });
  });

  describe('ModelVersionManager', () => {
    describe('createVersion', () => {
      it('should create a new model version', async () => {
        // Arrange
        const versionData = {
          modelId: 'model-123',
          version: '2.0.0',
          changes: 'Improved accuracy on legal documents',
          metrics: {
            accuracy: 0.94,
            f1Score: 0.92,
            latencyMs: 150
          }
        };

        const mockVersion = {
          id: 'version-456',
          ...versionData,
          createdAt: new Date()
        };

        (prisma.modelVersion.create as MockedFunction<any>).mockResolvedValue(mockVersion);

        // Act
        const result = await versionManager.createVersion(versionData);

        // Assert
        expect(result).toEqual(mockVersion);
        expect(prisma.modelVersion.create).toHaveBeenCalledWith({
          data: versionData
        });
      });

      it('should validate version number format', async () => {
        // Arrange
        const invalidVersion = {
          modelId: 'model-123',
          version: 'not-semver',
          changes: 'Test changes'
        };

        // Act & Assert
        await expect(versionManager.createVersion(invalidVersion))
          .rejects.toThrow('Invalid version format');
      });

      it('should prevent duplicate versions', async () => {
        // Arrange
        const versionData = {
          modelId: 'model-123',
          version: '1.0.0',
          changes: 'Initial version'
        };

        (prisma.modelVersion.findFirst as MockedFunction<any>).mockResolvedValue({
          id: 'existing-version',
          ...versionData
        });

        // Act & Assert
        await expect(versionManager.createVersion(versionData))
          .rejects.toThrow('Version already exists for this model');
      });
    });

    describe('compareVersions', () => {
      it('should compare two model versions', async () => {
        // Arrange
        const version1 = {
          id: 'v1',
          modelId: 'model-123',
          version: '1.0.0',
          metrics: {
            accuracy: 0.90,
            latencyMs: 200
          }
        };

        const version2 = {
          id: 'v2',
          modelId: 'model-123',
          version: '2.0.0',
          metrics: {
            accuracy: 0.94,
            latencyMs: 150
          }
        };

        (prisma.modelVersion.findUnique as MockedFunction<any>)
          .mockResolvedValueOnce(version1)
          .mockResolvedValueOnce(version2);

        // Act
        const comparison = await versionManager.compareVersions('v1', 'v2');

        // Assert
        expect(comparison).toEqual({
          version1,
          version2,
          improvements: {
            accuracy: 0.04,
            latencyMs: -50
          },
          recommendation: 'Version 2.0.0 shows improvements'
        });
      });
    });

    describe('rollbackVersion', () => {
      it('should rollback to previous version', async () => {
        // Arrange
        const currentVersion = {
          id: 'current',
          modelId: 'model-123',
          version: '2.0.0',
          active: true
        };

        const previousVersion = {
          id: 'previous',
          modelId: 'model-123',
          version: '1.0.0',
          active: false
        };

        (prisma.modelVersion.findFirst as MockedFunction<any>)
          .mockResolvedValueOnce(currentVersion)
          .mockResolvedValueOnce(previousVersion);

        (prisma.$transaction as MockedFunction<any>).mockImplementation(
          async (callback) => callback(prisma)
        );

        // Act
        await versionManager.rollbackVersion('model-123');

        // Assert
        expect(prisma.$transaction).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({ 
            from: '2.0.0',
            to: '1.0.0'
          }),
          'Model version rolled back'
        );
      });
    });
  });

  describe('ModelDeploymentService', () => {
    describe('deployModel', () => {
      it('should deploy model to specified environment', async () => {
        // Arrange
        const deploymentConfig = {
          modelId: 'model-123',
          versionId: 'version-456',
          environment: 'production',
          replicas: 3,
          resources: {
            cpu: '2',
            memory: '4Gi',
            gpu: '1'
          }
        };

        const mockDeployment = {
          id: 'deployment-789',
          ...deploymentConfig,
          status: 'deploying',
          createdAt: new Date()
        };

        (prisma.deployment.create as MockedFunction<any>).mockResolvedValue(mockDeployment);

        // Act
        const result = await deploymentService.deploy(deploymentConfig);

        // Assert
        expect(result).toEqual(mockDeployment);
        expect(prisma.deployment.create).toHaveBeenCalledWith({
          data: expect.objectContaining(deploymentConfig)
        });
      });

      it('should validate deployment resources', async () => {
        // Arrange
        const invalidConfig = {
          modelId: 'model-123',
          versionId: 'version-456',
          environment: 'production',
          replicas: -1, // Invalid
          resources: {
            cpu: '0', // Invalid
            memory: 'invalid', // Invalid format
            gpu: '100' // Too many
          }
        };

        // Act & Assert
        await expect(deploymentService.deploy(invalidConfig))
          .rejects.toThrow('Invalid deployment configuration');
      });

      it('should handle deployment failures gracefully', async () => {
        // Arrange
        const deploymentConfig = {
          modelId: 'model-123',
          versionId: 'version-456',
          environment: 'production',
          replicas: 3
        };

        const deploymentError = new Error('Kubernetes API error');
        (prisma.deployment.create as MockedFunction<any>).mockRejectedValue(deploymentError);

        // Act & Assert
        await expect(deploymentService.deploy(deploymentConfig))
          .rejects.toThrow('Kubernetes API error');
        
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: deploymentError }),
          'Deployment failed'
        );
      });
    });

    describe('scaleDeployment', () => {
      it('should scale deployment replicas', async () => {
        // Arrange
        const deploymentId = 'deployment-123';
        const newReplicas = 5;

        const mockDeployment = {
          id: deploymentId,
          replicas: 3,
          status: 'running'
        };

        (prisma.deployment.findUnique as MockedFunction<any>).mockResolvedValue(mockDeployment);
        (prisma.deployment.update as MockedFunction<any>).mockResolvedValue({
          ...mockDeployment,
          replicas: newReplicas
        });

        // Act
        const result = await deploymentService.scale(deploymentId, newReplicas);

        // Assert
        expect(result.replicas).toBe(newReplicas);
        expect(prisma.deployment.update).toHaveBeenCalledWith({
          where: { id: deploymentId },
          data: { replicas: newReplicas }
        });
      });

      it('should prevent scaling below minimum replicas', async () => {
        // Arrange
        const deploymentId = 'deployment-123';
        const invalidReplicas = 0;

        // Act & Assert
        await expect(deploymentService.scale(deploymentId, invalidReplicas))
          .rejects.toThrow('Replicas must be at least 1');
      });
    });
  });

  describe('ModelMonitor', () => {
    describe('collectMetrics', () => {
      it('should collect model performance metrics', async () => {
        // Arrange
        const modelId = 'model-123';
        const mockMetrics = {
          requests: 1000,
          avgLatency: 150,
          p95Latency: 300,
          p99Latency: 450,
          errorRate: 0.01,
          throughput: 100
        };

        (redis.hgetall as MockedFunction<any>).mockResolvedValue(mockMetrics);

        // Act
        const result = await modelMonitor.collectMetrics(modelId);

        // Assert
        expect(result).toEqual(mockMetrics);
        expect(redis.hgetall).toHaveBeenCalledWith(`metrics:${modelId}`);
      });
    });

    describe('checkHealth', () => {
      it('should report healthy model', async () => {
        // Arrange
        const modelId = 'model-123';
        const healthyMetrics = {
          errorRate: 0.01,
          avgLatency: 100,
          throughput: 150
        };

        (redis.hgetall as MockedFunction<any>).mockResolvedValue(healthyMetrics);

        // Act
        const health = await modelMonitor.checkHealth(modelId);

        // Assert
        expect(health).toEqual({
          status: 'healthy',
          metrics: healthyMetrics,
          issues: []
        });
      });

      it('should detect unhealthy model', async () => {
        // Arrange
        const modelId = 'model-456';
        const unhealthyMetrics = {
          errorRate: 0.15, // High error rate
          avgLatency: 1000, // High latency
          throughput: 10 // Low throughput
        };

        (redis.hgetall as MockedFunction<any>).mockResolvedValue(unhealthyMetrics);

        // Act
        const health = await modelMonitor.checkHealth(modelId);

        // Assert
        expect(health.status).toBe('unhealthy');
        expect(health.issues).toContain('High error rate: 15%');
        expect(health.issues).toContain('High latency: 1000ms');
        expect(logger.warn).toHaveBeenCalled();
      });
    });

    describe('detectDrift', () => {
      it('should detect model drift', async () => {
        // Arrange
        const modelId = 'model-123';
        const historicalAccuracy = [0.92, 0.91, 0.90, 0.89, 0.87, 0.85];
        
        (redis.lrange as MockedFunction<any>).mockResolvedValue(
          historicalAccuracy.map(String)
        );

        // Act
        const driftDetected = await modelMonitor.detectDrift(modelId);

        // Assert
        expect(driftDetected).toBe(true);
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ modelId }),
          'Model drift detected'
        );
      });

      it('should not detect drift for stable model', async () => {
        // Arrange
        const modelId = 'model-456';
        const stableAccuracy = [0.92, 0.91, 0.92, 0.91, 0.92, 0.91];
        
        (redis.lrange as MockedFunction<any>).mockResolvedValue(
          stableAccuracy.map(String)
        );

        // Act
        const driftDetected = await modelMonitor.detectDrift(modelId);

        // Assert
        expect(driftDetected).toBe(false);
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete model lifecycle', async () => {
      // Arrange
      const modelData = {
        name: 'lifecycle-test-model',
        version: '1.0.0',
        type: 'language',
        framework: 'pytorch',
        size: 1000000000
      };

      const mockModel = { id: 'model-lifecycle', ...modelData };
      const mockVersion = { id: 'version-1', modelId: mockModel.id, version: '1.0.0' };
      const mockDeployment = { 
        id: 'deployment-1',
        modelId: mockModel.id,
        versionId: mockVersion.id,
        status: 'running'
      };

      (prisma.model.create as MockedFunction<any>).mockResolvedValue(mockModel);
      (prisma.modelVersion.create as MockedFunction<any>).mockResolvedValue(mockVersion);
      (prisma.deployment.create as MockedFunction<any>).mockResolvedValue(mockDeployment);

      // Act
      // 1. Register model
      const model = await modelRegistry.registerModel(modelData);
      
      // 2. Create version
      const version = await versionManager.createVersion({
        modelId: model.id,
        version: '1.0.0',
        changes: 'Initial release'
      });
      
      // 3. Deploy model
      const deployment = await deploymentService.deploy({
        modelId: model.id,
        versionId: version.id,
        environment: 'production',
        replicas: 2
      });

      // Assert
      expect(model.id).toBe('model-lifecycle');
      expect(version.modelId).toBe(model.id);
      expect(deployment.status).toBe('running');
    });

    it('should handle concurrent model operations', async () => {
      // Arrange
      const modelIds = ['model-1', 'model-2', 'model-3'];
      const operations = modelIds.map(id => ({
        register: () => modelRegistry.registerModel({ 
          name: `concurrent-${id}`,
          version: '1.0.0',
          type: 'language',
          framework: 'pytorch',
          size: 1000000000
        }),
        deploy: () => deploymentService.deploy({
          modelId: id,
          versionId: `version-${id}`,
          environment: 'staging',
          replicas: 1
        }),
        monitor: () => modelMonitor.checkHealth(id)
      }));

      // Mock responses
      operations.forEach((_, index) => {
        (prisma.model.create as MockedFunction<any>).mockResolvedValueOnce({
          id: modelIds[index],
          name: `concurrent-${modelIds[index]}`,
          version: '1.0.0'
        });
      });

      // Act
      const results = await Promise.all(
        operations.map(op => op.register())
      );

      // Assert
      expect(results).toHaveLength(3);
      expect(prisma.model.create).toHaveBeenCalledTimes(3);
    });
  });
});