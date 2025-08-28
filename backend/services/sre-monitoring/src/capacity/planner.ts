import { EventEmitter } from 'events';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface ResourceMetrics {
  timestamp: Date;
  cpu: {
    usage: number; // percentage
    limit: number;
    request: number;
  };
  memory: {
    usage: number; // bytes
    limit: number;
    request: number;
  };
  disk: {
    usage: number; // bytes
    available: number;
    total: number;
  };
  network: {
    ingressRate: number; // bytes/sec
    egressRate: number; // bytes/sec
    connections: number;
  };
  gpu?: {
    usage: number; // percentage
    memory: number; // bytes
    temperature: number; // celsius
  };
}

export interface ServiceCapacity {
  service: string;
  currentReplicas: number;
  minReplicas: number;
  maxReplicas: number;
  targetCPU: number;
  targetMemory: number;
  currentLoad: {
    requestsPerSecond: number;
    averageLatency: number;
    errorRate: number;
  };
  resourceUsage: ResourceMetrics;
  recommendations: ScalingRecommendation[];
}

export interface ScalingRecommendation {
  type: 'scale-up' | 'scale-down' | 'scale-out' | 'scale-in' | 'optimize';
  service: string;
  reason: string;
  currentValue: number;
  recommendedValue: number;
  impact: 'cost-savings' | 'performance' | 'reliability';
  estimatedCostChange: number; // USD per month
  confidence: number; // 0-1
  priority: 'urgent' | 'high' | 'medium' | 'low';
}

export interface CapacityForecast {
  service: string;
  metric: string;
  currentValue: number;
  forecasts: Array<{
    timestamp: Date;
    value: number;
    confidenceLower: number;
    confidenceUpper: number;
  }>;
  breachDate?: Date; // When capacity will be exceeded
  recommendation: string;
}

export interface CostAnalysis {
  currentMonthlyCost: number;
  projectedMonthlyCost: number;
  breakdown: {
    compute: number;
    storage: number;
    network: number;
    gpu: number;
    other: number;
  };
  optimizationOpportunities: Array<{
    description: string;
    potentialSavings: number;
    effort: 'low' | 'medium' | 'high';
  }>;
}

/**
 * Capacity Planning System for Fine Print AI
 * Handles resource forecasting, auto-scaling, and cost optimization
 */
export class CapacityPlanner extends EventEmitter {
  private serviceCapacities: Map<string, ServiceCapacity>;
  private historicalMetrics: Map<string, ResourceMetrics[]>;
  private forecasts: Map<string, CapacityForecast>;
  private costAnalysis?: CostAnalysis;
  private analysisInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.serviceCapacities = new Map();
    this.historicalMetrics = new Map();
    this.forecasts = new Map();
    
    this.initializeServiceCapacities();
  }

  private initializeServiceCapacities(): void {
    // Initialize capacity configurations for each service
    const services = [
      {
        service: 'api-gateway',
        minReplicas: 2,
        maxReplicas: 10,
        targetCPU: 0.7,
        targetMemory: 0.75,
      },
      {
        service: 'model-management',
        minReplicas: 2,
        maxReplicas: 8,
        targetCPU: 0.6,
        targetMemory: 0.7,
      },
      {
        service: 'ab-testing',
        minReplicas: 1,
        maxReplicas: 5,
        targetCPU: 0.7,
        targetMemory: 0.8,
      },
      {
        service: 'learning-pipeline',
        minReplicas: 3,
        maxReplicas: 20,
        targetCPU: 0.8,
        targetMemory: 0.85,
      },
    ];

    services.forEach(svc => {
      this.serviceCapacities.set(svc.service, {
        service: svc.service,
        currentReplicas: svc.minReplicas,
        minReplicas: svc.minReplicas,
        maxReplicas: svc.maxReplicas,
        targetCPU: svc.targetCPU,
        targetMemory: svc.targetMemory,
        currentLoad: {
          requestsPerSecond: 0,
          averageLatency: 0,
          errorRate: 0,
        },
        resourceUsage: this.getEmptyResourceMetrics(),
        recommendations: [],
      });
    });
  }

  private getEmptyResourceMetrics(): ResourceMetrics {
    return {
      timestamp: new Date(),
      cpu: { usage: 0, limit: 1000, request: 500 }, // millicores
      memory: { usage: 0, limit: 2147483648, request: 1073741824 }, // 2Gi limit, 1Gi request
      disk: { usage: 0, available: 10737418240, total: 10737418240 }, // 10Gi
      network: { ingressRate: 0, egressRate: 0, connections: 0 },
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Capacity Planner');
    
    // Start analysis interval
    this.analysisInterval = setInterval(() => {
      this.analyzeUsage();
    }, config.capacity.forecastWindow / 100); // Analyze frequently
    
    // Initial analysis
    await this.analyzeUsage();
    
    this.emit('initialized');
  }

  async analyzeUsage(): Promise<void> {
    // Collect current metrics
    await this.collectMetrics();
    
    // Generate forecasts
    await this.generateForecasts();
    
    // Analyze scaling needs
    await this.analyzeScalingNeeds();
    
    // Perform cost analysis
    await this.analyzeCosts();
    
    // Check for capacity breaches
    this.checkCapacityBreaches();
  }

  private async collectMetrics(): Promise<void> {
    for (const [service, capacity] of this.serviceCapacities.entries()) {
      // In production, fetch from Prometheus/Kubernetes API
      // For now, simulate metrics
      const metrics: ResourceMetrics = {
        timestamp: new Date(),
        cpu: {
          usage: 0.3 + Math.random() * 0.5, // 30-80%
          limit: 1000,
          request: 500,
        },
        memory: {
          usage: (0.4 + Math.random() * 0.4) * 2147483648, // 40-80% of 2Gi
          limit: 2147483648,
          request: 1073741824,
        },
        disk: {
          usage: (0.2 + Math.random() * 0.6) * 10737418240, // 20-80% of 10Gi
          available: 10737418240 * 0.5,
          total: 10737418240,
        },
        network: {
          ingressRate: 10000 + Math.random() * 90000, // 10KB/s - 100KB/s
          egressRate: 5000 + Math.random() * 45000, // 5KB/s - 50KB/s
          connections: Math.floor(10 + Math.random() * 90),
        },
      };

      // Add GPU metrics for ML services
      if (service === 'model-management' || service === 'learning-pipeline') {
        metrics.gpu = {
          usage: 0.4 + Math.random() * 0.4, // 40-80%
          memory: (0.5 + Math.random() * 0.3) * 16106127360, // 50-80% of 15Gi
          temperature: 60 + Math.random() * 20, // 60-80°C
        };
      }

      capacity.resourceUsage = metrics;

      // Store historical metrics
      if (!this.historicalMetrics.has(service)) {
        this.historicalMetrics.set(service, []);
      }
      const history = this.historicalMetrics.get(service)!;
      history.push(metrics);
      
      // Keep only last 7 days of metrics (assuming 1-minute intervals)
      if (history.length > 10080) {
        history.shift();
      }

      // Update current load
      capacity.currentLoad = {
        requestsPerSecond: 10 + Math.random() * 90,
        averageLatency: 20 + Math.random() * 180,
        errorRate: Math.random() * 0.02,
      };
    }
  }

  private async generateForecasts(): Promise<void> {
    for (const [service, capacity] of this.serviceCapacities.entries()) {
      const history = this.historicalMetrics.get(service) || [];
      
      if (history.length < 100) {
        continue; // Not enough data for forecasting
      }

      // Forecast CPU usage
      const cpuForecast = this.forecastMetric(
        service,
        'cpu',
        history.map(h => h.cpu.usage)
      );
      this.forecasts.set(`${service}-cpu`, cpuForecast);

      // Forecast memory usage
      const memoryForecast = this.forecastMetric(
        service,
        'memory',
        history.map(h => h.memory.usage / h.memory.limit)
      );
      this.forecasts.set(`${service}-memory`, memoryForecast);

      // Forecast disk usage
      const diskForecast = this.forecastMetric(
        service,
        'disk',
        history.map(h => h.disk.usage / h.disk.total)
      );
      this.forecasts.set(`${service}-disk`, diskForecast);

      // Check for breach predictions
      this.checkForecastBreaches(cpuForecast, 'CPU', config.capacity.scalingThresholds.cpu);
      this.checkForecastBreaches(memoryForecast, 'Memory', config.capacity.scalingThresholds.memory);
      this.checkForecastBreaches(diskForecast, 'Disk', config.capacity.scalingThresholds.disk);
    }
  }

  private forecastMetric(
    service: string,
    metric: string,
    values: number[]
  ): CapacityForecast {
    // Simple linear regression for forecasting
    // In production, use more sophisticated time series forecasting
    const n = values.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    
    // Calculate linear regression
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
    const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Generate forecast points
    const forecastPoints = 24 * 7; // 7 days ahead
    const forecasts = [];
    
    for (let i = 0; i < forecastPoints; i++) {
      const x = n + i;
      const value = slope * x + intercept;
      const confidence = 0.1 * Math.sqrt(i); // Confidence decreases with time
      
      forecasts.push({
        timestamp: new Date(Date.now() + i * 60 * 60 * 1000), // Hourly points
        value: Math.max(0, Math.min(1, value)), // Clamp to [0, 1]
        confidenceLower: Math.max(0, value - confidence),
        confidenceUpper: Math.min(1, value + confidence),
      });
    }
    
    // Find breach date if any
    let breachDate: Date | undefined;
    const threshold = config.capacity.scalingThresholds[metric as keyof typeof config.capacity.scalingThresholds] || 0.8;
    
    for (const forecast of forecasts) {
      if (forecast.value > threshold) {
        breachDate = forecast.timestamp;
        break;
      }
    }
    
    return {
      service,
      metric,
      currentValue: values[values.length - 1] || 0,
      forecasts,
      breachDate,
      recommendation: this.generateForecastRecommendation(service, metric, breachDate),
    };
  }

  private generateForecastRecommendation(
    service: string,
    metric: string,
    breachDate?: Date
  ): string {
    if (!breachDate) {
      return `${metric} usage is stable for ${service}`;
    }
    
    const daysUntilBreach = Math.ceil((breachDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    
    if (daysUntilBreach < 3) {
      return `URGENT: ${metric} will exceed threshold in ${daysUntilBreach} days. Immediate scaling required.`;
    } else if (daysUntilBreach < 7) {
      return `WARNING: ${metric} will exceed threshold in ${daysUntilBreach} days. Plan scaling soon.`;
    } else {
      return `INFO: ${metric} projected to exceed threshold in ${daysUntilBreach} days. Monitor closely.`;
    }
  }

  private checkForecastBreaches(
    forecast: CapacityForecast,
    metricName: string,
    threshold: number
  ): void {
    if (forecast.breachDate) {
      const daysUntilBreach = Math.ceil(
        (forecast.breachDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      );
      
      if (daysUntilBreach < 7) {
        this.emit('capacity-breach-predicted', {
          service: forecast.service,
          metric: metricName,
          breachDate: forecast.breachDate,
          daysUntilBreach,
          currentValue: forecast.currentValue,
          threshold,
        });
      }
    }
  }

  private async analyzeScalingNeeds(): Promise<void> {
    for (const [service, capacity] of this.serviceCapacities.entries()) {
      const recommendations: ScalingRecommendation[] = [];
      
      // Check CPU scaling
      if (capacity.resourceUsage.cpu.usage > capacity.targetCPU) {
        const recommendedReplicas = Math.min(
          capacity.maxReplicas,
          Math.ceil(capacity.currentReplicas * (capacity.resourceUsage.cpu.usage / capacity.targetCPU))
        );
        
        if (recommendedReplicas > capacity.currentReplicas) {
          recommendations.push({
            type: 'scale-out',
            service,
            reason: `CPU usage ${(capacity.resourceUsage.cpu.usage * 100).toFixed(1)}% exceeds target ${(capacity.targetCPU * 100).toFixed(0)}%`,
            currentValue: capacity.currentReplicas,
            recommendedValue: recommendedReplicas,
            impact: 'performance',
            estimatedCostChange: this.estimateCostChange(service, recommendedReplicas - capacity.currentReplicas),
            confidence: 0.85,
            priority: capacity.resourceUsage.cpu.usage > 0.9 ? 'urgent' : 'high',
          });
        }
      }
      
      // Check memory scaling
      const memoryUsageRatio = capacity.resourceUsage.memory.usage / capacity.resourceUsage.memory.limit;
      if (memoryUsageRatio > capacity.targetMemory) {
        recommendations.push({
          type: 'scale-up',
          service,
          reason: `Memory usage ${(memoryUsageRatio * 100).toFixed(1)}% exceeds target ${(capacity.targetMemory * 100).toFixed(0)}%`,
          currentValue: capacity.resourceUsage.memory.limit,
          recommendedValue: capacity.resourceUsage.memory.limit * 1.5,
          impact: 'reliability',
          estimatedCostChange: this.estimateCostChange(service, 0, 0.5),
          confidence: 0.8,
          priority: memoryUsageRatio > 0.9 ? 'urgent' : 'high',
        });
      }
      
      // Check for over-provisioning (scale down)
      if (capacity.currentReplicas > capacity.minReplicas) {
        if (capacity.resourceUsage.cpu.usage < 0.3 && memoryUsageRatio < 0.3) {
          const recommendedReplicas = Math.max(
            capacity.minReplicas,
            capacity.currentReplicas - 1
          );
          
          recommendations.push({
            type: 'scale-down',
            service,
            reason: 'Low resource utilization detected',
            currentValue: capacity.currentReplicas,
            recommendedValue: recommendedReplicas,
            impact: 'cost-savings',
            estimatedCostChange: this.estimateCostChange(service, recommendedReplicas - capacity.currentReplicas),
            confidence: 0.7,
            priority: 'low',
          });
        }
      }
      
      // Check for optimization opportunities
      if (capacity.currentLoad.errorRate > 0.01) {
        recommendations.push({
          type: 'optimize',
          service,
          reason: `High error rate ${(capacity.currentLoad.errorRate * 100).toFixed(2)}% detected`,
          currentValue: capacity.currentLoad.errorRate,
          recommendedValue: 0.001,
          impact: 'reliability',
          estimatedCostChange: 0,
          confidence: 0.9,
          priority: 'high',
        });
      }
      
      capacity.recommendations = recommendations;
      
      // Auto-scale if enabled and confident
      if (config.capacity.autoScaling.enabled) {
        for (const rec of recommendations) {
          if (rec.priority === 'urgent' && rec.confidence > 0.8) {
            await this.executeScaling(rec);
          }
        }
      }
    }
  }

  private estimateCostChange(
    service: string,
    replicaChange: number,
    resourceMultiplier: number = 1
  ): number {
    // Simplified cost estimation
    // In production, use actual cloud provider pricing
    const baseCostPerReplica = {
      'api-gateway': 50, // USD per month
      'model-management': 200, // More expensive due to GPU
      'ab-testing': 30,
      'learning-pipeline': 300, // Most expensive due to GPU and compute
    };
    
    const base = baseCostPerReplica[service as keyof typeof baseCostPerReplica] || 50;
    return base * replicaChange * resourceMultiplier;
  }

  private async executeScaling(recommendation: ScalingRecommendation): Promise<void> {
    logger.info(`Executing auto-scaling`, { recommendation });
    
    const capacity = this.serviceCapacities.get(recommendation.service);
    if (!capacity) return;
    
    switch (recommendation.type) {
      case 'scale-out':
      case 'scale-in':
        capacity.currentReplicas = recommendation.recommendedValue;
        break;
      case 'scale-up':
        if (recommendation.reason.includes('Memory')) {
          capacity.resourceUsage.memory.limit = recommendation.recommendedValue;
        }
        break;
    }
    
    this.emit('scaling-executed', recommendation);
    
    // In production, execute actual Kubernetes scaling
    // kubectl scale deployment <service> --replicas=<count>
  }

  private async analyzeCosts(): Promise<void> {
    let totalCompute = 0;
    let totalStorage = 0;
    let totalNetwork = 0;
    let totalGPU = 0;
    
    for (const [service, capacity] of this.serviceCapacities.entries()) {
      const baseCost = this.estimateCostChange(service, 0);
      totalCompute += baseCost * capacity.currentReplicas;
      
      // Storage costs
      totalStorage += (capacity.resourceUsage.disk.usage / 1073741824) * 0.1; // $0.1 per GB
      
      // Network costs
      const networkGB = (capacity.resourceUsage.network.egressRate * 86400 * 30) / 1073741824; // Monthly GB
      totalNetwork += networkGB * 0.09; // $0.09 per GB egress
      
      // GPU costs
      if (capacity.resourceUsage.gpu) {
        totalGPU += 500 * capacity.currentReplicas; // $500 per GPU instance
      }
    }
    
    const currentMonthlyCost = totalCompute + totalStorage + totalNetwork + totalGPU;
    
    // Calculate projected costs based on forecasts
    let projectedIncrease = 1.0;
    for (const forecast of this.forecasts.values()) {
      if (forecast.breachDate) {
        projectedIncrease = Math.max(projectedIncrease, 1.2); // 20% increase if breach predicted
      }
    }
    
    this.costAnalysis = {
      currentMonthlyCost,
      projectedMonthlyCost: currentMonthlyCost * projectedIncrease,
      breakdown: {
        compute: totalCompute,
        storage: totalStorage,
        network: totalNetwork,
        gpu: totalGPU,
        other: currentMonthlyCost * 0.1, // 10% for other costs
      },
      optimizationOpportunities: [
        {
          description: 'Use spot instances for non-critical workloads',
          potentialSavings: totalCompute * 0.3,
          effort: 'medium',
        },
        {
          description: 'Implement aggressive auto-scaling policies',
          potentialSavings: totalCompute * 0.2,
          effort: 'low',
        },
        {
          description: 'Optimize model sizes and batch inference',
          potentialSavings: totalGPU * 0.25,
          effort: 'high',
        },
        {
          description: 'Implement data lifecycle management',
          potentialSavings: totalStorage * 0.4,
          effort: 'medium',
        },
      ],
    };
  }

  private checkCapacityBreaches(): void {
    for (const [service, capacity] of this.serviceCapacities.entries()) {
      // Check CPU breach
      if (capacity.resourceUsage.cpu.usage > config.capacity.scalingThresholds.cpu) {
        this.emit('capacity-breach', {
          service,
          metric: 'cpu',
          current: capacity.resourceUsage.cpu.usage,
          threshold: config.capacity.scalingThresholds.cpu,
        });
      }
      
      // Check memory breach
      const memoryRatio = capacity.resourceUsage.memory.usage / capacity.resourceUsage.memory.limit;
      if (memoryRatio > config.capacity.scalingThresholds.memory) {
        this.emit('capacity-breach', {
          service,
          metric: 'memory',
          current: memoryRatio,
          threshold: config.capacity.scalingThresholds.memory,
        });
      }
      
      // Check disk breach
      const diskRatio = capacity.resourceUsage.disk.usage / capacity.resourceUsage.disk.total;
      if (diskRatio > config.capacity.scalingThresholds.disk) {
        this.emit('capacity-breach', {
          service,
          metric: 'disk',
          current: diskRatio,
          threshold: config.capacity.scalingThresholds.disk,
        });
      }
    }
  }

  // Public methods
  getServiceCapacity(service?: string): ServiceCapacity | ServiceCapacity[] {
    if (service) {
      return this.serviceCapacities.get(service)!;
    }
    return Array.from(this.serviceCapacities.values());
  }

  getForecasts(service?: string): CapacityForecast[] {
    if (service) {
      return Array.from(this.forecasts.values())
        .filter(f => f.service === service);
    }
    return Array.from(this.forecasts.values());
  }

  getCostAnalysis(): CostAnalysis | undefined {
    return this.costAnalysis;
  }

  getRecommendations(): ScalingRecommendation[] {
    const allRecommendations: ScalingRecommendation[] = [];
    
    for (const capacity of this.serviceCapacities.values()) {
      allRecommendations.push(...capacity.recommendations);
    }
    
    // Sort by priority
    return allRecommendations.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Capacity Planner');
    
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
    }
    
    this.removeAllListeners();
  }
}