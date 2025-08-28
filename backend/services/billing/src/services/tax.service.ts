import { PrismaClient } from '@prisma/client';
import { stripe, calculateTax } from '../lib/stripe';
import config from '../config';
import { logger } from '../utils/logger';
import { TaxProvider, TaxCalculation } from '../models/billing';
import { Decimal } from 'decimal.js';
import axios from 'axios';

const prisma = new PrismaClient();

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

export class TaxService {
  private static taxSettings: TaxSettings = {
    enabled: config.ENABLE_TAX_CALCULATION === 'true',
    provider: TaxProvider.STRIPE_TAX,
    autoCollect: true,
    nexusCountries: ['US', 'CA', 'GB', 'DE', 'FR'],
    nexusStates: ['CA', 'NY', 'TX', 'FL', 'WA'],
    taxExemptCustomers: [],
  };

  /**
   * Calculate tax for a transaction
   */
  static async calculateTaxForTransaction(
    request: TaxCalculationRequest
  ): Promise<TaxCalculationResult> {
    try {
      if (!this.taxSettings.enabled) {
        return {
          totalTax: 0,
          taxRate: 0,
          taxBreakdown: [],
          provider: TaxProvider.STRIPE_TAX,
          jurisdiction: 'None',
        };
      }

      // Check if customer is in a tax nexus
      const isInNexus = this.isCustomerInTaxNexus(request.customerAddress);
      if (!isInNexus) {
        logger.info('Customer not in tax nexus', { 
          country: request.customerAddress.country,
          state: request.customerAddress.state,
        });
        return {
          totalTax: 0,
          taxRate: 0,
          taxBreakdown: [],
          provider: TaxProvider.STRIPE_TAX,
          jurisdiction: `${request.customerAddress.country}-${request.customerAddress.state || 'Unknown'}`,
        };
      }

      // Check if customer is tax exempt
      const isExempt = await this.isCustomerTaxExempt(request.customerId);
      if (isExempt) {
        logger.info('Customer is tax exempt', { customerId: request.customerId });
        return {
          totalTax: 0,
          taxRate: 0,
          taxBreakdown: [],
          provider: TaxProvider.STRIPE_TAX,
          jurisdiction: `${request.customerAddress.country}-${request.customerAddress.state || 'Unknown'}`,
        };
      }

      // Calculate tax based on configured provider
      switch (this.taxSettings.provider) {
        case TaxProvider.STRIPE_TAX:
          return await this.calculateWithStripeTax(request);
        
        case TaxProvider.TAXJAR:
          return await this.calculateWithTaxJar(request);
        
        case TaxProvider.AVATAX:
          return await this.calculateWithAvaTax(request);
        
        default:
          throw new Error(`Unsupported tax provider: ${this.taxSettings.provider}`);
      }

    } catch (error) {
      logger.error('Failed to calculate tax', { error, request });
      throw error;
    }
  }

  /**
   * Calculate tax using Stripe Tax
   */
  private static async calculateWithStripeTax(
    request: TaxCalculationRequest
  ): Promise<TaxCalculationResult> {
    try {
      // Update customer address in Stripe
      await stripe.customers.update(request.customerId, {
        address: {
          country: request.customerAddress.country,
          state: request.customerAddress.state,
          city: request.customerAddress.city,
          postal_code: request.customerAddress.postalCode,
          line1: request.customerAddress.line1,
          line2: request.customerAddress.line2,
        },
      });

      // Calculate tax using Stripe Tax
      const calculation = await calculateTax(request.customerId, request.lineItems);

      const taxBreakdown = calculation.tax_breakdown.map(breakdown => ({
        name: breakdown.jurisdiction.display_name,
        rate: breakdown.tax_rate_details.percentage_decimal,
        amount: breakdown.tax_amount / 100,
        type: breakdown.tax_rate_details.tax_type,
      }));

      const totalTax = calculation.tax_amount_inclusive / 100;
      const totalAmount = request.lineItems.reduce((sum, item) => sum + item.amount, 0);
      const taxRate = totalAmount > 0 ? (totalTax / totalAmount) * 100 : 0;

      return {
        totalTax,
        taxRate,
        taxBreakdown,
        provider: TaxProvider.STRIPE_TAX,
        jurisdiction: calculation.tax_breakdown[0]?.jurisdiction?.display_name || 'Unknown',
      };

    } catch (error) {
      logger.error('Stripe Tax calculation failed', { error, customerId: request.customerId });
      throw error;
    }
  }

  /**
   * Calculate tax using TaxJar
   */
  private static async calculateWithTaxJar(
    request: TaxCalculationRequest
  ): Promise<TaxCalculationResult> {
    try {
      if (!config.TAXJAR_API_KEY) {
        throw new Error('TaxJar API key not configured');
      }

      const taxJarRequest = {
        from_country: 'US',
        from_zip: '94107',
        from_state: 'CA',
        from_city: 'San Francisco',
        from_street: '123 Main St',
        to_country: request.customerAddress.country,
        to_zip: request.customerAddress.postalCode,
        to_state: request.customerAddress.state,
        to_city: request.customerAddress.city,
        to_street: request.customerAddress.line1,
        amount: request.lineItems.reduce((sum, item) => sum + item.amount, 0),
        shipping: 0,
        line_items: request.lineItems.map((item, index) => ({
          id: index.toString(),
          quantity: 1,
          product_tax_code: item.taxCode || '31000', // Digital services
          unit_price: item.amount,
          discount: 0,
        })),
      };

      const response = await axios.post(
        'https://api.taxjar.com/v2/taxes',
        taxJarRequest,
        {
          headers: {
            'Authorization': `Token token="${config.TAXJAR_API_KEY}"`,
            'Content-Type': 'application/json',
          },
        }
      );

      const taxData = response.data.tax;

      const taxBreakdown = [
        {
          name: `${taxData.jurisdictions.state || taxData.jurisdictions.country} Tax`,
          rate: taxData.rate * 100,
          amount: taxData.amount_to_collect,
          type: 'sales_tax',
        },
      ];

      return {
        totalTax: taxData.amount_to_collect,
        taxRate: taxData.rate * 100,
        taxBreakdown,
        provider: TaxProvider.TAXJAR,
        jurisdiction: `${request.customerAddress.country}-${request.customerAddress.state || 'Unknown'}`,
      };

    } catch (error) {
      logger.error('TaxJar calculation failed', { error, customerId: request.customerId });
      throw error;
    }
  }

  /**
   * Calculate tax using Avalara AvaTax
   */
  private static async calculateWithAvaTax(
    request: TaxCalculationRequest
  ): Promise<TaxCalculationResult> {
    try {
      if (!config.AVATAX_API_KEY) {
        throw new Error('AvaTax API key not configured');
      }

      const avaTaxRequest = {
        companyCode: 'FINEPRINTAI',
        type: 'SalesInvoice',
        customerCode: request.customerId,
        date: new Date().toISOString().split('T')[0],
        lines: request.lineItems.map((item, index) => ({
          number: (index + 1).toString(),
          quantity: 1,
          amount: item.amount,
          taxCode: item.taxCode || 'SW054001', // SaaS/Software
          description: item.description,
          addresses: {
            ShipFrom: {
              line1: '123 Main St',
              city: 'San Francisco',
              region: 'CA',
              country: 'US',
              postalCode: '94107',
            },
            ShipTo: {
              line1: request.customerAddress.line1,
              city: request.customerAddress.city,
              region: request.customerAddress.state,
              country: request.customerAddress.country,
              postalCode: request.customerAddress.postalCode,
            },
          },
        })),
        commit: false,
        currencyCode: request.currency.toUpperCase(),
      };

      const response = await axios.post(
        'https://rest.avatax.com/api/v2/transactions/create',
        avaTaxRequest,
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`accountId:${config.AVATAX_API_KEY}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const transaction = response.data;

      const taxBreakdown = transaction.lines.map((line: any) => ({
        name: line.details[0]?.jurisName || 'Tax',
        rate: line.details[0]?.rate * 100 || 0,
        amount: line.tax,
        type: line.details[0]?.taxType || 'sales_tax',
      }));

      return {
        totalTax: transaction.totalTax,
        taxRate: transaction.totalAmount > 0 ? (transaction.totalTax / transaction.totalAmount) * 100 : 0,
        taxBreakdown,
        provider: TaxProvider.AVATAX,
        jurisdiction: `${request.customerAddress.country}-${request.customerAddress.state || 'Unknown'}`,
      };

    } catch (error) {
      logger.error('AvaTax calculation failed', { error, customerId: request.customerId });
      throw error;
    }
  }

  /**
   * Save tax calculation record
   */
  static async saveTaxCalculation(
    userId: string,
    calculation: TaxCalculationResult,
    customerAddress: TaxCalculationRequest['customerAddress'],
    invoiceId?: string
  ): Promise<TaxCalculation> {
    try {
      const taxCalculation = await prisma.taxCalculation.create({
        data: {
          userId,
          invoiceId,
          country: customerAddress.country,
          region: customerAddress.state,
          postalCode: customerAddress.postalCode,
          taxRate: new Decimal(calculation.taxRate),
          taxAmount: new Decimal(calculation.totalTax),
          taxType: calculation.taxBreakdown[0]?.type || 'sales_tax',
          provider: calculation.provider,
          metadata: JSON.stringify({
            jurisdiction: calculation.jurisdiction,
            breakdown: calculation.taxBreakdown,
          }),
        },
      });

      return taxCalculation as TaxCalculation;

    } catch (error) {
      logger.error('Failed to save tax calculation', { error, userId });
      throw error;
    }
  }

  /**
   * Check if customer is in tax nexus
   */
  private static isCustomerInTaxNexus(address: TaxCalculationRequest['customerAddress']): boolean {
    // Check country nexus
    if (!this.taxSettings.nexusCountries.includes(address.country)) {
      return false;
    }

    // For US customers, check state nexus
    if (address.country === 'US' && address.state) {
      return this.taxSettings.nexusStates.includes(address.state);
    }

    return true;
  }

  /**
   * Check if customer is tax exempt
   */
  private static async isCustomerTaxExempt(customerId: string): Promise<boolean> {
    try {
      // Check local tax exempt list
      if (this.taxSettings.taxExemptCustomers.includes(customerId)) {
        return true;
      }

      // Check if customer has tax exempt status in Stripe
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) return false;

      return (customer as any).tax_exempt === 'exempt';

    } catch (error) {
      logger.error('Failed to check tax exempt status', { error, customerId });
      return false;
    }
  }

  /**
   * Get tax rates for location
   */
  static async getTaxRatesForLocation(
    country: string,
    state?: string,
    city?: string,
    postalCode?: string
  ): Promise<{
    combinedRate: number;
    stateRate: number;
    countyRate: number;
    cityRate: number;
    specialRate: number;
  }> {
    try {
      if (!config.TAXJAR_API_KEY) {
        throw new Error('TaxJar API key required for tax rate lookup');
      }

      const params = new URLSearchParams({
        country,
        ...(state && { state }),
        ...(city && { city }),
        ...(postalCode && { zip: postalCode }),
      });

      const response = await axios.get(
        `https://api.taxjar.com/v2/rates?${params.toString()}`,
        {
          headers: {
            'Authorization': `Token token="${config.TAXJAR_API_KEY}"`,
          },
        }
      );

      const rates = response.data.rate;

      return {
        combinedRate: rates.combined_rate * 100,
        stateRate: rates.state_rate * 100,
        countyRate: rates.county_rate * 100,
        cityRate: rates.city_rate * 100,
        specialRate: rates.special_rate * 100,
      };

    } catch (error) {
      logger.error('Failed to get tax rates for location', { 
        error, 
        country, 
        state, 
        city, 
        postalCode 
      });
      throw error;
    }
  }

  /**
   * Update tax settings
   */
  static async updateTaxSettings(settings: Partial<TaxSettings>): Promise<TaxSettings> {
    this.taxSettings = { ...this.taxSettings, ...settings };
    
    logger.info('Tax settings updated', { settings: this.taxSettings });
    
    return this.taxSettings;
  }

  /**
   * Get current tax settings
   */
  static getTaxSettings(): TaxSettings {
    return this.taxSettings;
  }

  /**
   * Validate tax calculation
   */
  static async validateTaxCalculation(
    calculationId: string
  ): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const calculation = await prisma.taxCalculation.findUnique({
        where: { id: calculationId },
      });

      if (!calculation) {
        return {
          valid: false,
          errors: ['Tax calculation not found'],
        };
      }

      const errors: string[] = [];

      // Validate tax rate is reasonable (0-50%)
      const taxRatePercent = Number(calculation.taxRate);
      if (taxRatePercent < 0 || taxRatePercent > 50) {
        errors.push(`Invalid tax rate: ${taxRatePercent}%`);
      }

      // Validate tax amount is positive
      const taxAmount = Number(calculation.taxAmount);
      if (taxAmount < 0) {
        errors.push(`Invalid tax amount: ${taxAmount}`);
      }

      // Validate jurisdiction format
      if (!calculation.country || calculation.country.length !== 2) {
        errors.push(`Invalid country code: ${calculation.country}`);
      }

      return {
        valid: errors.length === 0,
        errors,
      };

    } catch (error) {
      logger.error('Failed to validate tax calculation', { error, calculationId });
      return {
        valid: false,
        errors: ['Tax calculation validation failed'],
      };
    }
  }

  /**
   * Get tax summary for period
   */
  static async getTaxSummaryForPeriod(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalTaxCollected: number;
    taxByJurisdiction: Record<string, number>;
    taxByProvider: Record<string, number>;
    transactionCount: number;
  }> {
    try {
      const calculations = await prisma.taxCalculation.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      const totalTaxCollected = calculations.reduce(
        (sum, calc) => sum + Number(calc.taxAmount),
        0
      );

      const taxByJurisdiction: Record<string, number> = {};
      const taxByProvider: Record<string, number> = {};

      calculations.forEach(calc => {
        const jurisdiction = `${calc.country}-${calc.region || 'Unknown'}`;
        taxByJurisdiction[jurisdiction] = (taxByJurisdiction[jurisdiction] || 0) + Number(calc.taxAmount);
        
        taxByProvider[calc.provider] = (taxByProvider[calc.provider] || 0) + Number(calc.taxAmount);
      });

      return {
        totalTaxCollected,
        taxByJurisdiction,
        taxByProvider,
        transactionCount: calculations.length,
      };

    } catch (error) {
      logger.error('Failed to get tax summary', { error, startDate, endDate });
      throw error;
    }
  }

  /**
   * Generate tax report for compliance
   */
  static async generateTaxReport(
    startDate: Date,
    endDate: Date,
    jurisdiction?: string
  ): Promise<{
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
  }> {
    try {
      const whereClause: any = {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      };

      if (jurisdiction) {
        const [country, region] = jurisdiction.split('-');
        whereClause.country = country;
        if (region && region !== 'Unknown') {
          whereClause.region = region;
        }
      }

      const calculations = await prisma.taxCalculation.findMany({
        where: whereClause,
        orderBy: { createdAt: 'asc' },
      });

      const totalTaxCollected = calculations.reduce(
        (sum, calc) => sum + Number(calc.taxAmount),
        0
      );

      const averageTaxRate = calculations.length > 0
        ? calculations.reduce((sum, calc) => sum + Number(calc.taxRate), 0) / calculations.length
        : 0;

      const details = calculations.map(calc => ({
        date: calc.createdAt.toISOString().split('T')[0],
        customerId: calc.userId,
        invoiceId: calc.invoiceId || undefined,
        taxAmount: Number(calc.taxAmount),
        taxRate: Number(calc.taxRate),
        jurisdiction: `${calc.country}-${calc.region || 'Unknown'}`,
      }));

      const reportId = `tax-report-${Date.now()}`;

      logger.info('Tax report generated', {
        reportId,
        period: { startDate, endDate },
        jurisdiction,
        transactionCount: calculations.length,
        totalTax: totalTaxCollected,
      });

      return {
        reportId,
        summary: {
          totalTaxCollected,
          totalTransactions: calculations.length,
          averageTaxRate,
        },
        details,
      };

    } catch (error) {
      logger.error('Failed to generate tax report', { error, startDate, endDate, jurisdiction });
      throw error;
    }
  }
}

export default TaxService;