// Mock Stripe API responses and methods
export const mockStripe = {
  customers: {
    create: jest.fn().mockResolvedValue({
      id: 'cus_test_123',
      email: 'test@example.com',
      metadata: { userId: 'test-user-id' },
    }),
    
    retrieve: jest.fn().mockResolvedValue({
      id: 'cus_test_123',
      email: 'test@example.com',
      metadata: { userId: 'test-user-id' },
      deleted: false,
    }),
    
    update: jest.fn().mockResolvedValue({
      id: 'cus_test_123',
      email: 'test@example.com',
      metadata: { userId: 'test-user-id' },
    }),
    
    list: jest.fn().mockResolvedValue({
      data: [{
        id: 'cus_test_123',
        email: 'test@example.com',
        metadata: { userId: 'test-user-id' },
      }],
    }),
  },

  subscriptions: {
    create: jest.fn().mockResolvedValue({
      id: 'sub_test_123',
      customer: 'cus_test_123',
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
      items: {
        data: [{
          id: 'si_test_123',
          price: { id: 'price_test_123' },
        }],
      },
      latest_invoice: {
        payment_intent: {
          client_secret: 'pi_test_123_secret_456',
        },
      },
      metadata: { userId: 'test-user-id', tier: 'professional' },
    }),
    
    retrieve: jest.fn().mockResolvedValue({
      id: 'sub_test_123',
      customer: 'cus_test_123',
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
      items: {
        data: [{
          id: 'si_test_123',
          price: { id: 'price_test_123' },
        }],
      },
      metadata: { userId: 'test-user-id', tier: 'professional' },
    }),
    
    update: jest.fn().mockResolvedValue({
      id: 'sub_test_123',
      customer: 'cus_test_123',
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
      metadata: { userId: 'test-user-id', tier: 'professional' },
    }),
    
    cancel: jest.fn().mockResolvedValue({
      id: 'sub_test_123',
      status: 'canceled',
      canceled_at: Math.floor(Date.now() / 1000),
    }),
  },

  invoices: {
    retrieve: jest.fn().mockResolvedValue({
      id: 'in_test_123',
      customer: 'cus_test_123',
      status: 'paid',
      total: 2900, // $29.00 in cents
      subtotal: 2900,
      tax: 0,
      currency: 'usd',
      period_start: Math.floor(Date.now() / 1000),
      period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
      due_date: Math.floor(Date.now() / 1000),
      charge: 'ch_test_123',
      invoice_pdf: 'https://invoice.stripe.com/test.pdf',
    }),
    
    retrieveUpcoming: jest.fn().mockResolvedValue({
      id: 'in_upcoming_test',
      total: 2900,
      subtotal: 2900,
      tax: 0,
      currency: 'usd',
    }),
    
    pay: jest.fn().mockResolvedValue({
      id: 'in_test_123',
      status: 'paid',
    }),
  },

  invoiceItems: {
    create: jest.fn().mockResolvedValue({
      id: 'ii_test_123',
      customer: 'cus_test_123',
      amount: 500, // $5.00 overage charge
      currency: 'usd',
      description: 'API calls overage: 100 units',
    }),
  },

  paymentMethods: {
    attach: jest.fn().mockResolvedValue({
      id: 'pm_test_123',
      customer: 'cus_test_123',
      type: 'card',
      card: {
        brand: 'visa',
        last4: '4242',
        exp_month: 12,
        exp_year: 2025,
      },
    }),
    
    detach: jest.fn().mockResolvedValue({
      id: 'pm_test_123',
      customer: null,
    }),
  },

  setupIntents: {
    create: jest.fn().mockResolvedValue({
      id: 'seti_test_123',
      client_secret: 'seti_test_123_secret_456',
      customer: 'cus_test_123',
      usage: 'off_session',
    }),
  },

  paymentIntents: {
    create: jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret_456',
      amount: 2900,
      currency: 'usd',
      customer: 'cus_test_123',
      status: 'requires_payment_method',
    }),
  },

  subscriptionItems: {
    createUsageRecord: jest.fn().mockResolvedValue({
      id: 'mbur_test_123',
      quantity: 100,
      timestamp: Math.floor(Date.now() / 1000),
      subscription_item: 'si_test_123',
    }),
  },

  refunds: {
    create: jest.fn().mockResolvedValue({
      id: 're_test_123',
      charge: 'ch_test_123',
      amount: 2900,
      currency: 'usd',
      status: 'succeeded',
      reason: 'requested_by_customer',
    }),
    
    cancel: jest.fn().mockResolvedValue({
      id: 're_test_123',
      status: 'canceled',
    }),
  },

  disputes: {
    update: jest.fn().mockResolvedValue({
      id: 'dp_test_123',
      charge: 'ch_test_123',
      amount: 2900,
      currency: 'usd',
      status: 'under_review',
      reason: 'fraudulent',
      evidence: {
        customer_communication: 'Email thread',
        receipt: 'receipt.pdf',
      },
    }),
  },

  charges: {
    retrieve: jest.fn().mockResolvedValue({
      id: 'ch_test_123',
      customer: 'cus_test_123',
      invoice: 'in_test_123',
      amount: 2900,
      currency: 'usd',
      status: 'succeeded',
    }),
  },

  tax: {
    calculations: {
      create: jest.fn().mockResolvedValue({
        id: 'taxcalc_test_123',
        tax_amount_inclusive: 290, // $2.90 tax
        tax_breakdown: [{
          jurisdiction: {
            display_name: 'California',
          },
          tax_rate_details: {
            percentage_decimal: 10.25,
            tax_type: 'sales_tax',
          },
          tax_amount: 290,
        }],
      }),
    },
  },

  webhooks: {
    constructEvent: jest.fn().mockImplementation((payload, signature, secret) => {
      // Mock webhook event construction
      return {
        id: 'evt_test_123',
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test_123',
            customer: 'cus_test_123',
            status: 'paid',
            total: 2900,
          },
        },
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        object: 'event',
        api_version: '2023-10-16',
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
      };
    }),
  },
};

// Mock Stripe constructor
export const mockStripeConstructor = jest.fn(() => mockStripe);

export default mockStripe;