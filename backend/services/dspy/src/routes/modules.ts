import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ModuleRegistration } from '../services/module-registry';

const moduleRoutes: FastifyPluginAsync = async (fastify) => {
  const { moduleRegistry, metricsCollector } = fastify;

  // Request/Response Schemas
  const RegisterModuleRequest = z.object({
    registration: ModuleRegistration,
    module_code: z.string().optional(),
  });

  const UpdateModuleRequest = z.object({
    name: z.string().optional(),
    signature: z.string().optional(),
    description: z.string().optional(),
    category: z.enum(['legal_analysis', 'document_comparison', 'risk_assessment', 'compliance_check', 'custom']).optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).optional(),
    requirements: z.object({
      min_dataset_size: z.number().min(1).optional(),
      supported_languages: z.array(z.string()).optional(),
      max_input_length: z.number().min(100).optional(),
    }).optional(),
  });

  const ListModulesQuery = z.object({
    category: z.enum(['legal_analysis', 'document_comparison', 'risk_assessment', 'compliance_check', 'custom']).optional(),
    status: z.enum(['active', 'deprecated', 'experimental']).optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).optional(),
    limit: z.number().min(1).max(100).default(50).optional(),
    offset: z.number().min(0).default(0).optional(),
  });

  // Register New Module
  fastify.post('/register', {
    schema: {
      body: RegisterModuleRequest,
      response: {
        201: {
          type: 'object',
          properties: {
            module_id: { type: 'string' },
            message: { type: 'string' },
            created_at: { type: 'string' },
          },
        },
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const body = RegisterModuleRequest.parse(request.body);
      
      // Register the module
      const moduleId = await moduleRegistry.registerModule(
        body.registration,
        body.module_code
      );

      // Record registration metric
      await metricsCollector.recordMetric({
        module_name: body.registration.name,
        module_version: body.registration.version,
        operation: 'register',
        input_size: JSON.stringify(body).length,
        output_size: moduleId.length,
        latency_ms: 0,
        success: true,
        metadata: {
          category: body.registration.category,
          has_code: !!body.module_code,
        },
      });

      reply.code(201).send({
        module_id: moduleId,
        message: `Module '${body.registration.name}' registered successfully`,
        created_at: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to register module', { error: error.message });
      
      const statusCode = error.statusCode || 500;
      reply.code(statusCode).send({
        error: error.name || 'ModuleRegistrationError',
        message: statusCode === 500 ? 'Failed to register module' : error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // List All Modules
  fastify.get('/', {
    schema: {
      querystring: ListModulesQuery,
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const query = ListModulesQuery.parse(request.query);
      
      // Build filters
      const filters: any = {};
      if (query.category) filters.category = query.category;
      if (query.status) filters.status = query.status;
      if (query.author) filters.author = query.author;
      if (query.tags) filters.tags = query.tags;

      // Get modules with filters
      const allModules = moduleRegistry.listModules(filters);
      
      // Apply pagination
      const offset = query.offset || 0;
      const limit = query.limit || 50;
      const paginatedModules = allModules.slice(offset, offset + limit);

      // Format response
      const modulesResponse = paginatedModules.map(module => ({
        id: module.id,
        name: module.registration.name,
        description: module.registration.description,
        category: module.registration.category,
        version: module.registration.version,
        author: module.registration.author,
        status: module.status,
        created_at: module.created_at,
        updated_at: module.updated_at,
        usage_count: module.usage_count,
        performance_stats: {
          average_accuracy: module.performance_stats.average_accuracy,
          average_latency_ms: module.performance_stats.average_latency_ms,
          success_rate: module.performance_stats.success_rate,
        },
        tags: module.registration.tags,
      }));

      reply.send({
        modules: modulesResponse,
        total: allModules.length,
        offset,
        limit,
        filters: filters,
      });

    } catch (error) {
      fastify.log.error('Failed to list modules', { error: error.message });
      reply.code(500).send({
        error: 'ModuleListError',
        message: 'Failed to list modules',
      });
    }
  });

  // Get Module Details
  fastify.get('/:moduleId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          moduleId: { type: 'string' },
        },
        required: ['moduleId'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { moduleId } = request.params as { moduleId: string };
      
      const module = moduleRegistry.getModule(moduleId);
      if (!module) {
        reply.code(404).send({
          error: 'ModuleNotFound',
          message: `Module '${moduleId}' not found`,
        });
        return;
      }

      reply.send({
        id: module.id,
        registration: module.registration,
        created_at: module.created_at,
        updated_at: module.updated_at,
        status: module.status,
        usage_count: module.usage_count,
        performance_stats: module.performance_stats,
        optimization_history: module.optimization_history,
        file_path: module.file_path,
      });

    } catch (error) {
      fastify.log.error('Failed to get module details', { error: error.message });
      reply.code(500).send({
        error: 'ModuleDetailsError',
        message: 'Failed to retrieve module details',
      });
    }
  });

  // Update Module
  fastify.put('/:moduleId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          moduleId: { type: 'string' },
        },
        required: ['moduleId'],
      },
      body: UpdateModuleRequest,
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { moduleId } = request.params as { moduleId: string };
      const updates = UpdateModuleRequest.parse(request.body);
      
      // Check if module exists
      const existingModule = moduleRegistry.getModule(moduleId);
      if (!existingModule) {
        reply.code(404).send({
          error: 'ModuleNotFound',
          message: `Module '${moduleId}' not found`,
        });
        return;
      }

      // Check if it's a built-in module
      if (existingModule.id.startsWith('builtin_')) {
        reply.code(403).send({
          error: 'ModificationNotAllowed',
          message: 'Built-in modules cannot be modified',
        });
        return;
      }

      // Update the module
      await moduleRegistry.updateModule(moduleId, updates);

      reply.send({
        message: `Module '${moduleId}' updated successfully`,
        updated_at: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to update module', { error: error.message });
      
      const statusCode = error.statusCode || 500;
      reply.code(statusCode).send({
        error: error.name || 'ModuleUpdateError',
        message: statusCode === 500 ? 'Failed to update module' : error.message,
      });
    }
  });

  // Delete Module
  fastify.delete('/:moduleId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          moduleId: { type: 'string' },
        },
        required: ['moduleId'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { moduleId } = request.params as { moduleId: string };
      
      // Check if module exists
      const existingModule = moduleRegistry.getModule(moduleId);
      if (!existingModule) {
        reply.code(404).send({
          error: 'ModuleNotFound',
          message: `Module '${moduleId}' not found`,
        });
        return;
      }

      // Delete the module
      await moduleRegistry.deleteModule(moduleId);

      reply.send({
        message: `Module '${moduleId}' deleted successfully`,
        deleted_at: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to delete module', { error: error.message });
      
      const statusCode = error.statusCode || 500;
      reply.code(statusCode).send({
        error: error.name || 'ModuleDeletionError',
        message: statusCode === 500 ? 'Failed to delete module' : error.message,
      });
    }
  });

  // Export Module
  fastify.get('/:moduleId/export', {
    schema: {
      params: {
        type: 'object',
        properties: {
          moduleId: { type: 'string' },
        },
        required: ['moduleId'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { moduleId } = request.params as { moduleId: string };
      
      const exportData = await moduleRegistry.exportModule(moduleId);
      
      // Set headers for file download
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="module_${moduleId}.json"`);
      
      reply.send({
        export_version: '1.0',
        exported_at: new Date().toISOString(),
        module: exportData,
      });

    } catch (error) {
      fastify.log.error('Failed to export module', { error: error.message });
      
      const statusCode = error.statusCode || 500;
      reply.code(statusCode).send({
        error: error.name || 'ModuleExportError',
        message: statusCode === 500 ? 'Failed to export module' : error.message,
      });
    }
  });

  // Import Module
  fastify.post('/import', {
    schema: {
      body: {
        type: 'object',
        properties: {
          module_data: {
            type: 'object',
            properties: {
              export_version: { type: 'string' },
              exported_at: { type: 'string' },
              module: {
                type: 'object',
                properties: {
                  metadata: { type: 'object' },
                  code: { type: 'string' },
                },
                required: ['metadata'],
              },
            },
            required: ['module'],
          },
        },
        required: ['module_data'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { module_data } = request.body as { module_data: any };
      
      const moduleId = await moduleRegistry.importModule(module_data.module);

      reply.code(201).send({
        module_id: moduleId,
        message: 'Module imported successfully',
        imported_at: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to import module', { error: error.message });
      
      const statusCode = error.statusCode || 500;
      reply.code(statusCode).send({
        error: error.name || 'ModuleImportError',
        message: statusCode === 500 ? 'Failed to import module' : error.message,
      });
    }
  });

  // Get Module Performance Stats
  fastify.get('/:moduleId/stats', {
    schema: {
      params: {
        type: 'object',
        properties: {
          moduleId: { type: 'string' },
        },
        required: ['moduleId'],
      },
      querystring: {
        type: 'object',
        properties: {
          time_range: { 
            type: 'string', 
            enum: ['1h', '24h', '7d', '30d'],
            default: '24h'
          },
        },
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { moduleId } = request.params as { moduleId: string };
      const { time_range } = request.query as { time_range?: string };
      
      const module = moduleRegistry.getModule(moduleId);
      if (!module) {
        reply.code(404).send({
          error: 'ModuleNotFound',
          message: `Module '${moduleId}' not found`,
        });
        return;
      }

      // Calculate time range
      const now = new Date();
      const timeRangeMs = {
        '1h': 3600000,
        '24h': 86400000,
        '7d': 604800000,
        '30d': 2592000000,
      };
      
      const startTime = new Date(now.getTime() - timeRangeMs[time_range || '24h']);
      
      // Get metrics for this module in the time range
      const metrics = await metricsCollector.getMetricsSummary({
        start: startTime.toISOString(),
        end: now.toISOString(),
      });

      // Filter metrics for this specific module
      const moduleUsage = metrics.modules_by_usage[module.registration.name] || 0;

      reply.send({
        module_id: moduleId,
        module_name: module.registration.name,
        time_range: time_range || '24h',
        stats: {
          usage_count: moduleUsage,
          performance_stats: module.performance_stats,
          recent_metrics: {
            operations: moduleUsage,
            average_latency_ms: module.performance_stats.average_latency_ms,
            success_rate: module.performance_stats.success_rate,
            average_accuracy: module.performance_stats.average_accuracy,
          },
          optimization_history: module.optimization_history.slice(-10), // Last 10 optimizations
        },
        generated_at: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to get module stats', { error: error.message });
      reply.code(500).send({
        error: 'ModuleStatsError',
        message: 'Failed to retrieve module statistics',
      });
    }
  });

  // Get Registry Statistics
  fastify.get('/registry/stats', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const registryStats = moduleRegistry.getRegistryStats();
      
      reply.send({
        registry_statistics: registryStats,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      fastify.log.error('Failed to get registry stats', { error: error.message });
      reply.code(500).send({
        error: 'RegistryStatsError',
        message: 'Failed to retrieve registry statistics',
      });
    }
  });

  // Search Modules
  fastify.get('/search', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', minLength: 1 },
          category: z.enum(['legal_analysis', 'document_comparison', 'risk_assessment', 'compliance_check', 'custom']).optional(),
          limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
        },
        required: ['q'],
      },
    },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { q, category, limit } = request.query as {
        q: string;
        category?: string;
        limit?: number;
      };

      const searchQuery = q.toLowerCase();
      const maxResults = limit || 20;

      // Get all modules
      let modules = moduleRegistry.listModules(category ? { category: category as any } : undefined);

      // Simple text search in name, description, and tags
      const matchedModules = modules.filter(module => {
        const nameMatch = module.registration.name.toLowerCase().includes(searchQuery);
        const descriptionMatch = module.registration.description.toLowerCase().includes(searchQuery);
        const tagMatch = module.registration.tags?.some(tag => 
          tag.toLowerCase().includes(searchQuery)
        ) || false;
        
        return nameMatch || descriptionMatch || tagMatch;
      });

      // Sort by relevance (name matches first, then description, then tags)
      matchedModules.sort((a, b) => {
        const aNameMatch = a.registration.name.toLowerCase().includes(searchQuery);
        const bNameMatch = b.registration.name.toLowerCase().includes(searchQuery);
        
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;
        
        // If both or neither have name matches, sort by usage count
        return b.usage_count - a.usage_count;
      });

      // Limit results
      const limitedResults = matchedModules.slice(0, maxResults);

      reply.send({
        query: q,
        category_filter: category,
        results: limitedResults.map(module => ({
          id: module.id,
          name: module.registration.name,
          description: module.registration.description,
          category: module.registration.category,
          version: module.registration.version,
          author: module.registration.author,
          usage_count: module.usage_count,
          tags: module.registration.tags,
          relevance_score: calculateRelevanceScore(module, searchQuery),
        })),
        total_matches: matchedModules.length,
        returned: limitedResults.length,
      });

    } catch (error) {
      fastify.log.error('Failed to search modules', { error: error.message });
      reply.code(500).send({
        error: 'ModuleSearchError',
        message: 'Failed to search modules',
      });
    }
  });

  // Helper function to calculate relevance score
  function calculateRelevanceScore(module: any, query: string): number {
    let score = 0;
    const lowerQuery = query.toLowerCase();
    
    // Name match (highest weight)
    if (module.registration.name.toLowerCase().includes(lowerQuery)) {
      score += 10;
      if (module.registration.name.toLowerCase() === lowerQuery) {
        score += 5; // Exact match bonus
      }
    }
    
    // Description match
    if (module.registration.description.toLowerCase().includes(lowerQuery)) {
      score += 3;
    }
    
    // Tag match
    if (module.registration.tags?.some((tag: string) => 
      tag.toLowerCase().includes(lowerQuery)
    )) {
      score += 2;
    }
    
    // Usage count factor (normalized)
    score += Math.min(module.usage_count / 100, 2);
    
    return score;
  }
};

export { moduleRoutes };