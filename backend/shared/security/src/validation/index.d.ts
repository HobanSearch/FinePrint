export * from './input-sanitizer';
export * from './zod-schemas';
export { z } from 'zod';
export * as Joi from 'joi';
import { FastifyRequest, FastifyReply } from 'fastify';
import { schemas } from './zod-schemas';
export declare const createValidationMiddleware: {
    body: <T>(schema: any) => (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    query: <T>(schema: any) => (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    params: <T>(schema: any) => (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    sanitize: (context?: "html" | "comment" | "minimal" | "none") => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
};
export declare const validationMiddleware: {
    login: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    register: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    forgotPassword: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    resetPassword: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    changePassword: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    createUser: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    updateUser: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    userProfile: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    uploadDocument: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    analyzeDocument: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    documentQuery: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    paginationQuery: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    idParam: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    bulkAction: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    fileUpload: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
    sanitizeHtml: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    sanitizeComment: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    sanitizeMinimal: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    sanitizeNone: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
};
export { schemas };
//# sourceMappingURL=index.d.ts.map