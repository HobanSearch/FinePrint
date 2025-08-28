import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const ModelsRoutes: FastifyPluginAsync = async (fastify) => {
  // Model schema
  const ModelSchema = z.object({
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    size: z.number().optional(),
    parameters: z.number().optional(),
    architecture: z.string().optional(),
    baseModel: z.string().optional()
  });

  // List available models
  fastify.get('/list', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          baseModel: { type: 'string' },
          tags: {
            type: 'array',
            items: { type: 'string' }
          },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            models: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  version: { type: 'string' },
                  description: { type: 'string' },
                  tags: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  size: { type: 'number' },
                  parameters: { type: 'number' },
                  architecture: { type: 'string' },
                  baseModel: { type: 'string' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' }
                }
              }
            },
            total: { type: 'number' },
            limit: { type: 'number' },
            offset: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { baseModel, tags, limit, offset } = request.query as { baseModel?: string; tags?: string[]; limit: number; offset: number };
      const result = await fastify.gatedLoRAService.listModels({
        baseModel,
        tags,
        limit,
        offset
      });
      
      return reply.code(200).send(result);
    } catch (error) {
      fastify.log.error('Failed to list models:', error);
      return reply.code(500).send({
        models: [],
        total: 0,
        limit: 20,
        offset: 0
      });
    }
  });

  // Get model details
  fastify.get('/:modelName/:version', {
    schema: {
      params: {
        type: 'object',
        required: ['modelName', 'version'],
        properties: {
          modelName: { type: 'string' },
          version: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            description: { type: 'string' },
            tags: {
              type: 'array',
              items: { type: 'string' }
            },
            size: { type: 'number' },
            parameters: { type: 'number' },
            architecture: { type: 'string' },
            baseModel: { type: 'string' },
            adapters: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  adapterId: { type: 'string' },
                  name: { type: 'string' },
                  status: { type: 'string' },
                  createdAt: { type: 'string' }
                }
              }
            },
            metrics: {
              type: 'object',
              properties: {
                accuracy: { type: 'number' },
                f1Score: { type: 'number' },
                precision: { type: 'number' },
                recall: { type: 'number' },
                perplexity: { type: 'number' }
              }
            },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { modelName, version } = request.params as { modelName: string; version: string };
      const model = await fastify.gatedLoRAService.getModelDetails(modelName, version);
      
      return reply.code(200).send(model);
    } catch (error) {
      fastify.log.error('Failed to get model details:', error);
      return reply.code(404).send({
        message: 'Model not found'
      });
    }
  });

  // Register a new model
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'version'],
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          description: { type: 'string' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            default: []
          },
          size: { type: 'number' },
          parameters: { type: 'number' },
          architecture: { type: 'string' },
          baseModel: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            modelId: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const modelData = request.body as z.infer<typeof ModelSchema>;
      const result = await fastify.gatedLoRAService.registerModel(modelData);
      
      return reply.code(201).send({
        success: true,
        modelId: result.modelId,
        message: 'Model registered successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to register model:', error);
      return reply.code(500).send({
        success: false,
        modelId: '',
        message: 'Failed to register model'
      });
    }
  });

  // Update model metadata
  fastify.put('/:modelName/:version', {
    schema: {
      params: {
        type: 'object',
        required: ['modelName', 'version'],
        properties: {
          modelName: { type: 'string' },
          version: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          description: { type: 'string' },
          tags: {
            type: 'array',
            items: { type: 'string' }
          },
          size: { type: 'number' },
          parameters: { type: 'number' },
          architecture: { type: 'string' },
          baseModel: { type: 'string' }
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
      const { modelName, version } = request.params as { modelName: string; version: string };
      const updates = request.body as Partial<z.infer<typeof ModelSchema>>;
      
      await fastify.gatedLoRAService.updateModel(modelName, version, updates);
      
      return reply.code(200).send({
        success: true,
        message: 'Model updated successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to update model:', error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to update model'
      });
    }
  });

  // Delete model
  fastify.delete('/:modelName/:version', {
    schema: {
      params: {
        type: 'object',
        required: ['modelName', 'version'],
        properties: {
          modelName: { type: 'string' },
          version: { type: 'string' }
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
      const { modelName, version } = request.params as { modelName: string; version: string };
      await fastify.gatedLoRAService.deleteModel(modelName, version);
      
      return reply.code(200).send({
        success: true,
        message: 'Model deleted successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to delete model:', error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to delete model'
      });
    }
  });

  // Download model
  fastify.get('/:modelName/:version/download', {
    schema: {
      params: {
        type: 'object',
        required: ['modelName', 'version'],
        properties: {
          modelName: { type: 'string' },
          version: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['pytorch', 'onnx', 'tensorrt'], default: 'pytorch' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { modelName, version } = request.params as { modelName: string; version: string };
      const { format } = request.query as { format: 'pytorch' | 'onnx' | 'tensorrt' };
      
      const downloadUrl = await fastify.gatedLoRAService.getModelDownloadUrl(
        modelName,
        version,
        format
      );
      
      return reply.redirect(302, downloadUrl);
    } catch (error) {
      fastify.log.error('Failed to get model download URL:', error);
      return reply.code(404).send({
        message: 'Model download not available'
      });
    }
  });

  // Upload model file
  fastify.post('/:modelName/:version/upload', {
    schema: {
      params: {
        type: 'object',
        required: ['modelName', 'version'],
        properties: {
          modelName: { type: 'string' },
          version: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { modelName, version } = request.params as { modelName: string; version: string };
      
      // Handle multipart file upload
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      const result = await fastify.gatedLoRAService.uploadModelFile(
        modelName,
        version,
        data
      );
      
      return reply.code(200).send({
        success: true,
        fileId: result.fileId,
        message: 'Model file uploaded successfully'
      });
    } catch (error) {
      fastify.log.error('Failed to upload model file:', error);
      return reply.code(500).send({
        success: false,
        message: 'Failed to upload model file'
      });
    }
  });
};

export default ModelsRoutes;