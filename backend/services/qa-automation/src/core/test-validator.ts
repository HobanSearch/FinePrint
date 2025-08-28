import { Logger } from 'pino';
import { z } from 'zod';
import { TestSuite, TestCase, TestContext, TestType, TestPriority } from './types';

export class TestValidator {
  private logger: Logger;
  
  private readonly testCaseSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    type: z.nativeEnum(TestType),
    priority: z.nativeEnum(TestPriority),
    tags: z.array(z.string()),
    timeout: z.number().positive().optional(),
    retries: z.number().nonnegative().optional(),
    flaky: z.boolean().optional(),
    skip: z.boolean().optional(),
    only: z.boolean().optional(),
    test: z.function(),
    metadata: z.record(z.any()).optional()
  });

  private readonly testSuiteSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    type: z.nativeEnum(TestType),
    priority: z.nativeEnum(TestPriority),
    tags: z.array(z.string()),
    parallel: z.boolean().optional(),
    timeout: z.number().positive().optional(),
    retries: z.number().nonnegative().optional(),
    tests: z.array(z.lazy(() => this.testCaseSchema)),
    metadata: z.record(z.any()).optional()
  });

  private readonly contextSchema = z.object({
    environment: z.string().min(1),
    buildId: z.string().min(1),
    commitSha: z.string().min(1),
    branch: z.string().min(1),
    tags: z.array(z.string()),
    metadata: z.instanceof(Map)
  });

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public async validateEnvironment(context: TestContext): Promise<void> {
    this.logger.info('Validating test environment');

    try {
      // Validate context structure
      this.contextSchema.parse(context);

      // Check required environment variables
      this.validateEnvironmentVariables();

      // Check system dependencies
      await this.validateSystemDependencies();

      // Check network connectivity
      await this.validateNetworkConnectivity();

      // Check resource availability
      await this.validateResourceAvailability();

      // Check service dependencies
      await this.validateServiceDependencies();

      this.logger.info('Environment validation successful');
    } catch (error) {
      this.logger.error({ error }, 'Environment validation failed');
      throw new Error(`Environment validation failed: ${error}`);
    }
  }

  private validateEnvironmentVariables(): void {
    const required = [
      'NODE_ENV',
      'TEST_ENV'
    ];

    const missing = required.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate environment-specific variables
    const testEnv = process.env.TEST_ENV;
    
    switch (testEnv) {
      case 'local':
        this.validateLocalEnvironment();
        break;
      case 'ci':
        this.validateCIEnvironment();
        break;
      case 'staging':
        this.validateStagingEnvironment();
        break;
      case 'production':
        throw new Error('Cannot run tests in production environment');
      default:
        this.logger.warn(`Unknown test environment: ${testEnv}`);
    }
  }

  private validateLocalEnvironment(): void {
    const localVars = [
      'DATABASE_URL',
      'REDIS_URL'
    ];

    const missing = localVars.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
      this.logger.warn(`Missing local environment variables: ${missing.join(', ')}`);
    }
  }

  private validateCIEnvironment(): void {
    const ciVars = [
      'CI',
      'BUILD_ID',
      'COMMIT_SHA',
      'BRANCH'
    ];

    const missing = ciVars.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
      throw new Error(`Missing CI environment variables: ${missing.join(', ')}`);
    }
  }

  private validateStagingEnvironment(): void {
    const stagingVars = [
      'STAGING_URL',
      'STAGING_API_KEY'
    ];

    const missing = stagingVars.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
      throw new Error(`Missing staging environment variables: ${missing.join(', ')}`);
    }
  }

  private async validateSystemDependencies(): Promise<void> {
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]!);
    
    if (majorVersion < 20) {
      throw new Error(`Node.js version ${nodeVersion} is not supported. Required: >=20.0.0`);
    }

    // Check available memory
    const totalMemory = process.memoryUsage().heapTotal;
    const minMemory = 512 * 1024 * 1024; // 512MB
    
    if (totalMemory < minMemory) {
      this.logger.warn(`Low memory available: ${totalMemory / 1024 / 1024}MB`);
    }

    // Check disk space
    await this.checkDiskSpace();
  }

  private async checkDiskSpace(): Promise<void> {
    // Implementation would check available disk space
    // Using fs.statfs or similar
  }

  private async validateNetworkConnectivity(): Promise<void> {
    const endpoints = [
      process.env.API_URL || 'http://localhost:4000',
      process.env.DATABASE_URL || 'postgresql://localhost:5432',
      process.env.REDIS_URL || 'redis://localhost:6379'
    ];

    for (const endpoint of endpoints) {
      try {
        await this.checkEndpoint(endpoint);
      } catch (error) {
        this.logger.warn({ endpoint, error }, 'Endpoint not reachable');
      }
    }
  }

  private async checkEndpoint(endpoint: string): Promise<void> {
    // Implementation would ping the endpoint
    // Using fetch or net.connect
  }

  private async validateResourceAvailability(): Promise<void> {
    // Check database connection
    if (process.env.DATABASE_URL) {
      await this.validateDatabaseConnection();
    }

    // Check Redis connection
    if (process.env.REDIS_URL) {
      await this.validateRedisConnection();
    }

    // Check Elasticsearch connection
    if (process.env.ELASTICSEARCH_URL) {
      await this.validateElasticsearchConnection();
    }

    // Check Ollama/LLM availability
    if (process.env.OLLAMA_URL) {
      await this.validateOllamaConnection();
    }
  }

  private async validateDatabaseConnection(): Promise<void> {
    // Implementation would test database connection
    this.logger.info('Validating database connection');
  }

  private async validateRedisConnection(): Promise<void> {
    // Implementation would test Redis connection
    this.logger.info('Validating Redis connection');
  }

  private async validateElasticsearchConnection(): Promise<void> {
    // Implementation would test Elasticsearch connection
    this.logger.info('Validating Elasticsearch connection');
  }

  private async validateOllamaConnection(): Promise<void> {
    // Implementation would test Ollama connection
    this.logger.info('Validating Ollama connection');
  }

  private async validateServiceDependencies(): Promise<void> {
    const services = [
      { name: 'Model Management', url: process.env.MODEL_MANAGEMENT_URL },
      { name: 'A/B Testing', url: process.env.AB_TESTING_URL },
      { name: 'Learning Pipeline', url: process.env.LEARNING_PIPELINE_URL }
    ];

    for (const service of services) {
      if (service.url) {
        try {
          await this.checkServiceHealth(service.name, service.url);
        } catch (error) {
          this.logger.warn({ service: service.name, error }, 'Service not healthy');
        }
      }
    }
  }

  private async checkServiceHealth(name: string, url: string): Promise<void> {
    // Implementation would check service health endpoint
    this.logger.info(`Checking health of ${name} at ${url}`);
  }

  public validateTestSuite(suite: any): TestSuite | null {
    try {
      const validated = this.testSuiteSchema.parse(suite);
      
      // Additional validations
      if (validated.tests.length === 0) {
        this.logger.warn(`Test suite '${validated.name}' has no tests`);
      }

      // Check for duplicate test IDs
      const testIds = new Set<string>();
      for (const test of validated.tests) {
        if (testIds.has(test.id)) {
          throw new Error(`Duplicate test ID found: ${test.id}`);
        }
        testIds.add(test.id);
      }

      // Validate test priorities
      const criticalTests = validated.tests.filter(t => t.priority === TestPriority.CRITICAL);
      if (criticalTests.length === 0) {
        this.logger.warn(`Test suite '${validated.name}' has no critical tests`);
      }

      return validated as TestSuite;
    } catch (error) {
      this.logger.error({ error, suite: suite?.name }, 'Test suite validation failed');
      return null;
    }
  }

  public validateTestCase(test: any): TestCase | null {
    try {
      const validated = this.testCaseSchema.parse(test);
      
      // Additional validations
      if (validated.timeout && validated.timeout > 60000) {
        this.logger.warn(`Test '${validated.name}' has very long timeout: ${validated.timeout}ms`);
      }

      if (validated.retries && validated.retries > 3) {
        this.logger.warn(`Test '${validated.name}' has many retries: ${validated.retries}`);
      }

      if (validated.flaky && validated.priority === TestPriority.CRITICAL) {
        this.logger.warn(`Critical test '${validated.name}' is marked as flaky`);
      }

      return validated as TestCase;
    } catch (error) {
      this.logger.error({ error, test: test?.name }, 'Test case validation failed');
      return null;
    }
  }

  public validateTestData(data: any, schema: z.ZodSchema): any {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
        throw new Error(`Test data validation failed: ${issues.join(', ')}`);
      }
      throw error;
    }
  }

  public validateApiResponse(response: any, expectedSchema: z.ZodSchema): void {
    try {
      expectedSchema.parse(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
        throw new Error(`API response validation failed: ${issues.join(', ')}`);
      }
      throw error;
    }
  }

  public validatePerformanceMetrics(metrics: any, thresholds: any): void {
    // Validate response time
    if (metrics.responseTime && thresholds.responseTime) {
      if (metrics.responseTime.p95 > thresholds.responseTime.p95) {
        throw new Error(`P95 response time ${metrics.responseTime.p95}ms exceeds threshold ${thresholds.responseTime.p95}ms`);
      }
      
      if (metrics.responseTime.p99 > thresholds.responseTime.p99) {
        throw new Error(`P99 response time ${metrics.responseTime.p99}ms exceeds threshold ${thresholds.responseTime.p99}ms`);
      }
    }

    // Validate error rate
    if (metrics.errorRate && thresholds.errorRate) {
      if (metrics.errorRate > thresholds.errorRate) {
        throw new Error(`Error rate ${metrics.errorRate}% exceeds threshold ${thresholds.errorRate}%`);
      }
    }

    // Validate throughput
    if (metrics.throughput && thresholds.throughput) {
      if (metrics.throughput.rps < thresholds.throughput.minRps) {
        throw new Error(`Throughput ${metrics.throughput.rps} RPS below minimum ${thresholds.throughput.minRps} RPS`);
      }
    }
  }

  public validateSecurityScan(scan: any, policy: any): void {
    // Check for critical vulnerabilities
    const criticalVulns = scan.vulnerabilities.filter((v: any) => v.severity === 'critical');
    if (criticalVulns.length > 0 && !policy.allowCritical) {
      throw new Error(`Found ${criticalVulns.length} critical vulnerabilities`);
    }

    // Check for high vulnerabilities
    const highVulns = scan.vulnerabilities.filter((v: any) => v.severity === 'high');
    if (highVulns.length > policy.maxHighVulnerabilities) {
      throw new Error(`Found ${highVulns.length} high vulnerabilities, max allowed: ${policy.maxHighVulnerabilities}`);
    }

    // Check OWASP compliance
    if (policy.requireOwaspCompliance) {
      const owaspViolations = scan.compliance.filter((c: any) => 
        c.standard === 'OWASP' && !c.passed
      );
      if (owaspViolations.length > 0) {
        throw new Error(`OWASP compliance check failed: ${owaspViolations.length} violations`);
      }
    }
  }

  public validateAccessibility(results: any, standards: string[]): void {
    // Check for violations
    if (results.violations.length > 0) {
      const criticalViolations = results.violations.filter((v: any) => 
        v.impact === 'critical' || v.impact === 'serious'
      );
      
      if (criticalViolations.length > 0) {
        throw new Error(`Found ${criticalViolations.length} critical accessibility violations`);
      }
    }

    // Validate against specific standards
    for (const standard of standards) {
      const standardViolations = results.violations.filter((v: any) =>
        v.tags.includes(standard.toLowerCase())
      );
      
      if (standardViolations.length > 0) {
        this.logger.warn(`${standard} compliance: ${standardViolations.length} violations`);
      }
    }
  }

  public validateModelMetrics(metrics: any, baseline: any, tolerance: number = 0.05): void {
    // Validate accuracy
    if (metrics.accuracy < baseline.accuracy * (1 - tolerance)) {
      throw new Error(`Model accuracy ${metrics.accuracy} below baseline ${baseline.accuracy}`);
    }

    // Validate latency
    if (metrics.latency.p95 > baseline.latency.p95 * (1 + tolerance)) {
      throw new Error(`Model latency ${metrics.latency.p95}ms exceeds baseline ${baseline.latency.p95}ms`);
    }

    // Check for model drift
    if (metrics.driftScore && metrics.driftScore > 0.1) {
      this.logger.warn(`High model drift detected: ${metrics.driftScore}`);
    }

    // Check for bias
    if (metrics.biasScore && metrics.biasScore > 0.05) {
      this.logger.warn(`Model bias detected: ${metrics.biasScore}`);
    }
  }
}