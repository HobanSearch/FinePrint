import { z } from 'zod';
import { AgentConfiguration, QualityCheckType, IntegrationType } from '@/types';

// Environment variables validation schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  
  // Database
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  
  // AI Services
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OPENAI_API_KEY: z.string().optional(),
  
  // Integration Services
  DSPY_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  LORA_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  KNOWLEDGE_GRAPH_URL: z.string().url().default('http://localhost:3003'),
  
  // Security
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  
  // External Services
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_ORG: z.string().optional(),
  
  // Monitoring
  METRICS_ENABLED: z.coerce.boolean().default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  
  // Performance
  MAX_CONCURRENT_GENERATIONS: z.coerce.number().default(10),
  CACHE_SIZE: z.coerce.number().default(1000),
  MEMORY_LIMIT: z.coerce.number().default(512), // MB
  CPU_LIMIT: z.coerce.number().default(1), // CPU cores
  
  // Rate Limiting
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(100),
  
  // Template Repository
  TEMPLATE_REPO_URL: z.string().url().default('https://github.com/fineprintai/templates.git'),
  TEMPLATE_UPDATE_INTERVAL: z.coerce.number().default(3600), // seconds
});

type Env = z.infer<typeof envSchema>;

// Validate environment variables
const parseEnv = (): Env => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Invalid environment variables:', error);
    process.exit(1);
  }
};

export const env = parseEnv();

// Agent Configuration
export const agentConfig: AgentConfiguration = {
  generation: {
    defaultLanguage: 'typescript',
    defaultFramework: 'react',
    enableAIEnhancement: true,
    maxFileSize: 100 * 1024, // 100KB
    maxFilesPerGeneration: 50,
    templateCacheSize: 100,
  },
  
  architecture: {
    decisionCacheTime: 3600 * 1000, // 1 hour
    enablePredictiveAnalysis: true,
    defaultScalabilityLevel: 'medium',
    considerCostInDecisions: true,
  },
  
  quality: {
    enabledChecks: [
      QualityCheckType.SYNTAX,
      QualityCheckType.FORMATTING,
      QualityCheckType.SECURITY,
      QualityCheckType.PERFORMANCE,
      QualityCheckType.ACCESSIBILITY,
      QualityCheckType.BEST_PRACTICES,
      QualityCheckType.TESTING,
      QualityCheckType.DOCUMENTATION,
    ],
    minimumScore: 80,
    enableAutoFix: true,
    customRules: [],
  },
  
  integrations: {
    enabledIntegrations: [
      IntegrationType.DSPY,
      IntegrationType.LORA,
      IntegrationType.KNOWLEDGE_GRAPH,
      IntegrationType.GIT,
      IntegrationType.CI_CD,
      IntegrationType.MONITORING,
    ],
    syncInterval: 300, // 5 minutes
    retryAttempts: 3,
    timeoutSeconds: 30,
  },
  
  templates: {
    repositoryUrl: env.TEMPLATE_REPO_URL,
    updateInterval: env.TEMPLATE_UPDATE_INTERVAL,
    enableCustomTemplates: true,
    maxTemplateSize: 10 * 1024 * 1024, // 10MB
  },
  
  security: {
    enableSecurityScanning: true,
    allowedDomains: [
      'localhost',
      '*.fineprintai.com',
      'github.com',
      'api.openai.com',
    ],
    encryptionKey: env.ENCRYPTION_KEY,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
  },
  
  performance: {
    maxConcurrentGenerations: env.MAX_CONCURRENT_GENERATIONS,
    cacheSize: env.CACHE_SIZE,
    memoryLimit: env.MEMORY_LIMIT,
    cpuLimit: env.CPU_LIMIT,
  },
};

// Service Configuration
export interface ServiceConfig {
  name: string;
  version: string;
  description: string;
  port: number;
  host: string;
  apiPrefix: string;
  docs: {
    enabled: boolean;
    path: string;
  };
  cors: {
    enabled: boolean;
    origins: string[];
  };
  rateLimit: {
    enabled: boolean;
    max: number;
    timeWindow: number;
  };
  monitoring: {
    enabled: boolean;
    metricsPath: string;
    healthPath: string;
  };
}

export const serviceConfig: ServiceConfig = {
  name: 'fullstack-agent',
  version: '1.0.0',
  description: 'Autonomous Full-Stack Development Agent for Fine Print AI',
  port: env.PORT,
  host: '0.0.0.0',
  apiPrefix: '/api/v1',
  docs: {
    enabled: env.NODE_ENV !== 'production',
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
    max: env.RATE_LIMIT_PER_MINUTE,
    timeWindow: 60 * 1000, // 1 minute
  },
  monitoring: {
    enabled: env.METRICS_ENABLED,
    metricsPath: '/metrics',
    healthPath: '/health',
  },
};

// Database Configuration
export interface DatabaseConfig {
  url: string;
  pool: {
    min: number;
    max: number;
  };
  ssl: boolean;
  logging: boolean;
}

export const databaseConfig: DatabaseConfig = {
  url: env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
  },
  ssl: env.NODE_ENV === 'production',
  logging: env.NODE_ENV === 'development',
};

// Redis Configuration
export interface RedisConfig {
  url: string;
  keyPrefix: string;
  ttl: number;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
}

export const redisConfig: RedisConfig = {
  url: env.REDIS_URL,
  keyPrefix: 'fullstack-agent:',
  ttl: 3600, // 1 hour
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
};

// Logger Configuration
export interface LoggerConfig {
  level: string;
  prettyPrint: boolean;
  redactPaths: string[];
}

export const loggerConfig: LoggerConfig = {
  level: env.LOG_LEVEL,
  prettyPrint: env.NODE_ENV === 'development',
  redactPaths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'config.security.encryptionKey',
    'config.integrations.*.credentials',
  ],
};

// AI Service Configuration
export interface AIConfig {
  ollama: {
    baseUrl: string;
    models: {
      codeGeneration: string;
      architectureDecisions: string;
      qualityAssessment: string;
    };
    timeout: number;
    maxTokens: number;
  };
  openai?: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };
}

export const aiConfig: AIConfig = {
  ollama: {
    baseUrl: env.OLLAMA_BASE_URL,
    models: {
      codeGeneration: 'codellama:7b',
      architectureDecisions: 'mixtral:8x7b',
      qualityAssessment: 'phi:2.7b',
    },
    timeout: 30000,
    maxTokens: 4096,
  },
  ...(env.OPENAI_API_KEY && {
    openai: {
      apiKey: env.OPENAI_API_KEY,
      model: 'gpt-4-turbo-preview',
      maxTokens: 4096,
    },
  }),
};

// Integration Service URLs
export const integrationUrls = {
  dspy: env.DSPY_SERVICE_URL,
  lora: env.LORA_SERVICE_URL,
  knowledgeGraph: env.KNOWLEDGE_GRAPH_URL,
};

// Template Configuration
export interface TemplateRepositoryConfig {
  url: string;
  branch: string;
  localPath: string;
  updateInterval: number;
  githubToken?: string;
}

export const templateRepoConfig: TemplateRepositoryConfig = {
  url: env.TEMPLATE_REPO_URL,
  branch: 'main',
  localPath: './templates',
  updateInterval: env.TEMPLATE_UPDATE_INTERVAL,
  githubToken: env.GITHUB_TOKEN,
};

// Quality Assurance Rules
export const qualityRules = {
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

// Performance Thresholds
export const performanceThresholds = {
  api: {
    responseTime: 500, // ms
    errorRate: 0.01, // 1%
    throughput: 1000, // requests per minute
  },
  
  codeGeneration: {
    maxExecutionTime: 30000, // 30 seconds
    maxMemoryUsage: 256 * 1024 * 1024, // 256MB
    maxFileSize: 100 * 1024, // 100KB
  },
  
  qualityCheck: {
    maxExecutionTime: 10000, // 10 seconds
    maxComplexity: 10,
    minTestCoverage: 80,
  },
};

// Export all configurations
export const config = {
  env,
  agent: agentConfig,
  service: serviceConfig,
  database: databaseConfig,
  redis: redisConfig,
  logger: loggerConfig,
  ai: aiConfig,
  integrations: integrationUrls,
  templates: templateRepoConfig,
  quality: qualityRules,
  performance: performanceThresholds,
} as const;