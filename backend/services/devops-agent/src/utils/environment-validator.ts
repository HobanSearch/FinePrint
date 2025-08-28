/**
 * Environment Configuration Validator
 * Validates environment variables and system requirements
 */

import { createContextLogger } from './logger';
import { config } from '@/config';
import { spawn } from 'child_process';
import * as fs from 'fs-extra';

const logger = createContextLogger('Environment-Validator');

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateEnvironment(): Promise<void> {
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

async function performValidation(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate required environment variables
  validateRequiredEnvironmentVariables(errors);

  // Validate system dependencies
  await validateSystemDependencies(errors, warnings);

  // Validate cloud provider configurations
  validateCloudProviderConfigurations(errors, warnings);

  // Validate Kubernetes configuration
  await validateKubernetesConfiguration(errors, warnings);

  // Validate file system permissions
  await validateFileSystemPermissions(errors, warnings);

  // Validate network connectivity
  await validateNetworkConnectivity(errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateRequiredEnvironmentVariables(errors: string[]): void {
  const requiredVars = [
    'JWT_SECRET',
    'DATABASE_URL',
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Required environment variable missing: ${varName}`);
    }
  }

  // Validate JWT secret strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long');
  }

  // Validate database URL format
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgresql://')) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
  }
}

async function validateSystemDependencies(errors: string[], warnings: string[]): Promise<void> {
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
    } catch (error) {
      const message = `${dep.name} is not available or not properly configured`;
      if (dep.required) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  }
}

function validateCloudProviderConfigurations(errors: string[], warnings: string[]): void {
  // AWS Configuration
  if (config.cloud.aws.accessKeyId && !config.cloud.aws.secretAccessKey) {
    errors.push('AWS_SECRET_ACCESS_KEY is required when AWS_ACCESS_KEY_ID is provided');
  }

  // Google Cloud Configuration
  if (config.cloud.gcp.credentialsPath && !fs.existsSync(config.cloud.gcp.credentialsPath)) {
    errors.push(`Google Cloud credentials file not found: ${config.cloud.gcp.credentialsPath}`);
  }

  // Azure Configuration
  const azureVars = [config.cloud.azure.clientId, config.cloud.azure.clientSecret, config.cloud.azure.tenantId];
  const azureConfigured = azureVars.filter(Boolean).length;
  if (azureConfigured > 0 && azureConfigured < 3) {
    errors.push('Azure configuration requires all three: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID');
  }

  // Check if at least one cloud provider is configured
  const hasAws = config.cloud.aws.accessKeyId && config.cloud.aws.secretAccessKey;
  const hasGcp = config.cloud.gcp.credentialsPath;
  const hasAzure = azureConfigured === 3;

  if (!hasAws && !hasGcp && !hasAzure) {
    warnings.push('No cloud provider credentials configured - some features may be limited');
  }
}

async function validateKubernetesConfiguration(errors: string[], warnings: string[]): Promise<void> {
  if (config.kubernetes.configPath) {
    if (!fs.existsSync(config.kubernetes.configPath)) {
      errors.push(`Kubernetes config file not found: ${config.kubernetes.configPath}`);
    }
  }

  // Try to connect to Kubernetes cluster
  try {
    await executeCommand('kubectl cluster-info');
    logger.debug('✓ Kubernetes cluster is accessible');
  } catch (error) {
    warnings.push('Kubernetes cluster is not accessible - Kubernetes features will be limited');
  }
}

async function validateFileSystemPermissions(errors: string[], warnings: string[]): Promise<void> {
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
    } catch (error) {
      errors.push(`Cannot access directory ${dir}: ${error.message}`);
    }
  }
}

async function validateNetworkConnectivity(errors: string[], warnings: string[]): Promise<void> {
  const endpoints = [
    { name: 'Redis', url: config.redis.url },
    { name: 'Prometheus', url: config.monitoring.prometheusUrl },
    { name: 'Grafana', url: config.monitoring.grafanaUrl },
  ];

  for (const endpoint of endpoints) {
    try {
      // Simple connectivity check (in a real implementation, would use proper HTTP client)
      logger.debug(`Checking connectivity to ${endpoint.name}...`);
      // Placeholder for actual connectivity check
    } catch (error) {
      warnings.push(`Cannot connect to ${endpoint.name} at ${endpoint.url}`);
    }
  }
}

function executeCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(' ');
    const child = spawn(cmd, args, { stdio: 'pipe' });

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
      } else {
        reject(new Error(stderr || `Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}