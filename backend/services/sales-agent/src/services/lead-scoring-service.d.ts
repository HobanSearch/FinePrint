import { Lead, CreateLeadRequest, UpdateLeadRequest } from '@fineprintai/shared-types';
export declare class LeadScoringService {
    private prisma;
    private leadQueue;
    private openai;
    constructor();
    initialize(): Promise<void>;
    createLead(data: CreateLeadRequest): Promise<Lead>;
    updateLead(id: string, updates: UpdateLeadRequest): Promise<Lead>;
    calculateLeadScore(leadId: string): Promise<number>;
    private calculateInitialScore;
    private calculateDemographicScore;
    private calculateBehavioralScore;
    private calculateEngagementScore;
    private calculateAIScore;
    private calculateTitleScore;
    private calculateSourceScore;
    private calculateDomainScore;
    private isTargetIndustry;
    private stageToProbability;
    private shouldRecalculateScore;
    private recalculateScore;
    private handleStageChange;
    private queueLeadProcessing;
    private queueStageChangeActions;
    private loadScoringModel;
    getLeadsByScore(minScore?: number, limit?: number): Promise<Lead[]>;
    getHotLeads(limit?: number): Promise<Lead[]>;
    bulkScoreLeads(leadIds: string[]): Promise<{
        leadId: string;
        score: number;
    }[]>;
}
//# sourceMappingURL=lead-scoring-service.d.ts.map