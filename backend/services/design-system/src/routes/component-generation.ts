/**
 * Component Generation API Routes
 * Provides endpoints for autonomous component generation across frameworks
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

// Request schemas
const ComponentSpecSchema = z.object({
  name: z.string(),
  type: z.enum(['primitive', 'composite', 'layout', 'visualization']),
  framework: z.enum(['react', 'vue', 'angular', 'react-native']),
  props: z.record(z.any()),
  variants: z.array(z.string()).optional(),
  accessibility: z.object({
    role: z.string().optional(),
    ariaLabel: z.string().optional(),
    keyboardNavigation: z.boolean().optional(),
    screenReaderSupport: z.boolean().optional(),
  }).optional(),
  responsive: z.object({
    breakpoints: z.array(z.string()).optional(),
    adaptiveProps: z.record(z.any()).optional(),
  }).optional(),
  styling: z.object({
    theme: z.string().optional(),
    customStyles: z.record(z.any()).optional(),
    cssModules: z.boolean().optional(),
  }).optional(),
  documentation: z.string().optional(),
})

const BatchGenerationSchema = z.object({
  components: z.array(ComponentSpecSchema),
  options: z.object({
    generateTests: z.boolean().default(true),
    generateDocs: z.boolean().default(true),
    generateStorybook: z.boolean().default(true),
  }).optional(),
})

const VariantGenerationSchema = z.object({
  baseComponentId: z.string(),
  variantName: z.string(),
  modifications: z.record(z.any()),
})

export async function componentGenerationRoutes(fastify: FastifyInstance): Promise<void> {
  // ===== SINGLE COMPONENT GENERATION =====

  // Generate single component
  fastify.post('/component', {
    schema: {
      tags: ['Component Generation'],
      description: 'Generate a single component from specification',
      body: ComponentSpecSchema,
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
                framework: { type: 'string' },
                code: { type: 'string' },
                files: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      content: { type: 'string' },
                      type: { type: 'string' },
                    },
                  },
                },
                dependencies: { type: 'array', items: { type: 'string' } },
                metadata: { type: 'object' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const componentSpec = request.body
    
    try {
      const generatedComponent = await fastify.componentGenerator.generateComponent(componentSpec)
      
      reply.code(201).send({
        success: true,
        data: generatedComponent,
      })
    } catch (error) {
      reply.code(400).send({
        success: false,
        error: error.message,
      })
    }
  })

  // ===== BATCH COMPONENT GENERATION =====

  // Generate multiple components
  fastify.post('/batch', {
    schema: {
      tags: ['Component Generation'],
      description: 'Generate multiple components in batch',
      body: BatchGenerationSchema,
    },
  }, async (request, reply) => {
    const { components, options } = request.body
    
    try {
      const generatedComponents = await fastify.componentGenerator.batchGenerate(components)
      
      reply.send({
        success: true,
        data: {
          components: generatedComponents,
          summary: {
            total: components.length,
            successful: generatedComponents.length,
            failed: components.length - generatedComponents.length,
          },
          options,
        },
      })
    } catch (error) {
      reply.code(400).send({
        success: false,
        error: error.message,
      })
    }
  })

  // ===== VARIANT GENERATION =====

  // Generate component variant
  fastify.post('/variant', {
    schema: {
      tags: ['Component Generation'],
      description: 'Generate a variant of an existing component',
      body: VariantGenerationSchema,
    },
  }, async (request, reply) => {
    const { baseComponentId, variantName, modifications } = request.body
    
    try {
      const variant = await fastify.componentGenerator.generateVariant(
        baseComponentId,
        variantName,
        modifications
      )
      
      reply.code(201).send({
        success: true,
        data: variant,
      })
    } catch (error) {
      reply.code(400).send({
        success: false,
        error: error.message,
      })
    }
  })

  // ===== COMPONENT TEMPLATES =====

  // Get available component templates
  fastify.get('/templates', {
    schema: {
      tags: ['Component Generation'],
      description: 'Get available component templates',
      querystring: {
        type: 'object',
        properties: {
          framework: { type: 'string', enum: ['react', 'vue', 'angular', 'react-native'] },
          type: { type: 'string', enum: ['primitive', 'composite', 'layout', 'visualization'] },
        },
      },
    },
  }, async (request, reply) => {
    const { framework, type } = request.query as any
    
    // This would return available templates based on filters
    const templates = [
      {
        id: 'button-template',
        name: 'Button Template',
        framework: 'react',
        type: 'primitive',
        description: 'Standard button component with accessibility features',
        variants: ['primary', 'secondary', 'outline', 'ghost'],
        requiredProps: ['children'],
        optionalProps: ['variant', 'size', 'disabled', 'loading'],
      },
      {
        id: 'card-template',
        name: 'Card Template',
        framework: 'react',
        type: 'composite',
        description: 'Flexible card container component',
        variants: ['default', 'outlined', 'elevated'],
        requiredProps: [],
        optionalProps: ['variant', 'padding', 'shadow'],
      },
      // Add more templates based on filters
    ].filter(template => {
      if (framework && template.framework !== framework) return false
      if (type && template.type !== type) return false
      return true
    })
    
    reply.send({
      success: true,
      data: {
        templates,
        total: templates.length,
      },
    })
  })

  // Generate component from template
  fastify.post('/from-template/:templateId', {
    schema: {
      tags: ['Component Generation'],
      description: 'Generate component from a predefined template',
      params: {
        type: 'object',
        properties: {
          templateId: { type: 'string' },
        },
        required: ['templateId'],
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          customizations: { type: 'object' },
          framework: { type: 'string', enum: ['react', 'vue', 'angular', 'react-native'] },
        },
        required: ['name'],
      },
    },
  }, async (request, reply) => {
    const { templateId } = request.params as { templateId: string }
    const { name, customizations = {}, framework } = request.body
    
    try {
      // This would load the template and apply customizations
      const templateSpec = await getTemplate(templateId, framework)
      const customizedSpec = {
        ...templateSpec,
        name,
        ...customizations,
      }
      
      const generatedComponent = await fastify.componentGenerator.generateComponent(customizedSpec)
      
      reply.code(201).send({
        success: true,
        data: generatedComponent,
      })
    } catch (error) {
      reply.code(400).send({
        success: false,
        error: error.message,
      })
    }
  })

  // ===== COMPONENT PREVIEW =====

  // Generate component preview
  fastify.post('/preview', {
    schema: {
      tags: ['Component Generation'],
      description: 'Generate a preview of the component without full generation',
      body: ComponentSpecSchema,
    },
  }, async (request, reply) => {
    const componentSpec = request.body
    
    try {
      // Generate a minimal preview version
      const preview = {
        name: componentSpec.name,
        framework: componentSpec.framework,
        estimatedSize: calculateEstimatedSize(componentSpec),
        dependencies: estimateDependencies(componentSpec),
        accessibility: {
          wcagCompliance: componentSpec.accessibility ? 'AA' : 'Basic',
          features: extractAccessibilityFeatures(componentSpec.accessibility),
        },
        responsive: {
          breakpoints: componentSpec.responsive?.breakpoints?.length || 0,
          adaptiveProps: Object.keys(componentSpec.responsive?.adaptiveProps || {}).length,
        },
        codePreview: generateCodePreview(componentSpec),
      }
      
      reply.send({
        success: true,
        data: preview,
      })
    } catch (error) {
      reply.code(400).send({
        success: false,
        error: error.message,
      })
    }
  })

  // ===== REGENERATION WITH UPDATED TOKENS =====

  // Regenerate component with updated design tokens
  fastify.put('/regenerate/:componentId', {
    schema: {
      tags: ['Component Generation'],
      description: 'Regenerate component with updated design tokens',
      params: {
        type: 'object',
        properties: {
          componentId: { type: 'string' },
        },
        required: ['componentId'],
      },
    },
  }, async (request, reply) => {
    const { componentId } = request.params as { componentId: string }
    
    try {
      const updatedComponent = await fastify.componentGenerator.regenerateWithUpdatedTokens(componentId)
      
      reply.send({
        success: true,
        data: updatedComponent,
      })
    } catch (error) {
      reply.code(404).send({
        success: false,
        error: error.message,
      })
    }
  })

  // ===== COMPONENT VALIDATION =====

  // Validate component specification
  fastify.post('/validate', {
    schema: {
      tags: ['Component Generation'],
      description: 'Validate component specification before generation',
      body: ComponentSpecSchema,
    },
  }, async (request, reply) => {
    const componentSpec = request.body
    
    const validation = {
      valid: true,
      errors: [] as string[],
      warnings: [] as string[],
      suggestions: [] as string[],
    }
    
    // Validate component specification
    try {
      // Check for naming conflicts
      if (componentSpec.name.includes(' ')) {
        validation.warnings.push('Component name contains spaces - consider using PascalCase')
      }
      
      // Check prop definitions
      if (!componentSpec.props || Object.keys(componentSpec.props).length === 0) {
        validation.warnings.push('Component has no props defined')
      }
      
      // Check accessibility
      if (!componentSpec.accessibility) {
        validation.suggestions.push('Consider adding accessibility features for better WCAG compliance')
      }
      
      // Framework-specific validations
      if (componentSpec.framework === 'react' && !componentSpec.props?.children) {
        validation.suggestions.push('React components typically accept children prop')
      }
      
      reply.send({
        success: true,
        data: validation,
      })
    } catch (error) {
      validation.valid = false
      validation.errors.push(error.message)
      
      reply.code(400).send({
        success: false,
        data: validation,
      })
    }
  })

  // ===== GENERATED COMPONENT MANAGEMENT =====

  // Get generated component
  fastify.get('/components/:id', {
    schema: {
      tags: ['Component Generation'],
      description: 'Get a generated component by ID',
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
    
    // This would retrieve from the component generator's cache or database
    const component = await getGeneratedComponent(id)
    
    if (!component) {
      reply.code(404).send({
        success: false,
        error: 'Generated component not found',
      })
      return
    }
    
    reply.send({
      success: true,
      data: component,
    })
  })

  // List generated components
  fastify.get('/components', {
    schema: {
      tags: ['Component Generation'],
      description: 'List generated components',
      querystring: {
        type: 'object',
        properties: {
          framework: { type: 'string' },
          type: { type: 'string' },
          limit: { type: 'number', default: 20 },
          offset: { type: 'number', default: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const { framework, type, limit = 20, offset = 0 } = request.query as any
    
    const components = await listGeneratedComponents({ framework, type, limit, offset })
    
    reply.send({
      success: true,
      data: components,
    })
  })

  // Download component files as ZIP
  fastify.get('/components/:id/download', {
    schema: {
      tags: ['Component Generation'],
      description: 'Download component files as ZIP archive',
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
    
    try {
      const component = await getGeneratedComponent(id)
      if (!component) {
        reply.code(404).send({
          success: false,
          error: 'Component not found',
        })
        return
      }
      
      // Generate ZIP file with all component files
      const zipBuffer = await createComponentZip(component)
      
      reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="${component.name}.zip"`)
        .send(zipBuffer)
    } catch (error) {
      reply.code(500).send({
        success: false,
        error: error.message,
      })
    }
  })
}

// Helper functions
async function getTemplate(templateId: string, framework?: string) {
  // This would load template from database or file system
  return {
    name: 'TemplateComponent',
    type: 'primitive' as const,
    framework: framework || 'react' as const,
    props: {
      children: { type: 'ReactNode', required: false },
      className: { type: 'string', required: false },
    },
  }
}

function calculateEstimatedSize(spec: any): { lines: number; bytes: number } {
  // Estimate component size based on specification
  let lines = 20 // Base component structure
  
  lines += Object.keys(spec.props || {}).length * 2 // Props handling
  lines += spec.variants?.length * 5 || 0 // Variant logic
  lines += spec.accessibility ? 10 : 0 // Accessibility features
  lines += spec.responsive ? 8 : 0 // Responsive logic
  
  return {
    lines,
    bytes: lines * 50, // Rough estimate
  }
}

function estimateDependencies(spec: any): string[] {
  const deps = []
  
  if (spec.framework === 'react') {
    deps.push('react')
    if (spec.accessibility) deps.push('@radix-ui/react-accessible-icon')
    if (spec.styling?.cssModules) deps.push('clsx')
  } else if (spec.framework === 'vue') {
    deps.push('vue')
  } else if (spec.framework === 'angular') {
    deps.push('@angular/core')
  } else if (spec.framework === 'react-native') {
    deps.push('react-native', 'react')
  }
  
  return deps
}

function extractAccessibilityFeatures(accessibility: any) {
  if (!accessibility) return []
  
  const features = []
  if (accessibility.keyboardNavigation) features.push('Keyboard Navigation')
  if (accessibility.screenReaderSupport) features.push('Screen Reader Support')
  if (accessibility.role) features.push(`ARIA Role: ${accessibility.role}`)
  if (accessibility.ariaLabel) features.push('ARIA Label')
  
  return features
}

function generateCodePreview(spec: any): string {
  // Generate a simplified code preview
  if (spec.framework === 'react') {
    return `import React from 'react'

interface ${spec.name}Props {
  children?: React.ReactNode
  className?: string
}

export const ${spec.name}: React.FC<${spec.name}Props> = ({
  children,
  className,
  ...props
}) => {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  )
}`
  }
  
  return `// Code preview for ${spec.framework} ${spec.name} component`
}

async function getGeneratedComponent(id: string) {
  // This would retrieve from database or cache
  return null
}

async function listGeneratedComponents(filters: any) {
  // This would query database with filters
  return {
    components: [],
    total: 0,
    limit: filters.limit,
    offset: filters.offset,
  }
}

async function createComponentZip(component: any): Promise<Buffer> {
  // This would create a ZIP file with all component files
  return Buffer.from('mock-zip-content')
}