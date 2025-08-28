import { Storage } from "@plasmohq/storage"

import { getApiClient } from "./api-client"
import { enterpriseManager } from "./enterprise-manager"
import { historyManager } from "./history-manager"
import { bulkAnalysisManager } from "./bulk-analysis"
import type { 
  ReportingConfig,
  AnalyticsData,
  HistoryEntry,
  BulkAnalysisJob
} from "@/types"

export interface ComplianceReport {
  id: string
  type: 'daily' | 'weekly' | 'monthly' | 'custom'
  period: {
    start: number
    end: number
    label: string
  }
  generatedAt: number
  organizationId: string
  summary: ComplianceSummary
  sections: ReportSection[]
  metadata: ReportMetadata
}

export interface ComplianceSummary {
  totalDocumentsAnalyzed: number
  highRiskDocuments: number
  policyViolations: number
  complianceScore: number // 0-100
  averageRiskScore: number
  topRisks: Array<{ category: string; count: number; avgRisk: number }>
  trends: {
    riskTrend: 'improving' | 'stable' | 'worsening'
    volumeTrend: 'increasing' | 'stable' | 'decreasing'
    complianceTrend: 'improving' | 'stable' | 'declining'
  }
}

export interface ReportSection {
  id: string
  title: string
  type: 'summary' | 'chart' | 'table' | 'list' | 'metrics'
  data: any
  insights: string[]
  recommendations: string[]
}

export interface ReportMetadata {
  version: string
  generatedBy: string
  recipients: string[]
  confidentiality: 'public' | 'internal' | 'confidential' | 'restricted'
  retention: number // days
  exportFormats: string[]
}

export class ComplianceReporter {
  private storage = new Storage()
  private scheduledReports = new Map<string, NodeJS.Timeout>()

  constructor() {
    this.initializeScheduler()
  }

  /**
   * Generate compliance report
   */
  async generateReport(
    type: ComplianceReport['type'],
    customPeriod?: { start: number; end: number }
  ): Promise<ComplianceReport> {
    const period = customPeriod || this.getPeriodForType(type)
    const organizationId = await this.getOrganizationId()

    // Gather data from various sources
    const [
      analyticsData,
      historyData,
      enterpriseData,
      bulkAnalysisData
    ] = await Promise.all([
      historyManager.getAnalytics(period),
      this.getHistoryData(period),
      this.getEnterpriseData(period),
      this.getBulkAnalysisData(period)
    ])

    // Generate summary
    const summary = this.generateSummary(analyticsData, enterpriseData, historyData)

    // Generate report sections
    const sections = await this.generateReportSections(
      analyticsData,
      historyData,
      enterpriseData,
      bulkAnalysisData,
      period
    )

    const report: ComplianceReport = {
      id: `report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      period: {
        start: period.start,
        end: period.end,
        label: this.getPeriodLabel(type, period)
      },
      generatedAt: Date.now(),
      organizationId,
      summary,
      sections,
      metadata: {
        version: '1.0',
        generatedBy: 'Fine Print AI Extension',
        recipients: await this.getReportRecipients(),
        confidentiality: 'internal',
        retention: 365, // 1 year
        exportFormats: ['pdf', 'html', 'json', 'csv']
      }
    }

    // Store report
    await this.storeReport(report)

    // Send to recipients if configured
    await this.distributeReport(report)

    return report
  }

  /**
   * Schedule automated reports
   */
  async scheduleReports(): Promise<void> {
    const config = await enterpriseManager.getEnterpriseConfig()
    if (!config?.reportingConfig) return

    const { frequency } = config.reportingConfig

    // Clear existing schedules
    this.clearSchedules()

    // Schedule new reports
    const intervalMs = this.getIntervalMs(frequency)
    const timeout = setTimeout(() => {
      this.generateAndSendScheduledReport(frequency)
      // Reschedule for next period
      this.scheduleReports()
    }, intervalMs)

    this.scheduledReports.set(frequency, timeout)
  }

  /**
   * Get historical reports
   */
  async getReports(
    limit: number = 50,
    filters?: {
      type?: ComplianceReport['type']
      dateRange?: { start: number; end: number }
    }
  ): Promise<ComplianceReport[]> {
    try {
      const allData = await this.storage.getAll()
      let reports: ComplianceReport[] = []

      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('compliance-report-')) {
          reports.push(value as ComplianceReport)
        }
      }

      // Apply filters
      if (filters?.type) {
        reports = reports.filter(r => r.type === filters.type)
      }

      if (filters?.dateRange) {
        reports = reports.filter(r => 
          r.generatedAt >= filters.dateRange!.start && 
          r.generatedAt <= filters.dateRange!.end
        )
      }

      return reports
        .sort((a, b) => b.generatedAt - a.generatedAt)
        .slice(0, limit)
    } catch {
      return []
    }
  }

  /**
   * Export report in specified format
   */
  async exportReport(reportId: string, format: 'pdf' | 'html' | 'json' | 'csv'): Promise<Blob> {
    const report = await this.getReport(reportId)
    if (!report) {
      throw new Error('Report not found')
    }

    switch (format) {
      case 'json':
        return new Blob([JSON.stringify(report, null, 2)], { 
          type: 'application/json' 
        })
      
      case 'csv':
        return this.exportAsCSV(report)
      
      case 'html':
        return this.exportAsHTML(report)
      
      case 'pdf':
        return this.exportAsPDF(report)

      default:
        throw new Error(`Unsupported format: ${format}`)
    }
  }

  /**
   * Get specific report
   */
  async getReport(reportId: string): Promise<ComplianceReport | null> {
    try {
      const report = await this.storage.get(`compliance-report-${reportId}`)
      return report
    } catch {
      return null
    }
  }

  /**
   * Delete report
   */
  async deleteReport(reportId: string): Promise<boolean> {
    try {
      await this.storage.remove(`compliance-report-${reportId}`)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get compliance dashboard data
   */
  async getDashboardData(): Promise<{
    kpis: Array<{ name: string; value: string | number; trend: string; status: 'good' | 'warning' | 'critical' }>
    recentReports: ComplianceReport[]
    alerts: Array<{ id: string; type: string; message: string; severity: string; timestamp: number }>
    trends: {
      riskScores: Array<{ date: number; score: number }>
      documentVolume: Array<{ date: number; count: number }>
      complianceScore: Array<{ date: number; score: number }>
    }
  }> {
    const now = Date.now()
    const last30Days = { start: now - (30 * 24 * 60 * 60 * 1000), end: now }
    const last7Days = { start: now - (7 * 24 * 60 * 60 * 1000), end: now }

    const [
      monthlyAnalytics,
      weeklyAnalytics,
      recentReports,
      enterpriseData
    ] = await Promise.all([
      historyManager.getAnalytics(last30Days),
      historyManager.getAnalytics(last7Days),
      this.getReports(5),
      enterpriseManager.generateComplianceReport(last30Days)
    ])

    // Calculate KPIs
    const kpis = [
      {
        name: 'Documents Analyzed (30d)',
        value: monthlyAnalytics.documentsAnalyzed,
        trend: this.calculateTrend(monthlyAnalytics.documentsAnalyzed, weeklyAnalytics.documentsAnalyzed),
        status: monthlyAnalytics.documentsAnalyzed > 0 ? 'good' : 'warning' as const
      },
      {
        name: 'Average Risk Score',
        value: monthlyAnalytics.averageRiskScore,
        trend: this.calculateRiskTrend(monthlyAnalytics.averageRiskScore),
        status: this.getRiskStatus(monthlyAnalytics.averageRiskScore)
      },
      {
        name: 'Policy Violations (30d)',
        value: enterpriseData.violations.length,
        trend: this.calculateViolationTrend(enterpriseData.violations),
        status: enterpriseData.violations.length === 0 ? 'good' : 
               enterpriseData.violations.length < 5 ? 'warning' : 'critical'
      },
      {
        name: 'Compliance Score',
        value: `${enterpriseData.summary.complianceScore}%`,
        trend: this.calculateComplianceTrend(enterpriseData.summary.complianceScore),
        status: this.getComplianceStatus(enterpriseData.summary.complianceScore)
      }
    ]

    // Generate alerts
    const alerts = await this.generateAlerts(monthlyAnalytics, enterpriseData)

    // Generate trends
    const trends = {
      riskScores: monthlyAnalytics.riskTrends,
      documentVolume: await this.getDocumentVolumeTrend(last30Days),
      complianceScore: await this.getComplianceScoreTrend(last30Days)
    }

    return {
      kpis,
      recentReports,
      alerts,
      trends
    }
  }

  /**
   * Generate automated alerts
   */
  private async generateAlerts(analytics: AnalyticsData, enterpriseData: any): Promise<any[]> {
    const alerts = []

    // High risk score alert
    if (analytics.averageRiskScore > 70) {
      alerts.push({
        id: `alert-${Date.now()}-1`,
        type: 'high-risk',
        message: `Average risk score is ${analytics.averageRiskScore}/100, above the recommended threshold`,
        severity: 'critical',
        timestamp: Date.now()
      })
    }

    // Policy violation alert
    if (enterpriseData.violations.length > 10) {
      alerts.push({
        id: `alert-${Date.now()}-2`,
        type: 'policy-violations',
        message: `${enterpriseData.violations.length} policy violations detected in the last 30 days`,
        severity: 'warning',
        timestamp: Date.now()
      })
    }

    // Low analysis volume alert
    if (analytics.documentsAnalyzed < 5) {
      alerts.push({
        id: `alert-${Date.now()}-3`,
        type: 'low-activity',
        message: 'Low document analysis activity detected. Consider training users.',
        severity: 'warning',
        timestamp: Date.now()
      })
    }

    return alerts
  }

  /**
   * Initialize report scheduler
   */
  private async initializeScheduler(): Promise<void> {
    await this.scheduleReports()
  }

  /**
   * Generate report summary
   */
  private generateSummary(
    analytics: AnalyticsData, 
    enterpriseData: any, 
    historyData: HistoryEntry[]
  ): ComplianceSummary {
    const highRiskDocs = historyData.filter(h => h.riskScore >= 70).length
    const totalFindings = historyData.reduce((sum, h) => sum + h.findingsCount, 0)

    return {
      totalDocumentsAnalyzed: analytics.documentsAnalyzed,
      highRiskDocuments: highRiskDocs,
      policyViolations: enterpriseData.violations.length,
      complianceScore: enterpriseData.summary.complianceScore,
      averageRiskScore: analytics.averageRiskScore,
      topRisks: this.calculateTopRisks(historyData),
      trends: {
        riskTrend: this.calculateRiskTrendDirection(analytics.riskTrends),
        volumeTrend: 'stable', // Would calculate from historical data
        complianceTrend: 'improving' // Would calculate from historical compliance scores
      }
    }
  }

  /**
   * Generate report sections
   */
  private async generateReportSections(
    analytics: AnalyticsData,
    historyData: HistoryEntry[],
    enterpriseData: any,
    bulkAnalysisData: BulkAnalysisJob[],
    period: { start: number; end: number }
  ): Promise<ReportSection[]> {
    return [
      {
        id: 'executive-summary',
        title: 'Executive Summary',
        type: 'summary',
        data: {
          keyMetrics: {
            documentsAnalyzed: analytics.documentsAnalyzed,
            averageRiskScore: analytics.averageRiskScore,
            policyViolations: enterpriseData.violations.length,
            complianceScore: enterpriseData.summary.complianceScore
          },
          periodComparison: await this.getPeriodComparison(period)
        },
        insights: [
          `Analyzed ${analytics.documentsAnalyzed} documents with an average risk score of ${analytics.averageRiskScore}/100`,
          `${enterpriseData.violations.length} policy violations detected`,
          `Overall compliance score: ${enterpriseData.summary.complianceScore}%`
        ],
        recommendations: [
          'Focus on reducing high-risk document exposure',
          'Implement additional policy controls for frequent violations',
          'Increase user training on legal document risks'
        ]
      },
      {
        id: 'risk-analysis',
        title: 'Risk Analysis',
        type: 'chart',
        data: {
          riskDistribution: this.calculateRiskDistribution(historyData),
          riskTrends: analytics.riskTrends,
          topRiskCategories: analytics.commonFindings.slice(0, 5)
        },
        insights: [
          `${Math.round((historyData.filter(h => h.riskScore >= 70).length / historyData.length) * 100)}% of documents are high-risk`,
          `Most common risk category: ${analytics.commonFindings[0]?.category || 'N/A'}`
        ],
        recommendations: [
          'Prioritize review of high-risk documents',
          'Implement automated blocking for critical risk categories'
        ]
      },
      {
        id: 'policy-compliance',
        title: 'Policy Compliance',
        type: 'table',
        data: {
          violations: enterpriseData.violations,
          reviews: enterpriseData.reviews,
          approvals: enterpriseData.approvals
        },
        insights: [
          `${enterpriseData.violations.length} policy violations require attention`,
          `${enterpriseData.reviews.length} documents pending review`
        ],
        recommendations: [
          'Review and update policy thresholds',
          'Automate more approval workflows'
        ]
      },
      {
        id: 'user-activity',
        title: 'User Activity',
        type: 'metrics',
        data: {
          activeUsers: await this.getActiveUserCount(period),
          bulkAnalysisJobs: bulkAnalysisData.length,
          averageSessionTime: analytics.timeSpentAnalyzing / analytics.documentsAnalyzed
        },
        insights: [
          `${bulkAnalysisData.length} bulk analysis jobs completed`,
          `Average time per analysis: ${Math.round(analytics.timeSpentAnalyzing / analytics.documentsAnalyzed / 1000)}s`
        ],
        recommendations: [
          'Encourage more proactive bulk analysis',
          'Provide training on efficient analysis techniques'
        ]
      }
    ]
  }

  /**
   * Store report in storage
   */
  private async storeReport(report: ComplianceReport): Promise<void> {
    await this.storage.set(`compliance-report-${report.id}`, report)
  }

  /**
   * Distribute report to recipients
   */
  private async distributeReport(report: ComplianceReport): Promise<void> {
    const config = await enterpriseManager.getEnterpriseConfig()
    if (!config?.reportingConfig?.recipients) return

    try {
      const apiClient = getApiClient()
      
      // Generate HTML version for email
      const htmlBlob = await this.exportAsHTML(report)
      const htmlContent = await htmlBlob.text()

      await apiClient.sendReport({
        reportId: report.id,
        recipients: config.reportingConfig.recipients,
        subject: `Compliance Report - ${report.period.label}`,
        format: config.reportingConfig.format,
        content: htmlContent,
        attachments: []
      })
    } catch (error) {
      console.error('Failed to distribute report:', error)
    }
  }

  /**
   * Helper methods for data processing
   */
  private getPeriodForType(type: ComplianceReport['type']): { start: number; end: number } {
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    
    switch (type) {
      case 'daily':
        return { start: now - day, end: now }
      case 'weekly':
        return { start: now - (7 * day), end: now }
      case 'monthly':
        return { start: now - (30 * day), end: now }
      default:
        return { start: now - (7 * day), end: now }
    }
  }

  private getPeriodLabel(type: ComplianceReport['type'], period: { start: number; end: number }): string {
    const startDate = new Date(period.start).toLocaleDateString()
    const endDate = new Date(period.end).toLocaleDateString()
    return `${type.charAt(0).toUpperCase() + type.slice(1)} Report (${startDate} - ${endDate})`
  }

  // Additional helper methods...
  private async getHistoryData(period: { start: number; end: number }): Promise<HistoryEntry[]> {
    const history = await historyManager.getHistory()
    return history.entries.filter(entry => 
      entry.analysisDate >= period.start && entry.analysisDate <= period.end
    )
  }

  private async getEnterpriseData(period: { start: number; end: number }): Promise<any> {
    return await enterpriseManager.generateComplianceReport(period)
  }

  private async getBulkAnalysisData(period: { start: number; end: number }): Promise<BulkAnalysisJob[]> {
    const jobs = await bulkAnalysisManager.getAllJobs()
    return jobs.filter(job => 
      job.createdAt >= period.start && job.createdAt <= period.end
    )
  }

  private async getOrganizationId(): Promise<string> {
    const config = await enterpriseManager.getEnterpriseConfig()
    return config?.organizationId || 'default'
  }

  private async getReportRecipients(): Promise<string[]> {
    const config = await enterpriseManager.getEnterpriseConfig()
    return config?.reportingConfig?.recipients || []
  }

  private getIntervalMs(frequency: 'daily' | 'weekly' | 'monthly'): number {
    const day = 24 * 60 * 60 * 1000
    switch (frequency) {
      case 'daily': return day
      case 'weekly': return 7 * day
      case 'monthly': return 30 * day
      default: return day
    }
  }

  private clearSchedules(): void {
    for (const timeout of this.scheduledReports.values()) {
      clearTimeout(timeout)
    }
    this.scheduledReports.clear()
  }

  private async generateAndSendScheduledReport(type: ComplianceReport['type']): Promise<void> {
    try {
      await this.generateReport(type)
    } catch (error) {
      console.error('Failed to generate scheduled report:', error)
    }
  }

  // Additional utility methods for calculations, trends, exports, etc.
  private calculateTrend(current: number, previous: number): string {
    if (current > previous) return 'up'
    if (current < previous) return 'down'
    return 'stable'
  }

  private calculateRiskTrend(riskScore: number): string {
    if (riskScore > 70) return 'up'
    if (riskScore < 30) return 'down'
    return 'stable'
  }

  private getRiskStatus(riskScore: number): 'good' | 'warning' | 'critical' {
    if (riskScore < 30) return 'good'
    if (riskScore < 70) return 'warning'
    return 'critical'
  }

  private getComplianceStatus(score: number): 'good' | 'warning' | 'critical' {
    if (score >= 80) return 'good'
    if (score >= 60) return 'warning'
    return 'critical'
  }

  private calculateTopRisks(historyData: HistoryEntry[]): Array<{ category: string; count: number; avgRisk: number }> {
    const riskMap = new Map<string, { count: number; totalRisk: number }>()
    
    historyData.forEach(entry => {
      const category = entry.documentType
      const existing = riskMap.get(category) || { count: 0, totalRisk: 0 }
      riskMap.set(category, {
        count: existing.count + 1,
        totalRisk: existing.totalRisk + entry.riskScore
      })
    })

    return Array.from(riskMap.entries())
      .map(([category, data]) => ({
        category,
        count: data.count,
        avgRisk: Math.round(data.totalRisk / data.count)
      }))
      .sort((a, b) => b.avgRisk - a.avgRisk)
      .slice(0, 5)
  }

  private calculateRiskTrendDirection(riskTrends: Array<{ date: number; score: number }>): 'improving' | 'stable' | 'worsening' {
    if (riskTrends.length < 2) return 'stable'
    
    const recent = riskTrends.slice(-5)
    const older = riskTrends.slice(0, 5)
    
    const recentAvg = recent.reduce((sum, item) => sum + item.score, 0) / recent.length
    const olderAvg = older.reduce((sum, item) => sum + item.score, 0) / older.length
    
    if (recentAvg < olderAvg - 5) return 'improving'
    if (recentAvg > olderAvg + 5) return 'worsening'
    return 'stable'
  }

  private calculateRiskDistribution(historyData: HistoryEntry[]): { low: number; medium: number; high: number } {
    return historyData.reduce(
      (acc, entry) => {
        if (entry.riskScore < 30) acc.low++
        else if (entry.riskScore < 70) acc.medium++
        else acc.high++
        return acc
      },
      { low: 0, medium: 0, high: 0 }
    )
  }

  private async getPeriodComparison(period: { start: number; end: number }): Promise<any> {
    // Compare with previous period of same duration
    const duration = period.end - period.start
    const previousPeriod = {
      start: period.start - duration,
      end: period.start
    }

    const [currentData, previousData] = await Promise.all([
      historyManager.getAnalytics(period),
      historyManager.getAnalytics(previousPeriod)
    ])

    return {
      documentsAnalyzed: {
        current: currentData.documentsAnalyzed,
        previous: previousData.documentsAnalyzed,
        change: currentData.documentsAnalyzed - previousData.documentsAnalyzed
      },
      averageRiskScore: {
        current: currentData.averageRiskScore,
        previous: previousData.averageRiskScore,
        change: currentData.averageRiskScore - previousData.averageRiskScore
      }
    }
  }

  private async getActiveUserCount(period: { start: number; end: number }): Promise<number> {
    // This would need user tracking implementation
    return 1 // Placeholder
  }

  private async getDocumentVolumeTrend(period: { start: number; end: number }): Promise<Array<{ date: number; count: number }>> {
    // Generate daily document count trend
    const days = Math.ceil((period.end - period.start) / (24 * 60 * 60 * 1000))
    const trend = []
    
    for (let i = 0; i < days; i++) {
      const dayStart = period.start + (i * 24 * 60 * 60 * 1000)
      const dayEnd = dayStart + (24 * 60 * 60 * 1000)
      
      const dayData = await historyManager.getAnalytics({ start: dayStart, end: dayEnd })
      trend.push({
        date: dayStart,
        count: dayData.documentsAnalyzed
      })
    }
    
    return trend
  }

  private async getComplianceScoreTrend(period: { start: number; end: number }): Promise<Array<{ date: number; score: number }>> {
    // Generate compliance score trend
    const days = Math.ceil((period.end - period.start) / (24 * 60 * 60 * 1000))
    const trend = []
    
    for (let i = 0; i < days; i++) {
      const dayStart = period.start + (i * 24 * 60 * 60 * 1000)
      const dayEnd = dayStart + (24 * 60 * 60 * 1000)
      
      const dayData = await enterpriseManager.generateComplianceReport({ start: dayStart, end: dayEnd })
      trend.push({
        date: dayStart,
        score: dayData.summary.complianceScore
      })
    }
    
    return trend
  }

  // Export method implementations
  private exportAsCSV(report: ComplianceReport): Blob {
    const data = [
      ['Metric', 'Value'],
      ['Report ID', report.id],
      ['Period', report.period.label],
      ['Documents Analyzed', report.summary.totalDocumentsAnalyzed.toString()],
      ['High Risk Documents', report.summary.highRiskDocuments.toString()],
      ['Policy Violations', report.summary.policyViolations.toString()],
      ['Compliance Score', `${report.summary.complianceScore}%`],
      ['Average Risk Score', report.summary.averageRiskScore.toString()]
    ]

    const csv = data
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    return new Blob([csv], { type: 'text/csv' })
  }

  private exportAsHTML(report: ComplianceReport): Blob {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>${report.period.label}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
        .metric { background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #333; }
        .metric-label { color: #666; margin-top: 10px; }
        .section { margin-bottom: 40px; }
        .section-title { font-size: 1.5em; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
        .insights, .recommendations { margin: 20px 0; }
        .insights ul, .recommendations ul { padding-left: 20px; }
        .insights li, .recommendations li { margin: 10px 0; }
        .footer { text-align: center; color: #666; font-size: 0.9em; border-top: 1px solid #ddd; padding-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Compliance Report</h1>
        <p><strong>Organization:</strong> ${report.organizationId}</p>
        <p><strong>Period:</strong> ${report.period.label}</p>
        <p><strong>Generated:</strong> ${new Date(report.generatedAt).toLocaleString()}</p>
    </div>
    
    <div class="summary">
        <div class="metric">
            <div class="metric-value">${report.summary.totalDocumentsAnalyzed}</div>
            <div class="metric-label">Documents Analyzed</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.averageRiskScore}</div>
            <div class="metric-label">Average Risk Score</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.policyViolations}</div>
            <div class="metric-label">Policy Violations</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.complianceScore}%</div>
            <div class="metric-label">Compliance Score</div>
        </div>
    </div>
    
    ${report.sections.map(section => `
        <div class="section">
            <h2 class="section-title">${section.title}</h2>
            <div class="insights">
                <h3>Key Insights:</h3>
                <ul>
                    ${section.insights.map(insight => `<li>${insight}</li>`).join('')}
                </ul>
            </div>
            <div class="recommendations">
                <h3>Recommendations:</h3>
                <ul>
                    ${section.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        </div>
    `).join('')}
    
    <div class="footer">
        <p>Generated by Fine Print AI Extension v${report.metadata.version}</p>
        <p>Confidentiality: ${report.metadata.confidentiality.charAt(0).toUpperCase() + report.metadata.confidentiality.slice(1)}</p>
    </div>
</body>
</html>
    `

    return new Blob([html], { type: 'text/html' })
  }

  private exportAsPDF(report: ComplianceReport): Blob {
    // Placeholder - would use a PDF generation library in production
    const content = `
Fine Print AI Compliance Report

Organization: ${report.organizationId}
Period: ${report.period.label}
Generated: ${new Date(report.generatedAt).toLocaleString()}

SUMMARY
Documents Analyzed: ${report.summary.totalDocumentsAnalyzed}
Average Risk Score: ${report.summary.averageRiskScore}
Policy Violations: ${report.summary.policyViolations}
Compliance Score: ${report.summary.complianceScore}%

${report.sections.map(section => `
${section.title.toUpperCase()}
Key Insights:
${section.insights.map(insight => `• ${insight}`).join('\n')}

Recommendations:
${section.recommendations.map(rec => `• ${rec}`).join('\n')}
`).join('\n')}

Generated by Fine Print AI Extension v${report.metadata.version}
    `

    return new Blob([content], { type: 'application/pdf' })
  }

  private calculateViolationTrend(violations: any[]): string {
    // Simplified trend calculation
    const recent = violations.filter(v => v.timestamp > Date.now() - (7 * 24 * 60 * 60 * 1000))
    const older = violations.filter(v => v.timestamp <= Date.now() - (7 * 24 * 60 * 60 * 1000))
    
    if (recent.length > older.length) return 'up'
    if (recent.length < older.length) return 'down'
    return 'stable'
  }

  private calculateComplianceTrend(score: number): string {
    // Would compare with historical scores
    if (score >= 80) return 'up'
    if (score < 60) return 'down'
    return 'stable'
  }
}

// Export singleton instance
export const complianceReporter = new ComplianceReporter()