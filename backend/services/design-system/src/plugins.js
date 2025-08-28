import { logger } from './utils/logger.js';
export async function registerPlugins(fastify) {
    fastify.addHook('onRequest', async (request, reply) => {
        const start = Date.now();
        request.log = logger.child({
            requestId: generateRequestId(),
            method: request.method,
            url: request.url,
        });
        reply.log = request.log;
        request.startTime = start;
    });
    fastify.addHook('onResponse', async (request, reply) => {
        const duration = Date.now() - (request.startTime || Date.now());
        request.log.info({
            statusCode: reply.statusCode,
            duration,
            userAgent: request.headers['user-agent'],
            ip: request.ip,
        }, 'Request completed');
    });
    fastify.addHook('onError', async (request, reply, error) => {
        request.log.error(error, 'Request error occurred');
    });
    if (process.env.ENABLE_AUTH === 'true') {
        fastify.addHook('preHandler', async (request, reply) => {
            if (request.url === '/health' || request.url.startsWith('/docs')) {
                return;
            }
            const apiKey = request.headers['x-api-key'];
            const authHeader = request.headers.authorization;
            if (!apiKey && !authHeader) {
                reply.code(401).send({
                    error: 'Unauthorized',
                    message: 'API key or authorization header required',
                });
                return;
            }
            if (apiKey && !isValidApiKey(apiKey)) {
                reply.code(401).send({
                    error: 'Unauthorized',
                    message: 'Invalid API key',
                });
                return;
            }
            if (authHeader && !isValidJWT(authHeader)) {
                reply.code(401).send({
                    error: 'Unauthorized',
                    message: 'Invalid authorization token',
                });
                return;
            }
        });
    }
    fastify.addHook('onRequest', async (request, reply) => {
        if (request.headers.upgrade === 'websocket') {
            reply.header('Access-Control-Allow-Origin', '*');
            reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
        }
    });
    fastify.setErrorHandler(async (error, request, reply) => {
        if (error.validation) {
            reply.code(400).send({
                error: 'Validation Error',
                message: 'Request validation failed',
                details: error.validation,
            });
            return;
        }
        if (error.statusCode && error.statusCode < 500) {
            reply.code(error.statusCode).send({
                error: error.name || 'Client Error',
                message: error.message,
            });
            return;
        }
        logger.error(error, 'Unhandled server error');
        reply.code(500).send({
            error: 'Internal Server Error',
            message: 'An unexpected error occurred',
        });
    });
}
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
function isValidApiKey(apiKey) {
    const validKeys = process.env.API_KEYS?.split(',') || [];
    return validKeys.includes(apiKey);
}
function isValidJWT(authHeader) {
    return authHeader.startsWith('Bearer ') && authHeader.length > 20;
}
//# sourceMappingURL=plugins.js.map