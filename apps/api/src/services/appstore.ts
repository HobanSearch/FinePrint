import { Client as PgClient } from 'pg'
import { pino } from 'pino'
import { createHash } from 'crypto'
import axios from 'axios'
import * as cheerio from 'cheerio'

const logger = pino({ name: 'appstore-service' })

// App metadata interfaces
interface AppMetadata {
  id: string
  name: string
  developer: string
  category: string
  platform: 'ios' | 'android'
  bundle_id: string
  icon_url: string
  description: string
  rating: number
  review_count: number
  price: number
  version: string
  updated_at: Date
  terms_url?: string
  privacy_url?: string
  support_url?: string
}

interface AppSearchResult {
  id: string
  name: string
  developer: string
  category: string
  platform: 'ios' | 'android'
  bundle_id: string
  icon_url: string
  rating: number
  price: number
}

interface AppDocument {
  app_id: string
  document_type: 'terms' | 'privacy'
  url: string
  content: string
  content_hash: string
  extracted_at: Date
  language: string
  word_count: number
}

export class AppStoreService {
  private db: PgClient
  private rateLimits = {
    apple: { requests: 0, resetTime: 0, limit: 20 }, // Apple iTunes Search API: 20 requests per minute
    google: { requests: 0, resetTime: 0, limit: 100 } // More generous for Google Play
  }

  constructor(db: PgClient) {
    this.db = db
  }

  // Initialize app store tables
  async initializeAppStoreTables(): Promise<void> {
    const createTablesQuery = `
      -- App metadata table
      CREATE TABLE IF NOT EXISTS app_metadata (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(500) NOT NULL,
        developer VARCHAR(500) NOT NULL,
        category VARCHAR(100),
        platform VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android')),
        bundle_id VARCHAR(500) NOT NULL,
        icon_url TEXT,
        description TEXT,
        rating DECIMAL(2,1) DEFAULT 0,
        review_count INTEGER DEFAULT 0,
        price DECIMAL(10,2) DEFAULT 0,
        version VARCHAR(50),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        terms_url TEXT,
        privacy_url TEXT,
        support_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(bundle_id, platform)
      );

      -- App documents table (ToS, Privacy Policy)
      CREATE TABLE IF NOT EXISTS app_documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        app_id VARCHAR(255) REFERENCES app_metadata(id) ON DELETE CASCADE,
        document_type VARCHAR(20) NOT NULL CHECK (document_type IN ('terms', 'privacy')),
        url TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash VARCHAR(64) NOT NULL,
        extracted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        language VARCHAR(10) DEFAULT 'en',
        word_count INTEGER DEFAULT 0,
        UNIQUE(app_id, document_type, content_hash)
      );

      -- App search cache for performance
      CREATE TABLE IF NOT EXISTS app_search_cache (
        search_query VARCHAR(255) PRIMARY KEY,
        platform VARCHAR(10) NOT NULL,
        results JSONB NOT NULL,
        cached_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_app_metadata_name ON app_metadata USING gin(to_tsvector('english', name));
      CREATE INDEX IF NOT EXISTS idx_app_metadata_platform ON app_metadata(platform);
      CREATE INDEX IF NOT EXISTS idx_app_metadata_category ON app_metadata(category);
      CREATE INDEX IF NOT EXISTS idx_app_documents_app_id ON app_documents(app_id);
      CREATE INDEX IF NOT EXISTS idx_app_documents_type ON app_documents(document_type);
      CREATE INDEX IF NOT EXISTS idx_app_search_cache_expires ON app_search_cache(expires_at);
    `

    await this.db.query(createTablesQuery)
    logger.info('App store tables initialized')
  }

  // Search for apps across both platforms
  async searchApps(query: string, platform?: 'ios' | 'android', limit: number = 10): Promise<AppSearchResult[]> {
    const platforms = platform ? [platform] : ['ios', 'android']
    const results: AppSearchResult[] = []

    for (const p of platforms) {
      try {
        // Check cache first
        const cacheKey = `${query.toLowerCase()}_${p}`
        const cached = await this.getCachedSearch(cacheKey, p)
        
        if (cached) {
          results.push(...cached)
          continue
        }

        // Fetch from respective store
        let storeResults: AppSearchResult[] = []
        if (p === 'ios') {
          storeResults = await this.searchAppleAppStore(query, limit)
        } else {
          storeResults = await this.searchGooglePlayStore(query, limit)
        }

        // Cache results
        await this.cacheSearchResults(cacheKey, p, storeResults)
        results.push(...storeResults)

      } catch (error) {
        logger.error(`Failed to search ${p} store`, { error, query })
      }
    }

    // Sort by relevance (name match) and rating
    return results
      .sort((a, b) => {
        const aNameMatch = a.name.toLowerCase().includes(query.toLowerCase()) ? 1 : 0
        const bNameMatch = b.name.toLowerCase().includes(query.toLowerCase()) ? 1 : 0
        
        if (aNameMatch !== bNameMatch) return bNameMatch - aNameMatch
        return b.rating - a.rating
      })
      .slice(0, limit)
  }

  // Search Apple App Store using iTunes Search API
  private async searchAppleAppStore(query: string, limit: number): Promise<AppSearchResult[]> {
    await this.enforceRateLimit('apple')

    const response = await axios.get('https://itunes.apple.com/search', {
      params: {
        term: query,
        entity: 'software',
        limit: Math.min(limit, 50),
        country: 'US'
      },
      timeout: 10000
    })

    this.rateLimits.apple.requests++

    return response.data.results.map((app: any) => ({
      id: app.trackId.toString(),
      name: app.trackName,
      developer: app.artistName,
      category: app.primaryGenreName,
      platform: 'ios' as const,
      bundle_id: app.bundleId,
      icon_url: app.artworkUrl512 || app.artworkUrl100,
      rating: app.averageUserRating || 0,
      price: app.price || 0
    }))
  }

  // Search Google Play Store (using unofficial API/scraping)
  private async searchGooglePlayStore(query: string, limit: number): Promise<AppSearchResult[]> {
    await this.enforceRateLimit('google')

    try {
      // Using Google Play unofficial search
      const searchUrl = `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps`
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 15000
      })

      const $ = cheerio.load(response.data)
      const results: AppSearchResult[] = []

      // Parse Google Play search results
      $('[data-ds-package-name]').each((index, element) => {
        if (results.length >= limit) return false

        const $el = $(element)
        const packageName = $el.attr('data-ds-package-name')
        const name = $el.find('span[title]').attr('title') || $el.find('.DdYX5').text().trim()
        const developer = $el.find('.wMUdtb').text().trim()
        const rating = parseFloat($el.find('.w2kbF').text()) || 0
        const iconUrl = $el.find('img').attr('src') || ''

        if (packageName && name) {
          results.push({
            id: packageName,
            name,
            developer,
            category: 'Unknown', // Would need additional API call
            platform: 'android',
            bundle_id: packageName,
            icon_url: iconUrl,
            rating,
            price: 0 // Default to free, would need additional parsing
          })
        }
      })

      this.rateLimits.google.requests++
      return results

    } catch (error) {
      logger.error('Google Play search failed', { error, query })
      return []
    }
  }

  // Get detailed app metadata
  async getAppMetadata(appId: string, platform: 'ios' | 'android'): Promise<AppMetadata | null> {
    try {
      // Check if we have cached metadata
      const cached = await this.getCachedAppMetadata(appId, platform)
      if (cached) {
        return cached
      }

      let metadata: AppMetadata | null = null

      if (platform === 'ios') {
        metadata = await this.getAppleAppMetadata(appId)
      } else {
        metadata = await this.getGooglePlayAppMetadata(appId)
      }

      if (metadata) {
        await this.cacheAppMetadata(metadata)
      }

      return metadata

    } catch (error) {
      logger.error('Failed to get app metadata', { error, appId, platform })
      return null
    }
  }

  // Get Apple App Store metadata
  private async getAppleAppMetadata(appId: string): Promise<AppMetadata | null> {
    await this.enforceRateLimit('apple')

    const response = await axios.get('https://itunes.apple.com/lookup', {
      params: {
        id: appId,
        entity: 'software'
      },
      timeout: 10000
    })

    this.rateLimits.apple.requests++

    const app = response.data.results[0]
    if (!app) return null

    return {
      id: app.trackId.toString(),
      name: app.trackName,
      developer: app.artistName,
      category: app.primaryGenreName,
      platform: 'ios',
      bundle_id: app.bundleId,
      icon_url: app.artworkUrl512 || app.artworkUrl100,
      description: app.description,
      rating: app.averageUserRating || 0,
      review_count: app.userRatingCount || 0,
      price: app.price || 0,
      version: app.version,
      updated_at: new Date(app.currentVersionReleaseDate),
      terms_url: `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`,
      privacy_url: app.privacyPolicyUrl,
      support_url: app.sellerUrl
    }
  }

  // Get Google Play Store metadata
  private async getGooglePlayAppMetadata(packageName: string): Promise<AppMetadata | null> {
    await this.enforceRateLimit('google')

    try {
      const appUrl = `https://play.google.com/store/apps/details?id=${packageName}`
      
      const response = await axios.get(appUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      })

      const $ = cheerio.load(response.data)
      
      // Extract app information from Google Play page
      const name = $('h1[itemprop="name"] span').text().trim()
      const developer = $('a[href*="dev?id="]').first().text().trim()
      const category = $('a[href*="category/"]').first().text().trim()
      const rating = parseFloat($('div[class*="TT9eCd"]').first().text()) || 0
      const iconUrl = $('img[alt="Icon image"]').attr('src') || ''
      const description = $('div[data-g-id="description"] div').first().text().trim()

      // Extract privacy policy and terms URLs
      const privacyUrl = $('a[href*="privacy"]').attr('href')
      const termsUrl = $('a[href*="terms"]').attr('href')

      this.rateLimits.google.requests++

      return {
        id: packageName,
        name,
        developer,
        category,
        platform: 'android',
        bundle_id: packageName,
        icon_url: iconUrl,
        description,
        rating,
        review_count: 0, // Would need additional parsing
        price: 0, // Default to free
        version: '1.0', // Would need additional parsing
        updated_at: new Date(),
        terms_url: termsUrl,
        privacy_url: privacyUrl
      }

    } catch (error) {
      logger.error('Failed to get Google Play metadata', { error, packageName })
      return null
    }
  }

  // Extract document content from ToS/Privacy Policy URLs
  async extractAppDocument(appId: string, documentType: 'terms' | 'privacy', url: string): Promise<AppDocument | null> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 20000,
        maxContentLength: 5 * 1024 * 1024 // 5MB limit
      })

      const $ = cheerio.load(response.data)
      
      // Remove script, style, and other non-content elements
      $('script, style, nav, header, footer, .ads, .advertisement').remove()
      
      // Extract main content
      let content = ''
      const contentSelectors = [
        'main',
        'article', 
        '.content',
        '.main-content',
        '.document-content',
        '#content',
        '.terms',
        '.privacy-policy'
      ]

      for (const selector of contentSelectors) {
        const element = $(selector)
        if (element.length > 0 && element.text().trim().length > 500) {
          content = element.text().trim()
          break
        }
      }

      // Fallback to body content if no specific content found
      if (!content || content.length < 500) {
        content = $('body').text().trim()
      }

      // Clean up the content
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim()

      if (content.length < 100) {
        logger.warn('Document content too short', { appId, documentType, url, length: content.length })
        return null
      }

      const contentHash = createHash('sha256').update(content).digest('hex')
      const wordCount = content.split(/\s+/).length

      const document: AppDocument = {
        app_id: appId,
        document_type: documentType,
        url,
        content,
        content_hash: contentHash,
        extracted_at: new Date(),
        language: 'en', // Could add language detection
        word_count: wordCount
      }

      // Store in database
      await this.storeAppDocument(document)

      return document

    } catch (error) {
      logger.error('Failed to extract document', { error, appId, documentType, url })
      return null
    }
  }

  // Get app documents for analysis
  async getAppDocuments(appId: string): Promise<AppDocument[]> {
    const query = `
      SELECT * FROM app_documents 
      WHERE app_id = $1 
      ORDER BY document_type, extracted_at DESC
    `
    
    const result = await this.db.query(query, [appId])
    return result.rows
  }

  // Rate limiting enforcement
  private async enforceRateLimit(provider: 'apple' | 'google'): Promise<void> {
    const limit = this.rateLimits[provider]
    const now = Date.now()

    // Reset counter if time window has passed
    if (now > limit.resetTime) {
      limit.requests = 0
      limit.resetTime = now + 60000 // 1 minute window
    }

    // Wait if we've hit the limit
    if (limit.requests >= limit.limit) {
      const waitTime = limit.resetTime - now
      if (waitTime > 0) {
        logger.info(`Rate limit hit for ${provider}, waiting ${waitTime}ms`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }

  // Cache management methods
  private async getCachedSearch(query: string, platform: string): Promise<AppSearchResult[] | null> {
    try {
      const result = await this.db.query(
        'SELECT results FROM app_search_cache WHERE search_query = $1 AND platform = $2 AND expires_at > NOW()',
        [query, platform]
      )
      
      return result.rows[0]?.results || null
    } catch (error) {
      logger.error('Failed to get cached search', { error })
      return null
    }
  }

  private async cacheSearchResults(query: string, platform: string, results: AppSearchResult[]): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO app_search_cache (search_query, platform, results)
        VALUES ($1, $2, $3)
        ON CONFLICT (search_query) DO UPDATE SET
          results = EXCLUDED.results,
          cached_at = CURRENT_TIMESTAMP,
          expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours'
      `, [query, platform, JSON.stringify(results)])
    } catch (error) {
      logger.error('Failed to cache search results', { error })
    }
  }

  private async getCachedAppMetadata(appId: string, platform: string): Promise<AppMetadata | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM app_metadata WHERE id = $1 AND platform = $2 AND updated_at > NOW() - INTERVAL \'7 days\'',
        [appId, platform]
      )
      
      return result.rows[0] || null
    } catch (error) {
      logger.error('Failed to get cached app metadata', { error })
      return null
    }
  }

  private async cacheAppMetadata(metadata: AppMetadata): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO app_metadata (
          id, name, developer, category, platform, bundle_id, icon_url, description,
          rating, review_count, price, version, terms_url, privacy_url, support_url
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (bundle_id, platform) DO UPDATE SET
          name = EXCLUDED.name,
          developer = EXCLUDED.developer,
          category = EXCLUDED.category,
          icon_url = EXCLUDED.icon_url,
          description = EXCLUDED.description,
          rating = EXCLUDED.rating,
          review_count = EXCLUDED.review_count,
          price = EXCLUDED.price,
          version = EXCLUDED.version,
          terms_url = EXCLUDED.terms_url,
          privacy_url = EXCLUDED.privacy_url,
          support_url = EXCLUDED.support_url,
          updated_at = CURRENT_TIMESTAMP
      `, [
        metadata.id, metadata.name, metadata.developer, metadata.category,
        metadata.platform, metadata.bundle_id, metadata.icon_url, metadata.description,
        metadata.rating, metadata.review_count, metadata.price, metadata.version,
        metadata.terms_url, metadata.privacy_url, metadata.support_url
      ])
    } catch (error) {
      logger.error('Failed to cache app metadata', { error })
    }
  }

  private async storeAppDocument(document: AppDocument): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO app_documents (
          app_id, document_type, url, content, content_hash, language, word_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (app_id, document_type, content_hash) DO NOTHING
      `, [
        document.app_id, document.document_type, document.url, document.content,
        document.content_hash, document.language, document.word_count
      ])
    } catch (error) {
      logger.error('Failed to store app document', { error })
    }
  }

  // Cleanup old cache entries
  async cleanupExpiredCache(): Promise<void> {
    try {
      await this.db.query('DELETE FROM app_search_cache WHERE expires_at < NOW()')
      logger.info('Cleaned up expired cache entries')
    } catch (error) {
      logger.error('Failed to cleanup cache', { error })
    }
  }

  // Get popular apps for pre-population
  async getPopularApps(platform?: 'ios' | 'android', limit: number = 100): Promise<AppMetadata[]> {
    const whereClause = platform ? 'WHERE platform = $1' : ''
    const params = platform ? [platform] : []
    
    const query = `
      SELECT * FROM app_metadata 
      ${whereClause}
      ORDER BY rating DESC, review_count DESC 
      LIMIT ${limit}
    `
    
    const result = await this.db.query(query, params)
    return result.rows
  }
}