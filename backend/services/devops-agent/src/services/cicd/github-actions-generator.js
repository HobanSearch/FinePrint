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
exports.GitHubActionsGenerator = void 0;
const yaml = __importStar(require("js-yaml"));
const logger_1 = require("@/utils/logger");
const logger = (0, logger_1.createContextLogger)('GitHubActionsGenerator');
class GitHubActionsGenerator {
    async generate(pipeline) {
        logger.info(`Generating GitHub Actions workflow for: ${pipeline.name}`);
        const files = {};
        files['.github/workflows/ci-cd.yml'] = await this.generateMainWorkflow(pipeline);
        files['.github/workflows/build.yml'] = await this.generateBuildWorkflow(pipeline);
        files['.github/workflows/test.yml'] = await this.generateTestWorkflow(pipeline);
        files['.github/workflows/security.yml'] = await this.generateSecurityWorkflow(pipeline);
        files['.github/workflows/deploy.yml'] = await this.generateDeployWorkflow(pipeline);
        files['.github/actions/setup-environment/action.yml'] = await this.generateSetupAction();
        files['.github/actions/build-and-test/action.yml'] = await this.generateBuildTestAction();
        files['.github/actions/security-scan/action.yml'] = await this.generateSecurityScanAction();
        files['.github/actions/deploy/action.yml'] = await this.generateDeployAction();
        return files;
    }
    async generateMainWorkflow(pipeline) {
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
    generateTriggers(pipeline) {
        const triggers = {};
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
    generateEnvironmentVariables(pipeline) {
        return {
            NODE_VERSION: '20',
            REGISTRY: 'ghcr.io',
            IMAGE_NAME: '${{ github.repository }}',
            DOCKER_BUILDKIT: '1',
            COMPOSE_DOCKER_CLI_BUILD: '1',
        };
    }
    async generateJobs(pipeline) {
        const jobs = {};
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
                        path:  |
                            dist /
                                coverage /
                                retention, 30: ,
                    },
                },
            ],
            outputs: {
                'image-tag': '${{ github.sha }}',
                'build-version': '${{ steps.version.outputs.version }}',
            },
        };
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
            if (env.type === 'production' && env.approvers) {
                jobs[jobName].environment.approvers = env.approvers;
            }
        }
        return jobs;
    }
    generateBuildStrategy(pipeline) {
        if (!pipeline.configuration.parallelization.enabled) {
            return undefined;
        }
        return {
            matrix: pipeline.configuration.parallelization.matrix,
            'fail-fast': false,
            'max-parallel': pipeline.configuration.parallelization.maxJobs,
        };
    }
    generateCachePaths(pipeline) {
        const paths = [
            '~/.npm',
            'node_modules',
        ];
        if (pipeline.configuration.caching.enabled) {
            paths.push(...pipeline.configuration.caching.paths);
        }
        return paths;
    }
    generateDeploymentCondition(env) {
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
    generateHealthCheckCommand(env) {
        return `
      timeout 300 bash -c "
        until curl -f https://${env.name}.fineprintai.com/health; do
          echo 'Waiting for service to be healthy...'
          sleep 10
        done
      "
    `;
    }
    async generateBuildWorkflow(pipeline) {
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
                    steps: [],
                },
            },
        };
        return yaml.dump(workflow, { lineWidth: -1, noRefs: true });
    }
    async generateTestWorkflow(pipeline) {
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
                    steps: [],
                },
            },
        };
        return yaml.dump(workflow, { lineWidth: -1, noRefs: true });
    }
    async generateSecurityWorkflow(pipeline) {
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
                    steps: [],
                },
            },
        };
        return yaml.dump(workflow, { lineWidth: -1, noRefs: true });
    }
    async generateDeployWorkflow(pipeline) {
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
                    steps: [],
                },
            },
        };
        return yaml.dump(workflow, { lineWidth: -1, noRefs: true });
    }
    async generateSetupAction() {
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
    async generateBuildTestAction() {
        return yaml.dump({}, { lineWidth: -1, noRefs: true });
    }
    async generateSecurityScanAction() {
        return yaml.dump({}, { lineWidth: -1, noRefs: true });
    }
    async generateDeployAction() {
        return yaml.dump({}, { lineWidth: -1, noRefs: true });
    }
}
exports.GitHubActionsGenerator = GitHubActionsGenerator;
//# sourceMappingURL=github-actions-generator.js.map