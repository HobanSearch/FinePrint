import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { Redis } from 'ioredis';
import { config } from '../config';
import { jobScheduler } from '../services/job-scheduler';
import { scoreCardGenerator } from '../services/score-card-generator';
import { neo4jService } from '../services/neo4j-service';

const prisma = new PrismaClient();
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
});

// Request schemas
const getScoreSchema = z.object({
  websiteId: z.string(),
});

const getScoresSchema = z.object({
  category: z.string().optional(),
  limit: z.number().min(1).max(50).default(50),
  offset: z.number().min(0).default(0),
  sortBy: z.enum(['score', 'name', 'rank', 'recent']).default('score'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const compareSchema = z.object({
  websiteIds: z.array(z.string()).min(2).max(10),
});

const trendingSchema = z.object({
  trend: z.enum(['improving', 'declining']),
  limit: z.number().min(1).max(20).default(10),
});

export class ScoresController {
  /**
   * Get score for a specific website
   */
  async getScore(
    request: FastifyRequest<{ Params: { websiteId: string } }>,
    reply: FastifyReply
  ) {
    const { websiteId } = request.params;

    // Check cache first
    const cacheKey = `score:${websiteId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return reply.send(JSON.parse(cached));
    }

    const score = await prisma.privacyScore.findFirst({
      where: { websiteId },
      orderBy: { calculatedAt: 'desc' },
      include: {
        website: true,
        patternDetections: true,
      },
    });

    if (!score) {
      return reply.code(404).send({ error: 'Score not found' });
    }

    const response = {
      website: {
        id: score.website.id,
        name: score.website.name,
        domain: score.website.domain,
        category: score.website.category,
        rank: score.website.rank,
      },
      score: {
        value: score.overallScore,
        grade: score.grade,
        breakdown: {
          patternDetection: score.patternScore,
          dataCollection: score.dataScore,
          userRights: score.rightsScore,
          transparency: score.transparencyScore,
        },
        trending: score.trending,
        calculatedAt: score.calculatedAt,
      },
      patterns: score.patternDetections.map(p => ({
        id: p.patternId,
        name: p.patternName,
        severity: p.severity,
        description: p.description,
        impact: p.impact,
      })),
    };

    // Cache for 1 hour
    await redis.setex(cacheKey, config.cache.ttl.score, JSON.stringify(response));

    return reply.send(response);
  }

  /**
   * Get all scores with filtering and pagination
   */
  async getScores(
    request: FastifyRequest<{ Querystring: any }>,
    reply: FastifyReply
  ) {
    const query = getScoresSchema.parse(request.query);

    const where: any = {};
    if (query.category) {
      where.category = query.category;
    }

    const orderBy: any = {};
    switch (query.sortBy) {
      case 'score':
        orderBy.scores = { _max: { overallScore: query.order } };
        break;
      case 'name':
        orderBy.name = query.order;
        break;
      case 'rank':
        orderBy.rank = query.order;
        break;
      case 'recent':
        orderBy.lastChecked = query.order;
        break;
    }

    const websites = await prisma.website.findMany({
      where,
      orderBy,
      take: query.limit,
      skip: query.offset,
      include: {
        scores: {
          orderBy: { calculatedAt: 'desc' },
          take: 1,
        },
      },
    });

    const total = await prisma.website.count({ where });

    const results = websites
      .filter(w => w.scores.length > 0)
      .map(w => ({
        website: {
          id: w.id,
          name: w.name,
          domain: w.domain,
          category: w.category,
          rank: w.rank,
        },
        score: {
          value: w.scores[0].overallScore,
          grade: w.scores[0].grade,
          trending: w.scores[0].trending,
          calculatedAt: w.scores[0].calculatedAt,
        },
      }));

    return reply.send({
      results,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
    });
  }

  /**
   * Compare multiple websites
   */
  async compareWebsites(
    request: FastifyRequest<{ Body: any }>,
    reply: FastifyReply
  ) {
    const { websiteIds } = compareSchema.parse(request.body);

    const comparison = await neo4jService.getWebsiteComparison(websiteIds);

    return reply.send({
      comparison,
      averageScore: comparison.reduce((sum, w) => sum + w.score, 0) / comparison.length,
      bestPerformer: comparison[0],
      worstPerformer: comparison[comparison.length - 1],
    });
  }

  /**
   * Get trending websites
   */
  async getTrending(
    request: FastifyRequest<{ Querystring: any }>,
    reply: FastifyReply
  ) {
    const query = trendingSchema.parse(request.query);

    const trending = await neo4jService.getTrendingWebsites(query.trend);

    return reply.send({
      trend: query.trend,
      websites: trending.slice(0, query.limit),
    });
  }

  /**
   * Get category rankings
   */
  async getCategoryRankings(
    request: FastifyRequest<{ Params: { category: string } }>,
    reply: FastifyReply
  ) {
    const { category } = request.params;

    const rankings = await neo4jService.getCategoryRankings(category);

    return reply.send({
      category,
      rankings,
      averageScore: rankings.reduce((sum, w) => sum + w.score, 0) / rankings.length,
    });
  }

  /**
   * Generate score card
   */
  async generateScoreCard(
    request: FastifyRequest<{ Params: { websiteId: string } }>,
    reply: FastifyReply
  ) {
    const { websiteId } = request.params;

    const score = await prisma.privacyScore.findFirst({
      where: { websiteId },
      orderBy: { calculatedAt: 'desc' },
      include: {
        website: true,
      },
    });

    if (!score) {
      return reply.code(404).send({ error: 'Score not found' });
    }

    const scoreCard = await scoreCardGenerator.generateScoreCard(
      score.website,
      {
        id: score.id,
        websiteId: score.websiteId,
        overallScore: score.overallScore,
        grade: score.grade as any,
        breakdown: {
          patternDetection: score.patternScore,
          dataCollection: score.dataScore,
          userRights: score.rightsScore,
          transparency: score.transparencyScore,
        },
        patternDetections: [],
        calculatedAt: score.calculatedAt,
        documentHashes: {},
        trending: score.trending as any,
      }
    );

    return reply.send(scoreCard);
  }

  /**
   * Get score card by shareable URL
   */
  async getScoreCard(
    request: FastifyRequest<{ Params: { shareableUrl: string } }>,
    reply: FastifyReply
  ) {
    const { shareableUrl } = request.params;

    const scoreCard = await scoreCardGenerator.getScoreCard(shareableUrl);

    if (!scoreCard) {
      return reply.code(404).send({ error: 'Score card not found or expired' });
    }

    return reply.send(scoreCard);
  }

  /**
   * Trigger manual scoring for a website
   */
  async triggerScoring(
    request: FastifyRequest<{ Params: { websiteId: string } }>,
    reply: FastifyReply
  ) {
    const { websiteId } = request.params;

    const website = await prisma.website.findUnique({
      where: { id: websiteId },
    });

    if (!website) {
      return reply.code(404).send({ error: 'Website not found' });
    }

    await jobScheduler.scheduleWebsite(websiteId);

    return reply.send({
      message: 'Scoring job scheduled',
      websiteId,
    });
  }

  /**
   * Get pattern statistics
   */
  async getPatternStats(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const stats = await neo4jService.getPatternStatistics();

    return reply.send({
      patterns: stats,
      totalPatterns: stats.length,
      mostCommon: stats[0],
      criticalPatterns: stats.filter(p => p.severity === 'critical'),
    });
  }

  /**
   * Get scoring history for a website
   */
  async getScoreHistory(
    request: FastifyRequest<{ Params: { websiteId: string } }>,
    reply: FastifyReply
  ) {
    const { websiteId } = request.params;

    const scores = await prisma.privacyScore.findMany({
      where: { websiteId },
      orderBy: { calculatedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        overallScore: true,
        grade: true,
        trending: true,
        calculatedAt: true,
      },
    });

    return reply.send({
      websiteId,
      history: scores,
      trend: this.calculateOverallTrend(scores),
    });
  }

  /**
   * Calculate overall trend from score history
   */
  private calculateOverallTrend(scores: any[]): string {
    if (scores.length < 2) return 'stable';

    const recent = scores.slice(0, 5);
    const older = scores.slice(5, 10);

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((sum, s) => sum + s.overallScore, 0) / recent.length;
    const olderAvg = older.reduce((sum, s) => sum + s.overallScore, 0) / older.length;

    const difference = recentAvg - olderAvg;

    if (difference > 3) return 'improving';
    if (difference < -3) return 'declining';
    return 'stable';
  }
}

export const scoresController = new ScoresController();