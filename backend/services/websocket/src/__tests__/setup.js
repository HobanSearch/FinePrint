"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
globals_1.jest.mock('@fineprintai/shared-logger', () => ({
    createServiceLogger: globals_1.jest.fn(() => ({
        info: globals_1.jest.fn(),
        warn: globals_1.jest.fn(),
        error: globals_1.jest.fn(),
        debug: globals_1.jest.fn(),
        cacheHit: globals_1.jest.fn(),
        cacheMiss: globals_1.jest.fn(),
    })),
}));
globals_1.jest.mock('@fineprintai/shared-cache', () => ({
    cache: {
        get: globals_1.jest.fn(),
        set: globals_1.jest.fn(),
        del: globals_1.jest.fn(),
        exists: globals_1.jest.fn(),
        expire: globals_1.jest.fn(),
        ttl: globals_1.jest.fn(),
        increment: globals_1.jest.fn(),
        decrement: globals_1.jest.fn(),
        keys: globals_1.jest.fn(),
        publish: globals_1.jest.fn(),
        lpush: globals_1.jest.fn(),
        rpush: globals_1.jest.fn(),
        lpop: globals_1.jest.fn(),
        rpop: globals_1.jest.fn(),
        lrange: globals_1.jest.fn(),
        disconnect: globals_1.jest.fn(),
        ping: globals_1.jest.fn(),
    },
}));
globals_1.jest.mock('@fineprintai/shared-config', () => ({
    config: {
        NODE_ENV: 'test',
        services: {
            websocket: {
                name: 'websocket-service',
                version: '1.0.0',
                port: 8080,
            },
        },
        websocket: {
            path: '/socket.io',
            maxConnections: 1000,
            heartbeat: {
                interval: 25000,
                timeout: 60000,
            },
        },
        redis: {
            url: 'redis://localhost:6379',
            host: 'localhost',
            port: 6379,
            maxRetriesPerRequest: 3,
            retryDelayOnFailover: 100,
            enableReadyCheck: true,
        },
        cors: {
            origins: ['http://localhost:3000'],
        },
        jwt: {
            secret: 'test-secret',
        },
        rateLimiting: {
            websocket: {
                max: 60,
                window: 60000,
            },
        },
    },
}));
globals_1.jest.mock('socket.io', () => ({
    Server: globals_1.jest.fn().mockImplementation(() => ({
        use: globals_1.jest.fn(),
        on: globals_1.jest.fn(),
        emit: globals_1.jest.fn(),
        to: globals_1.jest.fn(() => ({
            emit: globals_1.jest.fn(),
        })),
        adapter: globals_1.jest.fn(),
        disconnectSockets: globals_1.jest.fn(),
        close: globals_1.jest.fn(),
        sockets: {
            sockets: new Map(),
            adapter: {
                rooms: new Map(),
            },
        },
    })),
}));
globals_1.jest.mock('@socket.io/redis-adapter', () => ({
    createAdapter: globals_1.jest.fn(),
}));
globals_1.jest.mock('redis', () => ({
    createClient: globals_1.jest.fn(() => ({
        connect: globals_1.jest.fn(),
        disconnect: globals_1.jest.fn(),
        quit: globals_1.jest.fn(),
        ping: globals_1.jest.fn(),
        duplicate: globals_1.jest.fn(() => ({
            connect: globals_1.jest.fn(),
        })),
    })),
}));
globals_1.jest.mock('bull', () => {
    return globals_1.jest.fn().mockImplementation(() => ({
        add: globals_1.jest.fn(() => ({ id: 'job-123' })),
        process: globals_1.jest.fn(),
        getJobs: globals_1.jest.fn(() => []),
        getWaiting: globals_1.jest.fn(() => []),
        getActive: globals_1.jest.fn(() => []),
        getCompleted: globals_1.jest.fn(() => []),
        getFailed: globals_1.jest.fn(() => []),
        getDelayed: globals_1.jest.fn(() => []),
        isPaused: globals_1.jest.fn(() => false),
        close: globals_1.jest.fn(),
        on: globals_1.jest.fn(),
    }));
});
globals_1.jest.mock('jsonwebtoken', () => ({
    verify: globals_1.jest.fn(() => ({
        userId: 'test-user',
        email: 'test@example.com',
        name: 'Test User',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
    })),
    sign: globals_1.jest.fn(() => 'test-token'),
}));
beforeAll(() => {
    globals_1.jest.spyOn(console, 'log').mockImplementation(() => { });
    globals_1.jest.spyOn(console, 'warn').mockImplementation(() => { });
    globals_1.jest.spyOn(console, 'error').mockImplementation(() => { });
});
afterAll(() => {
    globals_1.jest.restoreAllMocks();
});
afterEach(() => {
    globals_1.jest.clearAllMocks();
});
//# sourceMappingURL=setup.js.map