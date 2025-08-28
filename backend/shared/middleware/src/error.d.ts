import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
export declare const errorHandler: (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => any;
export declare const notFoundHandler: (request: FastifyRequest, reply: FastifyReply) => any;
export declare const createErrorResponse: (statusCode: number, errorCode: string, message: string, details?: any) => any;
export declare const asyncHandler: (fn: Function) => (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
export declare const setupErrorHandling: () => void;
//# sourceMappingURL=error.d.ts.map