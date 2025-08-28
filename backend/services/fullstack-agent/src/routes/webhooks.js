"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = webhooksRoutes;
const logger_1 = require("@/utils/logger");
const logger = logger_1.Logger.getInstance();
async function webhooksRoutes(fastify) {
    fastify.post('/:integration', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    integration: { type: 'string' },
                },
                required: ['integration'],
            },
            body: {
                type: 'object',
            },
        },
    }, async (request, reply) => {
        try {
            const { integration } = request.params;
            const payload = request.body;
            logger.info('Webhook received', {
                integration,
                payloadSize: JSON.stringify(payload).length,
                headers: request.headers,
            });
            switch (integration.toLowerCase()) {
                case 'github':
                    await handleGitHubWebhook(payload, request.headers);
                    break;
                case 'stripe':
                    await handleStripeWebhook(payload, request.headers);
                    break;
                case 'dspy':
                    await handleDSPyWebhook(payload, request.headers);
                    break;
                case 'monitoring':
                    await handleMonitoringWebhook(payload, request.headers);
                    break;
                default:
                    logger.warn('Unknown webhook integration', { integration });
            }
            const response = {
                success: true,
                data: { message: 'Webhook processed successfully' },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Webhook processing failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'WEBHOOK_PROCESSING_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/health', async (request, reply) => {
        try {
            logger.info('Health webhook received', {
                payload: request.body,
            });
            const response = {
                success: true,
                data: {
                    status: 'healthy',
                    timestamp: new Date(),
                },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Health webhook failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'HEALTH_WEBHOOK_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
    fastify.post('/templates', async (request, reply) => {
        try {
            const payload = request.body;
            logger.info('Template repository webhook received', {
                event: request.headers['x-github-event'],
                action: payload.action,
                repository: payload.repository?.full_name,
            });
            if (request.headers['x-github-event'] === 'push') {
                logger.info('Template repository push event detected', {
                    ref: payload.ref,
                    commits: payload.commits?.length,
                });
            }
            const response = {
                success: true,
                data: { message: 'Template webhook processed successfully' },
            };
            return reply.send(response);
        }
        catch (error) {
            logger.error('Template webhook processing failed', { error: error.message });
            const response = {
                success: false,
                error: {
                    code: 'TEMPLATE_WEBHOOK_FAILED',
                    message: error.message,
                    timestamp: new Date(),
                },
            };
            return reply.status(500).send(response);
        }
    });
}
async function handleGitHubWebhook(payload, headers) {
    const event = headers['x-github-event'];
    const delivery = headers['x-github-delivery'];
    logger.info('Processing GitHub webhook', {
        event,
        delivery,
        action: payload.action,
        repository: payload.repository?.full_name,
    });
    switch (event) {
        case 'push':
            await handleGitHubPush(payload);
            break;
        case 'pull_request':
            await handleGitHubPullRequest(payload);
            break;
        case 'issues':
            await handleGitHubIssue(payload);
            break;
        case 'repository':
            await handleGitHubRepository(payload);
            break;
        default:
            logger.debug('Unhandled GitHub event', { event });
    }
}
async function handleStripeWebhook(payload, headers) {
    const event = payload.type;
    const stripeSignature = headers['stripe-signature'];
    logger.info('Processing Stripe webhook', {
        event,
        id: payload.id,
        livemode: payload.livemode,
    });
    switch (event) {
        case 'payment_intent.succeeded':
            await handleStripePaymentSuccess(payload.data.object);
            break;
        case 'customer.subscription.created':
            await handleStripeSubscriptionCreated(payload.data.object);
            break;
        case 'customer.subscription.updated':
            await handleStripeSubscriptionUpdated(payload.data.object);
            break;
        case 'invoice.payment_failed':
            await handleStripePaymentFailed(payload.data.object);
            break;
        default:
            logger.debug('Unhandled Stripe event', { event });
    }
}
async function handleDSPyWebhook(payload, headers) {
    logger.info('Processing DSPy webhook', {
        type: payload.type,
        data: payload.data,
    });
    switch (payload.type) {
        case 'optimization_complete':
            await handleDSPyOptimizationComplete(payload.data);
            break;
        case 'model_update':
            await handleDSPyModelUpdate(payload.data);
            break;
        case 'metrics_update':
            await handleDSPyMetricsUpdate(payload.data);
            break;
        default:
            logger.debug('Unhandled DSPy event', { type: payload.type });
    }
}
async function handleMonitoringWebhook(payload, headers) {
    logger.info('Processing monitoring webhook', {
        alertType: payload.alertType,
        severity: payload.severity,
        service: payload.service,
    });
    switch (payload.alertType) {
        case 'service_down':
            await handleServiceDownAlert(payload);
            break;
        case 'high_error_rate':
            await handleHighErrorRateAlert(payload);
            break;
        case 'performance_degradation':
            await handlePerformanceDegradationAlert(payload);
            break;
        default:
            logger.debug('Unhandled monitoring alert', { alertType: payload.alertType });
    }
}
async function handleGitHubPush(payload) {
    logger.info('Handling GitHub push event', {
        ref: payload.ref,
        commits: payload.commits?.length,
    });
}
async function handleGitHubPullRequest(payload) {
    logger.info('Handling GitHub PR event', {
        action: payload.action,
        number: payload.number,
        title: payload.pull_request?.title,
    });
}
async function handleGitHubIssue(payload) {
    logger.info('Handling GitHub issue event', {
        action: payload.action,
        number: payload.issue?.number,
        title: payload.issue?.title,
    });
}
async function handleGitHubRepository(payload) {
    logger.info('Handling GitHub repository event', {
        action: payload.action,
        repository: payload.repository?.full_name,
    });
}
async function handleStripePaymentSuccess(paymentIntent) {
    logger.info('Handling Stripe payment success', {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
    });
}
async function handleStripeSubscriptionCreated(subscription) {
    logger.info('Handling Stripe subscription created', {
        id: subscription.id,
        customer: subscription.customer,
        status: subscription.status,
    });
}
async function handleStripeSubscriptionUpdated(subscription) {
    logger.info('Handling Stripe subscription updated', {
        id: subscription.id,
        status: subscription.status,
    });
}
async function handleStripePaymentFailed(invoice) {
    logger.info('Handling Stripe payment failed', {
        id: invoice.id,
        customer: invoice.customer,
        amount: invoice.amount_due,
    });
}
async function handleDSPyOptimizationComplete(data) {
    logger.info('Handling DSPy optimization complete', data);
}
async function handleDSPyModelUpdate(data) {
    logger.info('Handling DSPy model update', data);
}
async function handleDSPyMetricsUpdate(data) {
    logger.info('Handling DSPy metrics update', data);
}
async function handleServiceDownAlert(payload) {
    logger.error('Service down alert received', {
        service: payload.service,
        timestamp: payload.timestamp,
        details: payload.details,
    });
}
async function handleHighErrorRateAlert(payload) {
    logger.warn('High error rate alert received', {
        service: payload.service,
        errorRate: payload.errorRate,
        threshold: payload.threshold,
    });
}
async function handlePerformanceDegradationAlert(payload) {
    logger.warn('Performance degradation alert received', {
        service: payload.service,
        metric: payload.metric,
        value: payload.value,
        threshold: payload.threshold,
    });
}
//# sourceMappingURL=webhooks.js.map