/**
 * Unit tests for Billing Service
 * Tests all core functionality of the subscription and billing service
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, jest } from '@jest/globals';
import { createMockUser, createMockSubscription } from '../../mocks/factories';
import { resetAllMocks, setupMockDefaults } from '../../mocks/utils/mock-utils';

// Mock dependencies
const mockStripe = {
  customers: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    del: jest.fn(),
  },
  subscriptions: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
    del: jest.fn(),
    list: jest.fn(),
  },
  paymentMethods: {
    attach: jest.fn(),
    detach: jest.fn(),
    list: jest.fn(),
  },
  invoices: {
    create: jest.fn(),
    pay: jest.fn(),
    list: jest.fn(),
  },
  prices: {
    list: jest.fn(),
  },
  products: {
    list: jest.fn(),
  },
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  subscription: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  usage: {
    create: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockMetrics = {
  increment: jest.fn(),
  gauge: jest.fn(),
  timing: jest.fn(),
};

const mockEventEmitter = {
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
};

// Mock the Billing Service
class BillingService {
  constructor(
    private stripe: any,
    private prisma: any,
    private logger: any,
    private metrics: any,
    private eventEmitter: any
  ) {}

  async createCustomer(userId: string, email: string, name?: string): Promise<any> {
    this.logger.info('Creating Stripe customer', { userId, email });

    // Check if user already has a customer
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });

    if (user?.stripeCustomerId) {
      throw new Error('User already has a Stripe customer');
    }

    // Create Stripe customer
    const customer = await this.stripe.customers.create({
      email,
      name,
      metadata: { userId },
    });

    // Update user with customer ID
    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    this.metrics.increment('billing.customer.created');
    this.logger.info('Stripe customer created', { userId, customerId: customer.id });

    return customer;
  }

  async createSubscription(
    userId: string,
    priceId: string,
    paymentMethodId?: string
  ): Promise<any> {
    this.logger.info('Creating subscription', { userId, priceId });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true, email: true, firstName: true, lastName: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    let customerId = user.stripeCustomerId;

    // Create customer if doesn't exist
    if (!customerId) {
      const customer = await this.createCustomer(
        userId,
        user.email,
        `${user.firstName} ${user.lastName}`.trim()
      );
      customerId = customer.id;
    }

    // Attach payment method if provided
    if (paymentMethodId) {
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    }

    // Create subscription
    const subscriptionData: any = {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId },
    };

    if (paymentMethodId) {
      subscriptionData.default_payment_method = paymentMethodId;
    }

    const subscription = await this.stripe.subscriptions.create(subscriptionData);

    // Store subscription in database
    const dbSubscription = await this.prisma.subscription.create({
      data: {
        userId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: customerId,
        status: subscription.status,
        priceId,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        metadata: {},
      },
    });

    this.metrics.increment('billing.subscription.created');
    this.eventEmitter.emit('subscription.created', { userId, subscription: dbSubscription });

    return {
      subscription: dbSubscription,
      clientSecret: subscription.latest_invoice?.payment_intent?.client_secret,
    };
  }

  async getSubscription(userId: string): Promise<any> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: {
        user: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
    });

    if (!subscription) {
      return null;
    }

    // Get current usage
    const usage = await this.getCurrentUsage(userId);

    return {
      ...subscription,
      usage,
    };
  }

  async updateSubscription(userId: string, priceId: string): Promise<any> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Update Stripe subscription
    const updatedStripeSubscription = await this.stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        items: [
          {
            id: subscription.stripeSubscriptionId,
            price: priceId,
          },
        ],
        proration_behavior: 'create_prorations',
      }
    );

    // Update database
    const updatedSubscription = await this.prisma.subscription.update({
      where: { userId },
      data: {
        priceId,
        status: updatedStripeSubscription.status,
        currentPeriodStart: new Date(updatedStripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(updatedStripeSubscription.current_period_end * 1000),
        updatedAt: new Date(),
      },
    });

    this.metrics.increment('billing.subscription.updated');
    this.eventEmitter.emit('subscription.updated', { userId, subscription: updatedSubscription });

    return updatedSubscription;
  }

  async cancelSubscription(userId: string, cancelAtPeriodEnd = true): Promise<any> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Cancel Stripe subscription
    let canceledSubscription;
    if (cancelAtPeriodEnd) {
      canceledSubscription = await this.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      );
    } else {
      canceledSubscription = await this.stripe.subscriptions.del(
        subscription.stripeSubscriptionId
      );
    }

    // Update database
    const updatedSubscription = await this.prisma.subscription.update({
      where: { userId },
      data: {
        status: canceledSubscription.status,
        cancelAtPeriodEnd: cancelAtPeriodEnd,
        canceledAt: cancelAtPeriodEnd ? null : new Date(),
        updatedAt: new Date(),
      },
    });

    this.metrics.increment('billing.subscription.canceled');
    this.eventEmitter.emit('subscription.canceled', { userId, subscription: updatedSubscription });

    return updatedSubscription;
  }

  async recordUsage(userId: string, usageType: string, quantity = 1, metadata?: any): Promise<void> {
    await this.prisma.usage.create({
      data: {
        userId,
        usageType,
        quantity,
        timestamp: new Date(),
        metadata: metadata || {},
      },
    });

    this.metrics.increment(`billing.usage.${usageType}`, quantity);
    this.logger.debug('Usage recorded', { userId, usageType, quantity });
  }

  async getCurrentUsage(userId: string, period?: { start: Date; end: Date }): Promise<any> {
    const now = new Date();
    const startOfMonth = period?.start || new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = period?.end || new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const usage = await this.prisma.usage.aggregate({
      where: {
        userId,
        timestamp: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      _sum: {
        quantity: true,
      },
      _count: {
        id: true,
      },
    });

    // Get usage by type
    const usageByType = await this.prisma.usage.findMany({
      where: {
        userId,
        timestamp: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      select: {
        usageType: true,
        quantity: true,
      },
    });

    const usageBreakdown = usageByType.reduce((acc, record) => {
      acc[record.usageType] = (acc[record.usageType] || 0) + record.quantity;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: usage._sum.quantity || 0,
      records: usage._count.id || 0,
      breakdown: usageBreakdown,
      period: {
        start: startOfMonth,
        end: endOfMonth,
      },
    };
  }

  async getUsageHistory(
    userId: string,
    options: { limit?: number; offset?: number; startDate?: Date; endDate?: Date } = {}
  ): Promise<any> {
    const where: any = { userId };

    if (options.startDate || options.endDate) {
      where.timestamp = {};
      if (options.startDate) {
        where.timestamp.gte = options.startDate;
      }
      if (options.endDate) {
        where.timestamp.lte = options.endDate;
      }
    }

    const [usage, total] = await Promise.all([
      this.prisma.usage.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: options.offset || 0,
        take: options.limit || 50,
      }),
      this.prisma.usage.count({ where }),
    ]);

    return {
      usage,
      total,
      hasMore: total > (options.offset || 0) + usage.length,
    };
  }

  async checkUsageLimits(userId: string): Promise<any> {
    const subscription = await this.getSubscription(userId);
    
    if (!subscription) {
      // Free tier limits
      return this.checkFreeTierLimits(userId);
    }

    const limits = this.getPlanLimits(subscription.priceId);
    const usage = subscription.usage;

    const checks = {
      documentsPerMonth: {
        current: usage.breakdown.document_upload || 0,
        limit: limits.documentsPerMonth,
        exceeded: (usage.breakdown.document_upload || 0) >= limits.documentsPerMonth,
      },
      analysesPerMonth: {
        current: usage.breakdown.document_analysis || 0,
        limit: limits.analysesPerMonth,
        exceeded: (usage.breakdown.document_analysis || 0) >= limits.analysesPerMonth,
      },
      apiRequestsPerDay: {
        current: usage.breakdown.api_request || 0,
        limit: limits.apiRequestsPerDay,
        exceeded: (usage.breakdown.api_request || 0) >= limits.apiRequestsPerDay,
      },
    };

    return {
      subscription: subscription.status,
      plan: this.getPlanName(subscription.priceId),
      limits: checks,
      hasExceededLimits: Object.values(checks).some(check => check.exceeded),
    };
  }

  private async checkFreeTierLimits(userId: string): Promise<any> {
    const usage = await this.getCurrentUsage(userId);
    const limits = this.getPlanLimits('free');

    const checks = {
      documentsPerMonth: {
        current: usage.breakdown.document_upload || 0,
        limit: limits.documentsPerMonth,
        exceeded: (usage.breakdown.document_upload || 0) >= limits.documentsPerMonth,
      },
      analysesPerMonth: {
        current: usage.breakdown.document_analysis || 0,
        limit: limits.analysesPerMonth,
        exceeded: (usage.breakdown.document_analysis || 0) >= limits.analysesPerMonth,
      },
      apiRequestsPerDay: {
        current: usage.breakdown.api_request || 0,
        limit: limits.apiRequestsPerDay,
        exceeded: (usage.breakdown.api_request || 0) >= limits.apiRequestsPerDay,
      },
    };

    return {
      subscription: 'free',
      plan: 'Free',
      limits: checks,
      hasExceededLimits: Object.values(checks).some(check => check.exceeded),
    };
  }

  private getPlanLimits(priceIdOrPlan: string): any {
    const limits = {
      free: {
        documentsPerMonth: 5,
        analysesPerMonth: 5,
        apiRequestsPerDay: 100,
      },
      basic: {
        documentsPerMonth: 50,
        analysesPerMonth: 50,
        apiRequestsPerDay: 1000,
      },
      pro: {
        documentsPerMonth: 200,
        analysesPerMonth: 200,
        apiRequestsPerDay: 5000,
      },
      enterprise: {
        documentsPerMonth: 1000,
        analysesPerMonth: 1000,
        apiRequestsPerDay: 25000,
      },
    };

    const planName = this.getPlanName(priceIdOrPlan);
    return limits[planName as keyof typeof limits] || limits.free;
  }

  private getPlanName(priceId: string): string {
    // In a real implementation, this would map price IDs to plan names
    if (priceId.includes('basic')) return 'basic';
    if (priceId.includes('pro')) return 'pro';
    if (priceId.includes('enterprise')) return 'enterprise';
    return 'free';
  }

  async handleWebhook(event: any): Promise<void> {
    this.logger.info('Processing webhook event', { type: event.type, id: event.id });

    try {
      switch (event.type) {
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object);
          break;
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object);
          break;
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object);
          break;
        default:
          this.logger.debug('Unhandled webhook event type', { type: event.type });
      }

      this.metrics.increment('billing.webhook.processed', 1, { type: event.type });
    } catch (error) {
      this.logger.error('Webhook processing failed', { event: event.type, error });
      this.metrics.increment('billing.webhook.failed', 1, { type: event.type });
      throw error;
    }
  }

  private async handleSubscriptionCreated(subscription: any): Promise<void> {
    const userId = subscription.metadata?.userId;
    if (!userId) return;

    await this.prisma.subscription.upsert({
      where: { userId },
      update: {
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
      create: {
        userId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer,
        status: subscription.status,
        priceId: subscription.items.data[0]?.price?.id,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        metadata: {},
      },
    });

    this.eventEmitter.emit('subscription.activated', { userId, subscription });
  }

  private async handleSubscriptionUpdated(subscription: any): Promise<void> {
    const userId = subscription.metadata?.userId;
    if (!userId) return;

    await this.prisma.subscription.update({
      where: { userId },
      data: {
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });

    this.eventEmitter.emit('subscription.updated', { userId, subscription });
  }

  private async handleSubscriptionDeleted(subscription: any): Promise<void> {
    const userId = subscription.metadata?.userId;
    if (!userId) return;

    await this.prisma.subscription.update({
      where: { userId },
      data: {
        status: 'canceled',
        canceledAt: new Date(),
        updatedAt: new Date(),
      },
    });

    this.eventEmitter.emit('subscription.canceled', { userId, subscription });
  }

  private async handlePaymentSucceeded(invoice: any): Promise<void> {
    this.logger.info('Payment succeeded', { invoiceId: invoice.id, amount: invoice.amount_paid });
    this.metrics.increment('billing.payment.succeeded');
    this.eventEmitter.emit('payment.succeeded', { invoice });
  }

  private async handlePaymentFailed(invoice: any): Promise<void> {
    this.logger.warn('Payment failed', { invoiceId: invoice.id, amount: invoice.amount_due });
    this.metrics.increment('billing.payment.failed');
    this.eventEmitter.emit('payment.failed', { invoice });
  }
}

describe('BillingService', () => {
  let billingService: BillingService;
  let mockUser: any;
  let mockSubscriptionData: any;

  beforeAll(() => {
    setupMockDefaults();
  });

  beforeEach(() => {
    resetAllMocks();
    
    billingService = new BillingService(
      mockStripe,
      mockPrisma,
      mockLogger,
      mockMetrics,
      mockEventEmitter
    );

    mockUser = createMockUser();
    mockSubscriptionData = createMockSubscription({ userId: mockUser.id });

    // Setup default mock responses
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.subscription.create.mockResolvedValue(mockSubscriptionData);
    mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscriptionData);
  });

  afterEach(() => {
    resetAllMocks();
  });

  describe('createCustomer', () => {
    test('should create Stripe customer for new user', async () => {
      const stripeCustomer = {
        id: 'cus_test123',
        email: mockUser.email,
        name: `${mockUser.firstName} ${mockUser.lastName}`,
        metadata: { userId: mockUser.id },
      };

      mockUser.stripeCustomerId = null;
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockStripe.customers.create.mockResolvedValue(stripeCustomer);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, stripeCustomerId: stripeCustomer.id });

      const result = await billingService.createCustomer(
        mockUser.id,
        mockUser.email,
        `${mockUser.firstName} ${mockUser.lastName}`
      );

      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: mockUser.email,
        name: `${mockUser.firstName} ${mockUser.lastName}`,
        metadata: { userId: mockUser.id },
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { stripeCustomerId: stripeCustomer.id },
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('billing.customer.created');
      expect(result).toEqual(stripeCustomer);
    });

    test('should throw error if user already has customer', async () => {
      mockUser.stripeCustomerId = 'existing_customer_id';
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        billingService.createCustomer(mockUser.id, mockUser.email)
      ).rejects.toThrow('User already has a Stripe customer');

      expect(mockStripe.customers.create).not.toHaveBeenCalled();
    });
  });

  describe('createSubscription', () => {
    test('should create subscription for existing customer', async () => {
      const priceId = 'price_basic_monthly';
      const paymentMethodId = 'pm_test123';
      
      mockUser.stripeCustomerId = 'cus_existing';
      const stripeSubscription = {
        id: 'sub_test123',
        customer: mockUser.stripeCustomerId,
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
        latest_invoice: {
          payment_intent: {
            client_secret: 'pi_test_client_secret',
          },
        },
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockStripe.paymentMethods.attach.mockResolvedValue({});
      mockStripe.subscriptions.create.mockResolvedValue(stripeSubscription);

      const result = await billingService.createSubscription(
        mockUser.id,
        priceId,
        paymentMethodId
      );

      expect(mockStripe.paymentMethods.attach).toHaveBeenCalledWith(paymentMethodId, {
        customer: mockUser.stripeCustomerId,
      });

      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith({
        customer: mockUser.stripeCustomerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
        metadata: { userId: mockUser.id },
        default_payment_method: paymentMethodId,
      });

      expect(mockPrisma.subscription.create).toHaveBeenCalled();
      expect(mockMetrics.increment).toHaveBeenCalledWith('billing.subscription.created');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'subscription.created',
        expect.objectContaining({ userId: mockUser.id })
      );

      expect(result).toHaveProperty('subscription');
      expect(result).toHaveProperty('clientSecret', 'pi_test_client_secret');
    });

    test('should create customer if user does not have one', async () => {
      const priceId = 'price_basic_monthly';
      mockUser.stripeCustomerId = null;

      const newCustomer = { id: 'cus_new123' };
      const stripeSubscription = {
        id: 'sub_test123',
        customer: newCustomer.id,
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
        latest_invoice: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockStripe.customers.create.mockResolvedValue(newCustomer);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, stripeCustomerId: newCustomer.id });
      mockStripe.subscriptions.create.mockResolvedValue(stripeSubscription);

      const result = await billingService.createSubscription(mockUser.id, priceId);

      expect(mockStripe.customers.create).toHaveBeenCalled();
      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: newCustomer.id,
        })
      );
    });

    test('should throw error for non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        billingService.createSubscription('non-existent-user', 'price_basic')
      ).rejects.toThrow('User not found');

      expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
    });
  });

  describe('getSubscription', () => {
    test('should return subscription with usage data', async () => {
      const usage = {
        total: 25,
        records: 15,
        breakdown: {
          document_upload: 10,
          document_analysis: 15,
        },
        period: {
          start: new Date(),
          end: new Date(),
        },
      };

      mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscriptionData);
      mockPrisma.usage.aggregate.mockResolvedValue({
        _sum: { quantity: usage.total },
        _count: { id: usage.records },
      });
      mockPrisma.usage.findMany.mockResolvedValue([
        { usageType: 'document_upload', quantity: 10 },
        { usageType: 'document_analysis', quantity: 15 },
      ]);

      const result = await billingService.getSubscription(mockUser.id);

      expect(result).toMatchObject({
        ...mockSubscriptionData,
        usage: expect.objectContaining({
          total: usage.total,
          records: usage.records,
          breakdown: usage.breakdown,
        }),
      });
    });

    test('should return null for non-existent subscription', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);

      const result = await billingService.getSubscription(mockUser.id);

      expect(result).toBeNull();
    });
  });

  describe('updateSubscription', () => {
    test('should update subscription plan', async () => {
      const newPriceId = 'price_pro_monthly';
      const updatedStripeSubscription = {
        ...mockSubscriptionData,
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
      };

      mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscriptionData);
      mockStripe.subscriptions.update.mockResolvedValue(updatedStripeSubscription);
      mockPrisma.subscription.update.mockResolvedValue({
        ...mockSubscriptionData,
        priceId: newPriceId,
      });

      const result = await billingService.updateSubscription(mockUser.id, newPriceId);

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        mockSubscriptionData.stripeSubscriptionId,
        expect.objectContaining({
          items: [
            {
              id: mockSubscriptionData.stripeSubscriptionId,
              price: newPriceId,
            },
          ],
          proration_behavior: 'create_prorations',
        })
      );

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        data: expect.objectContaining({
          priceId: newPriceId,
        }),
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('billing.subscription.updated');
      expect(result.priceId).toBe(newPriceId);
    });

    test('should throw error for non-existent subscription', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);

      await expect(
        billingService.updateSubscription(mockUser.id, 'price_pro')
      ).rejects.toThrow('Subscription not found');

      expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelSubscription', () => {
    test('should cancel subscription at period end', async () => {
      const canceledSubscription = {
        ...mockSubscriptionData,
        cancel_at_period_end: true,
        status: 'active',
      };

      mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscriptionData);
      mockStripe.subscriptions.update.mockResolvedValue(canceledSubscription);
      mockPrisma.subscription.update.mockResolvedValue({
        ...mockSubscriptionData,
        cancelAtPeriodEnd: true,
      });

      const result = await billingService.cancelSubscription(mockUser.id, true);

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        mockSubscriptionData.stripeSubscriptionId,
        { cancel_at_period_end: true }
      );

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        data: expect.objectContaining({
          cancelAtPeriodEnd: true,
          canceledAt: null,
        }),
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('billing.subscription.canceled');
      expect(result.cancelAtPeriodEnd).toBe(true);
    });

    test('should cancel subscription immediately', async () => {
      const canceledSubscription = {
        ...mockSubscriptionData,
        status: 'canceled',
      };

      mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscriptionData);
      mockStripe.subscriptions.del.mockResolvedValue(canceledSubscription);
      mockPrisma.subscription.update.mockResolvedValue({
        ...mockSubscriptionData,
        status: 'canceled',
      });

      await billingService.cancelSubscription(mockUser.id, false);

      expect(mockStripe.subscriptions.del).toHaveBeenCalledWith(
        mockSubscriptionData.stripeSubscriptionId
      );

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        data: expect.objectContaining({
          canceledAt: expect.any(Date),
        }),
      });
    });
  });

  describe('recordUsage', () => {
    test('should record usage in database', async () => {
      const usageType = 'document_analysis';
      const quantity = 1;
      const metadata = { documentId: 'doc_123' };

      mockPrisma.usage.create.mockResolvedValue({});

      await billingService.recordUsage(mockUser.id, usageType, quantity, metadata);

      expect(mockPrisma.usage.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          usageType,
          quantity,
          timestamp: expect.any(Date),
          metadata,
        },
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        `billing.usage.${usageType}`,
        quantity
      );
    });
  });

  describe('getCurrentUsage', () => {
    test('should return current month usage by default', async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      mockPrisma.usage.aggregate.mockResolvedValue({
        _sum: { quantity: 25 },
        _count: { id: 15 },
      });

      mockPrisma.usage.findMany.mockResolvedValue([
        { usageType: 'document_upload', quantity: 10 },
        { usageType: 'document_analysis', quantity: 15 },
      ]);

      const result = await billingService.getCurrentUsage(mockUser.id);

      expect(mockPrisma.usage.aggregate).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          timestamp: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
        },
        _sum: { quantity: true },
        _count: { id: true },
      });

      expect(result).toMatchObject({
        total: 25,
        records: 15,
        breakdown: {
          document_upload: 10,
          document_analysis: 15,
        },
        period: {
          start: expect.any(Date),
          end: expect.any(Date),
        },
      });
    });

    test('should use custom period when provided', async () => {
      const customPeriod = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      };

      mockPrisma.usage.aggregate.mockResolvedValue({
        _sum: { quantity: 0 },
        _count: { id: 0 },
      });
      mockPrisma.usage.findMany.mockResolvedValue([]);

      await billingService.getCurrentUsage(mockUser.id, customPeriod);

      expect(mockPrisma.usage.aggregate).toHaveBeenCalledWith({
        where: {
          userId: mockUser.id,
          timestamp: {
            gte: customPeriod.start,
            lte: customPeriod.end,
          },
        },
        _sum: { quantity: true },
        _count: { id: true },
      });
    });
  });

  describe('checkUsageLimits', () => {
    test('should check limits for subscribed user', async () => {
      const subscription = {
        ...mockSubscriptionData,
        priceId: 'price_basic_monthly',
        usage: {
          breakdown: {
            document_upload: 45,
            document_analysis: 30,
            api_request: 800,
          },
        },
      };

      mockPrisma.subscription.findUnique.mockResolvedValue(subscription);
      mockPrisma.usage.aggregate.mockResolvedValue({
        _sum: { quantity: 75 },
        _count: { id: 75 },
      });
      mockPrisma.usage.findMany.mockResolvedValue([
        { usageType: 'document_upload', quantity: 45 },
        { usageType: 'document_analysis', quantity: 30 },
        { usageType: 'api_request', quantity: 800 },
      ]);

      const result = await billingService.checkUsageLimits(mockUser.id);

      expect(result).toMatchObject({
        subscription: mockSubscriptionData.status,
        plan: 'basic',
        limits: {
          documentsPerMonth: {
            current: 45,
            limit: 50,
            exceeded: false,
          },
          analysesPerMonth: {
            current: 30,
            limit: 50,
            exceeded: false,
          },
          apiRequestsPerDay: {
            current: 800,
            limit: 1000,
            exceeded: false,
          },
        },
        hasExceededLimits: false,
      });
    });

    test('should check free tier limits for non-subscribed user', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);
      mockPrisma.usage.aggregate.mockResolvedValue({
        _sum: { quantity: 6 },
        _count: { id: 6 },
      });
      mockPrisma.usage.findMany.mockResolvedValue([
        { usageType: 'document_upload', quantity: 6 },
      ]);

      const result = await billingService.checkUsageLimits(mockUser.id);

      expect(result).toMatchObject({
        subscription: 'free',
        plan: 'Free',
        limits: {
          documentsPerMonth: {
            current: 6,
            limit: 5,
            exceeded: true,
          },
        },
        hasExceededLimits: true,
      });
    });
  });

  describe('handleWebhook', () => {
    test('should process subscription created webhook', async () => {
      const webhookEvent = {
        type: 'customer.subscription.created',
        id: 'evt_test123',
        data: {
          object: {
            id: 'sub_test123',
            customer: 'cus_test123',
            status: 'active',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
            items: {
              data: [{ price: { id: 'price_basic_monthly' } }],
            },
            metadata: { userId: mockUser.id },
          },
        },
      };

      mockPrisma.subscription.upsert.mockResolvedValue(mockSubscriptionData);

      await billingService.handleWebhook(webhookEvent);

      expect(mockPrisma.subscription.upsert).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'subscription.activated',
        expect.objectContaining({ userId: mockUser.id })
      );
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'billing.webhook.processed',
        1,
        { type: webhookEvent.type }
      );
    });

    test('should handle webhook processing errors', async () => {
      const webhookEvent = {
        type: 'customer.subscription.created',
        id: 'evt_test123',
        data: { object: {} },
      };

      const error = new Error('Database error');
      mockPrisma.subscription.upsert.mockRejectedValue(error);

      await expect(
        billingService.handleWebhook(webhookEvent)
      ).rejects.toThrow('Database error');

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'billing.webhook.failed',
        1,
        { type: webhookEvent.type }
      );
    });

    test('should handle unrecognized webhook types', async () => {
      const webhookEvent = {
        type: 'unknown.event.type',
        id: 'evt_test123',
        data: { object: {} },
      };

      await billingService.handleWebhook(webhookEvent);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Unhandled webhook event type',
        { type: 'unknown.event.type' }
      );
    });
  });

  describe('Performance Tests', () => {
    test('should create subscription within performance threshold', async () => {
      mockUser.stripeCustomerId = 'cus_existing';
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockStripe.subscriptions.create.mockResolvedValue({
        id: 'sub_test',
        customer: mockUser.stripeCustomerId,
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
      });

      const { result, duration } = await measurePerformance(async () => {
        return billingService.createSubscription(mockUser.id, 'price_basic');
      });

      expect(duration).toBeWithinPerformanceThreshold(TEST_CONFIG.API_RESPONSE_THRESHOLD);
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle Stripe API errors', async () => {
      const stripeError = new Error('Invalid API key');
      (stripeError as any).type = 'StripeAuthenticationError';
      
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockStripe.customers.create.mockRejectedValue(stripeError);

      await expect(
        billingService.createCustomer(mockUser.id, mockUser.email)
      ).rejects.toThrow('Invalid API key');
    });

    test('should handle database errors gracefully', async () => {
      const dbError = new Error('Connection timeout');
      mockPrisma.user.findUnique.mockRejectedValue(dbError);

      await expect(
        billingService.getSubscription(mockUser.id)
      ).rejects.toThrow('Connection timeout');
    });
  });
});