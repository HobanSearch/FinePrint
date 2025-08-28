import { Client as PgClient } from 'pg'
import { pino } from 'pino'
import { createHash } from 'crypto'
import axios, { AxiosResponse } from 'axios'
import * as cheerio from 'cheerio'
import fastDiff from 'fast-diff'

const logger = pino({ name: 'data-aggregation-service' })

// Data aggregation interfaces
interface WebsiteMonitorTarget {
  id: string
  domain: string
  name: string
  category: string
  jurisdiction: string[]
  priority: 'high' | 'medium' | 'low'
  monitoring_frequency: number // hours
  document_selectors: {
    terms_url?: string
    privacy_url?: string
    cookie_url?: string
    selectors?: {
      terms?: string
      privacy?: string
      content?: string
    }
  }
  last_monitored?: Date
  next_monitor?: Date
  is_active: boolean
}

interface DocumentChange {
  id: string
  website_id: string
  document_type: 'terms' | 'privacy' | 'cookie' | 'other'
  change_type: 'added' | 'modified' | 'removed'
  old_content_hash?: string
  new_content_hash: string
  diff_summary: string
  change_percentage: number
  detected_at: Date
  processed: boolean
}

interface TrainingDataPoint {
  id: string
  website_id: string
  document_type: string
  content_snippet: string
  labels: string[]
  severity: 'low' | 'medium' | 'high' | 'critical'
  jurisdiction_tags: string[]
  regulatory_violations: string[]
  quality_score: number
  human_verified: boolean
  created_at: Date
}

interface DataQualityMetrics {
  total_documents: number
  processing_success_rate: number
  average_quality_score: number
  label_distribution: Record<string, number>
  jurisdiction_coverage: Record<string, number>
  last_updated: Date
}

export class DataAggregationService {
  private db: PgClient
  private userAgent = 'FinePrintAI-Bot/1.0 (+https://fineprintai.com/bot)'

  constructor(db: PgClient) {
    this.db = db
  }

  // Initialize data aggregation system
  async initializeDataAggregation(): Promise<void> {
    const createTablesQuery = `
      -- Website monitoring targets
      CREATE TABLE IF NOT EXISTS website_monitoring_targets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        domain VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        jurisdiction TEXT[] DEFAULT '{}',
        priority VARCHAR(10) DEFAULT 'medium',
        monitoring_frequency INTEGER DEFAULT 24,
        document_selectors JSONB DEFAULT '{}',
        last_monitored TIMESTAMP WITH TIME ZONE,
        next_monitor TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Document changes tracking
      CREATE TABLE IF NOT EXISTS document_changes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        website_id UUID REFERENCES website_monitoring_targets(id) ON DELETE CASCADE,
        document_type VARCHAR(50) NOT NULL,
        change_type VARCHAR(20) NOT NULL,
        old_content_hash VARCHAR(64),
        new_content_hash VARCHAR(64) NOT NULL,
        old_content TEXT,
        new_content TEXT,
        diff_summary TEXT,
        change_percentage DECIMAL(5,2),
        detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        processed BOOLEAN DEFAULT false,
        processing_notes TEXT
      );

      -- ML training dataset
      CREATE TABLE IF NOT EXISTS training_dataset (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        website_id UUID REFERENCES website_monitoring_targets(id) ON DELETE CASCADE,
        document_type VARCHAR(50) NOT NULL,
        content_snippet TEXT NOT NULL,
        labels TEXT[] DEFAULT '{}',
        severity VARCHAR(20) NOT NULL,
        jurisdiction_tags TEXT[] DEFAULT '{}',
        regulatory_violations TEXT[] DEFAULT '{}',
        quality_score DECIMAL(3,2) DEFAULT 0.0,
        human_verified BOOLEAN DEFAULT false,
        verification_notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Data quality metrics
      CREATE TABLE IF NOT EXISTS data_quality_metrics (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
        total_documents INTEGER DEFAULT 0,
        processing_success_rate DECIMAL(5,2) DEFAULT 0.0,
        average_quality_score DECIMAL(3,2) DEFAULT 0.0,
        label_distribution JSONB DEFAULT '{}',
        jurisdiction_coverage JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(metric_date)
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_website_monitoring_next_monitor ON website_monitoring_targets(next_monitor) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_document_changes_website_detected ON document_changes(website_id, detected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_document_changes_processed ON document_changes(processed, detected_at) WHERE processed = false;
      CREATE INDEX IF NOT EXISTS idx_training_dataset_labels ON training_dataset USING GIN(labels);
      CREATE INDEX IF NOT EXISTS idx_training_dataset_jurisdiction ON training_dataset USING GIN(jurisdiction_tags);
      CREATE INDEX IF NOT EXISTS idx_training_dataset_quality ON training_dataset(quality_score DESC);

      -- Function to update next_monitor timestamp
      CREATE OR REPLACE FUNCTION update_next_monitor()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.next_monitor = CURRENT_TIMESTAMP + (NEW.monitoring_frequency || ' hours')::INTERVAL;
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Trigger to automatically update next_monitor
      DROP TRIGGER IF EXISTS trigger_update_next_monitor ON website_monitoring_targets;
      CREATE TRIGGER trigger_update_next_monitor
        BEFORE INSERT OR UPDATE OF monitoring_frequency, last_monitored
        ON website_monitoring_targets
        FOR EACH ROW
        EXECUTE FUNCTION update_next_monitor();
    `

    await this.db.query(createTablesQuery)
    logger.info('Data aggregation tables initialized')
  }

  // Add websites to monitoring list
  async addMonitoringTargets(targets: Omit<WebsiteMonitorTarget, 'id' | 'last_monitored' | 'next_monitor'>[]): Promise<void> {
    for (const target of targets) {
      const insertQuery = `
        INSERT INTO website_monitoring_targets (
          domain, name, category, jurisdiction, priority, 
          monitoring_frequency, document_selectors, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (domain) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          jurisdiction = EXCLUDED.jurisdiction,
          priority = EXCLUDED.priority,
          monitoring_frequency = EXCLUDED.monitoring_frequency,
          document_selectors = EXCLUDED.document_selectors,
          is_active = EXCLUDED.is_active,
          updated_at = CURRENT_TIMESTAMP
      `

      await this.db.query(insertQuery, [
        target.domain,
        target.name,
        target.category,
        target.jurisdiction,
        target.priority,
        target.monitoring_frequency,
        JSON.stringify(target.document_selectors),
        target.is_active
      ])
    }

    logger.info(`Added/updated ${targets.length} monitoring targets`)
  }

  // Get websites that need monitoring
  async getWebsitesForMonitoring(): Promise<WebsiteMonitorTarget[]> {
    const query = `
      SELECT * FROM website_monitoring_targets
      WHERE is_active = true
      AND (next_monitor IS NULL OR next_monitor <= CURRENT_TIMESTAMP)
      ORDER BY priority DESC, last_monitored ASC NULLS FIRST
      LIMIT 50
    `

    const result = await this.db.query(query)
    return result.rows.map(row => ({
      id: row.id,
      domain: row.domain,
      name: row.name,
      category: row.category,
      jurisdiction: row.jurisdiction,
      priority: row.priority,
      monitoring_frequency: row.monitoring_frequency,
      document_selectors: row.document_selectors,
      last_monitored: row.last_monitored,
      next_monitor: row.next_monitor,
      is_active: row.is_active
    }))
  }

  // Monitor a single website for document changes
  async monitorWebsite(target: WebsiteMonitorTarget): Promise<DocumentChange[]> {
    const changes: DocumentChange[] = []
    
    try {
      // Monitor Terms of Service
      if (target.document_selectors.terms_url) {
        const termsChange = await this.checkDocumentChange(
          target,
          'terms',
          target.document_selectors.terms_url,
          target.document_selectors.selectors?.terms
        )
        if (termsChange) changes.push(termsChange)
      }

      // Monitor Privacy Policy
      if (target.document_selectors.privacy_url) {
        const privacyChange = await this.checkDocumentChange(
          target,
          'privacy',
          target.document_selectors.privacy_url,
          target.document_selectors.selectors?.privacy
        )
        if (privacyChange) changes.push(privacyChange)
      }

      // Monitor Cookie Policy
      if (target.document_selectors.cookie_url) {
        const cookieChange = await this.checkDocumentChange(
          target,
          'cookie',
          target.document_selectors.cookie_url,
          target.document_selectors.selectors?.content
        )
        if (cookieChange) changes.push(cookieChange)
      }

      // Update monitoring timestamp
      await this.updateMonitoringTimestamp(target.id)

      if (changes.length > 0) {
        logger.info(`Detected ${changes.length} changes for ${target.domain}`)
      }

    } catch (error) {
      logger.error(`Failed to monitor ${target.domain}:`, error)
      await this.recordMonitoringError(target.id, error instanceof Error ? error.message : 'Unknown error')
    }

    return changes
  }

  // Check for changes in a specific document
  private async checkDocumentChange(
    target: WebsiteMonitorTarget,
    documentType: 'terms' | 'privacy' | 'cookie' | 'other',
    url: string,
    selector?: string
  ): Promise<DocumentChange | null> {
    try {
      // Fetch current content
      const response = await axios.get(url, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 30000,
        maxRedirects: 5
      })

      let content = response.data
      
      // Extract content using selector if provided
      if (selector && typeof content === 'string') {
        const $ = cheerio.load(content)
        const selectedContent = $(selector).text()
        content = selectedContent || content
      }

      // Clean and normalize content
      const cleanContent = this.cleanDocumentContent(content)
      const contentHash = this.hashContent(cleanContent)

      // Get previous version
      const previousVersionQuery = `
        SELECT new_content_hash, new_content
        FROM document_changes
        WHERE website_id = $1 AND document_type = $2
        ORDER BY detected_at DESC
        LIMIT 1
      `
      
      const previousResult = await this.db.query(previousVersionQuery, [target.id, documentType])
      
      // Check if content has changed
      if (previousResult.rows.length === 0) {
        // First time monitoring this document
        return await this.recordDocumentChange(
          target.id,
          documentType,
          'added',
          undefined,
          contentHash,
          undefined,
          cleanContent,
          'Initial document capture',
          100.0
        )
      }

      const previousHash = previousResult.rows[0].new_content_hash
      const previousContent = previousResult.rows[0].new_content

      if (contentHash !== previousHash) {
        // Content has changed - calculate diff
        const diffResult = this.calculateContentDiff(previousContent, cleanContent)
        
        return await this.recordDocumentChange(
          target.id,
          documentType,
          'modified',
          previousHash,
          contentHash,
          previousContent,
          cleanContent,
          diffResult.summary,
          diffResult.changePercentage
        )
      }

      return null // No change detected

    } catch (error) {
      logger.error(`Failed to check document change for ${url}:`, error)
      throw error
    }
  }

  // Clean and normalize document content
  private cleanDocumentContent(content: string): string {
    if (typeof content !== 'string') {
      content = String(content)
    }

    return content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
      .replace(/<[^>]+>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace('/\u00a0/g', ' ') // Replace non-breaking spaces
      .trim()
  }

  // Calculate content hash
  private hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex')
  }

  // Calculate content diff and change percentage
  private calculateContentDiff(oldContent: string, newContent: string): { summary: string, changePercentage: number } {
    const diffResult = fastDiff(oldContent, newContent)
    
    let addedChars = 0
    let removedChars = 0
    let unchangedChars = 0
    
    const summaryParts: string[] = []

    for (const [operation, text] of diffResult) {
      switch (operation) {
        case 1: // Added
          addedChars += text.length
          if (text.trim().length > 50) {
            summaryParts.push(`Added: "${text.substring(0, 100)}..."`)
          }
          break
        case -1: // Removed
          removedChars += text.length
          if (text.trim().length > 50) {
            summaryParts.push(`Removed: "${text.substring(0, 100)}..."`)
          }
          break
        case 0: // Unchanged
          unchangedChars += text.length
          break
      }
    }

    const totalChars = Math.max(oldContent.length, newContent.length)
    const changePercentage = totalChars > 0 ? ((addedChars + removedChars) / totalChars) * 100 : 0

    const summary = summaryParts.length > 0 
      ? summaryParts.slice(0, 3).join('; ')
      : `${addedChars} characters added, ${removedChars} characters removed`

    return { summary, changePercentage }
  }

  // Record a document change
  private async recordDocumentChange(
    websiteId: string,
    documentType: string,
    changeType: 'added' | 'modified' | 'removed',
    oldContentHash: string | undefined,
    newContentHash: string,
    oldContent: string | undefined,
    newContent: string,
    diffSummary: string,
    changePercentage: number
  ): Promise<DocumentChange> {
    const insertQuery = `
      INSERT INTO document_changes (
        website_id, document_type, change_type, old_content_hash,
        new_content_hash, old_content, new_content, diff_summary, change_percentage
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `

    const result = await this.db.query(insertQuery, [
      websiteId, documentType, changeType, oldContentHash,
      newContentHash, oldContent, newContent, diffSummary, changePercentage
    ])

    const change = result.rows[0]
    
    // Queue for processing
    await this.queueChangeForProcessing(change.id)

    return {
      id: change.id,
      website_id: change.website_id,
      document_type: change.document_type,
      change_type: change.change_type,
      old_content_hash: change.old_content_hash,
      new_content_hash: change.new_content_hash,
      diff_summary: change.diff_summary,
      change_percentage: parseFloat(change.change_percentage),
      detected_at: change.detected_at,
      processed: change.processed
    }
  }

  // Update monitoring timestamp
  private async updateMonitoringTimestamp(websiteId: string): Promise<void> {
    const updateQuery = `
      UPDATE website_monitoring_targets
      SET last_monitored = CURRENT_TIMESTAMP
      WHERE id = $1
    `
    
    await this.db.query(updateQuery, [websiteId])
  }

  // Record monitoring error
  private async recordMonitoringError(websiteId: string, errorMessage: string): Promise<void> {
    // Could extend this to track errors in a separate table
    logger.error(`Monitoring error for website ${websiteId}: ${errorMessage}`)
  }

  // Queue change for processing (placeholder for BullMQ integration)
  private async queueChangeForProcessing(changeId: string): Promise<void> {
    // This would integrate with BullMQ to queue the change for AI processing
    logger.info(`Queued change ${changeId} for processing`)
  }

  // Run monitoring cycle for all due websites
  async runMonitoringCycle(): Promise<{ monitored: number, changes: number, errors: number }> {
    const startTime = Date.now()
    logger.info('Starting monitoring cycle')

    const websites = await this.getWebsitesForMonitoring()
    let totalChanges = 0
    let errors = 0

    for (const website of websites) {
      try {
        const changes = await this.monitorWebsite(website)
        totalChanges += changes.length
        
        // Add delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (error) {
        errors++
        logger.error(`Failed to monitor ${website.domain}:`, error)
      }
    }

    const duration = Date.now() - startTime
    logger.info(`Monitoring cycle completed: ${websites.length} websites, ${totalChanges} changes, ${errors} errors in ${duration}ms`)

    return {
      monitored: websites.length,
      changes: totalChanges,
      errors
    }
  }

  // Get unprocessed changes for ML processing
  async getUnprocessedChanges(limit: number = 100): Promise<DocumentChange[]> {
    const query = `
      SELECT dc.*, wmt.domain, wmt.name, wmt.jurisdiction, wmt.category
      FROM document_changes dc
      JOIN website_monitoring_targets wmt ON dc.website_id = wmt.id
      WHERE dc.processed = false
      ORDER BY dc.detected_at ASC
      LIMIT $1
    `

    const result = await this.db.query(query, [limit])
    return result.rows.map(row => ({
      id: row.id,
      website_id: row.website_id,
      document_type: row.document_type,
      change_type: row.change_type,
      old_content_hash: row.old_content_hash,
      new_content_hash: row.new_content_hash,
      diff_summary: row.diff_summary,
      change_percentage: parseFloat(row.change_percentage),
      detected_at: row.detected_at,
      processed: row.processed
    }))
  }

  // Mark changes as processed
  async markChangesProcessed(changeIds: string[], processingNotes?: string): Promise<void> {
    const updateQuery = `
      UPDATE document_changes
      SET processed = true, processing_notes = $2
      WHERE id = ANY($1)
    `

    await this.db.query(updateQuery, [changeIds, processingNotes])
    logger.info(`Marked ${changeIds.length} changes as processed`)
  }

  // Get data quality metrics
  async getDataQualityMetrics(): Promise<DataQualityMetrics> {
    const query = `
      SELECT 
        COUNT(*) as total_documents,
        AVG(CASE WHEN processed THEN 1.0 ELSE 0.0 END) * 100 as processing_success_rate,
        (SELECT AVG(quality_score) FROM training_dataset WHERE quality_score > 0) as average_quality_score,
        (SELECT json_object_agg(unnest, count) FROM (
          SELECT unnest(labels) as unnest, COUNT(*) as count 
          FROM training_dataset 
          GROUP BY unnest(labels)
        ) label_counts) as label_distribution,
        (SELECT json_object_agg(unnest, count) FROM (
          SELECT unnest(jurisdiction_tags) as unnest, COUNT(*) as count 
          FROM training_dataset 
          GROUP BY unnest(jurisdiction_tags)
        ) jurisdiction_counts) as jurisdiction_coverage
      FROM document_changes
      WHERE detected_at >= CURRENT_DATE - INTERVAL '30 days'
    `

    const result = await this.db.query(query)
    const row = result.rows[0]

    return {
      total_documents: parseInt(row.total_documents) || 0,
      processing_success_rate: parseFloat(row.processing_success_rate) || 0,
      average_quality_score: parseFloat(row.average_quality_score) || 0,
      label_distribution: row.label_distribution || {},
      jurisdiction_coverage: row.jurisdiction_coverage || {},
      last_updated: new Date()
    }
  }

  // Seed monitoring targets with popular websites
  async seedPopularWebsitesForMonitoring(): Promise<void> {
    const popularWebsites: Omit<WebsiteMonitorTarget, 'id' | 'last_monitored' | 'next_monitor'>[] = [
      // Tech Giants - High Priority
      {
        domain: 'google.com',
        name: 'Google',
        category: 'Search',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'high',
        monitoring_frequency: 6, // Every 6 hours
        document_selectors: {
          terms_url: 'https://policies.google.com/terms',
          privacy_url: 'https://policies.google.com/privacy',
          selectors: {
            content: 'main, .content, .policy-content'
          }
        },
        is_active: true
      },
      {
        domain: 'youtube.com',
        name: 'YouTube',
        category: 'Video',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'high',
        monitoring_frequency: 12,
        document_selectors: {
          terms_url: 'https://www.youtube.com/t/terms',
          privacy_url: 'https://policies.google.com/privacy',
          selectors: {
            content: 'main, .content'
          }
        },
        is_active: true
      },
      {
        domain: 'facebook.com',
        name: 'Facebook',
        category: 'Social Media',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'high',
        monitoring_frequency: 8,
        document_selectors: {
          terms_url: 'https://www.facebook.com/legal/terms',
          privacy_url: 'https://www.facebook.com/privacy/policy',
          selectors: {
            content: '[data-testid="main-content"], .content'
          }
        },
        is_active: true
      },
      {
        domain: 'instagram.com',
        name: 'Instagram',
        category: 'Social Media',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'high',
        monitoring_frequency: 12,
        document_selectors: {
          terms_url: 'https://help.instagram.com/581066165581870',
          privacy_url: 'https://privacycenter.instagram.com/policy',
          selectors: {
            content: '.policy-content, main'
          }
        },
        is_active: true
      },
      {
        domain: 'twitter.com',
        name: 'Twitter/X',
        category: 'Social Media',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'high',
        monitoring_frequency: 8,
        document_selectors: {
          terms_url: 'https://twitter.com/en/tos',
          privacy_url: 'https://twitter.com/en/privacy',
          selectors: {
            content: 'main, .content'
          }
        },
        is_active: true
      },
      {
        domain: 'tiktok.com',
        name: 'TikTok',
        category: 'Social Media',
        jurisdiction: ['US', 'EU', 'CN', 'Global'],
        priority: 'high',
        monitoring_frequency: 8,
        document_selectors: {
          terms_url: 'https://www.tiktok.com/legal/terms-of-service',
          privacy_url: 'https://www.tiktok.com/legal/privacy-policy',
          selectors: {
            content: '.main-content, .content'
          }
        },
        is_active: true
      },

      // E-commerce - High Priority
      {
        domain: 'amazon.com',
        name: 'Amazon',
        category: 'E-commerce',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'high',
        monitoring_frequency: 12,
        document_selectors: {
          terms_url: 'https://www.amazon.com/gp/help/customer/display.html?nodeId=508088',
          privacy_url: 'https://www.amazon.com/gp/help/customer/display.html?nodeId=468496',
          selectors: {
            content: '#help-content, .help-content'
          }
        },
        is_active: true
      },

      // Professional Services - Medium Priority
      {
        domain: 'microsoft.com',
        name: 'Microsoft',
        category: 'Technology',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'medium',
        monitoring_frequency: 24,
        document_selectors: {
          terms_url: 'https://www.microsoft.com/en-us/servicesagreement',
          privacy_url: 'https://privacy.microsoft.com/en-us/privacystatement',
          selectors: {
            content: 'main, .content'
          }
        },
        is_active: true
      },
      {
        domain: 'apple.com',
        name: 'Apple',
        category: 'Technology',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'medium',
        monitoring_frequency: 24,
        document_selectors: {
          terms_url: 'https://www.apple.com/legal/internet-services/terms/site.html',
          privacy_url: 'https://www.apple.com/privacy/privacy-policy',
          selectors: {
            content: 'main, .content'
          }
        },
        is_active: true
      },
      {
        domain: 'linkedin.com',
        name: 'LinkedIn',
        category: 'Professional',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'medium',
        monitoring_frequency: 24,
        document_selectors: {
          terms_url: 'https://www.linkedin.com/legal/user-agreement',
          privacy_url: 'https://www.linkedin.com/legal/privacy-policy',
          selectors: {
            content: 'main, .legal-content'
          }
        },
        is_active: true
      },

      // Streaming & Entertainment - Medium Priority
      {
        domain: 'netflix.com',
        name: 'Netflix',
        category: 'Streaming',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'medium',
        monitoring_frequency: 24,
        document_selectors: {
          terms_url: 'https://help.netflix.com/legal/termsofuse',
          privacy_url: 'https://help.netflix.com/legal/privacy',
          selectors: {
            content: '.legal-content, main'
          }
        },
        is_active: true
      },
      {
        domain: 'spotify.com',
        name: 'Spotify',
        category: 'Music',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'medium',
        monitoring_frequency: 24,
        document_selectors: {
          terms_url: 'https://www.spotify.com/us/legal/end-user-agreement',
          privacy_url: 'https://www.spotify.com/us/privacy',
          selectors: {
            content: '.legal-content, main'
          }
        },
        is_active: true
      },

      // Financial Services - High Priority (more regulatory sensitive)
      {
        domain: 'paypal.com',
        name: 'PayPal',
        category: 'Finance',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'high',
        monitoring_frequency: 8,
        document_selectors: {
          terms_url: 'https://www.paypal.com/us/webapps/mpp/ua/legalhub-full',
          privacy_url: 'https://www.paypal.com/us/webapps/mpp/ua/privacy-full',
          selectors: {
            content: '.legal-content, main'
          }
        },
        is_active: true
      },
      {
        domain: 'stripe.com',
        name: 'Stripe',
        category: 'Finance',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'high',
        monitoring_frequency: 12,
        document_selectors: {
          terms_url: 'https://stripe.com/legal/ssa',
          privacy_url: 'https://stripe.com/privacy',
          selectors: {
            content: '.legal-content, main'
          }
        },
        is_active: true
      },

      // Communication Tools - Medium Priority
      {
        domain: 'zoom.us',
        name: 'Zoom',
        category: 'Communication',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'medium',
        monitoring_frequency: 24,
        document_selectors: {
          terms_url: 'https://zoom.us/terms',
          privacy_url: 'https://zoom.us/privacy',
          selectors: {
            content: '.legal-content, main'
          }
        },
        is_active: true
      },
      {
        domain: 'slack.com',
        name: 'Slack',
        category: 'Communication',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'medium',
        monitoring_frequency: 24,
        document_selectors: {
          terms_url: 'https://slack.com/terms-of-service',
          privacy_url: 'https://slack.com/privacy-policy',
          selectors: {
            content: '.legal-content, main'
          }
        },
        is_active: true
      },

      // Developer Tools - Low Priority (but important for tech audience)
      {
        domain: 'github.com',
        name: 'GitHub',
        category: 'Development',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'medium',
        monitoring_frequency: 24,
        document_selectors: {
          terms_url: 'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service',
          privacy_url: 'https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement',
          selectors: {
            content: '.markdown-body, main'
          }
        },
        is_active: true
      },

      // Cloud Services - Medium Priority
      {
        domain: 'dropbox.com',
        name: 'Dropbox',
        category: 'Cloud Storage',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'medium',
        monitoring_frequency: 24,
        document_selectors: {
          terms_url: 'https://www.dropbox.com/terms',
          privacy_url: 'https://www.dropbox.com/privacy',
          selectors: {
            content: '.legal-content, main'
          }
        },
        is_active: true
      },

      // Additional popular services for comprehensive coverage
      {
        domain: 'reddit.com',
        name: 'Reddit',
        category: 'Forum',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'medium',
        monitoring_frequency: 24,
        document_selectors: {
          terms_url: 'https://www.redditinc.com/policies/user-agreement',
          privacy_url: 'https://www.reddit.com/policies/privacy-policy',
          selectors: {
            content: '.policy-content, main'
          }
        },
        is_active: true
      },
      {
        domain: 'discord.com',
        name: 'Discord',
        category: 'Gaming',
        jurisdiction: ['US', 'EU', 'Global'],
        priority: 'medium',
        monitoring_frequency: 24,
        document_selectors: {
          terms_url: 'https://discord.com/terms',
          privacy_url: 'https://discord.com/privacy',
          selectors: {
            content: '.legal-content, main'
          }
        },
        is_active: true
      }
    ]

    await this.addMonitoringTargets(popularWebsites)
    logger.info(`Seeded ${popularWebsites.length} popular websites for monitoring`)
  }

  // Create training data from processed changes
  async createTrainingDataFromChanges(changeIds: string[], labels: string[], severity: 'low' | 'medium' | 'high' | 'critical'): Promise<TrainingDataPoint[]> {
    const trainingData: TrainingDataPoint[] = []

    for (const changeId of changeIds) {
      const changeQuery = `
        SELECT dc.*, wmt.domain, wmt.jurisdiction, wmt.category
        FROM document_changes dc
        JOIN website_monitoring_targets wmt ON dc.website_id = wmt.id
        WHERE dc.id = $1
      `
      
      const changeResult = await this.db.query(changeQuery, [changeId])
      if (changeResult.rows.length === 0) continue

      const change = changeResult.rows[0]
      
      // Extract meaningful snippets from the new content
      const snippets = this.extractContentSnippets(change.new_content, 500) // 500 char snippets
      
      for (const snippet of snippets) {
        if (snippet.trim().length < 100) continue // Skip short snippets

        const insertQuery = `
          INSERT INTO training_dataset (
            website_id, document_type, content_snippet, labels,
            severity, jurisdiction_tags, quality_score
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `

        const qualityScore = this.calculateSnippetQuality(snippet, labels)
        
        const result = await this.db.query(insertQuery, [
          change.website_id,
          change.document_type,
          snippet,
          labels,
          severity,
          change.jurisdiction,
          qualityScore
        ])

        trainingData.push({
          id: result.rows[0].id,
          website_id: result.rows[0].website_id,
          document_type: result.rows[0].document_type,
          content_snippet: result.rows[0].content_snippet,
          labels: result.rows[0].labels,
          severity: result.rows[0].severity,
          jurisdiction_tags: result.rows[0].jurisdiction_tags,
          regulatory_violations: result.rows[0].regulatory_violations || [],
          quality_score: result.rows[0].quality_score,
          human_verified: result.rows[0].human_verified,
          created_at: result.rows[0].created_at
        })
      }
    }

    logger.info(`Created ${trainingData.length} training data points from ${changeIds.length} changes`)
    return trainingData
  }

  // Extract content snippets for training
  private extractContentSnippets(content: string, maxLength: number): string[] {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 50)
    const snippets: string[] = []
    
    let currentSnippet = ''
    for (const sentence of sentences) {
      if (currentSnippet.length + sentence.length > maxLength) {
        if (currentSnippet.trim()) {
          snippets.push(currentSnippet.trim())
        }
        currentSnippet = sentence.trim()
      } else {
        currentSnippet += (currentSnippet ? '. ' : '') + sentence.trim()
      }
    }
    
    if (currentSnippet.trim()) {
      snippets.push(currentSnippet.trim())
    }
    
    return snippets
  }

  // Calculate quality score for content snippets
  private calculateSnippetQuality(snippet: string, labels: string[]): number {
    let score = 0.5 // Base score

    // Length quality (optimal around 200-400 chars)
    const length = snippet.length
    if (length >= 200 && length <= 400) score += 0.2
    else if (length >= 100 && length <= 600) score += 0.1

    // Language quality (check for legal terms)
    const legalTerms = ['shall', 'may', 'agreement', 'terms', 'privacy', 'data', 'rights', 'consent', 'collection']
    const foundTerms = legalTerms.filter(term => snippet.toLowerCase().includes(term)).length
    score += Math.min(foundTerms * 0.05, 0.3)

    // Label relevance (more labels usually indicate richer content)
    score += Math.min(labels.length * 0.1, 0.2)

    return Math.min(score, 1.0) // Cap at 1.0
  }
}