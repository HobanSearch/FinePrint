"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const analysis_1 = require("./analysis");
const documents_1 = require("./documents");
const patterns_1 = require("./patterns");
const unified_1 = require("./unified");
async function registerRoutes(server) {
    await server.register(async function (server) {
        await server.register(analysis_1.analysisRoutes, { prefix: '/analysis' });
        await server.register(documents_1.documentRoutes, { prefix: '/documents' });
        await server.register(patterns_1.patternRoutes, { prefix: '/patterns' });
    }, { prefix: '/api/v1' });
    await server.register(async function (server) {
        await server.register(unified_1.unifiedRoutes, { prefix: '/' });
    }, { prefix: '/api/v2' });
}
//# sourceMappingURL=index.js.map