import { Client as PgClient } from 'pg'
import { pino } from 'pino'
import { createHash } from 'crypto'

const logger = pino({ name: 'leaderboard-service' })

// Public website data
interface PublicWebsite {
  id: string
  name: string
  domain: string
  url: string
  risk_score: number
  last_analyzed: Date
  analysis_count: number
  category: string
  is_verified: boolean
  monthly_visitors?: number
  country?: string
}

interface LeaderboardEntry {
  rank: number
  name: string
  domain: string
  risk_score: number
  category: string
  change_from_last_week: number
  monthly_visitors?: number
  last_updated: Date
}

interface PopularWebsite {
  domain: string
  name: string
  category: string
  estimated_visitors: number
  priority_score: number
}

export class LeaderboardService {
  private db: PgClient

  constructor(db: PgClient) {
    this.db = db
  }

  // Initialize public websites table
  async initializePublicWebsites(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS public_websites (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        domain VARCHAR(255) UNIQUE NOT NULL,
        url TEXT NOT NULL,
        risk_score INTEGER DEFAULT 0,
        last_analyzed TIMESTAMP WITH TIME ZONE,
        analysis_count INTEGER DEFAULT 0,
        category VARCHAR(100),
        is_verified BOOLEAN DEFAULT false,
        monthly_visitors BIGINT,
        country VARCHAR(3),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_public_websites_risk_score ON public_websites(risk_score DESC);
      CREATE INDEX IF NOT EXISTS idx_public_websites_category ON public_websites(category);
      CREATE INDEX IF NOT EXISTS idx_public_websites_domain ON public_websites(domain);
      CREATE INDEX IF NOT EXISTS idx_public_websites_verified ON public_websites(is_verified);

      -- Weekly snapshots for trend analysis
      CREATE TABLE IF NOT EXISTS website_risk_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        website_id UUID REFERENCES public_websites(id) ON DELETE CASCADE,
        risk_score INTEGER NOT NULL,
        snapshot_date DATE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(website_id, snapshot_date)
      );

      CREATE INDEX IF NOT EXISTS idx_website_risk_history_date ON website_risk_history(snapshot_date DESC);
    `

    await this.db.query(createTableQuery)
    logger.info('Public websites tables initialized')
  }

  // Seed with popular websites
  async seedPopularWebsites(): Promise<void> {
    const popularWebsites: PopularWebsite[] = [
      // Tech Giants
      { domain: 'google.com', name: 'Google', category: 'Search', estimated_visitors: 8900000000, priority_score: 100 },
      { domain: 'youtube.com', name: 'YouTube', category: 'Video', estimated_visitors: 3400000000, priority_score: 95 },
      { domain: 'facebook.com', name: 'Facebook', category: 'Social Media', estimated_visitors: 2900000000, priority_score: 90 },
      { domain: 'instagram.com', name: 'Instagram', category: 'Social Media', estimated_visitors: 2000000000, priority_score: 85 },
      { domain: 'twitter.com', name: 'Twitter', category: 'Social Media', estimated_visitors: 1800000000, priority_score: 80 },
      { domain: 'linkedin.com', name: 'LinkedIn', category: 'Professional', estimated_visitors: 1000000000, priority_score: 75 },
      { domain: 'tiktok.com', name: 'TikTok', category: 'Social Media', estimated_visitors: 1500000000, priority_score: 85 },
      
      // E-commerce
      { domain: 'amazon.com', name: 'Amazon', category: 'E-commerce', estimated_visitors: 2400000000, priority_score: 95 },
      { domain: 'alibaba.com', name: 'Alibaba', category: 'E-commerce', estimated_visitors: 800000000, priority_score: 70 },
      { domain: 'ebay.com', name: 'eBay', category: 'E-commerce', estimated_visitors: 1200000000, priority_score: 75 },
      { domain: 'etsy.com', name: 'Etsy', category: 'E-commerce', estimated_visitors: 500000000, priority_score: 65 },
      
      // Streaming & Entertainment  
      { domain: 'netflix.com', name: 'Netflix', category: 'Streaming', estimated_visitors: 1800000000, priority_score: 85 },
      { domain: 'spotify.com', name: 'Spotify', category: 'Music', estimated_visitors: 900000000, priority_score: 75 },
      { domain: 'twitch.tv', name: 'Twitch', category: 'Gaming', estimated_visitors: 700000000, priority_score: 70 },
      { domain: 'disney.com', name: 'Disney', category: 'Entertainment', estimated_visitors: 400000000, priority_score: 65 },
      
      // Professional Services
      { domain: 'microsoft.com', name: 'Microsoft', category: 'Technology', estimated_visitors: 1400000000, priority_score: 80 },
      { domain: 'apple.com', name: 'Apple', category: 'Technology', estimated_visitors: 1600000000, priority_score: 85 },
      { domain: 'zoom.us', name: 'Zoom', category: 'Communication', estimated_visitors: 800000000, priority_score: 75 },
      { domain: 'slack.com', name: 'Slack', category: 'Communication', estimated_visitors: 400000000, priority_score: 70 },
      { domain: 'dropbox.com', name: 'Dropbox', category: 'Cloud Storage', estimated_visitors: 600000000, priority_score: 70 },
      
      // News & Information
      { domain: 'wikipedia.org', name: 'Wikipedia', category: 'Information', estimated_visitors: 1500000000, priority_score: 80 },
      { domain: 'reddit.com', name: 'Reddit', category: 'Forum', estimated_visitors: 1700000000, priority_score: 85 },
      { domain: 'cnn.com', name: 'CNN', category: 'News', estimated_visitors: 600000000, priority_score: 65 },
      { domain: 'bbc.com', name: 'BBC', category: 'News', estimated_visitors: 800000000, priority_score: 70 },
      
      // Financial Services
      { domain: 'paypal.com', name: 'PayPal', category: 'Finance', estimated_visitors: 1100000000, priority_score: 80 },
      { domain: 'stripe.com', name: 'Stripe', category: 'Finance', estimated_visitors: 200000000, priority_score: 75 },
      { domain: 'coinbase.com', name: 'Coinbase', category: 'Crypto', estimated_visitors: 300000000, priority_score: 70 },
      
      // Gaming
      { domain: 'steam.com', name: 'Steam', category: 'Gaming', estimated_visitors: 1000000000, priority_score: 75 },
      { domain: 'epicgames.com', name: 'Epic Games', category: 'Gaming', estimated_visitors: 400000000, priority_score: 70 },
      
      // Developer Tools
      { domain: 'github.com', name: 'GitHub', category: 'Development', estimated_visitors: 800000000, priority_score: 80 },
      { domain: 'stackoverflow.com', name: 'Stack Overflow', category: 'Development', estimated_visitors: 500000000, priority_score: 75 },
      
      // Dating & Social
      { domain: 'tinder.com', name: 'Tinder', category: 'Dating', estimated_visitors: 300000000, priority_score: 65 },
      { domain: 'discord.com', name: 'Discord', category: 'Gaming', estimated_visitors: 600000000, priority_score: 75 },
      
      // Travel
      { domain: 'booking.com', name: 'Booking.com', category: 'Travel', estimated_visitors: 800000000, priority_score: 75 },
      { domain: 'airbnb.com', name: 'Airbnb', category: 'Travel', estimated_visitors: 700000000, priority_score: 75 },
      
      // Education
      { domain: 'coursera.org', name: 'Coursera', category: 'Education', estimated_visitors: 200000000, priority_score: 65 },
      { domain: 'udemy.com', name: 'Udemy', category: 'Education', estimated_visitors: 150000000, priority_score: 60 },
      
      // Food Delivery
      { domain: 'doordash.com', name: 'DoorDash', category: 'Food Delivery', estimated_visitors: 200000000, priority_score: 65 },
      { domain: 'uber.com', name: 'Uber', category: 'Transportation', estimated_visitors: 500000000, priority_score: 70 },
      
      // Productivity
      { domain: 'notion.so', name: 'Notion', category: 'Productivity', estimated_visitors: 100000000, priority_score: 65 },
      { domain: 'trello.com', name: 'Trello', category: 'Productivity', estimated_visitors: 80000000, priority_score: 60 },
      
      // Communication
      { domain: 'whatsapp.com', name: 'WhatsApp', category: 'Communication', estimated_visitors: 2000000000, priority_score: 90 },
      { domain: 'telegram.org', name: 'Telegram', category: 'Communication', estimated_visitors: 700000000, priority_score: 75 },
      
      // Cloud Services
      { domain: 'aws.amazon.com', name: 'AWS', category: 'Cloud Services', estimated_visitors: 300000000, priority_score: 80 },
      { domain: 'cloudflare.com', name: 'Cloudflare', category: 'Cloud Services', estimated_visitors: 150000000, priority_score: 75 },
      
      // Design Tools
      { domain: 'figma.com', name: 'Figma', category: 'Design', estimated_visitors: 100000000, priority_score: 70 },
      { domain: 'canva.com', name: 'Canva', category: 'Design', estimated_visitors: 200000000, priority_score: 70 },
      
      // Additional popular services
      { domain: 'pinterest.com', name: 'Pinterest', category: 'Social Media', estimated_visitors: 900000000, priority_score: 75 },
      { domain: 'snapchat.com', name: 'Snapchat', category: 'Social Media', estimated_visitors: 800000000, priority_score: 75 },
      { domain: 'medium.com', name: 'Medium', category: 'Publishing', estimated_visitors: 200000000, priority_score: 65 },
      { domain: 'shopify.com', name: 'Shopify', category: 'E-commerce', estimated_visitors: 300000000, priority_score: 75 }
    ]

    for (const site of popularWebsites) {
      const tosUrl = `https://${site.domain}/terms`
      const privacyUrl = `https://${site.domain}/privacy`
      
      // Insert or update public website
      const upsertQuery = `
        INSERT INTO public_websites (name, domain, url, category, monthly_visitors, is_verified)
        VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (domain) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          monthly_visitors = EXCLUDED.monthly_visitors,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `
      
      await this.db.query(upsertQuery, [
        site.name,
        site.domain,
        tosUrl,
        site.category,
        site.estimated_visitors
      ])
    }

    logger.info(`Seeded ${popularWebsites.length} popular websites`)
  }

  // Queue website for analysis
  async queueWebsiteAnalysis(domain: string): Promise<void> {
    // This would trigger background analysis of the website
    // For now, we'll simulate with a random risk score
    const mockRiskScore = Math.floor(Math.random() * 70) + 20 // 20-90

    const updateQuery = `
      UPDATE public_websites 
      SET risk_score = $1, 
          last_analyzed = CURRENT_TIMESTAMP,
          analysis_count = analysis_count + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE domain = $2
    `
    
    await this.db.query(updateQuery, [mockRiskScore, domain])
    
    // Save historical snapshot
    await this.saveRiskSnapshot(domain, mockRiskScore)
    
    logger.info('Queued website analysis', { domain, riskScore: mockRiskScore })
  }

  // Save risk score snapshot for trend analysis
  async saveRiskSnapshot(domain: string, riskScore: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    
    const snapshotQuery = `
      INSERT INTO website_risk_history (website_id, risk_score, snapshot_date)
      SELECT id, $2, $3 FROM public_websites WHERE domain = $1
      ON CONFLICT (website_id, snapshot_date) DO UPDATE SET
        risk_score = EXCLUDED.risk_score
    `
    
    await this.db.query(snapshotQuery, [domain, riskScore, today])
  }

  // Get Top 50 Most Popular Websites (ordered by monthly visitors)
  async getPopularWebsites(limit: number = 50): Promise<LeaderboardEntry[]> {
    const query = `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY pw.monthly_visitors DESC) as rank,
        pw.name,
        pw.domain,
        pw.risk_score,
        pw.category,
        pw.monthly_visitors,
        pw.last_analyzed as last_updated,
        COALESCE(
          (SELECT pw.risk_score - wh.risk_score 
           FROM website_risk_history wh 
           WHERE wh.website_id = pw.id 
           AND wh.snapshot_date = CURRENT_DATE - INTERVAL '7 days'
           LIMIT 1), 0
        ) as change_from_last_week
      FROM public_websites pw
      WHERE pw.risk_score > 0 
      AND pw.is_verified = true
      ORDER BY pw.monthly_visitors DESC
      LIMIT $1
    `
    
    const result = await this.db.query(query, [limit])
    return result.rows.map(row => ({
      rank: parseInt(row.rank),
      name: row.name,
      domain: row.domain,
      risk_score: row.risk_score,
      category: row.category,
      change_from_last_week: row.change_from_last_week,
      monthly_visitors: row.monthly_visitors,
      last_updated: row.last_updated
    }))
  }

  // Get Top 50 Best Websites (lowest risk scores) - kept for backward compatibility
  async getTopSafeWebsites(limit: number = 50): Promise<LeaderboardEntry[]> {
    const query = `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY pw.risk_score ASC, pw.monthly_visitors DESC) as rank,
        pw.name,
        pw.domain,
        pw.risk_score,
        pw.category,
        pw.monthly_visitors,
        pw.last_analyzed as last_updated,
        COALESCE(
          (SELECT pw.risk_score - wh.risk_score 
           FROM website_risk_history wh 
           WHERE wh.website_id = pw.id 
           AND wh.snapshot_date = CURRENT_DATE - INTERVAL '7 days'
           LIMIT 1), 0
        ) as change_from_last_week
      FROM public_websites pw
      WHERE pw.risk_score > 0 
      AND pw.is_verified = true
      ORDER BY pw.risk_score ASC, pw.monthly_visitors DESC
      LIMIT $1
    `
    
    const result = await this.db.query(query, [limit])
    return result.rows.map(row => ({
      rank: parseInt(row.rank),
      name: row.name,
      domain: row.domain,
      risk_score: row.risk_score,
      category: row.category,
      change_from_last_week: row.change_from_last_week,
      monthly_visitors: row.monthly_visitors,
      last_updated: row.last_updated
    }))
  }

  // Get Worst Offenders (highest risk scores)
  async getWorstOffenders(limit: number = 50): Promise<LeaderboardEntry[]> {
    const query = `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY pw.risk_score DESC, pw.monthly_visitors DESC) as rank,
        pw.name,
        pw.domain,
        pw.risk_score,
        pw.category,
        pw.monthly_visitors,
        pw.last_analyzed as last_updated,
        COALESCE(
          (SELECT pw.risk_score - wh.risk_score 
           FROM website_risk_history wh 
           WHERE wh.website_id = pw.id 
           AND wh.snapshot_date = CURRENT_DATE - INTERVAL '7 days'
           LIMIT 1), 0
        ) as change_from_last_week
      FROM public_websites pw
      WHERE pw.risk_score > 0 
      AND pw.is_verified = true
      ORDER BY pw.risk_score DESC, pw.monthly_visitors DESC
      LIMIT $1
    `
    
    const result = await this.db.query(query, [limit])
    return result.rows.map(row => ({
      rank: parseInt(row.rank),
      name: row.name,
      domain: row.domain,
      risk_score: row.risk_score,
      category: row.category,
      change_from_last_week: row.change_from_last_week,
      monthly_visitors: row.monthly_visitors,
      last_updated: row.last_updated
    }))
  }

  // Get leaderboards by category
  async getCategoryLeaderboard(category: string, type: 'best' | 'worst' = 'best', limit: number = 20): Promise<LeaderboardEntry[]> {
    const orderBy = type === 'best' ? 'ASC' : 'DESC'
    
    const query = `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY pw.risk_score ${orderBy}, pw.monthly_visitors DESC) as rank,
        pw.name,
        pw.domain,
        pw.risk_score,
        pw.category,
        pw.monthly_visitors,
        pw.last_analyzed as last_updated,
        COALESCE(
          (SELECT pw.risk_score - wh.risk_score 
           FROM website_risk_history wh 
           WHERE wh.website_id = pw.id 
           AND wh.snapshot_date = CURRENT_DATE - INTERVAL '7 days'
           LIMIT 1), 0
        ) as change_from_last_week
      FROM public_websites pw
      WHERE pw.risk_score > 0 
      AND pw.is_verified = true
      AND pw.category = $1
      ORDER BY pw.risk_score ${orderBy}, pw.monthly_visitors DESC
      LIMIT $2
    `
    
    const result = await this.db.query(query, [category, limit])
    return result.rows.map(row => ({
      rank: parseInt(row.rank),
      name: row.name,
      domain: row.domain,
      risk_score: row.risk_score,
      category: row.category,
      change_from_last_week: row.change_from_last_week,
      monthly_visitors: row.monthly_visitors,
      last_updated: row.last_updated
    }))
  }

  // Get available categories
  async getCategories(): Promise<Array<{ category: string; count: number; avg_risk_score: number }>> {
    const query = `
      SELECT 
        category,
        COUNT(*) as count,
        ROUND(AVG(risk_score)) as avg_risk_score
      FROM public_websites 
      WHERE risk_score > 0 AND is_verified = true
      GROUP BY category
      ORDER BY count DESC
    `
    
    const result = await this.db.query(query)
    return result.rows.map(row => ({
      category: row.category,
      count: parseInt(row.count),
      avg_risk_score: parseInt(row.avg_risk_score)
    }))
  }

  // Run daily analysis updates
  async runDailyUpdate(): Promise<void> {
    logger.info('Starting daily leaderboard update')
    
    // Get websites that need analysis (not analyzed in last 7 days)
    const staleWebsitesQuery = `
      SELECT domain FROM public_websites 
      WHERE last_analyzed IS NULL 
      OR last_analyzed < CURRENT_TIMESTAMP - INTERVAL '7 days'
      ORDER BY monthly_visitors DESC
      LIMIT 20
    `
    
    const staleWebsites = await this.db.query(staleWebsitesQuery)
    
    // Queue analysis for stale websites
    for (const row of staleWebsites.rows) {
      await this.queueWebsiteAnalysis(row.domain)
      // Add delay to avoid overwhelming services
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    logger.info(`Updated ${staleWebsites.rows.length} websites`)
  }

  // Get trending websites (biggest changes)
  async getTrendingWebsites(limit: number = 10): Promise<LeaderboardEntry[]> {
    const query = `
      SELECT 
        pw.name,
        pw.domain,
        pw.risk_score,
        pw.category,
        pw.monthly_visitors,
        pw.last_analyzed as last_updated,
        COALESCE(
          (SELECT ABS(pw.risk_score - wh.risk_score) 
           FROM website_risk_history wh 
           WHERE wh.website_id = pw.id 
           AND wh.snapshot_date = CURRENT_DATE - INTERVAL '7 days'
           LIMIT 1), 0
        ) as change_magnitude,
        COALESCE(
          (SELECT pw.risk_score - wh.risk_score 
           FROM website_risk_history wh 
           WHERE wh.website_id = pw.id 
           AND wh.snapshot_date = CURRENT_DATE - INTERVAL '7 days'
           LIMIT 1), 0
        ) as change_from_last_week
      FROM public_websites pw
      WHERE pw.risk_score > 0 
      AND pw.is_verified = true
      ORDER BY change_magnitude DESC
      LIMIT $1
    `
    
    const result = await this.db.query(query, [limit])
    return result.rows.map((row, index) => ({
      rank: index + 1,
      name: row.name,
      domain: row.domain,
      risk_score: row.risk_score,
      category: row.category,
      change_from_last_week: row.change_from_last_week,
      monthly_visitors: row.monthly_visitors,
      last_updated: row.last_updated
    }))
  }

  // Get leaderboard statistics
  async getLeaderboardStats(): Promise<any> {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_websites,
        ROUND(AVG(risk_score)) as avg_risk_score,
        MIN(risk_score) as min_risk_score,
        MAX(risk_score) as max_risk_score,
        COUNT(*) FILTER (WHERE risk_score >= 80) as high_risk_count,
        COUNT(*) FILTER (WHERE risk_score < 40) as low_risk_count,
        COUNT(DISTINCT category) as total_categories,
        MAX(last_analyzed) as last_update
      FROM public_websites 
      WHERE risk_score > 0 AND is_verified = true
    `
    
    const result = await this.db.query(statsQuery)
    return result.rows[0]
  }
}