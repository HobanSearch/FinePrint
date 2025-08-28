import { AgentConfiguration } from '@/types';
export declare const env: z.infer<any>;
export declare const agentConfig: AgentConfiguration;
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
export declare const serviceConfig: ServiceConfig;
export interface DatabaseConfig {
    url: string;
    pool: {
        min: number;
        max: number;
    };
    ssl: boolean;
    logging: boolean;
}
export declare const databaseConfig: DatabaseConfig;
export interface RedisConfig {
    url: string;
    keyPrefix: string;
    ttl: number;
    maxRetriesPerRequest: number;
    retryDelayOnFailover: number;
}
export declare const redisConfig: RedisConfig;
export interface LoggerConfig {
    level: string;
    prettyPrint: boolean;
    redactPaths: string[];
}
export declare const loggerConfig: LoggerConfig;
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
export declare const aiConfig: AIConfig;
export declare const integrationUrls: {
    dspy: any;
    lora: any;
    knowledgeGraph: any;
};
export interface TemplateRepositoryConfig {
    url: string;
    branch: string;
    localPath: string;
    updateInterval: number;
    githubToken?: string;
}
export declare const templateRepoConfig: TemplateRepositoryConfig;
export declare const qualityRules: {
    typescript: {
        eslintConfig: {
            extends: string[];
            rules: {
                '@typescript-eslint/no-unused-vars': string;
                '@typescript-eslint/explicit-function-return-type': string;
                '@typescript-eslint/no-explicit-any': string;
                complexity: (string | number)[];
                'max-lines': (string | number)[];
                'max-depth': (string | number)[];
            };
        };
        prettierConfig: {
            semi: boolean;
            trailingComma: string;
            singleQuote: boolean;
            printWidth: number;
            tabWidth: number;
        };
    };
    react: {
        eslintConfig: {
            extends: string[];
            rules: {
                'react/prop-types': string;
                'react/react-in-jsx-scope': string;
                'jsx-a11y/anchor-is-valid': string;
            };
        };
    };
    security: {
        enabledRules: string[];
    };
};
export declare const performanceThresholds: {
    api: {
        responseTime: number;
        errorRate: number;
        throughput: number;
    };
    codeGeneration: {
        maxExecutionTime: number;
        maxMemoryUsage: number;
        maxFileSize: number;
    };
    qualityCheck: {
        maxExecutionTime: number;
        maxComplexity: number;
        minTestCoverage: number;
    };
};
export declare const config: {
    readonly env: z.infer<any>;
    readonly agent: AgentConfiguration;
    readonly service: ServiceConfig;
    readonly database: DatabaseConfig;
    readonly redis: RedisConfig;
    readonly logger: LoggerConfig;
    readonly ai: AIConfig;
    readonly integrations: {
        dspy: any;
        lora: any;
        knowledgeGraph: any;
    };
    readonly templates: TemplateRepositoryConfig;
    readonly quality: {
        typescript: {
            eslintConfig: {
                extends: string[];
                rules: {
                    '@typescript-eslint/no-unused-vars': string;
                    '@typescript-eslint/explicit-function-return-type': string;
                    '@typescript-eslint/no-explicit-any': string;
                    complexity: (string | number)[];
                    'max-lines': (string | number)[];
                    'max-depth': (string | number)[];
                };
            };
            prettierConfig: {
                semi: boolean;
                trailingComma: string;
                singleQuote: boolean;
                printWidth: number;
                tabWidth: number;
            };
        };
        react: {
            eslintConfig: {
                extends: string[];
                rules: {
                    'react/prop-types': string;
                    'react/react-in-jsx-scope': string;
                    'jsx-a11y/anchor-is-valid': string;
                };
            };
        };
        security: {
            enabledRules: string[];
        };
    };
    readonly performance: {
        api: {
            responseTime: number;
            errorRate: number;
            throughput: number;
        };
        codeGeneration: {
            maxExecutionTime: number;
            maxMemoryUsage: number;
            maxFileSize: number;
        };
        qualityCheck: {
            maxExecutionTime: number;
            maxComplexity: number;
            minTestCoverage: number;
        };
    };
};
//# sourceMappingURL=index.d.ts.map