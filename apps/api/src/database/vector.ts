import { qdrant, dbLogger as logger } from './client.js'
import { QdrantClient } from '@qdrant/js-client-rest'

// Vector collection configurations
export const VectorCollections = {
  DOCUMENTS: {
    name: 'documents',
    description: 'Document embeddings for semantic search and similarity analysis',
    vectorSize: 1536, // OpenAI text-embedding-ada-002 or equivalent
    distance: 'Cosine' as const,
    indexConfig: {
      threshold: 20000,
      onDisk: true
    }
  },
  PATTERNS: {
    name: 'patterns',
    description: 'Legal pattern embeddings for matching and classification',
    vectorSize: 768, // BERT-base or equivalent legal model
    distance: 'Cosine' as const,
    indexConfig: {
      threshold: 10000,
      onDisk: true
    }
  },
  CLAUSES: {
    name: 'clauses',
    description: 'Individual clause embeddings for fine-grained analysis',
    vectorSize: 768,
    distance: 'Cosine' as const,
    indexConfig: {
      threshold: 50000,
      onDisk: true
    }
  },
  TEMPLATES: {
    name: 'templates',
    description: 'Action template embeddings for recommendation matching',
    vectorSize: 768,
    distance: 'Cosine' as const,
    indexConfig: {
      threshold: 5000,
      onDisk: false
    }
  }
} as const

// Payload schemas for different collections
export interface DocumentPayload {
  documentId: string
  documentHash: string
  title: string
  documentType: string
  language: string
  contentLength: number
  userId: string
  teamId?: string
  createdAt: string
  metadata: {
    url?: string
    sourceInfo?: Record<string, any>
    analysisVersion?: number
  }
}

export interface PatternPayload {
  patternId: string
  category: string
  name: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  language: string
  version: number
  isActive: boolean
  isCustom: boolean
  createdBy?: string
  metadata: {
    keywords: string[]
    legalContext?: string
    jurisdictions?: string[]
    lastUpdated: string
  }
}

export interface ClausePayload {
  clauseId: string
  documentId: string
  analysisId: string
  category: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  confidenceScore: number
  position: {
    start: number
    end: number
  }
  language: string
  metadata: {
    extractedText: string
    patternMatches: string[]
    riskFactors: string[]
    recommendations: string[]
  }
}

export interface TemplatePayload {
  templateId: string
  category: string
  name: string
  language: string
  jurisdictions: string[]
  successRate: number
  usageCount: number
  isActive: boolean
  createdBy?: string
  metadata: {
    variables: Record<string, any>
    legalBasis?: string
    lastUsed?: string
    effectiveness: number
  }
}

// Vector database service class
export class VectorService {
  private static instance: VectorService
  private client: QdrantClient
  private isInitialized = false

  constructor() {
    this.client = qdrant
  }

  static getInstance(): VectorService {
    if (!VectorService.instance) {
      VectorService.instance = new VectorService()
    }
    return VectorService.instance
  }

  // Initialize all collections
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info('Vector service already initialized')
      return
    }

    try {
      await this.ensureCollectionsExist()
      await this.createIndexes()
      this.isInitialized = true
      logger.info('Vector service initialized successfully')
    } catch (error) {
      logger.error({ error }, 'Failed to initialize vector service')
      throw error
    }
  }

  // Ensure collections exist, create if they don't
  private async ensureCollectionsExist(): Promise<void> {
    const existingCollections = await this.client.getCollections()
    const existingNames = existingCollections.collections.map(c => c.name)

    for (const [key, config] of Object.entries(VectorCollections)) {
      if (!existingNames.includes(config.name)) {
        await this.createCollection(config)
        logger.info({ collection: config.name }, 'Created vector collection')
      } else {
        logger.debug({ collection: config.name }, 'Vector collection already exists')
      }
    }
  }

  // Create a new collection
  private async createCollection(config: typeof VectorCollections[keyof typeof VectorCollections]): Promise<void> {
    await this.client.createCollection(config.name, {
      vectors: {
        size: config.vectorSize,
        distance: config.distance
      },
      hnsw_config: {
        m: 16,
        ef_construct: 100
      },
      optimizers_config: {
        default_segment_number: 2,
        memmap_threshold: config.indexConfig.threshold,
        indexing_threshold: config.indexConfig.threshold,
        flush_interval_sec: 30
      },
      on_disk_payload: config.indexConfig.onDisk,
      replication_factor: 1
    })
  }

  // Create indexes for payload fields
  private async createIndexes(): Promise<void> {
    const indexConfigurations = [
      // Document collection indexes
      { collection: VectorCollections.DOCUMENTS.name, field: 'documentType', type: 'keyword' },
      { collection: VectorCollections.DOCUMENTS.name, field: 'language', type: 'keyword' },
      { collection: VectorCollections.DOCUMENTS.name, field: 'userId', type: 'keyword' },
      { collection: VectorCollections.DOCUMENTS.name, field: 'teamId', type: 'keyword' },
      { collection: VectorCollections.DOCUMENTS.name, field: 'createdAt', type: 'datetime' },

      // Pattern collection indexes
      { collection: VectorCollections.PATTERNS.name, field: 'category', type: 'keyword' },
      { collection: VectorCollections.PATTERNS.name, field: 'severity', type: 'keyword' },
      { collection: VectorCollections.PATTERNS.name, field: 'language', type: 'keyword' },
      { collection: VectorCollections.PATTERNS.name, field: 'isActive', type: 'bool' },
      { collection: VectorCollections.PATTERNS.name, field: 'isCustom', type: 'bool' },

      // Clause collection indexes
      { collection: VectorCollections.CLAUSES.name, field: 'documentId', type: 'keyword' },
      { collection: VectorCollections.CLAUSES.name, field: 'category', type: 'keyword' },
      { collection: VectorCollections.CLAUSES.name, field: 'severity', type: 'keyword' },
      { collection: VectorCollections.CLAUSES.name, field: 'confidenceScore', type: 'float' },

      // Template collection indexes
      { collection: VectorCollections.TEMPLATES.name, field: 'category', type: 'keyword' },
      { collection: VectorCollections.TEMPLATES.name, field: 'language', type: 'keyword' },
      { collection: VectorCollections.TEMPLATES.name, field: 'isActive', type: 'bool' },
      { collection: VectorCollections.TEMPLATES.name, field: 'successRate', type: 'float' }
    ]

    for (const index of indexConfigurations) {
      try {
        await this.client.createPayloadIndex(index.collection, {
          field_name: index.field,
          field_type: index.type as any
        })
        logger.debug({ collection: index.collection, field: index.field, type: index.type }, 'Created payload index')
      } catch (error) {
        // Index might already exist, log but continue
        logger.debug({ collection: index.collection, field: index.field, error }, 'Index creation skipped (might already exist)')
      }
    }
  }

  // Document operations
  async upsertDocument(
    documentId: string,
    embedding: number[],
    payload: DocumentPayload
  ): Promise<void> {
    try {
      await this.client.upsert(VectorCollections.DOCUMENTS.name, {
        wait: true,
        points: [{
          id: documentId,
          vector: embedding,
          payload
        }]
      })
      logger.debug({ documentId }, 'Document embedding upserted')
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to upsert document embedding')
      throw error
    }
  }

  async searchSimilarDocuments(
    embedding: number[],
    limit: number = 10,
    filter?: Record<string, any>
  ): Promise<Array<{ id: string; score: number; payload: DocumentPayload }>> {
    try {
      const result = await this.client.search(VectorCollections.DOCUMENTS.name, {
        vector: embedding,
        limit,
        filter,
        with_payload: true,
        score_threshold: 0.7
      })

      return result.map(point => ({
        id: point.id as string,
        score: point.score,
        payload: point.payload as DocumentPayload
      }))
    } catch (error) {
      logger.error({ error, limit, filter }, 'Failed to search similar documents')
      throw error
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    try {
      await this.client.delete(VectorCollections.DOCUMENTS.name, {
        wait: true,
        points: [documentId]
      })
      logger.debug({ documentId }, 'Document embedding deleted')
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to delete document embedding')
      throw error
    }
  }

  // Pattern operations
  async upsertPattern(
    patternId: string,
    embedding: number[],
    payload: PatternPayload
  ): Promise<void> {
    try {
      await this.client.upsert(VectorCollections.PATTERNS.name, {
        wait: true,
        points: [{
          id: patternId,
          vector: embedding,
          payload
        }]
      })
      logger.debug({ patternId }, 'Pattern embedding upserted')
    } catch (error) {
      logger.error({ error, patternId }, 'Failed to upsert pattern embedding')
      throw error
    }
  }

  async searchMatchingPatterns(
    embedding: number[],
    limit: number = 20,
    filter?: Record<string, any>
  ): Promise<Array<{ id: string; score: number; payload: PatternPayload }>> {
    try {
      const result = await this.client.search(VectorCollections.PATTERNS.name, {
        vector: embedding,
        limit,
        filter: {
          must: [
            { key: 'isActive', match: { value: true } },
            ...(filter ? [filter] : [])
          ]
        },
        with_payload: true,
        score_threshold: 0.8
      })

      return result.map(point => ({
        id: point.id as string,
        score: point.score,
        payload: point.payload as PatternPayload
      }))
    } catch (error) {
      logger.error({ error, limit, filter }, 'Failed to search matching patterns')
      throw error
    }
  }

  // Clause operations
  async upsertClause(
    clauseId: string,
    embedding: number[],
    payload: ClausePayload
  ): Promise<void> {
    try {
      await this.client.upsert(VectorCollections.CLAUSES.name, {
        wait: true,
        points: [{
          id: clauseId,
          vector: embedding,
          payload
        }]
      })
      logger.debug({ clauseId }, 'Clause embedding upserted')
    } catch (error) {
      logger.error({ error, clauseId }, 'Failed to upsert clause embedding')
      throw error
    }
  }

  async searchSimilarClauses(
    embedding: number[],
    documentId: string,
    limit: number = 5
  ): Promise<Array<{ id: string; score: number; payload: ClausePayload }>> {
    try {
      const result = await this.client.search(VectorCollections.CLAUSES.name, {
        vector: embedding,
        limit,
        filter: {
          must_not: [
            { key: 'documentId', match: { value: documentId } }
          ]
        },
        with_payload: true,
        score_threshold: 0.85
      })

      return result.map(point => ({
        id: point.id as string,
        score: point.score,
        payload: point.payload as ClausePayload
      }))
    } catch (error) {
      logger.error({ error, documentId, limit }, 'Failed to search similar clauses')
      throw error
    }
  }

  async deleteDocumentClauses(documentId: string): Promise<void> {
    try {
      await this.client.delete(VectorCollections.CLAUSES.name, {
        wait: true,
        filter: {
          must: [
            { key: 'documentId', match: { value: documentId } }
          ]
        }
      })
      logger.debug({ documentId }, 'Document clauses deleted')
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to delete document clauses')
      throw error
    }
  }

  // Template operations
  async upsertTemplate(
    templateId: string,
    embedding: number[],
    payload: TemplatePayload
  ): Promise<void> {
    try {
      await this.client.upsert(VectorCollections.TEMPLATES.name, {
        wait: true,
        points: [{
          id: templateId,
          vector: embedding,
          payload
        }]
      })
      logger.debug({ templateId }, 'Template embedding upserted')
    } catch (error) {
      logger.error({ error, templateId }, 'Failed to upsert template embedding')
      throw error
    }
  }

  async searchRelevantTemplates(
    embedding: number[],
    category: string,
    limit: number = 5
  ): Promise<Array<{ id: string; score: number; payload: TemplatePayload }>> {
    try {
      const result = await this.client.search(VectorCollections.TEMPLATES.name, {
        vector: embedding,
        limit,
        filter: {
          must: [
            { key: 'isActive', match: { value: true } },
            { key: 'category', match: { value: category } }
          ]
        },
        with_payload: true,
        score_threshold: 0.75
      })

      return result.map(point => ({
        id: point.id as string,
        score: point.score,
        payload: point.payload as TemplatePayload
      }))
    } catch (error) {
      logger.error({ error, category, limit }, 'Failed to search relevant templates')
      throw error
    }
  }

  // Hybrid search combining vector similarity and text matching
  async hybridSearch(
    embedding: number[],
    collectionName: string,
    textQuery?: string,
    filter?: Record<string, any>,
    limit: number = 10
  ): Promise<Array<{ id: string; score: number; payload: any }>> {
    try {
      // If text query provided, use it as additional filtering
      const searchFilter = textQuery ? {
        must: [
          ...(filter?.must || []),
          // Add text-based filtering here if your embeddings support it
        ]
      } : filter

      const result = await this.client.search(collectionName, {
        vector: embedding,
        limit,
        filter: searchFilter,
        with_payload: true,
        score_threshold: 0.7
      })

      return result.map(point => ({
        id: point.id as string,
        score: point.score,
        payload: point.payload
      }))
    } catch (error) {
      logger.error({ error, collectionName, textQuery, limit }, 'Hybrid search failed')
      throw error
    }
  }

  // Batch operations
  async batchUpsert(
    collectionName: string,
    points: Array<{ id: string; vector: number[]; payload: any }>
  ): Promise<void> {
    try {
      // Process in chunks to avoid memory issues
      const chunkSize = 100
      for (let i = 0; i < points.length; i += chunkSize) {
        const chunk = points.slice(i, i + chunkSize)
        await this.client.upsert(collectionName, {
          wait: true,
          points: chunk
        })
        logger.debug({ 
          collection: collectionName, 
          processed: i + chunk.length, 
          total: points.length 
        }, 'Batch upsert progress')
      }
      logger.info({ collection: collectionName, count: points.length }, 'Batch upsert completed')
    } catch (error) {
      logger.error({ error, collectionName, count: points.length }, 'Batch upsert failed')
      throw error
    }
  }

  async batchDelete(collectionName: string, pointIds: string[]): Promise<void> {
    try {
      await this.client.delete(collectionName, {
        wait: true,
        points: pointIds
      })
      logger.info({ collection: collectionName, count: pointIds.length }, 'Batch delete completed')
    } catch (error) {
      logger.error({ error, collectionName, count: pointIds.length }, 'Batch delete failed')
      throw error
    }
  }

  // Collection management
  async getCollectionInfo(collectionName: string): Promise<any> {
    try {
      return await this.client.getCollection(collectionName)
    } catch (error) {
      logger.error({ error, collectionName }, 'Failed to get collection info')
      throw error
    }
  }

  async updateCollectionConfig(collectionName: string, config: any): Promise<void> {
    try {
      await this.client.updateCollection(collectionName, config)
      logger.info({ collection: collectionName, config }, 'Collection config updated')
    } catch (error) {
      logger.error({ error, collectionName, config }, 'Failed to update collection config')
      throw error
    }
  }

  // Monitoring and statistics
  async getCollectionStats(): Promise<Record<string, any>> {
    try {
      const stats: Record<string, any> = {}
      
      for (const config of Object.values(VectorCollections)) {
        const info = await this.client.getCollection(config.name)
        stats[config.name] = {
          pointsCount: info.points_count,
          indexedVectorsCount: info.indexed_vectors_count,
          config: {
            vectorSize: config.vectorSize,
            distance: config.distance
          },
          status: info.status
        }
      }
      
      return stats
    } catch (error) {
      logger.error({ error }, 'Failed to get collection stats')
      throw error
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string; collections: Record<string, any> }> {
    try {
      const collections = await this.client.getCollections()
      const collectionHealth: Record<string, any> = {}
      
      for (const collection of collections.collections) {
        try {
          const info = await this.client.getCollection(collection.name)
          collectionHealth[collection.name] = {
            status: 'healthy',
            pointsCount: info.points_count,
            config: info.config
          }
        } catch (error) {
          collectionHealth[collection.name] = {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      }
      
      return {
        status: 'healthy',
        collections: collectionHealth
      }
    } catch (error) {
      logger.error({ error }, 'Vector service health check failed')
      return {
        status: 'unhealthy',
        collections: {}
      }
    }
  }
}

// Export singleton instance
export const vectorService = VectorService.getInstance()

// Utility functions for embedding operations
export class EmbeddingUtils {
  // Normalize vector to unit length
  static normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector
  }

  // Calculate cosine similarity between two vectors
  static cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same dimension')
    }

    const dotProduct = vectorA.reduce((sum, a, i) => sum + a * vectorB[i], 0)
    const magnitudeA = Math.sqrt(vectorA.reduce((sum, val) => sum + val * val, 0))
    const magnitudeB = Math.sqrt(vectorB.reduce((sum, val) => sum + val * val, 0))

    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0
  }

  // Generate random vector for testing
  static generateRandomVector(size: number): number[] {
    return Array.from({ length: size }, () => Math.random() - 0.5)
  }

  // Validate vector dimensions
  static validateVector(vector: number[], expectedSize: number): boolean {
    return Array.isArray(vector) && 
           vector.length === expectedSize && 
           vector.every(val => typeof val === 'number' && !isNaN(val))
  }
}

export { VectorCollections }