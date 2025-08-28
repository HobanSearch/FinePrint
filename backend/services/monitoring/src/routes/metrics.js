"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsRoutes = metricsRoutes;
const metrics_1 = require("../monitoring/metrics");
async function metricsRoutes(server) {
    server.get('/', async (request, reply) => {
        reply.header('Content-Type', metrics_1.prometheusRegister.contentType);
        return metrics_1.prometheusRegister.metrics();
    });
    server.get('/json', async (request, reply) => {
        const metrics = await metrics_1.prometheusRegister.getMetricsAsJSON();
        return { metrics };
    });
}
//# sourceMappingURL=metrics.js.map