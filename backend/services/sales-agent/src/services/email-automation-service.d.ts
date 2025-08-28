interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    content: string;
    type: 'welcome' | 'follow_up' | 'demo_invite' | 'proposal' | 'nurture' | 're_engagement';
    variables: string[];
    active: boolean;
}
interface EmailSequence {
    id: string;
    name: string;
    trigger: 'lead_created' | 'stage_change' | 'time_based' | 'behavior_based';
    emails: EmailSequenceStep[];
    active: boolean;
}
interface EmailSequenceStep {
    id: string;
    delay: number;
    template: EmailTemplate;
    conditions?: any[];
    stopConditions?: any[];
}
export declare class EmailAutomationService {
    private prisma;
    private emailQueue;
    private openai;
    private templates;
    private sequences;
    constructor();
    initialize(): Promise<void>;
    sendPersonalizedEmail(leadId: string, templateId: string, customData?: Record<string, any>): Promise<boolean>;
    startEmailSequence(leadId: string, sequenceId: string): Promise<void>;
    stopEmailSequence(leadId: string, sequenceId: string): Promise<void>;
    generateEmailFromContext(leadId: string, context: string, emailType: string): Promise<{
        subject: string;
        content: string;
    }>;
    handleWebhookEvent(event: any): Promise<void>;
    private personalizeEmail;
    private getAIPersonalization;
    private buildEmailGenerationPrompt;
    private scheduleSequenceEmail;
    private handleEmailOpen;
    private handleEmailClick;
    private handleEmailReply;
    private handleEmailBounce;
    private handleEmailDelivered;
    private updateEngagementScore;
    private logEmailActivity;
    private convertToHtml;
    private convertToText;
    private getFallbackEmail;
    private isHighValueLink;
    private triggerHighValueFollowUp;
    private notifySalesRep;
    private updateDeliveryStatus;
    private loadEmailTemplates;
    private loadEmailSequences;
    private setupAutomationRules;
    getEmailMetrics(leadId?: string): Promise<any>;
    getActiveSequences(): Promise<EmailSequence[]>;
    createTemplate(template: Omit<EmailTemplate, 'id'>): Promise<EmailTemplate>;
}
export {};
//# sourceMappingURL=email-automation-service.d.ts.map