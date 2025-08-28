import { PrismaClient } from '@prisma/client';
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
export declare class WebsiteCrawlerService {
    private prisma;
    private isRunning;
    private crawlInterval;
    private userAgent;
    private rateLimitDelay;
    private maxRetries;
    private timeout;
    constructor(prisma: PrismaClient);
    startPeriodicCrawling(): Promise<void>;
    stop(): Promise<void>;
    crawlAllWebsites(): Promise<CrawlStats>;
    crawlWebsite(website: any): Promise<CrawlResult[]>;
    private crawlDocument;
    private fetchDocument;
    private extractContent;
    private cleanContent;
    private generateContentHash;
    private countWords;
    private hasContentChanged;
    private parseLastModified;
    private saveDocumentResult;
    private getDocumentType;
    private saveCrawlStats;
    getStatus(): any;
    crawlSpecificWebsite(websiteName: string): Promise<CrawlResult[]>;
    getRecentStats(limit?: number): Promise<any[]>;
    getWebsiteDocuments(websiteName: string, limit?: number): Promise<any[]>;
}
//# sourceMappingURL=website-crawler.d.ts.map