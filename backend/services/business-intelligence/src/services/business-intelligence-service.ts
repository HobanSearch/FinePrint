import { EventEmitter } from 'events';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { memoryService } from '@fineprintai/shared-memory';
import { config } from '@fineprintai/shared-config';
import { 
  BusinessMetrics,
  BusinessInsightResponse,
  Prediction,
  BusinessEvent
} from '@fineprintai/shared-types';
import dayjs from 'dayjs';
import { z } from 'zod';
import _ from 'lodash';
import axios from 'axios';

const logger = createServiceLogger('business-intelligence-service');

export interface BusinessIntelligenceDashboard {
  overview: {
    totalRevenue: number;
    totalCustomers: number;
    totalLeads: number;
    totalTickets: number;
    conversionRate: number;
    churnRate: number;
    growthRate: number;
    nps: number;
  };
  revenue: {
    current: number;
    target: number;
    forecast: number;
    trend: 'up' | 'down' | 'stable';
    breakdown: {
      recurring: number;
      oneTime: number;
      expansion: number;
    };
  };
  customers: {
    total: number;
    new: number;
    churnRisk: number;
    healthScore: number;
    segments: Array<{
      name: string;
      count: number;
      revenue: number;
    }>;
  };
  sales: {
    pipeline: number;
    deals: number;
    winRate: number;
    avgDealSize: number;
    cycleLength: number;
    forecasts: {
      nextMonth: number;
      nextQuarter: number;
    };
  };
  marketing: {
    leads: number;
    mqls: number;
    cost: number;
    roas: number;
    campaigns: {
      active: number;
      performance: number;
    };
  };
  support: {
    tickets: number;
    satisfaction: number;
    resolutionTime: number;
    firstCallResolution: number;
  };
  insights: Array<{
    id: string;
    type: 'opportunity' | 'risk' | 'trend' | 'anomaly';
    title: string;
    description: string;
    impact: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    actionItems: string[];
  }>;
  alerts: Array<{
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: Date;
  }>;
}

export interface CrossFunctionJourney {
  customerId: string;
  stages: Array<{
    stage: 'awareness' | 'interest' | 'consideration' | 'purchase' | 'onboarding' | 'adoption' | 'expansion' | 'renewal';
    touchpoints: Array<{
      channel: string;
      interaction: string;
      timestamp: Date;
      outcome: string;
      metrics: Record<string, any>;
    }>;
    duration: number; // days
    conversion: boolean;
    value: number;
  }>;
  totalValue: number;
  totalDuration: number;
  conversionRate: number;
  dropoffPoints: Array<{
    stage: string;
    reason: string;
    impact: number;
  }>;
  optimizationOpportunities: string[];
}

export interface BusinessImpactAnalysis {
  initiative: string;
  type: 'feature' | 'campaign' | 'process' | 'tool' | 'strategy';
  impact: {
    revenue: {
      current: number;
      projected: number;
      lift: number;
      confidence: number;
    };
    efficiency: {
      timeSaved: number; // hours
      costReduction: number;
      productivityGain: number;
    };
    satisfaction: {
      customerSat: number;
      employeeSat: number;
      npsImpact: number;
    };
  };
  roi: {
    investment: number;
    return: number;
    paybackPeriod: number; // months
    irr: number;
  };
  risks: Array<{
    risk: string;
    probability: number;
    impact: number;
    mitigation: string;
  }>;
  timeline: {
    start: Date;
    milestones: Array<{
      name: string;
      date: Date;
      deliverables: string[];
    }>;
    completion: Date;
  };
}

export interface IntegratedInsight {
  id: string;
  type: 'cross_functional' | 'predictive' | 'comparative' | 'causal';
  title: string;
  description: string;
  sources: string[]; // marketing, sales, support services
  confidence: number;
  impact: {
    area: string;
    magnitude: number;
    timeframe: string;
  };
  data: {
    correlations: Array<{
      metric1: string;
      metric2: string;
      correlation: number;
      significance: number;
    }>;
    trends: Array<{
      metric: string;
      direction: 'up' | 'down' | 'stable';
      velocity: number;
    }>;
    segments: Array<{
      segment: string;
      value: number;
      performance: 'outperforming' | 'underperforming' | 'average';
    }>;
  };
  recommendations: Array<{
    action: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    expectedImpact: number;
    effort: 'low' | 'medium' | 'high';
    owner: string;
  }>;
  createdAt: Date;
  validUntil: Date;
}

export class BusinessIntelligenceService extends EventEmitter {
  private initialized = false;
  private serviceConnections = new Map<string, any>();
  private dashboardCache = new Map<string, any>();
  private insightsCache = new Map<string, IntegratedInsight[]>();
  private metricsCache = new Map<string, BusinessMetrics[]>();

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Business Intelligence Service');

      // Initialize memory service integration
      await this.initializeMemoryIntegration();

      // Set up connections to other business context services
      await this.initializeServiceConnections();

      // Initialize real-time data streaming
      await this.initializeRealTimeStreaming();

      // Set up automated insight generation
      await this.initializeAutomatedInsights();

      // Initialize dashboard caching
      await this.initializeDashboardCaching();

      this.initialized = true;
      logger.info('Business Intelligence Service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize Business Intelligence Service', { error });
      throw error;
    }
  }

  async getIntegratedDashboard(timeframe: string = '30d', filters?: Record<string, any>): Promise<BusinessIntelligenceDashboard> {
    const cacheKey = `dashboard:${timeframe}:${JSON.stringify(filters)}`;
    const cached = this.dashboardCache.get(cacheKey);
    
    if (cached && dayjs().diff(cached.timestamp, 'minutes') < 5) {
      return cached.data;
    }

    try {
      // Fetch data from all business context services
      const [marketingData, salesData, supportData] = await Promise.all([
        this.fetchMarketingData(timeframe, filters),
        this.fetchSalesData(timeframe, filters),
        this.fetchSupportData(timeframe, filters),
      ]);

      // Aggregate cross-functional metrics
      const overview = await this.calculateOverviewMetrics(marketingData, salesData, supportData);
      const revenue = await this.calculateRevenueMetrics(salesData, supportData);
      const customers = await this.calculateCustomerMetrics(marketingData, salesData, supportData);
      const sales = await this.calculateSalesMetrics(salesData);
      const marketing = await this.calculateMarketingMetrics(marketingData);
      const support = await this.calculateSupportMetrics(supportData);

      // Generate integrated insights
      const insights = await this.generateIntegratedInsights(
        marketingData, salesData, supportData, timeframe
      );

      // Get active alerts
      const alerts = await this.getActiveAlerts();

      const dashboard: BusinessIntelligenceDashboard = {
        overview,
        revenue,
        customers,
        sales,
        marketing,
        support,
        insights,
        alerts,
      };

      // Cache the dashboard
      this.dashboardCache.set(cacheKey, {
        data: dashboard,
        timestamp: new Date(),
      });

      logger.info('Integrated dashboard generated', { 
        timeframe, 
        insightsCount: insights.length,
        alertsCount: alerts.length,
      });

      return dashboard;

    } catch (error) {
      logger.error('Failed to generate integrated dashboard', { error, timeframe });
      throw error;
    }
  }

  async getCrossFunctionAnalytics(analysisType: string, params: Record<string, any>): Provider<any> {
    try {
      switch (analysisType) {
        case 'customer_journey':
          return await this.analyzeCrossFunctionCustomerJourney(params);
        case 'attribution':
          return await this.analyzeCrossFunctionAttribution(params);
        case 'conversion_funnel':
          return await this.analyzeCrossFunctionFunnel(params);
        case 'cohort_analysis':
          return await this.analyzeCrossFunctionCohorts(params);
        case 'segmentation':
          return await this.analyzeCrossFunctionSegmentation(params);
        default:
          throw new Error(`Unknown analysis type: ${analysisType}`);
      }
    } catch (error) {
      logger.error('Failed to perform cross-function analytics', { error, analysisType, params });
      throw error;
    }
  }

  async getPredictiveInsights(predictionType: string, horizon: number = 30): Promise<{
    predictions: Prediction[];
    confidence: number;
    factors: Array<{
      factor: string;
      importance: number;
      impact: 'positive' | 'negative';
    }>;
    recommendations: string[];
  }> {
    try {
      // Gather data from all services for prediction
      const historicalData = await this.gatherHistoricalData(predictionType, horizon * 3);
      
      // Apply predictive models
      const predictions = await this.generatePredictions(predictionType, historicalData, horizon);
      
      // Calculate overall confidence
      const confidence = _.meanBy(predictions, 'confidence');
      
      // Identify key factors
      const factors = await this.identifyPredictiveFactors(predictionType, historicalData);
      
      // Generate recommendations
      const recommendations = await this.generatePredictiveRecommendations(
        predictionType, predictions, factors
      );

      logger.info('Predictive insights generated', { 
        predictionType, 
        horizon, 
        predictionsCount: predictions.length,
        confidence,
      });

      return {
        predictions,
        confidence,
        factors,
        recommendations,
      };

    } catch (error) {
      logger.error('Failed to generate predictive insights', { error, predictionType, horizon });
      throw error;
    }
  }

  async getBusinessImpactAnalysis(initiative: string, params: Record<string, any>): Promise<BusinessImpactAnalysis> {
    try {
      // Analyze current baseline metrics
      const baseline = await this.calculateBaselineMetrics(initiative, params);
      
      // Project impact across different dimensions
      const revenueImpact = await this.calculateRevenueImpact(initiative, params, baseline);
      const efficiencyImpact = await this.calculateEfficiencyImpact(initiative, params, baseline);
      const satisfactionImpact = await this.calculateSatisfactionImpact(initiative, params, baseline);
      
      // Calculate ROI metrics
      const roi = await this.calculateROI(initiative, params, revenueImpact, efficiencyImpact);
      
      // Assess risks
      const risks = await this.assessRisks(initiative, params);
      
      // Create timeline
      const timeline = await this.createImplementationTimeline(initiative, params);

      const analysis: BusinessImpactAnalysis = {
        initiative,
        type: params.type || 'strategy',
        impact: {
          revenue: revenueImpact,
          efficiency: efficiencyImpact,
          satisfaction: satisfactionImpact,
        },
        roi,
        risks,
        timeline,
      };

      // Store analysis in memory service
      await memoryService.storeConversation('business-impact', initiative, {
        analysis,
        timestamp: new Date(),
      });

      logger.info('Business impact analysis completed', { initiative, roi: roi.return });

      return analysis;

    } catch (error) {
      logger.error('Failed to analyze business impact', { error, initiative });
      throw error;
    }
  }

  async getAutomatedInsights(timeframe: string = '7d'): Promise<IntegratedInsight[]> {
    const cacheKey = `insights:${timeframe}`;
    const cached = this.insightsCache.get(cacheKey);
    
    if (cached && cached.length > 0 && dayjs().diff(cached[0].createdAt, 'hours') < 6) {
      return cached;
    }

    try {
      const insights: IntegratedInsight[] = [];

      // Generate cross-functional insights
      const crossFunctionalInsights = await this.generateCrossFunctionalInsights(timeframe);
      insights.push(...crossFunctionalInsights);

      // Generate predictive insights
      const predictiveInsights = await this.generatePredictiveInsightsSummary(timeframe);
      insights.push(...predictiveInsights);

      // Generate comparative insights
      const comparativeInsights = await this.generateComparativeInsights(timeframe);
      insights.push(...comparativeInsights);

      // Generate causal insights
      const causalInsights = await this.generateCausalInsights(timeframe);
      insights.push(...causalInsights);

      // Sort by impact and confidence
      insights.sort((a, b) => {
        const scoreA = a.impact.magnitude * (a.confidence / 100);
        const scoreB = b.impact.magnitude * (b.confidence / 100);
        return scoreB - scoreA;
      });

      // Cache insights
      this.insightsCache.set(cacheKey, insights);

      logger.info('Automated insights generated', { 
        timeframe, 
        insightsCount: insights.length,
      });

      return insights;

    } catch (error) {
      logger.error('Failed to generate automated insights', { error, timeframe });
      throw error;
    }
  }

  async getExecutiveReport(period: 'week' | 'month' | 'quarter', format: 'summary' | 'detailed' = 'summary'): Promise<{
    period: string;
    summary: {
      keyMetrics: Record<string, number>;
      performance: 'exceeding' | 'meeting' | 'below' | 'critical';
      highlights: string[];
      concerns: string[];
    };
    sections: Array<{
      title: string;
      metrics: Record<string, any>;
      trends: Array<{
        metric: string;
        change: number;
        significance: 'high' | 'medium' | 'low';
      }>;
      insights: string[];
      recommendations: string[];
    }>;
    appendix?: {
      detailedCharts: any[];
      rawData: any[];
      methodology: string;
    };
  }> {
    try {
      // Determine time period
      const timeframe = this.getPeriodTimeframe(period);
      
      // Get comprehensive data
      const dashboard = await this.getIntegratedDashboard(timeframe);
      const insights = await this.getAutomatedInsights(timeframe);
      
      // Generate executive summary
      const summary = await this.generateExecutiveSummary(dashboard, insights, period);
      
      // Create detailed sections
      const sections = await this.generateReportSections(dashboard, insights, format);
      
      // Add appendix if detailed format
      let appendix;
      if (format === 'detailed') {
        appendix = await this.generateReportAppendix(dashboard, timeframe);
      }

      const report = {
        period: `${period} ending ${dayjs().format('YYYY-MM-DD')}`,
        summary,
        sections,
        appendix,
      };

      // Store report in memory service
      await memoryService.storeConversation('executive-reports', 
        `${period}_${dayjs().format('YYYY-MM-DD')}`, report);

      logger.info('Executive report generated', { period, format, sectionsCount: sections.length });

      return report;

    } catch (error) {
      logger.error('Failed to generate executive report', { error, period, format });
      throw error;
    }
  }

  async getSystemMetrics(): Promise<{
    performance: {
      responseTime: number;
      throughput: number;
      errorRate: number;
    };
    resources: {
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
    };
    connections: {
      activeConnections: number;
      serviceStatus: Record<string, 'healthy' | 'degraded' | 'down'>;
    };
  }> {
    try {
      // Get system performance metrics
      const performance = {
        responseTime: 150, // ms - would be calculated from actual metrics
        throughput: 1000, // requests/min
        errorRate: 0.5, // percentage
      };

      // Get resource utilization
      const resources = {
        cpuUsage: 45, // percentage
        memoryUsage: 60, // percentage  
        diskUsage: 30, // percentage
      };

      // Check service connections
      const serviceStatus: Record<string, 'healthy' | 'degraded' | 'down'> = {};
      for (const [serviceName, connection] of this.serviceConnections.entries()) {
        try {
          const healthy = await this.checkServiceHealth(serviceName, connection);
          serviceStatus[serviceName] = healthy ? 'healthy' : 'degraded';
        } catch (error) {
          serviceStatus[serviceName] = 'down';
        }
      }

      const connections = {
        activeConnections: this.serviceConnections.size,
        serviceStatus,
      };

      return {
        performance,
        resources,
        connections,
      };

    } catch (error) {
      logger.error('Failed to get system metrics', { error });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) return false;

      // Check memory service connection
      const memoryHealthy = await memoryService.healthCheck();
      if (!memoryHealthy) return false;

      // Check service connections
      const serviceHealthChecks = await Promise.all(
        Array.from(this.serviceConnections.entries()).map(([name, connection]) =>
          this.checkServiceHealth(name, connection)
        )
      );

      const allServicesHealthy = serviceHealthChecks.every(check => check);
      
      return memoryHealthy && allServicesHealthy;

    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }

  // Private helper methods

  private async initializeMemoryIntegration(): Promise<void> {
    await memoryService.createCollection('business-intelligence');
    await memoryService.createCollection('integrated-insights');
    await memoryService.createCollection('business-impact');
    await memoryService.createCollection('executive-reports');
    await memoryService.createCollection('cross-function-analytics');
  }

  private async initializeServiceConnections(): Promise<void> {
    const services = ['marketing-context', 'sales-context', 'support-context'];
    
    for (const service of services) {
      try {
        const serviceConfig = config.services[service as keyof typeof config.services];
        if (serviceConfig) {
          const connection = {
            baseURL: `http://${serviceConfig.host}:${serviceConfig.port}`,
            timeout: 30000,
          };
          this.serviceConnections.set(service, connection);
        }
      } catch (error) {
        logger.error(`Failed to initialize connection to ${service}`, { error });
      }
    }

    logger.info('Service connections initialized', { 
      connectedServices: this.serviceConnections.size 
    });
  }

  private async initializeRealTimeStreaming(): Promise<void> {
    // Set up real-time data streaming from other services
    this.on('marketingUpdate', this.handleMarketingUpdate.bind(this));
    this.on('salesUpdate', this.handleSalesUpdate.bind(this));
    this.on('supportUpdate', this.handleSupportUpdate.bind(this));
  }

  private async initializeAutomatedInsights(): Promise<void> {
    // Set up automated insight generation
    setInterval(async () => {
      try {
        await this.generateAutomatedInsights();
      } catch (error) {
        logger.error('Failed to generate automated insights', { error });
      }
    }, 3600000); // Every hour
  }

  private async initializeDashboardCaching(): Promise<void> {
    // Set up dashboard cache cleanup
    setInterval(() => {
      const now = dayjs();
      for (const [key, value] of this.dashboardCache.entries()) {
        if (now.diff(value.timestamp, 'minutes') > 30) {
          this.dashboardCache.delete(key);
        }
      }
    }, 600000); // Every 10 minutes
  }

  private async fetchMarketingData(timeframe: string, filters?: Record<string, any>): Promise<any> {
    const connection = this.serviceConnections.get('marketing-context');
    if (!connection) throw new Error('Marketing service not connected');

    try {
      const response = await axios.get(`${connection.baseURL}/api/analytics/dashboard`, {
        params: { timeframe, ...filters },
        timeout: connection.timeout,
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch marketing data', { error });
      return {};
    }
  }

  private async fetchSalesData(timeframe: string, filters?: Record<string, any>): Promise<any> {
    const connection = this.serviceConnections.get('sales-context');
    if (!connection) throw new Error('Sales service not connected');

    try {
      const response = await axios.get(`${connection.baseURL}/api/analytics/dashboard`, {
        params: { timeframe, ...filters },
        timeout: connection.timeout,
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch sales data', { error });
      return {};
    }
  }

  private async fetchSupportData(timeframe: string, filters?: Record<string, any>): Promise<any> {
    const connection = this.serviceConnections.get('support-context');
    if (!connection) throw new Error('Support service not connected');

    try {
      const response = await axios.get(`${connection.baseURL}/api/analytics/dashboard`, {
        params: { timeframe, ...filters },
        timeout: connection.timeout,
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch support data', { error });
      return {};
    }
  }

  private async calculateOverviewMetrics(marketing: any, sales: any, support: any): Promise<any> {
    return {
      totalRevenue: sales.totalRevenue || 0,
      totalCustomers: support.totalCustomers || 0,
      totalLeads: marketing.totalLeads || 0,
      totalTickets: support.totalTickets || 0,
      conversionRate: this.calculateConversionRate(marketing, sales),
      churnRate: this.calculateChurnRate(support),
      growthRate: this.calculateGrowthRate(sales),
      nps: support.nps || 0,
    };
  }

  private calculateConversionRate(marketing: any, sales: any): number {
    const leads = marketing.totalLeads || 0;
    const conversions = sales.totalConversions || 0;
    return leads > 0 ? (conversions / leads) * 100 : 0;
  }

  private calculateChurnRate(support: any): number {
    // Simplified churn calculation
    return support.churnRate || 0;
  }

  private calculateGrowthRate(sales: any): number {
    // Simplified growth calculation
    return sales.growthRate || 0;
  }

  // Additional helper methods would be implemented similarly...

  private async generateAutomatedInsights(): Promise<void> {
    try {
      const insights = await this.getAutomatedInsights('24h');
      
      // Emit high-priority insights
      const criticalInsights = insights.filter(insight => 
        insight.impact.magnitude > 70 && insight.confidence > 80
      );

      if (criticalInsights.length > 0) {
        this.emit('criticalInsights', criticalInsights);
      }

    } catch (error) {
      logger.error('Failed to generate automated insights', { error });
    }
  }

  private async handleMarketingUpdate(event: BusinessEvent): Promise<void> {
    // Invalidate relevant caches and update real-time metrics
    this.dashboardCache.clear();
    this.insightsCache.clear();
  }

  private async handleSalesUpdate(event: BusinessEvent): Promise<void> {
    // Invalidate relevant caches and update real-time metrics
    this.dashboardCache.clear();
    this.insightsCache.clear();
  }

  private async handleSupportUpdate(event: BusinessEvent): Promise<void> {
    // Invalidate relevant caches and update real-time metrics
    this.dashboardCache.clear();
    this.insightsCache.clear();
  }

  private async checkServiceHealth(serviceName: string, connection: any): Promise<boolean> {
    try {
      const response = await axios.get(`${connection.baseURL}/health`, {
        timeout: 5000,
      });
      return response.status === 200 && response.data.status === 'healthy';
    } catch (error) {
      return false;
    }
  }

  // Placeholder implementations for complex analysis methods
  private async analyzeCrossFunctionCustomerJourney(params: any): Promise<CrossFunctionJourney> {
    // Implementation would analyze customer journey across all touchpoints
    return {} as CrossFunctionJourney;
  }

  private async analyzeCrossFunctionAttribution(params: any): Promise<any> {
    // Implementation would analyze attribution across marketing, sales, and support
    return {};
  }

  private async analyzeCrossFunctionFunnel(params: any): Promise<any> {
    // Implementation would analyze conversion funnel across all stages
    return {};
  }

  private async analyzeCrossFunctionCohorts(params: any): Promise<any> {
    // Implementation would analyze customer cohorts across lifecycle
    return {};
  }

  private async analyzeCrossFunctionSegmentation(params: any): Promise<any> {
    // Implementation would analyze customer segments across all dimensions
    return {};
  }

  // Additional method implementations would follow similar patterns...
}