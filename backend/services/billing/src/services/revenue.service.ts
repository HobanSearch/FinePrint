import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { DateTime } from 'luxon';
import { Decimal } from 'decimal.js';

const prisma = new PrismaClient();

export interface RevenueRecognitionRule {
  productType: 'subscription' | 'usage' | 'one_time';
  recognitionMethod: 'immediate' | 'monthly' | 'usage_based';
  deferralPeriod?: number; // months
}

export interface RevenueEntry {
  id: string;
  invoiceId: string;
  userId: string;
  amount: Decimal;
  recognizedAmount: Decimal;
  deferredAmount: Decimal;
  recognitionDate: Date;
  productType: string;
  description: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RevenueReport {
  period: {
    startDate: Date;
    endDate: Date;
  };
  totalRevenue: number;
  recognizedRevenue: number;
  deferredRevenue: number;
  breakdown: {
    subscriptions: number;
    usage: number;
    oneTime: number;
  };
  monthlyRecognition: Array<{
    month: string;
    amount: number;
  }>;
  revenueByTier: Record<string, number>;
  cohortAnalysis: Array<{
    cohort: string;
    revenue: number;
    customers: number;
    averageRevenue: number;
  }>;
}

export interface ARRMetrics {
  arr: number; // Annual Recurring Revenue
  mrr: number; // Monthly Recurring Revenue
  growth: {
    mrr: number;
    arr: number;
    mom: number; // Month over Month
    yoy: number; // Year over Year
  };
  churn: {
    grossRevenueChurnRate: number;
    netRevenueChurnRate: number;
    customerChurnRate: number;
  };
  ltv: number; // Lifetime Value
  arpu: number; // Average Revenue Per User
}

export class RevenueService {
  /**
   * Revenue recognition rules
   */
  private static recognitionRules: Record<string, RevenueRecognitionRule> = {
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

  /**
   * Process revenue recognition for an invoice
   */
  static async processRevenueRecognition(invoiceId: string): Promise<void> {
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

      // Check if revenue has already been processed
      const existingRevenue = await prisma.revenueEntry.findFirst({
        where: { invoiceId },
      });

      if (existingRevenue) {
        logger.info('Revenue already processed for invoice', { invoiceId });
        return;
      }

      // Determine product type based on invoice
      const productType = this.determineProductType(invoice);
      const rule = this.recognitionRules[productType];

      if (!rule) {
        logger.warn('No revenue recognition rule found', { productType, invoiceId });
        return;
      }

      const amount = new Decimal(invoice.total.toString());

      // Create revenue entry based on recognition method
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

      logger.info('Revenue recognition processed', {
        invoiceId,
        amount: amount.toString(),
        productType,
        recognitionMethod: rule.recognitionMethod,
      });

    } catch (error) {
      logger.error('Failed to process revenue recognition', { error, invoiceId });
      throw error;
    }
  }

  /**
   * Create immediate revenue recognition entry
   */
  private static async createImmediateRevenueEntry(
    invoice: any,
    amount: Decimal,
    productType: string
  ): Promise<void> {
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

  /**
   * Create deferred revenue recognition entries
   */
  private static async createDeferredRevenueEntries(
    invoice: any,
    amount: Decimal,
    productType: string,
    deferralPeriod: number
  ): Promise<void> {
    const monthlyAmount = amount.dividedBy(deferralPeriod);
    const invoiceDate = DateTime.fromJSDate(invoice.periodStart || invoice.createdAt);

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

  /**
   * Create usage-based revenue recognition entry
   */
  private static async createUsageBasedRevenueEntry(
    invoice: any,
    amount: Decimal,
    productType: string
  ): Promise<void> {
    // Usage revenue is recognized immediately when the service is delivered
    await this.createImmediateRevenueEntry(invoice, amount, productType);
  }

  /**
   * Generate comprehensive revenue report
   */
  static async generateRevenueReport(
    startDate: Date,
    endDate: Date,
    options: {
      includeCohorts?: boolean;
      includeProjections?: boolean;
    } = {}
  ): Promise<RevenueReport> {
    try {
      // Get revenue entries for the period
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

      // Calculate totals
      const totalRevenue = revenueEntries.reduce(
        (sum, entry) => sum + Number(entry.amount),
        0
      );

      const recognizedRevenue = revenueEntries.reduce(
        (sum, entry) => sum + Number(entry.recognizedAmount),
        0
      );

      const deferredRevenue = revenueEntries.reduce(
        (sum, entry) => sum + Number(entry.deferredAmount),
        0
      );

      // Revenue breakdown by product type
      const breakdown = revenueEntries.reduce(
        (acc, entry) => {
          const type = entry.productType;
          const amount = Number(entry.recognizedAmount);

          if (type === 'subscription') {
            acc.subscriptions += amount;
          } else if (type === 'usage') {
            acc.usage += amount;
          } else {
            acc.oneTime += amount;
          }

          return acc;
        },
        { subscriptions: 0, usage: 0, oneTime: 0 }
      );

      // Monthly recognition pattern
      const monthlyRecognition = this.calculateMonthlyRecognition(revenueEntries);

      // Revenue by tier
      const revenueByTier = revenueEntries.reduce((acc, entry) => {
        const tier = entry.user?.subscriptionTier || 'unknown';
        acc[tier] = (acc[tier] || 0) + Number(entry.recognizedAmount);
        return acc;
      }, {} as Record<string, number>);

      // Cohort analysis (if requested)
      let cohortAnalysis: any[] = [];
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

    } catch (error) {
      logger.error('Failed to generate revenue report', { error, startDate, endDate });
      throw error;
    }
  }

  /**
   * Calculate ARR (Annual Recurring Revenue) and related metrics
   */
  static async calculateARRMetrics(asOfDate: Date = new Date()): Promise<ARRMetrics> {
    try {
      // Get current month's MRR
      const currentMonth = DateTime.fromJSDate(asOfDate).startOf('month');
      const previousMonth = currentMonth.minus({ months: 1 });
      const previousYear = currentMonth.minus({ years: 1 });

      // Calculate current MRR from active subscriptions
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

      // Calculate previous month's MRR
      const previousMonthSubscriptions = await this.getMRRForMonth(previousMonth.toJSDate());
      const previousYearMRR = await this.getMRRForMonth(previousYear.toJSDate());

      // Calculate growth rates
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

      // Calculate churn metrics
      const churnMetrics = await this.calculateChurnMetrics(currentMonth.toJSDate());

      // Calculate LTV and ARPU
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

    } catch (error) {
      logger.error('Failed to calculate ARR metrics', { error, asOfDate });
      throw error;
    }
  }

  /**
   * Get MRR for a specific month
   */
  private static async getMRRForMonth(date: Date): Promise<{ mrr: number; customers: number }> {
    const monthStart = DateTime.fromJSDate(date).startOf('month');
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

  /**
   * Calculate churn metrics
   */
  private static async calculateChurnMetrics(asOfDate: Date): Promise<{
    grossRevenueChurnRate: number;
    netRevenueChurnRate: number;
    customerChurnRate: number;
  }> {
    const currentMonth = DateTime.fromJSDate(asOfDate);
    const previousMonth = currentMonth.minus({ months: 1 });

    // Get churned customers (canceled subscriptions)
    const churnedCustomers = await prisma.user.count({
      where: {
        subscriptionExpiresAt: {
          gte: previousMonth.startOf('month').toJSDate(),
          lte: previousMonth.endOf('month').toJSDate(),
        },
        subscriptionTier: 'free',
      },
    });

    // Get total customers at start of month
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

    // For simplicity, assume revenue churn equals customer churn
    // In practice, you'd calculate based on actual revenue lost vs gained
    const grossRevenueChurnRate = customerChurnRate;
    const netRevenueChurnRate = Math.max(0, grossRevenueChurnRate - 5); // Assume 5% expansion

    return {
      grossRevenueChurnRate,
      netRevenueChurnRate,
      customerChurnRate,
    };
  }

  /**
   * Calculate Lifetime Value
   */
  private static calculateLTV(arpu: number, churnRate: number): number {
    if (churnRate <= 0) return 0;
    return arpu / (churnRate / 100);
  }

  /**
   * Calculate monthly recognition pattern
   */
  private static calculateMonthlyRecognition(revenueEntries: any[]): Array<{
    month: string;
    amount: number;
  }> {
    const monthlyData = revenueEntries.reduce((acc, entry) => {
      const month = DateTime.fromJSDate(entry.recognitionDate).toFormat('yyyy-MM');
      acc[month] = (acc[month] || 0) + Number(entry.recognizedAmount);
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));
  }

  /**
   * Generate cohort analysis
   */
  private static async generateCohortAnalysis(
    startDate: Date,
    endDate: Date
  ): Promise<Array<{
    cohort: string;
    revenue: number;
    customers: number;
    averageRevenue: number;
  }>> {
    try {
      // Get users grouped by signup month
      const cohorts = await prisma.$queryRaw<any[]>`
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
        cohort: DateTime.fromJSDate(cohort.cohort_month).toFormat('yyyy-MM'),
        revenue: Number(cohort.revenue),
        customers: Number(cohort.customers),
        averageRevenue: Number(cohort.customers) > 0 
          ? Number(cohort.revenue) / Number(cohort.customers)
          : 0,
      }));

    } catch (error) {
      logger.error('Failed to generate cohort analysis', { error });
      return [];
    }
  }

  /**
   * Determine product type from invoice
   */
  private static determineProductType(invoice: any): string {
    // Check invoice metadata or line items to determine product type
    const metadata = typeof invoice.metadata === 'string' 
      ? JSON.parse(invoice.metadata || '{}')
      : invoice.metadata || {};

    if (metadata.productType) {
      return metadata.productType;
    }

    // Default logic based on invoice characteristics
    if (invoice.subscriptionId) {
      return 'subscription';
    }

    // Check if this is usage-based billing
    if (metadata.usage || metadata.overage) {
      return 'usage';
    }

    return 'one_time';
  }

  /**
   * Process monthly revenue recognition batch
   */
  static async processMonthlyRecognition(): Promise<void> {
    try {
      const currentDate = new Date();
      
      // Get deferred revenue entries that should be recognized this month
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

      logger.info('Processing monthly revenue recognition', {
        entries: entriesToRecognize.length,
        date: currentDate.toISOString(),
      });

      // This would typically trigger accounting system updates
      // For now, we just log the recognition events
      for (const entry of entriesToRecognize) {
        logger.info('Revenue recognized', {
          entryId: entry.id,
          amount: entry.recognizedAmount,
          invoiceId: entry.invoiceId,
          userId: entry.userId,
        });
      }

    } catch (error) {
      logger.error('Failed to process monthly revenue recognition', { error });
      throw error;
    }
  }

  /**
   * Get revenue forecast
   */
  static async getRevenueForecast(
    months: number = 12
  ): Promise<Array<{
    month: string;
    forecastedRevenue: number;
    confidence: number;
  }>> {
    try {
      // Get historical data for trend analysis
      const historicalData = await prisma.revenueEntry.findMany({
        where: {
          recognitionDate: {
            gte: DateTime.now().minus({ months: 12 }).toJSDate(),
            lte: new Date(),
          },
        },
        select: {
          recognitionDate: true,
          recognizedAmount: true,
        },
      });

      // Simple linear forecast based on trend
      const monthlyRevenue = this.calculateMonthlyRecognition(historicalData);
      const forecast: Array<{ month: string; forecastedRevenue: number; confidence: number }> = [];

      // Calculate trend
      const recentMonths = monthlyRevenue.slice(-6); // Last 6 months
      const avgGrowth = recentMonths.length > 1 
        ? recentMonths.reduce((sum, month, index) => {
            if (index === 0) return sum;
            const previousMonth = recentMonths[index - 1];
            const growth = previousMonth.amount > 0 
              ? (month.amount - previousMonth.amount) / previousMonth.amount
              : 0;
            return sum + growth;
          }, 0) / (recentMonths.length - 1)
        : 0.05; // Default 5% growth

      const lastMonthRevenue = recentMonths[recentMonths.length - 1]?.amount || 0;

      // Generate forecast
      for (let i = 1; i <= months; i++) {
        const forecastMonth = DateTime.now().plus({ months: i });
        const forecastedRevenue = lastMonthRevenue * Math.pow(1 + avgGrowth, i);
        
        // Confidence decreases over time
        const confidence = Math.max(0.3, 0.9 - (i * 0.05));

        forecast.push({
          month: forecastMonth.toFormat('yyyy-MM'),
          forecastedRevenue,
          confidence,
        });
      }

      return forecast;

    } catch (error) {
      logger.error('Failed to generate revenue forecast', { error });
      throw error;
    }
  }
}

export default RevenueService;