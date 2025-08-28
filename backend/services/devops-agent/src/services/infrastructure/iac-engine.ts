/**
 * Infrastructure as Code (IaC) Automation Engine
 * 
 * Provides comprehensive infrastructure provisioning and management
 * capabilities using Terraform, Pulumi, and cloud-native tools.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { createContextLogger } from '@/utils/logger';
import { config } from '@/config';
import { TerraformGenerator } from './terraform-generator';
import { PulumiGenerator } from './pulumi-generator';
import { CloudFormationGenerator } from './cloudformation-generator';
import { ResourceValidator } from './resource-validator';
import { StateManager } from './state-manager';
import { DriftDetector } from './drift-detector';

const logger = createContextLogger('IaC-Engine');

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

export class IaCEngine extends EventEmitter {
  private readonly workspaceDir: string;
  private readonly terraformGenerator: TerraformGenerator;
  private readonly pulumiGenerator: PulumiGenerator;
  private readonly cloudFormationGenerator: CloudFormationGenerator;
  private readonly resourceValidator: ResourceValidator;
  private readonly stateManager: StateManager;
  private readonly driftDetector: DriftDetector;
  private readonly deployments: Map<string, IaCDeployment> = new Map();
  private readonly activeProcesses: Map<string, ChildProcess> = new Map();

  constructor() {
    super();
    this.workspaceDir = path.join(__dirname, '../../../workspace');
    this.terraformGenerator = new TerraformGenerator();
    this.pulumiGenerator = new PulumiGenerator();
    this.cloudFormationGenerator = new CloudFormationGenerator();
    this.resourceValidator = new ResourceValidator();
    this.stateManager = new StateManager();
    this.driftDetector = new DriftDetector();
    
    this.initializeWorkspace();
    this.startDriftDetection();
  }

  /**
   * Initialize workspace directory structure
   */
  private async initializeWorkspace(): Promise<void> {
    try {
      await fs.ensureDir(this.workspaceDir);
      await fs.ensureDir(path.join(this.workspaceDir, 'terraform'));
      await fs.ensureDir(path.join(this.workspaceDir, 'pulumi'));
      await fs.ensureDir(path.join(this.workspaceDir, 'cloudformation'));
      await fs.ensureDir(path.join(this.workspaceDir, 'templates'));
      await fs.ensureDir(path.join(this.workspaceDir, 'state'));
      
      logger.info('IaC workspace initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize IaC workspace:', error);
      throw error;
    }
  }

  /**
   * Create a new infrastructure deployment
   */
  async createDeployment(
    name: string,
    template: InfrastructureTemplate,
    variables: Record<string, any> = {},
    options: {
      environment?: string;
      dryRun?: boolean;
      autoApprove?: boolean;
    } = {}
  ): Promise<IaCDeployment> {
    const deploymentId = uuidv4();
    
    logger.info(`Creating deployment: ${name} (${deploymentId})`);

    try {
      // Validate template and variables
      await this.resourceValidator.validateTemplate(template);
      await this.resourceValidator.validateVariables(template, variables);

      // Create deployment record
      const deployment: IaCDeployment = {
        id: deploymentId,
        name,
        provider: this.detectProvider(template),
        cloudProvider: this.detectCloudProvider(template),
        environment: options.environment || 'default',
        status: 'pending',
        resources: [],
        configuration: {
          template,
          variables,
          options,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      };

      this.deployments.set(deploymentId, deployment);

      // Generate infrastructure code
      const codeGenerator = this.selectCodeGenerator(deployment.provider);
      const generatedCode = await codeGenerator.generate(template, variables);

      // Write generated code to workspace
      const deploymentDir = path.join(this.workspaceDir, deployment.provider, deploymentId);
      await fs.ensureDir(deploymentDir);
      await this.writeGeneratedCode(deploymentDir, generatedCode);

      // Update deployment status
      deployment.status = 'planning';
      deployment.updatedAt = new Date();

      // Start deployment process
      if (!options.dryRun) {
        this.executeDeployment(deployment, options.autoApprove || false);
      }

      this.emit('deploymentCreated', deployment);
      return deployment;

    } catch (error) {
      logger.error(`Failed to create deployment ${name}:`, error);
      throw error;
    }
  }

  /**
   * Execute infrastructure deployment
   */
  private async executeDeployment(
    deployment: IaCDeployment,
    autoApprove: boolean = false
  ): Promise<void> {
    const deploymentDir = path.join(this.workspaceDir, deployment.provider, deployment.id);

    try {
      // Initialize provider
      await this.initializeProvider(deployment.provider, deploymentDir);

      // Plan deployment
      const planResult = await this.planDeployment(deployment.provider, deploymentDir);
      
      deployment.resources = this.parsePlanOutput(planResult);
      deployment.status = 'planning';
      deployment.updatedAt = new Date();
      
      this.emit('deploymentPlanned', deployment);

      // Apply deployment if auto-approved or after manual approval
      if (autoApprove || await this.waitForApproval(deployment.id)) {
        deployment.status = 'applying';
        deployment.updatedAt = new Date();
        
        this.emit('deploymentApplying', deployment);

        const applyResult = await this.applyDeployment(deployment.provider, deploymentDir);
        
        deployment.resources = this.parseApplyOutput(applyResult);
        deployment.status = 'completed';
        deployment.updatedAt = new Date();
        
        // Store state
        await this.stateManager.saveState(deployment.id, applyResult.state);
        
        this.emit('deploymentCompleted', deployment);
        logger.info(`Deployment ${deployment.name} completed successfully`);
      }

    } catch (error) {
      deployment.status = 'failed';
      deployment.updatedAt = new Date();
      deployment.metadata.error = error.message;
      
      this.emit('deploymentFailed', deployment, error);
      logger.error(`Deployment ${deployment.name} failed:`, error);
      throw error;
    }
  }

  /**
   * Initialize provider (Terraform, Pulumi, etc.)
   */
  private async initializeProvider(provider: string, workingDir: string): Promise<void> {
    logger.info(`Initializing ${provider} in ${workingDir}`);

    switch (provider) {
      case 'terraform':
        await this.executeCommand('terraform', ['init'], workingDir);
        break;
      case 'pulumi':
        await this.executeCommand('pulumi', ['login', '--local'], workingDir);
        await this.executeCommand('pulumi', ['stack', 'init', 'dev'], workingDir);
        break;
      case 'cloudformation':
        // CloudFormation doesn't require initialization
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Plan infrastructure deployment
   */
  private async planDeployment(provider: string, workingDir: string): Promise<any> {
    logger.info(`Planning deployment with ${provider}`);

    switch (provider) {
      case 'terraform':
        return await this.executeCommand('terraform', ['plan', '-out=tfplan'], workingDir);
      case 'pulumi':
        return await this.executeCommand('pulumi', ['preview'], workingDir);
      case 'cloudformation':
        return await this.executeCommand('aws', ['cloudformation', 'validate-template'], workingDir);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Apply infrastructure deployment
   */
  private async applyDeployment(provider: string, workingDir: string): Promise<any> {
    logger.info(`Applying deployment with ${provider}`);

    switch (provider) {
      case 'terraform':
        const applyResult = await this.executeCommand('terraform', ['apply', 'tfplan'], workingDir);
        const stateResult = await this.executeCommand('terraform', ['show', '-json'], workingDir);
        return { ...applyResult, state: stateResult.stdout };
      case 'pulumi':
        return await this.executeCommand('pulumi', ['up', '--yes'], workingDir);
      case 'cloudformation':
        return await this.executeCommand('aws', ['cloudformation', 'deploy'], workingDir);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Destroy infrastructure deployment
   */
  async destroyDeployment(deploymentId: string): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    logger.info(`Destroying deployment: ${deployment.name}`);

    try {
      deployment.status = 'destroying';
      deployment.updatedAt = new Date();
      
      this.emit('deploymentDestroying', deployment);

      const deploymentDir = path.join(this.workspaceDir, deployment.provider, deploymentId);

      switch (deployment.provider) {
        case 'terraform':
          await this.executeCommand('terraform', ['destroy', '-auto-approve'], deploymentDir);
          break;
        case 'pulumi':
          await this.executeCommand('pulumi', ['destroy', '--yes'], deploymentDir);
          break;
        case 'cloudformation':
          await this.executeCommand('aws', ['cloudformation', 'delete-stack'], deploymentDir);
          break;
      }

      // Clean up workspace
      await fs.remove(deploymentDir);
      
      // Remove state
      await this.stateManager.removeState(deploymentId);
      
      // Remove from deployments map
      this.deployments.delete(deploymentId);
      
      this.emit('deploymentDestroyed', deployment);
      logger.info(`Deployment ${deployment.name} destroyed successfully`);

    } catch (error) {
      deployment.status = 'failed';
      deployment.updatedAt = new Date();
      deployment.metadata.error = error.message;
      
      this.emit('deploymentFailed', deployment, error);
      logger.error(`Failed to destroy deployment ${deployment.name}:`, error);
      throw error;
    }
  }

  /**
   * Get deployment status
   */
  getDeployment(deploymentId: string): IaCDeployment | undefined {
    return this.deployments.get(deploymentId);
  }

  /**
   * List all deployments
   */
  listDeployments(): IaCDeployment[] {
    return Array.from(this.deployments.values());
  }

  /**
   * Detect infrastructure drift
   */
  async detectDrift(deploymentId: string): Promise<any> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    logger.info(`Detecting drift for deployment: ${deployment.name}`);

    try {
      const currentState = await this.stateManager.getState(deploymentId);
      const actualState = await this.getActualState(deployment);
      
      const drift = await this.driftDetector.detectDrift(currentState, actualState);
      
      if (drift.hasDrift) {
        this.emit('driftDetected', deployment, drift);
        logger.warn(`Drift detected in deployment ${deployment.name}:`, drift);
      }

      return drift;

    } catch (error) {
      logger.error(`Failed to detect drift for deployment ${deployment.name}:`, error);
      throw error;
    }
  }

  /**
   * Start automated drift detection
   */
  private startDriftDetection(): void {
    setInterval(async () => {
      for (const deployment of this.deployments.values()) {
        if (deployment.status === 'completed') {
          try {
            await this.detectDrift(deployment.id);
          } catch (error) {
            logger.error(`Drift detection failed for ${deployment.name}:`, error);
          }
        }
      }
    }, 30 * 60 * 1000); // Check every 30 minutes
  }

  /**
   * Helper methods
   */
  private detectProvider(template: InfrastructureTemplate): 'terraform' | 'pulumi' | 'cloudformation' {
    // Logic to detect provider based on template structure
    if (template.provider) {
      return template.provider as 'terraform' | 'pulumi' | 'cloudformation';
    }
    
    // Default to terraform
    return 'terraform';
  }

  private detectCloudProvider(template: InfrastructureTemplate): 'aws' | 'gcp' | 'azure' | 'multi-cloud' {
    const resourceTypes = template.resources.map(r => r.type);
    
    const hasAws = resourceTypes.some(type => type.startsWith('aws_'));
    const hasGcp = resourceTypes.some(type => type.startsWith('google_'));
    const hasAzure = resourceTypes.some(type => type.startsWith('azurerm_'));
    
    const cloudCount = [hasAws, hasGcp, hasAzure].filter(Boolean).length;
    
    if (cloudCount > 1) return 'multi-cloud';
    if (hasAws) return 'aws';
    if (hasGcp) return 'gcp';
    if (hasAzure) return 'azure';
    
    return 'aws'; // Default
  }

  private selectCodeGenerator(provider: string) {
    switch (provider) {
      case 'terraform':
        return this.terraformGenerator;
      case 'pulumi':
        return this.pulumiGenerator;
      case 'cloudformation':
        return this.cloudFormationGenerator;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  private async writeGeneratedCode(dir: string, code: any): Promise<void> {
    for (const [filename, content] of Object.entries(code)) {
      await fs.writeFile(path.join(dir, filename), content as string);
    }
  }

  private async executeCommand(
    command: string,
    args: string[],
    workingDir: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        cwd: workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (exitCode) => {
        if (exitCode === 0) {
          resolve({ stdout, stderr, exitCode });
        } else {
          reject(new Error(`Command failed with exit code ${exitCode}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  private parsePlanOutput(planResult: any): IaCResource[] {
    // Parse plan output to extract resources
    // Implementation depends on the provider
    return [];
  }

  private parseApplyOutput(applyResult: any): IaCResource[] {
    // Parse apply output to extract resources
    // Implementation depends on the provider
    return [];
  }

  private async waitForApproval(deploymentId: string): Promise<boolean> {
    // Implementation for manual approval workflow
    // Could integrate with external approval systems
    return true;
  }

  private async getActualState(deployment: IaCDeployment): Promise<any> {
    // Get actual state from cloud provider
    // Implementation depends on the cloud provider
    return {};
  }
}