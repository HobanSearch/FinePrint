/**
 * Embedding Service for Fine Print AI
 * Handles document vectorization and semantic search operations
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class EmbeddingService {
  constructor(options = {}) {
    this.client = new QdrantClient({
      url: options.qdrantUrl || process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: options.apiKey || process.env.QDRANT_API_KEY,
    });
    
    this.collections = {
      documents: 'document_embeddings',
      patterns: 'pattern_embeddings',
      users: 'user_embeddings',
    };
    
    // Configuration for different embedding models
    this.embeddingConfigs = {
      openai: { size: 1536, model: 'text-embedding-ada-002' },
      sentence_transformer: { size: 768, model: 'all-MiniLM-L6-v2' },
      custom: { size: 512, model: 'custom-legal-embeddings' },
    };
  }

  /**
   * Store document embeddings with metadata
   */
  async storeDocumentEmbedding(documentData) {
    const {
      documentId,
      userId,
      content,
      embedding,
      metadata = {},
    } = documentData;

    // Validate embedding dimensions
    if (embedding.length !== this.embeddingConfigs.openai.size) {
      throw new Error(`Invalid embedding size. Expected ${this.embeddingConfigs.openai.size}, got ${embedding.length}`);
    }

    // Create chunks for large documents
    const chunks = await this.createDocumentChunks(content, metadata);
    const embeddingIds = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embeddingId = uuidv4();
      
      const point = {
        id: embeddingId,
        vector: chunk.embedding || embedding, // Use chunk-specific embedding if available
        payload: {
          document_id: documentId,
          user_id: userId,
          chunk_index: i,
          total_chunks: chunks.length,
          content_hash: this.generateContentHash(chunk.content),
          document_type: metadata.documentType || 'unknown',
          language: metadata.language || 'en',
          risk_score: metadata.riskScore,
          categories: metadata.categories || [],
          title: metadata.title,
          url: metadata.url,
          content_summary: chunk.summary,
          chunk_content: chunk.content.substring(0, 1000), // First 1000 chars for preview
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // Semantic metadata
          key_topics: chunk.topics || [],
          sentiment_score: chunk.sentiment,
          legal_concepts: chunk.legalConcepts || [],
          risk_indicators: chunk.riskIndicators || [],
        },
      };

      await this.client.upsert(this.collections.documents, {
        wait: true,
        points: [point],
      });

      embeddingIds.push(embeddingId);
    }

    return {
      success: true,
      embeddingIds,
      chunksStored: chunks.length,
    };
  }

  /**
   * Store pattern embeddings for legal issue detection
   */
  async storePatternEmbedding(patternData) {
    const {
      patternId,
      embedding,
      metadata = {},
    } = patternData;

    const point = {
      id: uuidv4(),
      vector: embedding,
      payload: {
        pattern_id: patternId,
        category: metadata.category,
        severity: metadata.severity,
        name: metadata.name,
        description: metadata.description,
        keywords: metadata.keywords || [],
        regex_pattern: metadata.regexPattern,
        legal_basis: metadata.legalBasis,
        applicable_regions: metadata.applicableRegions || [],
        is_active: metadata.isActive !== false,
        version: metadata.version || 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    };

    await this.client.upsert(this.collections.patterns, {
      wait: true,
      points: [point],
    });

    return { success: true, embeddingId: point.id };
  }

  /**
   * Search for similar documents using semantic similarity
   */
  async searchSimilarDocuments(queryEmbedding, options = {}) {
    const {
      limit = 10,
      minScore = 0.7,
      filters = {},
      userId = null,
      documentTypes = null,
      categories = null,
      riskScoreRange = null,
    } = options;

    // Build filter conditions
    const filterConditions = [];

    if (userId) {
      filterConditions.push({
        key: 'user_id',
        match: { value: userId },
      });
    }

    if (documentTypes && documentTypes.length > 0) {
      filterConditions.push({
        key: 'document_type',
        match: { any: documentTypes },
      });
    }

    if (categories && categories.length > 0) {
      filterConditions.push({
        key: 'categories',
        match: { any: categories },
      });
    }

    if (riskScoreRange) {
      filterConditions.push({
        key: 'risk_score',
        range: {
          gte: riskScoreRange.min || 0,
          lte: riskScoreRange.max || 100,
        },
      });
    }

    // Add custom filters
    Object.entries(filters).forEach(([key, value]) => {
      filterConditions.push({
        key,
        match: { value },
      });
    });

    const searchParams = {
      vector: queryEmbedding,
      limit,
      with_payload: true,
      with_vector: false,
      score_threshold: minScore,
    };

    if (filterConditions.length > 0) {
      searchParams.filter = {
        must: filterConditions,
      };
    }

    const results = await this.client.search(this.collections.documents, searchParams);

    return results.map(result => ({
      id: result.id,
      score: result.score,
      documentId: result.payload.document_id,
      chunkIndex: result.payload.chunk_index,
      title: result.payload.title,
      contentSummary: result.payload.content_summary,
      documentType: result.payload.document_type,
      riskScore: result.payload.risk_score,
      categories: result.payload.categories,
      keyTopics: result.payload.key_topics,
      riskIndicators: result.payload.risk_indicators,
      createdAt: result.payload.created_at,
    }));
  }

  /**
   * Find matching legal patterns for document analysis
   */
  async findMatchingPatterns(documentEmbedding, options = {}) {
    const {
      limit = 20,
      minScore = 0.6,
      severity = null,
      categories = null,
      activeOnly = true,
    } = options;

    const filterConditions = [];

    if (activeOnly) {
      filterConditions.push({
        key: 'is_active',
        match: { value: true },
      });
    }

    if (severity && severity.length > 0) {
      filterConditions.push({
        key: 'severity',
        match: { any: Array.isArray(severity) ? severity : [severity] },
      });
    }

    if (categories && categories.length > 0) {
      filterConditions.push({
        key: 'category',
        match: { any: categories },
      });
    }

    const searchParams = {
      vector: documentEmbedding,
      limit,
      with_payload: true,
      with_vector: false,
      score_threshold: minScore,
    };

    if (filterConditions.length > 0) {
      searchParams.filter = {
        must: filterConditions,
      };
    }

    const results = await this.client.search(this.collections.patterns, searchParams);

    return results.map(result => ({
      id: result.id,
      score: result.score,
      patternId: result.payload.pattern_id,
      category: result.payload.category,
      severity: result.payload.severity,
      name: result.payload.name,
      description: result.payload.description,
      keywords: result.payload.keywords,
      legalBasis: result.payload.legal_basis,
      applicableRegions: result.payload.applicable_regions,
    }));
  }

  /**
   * Get document recommendations based on user preferences
   */
  async getDocumentRecommendations(userId, userPreferencesEmbedding, options = {}) {
    const {
      limit = 5,
      excludeDocuments = [],
      focusCategories = null,
      maxRiskScore = null,
    } = options;

    const filterConditions = [
      {
        key: 'user_id',
        match: { value: userId },
      },
    ];

    if (excludeDocuments.length > 0) {
      filterConditions.push({
        key: 'document_id',
        match: { except: excludeDocuments },
      });
    }

    if (focusCategories && focusCategories.length > 0) {
      filterConditions.push({
        key: 'categories',
        match: { any: focusCategories },
      });
    }

    if (maxRiskScore !== null) {
      filterConditions.push({
        key: 'risk_score',
        range: { lte: maxRiskScore },
      });
    }

    const results = await this.client.search(this.collections.documents, {
      vector: userPreferencesEmbedding,
      limit,
      with_payload: true,
      with_vector: false,
      filter: {
        must: filterConditions,
      },
    });

    return results.map(result => ({
      documentId: result.payload.document_id,
      title: result.payload.title,
      relevanceScore: result.score,
      riskScore: result.payload.risk_score,
      categories: result.payload.categories,
      contentSummary: result.payload.content_summary,
    }));
  }

  /**
   * Cluster similar documents for analysis
   */
  async clusterDocuments(documentIds, options = {}) {
    const { threshold = 0.8 } = options;

    // Get embeddings for all documents
    const points = await this.client.retrieve(this.collections.documents, {
      ids: documentIds,
      with_payload: true,
      with_vector: true,
    });

    // Simple clustering based on similarity threshold
    const clusters = [];
    const processed = new Set();

    for (const point of points) {
      if (processed.has(point.id)) continue;

      const cluster = {
        id: uuidv4(),
        representative: point,
        members: [point],
        centroid: [...point.vector],
      };

      // Find similar documents
      for (const other of points) {
        if (processed.has(other.id) || point.id === other.id) continue;

        const similarity = this.cosineSimilarity(point.vector, other.vector);
        if (similarity >= threshold) {
          cluster.members.push(other);
          processed.add(other.id);
        }
      }

      clusters.push(cluster);
      processed.add(point.id);
    }

    return clusters;
  }

  /**
   * Update document embedding and metadata
   */
  async updateDocumentEmbedding(embeddingId, updates) {
    const { embedding, metadata } = updates;

    const updateData = {
      id: embeddingId,
    };

    if (embedding) {
      updateData.vector = embedding;
    }

    if (metadata) {
      updateData.payload = {
        ...metadata,
        updated_at: new Date().toISOString(),
      };
    }

    await this.client.upsert(this.collections.documents, {
      wait: true,
      points: [updateData],
    });

    return { success: true };
  }

  /**
   * Delete document embeddings
   */
  async deleteDocumentEmbeddings(documentId) {
    await this.client.delete(this.collections.documents, {
      wait: true,
      filter: {
        must: [
          {
            key: 'document_id',
            match: { value: documentId },
          },
        ],
      },
    });

    return { success: true };
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats() {
    const stats = {};

    for (const [name, collection] of Object.entries(this.collections)) {
      try {
        const info = await this.client.getCollection(collection);
        stats[name] = {
          vectorsCount: info.vectors_count,
          indexedVectors: info.indexed_vectors_count,
          segmentsCount: info.segments_count,
          diskUsage: info.disk_data_size,
          ramUsage: info.ram_data_size,
        };
      } catch (error) {
        stats[name] = { error: error.message };
      }
    }

    return stats;
  }

  // Helper methods

  /**
   * Create document chunks for large documents
   */
  async createDocumentChunks(content, metadata, chunkSize = 2000, overlap = 200) {
    const chunks = [];
    const contentLength = content.length;

    if (contentLength <= chunkSize) {
      return [{
        content,
        summary: this.generateSummary(content),
        topics: this.extractTopics(content),
        sentiment: this.analyzeSentiment(content),
        legalConcepts: this.extractLegalConcepts(content),
        riskIndicators: this.identifyRiskIndicators(content),
      }];
    }

    for (let i = 0; i < contentLength; i += chunkSize - overlap) {
      const chunkContent = content.slice(i, i + chunkSize);
      
      chunks.push({
        content: chunkContent,
        summary: this.generateSummary(chunkContent),
        topics: this.extractTopics(chunkContent),
        sentiment: this.analyzeSentiment(chunkContent),
        legalConcepts: this.extractLegalConcepts(chunkContent),
        riskIndicators: this.identifyRiskIndicators(chunkContent),
      });
    }

    return chunks;
  }

  /**
   * Generate content hash for deduplication
   */
  generateContentHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vectorA, vectorB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Content analysis helper methods (simplified implementations)

  generateSummary(content) {
    // Simple extractive summary - first sentence + key sentences
    const sentences = content.split('. ');
    return sentences.slice(0, 2).join('. ') + '.';
  }

  extractTopics(content) {
    // Simple keyword extraction
    const keywords = content.toLowerCase()
      .match(/\b\w{4,}\b/g) || [];
    
    const frequency = {};
    keywords.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  analyzeSentiment(content) {
    // Simple sentiment analysis based on keywords
    const positive = ['good', 'great', 'excellent', 'protect', 'secure'];
    const negative = ['bad', 'poor', 'terrible', 'risk', 'danger', 'breach'];

    const words = content.toLowerCase().split(/\W+/);
    const positiveCount = words.filter(word => positive.includes(word)).length;
    const negativeCount = words.filter(word => negative.includes(word)).length;

    return (positiveCount - negativeCount) / Math.max(words.length, 1);
  }

  extractLegalConcepts(content) {
    const legalTerms = [
      'liability', 'damages', 'arbitration', 'jurisdiction', 'consent',
      'privacy', 'data', 'personal information', 'third party', 'terminate'
    ];

    return legalTerms.filter(term => 
      content.toLowerCase().includes(term.toLowerCase())
    );
  }

  identifyRiskIndicators(content) {
    const riskPatterns = [
      'unlimited liability', 'no warranty', 'as is', 'sole discretion',
      'without notice', 'broad license', 'perpetual', 'irrevocable'
    ];

    return riskPatterns.filter(pattern => 
      content.toLowerCase().includes(pattern.toLowerCase())
    );
  }
}

module.exports = EmbeddingService;