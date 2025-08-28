import type { DesignSystemEngine } from '../engines/design-system-engine.js';
import type { ComponentSpec, GeneratedComponent } from '../types/component-generation.js';
export declare class ComponentGenerator {
    private designSystemEngine;
    private templateCache;
    private generatedComponents;
    constructor(designSystemEngine: DesignSystemEngine);
    generateComponent(spec: ComponentSpec): Promise<GeneratedComponent>;
    generateVariant(baseComponentId: string, variantName: string, modifications: Record<string, any>): Promise<GeneratedComponent>;
    batchGenerate(specs: ComponentSpec[]): Promise<GeneratedComponent[]>;
    regenerateWithUpdatedTokens(componentId: string): Promise<GeneratedComponent>;
    private generateByFramework;
    private generateReactComponent;
    private generateVueComponent;
    private generateAngularComponent;
    private generateReactNativeComponent;
    private getTemplate;
    private loadTemplate;
    private generatePropsInterface;
    private generateComponentLogic;
    private generateStyles;
    private generateReactNativeStyles;
    private generateImports;
    private getDependencies;
    private populateTemplate;
    private getCurrentComponentName;
    private getTypeScriptType;
    private getVuePropType;
    private enhanceAccessibility;
    private applyResponsiveDesign;
    private generateTests;
    private generateDocumentation;
    private applyVariantModifications;
    private extractTokenReferences;
    private getUpdatedTokens;
    private replaceTokenValues;
    private generateAngularTemplate;
}
//# sourceMappingURL=component-generator.d.ts.map