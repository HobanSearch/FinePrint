import fastify from 'fastify';
import { initializeOpenTelemetry } from './telemetry/opentelemetry';
import { MetricsCollector } from './metrics/collector';
import { IncidentManager } from './incident/manager';
import { ChaosEngineer } from './chaos/engineer';
import { HealthChecker } from './health/checker';
import { AlertingEngine } from './alerting/engine';
import { CapacityPlanner } from './capacity/planner';
import { SLOManager } from './slo/manager';
import { logger } from './utils/logger';
import { config } from './config';
import { registerRoutes } from './routes';
import { initializePrometheusExporter } from './metrics/prometheus';
import { initializeGrafana } from './dashboards/grafana';
import { initializeJaeger } from './tracing/jaeger';
import { initializeLoki } from './logging/loki';

/**
 * Fine Print AI SRE Monitoring Service
 * Ensures 99.9% uptime through comprehensive observability and automation
 */
export class SREMonitoringService {
  private server = fastify({
    logger: logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    maxParamLength: 500,
  });

  private metricsCollector: MetricsCollector;
  private incidentManager: IncidentManager;
  private chaosEngineer: ChaosEngineer;
  private healthChecker: HealthChecker;
  private alertingEngine: AlertingEngine;
  private capacityPlanner: CapacityPlanner;
  private sloManager: SLOManager;

  constructor() {
    this.metricsCollector = new MetricsCollector();
    this.incidentManager = new IncidentManager();
    this.chaosEngineer = new ChaosEngineer();
    this.healthChecker = new HealthChecker();
    this.alertingEngine = new AlertingEngine();
    this.capacityPlanner = new CapacityPlanner();
    this.sloManager = new SLOManager();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize OpenTelemetry for distributed tracing
      await initializeOpenTelemetry();
      
      // Initialize Prometheus metrics exporter
      await initializePrometheusExporter(this.server);
      
      // Initialize Grafana dashboards
      await initializeGrafana();
      
      // Initialize Jaeger tracing
      await initializeJaeger();
      
      // Initialize Loki log aggregation
      await initializeLoki();
      
      // Start core monitoring components
      await this.metricsCollector.start();
      await this.incidentManager.initialize();
      await this.chaosEngineer.initialize();
      await this.healthChecker.startMonitoring();
      await this.alertingEngine.start();
      await this.capacityPlanner.initialize();
      await this.sloManager.initialize();
      
      // Register API routes
      await registerRoutes(this.server, {
        metricsCollector: this.metricsCollector,
        incidentManager: this.incidentManager,
        chaosEngineer: this.chaosEngineer,
        healthChecker: this.healthChecker,
        alertingEngine: this.alertingEngine,
        capacityPlanner: this.capacityPlanner,
        sloManager: this.sloManager,
      });
      
      // Register middleware
      await this.registerMiddleware();
      
      // Start server
      await this.server.listen({
        port: config.server.port,
        host: config.server.host,
      });
      
      logger.info({
        msg: 'SRE Monitoring Service started successfully',
        port: config.server.port,
        environment: config.environment,
        uptimeTarget: '99.9%',
        detectionTime: '<1 minute',
        autoRemediationRate: '80%',
      });
      
      // Start periodic tasks
      this.startPeriodicTasks();
      
    } catch (error) {
      logger.error('Failed to initialize SRE Monitoring Service', error);
      throw error;
    }
  }

  private async registerMiddleware(): Promise<void> {
    // CORS
    await this.server.register(import('@fastify/cors'), {
      origin: config.cors.origins,
      credentials: true,
    });
    
    // Security headers
    await this.server.register(import('@fastify/helmet'), {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    });
    
    // Rate limiting
    await this.server.register(import('@fastify/rate-limit'), {
      max: 100,
      timeWindow: '1 minute',
    });
    
    // Request tracking
    this.server.addHook('onRequest', async (request, reply) => {
      request.startTime = Date.now();
      this.metricsCollector.incrementRequestCount(request.method, request.url);
    });
    
    this.server.addHook('onResponse', async (request, reply) => {
      const duration = Date.now() - (request.startTime || Date.now());
      this.metricsCollector.recordRequestDuration(
        request.method,
        request.url,
        reply.statusCode,
        duration
      );
    });
    
    // Error handling
    this.server.setErrorHandler(async (error, request, reply) => {
      logger.error({
        msg: 'Request error',
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method,
      });
      
      this.metricsCollector.incrementErrorCount(error.name);
      
      // Trigger incident if error rate exceeds threshold
      await this.alertingEngine.checkErrorRate();
      
      reply.status(error.statusCode || 500).send({
        error: 'Internal Server Error',
        message: config.environment === 'development' ? error.message : 'An error occurred',
        requestId: request.id,
      });
    });
  }

  private startPeriodicTasks(): void {
    // SLO compliance check every minute
    setInterval(async () => {
      await this.sloManager.checkCompliance();
    }, 60000);
    
    // Capacity planning analysis every 5 minutes
    setInterval(async () => {
      await this.capacityPlanner.analyzeUsage();
    }, 300000);
    
    // Health check sweep every 30 seconds
    setInterval(async () => {
      await this.healthChecker.performHealthChecks();
    }, 30000);
    
    // Chaos engineering experiments (scheduled)
    if (config.chaos.enabled) {
      setInterval(async () => {
        await this.chaosEngineer.runScheduledExperiments();
      }, config.chaos.interval);
    }
    
    // Alert aggregation and deduplication every 10 seconds
    setInterval(async () => {
      await this.alertingEngine.processAlerts();
    }, 10000);
    
    // Metrics aggregation every 15 seconds
    setInterval(async () => {
      await this.metricsCollector.aggregateMetrics();
    }, 15000);
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down SRE Monitoring Service...');
    
    await this.metricsCollector.stop();
    await this.incidentManager.shutdown();
    await this.chaosEngineer.shutdown();
    await this.healthChecker.stopMonitoring();
    await this.alertingEngine.stop();
    await this.capacityPlanner.shutdown();
    await this.sloManager.shutdown();
    
    await this.server.close();
    
    logger.info('SRE Monitoring Service shut down successfully');
  }
}

// Main entry point
async function main() {
  const service = new SREMonitoringService();
  
  // Graceful shutdown handlers
  process.on('SIGTERM', async () => {
    await service.shutdown();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    await service.shutdown();
    process.exit(0);
  });
  
  // Unhandled rejection handler
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise });
    // Don't exit, but alert
    service['alertingEngine'].createAlert({
      severity: 'critical',
      title: 'Unhandled Promise Rejection',
      description: String(reason),
      source: 'sre-monitoring-service',
    });
  });
  
  try {
    await service.initialize();
  } catch (error) {
    logger.error('Failed to start SRE Monitoring Service', error);
    process.exit(1);
  }
}

// Start the service
if (require.main === module) {
  main();
}

export default SREMonitoringService;