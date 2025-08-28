"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = abTestRoutes;
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('abtest-routes');
async function abTestRoutes(fastify) {
    fastify.get('/', async (request, reply) => {
        reply.send({ success: true, data: { tests: [], total: 0 }, message: 'A/B test list endpoint' });
    });
    fastify.post('/', async (request, reply) => {
        reply.send({ success: true, message: 'A/B test creation endpoint' });
    });
}
//# sourceMappingURL=abTests.js.map