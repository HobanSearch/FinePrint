/**
 * Metric Replication Engine
 * Mirrors production KPIs and generates counterfactual scenarios
 */

import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import * as ss from 'simple-statistics';
import { Matrix } from 'ml-matrix';
import {
  BusinessMetrics,
  MetricTimeSeries,
  TimeSeriesPoint,
  RevenueMetrics,
  CustomerMetrics,
  MarketingMetrics,
  SalesMetrics,
  SupportMetrics,
  ProductMetrics
} from '../types';
import { logger } from '../utils/logger';

export interface MetricReplicationConfig {
  historicalDataDays: number;
  forecastHorizon: number;
  seasonalityPeriods: number[];
  trendSmoothingFactor: number;
  noiseLevel: number;
}

export interface CounterfactualScenario {
  id: string;
  name: string;
  description: string;
  modifications: MetricModification[];
  constraints: MetricConstraint[];
}

export interface MetricModification {
  metric: string;
  type: 'multiply' | 'add' | 'set' | 'trend';
  value: number;
  startDay?: number;
  duration?: number;
}

export interface MetricConstraint {
  metric: string;
  min?: number;
  max?: number;
  relationship?: string; // e.g., "ltv > 3 * cac"
}

export interface ReplicatedMetrics {
  timestamp: Date;
  actual: BusinessMetrics;
  replicated: BusinessMetrics;
  forecast: BusinessMetrics;
  counterfactual?: BusinessMetrics;
  accuracy: MetricAccuracy;
}

export interface MetricAccuracy {
  overall: number;
  byCategory: Record<string, number>;
  byMetric: Record<string, number>;
}

export class MetricReplicator extends EventEmitter {
  private redis: Redis;
  private config: MetricReplicationConfig;
  private historicalData: Map<string, TimeSeriesPoint[]> = new Map();
  private models: Map<string, any> = new Map();
  private correlationMatrix: Matrix | null = null;

  constructor(redis: Redis, config?: Partial<MetricReplicationConfig>) {
    super();
    this.redis = redis;
    this.config = {
      historicalDataDays: 90,
      forecastHorizon: 30,
      seasonalityPeriods: [7, 30], // Weekly and monthly
      trendSmoothingFactor: 0.3,
      noiseLevel: 0.05,
      ...config
    };

    this.loadHistoricalData();
  }

  /**
   * Load historical metrics from Redis
   */
  private async loadHistoricalData(): Promise<void> {
    try {
      const keys = await this.redis.keys('metrics:history:*');
      
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const metricName = key.replace('metrics:history:', '');
          this.historicalData.set(metricName, JSON.parse(data));
        }
      }

      logger.info('Loaded historical metrics', {
        metrics: this.historicalData.size
      });

      // Build correlation matrix
      this.buildCorrelationMatrix();
    } catch (error) {
      logger.error('Failed to load historical data', error);
    }
  }

  /**
   * Replicate production metrics
   */
  async replicateMetrics(productionMetrics: BusinessMetrics): Promise<ReplicatedMetrics> {
    logger.info('Replicating production metrics');

    // Store actual metrics
    await this.storeMetrics(productionMetrics);

    // Generate replicated metrics with statistical properties
    const replicated = this.generateReplicatedMetrics(productionMetrics);

    // Forecast future metrics
    const forecast = this.forecastMetrics(productionMetrics);

    // Calculate accuracy
    const accuracy = this.calculateAccuracy(productionMetrics, replicated);

    const result: ReplicatedMetrics = {
      timestamp: new Date(),
      actual: productionMetrics,
      replicated,
      forecast,
      accuracy
    };

    this.emit('metrics:replicated', result);
    return result;
  }

  /**
   * Generate counterfactual scenario
   */
  async generateCounterfactual(
    baseMetrics: BusinessMetrics,
    scenario: CounterfactualScenario
  ): Promise<BusinessMetrics> {
    logger.info('Generating counterfactual scenario', {
      scenario: scenario.name
    });

    let metrics = this.deepClone(baseMetrics);

    // Apply modifications
    for (const mod of scenario.modifications) {
      metrics = this.applyModification(metrics, mod);
    }

    // Propagate effects through correlation
    metrics = this.propagateEffects(metrics, baseMetrics);

    // Apply constraints
    metrics = this.applyConstraints(metrics, scenario.constraints);

    // Add realistic noise
    metrics = this.addRealisticNoise(metrics);

    this.emit('counterfactual:generated', {
      scenario,
      metrics
    });

    return metrics;
  }

  /**
   * Generate what-if analysis
   */
  async whatIfAnalysis(
    baseMetrics: BusinessMetrics,
    changes: Map<string, number>
  ): Promise<WhatIfResult> {
    logger.info('Performing what-if analysis', {
      changes: Array.from(changes.entries())
    });

    const scenarios: BusinessMetrics[] = [];
    const impacts: Map<string, Impact> = new Map();

    // Generate multiple scenarios with Monte Carlo
    for (let i = 0; i < 100; i++) {
      const scenario = this.generateWhatIfScenario(baseMetrics, changes, i);
      scenarios.push(scenario);
    }

    // Analyze impacts
    for (const [metric, _] of changes) {
      const impact = this.analyzeImpact(baseMetrics, scenarios, metric);
      impacts.set(metric, impact);
    }

    // Find optimal scenario
    const optimal = this.findOptimalScenario(scenarios, baseMetrics);

    return {
      baseCase: baseMetrics,
      scenarios,
      impacts,
      optimal,
      confidence: this.calculateConfidence(scenarios)
    };
  }

  /**
   * Detect metric anomalies
   */
  detectAnomalies(metrics: BusinessMetrics): AnomalyReport {
    const anomalies: Anomaly[] = [];

    // Check each metric against historical patterns
    this.forEachMetric(metrics, (value, path) => {
      const historical = this.historicalData.get(path);
      if (!historical || historical.length < 30) return;

      const values = historical.map(p => p.value);
      const mean = ss.mean(values);
      const stdDev = ss.standardDeviation(values);

      // Z-score test
      const zScore = Math.abs((value - mean) / stdDev);
      if (zScore > 3) {
        anomalies.push({
          metric: path,
          value,
          expected: mean,
          deviation: zScore,
          severity: zScore > 4 ? 'high' : 'medium',
          type: value > mean ? 'spike' : 'drop'
        });
      }

      // Trend break detection
      const trend = this.detectTrendBreak(historical, value);
      if (trend) {
        anomalies.push(trend);
      }
    });

    return {
      timestamp: new Date(),
      anomalies,
      overallHealth: this.calculateHealthScore(anomalies)
    };
  }

  /**
   * Synthetic data generation for edge cases
   */
  generateSyntheticMetrics(
    template: MetricTemplate
  ): BusinessMetrics[] {
    logger.info('Generating synthetic metrics', {
      template: template.name
    });

    const synthetic: BusinessMetrics[] = [];

    for (let i = 0; i < template.count; i++) {
      const metrics = this.createBaseMetrics(template);
      
      // Apply template patterns
      for (const pattern of template.patterns) {
        this.applyPattern(metrics, pattern);
      }

      // Add correlations
      this.ensureCorrelations(metrics);

      // Add temporal dynamics
      this.addTemporalDynamics(metrics, i);

      synthetic.push(metrics);
    }

    return synthetic;
  }

  // Private helper methods

  private generateReplicatedMetrics(actual: BusinessMetrics): BusinessMetrics {
    const replicated = this.deepClone(actual);

    // Add statistical variations while preserving relationships
    this.forEachMetric(replicated, (value, path) => {
      // Preserve relative relationships
      const variance = this.getMetricVariance(path);
      const noise = this.generateNoise(variance);
      
      // Apply bounded noise
      const newValue = value * (1 + noise);
      this.setMetricValue(replicated, path, newValue);
    });

    // Ensure metric relationships are maintained
    this.enforceRelationships(replicated);

    return replicated;
  }

  private forecastMetrics(current: BusinessMetrics): BusinessMetrics {
    const forecast = this.deepClone(current);

    this.forEachMetric(forecast, (value, path) => {
      const historical = this.historicalData.get(path);
      if (!historical || historical.length < 30) {
        // Simple trend projection
        const growthRate = this.estimateGrowthRate(path);
        const forecastValue = value * (1 + growthRate * this.config.forecastHorizon / 30);
        this.setMetricValue(forecast, path, forecastValue);
      } else {
        // Time series forecasting
        const forecastValue = this.timeSeriesForecast(historical, this.config.forecastHorizon);
        this.setMetricValue(forecast, path, forecastValue);
      }
    });

    return forecast;
  }

  private timeSeriesForecast(series: TimeSeriesPoint[], horizon: number): number {
    const values = series.map(p => p.value);
    
    // Decompose time series
    const trend = this.extractTrend(values);
    const seasonal = this.extractSeasonality(values);
    const residual = values[values.length - 1] - trend - seasonal;

    // Project forward
    const trendProjection = trend * (1 + this.estimateTrendGrowth(values));
    const seasonalProjection = seasonal; // Assume seasonality continues
    
    return trendProjection + seasonalProjection + residual * 0.5;
  }

  private extractTrend(values: number[]): number {
    // Simple moving average for trend
    const window = Math.min(7, Math.floor(values.length / 4));
    const recent = values.slice(-window);
    return ss.mean(recent);
  }

  private extractSeasonality(values: number[]): number {
    // Detect and extract seasonal component
    for (const period of this.config.seasonalityPeriods) {
      if (values.length >= period * 2) {
        const seasonal = this.calculateSeasonalComponent(values, period);
        if (Math.abs(seasonal) > 0.01) {
          return seasonal;
        }
      }
    }
    return 0;
  }

  private calculateSeasonalComponent(values: number[], period: number): number {
    const seasons = [];
    for (let i = 0; i < values.length - period; i += period) {
      const season = values.slice(i, i + period);
      seasons.push(ss.mean(season));
    }
    
    if (seasons.length < 2) return 0;
    
    const seasonalPattern = ss.standardDeviation(seasons) / ss.mean(seasons);
    return seasonalPattern > 0.1 ? seasons[seasons.length - 1] - ss.mean(seasons) : 0;
  }

  private estimateTrendGrowth(values: number[]): number {
    if (values.length < 3) return 0;
    
    // Simple linear regression for trend
    const x = Array.from({length: values.length}, (_, i) => i);
    const regression = ss.linearRegression([x, values]);
    
    return regression.m / (ss.mean(values) || 1);
  }

  private buildCorrelationMatrix(): void {
    const metricNames = Array.from(this.historicalData.keys());
    const n = metricNames.length;
    
    if (n < 2) return;

    const correlations = new Matrix(n, n);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          correlations.set(i, j, 1);
        } else {
          const series1 = this.historicalData.get(metricNames[i])!;
          const series2 = this.historicalData.get(metricNames[j])!;
          
          const correlation = this.calculateCorrelation(series1, series2);
          correlations.set(i, j, correlation);
        }
      }
    }

    this.correlationMatrix = correlations;
  }

  private calculateCorrelation(series1: TimeSeriesPoint[], series2: TimeSeriesPoint[]): number {
    const values1 = series1.map(p => p.value);
    const values2 = series2.map(p => p.value);
    
    const minLength = Math.min(values1.length, values2.length);
    if (minLength < 2) return 0;
    
    const v1 = values1.slice(-minLength);
    const v2 = values2.slice(-minLength);
    
    try {
      return ss.sampleCorrelation(v1, v2);
    } catch {
      return 0;
    }
  }

  private applyModification(metrics: BusinessMetrics, mod: MetricModification): BusinessMetrics {
    const modified = this.deepClone(metrics);
    const currentValue = this.getMetricValue(metrics, mod.metric);

    let newValue: number;
    switch (mod.type) {
      case 'multiply':
        newValue = currentValue * mod.value;
        break;
      case 'add':
        newValue = currentValue + mod.value;
        break;
      case 'set':
        newValue = mod.value;
        break;
      case 'trend':
        newValue = currentValue * (1 + mod.value);
        break;
      default:
        newValue = currentValue;
    }

    this.setMetricValue(modified, mod.metric, newValue);
    return modified;
  }

  private propagateEffects(
    modified: BusinessMetrics,
    original: BusinessMetrics
  ): BusinessMetrics {
    if (!this.correlationMatrix) return modified;

    // Find changed metrics
    const changes: Map<string, number> = new Map();
    this.forEachMetric(modified, (value, path) => {
      const originalValue = this.getMetricValue(original, path);
      if (Math.abs(value - originalValue) > 0.01) {
        changes.set(path, (value - originalValue) / originalValue);
      }
    });

    // Propagate through correlations
    for (const [changedMetric, changeRatio] of changes) {
      this.forEachMetric(modified, (value, path) => {
        if (path === changedMetric) return;
        
        const correlation = this.getCorrelation(changedMetric, path);
        if (Math.abs(correlation) > 0.3) {
          const effect = changeRatio * correlation * 0.5; // Damping factor
          const newValue = value * (1 + effect);
          this.setMetricValue(modified, path, newValue);
        }
      });
    }

    return modified;
  }

  private getCorrelation(metric1: string, metric2: string): number {
    // Simplified correlation lookup
    // In production, would use the correlation matrix
    const correlations: Record<string, Record<string, number>> = {
      'revenue.mrr': {
        'customers.total': 0.9,
        'revenue.arpu': 0.7,
        'customers.active': 0.85
      },
      'customers.churnRate': {
        'revenue.mrr': -0.6,
        'customers.csat': -0.8,
        'support.ticketVolume': 0.5
      }
    };

    return correlations[metric1]?.[metric2] || 0;
  }

  private applyConstraints(
    metrics: BusinessMetrics,
    constraints: MetricConstraint[]
  ): BusinessMetrics {
    const constrained = this.deepClone(metrics);

    for (const constraint of constraints) {
      const value = this.getMetricValue(constrained, constraint.metric);
      
      if (constraint.min !== undefined && value < constraint.min) {
        this.setMetricValue(constrained, constraint.metric, constraint.min);
      }
      
      if (constraint.max !== undefined && value > constraint.max) {
        this.setMetricValue(constrained, constraint.metric, constraint.max);
      }
      
      if (constraint.relationship) {
        this.enforceRelationship(constrained, constraint.relationship);
      }
    }

    return constrained;
  }

  private enforceRelationship(metrics: BusinessMetrics, relationship: string): void {
    // Parse and enforce relationships like "ltv > 3 * cac"
    // Simplified implementation
    if (relationship.includes('ltv') && relationship.includes('cac')) {
      const ltv = metrics.revenue.ltv;
      const cac = metrics.revenue.cac;
      
      if (ltv < 3 * cac) {
        metrics.revenue.ltv = 3 * cac;
      }
    }
  }

  private addRealisticNoise(metrics: BusinessMetrics): BusinessMetrics {
    const noisy = this.deepClone(metrics);

    this.forEachMetric(noisy, (value, path) => {
      const noise = this.generateNoise(this.config.noiseLevel);
      const noisyValue = value * (1 + noise);
      this.setMetricValue(noisy, path, noisyValue);
    });

    return noisy;
  }

  private generateNoise(level: number): number {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z * level;
  }

  private calculateAccuracy(actual: BusinessMetrics, replicated: BusinessMetrics): MetricAccuracy {
    const errors: Map<string, number> = new Map();
    const categoryErrors: Map<string, number[]> = new Map();

    this.forEachMetric(actual, (actualValue, path) => {
      const replicatedValue = this.getMetricValue(replicated, path);
      const error = Math.abs(actualValue - replicatedValue) / (actualValue || 1);
      errors.set(path, 1 - error);

      const category = path.split('.')[0];
      if (!categoryErrors.has(category)) {
        categoryErrors.set(category, []);
      }
      categoryErrors.get(category)!.push(1 - error);
    });

    const byCategory: Record<string, number> = {};
    for (const [category, accuracies] of categoryErrors) {
      byCategory[category] = ss.mean(accuracies);
    }

    return {
      overall: ss.mean(Array.from(errors.values())),
      byCategory,
      byMetric: Object.fromEntries(errors)
    };
  }

  private async storeMetrics(metrics: BusinessMetrics): Promise<void> {
    const timestamp = new Date();

    this.forEachMetric(metrics, async (value, path) => {
      const key = `metrics:history:${path}`;
      let history = this.historicalData.get(path) || [];
      
      history.push({ timestamp, value });
      
      // Keep only recent history
      const cutoff = new Date(timestamp.getTime() - this.config.historicalDataDays * 24 * 60 * 60 * 1000);
      history = history.filter(p => p.timestamp > cutoff);
      
      this.historicalData.set(path, history);
      await this.redis.set(key, JSON.stringify(history));
    });
  }

  // Utility methods

  private forEachMetric(
    metrics: BusinessMetrics,
    callback: (value: number, path: string) => void
  ): void {
    const traverse = (obj: any, path: string = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;
        
        if (typeof value === 'number') {
          callback(value, fullPath);
        } else if (typeof value === 'object' && value !== null && !(value instanceof Map)) {
          traverse(value, fullPath);
        }
      }
    };

    traverse(metrics);
  }

  private getMetricValue(metrics: BusinessMetrics, path: string): number {
    const parts = path.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      value = value[part];
      if (value === undefined) return 0;
    }
    
    return typeof value === 'number' ? value : 0;
  }

  private setMetricValue(metrics: BusinessMetrics, path: string, value: number): void {
    const parts = path.split('.');
    let obj: any = metrics;
    
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]];
      if (!obj) return;
    }
    
    obj[parts[parts.length - 1]] = value;
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  private getMetricVariance(path: string): number {
    const historical = this.historicalData.get(path);
    if (!historical || historical.length < 2) return this.config.noiseLevel;
    
    const values = historical.map(p => p.value);
    const cv = ss.standardDeviation(values) / (ss.mean(values) || 1);
    
    return Math.min(cv, 0.3); // Cap at 30% coefficient of variation
  }

  private estimateGrowthRate(path: string): number {
    // Default growth rates by metric type
    const growthRates: Record<string, number> = {
      'revenue': 0.1,
      'customers': 0.05,
      'churn': -0.02,
      'satisfaction': 0.01
    };

    for (const [key, rate] of Object.entries(growthRates)) {
      if (path.includes(key)) return rate;
    }

    return 0.02; // Default 2% growth
  }

  private enforceRelationships(metrics: BusinessMetrics): void {
    // Ensure logical relationships
    metrics.revenue.arr = metrics.revenue.mrr * 12;
    metrics.revenue.ltvCacRatio = metrics.revenue.ltv / metrics.revenue.cac;
    
    if (metrics.customers.total > 0) {
      metrics.revenue.arpu = metrics.revenue.mrr / metrics.customers.total;
    }
  }

  private detectTrendBreak(historical: TimeSeriesPoint[], currentValue: number): Anomaly | null {
    if (historical.length < 10) return null;

    const values = historical.map(p => p.value);
    const recentTrend = this.calculateTrend(values.slice(-10));
    const expectedValue = values[values.length - 1] * (1 + recentTrend);
    
    const deviation = Math.abs(currentValue - expectedValue) / expectedValue;
    
    if (deviation > 0.3) {
      return {
        metric: 'trend',
        value: currentValue,
        expected: expectedValue,
        deviation,
        severity: deviation > 0.5 ? 'high' : 'medium',
        type: 'trend-break'
      };
    }

    return null;
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    const firstHalf = ss.mean(values.slice(0, Math.floor(values.length / 2)));
    const secondHalf = ss.mean(values.slice(Math.floor(values.length / 2)));
    
    return (secondHalf - firstHalf) / firstHalf;
  }

  private calculateHealthScore(anomalies: Anomaly[]): number {
    if (anomalies.length === 0) return 1;
    
    const severityWeights = { low: 0.1, medium: 0.3, high: 0.5 };
    const totalWeight = anomalies.reduce((sum, a) => sum + severityWeights[a.severity], 0);
    
    return Math.max(0, 1 - totalWeight / 10);
  }

  private generateWhatIfScenario(
    base: BusinessMetrics,
    changes: Map<string, number>,
    seed: number
  ): BusinessMetrics {
    const scenario = this.deepClone(base);
    
    // Apply changes with some randomness
    for (const [metric, change] of changes) {
      const currentValue = this.getMetricValue(scenario, metric);
      const randomFactor = 1 + (Math.sin(seed) * 0.1); // ±10% randomness
      const newValue = currentValue * (1 + change * randomFactor);
      this.setMetricValue(scenario, metric, newValue);
    }
    
    // Propagate effects
    return this.propagateEffects(scenario, base);
  }

  private analyzeImpact(
    base: BusinessMetrics,
    scenarios: BusinessMetrics[],
    metric: string
  ): Impact {
    const baseValue = this.getMetricValue(base, metric);
    const scenarioValues = scenarios.map(s => this.getMetricValue(s, metric));
    
    return {
      metric,
      baseValue,
      mean: ss.mean(scenarioValues),
      median: ss.median(scenarioValues),
      stdDev: ss.standardDeviation(scenarioValues),
      min: Math.min(...scenarioValues),
      max: Math.max(...scenarioValues),
      percentiles: {
        p10: ss.quantile(scenarioValues, 0.1),
        p25: ss.quantile(scenarioValues, 0.25),
        p75: ss.quantile(scenarioValues, 0.75),
        p90: ss.quantile(scenarioValues, 0.9)
      }
    };
  }

  private findOptimalScenario(scenarios: BusinessMetrics[], base: BusinessMetrics): BusinessMetrics {
    // Simple optimization: maximize revenue while minimizing churn
    let bestScore = -Infinity;
    let bestScenario = scenarios[0];
    
    for (const scenario of scenarios) {
      const revenueGrowth = (scenario.revenue.mrr - base.revenue.mrr) / base.revenue.mrr;
      const churnReduction = (base.revenue.churnRate - scenario.revenue.churnRate) / base.revenue.churnRate;
      const score = revenueGrowth + churnReduction;
      
      if (score > bestScore) {
        bestScore = score;
        bestScenario = scenario;
      }
    }
    
    return bestScenario;
  }

  private calculateConfidence(scenarios: BusinessMetrics[]): number {
    // Calculate confidence based on scenario consistency
    const revenues = scenarios.map(s => s.revenue.mrr);
    const cv = ss.standardDeviation(revenues) / ss.mean(revenues);
    
    return Math.max(0, Math.min(1, 1 - cv));
  }

  private createBaseMetrics(template: MetricTemplate): BusinessMetrics {
    // Create base metrics from template
    return {
      revenue: {
        mrr: template.baseMRR || 10000,
        arr: (template.baseMRR || 10000) * 12,
        arpu: template.baseARPU || 100,
        ltv: template.baseLTV || 3000,
        cac: template.baseCAC || 1000,
        ltvCacRatio: 3,
        growthRate: 0.1,
        churnRate: 0.05,
        netRevenueRetention: 1.1
      },
      customers: {
        total: 100,
        active: 95,
        new: 10,
        churned: 5,
        nps: 30,
        csat: 0.8,
        healthScore: 0.75
      },
      marketing: {
        leads: 200,
        mql: 120,
        sql: 60,
        conversionRate: 0.3,
        cpl: 50,
        emailOpenRate: 0.25,
        emailClickRate: 0.05,
        websiteTraffic: 10000,
        organicTraffic: 6000,
        paidTraffic: 4000
      },
      sales: {
        pipeline: 500000,
        closedWon: 20,
        closedLost: 10,
        winRate: 0.67,
        averageDealSize: 5000,
        salesCycle: 30,
        quotaAttainment: 0.9
      },
      support: {
        ticketVolume: 100,
        averageResponseTime: 300,
        averageResolutionTime: 3600,
        firstContactResolution: 0.7,
        ticketBacklog: 10,
        csat: 0.8
      },
      product: {
        activeUsers: 95,
        featureAdoption: new Map(),
        usageFrequency: 5,
        sessionDuration: 1200,
        retentionRate: 0.9,
        engagementScore: 0.7
      }
    };
  }

  private applyPattern(metrics: BusinessMetrics, pattern: MetricPattern): void {
    switch (pattern.type) {
      case 'growth':
        metrics.revenue.mrr *= (1 + pattern.rate);
        metrics.customers.total = Math.floor(metrics.customers.total * (1 + pattern.rate));
        break;
      case 'churn-spike':
        metrics.revenue.churnRate *= (1 + pattern.magnitude);
        metrics.customers.churned = Math.floor(metrics.customers.total * metrics.revenue.churnRate);
        break;
      case 'seasonal':
        const seasonalFactor = 1 + Math.sin(pattern.phase) * pattern.amplitude;
        metrics.revenue.mrr *= seasonalFactor;
        break;
    }
  }

  private ensureCorrelations(metrics: BusinessMetrics): void {
    // Ensure realistic correlations between metrics
    metrics.revenue.arpu = metrics.revenue.mrr / metrics.customers.total;
    metrics.revenue.ltvCacRatio = metrics.revenue.ltv / metrics.revenue.cac;
    metrics.customers.active = metrics.customers.total - metrics.customers.churned;
  }

  private addTemporalDynamics(metrics: BusinessMetrics, timeIndex: number): void {
    // Add time-based variations
    const dayOfWeek = timeIndex % 7;
    const dayOfMonth = timeIndex % 30;
    
    // Weekly pattern (lower on weekends)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      metrics.marketing.websiteTraffic *= 0.7;
      metrics.sales.closedWon = Math.floor(metrics.sales.closedWon * 0.5);
    }
    
    // Monthly pattern (higher at month end)
    if (dayOfMonth > 25) {
      metrics.sales.closedWon = Math.floor(metrics.sales.closedWon * 1.5);
      metrics.revenue.mrr *= 1.1;
    }
  }
}

// Type definitions

interface WhatIfResult {
  baseCase: BusinessMetrics;
  scenarios: BusinessMetrics[];
  impacts: Map<string, Impact>;
  optimal: BusinessMetrics;
  confidence: number;
}

interface Impact {
  metric: string;
  baseValue: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  percentiles: {
    p10: number;
    p25: number;
    p75: number;
    p90: number;
  };
}

interface Anomaly {
  metric: string;
  value: number;
  expected: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high';
  type: string;
}

interface AnomalyReport {
  timestamp: Date;
  anomalies: Anomaly[];
  overallHealth: number;
}

interface MetricTemplate {
  name: string;
  count: number;
  baseMRR?: number;
  baseARPU?: number;
  baseLTV?: number;
  baseCAC?: number;
  patterns: MetricPattern[];
}

interface MetricPattern {
  type: 'growth' | 'churn-spike' | 'seasonal' | 'trend';
  rate?: number;
  magnitude?: number;
  amplitude?: number;
  phase?: number;
}