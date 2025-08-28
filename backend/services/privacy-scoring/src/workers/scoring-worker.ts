import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { documentFetcher } from '../services/document-fetcher';
import { scoringAlgorithm } from '../services/scoring-algorithm';
import { documentAnalysisClient } from '../services/document-analysis-client';
import { neo4jService } from '../services/neo4j-service';
import { webhookService } from '../services/webhook-service';
import { ScoringJob, PrivacyScore, PatternDetection } from '../types';

const prisma = new PrismaClient();

export class ScoringWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      'privacy-scoring',
      this.processJob.bind(this),
      {
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
        },
        concurrency: config.workers.concurrency,
        maxStalledCount: 3,
      }
    );

    this.setupEventHandlers();
  }

  private async processJob(job: Job<ScoringJob>) {
    const { websiteId } = job.data;
    logger.info(`Processing scoring job for website: ${websiteId}`);

    try {
      // Update job status
      await prisma.scoringJob.update({
        where: { id: job.data.id },
        data: {
          status: 'processing',
          startedAt: new Date(),
        },
      });

      // Fetch website data
      const website = await prisma.website.findUnique({
        where: { id: websiteId },
        include: {
          scores: {
            orderBy: { calculatedAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!website) {
        throw new Error(`Website not found: ${websiteId}`);
      }

      // Fetch documents
      const documents = await documentFetcher.fetchDocuments({
        privacyPolicy: website.privacyPolicyUrl || undefined,
        termsOfService: website.termsOfServiceUrl || undefined,
      });

      // Check for document changes
      const previousScore = website.scores[0];
      const hasChanges = await this.checkForDocumentChanges(website, documents, previousScore);

      // Analyze documents using document analysis service
      const analysisResults = await documentAnalysisClient.analyzeDocuments({
        websiteId,
        privacyPolicy: documents.privacyPolicy?.content,
        termsOfService: documents.termsOfService?.content,
      });

      // Convert analysis results to pattern detections
      const patternDetections: PatternDetection[] = analysisResults.patterns.map(pattern => ({
        patternId: pattern.id,
        patternName: pattern.name,
        severity: pattern.severity,
        description: pattern.description,
        location: pattern.location,
        impact: pattern.impact,
      }));

      // Calculate privacy score
      const scoringResult = scoringAlgorithm.calculateScore(
        {
          patternDetections,
          documentContent: {
            privacyPolicy: documents.privacyPolicy?.content,
            termsOfService: documents.termsOfService?.content,
          },
        },
        previousScore?.overallScore
      );

      // Save score to database
      const newScore = await this.saveScore(website.id, scoringResult, documents, patternDetections);

      // Update Neo4j knowledge graph
      await neo4jService.updateWebsiteScore(website, newScore);

      // Send webhooks if score changed significantly
      if (previousScore && Math.abs(newScore.overallScore - previousScore.overallScore) > 5) {
        await webhookService.sendScoreChangeNotification(website, newScore, previousScore);
      }

      // Update website last checked
      await prisma.website.update({
        where: { id: websiteId },
        data: { lastChecked: new Date() },
      });

      // Update job status
      await prisma.scoringJob.update({
        where: { id: job.data.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          result: newScore as any,
        },
      });

      logger.info(`Scoring completed for ${website.name}: ${newScore.grade} (${newScore.overallScore})`);
      return newScore;

    } catch (error) {
      logger.error(`Error processing scoring job:`, error);
      
      await prisma.scoringJob.update({
        where: { id: job.data.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          attempts: job.attemptsMade,
        },
      });

      throw error;
    }
  }

  private async checkForDocumentChanges(
    website: any,
    documents: any,
    previousScore: any
  ): Promise<boolean> {
    let hasChanges = false;

    // Check privacy policy changes
    if (documents.privacyPolicy && previousScore?.privacyPolicyHash) {
      if (documents.privacyPolicy.hash !== previousScore.privacyPolicyHash) {
        hasChanges = true;
        await this.saveDocumentSnapshot(
          website.id,
          'privacy_policy',
          documents.privacyPolicy
        );
      }
    }

    // Check terms of service changes
    if (documents.termsOfService && previousScore?.termsOfServiceHash) {
      if (documents.termsOfService.hash !== previousScore.termsOfServiceHash) {
        hasChanges = true;
        await this.saveDocumentSnapshot(
          website.id,
          'terms_of_service',
          documents.termsOfService
        );
      }
    }

    return hasChanges;
  }

  private async saveDocumentSnapshot(
    websiteId: string,
    documentType: string,
    document: any
  ): Promise<void> {
    await prisma.documentSnapshot.create({
      data: {
        websiteId,
        documentType,
        content: document.content,
        hash: document.hash,
        fetchedAt: document.fetchedAt,
      },
    });
  }

  private async saveScore(
    websiteId: string,
    scoringResult: any,
    documents: any,
    patternDetections: PatternDetection[]
  ): Promise<PrivacyScore> {
    const score = await prisma.privacyScore.create({
      data: {
        websiteId,
        overallScore: scoringResult.overallScore,
        grade: scoringResult.grade,
        patternScore: scoringResult.breakdown.patternDetection,
        dataScore: scoringResult.breakdown.dataCollection,
        rightsScore: scoringResult.breakdown.userRights,
        transparencyScore: scoringResult.breakdown.transparency,
        privacyPolicyHash: documents.privacyPolicy?.hash,
        termsOfServiceHash: documents.termsOfService?.hash,
        trending: scoringResult.trending,
        previousScore: scoringResult.previousScore,
        scoreChange: scoringResult.overallScore - (scoringResult.previousScore || scoringResult.overallScore),
        patternDetections: {
          create: patternDetections.map(pattern => ({
            patternId: pattern.patternId,
            patternName: pattern.patternName,
            severity: pattern.severity,
            description: pattern.description,
            location: pattern.location,
            impact: pattern.impact,
          })),
        },
      },
      include: {
        patternDetections: true,
      },
    });

    return {
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
      patternDetections: score.patternDetections as any,
      calculatedAt: score.calculatedAt,
      documentHashes: {
        privacyPolicy: score.privacyPolicyHash || undefined,
        termsOfService: score.termsOfServiceHash || undefined,
      },
      trending: score.trending as any,
      previousScore: score.previousScore || undefined,
    };
  }

  private setupEventHandlers() {
    this.worker.on('completed', (job, result) => {
      logger.info(`Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (err) => {
      logger.error('Worker error:', err);
    });

    this.worker.on('stalled', (jobId) => {
      logger.warn(`Job ${jobId} stalled`);
    });
  }

  async start() {
    logger.info('Scoring worker started');
  }

  async stop() {
    await this.worker.close();
    await prisma.$disconnect();
    logger.info('Scoring worker stopped');
  }
}

export const scoringWorker = new ScoringWorker();