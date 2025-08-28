import { Storage } from "@plasmohq/storage"

import { getApiClient } from "./api-client"
import { enterpriseManager } from "./enterprise-manager"
import { exportManager } from "./export-manager"
import type { 
  IntegrationConfig,
  SlackIntegration,
  TeamsIntegration,
  EmailIntegration,
  WebhookIntegration,
  PageAnalysisState,
  BulkAnalysisJob,
  ExtensionFinding
} from "@/types"

export interface IntegrationMessage {
  id: string
  integration: IntegrationConfig
  payload: any
  scheduledFor?: number
  attempts: number
  maxAttempts: number
  status: 'pending' | 'sent' | 'failed' | 'retrying'
  createdAt: number
  sentAt?: number
  error?: string
}

export interface NotificationEvent {
  type: 'analysis-complete' | 'high-risk-found' | 'policy-violation' | 'site-change' | 'bulk-analysis-complete'
  data: any
  timestamp: number
  url?: string
  riskScore?: number
  severity?: string
}

export class IntegrationManager {
  private storage = new Storage()
  private integrations = new Map<string, IntegrationConfig>()
  private messageQueue: IntegrationMessage[] = []
  private processingQueue = false
  private retryInterval = 60000 // 1 minute

  constructor() {
    this.initialize()
  }

  /**
   * Initialize integration manager
   */
  async initialize(): Promise<void> {
    await this.loadIntegrations()
    await this.loadMessageQueue()
    this.startQueueProcessor()
  }

  /**
   * Add new integration
   */
  async addIntegration(integration: IntegrationConfig): Promise<void> {
    // Validate integration configuration
    await this.validateIntegration(integration)

    this.integrations.set(integration.name, integration)
    await this.saveIntegration(integration)
  }

  /**
   * Update existing integration
   */
  async updateIntegration(name: string, updates: Partial<IntegrationConfig>): Promise<void> {
    const existing = this.integrations.get(name)
    if (!existing) {
      throw new Error(`Integration '${name}' not found`)
    }

    const updated = { ...existing, ...updates }
    await this.validateIntegration(updated)

    this.integrations.set(name, updated)
    await this.saveIntegration(updated)
  }

  /**
   * Remove integration
   */
  async removeIntegration(name: string): Promise<void> {
    this.integrations.delete(name)
    await this.storage.remove(`integration-${name}`)
  }

  /**
   * Get all integrations
   */
  getIntegrations(): IntegrationConfig[] {
    return Array.from(this.integrations.values())
  }

  /**
   * Get specific integration
   */
  getIntegration(name: string): IntegrationConfig | null {
    return this.integrations.get(name) || null
  }

  /**
   * Test integration connection
   */
  async testIntegration(name: string): Promise<boolean> {
    const integration = this.integrations.get(name)
    if (!integration) {
      throw new Error(`Integration '${name}' not found`)
    }

    try {
      switch (integration.type) {
        case 'slack':
          return await this.testSlackIntegration(integration as SlackIntegration)
        case 'teams':
          return await this.testTeamsIntegration(integration as TeamsIntegration)
        case 'email':
          return await this.testEmailIntegration(integration as EmailIntegration)
        case 'webhook':
          return await this.testWebhookIntegration(integration as WebhookIntegration)
        default:
          throw new Error(`Unsupported integration type: ${integration.type}`)
      }
    } catch (error) {
      console.error(`Integration test failed for ${name}:`, error)
      return false
    }
  }

  /**
   * Send notification to all applicable integrations
   */
  async sendNotification(event: NotificationEvent): Promise<void> {
    const applicableIntegrations = this.getApplicableIntegrations(event)

    for (const integration of applicableIntegrations) {
      await this.queueMessage(integration, event)
    }
  }

  /**
   * Send analysis complete notification
   */
  async notifyAnalysisComplete(analysis: PageAnalysisState): Promise<void> {
    const event: NotificationEvent = {
      type: 'analysis-complete',
      data: analysis,
      timestamp: Date.now(),
      url: analysis.url,
      riskScore: analysis.riskScore,
      severity: this.getRiskSeverity(analysis.riskScore || 0)
    }

    await this.sendNotification(event)
  }

  /**
   * Send high risk notification
   */
  async notifyHighRisk(analysis: PageAnalysisState): Promise<void> {
    const event: NotificationEvent = {
      type: 'high-risk-found',
      data: analysis,
      timestamp: Date.now(),
      url: analysis.url,
      riskScore: analysis.riskScore,
      severity: 'high'
    }

    await this.sendNotification(event)
  }

  /**
   * Send policy violation notification
   */
  async notifyPolicyViolation(violation: any): Promise<void> {
    const event: NotificationEvent = {
      type: 'policy-violation',
      data: violation,
      timestamp: Date.now(),
      url: violation.url,
      severity: 'critical'
    }

    await this.sendNotification(event)
  }

  /**
   * Send bulk analysis complete notification
   */
  async notifyBulkAnalysisComplete(job: BulkAnalysisJob): Promise<void> {
    const event: NotificationEvent = {
      type: 'bulk-analysis-complete',
      data: job,
      timestamp: Date.now(),
      severity: 'info'
    }

    await this.sendNotification(event)
  }

  /**
   * Get applicable integrations for an event
   */
  private getApplicableIntegrations(event: NotificationEvent): IntegrationConfig[] {
    return Array.from(this.integrations.values()).filter(integration => {
      return integration.isActive && integration.triggerEvents.includes(event.type)
    })
  }

  /**
   * Queue message for delivery
   */
  private async queueMessage(integration: IntegrationConfig, event: NotificationEvent): Promise<void> {
    const message: IntegrationMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      integration,
      payload: await this.buildPayload(integration, event),
      attempts: 0,
      maxAttempts: 3,
      status: 'pending',
      createdAt: Date.now()
    }

    this.messageQueue.push(message)
    await this.saveMessageQueue()
  }

  /**
   * Build payload for integration
   */
  private async buildPayload(integration: IntegrationConfig, event: NotificationEvent): Promise<any> {
    switch (integration.type) {
      case 'slack':
        return await this.buildSlackPayload(integration as SlackIntegration, event)
      case 'teams':
        return await this.buildTeamsPayload(integration as TeamsIntegration, event)
      case 'email':
        return await this.buildEmailPayload(integration as EmailIntegration, event)
      case 'webhook':
        return await this.buildWebhookPayload(integration as WebhookIntegration, event)
      default:
        return event.data
    }
  }

  /**
   * Build Slack payload
   */
  private async buildSlackPayload(integration: SlackIntegration, event: NotificationEvent): Promise<any> {
    const { settings } = integration
    
    let color = '#36a64f' // green
    let title = 'Fine Print AI Notification'
    let text = ''
    let fields: any[] = []

    switch (event.type) {
      case 'analysis-complete':
        title = 'Document Analysis Complete'
        text = `Analysis completed for ${event.url}`
        color = event.riskScore && event.riskScore >= 70 ? '#ff0000' : 
               event.riskScore && event.riskScore >= 40 ? '#ffaa00' : '#36a64f'
        fields = [
          { title: 'URL', value: event.url, short: false },
          { title: 'Risk Score', value: `${event.riskScore}/100`, short: true },
          { title: 'Findings', value: event.data.findings?.length || 0, short: true }
        ]
        break

      case 'high-risk-found':
        if (!settings.notifyOnHighRisk) return null
        title = '🚨 High Risk Document Detected'
        text = `High risk legal document found: ${event.url}`
        color = '#ff0000'
        fields = [
          { title: 'URL', value: event.url, short: false },
          { title: 'Risk Score', value: `${event.riskScore}/100`, short: true },
          { title: 'Critical Findings', value: event.data.findings?.filter((f: ExtensionFinding) => f.severity === 'high' || f.severity === 'critical').length || 0, short: true }
        ]
        break

      case 'policy-violation':
        title = '⚠️ Policy Violation Detected'
        text = `Policy violation: ${event.data.policyName}`
        color = '#ff6600'
        fields = [
          { title: 'Policy', value: event.data.policyName, short: true },
          { title: 'Violation', value: event.data.violation, short: true },
          { title: 'URL', value: event.url, short: false }
        ]
        break

      case 'bulk-analysis-complete':
        title = 'Bulk Analysis Complete'
        text = `Analyzed ${event.data.documents?.length || 0} documents`
        fields = [
          { title: 'Documents', value: event.data.documents?.length || 0, short: true },
          { title: 'High Risk', value: event.data.results?.filter((r: any) => (r.analysis.riskScore || 0) >= 70).length || 0, short: true },
          { title: 'Status', value: event.data.status, short: true }
        ]
        break
    }

    const payload = {
      channel: settings.channel,
      username: 'Fine Print AI',
      icon_emoji: ':shield:',
      attachments: [{
        color,
        title,
        text,
        fields,
        footer: 'Fine Print AI Extension',
        ts: Math.floor(event.timestamp / 1000)
      }]
    }

    // Add new findings if enabled
    if (settings.notifyOnNewFindings && event.data.findings) {
      const criticalFindings = event.data.findings.filter((f: ExtensionFinding) => 
        f.severity === 'high' || f.severity === 'critical'
      )

      if (criticalFindings.length > 0) {
        payload.attachments.push({
          color: '#ff0000',
          title: 'Critical Findings',
          fields: criticalFindings.slice(0, 3).map((finding: ExtensionFinding) => ({
            title: finding.title,
            value: finding.description,
            short: false
          }))
        })
      }
    }

    return payload
  }

  /**
   * Build Teams payload
   */
  private async buildTeamsPayload(integration: TeamsIntegration, event: NotificationEvent): Promise<any> {
    const { settings } = integration
    
    let themeColor = '00FF00' // green
    let title = 'Fine Print AI Notification'
    let summary = ''
    let sections: any[] = []

    switch (event.type) {
      case 'analysis-complete':
        title = 'Document Analysis Complete'
        summary = `Analysis completed for ${event.url}`
        themeColor = event.riskScore && event.riskScore >= 70 ? 'FF0000' : 
                   event.riskScore && event.riskScore >= 40 ? 'FFAA00' : '00FF00'
        sections = [{
          activityTitle: 'Analysis Results',
          facts: [
            { name: 'URL', value: event.url },
            { name: 'Risk Score', value: `${event.riskScore}/100` },
            { name: 'Findings', value: event.data.findings?.length || 0 }
          ]
        }]
        break

      case 'high-risk-found':
        if (!settings.notifyOnHighRisk) return null
        title = '🚨 High Risk Document Detected'
        summary = `High risk legal document found`
        themeColor = 'FF0000'
        sections = [{
          activityTitle: 'High Risk Alert',
          facts: [
            { name: 'URL', value: event.url },
            { name: 'Risk Score', value: `${event.riskScore}/100` },
            { name: 'Critical Findings', value: event.data.findings?.filter((f: ExtensionFinding) => f.severity === 'high' || f.severity === 'critical').length || 0 }
          ]
        }]
        break

      case 'bulk-analysis-complete':
        title = 'Bulk Analysis Complete'
        summary = `Analyzed ${event.data.documents?.length || 0} documents`
        sections = [{
          activityTitle: 'Bulk Analysis Results',
          facts: [
            { name: 'Documents Analyzed', value: event.data.documents?.length || 0 },
            { name: 'High Risk Documents', value: event.data.results?.filter((r: any) => (r.analysis.riskScore || 0) >= 70).length || 0 },
            { name: 'Status', value: event.data.status }
          ]
        }]
        break
    }

    const payload: any = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary,
      themeColor,
      sections
    }

    // Add summary if enabled
    if (settings.includeSummary && event.data.findings) {
      const highRiskFindings = event.data.findings.filter((f: ExtensionFinding) => 
        f.severity === 'high' || f.severity === 'critical'
      )

      if (highRiskFindings.length > 0) {
        payload.sections.push({
          activityTitle: 'Critical Issues Found',
          activitySubtitle: `${highRiskFindings.length} critical issues require attention`,
          facts: highRiskFindings.slice(0, 3).map((finding: ExtensionFinding) => ({
            name: finding.title,
            value: finding.description
          }))
        })
      }
    }

    return payload
  }

  /**
   * Build email payload
   */
  private async buildEmailPayload(integration: EmailIntegration, event: NotificationEvent): Promise<any> {
    const { settings } = integration
    
    let subject = settings.subject || 'Fine Print AI Notification'
    let htmlContent = ''
    let textContent = ''

    switch (event.type) {
      case 'analysis-complete':
        subject = `Document Analysis Complete - ${new URL(event.url!).hostname}`
        htmlContent = await this.generateAnalysisEmailHTML(event.data)
        textContent = this.generateAnalysisEmailText(event.data)
        break

      case 'high-risk-found':
        subject = `🚨 High Risk Document Alert - ${new URL(event.url!).hostname}`
        htmlContent = await this.generateHighRiskEmailHTML(event.data)
        textContent = this.generateHighRiskEmailText(event.data)
        break

      case 'policy-violation':
        subject = `Policy Violation Alert - ${event.data.policyName}`
        htmlContent = await this.generatePolicyViolationEmailHTML(event.data)
        textContent = this.generatePolicyViolationEmailText(event.data)
        break

      case 'bulk-analysis-complete':
        subject = `Bulk Analysis Complete - ${event.data.documents?.length || 0} Documents`
        htmlContent = await this.generateBulkAnalysisEmailHTML(event.data)
        textContent = this.generateBulkAnalysisEmailText(event.data)
        break
    }

    const payload: any = {
      to: settings.recipients,
      subject,
      html: htmlContent,
      text: textContent
    }

    // Add PDF attachment if enabled
    if (settings.attachPDF && event.type === 'analysis-complete') {
      try {
        const exportJob = await exportManager.exportAnalysis(event.data.analysisId, { 
          format: 'pdf',
          includeFindings: true,
          includeRecommendations: true,
          includeMetadata: true
        })

        // Wait for export to complete (simplified)
        setTimeout(async () => {
          const pdfBlob = await exportManager.downloadExport(exportJob.id)
          payload.attachments = [{
            filename: `analysis-${new Date().toISOString().split('T')[0]}.pdf`,
            content: await this.blobToBase64(pdfBlob),
            contentType: 'application/pdf'
          }]
        }, 3000)
      } catch (error) {
        console.warn('Failed to attach PDF:', error)
      }
    }

    return payload
  }

  /**
   * Build webhook payload
   */
  private async buildWebhookPayload(integration: WebhookIntegration, event: NotificationEvent): Promise<any> {
    return {
      timestamp: event.timestamp,
      event: event.type,
      data: event.data,
      metadata: {
        url: event.url,
        riskScore: event.riskScore,
        severity: event.severity,
        source: 'fine-print-ai-extension'
      }
    }
  }

  /**
   * Process message queue
   */
  private async processMessageQueue(): Promise<void> {
    if (this.processingQueue || this.messageQueue.length === 0) return

    this.processingQueue = true

    try {
      const pendingMessages = this.messageQueue.filter(msg => 
        msg.status === 'pending' || (msg.status === 'retrying' && msg.attempts < msg.maxAttempts)
      )

      for (const message of pendingMessages) {
        await this.deliverMessage(message)
      }

      // Clean up old completed/failed messages
      this.messageQueue = this.messageQueue.filter(msg => {
        const isOld = Date.now() - msg.createdAt > (24 * 60 * 60 * 1000) // 24 hours
        return !isOld || msg.status === 'pending' || msg.status === 'retrying'
      })

      await this.saveMessageQueue()
    } finally {
      this.processingQueue = false
    }
  }

  /**
   * Deliver individual message
   */
  private async deliverMessage(message: IntegrationMessage): Promise<void> {
    message.attempts++
    
    try {
      switch (message.integration.type) {
        case 'slack':
          await this.deliverSlackMessage(message.integration as SlackIntegration, message.payload)
          break
        case 'teams':
          await this.deliverTeamsMessage(message.integration as TeamsIntegration, message.payload)
          break
        case 'email':
          await this.deliverEmailMessage(message.integration as EmailIntegration, message.payload)
          break
        case 'webhook':
          await this.deliverWebhookMessage(message.integration as WebhookIntegration, message.payload)
          break
        default:
          throw new Error(`Unsupported integration type: ${message.integration.type}`)
      }

      message.status = 'sent'
      message.sentAt = Date.now()
    } catch (error) {
      console.error(`Failed to deliver message to ${message.integration.name}:`, error)
      
      if (message.attempts >= message.maxAttempts) {
        message.status = 'failed'
        message.error = error instanceof Error ? error.message : 'Delivery failed'
      } else {
        message.status = 'retrying'
      }
    }
  }

  /**
   * Deliver Slack message
   */
  private async deliverSlackMessage(integration: SlackIntegration, payload: any): Promise<void> {
    if (!payload) return // Skip if payload was filtered out
    
    const response = await fetch(integration.settings.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
    }
  }

  /**
   * Deliver Teams message
   */
  private async deliverTeamsMessage(integration: TeamsIntegration, payload: any): Promise<void> {
    if (!payload) return // Skip if payload was filtered out
    
    const response = await fetch(integration.settings.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Teams API error: ${response.status} ${response.statusText}`)
    }
  }

  /**
   * Deliver email message
   */
  private async deliverEmailMessage(integration: EmailIntegration, payload: any): Promise<void> {
    // This would integrate with email service (SendGrid, Mailgun, etc.)
    const apiClient = getApiClient()
    await apiClient.sendEmail(payload)
  }

  /**
   * Deliver webhook message
   */
  private async deliverWebhookMessage(integration: WebhookIntegration, payload: any): Promise<void> {
    const { settings } = integration
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...settings.headers
    }

    // Add authentication if configured
    if (settings.authentication) {
      switch (settings.authentication.type) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${settings.authentication.credentials.token}`
          break
        case 'basic':
          const basicAuth = btoa(`${settings.authentication.credentials.username}:${settings.authentication.credentials.password}`)
          headers['Authorization'] = `Basic ${basicAuth}`
          break
        case 'api-key':
          headers[settings.authentication.credentials.headerName] = settings.authentication.credentials.apiKey
          break
      }
    }

    const response = await fetch(settings.url, {
      method: settings.method,
      headers,
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Webhook error: ${response.status} ${response.statusText}`)
    }
  }

  /**
   * Start queue processor
   */
  private startQueueProcessor(): void {
    setInterval(() => {
      this.processMessageQueue()
    }, this.retryInterval)

    // Process immediately
    this.processMessageQueue()
  }

  /**
   * Validation methods
   */
  private async validateIntegration(integration: IntegrationConfig): Promise<void> {
    switch (integration.type) {
      case 'slack':
        this.validateSlackIntegration(integration as SlackIntegration)
        break
      case 'teams':
        this.validateTeamsIntegration(integration as TeamsIntegration)
        break
      case 'email':
        this.validateEmailIntegration(integration as EmailIntegration)
        break
      case 'webhook':
        this.validateWebhookIntegration(integration as WebhookIntegration)
        break
    }
  }

  private validateSlackIntegration(integration: SlackIntegration): void {
    if (!integration.settings.webhookUrl) {
      throw new Error('Slack webhook URL is required')
    }
    if (!integration.settings.channel) {
      throw new Error('Slack channel is required')
    }
  }

  private validateTeamsIntegration(integration: TeamsIntegration): void {
    if (!integration.settings.webhookUrl) {
      throw new Error('Teams webhook URL is required')
    }
  }

  private validateEmailIntegration(integration: EmailIntegration): void {
    if (!integration.settings.recipients || integration.settings.recipients.length === 0) {
      throw new Error('Email recipients are required')
    }
    
    for (const recipient of integration.settings.recipients) {
      if (!this.isValidEmail(recipient)) {
        throw new Error(`Invalid email address: ${recipient}`)
      }
    }
  }

  private validateWebhookIntegration(integration: WebhookIntegration): void {
    if (!integration.settings.url) {
      throw new Error('Webhook URL is required')
    }
    
    try {
      new URL(integration.settings.url)
    } catch {
      throw new Error('Invalid webhook URL')
    }
  }

  /**
   * Test methods
   */
  private async testSlackIntegration(integration: SlackIntegration): Promise<boolean> {
    const testPayload = {
      channel: integration.settings.channel,
      username: 'Fine Print AI',
      text: 'Test message from Fine Print AI Extension',
      icon_emoji: ':shield:'
    }

    const response = await fetch(integration.settings.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    })

    return response.ok
  }

  private async testTeamsIntegration(integration: TeamsIntegration): Promise<boolean> {
    const testPayload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: 'Test message from Fine Print AI Extension',
      themeColor: '0078D4',
      sections: [{
        activityTitle: 'Integration Test',
        text: 'This is a test message to verify your Teams integration is working correctly.'
      }]
    }

    const response = await fetch(integration.settings.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    })

    return response.ok
  }

  private async testEmailIntegration(integration: EmailIntegration): Promise<boolean> {
    const testPayload = {
      to: integration.settings.recipients,
      subject: 'Test Email from Fine Print AI Extension',
      text: 'This is a test email to verify your email integration is working correctly.',
      html: '<p>This is a test email to verify your email integration is working correctly.</p>'
    }

    try {
      const apiClient = getApiClient()
      await apiClient.sendEmail(testPayload)
      return true
    } catch {
      return false
    }
  }

  private async testWebhookIntegration(integration: WebhookIntegration): Promise<boolean> {
    const testPayload = {
      test: true,
      message: 'Test webhook from Fine Print AI Extension',
      timestamp: Date.now()
    }

    try {
      const response = await fetch(integration.settings.url, {
        method: integration.settings.method,
        headers: {
          'Content-Type': 'application/json',
          ...integration.settings.headers
        },
        body: JSON.stringify(testPayload)
      })

      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Utility methods
   */
  private getRiskSeverity(riskScore: number): string {
    if (riskScore >= 70) return 'high'
    if (riskScore >= 40) return 'medium'
    return 'low'
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  /**
   * Email content generators
   */
  private async generateAnalysisEmailHTML(analysis: PageAnalysisState): Promise<string> {
    const domain = new URL(analysis.url).hostname
    const riskLevel = this.getRiskSeverity(analysis.riskScore || 0)
    const riskColor = riskLevel === 'high' ? '#dc3545' : riskLevel === 'medium' ? '#ffc107' : '#28a745'

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Document Analysis Complete</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h1 style="color: #2c5aa0; margin: 0;">Document Analysis Complete</h1>
        <p style="margin: 10px 0 0 0; color: #6c757d;">Analysis completed for ${domain}</p>
    </div>
    
    <div style="background: white; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h2 style="margin-top: 0;">Analysis Summary</h2>
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;"><strong>URL:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">${analysis.url}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;"><strong>Risk Score:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                    <span style="color: ${riskColor}; font-weight: bold;">${analysis.riskScore || 'N/A'}/100</span>
                </td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;"><strong>Document Type:</strong></td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">${analysis.documentType || 'Unknown'}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0;"><strong>Findings:</strong></td>
                <td style="padding: 8px 0;">${analysis.findings?.length || 0}</td>
            </tr>
        </table>
    </div>
    
    ${analysis.findings && analysis.findings.length > 0 ? `
    <div style="background: white; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px;">
        <h2 style="margin-top: 0;">Key Findings</h2>
        ${analysis.findings.slice(0, 5).map(finding => `
            <div style="border-left: 4px solid ${finding.severity === 'high' || finding.severity === 'critical' ? '#dc3545' : finding.severity === 'medium' ? '#ffc107' : '#28a745'}; padding-left: 15px; margin-bottom: 15px;">
                <h3 style="margin: 0 0 5px 0; color: #333;">${finding.title}</h3>
                <p style="margin: 0 0 5px 0; color: #6c757d;">${finding.description}</p>
                <small style="color: #6c757d; text-transform: uppercase; font-weight: bold;">${finding.severity}</small>
            </div>
        `).join('')}
    </div>
    ` : ''}
    
    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 14px;">
        Generated by Fine Print AI Extension
    </div>
</body>
</html>
    `
  }

  private generateAnalysisEmailText(analysis: PageAnalysisState): string {
    const domain = new URL(analysis.url).hostname
    
    let text = `Document Analysis Complete\n\n`
    text += `Analysis completed for ${domain}\n\n`
    text += `URL: ${analysis.url}\n`
    text += `Risk Score: ${analysis.riskScore || 'N/A'}/100\n`
    text += `Document Type: ${analysis.documentType || 'Unknown'}\n`
    text += `Findings: ${analysis.findings?.length || 0}\n\n`
    
    if (analysis.findings && analysis.findings.length > 0) {
      text += `Key Findings:\n`
      analysis.findings.slice(0, 5).forEach((finding, index) => {
        text += `${index + 1}. ${finding.title} (${finding.severity.toUpperCase()})\n`
        text += `   ${finding.description}\n\n`
      })
    }
    
    text += `Generated by Fine Print AI Extension`
    
    return text
  }

  private async generateHighRiskEmailHTML(analysis: PageAnalysisState): Promise<string> {
    // Similar to generateAnalysisEmailHTML but with high-risk styling
    return this.generateAnalysisEmailHTML(analysis)
  }

  private generateHighRiskEmailText(analysis: PageAnalysisState): string {
    return `🚨 HIGH RISK DOCUMENT ALERT\n\n${this.generateAnalysisEmailText(analysis)}`
  }

  private async generatePolicyViolationEmailHTML(violation: any): Promise<string> {
    return `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px;">
        <h1 style="color: #856404; margin: 0;">⚠️ Policy Violation Alert</h1>
        <p><strong>Policy:</strong> ${violation.policyName}</p>
        <p><strong>Violation:</strong> ${violation.violation}</p>
        <p><strong>URL:</strong> ${violation.url}</p>
        <p><strong>Time:</strong> ${new Date(violation.timestamp).toLocaleString()}</p>
    </div>
</body>
</html>
    `
  }

  private generatePolicyViolationEmailText(violation: any): string {
    return `⚠️ POLICY VIOLATION ALERT\n\nPolicy: ${violation.policyName}\nViolation: ${violation.violation}\nURL: ${violation.url}\nTime: ${new Date(violation.timestamp).toLocaleString()}`
  }

  private async generateBulkAnalysisEmailHTML(job: BulkAnalysisJob): Promise<string> {
    const highRiskCount = job.results.filter(r => (r.analysis.riskScore || 0) >= 70).length
    
    return `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h1 style="color: #2c5aa0; margin: 0;">Bulk Analysis Complete</h1>
        <p>Analysis completed for ${job.documents.length} documents</p>
    </div>
    
    <div style="background: white; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px;">
        <h2>Results Summary</h2>
        <p><strong>Documents Analyzed:</strong> ${job.documents.length}</p>
        <p><strong>High Risk Documents:</strong> ${highRiskCount}</p>
        <p><strong>Status:</strong> ${job.status}</p>
        <p><strong>Completed:</strong> ${job.completedAt ? new Date(job.completedAt).toLocaleString() : 'In progress'}</p>
    </div>
</body>
</html>
    `
  }

  private generateBulkAnalysisEmailText(job: BulkAnalysisJob): string {
    const highRiskCount = job.results.filter(r => (r.analysis.riskScore || 0) >= 70).length
    
    return `Bulk Analysis Complete\n\nDocuments Analyzed: ${job.documents.length}\nHigh Risk Documents: ${highRiskCount}\nStatus: ${job.status}\nCompleted: ${job.completedAt ? new Date(job.completedAt).toLocaleString() : 'In progress'}`
  }

  /**
   * Storage methods
   */
  private async loadIntegrations(): Promise<void> {
    try {
      const allData = await this.storage.getAll()
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('integration-')) {
          this.integrations.set((value as IntegrationConfig).name, value as IntegrationConfig)
        }
      }
    } catch (error) {
      console.error('Failed to load integrations:', error)
    }
  }

  private async saveIntegration(integration: IntegrationConfig): Promise<void> {
    await this.storage.set(`integration-${integration.name}`, integration)
  }

  private async loadMessageQueue(): Promise<void> {
    try {
      const queue = await this.storage.get('integration-message-queue')
      this.messageQueue = queue || []
    } catch {
      this.messageQueue = []
    }
  }

  private async saveMessageQueue(): Promise<void> {
    await this.storage.set('integration-message-queue', this.messageQueue)
  }
}

// Export singleton instance
export const integrationManager = new IntegrationManager()