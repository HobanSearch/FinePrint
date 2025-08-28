import { Template, TemplateCategory } from '@/types';
export interface TemplateSearchCriteria {
    type?: string;
    framework?: string;
    language?: string;
    category?: TemplateCategory;
    tags?: string[];
    minRating?: number;
}
export interface TemplateInstallOptions {
    force?: boolean;
    skipValidation?: boolean;
    customVariables?: Record<string, any>;
}
export declare class TemplateManager {
    private readonly logger;
    private readonly cache;
    private readonly templatesPath;
    private readonly repositoryPath;
    private templates;
    private lastUpdate;
    constructor();
    private initializeTemplates;
    findTemplates(criteria: TemplateSearchCriteria): Promise<Template[]>;
    getTemplate(id: string): Promise<Template | null>;
    createTemplate(templateData: Partial<Template>): Promise<Template>;
    updateTemplate(id: string, updates: Partial<Template>): Promise<Template>;
    deleteTemplate(id: string): Promise<void>;
    installTemplate(source: string, options?: TemplateInstallOptions): Promise<Template>;
    exportTemplate(id: string, format?: 'zip' | 'tar'): Promise<Buffer>;
    recordUsage(id: string): Promise<void>;
    addFeedback(id: string, userId: string, rating: number, comment: string): Promise<void>;
    updateTemplates(force?: boolean): Promise<void>;
    getStatistics(): {
        totalTemplates: number;
        categoryCounts: Record<TemplateCategory, number>;
        frameworkCounts: Record<string, number>;
        languageCounts: Record<string, number>;
        averageRating: number;
        totalUsage: number;
    };
    private loadTemplates;
    private loadTemplateFromFile;
    private loadTemplateFromDirectory;
    private validateTemplate;
    private saveTemplate;
    private getTemplatePath;
    private generateTemplateId;
    private shouldUpdate;
    private syncRepository;
    private downloadTemplate;
    private createZipArchive;
    private createTarArchive;
    private mergeVariables;
    private setupPeriodicUpdates;
    private directoryExists;
    private copyDirectory;
}
//# sourceMappingURL=template-manager.d.ts.map