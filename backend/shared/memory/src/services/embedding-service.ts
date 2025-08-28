/**
 * Embedding Service
 * Generates vector embeddings for semantic memory search using local models
 */

import { Logger } from '../utils/logger';
import { Metrics } from '../utils/metrics';

export interface EmbeddingConfig {
  modelName: string;
  dimensions: number;
  batchSize: number;
  maxTokens: number;
  timeout: number;
  cacheEnabled: boolean;
  cacheTtl: number;
}

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
  processingTime: number;
  model: string;
  cached: boolean;
}

export class EmbeddingService {
  private logger: Logger;
  private metrics: Metrics;
  private config: EmbeddingConfig;
  private embeddingCache: Map<string, { embedding: number[]; timestamp: number }>;

  constructor(config?: Partial<EmbeddingConfig>) {
    this.config = {
      modelName: 'sentence-transformers/all-MiniLM-L6-v2',
      dimensions: 384,
      batchSize: 32,
      maxTokens: 512,
      timeout: 10000,
      cacheEnabled: true,
      cacheTtl: 24 * 60 * 60 * 1000, // 24 hours
      ...config,
    };

    this.logger = Logger.getInstance('EmbeddingService');
    this.metrics = Metrics.getInstance();
    this.embeddingCache = new Map();

    // Cleanup cache periodically
    setInterval(() => this.cleanupCache(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      if (this.config.cacheEnabled) {
        const cached = this.getCachedEmbedding(text);
        if (cached) {
          this.metrics.increment('embedding.cache.hit');
          return cached;
        }
      }

      // Preprocess text
      const processedText = this.preprocessText(text);
      
      // Generate embedding using local model
      const embedding = await this.generateEmbeddingWithModel(processedText);
      
      // Cache the result
      if (this.config.cacheEnabled) {
        this.cacheEmbedding(text, embedding);
      }

      const processingTime = Date.now() - startTime;
      this.metrics.histogram('embedding.generation.duration', processingTime);
      this.metrics.increment('embedding.generation.success');

      this.logger.debug(`Generated embedding for text (${processedText.length} chars, ${processingTime}ms)`);

      return embedding;
    } catch (error) {
      this.metrics.increment('embedding.generation.errors');
      this.logger.error('Failed to generate embedding:', error);
      
      // Return zero vector as fallback
      return new Array(this.config.dimensions).fill(0);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const startTime = Date.now();
    const results: number[][] = [];
    
    try {
      // Process in batches
      for (let i = 0; i < texts.length; i += this.config.batchSize) {
        const batch = texts.slice(i, i + this.config.batchSize);
        const batchEmbeddings = await Promise.all(
          batch.map(text => this.generateEmbedding(text))
        );
        results.push(...batchEmbeddings);
      }

      const processingTime = Date.now() - startTime;
      this.metrics.histogram('embedding.batch_generation.duration', processingTime);
      this.metrics.gauge('embedding.batch_generation.size', texts.length);

      this.logger.debug(`Generated ${results.length} embeddings in batch (${processingTime}ms)`);

      return results;
    } catch (error) {
      this.metrics.increment('embedding.batch_generation.errors');
      this.logger.error('Failed to generate batch embeddings:', error);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Find most similar embeddings from a collection
   */
  findMostSimilar(
    queryEmbedding: number[],
    candidateEmbeddings: Array<{ id: string; embedding: number[] }>,
    topK: number = 10,
    threshold: number = 0.5
  ): Array<{ id: string; similarity: number }> {
    const similarities = candidateEmbeddings
      .map(candidate => ({
        id: candidate.id,
        similarity: this.calculateSimilarity(queryEmbedding, candidate.embedding),
      }))
      .filter(result => result.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return similarities;
  }

  /**
   * Get embedding cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    missRate: number;
    memoryUsage: number;
  } {
    const hitRate = this.metrics.getCounterValue('embedding.cache.hit') || 0;
    const missRate = this.metrics.getCounterValue('embedding.cache.miss') || 0;
    const total = hitRate + missRate;

    return {
      size: this.embeddingCache.size,
      hitRate: total > 0 ? hitRate / total : 0,
      missRate: total > 0 ? missRate / total : 0,
      memoryUsage: this.estimateCacheMemoryUsage(),
    };
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.embeddingCache.clear();
    this.logger.info('Embedding cache cleared');
  }

  // Private methods

  private preprocessText(text: string): string {
    // Basic text preprocessing
    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, this.config.maxTokens * 4); // Rough token limit
  }

  private async generateEmbeddingWithModel(text: string): Promise<number[]> {
    // This would integrate with your local LLM infrastructure
    // For now, we'll simulate with a deterministic hash-based approach
    
    // In a real implementation, this would call:
    // - Ollama API for local models
    // - Sentence transformers
    // - Other embedding models
    
    return this.generateSimulatedEmbedding(text);
  }

  private generateSimulatedEmbedding(text: string): number[] {
    // Deterministic embedding generation for testing
    // In production, replace with actual model calls
    
    const hash = this.simpleHash(text);
    const embedding = new Array(this.config.dimensions);
    
    for (let i = 0; i < this.config.dimensions; i++) {
      // Generate pseudo-random but deterministic values
      const seed = hash + i;
      embedding[i] = (Math.sin(seed) + Math.cos(seed * 1.1)) / 2;
    }
    
    // Normalize the vector
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / norm);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private getCachedEmbedding(text: string): number[] | null {
    const key = this.getCacheKey(text);
    const cached = this.embeddingCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.config.cacheTtl) {
      return cached.embedding;
    }
    
    if (cached) {
      // Remove expired entry
      this.embeddingCache.delete(key);
    }
    
    this.metrics.increment('embedding.cache.miss');
    return null;
  }

  private cacheEmbedding(text: string, embedding: number[]): void {
    const key = this.getCacheKey(text);
    this.embeddingCache.set(key, {
      embedding: [...embedding], // Copy array
      timestamp: Date.now(),
    });
  }

  private getCacheKey(text: string): string {
    // Simple hash for cache key
    return `embedding_${this.simpleHash(text)}_${text.length}`;
  }

  private cleanupCache(): void {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, value] of this.embeddingCache.entries()) {
      if (now - value.timestamp > this.config.cacheTtl) {
        this.embeddingCache.delete(key);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      this.logger.debug(`Cleaned up ${removedCount} expired cache entries`);
    }
  }

  private estimateCacheMemoryUsage(): number {
    // Rough estimation of memory usage
    const avgEntrySize = this.config.dimensions * 8 + 100; // 8 bytes per float + overhead
    return this.embeddingCache.size * avgEntrySize;
  }
}