import { SubscriptionService } from '../../services/subscription.service';
import { mockStripe } from '../mocks/stripe.mock';
import { SubscriptionTier } from '@prisma/client';

describe('SubscriptionService', () => {
  const testUserId = 'test-user-id';
  const testEmail = 'test@example.com';

  describe('createSubscription', () => {
    it('should create a free tier subscription without Stripe', async () => {
      const result = await SubscriptionService.createSubscription({
        userId: testUserId,
        email: testEmail,
        tier: 'free' as SubscriptionTier,
      });

      expect(result.subscription.tier).toBe('free');
      expect(result.subscription.stripeSubscriptionId).toBe('');
      expect(result.clientSecret).toBeUndefined();
    });

    it('should create a paid subscription with Stripe', async () => {
      const user = await testUtils.createTestUser({
        id: testUserId,
        email: testEmail,
      });

      const result = await SubscriptionService.createSubscription({
        userId: testUserId,
        email: testEmail,
        tier: 'professional' as SubscriptionTier,
        paymentMethodId: 'pm_test_123',
      });

      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: testEmail,
        name: undefined,
        metadata: {
          userId: testUserId,
          tier: 'professional',
        },
      });

      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test_123',
          items: [{ price: process.env.STRIPE_PROFESSIONAL_PRICE_ID }],
          default_payment_method: 'pm_test_123',
          metadata: expect.objectContaining({
            userId: testUserId,
            tier: 'professional',
          }),
        })
      );

      expect(result.subscription.tier).toBe('professional');
      expect(result.subscription.stripeSubscriptionId).toBe('sub_test_123');
      expect(result.clientSecret).toBe('pi_test_123_secret_456');
    });

    it('should create a subscription with trial period', async () => {
      const user = await testUtils.createTestUser({
        id: testUserId,
        email: testEmail,
      });

      await SubscriptionService.createSubscription({
        userId: testUserId,
        email: testEmail,
        tier: 'starter' as SubscriptionTier,
        trialDays: 14,
      });

      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          trial_period_days: 14,
        })
      );
    });

    it('should apply coupon code if provided', async () => {
      const user = await testUtils.createTestUser({
        id: testUserId,
        email: testEmail,
      });

      await SubscriptionService.createSubscription({
        userId: testUserId,
        email: testEmail,
        tier: 'professional' as SubscriptionTier,
        couponCode: 'SAVE20',
      });

      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          coupon: 'SAVE20',
        })
      );
    });

    it('should throw error for invalid tier', async () => {
      await expect(
        SubscriptionService.createSubscription({
          userId: testUserId,
          email: testEmail,
          tier: 'invalid' as SubscriptionTier,
        })
      ).rejects.toThrow('Invalid subscription tier: invalid');
    });
  });

  describe('updateSubscription', () => {
    beforeEach(async () => {
      const user = await testUtils.createTestUser({
        id: testUserId,
        email: testEmail,
        subscriptionTier: 'starter',
        subscriptionId: 'sub_test_123',
      });
    });

    it('should update subscription tier', async () => {
      // Mock existing subscription
      mockStripe.subscriptions.retrieve.mockResolvedValueOnce({
        id: 'sub_test_123',
        items: {
          data: [{ id: 'si_test_123' }],
        },
      });

      await SubscriptionService.updateSubscription({
        subscriptionId: 'sub_test_123',
        tier: 'professional' as SubscriptionTier,
      });

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_test_123',
        expect.objectContaining({
          items: [{
            id: 'si_test_123',
            price: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
          }],
          metadata: expect.objectContaining({
            tier: 'professional',
          }),
        })
      );
    });

    it('should update payment method', async () => {
      await SubscriptionService.updateSubscription({
        subscriptionId: 'sub_test_123',
        paymentMethodId: 'pm_new_456',
      });

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_test_123',
        expect.objectContaining({
          default_payment_method: 'pm_new_456',
        })
      );
    });

    it('should throw error if subscription not found', async () => {
      await expect(
        SubscriptionService.updateSubscription({
          subscriptionId: 'sub_nonexistent',
        })
      ).rejects.toThrow('Subscription not found');
    });
  });

  describe('cancelSubscription', () => {
    beforeEach(async () => {
      const user = await testUtils.createTestUser({
        id: testUserId,
        email: testEmail,
        subscriptionTier: 'professional',
        subscriptionId: 'sub_test_123',
      });
    });

    it('should cancel subscription at period end', async () => {
      await SubscriptionService.cancelSubscription({
        subscriptionId: 'sub_test_123',
        cancelAtPeriodEnd: true,
        cancellationReason: 'User requested',
      });

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_test_123',
        expect.objectContaining({
          cancel_at_period_end: true,
          metadata: expect.objectContaining({
            cancellation_reason: 'User requested',
          }),
        })
      );
    });

    it('should cancel subscription immediately', async () => {
      await SubscriptionService.cancelSubscription({
        subscriptionId: 'sub_test_123',
        cancelAtPeriodEnd: false,
      });

      expect(mockStripe.subscriptions.cancel).toHaveBeenCalledWith(
        'sub_test_123',
        { prorate: true }
      );
    });
  });

  describe('getSubscriptionUsage', () => {
    beforeEach(async () => {
      const user = await testUtils.createTestUser({
        id: testUserId,
        email: testEmail,
        subscriptionTier: 'professional',
      });
    });

    it('should return usage statistics', async () => {
      // Create some usage records
      await testUtils.prisma.usageRecord.create({
        data: {
          userId: testUserId,
          metricType: 'analyses',
          quantity: 50,
          unit: 'analyses',
          periodStart: new Date(),
          periodEnd: new Date(),
        },
      });

      await testUtils.prisma.usageRecord.create({
        data: {
          userId: testUserId,
          metricType: 'api_calls',
          quantity: 500,
          unit: 'calls',
          periodStart: new Date(),
          periodEnd: new Date(),
        },
      });

      const usage = await SubscriptionService.getSubscriptionUsage(testUserId);

      expect(usage.analyses).toBe(50);
      expect(usage.apiCalls).toBe(500);
      expect(usage.limits.analyses).toBe(-1); // Unlimited for professional
      expect(usage.limits.apiCalls).toBe(1000); // Professional tier limit
    });
  });

  describe('canPerformAction', () => {
    beforeEach(async () => {
      const user = await testUtils.createTestUser({
        id: testUserId,
        email: testEmail,
        subscriptionTier: 'starter',
      });
    });

    it('should allow action within limits', async () => {
      // Create usage below limits
      await testUtils.prisma.usageRecord.create({
        data: {
          userId: testUserId,
          metricType: 'analyses',
          quantity: 10,
          unit: 'analyses',
          periodStart: new Date(),
          periodEnd: new Date(),
        },
      });

      const result = await SubscriptionService.canPerformAction(testUserId, 'analysis');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should deny action when limits exceeded', async () => {
      // Create usage at limit
      await testUtils.prisma.usageRecord.create({
        data: {
          userId: testUserId,
          metricType: 'analyses',
          quantity: 20, // Starter tier has 20 analysis limit
          unit: 'analyses',
          periodStart: new Date(),
          periodEnd: new Date(),
        },
      });

      const result = await SubscriptionService.canPerformAction(testUserId, 'analysis');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Monthly analysis limit of 20 reached');
    });

    it('should deny API access for free tier', async () => {
      await testUtils.prisma.user.update({
        where: { id: testUserId },
        data: { subscriptionTier: 'free' },
      });

      const result = await SubscriptionService.canPerformAction(testUserId, 'api_call');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('API access not included in your plan');
    });
  });

  describe('reactivateSubscription', () => {
    beforeEach(async () => {
      const user = await testUtils.createTestUser({
        id: testUserId,
        email: testEmail,
        subscriptionTier: 'professional',
        subscriptionId: 'sub_test_123',
      });
    });

    it('should reactivate canceled subscription', async () => {
      await SubscriptionService.reactivateSubscription('sub_test_123');

      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
        'sub_test_123',
        { cancel_at_period_end: false }
      );
    });
  });

  describe('Error handling', () => {
    it('should handle Stripe API errors gracefully', async () => {
      mockStripe.customers.create.mockRejectedValueOnce(
        new Error('Stripe API error')
      );

      await expect(
        SubscriptionService.createSubscription({
          userId: testUserId,
          email: testEmail,
          tier: 'professional' as SubscriptionTier,
        })
      ).rejects.toThrow('Stripe API error');
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error
      jest.spyOn(testUtils.prisma.user, 'update').mockRejectedValueOnce(
        new Error('Database error')
      );

      await expect(
        SubscriptionService.createSubscription({
          userId: testUserId,
          email: testEmail,
          tier: 'free' as SubscriptionTier,
        })
      ).rejects.toThrow('Database error');
    });
  });
});