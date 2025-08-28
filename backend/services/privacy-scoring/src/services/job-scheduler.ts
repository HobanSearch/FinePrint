import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';
import { config } from '../config';
import { logger } from '../utils/logger';
import topWebsites from '../../config/top-websites.json';

const prisma = new PrismaClient();

export class JobScheduler {
  private scoringQueue: Queue;
  private weeklyTask?: cron.ScheduledTask;
  private dailyTask?: cron.ScheduledTask;

  constructor() {
    this.scoringQueue = new Queue('privacy-scoring', {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
      },
    });
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    // Initialize websites in database
    await this.initializeWebsites();

    // Schedule weekly full run
    this.weeklyTask = cron.schedule(config.schedule.weeklyRun, async () => {
      logger.info('Starting weekly privacy scoring run');
      await this.scheduleAllWebsites();
    });

    // Schedule daily change detection
    this.dailyTask = cron.schedule(config.schedule.dailyCheck, async () => {
      logger.info('Starting daily change detection');
      await this.checkForChanges();
    });

    logger.info('Job scheduler started');
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (this.weeklyTask) {
      this.weeklyTask.stop();
    }
    if (this.dailyTask) {
      this.dailyTask.stop();
    }
    await this.scoringQueue.close();
    logger.info('Job scheduler stopped');
  }

  /**
   * Initialize websites from configuration
   */
  private async initializeWebsites(): Promise<void> {
    for (const websiteConfig of topWebsites.websites) {
      await prisma.website.upsert({
        where: { domain: websiteConfig.domain },
        update: {
          name: websiteConfig.name,
          privacyPolicyUrl: websiteConfig.privacyPolicyUrl,
          termsOfServiceUrl: websiteConfig.termsOfServiceUrl,
          rank: websiteConfig.rank,
          category: websiteConfig.category,
        },
        create: {
          id: websiteConfig.id,
          name: websiteConfig.name,
          domain: websiteConfig.domain,
          privacyPolicyUrl: websiteConfig.privacyPolicyUrl,
          termsOfServiceUrl: websiteConfig.termsOfServiceUrl,
          rank: websiteConfig.rank,
          category: websiteConfig.category,
          enabled: true,
        },
      });
    }
    logger.info(`Initialized ${topWebsites.websites.length} websites`);
  }

  /**
   * Schedule all websites for scoring
   */
  async scheduleAllWebsites(): Promise<void> {
    const websites = await prisma.website.findMany({
      where: { enabled: true },
      orderBy: { rank: 'asc' },
    });

    const startTime = Date.now();
    const batchSize = config.scoring.batchSize;
    const batches = Math.ceil(websites.length / batchSize);

    for (let i = 0; i < batches; i++) {
      const batch = websites.slice(i * batchSize, (i + 1) * batchSize);
      
      // Schedule batch with staggered delays
      for (const website of batch) {
        const job = await prisma.scoringJob.create({
          data: {
            websiteId: website.id,
            status: 'pending',
            priority: website.rank,
          },
        });

        await this.scoringQueue.add(
          'score-website',
          {
            id: job.id,
            websiteId: website.id,
          },
          {
            priority: website.rank,
            delay: i * 10000, // 10 second delay between batches
          }
        );
      }

      logger.info(`Scheduled batch ${i + 1}/${batches} (${batch.length} websites)`);
    }

    const totalTime = Date.now() - startTime;
    logger.info(`Scheduled ${websites.length} websites in ${totalTime}ms`);
  }

  /**
   * Check for document changes
   */
  async checkForChanges(): Promise<void> {
    const websites = await prisma.website.findMany({
      where: {
        enabled: true,
        lastChecked: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Not checked in last 24 hours
        },
      },
      include: {
        scores: {
          orderBy: { calculatedAt: 'desc' },
          take: 1,
        },
      },
    });

    for (const website of websites) {
      if (website.scores.length === 0) {
        // No previous score, schedule full scoring
        await this.scheduleWebsite(website.id);
        continue;
      }

      // Quick check for document changes
      const hasChanges = await this.quickChangeCheck(website);
      if (hasChanges) {
        await this.scheduleWebsite(website.id);
        logger.info(`Document changes detected for ${website.name}`);
      }
    }
  }

  /**
   * Quick check for document changes
   */
  private async quickChangeCheck(website: any): Promise<boolean> {
    // This would use a lightweight HEAD request or ETag comparison
    // For now, returning false as placeholder
    return false;
  }

  /**
   * Schedule a single website for scoring
   */
  async scheduleWebsite(websiteId: string): Promise<void> {
    const job = await prisma.scoringJob.create({
      data: {
        websiteId,
        status: 'pending',
        priority: 0,
      },
    });

    await this.scoringQueue.add(
      'score-website',
      {
        id: job.id,
        websiteId,
      },
      {
        priority: 0,
      }
    );
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<any> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.scoringQueue.getWaitingCount(),
      this.scoringQueue.getActiveCount(),
      this.scoringQueue.getCompletedCount(),
      this.scoringQueue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    };
  }

  /**
   * Clear all jobs
   */
  async clearQueue(): Promise<void> {
    await this.scoringQueue.drain();
    await this.scoringQueue.clean(0, 1000, 'completed');
    await this.scoringQueue.clean(0, 1000, 'failed');
    logger.info('Queue cleared');
  }
}

export const jobScheduler = new JobScheduler();