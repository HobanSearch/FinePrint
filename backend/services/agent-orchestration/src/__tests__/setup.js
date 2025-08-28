"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-purposes-only';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_orchestration';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_DB = '1';
jest.setTimeout(30000);
jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined),
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        exists: jest.fn(),
        expire: jest.fn(),
        flushdb: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
    }));
});
jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({
        add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
        close: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        off: jest.fn(),
    })),
    Worker: jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        off: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
    })),
}));
jest.mock('axios', () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(() => ({
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    })),
}));
global.mockAgent = {
    id: 'test-agent-id',
    type: 'fullstack-agent',
    name: 'Test Agent',
    version: '1.0.0',
    capabilities: ['code_generation', 'testing'],
    endpoint: 'http://localhost:3001',
    healthCheckPath: '/health',
    priority: 5,
    maxConcurrentTasks: 10,
    timeout: 300000,
    retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelay: 1000,
    },
    dependencies: [],
    metadata: {},
};
global.mockWorkflow = {
    id: 'test-workflow-id',
    name: 'Test Workflow',
    description: 'A test workflow',
    version: '1.0.0',
    tags: ['test'],
    trigger: {
        type: 'manual',
        config: {},
    },
    tasks: [
        {
            id: 'test-task-1',
            name: 'Test Task 1',
            description: 'First test task',
            agentType: 'fullstack-agent',
            requiredCapabilities: ['code_generation'],
            inputSchema: {},
            outputSchema: {},
            timeout: 300000,
            retryPolicy: {
                maxRetries: 3,
                backoffMultiplier: 2,
                initialDelay: 1000,
            },
            dependencies: [],
            conditions: [],
            parallel: false,
            priority: 5,
            metadata: {},
        },
    ],
    globalTimeout: 3600000,
    maxConcurrentTasks: 10,
    errorHandling: {
        onFailure: 'stop',
        maxRetries: 3,
        notifyOnFailure: true,
    },
    variables: {},
    metadata: {},
};
afterEach(async () => {
    jest.clearAllMocks();
});
afterAll(async () => {
});
//# sourceMappingURL=setup.js.map