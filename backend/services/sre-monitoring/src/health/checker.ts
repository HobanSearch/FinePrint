import { EventEmitter } from 'events';
import { config } from '../config';
import { healthLogger as logger } from '../utils/logger';

export interface HealthCheck {
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'HEAD';
  expectedStatus: number;
  timeout: number;
  retries: number;
  interval: number;
  lastCheck?: Date;
  lastStatus?: 'healthy' | 'unhealthy' | 'degraded';
  lastResponseTime?: number;
  failureCount: number;
  successCount: number;
  availability: number;
}

export interface HealthProbe {
  type: 'liveness' | 'readiness' | 'startup';
  path: string;
  initialDelaySeconds: number;
  periodSeconds: number;
  timeoutSeconds: number;
  successThreshold: number;
  failureThreshold: number;
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  checks: HealthCheckResult[];
  dependencies: DependencyHealth[];
  lastUpdated: Date;
  uptime: number;
  metrics: {
    avgResponseTime: number;
    errorRate: number;
    availability: number;
  };
}

export interface HealthCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  responseTime: number;
  message?: string;
  timestamp: Date;
}

export interface DependencyHealth {
  name: string;
  type: 'database' | 'cache' | 'api' | 'queue' | 'storage';
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency: number;
  lastChecked: Date;
}

/**
 * Health Checker for Fine Print AI services
 * Implements comprehensive health monitoring and probes
 */
export class HealthChecker extends EventEmitter {
  private healthChecks: Map<string, HealthCheck>;
  private serviceHealth: Map<string, ServiceHealth>;
  private probes: Map<string, HealthProbe>;
  private checkInterval?: NodeJS.Timeout;
  private syntheticTests: Map<string, () => Promise<boolean>>;
  private deadManSwitch: Map<string, Date>;

  constructor() {
    super();
    this.healthChecks = new Map();
    this.serviceHealth = new Map();
    this.probes = new Map();
    this.syntheticTests = new Map();
    this.deadManSwitch = new Map();
    
    this.initializeHealthChecks();
    this.initializeProbes();
    this.initializeSyntheticTests();
  }

  private initializeHealthChecks(): void {
    // Initialize health checks from configuration
    config.healthChecks.endpoints.forEach(endpoint => {
      this.healthChecks.set(endpoint.name, {
        ...endpoint,
        timeout: endpoint.timeout || config.healthChecks.timeout,
        retries: config.healthChecks.retries,
        interval: config.healthChecks.interval,
        failureCount: 0,
        successCount: 0,
        availability: 100,
      });
    });

    // Add additional critical service checks
    const criticalServices = [
      {
        name: 'postgres-primary',
        url: 'postgresql://postgres:5432',
        method: 'GET' as const,
        expectedStatus: 200,
      },
      {
        name: 'redis-cache',
        url: 'redis://redis:6379',
        method: 'GET' as const,
        expectedStatus: 200,
      },
      {
        name: 'ollama-cluster',
        url: 'http://ollama:11434/api/tags',
        method: 'GET' as const,
        expectedStatus: 200,
      },
      {
        name: 'qdrant-vector',
        url: 'http://qdrant:6333/collections',
        method: 'GET' as const,
        expectedStatus: 200,
      },
      {
        name: 'elasticsearch',
        url: 'http://elasticsearch:9200/_cluster/health',
        method: 'GET' as const,
        expectedStatus: 200,
      },
    ];

    criticalServices.forEach(service => {
      if (!this.healthChecks.has(service.name)) {
        this.healthChecks.set(service.name, {
          ...service,
          timeout: config.healthChecks.timeout,
          retries: config.healthChecks.retries,
          interval: config.healthChecks.interval,
          failureCount: 0,
          successCount: 0,
          availability: 100,
        });
      }
    });
  }

  private initializeProbes(): void {
    // Liveness probe - checks if service is alive
    this.probes.set('liveness', {
      type: 'liveness',
      path: '/health/live',
      initialDelaySeconds: 10,
      periodSeconds: 10,
      timeoutSeconds: 5,
      successThreshold: 1,
      failureThreshold: 3,
    });

    // Readiness probe - checks if service is ready to accept traffic
    this.probes.set('readiness', {
      type: 'readiness',
      path: '/health/ready',
      initialDelaySeconds: 5,
      periodSeconds: 5,
      timeoutSeconds: 3,
      successThreshold: 1,
      failureThreshold: 3,
    });

    // Startup probe - for slow-starting services
    this.probes.set('startup', {
      type: 'startup',
      path: '/health/startup',
      initialDelaySeconds: 0,
      periodSeconds: 10,
      timeoutSeconds: 10,
      successThreshold: 1,
      failureThreshold: 30,
    });
  }

  private initializeSyntheticTests(): void {
    // End-to-end document analysis test
    this.syntheticTests.set('document-analysis-e2e', async () => {
      try {
        const testDocument = {
          content: 'Test terms of service document',
          type: 'terms_of_service',
        };
        
        const response = await fetch('http://api-gateway:8000/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testDocument),
        });
        
        return response.ok && response.status === 200;
      } catch (error) {
        logger.error('Synthetic test failed: document-analysis-e2e', error);
        return false;
      }
    });

    // Model inference synthetic test
    this.syntheticTests.set('model-inference', async () => {
      try {
        const response = await fetch('http://model-management:8001/api/models/phi-2/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Test inference' }),
        });
        
        const data = await response.json();
        return response.ok && data.prediction !== undefined;
      } catch (error) {
        logger.error('Synthetic test failed: model-inference', error);
        return false;
      }
    });

    // Database connectivity test
    this.syntheticTests.set('database-connectivity', async () => {
      try {
        // In production, use actual database client
        const response = await fetch('http://api-gateway:8000/api/health/db');
        return response.ok;
      } catch (error) {
        logger.error('Synthetic test failed: database-connectivity', error);
        return false;
      }
    });
  }

  async startMonitoring(): Promise<void> {
    logger.info('Starting health monitoring');
    
    // Start periodic health checks
    this.checkInterval = setInterval(() => {
      this.performHealthChecks();
    }, config.healthChecks.interval);
    
    // Run synthetic tests every 5 minutes
    setInterval(() => {
      this.runSyntheticTests();
    }, 5 * 60 * 1000);
    
    // Check dead man's switch every minute
    setInterval(() => {
      this.checkDeadManSwitch();
    }, 60 * 1000);
    
    // Initial health check
    await this.performHealthChecks();
    
    this.emit('monitoring-started');
  }

  async stopMonitoring(): Promise<void> {
    logger.info('Stopping health monitoring');
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    this.emit('monitoring-stopped');
  }

  async performHealthChecks(): Promise<void> {
    const results = new Map<string, HealthCheckResult>();
    
    for (const [name, check] of this.healthChecks.entries()) {
      const result = await this.performSingleCheck(check);
      results.set(name, result);
      
      // Update check statistics
      check.lastCheck = new Date();
      check.lastStatus = result.status === 'pass' ? 'healthy' : 
                        result.status === 'warn' ? 'degraded' : 'unhealthy';
      check.lastResponseTime = result.responseTime;
      
      if (result.status === 'pass') {
        check.successCount++;
        check.failureCount = 0;
      } else {
        check.failureCount++;
        if (check.failureCount >= config.healthChecks.retries) {
          this.emit('health-check-failed', {
            check: name,
            failures: check.failureCount,
            lastError: result.message,
          });
        }
      }
      
      // Calculate availability
      const total = check.successCount + check.failureCount;
      check.availability = total > 0 ? (check.successCount / total) * 100 : 100;
    }
    
    // Update service health
    await this.updateServiceHealth(results);
    
    // Check for degraded services
    this.checkDegradedServices();
  }

  private async performSingleCheck(check: HealthCheck): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | null = null;
    
    while (attempts < check.retries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), check.timeout);
        
        const response = await fetch(check.url, {
          method: check.method,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        const responseTime = Date.now() - startTime;
        
        if (response.status === check.expectedStatus) {
          return {
            name: check.name,
            status: 'pass',
            responseTime,
            timestamp: new Date(),
          };
        } else {
          lastError = new Error(`Unexpected status: ${response.status}`);
        }
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Health check failed for ${check.name}`, { 
          attempt: attempts + 1,
          error: lastError.message 
        });
      }
      
      attempts++;
      if (attempts < check.retries) {
        // Exponential backoff between retries
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
      }
    }
    
    const responseTime = Date.now() - startTime;
    
    return {
      name: check.name,
      status: 'fail',
      responseTime,
      message: lastError?.message || 'Health check failed',
      timestamp: new Date(),
    };
  }

  private async updateServiceHealth(results: Map<string, HealthCheckResult>): Promise<void> {
    // Group results by service
    const serviceGroups = new Map<string, HealthCheckResult[]>();
    
    for (const [name, result] of results.entries()) {
      const service = this.getServiceFromCheckName(name);
      if (!serviceGroups.has(service)) {
        serviceGroups.set(service, []);
      }
      serviceGroups.get(service)!.push(result);
    }
    
    // Update each service's health
    for (const [service, checks] of serviceGroups.entries()) {
      const failedChecks = checks.filter(c => c.status === 'fail').length;
      const warnChecks = checks.filter(c => c.status === 'warn').length;
      
      let status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
      if (failedChecks > 0) {
        status = 'unhealthy';
      } else if (warnChecks > 0) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }
      
      const avgResponseTime = checks.reduce((sum, c) => sum + c.responseTime, 0) / checks.length;
      const errorRate = failedChecks / checks.length;
      const availability = ((checks.length - failedChecks) / checks.length) * 100;
      
      const health: ServiceHealth = {
        service,
        status,
        checks,
        dependencies: await this.checkDependencies(service),
        lastUpdated: new Date(),
        uptime: this.calculateUptime(service),
        metrics: {
          avgResponseTime,
          errorRate,
          availability,
        },
      };
      
      this.serviceHealth.set(service, health);
      
      // Emit events for status changes
      const previousHealth = this.serviceHealth.get(service);
      if (previousHealth && previousHealth.status !== status) {
        this.emit('service-status-changed', {
          service,
          previousStatus: previousHealth.status,
          currentStatus: status,
        });
      }
    }
  }

  private getServiceFromCheckName(checkName: string): string {
    // Map check names to services
    const mapping: Record<string, string> = {
      'api-gateway': 'api-gateway',
      'model-management': 'model-management',
      'ab-testing': 'ab-testing',
      'learning-pipeline': 'learning-pipeline',
      'postgres-primary': 'database',
      'redis-cache': 'cache',
      'ollama-cluster': 'ai-inference',
      'qdrant-vector': 'vector-db',
      'elasticsearch': 'search',
    };
    
    return mapping[checkName] || 'unknown';
  }

  private async checkDependencies(service: string): Promise<DependencyHealth[]> {
    const dependencies: DependencyHealth[] = [];
    
    // Define service dependencies
    const serviceDeps: Record<string, string[]> = {
      'api-gateway': ['database', 'cache', 'model-management'],
      'model-management': ['ai-inference', 'vector-db', 'cache'],
      'ab-testing': ['database', 'cache'],
      'learning-pipeline': ['database', 'ai-inference', 'vector-db'],
    };
    
    const deps = serviceDeps[service] || [];
    
    for (const dep of deps) {
      const depHealth = this.serviceHealth.get(dep);
      dependencies.push({
        name: dep,
        type: this.getDependencyType(dep),
        status: depHealth?.status || 'unknown',
        latency: depHealth?.metrics.avgResponseTime || 0,
        lastChecked: depHealth?.lastUpdated || new Date(),
      });
    }
    
    return dependencies;
  }

  private getDependencyType(dep: string): 'database' | 'cache' | 'api' | 'queue' | 'storage' {
    const typeMap: Record<string, any> = {
      'database': 'database',
      'cache': 'cache',
      'api-gateway': 'api',
      'model-management': 'api',
      'queue': 'queue',
      'storage': 'storage',
    };
    
    return typeMap[dep] || 'api';
  }

  private calculateUptime(service: string): number {
    const check = Array.from(this.healthChecks.values())
      .find(c => this.getServiceFromCheckName(c.name) === service);
    
    return check?.availability || 0;
  }

  private checkDegradedServices(): void {
    for (const [service, health] of this.serviceHealth.entries()) {
      if (health.status === 'degraded' || health.status === 'unhealthy') {
        const degradedDeps = health.dependencies.filter(
          d => d.status === 'degraded' || d.status === 'unhealthy'
        );
        
        if (degradedDeps.length > 0) {
          this.emit('cascade-failure-risk', {
            service,
            degradedDependencies: degradedDeps.map(d => d.name),
            risk: 'high',
          });
        }
      }
    }
  }

  private async runSyntheticTests(): Promise<void> {
    logger.info('Running synthetic tests');
    
    for (const [name, test] of this.syntheticTests.entries()) {
      try {
        const success = await test();
        
        if (!success) {
          this.emit('synthetic-test-failed', {
            test: name,
            timestamp: new Date(),
          });
        } else {
          logger.debug(`Synthetic test passed: ${name}`);
        }
      } catch (error) {
        logger.error(`Synthetic test error: ${name}`, error);
        this.emit('synthetic-test-error', {
          test: name,
          error: String(error),
          timestamp: new Date(),
        });
      }
    }
  }

  private checkDeadManSwitch(): void {
    const now = new Date();
    
    for (const [service, lastPing] of this.deadManSwitch.entries()) {
      const timeSinceLastPing = now.getTime() - lastPing.getTime();
      const threshold = 5 * 60 * 1000; // 5 minutes
      
      if (timeSinceLastPing > threshold) {
        this.emit('dead-man-switch-triggered', {
          service,
          lastPing,
          timeSinceLastPing,
        });
        
        // Remove from map to avoid repeated alerts
        this.deadManSwitch.delete(service);
      }
    }
  }

  // Public methods for probes
  async checkLiveness(): Promise<boolean> {
    // Basic liveness check - service is running
    return true;
  }

  async checkReadiness(): Promise<boolean> {
    // Check if all critical dependencies are healthy
    const criticalServices = ['database', 'cache'];
    
    for (const service of criticalServices) {
      const health = this.serviceHealth.get(service);
      if (!health || health.status === 'unhealthy') {
        return false;
      }
    }
    
    return true;
  }

  async checkStartup(): Promise<boolean> {
    // Check if service has completed initialization
    return this.healthChecks.size > 0 && this.serviceHealth.size > 0;
  }

  // Update dead man's switch
  updateDeadManSwitch(service: string): void {
    this.deadManSwitch.set(service, new Date());
  }

  // Get health status
  async getHealthStatus(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: Map<string, ServiceHealth>;
    checks: Map<string, HealthCheck>;
  }> {
    const unhealthyServices = Array.from(this.serviceHealth.values())
      .filter(s => s.status === 'unhealthy').length;
    const degradedServices = Array.from(this.serviceHealth.values())
      .filter(s => s.status === 'degraded').length;
    
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyServices > 0) {
      overall = 'unhealthy';
    } else if (degradedServices > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }
    
    return {
      overall,
      services: this.serviceHealth,
      checks: this.healthChecks,
    };
  }
}