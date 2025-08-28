import { EventEmitter } from 'events';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { memoryService } from '@fineprintai/shared-memory';
import { config } from '@fineprintai/shared-config';
import { 
  Customer, 
  SupportTicket,
  UsageMetrics,
  BusinessEvent,
  CustomerHealthResponse 
} from '@fineprintai/shared-types';
import dayjs from 'dayjs';
import { z } from 'zod';
import _ from 'lodash';

const logger = createServiceLogger('customer-health-service');

export interface CustomerHealthScore {
  customerId: string;
  overallScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  trend: 'improving' | 'stable' | 'declining';
  lastUpdated: Date;
  components: {
    usage: {
      score: number;
      metrics: {
        loginFrequency: number;
        featureAdoption: number;
        apiUsage: number;
        timeSpentInApp: number;
      };
    };
    engagement: {
      score: number;
      metrics: {
        supportInteractions: number;
        feedbackProvided: number;
        communityParticipation: number;
        trainingCompletion: number;
      };
    };
    satisfaction: {
      score: number;
      metrics: {
        csat: number;
        nps: number;
        ticketSentiment: number;
        resolutionRating: number;
      };
    };
    business: {
      score: number;
      metrics: {
        contractValue: number;
        paymentHistory: number;
        expansionPotential: number;
        renewalProbability: number;
      };
    };
  };
  predictedChurnRisk: number; // 0-100
  recommendations: string[];
  nextReviewDate: Date;
}

export interface HealthAlert {
  customerId: string;
  alertType: 'churn_risk' | 'usage_decline' | 'satisfaction_drop' | 'payment_issue' | 'support_spike';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metrics: Record<string, any>;
  actionItems: string[];
  createdAt: Date;
  acknowledged: boolean;
  assignedTo?: string;
}

export interface HealthTrend {
  customerId: string;
  period: string;
  scores: Array<{
    date: string;
    overallScore: number;
    usage: number;
    engagement: number;
    satisfaction: number;
    business: number;
  }>;
  insights: string[];
}

export interface ChurnRiskFactors {
  usage_decline: number;
  support_volume_increase: number;
  payment_delays: number;
  feature_adoption_low: number;
  satisfaction_drop: number;
  contract_expiration_near: number;
  competitive_research: number;
  reduced_engagement: number;
}

const DEFAULT_HEALTH_WEIGHTS = {
  usage: 0.30,
  engagement: 0.25,
  satisfaction: 0.25,
  business: 0.20,
};

const CHURN_RISK_THRESHOLDS = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 90,
};

export class CustomerHealthService extends EventEmitter {
  private initialized = false;
  private healthScores = new Map<string, CustomerHealthScore>();
  private healthAlerts = new Map<string, HealthAlert[]>();
  private trendData = new Map<string, HealthTrend>();
  private churnModels = new Map<string, any>();

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Customer Health Service');

      // Initialize memory service integration
      await this.initializeMemoryIntegration();

      // Load existing health scores
      await this.loadHealthScores();

      // Initialize churn prediction models
      await this.initializeChurnModels();

      // Set up real-time health monitoring
      await this.setupRealTimeMonitoring();

      // Schedule periodic health assessments
      await this.scheduleHealthAssessments();

      this.initialized = true;
      logger.info('Customer Health Service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize Customer Health Service', { error });
      throw error;
    }
  }

  async calculateCustomerHealth(customerId: string): Promise<CustomerHealthScore> {
    if (!this.initialized) {
      throw new Error('Customer Health Service not initialized');
    }

    try {
      // Get customer data from various sources
      const [customer, tickets, usage, interactions] = await Promise.all([
        this.getCustomerData(customerId),
        this.getTicketData(customerId),
        this.getUsageData(customerId),
        this.getInteractionData(customerId),
      ]);

      // Calculate component scores
      const usageScore = this.calculateUsageScore(usage);
      const engagementScore = this.calculateEngagementScore(interactions);
      const satisfactionScore = this.calculateSatisfactionScore(tickets);
      const businessScore = this.calculateBusinessScore(customer);

      // Calculate overall health score
      const overallScore = this.calculateOverallScore({
        usage: usageScore.score,
        engagement: engagementScore.score,
        satisfaction: satisfactionScore.score,
        business: businessScore.score,
      });

      // Determine risk level and trend
      const riskLevel = this.determineRiskLevel(overallScore);
      const trend = await this.calculateTrend(customerId, overallScore);
      
      // Predict churn risk
      const predictedChurnRisk = await this.predictChurnRisk(customerId, {
        usage: usageScore.score,
        engagement: engagementScore.score,
        satisfaction: satisfactionScore.score,
        business: businessScore.score,
      });

      // Generate recommendations
      const recommendations = this.generateRecommendations({
        usage: usageScore,
        engagement: engagementScore,
        satisfaction: satisfactionScore,
        business: businessScore,
      });

      const healthScore: CustomerHealthScore = {
        customerId,
        overallScore,
        riskLevel,
        trend,
        lastUpdated: new Date(),
        components: {
          usage: usageScore,
          engagement: engagementScore,
          satisfaction: satisfactionScore,
          business: businessScore,
        },
        predictedChurnRisk,
        recommendations,
        nextReviewDate: this.calculateNextReviewDate(riskLevel),
      };

      // Cache the health score
      this.healthScores.set(customerId, healthScore);

      // Store in memory service
      await memoryService.storeConversation('customer-health', customerId, {
        healthScore,
        timestamp: new Date(),
      });

      // Check for alerts
      await this.checkForHealthAlerts(customerId, healthScore);

      logger.info('Customer health calculated', { 
        customerId, 
        overallScore, 
        riskLevel, 
        churnRisk: predictedChurnRisk,
      });

      return healthScore;

    } catch (error) {
      logger.error('Failed to calculate customer health', { error, customerId });
      throw error;
    }
  }

  async getHealthScore(customerId: string): Promise<CustomerHealthScore | null> {
    // Check cache first
    const cached = this.healthScores.get(customerId);
    if (cached && dayjs().diff(cached.lastUpdated, 'hours') < 24) {
      return cached;
    }

    // Calculate fresh health score
    return await this.calculateCustomerHealth(customerId);
  }

  async getHealthAlerts(filters?: {
    severity?: string[];
    alertType?: string[];
    acknowledged?: boolean;
    limit?: number;
  }): Promise<HealthAlert[]> {
    try {
      let alerts: HealthAlert[] = [];
      
      // Collect all alerts
      for (const customerAlerts of this.healthAlerts.values()) {
        alerts.push(...customerAlerts);
      }

      // Apply filters
      if (filters) {
        if (filters.severity) {
          alerts = alerts.filter(alert => filters.severity!.includes(alert.severity));
        }
        if (filters.alertType) {
          alerts = alerts.filter(alert => filters.alertType!.includes(alert.alertType));
        }
        if (filters.acknowledged !== undefined) {
          alerts = alerts.filter(alert => alert.acknowledged === filters.acknowledged);
        }
      }

      // Sort by severity and creation date
      alerts.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return dayjs(b.createdAt).diff(dayjs(a.createdAt));
      });

      // Apply limit
      if (filters?.limit) {
        alerts = alerts.slice(0, filters.limit);
      }

      return alerts;

    } catch (error) {
      logger.error('Failed to get health alerts', { error, filters });
      throw error;
    }
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    try {
      // Find and update the alert
      for (const [customerId, customerAlerts] of this.healthAlerts.entries()) {
        const alertIndex = customerAlerts.findIndex(alert => 
          `${alert.customerId}_${alert.createdAt.getTime()}` === alertId
        );
        
        if (alertIndex !== -1) {
          customerAlerts[alertIndex].acknowledged = true;
          customerAlerts[alertIndex].assignedTo = userId;
          
          // Update in memory service
          await memoryService.storeConversation('health-alerts', alertId, {
            alert: customerAlerts[alertIndex],
            acknowledgedBy: userId,
            acknowledgedAt: new Date(),
          });

          logger.info('Health alert acknowledged', { alertId, userId });
          return;
        }
      }

      throw new Error(`Alert ${alertId} not found`);

    } catch (error) {
      logger.error('Failed to acknowledge alert', { error, alertId, userId });
      throw error;
    }
  }

  async getHealthTrends(customerId: string, period: string = '90d'): Promise<HealthTrend> {
    const cacheKey = `${customerId}_${period}`;
    const cached = this.trendData.get(cacheKey);
    
    if (cached && dayjs().diff(dayjs(cached.period), 'hours') < 12) {
      return cached;
    }

    try {
      // Get historical health data
      const historicalData = await this.getHistoricalHealthData(customerId, period);
      
      // Generate trend insights
      const insights = this.analyzeTrends(historicalData);

      const trend: HealthTrend = {
        customerId,
        period,
        scores: historicalData,
        insights,
      };

      // Cache the trend data
      this.trendData.set(cacheKey, trend);

      return trend;

    } catch (error) {
      logger.error('Failed to get health trends', { error, customerId, period });
      throw error;
    }
  }

  async identifyAtRiskCustomers(threshold: number = 50): Promise<Array<{
    customerId: string;
    healthScore: number;
    churnRisk: number;
    riskFactors: string[];
    recommendations: string[];
  }>> {
    try {
      const atRiskCustomers = [];

      for (const [customerId, healthScore] of this.healthScores.entries()) {
        if (healthScore.overallScore <= threshold || healthScore.predictedChurnRisk >= 70) {
          const riskFactors = await this.identifyRiskFactors(customerId, healthScore);
          
          atRiskCustomers.push({
            customerId,
            healthScore: healthScore.overallScore,
            churnRisk: healthScore.predictedChurnRisk,
            riskFactors,
            recommendations: healthScore.recommendations,
          });
        }
      }

      // Sort by churn risk (highest first)
      atRiskCustomers.sort((a, b) => b.churnRisk - a.churnRisk);

      logger.info('At-risk customers identified', { count: atRiskCustomers.length });

      return atRiskCustomers;

    } catch (error) {
      logger.error('Failed to identify at-risk customers', { error, threshold });
      throw error;
    }
  }

  async updateHealthScore(customerId: string, metrics: Partial<UsageMetrics>): Promise<CustomerHealthScore> {
    try {
      // Store the updated metrics
      await memoryService.storeConversation('customer-metrics', customerId, {
        metrics,
        timestamp: new Date(),
      });

      // Invalidate cache and recalculate
      this.healthScores.delete(customerId);
      
      const updatedScore = await this.calculateCustomerHealth(customerId);

      // Emit health update event
      this.emit('healthScoreUpdated', {
        customerId,
        newScore: updatedScore.overallScore,
        riskLevel: updatedScore.riskLevel,
        trend: updatedScore.trend,
      });

      return updatedScore;

    } catch (error) {
      logger.error('Failed to update health score', { error, customerId });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) return false;

      // Check memory service connection
      const memoryHealthy = await memoryService.healthCheck();
      if (!memoryHealthy) return false;

      // Check cache availability
      const testKey = 'health-check';
      this.healthScores.set(testKey, {} as CustomerHealthScore);
      const hasCache = this.healthScores.has(testKey);
      this.healthScores.delete(testKey);

      return hasCache;

    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }

  // Private helper methods

  private async initializeMemoryIntegration(): Promise<void> {
    await memoryService.createCollection('customer-health');
    await memoryService.createCollection('customer-metrics');
    await memoryService.createCollection('health-alerts');
    await memoryService.createCollection('health-trends');
    await memoryService.createCollection('churn-predictions');
  }

  private async loadHealthScores(): Promise<void> {
    // Load existing health scores from memory service
    const healthData = await memoryService.searchConversations('customer-health', {});
    
    for (const data of healthData) {
      if (data.metadata.healthScore) {
        this.healthScores.set(data.metadata.healthScore.customerId, data.metadata.healthScore);
      }
    }

    logger.info('Health scores loaded', { count: this.healthScores.size });
  }

  private async initializeChurnModels(): Promise<void> {
    // Initialize ML models for churn prediction
    // This would typically load pre-trained models
    logger.info('Churn prediction models initialized');
  }

  private async setupRealTimeMonitoring(): Promise<void> {
    // Set up real-time event listeners
    this.on('ticketCreated', this.handleTicketCreated.bind(this));
    this.on('usageUpdate', this.handleUsageUpdate.bind(this));
    this.on('paymentEvent', this.handlePaymentEvent.bind(this));
  }

  private async scheduleHealthAssessments(): Promise<void> {
    // Schedule periodic health assessments
    // This would typically use a cron job or scheduler
    logger.info('Health assessment scheduling initialized');
  }

  private async getCustomerData(customerId: string): Promise<any> {
    const conversations = await memoryService.searchConversations('customers', { customerId });
    return conversations[0]?.metadata || {};
  }

  private async getTicketData(customerId: string): Promise<SupportTicket[]> {
    const conversations = await memoryService.searchConversations('support-tickets', { customerId });
    return conversations.map(c => c.metadata).filter(Boolean);
  }

  private async getUsageData(customerId: string): Promise<UsageMetrics> {
    const conversations = await memoryService.searchConversations('customer-metrics', { customerId });
    const latestMetrics = conversations[0]?.metadata?.metrics;
    
    return latestMetrics || {
      documentsAnalyzed: 0,
      apiCalls: 0,
      activeUsers: 0,
      featureAdoption: {},
      timeSpentInApp: 0,
      weeklyActiveUsers: 0,
      monthlyActiveUsers: 0,
    };
  }

  private async getInteractionData(customerId: string): Promise<any[]> {
    const conversations = await memoryService.searchConversations('customer-interactions', { customerId });
    return conversations.map(c => c.metadata).filter(Boolean);
  }

  private calculateUsageScore(usage: UsageMetrics): {
    score: number;
    metrics: {
      loginFrequency: number;
      featureAdoption: number;
      apiUsage: number;
      timeSpentInApp: number;
    };
  } {
    const metrics = {
      loginFrequency: Math.min(100, (usage.weeklyActiveUsers / 7) * 25), // Daily login score
      featureAdoption: Object.keys(usage.featureAdoption).length * 10, // Feature adoption score
      apiUsage: Math.min(100, usage.apiCalls / 100), // API usage score
      timeSpentInApp: Math.min(100, usage.timeSpentInApp / 60), // Time spent score
    };

    const score = (metrics.loginFrequency + metrics.featureAdoption + metrics.apiUsage + metrics.timeSpentInApp) / 4;

    return { score: Math.round(score), metrics };
  }

  private calculateEngagementScore(interactions: any[]): {
    score: number;
    metrics: {
      supportInteractions: number;
      feedbackProvided: number;
      communityParticipation: number;
      trainingCompletion: number;
    };
  } {
    const supportInteractions = interactions.filter(i => i.type === 'support').length;
    const feedbackProvided = interactions.filter(i => i.type === 'feedback').length;
    const communityParticipation = interactions.filter(i => i.type === 'community').length;
    const trainingCompletion = interactions.filter(i => i.type === 'training' && i.completed).length;

    const metrics = {
      supportInteractions: Math.min(100, supportInteractions * 10),
      feedbackProvided: Math.min(100, feedbackProvided * 20),
      communityParticipation: Math.min(100, communityParticipation * 15),
      trainingCompletion: Math.min(100, trainingCompletion * 25),
    };

    const score = (metrics.supportInteractions + metrics.feedbackProvided + 
                  metrics.communityParticipation + metrics.trainingCompletion) / 4;

    return { score: Math.round(score), metrics };
  }

  private calculateSatisfactionScore(tickets: SupportTicket[]): {
    score: number;
    metrics: {
      csat: number;
      nps: number;
      ticketSentiment: number;
      resolutionRating: number;
    };
  } {
    const recentTickets = tickets.filter(t => 
      dayjs().diff(dayjs(t.createdAt), 'days') <= 90
    );

    const avgSatisfaction = _.meanBy(recentTickets.filter(t => t.satisfaction), 'satisfaction') || 3;
    const resolvedTickets = recentTickets.filter(t => t.status === 'resolved');
    const avgResolutionTime = _.meanBy(resolvedTickets, 'timeToResolution') || 24;

    const metrics = {
      csat: (avgSatisfaction / 5) * 100,
      nps: 70, // Would come from NPS surveys
      ticketSentiment: 75, // Would come from sentiment analysis
      resolutionRating: Math.max(0, 100 - (avgResolutionTime / 24) * 10), // Penalty for slow resolution
    };

    const score = (metrics.csat + metrics.nps + metrics.ticketSentiment + metrics.resolutionRating) / 4;

    return { score: Math.round(score), metrics };
  }

  private calculateBusinessScore(customer: any): {
    score: number;
    metrics: {
      contractValue: number;
      paymentHistory: number;
      expansionPotential: number;
      renewalProbability: number;
    };
  } {
    const metrics = {
      contractValue: Math.min(100, (customer.arr || 0) / 10000), // Scale contract value
      paymentHistory: customer.paymentHistory >= 0 ? 100 : 50, // Payment history score
      expansionPotential: (customer.expansionOpportunities?.length || 0) * 20,
      renewalProbability: customer.renewalProbability || 70,
    };

    const score = (metrics.contractValue + metrics.paymentHistory + 
                  metrics.expansionPotential + metrics.renewalProbability) / 4;

    return { score: Math.round(score), metrics };
  }

  private calculateOverallScore(components: {
    usage: number;
    engagement: number;
    satisfaction: number;
    business: number;
  }): number {
    const weights = DEFAULT_HEALTH_WEIGHTS;
    
    const weightedScore = 
      components.usage * weights.usage +
      components.engagement * weights.engagement +
      components.satisfaction * weights.satisfaction +
      components.business * weights.business;

    return Math.round(weightedScore);
  }

  private determineRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 80) return 'low';
    if (score >= 60) return 'medium';
    if (score >= 40) return 'high';
    return 'critical';
  }

  private async calculateTrend(customerId: string, currentScore: number): Promise<'improving' | 'stable' | 'declining'> {
    // Get historical scores to determine trend
    const historicalData = await this.getHistoricalHealthData(customerId, '30d');
    
    if (historicalData.length < 2) return 'stable';

    const previousScore = historicalData[historicalData.length - 2]?.overallScore || currentScore;
    const scoreDiff = currentScore - previousScore;

    if (scoreDiff > 5) return 'improving';
    if (scoreDiff < -5) return 'declining';
    return 'stable';
  }

  private async predictChurnRisk(customerId: string, components: any): Promise<number> {
    // Use machine learning model to predict churn risk
    // This is a simplified version
    let riskScore = 0;

    // Usage-based risk factors
    if (components.usage < 30) riskScore += 25;
    if (components.engagement < 40) riskScore += 20;
    if (components.satisfaction < 50) riskScore += 30;
    if (components.business < 60) riskScore += 25;

    return Math.min(100, riskScore);
  }

  private generateRecommendations(components: any): string[] {
    const recommendations = [];

    if (components.usage.score < 50) {
      recommendations.push('Increase product usage through targeted onboarding');
      recommendations.push('Schedule training session on key features');
    }

    if (components.engagement.score < 50) {
      recommendations.push('Engage customer through personalized outreach');
      recommendations.push('Invite to user community and events');
    }

    if (components.satisfaction.score < 50) {
      recommendations.push('Address satisfaction concerns through direct feedback');
      recommendations.push('Prioritize resolution of open support tickets');
    }

    if (components.business.score < 50) {
      recommendations.push('Review contract terms and pricing');
      recommendations.push('Explore expansion opportunities');
    }

    return recommendations;
  }

  private calculateNextReviewDate(riskLevel: string): Date {
    const days = {
      critical: 7,
      high: 14,
      medium: 30,
      low: 90,
    };

    return dayjs().add(days[riskLevel as keyof typeof days] || 30, 'days').toDate();
  }

  private async checkForHealthAlerts(customerId: string, healthScore: CustomerHealthScore): Promise<void> {
    const alerts: HealthAlert[] = [];

    // Churn risk alert
    if (healthScore.predictedChurnRisk >= 70) {
      alerts.push({
        customerId,
        alertType: 'churn_risk',
        severity: healthScore.predictedChurnRisk >= 90 ? 'critical' : 'high',
        message: `Customer has ${healthScore.predictedChurnRisk}% churn risk`,
        metrics: { churnRisk: healthScore.predictedChurnRisk },
        actionItems: healthScore.recommendations,
        createdAt: new Date(),
        acknowledged: false,
      });
    }

    // Usage decline alert
    if (healthScore.components.usage.score < 30) {
      alerts.push({
        customerId,
        alertType: 'usage_decline',
        severity: 'medium',
        message: 'Significant decline in product usage detected',
        metrics: healthScore.components.usage.metrics,
        actionItems: ['Schedule usage review call', 'Provide additional training'],
        createdAt: new Date(),
        acknowledged: false,
      });
    }

    // Satisfaction drop alert
    if (healthScore.components.satisfaction.score < 40) {
      alerts.push({
        customerId,
        alertType: 'satisfaction_drop',
        severity: 'high',
        message: 'Customer satisfaction scores have dropped significantly',
        metrics: healthScore.components.satisfaction.metrics,
        actionItems: ['Immediate customer outreach', 'Escalate to customer success manager'],
        createdAt: new Date(),
        acknowledged: false,
      });
    }

    if (alerts.length > 0) {
      this.healthAlerts.set(customerId, alerts);
      
      // Store alerts in memory service
      for (const alert of alerts) {
        await memoryService.storeConversation('health-alerts', 
          `${customerId}_${alert.createdAt.getTime()}`, alert);
      }

      // Emit alert events
      this.emit('healthAlertsGenerated', { customerId, alerts });
    }
  }

  private async getHistoricalHealthData(customerId: string, period: string): Promise<any[]> {
    // Get historical health data from memory service
    // This would typically query time-series data
    return [];
  }

  private analyzeTrends(historicalData: any[]): string[] {
    const insights = [];

    if (historicalData.length < 2) {
      return ['Insufficient data for trend analysis'];
    }

    // Analyze trends in the data
    const latest = historicalData[historicalData.length - 1];
    const previous = historicalData[historicalData.length - 2];

    if (latest.overallScore > previous.overallScore) {
      insights.push('Overall health score is improving');
    } else if (latest.overallScore < previous.overallScore) {
      insights.push('Overall health score is declining');
    }

    return insights;
  }

  private async identifyRiskFactors(customerId: string, healthScore: CustomerHealthScore): Promise<string[]> {
    const riskFactors = [];

    if (healthScore.components.usage.score < 40) {
      riskFactors.push('Low product usage');
    }

    if (healthScore.components.engagement.score < 40) {
      riskFactors.push('Declining customer engagement');
    }

    if (healthScore.components.satisfaction.score < 40) {
      riskFactors.push('Poor satisfaction scores');
    }

    if (healthScore.trend === 'declining') {
      riskFactors.push('Negative health trend');
    }

    return riskFactors;
  }

  // Event handlers
  private async handleTicketCreated(event: BusinessEvent): Promise<void> {
    if (event.type === 'ticket.created') {
      const { customerId } = event.data;
      // Trigger health score recalculation
      this.healthScores.delete(customerId);
    }
  }

  private async handleUsageUpdate(event: BusinessEvent): Promise<void> {
    if (event.type === 'usage.updated') {
      const { customerId } = event.data;
      // Trigger health score update
      await this.updateHealthScore(customerId, event.data.metrics);
    }
  }

  private async handlePaymentEvent(event: BusinessEvent): Promise<void> {
    if (event.type === 'payment.failed') {
      const { customerId } = event.data;
      // Create payment issue alert
      const alert: HealthAlert = {
        customerId,
        alertType: 'payment_issue',
        severity: 'high',
        message: 'Payment failure detected',
        metrics: event.data,
        actionItems: ['Contact customer about payment', 'Review billing information'],
        createdAt: new Date(),
        acknowledged: false,
      };

      const existingAlerts = this.healthAlerts.get(customerId) || [];
      existingAlerts.push(alert);
      this.healthAlerts.set(customerId, existingAlerts);

      this.emit('healthAlert', alert);
    }
  }
}