import { EventEmitter } from 'events';
export interface IaCDeployment {
    id: string;
    name: string;
    provider: 'terraform' | 'pulumi' | 'cloudformation';
    cloudProvider: 'aws' | 'gcp' | 'azure' | 'multi-cloud';
    environment: string;
    status: 'pending' | 'planning' | 'applying' | 'destroying' | 'completed' | 'failed';
    resources: IaCResource[];
    configuration: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
    metadata: Record<string, any>;
}
export interface IaCResource {
    id: string;
    name: string;
    type: string;
    provider: string;
    status: 'creating' | 'updating' | 'deleting' | 'active' | 'failed';
    properties: Record<string, any>;
    dependencies: string[];
    cost?: {
        monthly: number;
        currency: string;
    };
}
export interface InfrastructureTemplate {
    name: string;
    description: string;
    provider: string;
    resources: TemplateResource[];
    variables: TemplateVariable[];
    outputs: TemplateOutput[];
}
export interface TemplateResource {
    name: string;
    type: string;
    properties: Record<string, any>;
    dependencies?: string[];
}
export interface TemplateVariable {
    name: string;
    type: string;
    description: string;
    default?: any;
    required: boolean;
}
export interface TemplateOutput {
    name: string;
    description: string;
    value: string;
    sensitive?: boolean;
}
export declare class IaCEngine extends EventEmitter {
    private readonly workspaceDir;
    private readonly terraformGenerator;
    private readonly pulumiGenerator;
    private readonly cloudFormationGenerator;
    private readonly resourceValidator;
    private readonly stateManager;
    private readonly driftDetector;
    private readonly deployments;
    private readonly activeProcesses;
    constructor();
    private initializeWorkspace;
    createDeployment(name: string, template: InfrastructureTemplate, variables?: Record<string, any>, options?: {
        environment?: string;
        dryRun?: boolean;
        autoApprove?: boolean;
    }): Promise<IaCDeployment>;
    private executeDeployment;
    private initializeProvider;
    private planDeployment;
    private applyDeployment;
    destroyDeployment(deploymentId: string): Promise<void>;
    getDeployment(deploymentId: string): IaCDeployment | undefined;
    listDeployments(): IaCDeployment[];
    detectDrift(deploymentId: string): Promise<any>;
    private startDriftDetection;
    private detectProvider;
    private detectCloudProvider;
    private selectCodeGenerator;
    private writeGeneratedCode;
    private executeCommand;
    private parsePlanOutput;
    private parseApplyOutput;
    private waitForApproval;
    private getActualState;
}
//# sourceMappingURL=iac-engine.d.ts.map