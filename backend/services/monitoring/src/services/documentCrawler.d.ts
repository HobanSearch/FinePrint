import { CrawlerConfig, DocumentCrawlResult } from '@fineprintai/shared-types';
interface CrawlOptions extends CrawlerConfig {
    maxRedirects: number;
    enableJavaScript?: boolean;
    waitForSelector?: string;
    extractText?: boolean;
}
declare class DocumentCrawlerService {
    private httpClient;
    private browser;
    private robotsCache;
    private initialized;
    private readonly USER_AGENTS;
    constructor();
    initialize(): Promise<void>;
    crawlDocument(url: string, options?: Partial<CrawlOptions>): Promise<DocumentCrawlResult>;
    private performCrawl;
    private crawlWithAxios;
    private crawlWithPuppeteer;
    private extractTextContent;
    private generateContentHash;
    private checkRobotsTxt;
    crawlMultipleDocuments(urls: string[], options?: Partial<CrawlOptions>, concurrency?: number): Promise<DocumentCrawlResult[]>;
    private chunkArray;
    testUrl(url: string): Promise<{
        accessible: boolean;
        statusCode?: number;
        contentType?: string;
        responseTime: number;
        error?: string;
    }>;
    getPageMetadata(url: string): Promise<{
        title?: string;
        description?: string;
        keywords?: string;
        lastModified?: Date;
        contentLength?: number;
    }>;
    healthCheck(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare const documentCrawlerService: DocumentCrawlerService;
export {};
//# sourceMappingURL=documentCrawler.d.ts.map