/**
 * Fine Print AI - Enhanced SOC2 Reporting Service
 * 
 * Provides comprehensive SOC2 reporting with audit preparation,
 * trend analysis, and automated report generation for compliance teams
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export interface AuditReport {
  id: string;
  reportType: 'readiness' | 'gap_analysis' | 'continuous' | 'annual';
  period: {
    startDate: Date;
    endDate: Date;
  };
  scope: string[];
  summary: {
    overallScore: number;
    totalControls: number;
    compliantControls: number;
    nonCompliantControls: number;
    criticalFindings: number;
    highRiskFindings: number;
    mediumRiskFindings: number;
    lowRiskFindings: number;
  };
  findings: AuditFinding[];
  recommendations: AuditRecommendation[];
  evidenceGaps: EvidenceGap[];
  trendAnalysis: TrendAnalysis;
  generatedAt: Date;
  generatedBy: string;
}

export interface AuditFinding {
  id: string;
  controlId: string;
  controlName: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'design_deficiency' | 'operating_effectiveness' | 'evidence_gap' | 'policy_gap';
  description: string;
  impact: string;
  rootCause: string;
  currentStatus: string;
  evidenceReviewed: string[];
  detectedAt: Date;
  dueDate?: Date;
  assignedTo?: string;
}

export interface AuditRecommendation {
  id: string;
  findingId: string;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  implementation: {
    steps: string[];
    estimatedEffort: string;
    resources: string[];
    timeline: string;
  };
  riskReduction: string;
  complianceImpact: string;
}

export interface EvidenceGap {
  controlId: string;
  controlName: string;
  requiredEvidence: string[];
  missingEvidence: string[];
  alternativeEvidence: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedActions: string[];
}

export interface TrendAnalysis {
  timeframe: string;
  overallTrend: 'improving' | 'stable' | 'declining';
  controlTrends: ControlTrend[];
  industryBenchmarks: IndustryBenchmark[];
  seasonalPatterns: SeasonalPattern[];
  predictiveInsights: PredictiveInsight[];
}

export interface ControlTrend {
  controlId: string;
  controlName: string;
  category: string;
  trend: 'improving' | 'stable' | 'declining';
  scoreHistory: Array<{
    date: Date;
    score: number;
    status: string;
  }>;
  changePoints: Array<{
    date: Date;
    description: string;
    impact: string;
  }>;
}

export interface IndustryBenchmark {
  category: string;
  industryAverage: number;
  ourScore: number;
  percentile: number;
  trend: 'above' | 'at' | 'below';
  recommendations: string[];
}

export interface SeasonalPattern {
  pattern: string;
  description: string;
  impactedControls: string[];
  mitigationStrategies: string[];
}

export interface PredictiveInsight {
  insight: string;
  confidence: number;
  timeframe: string;
  potentialImpact: string;
  recommendedActions: string[];
}

export interface ReportTemplate {
  id: string;
  name: string;
  type: string;
  sections: ReportSection[];
  format: 'pdf' | 'html' | 'docx' | 'xlsx';
  isDefault: boolean;
}

export interface ReportSection {
  id: string;
  title: string;
  type: 'summary' | 'controls' | 'findings' | 'trends' | 'recommendations' | 'evidence';
  content: any;
  chartTypes?: string[];
  includeDetails: boolean;
}

export class EnhancedSOC2ReportingService {
  private prisma: PrismaClient;
  private reportsPath: string;

  constructor(prisma: PrismaClient, reportsPath: string = './reports') {
    this.prisma = prisma;
    this.reportsPath = reportsPath;
  }

  /**
   * Generate comprehensive audit readiness report
   */
  async generateAuditReadinessReport(
    scope: string[] = ['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy'],
    options: {
      includeEvidence?: boolean;
      includeTrends?: boolean;
      format?: 'pdf' | 'html' | 'json';
    } = {}
  ): Promise<AuditReport> {
    logger.info('Generating audit readiness report', { scope, options });

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000); // Last year

    try {
      // Get current control status
      const controls = await this.getControlStatusForPeriod(startDate, endDate, scope);
      
      // Generate findings
      const findings = await this.generateFindings(controls);
      
      // Generate recommendations
      const recommendations = await this.generateRecommendations(findings);
      
      // Identify evidence gaps
      const evidenceGaps = options.includeEvidence 
        ? await this.identifyEvidenceGaps(scope)
        : [];
      
      // Generate trend analysis
      const trendAnalysis = options.includeTrends 
        ? await this.generateTrendAnalysis(scope, startDate, endDate)
        : this.getEmptyTrendAnalysis();
      
      // Calculate summary metrics
      const summary = this.calculateSummary(controls, findings);

      const report: AuditReport = {
        id: `audit_readiness_${Date.now()}`,
        reportType: 'readiness',
        period: { startDate, endDate },
        scope,
        summary,
        findings,
        recommendations,
        evidenceGaps,
        trendAnalysis,
        generatedAt: new Date(),
        generatedBy: 'system',
      };

      // Save report to database
      await this.saveReport(report);

      // Generate formatted output if requested
      if (options.format && options.format !== 'json') {
        await this.exportReport(report, options.format);
      }

      logger.info('Audit readiness report generated successfully', {
        reportId: report.id,
        totalFindings: findings.length,
        criticalFindings: summary.criticalFindings,
      });

      return report;
    } catch (error) {
      logger.error('Error generating audit readiness report:', error);
      throw error;
    }
  }

  /**
   * Generate gap analysis report
   */
  async generateGapAnalysisReport(
    targetFramework: 'soc2_type1' | 'soc2_type2' | 'iso27001' | 'nist',
    scope: string[]
  ): Promise<AuditReport> {
    logger.info('Generating gap analysis report', { targetFramework, scope });

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000); // Last 90 days

    // Get current state
    const currentControls = await this.getControlStatusForPeriod(startDate, endDate, scope);
    
    // Get target requirements
    const targetRequirements = await this.getFrameworkRequirements(targetFramework);
    
    // Identify gaps
    const gaps = await this.identifyGaps(currentControls, targetRequirements);
    
    // Generate findings from gaps
    const findings = this.convertGapsToFindings(gaps);
    
    // Generate recommendations
    const recommendations = await this.generateRecommendations(findings);
    
    // Calculate summary
    const summary = this.calculateSummary(currentControls, findings);

    const report: AuditReport = {
      id: `gap_analysis_${targetFramework}_${Date.now()}`,
      reportType: 'gap_analysis',
      period: { startDate, endDate },
      scope,
      summary,
      findings,
      recommendations,
      evidenceGaps: await this.identifyEvidenceGaps(scope),
      trendAnalysis: this.getEmptyTrendAnalysis(),
      generatedAt: new Date(),
      generatedBy: 'system',
    };

    await this.saveReport(report);

    logger.info('Gap analysis report generated successfully', {
      reportId: report.id,
      framework: targetFramework,
      totalGaps: gaps.length,
    });

    return report;
  }

  /**
   * Generate continuous monitoring report
   */
  async generateContinuousMonitoringReport(
    period: 'daily' | 'weekly' | 'monthly',
    scope: string[]
  ): Promise<AuditReport> {
    logger.info('Generating continuous monitoring report', { period, scope });

    const endDate = new Date();
    const startDate = this.getPeriodStartDate(period, endDate);

    const controls = await this.getControlStatusForPeriod(startDate, endDate, scope);
    const findings = await this.generateFindings(controls);
    const recommendations = await this.generateRecommendations(findings);
    const trendAnalysis = await this.generateTrendAnalysis(scope, startDate, endDate);
    const summary = this.calculateSummary(controls, findings);

    const report: AuditReport = {
      id: `continuous_${period}_${Date.now()}`,
      reportType: 'continuous',
      period: { startDate, endDate },
      scope,
      summary,
      findings,
      recommendations,
      evidenceGaps: [],
      trendAnalysis,
      generatedAt: new Date(),
      generatedBy: 'system',
    };

    await this.saveReport(report);

    logger.info('Continuous monitoring report generated successfully', {
      reportId: report.id,
      period,
      totalFindings: findings.length,
    });

    return report;
  }

  /**
   * Generate trend analysis for specified scope and time period
   */
  private async generateTrendAnalysis(
    scope: string[],
    startDate: Date,
    endDate: Date
  ): Promise<TrendAnalysis> {
    // Get historical control data
    const historicalData = await this.getHistoricalControlData(scope, startDate, endDate);
    
    // Analyze control trends
    const controlTrends = this.analyzeControlTrends(historicalData);
    
    // Get industry benchmarks
    const industryBenchmarks = await this.getIndustryBenchmarks(scope);
    
    // Identify seasonal patterns
    const seasonalPatterns = this.identifySeasonalPatterns(historicalData);
    
    // Generate predictive insights
    const predictiveInsights = this.generatePredictiveInsights(controlTrends, seasonalPatterns);
    
    // Determine overall trend
    const overallTrend = this.calculateOverallTrend(controlTrends);

    return {
      timeframe: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      overallTrend,
      controlTrends,
      industryBenchmarks,
      seasonalPatterns,
      predictiveInsights,
    };
  }

  /**
   * Analyze trends in control performance
   */
  private analyzeControlTrends(historicalData: any[]): ControlTrend[] {
    const trends: ControlTrend[] = [];
    
    // Group data by control
    const controlGroups = historicalData.reduce((groups, item) => {
      if (!groups[item.controlId]) {
        groups[item.controlId] = [];
      }
      groups[item.controlId].push(item);
      return groups;
    }, {});

    for (const [controlId, data] of Object.entries(controlGroups)) {
      const sortedData = (data as any[]).sort((a, b) => 
        new Date(a.assessedAt).getTime() - new Date(b.assessedAt).getTime()
      );

      if (sortedData.length < 2) continue;

      const scoreHistory = sortedData.map(item => ({
        date: new Date(item.assessedAt),
        score: item.score,
        status: item.status,
      }));

      // Calculate trend direction
      const firstScore = sortedData[0].score;
      const lastScore = sortedData[sortedData.length - 1].score;
      const scoreDiff = lastScore - firstScore;
      
      let trend: 'improving' | 'stable' | 'declining';
      if (scoreDiff > 5) trend = 'improving';
      else if (scoreDiff < -5) trend = 'declining';
      else trend = 'stable';

      // Identify significant change points
      const changePoints = this.identifyChangePoints(sortedData);

      trends.push({
        controlId,
        controlName: sortedData[0].controlName || controlId,
        category: sortedData[0].category || 'unknown',
        trend,
        scoreHistory,
        changePoints,
      });
    }

    return trends;
  }

  /**
   * Identify significant change points in control performance
   */
  private identifyChangePoints(data: any[]): Array<{ date: Date; description: string; impact: string }> {
    const changePoints = [];
    
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const scoreDiff = curr.score - prev.score;
      
      // Significant change threshold
      if (Math.abs(scoreDiff) > 15) {
        changePoints.push({
          date: new Date(curr.assessedAt),
          description: scoreDiff > 0 
            ? `Significant improvement in ${curr.controlName}`
            : `Significant decline in ${curr.controlName}`,
          impact: Math.abs(scoreDiff) > 25 ? 'high' : 'medium',
        });
      }
    }

    return changePoints;
  }

  /**
   * Get industry benchmarks for comparison
   */
  private async getIndustryBenchmarks(scope: string[]): Promise<IndustryBenchmark[]> {
    // This would typically fetch from an external service or database
    // For now, return mock benchmark data
    const benchmarks: IndustryBenchmark[] = [
      {
        category: 'Security',
        industryAverage: 85,
        ourScore: 88,
        percentile: 75,
        trend: 'above',
        recommendations: [
          'Continue current security practices',
          'Consider implementing additional monitoring controls',
        ],
      },
      {
        category: 'Availability',
        industryAverage: 92,
        ourScore: 89,
        percentile: 45,
        trend: 'below',
        recommendations: [
          'Improve incident response procedures',
          'Implement additional redundancy measures',
        ],
      },
    ];

    return benchmarks.filter(b => 
      scope.some(s => s.toLowerCase().includes(b.category.toLowerCase()))
    );
  }

  /**
   * Identify seasonal patterns in compliance data
   */
  private identifySeasonalPatterns(historicalData: any[]): SeasonalPattern[] {
    // Analyze data for seasonal trends
    // This is a simplified implementation
    const patterns: SeasonalPattern[] = [
      {
        pattern: 'Year-end compliance rush',
        description: 'Increased compliance activity in Q4 due to year-end audits',
        impactedControls: ['CC1.1', 'CC2.1', 'CC3.1'],
        mitigationStrategies: [
          'Implement quarterly compliance reviews',
          'Automate evidence collection',
        ],
      },
      {
        pattern: 'Summer vacation impact',
        description: 'Reduced staff availability affects control monitoring in Q3',
        impactedControls: ['CC4.1', 'CC5.1'],
        mitigationStrategies: [
          'Cross-train team members',
          'Implement automated monitoring',
        ],
      },
    ];

    return patterns;
  }

  /**
   * Generate predictive insights based on trend analysis
   */
  private generatePredictiveInsights(
    controlTrends: ControlTrend[],
    seasonalPatterns: SeasonalPattern[]
  ): PredictiveInsight[] {
    const insights: PredictiveInsight[] = [];

    // Analyze declining trends
    const decliningControls = controlTrends.filter(t => t.trend === 'declining');
    if (decliningControls.length > 0) {
      insights.push({
        insight: `${decliningControls.length} controls showing declining performance`,
        confidence: 0.85,
        timeframe: 'Next 3 months',
        potentialImpact: 'May result in audit findings if not addressed',
        recommendedActions: [
          'Conduct root cause analysis for declining controls',
          'Implement corrective action plans',
          'Increase monitoring frequency',
        ],
      });
    }

    // Seasonal predictions
    const currentMonth = new Date().getMonth();
    if (currentMonth >= 6 && currentMonth <= 8) { // Q3
      insights.push({
        insight: 'Summer vacation period may impact control effectiveness',
        confidence: 0.75,
        timeframe: 'Next 2 months',
        potentialImpact: 'Potential gaps in manual control execution',
        recommendedActions: [
          'Review vacation schedules for critical roles',
          'Ensure adequate coverage for all controls',
          'Consider temporary automation measures',
        ],
      });
    }

    return insights;
  }

  /**
   * Calculate overall trend from individual control trends
   */
  private calculateOverallTrend(controlTrends: ControlTrend[]): 'improving' | 'stable' | 'declining' {
    if (controlTrends.length === 0) return 'stable';

    const improvingCount = controlTrends.filter(t => t.trend === 'improving').length;
    const decliningCount = controlTrends.filter(t => t.trend === 'declining').length;
    const stableCount = controlTrends.filter(t => t.trend === 'stable').length;

    if (improvingCount > decliningCount && improvingCount > stableCount) {
      return 'improving';
    } else if (decliningCount > improvingCount && decliningCount > stableCount) {
      return 'declining';
    } else {
      return 'stable';
    }
  }

  /**
   * Get control status for specified period
   */
  private async getControlStatusForPeriod(
    startDate: Date,
    endDate: Date,
    scope: string[]
  ): Promise<any[]> {
    return await this.prisma.sOC2Control.findMany({
      where: {
        category: { in: scope },
        updatedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        tests: {
          where: {
            completedAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { completedAt: 'desc' },
        },
        evidence: {
          where: {
            collectedAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    });
  }

  /**
   * Get historical control data for trend analysis
   */
  private async getHistoricalControlData(
    scope: string[],
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    return await this.prisma.sOC2ControlTest.findMany({
      where: {
        control: {
          category: { in: scope },
        },
        completedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        control: true,
      },
      orderBy: { completedAt: 'asc' },
    });
  }

  /**
   * Generate findings from control analysis
   */
  private async generateFindings(controls: any[]): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    for (const control of controls) {
      // Check for failed tests
      const failedTests = control.tests?.filter((t: any) => t.result === 'fail') || [];
      
      for (const test of failedTests) {
        findings.push({
          id: `finding_${control.id}_${test.id}`,
          controlId: control.id,
          controlName: control.name,
          category: control.category,
          severity: this.determineSeverity(control, test),
          type: 'operating_effectiveness',
          description: `Control test failed: ${test.description}`,
          impact: this.assessImpact(control, test),
          rootCause: test.failureReason || 'Root cause analysis pending',
          currentStatus: 'open',
          evidenceReviewed: test.evidenceReviewed || [],
          detectedAt: test.completedAt,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        });
      }

      // Check for missing evidence
      if (!control.evidence || control.evidence.length === 0) {
        findings.push({
          id: `finding_evidence_${control.id}`,
          controlId: control.id,
          controlName: control.name,
          category: control.category,
          severity: 'medium',
          type: 'evidence_gap',
          description: `Missing evidence for control ${control.name}`,
          impact: 'Unable to demonstrate control effectiveness',
          rootCause: 'Evidence collection process not executed',
          currentStatus: 'open',
          evidenceReviewed: [],
          detectedAt: new Date(),
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        });
      }
    }

    return findings;
  }

  /**
   * Determine severity of finding
   */
  private determineSeverity(control: any, test: any): 'low' | 'medium' | 'high' | 'critical' {
    // High severity for security controls
    if (control.category === 'security' && test.criticalityLevel === 'high') {
      return 'critical';
    }
    
    // Consider control criticality and test result
    if (control.criticalityLevel === 'high') {
      return 'high';
    } else if (control.criticalityLevel === 'medium') {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Assess impact of finding
   */
  private assessImpact(control: any, test: any): string {
    const impacts = {
      security: 'Potential security vulnerability',
      availability: 'Risk to system availability',
      processing_integrity: 'Risk to data processing accuracy',
      confidentiality: 'Risk of unauthorized data disclosure',
      privacy: 'Risk to personal data protection',
    };

    return impacts[control.category as keyof typeof impacts] || 'General compliance risk';
  }

  /**
   * Generate recommendations for findings
   */
  private async generateRecommendations(findings: AuditFinding[]): Promise<AuditRecommendation[]> {
    const recommendations: AuditRecommendation[] = [];

    for (const finding of findings) {
      const recommendation = await this.generateRecommendationForFinding(finding);
      recommendations.push(recommendation);
    }

    return recommendations;
  }

  /**
   * Generate recommendation for specific finding
   */
  private async generateRecommendationForFinding(finding: AuditFinding): Promise<AuditRecommendation> {
    const recommendationMap = {
      'operating_effectiveness': {
        title: 'Improve Control Execution',
        description: 'Review and enhance the execution of this control',
        steps: [
          'Analyze root cause of control failure',
          'Update control procedures if necessary',
          'Provide additional training to responsible personnel',
          'Implement additional monitoring or automation',
        ],
        estimatedEffort: '2-4 weeks',
        resources: ['Control owner', 'Process expert', 'Training coordinator'],
      },
      'evidence_gap': {
        title: 'Implement Evidence Collection',
        description: 'Establish systematic evidence collection for this control',
        steps: [
          'Define required evidence types',
          'Implement collection procedures',
          'Assign responsible parties',
          'Set up automated collection where possible',
        ],
        estimatedEffort: '1-2 weeks',
        resources: ['Control owner', 'Documentation specialist'],
      },
      'design_deficiency': {
        title: 'Redesign Control',
        description: 'Redesign control to address identified deficiency',
        steps: [
          'Analyze control design gap',
          'Develop improved control design',
          'Update policies and procedures',
          'Implement new control design',
          'Test effectiveness',
        ],
        estimatedEffort: '4-8 weeks',
        resources: ['Control designer', 'Policy team', 'Implementation team'],
      },
    };

    const template = recommendationMap[finding.type] || recommendationMap['operating_effectiveness'];

    return {
      id: `rec_${finding.id}`,
      findingId: finding.id,
      priority: this.mapSeverityToPriority(finding.severity),
      title: template.title,
      description: template.description,
      implementation: {
        steps: template.steps,
        estimatedEffort: template.estimatedEffort,
        resources: template.resources,
        timeline: this.calculateTimeline(finding.severity),
      },
      riskReduction: this.assessRiskReduction(finding),
      complianceImpact: this.assessComplianceImpact(finding),
    };
  }

  /**
   * Map severity to priority
   */
  private mapSeverityToPriority(severity: string): 'immediate' | 'high' | 'medium' | 'low' {
    const mapping: Record<string, 'immediate' | 'high' | 'medium' | 'low'> = {
      'critical': 'immediate',
      'high': 'high',
      'medium': 'medium',
      'low': 'low',
    };
    return mapping[severity] || 'medium';
  }

  /**
   * Calculate implementation timeline based on severity
   */
  private calculateTimeline(severity: string): string {
    const timelines: Record<string, string> = {
      'critical': 'Within 1 week',
      'high': 'Within 2 weeks',
      'medium': 'Within 1 month',
      'low': 'Within 3 months',
    };
    return timelines[severity] || 'Within 1 month';
  }

  /**
   * Assess risk reduction from implementing recommendation
   */
  private assessRiskReduction(finding: AuditFinding): string {
    return `Addresses ${finding.severity} severity risk in ${finding.category} category`;
  }

  /**
   * Assess compliance impact of recommendation
   */
  private assessComplianceImpact(finding: AuditFinding): string {
    return `Improves compliance posture for ${finding.controlName} control`;
  }

  /**
   * Identify evidence gaps for controls
   */
  private async identifyEvidenceGaps(scope: string[]): Promise<EvidenceGap[]> {
    const controls = await this.prisma.sOC2Control.findMany({
      where: { category: { in: scope } },
      include: { evidence: true },
    });

    const gaps: EvidenceGap[] = [];

    for (const control of controls) {
      const requiredEvidence = this.getRequiredEvidenceForControl(control);
      const existingEvidence = control.evidence.map((e: any) => e.type);
      const missingEvidence = requiredEvidence.filter(req => !existingEvidence.includes(req));

      if (missingEvidence.length > 0) {
        gaps.push({
          controlId: control.id,
          controlName: control.name,
          requiredEvidence,
          missingEvidence,
          alternativeEvidence: this.getAlternativeEvidence(missingEvidence),
          riskLevel: this.assessEvidenceGapRisk(control, missingEvidence),
          recommendedActions: this.getEvidenceGapActions(missingEvidence),
        });
      }
    }

    return gaps;
  }

  /**
   * Get required evidence for a control
   */
  private getRequiredEvidenceForControl(control: any): string[] {
    // This would be based on SOC2 requirements and control design
    const evidenceMap: Record<string, string[]> = {
      'CC1.1': ['Policy document', 'Board resolution', 'Communication records'],
      'CC2.1': ['Organization chart', 'Job descriptions', 'Training records'],
      'CC3.1': ['Committee charter', 'Meeting minutes', 'Oversight reports'],
      // Add more mappings as needed
    };

    return evidenceMap[control.id] || ['Control documentation', 'Test results', 'Monitoring reports'];
  }

  /**
   * Get alternative evidence options
   */
  private getAlternativeEvidence(missingEvidence: string[]): string[] {
    const alternatives: Record<string, string[]> = {
      'Policy document': ['Procedure manual', 'Process documentation'],
      'Meeting minutes': ['Email communications', 'Action item lists'],
      'Training records': ['Certification records', 'Competency assessments'],
    };

    return missingEvidence.flatMap(evidence => alternatives[evidence] || []);
  }

  /**
   * Assess risk level of evidence gap
   */
  private assessEvidenceGapRisk(control: any, missingEvidence: string[]): 'low' | 'medium' | 'high' | 'critical' {
    if (control.criticalityLevel === 'high' && missingEvidence.length > 2) {
      return 'critical';
    } else if (control.criticalityLevel === 'high' || missingEvidence.length > 1) {
      return 'high';
    } else if (missingEvidence.length > 0) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get recommended actions for evidence gaps
   */
  private getEvidenceGapActions(missingEvidence: string[]): string[] {
    return [
      'Establish evidence collection procedures',
      'Assign responsibility for evidence collection',
      'Set up automated collection where possible',
      'Create evidence repository and retention schedule',
    ];
  }

  /**
   * Calculate summary metrics for report
   */
  private calculateSummary(controls: any[], findings: AuditFinding[]): any {
    const totalControls = controls.length;
    const nonCompliantControls = new Set(findings.map(f => f.controlId)).size;
    const compliantControls = totalControls - nonCompliantControls;

    const criticalFindings = findings.filter(f => f.severity === 'critical').length;
    const highRiskFindings = findings.filter(f => f.severity === 'high').length;
    const mediumRiskFindings = findings.filter(f => f.severity === 'medium').length;
    const lowRiskFindings = findings.filter(f => f.severity === 'low').length;

    const overallScore = totalControls > 0 
      ? Math.round((compliantControls / totalControls) * 100)
      : 100;

    return {
      overallScore,
      totalControls,
      compliantControls,
      nonCompliantControls,
      criticalFindings,
      highRiskFindings,
      mediumRiskFindings,
      lowRiskFindings,
    };
  }

  /**
   * Save report to database
   */
  private async saveReport(report: AuditReport): Promise<void> {
    try {
      await this.prisma.sOC2Report.create({
        data: {
          id: report.id,
          reportType: report.reportType,
          scope: report.scope,
          startDate: report.period.startDate,
          endDate: report.period.endDate,
          summary: report.summary as any,
          findings: report.findings as any,
          recommendations: report.recommendations as any,
          evidenceGaps: report.evidenceGaps as any,
          trendAnalysis: report.trendAnalysis as any,
          generatedAt: report.generatedAt,
          generatedBy: report.generatedBy,
        },
      });
    } catch (error) {
      logger.error('Error saving report to database:', error);
      throw error;
    }
  }

  /**
   * Export report to specified format
   */
  private async exportReport(report: AuditReport, format: 'pdf' | 'html' | 'docx' | 'xlsx'): Promise<string> {
    const filename = `${report.id}.${format}`;
    const filepath = path.join(this.reportsPath, filename);

    // Ensure reports directory exists
    await fs.mkdir(this.reportsPath, { recursive: true });

    switch (format) {
      case 'html':
        await this.exportToHTML(report, filepath);
        break;
      case 'pdf':
        await this.exportToPDF(report, filepath);
        break;
      case 'docx':
        await this.exportToDocx(report, filepath);
        break;
      case 'xlsx':
        await this.exportToExcel(report, filepath);
        break;
    }

    return filepath;
  }

  /**
   * Export report to HTML format
   */
  private async exportToHTML(report: AuditReport, filepath: string): Promise<void> {
    const html = this.generateHTMLReport(report);
    await fs.writeFile(filepath, html, 'utf-8');
  }

  /**
   * Generate HTML report content
   */
  private generateHTMLReport(report: AuditReport): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>SOC2 Audit Report - ${report.id}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; }
        .summary { background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .finding { border-left: 4px solid #e74c3c; padding: 10px; margin: 10px 0; }
        .finding.critical { border-color: #c0392b; }
        .finding.high { border-color: #e74c3c; }
        .finding.medium { border-color: #f39c12; }
        .finding.low { border-color: #27ae60; }
        .recommendation { background: #e8f4f8; padding: 10px; margin: 10px 0; border-radius: 3px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>SOC2 ${report.reportType.charAt(0).toUpperCase() + report.reportType.slice(1)} Report</h1>
        <p><strong>Report ID:</strong> ${report.id}</p>
        <p><strong>Period:</strong> ${report.period.startDate.toDateString()} - ${report.period.endDate.toDateString()}</p>
        <p><strong>Generated:</strong> ${report.generatedAt.toLocaleString()}</p>
        <p><strong>Scope:</strong> ${report.scope.join(', ')}</p>
    </div>

    <div class="summary">
        <h2>Executive Summary</h2>
        <p><strong>Overall Score:</strong> ${report.summary.overallScore}%</p>
        <p><strong>Total Controls:</strong> ${report.summary.totalControls}</p>
        <p><strong>Compliant Controls:</strong> ${report.summary.compliantControls}</p>
        <p><strong>Non-Compliant Controls:</strong> ${report.summary.nonCompliantControls}</p>
        <p><strong>Critical Findings:</strong> ${report.summary.criticalFindings}</p>
        <p><strong>High Risk Findings:</strong> ${report.summary.highRiskFindings}</p>
    </div>

    <h2>Findings (${report.findings.length})</h2>
    ${report.findings.map(finding => `
        <div class="finding ${finding.severity}">
            <h3>${finding.controlName} (${finding.controlId})</h3>
            <p><strong>Severity:</strong> ${finding.severity.toUpperCase()}</p>
            <p><strong>Type:</strong> ${finding.type.replace(/_/g, ' ')}</p>
            <p><strong>Description:</strong> ${finding.description}</p>
            <p><strong>Impact:</strong> ${finding.impact}</p>
            <p><strong>Root Cause:</strong> ${finding.rootCause}</p>
        </div>
    `).join('')}

    <h2>Recommendations (${report.recommendations.length})</h2>
    ${report.recommendations.map(rec => `
        <div class="recommendation">
            <h3>${rec.title}</h3>
            <p><strong>Priority:</strong> ${rec.priority.toUpperCase()}</p>
            <p><strong>Description:</strong> ${rec.description}</p>
            <p><strong>Timeline:</strong> ${rec.implementation.timeline}</p>
            <p><strong>Estimated Effort:</strong> ${rec.implementation.estimatedEffort}</p>
            <p><strong>Steps:</strong></p>
            <ol>
                ${rec.implementation.steps.map(step => `<li>${step}</li>`).join('')}
            </ol>
        </div>
    `).join('')}

    ${report.trendAnalysis.controlTrends.length > 0 ? `
    <h2>Trend Analysis</h2>
    <p><strong>Overall Trend:</strong> ${report.trendAnalysis.overallTrend.charAt(0).toUpperCase() + report.trendAnalysis.overallTrend.slice(1)}</p>
    <table>
        <tr>
            <th>Control</th>
            <th>Category</th>
            <th>Trend</th>
            <th>Change Points</th>
        </tr>
        ${report.trendAnalysis.controlTrends.map(trend => `
            <tr>
                <td>${trend.controlName}</td>
                <td>${trend.category}</td>
                <td>${trend.trend}</td>
                <td>${trend.changePoints.length}</td>
            </tr>
        `).join('')}
    </table>
    ` : ''}

    <footer style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
        <p>This report was automatically generated by Fine Print AI SOC2 Compliance System</p>
        <p>Generated on ${report.generatedAt.toLocaleString()}</p>
    </footer>
</body>
</html>`;
  }

  /**
   * Export to PDF (placeholder - would use library like puppeteer)
   */
  private async exportToPDF(report: AuditReport, filepath: string): Promise<void> {
    // This is a placeholder - in production, you'd use a library like puppeteer
    const html = this.generateHTMLReport(report);
    await fs.writeFile(filepath.replace('.pdf', '.html'), html, 'utf-8');
    logger.info('PDF export not implemented - saved as HTML instead');
  }

  /**
   * Export to DOCX (placeholder)
   */
  private async exportToDocx(report: AuditReport, filepath: string): Promise<void> {
    // Placeholder - would use a library like docx
    const content = JSON.stringify(report, null, 2);
    await fs.writeFile(filepath.replace('.docx', '.json'), content, 'utf-8');
    logger.info('DOCX export not implemented - saved as JSON instead');
  }

  /**
   * Export to Excel (placeholder)
   */
  private async exportToExcel(report: AuditReport, filepath: string): Promise<void> {
    // Placeholder - would use a library like xlsx
    const content = JSON.stringify(report, null, 2);
    await fs.writeFile(filepath.replace('.xlsx', '.json'), content, 'utf-8');
    logger.info('Excel export not implemented - saved as JSON instead');
  }

  /**
   * Utility methods
   */
  private getPeriodStartDate(period: 'daily' | 'weekly' | 'monthly', endDate: Date): Date {
    const start = new Date(endDate);
    switch (period) {
      case 'daily':
        start.setDate(start.getDate() - 1);
        break;
      case 'weekly':
        start.setDate(start.getDate() - 7);
        break;
      case 'monthly':
        start.setMonth(start.getMonth() - 1);
        break;
    }
    return start;
  }

  private getEmptyTrendAnalysis(): TrendAnalysis {
    return {
      timeframe: 'N/A',
      overallTrend: 'stable',
      controlTrends: [],
      industryBenchmarks: [],
      seasonalPatterns: [],
      predictiveInsights: [],
    };
  }

  private async getFrameworkRequirements(framework: string): Promise<any[]> {
    // Placeholder - would fetch from database or configuration
    return [];
  }

  private async identifyGaps(current: any[], target: any[]): Promise<any[]> {
    // Placeholder gap analysis logic
    return [];
  }

  private convertGapsToFindings(gaps: any[]): AuditFinding[] {
    // Convert gap analysis results to findings format
    return gaps.map(gap => ({
      id: `gap_${Date.now()}_${Math.random()}`,
      controlId: gap.controlId || 'unknown',
      controlName: gap.controlName || 'Unknown Control',
      category: gap.category || 'unknown',
      severity: gap.severity || 'medium',
      type: 'design_deficiency' as const,
      description: gap.description || 'Gap identified in framework compliance',
      impact: gap.impact || 'Compliance gap',
      rootCause: gap.rootCause || 'Framework requirement not met',
      currentStatus: 'open',
      evidenceReviewed: [],
      detectedAt: new Date(),
    }));
  }
}