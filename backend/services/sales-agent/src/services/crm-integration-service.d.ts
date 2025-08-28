export declare class CrmIntegrationService {
    private prisma;
    private hubspot?;
    private salesforce?;
    private pipedrive?;
    private crmConfigs;
    constructor();
    initialize(): Promise<void>;
    syncLeadToCrm(leadId: string, crmType: 'hubspot' | 'salesforce' | 'pipedrive'): Promise<string>;
    syncOpportunityToCrm(opportunityId: string, crmType: string): Promise<string>;
    private syncToHubSpot;
    private syncToSalesforce;
    private syncToPipedrive;
    private syncOpportunityToHubSpot;
    private syncOpportunityToSalesforce;
    private syncOpportunityToPipedrive;
    syncFromCrm(crmType: string): Promise<void>;
    private syncFromHubSpot;
    private syncFromSalesforce;
    private syncFromPipedrive;
    private mapStageToHubSpot;
    private mapStageToSalesforce;
    private mapOpportunityStageToHubSpot;
    private mapOpportunityStageToSalesforce;
    private mapOpportunityStageToStageId;
    private importContactFromHubSpot;
    private importDealFromHubSpot;
    private importLeadFromSalesforce;
    private importOpportunityFromSalesforce;
    private importPersonFromPipedrive;
    private importDealFromPipedrive;
    private syncActivityToHubSpot;
    private syncActivityToSalesforce;
    private createPipedriveDeal;
    private loadCrmConfigurations;
    getCrmStatus(): Promise<Record<string, boolean>>;
    bulkSyncToCrm(leadIds: string[], crmType: string): Promise<string[]>;
}
//# sourceMappingURL=crm-integration-service.d.ts.map