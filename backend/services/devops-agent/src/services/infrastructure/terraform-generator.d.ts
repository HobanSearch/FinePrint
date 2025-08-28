import { InfrastructureTemplate } from './iac-engine';
export declare class TerraformGenerator {
    generate(template: InfrastructureTemplate, variables?: Record<string, any>): Promise<Record<string, string>>;
    private generateMainConfig;
    private generateResource;
    private generateVariables;
    private generateOutputs;
    private generateTfVars;
    private generateVersions;
    private generateBackend;
    private generateLocals;
    private generateDataSources;
    private generateTags;
    private generateModules;
    private generateVpcModule;
    private formatValue;
    private mapVariableType;
    private isTaggableResource;
    private generateVpcModuleVariables;
    private generateVpcModuleOutputs;
    private generateEksModule;
    private generateEksModuleVariables;
    private generateEksModuleOutputs;
    private generateRdsModule;
    private generateRdsModuleVariables;
    private generateRdsModuleOutputs;
}
//# sourceMappingURL=terraform-generator.d.ts.map