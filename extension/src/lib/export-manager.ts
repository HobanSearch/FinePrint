import { Storage } from "@plasmohq/storage"

import { historyManager } from "./history-manager"
import { bulkAnalysisManager } from "./bulk-analysis"
import { complianceReporter } from "./compliance-reporter"
import { enterpriseManager } from "./enterprise-manager"
import type { 
  ExportOptions,
  PageAnalysisState,
  BulkAnalysisJob,
  HistoryEntry,
  ExtensionFinding
} from "@/types"

export interface ExportTemplate {
  id: string
  name: string
  type: 'analysis' | 'bulk-analysis' | 'compliance' | 'history' | 'custom'
  format: 'pdf' | 'html' | 'docx' | 'json' | 'csv'
  sections: ExportSection[]
  styling: ExportStyling
  createdAt: number
  updatedAt: number
  isDefault: boolean
}

export interface ExportSection {
  id: string
  title: string
  type: 'header' | 'summary' | 'findings' | 'recommendations' | 'charts' | 'table' | 'custom'
  content: any
  styling?: Partial<ExportStyling>
  includeConditions?: ExportCondition[]
}

export interface ExportStyling {
  fontFamily: string
  fontSize: number
  headerColor: string
  textColor: string
  backgroundColor: string
  accentColor: string
  logo?: string
  watermark?: string
  pageHeader?: string
  pageFooter?: string
  margins: { top: number; right: number; bottom: number; left: number }
  includePageNumbers: boolean
  includeTOC: boolean
}

export interface ExportCondition {
  field: string
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'not_empty'
  value: any
}

export interface ExportJob {
  id: string
  type: 'single-analysis' | 'bulk-analysis' | 'compliance-report' | 'custom'
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  options: ExportOptions
  template?: ExportTemplate
  data: any
  result?: {
    filename: string
    size: number
    downloadUrl: string
  }
  createdAt: number
  completedAt?: number
  error?: string
}

export class ExportManager {
  private storage = new Storage()
  private exportJobs = new Map<string, ExportJob>()
  private templates = new Map<string, ExportTemplate>()

  constructor() {
    this.initialize()
  }

  /**
   * Initialize export manager
   */
  async initialize(): Promise<void> {
    await this.loadTemplates()
    await this.loadExportJobs()
  }

  /**
   * Export single analysis result
   */
  async exportAnalysis(
    analysisId: string, 
    options: ExportOptions,
    templateId?: string
  ): Promise<ExportJob> {
    // Get analysis data
    const analysis = await this.getAnalysisData(analysisId)
    if (!analysis) {
      throw new Error('Analysis not found')
    }

    const template = templateId ? await this.getTemplate(templateId) : this.getDefaultTemplate(options.format)
    
    const job: ExportJob = {
      id: `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'single-analysis',
      status: 'queued',
      progress: 0,
      options,
      template,
      data: analysis,
      createdAt: Date.now()
    }

    this.exportJobs.set(job.id, job)
    await this.saveExportJob(job)

    // Process export asynchronously
    this.processExportJob(job.id)

    return job
  }

  /**
   * Export bulk analysis results
   */
  async exportBulkAnalysis(
    jobId: string,
    options: ExportOptions,
    templateId?: string
  ): Promise<ExportJob> {
    const bulkJob = await bulkAnalysisManager.getJob(jobId)
    if (!bulkJob) {
      throw new Error('Bulk analysis job not found')
    }

    const template = templateId ? await this.getTemplate(templateId) : this.getDefaultBulkTemplate(options.format)

    const exportJob: ExportJob = {
      id: `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'bulk-analysis',
      status: 'queued',
      progress: 0,
      options,
      template,
      data: bulkJob,
      createdAt: Date.now()
    }

    this.exportJobs.set(exportJob.id, exportJob)
    await this.saveExportJob(exportJob)

    this.processExportJob(exportJob.id)

    return exportJob
  }

  /**
   * Export compliance report
   */
  async exportComplianceReport(
    reportId: string,
    options: ExportOptions,
    templateId?: string
  ): Promise<ExportJob> {
    const report = await complianceReporter.getReport(reportId)
    if (!report) {
      throw new Error('Compliance report not found')
    }

    const template = templateId ? await this.getTemplate(templateId) : this.getDefaultComplianceTemplate(options.format)

    const exportJob: ExportJob = {
      id: `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'compliance-report',
      status: 'queued',
      progress: 0,
      options,
      template,
      data: report,
      createdAt: Date.now()
    }

    this.exportJobs.set(exportJob.id, exportJob)
    await this.saveExportJob(exportJob)

    this.processExportJob(exportJob.id)

    return exportJob
  }

  /**
   * Export analysis history
   */
  async exportHistory(
    options: ExportOptions,
    templateId?: string
  ): Promise<ExportJob> {
    const history = await historyManager.getHistory()
    
    // Apply date range filter if specified
    let entries = history.entries
    if (options.dateRange) {
      entries = entries.filter(entry => 
        entry.analysisDate >= options.dateRange!.start && 
        entry.analysisDate <= options.dateRange!.end
      )
    }

    const template = templateId ? await this.getTemplate(templateId) : this.getDefaultHistoryTemplate(options.format)

    const exportJob: ExportJob = {
      id: `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'custom',
      status: 'queued',
      progress: 0,
      options,
      template,
      data: { entries, summary: { totalEntries: entries.length } },
      createdAt: Date.now()
    }

    this.exportJobs.set(exportJob.id, exportJob)
    await this.saveExportJob(exportJob)

    this.processExportJob(exportJob.id)

    return exportJob
  }

  /**
   * Get export job status
   */
  async getExportJob(jobId: string): Promise<ExportJob | null> {
    const job = this.exportJobs.get(jobId)
    if (job) return job

    try {
      const stored = await this.storage.get(`export-job-${jobId}`)
      if (stored) {
        this.exportJobs.set(jobId, stored)
        return stored
      }
    } catch {
      // Job not found
    }

    return null
  }

  /**
   * Download export result
   */
  async downloadExport(jobId: string): Promise<Blob> {
    const job = await this.getExportJob(jobId)
    if (!job || job.status !== 'completed' || !job.result) {
      throw new Error('Export not available')
    }

    try {
      const data = await this.storage.get(`export-result-${jobId}`)
      if (!data) {
        throw new Error('Export data not found')
      }

      // Convert stored data back to Blob
      const byteCharacters = atob(data.content)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      
      return new Blob([byteArray], { type: data.mimeType })
    } catch (error) {
      throw new Error(`Failed to download export: ${error}`)
    }
  }

  /**
   * Create custom export template
   */
  async createTemplate(template: Omit<ExportTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExportTemplate> {
    const newTemplate: ExportTemplate = {
      ...template,
      id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    this.templates.set(newTemplate.id, newTemplate)
    await this.saveTemplate(newTemplate)

    return newTemplate
  }

  /**
   * Get available templates
   */
  async getTemplates(type?: ExportTemplate['type']): Promise<ExportTemplate[]> {
    const allTemplates = Array.from(this.templates.values())
    
    if (type) {
      return allTemplates.filter(t => t.type === type)
    }
    
    return allTemplates
  }

  /**
   * Process export job
   */
  private async processExportJob(jobId: string): Promise<void> {
    const job = this.exportJobs.get(jobId)
    if (!job) return

    try {
      job.status = 'processing'
      job.progress = 10
      await this.saveExportJob(job)

      let result: Blob

      switch (job.options.format) {
        case 'pdf':
          result = await this.generatePDF(job)
          break
        case 'html':
          result = await this.generateHTML(job)
          break
        case 'docx':
          result = await this.generateDOCX(job)
          break
        case 'json':
          result = await this.generateJSON(job)
          break
        case 'csv':
          result = await this.generateCSV(job)
          break
        default:
          throw new Error(`Unsupported format: ${job.options.format}`)
      }

      // Store result
      const filename = this.generateFilename(job)
      await this.storeExportResult(jobId, result, filename)

      job.status = 'completed'
      job.progress = 100
      job.completedAt = Date.now()
      job.result = {
        filename,
        size: result.size,
        downloadUrl: `export-result-${jobId}`
      }

      await this.saveExportJob(job)

    } catch (error) {
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : 'Export failed'
      await this.saveExportJob(job)
    }
  }

  /**
   * Generate PDF export
   */
  private async generatePDF(job: ExportJob): Promise<Blob> {
    job.progress = 30
    await this.saveExportJob(job)

    // For a production implementation, you would use a PDF library like jsPDF or Puppeteer
    // This is a simplified implementation
    const htmlContent = await this.generateHTML(job)
    const htmlText = await htmlContent.text()

    job.progress = 70
    await this.saveExportJob(job)

    // Create a basic PDF-like content structure
    const pdfContent = this.convertHTMLToPDFContent(htmlText, job)

    job.progress = 90
    await this.saveExportJob(job)

    return new Blob([pdfContent], { type: 'application/pdf' })
  }

  /**
   * Generate HTML export
   */
  private async generateHTML(job: ExportJob): Promise<Blob> {
    job.progress = 30
    await this.saveExportJob(job)

    const template = job.template || this.getDefaultTemplate('html')
    const html = await this.renderHTMLTemplate(job.data, template, job.options)

    job.progress = 80
    await this.saveExportJob(job)

    return new Blob([html], { type: 'text/html' })
  }

  /**
   * Generate DOCX export
   */
  private async generateDOCX(job: ExportJob): Promise<Blob> {
    job.progress = 30
    await this.saveExportJob(job)

    // For production, you would use a library like docx or mammoth.js
    // This creates a basic Word-compatible document
    const content = await this.generateWordContent(job)

    job.progress = 80
    await this.saveExportJob(job)

    return new Blob([content], { 
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
    })
  }

  /**
   * Generate JSON export
   */
  private async generateJSON(job: ExportJob): Promise<Blob> {
    job.progress = 50
    await this.saveExportJob(job)

    const exportData = {
      metadata: {
        exportId: job.id,
        exportDate: new Date().toISOString(),
        exportType: job.type,
        format: job.options.format,
        version: '1.0'
      },
      data: job.data,
      options: job.options
    }

    job.progress = 90
    await this.saveExportJob(job)

    return new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    })
  }

  /**
   * Generate CSV export
   */
  private async generateCSV(job: ExportJob): Promise<Blob> {
    job.progress = 30
    await this.saveExportJob(job)

    let csvContent = ''

    switch (job.type) {
      case 'single-analysis':
        csvContent = this.generateAnalysisCSV(job.data)
        break
      case 'bulk-analysis':
        csvContent = this.generateBulkAnalysisCSV(job.data)
        break
      case 'compliance-report':
        csvContent = this.generateComplianceCSV(job.data)
        break
      default:
        csvContent = this.generateGenericCSV(job.data)
    }

    job.progress = 80
    await this.saveExportJob(job)

    return new Blob([csvContent], { type: 'text/csv' })
  }

  /**
   * Render HTML template
   */
  private async renderHTMLTemplate(data: any, template: ExportTemplate, options: ExportOptions): Promise<string> {
    const enterpriseConfig = await enterpriseManager.getEnterpriseConfig()
    const branding = enterpriseConfig?.branding

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.getDocumentTitle(data, template)}</title>
    <style>
        ${this.generateCSS(template.styling, branding)}
    </style>
</head>
<body>
    ${template.styling.pageHeader ? `<header class="page-header">${template.styling.pageHeader}</header>` : ''}
    
    <div class="document">
        ${await this.renderSections(data, template.sections, options)}
    </div>
    
    ${template.styling.pageFooter ? `<footer class="page-footer">${template.styling.pageFooter}</footer>` : ''}
    
    ${template.styling.watermark ? `<div class="watermark">${template.styling.watermark}</div>` : ''}
</body>
</html>
    `

    return html
  }

  /**
   * Render template sections
   */
  private async renderSections(data: any, sections: ExportSection[], options: ExportOptions): Promise<string> {
    let html = ''

    for (const section of sections) {
      if (this.shouldIncludeSection(section, data, options)) {
        html += await this.renderSection(data, section, options)
      }
    }

    return html
  }

  /**
   * Render individual section
   */
  private async renderSection(data: any, section: ExportSection, options: ExportOptions): Promise<string> {
    switch (section.type) {
      case 'header':
        return `<div class="section-header">
          <h1>${section.title}</h1>
          ${section.content ? `<div class="header-content">${section.content}</div>` : ''}
        </div>`

      case 'summary':
        return this.renderSummarySection(data, section)

      case 'findings':
        return this.renderFindingsSection(data, section, options)

      case 'recommendations':
        return this.renderRecommendationsSection(data, section)

      case 'table':
        return this.renderTableSection(data, section)

      case 'charts':
        return this.renderChartsSection(data, section)

      default:
        return `<div class="section">
          <h2>${section.title}</h2>
          <div class="section-content">${JSON.stringify(section.content)}</div>
        </div>`
    }
  }

  /**
   * Helper methods for specific section types
   */
  private renderSummarySection(data: any, section: ExportSection): string {
    const analysis = data as PageAnalysisState
    
    return `
      <div class="section summary-section">
        <h2>${section.title}</h2>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="label">Document URL:</span>
            <span class="value">${analysis.url}</span>
          </div>
          <div class="summary-item">
            <span class="label">Risk Score:</span>
            <span class="value risk-score-${this.getRiskLevel(analysis.riskScore || 0)}">${analysis.riskScore || 'N/A'}/100</span>
          </div>
          <div class="summary-item">
            <span class="label">Document Type:</span>
            <span class="value">${analysis.documentType || 'Unknown'}</span>
          </div>
          <div class="summary-item">
            <span class="label">Findings:</span>
            <span class="value">${analysis.findings?.length || 0}</span>
          </div>
          <div class="summary-item">
            <span class="label">Analysis Date:</span>
            <span class="value">${analysis.lastAnalyzed ? new Date(analysis.lastAnalyzed).toLocaleString() : 'N/A'}</span>
          </div>
        </div>
      </div>
    `
  }

  private renderFindingsSection(data: any, section: ExportSection, options: ExportOptions): string {
    const analysis = data as PageAnalysisState
    const findings = analysis.findings || []

    // Filter findings based on options
    let filteredFindings = findings
    if (options.filterBySeverity && options.filterBySeverity.length > 0) {
      filteredFindings = findings.filter(f => options.filterBySeverity!.includes(f.severity))
    }

    if (filteredFindings.length === 0) {
      return `
        <div class="section findings-section">
          <h2>${section.title}</h2>
          <p class="no-findings">No findings match the specified criteria.</p>
        </div>
      `
    }

    const findingsHTML = filteredFindings.map(finding => `
      <div class="finding finding-${finding.severity}">
        <div class="finding-header">
          <h3 class="finding-title">${finding.title}</h3>
          <span class="finding-severity severity-${finding.severity}">${finding.severity.toUpperCase()}</span>
        </div>
        <div class="finding-content">
          <p class="finding-description">${finding.description}</p>
          ${finding.textExcerpt ? `<blockquote class="finding-excerpt">"${finding.textExcerpt}"</blockquote>` : ''}
          ${options.includeRecommendations && finding.recommendation ? 
            `<div class="finding-recommendation">
              <strong>Recommendation:</strong> ${finding.recommendation}
            </div>` : ''}
          ${finding.impactExplanation ? 
            `<div class="finding-impact">
              <strong>Impact:</strong> ${finding.impactExplanation}
            </div>` : ''}
        </div>
      </div>
    `).join('')

    return `
      <div class="section findings-section">
        <h2>${section.title}</h2>
        <div class="findings-container">
          ${findingsHTML}
        </div>
      </div>
    `
  }

  private renderRecommendationsSection(data: any, section: ExportSection): string {
    const analysis = data as PageAnalysisState
    const findings = analysis.findings || []
    
    const recommendations = findings
      .filter(f => f.recommendation)
      .map(f => ({ category: f.category, recommendation: f.recommendation, severity: f.severity }))

    if (recommendations.length === 0) {
      return `
        <div class="section recommendations-section">
          <h2>${section.title}</h2>
          <p class="no-recommendations">No specific recommendations available.</p>
        </div>
      `
    }

    const recommendationsHTML = recommendations.map((rec, index) => `
      <div class="recommendation">
        <div class="recommendation-number">${index + 1}</div>
        <div class="recommendation-content">
          <h4 class="recommendation-category">${rec.category}</h4>
          <p class="recommendation-text">${rec.recommendation}</p>
        </div>
      </div>
    `).join('')

    return `
      <div class="section recommendations-section">
        <h2>${section.title}</h2>
        <div class="recommendations-container">
          ${recommendationsHTML}
        </div>
      </div>
    `
  }

  private renderTableSection(data: any, section: ExportSection): string {
    // Generic table renderer - would be customized based on section content
    return `
      <div class="section table-section">
        <h2>${section.title}</h2>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="2">Table content would be rendered here based on section configuration</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `
  }

  private renderChartsSection(data: any, section: ExportSection): string {
    // Charts would be rendered as static images or SVG in a production implementation
    return `
      <div class="section charts-section">
        <h2>${section.title}</h2>
        <div class="charts-container">
          <div class="chart-placeholder">
            Chart visualization would be rendered here
          </div>
        </div>
      </div>
    `
  }

  /**
   * Generate CSS for template styling
   */
  private generateCSS(styling: ExportStyling, branding?: any): string {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: ${styling.fontFamily};
        font-size: ${styling.fontSize}px;
        color: ${styling.textColor};
        background-color: ${styling.backgroundColor};
        line-height: 1.6;
        margin: ${styling.margins.top}px ${styling.margins.right}px ${styling.margins.bottom}px ${styling.margins.left}px;
      }

      .document {
        max-width: 210mm;
        margin: 0 auto;
        background: white;
        padding: 2rem;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
      }

      h1, h2, h3, h4, h5, h6 {
        color: ${styling.headerColor};
        margin-bottom: 1rem;
      }

      .section {
        margin-bottom: 2rem;
        page-break-inside: avoid;
      }

      .section-header h1 {
        font-size: 2rem;
        border-bottom: 3px solid ${styling.accentColor};
        padding-bottom: 0.5rem;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }

      .summary-item {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem;
        background: #f8f9fa;
        border-radius: 4px;
      }

      .label {
        font-weight: bold;
      }

      .value {
        color: ${styling.accentColor};
      }

      .risk-score-high { color: #dc3545; }
      .risk-score-medium { color: #ffc107; }
      .risk-score-low { color: #28a745; }

      .finding {
        border: 1px solid #e9ecef;
        border-radius: 8px;
        margin-bottom: 1rem;
        padding: 1rem;
      }

      .finding-critical { border-left: 4px solid #dc3545; }
      .finding-high { border-left: 4px solid #fd7e14; }
      .finding-medium { border-left: 4px solid #ffc107; }
      .finding-low { border-left: 4px solid #28a745; }

      .finding-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
      }

      .finding-title {
        margin: 0;
        font-size: 1.1rem;
      }

      .finding-severity {
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.8rem;
        font-weight: bold;
      }

      .severity-critical { background: #dc3545; color: white; }
      .severity-high { background: #fd7e14; color: white; }
      .severity-medium { background: #ffc107; color: black; }
      .severity-low { background: #28a745; color: white; }

      .finding-excerpt {
        background: #f8f9fa;
        border-left: 4px solid ${styling.accentColor};
        padding: 0.5rem 1rem;
        margin: 1rem 0;
        font-style: italic;
      }

      .finding-recommendation,
      .finding-impact {
        margin-top: 0.5rem;
        padding: 0.5rem;
        background: #e3f2fd;
        border-radius: 4px;
      }

      .recommendation {
        display: flex;
        margin-bottom: 1rem;
        padding: 1rem;
        background: #f8f9fa;
        border-radius: 8px;
      }

      .recommendation-number {
        width: 2rem;
        height: 2rem;
        background: ${styling.accentColor};
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        margin-right: 1rem;
        flex-shrink: 0;
      }

      .recommendation-category {
        color: ${styling.headerColor};
        margin-bottom: 0.5rem;
      }

      .data-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
      }

      .data-table th,
      .data-table td {
        padding: 0.75rem;
        text-align: left;
        border-bottom: 1px solid #e9ecef;
      }

      .data-table th {
        background: ${styling.headerColor};
        color: white;
        font-weight: bold;
      }

      .page-header,
      .page-footer {
        text-align: center;
        padding: 1rem;
        color: #6c757d;
        font-size: 0.9rem;
      }

      .watermark {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 3rem;
        color: rgba(0,0,0,0.1);
        pointer-events: none;
        z-index: -1;
      }

      @media print {
        body { margin: 0; }
        .document { box-shadow: none; }
        .section { page-break-inside: avoid; }
      }

      ${branding?.customCSS || ''}
    `
  }

  // Additional helper methods and utility functions...

  private shouldIncludeSection(section: ExportSection, data: any, options: ExportOptions): boolean {
    if (!section.includeConditions) return true

    return section.includeConditions.every(condition => {
      const fieldValue = this.getFieldValue(data, condition.field)
      
      switch (condition.operator) {
        case 'equals':
          return fieldValue === condition.value
        case 'contains':
          return String(fieldValue).toLowerCase().includes(String(condition.value).toLowerCase())
        case 'greater_than':
          return Number(fieldValue) > Number(condition.value)
        case 'less_than':
          return Number(fieldValue) < Number(condition.value)
        case 'not_empty':
          return fieldValue != null && fieldValue !== ''
        default:
          return true
      }
    })
  }

  private getFieldValue(data: any, fieldPath: string): any {
    return fieldPath.split('.').reduce((obj, key) => obj?.[key], data)
  }

  private getRiskLevel(score: number): string {
    if (score >= 70) return 'high'
    if (score >= 40) return 'medium'
    return 'low'
  }

  private getDocumentTitle(data: any, template: ExportTemplate): string {
    switch (template.type) {
      case 'analysis':
        return `Analysis Report - ${new URL(data.url).hostname}`
      case 'bulk-analysis':
        return `Bulk Analysis Report - ${data.documents?.length || 0} Documents`
      case 'compliance':
        return `Compliance Report - ${data.period?.label || 'Unknown Period'}`
      default:
        return 'Fine Print AI Export'
    }
  }

  private generateFilename(job: ExportJob): string {
    const timestamp = new Date().toISOString().split('T')[0]
    const extension = job.options.format

    switch (job.type) {
      case 'single-analysis':
        const domain = new URL(job.data.url).hostname
        return `fineprint-analysis-${domain}-${timestamp}.${extension}`
      case 'bulk-analysis':
        return `fineprint-bulk-analysis-${timestamp}.${extension}`
      case 'compliance-report':
        return `fineprint-compliance-${timestamp}.${extension}`
      default:
        return `fineprint-export-${timestamp}.${extension}`
    }
  }

  // Default template generators
  private getDefaultTemplate(format: string): ExportTemplate {
    return {
      id: 'default-analysis',
      name: 'Default Analysis Template',
      type: 'analysis',
      format: format as any,
      sections: [
        {
          id: 'header',
          title: 'Document Analysis Report',
          type: 'header',
          content: null
        },
        {
          id: 'summary',
          title: 'Analysis Summary',
          type: 'summary',
          content: null
        },
        {
          id: 'findings',
          title: 'Findings',
          type: 'findings',
          content: null
        },
        {
          id: 'recommendations',
          title: 'Recommendations',
          type: 'recommendations',
          content: null
        }
      ],
      styling: this.getDefaultStyling(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDefault: true
    }
  }

  private getDefaultBulkTemplate(format: string): ExportTemplate {
    return {
      id: 'default-bulk',
      name: 'Default Bulk Analysis Template',
      type: 'bulk-analysis',
      format: format as any,
      sections: [
        {
          id: 'header',
          title: 'Bulk Analysis Report',
          type: 'header',
          content: null
        },
        {
          id: 'summary',
          title: 'Analysis Summary',
          type: 'summary',
          content: null
        }
      ],
      styling: this.getDefaultStyling(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDefault: true
    }
  }

  private getDefaultComplianceTemplate(format: string): ExportTemplate {
    return {
      id: 'default-compliance',
      name: 'Default Compliance Template',
      type: 'compliance',
      format: format as any,
      sections: [
        {
          id: 'header',
          title: 'Compliance Report',
          type: 'header',
          content: null
        }
      ],
      styling: this.getDefaultStyling(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDefault: true
    }
  }

  private getDefaultHistoryTemplate(format: string): ExportTemplate {
    return {
      id: 'default-history',
      name: 'Default History Template',
      type: 'history',
      format: format as any,
      sections: [
        {
          id: 'header',
          title: 'Analysis History Report',
          type: 'header',
          content: null
        }
      ],
      styling: this.getDefaultStyling(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDefault: true
    }
  }

  private getDefaultStyling(): ExportStyling {
    return {
      fontFamily: 'Arial, sans-serif',
      fontSize: 12,
      headerColor: '#2c5aa0',
      textColor: '#333333',
      backgroundColor: '#ffffff',
      accentColor: '#007bff',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      includePageNumbers: true,
      includeTOC: false,
      pageFooter: 'Generated by Fine Print AI Extension'
    }
  }

  // CSV generation methods
  private generateAnalysisCSV(analysis: PageAnalysisState): string {
    const findings = analysis.findings || []
    
    const headers = ['Finding Title', 'Category', 'Severity', 'Description', 'Recommendation']
    const rows = findings.map(finding => [
      finding.title,
      finding.category,
      finding.severity,
      finding.description,
      finding.recommendation
    ])

    return [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
  }

  private generateBulkAnalysisCSV(bulkJob: BulkAnalysisJob): string {
    const headers = ['URL', 'Title', 'Risk Score', 'Findings Count', 'Status']
    const rows = bulkJob.results.map(result => [
      result.document.url,
      result.document.title,
      result.analysis.riskScore || 'N/A',
      result.analysis.findings?.length || 0,
      result.status
    ])

    return [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
  }

  private generateComplianceCSV(report: any): string {
    const headers = ['Metric', 'Value']
    const rows = [
      ['Documents Analyzed', report.summary.totalDocumentsAnalyzed],
      ['High Risk Documents', report.summary.highRiskDocuments],
      ['Policy Violations', report.summary.policyViolations],
      ['Compliance Score', `${report.summary.complianceScore}%`]
    ]

    return [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
  }

  private generateGenericCSV(data: any): string {
    if (Array.isArray(data)) {
      if (data.length === 0) return ''
      
      const headers = Object.keys(data[0])
      const rows = data.map(item => headers.map(header => item[header]))
      
      return [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n')
    }

    return Object.entries(data)
      .map(([key, value]) => `"${key}","${String(value).replace(/"/g, '""')}"`)
      .join('\n')
  }

  // Simplified PDF and DOCX generation (would use proper libraries in production)
  private convertHTMLToPDFContent(html: string, job: ExportJob): string {
    return `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${html.length} >>
stream
${html.replace(/<[^>]*>/g, '')}
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000053 00000 n 
0000000125 00000 n 
0000000185 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
${200 + html.length}
%%EOF`
  }

  private async generateWordContent(job: ExportJob): string {
    // This would use a proper DOCX library in production
    const content = JSON.stringify(job.data, null, 2)
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${content}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`
  }

  // Storage methods
  private async loadTemplates(): Promise<void> {
    try {
      const allData = await this.storage.getAll()
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('export-template-')) {
          this.templates.set((value as ExportTemplate).id, value as ExportTemplate)
        }
      }
    } catch (error) {
      console.error('Failed to load export templates:', error)
    }
  }

  private async loadExportJobs(): Promise<void> {
    try {
      const allData = await this.storage.getAll()
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('export-job-')) {
          this.exportJobs.set((value as ExportJob).id, value as ExportJob)
        }
      }
    } catch (error) {
      console.error('Failed to load export jobs:', error)
    }
  }

  private async saveTemplate(template: ExportTemplate): Promise<void> {
    await this.storage.set(`export-template-${template.id}`, template)
  }

  private async saveExportJob(job: ExportJob): Promise<void> {
    await this.storage.set(`export-job-${job.id}`, job)
  }

  private async storeExportResult(jobId: string, blob: Blob, filename: string): Promise<void> {
    const arrayBuffer = await blob.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    
    await this.storage.set(`export-result-${jobId}`, {
      content: base64,
      mimeType: blob.type,
      filename,
      size: blob.size
    })
  }

  private async getAnalysisData(analysisId: string): Promise<PageAnalysisState | null> {
    // This would retrieve analysis data from appropriate storage
    // For now, returning null as placeholder
    return null
  }

  private async getTemplate(templateId: string): Promise<ExportTemplate | null> {
    return this.templates.get(templateId) || null
  }
}

// Export singleton instance
export const exportManager = new ExportManager()