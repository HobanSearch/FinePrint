import { EventEmitter } from 'events';
import { config } from '../config';
import { logger } from '../utils/logger';
import { MetricsCollector } from '../metrics/collector';

export interface SLO {
  service: string;
  type: 'availability' | 'latency' | 'error_rate' | 'throughput';
  target: number;
  window: number; // in milliseconds
  measurement: string; // Prometheus query
}

export interface SLI {
  name: string;
  query: string;
  unit: string;
  aggregation: 'avg' | 'sum' | 'max' | 'min' | 'p50' | 'p95' | 'p99';
}

export interface ErrorBudget {
  service: string;
  total: number;
  consumed: number;
  remaining: number;
  burnRate: Map<string, number>; // window -> rate
  lastUpdated: Date;
}

export interface SLOReport {
  service: string;
  period: string;
  slos: {
    type: string;
    target: number;
    actual: number;
    compliant: boolean;
  }[];
  errorBudget: ErrorBudget;
  incidents: number;
  recommendations: string[];
}

/**
 * SLO Manager for Fine Print AI
 * Manages Service Level Objectives, Indicators, and Error Budgets
 */
export class SLOManager extends EventEmitter {
  private slos: Map<string, SLO[]>;
  private slis: Map<string, SLI[]>;
  private errorBudgets: Map<string, ErrorBudget>;
  private complianceHistory: Map<string, number[]>;
  private metricsCollector?: MetricsCollector;

  constructor() {
    super();
    this.slos = new Map();
    this.slis = new Map();
    this.errorBudgets = new Map();
    this.complianceHistory = new Map();
    
    this.initializeDefaultSLOs();
    this.initializeDefaultSLIs();
  }

  private initializeDefaultSLOs(): void {
    // Model Management Service SLOs
    this.slos.set('model-management', [
      {
        service: 'model-management',
        type: 'availability',
        target: 0.999, // 99.9%
        window: 30 * 24 * 60 * 60 * 1000, // 30 days
        measurement: '(1 - (sum(rate(http_errors_total{job="model-management"}[5m])) / sum(rate(http_requests_total{job="model-management"}[5m]))))',
      },
      {
        service: 'model-management',
        type: 'latency',
        target: 100, // 100ms P95
        window: 30 * 24 * 60 * 60 * 1000,
        measurement: 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="model-management"}[5m])) by (le)) * 1000',
      },
      {
        service: 'model-management',
        type: 'error_rate',
        target: 0.001, // 0.1%
        window: 30 * 24 * 60 * 60 * 1000,
        measurement: 'sum(rate(http_errors_total{job="model-management"}[5m])) / sum(rate(http_requests_total{job="model-management"}[5m]))',
      },
    ]);

    // A/B Testing Service SLOs
    this.slos.set('ab-testing', [
      {
        service: 'ab-testing',
        type: 'availability',
        target: 0.995, // 99.5%
        window: 30 * 24 * 60 * 60 * 1000,
        measurement: '(1 - (sum(rate(http_errors_total{job="ab-testing"}[5m])) / sum(rate(http_requests_total{job="ab-testing"}[5m]))))',
      },
      {
        service: 'ab-testing',
        type: 'latency',
        target: 200, // 200ms P95
        window: 30 * 24 * 60 * 60 * 1000,
        measurement: 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="ab-testing"}[5m])) by (le)) * 1000',
      },
    ]);

    // Learning Pipeline Service SLOs
    this.slos.set('learning-pipeline', [
      {
        service: 'learning-pipeline',
        type: 'availability',
        target: 0.99, // 99%
        window: 30 * 24 * 60 * 60 * 1000,
        measurement: '(1 - (sum(rate(training_job_failures_total[5m])) / sum(rate(training_job_total[5m]))))',
      },
      {
        service: 'learning-pipeline',
        type: 'throughput',
        target: 10, // 10 jobs per hour minimum
        window: 60 * 60 * 1000, // 1 hour
        measurement: 'sum(rate(training_job_completed_total[1h])) * 3600',
      },
    ]);

    // API Gateway SLOs
    this.slos.set('api-gateway', [
      {
        service: 'api-gateway',
        type: 'availability',
        target: 0.999, // 99.9%
        window: 30 * 24 * 60 * 60 * 1000,
        measurement: '(1 - (sum(rate(http_errors_total{job="api-gateway"}[5m])) / sum(rate(http_requests_total{job="api-gateway"}[5m]))))',
      },
      {
        service: 'api-gateway',
        type: 'latency',
        target: 50, // 50ms P95
        window: 30 * 24 * 60 * 60 * 1000,
        measurement: 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="api-gateway"}[5m])) by (le)) * 1000',
      },
    ]);
  }

  private initializeDefaultSLIs(): void {
    // Core SLIs
    const coreSLIs: SLI[] = [
      {
        name: 'request_rate',
        query: 'sum(rate(http_requests_total[5m]))',
        unit: 'requests/sec',
        aggregation: 'sum',
      },
      {
        name: 'error_rate',
        query: 'sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m]))',
        unit: 'percentage',
        aggregation: 'avg',
      },
      {
        name: 'latency_p50',
        query: 'histogram_quantile(0.5, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))',
        unit: 'seconds',
        aggregation: 'p50',
      },
      {
        name: 'latency_p95',
        query: 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))',
        unit: 'seconds',
        aggregation: 'p95',
      },
      {
        name: 'latency_p99',
        query: 'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))',
        unit: 'seconds',
        aggregation: 'p99',
      },
    ];

    // AI-specific SLIs
    const aiSLIs: SLI[] = [
      {
        name: 'model_inference_rate',
        query: 'sum(rate(model_inference_latency_seconds_count[5m]))',
        unit: 'inferences/sec',
        aggregation: 'sum',
      },
      {
        name: 'model_error_rate',
        query: 'sum(rate(model_inference_errors_total[5m])) / sum(rate(model_inference_latency_seconds_count[5m]))',
        unit: 'percentage',
        aggregation: 'avg',
      },
      {
        name: 'model_latency_p95',
        query: 'histogram_quantile(0.95, sum(rate(model_inference_latency_seconds_bucket[5m])) by (le))',
        unit: 'seconds',
        aggregation: 'p95',
      },
      {
        name: 'training_success_rate',
        query: '(1 - (sum(rate(training_job_failures_total[1h])) / sum(rate(training_job_total[1h]))))',
        unit: 'percentage',
        aggregation: 'avg',
      },
    ];

    this.slis.set('core', coreSLIs);
    this.slis.set('ai', aiSLIs);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing SLO Manager');
    
    // Initialize error budgets
    this.initializeErrorBudgets();
    
    // Start compliance monitoring
    this.startComplianceMonitoring();
    
    this.emit('initialized');
  }

  private initializeErrorBudgets(): void {
    for (const [service, slos] of this.slos.entries()) {
      const availabilitySLO = slos.find(slo => slo.type === 'availability');
      if (availabilitySLO) {
        const totalBudget = (1 - availabilitySLO.target) * 100; // Convert to percentage
        this.errorBudgets.set(service, {
          service,
          total: totalBudget,
          consumed: 0,
          remaining: totalBudget,
          burnRate: new Map([
            ['1h', 0],
            ['6h', 0],
            ['1d', 0],
            ['3d', 0],
            ['7d', 0],
            ['30d', 0],
          ]),
          lastUpdated: new Date(),
        });
      }
    }
  }

  private startComplianceMonitoring(): void {
    // Check compliance every minute
    setInterval(() => {
      this.checkCompliance();
    }, 60000);

    // Calculate burn rates every 5 minutes
    setInterval(() => {
      this.calculateBurnRates();
    }, 300000);
  }

  async checkCompliance(): Promise<void> {
    for (const [service, slos] of this.slos.entries()) {
      for (const slo of slos) {
        const compliance = await this.calculateCompliance(slo);
        
        // Update metrics
        if (this.metricsCollector) {
          this.metricsCollector.updateSLOCompliance(
            service,
            slo.type,
            compliance * 100
          );
        }

        // Check if SLO is violated
        if (compliance < slo.target) {
          this.emit('slo-violation', {
            service,
            type: slo.type,
            target: slo.target,
            actual: compliance,
            severity: this.getSeverity(slo.target, compliance),
          });
        }

        // Update compliance history
        if (!this.complianceHistory.has(`${service}-${slo.type}`)) {
          this.complianceHistory.set(`${service}-${slo.type}`, []);
        }
        const history = this.complianceHistory.get(`${service}-${slo.type}`)!;
        history.push(compliance);
        if (history.length > 1440) { // Keep 24 hours of minute data
          history.shift();
        }
      }
    }
  }

  private async calculateCompliance(slo: SLO): Promise<number> {
    // In production, this would query Prometheus
    // For now, return simulated values
    const baseCompliance = slo.target;
    const variance = (Math.random() - 0.5) * 0.002; // +/- 0.2%
    return Math.max(0, Math.min(1, baseCompliance + variance));
  }

  private async calculateBurnRates(): Promise<void> {
    for (const [service, budget] of this.errorBudgets.entries()) {
      const windows = ['1h', '6h', '1d', '3d', '7d', '30d'];
      
      for (const window of windows) {
        const burnRate = await this.calculateBurnRateForWindow(service, window);
        budget.burnRate.set(window, burnRate);
        
        // Update metrics
        if (this.metricsCollector) {
          this.metricsCollector.updateBurnRate(service, window, burnRate);
        }

        // Check for fast burn (14.4x for 1h window)
        if (window === '1h' && burnRate > 14.4) {
          this.emit('fast-burn-detected', {
            service,
            burnRate,
            window,
            severity: 'critical',
          });
        }

        // Check for slow burn (1x for 30d window)
        if (window === '30d' && burnRate > 1) {
          this.emit('slow-burn-detected', {
            service,
            burnRate,
            window,
            severity: 'warning',
          });
        }
      }

      // Update consumed and remaining budget
      const consumed = await this.calculateConsumedBudget(service);
      budget.consumed = consumed;
      budget.remaining = budget.total - consumed;
      budget.lastUpdated = new Date();

      // Update metrics
      if (this.metricsCollector) {
        this.metricsCollector.updateErrorBudget(
          service,
          '30d',
          budget.remaining
        );
      }

      // Alert if budget is low
      if (budget.remaining < 10) {
        this.emit('error-budget-low', {
          service,
          remaining: budget.remaining,
          severity: budget.remaining < 5 ? 'critical' : 'warning',
        });
      }
    }
  }

  private async calculateBurnRateForWindow(service: string, window: string): Promise<number> {
    // In production, this would calculate actual burn rate from metrics
    // For now, return simulated values
    const baseRates: Record<string, number> = {
      '1h': 0.5 + Math.random() * 2,
      '6h': 0.3 + Math.random() * 1.5,
      '1d': 0.2 + Math.random() * 1,
      '3d': 0.15 + Math.random() * 0.8,
      '7d': 0.1 + Math.random() * 0.5,
      '30d': 0.05 + Math.random() * 0.3,
    };
    
    return baseRates[window] || 0;
  }

  private async calculateConsumedBudget(service: string): Promise<number> {
    // In production, calculate from actual error metrics
    // For now, return simulated value
    return Math.random() * 30; // 0-30% consumed
  }

  private getSeverity(target: number, actual: number): 'critical' | 'warning' | 'info' {
    const difference = target - actual;
    if (difference > 0.01) return 'critical'; // More than 1% below target
    if (difference > 0.005) return 'warning'; // More than 0.5% below target
    return 'info';
  }

  async generateReport(service: string, period: string = '30d'): Promise<SLOReport> {
    const slos = this.slos.get(service) || [];
    const budget = this.errorBudgets.get(service);
    
    const sloResults = await Promise.all(slos.map(async slo => {
      const actual = await this.calculateCompliance(slo);
      return {
        type: slo.type,
        target: slo.target * 100,
        actual: actual * 100,
        compliant: actual >= slo.target,
      };
    }));

    const recommendations = this.generateRecommendations(service, sloResults, budget);

    return {
      service,
      period,
      slos: sloResults,
      errorBudget: budget || {
        service,
        total: 0,
        consumed: 0,
        remaining: 0,
        burnRate: new Map(),
        lastUpdated: new Date(),
      },
      incidents: Math.floor(Math.random() * 5), // Simulated incident count
      recommendations,
    };
  }

  private generateRecommendations(
    service: string,
    sloResults: any[],
    budget?: ErrorBudget
  ): string[] {
    const recommendations: string[] = [];

    // Check SLO compliance
    const failingSLOs = sloResults.filter(slo => !slo.compliant);
    if (failingSLOs.length > 0) {
      failingSLOs.forEach(slo => {
        if (slo.type === 'latency') {
          recommendations.push(`Optimize ${service} performance: P95 latency exceeds target`);
          recommendations.push('Consider caching frequently accessed data');
          recommendations.push('Review database query performance');
        }
        if (slo.type === 'availability') {
          recommendations.push(`Improve ${service} reliability: availability below target`);
          recommendations.push('Implement circuit breakers for dependent services');
          recommendations.push('Add retry logic with exponential backoff');
        }
        if (slo.type === 'error_rate') {
          recommendations.push(`Reduce ${service} errors: error rate exceeds threshold`);
          recommendations.push('Review error logs for common patterns');
          recommendations.push('Improve input validation and error handling');
        }
      });
    }

    // Check error budget
    if (budget) {
      if (budget.remaining < 10) {
        recommendations.push('URGENT: Error budget critically low - freeze non-critical deployments');
        recommendations.push('Focus on reliability improvements only');
      } else if (budget.remaining < 25) {
        recommendations.push('Warning: Error budget running low - prioritize stability');
        recommendations.push('Review recent changes for potential issues');
      }

      // Check burn rates
      const fastBurn = budget.burnRate.get('1h') || 0;
      if (fastBurn > 10) {
        recommendations.push('Critical: Fast error budget burn detected - investigate immediately');
        recommendations.push('Check for ongoing incidents or degraded dependencies');
      }
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('All SLOs are being met - consider tightening targets');
      recommendations.push('Good time for feature development and experimentation');
    }

    return recommendations;
  }

  async getSLOStatus(service?: string): Promise<Map<string, any>> {
    const status = new Map();
    
    const services = service ? [service] : Array.from(this.slos.keys());
    
    for (const svc of services) {
      const slos = this.slos.get(svc) || [];
      const budget = this.errorBudgets.get(svc);
      
      const sloStatuses = await Promise.all(slos.map(async slo => {
        const compliance = await this.calculateCompliance(slo);
        return {
          type: slo.type,
          target: slo.target,
          current: compliance,
          compliant: compliance >= slo.target,
        };
      }));

      status.set(svc, {
        slos: sloStatuses,
        errorBudget: budget,
        overallCompliant: sloStatuses.every(s => s.compliant),
      });
    }

    return status;
  }

  setMetricsCollector(collector: MetricsCollector): void {
    this.metricsCollector = collector;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down SLO Manager');
    this.removeAllListeners();
  }
}