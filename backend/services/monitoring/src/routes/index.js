"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const monitoring_1 = require("./monitoring");
const webhooks_1 = require("./webhooks");
const alerts_1 = require("./alerts");
const metrics_1 = require("./metrics");
const health_1 = require("./health");
async function registerRoutes(server) {
    await server.register(health_1.healthRoutes, { prefix: '/health' });
    await server.register(metrics_1.metricsRoutes, { prefix: '/metrics' });
    await server.register(monitoring_1.monitoringRoutes, { prefix: '/api/v1/monitoring' });
    await server.register(webhooks_1.webhookRoutes, { prefix: '/api/v1/webhooks' });
    await server.register(alerts_1.alertRoutes, { prefix: '/api/v1/alerts' });
}
//# sourceMappingURL=index.js.map