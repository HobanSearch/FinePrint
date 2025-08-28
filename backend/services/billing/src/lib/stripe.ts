import Stripe from 'stripe';
import config from '../config';
import { logger } from '../utils/logger';

// Initialize Stripe with configuration
export const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
  apiVersion: config.STRIPE_API_VERSION as Stripe.LatestApiVersion,
  typescript: true,
  telemetry: false,
});

// Stripe webhook signature verification
export const verifyStripeSignature = (
  payload: string | Buffer,
  signature: string
): Stripe.Event => {
  try {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      config.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    logger.error('Stripe webhook signature verification failed', { error });
    throw new Error('Invalid webhook signature');
  }
};

// Helper function to create or retrieve customer
export const getOrCreateStripeCustomer = async (
  userId: string,
  email: string,
  name?: string,
  metadata?: Record<string, string>
): Promise<Stripe.Customer> => {
  try {
    // First, try to find existing customer by metadata
    const existingCustomers = await stripe.customers.list({
      email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      const customer = existingCustomers.data[0];
      
      // Update metadata if needed
      if (metadata && customer.metadata?.userId !== userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId, ...metadata },
        });
      }
      
      return customer;
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        userId,
        ...metadata,
      },
    });

    logger.info('Created new Stripe customer', {
      customerId: customer.id,
      userId,
      email,
    });

    return customer;
  } catch (error) {
    logger.error('Failed to create or retrieve Stripe customer', {
      error,
      userId,
      email,
    });
    throw error;
  }
};

// Helper function to format amount for Stripe (convert to cents)
export const formatStripeAmount = (amount: number, currency = 'usd'): number => {
  // Most currencies use cents, but some don't (e.g., JPY)
  const zeroDecimalCurrencies = ['jpy', 'krw', 'vnd'];
  
  if (zeroDecimalCurrencies.includes(currency.toLowerCase())) {
    return Math.round(amount);
  }
  
  return Math.round(amount * 100);
};

// Helper function to format amount from Stripe (convert from cents)
export const formatAmountFromStripe = (amount: number, currency = 'usd'): number => {
  const zeroDecimalCurrencies = ['jpy', 'krw', 'vnd'];
  
  if (zeroDecimalCurrencies.includes(currency.toLowerCase())) {
    return amount;
  }
  
  return amount / 100;
};

// Create setup intent for payment method collection
export const createSetupIntent = async (
  customerId: string,
  metadata?: Record<string, string>
): Promise<Stripe.SetupIntent> => {
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata,
    });

    return setupIntent;
  } catch (error) {
    logger.error('Failed to create setup intent', { error, customerId });
    throw error;
  }
};

// Create payment intent for one-time payments
export const createPaymentIntent = async (
  amount: number,
  currency: string,
  customerId: string,
  paymentMethodId?: string,
  metadata?: Record<string, string>
): Promise<Stripe.PaymentIntent> => {
  try {
    const paymentIntentData: Stripe.PaymentIntentCreateParams = {
      amount: formatStripeAmount(amount, currency),
      currency,
      customer: customerId,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    };

    if (paymentMethodId) {
      paymentIntentData.payment_method = paymentMethodId;
      paymentIntentData.confirmation_method = 'manual';
      paymentIntentData.confirm = true;
      paymentIntentData.return_url = `${process.env.FRONTEND_URL}/billing/success`;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    return paymentIntent;
  } catch (error) {
    logger.error('Failed to create payment intent', {
      error,
      amount,
      currency,
      customerId,
    });
    throw error;
  }
};

// Retry failed payment
export const retryFailedPayment = async (
  invoiceId: string
): Promise<Stripe.Invoice> => {
  try {
    const invoice = await stripe.invoices.pay(invoiceId, {
      forgive: false,
    });

    logger.info('Successfully retried failed payment', { invoiceId });
    return invoice;
  } catch (error) {
    logger.error('Failed to retry payment', { error, invoiceId });
    throw error;
  }
};

// Create usage record for metered billing
export const createUsageRecord = async (
  subscriptionItemId: string,
  quantity: number,
  timestamp?: number,
  action: 'increment' | 'set' = 'increment'
): Promise<Stripe.UsageRecord> => {
  try {
    const usageRecord = await stripe.subscriptionItems.createUsageRecord(
      subscriptionItemId,
      {
        quantity,
        timestamp: timestamp || Math.floor(Date.now() / 1000),
        action,
      }
    );

    return usageRecord;
  } catch (error) {
    logger.error('Failed to create usage record', {
      error,
      subscriptionItemId,
      quantity,
    });
    throw error;
  }
};

// Retrieve upcoming invoice preview
export const getUpcomingInvoice = async (
  customerId: string,
  subscriptionId?: string
): Promise<Stripe.Invoice> => {
  try {
    const params: Stripe.InvoiceRetrieveUpcomingParams = {
      customer: customerId,
    };

    if (subscriptionId) {
      params.subscription = subscriptionId;
    }

    const invoice = await stripe.invoices.retrieveUpcoming(params);
    return invoice;
  } catch (error) {
    logger.error('Failed to retrieve upcoming invoice', {
      error,
      customerId,
      subscriptionId,
    });
    throw error;
  }
};

// Calculate tax for invoice
export const calculateTax = async (
  customerId: string,
  lineItems: Array<{
    amount: number;
    currency: string;
    description?: string;
  }>
): Promise<Stripe.Tax.Calculation> => {
  try {
    const calculation = await stripe.tax.calculations.create({
      currency: lineItems[0]?.currency || 'usd',
      customer: customerId,
      line_items: lineItems.map((item, index) => ({
        amount: formatStripeAmount(item.amount, item.currency),
        reference: `item_${index}`,
      })),
    });

    return calculation;
  } catch (error) {
    logger.error('Failed to calculate tax', { error, customerId });
    throw error;
  }
};

export { Stripe };