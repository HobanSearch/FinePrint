import { EventEmitter } from 'events';
import { Logger } from 'pino';
import { performance } from 'perf_hooks';
import { 
  TestCase, 
  TestSuite, 
  TestResult, 
  TestCaseResult,
  TestStatus,
  TestContext,
  TestFailure 
} from './types';

export interface RunnerOptions {
  timeout: number;
  retryAttempts: number;
  skipFlaky: boolean;
  signal?: AbortSignal;
  captureScreenshots?: boolean;
  captureVideos?: boolean;
  captureTraces?: boolean;
  captureLogs?: boolean;
}

export class TestRunner extends EventEmitter {
  private logger: Logger;
  private currentSuite?: string;
  private currentTest?: string;
  private testTimeout?: NodeJS.Timeout;
  private logs: string[] = [];

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    this.setupLogCapture();
  }

  private setupLogCapture(): void {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      this.logs.push(`[LOG] ${args.join(' ')}`);
      originalLog.apply(console, args);
    };

    console.error = (...args) => {
      this.logs.push(`[ERROR] ${args.join(' ')}`);
      originalError.apply(console, args);
    };

    console.warn = (...args) => {
      this.logs.push(`[WARN] ${args.join(' ')}`);
      originalWarn.apply(console, args);
    };
  }

  public async executeSuite(
    suite: TestSuite,
    context: TestContext,
    options: RunnerOptions
  ): Promise<TestResult> {
    this.currentSuite = suite.id;
    const startTime = performance.now();
    const results: TestCaseResult[] = [];
    const failures: TestFailure[] = [];
    let suiteSuccess = true;

    this.logger.info({ suite: suite.name }, 'Starting test suite execution');
    this.emit('suite:start', suite);

    try {
      // Run beforeAll hook
      if (suite.beforeAll) {
        await this.runHook('beforeAll', suite.beforeAll, options.timeout);
      }

      // Execute tests
      const tests = this.filterTests(suite.tests, options);
      
      if (suite.parallel) {
        // Run tests in parallel
        const testPromises = tests.map(test => 
          this.executeTest(test, context, options)
        );
        const testResults = await Promise.allSettled(testPromises);
        
        testResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (result.value.status === TestStatus.FAILED) {
              suiteSuccess = false;
              failures.push({
                test: tests[index]!.name,
                error: result.value.error!
              });
            }
          } else {
            suiteSuccess = false;
            results.push(this.createErrorResult(tests[index]!, result.reason));
            failures.push({
              test: tests[index]!.name,
              error: result.reason
            });
          }
        });
      } else {
        // Run tests sequentially
        for (const test of tests) {
          if (options.signal?.aborted) {
            break;
          }

          try {
            const result = await this.executeTest(test, context, options);
            results.push(result);
            
            if (result.status === TestStatus.FAILED) {
              suiteSuccess = false;
              failures.push({
                test: test.name,
                error: result.error!
              });
              
              if (options.signal?.aborted) {
                break;
              }
            }
          } catch (error) {
            suiteSuccess = false;
            const errorResult = this.createErrorResult(test, error as Error);
            results.push(errorResult);
            failures.push({
              test: test.name,
              error: error as Error
            });
          }
        }
      }

      // Execute nested suites
      if (suite.suites) {
        for (const nestedSuite of suite.suites) {
          if (options.signal?.aborted) {
            break;
          }

          const nestedResult = await this.executeSuite(nestedSuite, context, options);
          results.push(...nestedResult.tests);
          
          if (!nestedResult.success) {
            suiteSuccess = false;
            if (nestedResult.failures) {
              failures.push(...nestedResult.failures);
            }
          }
        }
      }

    } catch (error) {
      this.logger.error({ error, suite: suite.name }, 'Suite execution failed');
      suiteSuccess = false;
      failures.push({
        test: 'suite',
        error: error as Error
      });
    } finally {
      // Run afterAll hook
      if (suite.afterAll) {
        try {
          await this.runHook('afterAll', suite.afterAll, options.timeout);
        } catch (error) {
          this.logger.error({ error }, 'AfterAll hook failed');
        }
      }

      this.currentSuite = undefined;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    this.emit('suite:end', suite, { success: suiteSuccess, duration });

    return {
      success: suiteSuccess,
      duration,
      startTime,
      endTime,
      tests: results,
      failures: failures.length > 0 ? failures : undefined,
      metadata: {
        suite: suite.name,
        totalTests: results.length,
        passed: results.filter(r => r.status === TestStatus.PASSED).length,
        failed: results.filter(r => r.status === TestStatus.FAILED).length,
        skipped: results.filter(r => r.status === TestStatus.SKIPPED).length
      }
    };
  }

  private filterTests(tests: TestCase[], options: RunnerOptions): TestCase[] {
    return tests.filter(test => {
      if (test.skip) {
        this.emit('test:skip', test, 'Marked as skip');
        return false;
      }

      if (test.flaky && options.skipFlaky) {
        this.emit('test:skip', test, 'Flaky test skipped');
        return false;
      }

      // Check for .only tests
      const hasOnly = tests.some(t => t.only);
      if (hasOnly && !test.only) {
        this.emit('test:skip', test, 'Other tests marked as only');
        return false;
      }

      return true;
    });
  }

  private async executeTest(
    test: TestCase,
    context: TestContext,
    options: RunnerOptions
  ): Promise<TestCaseResult> {
    this.currentTest = test.id;
    const maxAttempts = test.retries ?? options.retryAttempts;
    let lastError: Error | undefined;
    let attempts = 0;

    this.emit('test:start', test);

    for (let attempt = 1; attempt <= maxAttempts + 1; attempt++) {
      attempts = attempt;
      this.logs = []; // Clear logs for each attempt

      if (attempt > 1) {
        this.emit('test:retry', test, attempt);
        this.logger.info({ test: test.name, attempt }, 'Retrying test');
      }

      try {
        const result = await this.runTest(test, context, options);
        
        if (result.status === TestStatus.PASSED) {
          this.emit('test:pass', test, result);
          this.currentTest = undefined;
          return result;
        }

        lastError = result.error;
      } catch (error) {
        lastError = error as Error;
        this.logger.error({ error, test: test.name }, 'Test execution error');
      }

      if (options.signal?.aborted) {
        break;
      }
    }

    // Test failed after all retries
    const failedResult: TestCaseResult = {
      id: test.id,
      name: test.name,
      status: TestStatus.FAILED,
      duration: 0,
      attempts,
      error: lastError,
      assertions: [],
      logs: options.captureLogs ? [...this.logs] : undefined,
      metadata: {
        flaky: attempts > 1,
        lastAttempt: attempts
      }
    };

    this.emit('test:fail', test, lastError);
    this.currentTest = undefined;
    return failedResult;
  }

  private async runTest(
    test: TestCase,
    context: TestContext,
    options: RunnerOptions
  ): Promise<TestCaseResult> {
    const startTime = performance.now();
    const timeout = test.timeout ?? options.timeout;
    const assertions: any[] = [];

    try {
      // Run beforeEach hook
      if (test.beforeEach) {
        await this.runHook('beforeEach', test.beforeEach, timeout);
      }

      // Execute test with timeout
      await this.runWithTimeout(
        async () => {
          await test.test();
          
          // Run assertions if provided
          if (test.assertions) {
            for (const assertion of test.assertions) {
              const result = await this.runAssertion(assertion);
              assertions.push(result);
              
              if (!result.passed) {
                throw new Error(result.message || 'Assertion failed');
              }
            }
          }
        },
        timeout,
        `Test '${test.name}' timed out after ${timeout}ms`
      );

      // Run afterEach hook
      if (test.afterEach) {
        await this.runHook('afterEach', test.afterEach, timeout);
      }

      const endTime = performance.now();

      return {
        id: test.id,
        name: test.name,
        status: TestStatus.PASSED,
        duration: endTime - startTime,
        attempts: 1,
        assertions,
        logs: options.captureLogs ? [...this.logs] : undefined,
        metadata: test.metadata
      };

    } catch (error) {
      const endTime = performance.now();

      // Run afterEach hook even if test failed
      if (test.afterEach) {
        try {
          await this.runHook('afterEach', test.afterEach, timeout);
        } catch (hookError) {
          this.logger.error({ hookError }, 'AfterEach hook failed');
        }
      }

      return {
        id: test.id,
        name: test.name,
        status: TestStatus.FAILED,
        duration: endTime - startTime,
        attempts: 1,
        error: error as Error,
        assertions,
        logs: options.captureLogs ? [...this.logs] : undefined,
        metadata: test.metadata
      };
    }
  }

  private async runHook(
    name: string,
    hook: () => Promise<void>,
    timeout: number
  ): Promise<void> {
    try {
      await this.runWithTimeout(
        hook,
        timeout,
        `Hook '${name}' timed out after ${timeout}ms`
      );
    } catch (error) {
      this.logger.error({ error, hook: name }, 'Hook execution failed');
      throw error;
    }
  }

  private async runWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
    timeoutMessage: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async runAssertion(assertion: any): Promise<any> {
    try {
      const result = await assertion.validate(assertion.actual);
      return {
        passed: result,
        description: assertion.description,
        actual: assertion.actual,
        expected: assertion.expected,
        message: result ? undefined : assertion.message
      };
    } catch (error) {
      return {
        passed: false,
        description: assertion.description,
        actual: assertion.actual,
        expected: assertion.expected,
        message: (error as Error).message
      };
    }
  }

  private createErrorResult(test: TestCase, error: Error): TestCaseResult {
    return {
      id: test.id,
      name: test.name,
      status: TestStatus.ERROR,
      duration: 0,
      attempts: 0,
      error,
      assertions: [],
      logs: [...this.logs],
      metadata: {
        ...test.metadata,
        errorType: error.constructor.name,
        errorMessage: error.message,
        errorStack: error.stack
      }
    };
  }

  public getCurrentSuite(): string | undefined {
    return this.currentSuite;
  }

  public getCurrentTest(): string | undefined {
    return this.currentTest;
  }

  public stop(): void {
    if (this.testTimeout) {
      clearTimeout(this.testTimeout);
    }
    this.removeAllListeners();
  }
}