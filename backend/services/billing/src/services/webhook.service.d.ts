export declare class WebhookService {
    static processWebhook(payload: string | Buffer, signature: string): Promise<{
        received: boolean;
        eventType: string;
    }>;
    private static handleEvent;
    private static handleSubscriptionCreated;
    private static handleSubscriptionUpdated;
    private static handleSubscriptionDeleted;
    private static handleTrialWillEnd;
    private static handleInvoiceCreated;
    private static handleInvoicePaymentSucceeded;
    private static handleInvoicePaymentFailed;
    private static handleInvoiceUpcoming;
    private static handlePaymentMethodAttached;
    private static handlePaymentMethodDetached;
    private static handleCustomerCreated;
    private static handleCustomerUpdated;
    private static handleCustomerDeleted;
    private static handleChargeDisputeCreated;
    private static handleChargeDisputeUpdated;
    private static getUserIdFromEvent;
    static retryFailedEvents(): Promise<void>;
}
export default WebhookService;
//# sourceMappingURL=webhook.service.d.ts.map