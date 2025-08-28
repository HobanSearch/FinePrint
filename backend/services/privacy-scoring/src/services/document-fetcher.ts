import { createHash } from 'crypto';
import { Redis } from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

interface FetchResult {
  content: string;
  hash: string;
  fetchedAt: Date;
}

export class DocumentFetcher {
  private redis: Redis;
  private readonly cachePrefix = 'privacy-scoring:documents:';

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    });
  }

  /**
   * Fetch document from URL with caching
   */
  async fetchDocument(url: string, useCache = true): Promise<FetchResult | null> {
    if (!url) {
      return null;
    }

    const cacheKey = `${this.cachePrefix}${this.hashUrl(url)}`;

    // Check cache first
    if (useCache) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.info(`Document fetched from cache: ${url}`);
        return JSON.parse(cached);
      }
    }

    try {
      // Fetch document
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'FinePrintAI-PrivacyScorer/1.0 (https://fineprintai.com)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      
      // Clean HTML content
      const cleanedContent = this.cleanHtmlContent(content);
      
      // Generate content hash
      const hash = this.generateHash(cleanedContent);

      const result: FetchResult = {
        content: cleanedContent,
        hash,
        fetchedAt: new Date(),
      };

      // Cache the result
      await this.redis.setex(
        cacheKey,
        config.cache.ttl.document,
        JSON.stringify(result)
      );

      logger.info(`Document fetched and cached: ${url}`);
      return result;

    } catch (error) {
      logger.error(`Failed to fetch document from ${url}:`, error);
      return null;
    }
  }

  /**
   * Fetch multiple documents concurrently
   */
  async fetchDocuments(
    urls: { privacyPolicy?: string; termsOfService?: string },
    useCache = true
  ): Promise<{
    privacyPolicy?: FetchResult;
    termsOfService?: FetchResult;
  }> {
    const [privacyPolicy, termsOfService] = await Promise.all([
      urls.privacyPolicy ? this.fetchDocument(urls.privacyPolicy, useCache) : Promise.resolve(null),
      urls.termsOfService ? this.fetchDocument(urls.termsOfService, useCache) : Promise.resolve(null),
    ]);

    return {
      privacyPolicy: privacyPolicy || undefined,
      termsOfService: termsOfService || undefined,
    };
  }

  /**
   * Check if document has changed by comparing hashes
   */
  async hasDocumentChanged(url: string, previousHash: string): Promise<boolean> {
    const result = await this.fetchDocument(url, false); // Don't use cache
    if (!result) {
      return false;
    }

    return result.hash !== previousHash;
  }

  /**
   * Clean HTML content to extract text
   */
  private cleanHtmlContent(html: string): string {
    // Remove script and style tags
    let cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Remove HTML tags
    cleaned = cleaned.replace(/<[^>]+>/g, ' ');
    
    // Decode HTML entities
    cleaned = cleaned
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    
    // Clean up whitespace
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return cleaned;
  }

  /**
   * Generate hash for content
   */
  private generateHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate hash for URL (for cache key)
   */
  private hashUrl(url: string): string {
    return createHash('md5').update(url).digest('hex');
  }

  /**
   * Clear cache for a specific URL
   */
  async clearCache(url: string): Promise<void> {
    const cacheKey = `${this.cachePrefix}${this.hashUrl(url)}`;
    await this.redis.del(cacheKey);
  }

  /**
   * Clear all document cache
   */
  async clearAllCache(): Promise<void> {
    const keys = await this.redis.keys(`${this.cachePrefix}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export const documentFetcher = new DocumentFetcher();