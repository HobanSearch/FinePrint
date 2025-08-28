import { Storage } from "@plasmohq/storage"
import { sendToContentScript } from "@plasmohq/messaging"

import { getApiClient } from "./api-client"
import { ExtensionStorage } from "./storage"
import { historyManager } from "./history-manager"
import type { 
  EnterpriseConfig,
  OrganizationPolicy,
  PolicyRule,
  BrandingConfig,
  SSOConfig,
  UserRole,
  Permission,
  PageAnalysisState,
  ExtensionFinding
} from "@/types"

export class EnterpriseManager {
  private storage = new Storage()
  private config: EnterpriseConfig | null = null
  private isEnterpriseMode = false

  constructor() {
    this.initialize()
  }

  /**
   * Initialize enterprise manager
   */
  async initialize(): Promise<void> {
    try {
      const config = await this.getEnterpriseConfig()
      if (config) {
        this.config = config
        this.isEnterpriseMode = true
        await this.applyEnterpriseSettings()
      }
    } catch (error) {
      console.error('Failed to initialize enterprise manager:', error)
    }
  }

  /**
   * Check if extension is in enterprise mode
   */
  isEnterprise(): boolean {
    return this.isEnterpriseMode && this.config !== null
  }

  /**
   * Get current enterprise configuration
   */
  async getEnterpriseConfig(): Promise<EnterpriseConfig | null> {
    try {
      const config = await this.storage.get('enterprise-config')
      return config
    } catch {
      return null
    }
  }

  /**
   * Set enterprise configuration
   */
  async setEnterpriseConfig(config: EnterpriseConfig): Promise<void> {
    await this.storage.set('enterprise-config', config)
    this.config = config
    this.isEnterpriseMode = true
    await this.applyEnterpriseSettings()
  }

  /**
   * Apply enterprise settings and policies
   */
  private async applyEnterpriseSettings(): Promise<void> {
    if (!this.config) return

    // Apply branding
    await this.applyBranding(this.config.branding)

    // Enforce policies
    await this.enforcePolicies(this.config.policies)

    // Setup SSO if configured
    if (this.config.ssoConfig?.isActive) {
      await this.setupSSO(this.config.ssoConfig)
    }
  }

  /**
   * Apply custom branding
   */
  private async applyBranding(branding: BrandingConfig): Promise<void> {
    const brandingCSS = `
      :root {
        --enterprise-primary: ${branding.primaryColor};
        --enterprise-secondary: ${branding.secondaryColor};
        --enterprise-org-name: "${branding.organizationName}";
      }
      
      .extension-header::before {
        content: var(--enterprise-org-name);
        font-weight: bold;
        color: var(--enterprise-primary);
      }
      
      .enterprise-logo {
        background-image: url("${branding.logo || ''}");
        background-size: contain;
        background-repeat: no-repeat;
      }
      
      ${branding.customCSS || ''}
      
      ${branding.hideFinePrintBranding ? '.fineprint-branding { display: none !important; }' : ''}
    `

    await this.storage.set('enterprise-branding-css', brandingCSS)
    await this.injectBrandingCSS(brandingCSS)
  }

  /**
   * Inject branding CSS into all tabs
   */
  private async injectBrandingCSS(css: string): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({})
      for (const tab of tabs) {
        if (tab.id) {
          try {
            await chrome.scripting.insertCSS({
              target: { tabId: tab.id },
              css: css
            })
          } catch {
            // Ignore injection errors for privileged tabs
          }
        }
      }
    } catch (error) {
      console.error('Failed to inject branding CSS:', error)
    }
  }

  /**
   * Enforce organization policies
   */
  async enforcePolicies(policies: OrganizationPolicy[]): Promise<void> {
    for (const policy of policies) {
      if (policy.isActive) {
        await this.enforcePolicy(policy)
      }
    }
  }

  /**
   * Enforce a specific policy
   */
  private async enforcePolicy(policy: OrganizationPolicy): Promise<void> {
    switch (policy.type) {
      case 'risk-threshold':
        await this.enforceRiskThresholdPolicy(policy)
        break
      case 'required-review':
        await this.enforceRequiredReviewPolicy(policy)
        break
      case 'blocked-clauses':
        await this.enforceBlockedClausesPolicy(policy)
        break
      case 'auto-approve':
        await this.enforceAutoApprovePolicy(policy)
        break
    }
  }

  /**
   * Enforce risk threshold policy
   */
  private async enforceRiskThresholdPolicy(policy: OrganizationPolicy): Promise<void> {
    const rules = policy.rules
    const maxRiskScore = rules.find(r => r.condition.includes('max_risk'))?.parameters?.threshold || 70

    // Monitor all analyses and block high-risk documents
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.name === 'ANALYSIS_COMPLETE') {
        const analysis = request.body as PageAnalysisState
        if (analysis.riskScore && analysis.riskScore > maxRiskScore) {
          this.handlePolicyViolation(policy, analysis, 'risk-threshold-exceeded')
        }
      }
    })
  }

  /**
   * Enforce required review policy
   */
  private async enforceRequiredReviewPolicy(policy: OrganizationPolicy): Promise<void> {
    const requiredCategories = policy.rules
      .filter(r => r.condition.includes('category'))
      .map(r => r.parameters?.category)
      .filter(Boolean)

    // Mark documents with specified categories as requiring review
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.name === 'ANALYSIS_COMPLETE') {
        const analysis = request.body as PageAnalysisState
        const hasRequiredCategory = analysis.findings?.some(finding => 
          requiredCategories.includes(finding.category)
        )

        if (hasRequiredCategory) {
          this.markForReview(analysis)
        }
      }
    })
  }

  /**
   * Enforce blocked clauses policy
   */
  private async enforceBlockedClausesPolicy(policy: OrganizationPolicy): Promise<void> {
    const blockedClauses = policy.rules
      .filter(r => r.condition.includes('blocked_clause'))
      .map(r => r.parameters?.clause)
      .filter(Boolean)

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.name === 'ANALYSIS_COMPLETE') {
        const analysis = request.body as PageAnalysisState
        const hasBlockedClause = analysis.findings?.some(finding => 
          blockedClauses.some(blocked => finding.title.toLowerCase().includes(blocked.toLowerCase()))
        )

        if (hasBlockedClause) {
          this.blockDocument(analysis, 'blocked-clause-detected')
        }
      }
    })
  }

  /**
   * Enforce auto-approve policy
   */
  private async enforceAutoApprovePolicy(policy: OrganizationPolicy): Promise<void> {
    const approvedDomains = policy.rules
      .filter(r => r.condition.includes('approved_domain'))
      .map(r => r.parameters?.domain)
      .filter(Boolean)

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.name === 'ANALYSIS_COMPLETE') {
        const analysis = request.body as PageAnalysisState
        const domain = new URL(analysis.url).hostname
        
        if (approvedDomains.some(approved => domain.includes(approved))) {
          this.autoApproveDocument(analysis)
        }
      }
    })
  }

  /**
   * Handle policy violation
   */
  private async handlePolicyViolation(
    policy: OrganizationPolicy, 
    analysis: PageAnalysisState, 
    violation: string
  ): Promise<void> {
    const violation_data = {
      policyId: policy.id,
      policyName: policy.name,
      violation,
      url: analysis.url,
      riskScore: analysis.riskScore,
      timestamp: Date.now(),
      userId: await this.getCurrentUserId()
    }

    // Log violation
    await this.logPolicyViolation(violation_data)

    // Take action based on policy rules
    const rule = policy.rules.find(r => r.condition.includes(violation))
    if (rule) {
      switch (rule.action) {
        case 'block':
          await this.blockDocument(analysis, violation)
          break
        case 'warn':
          await this.warnUser(analysis, violation)
          break
        case 'require-review':
          await this.markForReview(analysis)
          break
      }
    }

    // Notify administrators
    await this.notifyAdministrators(violation_data)
  }

  /**
   * Block document access
   */
  private async blockDocument(analysis: PageAnalysisState, reason: string): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ url: analysis.url })
      for (const tab of tabs) {
        if (tab.id) {
          await sendToContentScript({
            name: 'DOCUMENT_BLOCKED',
            body: {
              reason,
              message: 'This document has been blocked by your organization policy.',
              contactInfo: this.config?.reportingConfig?.recipients?.[0]
            }
          }, { tabId: tab.id })
        }
      }
    } catch (error) {
      console.error('Failed to block document:', error)
    }
  }

  /**
   * Warn user about policy violation
   */
  private async warnUser(analysis: PageAnalysisState, violation: string): Promise<void> {
    await chrome.notifications.create(`policy-warning-${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icon.png'),
      title: 'Policy Violation Warning',
      message: `Document at ${new URL(analysis.url).hostname} violates organization policy: ${violation}`,
      priority: 2
    })
  }

  /**
   * Mark document for review
   */
  private async markForReview(analysis: PageAnalysisState): Promise<void> {
    const reviewItem = {
      id: `review-${Date.now()}`,
      url: analysis.url,
      riskScore: analysis.riskScore,
      findings: analysis.findings,
      markedAt: Date.now(),
      status: 'pending-review',
      userId: await this.getCurrentUserId()
    }

    await this.storage.set(`review-${reviewItem.id}`, reviewItem)
    
    // Notify user
    await chrome.notifications.create(`review-required-${reviewItem.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icon.png'),
      title: 'Review Required',
      message: `Document requires review: ${new URL(analysis.url).hostname}`
    })
  }

  /**
   * Auto-approve document
   */
  private async autoApproveDocument(analysis: PageAnalysisState): Promise<void> {
    const approvalItem = {
      id: `approval-${Date.now()}`,
      url: analysis.url,
      approvedAt: Date.now(),
      reason: 'auto-approved-domain',
      userId: await this.getCurrentUserId()
    }

    await this.storage.set(`approval-${approvalItem.id}`, approvalItem)
  }

  /**
   * Log policy violation
   */
  private async logPolicyViolation(violation: any): Promise<void> {
    const violations = await this.storage.get('policy-violations') || []
    violations.push(violation)
    
    // Keep only last 1000 violations
    if (violations.length > 1000) {
      violations.splice(0, violations.length - 1000)
    }
    
    await this.storage.set('policy-violations', violations)
  }

  /**
   * Notify administrators of policy violations
   */
  private async notifyAdministrators(violation: any): Promise<void> {
    if (!this.config?.reportingConfig?.recipients) return

    try {
      const apiClient = getApiClient()
      await apiClient.sendNotification({
        type: 'policy-violation',
        recipients: this.config.reportingConfig.recipients,
        subject: `Policy Violation: ${violation.policyName}`,
        data: violation
      })
    } catch (error) {
      console.error('Failed to notify administrators:', error)
    }
  }

  /**
   * Setup SSO integration
   */
  private async setupSSO(ssoConfig: SSOConfig): Promise<void> {
    // Store SSO configuration
    await this.storage.set('sso-config', ssoConfig)
    
    // Redirect to SSO login if not authenticated
    const isAuthenticated = await this.checkSSOAuthentication()
    if (!isAuthenticated) {
      await this.redirectToSSO()
    }
  }

  /**
   * Check SSO authentication status
   */
  private async checkSSOAuthentication(): Promise<boolean> {
    try {
      const token = await this.storage.get('sso-token')
      const expiry = await this.storage.get('sso-expiry')
      
      if (!token || !expiry) return false
      
      return Date.now() < expiry
    } catch {
      return false
    }
  }

  /**
   * Redirect to SSO login
   */
  private async redirectToSSO(): Promise<void> {
    if (!this.config?.ssoConfig) return

    const ssoUrl = this.buildSSORedirectUrl(this.config.ssoConfig)
    chrome.tabs.create({ url: ssoUrl })
  }

  /**
   * Build SSO redirect URL
   */
  private buildSSORedirectUrl(ssoConfig: SSOConfig): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: ssoConfig.entityId,
      redirect_uri: chrome.runtime.getURL('sso-callback.html'),
      state: btoa(JSON.stringify({ timestamp: Date.now() }))
    })

    return `${ssoConfig.ssoUrl}?${params.toString()}`
  }

  /**
   * Get current user ID
   */
  private async getCurrentUserId(): Promise<string> {
    try {
      const userId = await this.storage.get('current-user-id')
      return userId || 'anonymous'
    } catch {
      return 'anonymous'
    }
  }

  /**
   * Check if user has permission
   */
  async hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    if (!this.config) return true // Allow all if not in enterprise mode

    const userRoles = this.config.userRoles.filter(role => 
      role.users.includes(userId)
    )

    for (const role of userRoles) {
      const permission = role.permissions.find(p => p.resource === resource)
      if (permission && permission.actions.includes(action)) {
        return true
      }
    }

    return false
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(dateRange: { start: number; end: number }): Promise<{
    summary: any;
    violations: any[];
    reviews: any[];
    approvals: any[];
  }> {
    const violations = await this.storage.get('policy-violations') || []
    const filteredViolations = violations.filter(v => 
      v.timestamp >= dateRange.start && v.timestamp <= dateRange.end
    )

    // Get review items
    const allData = await this.storage.getAll()
    const reviews = Object.entries(allData)
      .filter(([key]) => key.startsWith('review-'))
      .map(([, value]) => value)
      .filter((item: any) => 
        item.markedAt >= dateRange.start && item.markedAt <= dateRange.end
      )

    // Get approval items
    const approvals = Object.entries(allData)
      .filter(([key]) => key.startsWith('approval-'))
      .map(([, value]) => value)
      .filter((item: any) => 
        item.approvedAt >= dateRange.start && item.approvedAt <= dateRange.end
      )

    const summary = {
      totalViolations: filteredViolations.length,
      totalReviews: reviews.length,
      totalApprovals: approvals.length,
      mostCommonViolation: this.getMostCommonViolation(filteredViolations),
      complianceScore: this.calculateComplianceScore(filteredViolations, reviews, approvals)
    }

    return {
      summary,
      violations: filteredViolations,
      reviews,
      approvals
    }
  }

  /**
   * Get most common violation type
   */
  private getMostCommonViolation(violations: any[]): string {
    const counts = violations.reduce((acc, v) => {
      acc[v.violation] = (acc[v.violation] || 0) + 1
      return acc
    }, {})

    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, '')
  }

  /**
   * Calculate compliance score
   */
  private calculateComplianceScore(violations: any[], reviews: any[], approvals: any[]): number {
    const totalActions = violations.length + reviews.length + approvals.length
    if (totalActions === 0) return 100

    const negativeActions = violations.length
    const positiveActions = reviews.length + approvals.length

    return Math.round((positiveActions / totalActions) * 100)
  }

  /**
   * Export enterprise data
   */
  async exportEnterpriseData(format: 'json' | 'csv'): Promise<Blob> {
    const data = {
      config: this.config,
      violations: await this.storage.get('policy-violations') || [],
      reviews: await this.getAllReviews(),
      approvals: await this.getAllApprovals(),
      exportDate: new Date().toISOString()
    }

    if (format === 'json') {
      return new Blob([JSON.stringify(data, null, 2)], { 
        type: 'application/json' 
      })
    } else {
      return this.convertToCSV(data)
    }
  }

  /**
   * Get all review items
   */
  private async getAllReviews(): Promise<any[]> {
    const allData = await this.storage.getAll()
    return Object.entries(allData)
      .filter(([key]) => key.startsWith('review-'))
      .map(([, value]) => value)
  }

  /**
   * Get all approval items
   */
  private async getAllApprovals(): Promise<any[]> {
    const allData = await this.storage.getAll()
    return Object.entries(allData)
      .filter(([key]) => key.startsWith('approval-'))
      .map(([, value]) => value)
  }

  /**
   * Convert data to CSV format
   */
  private convertToCSV(data: any): Blob {
    const violations = data.violations.map((v: any) => [
      'violation',
      v.policyName,
      v.url,
      v.riskScore,
      new Date(v.timestamp).toISOString(),
      v.userId
    ])

    const reviews = data.reviews.map((r: any) => [
      'review',
      'N/A',
      r.url,
      r.riskScore,
      new Date(r.markedAt).toISOString(),
      r.userId
    ])

    const approvals = data.approvals.map((a: any) => [
      'approval',
      a.reason,
      a.url,
      'N/A',
      new Date(a.approvedAt).toISOString(),
      a.userId
    ])

    const headers = ['Type', 'Policy/Reason', 'URL', 'Risk Score', 'Date', 'User ID']
    const rows = [headers, ...violations, ...reviews, ...approvals]

    const csv = rows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    return new Blob([csv], { type: 'text/csv' })
  }
}

// Export singleton instance
export const enterpriseManager = new EnterpriseManager()