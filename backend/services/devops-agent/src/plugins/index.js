"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPlugins = registerPlugins;
const logger_1 = require("@/utils/logger");
const config_1 = require("@/config");
const logger = (0, logger_1.createContextLogger)('Plugins');
async function registerPlugins(fastify) {
    logger.info('Registering Fastify plugins...');
    try {
        await fastify.register(require('@fastify/helmet'), {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
        });
        await fastify.register(require('@fastify/cors'), {
            origin: true,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
        });
        await fastify.register(require('@fastify/rate-limit'), {
            max: 100,
            timeWindow: '1 minute',
            skipOnError: true,
        });
        await fastify.register(require('@fastify/jwt'), {
            secret: config_1.config.auth.jwtSecret,
            sign: {
                expiresIn: config_1.config.auth.jwtExpiresIn,
            },
        });
        await fastify.register(require('@fastify/sensible'));
        fastify.addHook('onRequest', async (request, reply) => {
            logger.http(`${request.method} ${request.url} - ${request.ip}`);
        });
        fastify.addHook('preValidation', async (request, reply) => {
            const publicPaths = ['/health', '/docs', '/api/v1/webhooks'];
            const isPublicPath = publicPaths.some(path => request.url.startsWith(path));
            if (isPublicPath) {
                return;
            }
            try {
                await request.jwtVerify();
            }
            catch (error) {
                reply.code(401).send({
                    success: false,
                    error: 'Unauthorized',
                    message: 'Valid authentication token required',
                });
            }
        });
        fastify.setErrorHandler(async (error, request, reply) => {
            logger.error('Request error:', error);
            if (error.validation) {
                return reply.status(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Request validation failed',
                    details: error.validation,
                });
            }
            if (error.statusCode) {
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.name,
                    message: error.message,
                });
            }
            return reply.status(500).send({
                success: false,
                error: 'Internal Server Error',
                message: 'An unexpected error occurred',
            });
        });
        fastify.setNotFoundHandler(async (request, reply) => {
            return reply.status(404).send({
                success: false,
                error: 'Not Found',
                message: `Route ${request.method} ${request.url} not found`,
            });
        });
        logger.info('All plugins registered successfully');
    }
    catch (error) {
        logger.error('Failed to register plugins:', error);
        throw error;
    }
}
exports.default = registerPlugins;
//# sourceMappingURL=index.js.map