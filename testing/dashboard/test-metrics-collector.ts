import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface TestMetrics {
  timestamp: string;
  build: string;
  branch: string;
  commit: string;
  platform: string;
  coverage: CoverageMetrics;
  tests: TestSuiteMetrics;
  performance: PerformanceMetrics;
  security: SecurityMetrics;
  accessibility: AccessibilityMetrics;
  quality: QualityMetrics;
}

export interface CoverageMetrics {
  overall: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  frontend: CoverageDetail;
  backend: CoverageDetail;
  mobile: CoverageDetail;
  extension: CoverageDetail;
}

export interface CoverageDetail {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
  covered: number;
  total: number;
}

export interface TestSuiteMetrics {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  suites: {
    unit: TestSuiteDetail;
    integration: TestSuiteDetail;
    e2e: TestSuiteDetail;
    mobile: TestSuiteDetail;
    extension: TestSuiteDetail;
    ai: TestSuiteDetail;
  };
}

export interface TestSuiteDetail {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  flaky: number;
}

export interface PerformanceMetrics {
  loadTest: {
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
    throughput: number;
  };
  stressTest: {
    maxUsers: number;
    breakingPoint: number;
    degradationPoint: number;
  };
  spikeTest: {
    peakResponseTime: number;
    recoveryTime: number;
  };
  lighthouse: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
}

export interface SecurityMetrics {
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  tests: {
    sqlInjection: boolean;
    xss: boolean;
    csrf: boolean;
    authentication: boolean;
    authorization: boolean;
    headers: boolean;
  };
  owasp: {
    a01: number; // Broken Access Control
    a02: number; // Cryptographic Failures
    a03: number; // Injection
    a04: number; // Insecure Design
    a05: number; // Security Misconfiguration
    a06: number; // Vulnerable Components
    a07: number; // Authentication Failures
    a08: number; // Software Integrity Failures
    a09: number; // Logging Monitoring Failures
    a10: number; // Server Side Request Forgery
  };
}

export interface AccessibilityMetrics {
  wcagLevel: 'A' | 'AA' | 'AAA';
  violations: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  compliance: {
    perceivable: number;
    operable: number;
    understandable: number;
    robust: number;
  };
  score: number;
}

export interface QualityMetrics {
  codeQuality: {
    maintainability: number;
    reliability: number;
    security: number;
    duplication: number;
  };
  technical_debt: {
    ratio: number;
    hours: number;
  };
  bugs: number;
  vulnerabilities: number;
  hotspots: number;
  smells: number;
}

export class TestMetricsCollector {
  private resultsDir: string;
  private outputDir: string;

  constructor(resultsDir: string = './test-results', outputDir: string = './test-metrics') {
    this.resultsDir = resultsDir;
    this.outputDir = outputDir;
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async collectMetrics(): Promise<TestMetrics> {
    const timestamp = new Date().toISOString();
    const build = process.env.GITHUB_RUN_NUMBER || process.env.BUILD_NUMBER || 'local';
    const branch = process.env.GITHUB_REF_NAME || this.getCurrentBranch();
    const commit = process.env.GITHUB_SHA || this.getCurrentCommit();
    const platform = process.env.RUNNER_OS || process.platform;

    const metrics: TestMetrics = {
      timestamp,
      build,
      branch,
      commit,
      platform,
      coverage: await this.collectCoverageMetrics(),
      tests: await this.collectTestMetrics(),
      performance: await this.collectPerformanceMetrics(),
      security: await this.collectSecurityMetrics(),
      accessibility: await this.collectAccessibilityMetrics(),
      quality: await this.collectQualityMetrics()
    };

    // Save metrics to file
    const metricsFile = path.join(this.outputDir, `metrics-${timestamp.replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));

    // Update latest metrics
    const latestFile = path.join(this.outputDir, 'latest-metrics.json');
    fs.writeFileSync(latestFile, JSON.stringify(metrics, null, 2));

    return metrics;
  }

  private async collectCoverageMetrics(): Promise<CoverageMetrics> {
    const coverage: CoverageMetrics = {
      overall: { lines: 0, functions: 0, branches: 0, statements: 0 },
      frontend: { lines: 0, functions: 0, branches: 0, statements: 0, covered: 0, total: 0 },
      backend: { lines: 0, functions: 0, branches: 0, statements: 0, covered: 0, total: 0 },
      mobile: { lines: 0, functions: 0, branches: 0, statements: 0, covered: 0, total: 0 },
      extension: { lines: 0, functions: 0, branches: 0, statements: 0, covered: 0, total: 0 }
    };

    // Collect backend coverage
    const backendSummary = path.join(this.resultsDir, 'backend/coverage/coverage-summary.json');
    if (fs.existsSync(backendSummary)) {
      const backendCov = JSON.parse(fs.readFileSync(backendSummary, 'utf8'));
      coverage.backend = {
        lines: backendCov.total.lines.pct,
        functions: backendCov.total.functions.pct,
        branches: backendCov.total.branches.pct,
        statements: backendCov.total.statements.pct,
        covered: backendCov.total.lines.covered,
        total: backendCov.total.lines.total
      };
    }

    // Collect frontend coverage
    const frontendSummary = path.join(this.resultsDir, 'frontend/coverage/coverage-summary.json');
    if (fs.existsSync(frontendSummary)) {
      const frontendCov = JSON.parse(fs.readFileSync(frontendSummary, 'utf8'));
      coverage.frontend = {
        lines: frontendCov.total.lines.pct,
        functions: frontendCov.total.functions.pct,
        branches: frontendCov.total.branches.pct,
        statements: frontendCov.total.statements.pct,
        covered: frontendCov.total.lines.covered,
        total: frontendCov.total.lines.total
      };
    }

    // Collect mobile coverage
    const mobileSummary = path.join(this.resultsDir, 'mobile/coverage/coverage-summary.json');
    if (fs.existsSync(mobileSummary)) {
      const mobileCov = JSON.parse(fs.readFileSync(mobileSummary, 'utf8'));
      coverage.mobile = {
        lines: mobileCov.total.lines.pct,
        functions: mobileCov.total.functions.pct,
        branches: mobileCov.total.branches.pct,
        statements: mobileCov.total.statements.pct,
        covered: mobileCov.total.lines.covered,
        total: mobileCov.total.lines.total
      };
    }

    // Collect extension coverage
    const extensionSummary = path.join(this.resultsDir, 'extension/coverage/coverage-summary.json');
    if (fs.existsSync(extensionSummary)) {
      const extensionCov = JSON.parse(fs.readFileSync(extensionSummary, 'utf8'));
      coverage.extension = {
        lines: extensionCov.total.lines.pct,
        functions: extensionCov.total.functions.pct,
        branches: extensionCov.total.branches.pct,
        statements: extensionCov.total.statements.pct,
        covered: extensionCov.total.lines.covered,
        total: extensionCov.total.lines.total
      };
    }

    // Calculate overall coverage
    const platforms = [coverage.frontend, coverage.backend, coverage.mobile, coverage.extension];
    const validPlatforms = platforms.filter(p => p.total > 0);
    
    if (validPlatforms.length > 0) {
      coverage.overall.lines = validPlatforms.reduce((sum, p) => sum + p.lines, 0) / validPlatforms.length;
      coverage.overall.functions = validPlatforms.reduce((sum, p) => sum + p.functions, 0) / validPlatforms.length;
      coverage.overall.branches = validPlatforms.reduce((sum, p) => sum + p.branches, 0) / validPlatforms.length;
      coverage.overall.statements = validPlatforms.reduce((sum, p) => sum + p.statements, 0) / validPlatforms.length;
    }

    return coverage;
  }

  private async collectTestMetrics(): Promise<TestSuiteMetrics> {
    const tests: TestSuiteMetrics = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      suites: {
        unit: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, flaky: 0 },
        integration: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, flaky: 0 },
        e2e: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, flaky: 0 },
        mobile: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, flaky: 0 },
        extension: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, flaky: 0 },
        ai: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, flaky: 0 }
      }
    };

    // Collect Jest results (unit/integration)
    const jestResults = path.join(this.resultsDir, 'backend/jest-results.json');
    if (fs.existsSync(jestResults)) {
      const jest = JSON.parse(fs.readFileSync(jestResults, 'utf8'));
      
      tests.suites.unit.total += jest.numTotalTests || 0;
      tests.suites.unit.passed += jest.numPassedTests || 0;
      tests.suites.unit.failed += jest.numFailedTests || 0;
      tests.suites.unit.skipped += jest.numPendingTests || 0;
      tests.suites.unit.duration += jest.testResults?.reduce((sum: number, result: any) => 
        sum + (result.perfStats?.end - result.perfStats?.start || 0), 0) || 0;
    }

    // Collect Playwright results (E2E)
    const playwrightResults = path.join(this.resultsDir, 'playwright-results.json');
    if (fs.existsSync(playwrightResults)) {
      const playwright = JSON.parse(fs.readFileSync(playwrightResults, 'utf8'));
      
      tests.suites.e2e.total += playwright.stats?.total || 0;
      tests.suites.e2e.passed += playwright.stats?.passed || 0;
      tests.suites.e2e.failed += playwright.stats?.failed || 0;
      tests.suites.e2e.skipped += playwright.stats?.skipped || 0;
      tests.suites.e2e.duration += playwright.stats?.duration || 0;
      tests.suites.e2e.flaky += playwright.stats?.flaky || 0;
    }

    // Collect Detox results (Mobile)
    const detoxResults = path.join(this.resultsDir, 'mobile/detox-results.json');
    if (fs.existsSync(detoxResults)) {
      const detox = JSON.parse(fs.readFileSync(detoxResults, 'utf8'));
      
      tests.suites.mobile.total += detox.numTotalTests || 0;
      tests.suites.mobile.passed += detox.numPassedTests || 0;
      tests.suites.mobile.failed += detox.numFailedTests || 0;
      tests.suites.mobile.skipped += detox.numPendingTests || 0;
      tests.suites.mobile.duration += detox.testResults?.reduce((sum: number, result: any) => 
        sum + (result.perfStats?.end - result.perfStats?.start || 0), 0) || 0;
    }

    // Collect Extension test results
    const extensionResults = path.join(this.resultsDir, 'extension/test-results.json');
    if (fs.existsSync(extensionResults)) {
      const extension = JSON.parse(fs.readFileSync(extensionResults, 'utf8'));
      
      tests.suites.extension.total += extension.numTotalTests || 0;
      tests.suites.extension.passed += extension.numPassedTests || 0;
      tests.suites.extension.failed += extension.numFailedTests || 0;
      tests.suites.extension.skipped += extension.numPendingTests || 0;
      tests.suites.extension.duration += extension.testResults?.reduce((sum: number, result: any) => 
        sum + (result.perfStats?.end - result.perfStats?.start || 0), 0) || 0;
    }

    // Collect AI validation results
    const aiResults = path.join(this.resultsDir, 'ai-validation-results.json');
    if (fs.existsSync(aiResults)) {
      const ai = JSON.parse(fs.readFileSync(aiResults, 'utf8'));
      
      tests.suites.ai.total += ai.numTotalTests || 0;
      tests.suites.ai.passed += ai.numPassedTests || 0;
      tests.suites.ai.failed += ai.numFailedTests || 0;
      tests.suites.ai.duration += ai.testResults?.reduce((sum: number, result: any) => 
        sum + (result.perfStats?.end - result.perfStats?.start || 0), 0) || 0;
    }

    // Calculate totals
    Object.values(tests.suites).forEach(suite => {
      tests.total += suite.total;
      tests.passed += suite.passed;
      tests.failed += suite.failed;
      tests.skipped += suite.skipped;
      tests.duration += suite.duration;
    });

    return tests;
  }

  private async collectPerformanceMetrics(): Promise<PerformanceMetrics> {
    const performance: PerformanceMetrics = {
      loadTest: {
        avgResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 0,
        throughput: 0
      },
      stressTest: {
        maxUsers: 0,
        breakingPoint: 0,
        degradationPoint: 0
      },
      spikeTest: {
        peakResponseTime: 0,
        recoveryTime: 0
      },
      lighthouse: {
        performance: 0,
        accessibility: 0,
        bestPractices: 0,
        seo: 0
      }
    };

    // Collect k6 load test results
    const k6Results = path.join(this.resultsDir, 'k6-results/load-test-results.json');
    if (fs.existsSync(k6Results)) {
      const k6 = JSON.parse(fs.readFileSync(k6Results, 'utf8'));
      
      performance.loadTest.avgResponseTime = k6.metrics?.http_req_duration?.avg || 0;
      performance.loadTest.p95ResponseTime = k6.metrics?.http_req_duration?.p95 || 0;
      performance.loadTest.p99ResponseTime = k6.metrics?.http_req_duration?.p99 || 0;
      performance.loadTest.errorRate = k6.metrics?.http_req_failed?.rate || 0;
      performance.loadTest.throughput = k6.metrics?.http_reqs?.rate || 0;
    }

    // Collect Lighthouse results
    const lighthouseResults = path.join(this.resultsDir, 'lighthouse-results.json');
    if (fs.existsSync(lighthouseResults)) {
      const lighthouse = JSON.parse(fs.readFileSync(lighthouseResults, 'utf8'));
      
      performance.lighthouse.performance = lighthouse.categories?.performance?.score * 100 || 0;
      performance.lighthouse.accessibility = lighthouse.categories?.accessibility?.score * 100 || 0;
      performance.lighthouse.bestPractices = lighthouse.categories?.['best-practices']?.score * 100 || 0;
      performance.lighthouse.seo = lighthouse.categories?.seo?.score * 100 || 0;
    }

    return performance;
  }

  private async collectSecurityMetrics(): Promise<SecurityMetrics> {
    const security: SecurityMetrics = {
      vulnerabilities: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      tests: {
        sqlInjection: false,
        xss: false,
        csrf: false,
        authentication: false,
        authorization: false,
        headers: false
      },
      owasp: {
        a01: 0, a02: 0, a03: 0, a04: 0, a05: 0,
        a06: 0, a07: 0, a08: 0, a09: 0, a10: 0
      }
    };

    // Collect Trivy scan results
    const trivyResults = path.join(this.resultsDir, 'security/trivy-results.json');
    if (fs.existsExists(trivyResults)) {
      const trivy = JSON.parse(fs.readFileSync(trivyResults, 'utf8'));
      
      trivy.Results?.forEach((result: any) => {
        result.Vulnerabilities?.forEach((vuln: any) => {
          switch (vuln.Severity?.toLowerCase()) {
            case 'critical':
              security.vulnerabilities.critical++;
              break;
            case 'high':
              security.vulnerabilities.high++;
              break;
            case 'medium':
              security.vulnerabilities.medium++;
              break;
            case 'low':
              security.vulnerabilities.low++;
              break;
          }
        });
      });
    }

    // Collect security test results
    const securityTestResults = path.join(this.resultsDir, 'security/security-test-results.json');
    if (fs.existsSync(securityTestResults)) {
      const securityTests = JSON.parse(fs.readFileSync(securityTestResults, 'utf8'));
      
      security.tests.sqlInjection = securityTests.tests?.find((t: any) => t.name === 'SQL Injection')?.passed || false;
      security.tests.xss = securityTests.tests?.find((t: any) => t.name === 'XSS')?.passed || false;
      security.tests.csrf = securityTests.tests?.find((t: any) => t.name === 'CSRF')?.passed || false;
      security.tests.authentication = securityTests.tests?.find((t: any) => t.name === 'Authentication')?.passed || false;
      security.tests.headers = securityTests.tests?.find((t: any) => t.name === 'Security Headers')?.passed || false;
    }

    return security;
  }

  private async collectAccessibilityMetrics(): Promise<AccessibilityMetrics> {
    const accessibility: AccessibilityMetrics = {
      wcagLevel: 'AA',
      violations: {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0
      },
      compliance: {
        perceivable: 100,
        operable: 100,
        understandable: 100,
        robust: 100
      },
      score: 100
    };

    // Collect accessibility test results
    const a11yResults = path.join(this.resultsDir, 'accessibility/accessibility-results.json');
    if (fs.existsSync(a11yResults)) {
      const a11y = JSON.parse(fs.readFileSync(a11yResults, 'utf8'));
      
      a11y.violations?.forEach((violation: any) => {
        switch (violation.impact) {
          case 'critical':
            accessibility.violations.critical++;
            break;
          case 'serious':
            accessibility.violations.serious++;
            break;
          case 'moderate':
            accessibility.violations.moderate++;
            break;
          case 'minor':
            accessibility.violations.minor++;
            break;
        }
      });

      // Calculate compliance score
      const totalViolations = Object.values(accessibility.violations).reduce((sum, count) => sum + count, 0);
      const totalTests = a11y.passes?.length + totalViolations || 1;
      accessibility.score = Math.max(0, 100 - (totalViolations / totalTests * 100));
    }

    return accessibility;
  }

  private async collectQualityMetrics(): Promise<QualityMetrics> {
    const quality: QualityMetrics = {
      codeQuality: {
        maintainability: 0,
        reliability: 0,
        security: 0,
        duplication: 0
      },
      technical_debt: {
        ratio: 0,
        hours: 0
      },
      bugs: 0,
      vulnerabilities: 0,
      hotspots: 0,
      smells: 0
    };

    // Collect SonarQube results if available
    const sonarResults = path.join(this.resultsDir, 'sonar-results.json');
    if (fs.existsSync(sonarResults)) {
      const sonar = JSON.parse(fs.readFileSync(sonarResults, 'utf8'));
      
      quality.codeQuality.maintainability = sonar.measures?.maintainability_rating || 0;
      quality.codeQuality.reliability = sonar.measures?.reliability_rating || 0;
      quality.codeQuality.security = sonar.measures?.security_rating || 0;
      quality.codeQuality.duplication = sonar.measures?.duplicated_lines_density || 0;
      quality.technical_debt.ratio = sonar.measures?.sqale_debt_ratio || 0;
      quality.technical_debt.hours = sonar.measures?.sqale_index || 0;
      quality.bugs = sonar.measures?.bugs || 0;
      quality.vulnerabilities = sonar.measures?.vulnerabilities || 0;
      quality.hotspots = sonar.measures?.security_hotspots || 0;
      quality.smells = sonar.measures?.code_smells || 0;
    }

    return quality;
  }

  private getCurrentBranch(): string {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  private getCurrentCommit(): string {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  async generateTrendReport(days: number = 30): Promise<any> {
    const metricsFiles = fs.readdirSync(this.outputDir)
      .filter(file => file.startsWith('metrics-') && file.endsWith('.json'))
      .sort()
      .slice(-days);

    const trends = {
      coverage: [],
      tests: [],
      performance: [],
      security: [],
      accessibility: []
    };

    for (const file of metricsFiles) {
      const metrics: TestMetrics = JSON.parse(fs.readFileSync(path.join(this.outputDir, file), 'utf8'));
      
      trends.coverage.push({
        timestamp: metrics.timestamp,
        overall: metrics.coverage.overall.lines,
        frontend: metrics.coverage.frontend.lines,
        backend: metrics.coverage.backend.lines
      });

      trends.tests.push({
        timestamp: metrics.timestamp,
        total: metrics.tests.total,
        passed: metrics.tests.passed,
        failed: metrics.tests.failed,
        duration: metrics.tests.duration
      });

      trends.performance.push({
        timestamp: metrics.timestamp,
        avgResponseTime: metrics.performance.loadTest.avgResponseTime,
        errorRate: metrics.performance.loadTest.errorRate,
        lighthouse: metrics.performance.lighthouse.performance
      });

      trends.security.push({
        timestamp: metrics.timestamp,
        vulnerabilities: Object.values(metrics.security.vulnerabilities).reduce((sum, count) => sum + count, 0),
        critical: metrics.security.vulnerabilities.critical,
        high: metrics.security.vulnerabilities.high
      });

      trends.accessibility.push({
        timestamp: metrics.timestamp,
        score: metrics.accessibility.score,
        violations: Object.values(metrics.accessibility.violations).reduce((sum, count) => sum + count, 0)
      });
    }

    return trends;
  }
}

export default TestMetricsCollector;