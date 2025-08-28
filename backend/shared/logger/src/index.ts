/**
 * Fine Print AI Comprehensive Logging and Metrics System
 * Main entry point and service orchestrator
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// Core services
import { LoggerService } from './services/logger-service';
import { MetricsService } from './services/metrics-service';
import { TracingService } from './services/tracing-service';
import { StreamingService } from './services/streaming-service';
import { AnalyticsService } from './services/analytics-service';
import { AlertingService } from './services/alerting-service';

// Types
import {
  Environment,
  ServiceType,
  LogLevel,
  LoggerConfig,
  LogEntry,
  MetricData,
  TraceSpan,
  AlertData,
  AnomalyDetection,
  BusinessInsight,
} from './types';

// API routes
import { createAPI } from './routes';

// Integration adapters
import { ConfigServiceIntegration } from './integrations/config-service-integration';
import { MemoryServiceIntegration } from './integrations/memory-service-integration';
import { AgentServiceIntegration } from './integrations/agent-service-integration';

export interface LoggingSystemConfig {
  serviceName: string;
  environment: Environment;
  
  // Database configuration
  databaseUrl: string;
  
  // Core service configurations
  logger: LoggerConfig;
  metrics: {
    serviceName: string;
    environment: Environment;
    enablePrometheus: boolean;
    enableCustomMetrics: boolean;
    enableBusinessMetrics: boolean;
    aggregationWindows: string[];
    retentionPeriod: number;
    exportInterval: number;
  };
  tracing: {
    serviceName: string;
    serviceVersion: string;
    environment: Environment;
    jaegerEndpoint?: string;
    enableJaeger: boolean;
    enablePrometheus: boolean;
    enableConsole: boolean;
    sampleRate: number;
    maxSpansPerTrace: number;
    maxAttributeLength: number;
    exportTimeout: number;
  };
  streaming: {
    serviceName: string;
    environment: Environment;
    wsPort: number;
    enableWebSockets: boolean;
    enableRedisStreams: boolean;
    redisUrl?: string;
    maxConnections: number;
    heartbeatInterval: number;
    bufferSize: number;
    enableMessageCompression: boolean;
    enableAuthentication: boolean;
    rateLimitPerMinute: number;
  };
  analytics: {
    serviceName: string;
    environment: Environment;
    enablePatternDetection: boolean;
    enableAnomalyDetection: boolean;
    enableTrendAnalysis: boolean;
    patternDetectionInterval: number;
    anomalyDetectionInterval: number;
    patternMinOccurrences: number;
    anomalyThreshold: number;
    timeWindowSize: number;
    maxPatternsTracked: number;
    enableMLAnalysis: boolean;
  };
  alerting: {
    serviceName: string;
    environment: Environment;
    enableEmailAlerts: boolean;
    enableSlackAlerts: boolean;
    enableWebhookAlerts: boolean;
    enableSMSAlerts: boolean;
    enablePagerDutyAlerts: boolean;
    defaultEmailFrom: string;
    smtpConfig?: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
    slackWebhookUrl?: string;
    pagerDutyApiKey?: string;
    twilioConfig?: {
      accountSid: string;
      authToken: string;
      fromNumber: string;
    };
    maxAlertsPerHour: number;
    escalationDelayMinutes: number;
    alertRetentionDays: number;
  };
  
  // API configuration
  api: {
    port: number;
    enableAPI: boolean;
    enableSwagger: boolean;
    enableCors: boolean;
    rateLimitPerMinute: number;
    enableAuth: boolean;
    jwtSecret?: string;
  };
  
  // Integration configuration
  integrations: {
    enableConfigService: boolean;
    enableMemoryService: boolean;
    enableAgentServices: boolean;
    configServiceUrl?: string;
    memoryServiceUrl?: string;
    agentServiceUrls?: string[];
  };
}

export class FinePrintLoggingSystem extends EventEmitter {
  private config: LoggingSystemConfig;
  private prisma: PrismaClient;
  private initialized = false;

  // Core services
  private loggerService: LoggerService;
  private metricsService: MetricsService;
  private tracingService: TracingService;
  private streamingService: StreamingService;
  private analyticsService: AnalyticsService;
  private alertingService: AlertingService;

  // Integration adapters
  private configServiceIntegration?: ConfigServiceIntegration;
  private memoryServiceIntegration?: MemoryServiceIntegration;
  private agentServiceIntegration?: AgentServiceIntegration;

  // API server
  private apiServer?: any;

  constructor(config: LoggingSystemConfig) {
    super();
    this.config = config;
    
    // Initialize database client
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
    });

    // Initialize core services
    this.loggerService = new LoggerService(config.logger);
    this.metricsService = new MetricsService(config.metrics);
    this.tracingService = new TracingService(config.tracing);
    this.streamingService = new StreamingService(config.streaming);
    this.analyticsService = new AnalyticsService(config.analytics);
    this.alertingService = new AlertingService(config.alerting);

    this.setupServiceEventHandlers();
  }

  /**
   * Initialize the entire logging system
   */
  async initialize(): Promise<void> {
    try {
      // Test database connection
      await this.prisma.$connect();
      
      // Initialize core services in order
      await this.loggerService.initialize();
      await this.metricsService.initialize();
      await this.tracingService.initialize(this.loggerService);
      await this.streamingService.initialize(this.loggerService);
      await this.analyticsService.initialize(this.loggerService, this.metricsService);
      await this.alertingService.initialize(this.loggerService, this.metricsService);

      // Connect services
      await this.connectServices();

      // Initialize integrations
      await this.initializeIntegrations();

      // Start API server
      if (this.config.api.enableAPI) {
        await this.startAPIServer();
      }

      this.initialized = true;

      this.loggerService.info('Fine Print AI Logging System initialized successfully', {
        service: 'logging-system' as ServiceType,
        environment: this.config.environment,
        version: '1.0.0',
        services: {
          logger: true,
          metrics: true,
          tracing: true,
          streaming: true,
          analytics: true,
          alerting: true,
        },
        integrations: {
          config: !!this.configServiceIntegration,
          memory: !!this.memoryServiceIntegration,
          agents: !!this.agentServiceIntegration,
        },
        api: this.config.api.enableAPI,
      });

      this.emit('initialized');

    } catch (error) {
      this.loggerService?.error('Failed to initialize logging system', {
        service: 'logging-system' as ServiceType,
        environment: this.config.environment,
      }, error as Error);

      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get logger service instance
   */
  getLogger(): LoggerService {
    return this.loggerService;
  }

  /**
   * Get metrics service instance
   */
  getMetrics(): MetricsService {
    return this.metricsService;
  }

  /**
   * Get tracing service instance
   */
  getTracing(): TracingService {
    return this.tracingService;
  }

  /**
   * Get streaming service instance
   */
  getStreaming(): StreamingService {
    return this.streamingService;
  }

  /**
   * Get analytics service instance
   */
  getAnalytics(): AnalyticsService {
    return this.analyticsService;
  }

  /**
   * Get alerting service instance
   */
  getAlerting(): AlertingService {
    return this.alertingService;
  }

  /**
   * Get database client
   */
  getDatabase(): PrismaClient {
    return this.prisma;
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    uptime: number;
    version: string;
    timestamp: Date;
  }> {
    const services = {
      logger: this.loggerService !== undefined,
      metrics: this.metricsService !== undefined,
      tracing: this.tracingService !== undefined,
      streaming: this.streamingService !== undefined,
      analytics: this.analyticsService !== undefined,
      alerting: this.alertingService !== undefined,
      database: await this.checkDatabaseHealth(),
    };

    const healthyServices = Object.values(services).filter(Boolean).length;
    const totalServices = Object.keys(services).length;
    const healthRatio = healthyServices / totalServices;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (healthRatio === 1) {
      status = 'healthy';
    } else if (healthRatio >= 0.7) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      services,
      uptime: process.uptime(),
      version: '1.0.0',
      timestamp: new Date(),
    };
  }

  /**
   * Get comprehensive system statistics
   */
  async getSystemStatistics(): Promise<{
    logs: any;
    metrics: any;
    traces: any;
    alerts: any;
    analytics: any;
    streaming: any;
  }> {
    return {
      logs: this.analyticsService.getStatistics(),
      metrics: this.metricsService.getFinePrintMetrics(),
      traces: this.tracingService.getTraceStatistics(),
      alerts: this.alertingService.getAlertStatistics(),
      analytics: {
        patterns: this.analyticsService.getPatterns().length,
        anomalies: this.analyticsService.getAnomalies().length,
        insights: this.analyticsService.getBusinessInsights().length,
      },
      streaming: this.streamingService.getConnectionStats(),
    };
  }

  /**
   * Setup event handlers between services
   */
  private setupServiceEventHandlers(): void {
    // Logger events
    this.loggerService.on('log', (logEntry: LogEntry) => {
      // Send to analytics for pattern detection
      this.analyticsService?.analyzeLog(logEntry);
      
      // Send to alerting for rule evaluation
      this.alertingService?.processLogEntry(logEntry);
      
      // Stream to real-time subscribers
      this.streamingService?.streamLog(logEntry);
    });

    // Metrics events
    this.metricsService.on('metric', (metricData: MetricData) => {
      // Send to alerting for rule evaluation
      this.alertingService?.processMetric(metricData);
      
      // Stream to real-time subscribers
      this.streamingService?.streamMetric(metricData);
    });

    // Tracing events
    this.tracingService.on('span-finished', (traceSpan: TraceSpan) => {
      // Stream to real-time subscribers
      this.streamingService?.streamTrace(traceSpan);
    });

    // Analytics events
    this.analyticsService.on('anomaly-detected', (anomaly: AnomalyDetection) => {
      // Send to alerting
      this.alertingService?.processAnomaly(anomaly);
    });

    this.analyticsService.on('business-insight', (insight: BusinessInsight) => {
      // Send to alerting for high-impact insights
      this.alertingService?.processBusinessInsight(insight);
    });

    // Alerting events
    this.alertingService.on('alert-triggered', (alertData: AlertData) => {
      // Stream to real-time subscribers
      this.streamingService?.streamAlert(alertData);
      
      // Log the alert
      this.loggerService.warn(`Alert triggered: ${alertData.title}`, {
        service: 'alerting-service' as ServiceType,
        environment: this.config.environment,
        metadata: {
          alertId: alertData.id,
          severity: alertData.severity,
          ruleId: alertData.ruleId,
        },
      });
    });
  }

  /**
   * Connect services and establish data flow
   */
  private async connectServices(): Promise<void> {
    // Initialize logger with metrics and streaming
    await this.loggerService.initialize(this.metricsService, this.streamingService);

    // Set up buffer flushing from logger to database
    this.loggerService.on('buffer-flush', async (logEntries: LogEntry[]) => {
      await this.persistLogEntries(logEntries);
    });

    // Set up metrics export
    this.metricsService.on('metrics-export', async (exportData: any) => {
      await this.persistMetrics(exportData);
    });
  }

  /**
   * Initialize integration adapters
   */
  private async initializeIntegrations(): Promise<void> {
    if (this.config.integrations.enableConfigService && this.config.integrations.configServiceUrl) {
      this.configServiceIntegration = new ConfigServiceIntegration(
        this.config.integrations.configServiceUrl,
        this.loggerService
      );
      await this.configServiceIntegration.initialize();
    }

    if (this.config.integrations.enableMemoryService && this.config.integrations.memoryServiceUrl) {
      this.memoryServiceIntegration = new MemoryServiceIntegration(
        this.config.integrations.memoryServiceUrl,
        this.loggerService
      );
      await this.memoryServiceIntegration.initialize();
    }

    if (this.config.integrations.enableAgentServices && this.config.integrations.agentServiceUrls) {
      this.agentServiceIntegration = new AgentServiceIntegration(
        this.config.integrations.agentServiceUrls,
        this.loggerService
      );
      await this.agentServiceIntegration.initialize();
    }
  }

  /**
   * Start API server
   */
  private async startAPIServer(): Promise<void> {
    this.apiServer = await createAPI({
      config: this.config.api,
      services: {
        logger: this.loggerService,
        metrics: this.metricsService,
        tracing: this.tracingService,
        streaming: this.streamingService,
        analytics: this.analyticsService,
        alerting: this.alertingService,
      },
      database: this.prisma,
    });

    this.loggerService.info('API server started', {
      service: 'logging-system' as ServiceType,
      environment: this.config.environment,
      port: this.config.api.port,
    });
  }

  /**
   * Persist log entries to database
   */
  private async persistLogEntries(logEntries: LogEntry[]): Promise<void> {
    try {
      await this.prisma.logEntry.createMany({
        data: logEntries.map(entry => ({
          id: entry.id,
          timestamp: entry.timestamp,
          level: entry.level.toUpperCase() as any,
          message: entry.message,
          category: entry.category.toUpperCase().replace('-', '_') as any,
          fingerprint: entry.fingerprint,
          hash: entry.hash,
          service: entry.context.service,
          environment: entry.context.environment,
          version: entry.context.version,
          component: entry.context.component,
          operation: entry.context.operation,
          duration: entry.context.duration,
          requestId: entry.context.requestId,
          sessionId: entry.context.sessionId,
          userId: entry.context.userId,
          agentId: entry.context.agentId,
          workflowId: entry.context.workflowId,
          parentSpanId: entry.context.parentSpanId,
          traceId: entry.context.traceId,
          causationId: entry.context.causationId,
          correlationId: entry.context.correlationId,
          businessContext: entry.context.businessContext || {},
          technicalContext: entry.context.technicalContext || {},
          securityContext: entry.context.securityContext || {},
          errorDetails: entry.error || {},
          metadata: entry.context.metadata || {},
          tags: entry.context.tags || [],
          stackTrace: entry.stackTrace,
        })),
        skipDuplicates: true,
      });
    } catch (error) {
      this.loggerService.error('Failed to persist log entries', {
        service: 'logging-system' as ServiceType,
        environment: this.config.environment,
        count: logEntries.length,
      }, error as Error);
    }
  }

  /**
   * Persist metrics to database
   */
  private async persistMetrics(exportData: any): Promise<void> {
    try {
      // This would implement metric persistence logic
      // For now, we'll just log the export
      this.loggerService.debug('Metrics exported', {
        service: 'logging-system' as ServiceType,
        environment: this.config.environment,
        timestamp: exportData.timestamp,
      });
    } catch (error) {
      this.loggerService.error('Failed to persist metrics', {
        service: 'logging-system' as ServiceType,
        environment: this.config.environment,
      }, error as Error);
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.loggerService.info('Fine Print AI Logging System shutting down', {
      service: 'logging-system' as ServiceType,
      environment: this.config.environment,
    });

    // Shutdown services in reverse order
    await this.alertingService?.shutdown();
    await this.analyticsService?.shutdown();
    await this.streamingService?.shutdown();
    await this.tracingService?.shutdown();
    await this.metricsService?.shutdown();
    await this.loggerService?.shutdown();

    // Close API server
    if (this.apiServer) {
      await new Promise<void>((resolve) => {
        this.apiServer.close(() => resolve());
      });
    }

    // Close database connection
    await this.prisma.$disconnect();

    this.emit('shutdown');
  }
}

// Export everything
export * from './types';
export * from './services/logger-service';
export * from './services/metrics-service';
export * from './services/tracing-service';
export * from './services/streaming-service';
export * from './services/analytics-service';
export * from './services/alerting-service';

// Default export
export default FinePrintLoggingSystem;