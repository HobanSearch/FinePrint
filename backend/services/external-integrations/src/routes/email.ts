/**
 * Email (SendGrid) API Routes
 */

import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';

// Schema definitions
const EmailRecipientSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  name: Type.Optional(Type.String()),
  userId: Type.Optional(Type.String()),
  customFields: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

const SendEmailSchema = Type.Object({
  to: Type.Union([EmailRecipientSchema, Type.Array(EmailRecipientSchema)]),
  templateId: Type.String(),
  variables: Type.Record(Type.String(), Type.Any()),
  attachments: Type.Optional(Type.Array(Type.Object({
    content: Type.String(),
    filename: Type.String(),
    type: Type.String(),
    disposition: Type.Optional(Type.String()),
  }))),
  scheduledTime: Type.Optional(Type.String({ format: 'date-time' })),
  trackingSettings: Type.Optional(Type.Object({
    clickTracking: Type.Optional(Type.Boolean()),
    openTracking: Type.Optional(Type.Boolean()),
    subscriptionTracking: Type.Optional(Type.Boolean()),
  })),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

const SendCampaignSchema = Type.Object({
  name: Type.String(),
  templateId: Type.String(),
  recipients: Type.Array(EmailRecipientSchema),
  status: Type.Optional(Type.Union([
    Type.Literal('draft'),
    Type.Literal('scheduled'),
    Type.Literal('sending'),
    Type.Literal('sent'),
    Type.Literal('failed'),
  ])),
  scheduledTime: Type.Optional(Type.String({ format: 'date-time' })),
  metadata: Type.Record(Type.String(), Type.Any()),
});

const CreateTemplateSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  subject: Type.String(),
  htmlTemplate: Type.String(),
  textTemplate: Type.Optional(Type.String()),
  variables: Type.Array(Type.String()),
  category: Type.String(),
});

const ScheduleRecurringEmailSchema = Type.Object({
  to: Type.Union([EmailRecipientSchema, Type.Array(EmailRecipientSchema)]),
  templateId: Type.String(),
  variables: Type.Record(Type.String(), Type.Any()),
  frequency: Type.Union([
    Type.Literal('daily'),
    Type.Literal('weekly'),
    Type.Literal('monthly'),
  ]),
  endDate: Type.Optional(Type.String({ format: 'date-time' })),
});

type SendEmailInput = Static<typeof SendEmailSchema>;
type SendCampaignInput = Static<typeof SendCampaignSchema>;
type CreateTemplateInput = Static<typeof CreateTemplateSchema>;
type ScheduleRecurringEmailInput = Static<typeof ScheduleRecurringEmailSchema>;

export default async function emailRoutes(fastify: FastifyInstance) {
  // Send email
  fastify.post<{ Body: SendEmailInput }>(
    '/send',
    {
      schema: {
        body: SendEmailSchema,
        response: {
          200: Type.Object({
            emailId: Type.String(),
            message: Type.String(),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const options = {
        ...request.body,
        scheduledTime: request.body.scheduledTime 
          ? new Date(request.body.scheduledTime) 
          : undefined,
      };

      const emailId = await fastify.sendGridService.sendEmail(options);

      return {
        emailId,
        message: 'Email sent successfully',
      };
    }
  );

  // Send campaign
  fastify.post<{ Body: SendCampaignInput }>(
    '/campaigns',
    {
      schema: {
        body: SendCampaignSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const campaign = {
        ...request.body,
        scheduledTime: request.body.scheduledTime 
          ? new Date(request.body.scheduledTime) 
          : undefined,
      };

      const result = await fastify.sendGridService.sendCampaign(campaign);

      return {
        campaign: result,
        message: 'Campaign created successfully',
      };
    }
  );

  // Get campaign
  fastify.get<{ Params: { campaignId: string } }>(
    '/campaigns/:campaignId',
    {
      schema: {
        params: Type.Object({
          campaignId: Type.String(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const campaign = await fastify.sendGridService.getCampaign(
        request.params.campaignId
      );

      if (!campaign) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }

      return campaign;
    }
  );

  // Get email analytics
  fastify.get<{
    Querystring: {
      emailId?: string;
      campaignId?: string;
      recipient?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
    };
  }>(
    '/analytics',
    {
      schema: {
        querystring: Type.Object({
          emailId: Type.Optional(Type.String()),
          campaignId: Type.Optional(Type.String()),
          recipient: Type.Optional(Type.String()),
          startDate: Type.Optional(Type.String({ format: 'date-time' })),
          endDate: Type.Optional(Type.String({ format: 'date-time' })),
          status: Type.Optional(Type.String()),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const filters = {
        ...request.query,
        startDate: request.query.startDate 
          ? new Date(request.query.startDate) 
          : undefined,
        endDate: request.query.endDate 
          ? new Date(request.query.endDate) 
          : undefined,
      };

      const analytics = await fastify.sendGridService.getEmailAnalytics(filters);

      return {
        analytics,
        total: analytics.length,
      };
    }
  );

  // Get templates
  fastify.get('/templates', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const templates = fastify.sendGridService.getTemplates();

    return {
      templates,
      total: templates.length,
    };
  });

  // Get template
  fastify.get<{ Params: { templateId: string } }>(
    '/templates/:templateId',
    {
      schema: {
        params: Type.Object({
          templateId: Type.String(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const template = fastify.sendGridService.getTemplate(request.params.templateId);

      if (!template) {
        return reply.code(404).send({ error: 'Template not found' });
      }

      return template;
    }
  );

  // Create custom template
  fastify.post<{ Body: CreateTemplateInput }>(
    '/templates',
    {
      schema: {
        body: CreateTemplateSchema,
      },
      preHandler: [fastify.authenticate, fastify.authorize(['admin'])],
    },
    async (request, reply) => {
      await fastify.sendGridService.createTemplate(request.body);

      return {
        message: 'Template created successfully',
      };
    }
  );

  // Schedule recurring email
  fastify.post<{ Body: ScheduleRecurringEmailInput }>(
    '/schedule/recurring',
    {
      schema: {
        body: ScheduleRecurringEmailSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const options = {
        ...request.body,
        endDate: request.body.endDate 
          ? new Date(request.body.endDate) 
          : undefined,
      };

      const scheduleId = await fastify.sendGridService.scheduleRecurringEmail(options);

      return {
        scheduleId,
        message: 'Recurring email scheduled successfully',
      };
    }
  );

  // Test email
  fastify.post<{
    Body: {
      to: string;
      templateId: string;
      variables: Record<string, any>;
    };
  }>(
    '/test',
    {
      schema: {
        body: Type.Object({
          to: Type.String({ format: 'email' }),
          templateId: Type.String(),
          variables: Type.Record(Type.String(), Type.Any()),
        }),
      },
      preHandler: [fastify.authenticate, fastify.authorize(['admin'])],
    },
    async (request, reply) => {
      const emailId = await fastify.sendGridService.sendEmail({
        to: {
          email: request.body.to,
          name: 'Test User',
        },
        templateId: request.body.templateId,
        variables: request.body.variables,
        metadata: {
          test: true,
        },
      });

      return {
        emailId,
        message: 'Test email sent successfully',
      };
    }
  );
}