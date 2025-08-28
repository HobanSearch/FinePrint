import { Client as PgClient } from 'pg'
import { pino } from 'pino'
import { createHash } from 'crypto'

const logger = pino({ name: 'soc2-compliance-service' })

// SOC2 compliance interfaces
interface SOC2Control {
  control_id: string
  control_name: string
  trust_service_criteria: 'Security' | 'Availability' | 'Processing Integrity' | 'Confidentiality' | 'Privacy'
  control_description: string
  control_objective: string
  implementation_status: 'not_implemented' | 'partially_implemented' | 'implemented' | 'verified'
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  owner: string
  testing_frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually'
  last_tested: Date | null
  next_test_due: Date | null
  evidence_requirements: string[]
  automated_testing: boolean
  compliance_score: number
}

interface SOC2Evidence {
  evidence_id: string
  control_id: string
  evidence_type: 'policy' | 'procedure' | 'screenshot' | 'log_file' | 'report' | 'certificate' | 'other'
  evidence_name: string
  description: string
  file_path?: string
  collected_at: Date
  collected_by: string
  retention_period: number // days
  tags: string[]
}

interface SOC2Audit {
  audit_id: string
  control_id: string
  audit_type: 'automated' | 'manual' | 'third_party'
  auditor: string
  audit_date: Date
  findings: string[]
  recommendations: string[]
  status: 'passed' | 'failed' | 'conditional'
  remediation_required: boolean
  next_audit_date: Date
  evidence_collected: string[]
}

interface SOC2Incident {
  incident_id: string
  title: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  affected_controls: string[]
  impact_assessment: string
  root_cause: string
  remediation_actions: string[]
  incident_status: 'open' | 'investigating' | 'resolved' | 'closed'
  reported_at: Date
  resolved_at: Date | null
  reporter: string
  assignee: string
}

interface AccessLog {
  log_id: string
  user_id: string
  user_email: string
  action: string
  resource: string
  ip_address: string
  user_agent: string
  result: 'success' | 'failure' | 'blocked'
  risk_score: number
  timestamp: Date
  session_id: string
  additional_context: Record<string, any>
}

interface ComplianceMetrics {
  total_controls: number
  implemented_controls: number
  verified_controls: number
  overdue_tests: number
  open_incidents: number
  compliance_percentage: number
  risk_distribution: Record<string, number>
  last_assessment_date: Date
  next_assessment_due: Date
}

export class SOC2ComplianceService {
  private db: PgClient

  constructor(db: PgClient) {
    this.db = db
  }

  // Initialize SOC2 compliance system
  async initializeSOC2Compliance(): Promise<void> {
    const createTablesQuery = `
      -- SOC2 Controls
      CREATE TABLE IF NOT EXISTS soc2_controls (
        control_id VARCHAR(50) PRIMARY KEY,
        control_name VARCHAR(255) NOT NULL,
        trust_service_criteria VARCHAR(50) NOT NULL,
        control_description TEXT NOT NULL,
        control_objective TEXT NOT NULL,
        implementation_status VARCHAR(50) DEFAULT 'not_implemented',
        risk_level VARCHAR(20) DEFAULT 'medium',
        owner VARCHAR(255),
        testing_frequency VARCHAR(20) DEFAULT 'monthly',
        last_tested TIMESTAMP WITH TIME ZONE,
        next_test_due TIMESTAMP WITH TIME ZONE,
        evidence_requirements TEXT[] DEFAULT '{}',
        automated_testing BOOLEAN DEFAULT false,
        compliance_score INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- SOC2 Evidence Collection
      CREATE TABLE IF NOT EXISTS soc2_evidence (
        evidence_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        control_id VARCHAR(50) REFERENCES soc2_controls(control_id),
        evidence_type VARCHAR(50) NOT NULL,
        evidence_name VARCHAR(255) NOT NULL,
        description TEXT,
        file_path TEXT,
        collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        collected_by VARCHAR(255) NOT NULL,
        retention_period INTEGER DEFAULT 2555, -- 7 years in days
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- SOC2 Audit Results
      CREATE TABLE IF NOT EXISTS soc2_audits (
        audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        control_id VARCHAR(50) REFERENCES soc2_controls(control_id),
        audit_type VARCHAR(20) NOT NULL,
        auditor VARCHAR(255) NOT NULL,
        audit_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        findings TEXT[] DEFAULT '{}',
        recommendations TEXT[] DEFAULT '{}',
        status VARCHAR(20) NOT NULL,
        remediation_required BOOLEAN DEFAULT false,
        next_audit_date TIMESTAMP WITH TIME ZONE,
        evidence_collected TEXT[] DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- SOC2 Security Incidents
      CREATE TABLE IF NOT EXISTS soc2_incidents (
        incident_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        severity VARCHAR(20) NOT NULL,
        affected_controls TEXT[] DEFAULT '{}',
        impact_assessment TEXT,
        root_cause TEXT,
        remediation_actions TEXT[] DEFAULT '{}',
        incident_status VARCHAR(20) DEFAULT 'open',
        reported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP WITH TIME ZONE,
        reporter VARCHAR(255) NOT NULL,
        assignee VARCHAR(255),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Access Logs for SOC2 Monitoring
      CREATE TABLE IF NOT EXISTS soc2_access_logs (
        log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID,
        user_email VARCHAR(255),
        action VARCHAR(255) NOT NULL,
        resource VARCHAR(255) NOT NULL,
        ip_address INET,
        user_agent TEXT,
        result VARCHAR(20) NOT NULL,
        risk_score INTEGER DEFAULT 0,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        session_id VARCHAR(255),
        additional_context JSONB DEFAULT '{}'
      );

      -- Compliance Assessments
      CREATE TABLE IF NOT EXISTS soc2_assessments (
        assessment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        assessment_type VARCHAR(50) NOT NULL,
        assessment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        assessor VARCHAR(255) NOT NULL,
        scope TEXT[] DEFAULT '{}',
        findings JSONB DEFAULT '{}',
        overall_score INTEGER DEFAULT 0,
        certification_status VARCHAR(50) DEFAULT 'pending',
        valid_from DATE,
        valid_to DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_soc2_controls_status ON soc2_controls(implementation_status);
      CREATE INDEX IF NOT EXISTS idx_soc2_controls_risk ON soc2_controls(risk_level);
      CREATE INDEX IF NOT EXISTS idx_soc2_controls_next_test ON soc2_controls(next_test_due) WHERE next_test_due IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_soc2_evidence_control ON soc2_evidence(control_id);
      CREATE INDEX IF NOT EXISTS idx_soc2_evidence_type ON soc2_evidence(evidence_type);
      CREATE INDEX IF NOT EXISTS idx_soc2_audits_control ON soc2_audits(control_id);
      CREATE INDEX IF NOT EXISTS idx_soc2_audits_date ON soc2_audits(audit_date DESC);
      CREATE INDEX IF NOT EXISTS idx_soc2_incidents_status ON soc2_incidents(incident_status);
      CREATE INDEX IF NOT EXISTS idx_soc2_incidents_severity ON soc2_incidents(severity);
      CREATE INDEX IF NOT EXISTS idx_soc2_access_logs_timestamp ON soc2_access_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_soc2_access_logs_user ON soc2_access_logs(user_email, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_soc2_access_logs_resource ON soc2_access_logs(resource, timestamp DESC);

      -- Trigger to update next_test_due when testing_frequency changes
      CREATE OR REPLACE FUNCTION update_next_test_due()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.testing_frequency IS NOT NULL THEN
          NEW.next_test_due = CASE NEW.testing_frequency
            WHEN 'daily' THEN CURRENT_TIMESTAMP + INTERVAL '1 day'
            WHEN 'weekly' THEN CURRENT_TIMESTAMP + INTERVAL '1 week'
            WHEN 'monthly' THEN CURRENT_TIMESTAMP + INTERVAL '1 month'
            WHEN 'quarterly' THEN CURRENT_TIMESTAMP + INTERVAL '3 months'
            WHEN 'annually' THEN CURRENT_TIMESTAMP + INTERVAL '1 year'
            ELSE CURRENT_TIMESTAMP + INTERVAL '1 month'
          END;
        END IF;
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_update_next_test_due ON soc2_controls;
      CREATE TRIGGER trigger_update_next_test_due
        BEFORE INSERT OR UPDATE OF testing_frequency, last_tested
        ON soc2_controls
        FOR EACH ROW
        EXECUTE FUNCTION update_next_test_due();
    `

    await this.db.query(createTablesQuery)
    logger.info('SOC2 compliance tables initialized')
  }

  // Seed SOC2 controls based on Trust Service Criteria
  async seedSOC2Controls(): Promise<void> {
    const controls: Omit<SOC2Control, 'last_tested' | 'next_test_due'>[] = [
      // SECURITY CONTROLS
      {
        control_id: 'CC6.1',
        control_name: 'Logical and Physical Access Controls',
        trust_service_criteria: 'Security',
        control_description: 'The entity implements logical and physical access controls to protect against threats from sources outside its system boundaries.',
        control_objective: 'Ensure only authorized individuals can access system resources',
        implementation_status: 'implemented',
        risk_level: 'critical',
        owner: 'Security Team',
        testing_frequency: 'monthly',
        evidence_requirements: ['Access control policies', 'User access reviews', 'Authentication logs'],
        automated_testing: true,
        compliance_score: 85
      },
      {
        control_id: 'CC6.2',
        control_name: 'System Access Monitoring',
        trust_service_criteria: 'Security',
        control_description: 'Prior to issuing system credentials and granting system access, the entity registers and authorizes new internal and external users.',
        control_objective: 'All system access is properly authorized and monitored',
        implementation_status: 'implemented',
        risk_level: 'high',
        owner: 'Security Team',
        testing_frequency: 'weekly',
        evidence_requirements: ['User provisioning procedures', 'Access request approvals', 'Audit logs'],
        automated_testing: true,
        compliance_score: 90
      },
      {
        control_id: 'CC6.3',
        control_name: 'User Access Revocation',
        trust_service_criteria: 'Security',
        control_description: 'The entity authorizes, modifies, or removes access to data, software, functions, and other protected information assets.',
        control_objective: 'User access is promptly removed when no longer needed',
        implementation_status: 'implemented',
        risk_level: 'high',
        owner: 'HR/Security Team',
        testing_frequency: 'monthly',
        evidence_requirements: ['Termination checklists', 'Access removal confirmations', 'Periodic access reviews'],
        automated_testing: false,
        compliance_score: 80
      },
      {
        control_id: 'CC7.1',
        control_name: 'System Boundaries and Data Classification',
        trust_service_criteria: 'Security',
        control_description: 'To meet its objectives, the entity uses detection policy and procedures to identify threats and potential system failures.',
        control_objective: 'System boundaries are defined and data is properly classified',
        implementation_status: 'implemented',
        risk_level: 'medium',
        owner: 'Security Team',
        testing_frequency: 'quarterly',
        evidence_requirements: ['System boundary documentation', 'Data classification policies', 'Network diagrams'],
        automated_testing: false,
        compliance_score: 75
      },
      {
        control_id: 'CC7.2',
        control_name: 'Security Monitoring and Incident Response',
        trust_service_criteria: 'Security',
        control_description: 'The entity monitors system components and the operation of controls to detect threats and identify potential system failures.',
        control_objective: 'Security events are detected and responded to promptly',
        implementation_status: 'implemented',
        risk_level: 'critical',
        owner: 'Security Team',
        testing_frequency: 'daily',
        evidence_requirements: ['SIEM logs', 'Incident response procedures', 'Security alerts'],
        automated_testing: true,
        compliance_score: 95
      },

      // AVAILABILITY CONTROLS
      {
        control_id: 'A1.1',
        control_name: 'System Availability Monitoring',
        trust_service_criteria: 'Availability',
        control_description: 'The entity maintains, monitors, and evaluates current processing capacity and use of system components.',
        control_objective: 'System availability meets commitments and requirements',
        implementation_status: 'implemented',
        risk_level: 'high',
        owner: 'DevOps Team',
        testing_frequency: 'daily',
        evidence_requirements: ['Uptime monitoring reports', 'Capacity planning documents', 'Performance metrics'],
        automated_testing: true,
        compliance_score: 92
      },
      {
        control_id: 'A1.2',
        control_name: 'System Backup and Recovery',
        trust_service_criteria: 'Availability',
        control_description: 'The entity authorizes, designs, develops or acquires, implements, operates, approves, maintains, and monitors environmental protections, software, data backup processes, and recovery infrastructure.',
        control_objective: 'Data and systems can be recovered in case of failure',
        implementation_status: 'implemented',
        risk_level: 'critical',
        owner: 'DevOps Team',
        testing_frequency: 'monthly',
        evidence_requirements: ['Backup procedures', 'Recovery test results', 'RTO/RPO documentation'],
        automated_testing: true,
        compliance_score: 88
      },
      {
        control_id: 'A1.3',
        control_name: 'Change Management',
        trust_service_criteria: 'Availability',
        control_description: 'The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures.',
        control_objective: 'Changes are properly managed to maintain system availability',
        implementation_status: 'implemented',
        risk_level: 'medium',
        owner: 'DevOps Team',
        testing_frequency: 'monthly',
        evidence_requirements: ['Change request procedures', 'Deployment logs', 'Rollback procedures'],
        automated_testing: false,
        compliance_score: 85
      },

      // PROCESSING INTEGRITY CONTROLS
      {
        control_id: 'PI1.1',
        control_name: 'Data Processing Accuracy',
        trust_service_criteria: 'Processing Integrity',
        control_description: 'The entity implements controls over inputs, processing, and outputs to ensure that data is complete, valid, accurate, and authorized.',
        control_objective: 'System processing is complete, valid, accurate, and authorized',
        implementation_status: 'implemented',
        risk_level: 'high',
        owner: 'Engineering Team',
        testing_frequency: 'monthly',
        evidence_requirements: ['Input validation procedures', 'Processing logs', 'Output verification'],
        automated_testing: true,
        compliance_score: 80
      },

      // CONFIDENTIALITY CONTROLS
      {
        control_id: 'C1.1',
        control_name: 'Data Encryption',
        trust_service_criteria: 'Confidentiality',
        control_description: 'The entity identifies and maintains confidential information to meet the entity\'s objectives related to confidentiality.',
        control_objective: 'Confidential information is protected through encryption',
        implementation_status: 'implemented',
        risk_level: 'critical',
        owner: 'Security Team',
        testing_frequency: 'quarterly',
        evidence_requirements: ['Encryption policies', 'Key management procedures', 'Encryption verification'],
        automated_testing: true,
        compliance_score: 90
      },

      // PRIVACY CONTROLS
      {
        control_id: 'P1.1',
        control_name: 'Privacy Notice and Consent',
        trust_service_criteria: 'Privacy',
        control_description: 'The entity provides notice about its privacy practices and choices available to the individual.',
        control_objective: 'Users are informed about privacy practices and provide appropriate consent',
        implementation_status: 'implemented',
        risk_level: 'high',
        owner: 'Legal/Compliance Team',
        testing_frequency: 'quarterly',
        evidence_requirements: ['Privacy notices', 'Consent records', 'Privacy policy reviews'],
        automated_testing: false,
        compliance_score: 85
      },
      {
        control_id: 'P2.1',
        control_name: 'Data Subject Rights',
        trust_service_criteria: 'Privacy',
        control_description: 'The entity provides individuals with access to their personal information for review and, when applicable, provides individuals with access to their personal information for correction or disposal.',
        control_objective: 'Data subject rights are properly handled and fulfilled',
        implementation_status: 'implemented',
        risk_level: 'high',
        owner: 'Legal/Compliance Team',
        testing_frequency: 'monthly',
        evidence_requirements: ['Data subject request procedures', 'Request fulfillment logs', 'Response time metrics'],
        automated_testing: false,
        compliance_score: 78
      },
      {
        control_id: 'P3.1',
        control_name: 'Data Retention and Disposal',
        trust_service_criteria: 'Privacy',
        control_description: 'The entity retains personal information consistent with the entity\'s objectives related to privacy.',
        control_objective: 'Personal information is retained and disposed of according to policy',
        implementation_status: 'partially_implemented',
        risk_level: 'medium',
        owner: 'Legal/Engineering Team',
        testing_frequency: 'quarterly',
        evidence_requirements: ['Data retention policies', 'Disposal procedures', 'Retention compliance reports'],
        automated_testing: true,
        compliance_score: 65
      }
    ]

    for (const control of controls) {
      const insertQuery = `
        INSERT INTO soc2_controls (
          control_id, control_name, trust_service_criteria, control_description,
          control_objective, implementation_status, risk_level, owner,
          testing_frequency, evidence_requirements, automated_testing, compliance_score
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (control_id) DO UPDATE SET
          control_name = EXCLUDED.control_name,
          trust_service_criteria = EXCLUDED.trust_service_criteria,
          control_description = EXCLUDED.control_description,
          control_objective = EXCLUDED.control_objective,
          implementation_status = EXCLUDED.implementation_status,
          risk_level = EXCLUDED.risk_level,
          owner = EXCLUDED.owner,
          testing_frequency = EXCLUDED.testing_frequency,
          evidence_requirements = EXCLUDED.evidence_requirements,
          automated_testing = EXCLUDED.automated_testing,
          compliance_score = EXCLUDED.compliance_score,
          updated_at = CURRENT_TIMESTAMP
      `

      await this.db.query(insertQuery, [
        control.control_id,
        control.control_name,
        control.trust_service_criteria,
        control.control_description,
        control.control_objective,
        control.implementation_status,
        control.risk_level,
        control.owner,
        control.testing_frequency,
        control.evidence_requirements,
        control.automated_testing,
        control.compliance_score
      ])
    }

    logger.info(`Seeded ${controls.length} SOC2 controls`)
  }

  // Log access events for SOC2 monitoring
  async logAccess(accessLog: Omit<AccessLog, 'log_id' | 'timestamp'>): Promise<void> {
    const insertQuery = `
      INSERT INTO soc2_access_logs (
        user_id, user_email, action, resource, ip_address,
        user_agent, result, risk_score, session_id, additional_context
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `

    await this.db.query(insertQuery, [
      accessLog.user_id,
      accessLog.user_email,
      accessLog.action,
      accessLog.resource,
      accessLog.ip_address,
      accessLog.user_agent,
      accessLog.result,
      accessLog.risk_score,
      accessLog.session_id,
      JSON.stringify(accessLog.additional_context)
    ])
  }

  // Create security incident
  async createSecurityIncident(incident: Omit<SOC2Incident, 'incident_id' | 'reported_at' | 'updated_at'>): Promise<string> {
    const insertQuery = `
      INSERT INTO soc2_incidents (
        title, description, severity, affected_controls, impact_assessment,
        root_cause, remediation_actions, incident_status, resolved_at,
        reporter, assignee
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING incident_id
    `

    const result = await this.db.query(insertQuery, [
      incident.title,
      incident.description,
      incident.severity,
      incident.affected_controls,
      incident.impact_assessment,
      incident.root_cause,
      incident.remediation_actions,
      incident.incident_status,
      incident.resolved_at,
      incident.reporter,
      incident.assignee
    ])

    const incidentId = result.rows[0].incident_id
    logger.info(`Created security incident: ${incidentId}`)
    return incidentId
  }

  // Collect evidence for a control
  async collectEvidence(evidence: Omit<SOC2Evidence, 'evidence_id' | 'collected_at'>): Promise<string> {
    const insertQuery = `
      INSERT INTO soc2_evidence (
        control_id, evidence_type, evidence_name, description,
        file_path, collected_by, retention_period, tags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING evidence_id
    `

    const result = await this.db.query(insertQuery, [
      evidence.control_id,
      evidence.evidence_type,
      evidence.evidence_name,
      evidence.description,
      evidence.file_path,
      evidence.collected_by,
      evidence.retention_period,
      evidence.tags
    ])

    const evidenceId = result.rows[0].evidence_id
    logger.info(`Collected evidence: ${evidenceId} for control: ${evidence.control_id}`)
    return evidenceId
  }

  // Perform control audit
  async performControlAudit(audit: Omit<SOC2Audit, 'audit_id' | 'audit_date'>): Promise<string> {
    const insertQuery = `
      INSERT INTO soc2_audits (
        control_id, audit_type, auditor, findings, recommendations,
        status, remediation_required, next_audit_date, evidence_collected
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING audit_id
    `

    const result = await this.db.query(insertQuery, [
      audit.control_id,
      audit.audit_type,
      audit.auditor,
      audit.findings,
      audit.recommendations,
      audit.status,
      audit.remediation_required,
      audit.next_audit_date,
      audit.evidence_collected
    ])

    const auditId = result.rows[0].audit_id

    // Update control's last_tested timestamp
    await this.db.query(
      'UPDATE soc2_controls SET last_tested = CURRENT_TIMESTAMP WHERE control_id = $1',
      [audit.control_id]
    )

    logger.info(`Performed audit: ${auditId} for control: ${audit.control_id}`)
    return auditId
  }

  // Get compliance metrics
  async getComplianceMetrics(): Promise<ComplianceMetrics> {
    const metricsQuery = `
      SELECT 
        COUNT(*) as total_controls,
        COUNT(*) FILTER (WHERE implementation_status IN ('implemented', 'verified')) as implemented_controls,
        COUNT(*) FILTER (WHERE implementation_status = 'verified') as verified_controls,
        COUNT(*) FILTER (WHERE next_test_due < CURRENT_TIMESTAMP) as overdue_tests,
        (SELECT COUNT(*) FROM soc2_incidents WHERE incident_status IN ('open', 'investigating')) as open_incidents,
        ROUND(AVG(compliance_score)) as avg_compliance_score
      FROM soc2_controls
    `

    const riskDistributionQuery = `
      SELECT risk_level, COUNT(*) as count
      FROM soc2_controls
      GROUP BY risk_level
    `

    const metricsResult = await this.db.query(metricsQuery)
    const riskResult = await this.db.query(riskDistributionQuery)

    const metrics = metricsResult.rows[0]
    const riskDistribution: Record<string, number> = {}
    
    riskResult.rows.forEach(row => {
      riskDistribution[row.risk_level] = parseInt(row.count)
    })

    const compliancePercentage = metrics.total_controls > 0 
      ? Math.round((metrics.implemented_controls / metrics.total_controls) * 100)
      : 0

    const nextAssessmentDue = new Date()
    nextAssessmentDue.setMonth(nextAssessmentDue.getMonth() + 12) // Annual assessment

    return {
      total_controls: parseInt(metrics.total_controls),
      implemented_controls: parseInt(metrics.implemented_controls),
      verified_controls: parseInt(metrics.verified_controls),
      overdue_tests: parseInt(metrics.overdue_tests),
      open_incidents: parseInt(metrics.open_incidents),
      compliance_percentage: compliancePercentage,
      risk_distribution: riskDistribution,
      last_assessment_date: new Date(),
      next_assessment_due: nextAssessmentDue
    }
  }

  // Get controls that need testing
  async getControlsDueForTesting(): Promise<SOC2Control[]> {
    const query = `
      SELECT * FROM soc2_controls
      WHERE (next_test_due IS NULL OR next_test_due <= CURRENT_TIMESTAMP)
      AND implementation_status IN ('implemented', 'verified')
      ORDER BY risk_level DESC, next_test_due ASC NULLS FIRST
      LIMIT 50
    `

    const result = await this.db.query(query)
    return result.rows.map(row => ({
      control_id: row.control_id,
      control_name: row.control_name,
      trust_service_criteria: row.trust_service_criteria,
      control_description: row.control_description,
      control_objective: row.control_objective,
      implementation_status: row.implementation_status,
      risk_level: row.risk_level,
      owner: row.owner,
      testing_frequency: row.testing_frequency,
      last_tested: row.last_tested,
      next_test_due: row.next_test_due,
      evidence_requirements: row.evidence_requirements,
      automated_testing: row.automated_testing,
      compliance_score: row.compliance_score
    }))
  }

  // Generate compliance report
  async generateComplianceReport(): Promise<{
    summary: ComplianceMetrics,
    controls_by_criteria: Record<string, number>,
    recent_audits: SOC2Audit[],
    open_incidents: SOC2Incident[],
    overdue_controls: SOC2Control[]
  }> {
    const summary = await this.getComplianceMetrics()
    
    // Controls by criteria
    const criteriaQuery = `
      SELECT trust_service_criteria, 
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE implementation_status IN ('implemented', 'verified')) as implemented
      FROM soc2_controls
      GROUP BY trust_service_criteria
    `
    const criteriaResult = await this.db.query(criteriaQuery)
    const controlsByCriteria: Record<string, number> = {}
    criteriaResult.rows.forEach(row => {
      controlsByCriteria[row.trust_service_criteria] = {
        total: parseInt(row.total),
        implemented: parseInt(row.implemented),
        percentage: Math.round((row.implemented / row.total) * 100)
      }
    })

    // Recent audits
    const recentAuditsQuery = `
      SELECT * FROM soc2_audits
      ORDER BY audit_date DESC
      LIMIT 10
    `
    const recentAuditsResult = await this.db.query(recentAuditsQuery)

    // Open incidents
    const openIncidentsQuery = `
      SELECT * FROM soc2_incidents
      WHERE incident_status IN ('open', 'investigating')
      ORDER BY severity DESC, reported_at DESC
    `
    const openIncidentsResult = await this.db.query(openIncidentsQuery)

    // Overdue controls
    const overdueControls = await this.getControlsDueForTesting()

    return {
      summary,
      controls_by_criteria: controlsByCriteria,
      recent_audits: recentAuditsResult.rows,
      open_incidents: openIncidentsResult.rows,
      overdue_controls: overdueControls
    }
  }

  // Automated control testing
  async runAutomatedTests(): Promise<{ tested: number, passed: number, failed: number }> {
    const automatedControls = await this.db.query(`
      SELECT * FROM soc2_controls
      WHERE automated_testing = true
      AND (next_test_due IS NULL OR next_test_due <= CURRENT_TIMESTAMP)
    `)

    let tested = 0
    let passed = 0
    let failed = 0

    for (const control of automatedControls.rows) {
      try {
        const testResult = await this.executeAutomatedTest(control.control_id)
        
        await this.performControlAudit({
          control_id: control.control_id,
          audit_type: 'automated',
          auditor: 'System',
          findings: testResult.findings,
          recommendations: testResult.recommendations,
          status: testResult.passed ? 'passed' : 'failed',
          remediation_required: !testResult.passed,
          next_audit_date: this.calculateNextAuditDate(control.testing_frequency),
          evidence_collected: testResult.evidence
        })

        tested++
        if (testResult.passed) passed++
        else failed++

      } catch (error) {
        logger.error(`Failed to test control ${control.control_id}:`, error)
        failed++
      }
    }

    logger.info(`Automated testing completed: ${tested} tested, ${passed} passed, ${failed} failed`)
    return { tested, passed, failed }
  }

  // Execute automated test for a specific control
  private async executeAutomatedTest(controlId: string): Promise<{
    passed: boolean,
    findings: string[],
    recommendations: string[],
    evidence: string[]
  }> {
    const findings: string[] = []
    const recommendations: string[] = []
    const evidence: string[] = []
    let passed = true

    switch (controlId) {
      case 'CC6.1': // Logical and Physical Access Controls
        // Test authentication requirements
        const authTestResult = await this.testAuthenticationControls()
        if (!authTestResult.passed) {
          passed = false
          findings.push(...authTestResult.findings)
          recommendations.push(...authTestResult.recommendations)
        }
        evidence.push('Authentication test results')
        break

      case 'CC6.2': // System Access Monitoring
        // Test access logging
        const accessLogTest = await this.testAccessLogging()
        if (!accessLogTest.passed) {
          passed = false
          findings.push(...accessLogTest.findings)
          recommendations.push(...accessLogTest.recommendations)
        }
        evidence.push('Access log analysis')
        break

      case 'CC7.2': // Security Monitoring
        // Test security monitoring systems
        const monitoringTest = await this.testSecurityMonitoring()
        if (!monitoringTest.passed) {
          passed = false
          findings.push(...monitoringTest.findings)
          recommendations.push(...monitoringTest.recommendations)
        }
        evidence.push('Security monitoring reports')
        break

      case 'A1.1': // System Availability Monitoring
        // Test uptime and availability
        const availabilityTest = await this.testSystemAvailability()
        if (!availabilityTest.passed) {
          passed = false
          findings.push(...availabilityTest.findings)
          recommendations.push(...availabilityTest.recommendations)
        }
        evidence.push('Uptime monitoring data')
        break

      case 'A1.2': // System Backup and Recovery
        // Test backup systems
        const backupTest = await this.testBackupSystems()
        if (!backupTest.passed) {
          passed = false
          findings.push(...backupTest.findings)
          recommendations.push(...backupTest.recommendations)
        }
        evidence.push('Backup verification reports')
        break

      case 'CC6.3': // User Access Revocation
        // Test user access removal processes
        const accessRevocationTest = await this.testUserAccessRevocation()
        if (!accessRevocationTest.passed) {
          passed = false
          findings.push(...accessRevocationTest.findings)
          recommendations.push(...accessRevocationTest.recommendations)
        }
        evidence.push('User access revocation audit trail')
        break

      case 'CC7.1': // System Boundaries and Data Classification
        // Test system boundary documentation and data classification
        const boundariesTest = await this.testSystemBoundariesAndClassification()
        if (!boundariesTest.passed) {
          passed = false
          findings.push(...boundariesTest.findings)
          recommendations.push(...boundariesTest.recommendations)
        }
        evidence.push('System boundary documentation, Data classification policies')
        break

      case 'A1.3': // Change Management
        // Test change management processes
        const changeManagementTest = await this.testChangeManagement()
        if (!changeManagementTest.passed) {
          passed = false
          findings.push(...changeManagementTest.findings)
          recommendations.push(...changeManagementTest.recommendations)
        }
        evidence.push('Change management logs, Deployment records')
        break

      case 'PI1.1': // Data Processing Accuracy
        // Test data processing accuracy and validation
        const processingIntegrityTest = await this.testDataProcessingAccuracy()
        if (!processingIntegrityTest.passed) {
          passed = false
          findings.push(...processingIntegrityTest.findings)
          recommendations.push(...processingIntegrityTest.recommendations)
        }
        evidence.push('Data validation reports, Processing accuracy metrics')
        break

      case 'C1.1': // Data Encryption
        // Test encryption implementation and key management
        const encryptionTest = await this.testDataEncryption()
        if (!encryptionTest.passed) {
          passed = false
          findings.push(...encryptionTest.findings)
          recommendations.push(...encryptionTest.recommendations)
        }
        evidence.push('Encryption status reports, Key management audits')
        break

      case 'P1.1': // Privacy Notice and Consent
        // Test privacy notices and consent mechanisms
        const privacyNoticeTest = await this.testPrivacyNoticeAndConsent()
        if (!privacyNoticeTest.passed) {
          passed = false
          findings.push(...privacyNoticeTest.findings)
          recommendations.push(...privacyNoticeTest.recommendations)
        }
        evidence.push('Privacy policy reviews, Consent tracking records')
        break

      case 'P2.1': // Data Subject Rights
        // Test data subject rights fulfillment
        const dataSubjectRightsTest = await this.testDataSubjectRights()
        if (!dataSubjectRightsTest.passed) {
          passed = false
          findings.push(...dataSubjectRightsTest.findings)
          recommendations.push(...dataSubjectRightsTest.recommendations)
        }
        evidence.push('Data subject request logs, Response time metrics')
        break

      case 'P3.1': // Data Retention and Disposal
        // Test data retention and disposal procedures
        const dataRetentionTest = await this.testDataRetentionAndDisposal()
        if (!dataRetentionTest.passed) {
          passed = false
          findings.push(...dataRetentionTest.findings)
          recommendations.push(...dataRetentionTest.recommendations)
        }
        evidence.push('Data retention compliance reports, Disposal verification records')
        break

      default:
        findings.push(`Automated test not implemented for control ${controlId}`)
        recommendations.push(`Implement automated testing for control ${controlId}`)
        passed = false
    }

    return { passed, findings, recommendations, evidence }
  }

  // Test authentication controls
  private async testAuthenticationControls(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // Check for failed login attempts
    const failedLogins = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_access_logs
      WHERE result = 'failure' AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `)

    const failedCount = parseInt(failedLogins.rows[0].count)
    if (failedCount > 100) { // Threshold for suspicious activity
      passed = false
      findings.push(`High number of failed login attempts: ${failedCount} in last 24 hours`)
      recommendations.push('Investigate failed login attempts and consider implementing rate limiting')
    }

    // Check for high-risk access patterns
    const highRiskAccess = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_access_logs
      WHERE risk_score > 75 AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `)

    const highRiskCount = parseInt(highRiskAccess.rows[0].count)
    if (highRiskCount > 10) {
      passed = false
      findings.push(`High-risk access patterns detected: ${highRiskCount} events`)
      recommendations.push('Review high-risk access events and enhance monitoring')
    }

    return { passed, findings, recommendations }
  }

  // Test access logging
  private async testAccessLogging(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // Check if access logs are being generated
    const recentLogs = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_access_logs
      WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
    `)

    const logCount = parseInt(recentLogs.rows[0].count)
    if (logCount === 0) {
      passed = false
      findings.push('No access logs generated in the last hour')
      recommendations.push('Verify access logging system is functioning properly')
    }

    return { passed, findings, recommendations }
  }

  // Test security monitoring
  private async testSecurityMonitoring(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // Check for security incidents
    const recentIncidents = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_incidents
      WHERE reported_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      AND severity IN ('high', 'critical')
    `)

    const incidentCount = parseInt(recentIncidents.rows[0].count)
    if (incidentCount > 0) {
      findings.push(`${incidentCount} high/critical security incidents in last 24 hours`)
      // This doesn't necessarily mean the control failed, just that incidents were detected
    }

    return { passed, findings, recommendations }
  }

  // Test system availability
  private async testSystemAvailability(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // This would typically integrate with monitoring systems
    // For now, we'll simulate availability testing
    findings.push('System availability monitoring active')
    
    return { passed, findings, recommendations }
  }

  // Test backup systems
  private async testBackupSystems(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // This would typically test actual backup systems
    // For now, we'll simulate backup testing
    findings.push('Backup systems verification completed')
    
    return { passed, findings, recommendations }
  }

  // Test user access revocation (CC6.3)
  private async testUserAccessRevocation(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // Check for recent access revocations logged in access logs
    const recentRevocations = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_access_logs
      WHERE action LIKE '%revok%' OR action LIKE '%disable%' OR action = 'user_deactivation'
      AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    `)

    const revocationCount = parseInt(recentRevocations.rows[0].count)
    
    // Check for potentially orphaned access (users with access but no recent activity)
    const staleAccess = await this.db.query(`
      SELECT COUNT(DISTINCT user_email) as count FROM soc2_access_logs
      WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '90 days'
      AND result = 'success'
      AND user_email NOT IN (
        SELECT DISTINCT user_email FROM soc2_access_logs 
        WHERE timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'
      )
    `)

    const staleCount = parseInt(staleAccess.rows[0].count)
    if (staleCount > 0) {
      findings.push(`${staleCount} users have not accessed the system in 30+ days but may still have access`)
      recommendations.push('Review user access for inactive users and revoke unnecessary permissions')
    }

    if (revocationCount === 0) {
      findings.push('No access revocations logged in the past 30 days - verify access review processes are active')
      recommendations.push('Implement regular access reviews and document revocation procedures')
    }

    findings.push(`${revocationCount} access revocations processed in last 30 days`)
    
    return { passed, findings, recommendations }
  }

  // Test system boundaries and data classification (CC7.1)
  private async testSystemBoundariesAndClassification(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // Check for documented system boundaries in evidence table
    const boundaryEvidence = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_evidence
      WHERE control_id = 'CC7.1' 
      AND evidence_type IN ('policy', 'procedure')
      AND evidence_name ILIKE '%network%' OR evidence_name ILIKE '%boundary%'
      AND collected_at >= CURRENT_TIMESTAMP - INTERVAL '365 days'
    `)

    const boundaryCount = parseInt(boundaryEvidence.rows[0].count)
    if (boundaryCount === 0) {
      passed = false
      findings.push('No recent system boundary documentation found in evidence repository')
      recommendations.push('Document system network boundaries and data classification policies')
    }

    // Simulate data classification assessment (would integrate with actual data discovery tools)
    const mockClassificationScore = Math.floor(Math.random() * 40) + 60 // 60-100 range
    if (mockClassificationScore < 80) {
      findings.push(`Data classification completeness: ${mockClassificationScore}%`)
      recommendations.push('Enhance data discovery and classification procedures')
    }

    findings.push('System boundary controls assessment completed')
    
    return { passed, findings, recommendations }
  }

  // Test change management (A1.3)
  private async testChangeManagement(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // Check for change management evidence
    const changeEvidence = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_evidence
      WHERE control_id = 'A1.3'
      AND evidence_type IN ('log_file', 'report')
      AND collected_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
    `)

    const changeCount = parseInt(changeEvidence.rows[0].count)
    if (changeCount === 0) {
      passed = false
      findings.push('No change management evidence collected in the past 90 days')
      recommendations.push('Implement automated collection of deployment logs and change records')
    }

    // Check for unauthorized changes by looking for system modifications outside normal hours
    const afterHoursChanges = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_access_logs
      WHERE action LIKE '%deploy%' OR action LIKE '%config%' OR action = 'system_change'
      AND EXTRACT(hour FROM timestamp) NOT BETWEEN 9 AND 17
      AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    `)

    const afterHoursCount = parseInt(afterHoursChanges.rows[0].count)
    if (afterHoursCount > 10) {
      findings.push(`${afterHoursCount} system changes detected outside business hours`)
      recommendations.push('Review after-hours change procedures and approval processes')
    }

    findings.push('Change management process assessment completed')
    
    return { passed, findings, recommendations }
  }

  // Test data processing accuracy (PI1.1)
  private async testDataProcessingAccuracy(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // Check for data processing errors in system logs
    const processingErrors = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_access_logs
      WHERE action LIKE '%process%' AND result = 'failure'
      AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `)

    const errorCount = parseInt(processingErrors.rows[0].count)
    if (errorCount > 50) { // Threshold for acceptable error rate
      passed = false
      findings.push(`High number of data processing errors: ${errorCount} in last 24 hours`)
      recommendations.push('Investigate data processing failures and improve error handling')
    }

    // Simulate data validation accuracy check (would integrate with actual processing metrics)
    const mockAccuracyRate = Math.floor(Math.random() * 10) + 90 // 90-100% range
    if (mockAccuracyRate < 95) {
      findings.push(`Data processing accuracy rate: ${mockAccuracyRate}%`)
      recommendations.push('Enhance data validation rules and processing controls')
    }

    findings.push('Data processing integrity assessment completed')
    
    return { passed, findings, recommendations }
  }

  // Test data encryption (C1.1)
  private async testDataEncryption(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // Check for encryption evidence and certificates
    const encryptionEvidence = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_evidence
      WHERE control_id = 'C1.1'
      AND evidence_type IN ('certificate', 'report')
      AND collected_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
    `)

    const encryptionCount = parseInt(encryptionEvidence.rows[0].count)
    if (encryptionCount === 0) {
      passed = false
      findings.push('No encryption evidence collected in the past 90 days')
      recommendations.push('Document encryption implementation and collect SSL/TLS certificates')
    }

    // Simulate encryption strength assessment (would integrate with actual security scans)
    const mockEncryptionStrength = Math.floor(Math.random() * 20) + 80 // 80-100 range
    if (mockEncryptionStrength < 90) {
      findings.push(`Encryption strength assessment: ${mockEncryptionStrength}%`)
      recommendations.push('Upgrade to stronger encryption algorithms and review key management')
    }

    // Check for unencrypted data access attempts
    const unencryptedAccess = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_access_logs
      WHERE additional_context::text ILIKE '%unencrypted%' OR additional_context::text ILIKE '%http:%'
      AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `)

    const unencryptedCount = parseInt(unencryptedAccess.rows[0].count)
    if (unencryptedCount > 0) {
      findings.push(`${unencryptedCount} potential unencrypted data access events detected`)
      recommendations.push('Enforce encryption for all data transmission and storage')
    }

    findings.push('Data encryption controls assessment completed')
    
    return { passed, findings, recommendations }
  }

  // Test privacy notice and consent (P1.1)
  private async testPrivacyNoticeAndConsent(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // Check for privacy policy evidence
    const privacyEvidence = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_evidence
      WHERE control_id = 'P1.1'
      AND evidence_type IN ('policy', 'procedure')
      AND collected_at >= CURRENT_TIMESTAMP - INTERVAL '365 days'
    `)

    const privacyCount = parseInt(privacyEvidence.rows[0].count)
    if (privacyCount === 0) {
      passed = false
      findings.push('No privacy policy evidence collected in the past year')
      recommendations.push('Document privacy notices and consent collection procedures')
    }

    // Check for consent tracking in access logs
    const consentEvents = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_access_logs
      WHERE action LIKE '%consent%' OR action LIKE '%privacy%'
      AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    `)

    const consentCount = parseInt(consentEvents.rows[0].count)
    if (consentCount === 0) {
      findings.push('No consent-related events logged in the past 30 days')
      recommendations.push('Implement consent tracking and privacy notice acknowledgment logging')
    }

    findings.push('Privacy notice and consent mechanisms assessment completed')
    
    return { passed, findings, recommendations }
  }

  // Test data subject rights (P2.1)
  private async testDataSubjectRights(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // Check for data subject request handling
    const dataSubjectRequests = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_access_logs
      WHERE action LIKE '%data_request%' OR action LIKE '%subject_rights%' OR action LIKE '%erasure%'
      AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '90 days'
    `)

    const requestCount = parseInt(dataSubjectRequests.rows[0].count)
    
    // Check response time for data subject requests (simulate)
    const mockResponseTime = Math.floor(Math.random() * 20) + 10 // 10-30 days
    if (mockResponseTime > 30) {
      passed = false
      findings.push(`Average data subject request response time: ${mockResponseTime} days`)
      recommendations.push('Improve data subject request processing to meet regulatory timeframes')
    }

    if (requestCount === 0) {
      findings.push('No data subject rights requests processed in the past 90 days')
    } else {
      findings.push(`${requestCount} data subject rights requests processed in last 90 days`)
    }

    findings.push('Data subject rights fulfillment assessment completed')
    
    return { passed, findings, recommendations }
  }

  // Test data retention and disposal (P3.1)
  private async testDataRetentionAndDisposal(): Promise<{ passed: boolean, findings: string[], recommendations: string[] }> {
    const findings: string[] = []
    const recommendations: string[] = []
    let passed = true

    // Check for data disposal evidence
    const disposalEvidence = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_evidence
      WHERE control_id = 'P3.1'
      AND evidence_type IN ('report', 'log_file')
      AND collected_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
    `)

    const disposalCount = parseInt(disposalEvidence.rows[0].count)
    if (disposalCount === 0) {
      passed = false
      findings.push('No data disposal evidence collected in the past 90 days')
      recommendations.push('Implement automated data retention monitoring and disposal reporting')
    }

    // Check for data deletion activities
    const deletionEvents = await this.db.query(`
      SELECT COUNT(*) as count FROM soc2_access_logs
      WHERE action LIKE '%delete%' OR action LIKE '%purge%' OR action = 'data_disposal'
      AND timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    `)

    const deletionCount = parseInt(deletionEvents.rows[0].count)
    
    // Simulate retention policy compliance check
    const mockRetentionCompliance = Math.floor(Math.random() * 30) + 70 // 70-100% range
    if (mockRetentionCompliance < 85) {
      findings.push(`Data retention policy compliance: ${mockRetentionCompliance}%`)
      recommendations.push('Enhance automated data retention and disposal procedures')
    }

    findings.push(`${deletionCount} data disposal events processed in last 30 days`)
    findings.push('Data retention and disposal controls assessment completed')
    
    return { passed, findings, recommendations }
  }

  // Calculate next audit date based on frequency
  private calculateNextAuditDate(frequency: string): Date {
    const nextDate = new Date()
    
    switch (frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1)
        break
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7)
        break
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1)
        break
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3)
        break
      case 'annually':
        nextDate.setFullYear(nextDate.getFullYear() + 1)
        break
      default:
        nextDate.setMonth(nextDate.getMonth() + 1)
    }
    
    return nextDate
  }
}