import { createServiceLogger } from '@fineprintai/shared-logger';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import puppeteer, { Browser, Page } from 'puppeteer';
import robotsParser from 'robots-parser';
import { CrawlerConfig, DocumentCrawlResult } from '@fineprintai/shared-types';
import pRetry from 'p-retry';
import pTimeout from 'p-timeout';

const logger = createServiceLogger('document-crawler-service');

interface CrawlOptions extends CrawlerConfig {
  maxRedirects: number;
  enableJavaScript?: boolean;
  waitForSelector?: string;
  extractText?: boolean;
}

interface RobotsTxtCache {
  [domain: string]: {
    robots: any;
    cachedAt: Date;
    ttl: number;
  };
}

class DocumentCrawlerService {
  private httpClient: AxiosInstance;
  private browser: Browser | null = null;
  private robotsCache: RobotsTxtCache = {};
  private initialized = false;
  private readonly USER_AGENTS = {
    desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    bot: 'FinePrintAI-Crawler/1.0 (+https://fineprintai.com/bot)',
  };

  constructor() {
    this.httpClient = axios.create({
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: (status) => status < 400, // Accept all status codes below 400
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'no-cache',
      },
    });

    // Add response interceptor for logging
    this.httpClient.interceptors.response.use(
      (response) => {
        logger.debug('HTTP request successful', {
          url: response.config.url,
          status: response.status,
          contentLength: response.headers['content-length'],
          contentType: response.headers['content-type'],
        });
        return response;
      },
      (error) => {
        logger.warn('HTTP request failed', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing document crawler service...');
    
    try {
      // Initialize headless browser for JavaScript-heavy sites
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
        ],
      });

      this.initialized = true;
      logger.info('Document crawler service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize document crawler service', { error });
      throw error;
    }
  }

  async crawlDocument(url: string, options: Partial<CrawlOptions> = {}): Promise<DocumentCrawlResult> {
    if (!this.initialized) {
      throw new Error('Document crawler service not initialized');
    }

    const startTime = Date.now();
    const crawlOptions: CrawlOptions = {
      userAgent: options.userAgent || this.USER_AGENTS.bot,
      timeout: options.timeout || 30000,
      retries: options.retries || 3,
      respectRobotsTxt: options.respectRobotsTxt !== false,
      followRedirects: options.followRedirects !== false,
      maxRedirects: options.maxRedirects || 5,
      headers: options.headers || {},
      enableJavaScript: options.enableJavaScript || false,
      waitForSelector: options.waitForSelector,
      extractText: options.extractText !== false,
    };

    logger.info('Starting document crawl', {
      url,
      userAgent: crawlOptions.userAgent,
      enableJavaScript: crawlOptions.enableJavaScript,
    });

    try {
      // Check robots.txt if required
      if (crawlOptions.respectRobotsTxt) {
        const robotsAllowed = await this.checkRobotsTxt(url, crawlOptions.userAgent);
        if (!robotsAllowed) {
          return {
            url,
            success: false,
            error: 'Crawling not allowed by robots.txt',
            crawledAt: new Date(),
          };
        }
      }

      // Attempt crawl with retries
      const result = await pRetry(
        () => this.performCrawl(url, crawlOptions),
        {
          retries: crawlOptions.retries,
          factor: 2,
          minTimeout: 1000,
          maxTimeout: 10000,
          onFailedAttempt: (error) => {
            logger.warn('Crawl attempt failed', {
              url,
              attempt: error.attemptNumber,
              retriesLeft: error.retriesLeft,
              error: error.message,
            });
          },
        }
      );

      const crawlTime = Date.now() - startTime;
      logger.info('Document crawl completed', {
        url,
        success: result.success,
        contentLength: result.content?.length,
        crawlTime,
      });

      return result;

    } catch (error) {
      const crawlTime = Date.now() - startTime;
      logger.error('Document crawl failed', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
        crawlTime,
      });

      return {
        url,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        crawledAt: new Date(),
      };
    }
  }

  private async performCrawl(url: string, options: CrawlOptions): Promise<DocumentCrawlResult> {
    const crawledAt = new Date();
    
    try {
      if (options.enableJavaScript) {
        return await this.crawlWithPuppeteer(url, options, crawledAt);
      } else {
        return await this.crawlWithAxios(url, options, crawledAt);
      }
    } catch (error) {
      throw new Error(`Crawl failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async crawlWithAxios(url: string, options: CrawlOptions, crawledAt: Date): Promise<DocumentCrawlResult> {
    const requestConfig: AxiosRequestConfig = {
      url,
      method: 'GET',
      timeout: options.timeout,
      maxRedirects: options.followRedirects ? options.maxRedirects : 0,
      headers: {
        'User-Agent': options.userAgent,
        ...options.headers,
      },
      responseType: 'text',
    };

    const response = await pTimeout(
      this.httpClient.request(requestConfig),
      options.timeout,
      `Request timeout after ${options.timeout}ms`
    );

    // Handle successful response
    let content = response.data;
    let contentHash: string | undefined;

    if (options.extractText && content) {
      content = this.extractTextContent(content, response.headers['content-type'] || '');
      contentHash = this.generateContentHash(content);
    }

    return {
      url,
      success: true,
      content,
      contentHash,
      statusCode: response.status,
      redirectUrl: response.request.res?.responseUrl !== url ? response.request.res?.responseUrl : undefined,
      crawledAt,
    };
  }

  private async crawlWithPuppeteer(url: string, options: CrawlOptions, crawledAt: Date): Promise<DocumentCrawlResult> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page: Page = await this.browser.newPage();
    
    try {
      // Set user agent and viewport
      await page.setUserAgent(options.userAgent);
      await page.setViewport({ width: 1920, height: 1080 });

      // Set extra headers
      if (Object.keys(options.headers).length > 0) {
        await page.setExtraHTTPHeaders(options.headers);
      }

      // Navigate to page
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: options.timeout,
      });

      if (!response) {
        throw new Error('Failed to load page');
      }

      // Wait for specific selector if provided
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, {
          timeout: 5000,
        }).catch(() => {
          logger.warn('Wait for selector timed out', {
            url,
            selector: options.waitForSelector,
          });
        });
      }

      // Extract content
      let content: string;
      if (options.extractText) {
        content = await page.evaluate(() => {
          // Remove script and style elements
          const scripts = document.querySelectorAll('script, style, noscript');
          scripts.forEach(el => el.remove());
          
          return document.body.innerText || document.documentElement.textContent || '';
        });
      } else {
        content = await page.content();
      }

      const finalUrl = page.url();
      const statusCode = response.status();
      const contentHash = options.extractText ? this.generateContentHash(content) : undefined;

      return {
        url,
        success: true,
        content,
        contentHash,
        statusCode,
        redirectUrl: finalUrl !== url ? finalUrl : undefined,
        crawledAt,
      };

    } finally {
      await page.close();
    }
  }

  private extractTextContent(html: string, contentType: string): string {
    if (!contentType.includes('text/html')) {
      return html; // Return as-is if not HTML
    }

    try {
      // Use JSDOM for server-side HTML parsing
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Remove unwanted elements
      const unwantedElements = document.querySelectorAll(
        'script, style, noscript, meta, link, head, nav, header, footer, aside, .ad, .advertisement, .sidebar'
      );
      unwantedElements.forEach(el => el.remove());

      // Extract text content
      const textContent = document.body?.textContent || document.documentElement.textContent || '';
      
      // Clean up whitespace
      return textContent
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

    } catch (error) {
      logger.warn('Failed to extract text content, returning raw HTML', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return html;
    }
  }

  private generateContentHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private async checkRobotsTxt(url: string, userAgent: string): Promise<boolean> {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const robotsUrl = `${urlObj.protocol}//${domain}/robots.txt`;

      // Check cache first
      const cached = this.robotsCache[domain];
      if (cached && (Date.now() - cached.cachedAt.getTime()) < cached.ttl) {
        return cached.robots.isAllowed(url, userAgent);
      }

      // Fetch robots.txt
      const response = await this.httpClient.get(robotsUrl, {
        timeout: 5000,
        validateStatus: (status) => status === 200,
      });

      const robots = robotsParser(robotsUrl, response.data);
      
      // Cache for 1 hour
      this.robotsCache[domain] = {
        robots,
        cachedAt: new Date(),
        ttl: 3600000, // 1 hour
      };

      return robots.isAllowed(url, userAgent);

    } catch (error) {
      // If robots.txt is not accessible, assume crawling is allowed
      logger.debug('Failed to fetch robots.txt, assuming crawling is allowed', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return true;
    }
  }

  async crawlMultipleDocuments(
    urls: string[], 
    options: Partial<CrawlOptions> = {},
    concurrency = 3
  ): Promise<DocumentCrawlResult[]> {
    logger.info('Starting batch document crawl', {
      urlCount: urls.length,
      concurrency,
    });

    const results: DocumentCrawlResult[] = [];
    const chunks = this.chunkArray(urls, concurrency);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(url => this.crawlDocument(url, options));
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          logger.error('Batch crawl item failed', {
            error: result.reason,
          });
        }
      }
    }

    logger.info('Batch document crawl completed', {
      totalUrls: urls.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    });

    return results;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async testUrl(url: string): Promise<{
    accessible: boolean;
    statusCode?: number;
    contentType?: string;
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const response = await this.httpClient.head(url, {
        timeout: 10000,
        maxRedirects: 5,
      });

      return {
        accessible: true,
        statusCode: response.status,
        contentType: response.headers['content-type'],
        responseTime: Date.now() - startTime,
      };

    } catch (error) {
      return {
        accessible: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getPageMetadata(url: string): Promise<{
    title?: string;
    description?: string;
    keywords?: string;
    lastModified?: Date;
    contentLength?: number;
  }> {
    try {
      const result = await this.crawlDocument(url, {
        extractText: false,
        enableJavaScript: false,
      });

      if (!result.success || !result.content) {
        return {};
      }

      const $ = cheerio.load(result.content);
      
      return {
        title: $('title').text().trim() || $('meta[property="og:title"]').attr('content'),
        description: $('meta[name="description"]').attr('content') || 
                    $('meta[property="og:description"]').attr('content'),
        keywords: $('meta[name="keywords"]').attr('content'),
        lastModified: $('meta[name="last-modified"]').attr('content') ? 
                     new Date($('meta[name="last-modified"]').attr('content')!) : 
                     undefined,
        contentLength: result.content.length,
      };

    } catch (error) {
      logger.error('Failed to extract page metadata', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {};
    }
  }

  async healthCheck(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Document crawler service not initialized');
    }

    // Test HTTP client
    try {
      await this.httpClient.get('https://httpbin.org/status/200', { timeout: 5000 });
    } catch (error) {
      throw new Error(`HTTP client health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Test browser if available
    if (this.browser) {
      try {
        const page = await this.browser.newPage();
        await page.goto('data:text/html,<html><body>Health Check</body></html>');
        await page.close();
      } catch (error) {
        throw new Error(`Browser health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down document crawler service...');
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    // Clear caches
    this.robotsCache = {};
    this.initialized = false;
    
    logger.info('Document crawler service shutdown complete');
  }
}

export const documentCrawlerService = new DocumentCrawlerService();