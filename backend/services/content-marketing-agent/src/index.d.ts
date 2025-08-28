import { FastifyInstance } from 'fastify';
declare const fastify: FastifyInstance;
declare function buildApp(): Promise<FastifyInstance>;
declare function start(): Promise<void>;
export { buildApp, start };
export default fastify;
//# sourceMappingURL=index.d.ts.map