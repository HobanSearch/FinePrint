import { FastifyInstance } from 'fastify';
declare module 'fastify' {
    interface FastifyRequest {
        user?: {
            id: string;
            email: string;
            role: string;
        };
    }
    interface FastifyInstance {
        authenticate: any;
        verifyJWT: any;
    }
}
declare function createServer(): Promise<FastifyInstance>;
declare function start(): Promise<void>;
export { createServer, start };
//# sourceMappingURL=index.d.ts.map