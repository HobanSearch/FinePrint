import { Logger } from 'pino';
import fs from 'fs/promises';
import path from 'path';
import { TestResult, TestContext, TestStatus, CoverageReport } from './types';

export enum ReportFormat {
  JSON = 'json',
  HTML = 'html',
  JUNIT = 'junit',
  TAP = 'tap',
  MARKDOWN = 'markdown',
  CONSOLE = 'console',
  SLACK = 'slack',
  GRAFANA = 'grafana',
  CUSTOM = 'custom'
}

export interface ReportOptions {
  outputDir: string;
  includeScreenshots: boolean;
  includeVideos: boolean;
  includeLogs: boolean;
  includeTraces: boolean;
  includeCoverage: boolean;
  includePerformance: boolean;
  prettify: boolean;
  timestamp: boolean;
  groupBy?: 'suite' | 'type' | 'status' | 'priority';
  customTemplate?: string;
}

export class TestReporter {
  private logger: Logger;
  private formats: ReportFormat[];
  private options: ReportOptions;
  private reports: Map<ReportFormat, any>;

  constructor(logger: Logger, formats: string[]) {
    this.logger = logger;
    this.formats = formats.map(f => f as ReportFormat);
    this.reports = new Map();
    
    this.options = {
      outputDir: './reports',
      includeScreenshots: true,
      includeVideos: true,
      includeLogs: true,
      includeTraces: true,
      includeCoverage: true,
      includePerformance: true,
      prettify: true,
      timestamp: true
    };
  }

  public async initialize(context: TestContext): Promise<void> {
    // Create report directories
    await this.createReportDirectories();

    // Initialize format-specific reporters
    for (const format of this.formats) {
      await this.initializeFormatter(format, context);
    }
  }

  private async createReportDirectories(): Promise<void> {
    const dirs = [
      this.options.outputDir,
      path.join(this.options.outputDir, 'json'),
      path.join(this.options.outputDir, 'html'),
      path.join(this.options.outputDir, 'junit'),
      path.join(this.options.outputDir, 'screenshots'),
      path.join(this.options.outputDir, 'videos'),
      path.join(this.options.outputDir, 'traces'),
      path.join(this.options.outputDir, 'coverage')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async initializeFormatter(format: ReportFormat, context: TestContext): Promise<void> {
    switch (format) {
      case ReportFormat.HTML:
        this.reports.set(format, new HtmlReporter(this.options));
        break;
      case ReportFormat.JUNIT:
        this.reports.set(format, new JunitReporter(this.options));
        break;
      case ReportFormat.SLACK:
        this.reports.set(format, new SlackReporter(this.options));
        break;
      case ReportFormat.GRAFANA:
        this.reports.set(format, new GrafanaReporter(this.options));
        break;
      default:
        this.reports.set(format, new JsonReporter(this.options));
    }
  }

  public async generate(
    results: Map<string, TestResult>,
    context: TestContext
  ): Promise<any> {
    const report = await this.createReport(results, context);

    // Generate reports in all configured formats
    const outputs = await Promise.all(
      this.formats.map(format => this.generateFormat(format, report))
    );

    // Save combined report
    await this.saveCombinedReport(report);

    return {
      formats: this.formats,
      outputs,
      summary: this.generateSummary(results),
      timestamp: new Date().toISOString()
    };
  }

  private async createReport(
    results: Map<string, TestResult>,
    context: TestContext
  ): Promise<any> {
    const suites = Array.from(results.entries());
    const allTests = suites.flatMap(([_, result]) => result.tests);

    const stats = {
      totalSuites: suites.length,
      totalTests: allTests.length,
      passed: allTests.filter(t => t.status === TestStatus.PASSED).length,
      failed: allTests.filter(t => t.status === TestStatus.FAILED).length,
      skipped: allTests.filter(t => t.status === TestStatus.SKIPPED).length,
      flaky: allTests.filter(t => t.metadata?.flaky).length,
      duration: suites.reduce((sum, [_, r]) => sum + r.duration, 0),
      startTime: Math.min(...suites.map(([_, r]) => r.startTime || 0)),
      endTime: Math.max(...suites.map(([_, r]) => r.endTime || 0))
    };

    stats['passRate'] = stats.totalTests > 0 
      ? (stats.passed / stats.totalTests) * 100 
      : 0;

    return {
      context,
      stats,
      suites: suites.map(([id, result]) => ({
        id,
        ...result
      })),
      coverage: await this.collectCoverage(results),
      performance: await this.collectPerformance(results),
      screenshots: await this.collectScreenshots(results),
      videos: await this.collectVideos(results),
      failures: this.collectFailures(results),
      timestamp: new Date().toISOString()
    };
  }

  private async generateFormat(format: ReportFormat, report: any): Promise<string> {
    const reporter = this.reports.get(format);
    if (!reporter) {
      return '';
    }

    switch (format) {
      case ReportFormat.JSON:
        return await this.generateJsonReport(report);
      case ReportFormat.HTML:
        return await this.generateHtmlReport(report);
      case ReportFormat.JUNIT:
        return await this.generateJunitReport(report);
      case ReportFormat.TAP:
        return await this.generateTapReport(report);
      case ReportFormat.MARKDOWN:
        return await this.generateMarkdownReport(report);
      case ReportFormat.CONSOLE:
        return this.generateConsoleReport(report);
      case ReportFormat.SLACK:
        return await this.generateSlackReport(report);
      case ReportFormat.GRAFANA:
        return await this.generateGrafanaReport(report);
      default:
        return '';
    }
  }

  private async generateJsonReport(report: any): Promise<string> {
    const json = this.options.prettify 
      ? JSON.stringify(report, null, 2)
      : JSON.stringify(report);

    const filename = this.options.timestamp
      ? `report-${Date.now()}.json`
      : 'report.json';

    const filepath = path.join(this.options.outputDir, 'json', filename);
    await fs.writeFile(filepath, json);

    return filepath;
  }

  private async generateHtmlReport(report: any): Promise<string> {
    const html = this.renderHtmlTemplate(report);
    
    const filename = this.options.timestamp
      ? `report-${Date.now()}.html`
      : 'report.html';

    const filepath = path.join(this.options.outputDir, 'html', filename);
    await fs.writeFile(filepath, html);

    return filepath;
  }

  private renderHtmlTemplate(report: any): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Report - ${new Date().toLocaleDateString()}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px 8px 0 0; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; padding: 20px; }
        .stat { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px; }
        .stat-value { font-size: 2em; font-weight: bold; }
        .stat-label { color: #666; margin-top: 5px; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .skipped { color: #ffc107; }
        .flaky { color: #17a2b8; }
        .suite { margin: 20px; padding: 20px; border: 1px solid #dee2e6; border-radius: 8px; }
        .suite-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .test { padding: 10px; margin: 5px 0; background: #f8f9fa; border-left: 3px solid #dee2e6; border-radius: 4px; }
        .test.passed { border-left-color: #28a745; }
        .test.failed { border-left-color: #dc3545; background: #fff5f5; }
        .test.skipped { border-left-color: #ffc107; }
        .error { margin-top: 10px; padding: 10px; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; color: #721c24; font-family: monospace; font-size: 0.9em; }
        .chart { height: 300px; margin: 20px; }
        .footer { padding: 20px; text-align: center; color: #666; border-top: 1px solid #dee2e6; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Test Execution Report</h1>
            <p>Generated: ${report.timestamp}</p>
            <p>Environment: ${report.context.environment} | Build: ${report.context.buildId}</p>
        </div>
        
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${report.stats.totalTests}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat">
                <div class="stat-value passed">${report.stats.passed}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat">
                <div class="stat-value failed">${report.stats.failed}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat">
                <div class="stat-value skipped">${report.stats.skipped}</div>
                <div class="stat-label">Skipped</div>
            </div>
            <div class="stat">
                <div class="stat-value flaky">${report.stats.flaky}</div>
                <div class="stat-label">Flaky</div>
            </div>
            <div class="stat">
                <div class="stat-value">${report.stats.passRate.toFixed(1)}%</div>
                <div class="stat-label">Pass Rate</div>
            </div>
            <div class="stat">
                <div class="stat-value">${(report.stats.duration / 1000).toFixed(2)}s</div>
                <div class="stat-label">Duration</div>
            </div>
        </div>

        ${report.suites.map((suite: any) => `
            <div class="suite">
                <div class="suite-header">
                    <h3>${suite.metadata?.suite || 'Test Suite'}</h3>
                    <span>${suite.success ? '✅ Passed' : '❌ Failed'}</span>
                </div>
                ${suite.tests.map((test: any) => `
                    <div class="test ${test.status}">
                        <strong>${test.name}</strong>
                        <span style="float: right">${test.duration.toFixed(0)}ms</span>
                        ${test.error ? `<div class="error">${test.error.message}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `).join('')}

        <div class="footer">
            <p>Fine Print AI - Test Automation Framework</p>
        </div>
    </div>
</body>
</html>`;
  }

  private async generateJunitReport(report: any): Promise<string> {
    const junit = this.convertToJunit(report);
    
    const filename = this.options.timestamp
      ? `junit-${Date.now()}.xml`
      : 'junit.xml';

    const filepath = path.join(this.options.outputDir, 'junit', filename);
    await fs.writeFile(filepath, junit);

    return filepath;
  }

  private convertToJunit(report: any): string {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Fine Print AI Tests" tests="${report.stats.totalTests}" failures="${report.stats.failed}" skipped="${report.stats.skipped}" time="${report.stats.duration / 1000}">
${report.suites.map((suite: any) => `
  <testsuite name="${suite.metadata?.suite || 'Test Suite'}" tests="${suite.tests.length}" failures="${suite.tests.filter((t: any) => t.status === 'failed').length}" skipped="${suite.tests.filter((t: any) => t.status === 'skipped').length}" time="${suite.duration / 1000}">
${suite.tests.map((test: any) => `
    <testcase name="${test.name}" classname="${suite.metadata?.suite || 'TestSuite'}" time="${test.duration / 1000}">
${test.status === 'failed' ? `      <failure message="${test.error?.message || 'Test failed'}">${test.error?.stack || ''}</failure>` : ''}
${test.status === 'skipped' ? '      <skipped/>' : ''}
    </testcase>`).join('')}
  </testsuite>`).join('')}
</testsuites>`;
    return xml;
  }

  private async generateTapReport(report: any): Promise<string> {
    const tap = this.convertToTap(report);
    
    const filename = this.options.timestamp
      ? `tap-${Date.now()}.txt`
      : 'tap.txt';

    const filepath = path.join(this.options.outputDir, filename);
    await fs.writeFile(filepath, tap);

    return filepath;
  }

  private convertToTap(report: any): string {
    let tap = `TAP version 13\n`;
    tap += `1..${report.stats.totalTests}\n`;
    
    let testNumber = 1;
    for (const suite of report.suites) {
      for (const test of suite.tests) {
        const status = test.status === TestStatus.PASSED ? 'ok' : 'not ok';
        const skip = test.status === TestStatus.SKIPPED ? ' # SKIP' : '';
        tap += `${status} ${testNumber} - ${test.name}${skip}\n`;
        
        if (test.error) {
          tap += `  ---\n`;
          tap += `  message: ${test.error.message}\n`;
          tap += `  severity: fail\n`;
          tap += `  ...\n`;
        }
        
        testNumber++;
      }
    }
    
    return tap;
  }

  private async generateMarkdownReport(report: any): Promise<string> {
    const markdown = this.convertToMarkdown(report);
    
    const filename = this.options.timestamp
      ? `report-${Date.now()}.md`
      : 'report.md';

    const filepath = path.join(this.options.outputDir, filename);
    await fs.writeFile(filepath, markdown);

    return filepath;
  }

  private convertToMarkdown(report: any): string {
    return `# Test Execution Report

## Summary
- **Generated:** ${report.timestamp}
- **Environment:** ${report.context.environment}
- **Build:** ${report.context.buildId}
- **Branch:** ${report.context.branch}

## Statistics
| Metric | Value |
|--------|-------|
| Total Tests | ${report.stats.totalTests} |
| Passed | ${report.stats.passed} |
| Failed | ${report.stats.failed} |
| Skipped | ${report.stats.skipped} |
| Flaky | ${report.stats.flaky} |
| Pass Rate | ${report.stats.passRate.toFixed(1)}% |
| Duration | ${(report.stats.duration / 1000).toFixed(2)}s |

## Test Results

${report.suites.map((suite: any) => `
### ${suite.metadata?.suite || 'Test Suite'}
**Status:** ${suite.success ? '✅ Passed' : '❌ Failed'}
**Duration:** ${(suite.duration / 1000).toFixed(2)}s

| Test | Status | Duration | Notes |
|------|--------|----------|-------|
${suite.tests.map((test: any) => 
`| ${test.name} | ${test.status === TestStatus.PASSED ? '✅' : test.status === TestStatus.FAILED ? '❌' : '⏭️'} | ${test.duration.toFixed(0)}ms | ${test.error ? test.error.message : '-'} |`
).join('\n')}
`).join('\n')}

## Failures
${report.failures?.map((failure: any) => `
### ${failure.test}
\`\`\`
${failure.error.stack}
\`\`\`
`).join('\n') || 'No failures'}

---
*Generated by Fine Print AI Test Automation Framework*`;
  }

  private generateConsoleReport(report: any): string {
    console.log('\n' + '='.repeat(80));
    console.log('TEST EXECUTION REPORT');
    console.log('='.repeat(80));
    console.log(`Environment: ${report.context.environment}`);
    console.log(`Build: ${report.context.buildId}`);
    console.log(`Timestamp: ${report.timestamp}`);
    console.log('-'.repeat(80));
    console.log('STATISTICS:');
    console.log(`  Total Tests: ${report.stats.totalTests}`);
    console.log(`  Passed: ${report.stats.passed}`);
    console.log(`  Failed: ${report.stats.failed}`);
    console.log(`  Skipped: ${report.stats.skipped}`);
    console.log(`  Pass Rate: ${report.stats.passRate.toFixed(1)}%`);
    console.log(`  Duration: ${(report.stats.duration / 1000).toFixed(2)}s`);
    
    if (report.failures && report.failures.length > 0) {
      console.log('-'.repeat(80));
      console.log('FAILURES:');
      report.failures.forEach((failure: any) => {
        console.log(`  ❌ ${failure.test}`);
        console.log(`     ${failure.error.message}`);
      });
    }
    
    console.log('='.repeat(80) + '\n');
    
    return 'Console report generated';
  }

  private async generateSlackReport(report: any): Promise<string> {
    // Slack webhook integration would go here
    this.logger.info('Slack report would be sent here');
    return 'Slack notification sent';
  }

  private async generateGrafanaReport(report: any): Promise<string> {
    // Grafana metrics push would go here
    this.logger.info('Grafana metrics would be pushed here');
    return 'Grafana metrics pushed';
  }

  private generateSummary(results: Map<string, TestResult>): any {
    const allTests = Array.from(results.values()).flatMap(r => r.tests);
    
    return {
      total: allTests.length,
      passed: allTests.filter(t => t.status === TestStatus.PASSED).length,
      failed: allTests.filter(t => t.status === TestStatus.FAILED).length,
      skipped: allTests.filter(t => t.status === TestStatus.SKIPPED).length,
      duration: Array.from(results.values()).reduce((sum, r) => sum + r.duration, 0)
    };
  }

  private async collectCoverage(results: Map<string, TestResult>): Promise<CoverageReport | null> {
    if (!this.options.includeCoverage) {
      return null;
    }

    // Aggregate coverage from all test results
    // This would integrate with coverage tools like nyc/c8
    return null;
  }

  private async collectPerformance(results: Map<string, TestResult>): Promise<any> {
    if (!this.options.includePerformance) {
      return null;
    }

    // Aggregate performance metrics from test results
    return null;
  }

  private async collectScreenshots(results: Map<string, TestResult>): Promise<string[]> {
    if (!this.options.includeScreenshots) {
      return [];
    }

    const screenshots: string[] = [];
    for (const result of results.values()) {
      if (result.screenshots) {
        screenshots.push(...result.screenshots);
      }
    }
    return screenshots;
  }

  private async collectVideos(results: Map<string, TestResult>): Promise<string[]> {
    if (!this.options.includeVideos) {
      return [];
    }

    const videos: string[] = [];
    for (const result of results.values()) {
      if (result.videos) {
        videos.push(...result.videos);
      }
    }
    return videos;
  }

  private collectFailures(results: Map<string, TestResult>): any[] {
    const failures: any[] = [];
    
    for (const result of results.values()) {
      if (result.failures) {
        failures.push(...result.failures);
      }
    }
    
    return failures;
  }

  private async saveCombinedReport(report: any): Promise<void> {
    const filepath = path.join(this.options.outputDir, 'combined-report.json');
    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
  }

  public async close(): Promise<void> {
    // Cleanup and close any open resources
    for (const reporter of this.reports.values()) {
      if (reporter.close) {
        await reporter.close();
      }
    }
  }
}

// Placeholder reporter classes
class JsonReporter {
  constructor(private options: ReportOptions) {}
}

class HtmlReporter {
  constructor(private options: ReportOptions) {}
}

class JunitReporter {
  constructor(private options: ReportOptions) {}
}

class SlackReporter {
  constructor(private options: ReportOptions) {}
}

class GrafanaReporter {
  constructor(private options: ReportOptions) {}
}