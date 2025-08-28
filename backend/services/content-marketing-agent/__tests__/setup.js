"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
(0, globals_1.beforeAll)(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/fineprintai_test';
    process.env.REDIS_URL = 'redis://localhost:6379/1';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.SENDGRID_API_KEY = 'test-key';
    jest.mock('openai', () => ({
        OpenAI: jest.fn().mockImplementation(() => ({
            chat: {
                completions: {
                    create: jest.fn().mockResolvedValue({
                        choices: [{
                                message: {
                                    content: 'Test generated content'
                                }
                            }]
                    })
                }
            }
        }))
    }));
    jest.mock('ollama', () => ({
        Ollama: jest.fn().mockImplementation(() => ({
            generate: jest.fn().mockResolvedValue({
                response: 'Test generated content'
            })
        }))
    }));
    jest.mock('axios', () => ({
        get: jest.fn().mockResolvedValue({ data: 'mocked data' }),
        post: jest.fn().mockResolvedValue({ data: 'mocked data' }),
        put: jest.fn().mockResolvedValue({ data: 'mocked data' }),
        delete: jest.fn().mockResolvedValue({ data: 'mocked data' })
    }));
});
(0, globals_1.afterAll)(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
});
(0, globals_1.beforeEach)(() => {
    jest.clearAllMocks();
});
(0, globals_1.afterEach)(() => {
    jest.clearAllTimers();
});
expect.extend({
    toBeValidUUID(received) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const pass = uuidRegex.test(received);
        if (pass) {
            return {
                message: () => `expected ${received} not to be a valid UUID`,
                pass: true,
            };
        }
        else {
            return {
                message: () => `expected ${received} to be a valid UUID`,
                pass: false,
            };
        }
    },
    toBeValidEmail(received) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const pass = emailRegex.test(received);
        if (pass) {
            return {
                message: () => `expected ${received} not to be a valid email`,
                pass: true,
            };
        }
        else {
            return {
                message: () => `expected ${received} to be a valid email`,
                pass: false,
            };
        }
    },
    toHaveValidSEOScore(received) {
        const pass = received >= 0 && received <= 100;
        if (pass) {
            return {
                message: () => `expected ${received} not to be a valid SEO score (0-100)`,
                pass: true,
            };
        }
        else {
            return {
                message: () => `expected ${received} to be a valid SEO score (0-100)`,
                pass: false,
            };
        }
    }
});
//# sourceMappingURL=setup.js.map