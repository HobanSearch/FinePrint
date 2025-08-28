import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const ModelManagementRoutes: FastifyPluginAsync = async (fastify) => {
  // Model selection context schema
  const ModelSelectionContextSchema = z.object({
    domain: z.enum(['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support']),
    userTier: z.string().optional(),
    requestPriority: z.enum(['low', 'medium', 'high']).optional(),
    latencyRequirement: z.number().optional(),
    accuracyRequirement: z.number().optional(),
    sessionId: z.string().optional()
  });

  // Get best model for context
  fastify.post('/select', {
    schema: {
      body: {
        type: 'object',
        required: ['domain'],
        properties: {
          domain: { 
            type: 'string', 
            enum: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'] 
          },
          userTier: { type: 'string' },
          requestPriority: { type: 'string', enum: ['low', 'medium', 'high'] },
          latencyRequirement: { type: 'number' },
          accuracyRequirement: { type: 'number' },
          sessionId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            version: { type: 'string' },
            modelName: { type: 'string' },
            endpoint: { type: 'string' },
            performance: {
              type: 'object',
              properties: {
                accuracy: { type: 'number' },
                latency: { type: 'number' },
                throughput: { type: 'number' },
                errorRate: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const context = ModelSelectionContextSchema.parse(request.body);
      const model = await fastify.multiModelManager.selectModel(context);
      
      if (!model) {
        return reply.code(404).send({
          error: 'No suitable model found for the given context'
        });
      }

      return reply.code(200).send({
        version: model.version,
        modelName: model.deploymentInfo?.modelName || `${context.domain}-${model.version}`,
        endpoint: model.deploymentInfo?.endpoint || '',
        performance: model.performance
      });
    } catch (error) {
      fastify.log.error('Failed to select model:', error);
      return reply.code(500).send({
        error: 'Failed to select model'
      });
    }
  });

  // List all models for a domain
  fastify.get('/domain/:domain', {
    schema: {
      params: {
        type: 'object',
        required: ['domain'],
        properties: {
          domain: { 
            type: 'string', 
            enum: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'] 
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            domain: { type: 'string' },
            activeVersion: { type: 'string' },
            selectionStrategy: { type: 'string' },
            models: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  version: { type: 'string' },
                  status: { type: 'string' },
                  createdAt: { type: 'string' },
                  performance: {
                    type: 'object',
                    properties: {
                      accuracy: { type: 'number' },
                      latency: { type: 'number' },
                      throughput: { type: 'number' },
                      errorRate: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { domain } = request.params as { domain: string };
      const config = await fastify.multiModelManager.getDomainConfig(domain);
      
      if (!config) {
        return reply.code(404).send({
          error: `Domain ${domain} not found`
        });
      }

      return reply.code(200).send({
        domain: config.domain,
        activeVersion: config.activeVersion,
        selectionStrategy: config.selectionStrategy,
        models: config.versions.map(v => ({
          version: v.version,
          status: v.status,
          createdAt: v.createdAt.toISOString(),
          performance: v.performance
        }))
      });
    } catch (error) {
      fastify.log.error('Failed to get domain models:', error);
      return reply.code(500).send({
        error: 'Failed to get domain models'
      });
    }
  });

  // Promote model to active
  fastify.post('/promote', {
    schema: {
      body: {
        type: 'object',
        required: ['domain', 'version'],
        properties: {
          domain: { 
            type: 'string', 
            enum: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'] 
          },
          version: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            previousVersion: { type: 'string' },
            newVersion: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { domain, version } = request.body as { domain: string; version: string };
      
      // Get current active version before promotion
      const config = await fastify.multiModelManager.getDomainConfig(domain);
      const previousVersion = config?.activeVersion || '';
      
      await fastify.multiModelManager.promoteModel(domain, version);
      
      return reply.code(200).send({
        success: true,
        message: `Model ${version} promoted to active for domain ${domain}`,
        previousVersion,
        newVersion: version
      });
    } catch (error) {
      fastify.log.error('Failed to promote model:', error);
      return reply.code(500).send({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to promote model',
        previousVersion: '',
        newVersion: ''
      });
    }
  });

  // Rollback model
  fastify.post('/rollback', {
    schema: {
      body: {
        type: 'object',
        required: ['domain'],
        properties: {
          domain: { 
            type: 'string', 
            enum: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'] 
          },
          targetVersion: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            rolledBackTo: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { domain, targetVersion } = request.body as { domain: string; targetVersion?: string };
      
      await fastify.multiModelManager.rollbackModel(domain, targetVersion);
      
      const config = await fastify.multiModelManager.getDomainConfig(domain);
      
      return reply.code(200).send({
        success: true,
        message: `Model rolled back for domain ${domain}`,
        rolledBackTo: config?.activeVersion || ''
      });
    } catch (error) {
      fastify.log.error('Failed to rollback model:', error);
      return reply.code(500).send({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to rollback model',
        rolledBackTo: ''
      });
    }
  });

  // Update model performance
  fastify.post('/performance', {
    schema: {
      body: {
        type: 'object',
        required: ['domain', 'version', 'metrics'],
        properties: {
          domain: { 
            type: 'string', 
            enum: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'] 
          },
          version: { type: 'string' },
          metrics: {
            type: 'object',
            properties: {
              accuracy: { type: 'number' },
              latency: { type: 'number' },
              throughput: { type: 'number' },
              errorRate: { type: 'number' }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { domain, version, metrics } = request.body as {
        domain: string;
        version: string;
        metrics: Partial<{
          accuracy: number;
          latency: number;
          throughput: number;
          errorRate: number;
        }>;
      };
      
      await fastify.multiModelManager.updateModelPerformance(domain, version, metrics);
      
      return reply.code(200).send({
        success: true,
        message: 'Model performance updated successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to update model performance:', error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to update model performance'
      });
    }
  });

  // Get A/B test results
  fastify.get('/ab-test/:domain', {
    schema: {
      params: {
        type: 'object',
        required: ['domain'],
        properties: {
          domain: { 
            type: 'string', 
            enum: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'] 
          }
        }
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              requestCount: { type: 'number' },
              successRate: { type: 'number' },
              errorRate: { type: 'number' },
              averageLatency: { type: 'number' },
              p95Latency: { type: 'number' },
              p99Latency: { type: 'number' },
              performance: {
                type: 'object',
                properties: {
                  accuracy: { type: 'number' },
                  latency: { type: 'number' },
                  throughput: { type: 'number' },
                  errorRate: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { domain } = request.params as { domain: string };
      const results = await fastify.multiModelManager.getABTestResults(domain);
      
      return reply.code(200).send(results);
    } catch (error) {
      fastify.log.error('Failed to get A/B test results:', error);
      return reply.code(500).send({});
    }
  });

  // Configure domain model selection
  fastify.put('/configure/:domain', {
    schema: {
      params: {
        type: 'object',
        required: ['domain'],
        properties: {
          domain: { 
            type: 'string', 
            enum: ['legal_analysis', 'marketing_content', 'sales_communication', 'customer_support'] 
          }
        }
      },
      body: {
        type: 'object',
        properties: {
          selectionStrategy: { 
            type: 'string', 
            enum: ['latest', 'best_performance', 'lowest_latency', 'ab_test'] 
          },
          autoUpdate: { type: 'boolean' },
          performanceThresholds: {
            type: 'object',
            properties: {
              minAccuracy: { type: 'number' },
              maxLatency: { type: 'number' },
              maxErrorRate: { type: 'number' }
            }
          },
          abTestConfig: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              distribution: {
                type: 'object',
                additionalProperties: { type: 'number' }
              }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { domain } = request.params as { domain: string };
      const updates = request.body as any;
      
      await fastify.multiModelManager.updateDomainConfig(domain, updates);
      
      return reply.code(200).send({
        success: true,
        message: `Domain ${domain} configuration updated`
      });
    } catch (error) {
      fastify.log.error('Failed to update domain configuration:', error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to update domain configuration'
      });
    }
  });
};

export default ModelManagementRoutes;