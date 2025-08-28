/**
 * Content storage and versioning system
 * Manages content variants, versions, and performance tracking
 */

import { 
  ContentVariant, 
  ContentVersion, 
  ContentHistory,
  ContentCategory,
  PerformanceMetrics 
} from '../types';
import { logger } from '../utils/logger';
import { RedisCache } from '../cache/redis-cache';

export class ContentStore {
  private variants: Map<string, ContentVariant>;
  private versions: Map<string, ContentVersion>;
  private history: ContentHistory[];

  constructor(
    private readonly cache: RedisCache,
    private readonly config: {
      maxVersionsPerContent: number;
      retentionDays: number;
    }
  ) {
    this.variants = new Map();
    this.versions = new Map();
    this.history = [];
    this.initialize();
  }

  /**
   * Initialize with default content
   */
  private async initialize(): Promise<void> {
    // Load persisted data from cache/database
    await this.loadPersistedData();

    // Initialize default variants if none exist
    if (this.variants.size === 0) {
      await this.initializeDefaultVariants();
    }

    logger.info({ 
      variantsCount: this.variants.size,
      versionsCount: this.versions.size 
    }, 'Content store initialized');
  }

  /**
   * Get active variants for a category/page
   */
  async getActiveVariants(
    category: ContentCategory,
    page: string
  ): Promise<ContentVariant[]> {
    const key = `${category}:${page}`;
    const variants: ContentVariant[] = [];

    for (const [id, variant] of this.variants) {
      if (id.startsWith(key) && 
          (variant.status === 'active' || variant.status === 'winner')) {
        variants.push(variant);
      }
    }

    // Sort by performance
    variants.sort((a, b) => 
      b.performance.conversionRate - a.performance.conversionRate
    );

    return variants;
  }

  /**
   * Create a new content variant
   */
  async createVariant(
    category: ContentCategory,
    page: string,
    variantId: string,
    content: Record<string, any>,
    experimentId?: string
  ): Promise<ContentVariant> {
    const id = `${category}:${page}:${variantId}`;
    
    const variant: ContentVariant = {
      id,
      experimentId: experimentId || `exp_${Date.now()}`,
      variantId,
      content,
      performance: {
        impressions: 0,
        conversions: 0,
        conversionRate: 0,
        confidence: 0
      },
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.variants.set(id, variant);
    
    // Create version entry
    await this.createVersion(category, page, content, 'draft');
    
    // Record history
    this.recordHistory(id, 'created', variant.performance);

    // Persist to cache
    await this.persistVariant(variant);

    logger.info({ 
      variantId: id,
      category,
      page,
      experimentId: variant.experimentId 
    }, 'Content variant created');

    return variant;
  }

  /**
   * Update variant performance metrics
   */
  async updateVariantPerformance(
    variantId: string,
    update: {
      conversion?: boolean;
      impression?: boolean;
      context?: any;
    }
  ): Promise<void> {
    const variant = this.variants.get(variantId);
    if (!variant) {
      logger.warn({ variantId }, 'Variant not found for performance update');
      return;
    }

    // Update metrics
    if (update.impression) {
      variant.performance.impressions++;
    }
    
    if (update.conversion) {
      variant.performance.conversions++;
    }

    // Recalculate conversion rate
    if (variant.performance.impressions > 0) {
      variant.performance.conversionRate = 
        variant.performance.conversions / variant.performance.impressions;
    }

    // Calculate confidence (simplified Wilson score)
    variant.performance.confidence = this.calculateConfidence(variant.performance);

    variant.updatedAt = new Date();

    // Persist updates
    await this.persistVariant(variant);

    logger.debug({ 
      variantId,
      metrics: variant.performance 
    }, 'Variant performance updated');
  }

  /**
   * Promote variant to winner
   */
  async promoteToWinner(variantId: string): Promise<void> {
    const variant = this.variants.get(variantId);
    if (!variant) {
      logger.error({ variantId }, 'Cannot promote non-existent variant');
      return;
    }

    // Demote current winner if exists
    const category = variantId.split(':')[0] as ContentCategory;
    const page = variantId.split(':')[1];
    
    for (const [id, v] of this.variants) {
      if (id.startsWith(`${category}:${page}`) && v.status === 'winner') {
        v.status = 'active';
        await this.persistVariant(v);
      }
    }

    // Promote new winner
    variant.status = 'winner';
    variant.updatedAt = new Date();
    
    // Create new version
    await this.createVersion(category, page, variant.content, 'active');
    
    // Record history
    this.recordHistory(variantId, 'promoted', variant.performance, 'Promoted to winner');

    await this.persistVariant(variant);

    logger.info({ 
      variantId,
      performance: variant.performance 
    }, 'Variant promoted to winner');
  }

  /**
   * Archive underperforming variants
   */
  async archiveVariant(variantId: string, reason?: string): Promise<void> {
    const variant = this.variants.get(variantId);
    if (!variant) return;

    variant.status = 'archived';
    variant.updatedAt = new Date();
    
    this.recordHistory(variantId, 'archived', variant.performance, reason);
    
    await this.persistVariant(variant);

    logger.info({ variantId, reason }, 'Variant archived');
  }

  /**
   * Create content version
   */
  private async createVersion(
    category: ContentCategory,
    page: string,
    content: Record<string, any>,
    status: 'draft' | 'active' | 'archived'
  ): Promise<ContentVersion> {
    const versionId = `${category}:${page}:v${Date.now()}`;
    
    const version: ContentVersion = {
      id: versionId,
      category,
      page,
      version: this.generateVersionNumber(),
      content,
      status,
      createdAt: new Date()
    };

    if (status === 'active') {
      version.activatedAt = new Date();
    }

    this.versions.set(versionId, version);
    
    // Enforce version limit
    await this.pruneOldVersions(category, page);
    
    // Persist to cache
    await this.cache.set(`version:${versionId}`, version, 86400 * 7); // 7 days

    return version;
  }

  /**
   * Get content version history
   */
  async getVersionHistory(
    category: ContentCategory,
    page: string,
    limit: number = 10
  ): Promise<ContentVersion[]> {
    const versions: ContentVersion[] = [];
    const prefix = `${category}:${page}`;

    for (const [id, version] of this.versions) {
      if (id.startsWith(prefix)) {
        versions.push(version);
      }
    }

    // Sort by creation date (newest first)
    versions.sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    );

    return versions.slice(0, limit);
  }

  /**
   * Rollback to previous version
   */
  async rollbackToVersion(versionId: string): Promise<void> {
    const version = this.versions.get(versionId);
    if (!version) {
      logger.error({ versionId }, 'Version not found for rollback');
      return;
    }

    // Create new variant with old content
    await this.createVariant(
      version.category,
      version.page,
      `rollback_${Date.now()}`,
      version.content
    );

    this.recordHistory(
      versionId,
      'rolled_back',
      undefined,
      `Rolled back to version ${version.version}`
    );

    logger.info({ versionId, version: version.version }, 'Rolled back to version');
  }

  /**
   * Calculate confidence score for metrics
   */
  private calculateConfidence(metrics: PerformanceMetrics): number {
    if (metrics.impressions < 30) return 0; // Not enough data

    const p = metrics.conversionRate;
    const n = metrics.impressions;
    const z = 1.96; // 95% confidence

    // Wilson score interval
    const denominator = 1 + (z * z) / n;
    const center = (p + (z * z) / (2 * n)) / denominator;
    const spread = (z / denominator) * Math.sqrt((p * (1 - p) / n) + (z * z / (4 * n * n)));

    return Math.max(0, Math.min(1, center - spread));
  }

  /**
   * Record content history
   */
  private recordHistory(
    versionId: string,
    action: ContentHistory['action'],
    performanceSnapshot?: PerformanceMetrics,
    reason?: string
  ): void {
    const entry: ContentHistory = {
      versionId,
      action,
      performanceSnapshot,
      reason,
      timestamp: new Date()
    };

    this.history.push(entry);

    // Limit history size
    if (this.history.length > 1000) {
      this.history = this.history.slice(-500);
    }
  }

  /**
   * Prune old versions to maintain limit
   */
  private async pruneOldVersions(
    category: ContentCategory,
    page: string
  ): Promise<void> {
    const versions = await this.getVersionHistory(category, page, 100);
    
    if (versions.length > this.config.maxVersionsPerContent) {
      const toDelete = versions.slice(this.config.maxVersionsPerContent);
      
      for (const version of toDelete) {
        if (version.status !== 'active') {
          this.versions.delete(version.id);
          await this.cache.delete(`version:${version.id}`);
        }
      }
    }
  }

  /**
   * Generate version number
   */
  private generateVersionNumber(): string {
    const date = new Date();
    return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}.${Date.now() % 1000}`;
  }

  /**
   * Persist variant to cache/database
   */
  private async persistVariant(variant: ContentVariant): Promise<void> {
    await this.cache.set(
      `variant:${variant.id}`,
      variant,
      3600 * 24 // 24 hours
    );
  }

  /**
   * Load persisted data on startup
   */
  private async loadPersistedData(): Promise<void> {
    try {
      // Load variants from cache
      const variantKeys = await this.cache.keys('variant:*');
      for (const key of variantKeys) {
        const variant = await this.cache.get(key);
        if (variant) {
          this.variants.set(variant.id, variant as ContentVariant);
        }
      }

      // Load versions from cache
      const versionKeys = await this.cache.keys('version:*');
      for (const key of versionKeys) {
        const version = await this.cache.get(key);
        if (version) {
          this.versions.set(version.id, version as ContentVersion);
        }
      }

      logger.info({ 
        loadedVariants: this.variants.size,
        loadedVersions: this.versions.size 
      }, 'Persisted data loaded');

    } catch (error) {
      logger.error({ error }, 'Error loading persisted data');
    }
  }

  /**
   * Initialize default content variants
   */
  private async initializeDefaultVariants(): Promise<void> {
    // Marketing homepage variants
    await this.createVariant('marketing', 'homepage', 'control', {
      headline: 'AI-Powered Legal Document Analysis',
      subheadline: 'Understand contracts in seconds',
      cta: 'Start Free Trial',
      features: ['Instant analysis', 'Risk detection', 'Plain English summaries']
    });

    await this.createVariant('marketing', 'homepage', 'variant_a', {
      headline: 'Never Miss Critical Contract Issues Again',
      subheadline: 'AI reviews your legal documents in 5 seconds',
      cta: 'Try It Free',
      features: ['50+ risk patterns', 'Instant alerts', 'Actionable recommendations']
    });

    // Sales messaging variants
    await this.createVariant('sales', 'messaging', 'control', {
      value_prop: 'Save hours on contract review',
      pain_point: 'Stop missing critical contract issues',
      social_proof: 'Trusted by 1000+ companies'
    });

    await this.createVariant('sales', 'messaging', 'variant_a', {
      value_prop: 'Reduce contract review time by 90%',
      pain_point: 'Eliminate costly legal oversights',
      social_proof: 'Join 1000+ companies saving time and money'
    });

    logger.info('Default content variants initialized');
  }

  /**
   * Get performance statistics
   */
  getStatistics(): {
    totalVariants: number;
    activeVariants: number;
    winners: number;
    averageConversionRate: number;
  } {
    let activeCount = 0;
    let winnerCount = 0;
    let totalConversionRate = 0;

    for (const variant of this.variants.values()) {
      if (variant.status === 'active') activeCount++;
      if (variant.status === 'winner') winnerCount++;
      totalConversionRate += variant.performance.conversionRate;
    }

    return {
      totalVariants: this.variants.size,
      activeVariants: activeCount,
      winners: winnerCount,
      averageConversionRate: totalConversionRate / Math.max(1, this.variants.size)
    };
  }
}