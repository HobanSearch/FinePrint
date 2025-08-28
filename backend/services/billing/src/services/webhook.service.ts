import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { verifyStripeSignature } from '../lib/stripe';
import { logger } from '../utils/logger';
import { BillingModel, SubscriptionStatus, InvoiceStatus, BillingEventType, EventStatus } from '../models/billing';
import { DunningService } from './dunning.service';
import { NotificationService } from './notification.service';
import { Decimal } from 'decimal.js';

const prisma = new PrismaClient();

export class WebhookService {
  /**
   * Process Stripe webhook events
   */
  static async processWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<{ received: boolean; eventType: string }> {
    try {
      // Verify webhook signature
      const event = verifyStripeSignature(payload, signature);

      logger.info('Processing Stripe webhook', {
        eventId: event.id,
        eventType: event.type,
        livemode: event.livemode,
      });

      // Create billing event record
      const billingEvent = await BillingModel.createBillingEvent({
        userId: this.getUserIdFromEvent(event),
        eventType: event.type as BillingEventType,
        status: EventStatus.PROCESSING,
        data: event.data,
        retryCount: 0,
      });

      try {
        // Process event based on type
        await this.handleEvent(event);

        // Mark event as completed
        await BillingModel.updateBillingEvent(billingEvent.id, {
          status: EventStatus.COMPLETED,
          processedAt: new Date(),
        });

        logger.info('Webhook processed successfully', {
          eventId: event.id,
          eventType: event.type,
        });

      } catch (processingError) {
        // Mark event as failed
        await BillingModel.updateBillingEvent(billingEvent.id, {
          status: EventStatus.FAILED,
          errorMessage: (processingError as Error).message,
          nextRetryAt: new Date(Date.now() + 5 * 60 * 1000), // Retry in 5 minutes
        });

        logger.error('Failed to process webhook event', {
          eventId: event.id,
          eventType: event.type,
          error: processingError,
        });

        throw processingError;
      }

      return {
        received: true,
        eventType: event.type,
      };

    } catch (error) {
      logger.error('Webhook processing failed', { error });
      throw error;
    }
  }

  /**
   * Handle specific Stripe events
   */
  private static async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      // Subscription events
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.trial_will_end':
        await this.handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;

      // Invoice events
      case 'invoice.created':
        await this.handleInvoiceCreated(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.finalized':
        await this.handleInvoiceFinalized(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.upcoming':
        await this.handleInvoiceUpcoming(event.data.object as Stripe.Invoice);
        break;

      // Payment method events
      case 'payment_method.attached':
        await this.handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
        break;

      case 'payment_method.detached':
        await this.handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod);
        break;

      // Customer events
      case 'customer.created':
        await this.handleCustomerCreated(event.data.object as Stripe.Customer);
        break;

      case 'customer.updated':
        await this.handleCustomerUpdated(event.data.object as Stripe.Customer);
        break;

      case 'customer.deleted':
        await this.handleCustomerDeleted(event.data.object as Stripe.Customer);
        break;

      // Dispute/Chargeback events
      case 'charge.dispute.created':
        await this.handleChargeDisputeCreated(event.data.object as Stripe.Dispute);
        break;

      case 'charge.dispute.updated':
        await this.handleChargeDisputeUpdated(event.data.object as Stripe.Dispute);
        break;

      default:
        logger.info('Unhandled webhook event type', { eventType: event.type });
    }
  }

  /**
   * Handle subscription created
   */
  private static async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata?.userId;
    if (!userId) {
      logger.warn('No userId in subscription metadata', { subscriptionId: subscription.id });
      return;
    }

    // Update subscription in database
    const existingSubscription = await BillingModel.getSubscriptionByStripeId(subscription.id);
    
    if (!existingSubscription) {
      // Create new subscription record if it doesn't exist
      await BillingModel.createSubscription({
        userId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer as string,
        stripePriceId: subscription.items.data[0]?.price.id || '',
        tier: subscription.metadata?.tier as any || 'starter',
        status: subscription.status as SubscriptionStatus,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : undefined,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
        metadata: subscription.metadata,
      });
    }

    // Update user record
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: subscription.metadata?.tier as any || 'starter',
        subscriptionId: subscription.id,
        trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
      },
    });

    // Send welcome notification
    await NotificationService.sendSubscriptionWelcome(userId, subscription.metadata?.tier || 'starter');
  }

  /**
   * Handle subscription updated
   */
  private static async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const existingSubscription = await BillingModel.getSubscriptionByStripeId(subscription.id);
    if (!existingSubscription) {
      logger.warn('Subscription not found for update', { subscriptionId: subscription.id });
      return;
    }

    // Update subscription record
    await BillingModel.updateSubscription(existingSubscription.id, {
      status: subscription.status as SubscriptionStatus,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : undefined,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
      metadata: subscription.metadata,
    });

    // Update user record
    await prisma.user.update({
      where: { id: existingSubscription.userId },
      data: {
        subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
      },
    });

    // Handle status changes
    if (subscription.status === 'canceled') {
      await NotificationService.sendSubscriptionCanceled(existingSubscription.userId);
    } else if (subscription.status === 'past_due') {
      await NotificationService.sendPaymentFailed(existingSubscription.userId);
    }
  }

  /**
   * Handle subscription deleted
   */
  private static async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const existingSubscription = await BillingModel.getSubscriptionByStripeId(subscription.id);
    if (!existingSubscription) {
      logger.warn('Subscription not found for deletion', { subscriptionId: subscription.id });
      return;
    }

    // Update subscription status
    await BillingModel.updateSubscription(existingSubscription.id, {
      status: SubscriptionStatus.CANCELED,
      canceledAt: new Date(),
    });

    // Downgrade user to free tier
    await prisma.user.update({
      where: { id: existingSubscription.userId },
      data: {
        subscriptionTier: 'free',
        subscriptionId: null,
        subscriptionExpiresAt: null,
      },
    });

    await NotificationService.sendSubscriptionEnded(existingSubscription.userId);
  }

  /**
   * Handle trial will end
   */
  private static async handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata?.userId;
    if (!userId) return;

    await NotificationService.sendTrialEnding(userId, new Date(subscription.trial_end! * 1000));
  }

  /**
   * Handle invoice created
   */
  private static async handleInvoiceCreated(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const customer = await stripe.customers.retrieve(customerId);
    
    if (customer.deleted) return;

    const userId = (customer as Stripe.Customer).metadata?.userId;
    if (!userId) return;

    // Create invoice record
    await BillingModel.createInvoice({
      userId,
      subscriptionId: invoice.subscription as string || undefined,
      stripeInvoiceId: invoice.id,
      status: invoice.status as InvoiceStatus,
      total: new Decimal(invoice.total / 100),
      subtotal: new Decimal(invoice.subtotal / 100),
      tax: new Decimal((invoice.tax || 0) / 100),
      currency: invoice.currency,
      periodStart: new Date((invoice.period_start || 0) * 1000),
      periodEnd: new Date((invoice.period_end || 0) * 1000),
      dueDate: new Date((invoice.due_date || invoice.created) * 1000),
      attemptCount: invoice.attempt_count || 0,
      nextPaymentAttempt: invoice.next_payment_attempt 
        ? new Date(invoice.next_payment_attempt * 1000) 
        : undefined,
      metadata: invoice.metadata,
    });
  }

  /**
   * Handle invoice payment succeeded
   */
  private static async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const existingInvoice = await prisma.invoice.findUnique({
      where: { stripeInvoiceId: invoice.id },
    });

    if (existingInvoice) {
      await BillingModel.updateInvoice(existingInvoice.id, {
        status: InvoiceStatus.PAID,
        paidAt: new Date(invoice.status_transitions.paid_at! * 1000),
      });

      await NotificationService.sendPaymentSuccess(existingInvoice.userId, {
        amount: Number(existingInvoice.total),
        currency: existingInvoice.currency,
      });
    }
  }

  /**
   * Handle invoice payment failed
   */
  private static async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const existingInvoice = await prisma.invoice.findUnique({
      where: { stripeInvoiceId: invoice.id },
    });

    if (existingInvoice) {
      await BillingModel.updateInvoice(existingInvoice.id, {
        attemptCount: invoice.attempt_count || 0,
        nextPaymentAttempt: invoice.next_payment_attempt 
          ? new Date(invoice.next_payment_attempt * 1000) 
          : undefined,
      });

      // Start dunning process
      await DunningService.startDunningProcess(existingInvoice.userId, existingInvoice.id);

      await NotificationService.sendPaymentFailed(existingInvoice.userId);
    }
  }

  /**
   * Handle upcoming invoice (7 days before due)
   */
  private static async handleInvoiceUpcoming(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const customer = await stripe.customers.retrieve(customerId);
    
    if (customer.deleted) return;

    const userId = (customer as Stripe.Customer).metadata?.userId;
    if (!userId) return;

    await NotificationService.sendUpcomingInvoice(userId, {
      amount: invoice.total / 100,
      currency: invoice.currency,
      dueDate: new Date((invoice.due_date || invoice.created) * 1000),
    });
  }

  /**
   * Handle payment method attached
   */
  private static async handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod): Promise<void> {
    const customerId = paymentMethod.customer as string;
    if (!customerId) return;

    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return;

    const userId = (customer as Stripe.Customer).metadata?.userId;
    if (!userId) return;

    // Save payment method to database
    await prisma.paymentMethod.create({
      data: {
        userId,
        stripePaymentMethodId: paymentMethod.id,
        type: paymentMethod.type as any,
        brand: paymentMethod.card?.brand,
        last4: paymentMethod.card?.last4,
        expiryMonth: paymentMethod.card?.exp_month,
        expiryYear: paymentMethod.card?.exp_year,
        isDefault: false,
        metadata: paymentMethod.metadata,
      },
    });

    await NotificationService.sendPaymentMethodAdded(userId);
  }

  /**
   * Handle payment method detached
   */
  private static async handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod): Promise<void> {
    // Remove payment method from database
    await prisma.paymentMethod.deleteMany({
      where: { stripePaymentMethodId: paymentMethod.id },
    });
  }

  /**
   * Handle customer created
   */
  private static async handleCustomerCreated(customer: Stripe.Customer): Promise<void> {
    // Customer is already handled in subscription creation
    logger.info('Customer created', { customerId: customer.id });
  }

  /**
   * Handle customer updated
   */
  private static async handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
    const userId = customer.metadata?.userId;
    if (!userId) return;

    // Update user email if changed
    if (customer.email) {
      await prisma.user.update({
        where: { id: userId },
        data: { email: customer.email },
      });
    }
  }

  /**
   * Handle customer deleted
   */
  private static async handleCustomerDeleted(customer: Stripe.Customer): Promise<void> {
    const userId = customer.metadata?.userId;
    if (!userId) return;

    // Clean up payment methods
    await prisma.paymentMethod.deleteMany({
      where: { userId },
    });
  }

  /**
   * Handle charge dispute created
   */
  private static async handleChargeDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
    const charge = await stripe.charges.retrieve(dispute.charge as string);
    const customerId = charge.customer as string;
    
    if (!customerId) return;

    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return;

    const userId = (customer as Stripe.Customer).metadata?.userId;
    if (!userId) return;

    // Find associated invoice
    const invoice = await prisma.invoice.findFirst({
      where: { stripeInvoiceId: charge.invoice as string },
    });

    if (!invoice) return;

    // Create chargeback record
    await prisma.chargeback.create({
      data: {
        userId,
        invoiceId: invoice.id,
        stripeChargeId: charge.id,
        amount: new Decimal(dispute.amount / 100),
        currency: dispute.currency,
        reason: dispute.reason,
        status: dispute.status as any,
        metadata: dispute.metadata,
      },
    });

    await NotificationService.sendChargebackAlert(userId, dispute);
  }

  /**
   * Handle charge dispute updated
   */
  private static async handleChargeDisputeUpdated(dispute: Stripe.Dispute): Promise<void> {
    const existingChargeback = await prisma.chargeback.findFirst({
      where: { stripeChargeId: dispute.charge as string },
    });

    if (existingChargeback) {
      await prisma.chargeback.update({
        where: { id: existingChargeback.id },
        data: {
          status: dispute.status as any,
          evidence: dispute.evidence as any,
          evidenceSubmittedAt: dispute.evidence_details?.submission_count 
            ? new Date() 
            : undefined,
        },
      });
    }
  }

  /**
   * Extract user ID from webhook event
   */
  private static getUserIdFromEvent(event: Stripe.Event): string {
    const obj = event.data.object as any;
    
    // Try to get userId from metadata
    if (obj.metadata?.userId) {
      return obj.metadata.userId;
    }

    // Try to get from customer metadata
    if (obj.customer) {
      // This would require an additional API call to get customer details
      // For now, return empty string and handle it in individual event handlers
    }

    return '';
  }

  /**
   * Retry failed webhook events
   */
  static async retryFailedEvents(): Promise<void> {
    try {
      const failedEvents = await BillingModel.getPendingBillingEvents(50);

      for (const event of failedEvents) {
        if (event.retryCount >= 3) {
          // Give up after 3 retries
          await BillingModel.updateBillingEvent(event.id, {
            status: EventStatus.FAILED,
          });
          continue;
        }

        try {
          // Retry processing the event
          await BillingModel.updateBillingEvent(event.id, {
            status: EventStatus.RETRYING,
            retryCount: event.retryCount + 1,
          });

          // Reconstruct Stripe event object
          const stripeEvent: Stripe.Event = {
            id: event.id,
            type: event.eventType as any,
            data: JSON.parse(event.data as string),
            created: Math.floor(event.createdAt.getTime() / 1000),
            livemode: true,
            object: 'event',
            api_version: '2023-10-16',
            pending_webhooks: 0,
            request: { id: null, idempotency_key: null },
          };

          await this.handleEvent(stripeEvent);

          await BillingModel.updateBillingEvent(event.id, {
            status: EventStatus.COMPLETED,
            processedAt: new Date(),
          });

          logger.info('Successfully retried failed event', { eventId: event.id });

        } catch (retryError) {
          await BillingModel.updateBillingEvent(event.id, {
            status: EventStatus.FAILED,
            errorMessage: (retryError as Error).message,
            nextRetryAt: new Date(Date.now() + 15 * 60 * 1000), // Retry in 15 minutes
          });

          logger.error('Failed to retry event', { eventId: event.id, error: retryError });
        }
      }

    } catch (error) {
      logger.error('Failed to retry webhook events', { error });
    }
  }
}

export default WebhookService;