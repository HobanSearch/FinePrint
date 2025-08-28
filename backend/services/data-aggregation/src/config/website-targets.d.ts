export interface WebsiteTarget {
    name: string;
    domain: string;
    category: string;
    termsUrl?: string;
    privacyUrl?: string;
    cookieUrl?: string;
    selectors?: {
        terms?: string;
        privacy?: string;
        cookie?: string;
    };
    crawlFrequency: 'daily' | 'weekly' | 'monthly';
    priority: 'high' | 'medium' | 'low';
    lastCrawled?: Date;
    isActive: boolean;
}
export declare class WebsiteTargets {
    private static targets;
    static getAllTargets(): WebsiteTarget[];
    static getTargetsByCategory(category: string): WebsiteTarget[];
    static getTargetsByPriority(priority: 'high' | 'medium' | 'low'): WebsiteTarget[];
    static getTarget(name: string): WebsiteTarget | null;
    static getTargetsDueForCrawling(): WebsiteTarget[];
    static updateLastCrawled(name: string): void;
    static getCategories(): string[];
    static getStatistics(): {
        total: number;
        active: number;
        byCategory: Record<string, number>;
        byPriority: Record<string, number>;
        byFrequency: Record<string, number>;
    };
    static addTarget(target: WebsiteTarget): void;
    static removeTarget(name: string): boolean;
    static deactivateTarget(name: string): boolean;
    static activateTarget(name: string): boolean;
}
//# sourceMappingURL=website-targets.d.ts.map