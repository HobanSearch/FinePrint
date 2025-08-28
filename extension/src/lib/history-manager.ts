import { Storage } from "@plasmohq/storage"

import type { 
  HistoryEntry, 
  AnalysisHistory, 
  PageAnalysisState,
  ExportOptions,
  AnalyticsData
} from "@/types"

export class HistoryManager {
  private storage = new Storage()
  private maxEntries = 1000 // Maximum number of history entries to keep

  /**
   * Add analysis result to history
   */
  async addEntry(analysis: PageAnalysisState, jobId?: string): Promise<void> {
    const entry: HistoryEntry = {
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url: analysis.url,
      title: this.extractTitleFromUrl(analysis.url),
      documentType: analysis.documentType || 'unknown',
      analysisDate: analysis.lastAnalyzed || Date.now(),
      riskScore: analysis.riskScore || 0,
      findingsCount: analysis.findings?.length || 0,
      highRiskFindings: analysis.findings?.filter(f => 
        f.severity === 'high' || f.severity === 'critical'
      ).length || 0,
      jobId,
      tags: this.generateTags(analysis)
    }

    const history = await this.getHistory()
    history.entries.unshift(entry) // Add to beginning

    // Trim to max entries
    if (history.entries.length > this.maxEntries) {
      history.entries = history.entries.slice(0, this.maxEntries)
    }

    // Update metadata
    history.totalEntries = history.entries.length
    history.newestEntry = entry.analysisDate
    history.oldestEntry = history.entries.length > 0 
      ? history.entries[history.entries.length - 1].analysisDate 
      : entry.analysisDate

    await this.saveHistory(history)
  }

  /**
   * Get complete analysis history
   */
  async getHistory(): Promise<AnalysisHistory> {
    try {
      const stored = await this.storage.get('analysis-history')
      return stored || {
        entries: [],
        totalEntries: 0,
        oldestEntry: Date.now(),
        newestEntry: Date.now()
      }
    } catch {
      return {
        entries: [],
        totalEntries: 0,
        oldestEntry: Date.now(),
        newestEntry: Date.now()
      }
    }
  }

  /**
   * Get paginated history entries
   */
  async getHistoryPage(
    page: number = 1, 
    pageSize: number = 20,
    filters?: {
      dateRange?: { start: number; end: number };
      documentTypes?: string[];
      riskLevels?: string[];
      searchQuery?: string;
    }
  ): Promise<{
    entries: HistoryEntry[];
    totalPages: number;
    totalEntries: number;
    currentPage: number;
  }> {
    const history = await this.getHistory()
    let filteredEntries = history.entries

    // Apply filters
    if (filters) {
      filteredEntries = this.applyFilters(filteredEntries, filters)
    }

    const totalEntries = filteredEntries.length
    const totalPages = Math.ceil(totalEntries / pageSize)
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize

    return {
      entries: filteredEntries.slice(startIndex, endIndex),
      totalPages,
      totalEntries,
      currentPage: page
    }
  }

  /**
   * Apply filters to history entries
   */
  private applyFilters(
    entries: HistoryEntry[], 
    filters: {
      dateRange?: { start: number; end: number };
      documentTypes?: string[];
      riskLevels?: string[];
      searchQuery?: string;
    }
  ): HistoryEntry[] {
    return entries.filter(entry => {
      // Date range filter
      if (filters.dateRange) {
        const { start, end } = filters.dateRange
        if (entry.analysisDate < start || entry.analysisDate > end) {
          return false
        }
      }

      // Document type filter
      if (filters.documentTypes && filters.documentTypes.length > 0) {
        if (!filters.documentTypes.includes(entry.documentType)) {
          return false
        }
      }

      // Risk level filter
      if (filters.riskLevels && filters.riskLevels.length > 0) {
        const riskLevel = this.getRiskLevel(entry.riskScore)
        if (!filters.riskLevels.includes(riskLevel)) {
          return false
        }
      }

      // Search query filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase()
        const searchableText = `${entry.url} ${entry.title}`.toLowerCase()
        if (!searchableText.includes(query)) {
          return false
        }
      }

      return true
    })
  }

  /**
   * Get analytics data from history
   */
  async getAnalytics(dateRange?: { start: number; end: number }): Promise<AnalyticsData> {
    const history = await this.getHistory()
    let entries = history.entries

    // Filter by date range if provided
    if (dateRange) {
      entries = entries.filter(entry => 
        entry.analysisDate >= dateRange.start && 
        entry.analysisDate <= dateRange.end
      )
    }

    if (entries.length === 0) {
      return {
        documentsAnalyzed: 0,
        averageRiskScore: 0,
        commonFindings: [],
        riskTrends: [],
        timeSpentAnalyzing: 0,
        mostProblematicSites: []
      }
    }

    // Calculate basic metrics
    const documentsAnalyzed = entries.length
    const totalRiskScore = entries.reduce((sum, entry) => sum + entry.riskScore, 0)
    const averageRiskScore = Math.round(totalRiskScore / documentsAnalyzed)

    // Calculate common findings (this would need to be enhanced with actual finding data)
    const findingCategories = new Map<string, number>()
    entries.forEach(entry => {
      // Placeholder - in real implementation, you'd track finding categories
      if (entry.findingsCount > 0) {
        const category = entry.documentType
        findingCategories.set(category, (findingCategories.get(category) || 0) + entry.findingsCount)
      }
    })

    const commonFindings = Array.from(findingCategories.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Calculate risk trends (group by day)
    const riskTrends = this.calculateRiskTrends(entries)

    // Estimate time spent analyzing (rough estimate: 30 seconds per document)
    const timeSpentAnalyzing = documentsAnalyzed * 30 * 1000 // milliseconds

    // Find most problematic sites
    const siteRisks = new Map<string, { totalRisk: number; count: number }>()
    entries.forEach(entry => {
      const domain = this.extractDomain(entry.url)
      const existing = siteRisks.get(domain) || { totalRisk: 0, count: 0 }
      siteRisks.set(domain, {
        totalRisk: existing.totalRisk + entry.riskScore,
        count: existing.count + 1
      })
    })

    const mostProblematicSites = Array.from(siteRisks.entries())
      .map(([url, data]) => ({ 
        url, 
        riskScore: Math.round(data.totalRisk / data.count) 
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10)

    return {
      documentsAnalyzed,
      averageRiskScore,
      commonFindings,
      riskTrends,
      timeSpentAnalyzing,
      mostProblematicSites
    }
  }

  /**
   * Export history data
   */
  async exportHistory(options: ExportOptions): Promise<Blob> {
    const history = await this.getHistory()
    let entries = history.entries

    // Apply date range filter if specified
    if (options.dateRange) {
      entries = entries.filter(entry => 
        entry.analysisDate >= options.dateRange!.start && 
        entry.analysisDate <= options.dateRange!.end
      )
    }

    switch (options.format) {
      case 'json':
        return this.exportAsJSON(entries, options)
      
      case 'csv':
        return this.exportAsCSV(entries, options)
      
      case 'pdf':
        return this.exportAsPDF(entries, options)
      
      default:
        throw new Error(`Unsupported export format: ${options.format}`)
    }
  }

  /**
   * Delete history entry
   */
  async deleteEntry(entryId: string): Promise<boolean> {
    try {
      const history = await this.getHistory()
      const originalLength = history.entries.length
      
      history.entries = history.entries.filter(entry => entry.id !== entryId)
      
      if (history.entries.length < originalLength) {
        history.totalEntries = history.entries.length
        if (history.entries.length > 0) {
          history.newestEntry = history.entries[0].analysisDate
          history.oldestEntry = history.entries[history.entries.length - 1].analysisDate
        }
        
        await this.saveHistory(history)
        return true
      }
      
      return false
    } catch {
      return false
    }
  }

  /**
   * Clear all history
   */
  async clearHistory(): Promise<void> {
    const emptyHistory: AnalysisHistory = {
      entries: [],
      totalEntries: 0,
      oldestEntry: Date.now(),
      newestEntry: Date.now()
    }
    
    await this.saveHistory(emptyHistory)
  }

  /**
   * Search history entries
   */
  async searchHistory(query: string, limit: number = 50): Promise<HistoryEntry[]> {
    const history = await this.getHistory()
    const searchQuery = query.toLowerCase()
    
    const matches = history.entries.filter(entry => {
      const searchableText = `${entry.url} ${entry.title}`.toLowerCase()
      return searchableText.includes(searchQuery)
    })
    
    return matches.slice(0, limit)
  }

  /**
   * Get history statistics
   */
  async getStatistics(): Promise<{
    totalAnalyses: number;
    thisWeek: number;
    thisMonth: number;
    averageRisk: number;
    highRiskCount: number;
    topDomains: Array<{ domain: string; count: number }>;
  }> {
    const history = await this.getHistory()
    const now = Date.now()
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000)
    const monthAgo = now - (30 * 24 * 60 * 60 * 1000)

    const thisWeek = history.entries.filter(e => e.analysisDate >= weekAgo).length
    const thisMonth = history.entries.filter(e => e.analysisDate >= monthAgo).length
    
    const totalRisk = history.entries.reduce((sum, e) => sum + e.riskScore, 0)
    const averageRisk = history.entries.length > 0 
      ? Math.round(totalRisk / history.entries.length) 
      : 0
    
    const highRiskCount = history.entries.filter(e => e.riskScore >= 70).length

    // Count domains
    const domainCounts = new Map<string, number>()
    history.entries.forEach(entry => {
      const domain = this.extractDomain(entry.url)
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1)
    })

    const topDomains = Array.from(domainCounts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      totalAnalyses: history.totalEntries,
      thisWeek,
      thisMonth,
      averageRisk,
      highRiskCount,
      topDomains
    }
  }

  /**
   * Calculate risk trends over time
   */
  private calculateRiskTrends(entries: HistoryEntry[]): Array<{ date: number; score: number }> {
    const dailyScores = new Map<string, { total: number; count: number }>()
    
    entries.forEach(entry => {
      const date = new Date(entry.analysisDate)
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      
      const existing = dailyScores.get(dateKey) || { total: 0, count: 0 }
      dailyScores.set(dateKey, {
        total: existing.total + entry.riskScore,
        count: existing.count + 1
      })
    })

    return Array.from(dailyScores.entries())
      .map(([dateKey, data]) => ({
        date: new Date(dateKey).getTime(),
        score: Math.round(data.total / data.count)
      }))
      .sort((a, b) => a.date - b.date)
  }

  /**
   * Export as JSON
   */
  private exportAsJSON(entries: HistoryEntry[], options: ExportOptions): Blob {
    const data = {
      exportDate: new Date().toISOString(),
      totalEntries: entries.length,
      entries: entries.map(entry => ({
        ...entry,
        ...(options.includeMetadata && { 
          exportedAt: Date.now(),
          exportVersion: "1.0"
        })
      }))
    }

    return new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    })
  }

  /**
   * Export as CSV
   */
  private exportAsCSV(entries: HistoryEntry[], options: ExportOptions): Blob {
    const headers = [
      'URL', 'Title', 'Document Type', 'Analysis Date', 'Risk Score', 
      'Findings Count', 'High Risk Findings', 'Job ID'
    ]
    
    if (options.includeMetadata) {
      headers.push('Tags')
    }

    const rows = entries.map(entry => {
      const row = [
        entry.url,
        entry.title,
        entry.documentType,
        new Date(entry.analysisDate).toISOString(),
        entry.riskScore.toString(),
        entry.findingsCount.toString(),
        entry.highRiskFindings.toString(),
        entry.jobId || ''
      ]

      if (options.includeMetadata) {
        row.push(entry.tags.join(';'))
      }

      return row
    })

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    return new Blob([csv], { type: 'text/csv' })
  }

  /**
   * Export as PDF (placeholder implementation)
   */
  private exportAsPDF(entries: HistoryEntry[], options: ExportOptions): Blob {
    const content = `Fine Print AI Analysis History Report

Generated: ${new Date().toISOString()}
Total Entries: ${entries.length}

Entries:
${entries.map(entry => 
  `${entry.title}
  URL: ${entry.url}
  Risk Score: ${entry.riskScore}/100
  Analyzed: ${new Date(entry.analysisDate).toISOString()}
  Findings: ${entry.findingsCount}
  ---`
).join('\n')}
`

    return new Blob([content], { type: 'application/pdf' })
  }

  /**
   * Save history to storage
   */
  private async saveHistory(history: AnalysisHistory): Promise<void> {
    await this.storage.set('analysis-history', history)
  }

  /**
   * Extract title from URL
   */
  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/').filter(Boolean)
      
      if (pathParts.length > 0) {
        return pathParts[pathParts.length - 1]
          .replace(/[-_]/g, ' ')
          .replace(/\.(html|php|asp|jsp)$/i, '')
      }
      
      return urlObj.hostname
    } catch {
      return url
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }

  /**
   * Get risk level category
   */
  private getRiskLevel(score: number): string {
    if (score >= 70) return 'high'
    if (score >= 40) return 'medium'
    return 'low'
  }

  /**
   * Generate tags for analysis entry
   */
  private generateTags(analysis: PageAnalysisState): string[] {
    const tags: string[] = []
    
    if (analysis.documentType) {
      tags.push(analysis.documentType)
    }
    
    if (analysis.riskScore !== undefined) {
      tags.push(this.getRiskLevel(analysis.riskScore))
    }
    
    if (analysis.findings && analysis.findings.length > 0) {
      const severities = [...new Set(analysis.findings.map(f => f.severity))]
      tags.push(...severities)
    }
    
    return tags
  }
}

// Export singleton instance
export const historyManager = new HistoryManager()