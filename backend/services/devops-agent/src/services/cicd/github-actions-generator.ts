/**
 * GitHub Actions Pipeline Generator
 * 
 * Generates GitHub Actions workflow files with advanced CI/CD features
 */

import * as yaml from 'js-yaml';
import { Pipeline, PipelineStage } from './pipeline-engine';
import { createContextLogger } from '@/utils/logger';

const logger = createContextLogger('GitHubActionsGenerator');

export class GitHubActionsGenerator {
  
  /**
   * Generate GitHub Actions workflow
   */
  async generate(pipeline: Pipeline): Promise<Record<string, string>> {
    logger.info(`Generating GitHub Actions workflow for: ${pipeline.name}`);

    const files: Record<string, string> = {};

    // Main workflow file
    files['.github/workflows/ci-cd.yml'] = await this.generateMainWorkflow(pipeline);

    // Reusable workflows
    files['.github/workflows/build.yml'] = await this.generateBuildWorkflow(pipeline);
    files['.github/workflows/test.yml'] = await this.generateTestWorkflow(pipeline);
    files['.github/workflows/security.yml'] = await this.generateSecurityWorkflow(pipeline);
    files['.github/workflows/deploy.yml'] = await this.generateDeployWorkflow(pipeline);

    // Action composites
    files['.github/actions/setup-environment/action.yml'] = await this.generateSetupAction();
    files['.github/actions/build-and-test/action.yml'] = await this.generateBuildTestAction();
    files['.github/actions/security-scan/action.yml'] = await this.generateSecurityScanAction();
    files['.github/actions/deploy/action.yml'] = await this.generateDeployAction();

    return files;
  }

  /**
   * Generate main CI/CD workflow
   */
  private async generateMainWorkflow(pipeline: Pipeline): Promise<string> {
    const workflow = {
      name: `${pipeline.name} CI/CD`,
      
      on: this.generateTriggers(pipeline),
      
      env: this.generateEnvironmentVariables(pipeline),
      
      concurrency: {
        group: '${{ github.workflow }}-${{ github.ref }}',
        'cancel-in-progress': true,
      },
      
      jobs: await this.generateJobs(pipeline),
    };

    return yaml.dump(workflow, { 
      lineWidth: -1,
      noRefs: true,
    });
  }

  /**
   * Generate workflow triggers
   */
  private generateTriggers(pipeline: Pipeline): any {
    const triggers: any = {};

    for (const trigger of pipeline.configuration.triggers) {
      switch (trigger.type) {
        case 'push':
          triggers.push = {
            branches: trigger.conditions.branches || [pipeline.branch],
            paths: trigger.conditions.paths,
            'paths-ignore': trigger.conditions.pathsIgnore,
          };
          break;
          
        case 'pull_request':
          triggers.pull_request = {
            branches: trigger.conditions.branches || [pipeline.branch],
            types: trigger.conditions.types || ['opened', 'synchronize', 'reopened'],
          };
          break;
          
        case 'schedule':
          triggers.schedule = [
            { cron: trigger.conditions.cron }
          ];
          break;
          
        case 'manual':
          triggers.workflow_dispatch = {
            inputs: trigger.conditions.inputs || {},
          };
          break;
      }
    }

    return triggers;
  }

  /**
   * Generate environment variables
   */
  private generateEnvironmentVariables(pipeline: Pipeline): Record<string, string> {
    return {
      NODE_VERSION: '20',
      REGISTRY: 'ghcr.io',
      IMAGE_NAME: '${{ github.repository }}',
      DOCKER_BUILDKIT: '1',
      COMPOSE_DOCKER_CLI_BUILD: '1',
    };
  }

  /**
   * Generate workflow jobs
   */
  private async generateJobs(pipeline: Pipeline): Promise<Record<string, any>> {
    const jobs: Record<string, any> = {};

    // Build job
    jobs.build = {
      name: 'Build & Test',
      'runs-on': 'ubuntu-latest',
      timeout: 30,
      
      strategy: this.generateBuildStrategy(pipeline),
      
      steps: [
        {
          name: 'Checkout code',
          uses: 'actions/checkout@v4',
          with: {
            'fetch-depth': 0,
          },
        },
        {
          name: 'Setup environment',
          uses: './.github/actions/setup-environment',
          with: {
            'node-version': '${{ env.NODE_VERSION }}',
          },
        },
        {
          name: 'Cache dependencies',
          uses: 'actions/cache@v3',
          with: {
            path: this.generateCachePaths(pipeline),
            key: '${{ runner.os }}-deps-${{ hashFiles(\'**/package-lock.json\') }}',
            'restore-keys': [
              '${{ runner.os }}-deps-',
            ],
          },
        },
        {
          name: 'Install dependencies',
          run: 'npm ci',
        },
        {
          name: 'Lint code',
          run: 'npm run lint',
        },
        {
          name: 'Build application',
          run: 'npm run build',
        },
        {
          name: 'Run unit tests',
          run: 'npm run test:unit',
          if: pipeline.configuration.testing.unit.enabled,
        },
        {
          name: 'Run integration tests',
          run: 'npm run test:integration',
          if: pipeline.configuration.testing.integration.enabled,
        },
        {
          name: 'Generate test coverage',
          run: 'npm run test:coverage',
          if: pipeline.configuration.testing.coverage.enabled,
        },
        {
          name: 'Upload coverage reports',
          uses: 'codecov/codecov-action@v3',
          if: pipeline.configuration.testing.coverage.enabled,
          with: {
            file: './coverage/lcov.info',
            flags: 'unittests',
            name: 'codecov-umbrella',
          },
        },
        {
          name: 'Build Docker image',
          run: 'docker build -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} .',
        },
        {
          name: 'Upload build artifacts',
          uses: 'actions/upload-artifact@v3',
          with: {
            name: 'build-artifacts',
            path: |
              dist/
              coverage/
            retention: 30,
          },
        },
      ],
      
      outputs: {
        'image-tag': '${{ github.sha }}',
        'build-version': '${{ steps.version.outputs.version }}',
      },
    };

    // Security scanning job
    if (pipeline.configuration.security.enabled) {
      jobs.security = {
        name: 'Security Scan',
        'runs-on': 'ubuntu-latest',
        needs: ['build'],
        timeout: 20,
        
        steps: [
          {
            name: 'Checkout code',
            uses: 'actions/checkout@v4',
          },
          {
            name: 'Security scan',
            uses: './.github/actions/security-scan',
            with: {
              'scan-types': pipeline.configuration.security.scanTypes.join(','),
              'fail-on-high': pipeline.configuration.security.failOnHighSeverity,
            },
          },
          {
            name: 'Upload security results',
            uses: 'github/codeql-action/upload-sarif@v2',
            if: 'always()',
            with: {
              'sarif_file': 'security-results.sarif',
            },
          },
        ],
      };
    }

    // E2E testing job
    if (pipeline.configuration.testing.e2e.enabled) {
      jobs.e2e = {
        name: 'E2E Tests',
        'runs-on': 'ubuntu-latest',
        needs: ['build'],
        timeout: 45,
        
        services: {
          postgres: {
            image: 'postgres:15',
            env: {
              POSTGRES_PASSWORD: 'postgres',
            },
            options: '--health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5',
          },
          redis: {
            image: 'redis:7',
            options: '--health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5',
          },
        },
        
        steps: [
          {
            name: 'Checkout code',
            uses: 'actions/checkout@v4',
          },
          {
            name: 'Setup environment',
            uses: './.github/actions/setup-environment',
          },
          {
            name: 'Start application',
            run: 'docker-compose up -d',
          },
          {
            name: 'Wait for services',
            run: 'timeout 300 bash -c "until curl -f http://localhost:3000/health; do sleep 5; done"',
          },
          {
            name: 'Run E2E tests',
            run: 'npm run test:e2e',
          },
          {
            name: 'Upload test results',
            uses: 'actions/upload-artifact@v3',
            if: 'always()',
            with: {
              name: 'e2e-results',
              path: 'e2e-results/',
            },
          },
        ],
      };
    }

    // Deployment jobs for each environment
    for (const env of pipeline.configuration.environments) {
      const jobName = `deploy-${env.name}`;
      const needsJobs = ['build'];
      
      if (pipeline.configuration.security.enabled) {
        needsJobs.push('security');
      }
      
      if (env.type === 'production') {
        needsJobs.push('deploy-staging');
      }

      jobs[jobName] = {
        name: `Deploy to ${env.name}`,
        'runs-on': 'ubuntu-latest',
        needs: needsJobs,
        timeout: 30,
        environment: {
          name: env.name,
          url: `https://${env.name}.fineprintai.com`,
        },
        
        if: this.generateDeploymentCondition(env),
        
        steps: [
          {
            name: 'Checkout code',
            uses: 'actions/checkout@v4',
          },
          {
            name: 'Setup kubectl',
            uses: 'azure/setup-kubectl@v3',
            with: {
              version: 'latest',
            },
          },
          {
            name: 'Setup Helm',
            uses: 'azure/setup-helm@v3',
            with: {
              version: 'latest',
            },
          },
          {
            name: 'Configure AWS credentials',
            uses: 'aws-actions/configure-aws-credentials@v4',
            with: {
              'aws-access-key-id': '${{ secrets.AWS_ACCESS_KEY_ID }}',
              'aws-secret-access-key': '${{ secrets.AWS_SECRET_ACCESS_KEY }}',
              'aws-region': '${{ secrets.AWS_REGION }}',
            },
          },
          {
            name: 'Login to container registry',
            run: 'aws ecr get-login-password --region ${{ secrets.AWS_REGION }} | docker login --username AWS --password-stdin ${{ env.REGISTRY }}',
          },
          {
            name: 'Deploy to Kubernetes',
            uses: './.github/actions/deploy',
            with: {
              environment: env.name,
              'image-tag': '${{ needs.build.outputs.image-tag }}',
              namespace: env.namespace,
              'deployment-strategy': pipeline.configuration.deploymentStrategy.type,
            },
          },
          {
            name: 'Run health checks',
            run: this.generateHealthCheckCommand(env),
          },
          {
            name: 'Run smoke tests',
            run: 'npm run test:smoke',
            env: {
              TEST_URL: `https://${env.name}.fineprintai.com`,
            },
          },
        ],
      };

      // Add manual approval for production
      if (env.type === 'production' && env.approvers) {
        jobs[jobName].environment.approvers = env.approvers;
      }
    }

    return jobs;
  }

  /**
   * Generate build strategy matrix
   */
  private generateBuildStrategy(pipeline: Pipeline): any {
    if (!pipeline.configuration.parallelization.enabled) {
      return undefined;
    }

    return {
      matrix: pipeline.configuration.parallelization.matrix,
      'fail-fast': false,
      'max-parallel': pipeline.configuration.parallelization.maxJobs,
    };
  }

  /**
   * Generate cache paths
   */
  private generateCachePaths(pipeline: Pipeline): string[] {
    const paths = [
      '~/.npm',
      'node_modules',
    ];

    if (pipeline.configuration.caching.enabled) {
      paths.push(...pipeline.configuration.caching.paths);
    }

    return paths;
  }

  /**
   * Generate deployment condition
   */
  private generateDeploymentCondition(env: any): string {
    switch (env.type) {
      case 'development':
        return "github.ref == 'refs/heads/develop'";
      case 'staging':
        return "github.ref == 'refs/heads/main'";
      case 'production':
        return "startsWith(github.ref, 'refs/tags/v')";
      default:
        return "github.ref == 'refs/heads/main'";
    }
  }

  /**
   * Generate health check command
   */
  private generateHealthCheckCommand(env: any): string {
    return `
      timeout 300 bash -c "
        until curl -f https://${env.name}.fineprintai.com/health; do
          echo 'Waiting for service to be healthy...'
          sleep 10
        done
      "
    `;
  }

  /**
   * Generate build workflow
   */
  private async generateBuildWorkflow(pipeline: Pipeline): Promise<string> {
    const workflow = {
      name: 'Reusable Build Workflow',
      
      on: {
        workflow_call: {
          inputs: {
            'node-version': {
              required: false,
              type: 'string',
              default: '20',
            },
          },
          outputs: {
            'image-tag': {
              description: 'Built image tag',
              value: '${{ jobs.build.outputs.image-tag }}',
            },
          },
        },
      },
      
      jobs: {
        build: {
          'runs-on': 'ubuntu-latest',
          steps: [
            // Build steps would go here
          ],
        },
      },
    };

    return yaml.dump(workflow, { lineWidth: -1, noRefs: true });
  }

  /**
   * Generate test workflow
   */
  private async generateTestWorkflow(pipeline: Pipeline): Promise<string> {
    const workflow = {
      name: 'Reusable Test Workflow',
      
      on: {
        workflow_call: {
          inputs: {
            'test-type': {
              required: true,
              type: 'string',
            },
          },
        },
      },
      
      jobs: {
        test: {
          'runs-on': 'ubuntu-latest',
          steps: [
            // Test steps would go here
          ],
        },
      },
    };

    return yaml.dump(workflow, { lineWidth: -1, noRefs: true });
  }

  /**
   * Generate security workflow
   */
  private async generateSecurityWorkflow(pipeline: Pipeline): Promise<string> {
    const workflow = {
      name: 'Security Scanning',
      
      on: {
        workflow_call: {
          inputs: {
            'scan-types': {
              required: true,
              type: 'string',
            },
          },
        },
      },
      
      jobs: {
        security: {
          'runs-on': 'ubuntu-latest',
          steps: [
            // Security scanning steps would go here
          ],
        },
      },
    };

    return yaml.dump(workflow, { lineWidth: -1, noRefs: true });
  }

  /**
   * Generate deployment workflow
   */
  private async generateDeployWorkflow(pipeline: Pipeline): Promise<string> {
    const workflow = {
      name: 'Deployment Workflow',
      
      on: {
        workflow_call: {
          inputs: {
            environment: {
              required: true,
              type: 'string',
            },
            'image-tag': {
              required: true,
              type: 'string',
            },
          },
        },
      },
      
      jobs: {
        deploy: {
          'runs-on': 'ubuntu-latest',
          steps: [
            // Deployment steps would go here
          ],
        },
      },
    };

    return yaml.dump(workflow, { lineWidth: -1, noRefs: true });
  }

  /**
   * Generate composite actions
   */
  private async generateSetupAction(): Promise<string> {
    const action = {
      name: 'Setup Environment',
      description: 'Setup Node.js and install dependencies',
      
      inputs: {
        'node-version': {
          description: 'Node.js version',
          required: false,
          default: '20',
        },
      },
      
      runs: {
        using: 'composite',
        steps: [
          {
            name: 'Setup Node.js',
            uses: 'actions/setup-node@v4',
            with: {
              'node-version': '${{ inputs.node-version }}',
              cache: 'npm',
            },
          },
          {
            name: 'Install dependencies',
            run: 'npm ci',
            shell: 'bash',
          },
        ],
      },
    };

    return yaml.dump(action, { lineWidth: -1, noRefs: true });
  }

  private async generateBuildTestAction(): Promise<string> {
    // Implementation for build and test composite action
    return yaml.dump({}, { lineWidth: -1, noRefs: true });
  }

  private async generateSecurityScanAction(): Promise<string> {
    // Implementation for security scan composite action
    return yaml.dump({}, { lineWidth: -1, noRefs: true });
  }

  private async generateDeployAction(): Promise<string> {
    // Implementation for deployment composite action
    return yaml.dump({}, { lineWidth: -1, noRefs: true });
  }
}