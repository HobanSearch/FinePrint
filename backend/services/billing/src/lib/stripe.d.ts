import Stripe from 'stripe';
export declare const stripe: any;
export declare const verifyStripeSignature: (payload: string | Buffer, signature: string) => Stripe.Event;
export declare const getOrCreateStripeCustomer: (userId: string, email: string, name?: string, metadata?: Record<string, string>) => Promise<Stripe.Customer>;
export declare const formatStripeAmount: (amount: number, currency?: string) => number;
export declare const formatAmountFromStripe: (amount: number, currency?: string) => number;
export declare const createSetupIntent: (customerId: string, metadata?: Record<string, string>) => Promise<Stripe.SetupIntent>;
export declare const createPaymentIntent: (amount: number, currency: string, customerId: string, paymentMethodId?: string, metadata?: Record<string, string>) => Promise<Stripe.PaymentIntent>;
export declare const retryFailedPayment: (invoiceId: string) => Promise<Stripe.Invoice>;
export declare const createUsageRecord: (subscriptionItemId: string, quantity: number, timestamp?: number, action?: "increment" | "set") => Promise<Stripe.UsageRecord>;
export declare const getUpcomingInvoice: (customerId: string, subscriptionId?: string) => Promise<Stripe.Invoice>;
export declare const calculateTax: (customerId: string, lineItems: Array<{
    amount: number;
    currency: string;
    description?: string;
}>) => Promise<Stripe.Tax.Calculation>;
export { Stripe };
//# sourceMappingURL=stripe.d.ts.map