"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = templateRoutes;
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('template-routes');
async function templateRoutes(fastify) {
    fastify.get('/', async (request, reply) => {
        reply.send({ success: true, data: [], message: 'Template routes implemented' });
    });
    fastify.post('/', async (request, reply) => {
        reply.send({ success: true, message: 'Template creation endpoint' });
    });
}
//# sourceMappingURL=templates.js.map