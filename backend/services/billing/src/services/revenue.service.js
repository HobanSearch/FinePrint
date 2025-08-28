"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevenueService = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("../utils/logger");
const luxon_1 = require("luxon");
const decimal_js_1 = require("decimal.js");
const prisma = new client_1.PrismaClient();
class RevenueService {
    static recognitionRules = {
        subscription: {
            productType: 'subscription',
            recognitionMethod: 'monthly',
            deferralPeriod: 12,
        },
        usage: {
            productType: 'usage',
            recognitionMethod: 'immediate',
        },
        setup_fee: {
            productType: 'one_time',
            recognitionMethod: 'immediate',
        },
        consulting: {
            productType: 'one_time',
            recognitionMethod: 'immediate',
        },
    };
    static async processRevenueRecognition(invoiceId) {
        try {
            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
                include: {
                    user: {
                        select: {
                            subscriptionTier: true,
                        },
                    },
                },
            });
            if (!invoice) {
                throw new Error('Invoice not found');
            }
            const existingRevenue = await prisma.revenueEntry.findFirst({
                where: { invoiceId },
            });
            if (existingRevenue) {
                logger_1.logger.info('Revenue already processed for invoice', { invoiceId });
                return;
            }
            const productType = this.determineProductType(invoice);
            const rule = this.recognitionRules[productType];
            if (!rule) {
                logger_1.logger.warn('No revenue recognition rule found', { productType, invoiceId });
                return;
            }
            const amount = new decimal_js_1.Decimal(invoice.total.toString());
            switch (rule.recognitionMethod) {
                case 'immediate':
                    await this.createImmediateRevenueEntry(invoice, amount, productType);
                    break;
                case 'monthly':
                    await this.createDeferredRevenueEntries(invoice, amount, productType, rule.deferralPeriod || 12);
                    break;
                case 'usage_based':
                    await this.createUsageBasedRevenueEntry(invoice, amount, productType);
                    break;
            }
            logger_1.logger.info('Revenue recognition processed', {
                invoiceId,
                amount: amount.toString(),
                productType,
                recognitionMethod: rule.recognitionMethod,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to process revenue recognition', { error, invoiceId });
            throw error;
        }
    }
    static async createImmediateRevenueEntry(invoice, amount, productType) {
        await prisma.revenueEntry.create({
            data: {
                invoiceId: invoice.id,
                userId: invoice.userId,
                amount: amount.toString(),
                recognizedAmount: amount.toString(),
                deferredAmount: '0',
                recognitionDate: new Date(),
                productType,
                description: `Immediate recognition for ${productType}`,
                metadata: JSON.stringify({
                    tier: invoice.user?.subscriptionTier,
                    invoiceDate: invoice.createdAt,
                }),
            },
        });
    }
    static async createDeferredRevenueEntries(invoice, amount, productType, deferralPeriod) {
        const monthlyAmount = amount.dividedBy(deferralPeriod);
        const invoiceDate = luxon_1.DateTime.fromJSDate(invoice.periodStart || invoice.createdAt);
        for (let month = 0; month < deferralPeriod; month++) {
            const recognitionDate = invoiceDate.plus({ months: month });
            await prisma.revenueEntry.create({
                data: {
                    invoiceId: invoice.id,
                    userId: invoice.userId,
                    amount: amount.toString(),
                    recognizedAmount: monthlyAmount.toString(),
                    deferredAmount: amount.minus(monthlyAmount.times(month + 1)).toString(),
                    recognitionDate: recognitionDate.toJSDate(),
                    productType,
                    description: `Monthly recognition ${month + 1}/${deferralPeriod} for ${productType}`,
                    metadata: JSON.stringify({
                        tier: invoice.user?.subscriptionTier,
                        invoiceDate: invoice.createdAt,
                        month: month + 1,
                        totalMonths: deferralPeriod,
                    }),
                },
            });
        }
    }
    static async createUsageBasedRevenueEntry(invoice, amount, productType) {
        await this.createImmediateRevenueEntry(invoice, amount, productType);
    }
    static async generateRevenueReport(startDate, endDate, options = {}) {
        try {
            const revenueEntries = await prisma.revenueEntry.findMany({
                where: {
                    recognitionDate: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                include: {
                    user: {
                        select: {
                            subscriptionTier: true,
                            createdAt: true,
                        },
                    },
                },
            });
            const totalRevenue = revenueEntries.reduce((sum, entry) => sum + Number(entry.amount), 0);
            const recognizedRevenue = revenueEntries.reduce((sum, entry) => sum + Number(entry.recognizedAmount), 0);
            const deferredRevenue = revenueEntries.reduce((sum, entry) => sum + Number(entry.deferredAmount), 0);
            const breakdown = revenueEntries.reduce((acc, entry) => {
                const type = entry.productType;
                const amount = Number(entry.recognizedAmount);
                if (type === 'subscription') {
                    acc.subscriptions += amount;
                }
                else if (type === 'usage') {
                    acc.usage += amount;
                }
                else {
                    acc.oneTime += amount;
                }
                return acc;
            }, { subscriptions: 0, usage: 0, oneTime: 0 });
            const monthlyRecognition = this.calculateMonthlyRecognition(revenueEntries);
            const revenueByTier = revenueEntries.reduce((acc, entry) => {
                const tier = entry.user?.subscriptionTier || 'unknown';
                acc[tier] = (acc[tier] || 0) + Number(entry.recognizedAmount);
                return acc;
            }, {});
            let cohortAnalysis = [];
            if (options.includeCohorts) {
                cohortAnalysis = await this.generateCohortAnalysis(startDate, endDate);
            }
            return {
                period: { startDate, endDate },
                totalRevenue,
                recognizedRevenue,
                deferredRevenue,
                breakdown,
                monthlyRecognition,
                revenueByTier,
                cohortAnalysis,
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to generate revenue report', { error, startDate, endDate });
            throw error;
        }
    }
    static async calculateARRMetrics(asOfDate = new Date()) {
        try {
            const currentMonth = luxon_1.DateTime.fromJSDate(asOfDate).startOf('month');
            const previousMonth = currentMonth.minus({ months: 1 });
            const previousYear = currentMonth.minus({ years: 1 });
            const activeSubscriptions = await prisma.user.findMany({
                where: {
                    subscriptionTier: {
                        not: 'free',
                    },
                    status: 'active',
                    subscriptionExpiresAt: {
                        gte: asOfDate,
                    },
                },
                select: {
                    subscriptionTier: true,
                    createdAt: true,
                },
            });
            const { PRICING_TIERS } = require('../config');
            const currentMRR = activeSubscriptions.reduce((sum, sub) => {
                const tierPrice = PRICING_TIERS[sub.subscriptionTier]?.price || 0;
                return sum + tierPrice;
            }, 0);
            const previousMonthSubscriptions = await this.getMRRForMonth(previousMonth.toJSDate());
            const previousYearMRR = await this.getMRRForMonth(previousYear.toJSDate());
            const mrrGrowth = previousMonthSubscriptions.mrr > 0
                ? ((currentMRR - previousMonthSubscriptions.mrr) / previousMonthSubscriptions.mrr) * 100
                : 0;
            const currentARR = currentMRR * 12;
            const previousARR = previousMonthSubscriptions.mrr * 12;
            const arrGrowth = previousARR > 0
                ? ((currentARR - previousARR) / previousARR) * 100
                : 0;
            const yoyGrowth = previousYearMRR > 0
                ? ((currentMRR - previousYearMRR) / previousYearMRR) * 100
                : 0;
            const churnMetrics = await this.calculateChurnMetrics(currentMonth.toJSDate());
            const ltv = this.calculateLTV(currentMRR, churnMetrics.customerChurnRate);
            const arpu = activeSubscriptions.length > 0 ? currentMRR / activeSubscriptions.length : 0;
            return {
                arr: currentARR,
                mrr: currentMRR,
                growth: {
                    mrr: mrrGrowth,
                    arr: arrGrowth,
                    mom: mrrGrowth,
                    yoy: yoyGrowth,
                },
                churn: churnMetrics,
                ltv,
                arpu,
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to calculate ARR metrics', { error, asOfDate });
            throw error;
        }
    }
    static async getMRRForMonth(date) {
        const monthStart = luxon_1.DateTime.fromJSDate(date).startOf('month');
        const monthEnd = monthStart.endOf('month');
        const subscriptions = await prisma.user.findMany({
            where: {
                subscriptionTier: {
                    not: 'free',
                },
                status: 'active',
                createdAt: {
                    lte: monthEnd.toJSDate(),
                },
                OR: [
                    { subscriptionExpiresAt: null },
                    { subscriptionExpiresAt: { gte: monthStart.toJSDate() } },
                ],
            },
            select: {
                subscriptionTier: true,
            },
        });
        const { PRICING_TIERS } = require('../config');
        const mrr = subscriptions.reduce((sum, sub) => {
            const tierPrice = PRICING_TIERS[sub.subscriptionTier]?.price || 0;
            return sum + tierPrice;
        }, 0);
        return {
            mrr,
            customers: subscriptions.length,
        };
    }
    static async calculateChurnMetrics(asOfDate) {
        const currentMonth = luxon_1.DateTime.fromJSDate(asOfDate);
        const previousMonth = currentMonth.minus({ months: 1 });
        const churnedCustomers = await prisma.user.count({
            where: {
                subscriptionExpiresAt: {
                    gte: previousMonth.startOf('month').toJSDate(),
                    lte: previousMonth.endOf('month').toJSDate(),
                },
                subscriptionTier: 'free',
            },
        });
        const totalCustomersStartOfMonth = await prisma.user.count({
            where: {
                subscriptionTier: {
                    not: 'free',
                },
                createdAt: {
                    lte: previousMonth.startOf('month').toJSDate(),
                },
            },
        });
        const customerChurnRate = totalCustomersStartOfMonth > 0
            ? (churnedCustomers / totalCustomersStartOfMonth) * 100
            : 0;
        const grossRevenueChurnRate = customerChurnRate;
        const netRevenueChurnRate = Math.max(0, grossRevenueChurnRate - 5);
        return {
            grossRevenueChurnRate,
            netRevenueChurnRate,
            customerChurnRate,
        };
    }
    static calculateLTV(arpu, churnRate) {
        if (churnRate <= 0)
            return 0;
        return arpu / (churnRate / 100);
    }
    static calculateMonthlyRecognition(revenueEntries) {
        const monthlyData = revenueEntries.reduce((acc, entry) => {
            const month = luxon_1.DateTime.fromJSDate(entry.recognitionDate).toFormat('yyyy-MM');
            acc[month] = (acc[month] || 0) + Number(entry.recognizedAmount);
            return acc;
        }, {});
        return Object.entries(monthlyData)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, amount]) => ({ month, amount }));
    }
    static async generateCohortAnalysis(startDate, endDate) {
        try {
            const cohorts = await prisma.$queryRaw `
        SELECT 
          DATE_TRUNC('month', u.created_at) as cohort_month,
          COUNT(DISTINCT u.id) as customers,
          COALESCE(SUM(CAST(r.recognized_amount AS DECIMAL)), 0) as revenue
        FROM users u
        LEFT JOIN revenue_entries r ON r.user_id = u.id 
          AND r.recognition_date >= ${startDate}
          AND r.recognition_date <= ${endDate}
        WHERE u.created_at >= ${startDate}
          AND u.created_at <= ${endDate}
        GROUP BY DATE_TRUNC('month', u.created_at)
        ORDER BY cohort_month
      `;
            return cohorts.map(cohort => ({
                cohort: luxon_1.DateTime.fromJSDate(cohort.cohort_month).toFormat('yyyy-MM'),
                revenue: Number(cohort.revenue),
                customers: Number(cohort.customers),
                averageRevenue: Number(cohort.customers) > 0
                    ? Number(cohort.revenue) / Number(cohort.customers)
                    : 0,
            }));
        }
        catch (error) {
            logger_1.logger.error('Failed to generate cohort analysis', { error });
            return [];
        }
    }
    static determineProductType(invoice) {
        const metadata = typeof invoice.metadata === 'string'
            ? JSON.parse(invoice.metadata || '{}')
            : invoice.metadata || {};
        if (metadata.productType) {
            return metadata.productType;
        }
        if (invoice.subscriptionId) {
            return 'subscription';
        }
        if (metadata.usage || metadata.overage) {
            return 'usage';
        }
        return 'one_time';
    }
    static async processMonthlyRecognition() {
        try {
            const currentDate = new Date();
            const entriesToRecognize = await prisma.revenueEntry.findMany({
                where: {
                    recognitionDate: {
                        lte: currentDate,
                    },
                    recognizedAmount: {
                        gt: 0,
                    },
                },
            });
            logger_1.logger.info('Processing monthly revenue recognition', {
                entries: entriesToRecognize.length,
                date: currentDate.toISOString(),
            });
            for (const entry of entriesToRecognize) {
                logger_1.logger.info('Revenue recognized', {
                    entryId: entry.id,
                    amount: entry.recognizedAmount,
                    invoiceId: entry.invoiceId,
                    userId: entry.userId,
                });
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to process monthly revenue recognition', { error });
            throw error;
        }
    }
    static async getRevenueForecast(months = 12) {
        try {
            const historicalData = await prisma.revenueEntry.findMany({
                where: {
                    recognitionDate: {
                        gte: luxon_1.DateTime.now().minus({ months: 12 }).toJSDate(),
                        lte: new Date(),
                    },
                },
                select: {
                    recognitionDate: true,
                    recognizedAmount: true,
                },
            });
            const monthlyRevenue = this.calculateMonthlyRecognition(historicalData);
            const forecast = [];
            const recentMonths = monthlyRevenue.slice(-6);
            const avgGrowth = recentMonths.length > 1
                ? recentMonths.reduce((sum, month, index) => {
                    if (index === 0)
                        return sum;
                    const previousMonth = recentMonths[index - 1];
                    const growth = previousMonth.amount > 0
                        ? (month.amount - previousMonth.amount) / previousMonth.amount
                        : 0;
                    return sum + growth;
                }, 0) / (recentMonths.length - 1)
                : 0.05;
            const lastMonthRevenue = recentMonths[recentMonths.length - 1]?.amount || 0;
            for (let i = 1; i <= months; i++) {
                const forecastMonth = luxon_1.DateTime.now().plus({ months: i });
                const forecastedRevenue = lastMonthRevenue * Math.pow(1 + avgGrowth, i);
                const confidence = Math.max(0.3, 0.9 - (i * 0.05));
                forecast.push({
                    month: forecastMonth.toFormat('yyyy-MM'),
                    forecastedRevenue,
                    confidence,
                });
            }
            return forecast;
        }
        catch (error) {
            logger_1.logger.error('Failed to generate revenue forecast', { error });
            throw error;
        }
    }
}
exports.RevenueService = RevenueService;
exports.default = RevenueService;
//# sourceMappingURL=revenue.service.js.map