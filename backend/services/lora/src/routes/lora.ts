import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const LoRARoutes: FastifyPluginAsync = async (fastify) => {
  // Schema for LoRA configuration
  const LoRAConfigSchema = z.object({
    modelName: z.string(),
    taskType: z.enum(['classification', 'generation', 'extraction']),
    rank: z.number().min(1).max(256).default(16),
    alpha: z.number().min(1).max(512).default(32),
    dropout: z.number().min(0).max(1).default(0.1),
    targetModules: z.array(z.string()).default(['q_proj', 'v_proj']),
    datasetPath: z.string(),
    outputDir: z.string()
  });

  // Create LoRA adapter
  fastify.post('/create', {
    schema: {
      body: {
        type: 'object',
        required: ['modelName', 'taskType', 'datasetPath', 'outputDir'],
        properties: {
          modelName: { type: 'string' },
          taskType: { type: 'string', enum: ['classification', 'generation', 'extraction'] },
          rank: { type: 'number', minimum: 1, maximum: 256, default: 16 },
          alpha: { type: 'number', minimum: 1, maximum: 512, default: 32 },
          dropout: { type: 'number', minimum: 0, maximum: 1, default: 0.1 },
          targetModules: { type: 'array', items: { type: 'string' }, default: ['q_proj', 'v_proj'] },
          datasetPath: { type: 'string' },
          outputDir: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            adapterId: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const config = request.body as z.infer<typeof LoRAConfigSchema>;
      
      // Create LoRA adapter with the gated LoRA service
      const gatedLoRAConfig = {
        rank: config.rank,
        alpha: config.alpha,
        dropout: config.dropout,
        gate_threshold: 0.5,
        num_gates: 8,
        target_modules: config.targetModules,
        gate_type: 'hybrid' as const,
        scaling_factor: 1.0,
        enable_bias: true,
        gate_init_strategy: 'xavier' as const
      };
      
      const adapterId = await fastify.gatedLoRAService.createAdapter(
        `${config.modelName}_${config.taskType}`,
        `LoRA adapter for ${config.taskType} task`,
        config.modelName,
        gatedLoRAConfig,
        [config.taskType]
      );
      
      return reply.code(200).send({
        success: true,
        adapterId,
        message: 'LoRA adapter created successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to create LoRA adapter:', error);
      return reply.code(500).send({
        success: false,
        adapterId: '',
        message: 'Failed to create LoRA adapter'
      });
    }
  });

  // Get LoRA adapter status
  fastify.get('/status/:adapterId', {
    schema: {
      params: {
        type: 'object',
        required: ['adapterId'],
        properties: {
          adapterId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            adapterId: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'training', 'completed', 'failed'] },
            progress: { type: 'number', minimum: 0, maximum: 100 },
            metrics: {
              type: 'object',
              properties: {
                loss: { type: 'number' },
                accuracy: { type: 'number' },
                epochsCompleted: { type: 'number' },
                totalEpochs: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { adapterId } = request.params as { adapterId: string };
      const status = await fastify.gatedLoRAService.getAdapterStatus(adapterId);
      
      return reply.code(200).send(status);
    } catch (error) {
      fastify.log.error('Failed to get adapter status:', error);
      const { adapterId } = request.params as { adapterId: string };
      return reply.code(404).send({
        adapterId,
        status: 'failed',
        progress: 0
      });
    }
  });

  // List all LoRA adapters
  fastify.get('/list', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            adapters: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  adapterId: { type: 'string' },
                  modelName: { type: 'string' },
                  status: { type: 'string', enum: ['pending', 'training', 'completed', 'failed'] },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const adapters = await fastify.gatedLoRAService.listAdapters();
      return reply.code(200).send({ adapters });
    } catch (error) {
      fastify.log.error('Failed to list adapters:', error);
      return reply.code(500).send({ adapters: [] });
    }
  });

  // Delete LoRA adapter
  fastify.delete('/:adapterId', {
    schema: {
      params: {
        type: 'object',
        required: ['adapterId'],
        properties: {
          adapterId: { type: 'string' }
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
      const { adapterId } = request.params as { adapterId: string };
      await fastify.gatedLoRAService.deleteAdapter(adapterId);
      
      return reply.code(200).send({
        success: true,
        message: 'LoRA adapter deleted successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to delete adapter:', error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to delete LoRA adapter'
      });
    }
  });
};

export default LoRARoutes;