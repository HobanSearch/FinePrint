"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = webhookRoutes;
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('webhook-routes');
async function webhookRoutes(fastify) {
    fastify.get('/', async (request, reply) => {
        reply.send({ success: true, data: [], message: 'Webhook endpoints list' });
    });
    fastify.post('/', async (request, reply) => {
        reply.send({ success: true, message: 'Webhook endpoint creation' });
    });
    fastify.post('/sendgrid', async (request, reply) => {
        reply.send({ success: true, message: 'SendGrid webhook processed' });
    });
    fastify.post('/ses', async (request, reply) => {
        reply.send({ success: true, message: 'SES webhook processed' });
    });
}
//# sourceMappingURL=webhooks.js.map