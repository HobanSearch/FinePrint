/**
 * Fine Print AI - Website Crawler Service
 * 
 * Crawls popular websites to collect terms of service and privacy policies
 * with rate limiting, error handling, and change detection
 */

import { PrismaClient } from '@prisma/client';
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { delay, retry } from '../utils/helpers';
import { WebsiteTargets } from '../config/website-targets';

export interface CrawlResult {
  url: string;
  content: string;
  contentHash: string;
  title: string;
  lastModified?: Date;
  wordCount: number;
  hasChanged: boolean;
  errorMessage?: string;
}

export interface CrawlStats {
  totalSites: number;
  successfulCrawls: number;
  failedCrawls: number;
  documentsChanged: number;
  newDocuments: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

export class WebsiteCrawlerService {
  private prisma: PrismaClient;
  private isRunning: boolean = false;
  private crawlInterval: NodeJS.Timeout | null = null;
  private userAgent: string = 'FinePrintAI-Bot/1.0 (+https://fineprintai.com/bot)';
  private rateLimitDelay: number = 2000; // 2 seconds between requests
  private maxRetries: number = 3;
  private timeout: number = 30000; // 30 seconds

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Start periodic crawling of all target websites
   */
  async startPeriodicCrawling(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Website crawler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting periodic website crawling');

    // Initial crawl
    await this.crawlAllWebsites();

    // Schedule periodic crawls (every 24 hours)
    this.crawlInterval = setInterval(async () => {
      try {
        await this.crawlAllWebsites();
      } catch (error) {
        logger.error('Error in periodic crawl:', error);
      }
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Stop periodic crawling
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.crawlInterval) {
      clearInterval(this.crawlInterval);
      this.crawlInterval = null;
    }

    logger.info('Website crawler stopped');
  }

  /**
   * Crawl all target websites
   */
  async crawlAllWebsites(): Promise<CrawlStats> {
    const stats: CrawlStats = {
      totalSites: 0,
      successfulCrawls: 0,
      failedCrawls: 0,
      documentsChanged: 0,
      newDocuments: 0,
      startTime: new Date(),
    };

    logger.info('Starting website crawl batch');

    try {
      const websites = WebsiteTargets.getAllTargets();
      stats.totalSites = websites.length;

      for (const website of websites) {
        if (!this.isRunning) {
          logger.info('Crawling stopped by user request');
          break;
        }

        try {
          const results = await this.crawlWebsite(website);
          
          for (const result of results) {
            if (result.errorMessage) {
              stats.failedCrawls++;
            } else {
              stats.successfulCrawls++;
              if (result.hasChanged) {
                stats.documentsChanged++;
              }
            }

            // Save to database
            await this.saveDocumentResult(website, result);
          }

          // Rate limiting
          await delay(this.rateLimitDelay);
        } catch (error) {
          logger.error(`Failed to crawl ${website.name}:`, error);
          stats.failedCrawls++;
        }
      }

      stats.endTime = new Date();
      stats.duration = stats.endTime.getTime() - stats.startTime.getTime();

      logger.info('Website crawl batch completed', {
        duration: stats.duration,
        successful: stats.successfulCrawls,
        failed: stats.failedCrawls,
        changed: stats.documentsChanged,
      });

      // Save crawl stats
      await this.saveCrawlStats(stats);
      
      return stats;
    } catch (error) {
      logger.error('Error in crawl batch:', error);
      throw error;
    }
  }

  /**
   * Crawl a specific website for legal documents
   */
  async crawlWebsite(website: any): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];

    logger.info(`Crawling ${website.name}...`);

    // Crawl terms of service
    if (website.termsUrl) {
      const termsResult = await this.crawlDocument(
        website.termsUrl,
        'terms_of_service',
        website.selectors?.terms
      );
      results.push(termsResult);
    }

    // Crawl privacy policy
    if (website.privacyUrl) {
      const privacyResult = await this.crawlDocument(
        website.privacyUrl,
        'privacy_policy',
        website.selectors?.privacy
      );
      results.push(privacyResult);
    }

    // Crawl cookie policy
    if (website.cookieUrl) {
      const cookieResult = await this.crawlDocument(
        website.cookieUrl,
        'cookie_policy',
        website.selectors?.cookie
      );
      results.push(cookieResult);
    }

    return results;
  }

  /**
   * Crawl a specific document URL
   */
  private async crawlDocument(
    url: string,
    documentType: string,
    selector?: string
  ): Promise<CrawlResult> {
    try {
      const response = await retry(
        () => this.fetchDocument(url),
        this.maxRetries,
        1000
      );

      if (!response) {
        return {
          url,
          content: '',
          contentHash: '',
          title: '',
          wordCount: 0,
          hasChanged: false,
          errorMessage: 'Failed to fetch document',
        };
      }

      const { content, title } = this.extractContent(response.data, selector);
      const contentHash = this.generateContentHash(content);
      const wordCount = this.countWords(content);

      // Check if content has changed
      const hasChanged = await this.hasContentChanged(url, contentHash);

      return {
        url,
        content,
        contentHash,
        title,
        wordCount,
        hasChanged,
        lastModified: this.parseLastModified(response.headers['last-modified']),
      };
    } catch (error) {
      logger.error(`Error crawling ${url}:`, error);
      
      return {
        url,
        content: '',
        contentHash: '',
        title: '',
        wordCount: 0,
        hasChanged: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch document with proper headers and timeout
   */
  private async fetchDocument(url: string): Promise<AxiosResponse | null> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: this.timeout,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      return response;
    } catch (error) {
      logger.error(`HTTP request failed for ${url}:`, error);
      return null;
    }
  }

  /**
   * Extract content using selectors or fallback to full text
   */
  private extractContent(html: string, selector?: string): { content: string; title: string } {
    const $ = cheerio.load(html);
    
    // Extract title
    const title = $('title').first().text().trim() || 'Untitled Document';
    
    let content = '';
    
    if (selector) {
      // Use provided selector
      const elements = $(selector);
      if (elements.length > 0) {
        content = elements.map((_, el) => $(el).text()).get().join('\n\n');
      }
    }
    
    // Fallback strategies if selector didn't work
    if (!content.trim()) {
      // Try common legal document containers
      const fallbackSelectors = [
        '[data-legal-content]',
        '.legal-content',
        '.terms-content',
        '.privacy-content',
        'main',
        '.main-content',
        '#main-content',
        '.content',
        '#content',
        'article',
        '.document',
      ];
      
      for (const fallbackSelector of fallbackSelectors) {
        const elements = $(fallbackSelector);
        if (elements.length > 0) {
          content = elements.first().text();
          if (content.trim().length > 1000) { // Minimum content threshold
            break;
          }
        }
      }
    }
    
    // Final fallback - use body text
    if (!content.trim()) {
      content = $('body').text();
    }
    
    // Clean up content
    content = this.cleanContent(content);
    
    return { content, title };
  }

  /**
   * Clean extracted content
   */
  private cleanContent(content: string): string {
    return content
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n\s*\n/g, '\n\n') // Normalize line breaks
      .trim();
  }

  /**
   * Generate content hash for change detection
   */
  private generateContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Count words in content
   */
  private countWords(content: string): number {
    return content.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Check if content has changed since last crawl
   */
  private async hasContentChanged(url: string, contentHash: string): Promise<boolean> {
    try {
      const existingDocument = await this.prisma.aggregatedDocument.findFirst({
        where: { url },
        orderBy: { crawledAt: 'desc' },
        select: { contentHash: true },
      });

      return !existingDocument || existingDocument.contentHash !== contentHash;
    } catch (error) {
      logger.error('Error checking content changes:', error);
      return true; // Assume changed if we can't check
    }
  }

  /**
   * Parse last modified header
   */
  private parseLastModified(lastModified?: string): Date | undefined {
    if (!lastModified) return undefined;
    
    try {
      return new Date(lastModified);
    } catch {
      return undefined;
    }
  }

  /**
   * Save document result to database
   */
  private async saveDocumentResult(website: any, result: CrawlResult): Promise<void> {
    try {
      if (result.errorMessage) {
        // Log error instead of saving to non-existent crawlError table
        logger.error('Crawl error recorded', {
          url: result.url,
          websiteName: website.name,
          errorMessage: result.errorMessage,
        });
        return;
      }

      if (!result.hasChanged) {
        // Update last analyzed timestamp (lastChecked field doesn't exist)
        await this.prisma.aggregatedDocument.updateMany({
          where: { url: result.url },
          data: { lastAnalyzed: new Date() },
        });
        return;
      }

      // Save new document version
      await this.prisma.aggregatedDocument.create({
        data: {
          url: result.url,
          websiteName: website.name,
          documentType: this.getDocumentType(result.url, website),
          title: result.title,
          content: result.content,
          contentHash: result.contentHash,
          crawledAt: new Date(),
          // wordCount, lastModified, lastChecked, metadata fields don't exist in schema
          // Store basic document information only
        },
      });

      logger.info(`Saved new document version: ${website.name} - ${result.url}`);
    } catch (error) {
      logger.error('Error saving document result:', error);
    }
  }

  /**
   * Determine document type from URL
   */
  private getDocumentType(url: string, website: any): string {
    if (url === website.termsUrl) return 'terms_of_service';
    if (url === website.privacyUrl) return 'privacy_policy';
    if (url === website.cookieUrl) return 'cookie_policy';
    return 'unknown';
  }

  /**
   * Save crawl statistics
   */
  private async saveCrawlStats(stats: CrawlStats): Promise<void> {
    try {
      // Log crawl stats instead of saving to non-existent crawlSession table
      logger.info('Crawl session completed', {
        startTime: stats.startTime,
        endTime: stats.endTime,
        duration: stats.duration,
        totalSites: stats.totalSites,
        successfulCrawls: stats.successfulCrawls,
        failedCrawls: stats.failedCrawls,
        documentsChanged: stats.documentsChanged,
        newDocuments: stats.newDocuments,
      });
    } catch (error) {
      logger.error('Error saving crawl stats:', error);
    }
  }

  /**
   * Get crawler status
   */
  getStatus(): any {
    return {
      isRunning: this.isRunning,
      rateLimitDelay: this.rateLimitDelay,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
    };
  }

  /**
   * Crawl specific website by name
   */
  async crawlSpecificWebsite(websiteName: string): Promise<CrawlResult[]> {
    const website = WebsiteTargets.getTarget(websiteName);
    if (!website) {
      throw new Error(`Website not found: ${websiteName}`);
    }

    return await this.crawlWebsite(website);
  }

  /**
   * Get recent crawl statistics
   */
  async getRecentStats(limit: number = 10): Promise<any[]> {
    try {
      // Return recent crawl jobs from existing CrawlJob table
      return await this.prisma.crawlJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } catch (error) {
      logger.error('Error fetching crawl stats:', error);
      return [];
    }
  }

  /**
   * Get documents for a specific website
   */
  async getWebsiteDocuments(websiteName: string, limit: number = 50): Promise<any[]> {
    try {
      return await this.prisma.aggregatedDocument.findMany({
        where: { websiteName },
        orderBy: { crawledAt: 'desc' },
        take: limit,
        select: {
          id: true,
          url: true,
          documentType: true,
          title: true,
          crawledAt: true,
          // lastModified and wordCount fields don't exist in schema
          contentHash: true,
        },
      });
    } catch (error) {
      logger.error('Error fetching website documents:', error);
      return [];
    }
  }
}