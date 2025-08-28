/**
 * Real-Time Compliance Monitoring Service
 * 
 * Provides continuous monitoring, scoring, and alerting for SOC2 compliance.
 * Integrates with all compliance services to provide real-time insights.
 */

import { Pool } from 'pg'
import { EventEmitter } from 'events'

interface ComplianceAlert {
  id: string
  alert_type: 'score_decline' | 'control_failure' | 'evidence_overdue' | 'assessment_due' | 'critical_gap' | 'security_incident'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  company_domain: string
  control_id?: string
  regulation_name?: string
  threshold_breached?: number
  current_value?: number
  recommendations: string[]
  triggered_at: string
  acknowledged: boolean
  acknowledged_by?: string
  acknowledged_at?: string
  resolved: boolean
  resolved_at?: string
  metadata: Record<string, any>
}

interface MonitoringRule {
  id: string
  rule_name: string
  rule_type: 'threshold' | 'trend' | 'deadline' | 'anomaly' | 'pattern'
  enabled: boolean
  conditions: {
    metric: string
    operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq' | 'contains' | 'trend_down' | 'trend_up'
    threshold: number | string
    timeframe?: string // e.g., '24h', '7d', '30d'
  }[]
  alert_config: {
    severity: 'low' | 'medium' | 'high' | 'critical'
    cooldown_period: string // Prevent alert spam
    escalation: {
      after_minutes: number
      to_severity: 'medium' | 'high' | 'critical'
    }[]
  }
  notification_channels: string[] // email, slack, webhook, etc.
  created_at: string
  updated_at: string
}

interface ComplianceMetrics {
  overall_score: number
  score_trend_24h: number
  score_trend_7d: number
  score_trend_30d: number
  control_scores: Record<string, number>
  failed_controls: string[]
  overdue_evidence: number
  upcoming_deadlines: number
  critical_alerts: number
  high_alerts: number
  medium_alerts: number
  low_alerts: number
  last_updated: string
}

interface MonitoringWebhook {
  id: string
  name: string
  url: string
  secret: string
  enabled: boolean
  events: string[] // Which alert types to send
  headers?: Record<string, string>
  retry_count: number
  last_success: string | null
  last_failure: string | null
}

export class RealTimeMonitoringService extends EventEmitter {
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map()
  private complianceTrends: Map<string, number[]> = new Map()
  private alertCooldowns: Map<string, number> = new Map()

  constructor(private db: Pool) {
    super()
    this.initializeMonitoring()
  }

  /**
   * Initialize monitoring tables and default rules
   */
  async initializeMonitoring(): Promise<void> {
    // Create monitoring tables
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS compliance_alerts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        alert_type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        title VARCHAR(300) NOT NULL,
        description TEXT NOT NULL,
        company_domain VARCHAR(255) NOT NULL,
        control_id VARCHAR(50),
        regulation_name VARCHAR(200),
        threshold_breached DECIMAL(10,2),
        current_value DECIMAL(10,2),
        recommendations TEXT[],
        triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        acknowledged BOOLEAN DEFAULT false,
        acknowledged_by VARCHAR(255),
        acknowledged_at TIMESTAMP WITH TIME ZONE,
        resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMP WITH TIME ZONE,
        metadata JSONB DEFAULT '{}'
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS monitoring_rules (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        rule_name VARCHAR(200) NOT NULL,
        rule_type VARCHAR(30) NOT NULL CHECK (rule_type IN ('threshold', 'trend', 'deadline', 'anomaly', 'pattern')),
        enabled BOOLEAN DEFAULT true,
        conditions JSONB NOT NULL DEFAULT '[]',
        alert_config JSONB NOT NULL DEFAULT '{}',
        notification_channels TEXT[] DEFAULT ARRAY['email'],
        company_domain VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS compliance_metrics_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_domain VARCHAR(255) NOT NULL,
        overall_score INTEGER NOT NULL,
        control_scores JSONB NOT NULL DEFAULT '{}',
        failed_controls TEXT[],
        overdue_evidence INTEGER DEFAULT 0,
        upcoming_deadlines INTEGER DEFAULT 0,
        alert_counts JSONB NOT NULL DEFAULT '{"critical": 0, "high": 0, "medium": 0, "low": 0}',
        recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS monitoring_webhooks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(200) NOT NULL,
        url TEXT NOT NULL,
        secret VARCHAR(255) NOT NULL,
        enabled BOOLEAN DEFAULT true,
        events TEXT[] NOT NULL,
        headers JSONB DEFAULT '{}',
        retry_count INTEGER DEFAULT 0,
        last_success TIMESTAMP WITH TIME ZONE,
        last_failure TIMESTAMP WITH TIME ZONE,
        company_domain VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create indexes for performance
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_compliance_alerts_company ON compliance_alerts(company_domain, triggered_at DESC);
      CREATE INDEX IF NOT EXISTS idx_compliance_alerts_severity ON compliance_alerts(severity, triggered_at DESC);
      CREATE INDEX IF NOT EXISTS idx_compliance_alerts_unresolved ON compliance_alerts(resolved, triggered_at DESC) WHERE resolved = false;
      CREATE INDEX IF NOT EXISTS idx_monitoring_rules_enabled ON monitoring_rules(enabled, company_domain);
      CREATE INDEX IF NOT EXISTS idx_metrics_history_company ON compliance_metrics_history(company_domain, recorded_at DESC);
    `)

    // Insert default monitoring rules
    await this.createDefaultMonitoringRules()

    // Start monitoring loops
    this.startContinuousMonitoring()
  }

  /**
   * Start continuous monitoring for all companies
   */
  private startContinuousMonitoring(): void {
    // Monitor compliance scores every 5 minutes
    const scoreMonitoringInterval = setInterval(async () => {
      await this.monitorComplianceScores()
    }, 5 * 60 * 1000)

    // Monitor deadlines and evidence every hour
    const deadlineMonitoringInterval = setInterval(async () => {
      await this.monitorDeadlinesAndEvidence()
    }, 60 * 60 * 1000)

    // Monitor trends every 30 minutes
    const trendMonitoringInterval = setInterval(async () => {
      await this.monitorComplianceTrends()
    }, 30 * 60 * 1000)

    this.monitoringIntervals.set('scores', scoreMonitoringInterval)
    this.monitoringIntervals.set('deadlines', deadlineMonitoringInterval)
    this.monitoringIntervals.set('trends', trendMonitoringInterval)

    console.log('Real-time compliance monitoring started')
  }

  /**
   * Monitor compliance scores and trigger alerts
   */
  private async monitorComplianceScores(): Promise<void> {
    try {
      // Get all companies with active compliance monitoring
      const companiesResult = await this.db.query(`
        SELECT DISTINCT company_domain 
        FROM compliance_status 
        WHERE monitoring_active = true
      `)

      for (const company of companiesResult.rows) {
        const companyDomain = company.company_domain
        
        // Get current compliance metrics
        const metrics = await this.calculateComplianceMetrics(companyDomain)
        
        // Store metrics in history
        await this.storeMetricsHistory(companyDomain, metrics)
        
        // Check monitoring rules
        await this.evaluateMonitoringRules(companyDomain, metrics)
        
        // Check for critical control failures
        await this.checkCriticalControlFailures(companyDomain, metrics)
      }
    } catch (error) {
      console.error('Error monitoring compliance scores:', error)
    }
  }

  /**
   * Monitor upcoming deadlines and overdue evidence
   */
  private async monitorDeadlinesAndEvidence(): Promise<void> {
    try {
      // Check for upcoming assessment deadlines (within 7 days)
      const upcomingAssessments = await this.db.query(`
        SELECT company_domain, regulation_name, next_assessment_due
        FROM compliance_status
        WHERE next_assessment_due <= CURRENT_DATE + INTERVAL '7 days'
        AND next_assessment_due >= CURRENT_DATE
      `)

      for (const assessment of upcomingAssessments.rows) {
        await this.createAlert({
          alert_type: 'assessment_due',
          severity: 'medium',
          title: 'SOC2 Assessment Due Soon',
          description: `SOC2 assessment for ${assessment.regulation_name} is due on ${assessment.next_assessment_due}`,
          company_domain: assessment.company_domain,
          regulation_name: assessment.regulation_name,
          recommendations: [
            'Schedule assessment with compliance team',
            'Prepare required documentation',
            'Ensure all controls are tested'
          ]
        })
      }

      // Check for overdue evidence collection
      const overdueEvidence = await this.db.query(`
        SELECT company_domain, control_id, COUNT(*) as overdue_count
        FROM soc2_evidence e
        JOIN soc2_controls c ON e.control_id = c.control_id
        WHERE e.retention_period > 0 
        AND e.collected_at + (e.retention_period || ' days')::INTERVAL < CURRENT_TIMESTAMP
        GROUP BY company_domain, control_id
        HAVING COUNT(*) > 0
      `)

      for (const evidence of overdueEvidence.rows) {
        await this.createAlert({
          alert_type: 'evidence_overdue',
          severity: 'high',
          title: 'Evidence Collection Overdue',
          description: `${evidence.overdue_count} evidence items are overdue for control ${evidence.control_id}`,
          company_domain: evidence.company_domain,
          control_id: evidence.control_id,
          current_value: parseInt(evidence.overdue_count),
          recommendations: [
            'Update evidence documentation',
            'Schedule evidence collection',
            'Review retention policies'
          ]
        })
      }
    } catch (error) {
      console.error('Error monitoring deadlines and evidence:', error)
    }
  }

  /**
   * Monitor compliance trends and detect anomalies
   */
  private async monitorComplianceTrends(): Promise<void> {
    try {
      const companiesResult = await this.db.query(`
        SELECT DISTINCT company_domain 
        FROM compliance_metrics_history
      `)

      for (const company of companiesResult.rows) {
        const companyDomain = company.company_domain
        
        // Get recent trend data
        const trendResult = await this.db.query(`
          SELECT overall_score, recorded_at
          FROM compliance_metrics_history
          WHERE company_domain = $1
          ORDER BY recorded_at DESC
          LIMIT 30
        `, [companyDomain])

        if (trendResult.rows.length >= 10) {
          const scores = trendResult.rows.map(row => row.overall_score)
          const trend = this.calculateTrend(scores)
          
          // Store trend data
          this.complianceTrends.set(companyDomain, scores)
          
          // Check for significant decline (>10 points in 24h)
          if (trend.decline_24h > 10) {
            await this.createAlert({
              alert_type: 'score_decline',
              severity: 'high',
              title: 'Significant Compliance Score Decline',
              description: `Compliance score has declined by ${trend.decline_24h} points in the last 24 hours`,
              company_domain: companyDomain,
              threshold_breached: 10,
              current_value: trend.decline_24h,
              recommendations: [
                'Review recent compliance changes',
                'Investigate failing controls',
                'Schedule immediate remediation'
              ]
            })
          }
        }
      }
    } catch (error) {
      console.error('Error monitoring compliance trends:', error)
    }
  }

  /**
   * Calculate comprehensive compliance metrics
   */
  private async calculateComplianceMetrics(companyDomain: string): Promise<ComplianceMetrics> {
    // Get current compliance scores
    const scoresResult = await this.db.query(`
      SELECT 
        AVG(compliance_score) as overall_score,
        control_id,
        compliance_score,
        compliance_level
      FROM compliance_status
      WHERE company_domain = $1
      GROUP BY control_id, compliance_score, compliance_level
    `, [companyDomain])

    const overallScore = Math.round(parseFloat(scoresResult.rows[0]?.overall_score || '0'))
    const controlScores: Record<string, number> = {}
    const failedControls: string[] = []

    scoresResult.rows.forEach(row => {
      controlScores[row.control_id] = row.compliance_score
      if (row.compliance_level === 'non_compliant') {
        failedControls.push(row.control_id)
      }
    })

    // Get historical scores for trends
    const trendResult = await this.db.query(`
      SELECT overall_score, recorded_at
      FROM compliance_metrics_history
      WHERE company_domain = $1
      ORDER BY recorded_at DESC
      LIMIT 30
    `, [companyDomain])

    const scores = trendResult.rows.map(row => row.overall_score)
    const trends = this.calculateTrend(scores)

    // Count overdue evidence
    const overdueEvidenceResult = await this.db.query(`
      SELECT COUNT(*) as count
      FROM soc2_evidence
      WHERE retention_period > 0 
      AND collected_at + (retention_period || ' days')::INTERVAL < CURRENT_TIMESTAMP
    `)

    // Count upcoming deadlines
    const upcomingDeadlinesResult = await this.db.query(`
      SELECT COUNT(*) as count
      FROM compliance_actions
      WHERE company_domain = $1 
      AND deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
      AND status IN ('pending', 'in_progress')
    `, [companyDomain])

    // Count alerts by severity
    const alertsResult = await this.db.query(`
      SELECT severity, COUNT(*) as count
      FROM compliance_alerts
      WHERE company_domain = $1 AND resolved = false
      GROUP BY severity
    `, [companyDomain])

    const alertCounts = { critical: 0, high: 0, medium: 0, low: 0 }
    alertsResult.rows.forEach(row => {
      alertCounts[row.severity as keyof typeof alertCounts] = parseInt(row.count)
    })

    return {
      overall_score: overallScore,
      score_trend_24h: trends.trend_24h,
      score_trend_7d: trends.trend_7d,
      score_trend_30d: trends.trend_30d,
      control_scores: controlScores,
      failed_controls: failedControls,
      overdue_evidence: parseInt(overdueEvidenceResult.rows[0].count),
      upcoming_deadlines: parseInt(upcomingDeadlinesResult.rows[0].count),
      critical_alerts: alertCounts.critical,
      high_alerts: alertCounts.high,
      medium_alerts: alertCounts.medium,
      low_alerts: alertCounts.low,
      last_updated: new Date().toISOString()
    }
  }

  /**
   * Store metrics history for trend analysis
   */
  private async storeMetricsHistory(companyDomain: string, metrics: ComplianceMetrics): Promise<void> {
    await this.db.query(`
      INSERT INTO compliance_metrics_history (
        company_domain, overall_score, control_scores, failed_controls,
        overdue_evidence, upcoming_deadlines, alert_counts
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      companyDomain,
      metrics.overall_score,
      JSON.stringify(metrics.control_scores),
      metrics.failed_controls,
      metrics.overdue_evidence,
      metrics.upcoming_deadlines,
      JSON.stringify({
        critical: metrics.critical_alerts,
        high: metrics.high_alerts,
        medium: metrics.medium_alerts,
        low: metrics.low_alerts
      })
    ])
  }

  /**
   * Create compliance alert
   */
  private async createAlert(alertData: Omit<ComplianceAlert, 'id' | 'triggered_at' | 'acknowledged' | 'resolved'>): Promise<ComplianceAlert> {
    // Check cooldown to prevent spam
    const cooldownKey = `${alertData.company_domain}:${alertData.alert_type}:${alertData.control_id || 'global'}`
    const now = Date.now()
    const lastAlert = this.alertCooldowns.get(cooldownKey)
    
    if (lastAlert && (now - lastAlert) < 30 * 60 * 1000) { // 30 minute cooldown
      console.log(`Alert cooldown active for ${cooldownKey}`)
      return {} as ComplianceAlert // Return empty for cooldown
    }

    const result = await this.db.query(`
      INSERT INTO compliance_alerts (
        alert_type, severity, title, description, company_domain,
        control_id, regulation_name, threshold_breached, current_value,
        recommendations, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      alertData.alert_type,
      alertData.severity,
      alertData.title,
      alertData.description,
      alertData.company_domain,
      alertData.control_id,
      alertData.regulation_name,
      alertData.threshold_breached,
      alertData.current_value,
      alertData.recommendations,
      JSON.stringify(alertData.metadata || {})
    ])

    const alert = result.rows[0]
    
    // Set cooldown
    this.alertCooldowns.set(cooldownKey, now)
    
    // Emit event for real-time notifications
    this.emit('alert_created', alert)
    
    // Send webhooks
    await this.sendWebhookNotifications(alert)
    
    console.log(`Created ${alert.severity} alert: ${alert.title} for ${alert.company_domain}`)
    
    return alert
  }

  /**
   * Calculate trends from score history
   */
  private calculateTrend(scores: number[]) {
    if (scores.length < 2) {
      return { trend_24h: 0, trend_7d: 0, trend_30d: 0, decline_24h: 0 }
    }

    const latest = scores[0]
    const previous24h = scores[1] || latest
    const previous7d = scores[Math.min(7, scores.length - 1)] || latest
    const previous30d = scores[Math.min(30, scores.length - 1)] || latest

    return {
      trend_24h: latest - previous24h,
      trend_7d: latest - previous7d,
      trend_30d: latest - previous30d,
      decline_24h: Math.max(0, previous24h - latest)
    }
  }

  /**
   * Evaluate monitoring rules against current metrics
   */
  private async evaluateMonitoringRules(companyDomain: string, metrics: ComplianceMetrics): Promise<void> {
    const rulesResult = await this.db.query(`
      SELECT * FROM monitoring_rules
      WHERE (company_domain = $1 OR company_domain IS NULL)
      AND enabled = true
    `, [companyDomain])

    for (const rule of rulesResult.rows) {
      const conditions = JSON.parse(rule.conditions)
      const alertConfig = JSON.parse(rule.alert_config)
      
      let conditionsMet = true
      
      for (const condition of conditions) {
        const value = this.getMetricValue(metrics, condition.metric)
        conditionsMet = conditionsMet && this.evaluateCondition(value, condition)
      }
      
      if (conditionsMet) {
        await this.createAlert({
          alert_type: 'critical_gap',
          severity: alertConfig.severity,
          title: `Monitoring Rule Triggered: ${rule.rule_name}`,
          description: `Rule "${rule.rule_name}" conditions have been met`,
          company_domain: companyDomain,
          recommendations: ['Review monitoring rule conditions', 'Take corrective action'],
          metadata: { rule_id: rule.id, rule_name: rule.rule_name }
        })
      }
    }
  }

  /**
   * Check for critical control failures
   */
  private async checkCriticalControlFailures(companyDomain: string, metrics: ComplianceMetrics): Promise<void> {
    for (const controlId of metrics.failed_controls) {
      await this.createAlert({
        alert_type: 'control_failure',
        severity: 'critical',
        title: 'Critical Control Failure',
        description: `SOC2 control ${controlId} has failed compliance requirements`,
        company_domain: companyDomain,
        control_id: controlId,
        recommendations: [
          'Immediately review control implementation',
          'Update control procedures',
          'Gather evidence of remediation'
        ]
      })
    }
  }

  /**
   * Send webhook notifications for alerts
   */
  private async sendWebhookNotifications(alert: ComplianceAlert): Promise<void> {
    try {
      const webhooksResult = await this.db.query(`
        SELECT * FROM monitoring_webhooks
        WHERE (company_domain = $1 OR company_domain IS NULL)
        AND enabled = true
        AND $2 = ANY(events)
      `, [alert.company_domain, alert.alert_type])

      for (const webhook of webhooksResult.rows) {
        try {
          const payload = {
            alert,
            timestamp: new Date().toISOString(),
            webhook_id: webhook.id
          }

          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Secret': webhook.secret,
              ...JSON.parse(webhook.headers || '{}')
            },
            body: JSON.stringify(payload)
          })

          if (response.ok) {
            await this.db.query(`
              UPDATE monitoring_webhooks 
              SET last_success = CURRENT_TIMESTAMP
              WHERE id = $1
            `, [webhook.id])
          } else {
            throw new Error(`HTTP ${response.status}`)
          }
        } catch (error) {
          console.error(`Webhook notification failed for ${webhook.url}:`, error)
          await this.db.query(`
            UPDATE monitoring_webhooks 
            SET last_failure = CURRENT_TIMESTAMP, retry_count = retry_count + 1
            WHERE id = $1
          `, [webhook.id])
        }
      }
    } catch (error) {
      console.error('Error sending webhook notifications:', error)
    }
  }

  /**
   * Create default monitoring rules
   */
  private async createDefaultMonitoringRules(): Promise<void> {
    const defaultRules = [
      {
        rule_name: 'Overall Score Below 70',
        rule_type: 'threshold',
        conditions: [
          { metric: 'overall_score', operator: 'lt', threshold: 70 }
        ],
        alert_config: {
          severity: 'high',
          cooldown_period: '1h',
          escalation: [{ after_minutes: 60, to_severity: 'critical' }]
        }
      },
      {
        rule_name: 'Score Declining Trend',
        rule_type: 'trend',
        conditions: [
          { metric: 'score_trend_7d', operator: 'lt', threshold: -5 }
        ],
        alert_config: {
          severity: 'medium',
          cooldown_period: '4h',
          escalation: []
        }
      },
      {
        rule_name: 'High Alert Count',
        rule_type: 'threshold',
        conditions: [
          { metric: 'high_alerts', operator: 'gte', threshold: 5 }
        ],
        alert_config: {
          severity: 'high',
          cooldown_period: '2h',
          escalation: []
        }
      }
    ]

    for (const rule of defaultRules) {
      await this.db.query(`
        INSERT INTO monitoring_rules (
          rule_name, rule_type, conditions, alert_config, notification_channels
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [
        rule.rule_name,
        rule.rule_type,
        JSON.stringify(rule.conditions),
        JSON.stringify(rule.alert_config),
        ['email']
      ])
    }
  }

  // Helper methods
  private getMetricValue(metrics: ComplianceMetrics, metricName: string): number {
    const metricMap: Record<string, number> = {
      'overall_score': metrics.overall_score,
      'score_trend_24h': metrics.score_trend_24h,
      'score_trend_7d': metrics.score_trend_7d,
      'score_trend_30d': metrics.score_trend_30d,
      'failed_controls': metrics.failed_controls.length,
      'overdue_evidence': metrics.overdue_evidence,
      'upcoming_deadlines': metrics.upcoming_deadlines,
      'critical_alerts': metrics.critical_alerts,
      'high_alerts': metrics.high_alerts,
      'medium_alerts': metrics.medium_alerts,
      'low_alerts': metrics.low_alerts
    }
    return metricMap[metricName] || 0
  }

  private evaluateCondition(value: number, condition: any): boolean {
    const { operator, threshold } = condition
    switch (operator) {
      case 'lt': return value < threshold
      case 'lte': return value <= threshold
      case 'gt': return value > threshold
      case 'gte': return value >= threshold
      case 'eq': return value === threshold
      case 'neq': return value !== threshold
      default: return false
    }
  }

  // Public API methods

  /**
   * Get real-time compliance metrics for a company
   */
  async getRealtimeMetrics(companyDomain: string): Promise<ComplianceMetrics> {
    return await this.calculateComplianceMetrics(companyDomain)
  }

  /**
   * Get active alerts for a company
   */
  async getActiveAlerts(companyDomain: string, severity?: string): Promise<ComplianceAlert[]> {
    let query = `
      SELECT * FROM compliance_alerts
      WHERE company_domain = $1 AND resolved = false
    `
    const params = [companyDomain]

    if (severity) {
      query += ` AND severity = $2`
      params.push(severity)
    }

    query += ` ORDER BY triggered_at DESC`

    const result = await this.db.query(query, params)
    return result.rows
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    await this.db.query(`
      UPDATE compliance_alerts
      SET acknowledged = true, acknowledged_by = $1, acknowledged_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [acknowledgedBy, alertId])
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    await this.db.query(`
      UPDATE compliance_alerts
      SET resolved = true, resolved_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [alertId])
  }

  /**
   * Create monitoring webhook
   */
  async createWebhook(webhook: Omit<MonitoringWebhook, 'id' | 'last_success' | 'last_failure' | 'retry_count'>): Promise<MonitoringWebhook> {
    const result = await this.db.query(`
      INSERT INTO monitoring_webhooks (
        name, url, secret, enabled, events, headers, company_domain
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      webhook.name,
      webhook.url,
      webhook.secret,
      webhook.enabled,
      webhook.events,
      JSON.stringify(webhook.headers || {}),
      webhook.company_domain
    ])

    return result.rows[0]
  }

  /**
   * Stop monitoring (for cleanup)
   */
  stopMonitoring(): void {
    for (const [key, interval] of this.monitoringIntervals) {
      clearInterval(interval)
      console.log(`Stopped ${key} monitoring`)
    }
    this.monitoringIntervals.clear()
  }
}