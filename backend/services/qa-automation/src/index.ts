import pino from 'pino';
import { TestOrchestrator, OrchestratorConfig } from './core/test-orchestrator';
import { ModelTestingFramework, ModelTestConfig } from './frameworks/model-testing';
import { TestType, TestPriority, TestPhase } from './core/types';

// Export all core modules
export * from './core/test-orchestrator';
export * from './core/test-runner';
export * from './core/test-reporter';
export * from './core/test-validator';
export * from './core/metrics-collector';
export * from './core/types';

// Export frameworks
export * from './frameworks/model-testing';

// Create logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname'
    }
  }
});

/**
 * Main QA Automation Service
 */
export class QAAutomationService {
  private orchestrator: TestOrchestrator;
  private modelTesting?: ModelTestingFramework;
  private logger = logger;

  constructor(config?: Partial<OrchestratorConfig>) {
    const defaultConfig: OrchestratorConfig = {
      maxConcurrency: 4,
      timeout: 30000,
      retryAttempts: 2,
      failFast: false,
      skipFlaky: false,
      randomizeOrder: true,
      reportFormats: ['json', 'html', 'junit'],
      metricsEnabled: true,
      notificationChannels: ['console']
    };

    this.orchestrator = new TestOrchestrator(
      this.logger,
      { ...defaultConfig, ...config }
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.orchestrator.on('test:start', (test) => {
      this.logger.info({ test: test.name }, 'Test started');
    });

    this.orchestrator.on('test:pass', (test) => {
      this.logger.info({ test: test.name }, '✅ Test passed');
    });

    this.orchestrator.on('test:fail', (test, error) => {
      this.logger.error({ test: test.name, error }, '❌ Test failed');
    });

    this.orchestrator.on('test:skip', (test, reason) => {
      this.logger.warn({ test: test.name, reason }, '⏭️ Test skipped');
    });

    this.orchestrator.on('abort', (reason) => {
      this.logger.error({ reason }, '🛑 Test execution aborted');
    });
  }

  /**
   * Initialize the QA automation service
   */
  public async initialize(): Promise<void> {
    this.logger.info('Initializing QA Automation Service');
    
    try {
      await this.orchestrator.initialize();
      
      // Initialize model testing if configured
      if (process.env.ENABLE_MODEL_TESTING === 'true') {
        await this.initializeModelTesting();
      }
      
      this.logger.info('QA Automation Service initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize QA Automation Service');
      throw error;
    }
  }

  /**
   * Initialize model testing framework
   */
  private async initializeModelTesting(): Promise<void> {
    const modelConfig: ModelTestConfig = {
      modelId: process.env.MODEL_ID || 'phi-2',
      modelName: process.env.MODEL_NAME || 'Phi-2',
      endpoint: process.env.MODEL_ENDPOINT || 'http://localhost:11434',
      apiKey: process.env.MODEL_API_KEY,
      timeout: 30000,
      warmupRuns: 3,
      testRuns: 10,
      batchSize: 5,
      maxTokens: 1000,
      temperature: 0.7,
      topP: 0.9
    };

    this.modelTesting = new ModelTestingFramework(this.logger, modelConfig);
    await this.modelTesting.initialize();
  }

  /**
   * Run all test suites
   */
  public async runAllTests(): Promise<any> {
    this.logger.info('Running all test suites');
    return await this.orchestrator.execute();
  }

  /**
   * Run specific test suite
   */
  public async runTestSuite(suiteType: TestType): Promise<any> {
    this.logger.info({ suite: suiteType }, 'Running test suite');
    
    // Filter tests by type
    // Implementation would filter loaded test suites
    
    return await this.orchestrator.execute();
  }

  /**
   * Run model tests
   */
  public async runModelTests(): Promise<any> {
    if (!this.modelTesting) {
      throw new Error('Model testing not initialized');
    }

    this.logger.info('Running model tests');
    
    // Add test cases
    this.addModelTestCases();
    
    // Run tests
    const results = await this.modelTesting.runTests();
    
    // Run additional test types
    const adversarialResults = await this.modelTesting.runAdversarialTests();
    const benchmarkResults = await this.modelTesting.runBenchmark();
    
    return {
      standard: results,
      adversarial: adversarialResults,
      benchmark: benchmarkResults,
      report: this.modelTesting.generateReport()
    };
  }

  /**
   * Add model test cases
   */
  private addModelTestCases(): void {
    if (!this.modelTesting) {
      return;
    }

    // Document analysis test cases
    this.modelTesting.addTestCase({
      id: 'doc-analysis-tos',
      name: 'Terms of Service Analysis',
      description: 'Test document analysis for Terms of Service',
      input: {
        prompt: 'Analyze this terms of service document for problematic clauses',
        documents: ['Sample terms of service content...'],
        parameters: {
          analysis_type: 'legal',
          depth: 'detailed'
        }
      },
      expectedPatterns: ['automatic renewal', 'data collection', 'liability'],
      maxLatency: 5000,
      tags: ['document', 'analysis', 'legal']
    });

    this.modelTesting.addTestCase({
      id: 'pattern-detection',
      name: 'Pattern Detection Test',
      description: 'Test pattern detection accuracy',
      input: {
        prompt: 'Identify problematic patterns in this privacy policy',
        documents: ['We may share your data with third parties...'],
        parameters: {
          patterns: ['data-sharing', 'retention', 'consent']
        }
      },
      minConfidence: 0.8,
      maxLatency: 3000,
      tags: ['pattern', 'detection', 'privacy']
    });

    this.modelTesting.addTestCase({
      id: 'risk-scoring',
      name: 'Risk Scoring Test',
      description: 'Test risk scoring accuracy',
      input: {
        prompt: 'Calculate risk score for this EULA',
        documents: ['End user license agreement content...'],
        parameters: {
          scoring_model: 'weighted',
          include_recommendations: true
        }
      },
      minConfidence: 0.75,
      maxLatency: 4000,
      tags: ['risk', 'scoring', 'eula']
    });
  }

  /**
   * Get current test status
   */
  public getStatus(): any {
    return this.orchestrator.getStatus();
  }

  /**
   * Abort test execution
   */
  public abort(reason: string): void {
    this.orchestrator.abort(reason);
  }

  /**
   * Cleanup and shutdown
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down QA Automation Service');
    // Cleanup resources
  }
}

// CLI interface when run directly
if (require.main === module) {
  const service = new QAAutomationService();
  
  const runTests = async () => {
    try {
      await service.initialize();
      
      const testType = process.argv[2] || 'all';
      
      let results;
      switch (testType) {
        case 'unit':
          results = await service.runTestSuite(TestType.UNIT);
          break;
        case 'integration':
          results = await service.runTestSuite(TestType.INTEGRATION);
          break;
        case 'e2e':
          results = await service.runTestSuite(TestType.E2E);
          break;
        case 'performance':
          results = await service.runTestSuite(TestType.PERFORMANCE);
          break;
        case 'security':
          results = await service.runTestSuite(TestType.SECURITY);
          break;
        case 'model':
          results = await service.runModelTests();
          break;
        case 'all':
        default:
          results = await service.runAllTests();
      }
      
      console.log('Test Results:', JSON.stringify(results, null, 2));
      
      if (!results.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Test execution failed:', error);
      process.exit(1);
    } finally {
      await service.shutdown();
    }
  };
  
  runTests();
}

// Export default instance
export default new QAAutomationService();