import type { FastifyInstance } from 'fastify';
export declare function registerPlugins(fastify: FastifyInstance): Promise<void>;
declare module 'fastify' {
    interface FastifyRequest {
        startTime?: number;
    }
}
//# sourceMappingURL=plugins.d.ts.map