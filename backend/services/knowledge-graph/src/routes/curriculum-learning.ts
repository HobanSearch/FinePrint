import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export async function curriculumLearningRoutes(server: FastifyInstance): Promise<void> {
  const curriculumLearning = (server as any).curriculumLearning;

  // Create learner profile
  server.post('/learners', {
    schema: {
      tags: ['Curriculum Learning'],
      summary: 'Create learner profile',
      body: {
        type: 'object',
        required: ['learner_type'],
        properties: {
          learner_type: { type: 'string', enum: ['AI_MODEL', 'HUMAN_ANNOTATOR', 'VALIDATION_SYSTEM'] },
          current_level: { type: 'number', minimum: 1, maximum: 10, default: 1 },
          learning_preferences: { type: 'object' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const profile = await curriculumLearning.createLearnerProfile(request.body);
      return profile;
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to create learner profile', message: error.message };
    }
  });

  // Get curriculum recommendation
  server.get('/learners/:learnerId/recommendations', {
    schema: {
      tags: ['Curriculum Learning'],
      summary: 'Get adaptive curriculum recommendation',
      params: {
        type: 'object',
        properties: {
          learnerId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          strategy: { 
            type: 'string', 
            enum: ['DIFFICULTY_BASED', 'PREREQUISITE_BASED', 'PERFORMANCE_ADAPTIVE', 'SELF_PACED', 'COMPETENCY_BASED', 'SPIRAL_CURRICULUM'],
            default: 'PERFORMANCE_ADAPTIVE',
          },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { learnerId: string }; Querystring: { strategy?: string } }>, reply: FastifyReply) => {
    try {
      const recommendation = await curriculumLearning.getAdaptiveCurriculumRecommendation(
        request.params.learnerId,
        request.query.strategy as any
      );
      return recommendation;
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to get curriculum recommendation', message: error.message };
    }
  });

  // Start learning session
  server.post('/sessions', {
    schema: {
      tags: ['Curriculum Learning'],
      summary: 'Start learning session',
      body: {
        type: 'object',
        required: ['learner_id', 'session_type', 'concepts'],
        properties: {
          learner_id: { type: 'string' },
          session_type: { type: 'string', enum: ['TRAINING', 'EVALUATION', 'REINFORCEMENT'] },
          concepts: { type: 'array', items: { type: 'string' } },
          difficulty_level: { type: 'number', minimum: 1, maximum: 10 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const session = await curriculumLearning.startLearningSession(
        (request.body as any).learner_id,
        (request.body as any).session_type,
        (request.body as any).concepts,
        (request.body as any).difficulty_level
      );
      return session;
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to start learning session', message: error.message };
    }
  });

  // Complete learning session
  server.put('/sessions/:sessionId/complete', {
    schema: {
      tags: ['Curriculum Learning'],
      summary: 'Complete learning session',
      params: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['accuracy', 'speed', 'confidence', 'error_rate'],
        properties: {
          accuracy: { type: 'number', minimum: 0, maximum: 1 },
          speed: { type: 'number', minimum: 0 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          error_rate: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
    try {
      const result = await curriculumLearning.completeLearningSession(
        request.params.sessionId,
        request.body as any
      );
      return result;
    } catch (error) {
      reply.status(500);
      return { error: 'Failed to complete learning session', message: error.message };
    }
  });
}