import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { CodeGenerationEngine } from '@/services/code-generation-engine';
import { CodeGenerationRequestSchema, APIResponse } from '@/types';
import { Logger } from '@/utils/logger';

const logger = Logger.getInstance();
const codeGenEngine = new CodeGenerationEngine();

// Route schemas
const generateCodeSchema = {
  body: CodeGenerationRequestSchema,
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            generatedCode: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  content: { type: 'string' },
                  type: { type: 'string' },
                  language: { type: 'string' },
                  dependencies: { type: 'array', items: { type: 'string' } },
                  description: { type: 'string' },
                },
              },
            },
            qualityScore: { type: 'number' },
            recommendations: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
};

const batchGenerateSchema = {
  body: {
    type: 'object',
    properties: {
      requests: {
        type: 'array',
        items: CodeGenerationRequestSchema,
      },
    },
    required: ['requests'],
  },
};

const enhanceCodeSchema = {
  body: {
    type: 'object',
    properties: {
      code: { type: 'string' },
      language: { type: 'string' },
      enhancementType: {
        type: 'string',
        enum: ['performance', 'security', 'maintainability', 'accessibility'],
      },
      context: { type: 'object' },
    },
    required: ['code', 'language', 'enhancementType'],
  },
};

const refactorCodeSchema = {
  body: {
    type: 'object',
    properties: {
      code: { type: 'string' },
      language: { type: 'string' },
      refactoringPattern: { type: 'string' },
      options: { type: 'object' },
    },
    required: ['code', 'language', 'refactoringPattern'],
  },
};

const generateFromDescriptionSchema = {
  body: {
    type: 'object',
    properties: {
      description: { type: 'string' },
      framework: { type: 'string' },
      language: { type: 'string' },
      context: { type: 'object' },
    },
    required: ['description', 'framework', 'language'],
  },
};

export default async function codeGenerationRoutes(
  fastify: FastifyInstance
): Promise<void> {
  
  /**
   * Generate code from structured request
   */
  fastify.post<{
    Body: z.infer<typeof CodeGenerationRequestSchema>;
  }>('/', {
    schema: generateCodeSchema,
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const startTime = Date.now();
      logger.info('Code generation request received', { 
        userId: request.user?.id,
        type: request.body.type,
        framework: request.body.framework,
      });

      const result = await codeGenEngine.generateCode(request.body as any);
      
      const processingTime = Date.now() - startTime;
      logger.info('Code generation completed', {
        requestId: result.id,
        processingTime,
        filesGenerated: result.generatedCode.length,
        qualityScore: result.qualityScore,
      });

      const response: APIResponse = {
        success: true,
        data: result,
        metadata: {
          requestId: result.id,
          timestamp: new Date(),
          processingTime,
          version: '1.0.0',
        },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Code generation failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'CODE_GENERATION_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Batch generate multiple code components
   */
  fastify.post('/batch', {
    schema: batchGenerateSchema,
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { requests } = request.body as { requests: any[] };
      
      logger.info('Batch code generation request received', {
        userId: request.user?.id,
        requestCount: requests.length,
      });

      const results = await codeGenEngine.batchGenerate(requests);
      
      const totalFiles = results.reduce((sum, r) => sum + r.generatedCode.length, 0);
      const avgQualityScore = results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length;

      logger.info('Batch code generation completed', {
        requestCount: requests.length,
        totalFiles,
        avgQualityScore,
      });

      const response: APIResponse = {
        success: true,
        data: {
          results,
          summary: {
            totalRequests: requests.length,
            totalFiles,
            averageQualityScore: avgQualityScore,
          },
        },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Batch code generation failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'BATCH_GENERATION_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Enhance existing code
   */
  fastify.post('/enhance', {
    schema: enhanceCodeSchema,
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { code, language, enhancementType, context } = request.body as {
        code: string;
        language: string;
        enhancementType: string;
        context?: Record<string, any>;
      };

      logger.info('Code enhancement request received', {
        userId: request.user?.id,
        language,
        enhancementType,
      });

      const result = await codeGenEngine.enhanceCode(
        code,
        language,
        enhancementType as any,
        context
      );

      logger.info('Code enhancement completed', {
        changesCount: result.changes.length,
        complexity: result.metrics.complexity,
      });

      const response: APIResponse = {
        success: true,
        data: result,
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Code enhancement failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'CODE_ENHANCEMENT_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Refactor code using patterns
   */
  fastify.post('/refactor', {
    schema: refactorCodeSchema,
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { code, language, refactoringPattern, options } = request.body as {
        code: string;
        language: string;
        refactoringPattern: string;
        options?: Record<string, any>;
      };

      logger.info('Code refactoring request received', {
        userId: request.user?.id,
        language,
        refactoringPattern,
      });

      const result = await codeGenEngine.refactorCode(
        code,
        language,
        refactoringPattern,
        options || {}
      );

      logger.info('Code refactoring completed', {
        changesCount: result.changes.length,
        complexityImpact: result.impact.complexity,
      });

      const response: APIResponse = {
        success: true,
        data: result,
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Code refactoring failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'CODE_REFACTORING_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Generate code from natural language description
   */
  fastify.post('/from-description', {
    schema: generateFromDescriptionSchema,
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { description, framework, language, context } = request.body as {
        description: string;
        framework: string;
        language: string;
        context?: Record<string, any>;
      };

      logger.info('Natural language code generation request received', {
        userId: request.user?.id,
        framework,
        language,
        descriptionLength: description.length,
      });

      const result = await codeGenEngine.generateFromDescription(
        description,
        framework,
        language,
        context
      );

      logger.info('Natural language code generation completed', {
        requestId: result.id,
        filesGenerated: result.generatedCode.length,
        qualityScore: result.qualityScore,
      });

      const response: APIResponse = {
        success: true,
        data: result,
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Natural language code generation failed', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'NL_GENERATION_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Get generation history
   */
  fastify.get('/history', {
    preHandler: fastify.auth([fastify.verifyJWT]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // This would typically query a database
      // For now, return empty history
      const response: APIResponse = {
        success: true,
        data: {
          history: [],
          total: 0,
        },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Failed to get generation history', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'HISTORY_FETCH_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });

  /**
   * Get supported frameworks and languages
   */
  fastify.get('/capabilities', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const response: APIResponse = {
        success: true,
        data: {
          frameworks: [
            'react',
            'vue',
            'angular',
            'svelte',
            'nextjs',
            'nuxt',
            'express',
            'fastify',
            'nestjs',
            'django',
            'flask',
            'spring',
            'laravel',
          ],
          languages: [
            'typescript',
            'javascript',
            'python',
            'java',
            'go',
            'rust',
            'php',
            'ruby',
            'csharp',
            'sql',
            'html',
            'css',
            'yaml',
            'json',
            'markdown',
          ],
          types: [
            'component',
            'service',
            'api',
            'database',
            'infrastructure',
            'test',
            'documentation',
          ],
          enhancementTypes: [
            'performance',
            'security',
            'maintainability',
            'accessibility',
          ],
          refactoringPatterns: [
            'extract-function',
            'extract-class',
            'inline-function',
            'move-method',
            'rename-variable',
            'introduce-parameter',
            'extract-interface',
            'strategy-pattern',
            'observer-pattern',
            'factory-pattern',
          ],
        },
      };

      return reply.send(response);
    } catch (error) {
      logger.error('Failed to get capabilities', { error: error.message });
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'CAPABILITIES_FETCH_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      };

      return reply.status(500).send(response);
    }
  });
}