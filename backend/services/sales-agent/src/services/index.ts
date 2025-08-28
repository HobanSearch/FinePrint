import { LeadScoringService } from './lead-scoring-service';
import { CrmIntegrationService } from './crm-integration-service';
import { EmailAutomationService } from './email-automation-service';
import { RevenueForecasting } from './revenue-forecasting-service';
import { SalesAnalyticsService } from './sales-analytics-service';
import { ProposalGenerationService } from './proposal-generation-service';
import { WorkflowAutomationService } from './workflow-automation-service';

// Service instances
let leadScoringService: LeadScoringService;
let crmIntegrationService: CrmIntegrationService;
let emailAutomationService: EmailAutomationService;
let revenueForecastingService: RevenueForecasting;
let salesAnalyticsService: SalesAnalyticsService;
let proposalGenerationService: ProposalGenerationService;
let workflowAutomationService: WorkflowAutomationService;

export async function initializeServices() {
  // Initialize all services
  leadScoringService = new LeadScoringService();
  crmIntegrationService = new CrmIntegrationService();
  emailAutomationService = new EmailAutomationService();
  revenueForecastingService = new RevenueForecasting();
  salesAnalyticsService = new SalesAnalyticsService();
  proposalGenerationService = new ProposalGenerationService();
  workflowAutomationService = new WorkflowAutomationService();

  // Start services that need initialization
  await leadScoringService.initialize();
  await crmIntegrationService.initialize();
  await emailAutomationService.initialize();
  await revenueForecastingService.initialize();
  await workflowAutomationService.initialize();
}

export function getServices() {
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

export * from './lead-scoring-service';
export * from './crm-integration-service';
export * from './email-automation-service';
export * from './revenue-forecasting-service';
export * from './sales-analytics-service';
export * from './proposal-generation-service';
export * from './workflow-automation-service';