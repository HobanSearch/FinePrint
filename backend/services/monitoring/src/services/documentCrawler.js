"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentCrawlerService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const jsdom_1 = require("jsdom");
const puppeteer_1 = __importDefault(require("puppeteer"));
const robots_parser_1 = __importDefault(require("robots-parser"));
const p_retry_1 = __importDefault(require("p-retry"));
const p_timeout_1 = __importDefault(require("p-timeout"));
const logger = (0, logger_1.createServiceLogger)('document-crawler-service');
class DocumentCrawlerService {
    httpClient;
    browser = null;
    robotsCache = {};
    initialized = false;
    USER_AGENTS = {
        desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        bot: 'FinePrintAI-Crawler/1.0 (+https://fineprintai.com/bot)',
    };
    constructor() {
        this.httpClient = axios_1.default.create({
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: (status) => status < 400,
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
        this.httpClient.interceptors.response.use((response) => {
            logger.debug('HTTP request successful', {
                url: response.config.url,
                status: response.status,
                contentLength: response.headers['content-length'],
                contentType: response.headers['content-type'],
            });
            return response;
        }, (error) => {
            logger.warn('HTTP request failed', {
                url: error.config?.url,
                status: error.response?.status,
                message: error.message,
            });
            return Promise.reject(error);
        });
    }
    async initialize() {
        if (this.initialized)
            return;
        logger.info('Initializing document crawler service...');
        try {
            this.browser = await puppeteer_1.default.launch({
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
        }
        catch (error) {
            logger.error('Failed to initialize document crawler service', { error });
            throw error;
        }
    }
    async crawlDocument(url, options = {}) {
        if (!this.initialized) {
            throw new Error('Document crawler service not initialized');
        }
        const startTime = Date.now();
        const crawlOptions = {
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
            const result = await (0, p_retry_1.default)(() => this.performCrawl(url, crawlOptions), {
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
            });
            const crawlTime = Date.now() - startTime;
            logger.info('Document crawl completed', {
                url,
                success: result.success,
                contentLength: result.content?.length,
                crawlTime,
            });
            return result;
        }
        catch (error) {
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
    async performCrawl(url, options) {
        const crawledAt = new Date();
        try {
            if (options.enableJavaScript) {
                return await this.crawlWithPuppeteer(url, options, crawledAt);
            }
            else {
                return await this.crawlWithAxios(url, options, crawledAt);
            }
        }
        catch (error) {
            throw new Error(`Crawl failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async crawlWithAxios(url, options, crawledAt) {
        const requestConfig = {
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
        const response = await (0, p_timeout_1.default)(this.httpClient.request(requestConfig), options.timeout, `Request timeout after ${options.timeout}ms`);
        let content = response.data;
        let contentHash;
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
    async crawlWithPuppeteer(url, options, crawledAt) {
        if (!this.browser) {
            throw new Error('Browser not initialized');
        }
        const page = await this.browser.newPage();
        try {
            await page.setUserAgent(options.userAgent);
            await page.setViewport({ width: 1920, height: 1080 });
            if (Object.keys(options.headers).length > 0) {
                await page.setExtraHTTPHeaders(options.headers);
            }
            const response = await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: options.timeout,
            });
            if (!response) {
                throw new Error('Failed to load page');
            }
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
            let content;
            if (options.extractText) {
                content = await page.evaluate(() => {
                    const scripts = document.querySelectorAll('script, style, noscript');
                    scripts.forEach(el => el.remove());
                    return document.body.innerText || document.documentElement.textContent || '';
                });
            }
            else {
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
        }
        finally {
            await page.close();
        }
    }
    extractTextContent(html, contentType) {
        if (!contentType.includes('text/html')) {
            return html;
        }
        try {
            const dom = new jsdom_1.JSDOM(html);
            const document = dom.window.document;
            const unwantedElements = document.querySelectorAll('script, style, noscript, meta, link, head, nav, header, footer, aside, .ad, .advertisement, .sidebar');
            unwantedElements.forEach(el => el.remove());
            const textContent = document.body?.textContent || document.documentElement.textContent || '';
            return textContent
                .replace(/\s+/g, ' ')
                .replace(/\n\s*\n/g, '\n')
                .trim();
        }
        catch (error) {
            logger.warn('Failed to extract text content, returning raw HTML', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return html;
        }
    }
    generateContentHash(content) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    }
    async checkRobotsTxt(url, userAgent) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            const robotsUrl = `${urlObj.protocol}//${domain}/robots.txt`;
            const cached = this.robotsCache[domain];
            if (cached && (Date.now() - cached.cachedAt.getTime()) < cached.ttl) {
                return cached.robots.isAllowed(url, userAgent);
            }
            const response = await this.httpClient.get(robotsUrl, {
                timeout: 5000,
                validateStatus: (status) => status === 200,
            });
            const robots = (0, robots_parser_1.default)(robotsUrl, response.data);
            this.robotsCache[domain] = {
                robots,
                cachedAt: new Date(),
                ttl: 3600000,
            };
            return robots.isAllowed(url, userAgent);
        }
        catch (error) {
            logger.debug('Failed to fetch robots.txt, assuming crawling is allowed', {
                url,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return true;
        }
    }
    async crawlMultipleDocuments(urls, options = {}, concurrency = 3) {
        logger.info('Starting batch document crawl', {
            urlCount: urls.length,
            concurrency,
        });
        const results = [];
        const chunks = this.chunkArray(urls, concurrency);
        for (const chunk of chunks) {
            const chunkPromises = chunk.map(url => this.crawlDocument(url, options));
            const chunkResults = await Promise.allSettled(chunkPromises);
            for (const result of chunkResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                }
                else {
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
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }
    async testUrl(url) {
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
        }
        catch (error) {
            return {
                accessible: false,
                responseTime: Date.now() - startTime,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    async getPageMetadata(url) {
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
                    new Date($('meta[name="last-modified"]').attr('content')) :
                    undefined,
                contentLength: result.content.length,
            };
        }
        catch (error) {
            logger.error('Failed to extract page metadata', {
                url,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return {};
        }
    }
    async healthCheck() {
        if (!this.initialized) {
            throw new Error('Document crawler service not initialized');
        }
        try {
            await this.httpClient.get('https://httpbin.org/status/200', { timeout: 5000 });
        }
        catch (error) {
            throw new Error(`HTTP client health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        if (this.browser) {
            try {
                const page = await this.browser.newPage();
                await page.goto('data:text/html,<html><body>Health Check</body></html>');
                await page.close();
            }
            catch (error) {
                throw new Error(`Browser health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    }
    async shutdown() {
        logger.info('Shutting down document crawler service...');
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        this.robotsCache = {};
        this.initialized = false;
        logger.info('Document crawler service shutdown complete');
    }
}
exports.documentCrawlerService = new DocumentCrawlerService();
//# sourceMappingURL=documentCrawler.js.map