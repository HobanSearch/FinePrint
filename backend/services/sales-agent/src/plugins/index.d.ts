import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
declare module 'fastify' {
    interface FastifyInstance {
        prisma: PrismaClient;
        redis: Redis;
        queues: {
            leadProcessing: Queue;
            emailAutomation: Queue;
            crmSync: Queue;
            forecasting: Queue;
        };
    }
}
export declare const salesAgentPlugin: FastifyPluginAsync;
//# sourceMappingURL=index.d.ts.map