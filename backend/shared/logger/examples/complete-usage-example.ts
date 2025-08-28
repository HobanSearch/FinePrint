/**
 * Complete Usage Example for Fine Print AI Logging System
 * Demonstrates comprehensive logging, metrics, tracing, and analytics capabilities
 */

import { FinePrintLoggingSystem, LoggingSystemConfig } from '../src';

async function demonstrateLoggingSystem() {
  // Configuration for the logging system
  const config: LoggingSystemConfig = {
    serviceName: 'fine-print-ai-demo',
    environment: 'development',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/fineprint_logs',
    
    // Logger configuration
    logger: {
      serviceName: 'fine-print-ai-demo',
      environment: 'development',
      logLevel: 'debug',
      enableConsole: true,
      enableFile: false,
      enableElasticsearch: false,
      enableStreaming: true,
      enableMetrics: true,
      enableTracing: true,
      enableAnomalyDetection: true,
      storage: {
        hot: { provider: 'redis', retentionHours: 24, maxSize: '100MB' },
        warm: { provider: 'postgresql', retentionDays: 7, indexing: true },
        cold: { provider: 's3', retentionMonths: 3, compression: true },
      },
      redactFields: ['password', 'token', 'secret', 'key', 'authorization'],
      sampling: { enabled: false, rate: 1.0 },
    },
    
    // Metrics configuration
    metrics: {
      serviceName: 'fine-print-ai-demo',
      environment: 'development',
      enablePrometheus: true,
      enableCustomMetrics: true,
      enableBusinessMetrics: true,
      aggregationWindows: ['1m', '5m', '15m', '1h'],
      retentionPeriod: 24, // hours
      exportInterval: 30, // seconds
    },
    
    // Tracing configuration
    tracing: {
      serviceName: 'fine-print-ai-demo',
      serviceVersion: '1.0.0',
      environment: 'development',
      enableJaeger: false,
      enablePrometheus: false,
      enableConsole: true,
      sampleRate: 1.0,
      maxSpansPerTrace: 100,
      maxAttributeLength: 1000,
      exportTimeout: 30000,
    },
    
    // Streaming configuration
    streaming: {
      serviceName: 'fine-print-ai-demo',
      environment: 'development',
      wsPort: 3001,
      enableWebSockets: true,
      enableRedisStreams: false,
      maxConnections: 100,
      heartbeatInterval: 30,
      bufferSize: 1000,
      enableMessageCompression: false,
      enableAuthentication: false,
      rateLimitPerMinute: 1000,
    },
    
    // Analytics configuration
    analytics: {
      serviceName: 'fine-print-ai-demo',
      environment: 'development',
      enablePatternDetection: true,
      enableAnomalyDetection: true,
      enableTrendAnalysis: true,
      patternDetectionInterval: 60, // seconds
      anomalyDetectionInterval: 120, // seconds
      patternMinOccurrences: 3,
      anomalyThreshold: 2.0,
      timeWindowSize: 15, // minutes
      maxPatternsTracked: 100,
      enableMLAnalysis: false,
    },
    
    // Alerting configuration
    alerting: {
      serviceName: 'fine-print-ai-demo',
      environment: 'development',
      enableEmailAlerts: false,
      enableSlackAlerts: false,
      enableWebhookAlerts: false,
      enableSMSAlerts: false,
      enablePagerDutyAlerts: false,
      defaultEmailFrom: 'demo@fineprintai.com',
      maxAlertsPerHour: 50,
      escalationDelayMinutes: 15,
      alertRetentionDays: 30,
    },
    
    // API configuration
    api: {
      port: 3000,
      enableAPI: true,
      enableSwagger: true,
      enableCors: true,
      rateLimitPerMinute: 1000,
      enableAuth: false,
    },
    
    // Integrations configuration
    integrations: {
      enableConfigService: false,
      enableMemoryService: false,
      enableAgentServices: false,
    },
  };

  // Initialize the logging system
  console.log('🚀 Initializing Fine Print AI Logging System...');
  const loggingSystem = new FinePrintLoggingSystem(config);
  
  try {
    await loggingSystem.initialize();
    console.log('✅ Logging system initialized successfully!');
    
    // Get service instances
    const logger = loggingSystem.getLogger();
    const metrics = loggingSystem.getMetrics();
    const tracing = loggingSystem.getTracing();
    const streaming = loggingSystem.getStreaming();
    const analytics = loggingSystem.getAnalytics();
    const alerting = loggingSystem.getAlerting();
    
    console.log('\n📊 Demonstrating logging capabilities...');
    
    // === BASIC LOGGING ===
    console.log('\n1. Basic Logging');
    
    logger.info('Application started', {
      service: 'demo-service',
      environment: 'development',
      version: '1.0.0',
    });
    
    logger.debug('Debug information', {
      service: 'demo-service',
      environment: 'development',
      metadata: { debugLevel: 'verbose', component: 'initialization' },
    });
    
    logger.warn('This is a warning message', {
      service: 'demo-service',
      environment: 'development',
      metadata: { warningType: 'configuration', severity: 'low' },
    });
    
    // === CORRELATION CONTEXT ===
    console.log('\n2. Correlation Context Tracking');
    
    const correlationContext = logger.createCorrelationContext({
      requestId: 'req-demo-001',
      userId: 'user-12345',
      sessionId: 'session-67890',
      agentId: 'document-analyzer-v1',
      workflowId: 'document-analysis-workflow',
    });
    
    logger.runWithCorrelation(correlationContext, () => {
      logger.info('Processing document analysis request', {
        service: 'document-analyzer',
        environment: 'development',
        operation: 'analyze-privacy-policy',
        metadata: {
          documentId: 'doc-privacy-001',
          documentType: 'privacy-policy',
          language: 'en',
          length: 15000,
        },
      });
      
      // Simulate some processing steps
      logger.debug('Extracting text content', {
        service: 'document-analyzer',
        environment: 'development',
        operation: 'text-extraction',
      });
      
      logger.debug('Detecting patterns', {
        service: 'pattern-detector',
        environment: 'development',
        operation: 'pattern-detection',
      });
      
      logger.info('Analysis completed successfully', {
        service: 'document-analyzer',
        environment: 'development',
        operation: 'analyze-privacy-policy',
        duration: 2500,
        metadata: {
          patternsFound: 7,
          riskScore: 0.65,
          recommendations: 5,
        },
      });
    });
    
    // === BUSINESS EVENT LOGGING ===
    console.log('\n3. Business Event Logging');
    
    logger.business('New customer subscription', {
      customerId: 'cust-12345',
      organizationId: 'org-67890',
      subscriptionId: 'sub-enterprise-001',
      planType: 'enterprise',
      revenue: 299.99,
      conversionEvent: 'trial-to-paid',
      churnRisk: 0.15,
      satisfactionScore: 4.8,
    }, {
      service: 'billing-service',
      environment: 'development',
    });
    
    logger.business('High-value document analysis completed', {
      customerId: 'cust-12345',
      feature: 'advanced-pattern-detection',
      revenue: 49.99,
      satisfactionScore: 4.9,
    }, {
      service: 'document-service',
      environment: 'development',
    });
    
    // === PERFORMANCE LOGGING ===
    console.log('\n4. Performance Monitoring');
    
    // Using timer
    const timer = logger.timer('document-processing');
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Complete timing
    timer();
    
    // Direct performance logging
    logger.performance('ai-model-inference', 850, {
      service: 'ai-service',
      environment: 'development',
      metadata: {
        modelName: 'pattern-detector-v2',
        modelVersion: '2.1.0',
        inputTokens: 2048,
        outputTokens: 512,
      },
    });
    
    // === AI INFERENCE LOGGING ===
    console.log('\n5. AI Inference Tracking');
    
    logger.aiInference('risk-assessment-model', 1200, 0.94, {
      service: 'risk-analyzer',
      environment: 'development',
      metadata: {
        modelVersion: 'v3.2.1',
        inputLength: 15000,
        confidenceThreshold: 0.8,
        processedClauses: 45,
      },
    });
    
    logger.aiInference('pattern-detection-model', 750, 0.89, {
      service: 'pattern-detector',
      environment: 'development',
      metadata: {
        modelVersion: 'v2.1.0',
        patternsDetected: 12,
        falsePositiveRate: 0.05,
      },
    });
    
    // === SECURITY EVENT LOGGING ===
    console.log('\n6. Security Event Tracking');
    
    logger.security('Unusual access pattern detected', {
      riskLevel: 'medium',
      threatType: 'anomalous-access',
      authMethod: 'oauth2',
      dataClassification: 'confidential',
      permissions: ['read', 'analyze'],
    }, {
      service: 'auth-service',
      environment: 'development',
      userId: 'user-12345',
    });
    
    // === AUDIT LOGGING ===
    console.log('\n7. Audit Trail');
    
    logger.audit('document-access', 'privacy-policy-doc-001', 'success', {
      service: 'document-service',
      environment: 'development',
      userId: 'user-12345',
      metadata: {
        accessType: 'read',
        accessReason: 'customer-analysis-request',
        dataRetention: '30-days',
      },
    });
    
    logger.audit('user-data-export', 'user-12345-profile', 'success', {
      service: 'data-export-service',
      environment: 'development',
      userId: 'admin-67890',
      metadata: {
        exportFormat: 'json',
        gdprRequest: true,
        approvedBy: 'privacy-officer',
      },
    });
    
    // === METRICS COLLECTION ===
    console.log('\n8. Metrics Collection');
    
    // Business metrics
    metrics.recordBusinessMetric('revenue', 'mrr', 125000, {
      service: 'billing-service',
      businessContext: {
        planType: 'enterprise',
        customerSegment: 'enterprise',
      },
    });
    
    metrics.recordBusinessMetric('engagement', 'documents_analyzed', 1250, {
      service: 'document-service',
    });
    
    // AI model metrics
    metrics.recordAIMetric('pattern-detector-v2', 'accuracy', 0.96, {
      service: 'ai-service',
    });
    
    metrics.recordAIMetric('risk-assessor-v3', 'inference_latency', 0.85, {
      service: 'ai-service',
    });
    
    // Agent performance metrics
    metrics.recordAgentMetric('document-analyzer-v1', 'task_completion_rate', 0.98, {
      service: 'agent-orchestrator',
    });
    
    metrics.recordAgentMetric('pattern-detector-agent', 'decision_accuracy', 0.94, {
      service: 'agent-orchestrator',
    });
    
    // Custom counters and histograms
    metrics.incrementCounter('api_requests_total', {
      service: 'api-gateway',
      method: 'POST',
      endpoint: '/analyze',
      status: '200',
    });
    
    metrics.recordHistogram('request_duration_seconds', 1.25, {
      service: 'api-gateway',
      method: 'POST',
      endpoint: '/analyze',
    });
    
    // Business KPIs
    metrics.setBusinessKPI({
      name: 'Customer Satisfaction Score',
      value: 4.8,
      target: 4.5,
      trend: 'up',
      change: 0.3,
      period: 'monthly',
      status: 'on-track',
      category: 'engagement',
      priority: 'high',
    });
    
    metrics.setBusinessKPI({
      name: 'Monthly Recurring Revenue',
      value: 125000,
      target: 120000,
      trend: 'up',
      change: 8.5,
      period: 'monthly',
      status: 'on-track',
      category: 'revenue',
      priority: 'critical',
    });
    
    // === DISTRIBUTED TRACING ===
    console.log('\n9. Distributed Tracing');
    
    await tracing.traceOperation('document-analysis-workflow', async (span) => {
      span.setAttributes({
        'workflow.type': 'document-analysis',
        'document.id': 'doc-privacy-001',
        'user.id': 'user-12345',
        'agent.id': 'document-analyzer-v1',
      });
      
      tracing.addSpanEvent(span, 'workflow-started', {
        'input.document_type': 'privacy-policy',
        'input.language': 'en',
      });
      
      // Simulate child operations
      const extractionSpan = tracing.createChildSpan('text-extraction', {
        'extraction.method': 'ai-powered',
        'extraction.confidence': 0.98,
      });
      
      // Simulate extraction work
      await new Promise(resolve => setTimeout(resolve, 500));
      tracing.finishSpan(extractionSpan);
      
      const analysisSpan = tracing.createChildSpan('pattern-analysis', {
        'analysis.model': 'pattern-detector-v2',
        'analysis.mode': 'comprehensive',
      });
      
      // Simulate analysis work
      await new Promise(resolve => setTimeout(resolve, 800));
      tracing.addSpanEvent(analysisSpan, 'patterns-detected', {
        'pattern.count': 12,
        'risk.score': 0.65,
      });
      tracing.finishSpan(analysisSpan);
      
      tracing.addSpanEvent(span, 'workflow-completed', {
        'output.patterns': 12,
        'output.risk_score': 0.65,
        'output.recommendations': 8,
      });
      
      return {
        patterns: 12,
        riskScore: 0.65,
        recommendations: 8,
      };
    }, {
      attributes: {
        'service.name': 'document-analyzer',
        'operation.type': 'ai-workflow',
      },
    });
    
    // === ANALYTICS AND PATTERNS ===
    console.log('\n10. Analytics and Pattern Detection');
    
    // Add custom patterns
    analytics.addPattern({
      pattern: 'High processing latency detected',
      description: 'Document processing is taking longer than expected',
      regex: /processing.*slow|latency.*high|timeout.*processing/i,
      severity: 'warning',
      category: 'performance',
      actions: [
        { type: 'alert', config: { severity: 'medium', channel: 'ops-team' } },
      ],
    });
    
    analytics.addPattern({
      pattern: 'Customer churn risk indicator',
      description: 'Customer showing signs of potential churn',
      regex: /churn.*risk|dissatisfaction|cancel.*subscription/i,
      severity: 'error',
      category: 'business',
      actions: [
        { type: 'alert', config: { severity: 'high', channel: 'customer-success' } },
        { type: 'escalate', config: { after: 2, to: 'customer-success-manager' } },
      ],
    });
    
    // Simulate some pattern-triggering logs
    logger.warn('Processing latency high for document analysis', {
      service: 'document-analyzer',
      environment: 'development',
      duration: 8500,
      metadata: { latencyThreshold: 5000 },
    });
    
    // === ALERTING RULES ===
    console.log('\n11. Alerting Configuration');
    
    alerting.addAlertRule({
      id: 'high-error-rate-demo',
      name: 'High Error Rate - Demo',
      description: 'Error rate exceeds acceptable threshold',
      condition: {
        metric: 'error_rate',
        operator: '>',
        threshold: 0.1, // 10%
        timeWindow: 5, // minutes
        evaluationInterval: 60, // seconds
      },
      severity: 'error',
      channels: [
        { type: 'webhook', config: { url: 'http://localhost:3000/demo-webhook' } },
      ],
      throttle: 15, // minutes
      enabled: true,
      tags: ['demo', 'errors', 'performance'],
    });
    
    alerting.addAlertRule({
      id: 'customer-churn-risk-demo',
      name: 'Customer Churn Risk - Demo',
      description: 'Customer showing high churn risk indicators',
      condition: {
        metric: 'churn_risk_score',
        operator: '>',
        threshold: 0.8,
        timeWindow: 60, // minutes
        evaluationInterval: 300, // seconds
      },
      severity: 'warning',
      channels: [
        { type: 'webhook', config: { url: 'http://localhost:3000/business-webhook' } },
      ],
      throttle: 30, // minutes
      enabled: true,
      tags: ['demo', 'business', 'churn'],
    });
    
    // === REAL-TIME STREAMING ===
    console.log('\n12. Real-time Streaming (WebSocket server started on port 3001)');
    
    // Create custom channels
    streaming.createChannel('demo-events', {
      retention: 2, // hours
      rateLimit: 500, // messages per minute
    });
    
    // Stream some custom messages
    setTimeout(() => {
      streaming.streamMessage({
        id: 'demo-msg-001',
        type: 'log',
        timestamp: new Date(),
        data: {
          level: 'info',
          message: 'Demo streaming message',
          service: 'demo-service',
        },
        channel: 'demo-events',
        priority: 'normal',
      });
    }, 2000);
    
    // === SYSTEM STATISTICS ===
    console.log('\n13. System Statistics');
    
    setTimeout(async () => {
      const systemStats = await loggingSystem.getSystemStatistics();
      console.log('📈 System Statistics:');
      console.log('- Logs:', systemStats.logs.totalLogs, 'total');
      console.log('- Error Rate:', (systemStats.logs.errorRate * 100).toFixed(2) + '%');
      console.log('- Patterns Detected:', systemStats.analytics.patterns);
      console.log('- Anomalies:', systemStats.analytics.anomalies);
      console.log('- Business Insights:', systemStats.analytics.insights);
      console.log('- Streaming Connections:', systemStats.streaming.totalConnections);
      
      // Get health status
      const health = await loggingSystem.getSystemHealth();
      console.log('🏥 System Health:', health.status);
      console.log('- Services:', Object.entries(health.services).map(([name, status]) => `${name}: ${status ? '✅' : '❌'}`).join(', '));
      console.log('- Uptime:', Math.floor(health.uptime), 'seconds');
      
      console.log('\n🎉 Demo completed successfully!');
      console.log('💡 Check the API at http://localhost:3000');
      console.log('🔌 WebSocket available at ws://localhost:3001/ws');
      console.log('📊 Prometheus metrics at http://localhost:3000/api/v1/metrics/prometheus');
      
    }, 5000);
    
    // Keep the demo running
    console.log('\n⏳ Demo running... Press Ctrl+C to stop');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down gracefully...');
      await loggingSystem.shutdown();
      console.log('✅ Shutdown complete');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error during demo:', error);
    process.exit(1);
  }
}

// Run the demo
if (require.main === module) {
  demonstrateLoggingSystem().catch(console.error);
}

export { demonstrateLoggingSystem };