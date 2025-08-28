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
exports.initializeServices = initializeServices;
exports.getServices = getServices;
const lead_scoring_service_1 = require("./lead-scoring-service");
const crm_integration_service_1 = require("./crm-integration-service");
const email_automation_service_1 = require("./email-automation-service");
const revenue_forecasting_service_1 = require("./revenue-forecasting-service");
const sales_analytics_service_1 = require("./sales-analytics-service");
const proposal_generation_service_1 = require("./proposal-generation-service");
const workflow_automation_service_1 = require("./workflow-automation-service");
let leadScoringService;
let crmIntegrationService;
let emailAutomationService;
let revenueForecastingService;
let salesAnalyticsService;
let proposalGenerationService;
let workflowAutomationService;
async function initializeServices() {
    leadScoringService = new lead_scoring_service_1.LeadScoringService();
    crmIntegrationService = new crm_integration_service_1.CrmIntegrationService();
    emailAutomationService = new email_automation_service_1.EmailAutomationService();
    revenueForecastingService = new revenue_forecasting_service_1.RevenueForecasting();
    salesAnalyticsService = new sales_analytics_service_1.SalesAnalyticsService();
    proposalGenerationService = new proposal_generation_service_1.ProposalGenerationService();
    workflowAutomationService = new workflow_automation_service_1.WorkflowAutomationService();
    await leadScoringService.initialize();
    await crmIntegrationService.initialize();
    await emailAutomationService.initialize();
    await revenueForecastingService.initialize();
    await workflowAutomationService.initialize();
}
function getServices() {
    return {
        leadScoringService,
        crmIntegrationService,
        emailAutomationService,
        revenueForecastingService,
        salesAnalyticsService,
        proposalGenerationService,
        workflowAutomationService,
    };
}
__exportStar(require("./lead-scoring-service"), exports);
__exportStar(require("./crm-integration-service"), exports);
__exportStar(require("./email-automation-service"), exports);
__exportStar(require("./revenue-forecasting-service"), exports);
__exportStar(require("./sales-analytics-service"), exports);
__exportStar(require("./proposal-generation-service"), exports);
__exportStar(require("./workflow-automation-service"), exports);
//# sourceMappingURL=index.js.map