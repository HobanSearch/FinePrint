"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
jest.mock('../utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        startTimer: jest.fn(),
        endTimer: jest.fn(),
        logRequest: jest.fn(),
        logDatabaseOperation: jest.fn(),
        logCrawlOperation: jest.fn(),
        logProcessingOperation: jest.fn(),
        logComplianceAlert: jest.fn(),
    },
}));
jest.setTimeout(30000);
afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
});
//# sourceMappingURL=setup.js.map