import { PrismaClient } from '@prisma/client';
import { mockStripe } from './mocks/stripe.mock';
import { mockRedis } from './mocks/redis.mock';

// Global test setup
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_TEST || 'postgresql://test:test@localhost:5432/fineprintai_test',
    },
  },
});

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_123';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_123';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
process.env.SENDGRID_API_KEY = 'SG.test123';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';
process.env.REDIS_URL = 'redis://localhost:6379/1';

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripe);
});

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedis),
}));

// Mock SendGrid
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }]),
}));

// Global test utilities
global.testUtils = {
  prisma,
  
  // Clean database between tests
  async cleanDatabase() {
    const tableNames = [
      'billing_events',
      'dunning_attempts',
      'dunning_campaigns',
      'chargebacks',
      'refunds',
      'tax_calculations',
      'revenue_entries',
      'usage_records',
      'api_usage',
      'api_keys',
      'notifications',
      'notification_preferences',
      'invoices',
      'payment_methods',
      'user_sessions',
      'team_members',
      'teams',
      'users',
    ];

    for (const tableName of tableNames) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM ${tableName}`);
      } catch (error) {
        // Table might not exist in test environment
        console.warn(`Failed to clean table ${tableName}:`, error);
      }
    }
  },

  // Create test user
  async createTestUser(overrides = {}) {
    return prisma.user.create({
      data: {
        email: 'test@example.com',
        emailVerified: true,
        displayName: 'Test User',
        subscriptionTier: 'free',
        status: 'active',
        ...overrides,
      },
    });
  },

  // Create test invoice
  async createTestInvoice(userId: string, overrides = {}) {
    return prisma.invoice.create({
      data: {
        userId,
        stripeInvoiceId: 'in_test_123',
        status: 'paid',
        total: '29.00',
        subtotal: '29.00',
        tax: '0.00',
        currency: 'usd',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        dueDate: new Date(),
        attemptCount: 1,
        ...overrides,
      },
    });
  },

  // Create test subscription (mock data)
  createTestSubscription(overrides = {}) {
    return {
      id: 'test-subscription-id',
      userId: 'test-user-id',
      stripeSubscriptionId: 'sub_test_123',
      stripeCustomerId: 'cus_test_123',
      stripePriceId: 'price_test_123',
      tier: 'professional',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  },

  // Generate test JWT token
  generateTestJWT(userId: string, isAdmin = false) {
    return require('jsonwebtoken').sign(
      { userId, isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },

  // Wait for async operations
  async waitFor(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};

// Extend global types
declare global {
  var testUtils: {
    prisma: PrismaClient;
    cleanDatabase: () => Promise<void>;
    createTestUser: (overrides?: any) => Promise<any>;
    createTestInvoice: (userId: string, overrides?: any) => Promise<any>;
    createTestSubscription: (overrides?: any) => any;
    generateTestJWT: (userId: string, isAdmin?: boolean) => string;
    waitFor: (ms: number) => Promise<void>;
  };
}

// Setup and teardown
beforeAll(async () => {
  // Connect to test database
  await prisma.$connect();
});

afterAll(async () => {
  // Disconnect from test database
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean database before each test
  await global.testUtils.cleanDatabase();
  
  // Reset all mocks
  jest.clearAllMocks();
});

export { prisma };