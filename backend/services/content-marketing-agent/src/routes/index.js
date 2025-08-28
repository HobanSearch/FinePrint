"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = routes;
const content_1 = __importDefault(require("./content"));
const campaigns_1 = __importDefault(require("./campaigns"));
const analytics_1 = __importDefault(require("./analytics"));
const leads_1 = __importDefault(require("./leads"));
const seo_1 = __importDefault(require("./seo"));
const distribution_1 = __importDefault(require("./distribution"));
const health_1 = __importDefault(require("./health"));
async function routes(fastify) {
    await fastify.register(health_1.default, { prefix: '/health' });
    await fastify.register(content_1.default, { prefix: '/content' });
    await fastify.register(campaigns_1.default, { prefix: '/campaigns' });
    await fastify.register(analytics_1.default, { prefix: '/analytics' });
    await fastify.register(leads_1.default, { prefix: '/leads' });
    await fastify.register(seo_1.default, { prefix: '/seo' });
    await fastify.register(distribution_1.default, { prefix: '/distribution' });
}
//# sourceMappingURL=index.js.map