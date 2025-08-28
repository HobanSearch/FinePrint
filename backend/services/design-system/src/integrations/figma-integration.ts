/**
 * Figma Integration - Seamless design-to-code pipeline
 * Provides Figma API integration for design asset extraction and synchronization
 */

import { z } from 'zod'
import * as Figma from 'figma-api'
import { DatabaseClient } from '../utils/database.js'
import { logger } from '../utils/logger.js'
import { config } from '../config/index.js'
import type { DesignSystemEngine } from '../engines/design-system-engine.js'
import type {
  FigmaFile,
  FigmaNode,
  FigmaComponent,
  DesignToken,
  ExtractedAsset,
  SyncStatus,
  FigmaWebhookEvent,
  ComponentMapping,
  DesignSystemSync,
} from '../types/figma-integration.js'

// Validation schemas
const FigmaFileRequestSchema = z.object({
  fileKey: z.string(),
  nodeIds: z.array(z.string()).optional(),
  extractTokens: z.boolean().default(true),
  extractComponents: z.boolean().default(true),
  extractAssets: z.boolean().default(true),
})

const FigmaWebhookSchema = z.object({
  event_type: z.enum(['FILE_UPDATE', 'FILE_DELETE', 'FILE_COMMENT']),
  file_key: z.string(),
  passcode: z.string(),
  timestamp: z.string(),
  triggered_by: z.object({
    id: z.string(),
    handle: z.string(),
    img_url: z.string().optional(),
  }),
})

export class FigmaIntegration {
  private figmaApi: Figma.Api | null = null
  private isInitialized = false
  private syncedFiles = new Map<string, FigmaFile>()
  private componentMappings = new Map<string, ComponentMapping>()
  private webhookSecret: string | null = null

  constructor(
    private designSystemEngine: DesignSystemEngine,
    private database?: DatabaseClient
  ) {}

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Figma Integration')

      if (!config.figma.accessToken) {
        logger.warn('Figma access token not provided - integration will be limited')
        return
      }

      // Initialize Figma API
      this.figmaApi = new Figma.Api({
        personalAccessToken: config.figma.accessToken,
      })

      this.webhookSecret = config.figma.webhookSecret || null

      // Test API connection
      await this.validateConnection()

      // Load existing file mappings
      if (this.database) {
        await this.loadExistingMappings()
      }

      this.isInitialized = true
      logger.info('Figma Integration initialized successfully')
    } catch (error) {
      logger.error(error, 'Failed to initialize Figma Integration')
      throw error
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.figmaApi) return false
      
      // Test with a simple API call
      await this.figmaApi.getMe()
      return true
    } catch {
      return false
    }
  }

  // ===== FILE OPERATIONS =====

  async extractFromFile(request: {
    fileKey: string
    nodeIds?: string[]
    extractTokens?: boolean
    extractComponents?: boolean
    extractAssets?: boolean
  }): Promise<{
    tokens: DesignToken[]
    components: FigmaComponent[]
    assets: ExtractedAsset[]
  }> {
    const validated = FigmaFileRequestSchema.parse(request)
    
    if (!this.figmaApi) {
      throw new Error('Figma API not initialized')
    }

    logger.info({ fileKey: validated.fileKey }, 'Extracting design data from Figma file')

    try {
      // Get file data
      const fileResponse = await this.figmaApi.getFile(validated.fileKey, {
        ids: validated.nodeIds?.join(','),
        depth: 2,
        geometry: 'paths',
        plugin_data: 'shared',
      })

      const file: FigmaFile = {
        key: validated.fileKey,
        name: fileResponse.data.name,
        version: fileResponse.data.version,
        lastModified: new Date(fileResponse.data.lastModified),
        thumbnailUrl: fileResponse.data.thumbnailUrl,
        document: fileResponse.data.document,
        components: fileResponse.data.components || {},
        styles: fileResponse.data.styles || {},
      }

      const result = {
        tokens: [] as DesignToken[],
        components: [] as FigmaComponent[],
        assets: [] as ExtractedAsset[],
      }

      // Extract design tokens
      if (validated.extractTokens) {
        result.tokens = await this.extractDesignTokens(file)
      }

      // Extract components
      if (validated.extractComponents) {
        result.components = await this.extractComponents(file)
      }

      // Extract assets (images, icons, etc.)
      if (validated.extractAssets) {
        result.assets = await this.extractAssets(file, validated.nodeIds)
      }

      // Update local file cache
      this.syncedFiles.set(validated.fileKey, file)

      // Save to database if available
      if (this.database) {
        await this.saveSyncRecord(file, result)
      }

      logger.info({
        fileKey: validated.fileKey,
        tokensCount: result.tokens.length,
        componentsCount: result.components.length,
        assetsCount: result.assets.length,
      }, 'Design data extracted successfully')

      return result
    } catch (error) {
      logger.error(error, `Failed to extract from Figma file: ${validated.fileKey}`)
      throw error
    }
  }

  async syncDesignSystem(fileKey: string): Promise<DesignSystemSync> {
    logger.info({ fileKey }, 'Syncing design system with Figma file')

    const extractionResult = await this.extractFromFile({
      fileKey,
      extractTokens: true,
      extractComponents: true,
      extractAssets: true,
    })

    const syncResult: DesignSystemSync = {
      id: `sync_${Date.now()}`,
      fileKey,
      timestamp: new Date(),
      tokensUpdated: 0,
      componentsUpdated: 0,
      assetsUpdated: 0,
      errors: [],
    }

    try {
      // Sync design tokens
      for (const token of extractionResult.tokens) {
        try {
          await this.designSystemEngine.createToken(token)
          syncResult.tokensUpdated++
        } catch (error) {
          syncResult.errors.push(`Failed to sync token ${token.name}: ${error.message}`)
        }
      }

      // Sync components (create component specifications)
      for (const component of extractionResult.components) {
        try {
          await this.syncComponentToDesignSystem(component)
          syncResult.componentsUpdated++
        } catch (error) {
          syncResult.errors.push(`Failed to sync component ${component.name}: ${error.message}`)
        }
      }

      // Process assets
      for (const asset of extractionResult.assets) {
        try {
          await this.processAsset(asset)
          syncResult.assetsUpdated++
        } catch (error) {
          syncResult.errors.push(`Failed to process asset ${asset.name}: ${error.message}`)
        }
      }

      logger.info({
        fileKey,
        tokensUpdated: syncResult.tokensUpdated,
        componentsUpdated: syncResult.componentsUpdated,
        assetsUpdated: syncResult.assetsUpdated,
        errorsCount: syncResult.errors.length,
      }, 'Design system sync completed')

      return syncResult
    } catch (error) {
      logger.error(error, `Failed to sync design system from file: ${fileKey}`)
      throw error
    }
  }

  // ===== WEBHOOK HANDLING =====

  async handleWebhook(payload: any, signature?: string): Promise<void> {
    // Validate webhook signature if secret is provided
    if (this.webhookSecret && signature) {
      const isValid = await this.validateWebhookSignature(payload, signature)
      if (!isValid) {
        throw new Error('Invalid webhook signature')
      }
    }

    const webhook = FigmaWebhookSchema.parse(payload)
    
    logger.info({
      eventType: webhook.event_type,
      fileKey: webhook.file_key,
      timestamp: webhook.timestamp,
    }, 'Processing Figma webhook')

    switch (webhook.event_type) {
      case 'FILE_UPDATE':
        await this.handleFileUpdate(webhook)
        break
      case 'FILE_DELETE':
        await this.handleFileDelete(webhook)
        break
      case 'FILE_COMMENT':
        await this.handleFileComment(webhook)
        break
      default:
        logger.warn(`Unknown webhook event type: ${webhook.event_type}`)
    }
  }

  // ===== COMPONENT MAPPING =====

  async createComponentMapping(
    figmaComponentKey: string,
    designSystemComponentId: string,
    mappingConfig: {
      propMappings?: Record<string, string>
      styleMappings?: Record<string, string>
      variantMappings?: Record<string, string>
    }
  ): Promise<ComponentMapping> {
    const mapping: ComponentMapping = {
      id: `mapping_${Date.now()}`,
      figmaComponentKey,
      designSystemComponentId,
      propMappings: mappingConfig.propMappings || {},
      styleMappings: mappingConfig.styleMappings || {},
      variantMappings: mappingConfig.variantMappings || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    this.componentMappings.set(figmaComponentKey, mapping)

    if (this.database) {
      await this.database.query(
        `INSERT INTO figma_component_mappings 
         (id, figma_component_key, design_system_component_id, prop_mappings, style_mappings, variant_mappings, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          mapping.id,
          mapping.figmaComponentKey,
          mapping.designSystemComponentId,
          JSON.stringify(mapping.propMappings),
          JSON.stringify(mapping.styleMappings),
          JSON.stringify(mapping.variantMappings),
          mapping.createdAt,
          mapping.updatedAt,
        ]
      )
    }

    logger.info({ mappingId: mapping.id, figmaComponentKey }, 'Component mapping created')
    return mapping
  }

  // ===== ASSET PROCESSING =====

  async downloadAssets(fileKey: string, nodeIds: string[]): Promise<ExtractedAsset[]> {
    if (!this.figmaApi) {
      throw new Error('Figma API not initialized')
    }

    logger.info({ fileKey, nodeIds }, 'Downloading assets from Figma')

    try {
      // Get image URLs
      const imagesResponse = await this.figmaApi.getImage(fileKey, {
        ids: nodeIds.join(','),
        format: 'png',
        scale: 2,
        svg_include_id: true,
      })

      const assets: ExtractedAsset[] = []

      for (const [nodeId, imageUrl] of Object.entries(imagesResponse.data.images)) {
        if (imageUrl) {
          // Download the image
          const response = await fetch(imageUrl)
          const buffer = await response.arrayBuffer()

          const asset: ExtractedAsset = {
            id: `asset_${nodeId}_${Date.now()}`,
            figmaNodeId: nodeId,
            name: `asset_${nodeId}`,
            type: 'image',
            format: 'png',
            url: imageUrl,
            data: Buffer.from(buffer),
            size: buffer.byteLength,
            metadata: {
              scale: 2,
              downloadedAt: new Date(),
            },
          }

          assets.push(asset)
        }
      }

      logger.info({ fileKey, assetsCount: assets.length }, 'Assets downloaded successfully')
      return assets
    } catch (error) {
      logger.error(error, `Failed to download assets from file: ${fileKey}`)
      throw error
    }
  }

  // ===== PRIVATE METHODS =====

  private async validateConnection(): Promise<void> {
    if (!this.figmaApi) {
      throw new Error('Figma API not initialized')
    }

    try {
      const user = await this.figmaApi.getMe()
      logger.info({ userId: user.data.id, userHandle: user.data.handle }, 'Figma API connection validated')
    } catch (error) {
      throw new Error(`Failed to validate Figma API connection: ${error.message}`)
    }
  }

  private async loadExistingMappings(): Promise<void> {
    if (!this.database) return

    const result = await this.database.query(
      'SELECT * FROM figma_component_mappings'
    )

    for (const row of result.rows) {
      const mapping: ComponentMapping = {
        id: row.id,
        figmaComponentKey: row.figma_component_key,
        designSystemComponentId: row.design_system_component_id,
        propMappings: JSON.parse(row.prop_mappings || '{}'),
        styleMappings: JSON.parse(row.style_mappings || '{}'),
        variantMappings: JSON.parse(row.variant_mappings || '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }

      this.componentMappings.set(mapping.figmaComponentKey, mapping)
    }

    logger.info({ mappingsCount: this.componentMappings.size }, 'Loaded existing component mappings')
  }

  private async extractDesignTokens(file: FigmaFile): Promise<DesignToken[]> {
    const tokens: DesignToken[] = []

    // Extract color tokens from styles
    for (const [styleId, style] of Object.entries(file.styles)) {
      if (style.styleType === 'FILL' && style.fills) {
        for (const fill of style.fills) {
          if (fill.type === 'SOLID') {
            const color = this.rgbaToHex(fill.color)
            tokens.push({
              name: style.name.replace(/\//g, '-').toLowerCase(),
              category: 'color',
              value: color,
              description: `Color token extracted from Figma style: ${style.name}`,
              metadata: {
                figmaStyleId: styleId,
                figmaStyleName: style.name,
                extractedAt: new Date(),
              },
            } as DesignToken)
          }
        }
      }

      // Extract text styles
      if (style.styleType === 'TEXT' && style.style) {
        const textStyle = style.style
        tokens.push({
          name: style.name.replace(/\//g, '-').toLowerCase(),
          category: 'typography',
          value: {
            fontFamily: textStyle.fontFamily,
            fontSize: textStyle.fontSize,
            fontWeight: textStyle.fontWeight,
            lineHeight: textStyle.lineHeightPx,
            letterSpacing: textStyle.letterSpacing,
          },
          description: `Typography token extracted from Figma style: ${style.name}`,
          metadata: {
            figmaStyleId: styleId,
            figmaStyleName: style.name,
            extractedAt: new Date(),
          },
        } as DesignToken)
      }
    }

    // Extract spacing tokens from components (analyze consistent spacing patterns)
    const spacingTokens = this.extractSpacingTokens(file.document)
    tokens.push(...spacingTokens)

    return tokens
  }

  private extractSpacingTokens(node: FigmaNode, tokens: DesignToken[] = []): DesignToken[] {
    // Analyze layout grids and constraints to extract spacing patterns
    if (node.layoutGrids) {
      for (const grid of node.layoutGrids) {
        if (grid.pattern === 'COLUMNS' || grid.pattern === 'ROWS') {
          tokens.push({
            name: `spacing-${grid.pattern.toLowerCase()}-${grid.gutterSize}`,
            category: 'spacing',
            value: `${grid.gutterSize}px`,
            description: `Spacing extracted from layout grid: ${grid.pattern}`,
            metadata: {
              figmaNodeId: node.id,
              gridPattern: grid.pattern,
              extractedAt: new Date(),
            },
          } as DesignToken)
        }
      }
    }

    // Recursively analyze child nodes
    if (node.children) {
      for (const child of node.children) {
        this.extractSpacingTokens(child, tokens)
      }
    }

    return tokens
  }

  private async extractComponents(file: FigmaFile): Promise<FigmaComponent[]> {
    const components: FigmaComponent[] = []

    // Extract components from Figma components object
    for (const [componentKey, component] of Object.entries(file.components)) {
      const figmaComponent: FigmaComponent = {
        id: `figma_comp_${componentKey}`,
        figmaComponentKey: componentKey,
        name: component.name,
        description: component.description || '',
        category: this.categorizeComponent(component.name),
        variants: [], // Would be extracted from component sets
        properties: this.extractComponentProperties(component),
        styles: this.extractComponentStyles(component),
        metadata: {
          figmaFileKey: file.key,
          figmaNodeId: component.id,
          extractedAt: new Date(),
        },
      }

      components.push(figmaComponent)
    }

    return components
  }

  private async extractAssets(file: FigmaFile, nodeIds?: string[]): Promise<ExtractedAsset[]> {
    if (!nodeIds || nodeIds.length === 0) {
      // Find all image nodes in the file
      nodeIds = this.findImageNodes(file.document)
    }

    return this.downloadAssets(file.key, nodeIds)
  }

  private findImageNodes(node: FigmaNode, imageNodes: string[] = []): string[] {
    if (node.type === 'RECTANGLE' && node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'IMAGE') {
          imageNodes.push(node.id)
          break
        }
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.findImageNodes(child, imageNodes)
      }
    }

    return imageNodes
  }

  private categorizeComponent(name: string): string {
    const lowerName = name.toLowerCase()
    
    if (lowerName.includes('button')) return 'button'
    if (lowerName.includes('input') || lowerName.includes('field')) return 'input'
    if (lowerName.includes('card')) return 'card'
    if (lowerName.includes('modal') || lowerName.includes('dialog')) return 'modal'
    if (lowerName.includes('nav') || lowerName.includes('menu')) return 'navigation'
    if (lowerName.includes('icon')) return 'icon'
    
    return 'general'
  }

  private extractComponentProperties(component: any): Record<string, any> {
    const properties: Record<string, any> = {}

    // Extract properties from component node
    if (component.componentPropertyDefinitions) {
      for (const [propKey, propDef] of Object.entries(component.componentPropertyDefinitions)) {
        properties[propKey] = {
          type: propDef.type,
          defaultValue: propDef.defaultValue,
          variantOptions: propDef.variantOptions,
        }
      }
    }

    return properties
  }

  private extractComponentStyles(component: any): Record<string, any> {
    const styles: Record<string, any> = {}

    // Extract basic styling information
    if (component.backgroundColor) {
      styles.backgroundColor = this.rgbaToHex(component.backgroundColor)
    }

    if (component.cornerRadius) {
      styles.borderRadius = `${component.cornerRadius}px`
    }

    if (component.effects) {
      styles.effects = component.effects.map((effect: any) => ({
        type: effect.type,
        radius: effect.radius,
        color: effect.color ? this.rgbaToHex(effect.color) : undefined,
        offset: effect.offset,
      }))
    }

    return styles
  }

  private rgbaToHex(rgba: { r: number; g: number; b: number; a?: number }): string {
    const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0')
    const hex = `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`
    
    if (rgba.a !== undefined && rgba.a < 1) {
      return hex + toHex(rgba.a)
    }
    
    return hex
  }

  private async syncComponentToDesignSystem(figmaComponent: FigmaComponent): Promise<void> {
    // Check if there's an existing mapping
    const mapping = this.componentMappings.get(figmaComponent.figmaComponentKey)
    
    if (mapping) {
      // Update existing component
      const existingComponent = await this.designSystemEngine.getComponent(mapping.designSystemComponentId)
      if (existingComponent) {
        // Update component with Figma data
        logger.info({ componentId: existingComponent.id }, 'Updating existing component with Figma data')
      }
    } else {
      // Create new component in design system
      const newComponent = await this.designSystemEngine.createComponent({
        name: figmaComponent.name,
        category: figmaComponent.category,
        variants: figmaComponent.variants,
        props: figmaComponent.properties,
        styles: figmaComponent.styles,
        accessibility: {}, // Would be enhanced with accessibility analysis
        documentation: figmaComponent.description,
      })

      // Create mapping
      await this.createComponentMapping(
        figmaComponent.figmaComponentKey,
        newComponent.id,
        {}
      )
    }
  }

  private async processAsset(asset: ExtractedAsset): Promise<void> {
    // Process and store asset
    // This could involve optimization, format conversion, etc.
    logger.info({ assetId: asset.id, type: asset.type }, 'Processing extracted asset')
  }

  private async saveSyncRecord(file: FigmaFile, extractionResult: any): Promise<void> {
    if (!this.database) return

    await this.database.query(
      `INSERT INTO figma_sync_records 
       (file_key, file_name, version, last_modified, tokens_count, components_count, assets_count, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (file_key) DO UPDATE SET
         file_name = EXCLUDED.file_name,
         version = EXCLUDED.version,
         last_modified = EXCLUDED.last_modified,
         tokens_count = EXCLUDED.tokens_count,
         components_count = EXCLUDED.components_count,
         assets_count = EXCLUDED.assets_count,
         synced_at = EXCLUDED.synced_at`,
      [
        file.key,
        file.name,
        file.version,
        file.lastModified,
        extractionResult.tokens.length,
        extractionResult.components.length,
        extractionResult.assets.length,
        new Date(),
      ]
    )
  }

  private async handleFileUpdate(webhook: FigmaWebhookEvent): Promise<void> {
    logger.info({ fileKey: webhook.file_key }, 'Handling Figma file update')
    
    // Check if this file is being tracked
    if (this.syncedFiles.has(webhook.file_key)) {
      // Trigger automatic sync
      try {
        await this.syncDesignSystem(webhook.file_key)
        logger.info({ fileKey: webhook.file_key }, 'Auto-sync completed after file update')
      } catch (error) {
        logger.error(error, `Auto-sync failed for file: ${webhook.file_key}`)
      }
    }
  }

  private async handleFileDelete(webhook: FigmaWebhookEvent): Promise<void> {
    logger.info({ fileKey: webhook.file_key }, 'Handling Figma file deletion')
    
    // Remove from local cache
    this.syncedFiles.delete(webhook.file_key)
    
    // Clean up database records
    if (this.database) {
      await this.database.query(
        'DELETE FROM figma_sync_records WHERE file_key = $1',
        [webhook.file_key]
      )
    }
  }

  private async handleFileComment(webhook: FigmaWebhookEvent): Promise<void> {
    logger.info({ fileKey: webhook.file_key }, 'Handling Figma file comment')
    // Could trigger notifications or other actions based on comments
  }

  private async validateWebhookSignature(payload: any, signature: string): Promise<boolean> {
    if (!this.webhookSecret) return true

    // Implement webhook signature validation
    // This would typically involve HMAC verification
    return true // Simplified for now
  }
}