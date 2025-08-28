import { TaxProvider, TaxCalculation } from '../models/billing';
export interface TaxCalculationRequest {
    customerId: string;
    customerAddress: {
        country: string;
        state?: string;
        city?: string;
        postalCode?: string;
        line1?: string;
        line2?: string;
    };
    lineItems: Array<{
        amount: number;
        description: string;
        taxCode?: string;
    }>;
    currency: string;
}
export interface TaxCalculationResult {
    totalTax: number;
    taxRate: number;
    taxBreakdown: Array<{
        name: string;
        rate: number;
        amount: number;
        type: string;
    }>;
    provider: TaxProvider;
    jurisdiction: string;
}
export interface TaxSettings {
    enabled: boolean;
    provider: TaxProvider;
    autoCollect: boolean;
    nexusCountries: string[];
    nexusStates: string[];
    taxExemptCustomers: string[];
}
export declare class TaxService {
    private static taxSettings;
    static calculateTaxForTransaction(request: TaxCalculationRequest): Promise<TaxCalculationResult>;
    private static calculateWithStripeTax;
    private static calculateWithTaxJar;
    private static calculateWithAvaTax;
    static saveTaxCalculation(userId: string, calculation: TaxCalculationResult, customerAddress: TaxCalculationRequest['customerAddress'], invoiceId?: string): Promise<TaxCalculation>;
    private static isCustomerInTaxNexus;
    private static isCustomerTaxExempt;
    static getTaxRatesForLocation(country: string, state?: string, city?: string, postalCode?: string): Promise<{
        combinedRate: number;
        stateRate: number;
        countyRate: number;
        cityRate: number;
        specialRate: number;
    }>;
    static updateTaxSettings(settings: Partial<TaxSettings>): Promise<TaxSettings>;
    static getTaxSettings(): TaxSettings;
    static validateTaxCalculation(calculationId: string): Promise<{
        valid: boolean;
        errors: string[];
    }>;
    static getTaxSummaryForPeriod(startDate: Date, endDate: Date): Promise<{
        totalTaxCollected: number;
        taxByJurisdiction: Record<string, number>;
        taxByProvider: Record<string, number>;
        transactionCount: number;
    }>;
    static generateTaxReport(startDate: Date, endDate: Date, jurisdiction?: string): Promise<{
        reportId: string;
        summary: {
            totalTaxCollected: number;
            totalTransactions: number;
            averageTaxRate: number;
        };
        details: Array<{
            date: string;
            customerId: string;
            invoiceId?: string;
            taxAmount: number;
            taxRate: number;
            jurisdiction: string;
        }>;
    }>;
}
export default TaxService;
//# sourceMappingURL=tax.service.d.ts.map