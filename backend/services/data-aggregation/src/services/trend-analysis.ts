/**
 * Fine Print AI - Trend Analysis Service
 * 
 * Analyzes trends in legal documents, risk scores, and compliance patterns
 * across industries and time periods
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { WebsiteTargets } from '../config/website-targets';

export interface TrendData {
  date: string;
  value: number;
  count: number;
  metadata?: Record<string, any>;
}

export interface IndustryTrend {
  category: string;
  currentAverage: number;
  previousAverage: number;
  change: number;
  changePercent: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  dataPoints: TrendData[];
  topWebsites: { name: string; score: number; change: number }[];
}

export interface PatternEvolution {
  patternType: string;
  frequency: TrendData[];
  severity: TrendData[];
  affectedWebsites: { name: string; frequency: number; lastSeen: Date }[];
  emergingPatterns: string[];
  decliningPatterns: string[];
}

export interface TrendReport {
  generatedAt: Date;
  period: { start: Date; end: Date; days: number };
  summary: {
    totalDocuments: number;
    averageRiskScore: number;
    riskScoreChange: number;
    mostActiveCategory: string;
    emergingRisks: string[];
  };
  categoryTrends: IndustryTrend[];
  patternEvolution: PatternEvolution[];
  recommendations: string[];
}

export class TrendAnalysisService {
  private prisma: PrismaClient;
  private isRunning: boolean = false;
  private analysisInterval: NodeJS.Timeout | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Start periodic trend analysis
   */
  async startPeriodicAnalysis(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Trend analysis is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting periodic trend analysis');

    // Initial analysis
    await this.runFullAnalysis();

    // Schedule periodic analysis (every 6 hours)
    this.analysisInterval = setInterval(async () => {
      try {
        await this.runFullAnalysis();
      } catch (error) {
        logger.error('Error in periodic trend analysis:', error);
      }
    }, 6 * 60 * 60 * 1000);
  }

  /**
   * Stop periodic analysis
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    logger.info('Trend analysis stopped');
  }

  /**
   * Run full trend analysis
   */
  private async runFullAnalysis(): Promise<void> {
    logger.info('Starting full trend analysis');

    try {
      // Calculate industry trends
      await this.calculateIndustryTrends();
      
      // Analyze pattern evolution
      await this.analyzePatternEvolution();
      
      // Generate alerts for significant changes
      await this.generateTrendAlerts();

      logger.info('Full trend analysis completed');
    } catch (error) {
      logger.error('Error in full trend analysis:', error);
    }
  }

  /**
   * Get industry trends for a specific category
   */
  async getIndustryTrends(category?: string, days: number = 30): Promise<IndustryTrend[]> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      const categories = category ? [category] : WebsiteTargets.getCategories();
      const trends: IndustryTrend[] = [];

      for (const cat of categories) {
        const websites = WebsiteTargets.getTargetsByCategory(cat);
        const websiteNames = websites.map(w => w.name);

        if (websiteNames.length === 0) continue;

        // Get current period data
        const currentData = await this.getRiskScoreData(websiteNames, startDate, endDate);
        
        // Get previous period data for comparison
        const previousStartDate = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);
        const previousData = await this.getRiskScoreData(websiteNames, previousStartDate, startDate);

        const currentAverage = this.calculateAverage(currentData.map(d => d.value));
        const previousAverage = this.calculateAverage(previousData.map(d => d.value));
        const change = currentAverage - previousAverage;
        const changePercent = previousAverage > 0 ? (change / previousAverage) * 100 : 0;

        // Determine trend direction
        let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
        if (Math.abs(changePercent) > 5) {
          trend = change > 0 ? 'increasing' : 'decreasing';
        }

        // Get top websites in category
        const topWebsites = await this.getTopWebsitesByRisk(websiteNames, 5);

        trends.push({
          category: cat,
          currentAverage,
          previousAverage,
          change,
          changePercent,
          trend,
          dataPoints: currentData,
          topWebsites,
        });
      }

      return trends;
    } catch (error) {
      logger.error('Error getting industry trends:', error);
      return [];
    }
  }

  /**
   * Get risk score trends for specific website or all websites
   */
  async getRiskScoreTrends(websiteName?: string, days: number = 30): Promise<TrendData[]> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      const whereClause: any = {
        completedAt: { gte: startDate, lte: endDate },
        status: 'completed',
        riskScore: { not: null },
      };

      if (websiteName) {
        whereClause.document = { websiteName };
      }

      // Group by day and calculate average risk scores
      const dailyData = await this.prisma.documentAnalysis.findMany({
        where: whereClause,
        select: {
          completedAt: true,
          riskScore: true,
          document: {
            select: { websiteName: true },
          },
        },
        orderBy: { completedAt: 'asc' },
      });

      // Group data by day
      const dailyGroups: Record<string, { scores: number[]; websites: Set<string> }> = {};
      
      dailyData.forEach(analysis => {
        const date = analysis.completedAt.toISOString().split('T')[0];
        if (!dailyGroups[date]) {
          dailyGroups[date] = { scores: [], websites: new Set() };
        }
        
        if (analysis.riskScore !== null) {
          dailyGroups[date].scores.push(analysis.riskScore);
          dailyGroups[date].websites.add(analysis.document.websiteName);
        }
      });

      // Convert to trend data
      return Object.entries(dailyGroups).map(([date, data]) => ({
        date,
        value: this.calculateAverage(data.scores),
        count: data.scores.length,
        metadata: {
          uniqueWebsites: data.websites.size,
          scores: data.scores,
        },
      }));
    } catch (error) {
      logger.error('Error getting risk score trends:', error);
      return [];
    }
  }

  /**
   * Get pattern evolution over time
   */
  async getPatternEvolution(patternType?: string, days: number = 90): Promise<PatternEvolution[]> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      // Get all analyses with patterns
      const analyses = await this.prisma.documentAnalysis.findMany({
        where: {
          completedAt: { gte: startDate, lte: endDate },
          status: 'completed',
          problematicClauses: { not: null },
        },
        select: {
          completedAt: true,
          problematicClauses: true,
          document: {
            select: { websiteName: true },
          },
        },
        orderBy: { completedAt: 'asc' },
      });

      // Extract pattern types
      const patternData: Record<string, {
        frequency: Record<string, number>;
        severity: Record<string, number[]>;
        websites: Record<string, { count: number; lastSeen: Date }>;
      }> = {};

      analyses.forEach(analysis => {
        const patterns = analysis.problematicClauses as any[] || [];
        const date = analysis.completedAt.toISOString().split('T')[0];

        patterns.forEach(pattern => {
          const type = pattern.type || 'unknown';
          
          if (patternType && type !== patternType) return;

          if (!patternData[type]) {
            patternData[type] = {
              frequency: {},
              severity: {},
              websites: {},
            };
          }

          // Track frequency
          patternData[type].frequency[date] = (patternData[type].frequency[date] || 0) + 1;

          // Track severity
          if (!patternData[type].severity[date]) {
            patternData[type].severity[date] = [];
          }
          patternData[type].severity[date].push(pattern.severity || 0.5);

          // Track affected websites
          const website = analysis.document.websiteName;
          if (!patternData[type].websites[website]) {
            patternData[type].websites[website] = { count: 0, lastSeen: analysis.completedAt };
          }
          patternData[type].websites[website].count++;
          patternData[type].websites[website].lastSeen = analysis.completedAt;
        });
      });

      // Convert to PatternEvolution format
      return Object.entries(patternData).map(([type, data]) => {
        // Frequency data
        const frequency: TrendData[] = Object.entries(data.frequency).map(([date, count]) => ({
          date,
          value: count,
          count,
        }));

        // Severity data
        const severity: TrendData[] = Object.entries(data.severity).map(([date, severities]) => ({
          date,
          value: this.calculateAverage(severities),
          count: severities.length,
        }));

        // Affected websites
        const affectedWebsites = Object.entries(data.websites).map(([name, info]) => ({
          name,
          frequency: info.count,
          lastSeen: info.lastSeen,
        }));

        return {
          patternType: type,
          frequency,
          severity,
          affectedWebsites: affectedWebsites.sort((a, b) => b.frequency - a.frequency),
          emergingPatterns: [], // Would be calculated based on recent increases
          decliningPatterns: [], // Would be calculated based on recent decreases
        };
      });
    } catch (error) {
      logger.error('Error getting pattern evolution:', error);
      return [];
    }
  }

  /**
   * Generate comprehensive trend report
   */
  async generateTrendReport(options: {
    category?: string;
    websites?: string[];
    days?: number;
  }): Promise<TrendReport> {
    const { category, websites, days = 30 } = options;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    try {
      // Get basic statistics
      const summary = await this.generateReportSummary(startDate, endDate, category, websites);

      // Get category trends
      const categoryTrends = await this.getIndustryTrends(category, days);

      // Get pattern evolution
      const patternEvolution = await this.getPatternEvolution(undefined, days);

      // Generate recommendations
      const recommendations = this.generateRecommendations(categoryTrends, patternEvolution);

      return {
        generatedAt: new Date(),
        period: { start: startDate, end: endDate, days },
        summary,
        categoryTrends,
        patternEvolution,
        recommendations,
      };
    } catch (error) {
      logger.error('Error generating trend report:', error);
      throw error;
    }
  }

  // Private helper methods

  private async calculateIndustryTrends(): Promise<void> {
    // Implementation for calculating and storing industry trends
    logger.info('Calculating industry trends...');
  }

  private async analyzePatternEvolution(): Promise<void> {
    // Implementation for analyzing pattern evolution
    logger.info('Analyzing pattern evolution...');
  }

  private async generateTrendAlerts(): Promise<void> {
    // Implementation for generating trend alerts
    logger.info('Generating trend alerts...');
  }

  private async getRiskScoreData(
    websiteNames: string[],
    startDate: Date,
    endDate: Date
  ): Promise<TrendData[]> {
    const analyses = await this.prisma.documentAnalysis.findMany({
      where: {
        completedAt: { gte: startDate, lte: endDate },
        status: 'completed',
        riskScore: { not: null },
        document: { websiteName: { in: websiteNames } },
      },
      select: {
        completedAt: true,
        riskScore: true,
      },
      orderBy: { completedAt: 'asc' },
    });

    // Group by day
    const dailyGroups: Record<string, number[]> = {};
    analyses.forEach(analysis => {
      const date = analysis.completedAt.toISOString().split('T')[0];
      if (!dailyGroups[date]) dailyGroups[date] = [];
      if (analysis.riskScore !== null) {
        dailyGroups[date].push(analysis.riskScore);
      }
    });

    return Object.entries(dailyGroups).map(([date, scores]) => ({
      date,
      value: this.calculateAverage(scores),
      count: scores.length,
    }));
  }

  private async getTopWebsitesByRisk(
    websiteNames: string[],
    limit: number
  ): Promise<{ name: string; score: number; change: number }[]> {
    // Get latest risk scores for each website
    const latestScores = await Promise.all(
      websiteNames.map(async (name) => {
        const latest = await this.prisma.aggregatedDocument.findFirst({
          where: { websiteName: name },
          orderBy: { lastAnalyzed: 'desc' },
          select: {
            websiteName: true,
            riskScore: true,
            lastAnalyzed: true,
          },
        });

        // Get previous score for comparison
        const previous = await this.prisma.documentAnalysis.findFirst({
          where: {
            document: { websiteName: name },
            completedAt: {
              lt: latest?.lastAnalyzed || new Date(),
            },
            status: 'completed',
          },
          orderBy: { completedAt: 'desc' },
          select: { riskScore: true },
        });

        const currentScore = latest?.riskScore || 0;
        const previousScore = previous?.riskScore || 0;
        const change = currentScore - previousScore;

        return {
          name,
          score: currentScore,
          change,
        };
      })
    );

    return latestScores
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async generateReportSummary(
    startDate: Date,
    endDate: Date,
    category?: string,
    websites?: string[]
  ): Promise<TrendReport['summary']> {
    const whereClause: any = {
      completedAt: { gte: startDate, lte: endDate },
      status: 'completed',
    };

    if (category) {
      const categoryWebsites = WebsiteTargets.getTargetsByCategory(category);
      whereClause.document = { websiteName: { in: categoryWebsites.map(w => w.name) } };
    } else if (websites) {
      whereClause.document = { websiteName: { in: websites } };
    }

    const [totalDocuments, riskScoreData, categoryData] = await Promise.all([
      this.prisma.documentAnalysis.count({ where: whereClause }),
      this.prisma.documentAnalysis.aggregate({
        where: whereClause,
        _avg: { riskScore: true },
      }),
      this.prisma.documentAnalysis.groupBy({
        by: ['documentId'],
        where: whereClause,
        _count: true,
      }),
    ]);

    // Calculate previous period average for comparison
    const previousStart = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
    const previousRiskData = await this.prisma.documentAnalysis.aggregate({
      where: {
        ...whereClause,
        completedAt: { gte: previousStart, lt: startDate },
      },
      _avg: { riskScore: true },
    });

    const averageRiskScore = riskScoreData._avg.riskScore || 0;
    const previousAverageRiskScore = previousRiskData._avg.riskScore || 0;
    const riskScoreChange = averageRiskScore - previousAverageRiskScore;

    return {
      totalDocuments,
      averageRiskScore,
      riskScoreChange,
      mostActiveCategory: 'technology', // Would calculate from data
      emergingRisks: [], // Would extract from pattern analysis
    };
  }

  private generateRecommendations(
    categoryTrends: IndustryTrend[],
    patternEvolution: PatternEvolution[]
  ): string[] {
    const recommendations: string[] = [];

    // Analyze category trends
    const increasingTrends = categoryTrends.filter(t => t.trend === 'increasing');
    const decreasingTrends = categoryTrends.filter(t => t.trend === 'decreasing');

    if (increasingTrends.length > 0) {
      recommendations.push(
        `Monitor ${increasingTrends.map(t => t.category).join(', ')} categories closely as risk scores are increasing`
      );
    }

    if (decreasingTrends.length > 0) {
      recommendations.push(
        `${decreasingTrends.map(t => t.category).join(', ')} categories show improving risk scores`
      );
    }

    // Analyze pattern evolution
    const frequentPatterns = patternEvolution
      .filter(p => p.frequency.reduce((sum, f) => sum + f.value, 0) > 10)
      .sort((a, b) => {
        const aTotal = a.frequency.reduce((sum, f) => sum + f.value, 0);
        const bTotal = b.frequency.reduce((sum, f) => sum + f.value, 0);
        return bTotal - aTotal;
      });

    if (frequentPatterns.length > 0) {
      recommendations.push(
        `Pay attention to these common patterns: ${frequentPatterns.slice(0, 3).map(p => p.patternType).join(', ')}`
      );
    }

    return recommendations;
  }

  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }
}