/**
 * Regulatory Intelligence Engine with Law Tracking
 * 
 * This advanced service monitors regulatory changes in real-time,
 * analyzes their impact on compliance frameworks, and provides
 * proactive recommendations for legal document updates.
 */

import { Pool } from 'pg'

// Types for regulatory intelligence engine
interface RegulatoryUpdate {
  id: string
  jurisdiction_code: string
  jurisdiction_name: string
  regulation_name: string
  update_type: 'new_regulation' | 'amendment' | 'guidance' | 'enforcement_action' | 'deadline_change'
  title: string
  description: string
  effective_date: string
  announcement_date: string
  source_url: string
  impact_level: 'low' | 'medium' | 'high' | 'critical'
  affected_industries: string[]
  key_changes: string[]
  compliance_requirements: string[]
  created_at: string
}

interface ComplianceImpactAnalysis {
  update_id: string
  affected_companies: number
  estimated_compliance_cost: number
  implementation_timeline: string
  key_actions_required: string[]
  documents_requiring_updates: string[]
  risk_assessment: {
    financial_risk: 'low' | 'medium' | 'high' | 'critical'
    legal_risk: 'low' | 'medium' | 'high' | 'critical'
    operational_risk: 'low' | 'medium' | 'high' | 'critical'
    reputational_risk: 'low' | 'medium' | 'high' | 'critical'
  }
}

interface RegulatoryAlert {
  id: string
  update_id: string
  user_id?: string
  company_domain?: string
  alert_type: 'compliance_deadline' | 'new_requirement' | 'guidance_update' | 'enforcement_action'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  title: string
  message: string
  action_required: boolean
  deadline_date?: string
  created_at: string
  acknowledged_at?: string
}

interface LawTrackingMetrics {
  total_regulations_tracked: number
  updates_this_month: number
  high_impact_updates: number
  pending_compliance_deadlines: number
  alerts_generated: number
  most_updated_jurisdictions: Record<string, number>
  compliance_cost_estimates: {
    total_estimated_cost: number
    average_per_company: number
    by_industry: Record<string, number>
  }
}

interface ComplianceRecommendation {
  id: string
  company_domain: string
  regulation_update_id: string
  recommendation_type: 'policy_update' | 'process_change' | 'training_required' | 'legal_review'
  priority: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  implementation_steps: string[]
  estimated_effort: string
  deadline: string
  cost_estimate: number
  status: 'pending' | 'in_progress' | 'completed' | 'deferred'
  created_at: string
}

export class RegulatoryIntelligenceEngine {
  constructor(private db: Pool) {}

  /**
   * Initialize regulatory engine tables
   */
  async initializeRegulatoryEngine(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS regulatory_updates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        jurisdiction_code VARCHAR(10) NOT NULL REFERENCES jurisdictions(code),
        regulation_name VARCHAR(200) NOT NULL,
        update_type VARCHAR(50) NOT NULL CHECK (update_type IN ('new_regulation', 'amendment', 'guidance', 'enforcement_action', 'deadline_change')),
        title VARCHAR(500) NOT NULL,
        description TEXT NOT NULL,
        effective_date DATE,
        announcement_date DATE NOT NULL,
        source_url TEXT,
        impact_level VARCHAR(20) NOT NULL CHECK (impact_level IN ('low', 'medium', 'high', 'critical')),
        affected_industries TEXT[],
        key_changes TEXT[],
        compliance_requirements TEXT[],
        metadata JSONB DEFAULT '{}',
        processed BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS compliance_impact_analyses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        update_id UUID NOT NULL REFERENCES regulatory_updates(id) ON DELETE CASCADE,
        affected_companies INTEGER DEFAULT 0,
        estimated_compliance_cost DECIMAL(12,2),
        implementation_timeline VARCHAR(100),
        key_actions_required TEXT[],
        documents_requiring_updates TEXT[],
        financial_risk VARCHAR(20) CHECK (financial_risk IN ('low', 'medium', 'high', 'critical')),
        legal_risk VARCHAR(20) CHECK (legal_risk IN ('low', 'medium', 'high', 'critical')),
        operational_risk VARCHAR(20) CHECK (operational_risk IN ('low', 'medium', 'high', 'critical')),
        reputational_risk VARCHAR(20) CHECK (reputational_risk IN ('low', 'medium', 'high', 'critical')),
        analysis_details JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS regulatory_alerts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        update_id UUID NOT NULL REFERENCES regulatory_updates(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        company_domain VARCHAR(255),
        alert_type VARCHAR(50) NOT NULL,
        priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        title VARCHAR(300) NOT NULL,
        message TEXT NOT NULL,
        action_required BOOLEAN DEFAULT false,
        deadline_date DATE,
        acknowledged_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS compliance_recommendations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_domain VARCHAR(255) NOT NULL,
        regulation_update_id UUID NOT NULL REFERENCES regulatory_updates(id) ON DELETE CASCADE,
        recommendation_type VARCHAR(50) NOT NULL,
        priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        title VARCHAR(300) NOT NULL,
        description TEXT NOT NULL,
        implementation_steps TEXT[],
        estimated_effort VARCHAR(100),
        deadline DATE,
        cost_estimate DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'deferred')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS regulatory_monitoring_sources (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        jurisdiction_code VARCHAR(10) NOT NULL REFERENCES jurisdictions(code),
        source_name VARCHAR(200) NOT NULL,
        source_type VARCHAR(50) NOT NULL,
        base_url TEXT NOT NULL,
        monitoring_active BOOLEAN DEFAULT true,
        last_checked TIMESTAMP WITH TIME ZONE,
        next_check TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        check_frequency INTEGER DEFAULT 3600, -- in seconds
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create indexes for performance
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_updates_jurisdiction ON regulatory_updates(jurisdiction_code);
      CREATE INDEX IF NOT EXISTS idx_regulatory_updates_impact ON regulatory_updates(impact_level, announcement_date DESC);
      CREATE INDEX IF NOT EXISTS idx_regulatory_updates_effective ON regulatory_updates(effective_date);
      CREATE INDEX IF NOT EXISTS idx_regulatory_alerts_user ON regulatory_alerts(user_id, acknowledged_at);
      CREATE INDEX IF NOT EXISTS idx_regulatory_alerts_priority ON regulatory_alerts(priority, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_compliance_recommendations_company ON compliance_recommendations(company_domain, status);
      CREATE INDEX IF NOT EXISTS idx_compliance_recommendations_deadline ON compliance_recommendations(deadline, status);
    `)
  }

  /**
   * Seed regulatory monitoring sources
   */
  async seedMonitoringSources(): Promise<void> {
    const sources = [
      // European Union
      {
        jurisdiction_code: 'EU',
        source_name: 'European Commission - Data Protection',
        source_type: 'government_website',
        base_url: 'https://ec.europa.eu/info/law/law-topic/data-protection_en'
      },
      {
        jurisdiction_code: 'EU',
        source_name: 'EDPB Guidelines and Decisions',
        source_type: 'regulatory_body',
        base_url: 'https://edpb.europa.eu/our-work-tools/documents_en'
      },
      
      // United States
      {
        jurisdiction_code: 'US',
        source_name: 'FTC Privacy and Security Updates',
        source_type: 'regulatory_body',
        base_url: 'https://www.ftc.gov/news-events/topics/privacy-data-security'
      },
      {
        jurisdiction_code: 'CA-US',
        source_name: 'California AG Privacy Enforcement',
        source_type: 'state_regulator',
        base_url: 'https://oag.ca.gov/privacy'
      },
      
      // United Kingdom
      {
        jurisdiction_code: 'GB',
        source_name: 'ICO Guidance and Updates',
        source_type: 'regulatory_body',
        base_url: 'https://ico.org.uk/about-the-ico/media-centre/'
      },
      
      // Canada
      {
        jurisdiction_code: 'CA',
        source_name: 'PIPEDA Updates',
        source_type: 'government_website',
        base_url: 'https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/'
      }
    ]

    for (const source of sources) {
      await this.db.query(`
        INSERT INTO regulatory_monitoring_sources (
          jurisdiction_code, source_name, source_type, base_url
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (jurisdiction_code, source_name) DO NOTHING
      `, [source.jurisdiction_code, source.source_name, source.source_type, source.base_url])
    }
  }

  /**
   * Add a new regulatory update
   */
  async addRegulatoryUpdate(update: Omit<RegulatoryUpdate, 'id' | 'created_at'>): Promise<RegulatoryUpdate> {
    const result = await this.db.query(`
      INSERT INTO regulatory_updates (
        jurisdiction_code, regulation_name, update_type, title, description,
        effective_date, announcement_date, source_url, impact_level,
        affected_industries, key_changes, compliance_requirements
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      update.jurisdiction_code,
      update.regulation_name,
      update.update_type,
      update.title,
      update.description,
      update.effective_date,
      update.announcement_date,
      update.source_url,
      update.impact_level,
      update.affected_industries,
      update.key_changes,
      update.compliance_requirements
    ])

    const newUpdate = result.rows[0]

    // Automatically generate impact analysis and alerts
    await this.generateImpactAnalysis(newUpdate.id)
    await this.generateRegulatoryAlerts(newUpdate)

    return newUpdate
  }

  /**
   * Generate compliance impact analysis for a regulatory update
   */
  async generateImpactAnalysis(updateId: string): Promise<ComplianceImpactAnalysis> {
    const update = await this.db.query(`
      SELECT * FROM regulatory_updates WHERE id = $1
    `, [updateId])

    if (update.rows.length === 0) {
      throw new Error('Regulatory update not found')
    }

    const updateData = update.rows[0]
    
    // Calculate impact metrics based on update characteristics
    const impactAnalysis = this.calculateComplianceImpact(updateData)

    const result = await this.db.query(`
      INSERT INTO compliance_impact_analyses (
        update_id, affected_companies, estimated_compliance_cost,
        implementation_timeline, key_actions_required, documents_requiring_updates,
        financial_risk, legal_risk, operational_risk, reputational_risk,
        analysis_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      updateId,
      impactAnalysis.affected_companies,
      impactAnalysis.estimated_compliance_cost,
      impactAnalysis.implementation_timeline,
      impactAnalysis.key_actions_required,
      impactAnalysis.documents_requiring_updates,
      impactAnalysis.risk_assessment.financial_risk,
      impactAnalysis.risk_assessment.legal_risk,
      impactAnalysis.risk_assessment.operational_risk,
      impactAnalysis.risk_assessment.reputational_risk,
      JSON.stringify({
        methodology: 'automated_analysis',
        confidence_level: 'medium',
        last_updated: new Date().toISOString()
      })
    ])

    return {
      update_id: updateId,
      ...impactAnalysis
    }
  }

  /**
   * Generate regulatory alerts for affected users/companies
   */
  async generateRegulatoryAlerts(update: RegulatoryUpdate): Promise<void> {
    // Get companies that might be affected by this update
    const affectedCompanies = await this.getAffectedCompanies(update)

    for (const company of affectedCompanies) {
      const alertPriority = this.calculateAlertPriority(update, company)
      const alertMessage = this.generateAlertMessage(update, company)

      await this.db.query(`
        INSERT INTO regulatory_alerts (
          update_id, company_domain, alert_type, priority, title, message,
          action_required, deadline_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        update.id,
        company.domain,
        this.getAlertType(update.update_type),
        alertPriority,
        `${update.regulation_name}: ${update.title}`,
        alertMessage,
        update.impact_level === 'high' || update.impact_level === 'critical',
        update.effective_date
      ])

      // Generate compliance recommendations
      await this.generateComplianceRecommendations(update, company.domain)
    }
  }

  /**
   * Generate compliance recommendations for a company
   */
  async generateComplianceRecommendations(
    update: RegulatoryUpdate, 
    companyDomain: string
  ): Promise<ComplianceRecommendation[]> {
    const recommendations = this.analyzeComplianceRequirements(update, companyDomain)

    const results: ComplianceRecommendation[] = []

    for (const rec of recommendations) {
      const result = await this.db.query(`
        INSERT INTO compliance_recommendations (
          company_domain, regulation_update_id, recommendation_type, priority,
          title, description, implementation_steps, estimated_effort,
          deadline, cost_estimate
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        companyDomain,
        update.id,
        rec.type,
        rec.priority,
        rec.title,
        rec.description,
        rec.steps,
        rec.effort,
        rec.deadline,
        rec.cost
      ])

      results.push(result.rows[0])
    }

    return results
  }

  /**
   * Monitor regulatory sources for updates
   */
  async runRegulatoryMonitoring(): Promise<{
    sources_checked: number
    updates_found: number
    alerts_generated: number
  }> {
    let sourcesChecked = 0
    let updatesFound = 0
    let alertsGenerated = 0

    // Get sources due for checking
    const dueSources = await this.db.query(`
      SELECT * FROM regulatory_monitoring_sources
      WHERE monitoring_active = true 
      AND next_check <= CURRENT_TIMESTAMP
      LIMIT 50
    `)

    for (const source of dueSources.rows) {
      try {
        // In production, this would scrape/API check the actual source
        const newUpdates = await this.checkRegulatorySource(source)
        sourcesChecked++

        for (const update of newUpdates) {
          await this.addRegulatoryUpdate(update)
          updatesFound++
        }

        // Update last checked time
        await this.db.query(`
          UPDATE regulatory_monitoring_sources 
          SET last_checked = CURRENT_TIMESTAMP,
              next_check = CURRENT_TIMESTAMP + (check_frequency || ' seconds')::INTERVAL
          WHERE id = $1
        `, [source.id])

      } catch (error) {
        console.error(`Error monitoring source ${source.source_name}:`, error)
      }
    }

    // Count alerts generated in the last hour
    const alertsResult = await this.db.query(`
      SELECT COUNT(*) as count FROM regulatory_alerts
      WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
    `)
    alertsGenerated = parseInt(alertsResult.rows[0].count)

    return {
      sources_checked: sourcesChecked,
      updates_found: updatesFound,
      alerts_generated: alertsGenerated
    }
  }

  /**
   * Get regulatory tracking metrics
   */
  async getRegulatoryMetrics(): Promise<LawTrackingMetrics> {
    const totalRegsResult = await this.db.query(`
      SELECT COUNT(DISTINCT regulation_name) as count FROM regulatory_updates
    `)

    const monthlyUpdatesResult = await this.db.query(`
      SELECT COUNT(*) as count FROM regulatory_updates
      WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    `)

    const highImpactResult = await this.db.query(`
      SELECT COUNT(*) as count FROM regulatory_updates
      WHERE impact_level IN ('high', 'critical')
      AND created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    `)

    const pendingDeadlinesResult = await this.db.query(`
      SELECT COUNT(*) as count FROM regulatory_updates
      WHERE effective_date >= CURRENT_DATE
      AND effective_date <= CURRENT_DATE + INTERVAL '90 days'
    `)

    const alertsResult = await this.db.query(`
      SELECT COUNT(*) as count FROM regulatory_alerts
      WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    `)

    const jurisdictionUpdatesResult = await this.db.query(`
      SELECT j.name, COUNT(ru.id) as update_count
      FROM regulatory_updates ru
      JOIN jurisdictions j ON ru.jurisdiction_code = j.code
      WHERE ru.created_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
      GROUP BY j.name
      ORDER BY update_count DESC
      LIMIT 10
    `)

    const complianceCostResult = await this.db.query(`
      SELECT 
        SUM(estimated_compliance_cost) as total_cost,
        AVG(estimated_compliance_cost) as avg_cost,
        COUNT(*) as analysis_count
      FROM compliance_impact_analyses
      WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
    `)

    const mostUpdatedJurisdictions: Record<string, number> = {}
    jurisdictionUpdatesResult.rows.forEach(row => {
      mostUpdatedJurisdictions[row.name] = parseInt(row.update_count)
    })

    const costData = complianceCostResult.rows[0]

    return {
      total_regulations_tracked: parseInt(totalRegsResult.rows[0].count),
      updates_this_month: parseInt(monthlyUpdatesResult.rows[0].count),
      high_impact_updates: parseInt(highImpactResult.rows[0].count),
      pending_compliance_deadlines: parseInt(pendingDeadlinesResult.rows[0].count),
      alerts_generated: parseInt(alertsResult.rows[0].count),
      most_updated_jurisdictions: mostUpdatedJurisdictions,
      compliance_cost_estimates: {
        total_estimated_cost: parseFloat(costData.total_cost || '0'),
        average_per_company: parseFloat(costData.avg_cost || '0'),
        by_industry: {} // Would be calculated separately
      }
    }
  }

  // Helper methods for impact analysis and recommendations

  private calculateComplianceImpact(update: any): ComplianceImpactAnalysis {
    // Simulate impact calculation based on update characteristics
    let affectedCompanies = 1000
    let estimatedCost = 50000

    // Adjust based on impact level
    switch (update.impact_level) {
      case 'critical':
        affectedCompanies *= 5
        estimatedCost *= 10
        break
      case 'high':
        affectedCompanies *= 3
        estimatedCost *= 5
        break
      case 'medium':
        affectedCompanies *= 2
        estimatedCost *= 2
        break
    }

    // Adjust based on jurisdiction size
    const jurisdictionMultipliers = {
      'EU': 3,
      'US': 4,
      'US-CA': 1.5,
      'UK': 1.2,
      'CA': 0.8
    }
    
    const multiplier = jurisdictionMultipliers[update.jurisdiction_code as keyof typeof jurisdictionMultipliers] || 1
    affectedCompanies = Math.floor(affectedCompanies * multiplier)
    estimatedCost = Math.floor(estimatedCost * multiplier)

    return {
      update_id: update.id,
      affected_companies: affectedCompanies,
      estimated_compliance_cost: estimatedCost,
      implementation_timeline: this.calculateImplementationTimeline(update),
      key_actions_required: this.extractKeyActions(update),
      documents_requiring_updates: this.identifyRequiredDocumentUpdates(update),
      risk_assessment: {
        financial_risk: update.impact_level === 'critical' ? 'high' : 'medium',
        legal_risk: update.impact_level,
        operational_risk: update.impact_level === 'critical' ? 'high' : 'medium',
        reputational_risk: update.impact_level
      }
    }
  }

  private calculateImplementationTimeline(update: any): string {
    const effectiveDate = new Date(update.effective_date)
    const now = new Date()
    const daysUntilEffective = Math.ceil((effectiveDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilEffective <= 30) return 'Immediate (< 30 days)'
    if (daysUntilEffective <= 90) return 'Short-term (30-90 days)'
    if (daysUntilEffective <= 180) return 'Medium-term (3-6 months)'
    return 'Long-term (> 6 months)'
  }

  private extractKeyActions(update: any): string[] {
    const actions = []
    
    if (update.compliance_requirements?.length > 0) {
      actions.push('Review compliance requirements')
      actions.push('Update internal policies')
    }

    if (update.key_changes?.some((change: string) => change.toLowerCase().includes('consent'))) {
      actions.push('Update consent mechanisms')
    }

    if (update.key_changes?.some((change: string) => change.toLowerCase().includes('data'))) {
      actions.push('Review data processing activities')
    }

    actions.push('Conduct compliance gap analysis')
    actions.push('Train relevant staff')

    return actions
  }

  private identifyRequiredDocumentUpdates(update: any): string[] {
    const documents = []

    if (update.regulation_name.toLowerCase().includes('privacy') || 
        update.key_changes?.some((change: string) => change.toLowerCase().includes('privacy'))) {
      documents.push('Privacy Policy')
    }

    if (update.key_changes?.some((change: string) => change.toLowerCase().includes('terms'))) {
      documents.push('Terms of Service')
    }

    if (update.key_changes?.some((change: string) => change.toLowerCase().includes('cookie'))) {
      documents.push('Cookie Policy')
    }

    documents.push('Data Processing Agreements')
    
    return documents
  }

  private async getAffectedCompanies(update: RegulatoryUpdate): Promise<Array<{domain: string, industries: string[]}>> {
    // In production, this would query the company_jurisdictions table
    // For now, return mock data
    return [
      { domain: 'example.com', industries: ['technology'] },
      { domain: 'retailcorp.com', industries: ['retail'] },
      { domain: 'financeapp.com', industries: ['finance'] }
    ]
  }

  private calculateAlertPriority(update: RegulatoryUpdate, company: any): 'low' | 'medium' | 'high' | 'urgent' {
    if (update.impact_level === 'critical') return 'urgent'
    if (update.impact_level === 'high') return 'high'
    if (update.impact_level === 'medium') return 'medium'
    return 'low'
  }

  private generateAlertMessage(update: RegulatoryUpdate, company: any): string {
    return `A ${update.impact_level} impact regulatory update has been announced for ${update.jurisdiction_name}:

${update.title}

Key Changes:
${update.key_changes.map(change => `• ${change}`).join('\n')}

Effective Date: ${update.effective_date}
Action Required: Review compliance requirements and update relevant policies.

For more details, visit: ${update.source_url}`
  }

  private getAlertType(updateType: string): string {
    const typeMapping = {
      'new_regulation': 'new_requirement',
      'amendment': 'guidance_update',
      'guidance': 'guidance_update',
      'enforcement_action': 'enforcement_action',
      'deadline_change': 'compliance_deadline'
    }
    return typeMapping[updateType as keyof typeof typeMapping] || 'guidance_update'
  }

  private analyzeComplianceRequirements(update: RegulatoryUpdate, companyDomain: string): Array<{
    type: string
    priority: string
    title: string
    description: string
    steps: string[]
    effort: string
    deadline: string
    cost: number
  }> {
    const recommendations = []

    // Policy update recommendation
    if (update.key_changes.some(change => change.toLowerCase().includes('policy'))) {
      recommendations.push({
        type: 'policy_update',
        priority: update.impact_level === 'critical' ? 'critical' : 'high',
        title: 'Update Privacy Policy and Terms of Service',
        description: `Update legal documents to comply with new requirements in ${update.regulation_name}`,
        steps: [
          'Review current policy language',
          'Identify gaps against new requirements',
          'Draft policy updates',
          'Legal review and approval',
          'Implement and publish updates'
        ],
        effort: '2-4 weeks',
        deadline: update.effective_date,
        cost: 15000
      })
    }

    // Training recommendation
    recommendations.push({
      type: 'training_required',
      priority: 'medium',
      title: 'Staff Training on New Compliance Requirements',
      description: 'Train relevant staff on new regulatory requirements and procedures',
      steps: [
        'Develop training materials',
        'Identify key personnel',
        'Conduct training sessions',
        'Document completion'
      ],
      effort: '1-2 weeks',
      deadline: update.effective_date,
      cost: 5000
    })

    return recommendations
  }

  private async checkRegulatorySource(source: any): Promise<RegulatoryUpdate[]> {
    // In production, this would actually scrape or API call the source
    // For now, return mock updates
    if (Math.random() > 0.8) { // 20% chance of finding updates
      return [{
        jurisdiction_code: source.jurisdiction_code,
        jurisdiction_name: source.jurisdiction_code === 'EU' ? 'European Union' : 'United States',
        regulation_name: 'Mock Privacy Regulation',
        update_type: 'amendment' as const,
        title: 'New guidance on data processing consent',
        description: 'Updated guidance clarifying requirements for valid consent under privacy regulations.',
        effective_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        announcement_date: new Date().toISOString().split('T')[0],
        source_url: source.base_url,
        impact_level: 'medium' as const,
        affected_industries: ['technology', 'healthcare', 'finance'],
        key_changes: ['Consent must be specific and informed', 'Consent withdrawal must be easy'],
        compliance_requirements: ['Update consent forms', 'Review consent processes']
      }]
    }
    return []
  }

  /**
   * Get recent regulatory updates
   */
  async getRecentUpdates(limit: number = 20): Promise<RegulatoryUpdate[]> {
    const result = await this.db.query(`
      SELECT ru.*, j.name as jurisdiction_name
      FROM regulatory_updates ru
      JOIN jurisdictions j ON ru.jurisdiction_code = j.code
      ORDER BY ru.announcement_date DESC, ru.created_at DESC
      LIMIT $1
    `, [limit])

    return result.rows
  }

  /**
   * Get regulatory alerts for a company
   */
  async getCompanyAlerts(companyDomain: string, includeAcknowledged: boolean = false): Promise<RegulatoryAlert[]> {
    let query = `
      SELECT ra.*, ru.title as update_title, ru.regulation_name, j.name as jurisdiction_name
      FROM regulatory_alerts ra
      JOIN regulatory_updates ru ON ra.update_id = ru.id  
      JOIN jurisdictions j ON ru.jurisdiction_code = j.code
      WHERE ra.company_domain = $1
    `

    if (!includeAcknowledged) {
      query += ` AND ra.acknowledged_at IS NULL`
    }

    query += ` ORDER BY ra.priority DESC, ra.created_at DESC`

    const result = await this.db.query(query, [companyDomain])
    return result.rows
  }

  /**
   * Get compliance recommendations for a company
   */
  async getCompanyRecommendations(companyDomain: string, status?: string): Promise<ComplianceRecommendation[]> {
    let query = `
      SELECT cr.*, ru.title as update_title, ru.regulation_name
      FROM compliance_recommendations cr
      JOIN regulatory_updates ru ON cr.regulation_update_id = ru.id
      WHERE cr.company_domain = $1
    `

    const params = [companyDomain]

    if (status) {
      query += ` AND cr.status = $2`
      params.push(status)
    }

    query += ` ORDER BY cr.deadline ASC, cr.priority DESC`

    const result = await this.db.query(query, params)
    return result.rows
  }
}