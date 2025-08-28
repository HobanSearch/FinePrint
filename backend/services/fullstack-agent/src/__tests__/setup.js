"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
    process.env.REDIS_URL = 'redis://localhost:6379/1';
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
    process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    process.env.DSPY_SERVICE_URL = 'http://localhost:3001';
    process.env.LORA_SERVICE_URL = 'http://localhost:3002';
    process.env.KNOWLEDGE_GRAPH_URL = 'http://localhost:3003';
});
afterAll(async () => {
});
globals_1.jest.mock('axios', () => ({
    create: globals_1.jest.fn(() => ({
        get: globals_1.jest.fn(),
        post: globals_1.jest.fn(),
        put: globals_1.jest.fn(),
        delete: globals_1.jest.fn(),
        interceptors: {
            request: { use: globals_1.jest.fn() },
            response: { use: globals_1.jest.fn() },
        },
        defaults: {
            headers: {},
        },
    })),
    get: globals_1.jest.fn(),
    post: globals_1.jest.fn(),
    put: globals_1.jest.fn(),
    delete: globals_1.jest.fn(),
}));
globals_1.jest.mock('ioredis', () => {
    return globals_1.jest.fn().mockImplementation(() => ({
        get: globals_1.jest.fn(),
        set: globals_1.jest.fn(),
        setex: globals_1.jest.fn(),
        del: globals_1.jest.fn(),
        exists: globals_1.jest.fn(),
        keys: globals_1.jest.fn(),
        on: globals_1.jest.fn(),
        quit: globals_1.jest.fn(),
        status: 'ready',
    }));
});
globals_1.jest.mock('fs', () => ({
    promises: {
        readFile: globals_1.jest.fn(),
        writeFile: globals_1.jest.fn(),
        mkdir: globals_1.jest.fn(),
        readdir: globals_1.jest.fn(),
        stat: globals_1.jest.fn(),
        rm: globals_1.jest.fn(),
        copyFile: globals_1.jest.fn(),
    },
}));
global.testUtils = {
    createMockRequest: (overrides = {}) => ({
        body: {},
        params: {},
        query: {},
        headers: {},
        user: { id: 'test-user-id', email: 'test@example.com', role: 'user' },
        ip: '127.0.0.1',
        id: 'test-request-id',
        ...overrides,
    }),
    createMockReply: () => {
        const reply = {
            send: globals_1.jest.fn().mockReturnThis(),
            status: globals_1.jest.fn().mockReturnThis(),
            header: globals_1.jest.fn().mockReturnThis(),
        };
        return reply;
    },
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    mockImplementationOnce: (mock, implementation) => {
        mock.mockImplementationOnce(implementation);
    },
};
//# sourceMappingURL=setup.js.map