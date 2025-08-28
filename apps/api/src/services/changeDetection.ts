/**
 * Change Detection System for Real-time Policy Monitoring
 * 
 * This service monitors legal documents for changes in real-time,
 * analyzes the significance of changes, and triggers appropriate actions
 * including user notifications and compliance assessments.
 */

import { Pool } from 'pg'
import crypto from 'crypto'

// Types for change detection
interface MonitoredDocument {
  id: string
  user_id?: string
  url: string
  document_type: 'terms' | 'privacy' | 'cookie' | 'eula'
  title: string
  current_hash: string
  last_checked: string
  check_frequency: number // in seconds
  notification_enabled: boolean
  created_at: string
}

interface DocumentChange {
  id: string
  document_id: string
  change_type: 'content_modified' | 'document_added' | 'document_removed' | 'structure_changed'
  old_hash?: string
  new_hash: string
  old_content?: string
  new_content: string
  change_summary: string
  significance_score: number // 0-100
  affected_sections: string[]
  detected_at: string
  processed: boolean
}

interface ChangeSignificance {
  score: number
  level: 'minor' | 'moderate' | 'significant' | 'major'
  reasons: string[]
  affected_user_rights: string[]
  compliance_impact: string[]
}

interface MonitoringMetrics {
  total_monitored_documents: number
  active_monitors: number
  changes_detected_24h: number
  changes_detected_7d: number
  average_significance_score: number
  most_changed_document_types: Record<string, number>
  recent_significant_changes: DocumentChange[]
}

export class ChangeDetectionService {
  constructor(private db: Pool) {}

  /**
   * Initialize change detection tables
   */
  async initializeChangeDetection(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS monitored_documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        document_type VARCHAR(20) NOT NULL CHECK (document_type IN ('terms', 'privacy', 'cookie', 'eula')),
        title VARCHAR(500) NOT NULL,
        domain VARCHAR(255) NOT NULL,
        current_hash VARCHAR(64) NOT NULL,
        current_content TEXT,
        last_checked TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        next_check TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        check_frequency INTEGER DEFAULT 86400, -- 24 hours in seconds
        notification_enabled BOOLEAN DEFAULT true,
        monitoring_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS monitored_document_changes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        document_id UUID REFERENCES monitored_documents(id) ON DELETE CASCADE,
        change_type VARCHAR(50) NOT NULL,
        old_hash VARCHAR(64),
        new_hash VARCHAR(64) NOT NULL,
        old_content TEXT,
        new_content TEXT NOT NULL,
        change_summary TEXT NOT NULL,
        significance_score INTEGER CHECK (significance_score >= 0 AND significance_score <= 100),
        affected_sections TEXT[],
        change_details JSONB DEFAULT '{}',
        detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        processed BOOLEAN DEFAULT false,
        notification_sent BOOLEAN DEFAULT false,
        processed_for_training BOOLEAN DEFAULT false
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS change_notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        document_id UUID NOT NULL REFERENCES monitored_documents(id) ON DELETE CASCADE,
        change_id UUID NOT NULL REFERENCES document_changes(id) ON DELETE CASCADE,
        notification_type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP WITH TIME ZONE,
        action_taken BOOLEAN DEFAULT false
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS monitoring_jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
        documents_checked INTEGER DEFAULT 0,
        changes_detected INTEGER DEFAULT 0,
        errors_encountered INTEGER DEFAULT 0,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create indexes for performance
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_monitored_documents_next_check ON monitored_documents(next_check, monitoring_active);
      CREATE INDEX IF NOT EXISTS idx_monitored_documents_user ON monitored_documents(user_id);
      CREATE INDEX IF NOT EXISTS idx_monitored_document_changes_document ON monitored_document_changes(document_id);
      CREATE INDEX IF NOT EXISTS idx_monitored_document_changes_detected ON monitored_document_changes(detected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_monitored_document_changes_significance ON monitored_document_changes(significance_score DESC);
      CREATE INDEX IF NOT EXISTS idx_change_notifications_user ON change_notifications(user_id, read_at);
    `)

    // Create triggers for updating next_check time
    await this.db.query(`
      CREATE OR REPLACE FUNCTION update_next_check()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.next_check = CURRENT_TIMESTAMP + (NEW.check_frequency || ' seconds')::INTERVAL;
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)

    await this.db.query(`
      DROP TRIGGER IF EXISTS trigger_update_next_check ON monitored_documents;
      CREATE TRIGGER trigger_update_next_check
        BEFORE INSERT OR UPDATE OF check_frequency ON monitored_documents
        FOR EACH ROW EXECUTE FUNCTION update_next_check();
    `)
  }

  /**
   * Add a document to monitoring
   */
  async addDocumentToMonitoring(
    url: string,
    documentType: 'terms' | 'privacy' | 'cookie' | 'eula',
    userId?: string,
    checkFrequency: number = 86400
  ): Promise<MonitoredDocument> {
    // Fetch initial content
    const content = await this.fetchDocumentContent(url)
    const hash = this.calculateContentHash(content)
    const title = this.extractDocumentTitle(content, url)
    const domain = new URL(url).hostname

    const result = await this.db.query(`
      INSERT INTO monitored_documents (
        user_id, url, document_type, title, domain, current_hash, 
        current_content, check_frequency, next_check
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP + ($8 || ' seconds')::INTERVAL)
      RETURNING *
    `, [userId, url, documentType, title, domain, hash, content, checkFrequency])

    return result.rows[0]
  }

  /**
   * Run monitoring cycle for due documents
   */
  async runMonitoringCycle(): Promise<MonitoringMetrics> {
    const jobResult = await this.db.query(`
      INSERT INTO monitoring_jobs (job_type, status, started_at)
      VALUES ('monitoring_cycle', 'running', CURRENT_TIMESTAMP)
      RETURNING id
    `)
    const jobId = jobResult.rows[0].id

    let documentsChecked = 0
    let changesDetected = 0
    let errorsEncountered = 0

    try {
      // Get documents due for checking
      const dueDocuments = await this.db.query(`
        SELECT * FROM monitored_documents
        WHERE monitoring_active = true 
        AND next_check <= CURRENT_TIMESTAMP
        ORDER BY next_check ASC
        LIMIT 100
      `)

      for (const doc of dueDocuments.rows) {
        try {
          const hasChanged = await this.checkDocumentForChanges(doc)
          documentsChecked++
          
          if (hasChanged) {
            changesDetected++
          }

          // Update last_checked and next_check
          await this.db.query(`
            UPDATE monitored_documents 
            SET last_checked = CURRENT_TIMESTAMP,
                next_check = CURRENT_TIMESTAMP + (check_frequency || ' seconds')::INTERVAL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [doc.id])

        } catch (error) {
          console.error(`Error checking document ${doc.id}:`, error)
          errorsEncountered++
        }
      }

      // Update job status
      await this.db.query(`
        UPDATE monitoring_jobs 
        SET status = 'completed', 
            completed_at = CURRENT_TIMESTAMP,
            documents_checked = $1,
            changes_detected = $2,
            errors_encountered = $3
        WHERE id = $4
      `, [documentsChecked, changesDetected, errorsEncountered, jobId])

      // Return metrics
      return await this.getMonitoringMetrics()

    } catch (error) {
      await this.db.query(`
        UPDATE monitoring_jobs 
        SET status = 'failed', 
            completed_at = CURRENT_TIMESTAMP,
            documents_checked = $1,
            changes_detected = $2,
            errors_encountered = $3
        WHERE id = $4
      `, [documentsChecked, changesDetected, errorsEncountered, jobId])
      
      throw error
    }
  }

  /**
   * Check a specific document for changes
   */
  private async checkDocumentForChanges(doc: MonitoredDocument): Promise<boolean> {
    try {
      const newContent = await this.fetchDocumentContent(doc.url)
      const newHash = this.calculateContentHash(newContent)

      if (newHash !== doc.current_hash) {
        // Change detected!
        const change = await this.analyzeChange(doc, doc.current_content || '', newContent)
        
        // Save the change
        const changeResult = await this.db.query(`
          INSERT INTO monitored_document_changes (
            document_id, change_type, old_hash, new_hash, old_content, new_content,
            change_summary, significance_score, affected_sections, change_details
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [
          doc.id,
          change.changeType,
          doc.current_hash,
          newHash,
          doc.current_content,
          newContent,
          change.summary,
          change.significance.score,
          change.affectedSections,
          JSON.stringify(change.details)
        ])

        const changeId = changeResult.rows[0].id

        // Update document with new content and hash
        await this.db.query(`
          UPDATE monitored_documents 
          SET current_hash = $1, current_content = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [newHash, newContent, doc.id])

        // Send notifications if enabled and change is significant
        if (doc.notification_enabled && change.significance.score >= 50) {
          await this.sendChangeNotification(doc, changeId, change)
        }

        return true
      }

      return false
    } catch (error) {
      console.error(`Error checking document ${doc.url}:`, error)
      throw error
    }
  }

  /**
   * Analyze the significance of a document change
   */
  private async analyzeChange(
    doc: MonitoredDocument, 
    oldContent: string, 
    newContent: string
  ): Promise<{
    changeType: string
    summary: string
    significance: ChangeSignificance
    affectedSections: string[]
    details: any
  }> {
    const significance = this.calculateChangeSignificance(oldContent, newContent, doc.document_type)
    const affectedSections = this.identifyAffectedSections(oldContent, newContent)
    const summary = this.generateChangeSummary(oldContent, newContent, significance)

    return {
      changeType: 'content_modified',
      summary,
      significance,
      affectedSections,
      details: {
        content_length_change: newContent.length - oldContent.length,
        sections_modified: affectedSections.length,
        risk_indicators_added: this.findNewRiskIndicators(oldContent, newContent),
        compliance_keywords_changed: this.findComplianceKeywordChanges(oldContent, newContent)
      }
    }
  }

  /**
   * Calculate change significance score and classification
   */
  private calculateChangeSignificance(
    oldContent: string, 
    newContent: string,
    documentType: string
  ): ChangeSignificance {
    let score = 0
    const reasons: string[] = []
    const affectedUserRights: string[] = []
    const complianceImpact: string[] = []

    // Content length change factor
    const lengthChange = Math.abs(newContent.length - oldContent.length)
    const lengthChangePercent = lengthChange / oldContent.length
    
    if (lengthChangePercent > 0.5) {
      score += 30
      reasons.push('Major content length change')
    } else if (lengthChangePercent > 0.2) {
      score += 15
      reasons.push('Moderate content length change')
    }

    // High-impact keyword changes
    const highImpactKeywords = [
      'data', 'privacy', 'collect', 'share', 'sell', 'consent', 'rights',
      'delete', 'opt-out', 'cookie', 'tracking', 'third party', 'retention',
      'liability', 'arbitration', 'terminate', 'suspend', 'refund'
    ]

    for (const keyword of highImpactKeywords) {
      const oldCount = (oldContent.toLowerCase().match(new RegExp(keyword, 'g')) || []).length
      const newCount = (newContent.toLowerCase().match(new RegExp(keyword, 'g')) || []).length
      
      if (Math.abs(oldCount - newCount) > 0) {
        score += 5
        reasons.push(`Changes to ${keyword}-related content`)
      }
    }

    // Rights-related changes
    const rightsKeywords = ['right to', 'you may', 'you can', 'entitled to', 'opt-out', 'unsubscribe']
    for (const keyword of rightsKeywords) {
      if (oldContent.toLowerCase().includes(keyword) !== newContent.toLowerCase().includes(keyword)) {
        score += 20
        reasons.push('User rights content modified')
        affectedUserRights.push(`Changes to ${keyword} provisions`)
      }
    }

    // Compliance framework changes
    const complianceKeywords = ['gdpr', 'ccpa', 'pipeda', 'hipaa', 'coppa']
    for (const keyword of complianceKeywords) {
      if (oldContent.toLowerCase().includes(keyword) !== newContent.toLowerCase().includes(keyword)) {
        score += 15
        reasons.push('Compliance framework references changed')
        complianceImpact.push(`${keyword.toUpperCase()} compliance affected`)
      }
    }

    // Document type specific scoring
    if (documentType === 'privacy') {
      score += 10 // Privacy policies are inherently more significant
    }

    // Cap score at 100
    score = Math.min(score, 100)

    // Determine significance level
    let level: 'minor' | 'moderate' | 'significant' | 'major'
    if (score >= 80) level = 'major'
    else if (score >= 60) level = 'significant'
    else if (score >= 30) level = 'moderate'
    else level = 'minor'

    return {
      score,
      level,
      reasons,
      affected_user_rights: affectedUserRights,
      compliance_impact: complianceImpact
    }
  }

  /**
   * Generate a human-readable summary of changes
   */
  private generateChangeSummary(
    oldContent: string, 
    newContent: string, 
    significance: ChangeSignificance
  ): string {
    const lengthChange = newContent.length - oldContent.length
    const lengthChangePercent = Math.abs(lengthChange) / oldContent.length * 100

    let summary = `Document modified with ${significance.level} changes (${significance.score}/100 significance score). `
    
    if (lengthChangePercent > 20) {
      summary += `Content length ${lengthChange > 0 ? 'increased' : 'decreased'} by ${lengthChangePercent.toFixed(1)}%. `
    }

    if (significance.reasons.length > 0) {
      summary += `Key changes: ${significance.reasons.slice(0, 3).join(', ')}.`
    }

    return summary
  }

  /**
   * Identify which sections of the document were affected
   */
  private identifyAffectedSections(oldContent: string, newContent: string): string[] {
    const sections: string[] = []
    
    // Common section headers in legal documents
    const sectionPatterns = [
      /data collection/i,
      /information we collect/i,
      /how we use/i,
      /data sharing/i,
      /third parties/i,
      /cookies/i,
      /your rights/i,
      /contact/i,
      /changes to/i,
      /liability/i,
      /termination/i,
      /dispute resolution/i
    ]

    for (const pattern of sectionPatterns) {
      const oldMatches = oldContent.match(pattern)
      const newMatches = newContent.match(pattern)
      
      // Simple heuristic: if pattern context changed, section likely affected
      if (oldMatches && newMatches) {
        const oldContext = this.getContextAroundMatch(oldContent, pattern)
        const newContext = this.getContextAroundMatch(newContent, pattern)
        
        if (oldContext !== newContext) {
          sections.push(pattern.source.replace(/[\/\\]/g, '').replace(/i$/, ''))
        }
      }
    }

    return sections
  }

  /**
   * Find new risk indicators added in the new content
   */
  private findNewRiskIndicators(oldContent: string, newContent: string): string[] {
    const riskIndicators = [
      'unlimited retention',
      'may sell',
      'binding arbitration',
      'waive rights',
      'automatic renewal',
      'no refund',
      'may terminate without notice'
    ]

    const newRisks: string[] = []
    
    for (const indicator of riskIndicators) {
      const inOld = oldContent.toLowerCase().includes(indicator.toLowerCase())
      const inNew = newContent.toLowerCase().includes(indicator.toLowerCase())
      
      if (!inOld && inNew) {
        newRisks.push(indicator)
      }
    }

    return newRisks
  }

  /**
   * Find changes in compliance-related keywords
   */
  private findComplianceKeywordChanges(oldContent: string, newContent: string): string[] {
    const complianceKeywords = [
      'consent', 'opt-out', 'data subject rights', 'lawful basis',
      'data controller', 'data processor', 'privacy notice'
    ]

    const changes: string[] = []
    
    for (const keyword of complianceKeywords) {
      const oldCount = (oldContent.toLowerCase().match(new RegExp(keyword, 'g')) || []).length
      const newCount = (newContent.toLowerCase().match(new RegExp(keyword, 'g')) || []).length
      
      if (oldCount !== newCount) {
        changes.push(`${keyword}: ${oldCount} → ${newCount} occurrences`)
      }
    }

    return changes
  }

  /**
   * Send notification about a significant change
   */
  private async sendChangeNotification(
    doc: MonitoredDocument, 
    changeId: string, 
    change: any
  ): Promise<void> {
    if (!doc.user_id) return

    const title = `Policy Change Detected: ${doc.title}`
    const message = `${change.summary}\n\nSignificance: ${change.significance.level.toUpperCase()}\nDocument: ${doc.url}`

    await this.db.query(`
      INSERT INTO change_notifications (
        user_id, document_id, change_id, notification_type, title, message
      ) VALUES ($1, $2, $3, 'policy_change', $4, $5)
    `, [doc.user_id, doc.id, changeId, title, message])

    // In production, this would trigger email/push notifications
    console.log(`Change notification sent to user ${doc.user_id} for document ${doc.title}`)
  }

  /**
   * Get monitoring metrics and statistics
   */
  async getMonitoringMetrics(): Promise<MonitoringMetrics> {
    const totalDocsResult = await this.db.query(`
      SELECT COUNT(*) as count FROM monitored_documents
    `)

    const activeMonitorsResult = await this.db.query(`
      SELECT COUNT(*) as count FROM monitored_documents WHERE monitoring_active = true
    `)

    const changes24hResult = await this.db.query(`
      SELECT COUNT(*) as count FROM monitored_document_changes 
      WHERE detected_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `)

    const changes7dResult = await this.db.query(`
      SELECT COUNT(*) as count FROM monitored_document_changes 
      WHERE detected_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
    `)

    const avgSignificanceResult = await this.db.query(`
      SELECT AVG(significance_score) as avg_score FROM monitored_document_changes
      WHERE detected_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    `)

    const mostChangedTypesResult = await this.db.query(`
      SELECT md.document_type, COUNT(dc.id) as change_count
      FROM monitored_document_changes dc
      JOIN monitored_documents md ON dc.document_id = md.id
      WHERE dc.detected_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
      GROUP BY md.document_type
      ORDER BY change_count DESC
    `)

    const recentSignificantChangesResult = await this.db.query(`
      SELECT dc.*, md.title, md.url, md.document_type
      FROM monitored_document_changes dc
      JOIN monitored_documents md ON dc.document_id = md.id
      WHERE dc.significance_score >= 60
      ORDER BY dc.detected_at DESC
      LIMIT 10
    `)

    const mostChangedTypes: Record<string, number> = {}
    mostChangedTypesResult.rows.forEach(row => {
      mostChangedTypes[row.document_type] = parseInt(row.change_count)
    })

    return {
      total_monitored_documents: parseInt(totalDocsResult.rows[0].count),
      active_monitors: parseInt(activeMonitorsResult.rows[0].count),
      changes_detected_24h: parseInt(changes24hResult.rows[0].count),
      changes_detected_7d: parseInt(changes7dResult.rows[0].count),
      average_significance_score: parseFloat(avgSignificanceResult.rows[0].avg_score || '0'),
      most_changed_document_types: mostChangedTypes,
      recent_significant_changes: recentSignificantChangesResult.rows
    }
  }

  // Utility methods

  private async fetchDocumentContent(url: string): Promise<string> {
    // In production, this would use a proper HTTP client with user agent rotation
    // For now, return simulated content
    return `Mock content for ${url} at ${new Date().toISOString()}`
  }

  private calculateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  private extractDocumentTitle(content: string, url: string): string {
    // Simple title extraction - in production would use proper HTML parsing
    const urlObj = new URL(url)
    return `${urlObj.hostname} - Policy Document`
  }

  private getContextAroundMatch(content: string, pattern: RegExp): string {
    const match = content.match(pattern)
    if (!match || match.index === undefined) return ''
    
    const start = Math.max(0, match.index - 100)
    const end = Math.min(content.length, match.index + match[0].length + 100)
    
    return content.substring(start, end)
  }

  /**
   * Get all monitored documents for a user
   */
  async getUserMonitoredDocuments(userId: string): Promise<MonitoredDocument[]> {
    const result = await this.db.query(`
      SELECT * FROM monitored_documents 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [userId])

    return result.rows
  }

  /**
   * Get recent changes for a user
   */
  async getUserRecentChanges(userId: string, limit: number = 20): Promise<DocumentChange[]> {
    const result = await this.db.query(`
      SELECT dc.*, md.title, md.url, md.document_type
      FROM monitored_document_changes dc
      JOIN monitored_documents md ON dc.document_id = md.id
      WHERE md.user_id = $1
      ORDER BY dc.detected_at DESC
      LIMIT $2
    `, [userId, limit])

    return result.rows
  }

  /**
   * Update monitoring settings for a document
   */
  async updateMonitoringSettings(
    documentId: string,
    settings: {
      checkFrequency?: number
      notificationEnabled?: boolean
      monitoringActive?: boolean
    }
  ): Promise<void> {
    const updates: string[] = []
    const values: any[] = []
    let paramCount = 0

    if (settings.checkFrequency !== undefined) {
      paramCount++
      updates.push(`check_frequency = $${paramCount}`)
      values.push(settings.checkFrequency)
    }

    if (settings.notificationEnabled !== undefined) {
      paramCount++
      updates.push(`notification_enabled = $${paramCount}`)
      values.push(settings.notificationEnabled)
    }

    if (settings.monitoringActive !== undefined) {
      paramCount++
      updates.push(`monitoring_active = $${paramCount}`)
      values.push(settings.monitoringActive)
    }

    if (updates.length > 0) {
      paramCount++
      updates.push(`updated_at = CURRENT_TIMESTAMP`)
      values.push(documentId)

      const query = `
        UPDATE monitored_documents 
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
      `

      await this.db.query(query, values)
    }
  }
}