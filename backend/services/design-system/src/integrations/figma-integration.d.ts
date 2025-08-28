import { DatabaseClient } from '../utils/database.js';
import type { DesignSystemEngine } from '../engines/design-system-engine.js';
import type { FigmaComponent, DesignToken, ExtractedAsset, ComponentMapping, DesignSystemSync } from '../types/figma-integration.js';
export declare class FigmaIntegration {
    private designSystemEngine;
    private database?;
    private figmaApi;
    private isInitialized;
    private syncedFiles;
    private componentMappings;
    private webhookSecret;
    constructor(designSystemEngine: DesignSystemEngine, database?: DatabaseClient | undefined);
    initialize(): Promise<void>;
    healthCheck(): Promise<boolean>;
    extractFromFile(request: {
        fileKey: string;
        nodeIds?: string[];
        extractTokens?: boolean;
        extractComponents?: boolean;
        extractAssets?: boolean;
    }): Promise<{
        tokens: DesignToken[];
        components: FigmaComponent[];
        assets: ExtractedAsset[];
    }>;
    syncDesignSystem(fileKey: string): Promise<DesignSystemSync>;
    handleWebhook(payload: any, signature?: string): Promise<void>;
    createComponentMapping(figmaComponentKey: string, designSystemComponentId: string, mappingConfig: {
        propMappings?: Record<string, string>;
        styleMappings?: Record<string, string>;
        variantMappings?: Record<string, string>;
    }): Promise<ComponentMapping>;
    downloadAssets(fileKey: string, nodeIds: string[]): Promise<ExtractedAsset[]>;
    private validateConnection;
    private loadExistingMappings;
    private extractDesignTokens;
    private extractSpacingTokens;
    private extractComponents;
    private extractAssets;
    private findImageNodes;
    private categorizeComponent;
    private extractComponentProperties;
    private extractComponentStyles;
    private rgbaToHex;
    private syncComponentToDesignSystem;
    private processAsset;
    private saveSyncRecord;
    private handleFileUpdate;
    private handleFileDelete;
    private handleFileComment;
    private validateWebhookSignature;
}
//# sourceMappingURL=figma-integration.d.ts.map