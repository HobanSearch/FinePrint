import { Refund, RefundReason, Chargeback, ChargebackStatus } from '../models/billing';
import Stripe from 'stripe';
export interface CreateRefundParams {
    invoiceId: string;
    amount?: number;
    reason: RefundReason;
    description?: string;
    metadata?: Record<string, string>;
}
export interface RefundAnalytics {
    totalRefunds: number;
    totalRefundAmount: number;
    refundRate: number;
    refundsByReason: Record<RefundReason, number>;
    refundsByMonth: Array<{
        month: string;
        count: number;
        amount: number;
    }>;
    averageRefundAmount: number;
}
export interface ChargebackAnalytics {
    totalChargebacks: number;
    totalChargebackAmount: number;
    chargebackRate: number;
    winRate: number;
    chargebacksByMonth: Array<{
        month: string;
        count: number;
        amount: number;
    }>;
    chargebacksByReason: Record<string, number>;
}
export declare class RefundsService {
    static createRefund(params: CreateRefundParams): Promise<Refund>;
    static getRefund(refundId: string): Promise<Refund | null>;
    static getUserRefunds(userId: string, limit?: number, offset?: number): Promise<{
        refunds: Refund[];
        total: number;
    }>;
    static cancelRefund(refundId: string): Promise<Refund>;
    static handleChargeback(dispute: Stripe.Dispute): Promise<Chargeback>;
    static updateChargeback(chargebackId: string, updates: {
        status?: ChargebackStatus;
        evidence?: Record<string, any>;
        evidenceSubmittedAt?: Date;
    }): Promise<Chargeback>;
    static submitChargebackEvidence(chargebackId: string, evidence: {
        customerCommunication?: string;
        receipt?: string;
        serviceDocumentation?: string;
        shippingDocumentation?: string;
        other?: string;
    }): Promise<void>;
    static getRefundAnalytics(startDate: Date, endDate: Date): Promise<RefundAnalytics>;
    static getChargebackAnalytics(startDate: Date, endDate: Date): Promise<ChargebackAnalytics>;
    static processRefundWebhook(refund: Stripe.Refund): Promise<void>;
    private static mapRefundReasonToStripe;
    private static groupRefundsByMonth;
    private static groupChargebacksByMonth;
}
declare module './notification.service' {
    namespace NotificationService {
        function sendRefundProcessed(userId: string, refundData: {
            amount: number;
            currency: string;
            reason: RefundReason;
            description?: string;
        }): Promise<void>;
        function sendRefundCompleted(userId: string, refundData: {
            amount: number;
            currency: string;
        }): Promise<void>;
    }
}
export default RefundsService;
//# sourceMappingURL=refunds.service.d.ts.map