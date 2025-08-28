"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IaCEngine = void 0;
const events_1 = require("events");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const uuid_1 = require("uuid");
const logger_1 = require("@/utils/logger");
const terraform_generator_1 = require("./terraform-generator");
const pulumi_generator_1 = require("./pulumi-generator");
const cloudformation_generator_1 = require("./cloudformation-generator");
const resource_validator_1 = require("./resource-validator");
const state_manager_1 = require("./state-manager");
const drift_detector_1 = require("./drift-detector");
const logger = (0, logger_1.createContextLogger)('IaC-Engine');
class IaCEngine extends events_1.EventEmitter {
    workspaceDir;
    terraformGenerator;
    pulumiGenerator;
    cloudFormationGenerator;
    resourceValidator;
    stateManager;
    driftDetector;
    deployments = new Map();
    activeProcesses = new Map();
    constructor() {
        super();
        this.workspaceDir = path.join(__dirname, '../../../workspace');
        this.terraformGenerator = new terraform_generator_1.TerraformGenerator();
        this.pulumiGenerator = new pulumi_generator_1.PulumiGenerator();
        this.cloudFormationGenerator = new cloudformation_generator_1.CloudFormationGenerator();
        this.resourceValidator = new resource_validator_1.ResourceValidator();
        this.stateManager = new state_manager_1.StateManager();
        this.driftDetector = new drift_detector_1.DriftDetector();
        this.initializeWorkspace();
        this.startDriftDetection();
    }
    async initializeWorkspace() {
        try {
            await fs.ensureDir(this.workspaceDir);
            await fs.ensureDir(path.join(this.workspaceDir, 'terraform'));
            await fs.ensureDir(path.join(this.workspaceDir, 'pulumi'));
            await fs.ensureDir(path.join(this.workspaceDir, 'cloudformation'));
            await fs.ensureDir(path.join(this.workspaceDir, 'templates'));
            await fs.ensureDir(path.join(this.workspaceDir, 'state'));
            logger.info('IaC workspace initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize IaC workspace:', error);
            throw error;
        }
    }
    async createDeployment(name, template, variables = {}, options = {}) {
        const deploymentId = (0, uuid_1.v4)();
        logger.info(`Creating deployment: ${name} (${deploymentId})`);
        try {
            await this.resourceValidator.validateTemplate(template);
            await this.resourceValidator.validateVariables(template, variables);
            const deployment = {
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
            const codeGenerator = this.selectCodeGenerator(deployment.provider);
            const generatedCode = await codeGenerator.generate(template, variables);
            const deploymentDir = path.join(this.workspaceDir, deployment.provider, deploymentId);
            await fs.ensureDir(deploymentDir);
            await this.writeGeneratedCode(deploymentDir, generatedCode);
            deployment.status = 'planning';
            deployment.updatedAt = new Date();
            if (!options.dryRun) {
                this.executeDeployment(deployment, options.autoApprove || false);
            }
            this.emit('deploymentCreated', deployment);
            return deployment;
        }
        catch (error) {
            logger.error(`Failed to create deployment ${name}:`, error);
            throw error;
        }
    }
    async executeDeployment(deployment, autoApprove = false) {
        const deploymentDir = path.join(this.workspaceDir, deployment.provider, deployment.id);
        try {
            await this.initializeProvider(deployment.provider, deploymentDir);
            const planResult = await this.planDeployment(deployment.provider, deploymentDir);
            deployment.resources = this.parsePlanOutput(planResult);
            deployment.status = 'planning';
            deployment.updatedAt = new Date();
            this.emit('deploymentPlanned', deployment);
            if (autoApprove || await this.waitForApproval(deployment.id)) {
                deployment.status = 'applying';
                deployment.updatedAt = new Date();
                this.emit('deploymentApplying', deployment);
                const applyResult = await this.applyDeployment(deployment.provider, deploymentDir);
                deployment.resources = this.parseApplyOutput(applyResult);
                deployment.status = 'completed';
                deployment.updatedAt = new Date();
                await this.stateManager.saveState(deployment.id, applyResult.state);
                this.emit('deploymentCompleted', deployment);
                logger.info(`Deployment ${deployment.name} completed successfully`);
            }
        }
        catch (error) {
            deployment.status = 'failed';
            deployment.updatedAt = new Date();
            deployment.metadata.error = error.message;
            this.emit('deploymentFailed', deployment, error);
            logger.error(`Deployment ${deployment.name} failed:`, error);
            throw error;
        }
    }
    async initializeProvider(provider, workingDir) {
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
                break;
            default:
                throw new Error(`Unsupported provider: ${provider}`);
        }
    }
    async planDeployment(provider, workingDir) {
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
    async applyDeployment(provider, workingDir) {
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
    async destroyDeployment(deploymentId) {
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
            await fs.remove(deploymentDir);
            await this.stateManager.removeState(deploymentId);
            this.deployments.delete(deploymentId);
            this.emit('deploymentDestroyed', deployment);
            logger.info(`Deployment ${deployment.name} destroyed successfully`);
        }
        catch (error) {
            deployment.status = 'failed';
            deployment.updatedAt = new Date();
            deployment.metadata.error = error.message;
            this.emit('deploymentFailed', deployment, error);
            logger.error(`Failed to destroy deployment ${deployment.name}:`, error);
            throw error;
        }
    }
    getDeployment(deploymentId) {
        return this.deployments.get(deploymentId);
    }
    listDeployments() {
        return Array.from(this.deployments.values());
    }
    async detectDrift(deploymentId) {
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
        }
        catch (error) {
            logger.error(`Failed to detect drift for deployment ${deployment.name}:`, error);
            throw error;
        }
    }
    startDriftDetection() {
        setInterval(async () => {
            for (const deployment of this.deployments.values()) {
                if (deployment.status === 'completed') {
                    try {
                        await this.detectDrift(deployment.id);
                    }
                    catch (error) {
                        logger.error(`Drift detection failed for ${deployment.name}:`, error);
                    }
                }
            }
        }, 30 * 60 * 1000);
    }
    detectProvider(template) {
        if (template.provider) {
            return template.provider;
        }
        return 'terraform';
    }
    detectCloudProvider(template) {
        const resourceTypes = template.resources.map(r => r.type);
        const hasAws = resourceTypes.some(type => type.startsWith('aws_'));
        const hasGcp = resourceTypes.some(type => type.startsWith('google_'));
        const hasAzure = resourceTypes.some(type => type.startsWith('azurerm_'));
        const cloudCount = [hasAws, hasGcp, hasAzure].filter(Boolean).length;
        if (cloudCount > 1)
            return 'multi-cloud';
        if (hasAws)
            return 'aws';
        if (hasGcp)
            return 'gcp';
        if (hasAzure)
            return 'azure';
        return 'aws';
    }
    selectCodeGenerator(provider) {
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
    async writeGeneratedCode(dir, code) {
        for (const [filename, content] of Object.entries(code)) {
            await fs.writeFile(path.join(dir, filename), content);
        }
    }
    async executeCommand(command, args, workingDir) {
        return new Promise((resolve, reject) => {
            const process = (0, child_process_1.spawn)(command, args, {
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
                }
                else {
                    reject(new Error(`Command failed with exit code ${exitCode}: ${stderr}`));
                }
            });
            process.on('error', (error) => {
                reject(error);
            });
        });
    }
    parsePlanOutput(planResult) {
        return [];
    }
    parseApplyOutput(applyResult) {
        return [];
    }
    async waitForApproval(deploymentId) {
        return true;
    }
    async getActualState(deployment) {
        return {};
    }
}
exports.IaCEngine = IaCEngine;
//# sourceMappingURL=iac-engine.js.map