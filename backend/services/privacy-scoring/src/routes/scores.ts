import { FastifyPluginAsync } from 'fastify';
import { WebsiteService } from '../services/website-service';
import { JobScheduler } from '../services/job-scheduler';
import { ScoringAlgorithm } from '../services/scoring-algorithm';
import { DocumentFetcher } from '../services/document-fetcher';
import { AnalysisService } from '../services/analysis-service';
import { ScoreCardGenerator } from '../services/score-card-generator';
import { Neo4jService } from '../services/neo4j-service';
import topWebsites from '../../config/top-websites.json';

interface AnalyzeAllBody {
  forceRefresh?: boolean;
  websites?: string[];
}

const scoresRoutes: FastifyPluginAsync = async (fastify) => {
  const websiteService = new WebsiteService(fastify.prisma);
  const jobScheduler = new JobScheduler(
    fastify.prisma,
    fastify.queue,
    new DocumentFetcher(fastify.redis, fastify.httpClient),
    new AnalysisService(fastify.httpClient),
    new ScoringAlgorithm(),
    websiteService
  );
  const scoreCardGenerator = new ScoreCardGenerator();
  const neo4jService = new Neo4jService();

  // Get all scores
  fastify.get('/scores', async (request, reply) => {
    const { 
      limit = 50, 
      offset = 0, 
      category,
      sortBy = 'score',
      order = 'asc' 
    } = request.query as any;

    const scores = await websiteService.getScores({
      limit: parseInt(limit),
      offset: parseInt(offset),
      category,
      sortBy,
      order
    });

    return scores;
  });

  // Get score for specific website
  fastify.get('/scores/:websiteId', async (request, reply) => {
    const { websiteId } = request.params as { websiteId: string };
    
    const score = await websiteService.getScore(websiteId);
    if (!score) {
      return reply.code(404).send({ error: 'Website not found' });
    }
    
    return score;
  });

  // Trigger analysis for all websites
  fastify.post('/scores/analyze-all', async (request, reply) => {
    const { forceRefresh = false, websites } = request.body as AnalyzeAllBody;
    
    // Get list of websites to analyze
    const websitesToAnalyze = websites || topWebsites.websites.map(w => w.id);
    
    // Queue analysis jobs for each website
    const jobs = [];
    for (const websiteId of websitesToAnalyze) {
      const website = topWebsites.websites.find(w => w.id === websiteId);
      if (!website) continue;
      
      const job = await jobScheduler.queueAnalysis(websiteId, forceRefresh);
      jobs.push({
        websiteId,
        jobId: job.id,
        status: 'queued'
      });
    }
    
    return {
      message: `Queued analysis for ${jobs.length} websites`,
      jobs,
      estimatedTime: `${jobs.length * 2} minutes`
    };
  });

  // Get analysis status
  fastify.get('/scores/status', async (request, reply) => {
    const allWebsites = topWebsites.websites;
    const scores = await websiteService.getScores({ limit: 50, offset: 0 });
    
    const analyzed = scores.websites.filter(w => w.score !== null);
    const pending = allWebsites.length - analyzed.length;
    
    // Get active jobs from queue
    const activeJobs = await fastify.queue.getActive();
    const waitingJobs = await fastify.queue.getWaiting();
    
    return {
      total: allWebsites.length,
      completed: analyzed.length,
      pending,
      activeJobs: activeJobs.length,
      queuedJobs: waitingJobs.length,
      websites: scores.websites.map(w => ({
        id: w.id,
        name: w.name,
        status: w.score !== null ? 'completed' : 'pending',
        score: w.score,
        grade: w.grade,
        lastAnalyzed: w.lastAnalyzed
      }))
    };
  });

  // Compare websites
  fastify.post('/scores/compare', async (request, reply) => {
    const { websiteIds } = request.body as { websiteIds: string[] };
    
    if (!websiteIds || websiteIds.length < 2) {
      return reply.code(400).send({ 
        error: 'Please provide at least 2 website IDs to compare' 
      });
    }
    
    const comparison = await websiteService.compareWebsites(websiteIds);
    return comparison;
  });

  // Get trending websites
  fastify.get('/scores/trending', async (request, reply) => {
    const { direction = 'all', days = 30 } = request.query as any;
    
    const trending = await neo4jService.getTrendingWebsites(
      direction,
      parseInt(days)
    );
    
    return trending;
  });

  // Get category rankings
  fastify.get('/scores/categories/:category', async (request, reply) => {
    const { category } = request.params as { category: string };
    
    const rankings = await neo4jService.getCategoryRankings(category);
    return rankings;
  });

  // Generate score card
  fastify.get('/scores/:websiteId/card', async (request, reply) => {
    const { websiteId } = request.params as { websiteId: string };
    
    const score = await websiteService.getScore(websiteId);
    if (!score) {
      return reply.code(404).send({ error: 'Website not found' });
    }
    
    const card = await scoreCardGenerator.generateCard({
      websiteId: score.id,
      websiteName: score.name,
      score: score.score!,
      grade: score.grade!,
      findings: score.findings || [],
      patterns: score.patterns || [],
      trend: score.scoreTrend || 'stable'
    });
    
    // Return as image
    reply.type('image/png').send(card.buffer);
  });

  // Export training data
  fastify.get('/scores/export/training-data', async (request, reply) => {
    const { format = 'jsonl' } = request.query as { format?: string };
    
    // Get all analyzed websites with their documents
    const scores = await websiteService.getScores({ limit: 50, offset: 0 });
    const trainingData = [];
    
    for (const website of scores.websites) {
      if (!website.score) continue;
      
      // Get the analysis details
      const details = await websiteService.getAnalysisDetails(website.id);
      if (!details) continue;
      
      // Format for training
      const trainingEntry = {
        id: website.id,
        category: website.category,
        document_type: 'privacy_policy',
        content: details.documentContent,
        analysis: {
          score: website.score,
          grade: website.grade,
          patterns: details.patterns,
          findings: details.findings,
          summary: details.summary
        },
        metadata: {
          domain: website.domain,
          analyzed_at: website.lastAnalyzed,
          model_used: 'phi-2'
        }
      };
      
      trainingData.push(trainingEntry);
    }
    
    if (format === 'jsonl') {
      const jsonl = trainingData.map(entry => JSON.stringify(entry)).join('\n');
      reply
        .header('Content-Disposition', 'attachment; filename="fineprintai-training-data.jsonl"')
        .type('application/x-ndjson')
        .send(jsonl);
    } else {
      reply
        .header('Content-Disposition', 'attachment; filename="fineprintai-training-data.json"')
        .type('application/json')
        .send(trainingData);
    }
  });

  // Manual trigger for specific website
  fastify.post('/scores/:websiteId/analyze', async (request, reply) => {
    const { websiteId } = request.params as { websiteId: string };
    const { forceRefresh = false } = request.body as { forceRefresh?: boolean };
    
    const website = topWebsites.websites.find(w => w.id === websiteId);
    if (!website) {
      return reply.code(404).send({ error: 'Website not found' });
    }
    
    const job = await jobScheduler.queueAnalysis(websiteId, forceRefresh);
    
    return {
      message: `Analysis queued for ${website.name}`,
      jobId: job.id,
      estimatedTime: '2-5 minutes'
    };
  });

  return fastify;
};

export default scoresRoutes;