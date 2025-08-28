/**
 * Stripe mock for testing billing functionality
 * Provides comprehensive mocking for Stripe API operations
 */

import { jest } from '@jest/globals';

// Mock Stripe data storage
class MockStripeData {
  private customers: Map<string, any> = new Map();
  private subscriptions: Map<string, any> = new Map();
  private paymentMethods: Map<string, any> = new Map();
  private invoices: Map<string, any> = new Map();
  private paymentIntents: Map<string, any> = new Map();
  private products: Map<string, any> = new Map();
  private prices: Map<string, any> = new Map();
  private webhookEvents: any[] = [];

  constructor() {
    this.setupDefaultData();
  }

  private setupDefaultData(): void {
    // Default products
    this.products.set('prod_basic', {
      id: 'prod_basic',
      name: 'Basic Plan',
      description: 'Basic document analysis plan',
      active: true,
      metadata: {},
      created: Math.floor(Date.now() / 1000),
    });

    this.products.set('prod_pro', {
      id: 'prod_pro',
      name: 'Pro Plan',
      description: 'Professional document analysis plan',
      active: true,
      metadata: {},
      created: Math.floor(Date.now() / 1000),
    });

    // Default prices
    this.prices.set('price_basic_monthly', {
      id: 'price_basic_monthly',
      product: 'prod_basic',
      active: true,
      currency: 'usd',
      unit_amount: 999, // $9.99
      recurring: {
        interval: 'month',
        interval_count: 1,
      },
      metadata: {},
      created: Math.floor(Date.now() / 1000),
    });

    this.prices.set('price_pro_monthly', {
      id: 'price_pro_monthly',
      product: 'prod_pro',
      active: true,
      currency: 'usd',
      unit_amount: 2999, // $29.99
      recurring: {
        interval: 'month',
        interval_count: 1,
      },
      metadata: {},
      created: Math.floor(Date.now() / 1000),
    });

    // Test customer
    this.customers.set('cus_test_customer', {
      id: 'cus_test_customer',
      email: 'test@example.com',
      name: 'Test Customer',
      metadata: { userId: 'test-user-1' },
      created: Math.floor(Date.now() / 1000),
      default_source: null,
      subscriptions: { data: [] },
    });
  }

  // Customer operations
  createCustomer(params: any): any {
    const id = `cus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const customer = {
      id,
      email: params.email,
      name: params.name,
      metadata: params.metadata || {},
      created: Math.floor(Date.now() / 1000),
      default_source: null,
      subscriptions: { data: [] },
      ...params,
    };
    
    this.customers.set(id, customer);
    return customer;
  }

  getCustomer(id: string): any {
    const customer = this.customers.get(id);
    if (!customer) {
      throw new Error(`No such customer: ${id}`);
    }
    return customer;
  }

  updateCustomer(id: string, params: any): any {
    const customer = this.getCustomer(id);
    const updated = { ...customer, ...params };
    this.customers.set(id, updated);
    return updated;
  }

  deleteCustomer(id: string): any {
    const customer = this.getCustomer(id);
    this.customers.delete(id);
    return { ...customer, deleted: true };
  }

  // Subscription operations
  createSubscription(params: any): any {
    const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const subscription = {
      id,
      customer: params.customer,
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
      items: {
        data: params.items?.map((item: any) => ({
          id: `si_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          price: item.price,
          quantity: item.quantity || 1,
        })) || [],
      },
      metadata: params.metadata || {},
      created: Math.floor(Date.now() / 1000),
      ...params,
    };

    this.subscriptions.set(id, subscription);

    // Update customer subscriptions
    const customer = this.customers.get(params.customer);
    if (customer) {
      customer.subscriptions.data.push(subscription);
    }

    return subscription;
  }

  getSubscription(id: string): any {
    const subscription = this.subscriptions.get(id);
    if (!subscription) {
      throw new Error(`No such subscription: ${id}`);
    }
    return subscription;
  }

  updateSubscription(id: string, params: any): any {
    const subscription = this.getSubscription(id);
    const updated = { ...subscription, ...params };
    this.subscriptions.set(id, updated);
    return updated;
  }

  cancelSubscription(id: string, params: any = {}): any {
    const subscription = this.getSubscription(id);
    const updated = {
      ...subscription,
      status: 'canceled',
      canceled_at: Math.floor(Date.now() / 1000),
      cancel_at_period_end: params.at_period_end || false,
    };
    this.subscriptions.set(id, updated);
    return updated;
  }

  // Payment Method operations
  createPaymentMethod(params: any): any {
    const id = `pm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const paymentMethod = {
      id,
      type: params.type || 'card',
      card: params.card || {
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2025,
      },
      customer: params.customer,
      metadata: params.metadata || {},
      created: Math.floor(Date.now() / 1000),
    };

    this.paymentMethods.set(id, paymentMethod);
    return paymentMethod;
  }

  attachPaymentMethod(id: string, params: any): any {
    const paymentMethod = this.paymentMethods.get(id);
    if (!paymentMethod) {
      throw new Error(`No such payment method: ${id}`);
    }

    const updated = { ...paymentMethod, customer: params.customer };
    this.paymentMethods.set(id, updated);
    return updated;
  }

  detachPaymentMethod(id: string): any {
    const paymentMethod = this.paymentMethods.get(id);
    if (!paymentMethod) {
      throw new Error(`No such payment method: ${id}`);
    }

    const updated = { ...paymentMethod, customer: null };
    this.paymentMethods.set(id, updated);
    return updated;
  }

  // Invoice operations
  createInvoice(params: any): any {
    const id = `in_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const invoice = {
      id,
      customer: params.customer,
      subscription: params.subscription,
      status: 'draft',
      amount_due: params.amount_due || 0,
      amount_paid: 0,
      currency: params.currency || 'usd',
      metadata: params.metadata || {},
      created: Math.floor(Date.now() / 1000),
      ...params,
    };

    this.invoices.set(id, invoice);
    return invoice;
  }

  finalizeInvoice(id: string): any {
    const invoice = this.invoices.get(id);
    if (!invoice) {
      throw new Error(`No such invoice: ${id}`);
    }

    const updated = { ...invoice, status: 'open' };
    this.invoices.set(id, updated);
    return updated;
  }

  payInvoice(id: string): any {
    const invoice = this.invoices.get(id);
    if (!invoice) {
      throw new Error(`No such invoice: ${id}`);
    }

    const updated = {
      ...invoice,
      status: 'paid',
      amount_paid: invoice.amount_due,
      paid: true,
      paid_at: Math.floor(Date.now() / 1000),
    };
    this.invoices.set(id, updated);
    return updated;
  }

  // Payment Intent operations
  createPaymentIntent(params: any): any {
    const id = `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const paymentIntent = {
      id,
      amount: params.amount,
      currency: params.currency || 'usd',
      status: 'requires_payment_method',
      customer: params.customer,
      metadata: params.metadata || {},
      client_secret: `${id}_secret_${Math.random().toString(36).substr(2, 16)}`,
      created: Math.floor(Date.now() / 1000),
      ...params,
    };

    this.paymentIntents.set(id, paymentIntent);
    return paymentIntent;
  }

  confirmPaymentIntent(id: string, params: any = {}): any {
    const paymentIntent = this.paymentIntents.get(id);
    if (!paymentIntent) {
      throw new Error(`No such payment intent: ${id}`);
    }

    const updated = {
      ...paymentIntent,
      status: 'succeeded',
      payment_method: params.payment_method,
      confirmed: true,
    };
    this.paymentIntents.set(id, updated);
    return updated;
  }

  // Webhook operations
  createWebhookEvent(type: string, data: any): any {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data: { object: data },
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      request: { id: null },
    };

    this.webhookEvents.push(event);
    return event;
  }

  // Test utilities
  clearAllData(): void {
    this.customers.clear();
    this.subscriptions.clear();
    this.paymentMethods.clear();
    this.invoices.clear();
    this.paymentIntents.clear();
    this.webhookEvents = [];
    this.setupDefaultData();
  }

  getAllCustomers(): any[] {
    return Array.from(this.customers.values());
  }

  getAllSubscriptions(): any[] {
    return Array.from(this.subscriptions.values());
  }

  getWebhookEvents(): any[] {
    return [...this.webhookEvents];
  }
}

const mockStripeData = new MockStripeData();

// Create mock Stripe client
const mockStripe = {
  customers: {
    create: jest.fn().mockImplementation((params) => 
      Promise.resolve(mockStripeData.createCustomer(params))),
    retrieve: jest.fn().mockImplementation((id) => 
      Promise.resolve(mockStripeData.getCustomer(id))),
    update: jest.fn().mockImplementation((id, params) => 
      Promise.resolve(mockStripeData.updateCustomer(id, params))),
    del: jest.fn().mockImplementation((id) => 
      Promise.resolve(mockStripeData.deleteCustomer(id))),
  },

  subscriptions: {
    create: jest.fn().mockImplementation((params) => 
      Promise.resolve(mockStripeData.createSubscription(params))),
    retrieve: jest.fn().mockImplementation((id) => 
      Promise.resolve(mockStripeData.getSubscription(id))),
    update: jest.fn().mockImplementation((id, params) => 
      Promise.resolve(mockStripeData.updateSubscription(id, params))),
    del: jest.fn().mockImplementation((id, params) => 
      Promise.resolve(mockStripeData.cancelSubscription(id, params))),
  },

  paymentMethods: {
    create: jest.fn().mockImplementation((params) => 
      Promise.resolve(mockStripeData.createPaymentMethod(params))),
    attach: jest.fn().mockImplementation((id, params) => 
      Promise.resolve(mockStripeData.attachPaymentMethod(id, params))),
    detach: jest.fn().mockImplementation((id) => 
      Promise.resolve(mockStripeData.detachPaymentMethod(id))),
  },

  invoices: {
    create: jest.fn().mockImplementation((params) => 
      Promise.resolve(mockStripeData.createInvoice(params))),
    finalizeInvoice: jest.fn().mockImplementation((id) => 
      Promise.resolve(mockStripeData.finalizeInvoice(id))),
    pay: jest.fn().mockImplementation((id) => 
      Promise.resolve(mockStripeData.payInvoice(id))),
  },

  paymentIntents: {
    create: jest.fn().mockImplementation((params) => 
      Promise.resolve(mockStripeData.createPaymentIntent(params))),
    confirm: jest.fn().mockImplementation((id, params) => 
      Promise.resolve(mockStripeData.confirmPaymentIntent(id, params))),
  },

  products: {
    list: jest.fn().mockImplementation(() => 
      Promise.resolve({ 
        data: Array.from(mockStripeData['products'].values()),
        has_more: false 
      })),
  },

  prices: {
    list: jest.fn().mockImplementation(() => 
      Promise.resolve({ 
        data: Array.from(mockStripeData['prices'].values()),
        has_more: false 
      })),
  },

  webhooks: {
    constructEvent: jest.fn().mockImplementation((payload, signature, secret) => {
      // Simple mock implementation
      try {
        const data = JSON.parse(payload);
        return mockStripeData.createWebhookEvent(data.type, data.data?.object);
      } catch (error) {
        throw new Error('Invalid payload');
      }
    }),
  },

  // Test utilities
  __mockData: mockStripeData,
  __clearAllData: () => mockStripeData.clearAllData(),
  __getAllCustomers: () => mockStripeData.getAllCustomers(),
  __getAllSubscriptions: () => mockStripeData.getAllSubscriptions(),
  __getWebhookEvents: () => mockStripeData.getWebhookEvents(),
};

export default mockStripe;