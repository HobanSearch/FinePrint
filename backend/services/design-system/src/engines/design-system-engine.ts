/**
 * Design System Engine - Core engine for managing design systems
 * Handles token management, theme generation, and system orchestration
 */

import { z } from 'zod'
import { DatabaseClient } from '../utils/database.js'
import { RedisClient } from '../utils/redis.js'
import { logger } from '../utils/logger.js'
import type {
  DesignToken,
  Theme,
  Component,
  DesignSystemConfig,
  TokenUpdate,
  ThemeVariant,
  ComponentLibrary,
} from '../types/design-system.js'

// Validation schemas
const DesignTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['color', 'typography', 'spacing', 'shadow', 'border', 'animation']),
  value: z.any(),
  description: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
})

const ThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  variant: z.enum(['light', 'dark', 'high-contrast', 'custom']),
  tokens: z.record(z.any()),
  metadata: z.record(z.any()).optional(),
})

const ComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  variants: z.array(z.string()),
  props: z.record(z.any()),
  styles: z.record(z.any()),
  accessibility: z.record(z.any()),
  documentation: z.string().optional(),
})

export class DesignSystemEngine {
  private isInitialized = false
  private designSystems = new Map<string, DesignSystemConfig>()
  private tokenCache = new Map<string, DesignToken>()
  private themeCache = new Map<string, Theme>()
  private componentCache = new Map<string, Component>()

  constructor(
    private database: DatabaseClient,
    private redis: RedisClient
  ) {}

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Design System Engine')
      
      // Load existing design systems from database
      await this.loadDesignSystems()
      
      // Initialize default design system if none exists
      await this.ensureDefaultDesignSystem()
      
      // Setup cache warming
      await this.warmCaches()
      
      this.isInitialized = true
      logger.info('Design System Engine initialized successfully')
    } catch (error) {
      logger.error(error, 'Failed to initialize Design System Engine')
      throw error
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      return this.isInitialized && 
             await this.database.healthCheck() && 
             await this.redis.healthCheck()
    } catch {
      return false
    }
  }

  // ===== TOKEN MANAGEMENT =====

  async createToken(token: Omit<DesignToken, 'id' | 'createdAt' | 'updatedAt'>): Promise<DesignToken> {
    const validatedToken = DesignTokenSchema.omit({ id: true }).parse(token)
    
    const newToken: DesignToken = {
      id: `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...validatedToken,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Save to database
    await this.database.query(
      `INSERT INTO design_tokens (id, name, category, value, description, aliases, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        newToken.id,
        newToken.name,
        newToken.category,
        JSON.stringify(newToken.value),
        newToken.description,
        JSON.stringify(newToken.aliases || []),
        JSON.stringify(newToken.metadata || {}),
        newToken.createdAt,
        newToken.updatedAt,
      ]
    )

    // Update cache
    this.tokenCache.set(newToken.id, newToken)
    await this.redis.set(`token:${newToken.id}`, JSON.stringify(newToken), 3600)

    logger.info({ tokenId: newToken.id, tokenName: newToken.name }, 'Token created')
    return newToken
  }

  async updateToken(id: string, updates: TokenUpdate): Promise<DesignToken> {
    const existingToken = await this.getToken(id)
    if (!existingToken) {
      throw new Error(`Token with id ${id} not found`)
    }

    const updatedToken: DesignToken = {
      ...existingToken,
      ...updates,
      updatedAt: new Date(),
    }

    // Validate updated token
    DesignTokenSchema.parse(updatedToken)

    // Save to database
    await this.database.query(
      `UPDATE design_tokens 
       SET name = $2, category = $3, value = $4, description = $5, aliases = $6, metadata = $7, updated_at = $8
       WHERE id = $1`,
      [
        id,
        updatedToken.name,
        updatedToken.category,
        JSON.stringify(updatedToken.value),
        updatedToken.description,
        JSON.stringify(updatedToken.aliases || []),
        JSON.stringify(updatedToken.metadata || {}),
        updatedToken.updatedAt,
      ]
    )

    // Update caches
    this.tokenCache.set(id, updatedToken)
    await this.redis.set(`token:${id}`, JSON.stringify(updatedToken), 3600)

    // Invalidate dependent themes and components
    await this.invalidateDependentCaches(id)

    logger.info({ tokenId: id }, 'Token updated')
    return updatedToken
  }

  async getToken(id: string): Promise<DesignToken | null> {
    // Check cache first
    const cached = this.tokenCache.get(id)
    if (cached) return cached

    // Check Redis
    const redisData = await this.redis.get(`token:${id}`)
    if (redisData) {
      const token = JSON.parse(redisData) as DesignToken
      this.tokenCache.set(id, token)
      return token
    }

    // Query database
    const result = await this.database.query(
      'SELECT * FROM design_tokens WHERE id = $1',
      [id]
    )

    if (result.rows.length === 0) return null

    const row = result.rows[0]
    const token: DesignToken = {
      id: row.id,
      name: row.name,
      category: row.category,
      value: JSON.parse(row.value),
      description: row.description,
      aliases: JSON.parse(row.aliases || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }

    // Update caches
    this.tokenCache.set(id, token)
    await this.redis.set(`token:${id}`, JSON.stringify(token), 3600)

    return token
  }

  async getTokensByCategory(category: string): Promise<DesignToken[]> {
    const result = await this.database.query(
      'SELECT * FROM design_tokens WHERE category = $1 ORDER BY name',
      [category]
    )

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      value: JSON.parse(row.value),
      description: row.description,
      aliases: JSON.parse(row.aliases || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async searchTokens(query: string): Promise<DesignToken[]> {
    const result = await this.database.query(
      `SELECT * FROM design_tokens 
       WHERE name ILIKE $1 OR description ILIKE $1
       ORDER BY name`,
      [`%${query}%`]
    )

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      value: JSON.parse(row.value),
      description: row.description,
      aliases: JSON.parse(row.aliases || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  // ===== THEME MANAGEMENT =====

  async createTheme(theme: Omit<Theme, 'id' | 'createdAt' | 'updatedAt'>): Promise<Theme> {
    const validatedTheme = ThemeSchema.omit({ id: true }).parse(theme)
    
    const newTheme: Theme = {
      id: `theme_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...validatedTheme,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Save to database
    await this.database.query(
      `INSERT INTO design_themes (id, name, variant, tokens, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newTheme.id,
        newTheme.name,
        newTheme.variant,
        JSON.stringify(newTheme.tokens),
        JSON.stringify(newTheme.metadata || {}),
        newTheme.createdAt,
        newTheme.updatedAt,
      ]
    )

    // Update cache
    this.themeCache.set(newTheme.id, newTheme)
    await this.redis.set(`theme:${newTheme.id}`, JSON.stringify(newTheme), 3600)

    logger.info({ themeId: newTheme.id, themeName: newTheme.name }, 'Theme created')
    return newTheme
  }

  async generateThemeVariant(baseThemeId: string, variant: ThemeVariant): Promise<Theme> {
    const baseTheme = await this.getTheme(baseThemeId)
    if (!baseTheme) {
      throw new Error(`Base theme with id ${baseThemeId} not found`)
    }

    // Apply variant transformations
    const variantTokens = await this.applyThemeVariant(baseTheme.tokens, variant)

    return this.createTheme({
      name: `${baseTheme.name} (${variant})`,
      variant,
      tokens: variantTokens,
      metadata: {
        ...baseTheme.metadata,
        baseThemeId,
        isVariant: true,
      },
    })
  }

  async getTheme(id: string): Promise<Theme | null> {
    // Check cache first
    const cached = this.themeCache.get(id)
    if (cached) return cached

    // Check Redis
    const redisData = await this.redis.get(`theme:${id}`)
    if (redisData) {
      const theme = JSON.parse(redisData) as Theme
      this.themeCache.set(id, theme)
      return theme
    }

    // Query database
    const result = await this.database.query(
      'SELECT * FROM design_themes WHERE id = $1',
      [id]
    )

    if (result.rows.length === 0) return null

    const row = result.rows[0]
    const theme: Theme = {
      id: row.id,
      name: row.name,
      variant: row.variant,
      tokens: JSON.parse(row.tokens),
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }

    // Update caches
    this.themeCache.set(id, theme)
    await this.redis.set(`theme:${id}`, JSON.stringify(theme), 3600)

    return theme
  }

  // ===== COMPONENT MANAGEMENT =====

  async createComponent(component: Omit<Component, 'id' | 'createdAt' | 'updatedAt'>): Promise<Component> {
    const validatedComponent = ComponentSchema.omit({ id: true }).parse(component)
    
    const newComponent: Component = {
      id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...validatedComponent,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Save to database
    await this.database.query(
      `INSERT INTO design_components (id, name, category, variants, props, styles, accessibility, documentation, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        newComponent.id,
        newComponent.name,
        newComponent.category,
        JSON.stringify(newComponent.variants),
        JSON.stringify(newComponent.props),
        JSON.stringify(newComponent.styles),
        JSON.stringify(newComponent.accessibility),
        newComponent.documentation,
        newComponent.createdAt,
        newComponent.updatedAt,
      ]
    )

    // Update cache
    this.componentCache.set(newComponent.id, newComponent)
    await this.redis.set(`component:${newComponent.id}`, JSON.stringify(newComponent), 3600)

    logger.info({ componentId: newComponent.id, componentName: newComponent.name }, 'Component created')
    return newComponent
  }

  async getComponent(id: string): Promise<Component | null> {
    // Check cache first
    const cached = this.componentCache.get(id)
    if (cached) return cached

    // Check Redis
    const redisData = await this.redis.get(`component:${id}`)
    if (redisData) {
      const component = JSON.parse(redisData) as Component
      this.componentCache.set(id, component)
      return component
    }

    // Query database
    const result = await this.database.query(
      'SELECT * FROM design_components WHERE id = $1',
      [id]
    )

    if (result.rows.length === 0) return null

    const row = result.rows[0]
    const component: Component = {
      id: row.id,
      name: row.name,
      category: row.category,
      variants: JSON.parse(row.variants),
      props: JSON.parse(row.props),
      styles: JSON.parse(row.styles),
      accessibility: JSON.parse(row.accessibility),
      documentation: row.documentation,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }

    // Update caches
    this.componentCache.set(id, component)
    await this.redis.set(`component:${id}`, JSON.stringify(component), 3600)

    return component
  }

  async getComponentLibrary(): Promise<ComponentLibrary> {
    const result = await this.database.query(
      'SELECT * FROM design_components ORDER BY category, name'
    )

    const components = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category,
      variants: JSON.parse(row.variants),
      props: JSON.parse(row.props),
      styles: JSON.parse(row.styles),
      accessibility: JSON.parse(row.accessibility),
      documentation: row.documentation,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    // Group by category
    const library: ComponentLibrary = {}
    for (const component of components) {
      if (!library[component.category]) {
        library[component.category] = []
      }
      library[component.category].push(component)
    }

    return library
  }

  // ===== DESIGN SYSTEM ORCHESTRATION =====

  async createDesignSystem(config: Omit<DesignSystemConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<DesignSystemConfig> {
    const newConfig: DesignSystemConfig = {
      id: `ds_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...config,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Save to database
    await this.database.query(
      `INSERT INTO design_systems (id, name, version, tokens, themes, components, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        newConfig.id,
        newConfig.name,
        newConfig.version,
        JSON.stringify(newConfig.tokens),
        JSON.stringify(newConfig.themes),
        JSON.stringify(newConfig.components),
        JSON.stringify(newConfig.config),
        newConfig.createdAt,
        newConfig.updatedAt,
      ]
    )

    this.designSystems.set(newConfig.id, newConfig)
    logger.info({ designSystemId: newConfig.id, name: newConfig.name }, 'Design system created')
    
    return newConfig
  }

  async exportDesignSystem(id: string, format: 'json' | 'css' | 'scss' | 'tokens'): Promise<string> {
    const designSystem = this.designSystems.get(id)
    if (!designSystem) {
      throw new Error(`Design system with id ${id} not found`)
    }

    switch (format) {
      case 'json':
        return JSON.stringify(designSystem, null, 2)
      
      case 'css':
        return this.generateCSSVariables(designSystem)
      
      case 'scss':
        return this.generateSCSSVariables(designSystem)
      
      case 'tokens':
        return this.generateTokensFile(designSystem)
      
      default:
        throw new Error(`Unsupported export format: ${format}`)
    }
  }

  // ===== PRIVATE METHODS =====

  private async loadDesignSystems(): Promise<void> {
    const result = await this.database.query('SELECT * FROM design_systems')
    
    for (const row of result.rows) {
      const config: DesignSystemConfig = {
        id: row.id,
        name: row.name,
        version: row.version,
        tokens: JSON.parse(row.tokens),
        themes: JSON.parse(row.themes),
        components: JSON.parse(row.components),
        config: JSON.parse(row.config),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
      
      this.designSystems.set(config.id, config)
    }
  }

  private async ensureDefaultDesignSystem(): Promise<void> {
    if (this.designSystems.size === 0) {
      await this.createDefaultDesignSystem()
    }
  }

  private async createDefaultDesignSystem(): Promise<void> {
    // Create default design system based on Fine Print AI tokens
    const defaultConfig = {
      name: 'Fine Print AI Design System',
      version: '1.0.0',
      tokens: {
        colors: {
          guardian: { 500: '#2563eb' },
          sage: { 500: '#10b981' },
          risk: {
            safe: { 500: '#10b981' },
            low: { 500: '#22c55e' },
            medium: { 500: '#f59e0b' },
            high: { 500: '#ef4444' },
            critical: { 500: '#ec4899' },
          },
        },
        typography: {
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
          },
          fontSize: {
            base: '1rem',
            lg: '1.125rem',
            xl: '1.25rem',
          },
        },
        spacing: {
          4: '1rem',
          8: '2rem',
          12: '3rem',
        },
      },
      themes: ['light', 'dark'],
      components: ['Button', 'Card', 'Badge'],
      config: {
        platforms: ['web', 'mobile', 'extension'],
        frameworks: ['react', 'vue', 'angular'],
      },
    }

    await this.createDesignSystem(defaultConfig)
  }

  private async warmCaches(): Promise<void> {
    logger.info('Warming design system caches')
    
    // Pre-load frequently used tokens
    const tokenResult = await this.database.query(
      'SELECT * FROM design_tokens LIMIT 100'
    )
    
    for (const row of tokenResult.rows) {
      const token: DesignToken = {
        id: row.id,
        name: row.name,
        category: row.category,
        value: JSON.parse(row.value),
        description: row.description,
        aliases: JSON.parse(row.aliases || '[]'),
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
      
      this.tokenCache.set(token.id, token)
    }
  }

  private async invalidateDependentCaches(tokenId: string): Promise<void> {
    // Find and invalidate themes and components that use this token
    // This is a simplified implementation - in production, you'd want more sophisticated dependency tracking
    
    this.themeCache.clear()
    this.componentCache.clear()
    
    await this.redis.deletePattern('theme:*')
    await this.redis.deletePattern('component:*')
  }

  private async applyThemeVariant(baseTokens: any, variant: ThemeVariant): Promise<any> {
    // Apply transformations based on variant type
    switch (variant) {
      case 'dark':
        return this.applyDarkThemeTransform(baseTokens)
      case 'high-contrast':
        return this.applyHighContrastTransform(baseTokens)
      default:
        return baseTokens
    }
  }

  private applyDarkThemeTransform(tokens: any): any {
    // Implement dark theme transformations
    const darkTokens = JSON.parse(JSON.stringify(tokens))
    
    // Invert neutral colors
    if (darkTokens.colors?.neutral) {
      const neutral = darkTokens.colors.neutral
      const temp = { ...neutral }
      Object.keys(neutral).forEach(key => {
        const invertedKey = String(1000 - parseInt(key))
        if (temp[invertedKey]) {
          neutral[key] = temp[invertedKey]
        }
      })
    }
    
    return darkTokens
  }

  private applyHighContrastTransform(tokens: any): any {
    // Implement high contrast transformations
    const contrastTokens = JSON.parse(JSON.stringify(tokens))
    
    // Increase contrast ratios
    if (contrastTokens.colors) {
      // This is a simplified transform - real implementation would calculate proper contrast ratios
      Object.keys(contrastTokens.colors).forEach(colorGroup => {
        if (typeof contrastTokens.colors[colorGroup] === 'object') {
          Object.keys(contrastTokens.colors[colorGroup]).forEach(shade => {
            const shadeNum = parseInt(shade)
            if (shadeNum < 500) {
              contrastTokens.colors[colorGroup][shade] = contrastTokens.colors[colorGroup]['100']
            } else if (shadeNum > 500) {
              contrastTokens.colors[colorGroup][shade] = contrastTokens.colors[colorGroup]['900']
            }
          })
        }
      })
    }
    
    return contrastTokens
  }

  private generateCSSVariables(designSystem: DesignSystemConfig): string {
    let css = ':root {\n'
    
    // Generate CSS custom properties from tokens
    const flattenTokens = (obj: any, prefix = ''): string => {
      let result = ''
      for (const [key, value] of Object.entries(obj)) {
        const varName = `--${prefix}${prefix ? '-' : ''}${key}`
        if (typeof value === 'object' && value !== null) {
          result += flattenTokens(value, `${prefix}${prefix ? '-' : ''}${key}`)
        } else {
          result += `  ${varName}: ${value};\n`
        }
      }
      return result
    }
    
    css += flattenTokens(designSystem.tokens)
    css += '}\n'
    
    return css
  }

  private generateSCSSVariables(designSystem: DesignSystemConfig): string {
    let scss = '// Fine Print AI Design System SCSS Variables\n\n'
    
    const flattenTokens = (obj: any, prefix = ''): string => {
      let result = ''
      for (const [key, value] of Object.entries(obj)) {
        const varName = `$${prefix}${prefix ? '-' : ''}${key}`
        if (typeof value === 'object' && value !== null) {
          result += flattenTokens(value, `${prefix}${prefix ? '-' : ''}${key}`)
        } else {
          result += `${varName}: ${value};\n`
        }
      }
      return result
    }
    
    scss += flattenTokens(designSystem.tokens)
    
    return scss
  }

  private generateTokensFile(designSystem: DesignSystemConfig): string {
    return JSON.stringify({
      name: designSystem.name,
      version: designSystem.version,
      tokens: designSystem.tokens,
    }, null, 2)
  }
}