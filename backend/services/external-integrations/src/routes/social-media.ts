/**
 * Social Media API Routes
 */

import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';

// Schema definitions
const SocialProfileSchema = Type.Object({
  platform: Type.Union([
    Type.Literal('twitter'),
    Type.Literal('linkedin'),
    Type.Literal('facebook'),
  ]),
  profileId: Type.String(),
  profileName: Type.String(),
  profileUrl: Type.String(),
  followers: Type.Optional(Type.Number()),
  verified: Type.Optional(Type.Boolean()),
  accessToken: Type.Optional(Type.String()),
  refreshToken: Type.Optional(Type.String()),
  tokenExpiry: Type.Optional(Type.String({ format: 'date-time' })),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

const SocialPostSchema = Type.Object({
  platform: Type.Union([
    Type.Literal('twitter'),
    Type.Literal('linkedin'),
    Type.Literal('facebook'),
  ]),
  profileId: Type.String(),
  content: Type.String(),
  mediaUrls: Type.Optional(Type.Array(Type.String())),
  link: Type.Optional(Type.String()),
  hashtags: Type.Optional(Type.Array(Type.String())),
  mentions: Type.Optional(Type.Array(Type.String())),
  scheduledTime: Type.Optional(Type.String({ format: 'date-time' })),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

const CreateCampaignSchema = Type.Object({
  name: Type.String(),
  description: Type.String(),
  posts: Type.Array(SocialPostSchema),
  startDate: Type.String({ format: 'date-time' }),
  endDate: Type.Optional(Type.String({ format: 'date-time' })),
  status: Type.Optional(Type.Union([
    Type.Literal('draft'),
    Type.Literal('active'),
    Type.Literal('completed'),
    Type.Literal('paused'),
  ])),
  goals: Type.Object({
    impressions: Type.Optional(Type.Number()),
    engagement: Type.Optional(Type.Number()),
    clicks: Type.Optional(Type.Number()),
  }),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

type SocialProfileInput = Static<typeof SocialProfileSchema>;
type SocialPostInput = Static<typeof SocialPostSchema>;
type CreateCampaignInput = Static<typeof CreateCampaignSchema>;

export default async function socialMediaRoutes(fastify: FastifyInstance) {
  // Connect social profile
  fastify.post<{ Body: SocialProfileInput }>(
    '/profiles',
    {
      schema: {
        body: SocialProfileSchema,
        response: {
          200: Type.Object({
            message: Type.String(),
          }),
        },
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const profile = {
        ...request.body,
        tokenExpiry: request.body.tokenExpiry 
          ? new Date(request.body.tokenExpiry) 
          : undefined,
      };

      await fastify.socialMediaService.connectProfile(profile);

      return {
        message: 'Profile connected successfully',
      };
    }
  );

  // Disconnect social profile
  fastify.delete<{
    Params: { platform: string; profileId: string };
  }>(
    '/profiles/:platform/:profileId',
    {
      schema: {
        params: Type.Object({
          platform: Type.String(),
          profileId: Type.String(),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      await fastify.socialMediaService.disconnectProfile(
        request.params.platform,
        request.params.profileId
      );

      return {
        message: 'Profile disconnected successfully',
      };
    }
  );

  // Get connected profiles
  fastify.get('/profiles', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const profiles = fastify.socialMediaService.getProfiles();

    return {
      profiles,
      total: profiles.length,
    };
  });

  // Publish post
  fastify.post<{ Body: SocialPostInput }>(
    '/posts',
    {
      schema: {
        body: SocialPostSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const post = {
        ...request.body,
        scheduledTime: request.body.scheduledTime 
          ? new Date(request.body.scheduledTime) 
          : undefined,
        status: 'draft' as const,
      };

      const publishedPost = await fastify.socialMediaService.publishPost(post);

      return {
        post: publishedPost,
        message: 'Post published successfully',
      };
    }
  );

  // Schedule post
  fastify.post<{ Body: SocialPostInput }>(
    '/posts/schedule',
    {
      schema: {
        body: SocialPostSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.body.scheduledTime) {
        return reply.code(400).send({ error: 'Scheduled time is required' });
      }

      const post = {
        ...request.body,
        scheduledTime: new Date(request.body.scheduledTime),
        status: 'scheduled' as const,
      };

      const scheduledPost = await fastify.socialMediaService.schedulePost(post);

      return {
        post: scheduledPost,
        message: 'Post scheduled successfully',
      };
    }
  );

  // Create campaign
  fastify.post<{ Body: CreateCampaignInput }>(
    '/campaigns',
    {
      schema: {
        body: CreateCampaignSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const campaign = {
        ...request.body,
        startDate: new Date(request.body.startDate),
        endDate: request.body.endDate 
          ? new Date(request.body.endDate) 
          : undefined,
        posts: request.body.posts.map(post => ({
          ...post,
          scheduledTime: post.scheduledTime 
            ? new Date(post.scheduledTime) 
            : undefined,
          status: 'draft' as const,
        })),
      };

      const createdCampaign = await fastify.socialMediaService.createCampaign(campaign);

      return {
        campaign: createdCampaign,
        message: 'Campaign created successfully',
      };
    }
  );

  // Get analytics
  fastify.get<{
    Params: { platform: string; profileId: string };
    Querystring: {
      startDate: string;
      endDate: string;
    };
  }>(
    '/analytics/:platform/:profileId',
    {
      schema: {
        params: Type.Object({
          platform: Type.String(),
          profileId: Type.String(),
        }),
        querystring: Type.Object({
          startDate: Type.String({ format: 'date-time' }),
          endDate: Type.String({ format: 'date-time' }),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const timeRange = {
        start: new Date(request.query.startDate),
        end: new Date(request.query.endDate),
      };

      const analytics = await fastify.socialMediaService.getAnalytics(
        request.params.platform,
        request.params.profileId,
        timeRange
      );

      return analytics;
    }
  );

  // Generate content suggestions
  fastify.post<{
    Body: {
      platform: string;
      topic: string;
      count?: number;
    };
  }>(
    '/content/suggestions',
    {
      schema: {
        body: Type.Object({
          platform: Type.String(),
          topic: Type.String(),
          count: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const suggestions = await fastify.socialMediaService.generateContentSuggestions(
        request.body.platform,
        request.body.topic,
        request.body.count || 5
      );

      return {
        suggestions,
        total: suggestions.length,
      };
    }
  );

  // Monitor mentions
  fastify.post<{
    Body: {
      platform: string;
      profileId: string;
      keywords: string[];
    };
  }>(
    '/monitoring/mentions',
    {
      schema: {
        body: Type.Object({
          platform: Type.String(),
          profileId: Type.String(),
          keywords: Type.Array(Type.String()),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      await fastify.socialMediaService.monitorMentions(
        request.body.platform,
        request.body.profileId,
        request.body.keywords
      );

      return {
        message: 'Mention monitoring started',
      };
    }
  );
}