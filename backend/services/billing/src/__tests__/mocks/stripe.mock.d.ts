export declare const mockStripe: {
    customers: {
        create: any;
        retrieve: any;
        update: any;
        list: any;
    };
    subscriptions: {
        create: any;
        retrieve: any;
        update: any;
        cancel: any;
    };
    invoices: {
        retrieve: any;
        retrieveUpcoming: any;
        pay: any;
    };
    invoiceItems: {
        create: any;
    };
    paymentMethods: {
        attach: any;
        detach: any;
    };
    setupIntents: {
        create: any;
    };
    paymentIntents: {
        create: any;
    };
    subscriptionItems: {
        createUsageRecord: any;
    };
    refunds: {
        create: any;
        cancel: any;
    };
    disputes: {
        update: any;
    };
    charges: {
        retrieve: any;
    };
    tax: {
        calculations: {
            create: any;
        };
    };
    webhooks: {
        constructEvent: any;
    };
};
export declare const mockStripeConstructor: any;
export default mockStripe;
//# sourceMappingURL=stripe.mock.d.ts.map