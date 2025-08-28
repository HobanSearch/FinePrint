"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.salesAgentPlugin = void 0;
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const client_1 = require("@prisma/client");
const ioredis_1 = __importDefault(require("ioredis"));
const bullmq_1 = require("bullmq");
const config_1 = require("../config");
exports.salesAgentPlugin = (0, fastify_plugin_1.default)(async (fastify) => {
    const prisma = new client_1.PrismaClient({
        log: config_1.config.nodeEnv === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    });
    const redis = new ioredis_1.default(config_1.config.redisUrl, {
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
    });
    const queuesConfig = {
        connection: {
            host: new URL(config_1.config.redisUrl).hostname,
            port: parseInt(new URL(config_1.config.redisUrl).port || '6379'),
            password: new URL(config_1.config.redisUrl).password || undefined,
        },
        defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 2000,
            },
        },
    };
    const queues = {
        leadProcessing: new bullmq_1.Queue(`${config_1.config.queuePrefix}:lead-processing`, queuesConfig),
        emailAutomation: new bullmq_1.Queue(`${config_1.config.queuePrefix}:email-automation`, queuesConfig),
        crmSync: new bullmq_1.Queue(`${config_1.config.queuePrefix}:crm-sync`, queuesConfig),
        forecasting: new bullmq_1.Queue(`${config_1.config.queuePrefix}:forecasting`, queuesConfig),
    };
    fastify.decorate('prisma', prisma);
    fastify.decorate('redis', redis);
    fastify.decorate('queues', queues);
    fastify.addHook('onReady', async () => {
        try {
            await prisma.$connect();
            fastify.log.info('Database connected successfully');
        }
        catch (error) {
            fastify.log.error(error, 'Failed to connect to database');
            throw error;
        }
        try {
            await redis.ping();
            fastify.log.info('Redis connected successfully');
        }
        catch (error) {
            fastify.log.error(error, 'Failed to connect to Redis');
            throw error;
        }
    });
    fastify.addHook('onClose', async () => {
        await prisma.$disconnect();
        await redis.quit();
        await Promise.all([
            queues.leadProcessing.close(),
            queues.emailAutomation.close(),
            queues.crmSync.close(),
            queues.forecasting.close(),
        ]);
    });
});
//# sourceMappingURL=index.js.map