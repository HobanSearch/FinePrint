"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
const client_1 = require("@prisma/client");
const stripe_1 = require("../lib/stripe");
const logger_1 = require("../utils/logger");
const billing_1 = require("../models/billing");
const dunning_service_1 = require("./dunning.service");
const notification_service_1 = require("./notification.service");
const decimal_js_1 = require("decimal.js");
const prisma = new client_1.PrismaClient();
class WebhookService {
    static async processWebhook(payload, signature) {
        try {
            const event = (0, stripe_1.verifyStripeSignature)(payload, signature);
            logger_1.logger.info('Processing Stripe webhook', {
                eventId: event.id,
                eventType: event.type,
                livemode: event.livemode,
            });
            const billingEvent = await billing_1.BillingModel.createBillingEvent({
                userId: this.getUserIdFromEvent(event),
                eventType: event.type,
                status: billing_1.EventStatus.PROCESSING,
                data: event.data,
                retryCount: 0,
            });
            try {
                await this.handleEvent(event);
                await billing_1.BillingModel.updateBillingEvent(billingEvent.id, {
                    status: billing_1.EventStatus.COMPLETED,
                    processedAt: new Date(),
                });
                logger_1.logger.info('Webhook processed successfully', {
                    eventId: event.id,
                    eventType: event.type,
                });
            }
            catch (processingError) {
                await billing_1.BillingModel.updateBillingEvent(billingEvent.id, {
                    status: billing_1.EventStatus.FAILED,
                    errorMessage: processingError.message,
                    nextRetryAt: new Date(Date.now() + 5 * 60 * 1000),
                });
                logger_1.logger.error('Failed to process webhook event', {
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
        }
        catch (error) {
            logger_1.logger.error('Webhook processing failed', { error });
            throw error;
        }
    }
    static async handleEvent(event) {
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
            case 'customer.subscription.trial_will_end':
                await this.handleTrialWillEnd(event.data.object);
                break;
            case 'invoice.created':
                await this.handleInvoiceCreated(event.data.object);
                break;
            case 'invoice.finalized':
                await this.handleInvoiceFinalized(event.data.object);
                break;
            case 'invoice.payment_succeeded':
                await this.handleInvoicePaymentSucceeded(event.data.object);
                break;
            case 'invoice.payment_failed':
                await this.handleInvoicePaymentFailed(event.data.object);
                break;
            case 'invoice.upcoming':
                await this.handleInvoiceUpcoming(event.data.object);
                break;
            case 'payment_method.attached':
                await this.handlePaymentMethodAttached(event.data.object);
                break;
            case 'payment_method.detached':
                await this.handlePaymentMethodDetached(event.data.object);
                break;
            case 'customer.created':
                await this.handleCustomerCreated(event.data.object);
                break;
            case 'customer.updated':
                await this.handleCustomerUpdated(event.data.object);
                break;
            case 'customer.deleted':
                await this.handleCustomerDeleted(event.data.object);
                break;
            case 'charge.dispute.created':
                await this.handleChargeDisputeCreated(event.data.object);
                break;
            case 'charge.dispute.updated':
                await this.handleChargeDisputeUpdated(event.data.object);
                break;
            default:
                logger_1.logger.info('Unhandled webhook event type', { eventType: event.type });
        }
    }
    static async handleSubscriptionCreated(subscription) {
        const userId = subscription.metadata?.userId;
        if (!userId) {
            logger_1.logger.warn('No userId in subscription metadata', { subscriptionId: subscription.id });
            return;
        }
        const existingSubscription = await billing_1.BillingModel.getSubscriptionByStripeId(subscription.id);
        if (!existingSubscription) {
            await billing_1.BillingModel.createSubscription({
                userId,
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: subscription.customer,
                stripePriceId: subscription.items.data[0]?.price.id || '',
                tier: subscription.metadata?.tier || 'starter',
                status: subscription.status,
                currentPeriodStart: new Date(subscription.current_period_start * 1000),
                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : undefined,
                trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
                metadata: subscription.metadata,
            });
        }
        await prisma.user.update({
            where: { id: userId },
            data: {
                subscriptionTier: subscription.metadata?.tier || 'starter',
                subscriptionId: subscription.id,
                trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
                subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
            },
        });
        await notification_service_1.NotificationService.sendSubscriptionWelcome(userId, subscription.metadata?.tier || 'starter');
    }
    static async handleSubscriptionUpdated(subscription) {
        const existingSubscription = await billing_1.BillingModel.getSubscriptionByStripeId(subscription.id);
        if (!existingSubscription) {
            logger_1.logger.warn('Subscription not found for update', { subscriptionId: subscription.id });
            return;
        }
        await billing_1.BillingModel.updateSubscription(existingSubscription.id, {
            status: subscription.status,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : undefined,
            trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
            metadata: subscription.metadata,
        });
        await prisma.user.update({
            where: { id: existingSubscription.userId },
            data: {
                subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
            },
        });
        if (subscription.status === 'canceled') {
            await notification_service_1.NotificationService.sendSubscriptionCanceled(existingSubscription.userId);
        }
        else if (subscription.status === 'past_due') {
            await notification_service_1.NotificationService.sendPaymentFailed(existingSubscription.userId);
        }
    }
    static async handleSubscriptionDeleted(subscription) {
        const existingSubscription = await billing_1.BillingModel.getSubscriptionByStripeId(subscription.id);
        if (!existingSubscription) {
            logger_1.logger.warn('Subscription not found for deletion', { subscriptionId: subscription.id });
            return;
        }
        await billing_1.BillingModel.updateSubscription(existingSubscription.id, {
            status: billing_1.SubscriptionStatus.CANCELED,
            canceledAt: new Date(),
        });
        await prisma.user.update({
            where: { id: existingSubscription.userId },
            data: {
                subscriptionTier: 'free',
                subscriptionId: null,
                subscriptionExpiresAt: null,
            },
        });
        await notification_service_1.NotificationService.sendSubscriptionEnded(existingSubscription.userId);
    }
    static async handleTrialWillEnd(subscription) {
        const userId = subscription.metadata?.userId;
        if (!userId)
            return;
        await notification_service_1.NotificationService.sendTrialEnding(userId, new Date(subscription.trial_end * 1000));
    }
    static async handleInvoiceCreated(invoice) {
        const customerId = invoice.customer;
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted)
            return;
        const userId = customer.metadata?.userId;
        if (!userId)
            return;
        await billing_1.BillingModel.createInvoice({
            userId,
            subscriptionId: invoice.subscription || undefined,
            stripeInvoiceId: invoice.id,
            status: invoice.status,
            total: new decimal_js_1.Decimal(invoice.total / 100),
            subtotal: new decimal_js_1.Decimal(invoice.subtotal / 100),
            tax: new decimal_js_1.Decimal((invoice.tax || 0) / 100),
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
    static async handleInvoicePaymentSucceeded(invoice) {
        const existingInvoice = await prisma.invoice.findUnique({
            where: { stripeInvoiceId: invoice.id },
        });
        if (existingInvoice) {
            await billing_1.BillingModel.updateInvoice(existingInvoice.id, {
                status: billing_1.InvoiceStatus.PAID,
                paidAt: new Date(invoice.status_transitions.paid_at * 1000),
            });
            await notification_service_1.NotificationService.sendPaymentSuccess(existingInvoice.userId, {
                amount: Number(existingInvoice.total),
                currency: existingInvoice.currency,
            });
        }
    }
    static async handleInvoicePaymentFailed(invoice) {
        const existingInvoice = await prisma.invoice.findUnique({
            where: { stripeInvoiceId: invoice.id },
        });
        if (existingInvoice) {
            await billing_1.BillingModel.updateInvoice(existingInvoice.id, {
                attemptCount: invoice.attempt_count || 0,
                nextPaymentAttempt: invoice.next_payment_attempt
                    ? new Date(invoice.next_payment_attempt * 1000)
                    : undefined,
            });
            await dunning_service_1.DunningService.startDunningProcess(existingInvoice.userId, existingInvoice.id);
            await notification_service_1.NotificationService.sendPaymentFailed(existingInvoice.userId);
        }
    }
    static async handleInvoiceUpcoming(invoice) {
        const customerId = invoice.customer;
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted)
            return;
        const userId = customer.metadata?.userId;
        if (!userId)
            return;
        await notification_service_1.NotificationService.sendUpcomingInvoice(userId, {
            amount: invoice.total / 100,
            currency: invoice.currency,
            dueDate: new Date((invoice.due_date || invoice.created) * 1000),
        });
    }
    static async handlePaymentMethodAttached(paymentMethod) {
        const customerId = paymentMethod.customer;
        if (!customerId)
            return;
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted)
            return;
        const userId = customer.metadata?.userId;
        if (!userId)
            return;
        await prisma.paymentMethod.create({
            data: {
                userId,
                stripePaymentMethodId: paymentMethod.id,
                type: paymentMethod.type,
                brand: paymentMethod.card?.brand,
                last4: paymentMethod.card?.last4,
                expiryMonth: paymentMethod.card?.exp_month,
                expiryYear: paymentMethod.card?.exp_year,
                isDefault: false,
                metadata: paymentMethod.metadata,
            },
        });
        await notification_service_1.NotificationService.sendPaymentMethodAdded(userId);
    }
    static async handlePaymentMethodDetached(paymentMethod) {
        await prisma.paymentMethod.deleteMany({
            where: { stripePaymentMethodId: paymentMethod.id },
        });
    }
    static async handleCustomerCreated(customer) {
        logger_1.logger.info('Customer created', { customerId: customer.id });
    }
    static async handleCustomerUpdated(customer) {
        const userId = customer.metadata?.userId;
        if (!userId)
            return;
        if (customer.email) {
            await prisma.user.update({
                where: { id: userId },
                data: { email: customer.email },
            });
        }
    }
    static async handleCustomerDeleted(customer) {
        const userId = customer.metadata?.userId;
        if (!userId)
            return;
        await prisma.paymentMethod.deleteMany({
            where: { userId },
        });
    }
    static async handleChargeDisputeCreated(dispute) {
        const charge = await stripe.charges.retrieve(dispute.charge);
        const customerId = charge.customer;
        if (!customerId)
            return;
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted)
            return;
        const userId = customer.metadata?.userId;
        if (!userId)
            return;
        const invoice = await prisma.invoice.findFirst({
            where: { stripeInvoiceId: charge.invoice },
        });
        if (!invoice)
            return;
        await prisma.chargeback.create({
            data: {
                userId,
                invoiceId: invoice.id,
                stripeChargeId: charge.id,
                amount: new decimal_js_1.Decimal(dispute.amount / 100),
                currency: dispute.currency,
                reason: dispute.reason,
                status: dispute.status,
                metadata: dispute.metadata,
            },
        });
        await notification_service_1.NotificationService.sendChargebackAlert(userId, dispute);
    }
    static async handleChargeDisputeUpdated(dispute) {
        const existingChargeback = await prisma.chargeback.findFirst({
            where: { stripeChargeId: dispute.charge },
        });
        if (existingChargeback) {
            await prisma.chargeback.update({
                where: { id: existingChargeback.id },
                data: {
                    status: dispute.status,
                    evidence: dispute.evidence,
                    evidenceSubmittedAt: dispute.evidence_details?.submission_count
                        ? new Date()
                        : undefined,
                },
            });
        }
    }
    static getUserIdFromEvent(event) {
        const obj = event.data.object;
        if (obj.metadata?.userId) {
            return obj.metadata.userId;
        }
        if (obj.customer) {
        }
        return '';
    }
    static async retryFailedEvents() {
        try {
            const failedEvents = await billing_1.BillingModel.getPendingBillingEvents(50);
            for (const event of failedEvents) {
                if (event.retryCount >= 3) {
                    await billing_1.BillingModel.updateBillingEvent(event.id, {
                        status: billing_1.EventStatus.FAILED,
                    });
                    continue;
                }
                try {
                    await billing_1.BillingModel.updateBillingEvent(event.id, {
                        status: billing_1.EventStatus.RETRYING,
                        retryCount: event.retryCount + 1,
                    });
                    const stripeEvent = {
                        id: event.id,
                        type: event.eventType,
                        data: JSON.parse(event.data),
                        created: Math.floor(event.createdAt.getTime() / 1000),
                        livemode: true,
                        object: 'event',
                        api_version: '2023-10-16',
                        pending_webhooks: 0,
                        request: { id: null, idempotency_key: null },
                    };
                    await this.handleEvent(stripeEvent);
                    await billing_1.BillingModel.updateBillingEvent(event.id, {
                        status: billing_1.EventStatus.COMPLETED,
                        processedAt: new Date(),
                    });
                    logger_1.logger.info('Successfully retried failed event', { eventId: event.id });
                }
                catch (retryError) {
                    await billing_1.BillingModel.updateBillingEvent(event.id, {
                        status: billing_1.EventStatus.FAILED,
                        errorMessage: retryError.message,
                        nextRetryAt: new Date(Date.now() + 15 * 60 * 1000),
                    });
                    logger_1.logger.error('Failed to retry event', { eventId: event.id, error: retryError });
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to retry webhook events', { error });
        }
    }
}
exports.WebhookService = WebhookService;
exports.default = WebhookService;
//# sourceMappingURL=webhook.service.js.map