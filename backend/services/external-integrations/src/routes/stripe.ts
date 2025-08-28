/**
 * Stripe API Routes
 */

import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';

// Schema definitions
const CreateCustomerSchema = Type.Object({
  id: Type.String(),
  email: Type.String({ format: 'email' }),
  name: Type.String(),
  companyName: Type.Optional(Type.String()),
});

const CreateSubscriptionSchema = Type.Object({
  customerId: Type.String(),
  planId: Type.String(),
  paymentMethodId: Type.Optional(Type.String()),
});

const UpdateSubscriptionSchema = Type.Object({
  planId: Type.Optional(Type.String()),
  quantity: Type.Optional(Type.Number()),
  cancelAtPeriodEnd: Type.Optional(Type.Boolean()),
});

const AddPaymentMethodSchema = Type.Object({
  paymentMethodId: Type.String(),
  setAsDefault: Type.Optional(Type.Boolean()),
});

const RecordUsageSchema = Type.Object({
  customerId: Type.String(),
  metric: Type.Union([
    Type.Literal('documents_analyzed'),
    Type.Literal('api_calls'),
    Type.Literal('ai_credits'),
  ]),
  quantity: Type.Number({ minimum: 0 }),
  timestamp: Type.String({ format: 'date-time' }),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

const CreateCheckoutSessionSchema = Type.Object({
  customerId: Type.String(),
  planId: Type.String(),
  successUrl: Type.String({ format: 'uri' }),
  cancelUrl: Type.String({ format: 'uri' }),
});

type CreateCustomerInput = Static<typeof CreateCustomerSchema>;
type CreateSubscriptionInput = Static<typeof CreateSubscriptionSchema>;
type UpdateSubscriptionInput = Static<typeof UpdateSubscriptionSchema>;
type AddPaymentMethodInput = Static<typeof AddPaymentMethodSchema>;
type RecordUsageInput = Static<typeof RecordUsageSchema>;
type CreateCheckoutSessionInput = Static<typeof CreateCheckoutSessionSchema>;

export default async function stripeRoutes(fastify: FastifyInstance) {
  // Create customer
  fastify.post<{ Body: CreateCustomerInput }>(
    '/customers',
    {
      schema: {
        body: CreateCustomerSchema,
        response: {
          200: Type.Object({
            customer: Type.Any(),
            message: Type.String(),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const customer = await fastify.stripeService.createCustomer(request.body);

      return {
        customer,
        message: 'Customer created successfully',
      };
    }
  );

  // Get customer
  fastify.get<{ Params: { customerId: string } }>(
    '/customers/:customerId',
    {
      schema: {
        params: Type.Object({
          customerId: Type.String(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      // This would need to be implemented in the StripeService
      return {
        customer: null,
        message: 'Not implemented',
      };
    }
  );

  // Create subscription
  fastify.post<{ Body: CreateSubscriptionInput }>(
    '/subscriptions',
    {
      schema: {
        body: CreateSubscriptionSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { customerId, planId, paymentMethodId } = request.body;

      const subscription = await fastify.stripeService.createSubscription(
        customerId,
        planId,
        paymentMethodId
      );

      return {
        subscription,
        message: 'Subscription created successfully',
      };
    }
  );

  // Update subscription
  fastify.patch<{
    Params: { subscriptionId: string };
    Body: UpdateSubscriptionInput;
  }>(
    '/subscriptions/:subscriptionId',
    {
      schema: {
        params: Type.Object({
          subscriptionId: Type.String(),
        }),
        body: UpdateSubscriptionSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const subscription = await fastify.stripeService.updateSubscription(
        request.params.subscriptionId,
        request.body
      );

      return {
        subscription,
        message: 'Subscription updated successfully',
      };
    }
  );

  // Cancel subscription
  fastify.delete<{
    Params: { subscriptionId: string };
    Querystring: { immediately?: string };
  }>(
    '/subscriptions/:subscriptionId',
    {
      schema: {
        params: Type.Object({
          subscriptionId: Type.String(),
        }),
        querystring: Type.Object({
          immediately: Type.Optional(Type.String()),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const immediately = request.query.immediately === 'true';

      const subscription = await fastify.stripeService.cancelSubscription(
        request.params.subscriptionId,
        immediately
      );

      return {
        subscription,
        message: 'Subscription cancelled successfully',
      };
    }
  );

  // Add payment method
  fastify.post<{
    Params: { customerId: string };
    Body: AddPaymentMethodInput;
  }>(
    '/customers/:customerId/payment-methods',
    {
      schema: {
        params: Type.Object({
          customerId: Type.String(),
        }),
        body: AddPaymentMethodSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const paymentMethod = await fastify.stripeService.addPaymentMethod(
        request.params.customerId,
        request.body.paymentMethodId,
        request.body.setAsDefault
      );

      return {
        paymentMethod,
        message: 'Payment method added successfully',
      };
    }
  );

  // List payment methods
  fastify.get<{ Params: { customerId: string } }>(
    '/customers/:customerId/payment-methods',
    {
      schema: {
        params: Type.Object({
          customerId: Type.String(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const paymentMethods = await fastify.stripeService.listPaymentMethods(
        request.params.customerId
      );

      return {
        paymentMethods,
        total: paymentMethods.length,
      };
    }
  );

  // Record usage
  fastify.post<{ Body: RecordUsageInput }>(
    '/usage',
    {
      schema: {
        body: RecordUsageSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const usage = {
        ...request.body,
        timestamp: new Date(request.body.timestamp),
      };

      await fastify.stripeService.recordUsage(usage);

      return {
        message: 'Usage recorded successfully',
      };
    }
  );

  // Get invoices
  fastify.get<{
    Params: { customerId: string };
    Querystring: { limit?: string };
  }>(
    '/customers/:customerId/invoices',
    {
      schema: {
        params: Type.Object({
          customerId: Type.String(),
        }),
        querystring: Type.Object({
          limit: Type.Optional(Type.String()),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const limit = request.query.limit ? parseInt(request.query.limit) : 10;

      const invoices = await fastify.stripeService.getInvoices(
        request.params.customerId,
        limit
      );

      return {
        invoices,
        total: invoices.length,
      };
    }
  );

  // Create checkout session
  fastify.post<{ Body: CreateCheckoutSessionInput }>(
    '/checkout/sessions',
    {
      schema: {
        body: CreateCheckoutSessionSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const session = await fastify.stripeService.createCheckoutSession(
        request.body.customerId,
        request.body.planId,
        request.body.successUrl,
        request.body.cancelUrl
      );

      return {
        sessionId: session.id,
        url: session.url,
      };
    }
  );

  // Create billing portal session
  fastify.post<{
    Params: { customerId: string };
    Body: { returnUrl: string };
  }>(
    '/customers/:customerId/billing-portal',
    {
      schema: {
        params: Type.Object({
          customerId: Type.String(),
        }),
        body: Type.Object({
          returnUrl: Type.String({ format: 'uri' }),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const session = await fastify.stripeService.createBillingPortalSession(
        request.params.customerId,
        request.body.returnUrl
      );

      return {
        url: session.url,
      };
    }
  );

  // Get subscription plans
  fastify.get('/plans', async (request, reply) => {
    const plans = fastify.stripeService.getPlans();

    return {
      plans,
      total: plans.length,
    };
  });

  // Get plan details
  fastify.get<{ Params: { planId: string } }>(
    '/plans/:planId',
    {
      schema: {
        params: Type.Object({
          planId: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const plan = fastify.stripeService.getPlan(request.params.planId);

      if (!plan) {
        return reply.code(404).send({ error: 'Plan not found' });
      }

      return plan;
    }
  );
}