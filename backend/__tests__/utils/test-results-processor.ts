/**
 * Custom test results processor for Fine Print AI
 * Processes Jest test results and generates additional metrics and reports
 */

import { AggregatedResult, TestResult } from '@jest/test-result';
import { Config } from '@jest/types';
import fs from 'fs';
import path from 'path';

interface PerformanceMetrics {
  averageTestDuration: number;
  slowestTests: Array<{ testPath: string; duration: number }>;
  fastestTests: Array<{ testPath: string; duration: number }>;
  totalTestDuration: number;
}

interface CoverageMetrics {
  totalCoverage: number;
  serviceCoverage: Record<string, number>;
  uncoveredLines: Array<{ file: string; lines: number[] }>;
}

interface TestMetrics {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  passRate: number;
  performance: PerformanceMetrics;
  coverage: CoverageMetrics;
  flakiness: Array<{ testName: string; failureRate: number }>;
}

class TestResultsProcessor {
  private metricsHistory: TestMetrics[] = [];
  private resultsDir: string;

  constructor() {
    this.resultsDir = path.join(process.cwd(), 'test-results');
    this.ensureResultsDirectory();
    this.loadMetricsHistory();
  }

  private ensureResultsDirectory(): void {
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  private loadMetricsHistory(): void {
    const historyFile = path.join(this.resultsDir, 'metrics-history.json');
    if (fs.existsSync(historyFile)) {
      try {
        const data = fs.readFileSync(historyFile, 'utf8');
        this.metricsHistory = JSON.parse(data);
      } catch (error) {
        console.warn('Failed to load metrics history:', error);
        this.metricsHistory = [];
      }
    }
  }

  private saveMetricsHistory(): void {
    const historyFile = path.join(this.resultsDir, 'metrics-history.json');
    try {
      // Keep only last 50 test runs
      const trimmedHistory = this.metricsHistory.slice(-50);
      fs.writeFileSync(historyFile, JSON.stringify(trimmedHistory, null, 2));
    } catch (error) {
      console.warn('Failed to save metrics history:', error);
    }
  }

  private calculatePerformanceMetrics(results: AggregatedResult): PerformanceMetrics {
    const testResults = results.testResults.filter(result => result.perfStats);
    
    if (testResults.length === 0) {
      return {
        averageTestDuration: 0,
        slowestTests: [],
        fastestTests: [],
        totalTestDuration: 0,
      };
    }

    const durations = testResults.map(result => ({
      testPath: result.testFilePath,
      duration: result.perfStats?.end! - result.perfStats?.start!,
    }));

    const totalDuration = durations.reduce((sum, test) => sum + test.duration, 0);
    const averageDuration = totalDuration / durations.length;

    const sortedByDuration = durations.sort((a, b) => b.duration - a.duration);

    return {
      averageTestDuration: averageDuration,
      slowestTests: sortedByDuration.slice(0, 10),
      fastestTests: sortedByDuration.slice(-10).reverse(),
      totalTestDuration: totalDuration,
    };
  }

  private calculateCoverageMetrics(results: AggregatedResult): CoverageMetrics {
    const coverage = results.coverageMap;
    let totalCoverage = 0;
    const serviceCoverage: Record<string, number> = {};
    const uncoveredLines: Array<{ file: string; lines: number[] }> = [];

    if (coverage) {
      const summary = coverage.getCoverageSummary();
      totalCoverage = summary.lines.pct;

      // Calculate per-service coverage
      coverage.files().forEach(file => {
        const fileCoverage = coverage.fileCoverageFor(file);
        const fileSummary = fileCoverage.getSummary();
        
        // Extract service name from file path
        const serviceMatch = file.match(/services\/([^\/]+)/);
        if (serviceMatch) {
          const serviceName = serviceMatch[1];
          if (!serviceCoverage[serviceName]) {
            serviceCoverage[serviceName] = 0;
          }
          serviceCoverage[serviceName] = Math.max(
            serviceCoverage[serviceName],
            fileSummary.lines.pct
          );
        }

        // Collect uncovered lines
        const uncovered = fileCoverage.getUncoveredLines();
        if (uncovered.length > 0) {
          uncoveredLines.push({
            file: file.replace(process.cwd(), ''),
            lines: uncovered,
          });
        }
      });
    }

    return {
      totalCoverage,
      serviceCoverage,
      uncoveredLines: uncoveredLines.slice(0, 20), // Limit to top 20
    };
  }

  private detectFlakiness(results: AggregatedResult): Array<{ testName: string; failureRate: number }> {
    // This is a simplified flakiness detection
    // In a real implementation, you'd track test results over time
    const flakyTests: Array<{ testName: string; failureRate: number }> = [];

    results.testResults.forEach(testResult => {
      testResult.testResults?.forEach(test => {
        if (test.status === 'failed' && test.failureMessages.length > 0) {
          // Check if the failure message indicates potential flakiness
          const isLikelyFlaky = test.failureMessages.some(message =>
            message.includes('timeout') ||
            message.includes('network') ||
            message.includes('async') ||
            message.includes('race condition')
          );

          if (isLikelyFlaky) {
            flakyTests.push({
              testName: `${testResult.testFilePath}:${test.title}`,
              failureRate: 0.5, // Placeholder - would be calculated from history
            });
          }
        }
      });
    });

    return flakyTests;
  }

  private generateTestMetrics(results: AggregatedResult): TestMetrics {
    const totalTests = results.numTotalTests;
    const passedTests = results.numPassedTests;
    const failedTests = results.numFailedTests;
    const skippedTests = results.numPendingTests;
    const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    return {
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      passRate,
      performance: this.calculatePerformanceMetrics(results),
      coverage: this.calculateCoverageMetrics(results),
      flakiness: this.detectFlakiness(results),
    };
  }

  private generateTestReport(metrics: TestMetrics): void {
    const reportFile = path.join(this.resultsDir, 'test-metrics-report.json');
    const htmlReportFile = path.join(this.resultsDir, 'test-metrics-report.html');

    // JSON report
    fs.writeFileSync(reportFile, JSON.stringify(metrics, null, 2));

    // HTML report
    const htmlReport = this.generateHtmlReport(metrics);
    fs.writeFileSync(htmlReportFile, htmlReport);

    console.log('\n📊 Test Metrics Report Generated:');
    console.log(`   JSON: ${reportFile}`);
    console.log(`   HTML: ${htmlReportFile}`);
  }

  private generateHtmlReport(metrics: TestMetrics): string {
    const timestamp = new Date().toISOString();
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fine Print AI - Test Metrics Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .metric-card { background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #007bff; }
        .metric-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; color: #333; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
        .performance-list { max-height: 200px; overflow-y: auto; }
        .success { color: #28a745; }
        .warning { color: #ffc107; }
        .danger { color: #dc3545; }
        .timestamp { text-align: center; color: #666; margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Fine Print AI - Test Metrics Report</h1>
            <p>Generated on ${timestamp}</p>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-title">Test Results</div>
                <div class="metric-value ${metrics.passRate >= 95 ? 'success' : metrics.passRate >= 80 ? 'warning' : 'danger'}">
                    ${metrics.passRate.toFixed(1)}% Pass Rate
                </div>
                <p>Total: ${metrics.totalTests} | Passed: ${metrics.passedTests} | Failed: ${metrics.failedTests} | Skipped: ${metrics.skippedTests}</p>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">Code Coverage</div>
                <div class="metric-value ${metrics.coverage.totalCoverage >= 90 ? 'success' : metrics.coverage.totalCoverage >= 80 ? 'warning' : 'danger'}">
                    ${metrics.coverage.totalCoverage.toFixed(1)}%
                </div>
                <table>
                    ${Object.entries(metrics.coverage.serviceCoverage)
                      .map(([service, coverage]) => `<tr><td>${service}</td><td>${coverage.toFixed(1)}%</td></tr>`)
                      .join('')}
                </table>
            </div>
            
            <div class="metric-card">
                <div class="metric-title">Performance</div>
                <div class="metric-value">
                    ${(metrics.performance.averageTestDuration / 1000).toFixed(2)}s avg
                </div>
                <p>Total Duration: ${(metrics.performance.totalTestDuration / 1000).toFixed(2)}s</p>
                <div class="performance-list">
                    <strong>Slowest Tests:</strong>
                    ${metrics.performance.slowestTests
                      .slice(0, 5)
                      .map(test => `<div>${path.basename(test.testPath)}: ${(test.duration / 1000).toFixed(2)}s</div>`)
                      .join('')}
                </div>
            </div>
            
            ${metrics.flakiness.length > 0 ? `
            <div class="metric-card">
                <div class="metric-title">Flaky Tests</div>
                <div class="metric-value danger">${metrics.flakiness.length}</div>
                <div class="performance-list">
                    ${metrics.flakiness
                      .map(test => `<div>${test.testName}: ${(test.failureRate * 100).toFixed(1)}% failure rate</div>`)
                      .join('')}
                </div>
            </div>
            ` : ''}
        </div>
        
        <div class="timestamp">
            Report generated at ${timestamp}
        </div>
    </div>
</body>
</html>`;
  }

  public process(results: AggregatedResult, config: Config.GlobalConfig): AggregatedResult {
    try {
      const metrics = this.generateTestMetrics(results);
      
      // Add to history
      this.metricsHistory.push(metrics);
      this.saveMetricsHistory();
      
      // Generate reports
      this.generateTestReport(metrics);
      
      // Console output
      console.log('\n🧪 Test Execution Summary:');
      console.log(`   Tests: ${metrics.totalTests} total, ${metrics.passedTests} passed, ${metrics.failedTests} failed`);
      console.log(`   Pass Rate: ${metrics.passRate.toFixed(1)}%`);
      console.log(`   Coverage: ${metrics.coverage.totalCoverage.toFixed(1)}%`);
      console.log(`   Duration: ${(metrics.performance.totalTestDuration / 1000).toFixed(2)}s`);
      
      if (metrics.flakiness.length > 0) {
        console.log(`   ⚠️  Flaky Tests Detected: ${metrics.flakiness.length}`);
      }
      
    } catch (error) {
      console.error('Error processing test results:', error);
    }
    
    return results;
  }
}

// Export the processor function
module.exports = (results: AggregatedResult, config: Config.GlobalConfig): AggregatedResult => {
  const processor = new TestResultsProcessor();
  return processor.process(results, config);
};

export default module.exports;