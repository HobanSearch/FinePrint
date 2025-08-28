import { Storage } from "@plasmohq/storage"

import { getApiClient } from "./api-client"
import { enterpriseManager } from "./enterprise-manager"
import { historyManager } from "./history-manager"
import { bulkAnalysisManager } from "./bulk-analysis"
import { siteMonitor } from "./site-monitor"
import { exportManager } from "./export-manager"
import { integrationManager } from "./integration-manager"
import type { 
  PageAnalysisState,
  BulkAnalysisJob,
  MonitoredSite,
  ExportJob,
  HistoryEntry
} from "@/types"

export interface APIKey {
  id: string
  name: string
  key: string
  permissions: APIPermission[]
  rateLimits: RateLimit
  isActive: boolean
  createdAt: number
  lastUsed?: number
  usageStats: UsageStats
  expiresAt?: number
  createdBy: string
  organizationId?: string
}

export interface APIPermission {
  resource: string // 'analysis', 'history', 'monitoring', 'export', 'enterprise'
  actions: string[] // 'read', 'write', 'delete', 'create'
  constraints?: APIConstraint[]
}

export interface APIConstraint {
  type: 'time_range' | 'domain_whitelist' | 'rate_limit' | 'data_scope'
  value: any
}

export interface RateLimit {
  requestsPerMinute: number
  requestsPerHour: number
  requestsPerDay: number
  burstLimit: number
}

export interface UsageStats {
  totalRequests: number
  requestsThisMonth: number
  requestsToday: number
  lastRequestAt?: number
  errorCount: number
  averageResponseTime: number
}

export interface APIRequest {
  id: string
  apiKeyId: string
  endpoint: string
  method: string
  timestamp: number
  responseTime: number
  statusCode: number
  requestSize: number
  responseSize: number
  userAgent?: string
  ipAddress?: string
  error?: string
}

export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  meta?: {
    timestamp: number
    version: string
    requestId: string
    rateLimit?: {
      remaining: number
      resetAt: number
    }
  }
}

export class APIGateway {
  private storage = new Storage()
  private apiKeys = new Map<string, APIKey>()
  private requestLog: APIRequest[] = []
  private rateLimitCache = new Map<string, { count: number; resetAt: number }>()

  constructor() {
    this.initialize()
  }

  /**
   * Initialize API Gateway
   */
  async initialize(): Promise<void> {
    await this.loadAPIKeys()
    await this.loadRequestLog()
    this.setupCleanupTasks()
  }

  /**
   * Generate new API key
   */
  async generateAPIKey(
    name: string,
    permissions: APIPermission[],
    options: {
      rateLimits?: Partial<RateLimit>
      expiresIn?: number // days
      organizationId?: string
      createdBy: string
    }
  ): Promise<APIKey> {
    const apiKey: APIKey = {
      id: `key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      key: this.generateSecureKey(),
      permissions,
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        requestsPerDay: 10000,
        burstLimit: 10,
        ...options.rateLimits
      },
      isActive: true,
      createdAt: Date.now(),
      usageStats: {
        totalRequests: 0,
        requestsThisMonth: 0,
        requestsToday: 0,
        errorCount: 0,
        averageResponseTime: 0
      },
      expiresAt: options.expiresIn ? Date.now() + (options.expiresIn * 24 * 60 * 60 * 1000) : undefined,
      createdBy: options.createdBy,
      organizationId: options.organizationId
    }

    this.apiKeys.set(apiKey.key, apiKey)
    await this.saveAPIKey(apiKey)

    return apiKey
  }

  /**
   * Validate API key and check permissions
   */
  async validateRequest(
    apiKey: string,
    endpoint: string,
    method: string
  ): Promise<{ valid: boolean; key?: APIKey; error?: string }> {
    const key = this.apiKeys.get(apiKey)
    
    if (!key) {
      return { valid: false, error: 'Invalid API key' }
    }

    if (!key.isActive) {
      return { valid: false, error: 'API key is inactive' }
    }

    if (key.expiresAt && Date.now() > key.expiresAt) {
      return { valid: false, error: 'API key has expired' }
    }

    // Check rate limits
    const rateLimitCheck = await this.checkRateLimit(key)
    if (!rateLimitCheck.allowed) {
      return { valid: false, error: `Rate limit exceeded. Reset at: ${new Date(rateLimitCheck.resetAt).toISOString()}` }
    }

    // Check permissions
    const hasPermission = this.checkPermission(key, endpoint, method)
    if (!hasPermission) {
      return { valid: false, error: 'Insufficient permissions' }
    }

    return { valid: true, key }
  }

  /**
   * Process API request
   */
  async processRequest(
    apiKey: string,
    endpoint: string,
    method: string,
    params: any = {},
    body: any = null
  ): Promise<APIResponse> {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const startTime = Date.now()

    try {
      // Validate request
      const validation = await this.validateRequest(apiKey, endpoint, method)
      if (!validation.valid || !validation.key) {
        return this.createErrorResponse(validation.error || 'Invalid request', 'INVALID_REQUEST', requestId)
      }

      // Log request
      const request: APIRequest = {
        id: requestId,
        apiKeyId: validation.key.id,
        endpoint,
        method,
        timestamp: startTime,
        responseTime: 0,
        statusCode: 0,
        requestSize: JSON.stringify({ params, body }).length,
        responseSize: 0
      }

      // Process the actual request
      let response: APIResponse
      
      try {
        const data = await this.routeRequest(endpoint, method, params, body, validation.key)
        response = this.createSuccessResponse(data, requestId, validation.key)
        request.statusCode = 200
      } catch (error) {
        console.error('API request processing error:', error)
        response = this.createErrorResponse(
          error instanceof Error ? error.message : 'Internal server error',
          'PROCESSING_ERROR',
          requestId
        )
        request.statusCode = 500
        request.error = error instanceof Error ? error.message : 'Unknown error'
      }

      // Update request log
      request.responseTime = Date.now() - startTime
      request.responseSize = JSON.stringify(response).length
      this.requestLog.push(request)

      // Update usage stats
      await this.updateUsageStats(validation.key, request)

      // Save request log periodically
      if (this.requestLog.length % 10 === 0) {
        await this.saveRequestLog()
      }

      return response

    } catch (error) {
      return this.createErrorResponse(
        'Failed to process request',
        'SERVER_ERROR',
        requestId
      )
    }
  }

  /**
   * Route request to appropriate handler
   */
  private async routeRequest(
    endpoint: string,
    method: string,
    params: any,
    body: any,
    apiKey: APIKey
  ): Promise<any> {
    const [resource, action, ...pathParts] = endpoint.split('/').filter(Boolean)

    switch (resource) {
      case 'analysis':
        return await this.handleAnalysisRequest(action, pathParts, method, params, body, apiKey)
      
      case 'history':
        return await this.handleHistoryRequest(action, pathParts, method, params, body, apiKey)
      
      case 'monitoring':
        return await this.handleMonitoringRequest(action, pathParts, method, params, body, apiKey)
      
      case 'export':
        return await this.handleExportRequest(action, pathParts, method, params, body, apiKey)
      
      case 'enterprise':
        return await this.handleEnterpriseRequest(action, pathParts, method, params, body, apiKey)
      
      case 'integration':
        return await this.handleIntegrationRequest(action, pathParts, method, params, body, apiKey)
      
      default:
        throw new Error(`Unknown resource: ${resource}`)
    }
  }

  /**
   * Handle analysis requests
   */
  private async handleAnalysisRequest(
    action: string,
    pathParts: string[],
    method: string,
    params: any,
    body: any,
    apiKey: APIKey
  ): Promise<any> {
    switch (`${method}:${action}`) {
      case 'POST:analyze':
        if (!body?.url) {
          throw new Error('URL is required')
        }
        return await this.analyzeDocument(body.url, body.content, apiKey)
      
      case 'GET:status':
        const analysisId = pathParts[0]
        if (!analysisId) {
          throw new Error('Analysis ID is required')
        }
        return await this.getAnalysisStatus(analysisId, apiKey)
      
      case 'GET:results':
        const resultId = pathParts[0]
        if (!resultId) {
          throw new Error('Result ID is required')
        }
        return await this.getAnalysisResults(resultId, apiKey)
      
      default:
        throw new Error(`Unsupported analysis endpoint: ${method} ${action}`)
    }
  }

  /**
   * Handle history requests
   */
  private async handleHistoryRequest(
    action: string,
    pathParts: string[],
    method: string,
    params: any,
    body: any,
    apiKey: APIKey
  ): Promise<any> {
    switch (`${method}:${action}`) {
      case 'GET:list':
        return await this.getAnalysisHistory(params, apiKey)
      
      case 'GET:entry':
        const entryId = pathParts[0]
        if (!entryId) {
          throw new Error('Entry ID is required')
        }
        return await this.getHistoryEntry(entryId, apiKey)
      
      case 'DELETE:entry':
        const deleteId = pathParts[0]
        if (!deleteId) {
          throw new Error('Entry ID is required')
        }
        return await this.deleteHistoryEntry(deleteId, apiKey)
      
      case 'GET:analytics':
        return await this.getAnalytics(params, apiKey)
      
      default:
        throw new Error(`Unsupported history endpoint: ${method} ${action}`)
    }
  }

  /**
   * Handle monitoring requests
   */
  private async handleMonitoringRequest(
    action: string,
    pathParts: string[],
    method: string,
    params: any,
    body: any,
    apiKey: APIKey
  ): Promise<any> {
    switch (`${method}:${action}`) {
      case 'GET:sites':
        return await this.getMonitoredSites(apiKey)
      
      case 'POST:sites':
        if (!body?.url) {
          throw new Error('URL is required')
        }
        return await this.addMonitoredSite(body, apiKey)
      
      case 'PUT:sites':
        const siteId = pathParts[0]
        if (!siteId) {
          throw new Error('Site ID is required')
        }
        return await this.updateMonitoredSite(siteId, body, apiKey)
      
      case 'DELETE:sites':
        const deleteSiteId = pathParts[0]
        if (!deleteSiteId) {
          throw new Error('Site ID is required')
        }
        return await this.removeMonitoredSite(deleteSiteId, apiKey)
      
      case 'GET:changes':
        const changesId = pathParts[0]
        return await this.getSiteChanges(changesId, params, apiKey)
      
      default:
        throw new Error(`Unsupported monitoring endpoint: ${method} ${action}`)
    }
  }

  /**
   * Handle export requests
   */
  private async handleExportRequest(
    action: string,
    pathParts: string[],
    method: string,
    params: any,
    body: any,
    apiKey: APIKey
  ): Promise<any> {
    switch (`${method}:${action}`) {
      case 'POST:analysis':
        if (!body?.analysisId) {
          throw new Error('Analysis ID is required')
        }
        return await this.exportAnalysis(body, apiKey)
      
      case 'POST:history':
        return await this.exportHistory(body || {}, apiKey)
      
      case 'GET:job':
        const jobId = pathParts[0]
        if (!jobId) {
          throw new Error('Job ID is required')
        }
        return await this.getExportJob(jobId, apiKey)
      
      case 'GET:download':
        const downloadId = pathParts[0]
        if (!downloadId) {
          throw new Error('Export ID is required')
        }
        return await this.downloadExport(downloadId, apiKey)
      
      default:
        throw new Error(`Unsupported export endpoint: ${method} ${action}`)
    }
  }

  /**
   * Handle enterprise requests
   */
  private async handleEnterpriseRequest(
    action: string,
    pathParts: string[],
    method: string,
    params: any,
    body: any,
    apiKey: APIKey
  ): Promise<any> {
    // Check if user has enterprise permissions
    if (!apiKey.organizationId) {
      throw new Error('Enterprise features require organization API key')
    }

    switch (`${method}:${action}`) {
      case 'GET:config':
        return await this.getEnterpriseConfig(apiKey)
      
      case 'PUT:config':
        return await this.updateEnterpriseConfig(body, apiKey)
      
      case 'GET:compliance':
        return await this.getComplianceReport(params, apiKey)
      
      case 'GET:violations':
        return await this.getPolicyViolations(params, apiKey)
      
      case 'GET:users':
        return await this.getEnterpriseUsers(apiKey)
      
      default:
        throw new Error(`Unsupported enterprise endpoint: ${method} ${action}`)
    }
  }

  /**
   * Handle integration requests
   */
  private async handleIntegrationRequest(
    action: string,
    pathParts: string[],
    method: string,
    params: any,
    body: any,
    apiKey: APIKey
  ): Promise<any> {
    switch (`${method}:${action}`) {
      case 'GET:list':
        return await this.getIntegrations(apiKey)
      
      case 'POST:webhook':
        if (!body?.name || !body?.url) {
          throw new Error('Integration name and URL are required')
        }
        return await this.createWebhookIntegration(body, apiKey)
      
      case 'POST:notify':
        if (!body?.event || !body?.data) {
          throw new Error('Event type and data are required')
        }
        return await this.sendNotification(body, apiKey)
      
      default:
        throw new Error(`Unsupported integration endpoint: ${method} ${action}`)
    }
  }

  /**
   * Implementation of specific API methods
   */
  private async analyzeDocument(url: string, content?: string, apiKey: APIKey): Promise<any> {
    // This would integrate with the existing analysis system
    const apiClient = getApiClient()
    
    if (!content) {
      // Fetch content if not provided
      try {
        const response = await fetch(url)
        content = await response.text()
      } catch (error) {
        throw new Error(`Failed to fetch content from ${url}`)
      }
    }

    const result = await apiClient.quickAnalyze(url, content)
    
    // Add to history if allowed
    if (this.hasPermission(apiKey, 'history', 'write')) {
      const analysis: PageAnalysisState = {
        url,
        isAnalyzing: false,
        isTermsPage: result.documentType === 'terms',
        isPrivacyPage: result.documentType === 'privacy',
        documentType: result.documentType as any,
        analysisId: result.id,
        riskScore: result.overallRiskScore,
        findings: result.findings.map(f => ({
          id: f.id,
          category: f.category,
          title: f.title,
          description: f.description,
          severity: f.severity,
          confidenceScore: f.confidenceScore || 0,
          textExcerpt: f.textExcerpt || '',
          positionStart: f.positionStart || 0,
          positionEnd: f.positionEnd || 0,
          recommendation: f.recommendation || '',
          impactExplanation: f.impactExplanation || '',
          highlighted: false
        })),
        lastAnalyzed: Date.now()
      }
      
      await historyManager.addEntry(analysis)
    }

    return {
      analysisId: result.id,
      url,
      riskScore: result.overallRiskScore,
      documentType: result.documentType,
      findings: result.findings,
      analysisDate: new Date().toISOString()
    }
  }

  private async getAnalysisStatus(analysisId: string, apiKey: APIKey): Promise<any> {
    // In a real implementation, this would track analysis job status
    return {
      analysisId,
      status: 'completed',
      progress: 100,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    }
  }

  private async getAnalysisResults(resultId: string, apiKey: APIKey): Promise<any> {
    // Retrieve analysis results by ID
    const history = await historyManager.getHistory()
    const entry = history.entries.find(e => e.id === resultId)
    
    if (!entry) {
      throw new Error('Analysis results not found')
    }

    return entry
  }

  private async getAnalysisHistory(params: any, apiKey: APIKey): Promise<any> {
    const page = parseInt(params.page) || 1
    const limit = Math.min(parseInt(params.limit) || 20, 100) // Max 100 per page
    
    const filters = {
      dateRange: params.startDate && params.endDate ? {
        start: new Date(params.startDate).getTime(),
        end: new Date(params.endDate).getTime()
      } : undefined,
      documentTypes: params.documentType ? [params.documentType] : undefined,
      riskLevels: params.riskLevel ? [params.riskLevel] : undefined,
      searchQuery: params.search
    }

    const result = await historyManager.getHistoryPage(page, limit, filters)
    
    return {
      entries: result.entries,
      pagination: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalEntries: result.totalEntries,
        hasNext: result.currentPage < result.totalPages,
        hasPrev: result.currentPage > 1
      }
    }
  }

  private async getHistoryEntry(entryId: string, apiKey: APIKey): Promise<any> {
    const history = await historyManager.getHistory()
    const entry = history.entries.find(e => e.id === entryId)
    
    if (!entry) {
      throw new Error('History entry not found')
    }

    return entry
  }

  private async deleteHistoryEntry(entryId: string, apiKey: APIKey): Promise<any> {
    const success = await historyManager.deleteEntry(entryId)
    
    if (!success) {
      throw new Error('Failed to delete history entry')
    }

    return { success: true, message: 'History entry deleted' }
  }

  private async getAnalytics(params: any, apiKey: APIKey): Promise<any> {
    const dateRange = params.startDate && params.endDate ? {
      start: new Date(params.startDate).getTime(),
      end: new Date(params.endDate).getTime()
    } : undefined

    return await historyManager.getAnalytics(dateRange)
  }

  private async getMonitoredSites(apiKey: APIKey): Promise<any> {
    const sites = await siteMonitor.getAllSites()
    
    // Filter by organization if applicable
    if (apiKey.organizationId) {
      // In a real implementation, sites would be filtered by organization
    }

    return { sites }
  }

  private async addMonitoredSite(data: any, apiKey: APIKey): Promise<any> {
    const site = await siteMonitor.addSite(data.url, {
      title: data.title,
      checkInterval: data.checkInterval,
      notifications: data.notifications,
      riskThreshold: data.riskThreshold
    })

    return site
  }

  private async updateMonitoredSite(siteId: string, data: any, apiKey: APIKey): Promise<any> {
    const site = await siteMonitor.updateSite(siteId, data)
    
    if (!site) {
      throw new Error('Monitored site not found')
    }

    return site
  }

  private async removeMonitoredSite(siteId: string, apiKey: APIKey): Promise<any> {
    const success = await siteMonitor.removeSite(siteId)
    
    if (!success) {
      throw new Error('Failed to remove monitored site')
    }

    return { success: true, message: 'Monitored site removed' }
  }

  private async getSiteChanges(siteId: string, params: any, apiKey: APIKey): Promise<any> {
    const limit = Math.min(parseInt(params.limit) || 50, 100)
    const changes = await siteMonitor.getSiteChanges(siteId, limit)
    
    return { changes }
  }

  private async exportAnalysis(data: any, apiKey: APIKey): Promise<any> {
    const job = await exportManager.exportAnalysis(
      data.analysisId,
      {
        format: data.format || 'pdf',
        includeFindings: data.includeFindings !== false,
        includeRecommendations: data.includeRecommendations !== false,
        includeMetadata: data.includeMetadata !== false,
        filterBySeverity: data.filterBySeverity
      },
      data.templateId
    )

    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      createdAt: new Date(job.createdAt).toISOString()
    }
  }

  private async exportHistory(data: any, apiKey: APIKey): Promise<any> {
    const job = await exportManager.exportHistory(
      {
        format: data.format || 'csv',
        includeFindings: data.includeFindings,
        includeRecommendations: data.includeRecommendations,
        includeMetadata: data.includeMetadata,
        dateRange: data.startDate && data.endDate ? {
          start: new Date(data.startDate).getTime(),
          end: new Date(data.endDate).getTime()
        } : undefined
      },
      data.templateId
    )

    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      createdAt: new Date(job.createdAt).toISOString()
    }
  }

  private async getExportJob(jobId: string, apiKey: APIKey): Promise<any> {
    const job = await exportManager.getExportJob(jobId)
    
    if (!job) {
      throw new Error('Export job not found')
    }

    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      createdAt: new Date(job.createdAt).toISOString(),
      completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
      result: job.result,
      error: job.error
    }
  }

  private async downloadExport(exportId: string, apiKey: APIKey): Promise<any> {
    const blob = await exportManager.downloadExport(exportId)
    
    // Convert blob to base64 for API response
    const arrayBuffer = await blob.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

    return {
      filename: `export-${exportId}`,
      contentType: blob.type,
      size: blob.size,
      content: base64
    }
  }

  private async getEnterpriseConfig(apiKey: APIKey): Promise<any> {
    const config = await enterpriseManager.getEnterpriseConfig()
    
    if (!config || config.organizationId !== apiKey.organizationId) {
      throw new Error('Enterprise configuration not found')
    }

    // Return sanitized config (remove sensitive data)
    return {
      organizationId: config.organizationId,
      branding: config.branding,
      reportingConfig: {
        frequency: config.reportingConfig.frequency,
        format: config.reportingConfig.format,
        includeMetrics: config.reportingConfig.includeMetrics
      },
      userRoles: config.userRoles.map(role => ({
        id: role.id,
        name: role.name,
        permissions: role.permissions
      }))
    }
  }

  private async updateEnterpriseConfig(data: any, apiKey: APIKey): Promise<any> {
    // This would update enterprise configuration
    // Implementation depends on specific requirements
    throw new Error('Enterprise configuration updates not yet implemented')
  }

  private async getComplianceReport(params: any, apiKey: APIKey): Promise<any> {
    const dateRange = params.startDate && params.endDate ? {
      start: new Date(params.startDate).getTime(),
      end: new Date(params.endDate).getTime()
    } : {
      start: Date.now() - (30 * 24 * 60 * 60 * 1000), // Last 30 days
      end: Date.now()
    }

    return await enterpriseManager.generateComplianceReport(dateRange)
  }

  private async getPolicyViolations(params: any, apiKey: APIKey): Promise<any> {
    // This would retrieve policy violations
    // Implementation depends on how violations are stored
    return { violations: [] }
  }

  private async getEnterpriseUsers(apiKey: APIKey): Promise<any> {
    // This would retrieve organization users
    // Implementation depends on user management system
    return { users: [] }
  }

  private async getIntegrations(apiKey: APIKey): Promise<any> {
    const integrations = integrationManager.getIntegrations()
    
    // Filter by organization if applicable
    return {
      integrations: integrations.map(integration => ({
        name: integration.name,
        type: integration.type,
        isActive: integration.isActive,
        triggerEvents: integration.triggerEvents
      }))
    }
  }

  private async createWebhookIntegration(data: any, apiKey: APIKey): Promise<any> {
    const integration = {
      type: 'webhook' as const,
      name: data.name,
      settings: {
        url: data.url,
        method: data.method || 'POST',
        headers: data.headers || {},
        authentication: data.authentication
      },
      isActive: true,
      triggerEvents: data.triggerEvents || ['analysis-complete', 'high-risk-found']
    }

    await integrationManager.addIntegration(integration)
    
    return { success: true, integration: integration.name }
  }

  private async sendNotification(data: any, apiKey: APIKey): Promise<any> {
    await integrationManager.sendNotification({
      type: data.event,
      data: data.data,
      timestamp: Date.now(),
      url: data.url,
      riskScore: data.riskScore,
      severity: data.severity
    })

    return { success: true, message: 'Notification sent' }
  }

  /**
   * Utility methods
   */
  private generateSecureKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = 'fp_'
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  private async checkRateLimit(apiKey: APIKey): Promise<{ allowed: boolean; resetAt: number }> {
    const now = Date.now()
    const windowStart = Math.floor(now / 60000) * 60000 // Start of current minute
    const cacheKey = `${apiKey.id}-${windowStart}`
    
    let usage = this.rateLimitCache.get(cacheKey)
    if (!usage) {
      usage = { count: 0, resetAt: windowStart + 60000 }
      this.rateLimitCache.set(cacheKey, usage)
    }

    usage.count++
    
    const allowed = usage.count <= apiKey.rateLimits.requestsPerMinute
    
    return { allowed, resetAt: usage.resetAt }
  }

  private checkPermission(apiKey: APIKey, endpoint: string, method: string): boolean {
    const [resource] = endpoint.split('/').filter(Boolean)
    const action = this.mapMethodToAction(method)
    
    return apiKey.permissions.some(permission => {
      return permission.resource === resource && permission.actions.includes(action)
    })
  }

  private hasPermission(apiKey: APIKey, resource: string, action: string): boolean {
    return apiKey.permissions.some(permission => {
      return permission.resource === resource && permission.actions.includes(action)
    })
  }

  private mapMethodToAction(method: string): string {
    switch (method.toLowerCase()) {
      case 'get': return 'read'
      case 'post': return 'create'
      case 'put': case 'patch': return 'write'
      case 'delete': return 'delete'
      default: return 'read'
    }
  }

  private createSuccessResponse<T>(data: T, requestId: string, apiKey: APIKey): APIResponse<T> {
    const rateLimitInfo = this.rateLimitCache.get(`${apiKey.id}-${Math.floor(Date.now() / 60000) * 60000}`)
    
    return {
      success: true,
      data,
      meta: {
        timestamp: Date.now(),
        version: '1.0',
        requestId,
        rateLimit: rateLimitInfo ? {
          remaining: Math.max(0, apiKey.rateLimits.requestsPerMinute - rateLimitInfo.count),
          resetAt: rateLimitInfo.resetAt
        } : undefined
      }
    }
  }

  private createErrorResponse(message: string, code: string, requestId: string): APIResponse {
    return {
      success: false,
      error: {
        code,
        message
      },
      meta: {
        timestamp: Date.now(),
        version: '1.0',
        requestId
      }
    }
  }

  private async updateUsageStats(apiKey: APIKey, request: APIRequest): Promise<void> {
    apiKey.usageStats.totalRequests++
    apiKey.usageStats.requestsToday++
    apiKey.usageStats.lastRequestAt = request.timestamp
    apiKey.lastUsed = request.timestamp

    if (request.statusCode >= 400) {
      apiKey.usageStats.errorCount++
    }

    // Update average response time
    const totalTime = apiKey.usageStats.averageResponseTime * (apiKey.usageStats.totalRequests - 1)
    apiKey.usageStats.averageResponseTime = (totalTime + request.responseTime) / apiKey.usageStats.totalRequests

    await this.saveAPIKey(apiKey)
  }

  private setupCleanupTasks(): void {
    // Clean up old request logs and rate limit cache every hour
    setInterval(() => {
      this.cleanupRequestLog()
      this.cleanupRateLimitCache()
    }, 60 * 60 * 1000)
  }

  private cleanupRequestLog(): void {
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000)
    this.requestLog = this.requestLog.filter(req => req.timestamp > dayAgo)
  }

  private cleanupRateLimitCache(): void {
    const now = Date.now()
    for (const [key, usage] of this.rateLimitCache.entries()) {
      if (usage.resetAt < now) {
        this.rateLimitCache.delete(key)
      }
    }
  }

  /**
   * Storage methods
   */
  private async loadAPIKeys(): Promise<void> {
    try {
      const allData = await this.storage.getAll()
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('api-key-')) {
          this.apiKeys.set((value as APIKey).key, value as APIKey)
        }
      }
    } catch (error) {
      console.error('Failed to load API keys:', error)
    }
  }

  private async saveAPIKey(apiKey: APIKey): Promise<void> {
    await this.storage.set(`api-key-${apiKey.id}`, apiKey)
  }

  private async loadRequestLog(): Promise<void> {
    try {
      const log = await this.storage.get('api-request-log')
      this.requestLog = log || []
    } catch {
      this.requestLog = []
    }
  }

  private async saveRequestLog(): Promise<void> {
    // Keep only last 1000 requests
    if (this.requestLog.length > 1000) {
      this.requestLog = this.requestLog.slice(-1000)
    }
    await this.storage.set('api-request-log', this.requestLog)
  }

  /**
   * Public API key management methods
   */
  async listAPIKeys(organizationId?: string): Promise<APIKey[]> {
    const keys = Array.from(this.apiKeys.values())
    
    if (organizationId) {
      return keys.filter(key => key.organizationId === organizationId)
    }
    
    return keys
  }

  async revokeAPIKey(keyId: string): Promise<boolean> {
    const key = Array.from(this.apiKeys.values()).find(k => k.id === keyId)
    if (!key) return false

    key.isActive = false
    await this.saveAPIKey(key)
    return true
  }

  async getAPIKeyUsage(keyId: string): Promise<UsageStats | null> {
    const key = Array.from(this.apiKeys.values()).find(k => k.id === keyId)
    return key ? key.usageStats : null
  }

  async getRequestLogs(keyId?: string, limit: number = 100): Promise<APIRequest[]> {
    let logs = this.requestLog
    
    if (keyId) {
      logs = logs.filter(req => req.apiKeyId === keyId)
    }
    
    return logs
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }
}

// Export singleton instance
export const apiGateway = new APIGateway()