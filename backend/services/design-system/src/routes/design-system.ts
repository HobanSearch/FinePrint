/**
 * Design System API Routes
 * Provides endpoints for managing design systems, tokens, themes, and components
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

// Request/Response schemas
const CreateTokenSchema = z.object({
  name: z.string(),
  category: z.enum(['color', 'typography', 'spacing', 'shadow', 'border', 'animation']),
  value: z.any(),
  description: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
})

const UpdateTokenSchema = CreateTokenSchema.partial()

const CreateThemeSchema = z.object({
  name: z.string(),
  variant: z.enum(['light', 'dark', 'high-contrast', 'custom']),
  tokens: z.record(z.any()),
  metadata: z.record(z.any()).optional(),
})

const CreateComponentSchema = z.object({
  name: z.string(),
  category: z.string(),
  variants: z.array(z.string()),
  props: z.record(z.any()),
  styles: z.record(z.any()),
  accessibility: z.record(z.any()),
  documentation: z.string().optional(),
})

const ExportSchema = z.object({
  format: z.enum(['json', 'css', 'scss', 'tokens']),
})

export async function designSystemRoutes(fastify: FastifyInstance): Promise<void> {
  // ===== DESIGN TOKENS =====

  // Create design token
  fastify.post('/tokens', {
    schema: {
      tags: ['Design Tokens'],
      description: 'Create a new design token',
      body: CreateTokenSchema,
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                category: { type: 'string' },
                value: {},
                createdAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const token = await fastify.designSystemEngine.createToken(request.body)
    reply.code(201).send({
      success: true,
      data: token,
    })
  })

  // Get design token
  fastify.get('/tokens/:id', {
    schema: {
      tags: ['Design Tokens'],
      description: 'Get a design token by ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const token = await fastify.designSystemEngine.getToken(id)
    
    if (!token) {
      reply.code(404).send({
        success: false,
        error: 'Token not found',
      })
      return
    }

    reply.send({
      success: true,
      data: token,
    })
  })

  // Update design token
  fastify.put('/tokens/:id', {
    schema: {
      tags: ['Design Tokens'],
      description: 'Update a design token',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      body: UpdateTokenSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const token = await fastify.designSystemEngine.updateToken(id, request.body)
    
    reply.send({
      success: true,
      data: token,
    })
  })

  // Search design tokens
  fastify.get('/tokens/search', {
    schema: {
      tags: ['Design Tokens'],
      description: 'Search design tokens',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          category: { type: 'string' },
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const { q, category, limit = 50, offset = 0 } = request.query as any

    let tokens = []
    
    if (q) {
      tokens = await fastify.designSystemEngine.searchTokens(q)
    } else if (category) {
      tokens = await fastify.designSystemEngine.getTokensByCategory(category)
    }

    // Apply pagination
    const paginatedTokens = tokens.slice(offset, offset + limit)

    reply.send({
      success: true,
      data: {
        tokens: paginatedTokens,
        total: tokens.length,
        limit,
        offset,
      },
    })
  })

  // ===== THEMES =====

  // Create theme
  fastify.post('/themes', {
    schema: {
      tags: ['Themes'],
      description: 'Create a new theme',
      body: CreateThemeSchema,
    },
  }, async (request, reply) => {
    const theme = await fastify.designSystemEngine.createTheme(request.body)
    reply.code(201).send({
      success: true,
      data: theme,
    })
  })

  // Get theme
  fastify.get('/themes/:id', {
    schema: {
      tags: ['Themes'],
      description: 'Get a theme by ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const theme = await fastify.designSystemEngine.getTheme(id)
    
    if (!theme) {
      reply.code(404).send({
        success: false,
        error: 'Theme not found',
      })
      return
    }

    reply.send({
      success: true,
      data: theme,
    })
  })

  // Generate theme variant
  fastify.post('/themes/:id/variants', {
    schema: {
      tags: ['Themes'],
      description: 'Generate a theme variant',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          variant: { type: 'string', enum: ['light', 'dark', 'high-contrast'] },
        },
        required: ['variant'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { variant } = request.body as { variant: 'light' | 'dark' | 'high-contrast' }
    
    const themeVariant = await fastify.designSystemEngine.generateThemeVariant(id, variant)
    
    reply.code(201).send({
      success: true,
      data: themeVariant,
    })
  })

  // ===== COMPONENTS =====

  // Create component
  fastify.post('/components', {
    schema: {
      tags: ['Components'],
      description: 'Create a new component',
      body: CreateComponentSchema,
    },
  }, async (request, reply) => {
    const component = await fastify.designSystemEngine.createComponent(request.body)
    reply.code(201).send({
      success: true,
      data: component,
    })
  })

  // Get component
  fastify.get('/components/:id', {
    schema: {
      tags: ['Components'],
      description: 'Get a component by ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const component = await fastify.designSystemEngine.getComponent(id)
    
    if (!component) {
      reply.code(404).send({
        success: false,
        error: 'Component not found',
      })
      return
    }

    reply.send({
      success: true,
      data: component,
    })
  })

  // Get component library
  fastify.get('/components', {
    schema: {
      tags: ['Components'],
      description: 'Get component library',
    },
  }, async (request, reply) => {
    const library = await fastify.designSystemEngine.getComponentLibrary()
    
    reply.send({
      success: true,
      data: library,
    })
  })

  // ===== DESIGN SYSTEM MANAGEMENT =====

  // Create design system
  fastify.post('/systems', {
    schema: {
      tags: ['Design Systems'],
      description: 'Create a new design system',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          tokens: { type: 'object' },
          themes: { type: 'array', items: { type: 'string' } },
          components: { type: 'array', items: { type: 'string' } },
          config: { type: 'object' },
        },
        required: ['name', 'version'],
      },
    },
  }, async (request, reply) => {
    const designSystem = await fastify.designSystemEngine.createDesignSystem(request.body)
    reply.code(201).send({
      success: true,
      data: designSystem,
    })
  })

  // Export design system
  fastify.post('/systems/:id/export', {
    schema: {
      tags: ['Design Systems'],
      description: 'Export design system in various formats',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      body: ExportSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                format: { type: 'string' },
                content: { type: 'string' },
                filename: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { format } = request.body as { format: 'json' | 'css' | 'scss' | 'tokens' }
    
    const content = await fastify.designSystemEngine.exportDesignSystem(id, format)
    
    const extensions = {
      json: 'json',
      css: 'css',
      scss: 'scss',
      tokens: 'json',
    }
    
    reply.send({
      success: true,
      data: {
        format,
        content,
        filename: `design-system.${extensions[format]}`,
      },
    })
  })

  // ===== REAL-TIME UPDATES =====

  // WebSocket endpoint for real-time design system updates
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, request) => {
      fastify.log.info('Design system WebSocket connection established')
      
      connection.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString())
          
          switch (data.type) {
            case 'subscribe':
              // Subscribe to design system updates
              connection.send(JSON.stringify({
                type: 'subscribed',
                data: { designSystemId: data.designSystemId },
              }))
              break
              
            case 'ping':
              connection.send(JSON.stringify({ type: 'pong' }))
              break
              
            default:
              connection.send(JSON.stringify({
                type: 'error',
                message: `Unknown message type: ${data.type}`,
              }))
          }
        } catch (error) {
          connection.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
          }))
        }
      })
      
      connection.on('close', () => {
        fastify.log.info('Design system WebSocket connection closed')
      })
    })
  })

  // Bulk operations
  fastify.post('/tokens/bulk', {
    schema: {
      tags: ['Design Tokens'],
      description: 'Create multiple design tokens',
      body: {
        type: 'object',
        properties: {
          tokens: {
            type: 'array',
            items: CreateTokenSchema,
          },
        },
        required: ['tokens'],
      },
    },
  }, async (request, reply) => {
    const { tokens } = request.body as { tokens: any[] }
    
    const results = await Promise.allSettled(
      tokens.map(token => fastify.designSystemEngine.createToken(token))
    )
    
    const successful = results
      .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
      .map(result => result.value)
    
    const failed = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result, index) => ({
        index,
        token: tokens[index],
        error: result.reason.message,
      }))
    
    reply.send({
      success: true,
      data: {
        created: successful,
        failed,
        summary: {
          total: tokens.length,
          successful: successful.length,
          failed: failed.length,
        },
      },
    })
  })

  // Analytics endpoints
  fastify.get('/analytics/usage', {
    schema: {
      tags: ['Analytics'],
      description: 'Get design system usage analytics',
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['day', 'week', 'month'], default: 'week' },
          tokenId: { type: 'string' },
          componentId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { period = 'week', tokenId, componentId } = request.query as any
    
    // This would integrate with the UX Analytics Engine
    const analytics = {
      period,
      tokenUsage: tokenId ? await getTokenUsage(tokenId, period) : null,
      componentUsage: componentId ? await getComponentUsage(componentId, period) : null,
      overallMetrics: {
        totalTokens: 150,
        activeTokens: 120,
        totalComponents: 45,
        activeComponents: 38,
        lastUpdated: new Date(),
      },
    }
    
    reply.send({
      success: true,
      data: analytics,
    })
  })
}

// Helper functions (would be implemented with actual data)
async function getTokenUsage(tokenId: string, period: string) {
  return {
    tokenId,
    period,
    usage: [
      { date: '2024-01-01', count: 125 },
      { date: '2024-01-02', count: 142 },
      { date: '2024-01-03', count: 156 },
    ],
  }
}

async function getComponentUsage(componentId: string, period: string) {
  return {
    componentId,
    period,
    usage: [
      { date: '2024-01-01', renders: 1250, interactions: 45 },
      { date: '2024-01-02', renders: 1420, interactions: 52 },
      { date: '2024-01-03', renders: 1560, interactions: 48 },
    ],
  }
}