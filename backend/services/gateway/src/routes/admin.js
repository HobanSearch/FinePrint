"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = adminRoutes;
async function adminRoutes(server) {
    server.get('/services', {
        schema: {
            tags: ['Admin'],
            summary: 'List all Kong services',
            security: [{ ApiKeyAuth: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        data: { type: 'array' },
                        total: { type: 'number' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        reply.send({ data: [], total: 0 });
    });
    server.get('/routes', {
        schema: {
            tags: ['Admin'],
            summary: 'List all Kong routes',
        },
    }, async (request, reply) => {
        reply.send({ data: [], total: 0 });
    });
    server.get('/consumers', {
        schema: {
            tags: ['Admin'],
            summary: 'List all Kong consumers',
        },
    }, async (request, reply) => {
        reply.send({ data: [], total: 0 });
    });
    server.get('/plugins', {
        schema: {
            tags: ['Admin'],
            summary: 'List all Kong plugins',
        },
    }, async (request, reply) => {
        reply.send({ data: [], total: 0 });
    });
    server.post('/reload', {
        schema: {
            tags: ['Admin'],
            summary: 'Reload Kong configuration',
        },
    }, async (request, reply) => {
        reply.send({ status: 'reloaded', timestamp: new Date().toISOString() });
    });
}
//# sourceMappingURL=admin.js.map