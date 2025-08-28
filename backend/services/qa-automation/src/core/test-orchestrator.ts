import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import { Logger } from 'pino';
import { TestRunner } from './test-runner';
import { TestReporter } from './test-reporter';
import { TestValidator } from './test-validator';
import { MetricsCollector } from './metrics-collector';
import { TestContext, TestSuite, TestResult, TestConfig, TestPhase } from './types';

export interface OrchestratorConfig {
  maxConcurrency: number;
  timeout: number;
  retryAttempts: number;
  failFast: boolean;
  skipFlaky: boolean;
  randomizeOrder: boolean;
  seed?: number;
  tags?: string[];
  exclude?: string[];
  reportFormats: string[];
  metricsEnabled: boolean;
  notificationChannels?: string[];
}

export class TestOrchestrator extends EventEmitter {
  private logger: Logger;
  private runner: TestRunner;
  private reporter: TestReporter;
  private validator: TestValidator;
  private metrics: MetricsCollector;
  private config: OrchestratorConfig;
  private limiter: ReturnType<typeof pLimit>;
  private abortController: AbortController;
  private context: TestContext;
  private suites: Map<string, TestSuite>;
  private results: Map<string, TestResult>;
  private startTime: number;
  private phase: TestPhase;

  constructor(
    logger: Logger,
    config: OrchestratorConfig
  ) {
    super();
    this.logger = logger;
    this.config = config;
    this.limiter = pLimit(config.maxConcurrency);
    this.abortController = new AbortController();
    this.suites = new Map();
    this.results = new Map();
    this.startTime = 0;
    this.phase = TestPhase.IDLE;

    this.runner = new TestRunner(logger);
    this.reporter = new TestReporter(logger, config.reportFormats);
    this.validator = new TestValidator(logger);
    this.metrics = new MetricsCollector(logger);

    this.context = {
      environment: process.env.TEST_ENV || 'local',
      buildId: process.env.BUILD_ID || 'local-build',
      commitSha: process.env.COMMIT_SHA || 'local',
      branch: process.env.BRANCH || 'main',
      tags: config.tags || [],
      metadata: new Map()
    };

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.runner.on('test:start', (test) => {
      this.emit('test:start', test);
      this.metrics.recordTestStart(test);
    });

    this.runner.on('test:pass', (test, result) => {
      this.emit('test:pass', test, result);
      this.metrics.recordTestPass(test, result);
    });

    this.runner.on('test:fail', (test, error) => {
      this.emit('test:fail', test, error);
      this.metrics.recordTestFail(test, error);
      
      if (this.config.failFast) {
        this.abort('Test failed with fail-fast enabled');
      }
    });

    this.runner.on('test:skip', (test, reason) => {
      this.emit('test:skip', test, reason);
      this.metrics.recordTestSkip(test, reason);
    });

    this.runner.on('test:retry', (test, attempt) => {
      this.emit('test:retry', test, attempt);
      this.metrics.recordTestRetry(test, attempt);
    });

    process.on('SIGINT', () => this.abort('Received SIGINT'));
    process.on('SIGTERM', () => this.abort('Received SIGTERM'));
  }

  public async initialize(): Promise<void> {
    this.phase = TestPhase.INITIALIZING;
    this.logger.info('Initializing test orchestrator');

    try {
      // Validate environment
      await this.validator.validateEnvironment(this.context);

      // Setup test infrastructure
      await this.setupInfrastructure();

      // Load test suites
      await this.loadTestSuites();

      // Initialize reporters
      await this.reporter.initialize(this.context);

      // Initialize metrics collection
      if (this.config.metricsEnabled) {
        await this.metrics.initialize();
      }

      this.phase = TestPhase.READY;
      this.logger.info('Test orchestrator initialized successfully');
    } catch (error) {
      this.phase = TestPhase.ERROR;
      this.logger.error({ error }, 'Failed to initialize test orchestrator');
      throw error;
    }
  }

  private async setupInfrastructure(): Promise<void> {
    // Setup test databases
    if (process.env.TEST_DATABASE_URL) {
      await this.setupTestDatabase();
    }

    // Setup test cache
    if (process.env.TEST_REDIS_URL) {
      await this.setupTestCache();
    }

    // Setup mock servers
    await this.setupMockServers();

    // Setup test fixtures
    await this.loadFixtures();
  }

  private async setupTestDatabase(): Promise<void> {
    this.logger.info('Setting up test database');
    // Database setup logic here
  }

  private async setupTestCache(): Promise<void> {
    this.logger.info('Setting up test cache');
    // Redis setup logic here
  }

  private async setupMockServers(): Promise<void> {
    this.logger.info('Setting up mock servers');
    // Mock server setup logic here
  }

  private async loadFixtures(): Promise<void> {
    this.logger.info('Loading test fixtures');
    // Fixture loading logic here
  }

  private async loadTestSuites(): Promise<void> {
    this.logger.info('Loading test suites');
    
    // Discover and load test suites based on configuration
    const suiteFiles = await this.discoverTestSuites();
    
    for (const file of suiteFiles) {
      if (this.shouldSkipSuite(file)) {
        continue;
      }

      const suite = await this.loadSuite(file);
      if (suite) {
        this.suites.set(suite.id, suite);
      }
    }

    this.logger.info(`Loaded ${this.suites.size} test suites`);
  }

  private async discoverTestSuites(): Promise<string[]> {
    // Test suite discovery logic
    return [];
  }

  private shouldSkipSuite(file: string): boolean {
    if (this.config.exclude) {
      return this.config.exclude.some(pattern => file.includes(pattern));
    }
    return false;
  }

  private async loadSuite(file: string): Promise<TestSuite | null> {
    try {
      // Dynamic import and validation of test suite
      const module = await import(file);
      return this.validator.validateTestSuite(module.default);
    } catch (error) {
      this.logger.error({ error, file }, 'Failed to load test suite');
      return null;
    }
  }

  public async execute(): Promise<TestResult> {
    if (this.phase !== TestPhase.READY) {
      throw new Error(`Cannot execute tests in phase: ${this.phase}`);
    }

    this.phase = TestPhase.EXECUTING;
    this.startTime = Date.now();
    this.logger.info('Starting test execution');

    try {
      // Pre-execution hooks
      await this.runPreExecutionHooks();

      // Execute test suites
      const suiteResults = await this.executeSuites();

      // Post-execution hooks
      await this.runPostExecutionHooks();

      // Generate reports
      const report = await this.generateReports(suiteResults);

      // Collect final metrics
      const metrics = await this.collectFinalMetrics();

      // Notify stakeholders
      await this.notifyStakeholders(report, metrics);

      this.phase = TestPhase.COMPLETED;
      
      return {
        success: this.determineOverallSuccess(suiteResults),
        duration: Date.now() - this.startTime,
        suites: suiteResults,
        report,
        metrics
      };
    } catch (error) {
      this.phase = TestPhase.ERROR;
      this.logger.error({ error }, 'Test execution failed');
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async runPreExecutionHooks(): Promise<void> {
    this.logger.info('Running pre-execution hooks');
    // Hook execution logic
  }

  private async runPostExecutionHooks(): Promise<void> {
    this.logger.info('Running post-execution hooks');
    // Hook execution logic
  }

  private async executeSuites(): Promise<Map<string, TestResult>> {
    const results = new Map<string, TestResult>();
    const suiteArray = Array.from(this.suites.values());

    // Randomize order if configured
    if (this.config.randomizeOrder) {
      this.shuffleArray(suiteArray, this.config.seed);
    }

    // Execute suites with concurrency control
    const suitePromises = suiteArray.map(suite =>
      this.limiter(async () => {
        if (this.abortController.signal.aborted) {
          return null;
        }

        try {
          const result = await this.runner.executeSuite(
            suite,
            this.context,
            {
              timeout: this.config.timeout,
              retryAttempts: this.config.retryAttempts,
              skipFlaky: this.config.skipFlaky,
              signal: this.abortController.signal
            }
          );
          
          results.set(suite.id, result);
          return result;
        } catch (error) {
          this.logger.error({ error, suite: suite.id }, 'Suite execution failed');
          results.set(suite.id, {
            success: false,
            error: error as Error,
            duration: 0,
            tests: []
          });
          return null;
        }
      })
    );

    await Promise.all(suitePromises);
    return results;
  }

  private shuffleArray<T>(array: T[], seed?: number): void {
    const random = seed ? this.seededRandom(seed) : Math.random;
    
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [array[i], array[j]] = [array[j]!, array[i]!];
    }
  }

  private seededRandom(seed: number): () => number {
    return () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };
  }

  private async generateReports(results: Map<string, TestResult>): Promise<any> {
    this.logger.info('Generating test reports');
    return await this.reporter.generate(results, this.context);
  }

  private async collectFinalMetrics(): Promise<any> {
    this.logger.info('Collecting final metrics');
    return await this.metrics.collect();
  }

  private async notifyStakeholders(report: any, metrics: any): Promise<void> {
    if (!this.config.notificationChannels) {
      return;
    }

    this.logger.info('Notifying stakeholders');
    // Notification logic for Slack, email, etc.
  }

  private determineOverallSuccess(results: Map<string, TestResult>): boolean {
    for (const result of results.values()) {
      if (!result.success) {
        return false;
      }
    }
    return true;
  }

  public abort(reason: string): void {
    this.logger.warn({ reason }, 'Aborting test execution');
    this.abortController.abort();
    this.phase = TestPhase.ABORTED;
    this.emit('abort', reason);
  }

  private async cleanup(): Promise<void> {
    this.logger.info('Cleaning up test resources');

    try {
      // Cleanup test databases
      await this.cleanupTestDatabase();

      // Cleanup test cache
      await this.cleanupTestCache();

      // Cleanup mock servers
      await this.cleanupMockServers();

      // Close reporters
      await this.reporter.close();

      // Flush metrics
      await this.metrics.flush();

      this.logger.info('Cleanup completed successfully');
    } catch (error) {
      this.logger.error({ error }, 'Cleanup failed');
    }
  }

  private async cleanupTestDatabase(): Promise<void> {
    // Database cleanup logic
  }

  private async cleanupTestCache(): Promise<void> {
    // Redis cleanup logic
  }

  private async cleanupMockServers(): Promise<void> {
    // Mock server cleanup logic
  }

  public getStatus(): {
    phase: TestPhase;
    progress: number;
    elapsed: number;
    remaining: number;
    currentSuite?: string;
    metrics: any;
  } {
    const totalSuites = this.suites.size;
    const completedSuites = this.results.size;
    const progress = totalSuites > 0 ? (completedSuites / totalSuites) * 100 : 0;
    const elapsed = this.startTime ? Date.now() - this.startTime : 0;
    const averageTime = completedSuites > 0 ? elapsed / completedSuites : 0;
    const remaining = averageTime * (totalSuites - completedSuites);

    return {
      phase: this.phase,
      progress,
      elapsed,
      remaining,
      currentSuite: this.runner.getCurrentSuite(),
      metrics: this.metrics.getSnapshot()
    };
  }
}