import { z } from 'zod';
declare const configSchema: any;
type Config = z.infer<typeof configSchema>;
declare let config: Config;
export declare const PRICING_TIERS: {
    readonly free: {
        readonly id: "free";
        readonly name: "Free";
        readonly price: 0;
        readonly currency: "usd";
        readonly interval: null;
        readonly features: {
            readonly analysesPerMonth: number;
            readonly monitoring: false;
            readonly browserExtension: false;
            readonly apiAccess: false;
            readonly teamMembers: 1;
            readonly support: "community";
            readonly customPatterns: false;
        };
    };
    readonly starter: {
        readonly id: "starter";
        readonly name: "Starter";
        readonly price: 9;
        readonly currency: "usd";
        readonly interval: "month";
        readonly stripeProductId: string | undefined;
        readonly stripePriceId: string | undefined;
        readonly features: {
            readonly analysesPerMonth: number;
            readonly monitoring: 5;
            readonly browserExtension: false;
            readonly apiAccess: false;
            readonly teamMembers: 1;
            readonly support: "standard";
            readonly customPatterns: false;
        };
    };
    readonly professional: {
        readonly id: "professional";
        readonly name: "Professional";
        readonly price: 29;
        readonly currency: "usd";
        readonly interval: "month";
        readonly stripeProductId: string | undefined;
        readonly stripePriceId: string | undefined;
        readonly features: {
            readonly analysesPerMonth: -1;
            readonly monitoring: -1;
            readonly browserExtension: true;
            readonly apiAccess: 1000;
            readonly teamMembers: 1;
            readonly support: "priority";
            readonly customPatterns: false;
        };
    };
    readonly team: {
        readonly id: "team";
        readonly name: "Team";
        readonly price: 99;
        readonly currency: "usd";
        readonly interval: "month";
        readonly stripeProductId: string | undefined;
        readonly stripePriceId: string | undefined;
        readonly features: {
            readonly analysesPerMonth: -1;
            readonly monitoring: -1;
            readonly browserExtension: true;
            readonly apiAccess: 10000;
            readonly teamMembers: 5;
            readonly support: "phone";
            readonly customPatterns: true;
        };
    };
    readonly enterprise: {
        readonly id: "enterprise";
        readonly name: "Enterprise";
        readonly price: null;
        readonly currency: "usd";
        readonly interval: "month";
        readonly features: {
            readonly analysesPerMonth: -1;
            readonly monitoring: -1;
            readonly browserExtension: true;
            readonly apiAccess: -1;
            readonly teamMembers: -1;
            readonly support: "dedicated";
            readonly customPatterns: true;
            readonly onPremise: true;
            readonly sla: true;
        };
    };
};
export declare const USAGE_COSTS: {
    analysisOverage: number;
    apiOverage: number;
};
export declare const BILLING_CONFIG: {
    trialPeriodDays: number;
    gracePeriodDays: number;
    dunningRetryAttempts: number;
    invoicePaymentTermsDays: number;
};
export default config;
//# sourceMappingURL=index.d.ts.map