export declare const config: {
    readonly app: {
        readonly name: "devops-agent";
        readonly version: string;
        readonly environment: any;
    };
    readonly server: {
        readonly port: any;
        readonly host: any;
    };
    readonly database: {
        readonly url: any;
    };
    readonly redis: {
        readonly url: any;
    };
    readonly auth: {
        readonly jwtSecret: any;
        readonly jwtExpiresIn: any;
    };
    readonly cloud: {
        readonly aws: {
            readonly accessKeyId: any;
            readonly secretAccessKey: any;
            readonly region: any;
        };
        readonly gcp: {
            readonly credentialsPath: any;
            readonly projectId: any;
        };
        readonly azure: {
            readonly clientId: any;
            readonly clientSecret: any;
            readonly tenantId: any;
        };
    };
    readonly kubernetes: {
        readonly configPath: any;
        readonly namespace: any;
    };
    readonly git: {
        readonly githubToken: any;
        readonly gitlabToken: any;
    };
    readonly terraform: {
        readonly version: any;
        readonly backendBucket: any;
    };
    readonly monitoring: {
        readonly prometheusUrl: any;
        readonly grafanaUrl: any;
        readonly grafanaApiKey: any;
    };
    readonly notifications: {
        readonly slackWebhookUrl: any;
        readonly pagerDutyIntegrationKey: any;
        readonly sendGridApiKey: any;
    };
    readonly features: {
        readonly multiCloud: any;
        readonly costOptimization: any;
        readonly securityScanning: any;
        readonly backupAutomation: any;
    };
    readonly performance: {
        readonly maxConcurrentJobs: any;
        readonly jobTimeoutMinutes: any;
        readonly workerConcurrency: any;
    };
};
export type Config = typeof config;
//# sourceMappingURL=index.d.ts.map