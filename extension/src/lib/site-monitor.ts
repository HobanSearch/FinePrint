import { Storage } from "@plasmohq/storage"
import { sendToContentScript } from "@plasmohq/messaging"

import { getApiClient } from "./api-client"
import { ExtensionStorage } from "./storage"
import { PageDetector } from "./page-detector"
import { historyManager } from "./history-manager"
import type { 
  MonitoredSite, 
  SiteChange, 
  MonitoringSchedule,
  PageAnalysisState,
  ExtensionSettings
} from "@/types"

export class SiteMonitor {
  private storage = new Storage()
  private schedulerActive = false
  private checkInterval = 60000 // 1 minute base interval
  private maxRetries = 3

  constructor() {
    this.initializeScheduler()
  }

  /**
   * Add a site to monitoring
   */
  async addSite(
    url: string, 
    options: {
      title?: string;
      checkInterval?: number; // minutes
      notifications?: boolean;
      riskThreshold?: number;
    } = {}
  ): Promise<MonitoredSite> {
    // Validate URL
    try {
      new URL(url)
    } catch {
      throw new Error('Invalid URL provided')
    }

    // Check if site is a legal document
    const detection = PageDetector.detect(url, options.title || '', '')
    if (detection.confidence < 0.3) {
      throw new Error('URL does not appear to be a legal document')
    }

    // Check if already monitored
    const existing = await this.getSite(url)
    if (existing) {
      throw new Error('Site is already being monitored')
    }

    // Fetch initial content
    const content = await this.fetchSiteContent(url)
    const contentHash = this.generateContentHash(content)

    // Perform initial analysis
    let initialAnalysis: PageAnalysisState | undefined
    try {
      const apiClient = getApiClient()
      const analysisResult = await apiClient.quickAnalyze(url, content)
      
      initialAnalysis = {
        url,
        isAnalyzing: false,
        isTermsPage: detection.isTermsPage,
        isPrivacyPage: detection.isPrivacyPage,
        documentType: detection.documentType as any,
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
      }

      // Add to history
      await historyManager.addEntry(initialAnalysis)
    } catch (error) {
      console.warn('Initial analysis failed for monitored site:', error)
    }

    const site: MonitoredSite = {
      id: `monitor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url,
      title: options.title || this.extractTitleFromUrl(url),
      documentType: detection.documentType || 'unknown',
      isActive: true,
      checkInterval: options.checkInterval || 1440, // Default: daily
      lastChecked: Date.now(),
      lastModified: Date.now(),
      contentHash,
      notifications: options.notifications !== false,
      riskThreshold: options.riskThreshold || 50,
      createdAt: Date.now(),
      lastAnalysis: initialAnalysis
    }

    await this.saveSite(site)
    await this.scheduleNextCheck(site)

    // Notify about new monitored site
    await this.notifyNewSite(site)

    return site
  }

  /**
   * Remove site from monitoring
   */
  async removeSite(siteId: string): Promise<boolean> {
    try {
      const site = await this.getSiteById(siteId)
      if (!site) return false

      await this.storage.remove(`monitored-site-${siteId}`)
      await this.removeFromSchedule(siteId)

      return true
    } catch {
      return false
    }
  }

  /**
   * Get monitored site by URL
   */
  async getSite(url: string): Promise<MonitoredSite | null> {
    const sites = await this.getAllSites()
    return sites.find(site => site.url === url) || null
  }

  /**
   * Get monitored site by ID
   */
  async getSiteById(siteId: string): Promise<MonitoredSite | null> {
    try {
      const site = await this.storage.get(`monitored-site-${siteId}`)
      return site
    } catch {
      return null
    }
  }

  /**
   * Get all monitored sites
   */
  async getAllSites(): Promise<MonitoredSite[]> {
    try {
      const allData = await this.storage.getAll()
      const sites: MonitoredSite[] = []

      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('monitored-site-')) {
          sites.push(value as MonitoredSite)
        }
      }

      return sites.sort((a, b) => b.createdAt - a.createdAt)
    } catch {
      return []
    }
  }

  /**
   * Update site settings
   */
  async updateSite(
    siteId: string, 
    updates: Partial<Pick<MonitoredSite, 'title' | 'checkInterval' | 'notifications' | 'riskThreshold' | 'isActive'>>
  ): Promise<MonitoredSite | null> {
    const site = await this.getSiteById(siteId)
    if (!site) return null

    const updatedSite: MonitoredSite = {
      ...site,
      ...updates
    }

    await this.saveSite(updatedSite)

    // Reschedule if interval changed
    if (updates.checkInterval) {
      await this.scheduleNextCheck(updatedSite)
    }

    return updatedSite
  }

  /**
   * Force check a specific site
   */
  async checkSite(siteId: string): Promise<SiteChange | null> {
    const site = await this.getSiteById(siteId)
    if (!site || !site.isActive) return null

    try {
      const content = await this.fetchSiteContent(site.url)
      const newHash = this.generateContentHash(content)

      // Update last checked time
      site.lastChecked = Date.now()
      await this.saveSite(site)

      // Check if content changed
      if (newHash === site.contentHash) {
        return null // No changes
      }

      // Content changed - analyze differences
      const change = await this.detectChanges(site, content, newHash)
      
      // Update site with new hash and last modified time
      site.contentHash = newHash
      site.lastModified = Date.now()

      // Perform new analysis if needed
      if (change.requiresReanalysis) {
        try {
          const apiClient = getApiClient()
          const analysisResult = await apiClient.quickAnalyze(site.url, content)
          
          const newAnalysis: PageAnalysisState = {
            url: site.url,
            isAnalyzing: false,
            isTermsPage: site.lastAnalysis?.isTermsPage || false,
            isPrivacyPage: site.lastAnalysis?.isPrivacyPage || false,
            documentType: site.documentType as any,
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
          }

          site.lastAnalysis = newAnalysis

          // Add to history
          await historyManager.addEntry(newAnalysis)

          // Check if risk threshold exceeded
          if (site.notifications && newAnalysis.riskScore && newAnalysis.riskScore >= site.riskThreshold) {
            await this.notifyRiskThresholdExceeded(site, newAnalysis)
          }

        } catch (error) {
          console.error('Re-analysis failed for site:', site.url, error)
        }
      }

      await this.saveSite(site)
      await this.saveChange(change)

      // Notify about change
      if (site.notifications) {
        await this.notifyChange(site, change)
      }

      return change

    } catch (error) {
      console.error('Failed to check site:', site.url, error)
      return null
    }
  }

  /**
   * Get changes for a site
   */
  async getSiteChanges(siteId: string, limit: number = 50): Promise<SiteChange[]> {
    try {
      const allData = await this.storage.getAll()
      const changes: SiteChange[] = []

      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('site-change-') && (value as SiteChange).siteId === siteId) {
          changes.push(value as SiteChange)
        }
      }

      return changes
        .sort((a, b) => b.detectedAt - a.detectedAt)
        .slice(0, limit)
    } catch {
      return []
    }
  }

  /**
   * Get all recent changes
   */
  async getRecentChanges(limit: number = 100): Promise<SiteChange[]> {
    try {
      const allData = await this.storage.getAll()
      const changes: SiteChange[] = []

      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('site-change-')) {
          changes.push(value as SiteChange)
        }
      }

      return changes
        .sort((a, b) => b.detectedAt - a.detectedAt)
        .slice(0, limit)
    } catch {
      return []
    }
  }

  /**
   * Initialize monitoring scheduler
   */
  private async initializeScheduler() {
    if (this.schedulerActive) return

    this.schedulerActive = true
    this.runScheduler()
  }

  /**
   * Run the monitoring scheduler
   */
  private async runScheduler() {
    while (this.schedulerActive) {
      try {
        await this.processScheduledChecks()
      } catch (error) {
        console.error('Scheduler error:', error)
      }

      // Wait before next cycle
      await new Promise(resolve => setTimeout(resolve, this.checkInterval))
    }
  }

  /**
   * Process scheduled site checks
   */
  private async processScheduledChecks() {
    const sites = await this.getAllSites()
    const now = Date.now()

    for (const site of sites) {
      if (!site.isActive) continue

      const nextCheck = site.lastChecked + (site.checkInterval * 60 * 1000)
      if (now >= nextCheck) {
        // Time to check this site
        try {
          await this.checkSite(site.id)
        } catch (error) {
          console.error(`Failed to check site ${site.url}:`, error)
        }
      }
    }
  }

  /**
   * Fetch site content
   */
  private async fetchSiteContent(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FinePrintAI-Monitor/1.0)'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const html = await response.text()
      
      // Extract text content
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      return doc.body?.textContent || ''

    } catch (error) {
      throw new Error(`Failed to fetch content: ${error}`)
    }
  }

  /**
   * Detect changes between old and new content
   */
  private async detectChanges(
    site: MonitoredSite, 
    newContent: string, 
    newHash: string
  ): Promise<SiteChange> {
    // Simple change detection - in production, you'd want more sophisticated diff analysis
    const changeType = this.determineChangeType(site, newContent)
    
    const change: SiteChange = {
      siteId: site.id,
      url: site.url,
      changeType,
      detectedAt: Date.now(),
      oldHash: site.contentHash,
      newHash,
      summary: this.generateChangeSummary(changeType, site.title),
      requiresReanalysis: this.shouldReanalyze(changeType)
    }

    return change
  }

  /**
   * Determine the type of change that occurred
   */
  private determineChangeType(site: MonitoredSite, newContent: string): SiteChange['changeType'] {
    // This is a simplified implementation
    // In practice, you'd analyze the specific changes more carefully
    
    const significantChange = Math.abs(newContent.length - (site.lastAnalysis?.findings?.length || 0) * 100) > 1000
    
    if (significantChange) {
      return 'structure'
    }
    
    return 'content'
  }

  /**
   * Generate change summary
   */
  private generateChangeSummary(changeType: SiteChange['changeType'], siteTitle: string): string {
    switch (changeType) {
      case 'content':
        return `Content changes detected in ${siteTitle}`
      case 'structure':
        return `Structural changes detected in ${siteTitle}`
      case 'new-findings':
        return `New legal issues detected in ${siteTitle}`
      case 'removed-findings':
        return `Some legal issues resolved in ${siteTitle}`
      default:
        return `Changes detected in ${siteTitle}`
    }
  }

  /**
   * Determine if changes require re-analysis
   */
  private shouldReanalyze(changeType: SiteChange['changeType']): boolean {
    return ['content', 'structure'].includes(changeType)
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

  /**
   * Extract title from URL
   */
  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch {
      return url
    }
  }

  /**
   * Save site to storage
   */
  private async saveSite(site: MonitoredSite): Promise<void> {
    await this.storage.set(`monitored-site-${site.id}`, site)
  }

  /**
   * Save change to storage
   */
  private async saveChange(change: SiteChange): Promise<void> {
    const changeId = `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    await this.storage.set(`site-change-${changeId}`, change)
  }

  /**
   * Schedule next check for a site
   */
  private async scheduleNextCheck(site: MonitoredSite): Promise<void> {
    const schedule: MonitoringSchedule = {
      siteId: site.id,
      nextCheck: Date.now() + (site.checkInterval * 60 * 1000),
      intervalMinutes: site.checkInterval,
      retryCount: 0
    }

    await this.storage.set(`schedule-${site.id}`, schedule)
  }

  /**
   * Remove site from schedule
   */
  private async removeFromSchedule(siteId: string): Promise<void> {
    await this.storage.remove(`schedule-${siteId}`)
  }

  /**
   * Notify about new monitored site
   */
  private async notifyNewSite(site: MonitoredSite): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        name: 'SITE_MONITORING_STARTED',
        body: {
          siteId: site.id,
          url: site.url,
          title: site.title
        }
      })
    } catch {
      // Ignore messaging errors
    }
  }

  /**
   * Notify about site change
   */
  private async notifyChange(site: MonitoredSite, change: SiteChange): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        name: 'SITE_CHANGE_DETECTED',
        body: {
          siteId: site.id,
          change
        }
      })

      // Show notification
      await chrome.notifications.create(`site-change-${site.id}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icon.png'),
        title: 'Site Change Detected',
        message: change.summary
      })
    } catch {
      // Ignore messaging errors
    }
  }

  /**
   * Notify when risk threshold is exceeded
   */
  private async notifyRiskThresholdExceeded(
    site: MonitoredSite, 
    analysis: PageAnalysisState
  ): Promise<void> {
    try {
      await chrome.notifications.create(`risk-threshold-${site.id}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icon.png'),
        title: 'High Risk Detected',
        message: `${site.title} now has a risk score of ${analysis.riskScore}/100`,
        priority: 2
      })
    } catch {
      // Ignore messaging errors
    }
  }

  /**
   * Stop monitoring scheduler
   */
  stopScheduler(): void {
    this.schedulerActive = false
  }
}

// Export singleton instance
export const siteMonitor = new SiteMonitor()