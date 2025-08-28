import { EventEmitter } from 'events';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { memoryService } from '@fineprintai/shared-memory';
import { config } from '@fineprintai/shared-config';
import { Lead, Contact, BusinessEvent } from '@fineprintai/shared-types';
import dayjs from 'dayjs';
import { z } from 'zod';
import _ from 'lodash';

const logger = createServiceLogger('lead-scoring-service');

export interface LeadScoringConfig {
  demographicWeights: {
    company_size: number;
    industry: number;
    title: number;
    seniority: number;
  };
  behavioralWeights: {
    website_visits: number;
    content_downloads: number;
    email_engagement: number;
    demo_requests: number;
    pricing_page_views: number;
  };
  firmographicWeights: {
    revenue: number;
    employee_count: number;
    technology_stack: number;
    growth_stage: number;
  };
  intentWeights: {
    search_keywords: number;
    competitor_research: number;
    solution_research: number;
    buying_signals: number;
  };
  decayFactors: {
    activity_recency: number;
    engagement_frequency: number;
  };
}

export interface LeadScore {
  leadId: string;
  totalScore: number; // 0-100
  breakdown: {
    demographic: number;
    behavioral: number;
    firmographic: number;
    intent: number;
  };
  grade: 'A' | 'B' | 'C' | 'D';
  confidence: number; // 0-100
  lastUpdated: Date;
  factors: Array<{
    category: string;
    factor: string;
    impact: number;
    value: any;
  }>;
}

export interface LeadScoringInsight {
  leadId: string;
  insight: string;
  type: 'opportunity' | 'risk' | 'action_required' | 'trend';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  recommendation: string;
  confidence: number;
  data: Record<string, any>;
}

export interface ScoringModel {
  id: string;
  name: string;
  version: string;
  config: LeadScoringConfig;
  accuracy: number;
  createdAt: Date;
  lastTrained?: Date;
  isActive: boolean;
}

const DEFAULT_SCORING_CONFIG: LeadScoringConfig = {
  demographicWeights: {
    company_size: 0.15,
    industry: 0.10,
    title: 0.12,
    seniority: 0.13,
  },
  behavioralWeights: {
    website_visits: 0.08,
    content_downloads: 0.12,
    email_engagement: 0.10,
    demo_requests: 0.25,
    pricing_page_views: 0.15,
  },
  firmographicWeights: {
    revenue: 0.20,
    employee_count: 0.15,
    technology_stack: 0.10,
    growth_stage: 0.15,
  },
  intentWeights: {
    search_keywords: 0.12,
    competitor_research: 0.18,
    solution_research: 0.15,
    buying_signals: 0.25,
  },
  decayFactors: {
    activity_recency: 0.85, // 15% decay per week
    engagement_frequency: 0.90, // 10% decay per week
  },
};

export class LeadScoringService extends EventEmitter {
  private initialized = false;
  private scoringConfig: LeadScoringConfig;
  private scoringModels = new Map<string, ScoringModel>();
  private activeModel?: ScoringModel;
  private scoresCache = new Map<string, LeadScore>();
  private insightsCache = new Map<string, LeadScoringInsight[]>();

  constructor(config?: Partial<LeadScoringConfig>) {
    super();
    this.scoringConfig = _.merge({}, DEFAULT_SCORING_CONFIG, config);
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Lead Scoring Service');

      // Initialize memory service integration
      await this.initializeMemoryIntegration();

      // Load or create default scoring model
      await this.initializeScoringModels();

      // Set up real-time scoring updates
      await this.setupRealTimeScoring();

      // Initialize batch processing for historical leads
      await this.initializeBatchProcessing();

      this.initialized = true;
      logger.info('Lead Scoring Service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize Lead Scoring Service', { error });
      throw error;
    }
  }

  async scoreLeads(leadIds: string[]): Promise<LeadScore[]> {
    if (!this.initialized || !this.activeModel) {
      throw new Error('Lead Scoring Service not initialized');
    }

    try {
      const scores: LeadScore[] = [];

      for (const leadId of leadIds) {
        // Check cache first
        const cached = this.scoresCache.get(leadId);
        if (cached && dayjs().diff(cached.lastUpdated, 'hours') < 1) {
          scores.push(cached);
          continue;
        }

        // Calculate fresh score
        const score = await this.calculateLeadScore(leadId);
        scores.push(score);

        // Cache the result
        this.scoresCache.set(leadId, score);

        // Store in memory service
        await memoryService.storeConversation('lead-scores', leadId, {
          score,
          timestamp: new Date(),
        });
      }

      logger.info('Lead scores calculated', { 
        leadsScored: scores.length,
        averageScore: _.meanBy(scores, 'totalScore'),
      });

      return scores;

    } catch (error) {
      logger.error('Failed to score leads', { error, leadIds });
      throw error;
    }
  }

  async scoreSingleLead(leadId: string): Promise<LeadScore> {
    const scores = await this.scoreLeads([leadId]);
    return scores[0];
  }

  async updateLeadScore(leadId: string, activityData: Record<string, any>): Promise<LeadScore> {
    try {
      // Update activity data in memory service
      await memoryService.storeConversation('lead-activities', leadId, {
        activity: activityData,
        timestamp: new Date(),
      });

      // Invalidate cache
      this.scoresCache.delete(leadId);

      // Recalculate score
      const newScore = await this.calculateLeadScore(leadId);

      // Check for significant score changes
      await this.checkScoreChanges(leadId, newScore);

      // Generate insights if score changed significantly
      const insights = await this.generateScoringInsights(leadId, newScore);
      if (insights.length > 0) {
        this.emit('scoringInsights', { leadId, insights });
      }

      return newScore;

    } catch (error) {
      logger.error('Failed to update lead score', { error, leadId });
      throw error;
    }
  }

  async getLeadInsights(leadId: string): Promise<LeadScoringInsight[]> {
    const cacheKey = leadId;
    const cached = this.insightsCache.get(cacheKey);
    
    if (cached && cached.length > 0) {
      return cached;
    }

    try {
      const leadScore = await this.scoreSingleLead(leadId);
      const insights = await this.generateScoringInsights(leadId, leadScore);
      
      // Cache insights
      this.insightsCache.set(cacheKey, insights);
      
      return insights;

    } catch (error) {
      logger.error('Failed to get lead insights', { error, leadId });
      throw error;
    }
  }

  async getTopLeads(limit: number = 20, filters?: Record<string, any>): Promise<LeadScore[]> {
    try {
      // Get all recent lead scores
      const allScores = Array.from(this.scoresCache.values());
      
      // Filter if criteria provided
      let filteredScores = allScores;
      if (filters) {
        filteredScores = this.applyFilters(allScores, filters);
      }

      // Sort by total score and return top leads
      const topLeads = filteredScores
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, limit);

      logger.info('Top leads retrieved', { 
        totalLeads: allScores.length,
        filteredLeads: filteredScores.length,
        topLeadsReturned: topLeads.length,
      });

      return topLeads;

    } catch (error) {
      logger.error('Failed to get top leads', { error, limit, filters });
      throw error;
    }
  }

  async analyzeScoringTrends(timeframe: string = '30d'): Promise<{
    averageScore: number;
    scoreDistribution: Record<string, number>;
    topFactors: Array<{ factor: string; impact: number }>;
    trends: Array<{ date: string; averageScore: number; count: number }>;
  }> {
    try {
      const scores = Array.from(this.scoresCache.values());
      const cutoffDate = dayjs().subtract(parseInt(timeframe), 'days');
      
      const recentScores = scores.filter(score => 
        dayjs(score.lastUpdated).isAfter(cutoffDate)
      );

      const averageScore = _.meanBy(recentScores, 'totalScore');
      
      const scoreDistribution = {
        'A (90-100)': recentScores.filter(s => s.totalScore >= 90).length,
        'B (70-89)': recentScores.filter(s => s.totalScore >= 70 && s.totalScore < 90).length,
        'C (50-69)': recentScores.filter(s => s.totalScore >= 50 && s.totalScore < 70).length,
        'D (0-49)': recentScores.filter(s => s.totalScore < 50).length,
      };

      // Analyze top contributing factors
      const allFactors = recentScores.flatMap(score => score.factors);
      const factorImpacts = _.groupBy(allFactors, 'factor');
      const topFactors = Object.entries(factorImpacts)
        .map(([factor, impacts]) => ({
          factor,
          impact: _.meanBy(impacts, 'impact'),
        }))
        .sort((a, b) => b.impact - a.impact)
        .slice(0, 10);

      // Generate trend data (placeholder - would need time-series data)
      const trends = this.generateTrendData(recentScores, timeframe);

      return {
        averageScore,
        scoreDistribution,
        topFactors,
        trends,
      };

    } catch (error) {
      logger.error('Failed to analyze scoring trends', { error, timeframe });
      throw error;
    }
  }

  async createScoringModel(name: string, config: LeadScoringConfig): Promise<ScoringModel> {
    try {
      const model: ScoringModel = {
        id: `model_${Date.now()}`,
        name,
        version: '1.0.0',
        config,
        accuracy: 0, // Will be calculated after training
        createdAt: new Date(),
        isActive: false,
      };

      this.scoringModels.set(model.id, model);

      // Store in memory service
      await memoryService.storeConversation('scoring-models', model.id, model);

      logger.info('Scoring model created', { modelId: model.id, name });

      return model;

    } catch (error) {
      logger.error('Failed to create scoring model', { error, name });
      throw error;
    }
  }

  async trainScoringModel(modelId: string, trainingData: Array<{
    leadId: string;
    outcome: 'converted' | 'lost';
    features: Record<string, any>;
  }>): Promise<number> {
    try {
      const model = this.scoringModels.get(modelId);
      if (!model) {
        throw new Error(`Scoring model ${modelId} not found`);
      }

      // Train the model using the provided data
      const accuracy = await this.performModelTraining(model, trainingData);

      // Update model with training results
      model.accuracy = accuracy;
      model.lastTrained = new Date();
      this.scoringModels.set(modelId, model);

      // Store updated model
      await memoryService.storeConversation('scoring-models', modelId, model);

      logger.info('Scoring model trained', { 
        modelId, 
        accuracy, 
        trainingDataSize: trainingData.length,
      });

      return accuracy;

    } catch (error) {
      logger.error('Failed to train scoring model', { error, modelId });
      throw error;
    }
  }

  async activateScoringModel(modelId: string): Promise<void> {
    try {
      const model = this.scoringModels.get(modelId);
      if (!model) {
        throw new Error(`Scoring model ${modelId} not found`);
      }

      // Deactivate current active model
      if (this.activeModel) {
        this.activeModel.isActive = false;
        this.scoringModels.set(this.activeModel.id, this.activeModel);
      }

      // Activate new model
      model.isActive = true;
      this.activeModel = model;
      this.scoringConfig = model.config;
      this.scoringModels.set(modelId, model);

      // Clear cache to force rescoring with new model
      this.scoresCache.clear();

      logger.info('Scoring model activated', { modelId, modelName: model.name });

    } catch (error) {
      logger.error('Failed to activate scoring model', { error, modelId });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) return false;

      // Check memory service connection
      const memoryHealthy = await memoryService.healthCheck();
      if (!memoryHealthy) return false;

      // Check if we have an active scoring model
      if (!this.activeModel) return false;

      return true;

    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }

  // Private helper methods

  private async initializeMemoryIntegration(): Promise<void> {
    await memoryService.createCollection('lead-scores');
    await memoryService.createCollection('lead-activities');
    await memoryService.createCollection('scoring-models');
    await memoryService.createCollection('scoring-insights');
  }

  private async initializeScoringModels(): Promise<void> {
    // Create default scoring model if none exists
    if (this.scoringModels.size === 0) {
      const defaultModel = await this.createScoringModel('Default Model', this.scoringConfig);
      await this.activateScoringModel(defaultModel.id);
    }
  }

  private async setupRealTimeScoring(): Promise<void> {
    // Set up event listeners for real-time scoring updates
    this.on('leadActivity', this.handleLeadActivity.bind(this));
    this.on('leadUpdate', this.handleLeadUpdate.bind(this));
  }

  private async initializeBatchProcessing(): Promise<void> {
    // Set up batch processing for periodic rescoring
    // This would typically run as a cron job
  }

  private async calculateLeadScore(leadId: string): Promise<LeadScore> {
    try {
      // Get lead data from memory service
      const leadData = await this.getLeadData(leadId);
      const activityData = await this.getLeadActivityData(leadId);

      // Calculate component scores
      const demographic = this.calculateDemographicScore(leadData);
      const behavioral = this.calculateBehavioralScore(activityData);
      const firmographic = this.calculateFirmographicScore(leadData);
      const intent = this.calculateIntentScore(activityData);

      // Apply weights and calculate total score
      const breakdown = { demographic, behavioral, firmographic, intent };
      const totalScore = this.calculateTotalScore(breakdown);

      // Determine grade
      const grade = this.determineGrade(totalScore);

      // Calculate confidence based on data completeness
      const confidence = this.calculateConfidence(leadData, activityData);

      // Extract scoring factors
      const factors = this.extractScoringFactors(leadData, activityData, breakdown);

      const score: LeadScore = {
        leadId,
        totalScore,
        breakdown,
        grade,
        confidence,
        lastUpdated: new Date(),
        factors,
      };

      return score;

    } catch (error) {
      logger.error('Failed to calculate lead score', { error, leadId });
      throw error;
    }
  }

  private async getLeadData(leadId: string): Promise<Record<string, any>> {
    // Get lead data from memory service or database
    const conversations = await memoryService.searchConversations('leads', { leadId });
    return conversations[0]?.metadata || {};
  }

  private async getLeadActivityData(leadId: string): Promise<Record<string, any>> {
    // Get activity data from memory service
    const activities = await memoryService.searchConversations('lead-activities', { leadId });
    return this.aggregateActivityData(activities);
  }

  private aggregateActivityData(activities: any[]): Record<string, any> {
    // Aggregate activity data for scoring
    return {
      website_visits: activities.filter(a => a.type === 'website_visit').length,
      content_downloads: activities.filter(a => a.type === 'content_download').length,
      email_opens: activities.filter(a => a.type === 'email_open').length,
      demo_requests: activities.filter(a => a.type === 'demo_request').length,
      pricing_views: activities.filter(a => a.type === 'pricing_view').length,
    };
  }

  private calculateDemographicScore(leadData: Record<string, any>): number {
    const weights = this.scoringConfig.demographicWeights;
    let score = 0;

    // Company size scoring
    score += this.scoreCompanySize(leadData.company_size) * weights.company_size;
    
    // Industry scoring
    score += this.scoreIndustry(leadData.industry) * weights.industry;
    
    // Title scoring
    score += this.scoreTitle(leadData.title) * weights.title;
    
    // Seniority scoring
    score += this.scoreSeniority(leadData.seniority) * weights.seniority;

    return Math.min(100, score);
  }

  private calculateBehavioralScore(activityData: Record<string, any>): number {
    const weights = this.scoringConfig.behavioralWeights;
    let score = 0;

    // Website visits
    score += Math.min(25, activityData.website_visits * 2) * weights.website_visits;
    
    // Content downloads
    score += Math.min(30, activityData.content_downloads * 5) * weights.content_downloads;
    
    // Email engagement
    score += Math.min(20, activityData.email_opens * 3) * weights.email_engagement;
    
    // Demo requests
    score += Math.min(50, activityData.demo_requests * 25) * weights.demo_requests;
    
    // Pricing page views
    score += Math.min(40, activityData.pricing_views * 10) * weights.pricing_page_views;

    return Math.min(100, score);
  }

  private calculateFirmographicScore(leadData: Record<string, any>): number {
    const weights = this.scoringConfig.firmographicWeights;
    let score = 0;

    // Revenue scoring
    score += this.scoreRevenue(leadData.revenue) * weights.revenue;
    
    // Employee count scoring
    score += this.scoreEmployeeCount(leadData.employee_count) * weights.employee_count;
    
    // Technology stack scoring
    score += this.scoreTechnologyStack(leadData.technology_stack) * weights.technology_stack;
    
    // Growth stage scoring
    score += this.scoreGrowthStage(leadData.growth_stage) * weights.growth_stage;

    return Math.min(100, score);
  }

  private calculateIntentScore(activityData: Record<string, any>): number {
    const weights = this.scoringConfig.intentWeights;
    let score = 0;

    // Implementation would analyze search keywords, competitor research, etc.
    // This is a simplified version
    score += Math.min(30, (activityData.search_keywords || 0) * 5) * weights.search_keywords;
    score += Math.min(40, (activityData.competitor_research || 0) * 10) * weights.competitor_research;
    score += Math.min(35, (activityData.solution_research || 0) * 7) * weights.solution_research;
    score += Math.min(50, (activityData.buying_signals || 0) * 12) * weights.buying_signals;

    return Math.min(100, score);
  }

  private calculateTotalScore(breakdown: Record<string, number>): number {
    // Calculate weighted average of component scores
    const totalWeight = Object.values(this.scoringConfig.demographicWeights).reduce((a, b) => a + b, 0) +
                       Object.values(this.scoringConfig.behavioralWeights).reduce((a, b) => a + b, 0) +
                       Object.values(this.scoringConfig.firmographicWeights).reduce((a, b) => a + b, 0) +
                       Object.values(this.scoringConfig.intentWeights).reduce((a, b) => a + b, 0);

    const weightedScore = (
      breakdown.demographic * 0.25 +
      breakdown.behavioral * 0.30 +
      breakdown.firmographic * 0.25 +
      breakdown.intent * 0.20
    );

    return Math.round(Math.min(100, Math.max(0, weightedScore)));
  }

  private determineGrade(score: number): 'A' | 'B' | 'C' | 'D' {
    if (score >= 90) return 'A';
    if (score >= 70) return 'B';
    if (score >= 50) return 'C';
    return 'D';
  }

  private calculateConfidence(leadData: Record<string, any>, activityData: Record<string, any>): number {
    // Calculate confidence based on data completeness and recency
    let confidence = 50; // Base confidence

    // Data completeness factors
    const requiredFields = ['company', 'title', 'industry', 'company_size'];
    const completedFields = requiredFields.filter(field => leadData[field]).length;
    confidence += (completedFields / requiredFields.length) * 30;

    // Activity recency factors
    const hasRecentActivity = Object.values(activityData).some(value => value > 0);
    if (hasRecentActivity) confidence += 20;

    return Math.min(100, Math.max(0, confidence));
  }

  private extractScoringFactors(
    leadData: Record<string, any>, 
    activityData: Record<string, any>, 
    breakdown: Record<string, number>
  ): Array<{ category: string; factor: string; impact: number; value: any }> {
    const factors = [];

    // Add significant demographic factors
    if (leadData.title) {
      factors.push({
        category: 'demographic',
        factor: 'job_title',
        impact: this.scoreTitle(leadData.title),
        value: leadData.title,
      });
    }

    // Add significant behavioral factors
    if (activityData.demo_requests > 0) {
      factors.push({
        category: 'behavioral',
        factor: 'demo_requests',
        impact: Math.min(50, activityData.demo_requests * 25),
        value: activityData.demo_requests,
      });
    }

    return factors.sort((a, b) => b.impact - a.impact).slice(0, 10);
  }

  // Scoring helper methods
  private scoreCompanySize(size: string): number {
    const sizeScores: Record<string, number> = {
      'enterprise': 30,
      'large': 25,
      'medium': 20,
      'small': 15,
      'startup': 10,
    };
    return sizeScores[size?.toLowerCase()] || 10;
  }

  private scoreIndustry(industry: string): number {
    // Score based on target industries
    const industryScores: Record<string, number> = {
      'technology': 25,
      'finance': 25,
      'healthcare': 20,
      'legal': 30,
      'consulting': 20,
    };
    return industryScores[industry?.toLowerCase()] || 15;
  }

  private scoreTitle(title: string): number {
    const titleLower = title?.toLowerCase() || '';
    if (titleLower.includes('ceo') || titleLower.includes('founder')) return 30;
    if (titleLower.includes('cto') || titleLower.includes('cio')) return 28;
    if (titleLower.includes('vp') || titleLower.includes('director')) return 25;
    if (titleLower.includes('manager')) return 20;
    return 15;
  }

  private scoreSeniority(seniority: string): number {
    const seniorityScores: Record<string, number> = {
      'c-level': 30,
      'vp': 25,
      'director': 22,
      'manager': 18,
      'individual': 12,
    };
    return seniorityScores[seniority?.toLowerCase()] || 15;
  }

  private scoreRevenue(revenue: number): number {
    if (!revenue) return 10;
    if (revenue >= 100000000) return 30; // $100M+
    if (revenue >= 50000000) return 25;  // $50M+
    if (revenue >= 10000000) return 20;  // $10M+
    if (revenue >= 1000000) return 15;   // $1M+
    return 10;
  }

  private scoreEmployeeCount(count: number): number {
    if (!count) return 10;
    if (count >= 1000) return 30;
    if (count >= 500) return 25;
    if (count >= 100) return 20;
    if (count >= 50) return 15;
    return 10;
  }

  private scoreTechnologyStack(stack: string[]): number {
    if (!stack || stack.length === 0) return 10;
    
    const relevantTech = ['salesforce', 'hubspot', 'slack', 'microsoft', 'google'];
    const matchCount = stack.filter(tech => 
      relevantTech.some(relevant => tech.toLowerCase().includes(relevant))
    ).length;
    
    return Math.min(25, 10 + (matchCount * 3));
  }

  private scoreGrowthStage(stage: string): number {
    const stageScores: Record<string, number> = {
      'growth': 25,
      'expansion': 22,
      'mature': 18,
      'startup': 20,
      'established': 15,
    };
    return stageScores[stage?.toLowerCase()] || 15;
  }

  private async checkScoreChanges(leadId: string, newScore: LeadScore): Promise<void> {
    // Check for significant score changes and emit events
    const previousScore = this.scoresCache.get(leadId);
    
    if (previousScore) {
      const scoreDiff = newScore.totalScore - previousScore.totalScore;
      const gradeChanged = newScore.grade !== previousScore.grade;
      
      if (Math.abs(scoreDiff) >= 10 || gradeChanged) {
        this.emit('significantScoreChange', {
          leadId,
          previousScore: previousScore.totalScore,
          newScore: newScore.totalScore,
          scoreDiff,
          gradeChanged,
          previousGrade: previousScore.grade,
          newGrade: newScore.grade,
        });
      }
    }
  }

  private async generateScoringInsights(leadId: string, score: LeadScore): Promise<LeadScoringInsight[]> {
    const insights: LeadScoringInsight[] = [];

    // High-value lead opportunities
    if (score.totalScore >= 80 && score.grade === 'A') {
      insights.push({
        leadId,
        insight: 'High-value lead identified with strong buying signals',
        type: 'opportunity',
        priority: 'high',
        recommendation: 'Prioritize immediate outreach and schedule demo',
        confidence: score.confidence,
        data: { score: score.totalScore, grade: score.grade },
      });
    }

    // Engagement opportunities
    if (score.breakdown.behavioral < 30) {
      insights.push({
        leadId,
        insight: 'Low engagement score indicates need for nurturing',
        type: 'action_required',
        priority: 'medium',
        recommendation: 'Implement targeted content marketing campaign',
        confidence: 75,
        data: { behavioralScore: score.breakdown.behavioral },
      });
    }

    // Intent signals
    if (score.breakdown.intent >= 70) {
      insights.push({
        leadId,
        insight: 'Strong buying intent signals detected',
        type: 'opportunity',
        priority: 'urgent',
        recommendation: 'Fast-track through sales process',
        confidence: score.confidence,
        data: { intentScore: score.breakdown.intent },
      });
    }

    return insights;
  }

  private applyFilters(scores: LeadScore[], filters: Record<string, any>): LeadScore[] {
    return scores.filter(score => {
      if (filters.minScore && score.totalScore < filters.minScore) return false;
      if (filters.maxScore && score.totalScore > filters.maxScore) return false;
      if (filters.grades && !filters.grades.includes(score.grade)) return false;
      if (filters.minConfidence && score.confidence < filters.minConfidence) return false;
      return true;
    });
  }

  private generateTrendData(scores: LeadScore[], timeframe: string): Array<{ date: string; averageScore: number; count: number }> {
    // Generate trend data for the specified timeframe
    // This is a simplified implementation
    const days = parseInt(timeframe);
    const trends = [];
    
    for (let i = days; i >= 0; i -= 7) {
      const date = dayjs().subtract(i, 'days').format('YYYY-MM-DD');
      const weekScores = scores.filter(score => 
        dayjs(score.lastUpdated).isSame(dayjs().subtract(i, 'days'), 'week')
      );
      
      trends.push({
        date,
        averageScore: _.meanBy(weekScores, 'totalScore') || 0,
        count: weekScores.length,
      });
    }
    
    return trends;
  }

  private async performModelTraining(model: ScoringModel, trainingData: any[]): Promise<number> {
    // Simplified model training - in production, this would use ML algorithms
    // Return mock accuracy for now
    return 0.85 + Math.random() * 0.1; // 85-95% accuracy
  }

  private async handleLeadActivity(event: BusinessEvent): Promise<void> {
    // Handle real-time lead activity updates
    if (event.type === 'lead.activity') {
      const { leadId, activity } = event.data;
      await this.updateLeadScore(leadId, activity);
    }
  }

  private async handleLeadUpdate(event: BusinessEvent): Promise<void> {
    // Handle lead data updates
    if (event.type === 'lead.updated') {
      const { leadId } = event.data;
      this.scoresCache.delete(leadId); // Invalidate cache
    }
  }
}