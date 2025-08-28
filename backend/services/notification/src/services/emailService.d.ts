export interface EmailSendResult {
    success: boolean;
    providerId?: string;
    providerStatus?: string;
    messageId?: string;
    errorCode?: string;
    errorMessage?: string;
    retryable?: boolean;
}
export interface EmailSendRequest {
    userId: string;
    notificationId: string;
    template?: any;
    data: Record<string, any>;
    deliveryId: string;
    to?: string;
    subject?: string;
    content?: string;
}
export interface EmailTemplateData {
    to: string;
    from: {
        email: string;
        name: string;
    };
    subject: string;
    html: string;
    text?: string;
    templateId?: string;
    dynamicTemplateData?: Record<string, any>;
    trackingSettings?: {
        clickTracking?: {
            enable: boolean;
        };
        openTracking?: {
            enable: boolean;
        };
        subscriptionTracking?: {
            enable: boolean;
        };
    };
    customArgs?: Record<string, string>;
}
declare class EmailService {
    private sendgrid;
    private ses;
    private provider;
    private initialized;
    constructor();
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    sendEmail(request: EmailSendRequest): Promise<EmailSendResult>;
    private sendWithSendGrid;
    private sendWithSES;
    private buildEmailContent;
    private getEmailTemplate;
    private getUserForEmail;
    private checkUnsubscribeStatus;
    private compileHandlebarsTemplate;
    private htmlToText;
    private generateUnsubscribeUrl;
    private generateUnsubscribeToken;
    private registerHandlebarsHelpers;
    private updateTemplateStats;
    private isRetryableError;
    private isSendGridRetryableError;
    private isSESRetryableError;
    createEmailTemplate(templateData: {
        name: string;
        subject: string;
        mjmlContent?: string;
        htmlContent?: string;
        textContent?: string;
        variables?: any;
    }): Promise<any>;
    updateEmailTemplate(templateId: string, updates: any): Promise<any>;
    getEmailTemplates(options?: {
        limit?: number;
        offset?: number;
        active?: boolean;
    }): Promise<any[]>;
    processUnsubscribe(token: string): Promise<{
        success: boolean;
        message: string;
    }>;
    handleSendGridWebhook(events: any[]): Promise<void>;
    handleSESWebhook(message: any): Promise<void>;
    private processEmailEvent;
}
export declare const emailService: EmailService;
export {};
//# sourceMappingURL=emailService.d.ts.map