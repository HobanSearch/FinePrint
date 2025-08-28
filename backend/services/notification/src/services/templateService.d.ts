export interface TemplateCreateRequest {
    name: string;
    type: 'email' | 'push' | 'webhook' | 'in_app';
    category: 'transactional' | 'marketing' | 'system';
    subject?: string;
    content: string;
    htmlContent?: string;
    variables?: Record<string, any>;
    isActive?: boolean;
}
export interface TemplateUpdateRequest {
    name?: string;
    subject?: string;
    content?: string;
    htmlContent?: string;
    variables?: Record<string, any>;
    isActive?: boolean;
}
export interface Template {
    id: string;
    name: string;
    type: string;
    category: string;
    subject?: string;
    content: string;
    htmlContent?: string;
    variables?: Record<string, any>;
    isActive: boolean;
    version: number;
    sentCount: number;
    openCount: number;
    clickCount: number;
    createdAt: Date;
    updatedAt: Date;
}
declare class TemplateService {
    private initialized;
    private compiledTemplates;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    createTemplate(data: TemplateCreateRequest): Promise<Template>;
    updateTemplate(templateId: string, updates: TemplateUpdateRequest): Promise<Template>;
    getTemplate(templateId: string): Promise<Template | null>;
    getTemplateByName(name: string): Promise<Template | null>;
    listTemplates(options?: {
        type?: string;
        category?: string;
        isActive?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<{
        templates: Template[];
        total: number;
    }>;
    deleteTemplate(templateId: string): Promise<void>;
    renderTemplate(templateId: string, data: Record<string, any>): Promise<{
        subject?: string;
        content: string;
        htmlContent?: string;
    }>;
    testTemplate(templateId: string, testData: Record<string, any>): Promise<{
        success: boolean;
        result?: {
            subject?: string;
            content: string;
            htmlContent?: string;
        };
        error?: string;
    }>;
    cloneTemplate(templateId: string, newName: string): Promise<Template>;
    getTemplateVariables(templateId: string): Promise<Record<string, any> | null>;
    updateTemplateVariables(templateId: string, variables: Record<string, any>): Promise<void>;
    getTemplateStats(templateId: string): Promise<{
        sentCount: number;
        openCount: number;
        clickCount: number;
        openRate: number;
        clickRate: number;
        lastUsed?: Date;
    }>;
    private validateTemplate;
    private isMJML;
    private mapTemplate;
    private cacheCompiledTemplate;
    private updateTemplateStats;
    private precompilePopularTemplates;
    private registerHandlebarsHelpers;
    bulkUpdateTemplates(templateIds: string[], updates: Partial<TemplateUpdateRequest>): Promise<number>;
    exportTemplates(templateIds?: string[]): Promise<Template[]>;
}
export declare const templateService: TemplateService;
export {};
//# sourceMappingURL=templateService.d.ts.map