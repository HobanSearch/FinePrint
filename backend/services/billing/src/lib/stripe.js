"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Stripe = exports.calculateTax = exports.getUpcomingInvoice = exports.createUsageRecord = exports.retryFailedPayment = exports.createPaymentIntent = exports.createSetupIntent = exports.formatAmountFromStripe = exports.formatStripeAmount = exports.getOrCreateStripeCustomer = exports.verifyStripeSignature = exports.stripe = void 0;
const stripe_1 = __importDefault(require("stripe"));
exports.Stripe = stripe_1.default;
const config_1 = __importDefault(require("../config"));
const logger_1 = require("../utils/logger");
exports.stripe = new stripe_1.default(config_1.default.STRIPE_SECRET_KEY, {
    apiVersion: config_1.default.STRIPE_API_VERSION,
    typescript: true,
    telemetry: false,
});
const verifyStripeSignature = (payload, signature) => {
    try {
        return exports.stripe.webhooks.constructEvent(payload, signature, config_1.default.STRIPE_WEBHOOK_SECRET);
    }
    catch (error) {
        logger_1.logger.error('Stripe webhook signature verification failed', { error });
        throw new Error('Invalid webhook signature');
    }
};
exports.verifyStripeSignature = verifyStripeSignature;
const getOrCreateStripeCustomer = async (userId, email, name, metadata) => {
    try {
        const existingCustomers = await exports.stripe.customers.list({
            email,
            limit: 1,
        });
        if (existingCustomers.data.length > 0) {
            const customer = existingCustomers.data[0];
            if (metadata && customer.metadata?.userId !== userId) {
                await exports.stripe.customers.update(customer.id, {
                    metadata: { ...customer.metadata, userId, ...metadata },
                });
            }
            return customer;
        }
        const customer = await exports.stripe.customers.create({
            email,
            name,
            metadata: {
                userId,
                ...metadata,
            },
        });
        logger_1.logger.info('Created new Stripe customer', {
            customerId: customer.id,
            userId,
            email,
        });
        return customer;
    }
    catch (error) {
        logger_1.logger.error('Failed to create or retrieve Stripe customer', {
            error,
            userId,
            email,
        });
        throw error;
    }
};
exports.getOrCreateStripeCustomer = getOrCreateStripeCustomer;
const formatStripeAmount = (amount, currency = 'usd') => {
    const zeroDecimalCurrencies = ['jpy', 'krw', 'vnd'];
    if (zeroDecimalCurrencies.includes(currency.toLowerCase())) {
        return Math.round(amount);
    }
    return Math.round(amount * 100);
};
exports.formatStripeAmount = formatStripeAmount;
const formatAmountFromStripe = (amount, currency = 'usd') => {
    const zeroDecimalCurrencies = ['jpy', 'krw', 'vnd'];
    if (zeroDecimalCurrencies.includes(currency.toLowerCase())) {
        return amount;
    }
    return amount / 100;
};
exports.formatAmountFromStripe = formatAmountFromStripe;
const createSetupIntent = async (customerId, metadata) => {
    try {
        const setupIntent = await exports.stripe.setupIntents.create({
            customer: customerId,
            payment_method_types: ['card'],
            usage: 'off_session',
            metadata,
        });
        return setupIntent;
    }
    catch (error) {
        logger_1.logger.error('Failed to create setup intent', { error, customerId });
        throw error;
    }
};
exports.createSetupIntent = createSetupIntent;
const createPaymentIntent = async (amount, currency, customerId, paymentMethodId, metadata) => {
    try {
        const paymentIntentData = {
            amount: (0, exports.formatStripeAmount)(amount, currency),
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
        const paymentIntent = await exports.stripe.paymentIntents.create(paymentIntentData);
        return paymentIntent;
    }
    catch (error) {
        logger_1.logger.error('Failed to create payment intent', {
            error,
            amount,
            currency,
            customerId,
        });
        throw error;
    }
};
exports.createPaymentIntent = createPaymentIntent;
const retryFailedPayment = async (invoiceId) => {
    try {
        const invoice = await exports.stripe.invoices.pay(invoiceId, {
            forgive: false,
        });
        logger_1.logger.info('Successfully retried failed payment', { invoiceId });
        return invoice;
    }
    catch (error) {
        logger_1.logger.error('Failed to retry payment', { error, invoiceId });
        throw error;
    }
};
exports.retryFailedPayment = retryFailedPayment;
const createUsageRecord = async (subscriptionItemId, quantity, timestamp, action = 'increment') => {
    try {
        const usageRecord = await exports.stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
            quantity,
            timestamp: timestamp || Math.floor(Date.now() / 1000),
            action,
        });
        return usageRecord;
    }
    catch (error) {
        logger_1.logger.error('Failed to create usage record', {
            error,
            subscriptionItemId,
            quantity,
        });
        throw error;
    }
};
exports.createUsageRecord = createUsageRecord;
const getUpcomingInvoice = async (customerId, subscriptionId) => {
    try {
        const params = {
            customer: customerId,
        };
        if (subscriptionId) {
            params.subscription = subscriptionId;
        }
        const invoice = await exports.stripe.invoices.retrieveUpcoming(params);
        return invoice;
    }
    catch (error) {
        logger_1.logger.error('Failed to retrieve upcoming invoice', {
            error,
            customerId,
            subscriptionId,
        });
        throw error;
    }
};
exports.getUpcomingInvoice = getUpcomingInvoice;
const calculateTax = async (customerId, lineItems) => {
    try {
        const calculation = await exports.stripe.tax.calculations.create({
            currency: lineItems[0]?.currency || 'usd',
            customer: customerId,
            line_items: lineItems.map((item, index) => ({
                amount: (0, exports.formatStripeAmount)(item.amount, item.currency),
                reference: `item_${index}`,
            })),
        });
        return calculation;
    }
    catch (error) {
        logger_1.logger.error('Failed to calculate tax', { error, customerId });
        throw error;
    }
};
exports.calculateTax = calculateTax;
//# sourceMappingURL=stripe.js.map