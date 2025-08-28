import { Storage } from "@plasmohq/storage"
import { sendToContentScript } from "@plasmohq/messaging"

import { getApiClient } from "./api-client"
import { ExtensionStorage } from "./storage"
import { PageDetector } from "./page-detector"
import type { 
  PageAnalysisState, 
  ExtensionSettings,
  BulkAnalysisJob,
  BulkAnalysisProgress,
  BulkAnalysisResult,
  QueueItem,
  SessionDocument
} from "@/types"

export class BulkAnalysisManager {
  private storage = new Storage()
  private queue: QueueItem[] = []
  private processing = false
  private maxConcurrent = 3
  private activeJobs = new Map<string, BulkAnalysisJob>()

  constructor() {
    this.loadQueue()
  }

  /**
   * Analyze multiple documents from the current browsing session
   */
  async analyzeBrowsingSession(): Promise<BulkAnalysisJob> {
    const sessionDocs = await this.getCurrentSessionDocuments()
    
    if (sessionDocs.length === 0) {
      throw new Error('No legal documents found in current browsing session')
    }

    const jobId = `session-${Date.now()}`
    const job: BulkAnalysisJob = {
      id: jobId,
      type: 'session',
      status: 'queued',
      documents: sessionDocs,
      results: [],
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      progress: {
        total: sessionDocs.length,
        completed: 0,
        failed: 0,
        currentDocument: null,
        estimatedTimeRemaining: null
      },
      settings: await ExtensionStorage.getSettings()
    }

    this.activeJobs.set(jobId, job)
    await this.saveJob(job)
    
    // Add to queue
    this.queue.push({
      id: jobId,
      priority: 'normal',
      timestamp: Date.now()
    })
    
    await this.saveQueue()
    this.processQueue()
    
    return job
  }

  /**
   * Analyze documents from a provided list of URLs
   */
  async analyzeDocumentList(urls: string[], jobName?: string): Promise<BulkAnalysisJob> {
    const documents: SessionDocument[] = []
    
    for (const url of urls) {
      try {
        const tab = await this.findTabWithUrl(url)
        if (tab) {
          documents.push({
            url,
            title: tab.title || '',
            tabId: tab.id,
            detected: await this.detectDocumentFromTab(tab)
          })
        } else {
          // Try to fetch document info without active tab
          const detection = PageDetector.detect(url, '', '')
          if (detection.confidence > 0.3) {
            documents.push({
              url,
              title: url,
              tabId: undefined,
              detected: detection
            })
          }
        }
      } catch (error) {
        console.warn(`Failed to process URL ${url}:`, error)
      }
    }

    if (documents.length === 0) {
      throw new Error('No valid legal documents found in provided URLs')
    }

    const jobId = `list-${Date.now()}`
    const job: BulkAnalysisJob = {
      id: jobId,
      type: 'url-list',
      name: jobName,
      status: 'queued',
      documents,
      results: [],
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      progress: {
        total: documents.length,
        completed: 0,
        failed: 0,
        currentDocument: null,
        estimatedTimeRemaining: null
      },
      settings: await ExtensionStorage.getSettings()
    }

    this.activeJobs.set(jobId, job)
    await this.saveJob(job)
    
    this.queue.push({
      id: jobId,
      priority: 'normal',
      timestamp: Date.now()
    })
    
    await this.saveQueue()
    this.processQueue()
    
    return job
  }

  /**
   * Get current session documents that might be legal documents
   */
  private async getCurrentSessionDocuments(): Promise<SessionDocument[]> {
    const tabs = await chrome.tabs.query({ 
      windowId: chrome.windows.WINDOW_ID_CURRENT 
    })
    
    const documents: SessionDocument[] = []
    
    for (const tab of tabs) {
      if (!tab.url || !tab.id) continue
      
      try {
        const detected = await this.detectDocumentFromTab(tab)
        if (detected.confidence > 0.3) {
          documents.push({
            url: tab.url,
            title: tab.title || '',
            tabId: tab.id,
            detected
          })
        }
      } catch (error) {
        console.warn(`Failed to detect document type for tab ${tab.id}:`, error)
      }
    }
    
    return documents
  }

  /**
   * Detect if a tab contains a legal document
   */
  private async detectDocumentFromTab(tab: chrome.tabs.Tab) {
    if (!tab.url || !tab.id) {
      throw new Error('Invalid tab')
    }

    try {
      // Try to get content from content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        name: 'GET_PAGE_CONTENT'
      })
      
      return PageDetector.detect(tab.url, tab.title || '', response?.content || '')
    } catch {
      // Fallback to URL/title detection only
      return PageDetector.detect(tab.url, tab.title || '', '')
    }
  }

  /**
   * Process the analysis queue
   */
  private async processQueue() {
    if (this.processing || this.queue.length === 0) return
    
    this.processing = true
    
    try {
      // Sort queue by priority and timestamp
      this.queue.sort((a, b) => {
        const priorityOrder = { high: 3, normal: 2, low: 1 }
        const aPriority = priorityOrder[a.priority]
        const bPriority = priorityOrder[b.priority]
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority
        }
        
        return a.timestamp - b.timestamp
      })

      const concurrentJobs = Math.min(this.maxConcurrent, this.queue.length)
      const activePromises: Promise<void>[] = []

      for (let i = 0; i < concurrentJobs; i++) {
        const queueItem = this.queue.shift()
        if (queueItem) {
          activePromises.push(this.processJob(queueItem.id))
        }
      }

      await Promise.all(activePromises)
      
      // Continue processing if there are more items
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 1000)
      }
    } finally {
      this.processing = false
    }
  }

  /**
   * Process a single bulk analysis job
   */
  private async processJob(jobId: string) {
    const job = this.activeJobs.get(jobId)
    if (!job) return

    try {
      job.status = 'processing'
      job.startedAt = Date.now()
      await this.saveJob(job)
      await this.notifyProgressUpdate(job)

      const apiClient = getApiClient()
      const startTime = Date.now()

      for (let i = 0; i < job.documents.length; i++) {
        const doc = job.documents[i]
        job.progress.currentDocument = doc

        try {
          // Update progress
          job.progress.completed = i
          job.progress.estimatedTimeRemaining = this.calculateEstimatedTime(
            startTime, i, job.documents.length
          )
          await this.notifyProgressUpdate(job)

          // Get document content
          let content = ''
          if (doc.tabId) {
            try {
              const response = await chrome.tabs.sendMessage(doc.tabId, {
                name: 'GET_PAGE_CONTENT'
              })
              content = response?.content || ''
            } catch {
              // Tab might be closed, try to fetch directly
              content = await this.fetchDocumentContent(doc.url)
            }
          } else {
            content = await this.fetchDocumentContent(doc.url)
          }

          // Perform analysis
          const analysisResult = await apiClient.quickAnalyze(doc.url, content)
          
          const result: BulkAnalysisResult = {
            document: doc,
            analysis: {
              url: doc.url,
              isAnalyzing: false,
              isTermsPage: doc.detected.isTermsPage,
              isPrivacyPage: doc.detected.isPrivacyPage,
              documentType: doc.detected.documentType as any,
              analysisId: analysisResult.id,
              riskScore: analysisResult.overallRiskScore,
              findings: analysisResult.findings.map(finding => ({
                id: finding.id,
                category: finding.category,
                title: finding.title,
                description: finding.description,
                severity: finding.severity,
                confidenceScore: finding.confidenceScore || 0,
                textExcerpt: finding.textExcerpt || '',
                positionStart: finding.positionStart || 0,
                positionEnd: finding.positionEnd || 0,
                recommendation: finding.recommendation || '',
                impactExplanation: finding.impactExplanation || '',
                highlighted: false
              })),
              lastAnalyzed: Date.now()
            },
            status: 'completed',
            completedAt: Date.now()
          }

          job.results.push(result)

          // Cache individual result
          await ExtensionStorage.setCacheEntry(
            doc.url, 
            result.analysis, 
            this.generateContentHash(content)
          )

        } catch (error) {
          console.error(`Failed to analyze document ${doc.url}:`, error)
          
          job.results.push({
            document: doc,
            analysis: {
              url: doc.url,
              isAnalyzing: false,
              isTermsPage: doc.detected.isTermsPage,
              isPrivacyPage: doc.detected.isPrivacyPage,
              findings: [],
              error: error instanceof Error ? error.message : 'Analysis failed'
            },
            status: 'failed',
            error: error instanceof Error ? error.message : 'Analysis failed',
            completedAt: Date.now()
          })
          
          job.progress.failed++
        }

        await this.saveJob(job)
      }

      // Job completed
      job.status = 'completed'
      job.completedAt = Date.now()
      job.progress.completed = job.documents.length
      job.progress.currentDocument = null
      job.progress.estimatedTimeRemaining = 0

      await this.saveJob(job)
      await this.notifyJobComplete(job)

    } catch (error) {
      console.error(`Bulk analysis job ${jobId} failed:`, error)
      
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : 'Job failed'
      job.completedAt = Date.now()
      
      await this.saveJob(job)
      await this.notifyJobFailed(job)
    }
  }

  /**
   * Fetch document content directly
   */
  private async fetchDocumentContent(url: string): Promise<string> {
    try {
      const response = await fetch(url)
      const html = await response.text()
      
      // Basic text extraction (in a real implementation, you'd want more sophisticated parsing)
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      return doc.body?.textContent || ''
    } catch (error) {
      console.warn(`Failed to fetch content for ${url}:`, error)
      return ''
    }
  }

  /**
   * Calculate estimated time remaining
   */
  private calculateEstimatedTime(startTime: number, completed: number, total: number): number | null {
    if (completed === 0) return null
    
    const elapsed = Date.now() - startTime
    const averageTime = elapsed / completed
    const remaining = total - completed
    
    return Math.round(remaining * averageTime)
  }

  /**
   * Find tab with specific URL
   */
  private async findTabWithUrl(url: string): Promise<chrome.tabs.Tab | null> {
    try {
      const tabs = await chrome.tabs.query({ url })
      return tabs.length > 0 ? tabs[0] : null
    } catch {
      return null
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<BulkAnalysisJob | null> {
    const job = this.activeJobs.get(jobId)
    if (job) return job

    try {
      const stored = await this.storage.get(`bulk-job-${jobId}`)
      return stored
    } catch {
      return null
    }
  }

  /**
   * Get all jobs
   */
  async getAllJobs(): Promise<BulkAnalysisJob[]> {
    const jobs: BulkAnalysisJob[] = []
    
    // Add active jobs
    for (const job of this.activeJobs.values()) {
      jobs.push(job)
    }
    
    // Add stored jobs
    try {
      const keys = await this.storage.getAll()
      for (const [key, value] of Object.entries(keys)) {
        if (key.startsWith('bulk-job-') && !this.activeJobs.has(value.id)) {
          jobs.push(value as BulkAnalysisJob)
        }
      }
    } catch (error) {
      console.error('Failed to load stored jobs:', error)
    }
    
    return jobs.sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.activeJobs.get(jobId)
    if (!job) return false
    
    if (job.status === 'processing') {
      job.status = 'cancelled'
      job.completedAt = Date.now()
      await this.saveJob(job)
      return true
    }
    
    return false
  }

  /**
   * Delete a job
   */
  async deleteJob(jobId: string): Promise<boolean> {
    try {
      this.activeJobs.delete(jobId)
      await this.storage.remove(`bulk-job-${jobId}`)
      
      // Remove from queue if present
      this.queue = this.queue.filter(item => item.id !== jobId)
      await this.saveQueue()
      
      return true
    } catch {
      return false
    }
  }

  /**
   * Export results as various formats
   */
  async exportResults(jobId: string, format: 'json' | 'csv' | 'pdf'): Promise<Blob> {
    const job = await this.getJob(jobId)
    if (!job) {
      throw new Error('Job not found')
    }

    switch (format) {
      case 'json':
        return new Blob([JSON.stringify(job, null, 2)], { 
          type: 'application/json' 
        })
      
      case 'csv':
        return this.exportAsCSV(job)
      
      case 'pdf':
        return this.exportAsPDF(job)
      
      default:
        throw new Error(`Unsupported format: ${format}`)
    }
  }

  /**
   * Export as CSV
   */
  private exportAsCSV(job: BulkAnalysisJob): Blob {
    const headers = [
      'URL', 'Title', 'Document Type', 'Risk Score', 
      'Findings Count', 'High Risk Findings', 'Analysis Date', 'Status'
    ]
    
    const rows = job.results.map(result => [
      result.document.url,
      result.document.title,
      result.document.detected.documentType || 'Unknown',
      result.analysis.riskScore || 'N/A',
      result.analysis.findings?.length || 0,
      result.analysis.findings?.filter(f => f.severity === 'high' || f.severity === 'critical').length || 0,
      result.completedAt ? new Date(result.completedAt).toISOString() : 'N/A',
      result.status
    ])
    
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    
    return new Blob([csv], { type: 'text/csv' })
  }

  /**
   * Export as PDF (simplified - in production you'd use a proper PDF library)
   */
  private exportAsPDF(job: BulkAnalysisJob): Blob {
    // This is a placeholder - you'd implement actual PDF generation
    const content = `Fine Print AI Bulk Analysis Report\n\nJob: ${job.name || job.id}\nCreated: ${new Date(job.createdAt).toISOString()}\nStatus: ${job.status}\n\nResults:\n${job.results.map(r => `${r.document.title}: ${r.status}`).join('\n')}`
    
    return new Blob([content], { type: 'application/pdf' })
  }

  /**
   * Save job to storage
   */
  private async saveJob(job: BulkAnalysisJob) {
    await this.storage.set(`bulk-job-${job.id}`, job)
  }

  /**
   * Save queue to storage
   */
  private async saveQueue() {
    await this.storage.set('bulk-analysis-queue', this.queue)
  }

  /**
   * Load queue from storage
   */
  private async loadQueue() {
    try {
      const stored = await this.storage.get('bulk-analysis-queue')
      this.queue = stored || []
    } catch {
      this.queue = []
    }
  }

  /**
   * Notify progress update
   */
  private async notifyProgressUpdate(job: BulkAnalysisJob) {
    try {
      await chrome.runtime.sendMessage({
        name: 'BULK_ANALYSIS_PROGRESS',
        body: {
          jobId: job.id,
          progress: job.progress,
          status: job.status
        }
      })
    } catch {
      // Ignore messaging errors
    }
  }

  /**
   * Notify job completion
   */
  private async notifyJobComplete(job: BulkAnalysisJob) {
    try {
      await chrome.runtime.sendMessage({
        name: 'BULK_ANALYSIS_COMPLETE',
        body: {
          jobId: job.id,
          results: job.results,
          summary: this.generateJobSummary(job)
        }
      })

      // Show notification
      await chrome.notifications.create(`bulk-complete-${job.id}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icon.png'),
        title: 'Bulk Analysis Complete',
        message: `Analyzed ${job.documents.length} documents. ${job.results.filter(r => r.status === 'completed').length} successful, ${job.progress.failed} failed.`
      })
    } catch {
      // Ignore messaging errors
    }
  }

  /**
   * Notify job failure
   */
  private async notifyJobFailed(job: BulkAnalysisJob) {
    try {
      await chrome.runtime.sendMessage({
        name: 'BULK_ANALYSIS_FAILED',
        body: {
          jobId: job.id,
          error: job.error
        }
      })

      // Show notification
      await chrome.notifications.create(`bulk-failed-${job.id}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icon.png'),
        title: 'Bulk Analysis Failed',
        message: job.error || 'Unknown error occurred'
      })
    } catch {
      // Ignore messaging errors
    }
  }

  /**
   * Generate job summary
   */
  private generateJobSummary(job: BulkAnalysisJob) {
    const successful = job.results.filter(r => r.status === 'completed')
    const failed = job.results.filter(r => r.status === 'failed')
    
    const totalFindings = successful.reduce((sum, r) => sum + (r.analysis.findings?.length || 0), 0)
    const highRiskDocs = successful.filter(r => (r.analysis.riskScore || 0) >= 70).length
    
    const avgRiskScore = successful.length > 0 
      ? successful.reduce((sum, r) => sum + (r.analysis.riskScore || 0), 0) / successful.length
      : 0

    return {
      totalDocuments: job.documents.length,
      successful: successful.length,
      failed: failed.length,
      totalFindings,
      highRiskDocuments: highRiskDocs,
      averageRiskScore: Math.round(avgRiskScore),
      duration: job.completedAt && job.startedAt 
        ? job.completedAt - job.startedAt 
        : null
    }
  }

  /**
   * Generate content hash
   */
  private generateContentHash(content: string): string {
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return hash.toString()
  }
}

// Export singleton instance
export const bulkAnalysisManager = new BulkAnalysisManager()