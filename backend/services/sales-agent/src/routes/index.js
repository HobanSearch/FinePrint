"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const leads_1 = require("./leads");
const opportunities_1 = require("./opportunities");
const forecasting_1 = require("./forecasting");
const automation_1 = require("./automation");
const analytics_1 = require("./analytics");
const proposals_1 = require("./proposals");
const crm_1 = require("./crm");
async function registerRoutes(fastify) {
    await fastify.register(leads_1.leadsRoutes, { prefix: '/api/v1/leads' });
    await fastify.register(opportunities_1.opportunitiesRoutes, { prefix: '/api/v1/opportunities' });
    await fastify.register(forecasting_1.forecastingRoutes, { prefix: '/api/v1/forecasting' });
    await fastify.register(automation_1.automationRoutes, { prefix: '/api/v1/automation' });
    await fastify.register(analytics_1.analyticsRoutes, { prefix: '/api/v1/analytics' });
    await fastify.register(proposals_1.proposalsRoutes, { prefix: '/api/v1/proposals' });
    await fastify.register(crm_1.crmRoutes, { prefix: '/api/v1/crm' });
}
__exportStar(require("./leads"), exports);
__exportStar(require("./opportunities"), exports);
__exportStar(require("./forecasting"), exports);
__exportStar(require("./automation"), exports);
__exportStar(require("./analytics"), exports);
__exportStar(require("./proposals"), exports);
__exportStar(require("./crm"), exports);
//# sourceMappingURL=index.js.map