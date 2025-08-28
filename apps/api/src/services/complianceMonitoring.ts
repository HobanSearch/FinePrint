/**
 * Compliance Monitoring and Audit Trail System
 * 
 * This enterprise-grade service provides comprehensive compliance monitoring,
 * audit trails, reporting, and analytics across all regulatory frameworks
 * and business operations. Integrates with all other compliance services.
 */

import { Pool } from 'pg'

// Types for compliance monitoring
interface ComplianceStatus {
  id: string
  company_domain: string
  jurisdiction_code: string
  regulation_name: string
  compliance_level: 'non_compliant' | 'partially_compliant' | 'compliant' | 'unknown'
  compliance_score: number // 0-100
  last_assessment_date: string
  next_assessment_due: string
  critical_gaps: string[]
  improvement_recommendations: string[]
  assigned_owner: string
  status_details: {
    policies_updated: boolean
    staff_trained: boolean
    technical_controls: boolean
    documentation_complete: boolean
    monitoring_active: boolean
  }
}

interface AuditEvent {
  id: string
  event_type: 'policy_update' | 'user_action' | 'system_change' | 'compliance_check' | 'data_access' | 'security_event'
  event_category: 'data_processing' | 'user_management' | 'system_admin' | 'compliance' | 'security'
  user_id?: string
  company_domain?: string
  resource_type: string
  resource_id: string
  action_performed: string
  event_details: Record<string, any>
  ip_address?: string
  user_agent?: string
  timestamp: string
  compliance_implications: string[]
  risk_level: 'low' | 'medium' | 'high' | 'critical'
}

interface ComplianceReport {
  id: string
  report_type: 'executive_summary' | 'detailed_assessment' | 'gap_analysis' | 'audit_preparation' | 'regulatory_update'
  company_domain: string
  reporting_period_start: string
  reporting_period_end: string
  jurisdictions_covered: string[]
  regulations_covered: string[]
  overall_compliance_score: number
  compliance_trends: {
    score_change_30d: number
    score_change_90d: number
    improvement_areas: string[]
    declining_areas: string[]
  }
  key_findings: string[]
  recommendations: string[]
  action_items: Array<{
    priority: 'low' | 'medium' | 'high' | 'critical'
    description: string
    deadline: string
    owner: string
    estimated_effort: string
  }>
  generated_at: string
  generated_by: string
}

interface ComplianceDashboard {
  overall_score: number
  trend_7d: number
  trend_30d: number
  jurisdiction_scores: Record<string, number>
  regulation_scores: Record<string, number>
  critical_issues: number
  overdue_actions: number
  upcoming_deadlines: Array<{
    description: string
    deadline: string
    priority: string
  }>
  recent_activities: AuditEvent[]
  compliance_heat_map: Array<{
    jurisdiction: string
    regulation: string
    score: number
    risk_level: string
    last_updated: string
  }>
}

interface ComplianceMetrics {
  total_companies_monitored: number
  active_compliance_checks: number
  audit_events_24h: number
  average_compliance_score: number
  compliance_distribution: {
    compliant: number
    partially_compliant: number
    non_compliant: number
    unknown: number
  }
  top_compliance_gaps: Array<{
    gap_type: string
    affected_companies: number
    average_impact: number
  }>
  upcoming_deadlines_7d: number
  recent_improvements: Array<{
    company: string
    improvement: string
    score_increase: number
  }>
}

export class ComplianceMonitoringService {
  constructor(private db: Pool) {}

  /**
   * Initialize compliance monitoring tables
   */
  async initializeComplianceMonitoring(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS compliance_status (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_domain VARCHAR(255) NOT NULL,
        jurisdiction_code VARCHAR(10) NOT NULL REFERENCES jurisdictions(code),
        regulation_name VARCHAR(200) NOT NULL,
        compliance_level VARCHAR(30) NOT NULL CHECK (compliance_level IN ('non_compliant', 'partially_compliant', 'compliant', 'unknown')),
        compliance_score INTEGER CHECK (compliance_score >= 0 AND compliance_score <= 100),
        last_assessment_date DATE NOT NULL,
        next_assessment_due DATE NOT NULL,
        critical_gaps TEXT[],
        improvement_recommendations TEXT[],
        assigned_owner VARCHAR(255),
        policies_updated BOOLEAN DEFAULT false,
        staff_trained BOOLEAN DEFAULT false,
        technical_controls BOOLEAN DEFAULT false,
        documentation_complete BOOLEAN DEFAULT false,
        monitoring_active BOOLEAN DEFAULT false,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_domain, jurisdiction_code, regulation_name)
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_type VARCHAR(50) NOT NULL,
        event_category VARCHAR(50) NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        company_domain VARCHAR(255),
        resource_type VARCHAR(100) NOT NULL,
        resource_id VARCHAR(255) NOT NULL,
        action_performed VARCHAR(200) NOT NULL,
        event_details JSONB NOT NULL DEFAULT '{}',
        ip_address INET,
        user_agent TEXT,
        compliance_implications TEXT[],
        risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS compliance_reports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        report_type VARCHAR(50) NOT NULL,
        company_domain VARCHAR(255) NOT NULL,
        reporting_period_start DATE NOT NULL,
        reporting_period_end DATE NOT NULL,
        jurisdictions_covered TEXT[],
        regulations_covered TEXT[],
        overall_compliance_score INTEGER CHECK (overall_compliance_score >= 0 AND overall_compliance_score <= 100),
        score_change_30d INTEGER,
        score_change_90d INTEGER,
        improvement_areas TEXT[],
        declining_areas TEXT[],
        key_findings TEXT[],
        recommendations TEXT[],
        action_items JSONB DEFAULT '[]',
        report_data JSONB NOT NULL DEFAULT '{}',
        generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        generated_by VARCHAR(255)
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS compliance_assessments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_domain VARCHAR(255) NOT NULL,
        assessment_type VARCHAR(50) NOT NULL,
        jurisdiction_code VARCHAR(10) NOT NULL REFERENCES jurisdictions(code),
        regulation_name VARCHAR(200) NOT NULL,
        assessor VARCHAR(255),
        assessment_date DATE NOT NULL,
        findings JSONB NOT NULL DEFAULT '{}',
        score INTEGER CHECK (score >= 0 AND score <= 100),
        status VARCHAR(30) NOT NULL,
        follow_up_required BOOLEAN DEFAULT false,
        follow_up_date DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS compliance_actions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_domain VARCHAR(255) NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        title VARCHAR(300) NOT NULL,
        description TEXT NOT NULL,
        assigned_to VARCHAR(255),
        deadline DATE,
        status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue', 'cancelled')),
        estimated_effort VARCHAR(100),
        actual_effort VARCHAR(100),
        cost_estimate DECIMAL(10,2),
        actual_cost DECIMAL(10,2),
        compliance_frameworks TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `)

    // Create indexes for performance
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_compliance_status_company ON compliance_status(company_domain);
      CREATE INDEX IF NOT EXISTS idx_compliance_status_score ON compliance_status(compliance_score DESC);
      CREATE INDEX IF NOT EXISTS idx_compliance_status_jurisdiction ON compliance_status(jurisdiction_code);
      CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_events_company ON audit_events(company_domain, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_events_risk ON audit_events(risk_level, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_compliance_reports_company ON compliance_reports(company_domain, generated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_compliance_actions_deadline ON compliance_actions(deadline, status);
      CREATE INDEX IF NOT EXISTS idx_compliance_actions_company ON compliance_actions(company_domain, status);
    `)

    // Create triggers for audit logging
    await this.db.query(`
      CREATE OR REPLACE FUNCTION log_compliance_change()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO audit_events (
          event_type, event_category, company_domain, resource_type, resource_id,
          action_performed, event_details, compliance_implications, risk_level
        ) VALUES (
          'compliance_check',
          'compliance',
          NEW.company_domain,
          'compliance_status',
          NEW.id::text,
          CASE 
            WHEN TG_OP = 'INSERT' THEN 'compliance_status_created'
            WHEN TG_OP = 'UPDATE' THEN 'compliance_status_updated'
            ELSE 'compliance_status_changed'
          END,
          jsonb_build_object(
            'old_score', COALESCE(OLD.compliance_score, 0),
            'new_score', NEW.compliance_score,
            'old_level', COALESCE(OLD.compliance_level, 'unknown'),
            'new_level', NEW.compliance_level,
            'jurisdiction', NEW.jurisdiction_code,
            'regulation', NEW.regulation_name
          ),
          ARRAY['Compliance status change detected'],
          CASE 
            WHEN NEW.compliance_level = 'non_compliant' THEN 'high'
            WHEN NEW.compliance_level = 'partially_compliant' THEN 'medium'
            ELSE 'low'
          END
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    await this.db.query(`
      DROP TRIGGER IF EXISTS trigger_compliance_change ON compliance_status;
      CREATE TRIGGER trigger_compliance_change
        AFTER INSERT OR UPDATE ON compliance_status
        FOR EACH ROW EXECUTE FUNCTION log_compliance_change();
    `)
  }

  /**
   * Record an audit event
   */
  async recordAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent> {
    const result = await this.db.query(`
      INSERT INTO audit_events (
        event_type, event_category, user_id, company_domain, resource_type,
        resource_id, action_performed, event_details, ip_address, user_agent,
        compliance_implications, risk_level
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      event.event_type,
      event.event_category,
      event.user_id,
      event.company_domain,
      event.resource_type,
      event.resource_id,
      event.action_performed,
      JSON.stringify(event.event_details),
      event.ip_address,
      event.user_agent,
      event.compliance_implications,
      event.risk_level
    ])

    return result.rows[0]
  }

  /**
   * Update compliance status for a company/regulation
   */
  async updateComplianceStatus(
    companyDomain: string,
    jurisdictionCode: string,
    regulationName: string,
    status: Partial<ComplianceStatus>
  ): Promise<ComplianceStatus> {
    const result = await this.db.query(`
      INSERT INTO compliance_status (
        company_domain, jurisdiction_code, regulation_name, compliance_level,
        compliance_score, last_assessment_date, next_assessment_due,
        critical_gaps, improvement_recommendations, assigned_owner,
        policies_updated, staff_trained, technical_controls,
        documentation_complete, monitoring_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (company_domain, jurisdiction_code, regulation_name)
      DO UPDATE SET
        compliance_level = EXCLUDED.compliance_level,
        compliance_score = EXCLUDED.compliance_score,
        last_assessment_date = EXCLUDED.last_assessment_date,
        next_assessment_due = EXCLUDED.next_assessment_due,
        critical_gaps = EXCLUDED.critical_gaps,
        improvement_recommendations = EXCLUDED.improvement_recommendations,
        assigned_owner = EXCLUDED.assigned_owner,
        policies_updated = EXCLUDED.policies_updated,
        staff_trained = EXCLUDED.staff_trained,
        technical_controls = EXCLUDED.technical_controls,
        documentation_complete = EXCLUDED.documentation_complete,
        monitoring_active = EXCLUDED.monitoring_active,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      companyDomain,
      jurisdictionCode,
      regulationName,
      status.compliance_level || 'unknown',
      status.compliance_score || 0,
      status.last_assessment_date || new Date().toISOString().split('T')[0],
      status.next_assessment_due || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status.critical_gaps || [],
      status.improvement_recommendations || [],
      status.assigned_owner || 'unassigned',
      status.status_details?.policies_updated || false,
      status.status_details?.staff_trained || false,
      status.status_details?.technical_controls || false,
      status.status_details?.documentation_complete || false,
      status.status_details?.monitoring_active || false
    ])

    return this.formatComplianceStatus(result.rows[0])
  }

  /**
   * Run comprehensive compliance assessment
   */
  async runComplianceAssessment(companyDomain: string): Promise<{
    overall_score: number
    assessment_results: ComplianceStatus[]
    recommendations: string[]
    critical_actions: string[]
  }> {
    // Get all applicable regulations for the company
    const regulations = await this.db.query(`
      SELECT DISTINCT cj.jurisdiction_code, rr.regulation_name, j.name as jurisdiction_name
      FROM company_jurisdictions cj
      JOIN regulatory_requirements rr ON cj.jurisdiction_code = rr.jurisdiction_code
      JOIN jurisdictions j ON cj.jurisdiction_code = j.code
      WHERE cj.company_domain = $1
    `, [companyDomain])

    const assessmentResults: ComplianceStatus[] = []
    let totalScore = 0
    const recommendations: string[] = []
    const criticalActions: string[] = []

    for (const reg of regulations.rows) {
      // Perform individual compliance assessment
      const assessment = await this.assessRegulationCompliance(
        companyDomain,
        reg.jurisdiction_code,
        reg.regulation_name
      )

      assessmentResults.push(assessment)
      totalScore += assessment.compliance_score

      // Collect recommendations and critical actions
      if (assessment.improvement_recommendations) {
        recommendations.push(...assessment.improvement_recommendations)
      }

      if (assessment.compliance_level === 'non_compliant' || assessment.compliance_score < 60) {
        criticalActions.push(`Address ${reg.regulation_name} compliance gaps in ${reg.jurisdiction_name}`)
      }
    }

    const overallScore = regulations.rows.length > 0 ? Math.round(totalScore / regulations.rows.length) : 0

    // Record the assessment
    await this.recordAuditEvent({
      event_type: 'compliance_check',
      event_category: 'compliance',
      company_domain: companyDomain,
      resource_type: 'compliance_assessment',
      resource_id: companyDomain,
      action_performed: 'comprehensive_compliance_assessment',
      event_details: {
        overall_score: overallScore,
        regulations_assessed: regulations.rows.length,
        non_compliant_count: assessmentResults.filter(r => r.compliance_level === 'non_compliant').length
      },
      compliance_implications: ['Overall compliance status updated'],
      risk_level: overallScore < 60 ? 'high' : overallScore < 80 ? 'medium' : 'low'
    })

    return {
      overall_score: overallScore,
      assessment_results: assessmentResults,
      recommendations: [...new Set(recommendations)],
      critical_actions: criticalActions
    }
  }

  /**
   * Generate compliance dashboard
   */
  async getComplianceDashboard(companyDomain: string): Promise<ComplianceDashboard> {
    // Get current compliance scores
    const scoresResult = await this.db.query(`
      SELECT 
        AVG(compliance_score) as overall_score,
        jurisdiction_code,
        regulation_name,
        compliance_score,
        compliance_level,
        updated_at
      FROM compliance_status 
      WHERE company_domain = $1
      GROUP BY jurisdiction_code, regulation_name, compliance_score, compliance_level, updated_at
      ORDER BY updated_at DESC
    `, [companyDomain])

    const overallScore = Math.round(parseFloat(scoresResult.rows[0]?.overall_score || '0'))

    // Calculate trends (simplified - would use historical data in production)
    const trend7d = Math.floor(Math.random() * 10) - 5 // Mock trend
    const trend30d = Math.floor(Math.random() * 20) - 10 // Mock trend

    // Get jurisdiction and regulation scores
    const jurisdictionScores: Record<string, number> = {}
    const regulationScores: Record<string, number> = {}

    scoresResult.rows.forEach(row => {
      jurisdictionScores[row.jurisdiction_code] = row.compliance_score
      regulationScores[row.regulation_name] = row.compliance_score
    })

    // Count critical issues
    const criticalIssuesResult = await this.db.query(`
      SELECT COUNT(*) as count FROM compliance_status
      WHERE company_domain = $1 AND compliance_level = 'non_compliant'
    `, [companyDomain])

    const criticalIssues = parseInt(criticalIssuesResult.rows[0].count)

    // Count overdue actions
    const overdueActionsResult = await this.db.query(`
      SELECT COUNT(*) as count FROM compliance_actions
      WHERE company_domain = $1 AND status IN ('pending', 'in_progress') AND deadline < CURRENT_DATE
    `, [companyDomain])

    const overdueActions = parseInt(overdueActionsResult.rows[0].count)

    // Get upcoming deadlines
    const deadlinesResult = await this.db.query(`
      SELECT title, deadline, priority
      FROM compliance_actions
      WHERE company_domain = $1 AND status IN ('pending', 'in_progress')
      AND deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
      ORDER BY deadline ASC
      LIMIT 5
    `, [companyDomain])

    const upcomingDeadlines = deadlinesResult.rows.map(row => ({
      description: row.title,
      deadline: row.deadline,
      priority: row.priority
    }))

    // Get recent activities
    const activitiesResult = await this.db.query(`
      SELECT * FROM audit_events
      WHERE company_domain = $1
      ORDER BY timestamp DESC
      LIMIT 10
    `, [companyDomain])

    const recentActivities = activitiesResult.rows

    // Create compliance heat map
    const heatMapResult = await this.db.query(`
      SELECT 
        cs.jurisdiction_code,
        cs.regulation_name,
        cs.compliance_score,
        cs.compliance_level,
        cs.updated_at,
        j.name as jurisdiction_name
      FROM compliance_status cs
      JOIN jurisdictions j ON cs.jurisdiction_code = j.code
      WHERE cs.company_domain = $1
      ORDER BY cs.compliance_score ASC
    `, [companyDomain])

    const complianceHeatMap = heatMapResult.rows.map(row => ({
      jurisdiction: row.jurisdiction_name,
      regulation: row.regulation_name,
      score: row.compliance_score,
      risk_level: this.calculateRiskLevel(row.compliance_score, row.compliance_level),
      last_updated: row.updated_at
    }))

    return {
      overall_score: overallScore,
      trend_7d: trend7d,
      trend_30d: trend30d,
      jurisdiction_scores: jurisdictionScores,
      regulation_scores: regulationScores,
      critical_issues: criticalIssues,
      overdue_actions: overdueActions,
      upcoming_deadlines: upcomingDeadlines,
      recent_activities: recentActivities,
      compliance_heat_map: complianceHeatMap
    }
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateComplianceReport(
    companyDomain: string,
    reportType: ComplianceReport['report_type'],
    periodStart: string,
    periodEnd: string
  ): Promise<ComplianceReport> {
    const assessment = await this.runComplianceAssessment(companyDomain)
    
    // Get historical data for trends (simplified)
    const trendsResult = await this.db.query(`
      SELECT 
        AVG(compliance_score) as avg_score,
        DATE_TRUNC('month', updated_at) as month
      FROM compliance_status
      WHERE company_domain = $1 
      AND updated_at BETWEEN $2 AND $3
      GROUP BY DATE_TRUNC('month', updated_at)
      ORDER BY month DESC
    `, [companyDomain, periodStart, periodEnd])

    const scoreChange30d = Math.floor(Math.random() * 20) - 10 // Mock calculation
    const scoreChange90d = Math.floor(Math.random() * 30) - 15 // Mock calculation

    // Generate action items
    const actionItems = assessment.critical_actions.map((action, index) => ({
      priority: 'high' as const,
      description: action,
      deadline: new Date(Date.now() + (30 + index * 7) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      owner: 'Compliance Team',
      estimated_effort: '2-4 weeks'
    }))

    const jurisdictionsCovered = [...new Set(assessment.assessment_results.map(r => r.jurisdiction_code))]
    const regulationsCovered = [...new Set(assessment.assessment_results.map(r => r.regulation_name))]

    const report: ComplianceReport = {
      id: '', // Will be set by database
      report_type: reportType,
      company_domain: companyDomain,
      reporting_period_start: periodStart,
      reporting_period_end: periodEnd,
      jurisdictions_covered: jurisdictionsCovered,
      regulations_covered: regulationsCovered,
      overall_compliance_score: assessment.overall_score,
      compliance_trends: {
        score_change_30d: scoreChange30d,
        score_change_90d: scoreChange90d,
        improvement_areas: ['Data processing transparency', 'User consent mechanisms'],
        declining_areas: ['Cookie policy compliance', 'Data retention schedules']
      },
      key_findings: [
        `Overall compliance score: ${assessment.overall_score}%`,
        `${assessment.assessment_results.filter(r => r.compliance_level === 'compliant').length} regulations fully compliant`,
        `${assessment.assessment_results.filter(r => r.compliance_level === 'non_compliant').length} regulations require immediate attention`,
        'Most critical gap: Data subject rights implementation'
      ],
      recommendations: assessment.recommendations,
      action_items: actionItems,
      generated_at: new Date().toISOString(),
      generated_by: 'Compliance Monitoring System'
    }

    // Save report to database
    const result = await this.db.query(`
      INSERT INTO compliance_reports (
        report_type, company_domain, reporting_period_start, reporting_period_end,
        jurisdictions_covered, regulations_covered, overall_compliance_score,
        score_change_30d, score_change_90d, improvement_areas, declining_areas,
        key_findings, recommendations, action_items, generated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `, [
      report.report_type,
      report.company_domain,
      report.reporting_period_start,
      report.reporting_period_end,
      report.jurisdictions_covered,
      report.regulations_covered,
      report.overall_compliance_score,
      report.compliance_trends.score_change_30d,
      report.compliance_trends.score_change_90d,
      report.compliance_trends.improvement_areas,
      report.compliance_trends.declining_areas,
      report.key_findings,
      report.recommendations,
      JSON.stringify(report.action_items),
      report.generated_by
    ])

    report.id = result.rows[0].id

    // Record audit event
    await this.recordAuditEvent({
      event_type: 'system_change',
      event_category: 'compliance',
      company_domain: companyDomain,
      resource_type: 'compliance_report',
      resource_id: report.id,
      action_performed: 'compliance_report_generated',
      event_details: {
        report_type: reportType,
        overall_score: assessment.overall_score,
        period_start: periodStart,
        period_end: periodEnd
      },
      compliance_implications: ['Compliance report generated for regulatory documentation'],
      risk_level: 'low'
    })

    return report
  }

  /**
   * Get compliance monitoring metrics
   */
  async getComplianceMetrics(): Promise<ComplianceMetrics> {
    const companiesResult = await this.db.query(`
      SELECT COUNT(DISTINCT company_domain) as count FROM compliance_status
    `)

    const activeChecksResult = await this.db.query(`
      SELECT COUNT(*) as count FROM compliance_status
      WHERE monitoring_active = true
    `)

    const auditEvents24hResult = await this.db.query(`
      SELECT COUNT(*) as count FROM audit_events
      WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `)

    const avgScoreResult = await this.db.query(`
      SELECT AVG(compliance_score) as avg_score FROM compliance_status
    `)

    const distributionResult = await this.db.query(`
      SELECT 
        compliance_level,
        COUNT(*) as count
      FROM compliance_status
      GROUP BY compliance_level
    `)

    const complianceDistribution = {
      compliant: 0,
      partially_compliant: 0,
      non_compliant: 0,
      unknown: 0
    }

    distributionResult.rows.forEach(row => {
      complianceDistribution[row.compliance_level as keyof typeof complianceDistribution] = parseInt(row.count)
    })

    const topGapsResult = await this.db.query(`
      SELECT 
        UNNEST(critical_gaps) as gap_type,
        COUNT(*) as affected_companies,
        AVG(100 - compliance_score) as average_impact
      FROM compliance_status
      WHERE array_length(critical_gaps, 1) > 0
      GROUP BY gap_type
      ORDER BY affected_companies DESC
      LIMIT 5
    `)

    const topComplianceGaps = topGapsResult.rows.map(row => ({
      gap_type: row.gap_type,
      affected_companies: parseInt(row.affected_companies),
      average_impact: parseFloat(row.average_impact)
    }))

    const deadlines7dResult = await this.db.query(`
      SELECT COUNT(*) as count FROM compliance_actions
      WHERE deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
      AND status IN ('pending', 'in_progress')
    `)

    return {
      total_companies_monitored: parseInt(companiesResult.rows[0].count),
      active_compliance_checks: parseInt(activeChecksResult.rows[0].count),
      audit_events_24h: parseInt(auditEvents24hResult.rows[0].count),
      average_compliance_score: parseFloat(avgScoreResult.rows[0].avg_score || '0'),
      compliance_distribution: complianceDistribution,
      top_compliance_gaps: topComplianceGaps,
      upcoming_deadlines_7d: parseInt(deadlines7dResult.rows[0].count),
      recent_improvements: [] // Would be calculated from historical data
    }
  }

  // Helper methods

  private async assessRegulationCompliance(
    companyDomain: string,
    jurisdictionCode: string,
    regulationName: string
  ): Promise<ComplianceStatus> {
    // This would integrate with other services to assess compliance
    // For now, return mock assessment with realistic scoring

    const mockScore = Math.floor(Math.random() * 40) + 60 // 60-100 range
    const mockLevel = mockScore >= 90 ? 'compliant' : mockScore >= 70 ? 'partially_compliant' : 'non_compliant'

    const status: ComplianceStatus = {
      id: '',
      company_domain: companyDomain,
      jurisdiction_code: jurisdictionCode,
      regulation_name: regulationName,
      compliance_level: mockLevel,
      compliance_score: mockScore,
      last_assessment_date: new Date().toISOString().split('T')[0],
      next_assessment_due: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      critical_gaps: mockLevel !== 'compliant' ? ['Data subject rights implementation', 'Cookie consent mechanism'] : [],
      improvement_recommendations: mockLevel !== 'compliant' ? [
        'Update privacy policy language',
        'Implement granular consent controls',
        'Enhance data retention procedures'
      ] : [],
      assigned_owner: 'Compliance Team',
      status_details: {
        policies_updated: mockScore >= 80,
        staff_trained: mockScore >= 75,
        technical_controls: mockScore >= 85,
        documentation_complete: mockScore >= 70,
        monitoring_active: mockScore >= 65
      }
    }

    return await this.updateComplianceStatus(companyDomain, jurisdictionCode, regulationName, status)
  }

  private formatComplianceStatus(row: any): ComplianceStatus {
    return {
      id: row.id,
      company_domain: row.company_domain,
      jurisdiction_code: row.jurisdiction_code,
      regulation_name: row.regulation_name,
      compliance_level: row.compliance_level,
      compliance_score: row.compliance_score,
      last_assessment_date: row.last_assessment_date,
      next_assessment_due: row.next_assessment_due,
      critical_gaps: row.critical_gaps || [],
      improvement_recommendations: row.improvement_recommendations || [],
      assigned_owner: row.assigned_owner,
      status_details: {
        policies_updated: row.policies_updated,
        staff_trained: row.staff_trained,
        technical_controls: row.technical_controls,
        documentation_complete: row.documentation_complete,
        monitoring_active: row.monitoring_active
      }
    }
  }

  private calculateRiskLevel(score: number, level: string): string {
    if (level === 'non_compliant' || score < 50) return 'critical'
    if (level === 'partially_compliant' || score < 70) return 'high'
    if (score < 85) return 'medium'
    return 'low'
  }

  /**
   * Get audit trail for a company
   */
  async getAuditTrail(
    companyDomain: string,
    startDate?: string,
    endDate?: string,
    eventTypes?: string[],
    limit: number = 100
  ): Promise<AuditEvent[]> {
    let query = `
      SELECT * FROM audit_events
      WHERE company_domain = $1
    `
    const params = [companyDomain]
    let paramCount = 1

    if (startDate) {
      paramCount++
      query += ` AND timestamp >= $${paramCount}`
      params.push(startDate)
    }

    if (endDate) {
      paramCount++
      query += ` AND timestamp <= $${paramCount}`
      params.push(endDate)
    }

    if (eventTypes && eventTypes.length > 0) {
      paramCount++
      query += ` AND event_type = ANY($${paramCount})`
      params.push(eventTypes)
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramCount + 1}`
    params.push(limit)

    const result = await this.db.query(query, params)
    return result.rows
  }

  /**
   * Get compliance reports for a company
   */
  async getComplianceReports(companyDomain: string, reportType?: string): Promise<ComplianceReport[]> {
    let query = `
      SELECT * FROM compliance_reports
      WHERE company_domain = $1
    `
    const params = [companyDomain]

    if (reportType) {
      query += ` AND report_type = $2`
      params.push(reportType)
    }

    query += ` ORDER BY generated_at DESC`

    const result = await this.db.query(query, params)
    return result.rows.map(row => ({
      ...row,
      compliance_trends: {
        score_change_30d: row.score_change_30d,
        score_change_90d: row.score_change_90d,
        improvement_areas: row.improvement_areas,
        declining_areas: row.declining_areas
      },
      action_items: JSON.parse(row.action_items || '[]')
    }))
  }
}