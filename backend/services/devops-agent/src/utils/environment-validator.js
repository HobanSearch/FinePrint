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
exports.validateEnvironment = validateEnvironment;
const logger_1 = require("./logger");
const config_1 = require("@/config");
const child_process_1 = require("child_process");
const fs = __importStar(require("fs-extra"));
const logger = (0, logger_1.createContextLogger)('Environment-Validator');
async function validateEnvironment() {
    logger.info('Validating environment configuration...');
    const result = await performValidation();
    if (result.warnings.length > 0) {
        logger.warn('Environment validation warnings:');
        result.warnings.forEach(warning => logger.warn(`  - ${warning}`));
    }
    if (!result.valid) {
        logger.error('Environment validation failed:');
        result.errors.forEach(error => logger.error(`  - ${error}`));
        throw new Error('Environment validation failed');
    }
    logger.info('Environment validation completed successfully');
}
async function performValidation() {
    const errors = [];
    const warnings = [];
    validateRequiredEnvironmentVariables(errors);
    await validateSystemDependencies(errors, warnings);
    validateCloudProviderConfigurations(errors, warnings);
    await validateKubernetesConfiguration(errors, warnings);
    await validateFileSystemPermissions(errors, warnings);
    await validateNetworkConnectivity(errors, warnings);
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
function validateRequiredEnvironmentVariables(errors) {
    const requiredVars = [
        'JWT_SECRET',
        'DATABASE_URL',
    ];
    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            errors.push(`Required environment variable missing: ${varName}`);
        }
    }
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
        errors.push('JWT_SECRET must be at least 32 characters long');
    }
    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgresql://')) {
        errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
    }
}
async function validateSystemDependencies(errors, warnings) {
    const dependencies = [
        { name: 'docker', command: 'docker --version', required: true },
        { name: 'kubectl', command: 'kubectl version --client', required: false },
        { name: 'helm', command: 'helm version', required: false },
        { name: 'terraform', command: 'terraform version', required: false },
        { name: 'git', command: 'git --version', required: true },
    ];
    for (const dep of dependencies) {
        try {
            await executeCommand(dep.command);
            logger.debug(`✓ ${dep.name} is available`);
        }
        catch (error) {
            const message = `${dep.name} is not available or not properly configured`;
            if (dep.required) {
                errors.push(message);
            }
            else {
                warnings.push(message);
            }
        }
    }
}
function validateCloudProviderConfigurations(errors, warnings) {
    if (config_1.config.cloud.aws.accessKeyId && !config_1.config.cloud.aws.secretAccessKey) {
        errors.push('AWS_SECRET_ACCESS_KEY is required when AWS_ACCESS_KEY_ID is provided');
    }
    if (config_1.config.cloud.gcp.credentialsPath && !fs.existsSync(config_1.config.cloud.gcp.credentialsPath)) {
        errors.push(`Google Cloud credentials file not found: ${config_1.config.cloud.gcp.credentialsPath}`);
    }
    const azureVars = [config_1.config.cloud.azure.clientId, config_1.config.cloud.azure.clientSecret, config_1.config.cloud.azure.tenantId];
    const azureConfigured = azureVars.filter(Boolean).length;
    if (azureConfigured > 0 && azureConfigured < 3) {
        errors.push('Azure configuration requires all three: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID');
    }
    const hasAws = config_1.config.cloud.aws.accessKeyId && config_1.config.cloud.aws.secretAccessKey;
    const hasGcp = config_1.config.cloud.gcp.credentialsPath;
    const hasAzure = azureConfigured === 3;
    if (!hasAws && !hasGcp && !hasAzure) {
        warnings.push('No cloud provider credentials configured - some features may be limited');
    }
}
async function validateKubernetesConfiguration(errors, warnings) {
    if (config_1.config.kubernetes.configPath) {
        if (!fs.existsSync(config_1.config.kubernetes.configPath)) {
            errors.push(`Kubernetes config file not found: ${config_1.config.kubernetes.configPath}`);
        }
    }
    try {
        await executeCommand('kubectl cluster-info');
        logger.debug('✓ Kubernetes cluster is accessible');
    }
    catch (error) {
        warnings.push('Kubernetes cluster is not accessible - Kubernetes features will be limited');
    }
}
async function validateFileSystemPermissions(errors, warnings) {
    const directories = [
        './workspace',
        './logs',
        './tmp',
    ];
    for (const dir of directories) {
        try {
            await fs.ensureDir(dir);
            await fs.access(dir, fs.constants.R_OK | fs.constants.W_OK);
            logger.debug(`✓ Directory ${dir} is accessible`);
        }
        catch (error) {
            errors.push(`Cannot access directory ${dir}: ${error.message}`);
        }
    }
}
async function validateNetworkConnectivity(errors, warnings) {
    const endpoints = [
        { name: 'Redis', url: config_1.config.redis.url },
        { name: 'Prometheus', url: config_1.config.monitoring.prometheusUrl },
        { name: 'Grafana', url: config_1.config.monitoring.grafanaUrl },
    ];
    for (const endpoint of endpoints) {
        try {
            logger.debug(`Checking connectivity to ${endpoint.name}...`);
        }
        catch (error) {
            warnings.push(`Cannot connect to ${endpoint.name} at ${endpoint.url}`);
        }
    }
}
function executeCommand(command) {
    return new Promise((resolve, reject) => {
        const [cmd, ...args] = command.split(' ');
        const child = (0, child_process_1.spawn)(cmd, args, { stdio: 'pipe' });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            }
            else {
                reject(new Error(stderr || `Command failed with exit code ${code}`));
            }
        });
        child.on('error', (error) => {
            reject(error);
        });
    });
}
//# sourceMappingURL=environment-validator.js.map