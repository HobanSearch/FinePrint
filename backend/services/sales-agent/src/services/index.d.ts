import { LeadScoringService } from './lead-scoring-service';
import { CrmIntegrationService } from './crm-integration-service';
import { EmailAutomationService } from './email-automation-service';
import { RevenueForecasting } from './revenue-forecasting-service';
import { SalesAnalyticsService } from './sales-analytics-service';
import { ProposalGenerationService } from './proposal-generation-service';
import { WorkflowAutomationService } from './workflow-automation-service';
export declare function initializeServices(): Promise<void>;
export declare function getServices(): {
    leadScoringService: LeadScoringService;
    crmIntegrationService: CrmIntegrationService;
    emailAutomationService: EmailAutomationService;
    revenueForecastingService: RevenueForecasting;
    salesAnalyticsService: SalesAnalyticsService;
    proposalGenerationService: ProposalGenerationService;
    workflowAutomationService: WorkflowAutomationService;
};
export * from './lead-scoring-service';
export * from './crm-integration-service';
export * from './email-automation-service';
export * from './revenue-forecasting-service';
export * from './sales-analytics-service';
export * from './proposal-generation-service';
export * from './workflow-automation-service';
//# sourceMappingURL=index.d.ts.map