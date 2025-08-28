"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.performanceThresholds = exports.qualityRules = exports.templateRepoConfig = exports.integrationUrls = exports.aiConfig = exports.loggerConfig = exports.redisConfig = exports.databaseConfig = exports.serviceConfig = exports.agentConfig = exports.env = void 0;
const zod_1 = require("zod");
const types_1 = require("@/types");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.coerce.number().default(3000),
    DATABASE_URL: zod_1.z.string().url(),
    REDIS_URL: zod_1.z.string().url(),
    OLLAMA_BASE_URL: zod_1.z.string().url().default('http://localhost:11434'),
    OPENAI_API_KEY: zod_1.z.string().optional(),
    DSPY_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3001'),
    LORA_SERVICE_URL: zod_1.z.string().url().default('http://localhost:3002'),
    KNOWLEDGE_GRAPH_URL: zod_1.z.string().url().default('http://localhost:3003'),
    JWT_SECRET: zod_1.z.string().min(32),
    ENCRYPTION_KEY: zod_1.z.string().min(32),
    GITHUB_TOKEN: zod_1.z.string().optional(),
    GITHUB_ORG: zod_1.z.string().optional(),
    METRICS_ENABLED: zod_1.z.coerce.boolean().default(true),
    LOG_LEVEL: zod_1.z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    MAX_CONCURRENT_GENERATIONS: zod_1.z.coerce.number().default(10),
    CACHE_SIZE: zod_1.z.coerce.number().default(1000),
    MEMORY_LIMIT: zod_1.z.coerce.number().default(512),
    CPU_LIMIT: zod_1.z.coerce.number().default(1),
    RATE_LIMIT_PER_MINUTE: zod_1.z.coerce.number().default(100),
    TEMPLATE_REPO_URL: zod_1.z.string().url().default('https://github.com/fineprintai/templates.git'),
    TEMPLATE_UPDATE_INTERVAL: zod_1.z.coerce.number().default(3600),
});
const parseEnv = () => {
    try {
        return envSchema.parse(process.env);
    }
    catch (error) {
        console.error('❌ Invalid environment variables:', error);
        process.exit(1);
    }
};
exports.env = parseEnv();
exports.agentConfig = {
    generation: {
        defaultLanguage: 'typescript',
        defaultFramework: 'react',
        enableAIEnhancement: true,
        maxFileSize: 100 * 1024,
        maxFilesPerGeneration: 50,
        templateCacheSize: 100,
    },
    architecture: {
        decisionCacheTime: 3600 * 1000,
        enablePredictiveAnalysis: true,
        defaultScalabilityLevel: 'medium',
        considerCostInDecisions: true,
    },
    quality: {
        enabledChecks: [
            types_1.QualityCheckType.SYNTAX,
            types_1.QualityCheckType.FORMATTING,
            types_1.QualityCheckType.SECURITY,
            types_1.QualityCheckType.PERFORMANCE,
            types_1.QualityCheckType.ACCESSIBILITY,
            types_1.QualityCheckType.BEST_PRACTICES,
            types_1.QualityCheckType.TESTING,
            types_1.QualityCheckType.DOCUMENTATION,
        ],
        minimumScore: 80,
        enableAutoFix: true,
        customRules: [],
    },
    integrations: {
        enabledIntegrations: [
            types_1.IntegrationType.DSPY,
            types_1.IntegrationType.LORA,
            types_1.IntegrationType.KNOWLEDGE_GRAPH,
            types_1.IntegrationType.GIT,
            types_1.IntegrationType.CI_CD,
            types_1.IntegrationType.MONITORING,
        ],
        syncInterval: 300,
        retryAttempts: 3,
        timeoutSeconds: 30,
    },
    templates: {
        repositoryUrl: exports.env.TEMPLATE_REPO_URL,
        updateInterval: exports.env.TEMPLATE_UPDATE_INTERVAL,
        enableCustomTemplates: true,
        maxTemplateSize: 10 * 1024 * 1024,
    },
    security: {
        enableSecurityScanning: true,
        allowedDomains: [
            'localhost',
            '*.fineprintai.com',
            'github.com',
            'api.openai.com',
        ],
        encryptionKey: exports.env.ENCRYPTION_KEY,
        rateLimitPerMinute: exports.env.RATE_LIMIT_PER_MINUTE,
    },
    performance: {
        maxConcurrentGenerations: exports.env.MAX_CONCURRENT_GENERATIONS,
        cacheSize: exports.env.CACHE_SIZE,
        memoryLimit: exports.env.MEMORY_LIMIT,
        cpuLimit: exports.env.CPU_LIMIT,
    },
};
exports.serviceConfig = {
    name: 'fullstack-agent',
    version: '1.0.0',
    description: 'Autonomous Full-Stack Development Agent for Fine Print AI',
    port: exports.env.PORT,
    host: '0.0.0.0',
    apiPrefix: '/api/v1',
    docs: {
        enabled: exports.env.NODE_ENV !== 'production',
        path: '/docs',
    },
    cors: {
        enabled: true,
        origins: [
            'http://localhost:3000',
            'http://localhost:5173',
            'https://*.fineprintai.com',
        ],
    },
    rateLimit: {
        enabled: true,
        max: exports.env.RATE_LIMIT_PER_MINUTE,
        timeWindow: 60 * 1000,
    },
    monitoring: {
        enabled: exports.env.METRICS_ENABLED,
        metricsPath: '/metrics',
        healthPath: '/health',
    },
};
exports.databaseConfig = {
    url: exports.env.DATABASE_URL,
    pool: {
        min: 2,
        max: 10,
    },
    ssl: exports.env.NODE_ENV === 'production',
    logging: exports.env.NODE_ENV === 'development',
};
exports.redisConfig = {
    url: exports.env.REDIS_URL,
    keyPrefix: 'fullstack-agent:',
    ttl: 3600,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
};
exports.loggerConfig = {
    level: exports.env.LOG_LEVEL,
    prettyPrint: exports.env.NODE_ENV === 'development',
    redactPaths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'config.security.encryptionKey',
        'config.integrations.*.credentials',
    ],
};
exports.aiConfig = {
    ollama: {
        baseUrl: exports.env.OLLAMA_BASE_URL,
        models: {
            codeGeneration: 'codellama:7b',
            architectureDecisions: 'mixtral:8x7b',
            qualityAssessment: 'phi:2.7b',
        },
        timeout: 30000,
        maxTokens: 4096,
    },
    ...(exports.env.OPENAI_API_KEY && {
        openai: {
            apiKey: exports.env.OPENAI_API_KEY,
            model: 'gpt-4-turbo-preview',
            maxTokens: 4096,
        },
    }),
};
exports.integrationUrls = {
    dspy: exports.env.DSPY_SERVICE_URL,
    lora: exports.env.LORA_SERVICE_URL,
    knowledgeGraph: exports.env.KNOWLEDGE_GRAPH_URL,
};
exports.templateRepoConfig = {
    url: exports.env.TEMPLATE_REPO_URL,
    branch: 'main',
    localPath: './templates',
    updateInterval: exports.env.TEMPLATE_UPDATE_INTERVAL,
    githubToken: exports.env.GITHUB_TOKEN,
};
exports.qualityRules = {
    typescript: {
        eslintConfig: {
            extends: [
                '@typescript-eslint/recommended',
                '@typescript-eslint/recommended-requiring-type-checking',
            ],
            rules: {
                '@typescript-eslint/no-unused-vars': 'error',
                '@typescript-eslint/explicit-function-return-type': 'warn',
                '@typescript-eslint/no-explicit-any': 'warn',
                'complexity': ['error', 10],
                'max-lines': ['error', 500],
                'max-depth': ['error', 4],
            },
        },
        prettierConfig: {
            semi: true,
            trailingComma: 'es5',
            singleQuote: true,
            printWidth: 100,
            tabWidth: 2,
        },
    },
    react: {
        eslintConfig: {
            extends: [
                'plugin:react/recommended',
                'plugin:react-hooks/recommended',
                'plugin:jsx-a11y/recommended',
            ],
            rules: {
                'react/prop-types': 'off',
                'react/react-in-jsx-scope': 'off',
                'jsx-a11y/anchor-is-valid': 'off',
            },
        },
    },
    security: {
        enabledRules: [
            'no-eval',
            'no-implied-eval',
            'no-new-func',
            'no-script-url',
            'detect-unsafe-regex',
            'detect-buffer-noassert',
            'detect-child-process',
            'detect-disable-mustache-escape',
            'detect-eval-with-expression',
            'detect-no-csrf-before-method-override',
            'detect-non-literal-fs-filename',
            'detect-non-literal-regexp',
            'detect-non-literal-require',
            'detect-possible-timing-attacks',
            'detect-pseudoRandomBytes',
        ],
    },
};
exports.performanceThresholds = {
    api: {
        responseTime: 500,
        errorRate: 0.01,
        throughput: 1000,
    },
    codeGeneration: {
        maxExecutionTime: 30000,
        maxMemoryUsage: 256 * 1024 * 1024,
        maxFileSize: 100 * 1024,
    },
    qualityCheck: {
        maxExecutionTime: 10000,
        maxComplexity: 10,
        minTestCoverage: 80,
    },
};
exports.config = {
    env: exports.env,
    agent: exports.agentConfig,
    service: exports.serviceConfig,
    database: exports.databaseConfig,
    redis: exports.redisConfig,
    logger: exports.loggerConfig,
    ai: exports.aiConfig,
    integrations: exports.integrationUrls,
    templates: exports.templateRepoConfig,
    quality: exports.qualityRules,
    performance: exports.performanceThresholds,
};
//# sourceMappingURL=index.js.map