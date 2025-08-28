import { Pipeline } from './pipeline-engine';
export declare class GitHubActionsGenerator {
    generate(pipeline: Pipeline): Promise<Record<string, string>>;
    private generateMainWorkflow;
    private generateTriggers;
    private generateEnvironmentVariables;
    private generateJobs;
    private generateBuildStrategy;
    private generateCachePaths;
    private generateDeploymentCondition;
    private generateHealthCheckCommand;
    private generateBuildWorkflow;
    private generateTestWorkflow;
    private generateSecurityWorkflow;
    private generateDeployWorkflow;
    private generateSetupAction;
    private generateBuildTestAction;
    private generateSecurityScanAction;
    private generateDeployAction;
}
//# sourceMappingURL=github-actions-generator.d.ts.map