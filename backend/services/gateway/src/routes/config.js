"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = configRoutes;
async function configRoutes(server) {
    server.get('/status', {
        schema: {
            tags: ['Config'],
            summary: 'Configuration status',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status: { type: 'string' },
                        last_updated: { type: 'string' },
                        version: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        reply.send({
            status: 'active',
            last_updated: new Date().toISOString(),
            version: '1.0.0',
        });
    });
    server.post('/validate', {
        schema: {
            tags: ['Config'],
            summary: 'Validate Kong configuration',
        },
    }, async (request, reply) => {
        reply.send({
            valid: true,
            timestamp: new Date().toISOString(),
        });
    });
    server.post('/reload', {
        schema: {
            tags: ['Config'],
            summary: 'Reload configuration from file',
        },
    }, async (request, reply) => {
        reply.send({
            status: 'reloaded',
            timestamp: new Date().toISOString(),
        });
    });
}
//# sourceMappingURL=config.js.map