/**
 * Stripe Integration Service
 * Handles payment processing, subscriptions, and billing for Fine Print AI
 */

import Stripe from 'stripe';
import { EventEmitter } from 'events';
import { createServiceLogger } from '../logger';
import Redis from 'ioredis';

const logger = createServiceLogger('stripe-service');

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  limits: {
    documentsPerMonth: number;
    apiCalls: number;
    teamMembers: number;
    advancedFeatures: boolean;
  };
  stripePriceId?: string;
}

export interface CustomerInfo {
  id: string;
  email: string;
  name: string;
  companyName?: string;
  stripeCustomerId?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  plan?: SubscriptionPlan;
}

export interface PaymentMethod {
  id: string;
  type: string;
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  amount: number;
  currency: string;
  status: string;
  dueDate?: Date;
  paidAt?: Date;
  items: Array<{
    description: string;
    amount: number;
    quantity: number;
  }>;
  downloadUrl?: string;
}

export interface UsageRecord {
  customerId: string;
  metric: 'documents_analyzed' | 'api_calls' | 'ai_credits';
  quantity: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class StripeService extends EventEmitter {
  private stripe: Stripe;
  private redis: Redis;
  private initialized: boolean = false;
  private webhookSecret: string;
  private plans: Map<string, SubscriptionPlan> = new Map();

  // Subscription plans
  private readonly PLANS: SubscriptionPlan[] = [
    {
      id: 'starter',
      name: 'Starter',
      description: 'Perfect for individuals and small teams',
      price: 29,
      currency: 'usd',
      interval: 'month',
      features: [
        '100 documents per month',
        '1,000 API calls',
        '2 team members',
        'Basic risk analysis',
        'Email support',
      ],
      limits: {
        documentsPerMonth: 100,
        apiCalls: 1000,
        teamMembers: 2,
        advancedFeatures: false,
      },
    },
    {
      id: 'professional',
      name: 'Professional',
      description: 'For growing businesses with advanced needs',
      price: 99,
      currency: 'usd',
      interval: 'month',
      features: [
        '500 documents per month',
        '10,000 API calls',
        '10 team members',
        'Advanced risk analysis',
        'Custom risk profiles',
        'Priority support',
        'API access',
      ],
      limits: {
        documentsPerMonth: 500,
        apiCalls: 10000,
        teamMembers: 10,
        advancedFeatures: true,
      },
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'Custom solutions for large organizations',
      price: 499,
      currency: 'usd',
      interval: 'month',
      features: [
        'Unlimited documents',
        'Unlimited API calls',
        'Unlimited team members',
        'Custom AI models',
        'Dedicated support',
        'SLA guarantee',
        'On-premise deployment',
      ],
      limits: {
        documentsPerMonth: -1, // Unlimited
        apiCalls: -1,
        teamMembers: -1,
        advancedFeatures: true,
      },
    },
  ];

  constructor() {
    super();

    // Initialize Stripe
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2023-10-16',
    });

    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

    // Initialize Redis for caching
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 6, // Dedicated DB for Stripe
    });

    // Load plans
    this.PLANS.forEach(plan => {
      this.plans.set(plan.id, plan);
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Stripe Service...');

      // Test Stripe connection
      await this.stripe.balance.retrieve();

      // Sync products and prices with Stripe
      await this.syncProductsAndPrices();

      // Test Redis connection
      await this.redis.ping();

      this.initialized = true;
      logger.info('Stripe Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Stripe Service', { error });
      throw error;
    }
  }

  /**
   * Create a new customer
   */
  async createCustomer(customerInfo: Omit<CustomerInfo, 'stripeCustomerId'>): Promise<CustomerInfo> {
    try {
      const stripeCustomer = await this.stripe.customers.create({
        email: customerInfo.email,
        name: customerInfo.name,
        metadata: {
          userId: customerInfo.id,
          companyName: customerInfo.companyName || '',
        },
      });

      const customer: CustomerInfo = {
        ...customerInfo,
        stripeCustomerId: stripeCustomer.id,
      };

      // Cache customer info
      await this.cacheCustomer(customer);

      logger.info('Customer created', {
        customerId: customer.id,
        stripeCustomerId: stripeCustomer.id,
      });

      this.emit('customer:created', customer);

      return customer;
    } catch (error) {
      logger.error('Failed to create customer', { error, customerInfo });
      throw error;
    }
  }

  /**
   * Create a subscription
   */
  async createSubscription(
    customerId: string,
    planId: string,
    paymentMethodId?: string
  ): Promise<Stripe.Subscription> {
    try {
      const customer = await this.getCustomer(customerId);
      if (!customer || !customer.stripeCustomerId) {
        throw new Error('Customer not found or not synced with Stripe');
      }

      const plan = this.plans.get(planId);
      if (!plan || !plan.stripePriceId) {
        throw new Error('Plan not found or not synced with Stripe');
      }

      // Attach payment method if provided
      if (paymentMethodId) {
        await this.stripe.paymentMethods.attach(paymentMethodId, {
          customer: customer.stripeCustomerId,
        });

        await this.stripe.customers.update(customer.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      }

      // Create subscription
      const subscription = await this.stripe.subscriptions.create({
        customer: customer.stripeCustomerId,
        items: [{ price: plan.stripePriceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          planId,
          userId: customerId,
        },
      });

      // Update customer with subscription info
      customer.subscriptionId = subscription.id;
      customer.subscriptionStatus = subscription.status;
      customer.plan = plan;
      await this.cacheCustomer(customer);

      logger.info('Subscription created', {
        customerId,
        subscriptionId: subscription.id,
        planId,
      });

      this.emit('subscription:created', {
        customerId,
        subscription,
        plan,
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to create subscription', { error, customerId, planId });
      throw error;
    }
  }

  /**
   * Update subscription
   */
  async updateSubscription(
    subscriptionId: string,
    updates: {
      planId?: string;
      quantity?: number;
      cancelAtPeriodEnd?: boolean;
    }
  ): Promise<Stripe.Subscription> {
    try {
      const updateParams: Stripe.SubscriptionUpdateParams = {};

      if (updates.planId) {
        const plan = this.plans.get(updates.planId);
        if (!plan || !plan.stripePriceId) {
          throw new Error('Plan not found');
        }

        const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
        updateParams.items = [{
          id: subscription.items.data[0].id,
          price: plan.stripePriceId,
        }];
      }

      if (updates.quantity !== undefined) {
        updateParams.items = updateParams.items || [];
        updateParams.items[0] = {
          ...updateParams.items[0],
          quantity: updates.quantity,
        };
      }

      if (updates.cancelAtPeriodEnd !== undefined) {
        updateParams.cancel_at_period_end = updates.cancelAtPeriodEnd;
      }

      const subscription = await this.stripe.subscriptions.update(
        subscriptionId,
        updateParams
      );

      logger.info('Subscription updated', {
        subscriptionId,
        updates,
      });

      this.emit('subscription:updated', {
        subscriptionId,
        subscription,
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to update subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    immediately: boolean = false
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = immediately
        ? await this.stripe.subscriptions.del(subscriptionId)
        : await this.stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true,
          });

      logger.info('Subscription cancelled', {
        subscriptionId,
        immediately,
      });

      this.emit('subscription:cancelled', {
        subscriptionId,
        subscription,
      });

      return subscription;
    } catch (error) {
      logger.error('Failed to cancel subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Add payment method
   */
  async addPaymentMethod(
    customerId: string,
    paymentMethodId: string,
    setAsDefault: boolean = false
  ): Promise<PaymentMethod> {
    try {
      const customer = await this.getCustomer(customerId);
      if (!customer || !customer.stripeCustomerId) {
        throw new Error('Customer not found');
      }

      // Attach payment method
      const stripePaymentMethod = await this.stripe.paymentMethods.attach(
        paymentMethodId,
        { customer: customer.stripeCustomerId }
      );

      // Set as default if requested
      if (setAsDefault) {
        await this.stripe.customers.update(customer.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      }

      const paymentMethod: PaymentMethod = {
        id: stripePaymentMethod.id,
        type: stripePaymentMethod.type,
        last4: stripePaymentMethod.card?.last4,
        brand: stripePaymentMethod.card?.brand,
        expiryMonth: stripePaymentMethod.card?.exp_month,
        expiryYear: stripePaymentMethod.card?.exp_year,
        isDefault: setAsDefault,
      };

      logger.info('Payment method added', {
        customerId,
        paymentMethodId,
      });

      return paymentMethod;
    } catch (error) {
      logger.error('Failed to add payment method', { error, customerId });
      throw error;
    }
  }

  /**
   * List payment methods
   */
  async listPaymentMethods(customerId: string): Promise<PaymentMethod[]> {
    try {
      const customer = await this.getCustomer(customerId);
      if (!customer || !customer.stripeCustomerId) {
        throw new Error('Customer not found');
      }

      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customer.stripeCustomerId,
        type: 'card',
      });

      // Get default payment method
      const stripeCustomer = await this.stripe.customers.retrieve(customer.stripeCustomerId);
      const defaultPaymentMethodId = 
        (stripeCustomer as Stripe.Customer).invoice_settings?.default_payment_method;

      return paymentMethods.data.map(pm => ({
        id: pm.id,
        type: pm.type,
        last4: pm.card?.last4,
        brand: pm.card?.brand,
        expiryMonth: pm.card?.exp_month,
        expiryYear: pm.card?.exp_year,
        isDefault: pm.id === defaultPaymentMethodId,
      }));
    } catch (error) {
      logger.error('Failed to list payment methods', { error, customerId });
      throw error;
    }
  }

  /**
   * Record usage for metered billing
   */
  async recordUsage(usage: UsageRecord): Promise<void> {
    try {
      const customer = await this.getCustomer(usage.customerId);
      if (!customer || !customer.subscriptionId) {
        throw new Error('Customer or subscription not found');
      }

      // Get subscription to find the metered item
      const subscription = await this.stripe.subscriptions.retrieve(customer.subscriptionId);
      const meteredItem = subscription.items.data.find(
        item => item.price.recurring?.usage_type === 'metered'
      );

      if (meteredItem) {
        await this.stripe.subscriptionItems.createUsageRecord(
          meteredItem.id,
          {
            quantity: usage.quantity,
            timestamp: Math.floor(usage.timestamp.getTime() / 1000),
            action: 'increment',
          }
        );

        logger.info('Usage recorded', {
          customerId: usage.customerId,
          metric: usage.metric,
          quantity: usage.quantity,
        });
      }

      // Store usage in Redis for analytics
      const key = `usage:${usage.customerId}:${usage.metric}:${usage.timestamp.toISOString().split('T')[0]}`;
      await this.redis.hincrby(key, 'total', usage.quantity);
      await this.redis.expire(key, 86400 * 30); // 30 days

      this.emit('usage:recorded', usage);
    } catch (error) {
      logger.error('Failed to record usage', { error, usage });
      throw error;
    }
  }

  /**
   * Get invoices for a customer
   */
  async getInvoices(
    customerId: string,
    limit: number = 10
  ): Promise<Invoice[]> {
    try {
      const customer = await this.getCustomer(customerId);
      if (!customer || !customer.stripeCustomerId) {
        throw new Error('Customer not found');
      }

      const invoices = await this.stripe.invoices.list({
        customer: customer.stripeCustomerId,
        limit,
      });

      return invoices.data.map(inv => ({
        id: inv.id,
        number: inv.number || '',
        customerId,
        amount: inv.amount_paid / 100, // Convert from cents
        currency: inv.currency,
        status: inv.status || 'draft',
        dueDate: inv.due_date ? new Date(inv.due_date * 1000) : undefined,
        paidAt: inv.status_transitions?.paid_at 
          ? new Date(inv.status_transitions.paid_at * 1000) 
          : undefined,
        items: inv.lines.data.map(line => ({
          description: line.description || '',
          amount: line.amount / 100,
          quantity: line.quantity || 1,
        })),
        downloadUrl: inv.invoice_pdf,
      }));
    } catch (error) {
      logger.error('Failed to get invoices', { error, customerId });
      throw error;
    }
  }

  /**
   * Create a checkout session
   */
  async createCheckoutSession(
    customerId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<Stripe.Checkout.Session> {
    try {
      const customer = await this.getCustomer(customerId);
      const plan = this.plans.get(planId);
      
      if (!plan || !plan.stripePriceId) {
        throw new Error('Plan not found');
      }

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price: plan.stripePriceId,
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: customer?.stripeCustomerId,
        customer_email: customer ? undefined : customer?.email,
        metadata: {
          userId: customerId,
          planId,
        },
      });

      logger.info('Checkout session created', {
        customerId,
        sessionId: session.id,
      });

      return session;
    } catch (error) {
      logger.error('Failed to create checkout session', { error });
      throw error;
    }
  }

  /**
   * Create a billing portal session
   */
  async createBillingPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<Stripe.BillingPortal.Session> {
    try {
      const customer = await this.getCustomer(customerId);
      if (!customer || !customer.stripeCustomerId) {
        throw new Error('Customer not found');
      }

      const session = await this.stripe.billingPortal.sessions.create({
        customer: customer.stripeCustomerId,
        return_url: returnUrl,
      });

      logger.info('Billing portal session created', {
        customerId,
        sessionId: session.id,
      });

      return session;
    } catch (error) {
      logger.error('Failed to create billing portal session', { error });
      throw error;
    }
  }

  /**
   * Handle webhook event
   */
  async handleWebhook(
    signature: string,
    payload: string | Buffer
  ): Promise<void> {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );

      logger.info('Webhook received', {
        type: event.type,
        id: event.id,
      });

      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await this.handleSubscriptionEvent(event);
          break;

        case 'invoice.payment_succeeded':
        case 'invoice.payment_failed':
          await this.handleInvoiceEvent(event);
          break;

        case 'payment_method.attached':
        case 'payment_method.detached':
          await this.handlePaymentMethodEvent(event);
          break;

        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event);
          break;

        default:
          logger.debug('Unhandled webhook event type', { type: event.type });
      }

      this.emit('webhook:processed', event);
    } catch (error) {
      logger.error('Failed to handle webhook', { error });
      throw error;
    }
  }

  // Private helper methods

  private async syncProductsAndPrices(): Promise<void> {
    for (const plan of this.PLANS) {
      try {
        // Check if product exists
        const products = await this.stripe.products.list({
          limit: 100,
        });

        let product = products.data.find(p => p.metadata.planId === plan.id);

        if (!product) {
          // Create product
          product = await this.stripe.products.create({
            name: plan.name,
            description: plan.description,
            metadata: {
              planId: plan.id,
            },
          });
        }

        // Check if price exists
        const prices = await this.stripe.prices.list({
          product: product.id,
          limit: 100,
        });

        let price = prices.data.find(p => 
          p.unit_amount === plan.price * 100 &&
          p.currency === plan.currency &&
          p.recurring?.interval === plan.interval
        );

        if (!price) {
          // Create price
          price = await this.stripe.prices.create({
            product: product.id,
            unit_amount: plan.price * 100, // Convert to cents
            currency: plan.currency,
            recurring: {
              interval: plan.interval,
            },
            metadata: {
              planId: plan.id,
            },
          });
        }

        // Update plan with Stripe IDs
        plan.stripePriceId = price.id;

        logger.info('Synced plan with Stripe', {
          planId: plan.id,
          productId: product.id,
          priceId: price.id,
        });
      } catch (error) {
        logger.error('Failed to sync plan', { error, planId: plan.id });
      }
    }
  }

  private async getCustomer(customerId: string): Promise<CustomerInfo | null> {
    // Check cache first
    const cached = await this.redis.get(`customer:${customerId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // TODO: Fetch from database
    return null;
  }

  private async cacheCustomer(customer: CustomerInfo): Promise<void> {
    await this.redis.setex(
      `customer:${customer.id}`,
      3600, // 1 hour
      JSON.stringify(customer)
    );
  }

  private async handleSubscriptionEvent(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.metadata.userId;

    if (customerId) {
      const customer = await this.getCustomer(customerId);
      if (customer) {
        customer.subscriptionId = subscription.id;
        customer.subscriptionStatus = subscription.status;
        
        // Update plan info
        if (subscription.items.data.length > 0) {
          const priceId = subscription.items.data[0].price.id;
          const plan = Array.from(this.plans.values()).find(
            p => p.stripePriceId === priceId
          );
          if (plan) {
            customer.plan = plan;
          }
        }

        await this.cacheCustomer(customer);
      }
    }

    this.emit(`subscription:${event.type.split('.').pop()}`, {
      subscription,
      customerId,
    });
  }

  private async handleInvoiceEvent(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.metadata?.userId;

    this.emit(`invoice:${event.type.split('.').pop()}`, {
      invoice,
      customerId,
    });
  }

  private async handlePaymentMethodEvent(event: Stripe.Event): Promise<void> {
    const paymentMethod = event.data.object as Stripe.PaymentMethod;

    this.emit(`payment_method:${event.type.split('.').pop()}`, {
      paymentMethod,
    });
  }

  private async handleCheckoutSessionCompleted(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    const { userId, planId } = session.metadata || {};

    if (userId && planId) {
      // Customer and subscription should be created automatically by Stripe
      logger.info('Checkout completed', {
        userId,
        planId,
        customerId: session.customer,
        subscriptionId: session.subscription,
      });
    }

    this.emit('checkout:completed', {
      session,
      userId,
      planId,
    });
  }

  /**
   * Get subscription plans
   */
  getPlans(): SubscriptionPlan[] {
    return Array.from(this.plans.values());
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): SubscriptionPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    this.redis.disconnect();
    logger.info('Stripe Service shutdown complete');
  }
}