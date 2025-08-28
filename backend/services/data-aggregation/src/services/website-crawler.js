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
exports.WebsiteCrawlerService = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const crypto_1 = require("crypto");
const logger_1 = require("../utils/logger");
const helpers_1 = require("../utils/helpers");
const website_targets_1 = require("../config/website-targets");
class WebsiteCrawlerService {
    prisma;
    isRunning = false;
    crawlInterval = null;
    userAgent = 'FinePrintAI-Bot/1.0 (+https://fineprintai.com/bot)';
    rateLimitDelay = 2000;
    maxRetries = 3;
    timeout = 30000;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async startPeriodicCrawling() {
        if (this.isRunning) {
            logger_1.logger.warn('Website crawler is already running');
            return;
        }
        this.isRunning = true;
        logger_1.logger.info('Starting periodic website crawling');
        await this.crawlAllWebsites();
        this.crawlInterval = setInterval(async () => {
            try {
                await this.crawlAllWebsites();
            }
            catch (error) {
                logger_1.logger.error('Error in periodic crawl:', error);
            }
        }, 24 * 60 * 60 * 1000);
    }
    async stop() {
        this.isRunning = false;
        if (this.crawlInterval) {
            clearInterval(this.crawlInterval);
            this.crawlInterval = null;
        }
        logger_1.logger.info('Website crawler stopped');
    }
    async crawlAllWebsites() {
        const stats = {
            totalSites: 0,
            successfulCrawls: 0,
            failedCrawls: 0,
            documentsChanged: 0,
            newDocuments: 0,
            startTime: new Date(),
        };
        logger_1.logger.info('Starting website crawl batch');
        try {
            const websites = website_targets_1.WebsiteTargets.getAllTargets();
            stats.totalSites = websites.length;
            for (const website of websites) {
                if (!this.isRunning) {
                    logger_1.logger.info('Crawling stopped by user request');
                    break;
                }
                try {
                    const results = await this.crawlWebsite(website);
                    for (const result of results) {
                        if (result.errorMessage) {
                            stats.failedCrawls++;
                        }
                        else {
                            stats.successfulCrawls++;
                            if (result.hasChanged) {
                                stats.documentsChanged++;
                            }
                        }
                        await this.saveDocumentResult(website, result);
                    }
                    await (0, helpers_1.delay)(this.rateLimitDelay);
                }
                catch (error) {
                    logger_1.logger.error(`Failed to crawl ${website.name}:`, error);
                    stats.failedCrawls++;
                }
            }
            stats.endTime = new Date();
            stats.duration = stats.endTime.getTime() - stats.startTime.getTime();
            logger_1.logger.info('Website crawl batch completed', {
                duration: stats.duration,
                successful: stats.successfulCrawls,
                failed: stats.failedCrawls,
                changed: stats.documentsChanged,
            });
            await this.saveCrawlStats(stats);
            return stats;
        }
        catch (error) {
            logger_1.logger.error('Error in crawl batch:', error);
            throw error;
        }
    }
    async crawlWebsite(website) {
        const results = [];
        logger_1.logger.info(`Crawling ${website.name}...`);
        if (website.termsUrl) {
            const termsResult = await this.crawlDocument(website.termsUrl, 'terms_of_service', website.selectors?.terms);
            results.push(termsResult);
        }
        if (website.privacyUrl) {
            const privacyResult = await this.crawlDocument(website.privacyUrl, 'privacy_policy', website.selectors?.privacy);
            results.push(privacyResult);
        }
        if (website.cookieUrl) {
            const cookieResult = await this.crawlDocument(website.cookieUrl, 'cookie_policy', website.selectors?.cookie);
            results.push(cookieResult);
        }
        return results;
    }
    async crawlDocument(url, documentType, selector) {
        try {
            const response = await (0, helpers_1.retry)(() => this.fetchDocument(url), this.maxRetries, 1000);
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
        }
        catch (error) {
            logger_1.logger.error(`Error crawling ${url}:`, error);
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
    async fetchDocument(url) {
        try {
            const response = await axios_1.default.get(url, {
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
        }
        catch (error) {
            logger_1.logger.error(`HTTP request failed for ${url}:`, error);
            return null;
        }
    }
    extractContent(html, selector) {
        const $ = cheerio.load(html);
        const title = $('title').first().text().trim() || 'Untitled Document';
        let content = '';
        if (selector) {
            const elements = $(selector);
            if (elements.length > 0) {
                content = elements.map((_, el) => $(el).text()).get().join('\n\n');
            }
        }
        if (!content.trim()) {
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
                    if (content.trim().length > 1000) {
                        break;
                    }
                }
            }
        }
        if (!content.trim()) {
            content = $('body').text();
        }
        content = this.cleanContent(content);
        return { content, title };
    }
    cleanContent(content) {
        return content
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();
    }
    generateContentHash(content) {
        return (0, crypto_1.createHash)('sha256').update(content).digest('hex');
    }
    countWords(content) {
        return content.split(/\s+/).filter(word => word.length > 0).length;
    }
    async hasContentChanged(url, contentHash) {
        try {
            const existingDocument = await this.prisma.aggregatedDocument.findFirst({
                where: { url },
                orderBy: { createdAt: 'desc' },
                select: { contentHash: true },
            });
            return !existingDocument || existingDocument.contentHash !== contentHash;
        }
        catch (error) {
            logger_1.logger.error('Error checking content changes:', error);
            return true;
        }
    }
    parseLastModified(lastModified) {
        if (!lastModified)
            return undefined;
        try {
            return new Date(lastModified);
        }
        catch {
            return undefined;
        }
    }
    async saveDocumentResult(website, result) {
        try {
            if (result.errorMessage) {
                await this.prisma.crawlError.create({
                    data: {
                        url: result.url,
                        websiteName: website.name,
                        errorMessage: result.errorMessage,
                        timestamp: new Date(),
                    },
                });
                return;
            }
            if (!result.hasChanged) {
                await this.prisma.aggregatedDocument.updateMany({
                    where: { url: result.url },
                    data: { lastChecked: new Date() },
                });
                return;
            }
            await this.prisma.aggregatedDocument.create({
                data: {
                    url: result.url,
                    websiteName: website.name,
                    documentType: this.getDocumentType(result.url, website),
                    title: result.title,
                    content: result.content,
                    contentHash: result.contentHash,
                    wordCount: result.wordCount,
                    lastModified: result.lastModified,
                    crawledAt: new Date(),
                    lastChecked: new Date(),
                    metadata: {
                        userAgent: this.userAgent,
                        selectors: website.selectors,
                        crawlVersion: '1.0',
                    },
                },
            });
            logger_1.logger.info(`Saved new document version: ${website.name} - ${result.url}`);
        }
        catch (error) {
            logger_1.logger.error('Error saving document result:', error);
        }
    }
    getDocumentType(url, website) {
        if (url === website.termsUrl)
            return 'terms_of_service';
        if (url === website.privacyUrl)
            return 'privacy_policy';
        if (url === website.cookieUrl)
            return 'cookie_policy';
        return 'unknown';
    }
    async saveCrawlStats(stats) {
        try {
            await this.prisma.crawlSession.create({
                data: {
                    startTime: stats.startTime,
                    endTime: stats.endTime,
                    duration: stats.duration,
                    totalSites: stats.totalSites,
                    successfulCrawls: stats.successfulCrawls,
                    failedCrawls: stats.failedCrawls,
                    documentsChanged: stats.documentsChanged,
                    newDocuments: stats.newDocuments,
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Error saving crawl stats:', error);
        }
    }
    getStatus() {
        return {
            isRunning: this.isRunning,
            rateLimitDelay: this.rateLimitDelay,
            timeout: this.timeout,
            maxRetries: this.maxRetries,
        };
    }
    async crawlSpecificWebsite(websiteName) {
        const website = website_targets_1.WebsiteTargets.getTarget(websiteName);
        if (!website) {
            throw new Error(`Website not found: ${websiteName}`);
        }
        return await this.crawlWebsite(website);
    }
    async getRecentStats(limit = 10) {
        try {
            return await this.prisma.crawlSession.findMany({
                orderBy: { startTime: 'desc' },
                take: limit,
            });
        }
        catch (error) {
            logger_1.logger.error('Error fetching crawl stats:', error);
            return [];
        }
    }
    async getWebsiteDocuments(websiteName, limit = 50) {
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
                    lastModified: true,
                    wordCount: true,
                    contentHash: true,
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Error fetching website documents:', error);
            return [];
        }
    }
}
exports.WebsiteCrawlerService = WebsiteCrawlerService;
//# sourceMappingURL=website-crawler.js.map