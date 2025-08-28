import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { NotificationRequest } from '@fineprintai/shared-types';

const logger = createServiceLogger('ab-test-service');
const prisma = new PrismaClient();

export interface ABTestConfig {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'running' | 'completed' | 'paused';
  testType: 'subject' | 'content' | 'timing' | 'channel';
  variants: ABTestVariant[];
  trafficSplit: Record<string, number>;
  userSegment?: any;
  startDate?: Date;
  endDate?: Date;
  primaryMetric: string;
  secondaryMetrics?: string[];
  winner?: string;
  confidence?: number;
  results?: any;
}

export interface ABTestVariant {
  id: string;
  name: string;
  weight: number;
  config: {
    subject?: string;
    content?: string;
    templateId?: string;
    timing?: {
      delay?: number;
      scheduleType?: 'immediate' | 'delayed' | 'optimal';
    };
    channels?: string[];
  };
}

export interface ABTestResult {
  variantId: string;
  metrics: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    converted: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    conversionRate: number;
  };
  statisticalSignificance?: number;
  confidenceInterval?: {
    lower: number;
    upper: number;
  };
}

class ABTestService {
  private initialized = false;

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Test database connection
      await prisma.$connect();

      // Start any running tests that were paused during restart
      await this.resumeRunningTests();

      this.initialized = true;
      logger.info('A/B test service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize A/B test service', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      await prisma.$disconnect();
      this.initialized = false;
      logger.info('A/B test service shut down successfully');
    } catch (error) {
      logger.error('Error during A/B test service shutdown', { error });
    }
  }

  // Create new A/B test
  public async createABTest(config: Omit<ABTestConfig, 'id'>): Promise<ABTestConfig> {
    try {
      // Validate test configuration
      this.validateTestConfig(config);

      const test = await prisma.abTestConfig.create({
        data: {
          id: uuidv4(),
          name: config.name,
          description: config.description,
          status: config.status || 'draft',
          testType: config.testType,
          variants: JSON.stringify(config.variants),
          trafficSplit: JSON.stringify(config.trafficSplit),
          userSegment: config.userSegment ? JSON.stringify(config.userSegment) : null,
          startDate: config.startDate,
          endDate: config.endDate,
          primaryMetric: config.primaryMetric,
          secondaryMetrics: config.secondaryMetrics ? JSON.stringify(config.secondaryMetrics) : null,
          winner: config.winner,
          confidence: config.confidence,
          results: config.results ? JSON.stringify(config.results) : null,
        },
      });

      logger.info('A/B test created', {
        testId: test.id,
        name: config.name,
        testType: config.testType,
        variants: config.variants.length,
      });

      return this.mapABTestConfig(test);
    } catch (error) {
      logger.error('Failed to create A/B test', { error, config });
      throw error;
    }
  }

  // Update A/B test
  public async updateABTest(testId: string, updates: Partial<ABTestConfig>): Promise<ABTestConfig> {
    try {
      const existing = await prisma.abTestConfig.findUnique({
        where: { id: testId },
      });

      if (!existing) {
        throw new Error(`A/B test ${testId} not found`);
      }

      // Prevent updates to running tests (except status changes)
      if (existing.status === 'running' && updates.status !== 'paused' && updates.status !== 'completed') {
        throw new Error('Cannot modify running A/B test configuration');
      }

      const updateData: any = { ...updates };
      if (updates.variants) updateData.variants = JSON.stringify(updates.variants);
      if (updates.trafficSplit) updateData.trafficSplit = JSON.stringify(updates.trafficSplit);
      if (updates.userSegment) updateData.userSegment = JSON.stringify(updates.userSegment);
      if (updates.secondaryMetrics) updateData.secondaryMetrics = JSON.stringify(updates.secondaryMetrics);
      if (updates.results) updateData.results = JSON.stringify(updates.results);

      const test = await prisma.abTestConfig.update({
        where: { id: testId },
        data: updateData,
      });

      logger.info('A/B test updated', {
        testId,
        updates: Object.keys(updates),
      });

      return this.mapABTestConfig(test);
    } catch (error) {
      logger.error('Failed to update A/B test', { error, testId, updates });
      throw error;
    }
  }

  // Start A/B test
  public async startABTest(testId: string): Promise<void> {
    try {
      const test = await this.getABTest(testId);
      if (!test) {
        throw new Error(`A/B test ${testId} not found`);
      }

      if (test.status !== 'draft') {
        throw new Error(`Cannot start A/B test in status: ${test.status}`);
      }

      await prisma.abTestConfig.update({
        where: { id: testId },
        data: {
          status: 'running',
          startDate: new Date(),
        },
      });

      logger.info('A/B test started', { testId, name: test.name });
    } catch (error) {
      logger.error('Failed to start A/B test', { error, testId });
      throw error;
    }
  }

  // Pause A/B test
  public async pauseABTest(testId: string): Promise<void> {
    try {
      await prisma.abTestConfig.update({
        where: { id: testId },
        data: {
          status: 'paused',
        },
      });

      logger.info('A/B test paused', { testId });
    } catch (error) {
      logger.error('Failed to pause A/B test', { error, testId });
      throw error;
    }
  }

  // Complete A/B test
  public async completeABTest(testId: string, winner?: string): Promise<void> {
    try {
      const results = await this.calculateTestResults(testId);
      
      const updateData: any = {
        status: 'completed',
        endDate: new Date(),
        results: JSON.stringify(results),
      };

      if (winner) {
        updateData.winner = winner;
      } else {
        // Auto-determine winner based on primary metric
        const bestVariant = this.determineBestVariant(results);
        if (bestVariant) {
          updateData.winner = bestVariant.variantId;
          updateData.confidence = bestVariant.confidence;
        }
      }

      await prisma.abTestConfig.update({
        where: { id: testId },
        data: updateData,
      });

      logger.info('A/B test completed', { testId, winner: updateData.winner });
    } catch (error) {
      logger.error('Failed to complete A/B test', { error, testId });
      throw error;
    }
  }

  // Get A/B test
  public async getABTest(testId: string): Promise<ABTestConfig | null> {
    try {
      const test = await prisma.abTestConfig.findUnique({
        where: { id: testId },
      });

      return test ? this.mapABTestConfig(test) : null;
    } catch (error) {
      logger.error('Failed to get A/B test', { error, testId });
      throw error;
    }
  }

  // List A/B tests
  public async listABTests(options: {
    status?: string;
    testType?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ tests: ABTestConfig[]; total: number }> {
    try {
      const {
        status,
        testType,
        limit = 50,
        offset = 0,
      } = options;

      const whereClause: any = {};
      if (status) whereClause.status = status;
      if (testType) whereClause.testType = testType;

      const [tests, total] = await Promise.all([
        prisma.abTestConfig.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.abTestConfig.count({ where: whereClause }),
      ]);

      return {
        tests: tests.map(t => this.mapABTestConfig(t)),
        total,
      };
    } catch (error) {
      logger.error('Failed to list A/B tests', { error, options });
      throw error;
    }
  }

  // Delete A/B test
  public async deleteABTest(testId: string): Promise<void> {
    try {
      const test = await this.getABTest(testId);
      if (!test) {
        throw new Error(`A/B test ${testId} not found`);
      }

      if (test.status === 'running') {
        throw new Error('Cannot delete running A/B test. Pause it first.');
      }

      await prisma.abTestConfig.delete({
        where: { id: testId },
      });

      logger.info('A/B test deleted', { testId, name: test.name });
    } catch (error) {
      logger.error('Failed to delete A/B test', { error, testId });
      throw error;
    }
  }

  // Process notification for A/B testing
  public async processNotificationForTest(
    request: NotificationRequest
  ): Promise<NotificationRequest & {
    abTestId?: string;
    abTestGroup?: string;
    templateId?: string;
  }> {
    try {
      // Find active A/B test for this notification type
      const activeTest = await this.findActiveTestForNotification(request);
      
      if (!activeTest) {
        return request; // No active test, return original request
      }

      // Check if user is eligible for this test
      if (!this.isUserEligibleForTest(request.userId, activeTest)) {
        return request;
      }

      // Assign user to a variant
      const variant = this.assignUserToVariant(request.userId, activeTest);
      if (!variant) {
        return request;
      }

      // Modify request based on variant configuration
      const modifiedRequest = this.applyVariantConfig(request, variant, activeTest);

      // Track test assignment
      await this.trackTestAssignment(request.userId, activeTest.id, variant.id);

      logger.debug('User assigned to A/B test variant', {
        userId: request.userId,
        testId: activeTest.id,
        variantId: variant.id,
        notificationType: request.type,
      });

      return {
        ...modifiedRequest,
        abTestId: activeTest.id,
        abTestGroup: variant.id,
      };
    } catch (error) {
      logger.error('Failed to process notification for A/B test', { error, request });
      return request; // Return original request on error
    }
  }

  // Get A/B test results
  public async getABTestResults(testId: string): Promise<{
    test: ABTestConfig;
    results: ABTestResult[];
    summary: {
      totalParticipants: number;
      testDuration: number;
      statisticalSignificance: number;
      recommendedWinner?: string;
    };
  }> {
    try {
      const test = await this.getABTest(testId);
      if (!test) {
        throw new Error(`A/B test ${testId} not found`);
      }

      const results = await this.calculateTestResults(testId);
      const summary = this.calculateTestSummary(test, results);

      return {
        test,
        results,
        summary,
      };
    } catch (error) {
      logger.error('Failed to get A/B test results', { error, testId });
      throw error;
    }
  }

  // Private helper methods
  private validateTestConfig(config: Omit<ABTestConfig, 'id'>): void {
    if (!config.name || config.name.trim().length === 0) {
      throw new Error('Test name is required');
    }

    if (!config.variants || config.variants.length < 2) {
      throw new Error('At least 2 variants are required');
    }

    // Validate traffic split adds up to 100%
    const totalWeight = Object.values(config.trafficSplit).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new Error('Traffic split must add up to 100%');
    }

    // Validate variant weights
    config.variants.forEach(variant => {
      if (variant.weight < 0 || variant.weight > 100) {
        throw new Error(`Variant ${variant.name} weight must be between 0 and 100`);
      }
    });

    // Validate test duration
    if (config.startDate && config.endDate && config.startDate >= config.endDate) {
      throw new Error('End date must be after start date');
    }
  }

  private mapABTestConfig(test: any): ABTestConfig {
    return {
      id: test.id,
      name: test.name,
      description: test.description,
      status: test.status,
      testType: test.testType,
      variants: JSON.parse(test.variants),
      trafficSplit: JSON.parse(test.trafficSplit),
      userSegment: test.userSegment ? JSON.parse(test.userSegment) : undefined,
      startDate: test.startDate,
      endDate: test.endDate,
      primaryMetric: test.primaryMetric,
      secondaryMetrics: test.secondaryMetrics ? JSON.parse(test.secondaryMetrics) : undefined,
      winner: test.winner,
      confidence: test.confidence,
      results: test.results ? JSON.parse(test.results) : undefined,
    };
  }

  private async findActiveTestForNotification(request: NotificationRequest): Promise<ABTestConfig | null> {
    try {
      // Find active tests that could apply to this notification
      const activeTests = await prisma.abTestConfig.findMany({
        where: {
          status: 'running',
          OR: [
            { startDate: { lte: new Date() } },
            { startDate: null },
          ],
          OR: [
            { endDate: { gte: new Date() } },
            { endDate: null },
          ],
        },
      });

      // For simplicity, return the first matching test
      // In a real implementation, you'd have more sophisticated matching logic
      return activeTests.length > 0 ? this.mapABTestConfig(activeTests[0]) : null;
    } catch (error) {
      logger.warn('Failed to find active test for notification', { error });
      return null;
    }
  }

  private isUserEligibleForTest(userId: string, test: ABTestConfig): boolean {
    // Check user segment criteria if specified
    if (test.userSegment) {
      // This would implement actual user segmentation logic
      // For now, we'll just check if the user ID hash falls within test criteria
      const userHash = this.hashUserId(userId);
      return userHash % 100 < 50; // Include 50% of users
    }

    return true; // All users eligible if no segment specified
  }

  private assignUserToVariant(userId: string, test: ABTestConfig): ABTestVariant | null {
    // Use consistent hashing to assign users to variants
    const userHash = this.hashUserId(userId);
    const randomValue = userHash % 100;

    let cumulativeWeight = 0;
    for (const [variantId, weight] of Object.entries(test.trafficSplit)) {
      cumulativeWeight += weight;
      if (randomValue < cumulativeWeight) {
        return test.variants.find(v => v.id === variantId) || null;
      }
    }

    // Fallback to first variant
    return test.variants[0] || null;
  }

  private applyVariantConfig(
    request: NotificationRequest,
    variant: ABTestVariant,
    test: ABTestConfig
  ): NotificationRequest {
    const modifiedRequest = { ...request };

    switch (test.testType) {
      case 'subject':
        if (variant.config.subject) {
          modifiedRequest.title = variant.config.subject;
        }
        break;

      case 'content':
        if (variant.config.content) {
          modifiedRequest.message = variant.config.content;
        }
        if (variant.config.templateId) {
          // This would be used by the notification service
          (modifiedRequest as any).templateId = variant.config.templateId;
        }
        break;

      case 'timing':
        if (variant.config.timing?.delay) {
          const scheduledAt = new Date();
          scheduledAt.setMinutes(scheduledAt.getMinutes() + variant.config.timing.delay);
          modifiedRequest.scheduledAt = scheduledAt;
        }
        break;

      case 'channel':
        if (variant.config.channels) {
          // Filter channels based on variant configuration
          modifiedRequest.channels = modifiedRequest.channels.filter(channel =>
            variant.config.channels!.includes(channel.type)
          );
        }
        break;
    }

    return modifiedRequest;
  }

  private async trackTestAssignment(userId: string, testId: string, variantId: string): Promise<void> {
    try {
      // In a real implementation, this would create a test assignment record
      // For now, we'll just log it
      logger.debug('A/B test assignment tracked', {
        userId,
        testId,
        variantId,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.warn('Failed to track test assignment', { error, userId, testId, variantId });
    }
  }

  private async calculateTestResults(testId: string): Promise<ABTestResult[]> {
    try {
      const test = await this.getABTest(testId);
      if (!test) {
        throw new Error(`A/B test ${testId} not found`);
      }

      const results: ABTestResult[] = [];

      for (const variant of test.variants) {
        // Get notification metrics for this variant
        // This would query actual delivery data
        const metrics = await this.getVariantMetrics(testId, variant.id);

        results.push({
          variantId: variant.id,
          metrics,
          statisticalSignificance: this.calculateStatisticalSignificance(metrics),
        });
      }

      return results;
    } catch (error) {
      logger.error('Failed to calculate test results', { error, testId });
      throw error;
    }
  }

  private async getVariantMetrics(testId: string, variantId: string): Promise<ABTestResult['metrics']> {
    // Mock implementation - in reality, this would query delivery data
    const baseMetrics = {
      sent: Math.floor(Math.random() * 1000) + 100,
      delivered: 0,
      opened: 0,
      clicked: 0,
      converted: 0,
      deliveryRate: 0,
      openRate: 0,
      clickRate: 0,
      conversionRate: 0,
    };

    baseMetrics.delivered = Math.floor(baseMetrics.sent * (0.85 + Math.random() * 0.1));
    baseMetrics.opened = Math.floor(baseMetrics.delivered * (0.15 + Math.random() * 0.15));
    baseMetrics.clicked = Math.floor(baseMetrics.opened * (0.05 + Math.random() * 0.1));
    baseMetrics.converted = Math.floor(baseMetrics.clicked * (0.1 + Math.random() * 0.2));

    baseMetrics.deliveryRate = (baseMetrics.delivered / baseMetrics.sent) * 100;
    baseMetrics.openRate = baseMetrics.delivered > 0 ? (baseMetrics.opened / baseMetrics.delivered) * 100 : 0;
    baseMetrics.clickRate = baseMetrics.opened > 0 ? (baseMetrics.clicked / baseMetrics.opened) * 100 : 0;
    baseMetrics.conversionRate = baseMetrics.clicked > 0 ? (baseMetrics.converted / baseMetrics.clicked) * 100 : 0;

    return baseMetrics;
  }

  private calculateStatisticalSignificance(metrics: ABTestResult['metrics']): number {
    // Simplified statistical significance calculation
    // In a real implementation, you'd use proper statistical tests
    const sampleSize = metrics.sent;
    const successRate = metrics.openRate / 100;
    
    // Mock calculation based on sample size and success rate
    if (sampleSize < 100) return 0;
    
    const zScore = Math.sqrt(sampleSize) * Math.abs(successRate - 0.2) / Math.sqrt(0.2 * 0.8);
    const significance = Math.min(99.9, Math.max(0, (1 - Math.exp(-zScore / 2)) * 100));
    
    return Math.round(significance * 10) / 10;
  }

  private determineBestVariant(results: ABTestResult[]): { variantId: string; confidence: number } | null {
    if (results.length < 2) return null;

    // Find variant with best primary metric performance
    const sortedResults = results.sort((a, b) => b.metrics.openRate - a.metrics.openRate);
    const best = sortedResults[0];
    const secondBest = sortedResults[1];

    // Calculate confidence in the winner
    const performanceDiff = best.metrics.openRate - secondBest.metrics.openRate;
    const avgSignificance = (best.statisticalSignificance! + secondBest.statisticalSignificance!) / 2;
    
    const confidence = Math.min(99.9, avgSignificance * (1 + performanceDiff / 100));

    return {
      variantId: best.variantId,
      confidence: Math.round(confidence * 10) / 10,
    };
  }

  private calculateTestSummary(test: ABTestConfig, results: ABTestResult[]): {
    totalParticipants: number;
    testDuration: number;
    statisticalSignificance: number;
    recommendedWinner?: string;
  } {
    const totalParticipants = results.reduce((sum, result) => sum + result.metrics.sent, 0);
    
    const testDuration = test.startDate && test.endDate
      ? Math.ceil((test.endDate.getTime() - test.startDate.getTime()) / (1000 * 60 * 60 * 24))
      : test.startDate
        ? Math.ceil((Date.now() - test.startDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

    const avgSignificance = results.reduce((sum, result) => 
      sum + (result.statisticalSignificance || 0), 0
    ) / results.length;

    const bestVariant = this.determineBestVariant(results);

    return {
      totalParticipants,
      testDuration,
      statisticalSignificance: Math.round(avgSignificance * 10) / 10,
      recommendedWinner: bestVariant?.variantId,
    };
  }

  private hashUserId(userId: string): number {
    // Simple hash function for consistent user assignment
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private async resumeRunningTests(): Promise<void> {
    try {
      const runningTests = await prisma.abTestConfig.findMany({
        where: { status: 'running' },
      });

      logger.info('Resumed running A/B tests', { count: runningTests.length });
    } catch (error) {
      logger.warn('Failed to resume running tests', { error });
    }
  }

  // Analytics methods
  public async getABTestAnalytics(): Promise<{
    totalTests: number;
    activeTests: number;
    completedTests: number;
    avgTestDuration: number;
    avgParticipants: number;
    topPerformingTests: Array<{
      id: string;
      name: string;
      winnerImprovement: number;
    }>;
  }> {
    try {
      const [totalTests, statusCounts, completedTests] = await Promise.all([
        prisma.abTestConfig.count(),
        prisma.abTestConfig.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        prisma.abTestConfig.findMany({
          where: { status: 'completed' },
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            results: true,
          },
        }),
      ]);

      const activeTests = statusCounts.find(s => s.status === 'running')?._count._all || 0;
      const completed = statusCounts.find(s => s.status === 'completed')?._count._all || 0;

      const avgTestDuration = completedTests
        .filter(t => t.startDate && t.endDate)
        .reduce((sum, test) => {
          const duration = (test.endDate!.getTime() - test.startDate!.getTime()) / (1000 * 60 * 60 * 24);
          return sum + duration;
        }, 0) / Math.max(1, completedTests.length);

      // Mock average participants calculation
      const avgParticipants = 500; // This would be calculated from actual data

      // Mock top performing tests
      const topPerformingTests = completedTests
        .filter(t => t.results)
        .map(test => ({
          id: test.id,
          name: test.name,
          winnerImprovement: Math.random() * 50 + 10, // Mock improvement percentage
        }))
        .sort((a, b) => b.winnerImprovement - a.winnerImprovement)
        .slice(0, 5);

      return {
        totalTests,
        activeTests,
        completedTests: completed,
        avgTestDuration: Math.round(avgTestDuration * 10) / 10,
        avgParticipants,
        topPerformingTests,
      };
    } catch (error) {
      logger.error('Failed to get A/B test analytics', { error });
      throw error;
    }
  }
}

export const abTestService = new ABTestService();