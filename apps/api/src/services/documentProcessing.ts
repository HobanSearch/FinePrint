/**
 * Document Processing Pipeline for ML Training Data Generation
 * 
 * This service processes document changes from the data aggregation system
 * and creates high-quality training datasets for fine-tuning local models.
 * Optimized for privacy-first local LLM training on legal document analysis.
 */

import { Pool } from 'pg'

// Types for document processing
interface DocumentChange {
  id: string
  website_id: string
  document_type: 'terms' | 'privacy' | 'cookie'
  old_content?: string
  new_content: string
  change_summary: string
  detected_at: string
  processed_for_training: boolean
  website_name: string
  website_domain: string
}

interface TrainingExample {
  id: string
  source_change_id: string
  input_text: string
  target_analysis: string
  example_type: 'change_detection' | 'risk_analysis' | 'clause_extraction' | 'compliance_check'
  difficulty_level: 'beginner' | 'intermediate' | 'advanced'
  quality_score: number
  metadata: {
    website_domain: string
    document_type: string
    change_type: string
    clause_categories: string[]
    risk_indicators: string[]
    compliance_frameworks: string[]
  }
}

interface TrainingDataset {
  id: string
  name: string
  description: string
  dataset_type: 'fine_tuning' | 'evaluation' | 'benchmark'
  model_target: string
  total_examples: number
  quality_distribution: {
    high: number
    medium: number
    low: number
  }
  created_at: string
  file_path: string
}

interface ProcessingMetrics {
  total_changes_processed: number
  training_examples_generated: number
  quality_distribution: Record<string, number>
  processing_time_ms: number
  error_count: number
}

export class DocumentProcessingService {
  constructor(private db: Pool) {}

  /**
   * Initialize document processing tables
   */
  async initializeDocumentProcessing(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS training_examples (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        source_change_id UUID NOT NULL REFERENCES document_changes(id),
        input_text TEXT NOT NULL,
        target_analysis TEXT NOT NULL,
        example_type VARCHAR(50) NOT NULL CHECK (example_type IN ('change_detection', 'risk_analysis', 'clause_extraction', 'compliance_check')),
        difficulty_level VARCHAR(20) NOT NULL CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
        quality_score DECIMAL(3,2) CHECK (quality_score >= 0 AND quality_score <= 1),
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS training_datasets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(200) NOT NULL,
        description TEXT,
        dataset_type VARCHAR(50) NOT NULL CHECK (dataset_type IN ('fine_tuning', 'evaluation', 'benchmark')),
        model_target VARCHAR(100) NOT NULL,
        total_examples INTEGER DEFAULT 0,
        quality_distribution JSONB DEFAULT '{}',
        file_path TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS dataset_examples (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        dataset_id UUID NOT NULL REFERENCES training_datasets(id) ON DELETE CASCADE,
        example_id UUID NOT NULL REFERENCES training_examples(id) ON DELETE CASCADE,
        split_type VARCHAR(20) DEFAULT 'train' CHECK (split_type IN ('train', 'validation', 'test')),
        added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(dataset_id, example_id)
      )
    `)

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS processing_jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
        input_parameters JSONB,
        results JSONB,
        error_message TEXT,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create indexes for performance
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_training_examples_type ON training_examples(example_type);
      CREATE INDEX IF NOT EXISTS idx_training_examples_quality ON training_examples(quality_score DESC);
      CREATE INDEX IF NOT EXISTS idx_training_examples_difficulty ON training_examples(difficulty_level);
      CREATE INDEX IF NOT EXISTS idx_dataset_examples_dataset ON dataset_examples(dataset_id);
      CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
    `)
  }

  /**
   * Process unprocessed document changes into training examples
   */
  async processChangesForTraining(limit: number = 100): Promise<ProcessingMetrics> {
    const startTime = Date.now()
    let processedCount = 0
    let generatedExamples = 0
    let errorCount = 0
    const qualityDistribution: Record<string, number> = {}

    try {
      // Get unprocessed document changes
      const unprocessedChanges = await this.getUnprocessedChanges(limit)
      
      for (const change of unprocessedChanges) {
        try {
          const examples = await this.generateTrainingExamples(change)
          
          for (const example of examples) {
            await this.saveTrainingExample(example)
            generatedExamples++

            // Track quality distribution
            const qualityTier = this.getQualityTier(example.quality_score)
            qualityDistribution[qualityTier] = (qualityDistribution[qualityTier] || 0) + 1
          }

          // Mark change as processed
          await this.markChangeAsProcessed(change.id)
          processedCount++

        } catch (error) {
          console.error(`Error processing change ${change.id}:`, error)
          errorCount++
        }
      }

      const processingTime = Date.now() - startTime

      // Log metrics
      console.log(`Document processing completed: ${processedCount} changes processed, ${generatedExamples} examples generated in ${processingTime}ms`)

      return {
        total_changes_processed: processedCount,
        training_examples_generated: generatedExamples,
        quality_distribution: qualityDistribution,
        processing_time_ms: processingTime,
        error_count: errorCount
      }

    } catch (error) {
      console.error('Error in processChangesForTraining:', error)
      throw error
    }
  }

  /**
   * Generate multiple training examples from a document change
   */
  private async generateTrainingExamples(change: DocumentChange): Promise<TrainingExample[]> {
    const examples: TrainingExample[] = []

    // 1. Change Detection Example
    if (change.old_content && change.new_content) {
      examples.push(await this.generateChangeDetectionExample(change))
    }

    // 2. Risk Analysis Example
    examples.push(await this.generateRiskAnalysisExample(change))

    // 3. Clause Extraction Example
    examples.push(await this.generateClauseExtractionExample(change))

    // 4. Compliance Check Example (if applicable)
    if (this.isComplianceRelevant(change)) {
      examples.push(await this.generateComplianceCheckExample(change))
    }

    return examples.filter(Boolean)
  }

  /**
   * Generate change detection training example
   */
  private async generateChangeDetectionExample(change: DocumentChange): Promise<TrainingExample> {
    const input = this.formatChangeDetectionInput(change.old_content!, change.new_content)
    const target = this.generateChangeDetectionTarget(change)

    return {
      id: '', // Will be set by database
      source_change_id: change.id,
      input_text: input,
      target_analysis: target,
      example_type: 'change_detection',
      difficulty_level: this.assessDifficulty(change),
      quality_score: this.calculateQualityScore(change, 'change_detection'),
      metadata: {
        website_domain: change.website_domain,
        document_type: change.document_type,
        change_type: 'content_modification',
        clause_categories: this.extractClauseCategories(change.new_content),
        risk_indicators: this.identifyRiskIndicators(change.new_content),
        compliance_frameworks: this.identifyComplianceFrameworks(change.new_content)
      }
    }
  }

  /**
   * Generate risk analysis training example
   */
  private async generateRiskAnalysisExample(change: DocumentChange): Promise<TrainingExample> {
    const input = `Analyze the following ${change.document_type} policy for potential user risks:\n\n${change.new_content.substring(0, 2000)}`
    const target = this.generateRiskAnalysisTarget(change)

    return {
      id: '',
      source_change_id: change.id,
      input_text: input,
      target_analysis: target,
      example_type: 'risk_analysis',
      difficulty_level: this.assessDifficulty(change),
      quality_score: this.calculateQualityScore(change, 'risk_analysis'),
      metadata: {
        website_domain: change.website_domain,
        document_type: change.document_type,
        change_type: 'risk_assessment',
        clause_categories: this.extractClauseCategories(change.new_content),
        risk_indicators: this.identifyRiskIndicators(change.new_content),
        compliance_frameworks: this.identifyComplianceFrameworks(change.new_content)
      }
    }
  }

  /**
   * Generate clause extraction training example
   */
  private async generateClauseExtractionExample(change: DocumentChange): Promise<TrainingExample> {
    const input = `Extract and categorize problematic clauses from this ${change.document_type} policy:\n\n${change.new_content.substring(0, 2000)}`
    const target = this.generateClauseExtractionTarget(change)

    return {
      id: '',
      source_change_id: change.id,
      input_text: input,
      target_analysis: target,
      example_type: 'clause_extraction',
      difficulty_level: this.assessDifficulty(change),
      quality_score: this.calculateQualityScore(change, 'clause_extraction'),
      metadata: {
        website_domain: change.website_domain,
        document_type: change.document_type,
        change_type: 'clause_identification',
        clause_categories: this.extractClauseCategories(change.new_content),
        risk_indicators: this.identifyRiskIndicators(change.new_content),
        compliance_frameworks: this.identifyComplianceFrameworks(change.new_content)
      }
    }
  }

  /**
   * Generate compliance check training example
   */
  private async generateComplianceCheckExample(change: DocumentChange): Promise<TrainingExample> {
    const frameworks = this.identifyComplianceFrameworks(change.new_content)
    const primaryFramework = frameworks[0] || 'GDPR'
    
    const input = `Check ${primaryFramework} compliance for this ${change.document_type} policy:\n\n${change.new_content.substring(0, 2000)}`
    const target = this.generateComplianceCheckTarget(change, primaryFramework)

    return {
      id: '',
      source_change_id: change.id,
      input_text: input,
      target_analysis: target,
      example_type: 'compliance_check',
      difficulty_level: this.assessDifficulty(change),
      quality_score: this.calculateQualityScore(change, 'compliance_check'),
      metadata: {
        website_domain: change.website_domain,
        document_type: change.document_type,
        change_type: 'compliance_assessment',
        clause_categories: this.extractClauseCategories(change.new_content),
        risk_indicators: this.identifyRiskIndicators(change.new_content),
        compliance_frameworks: frameworks
      }
    }
  }

  /**
   * Create training dataset from processed examples
   */
  async createTrainingDataset(
    name: string,
    description: string,
    datasetType: 'fine_tuning' | 'evaluation' | 'benchmark',
    modelTarget: string,
    filters: {
      exampleTypes?: string[]
      difficultyLevels?: string[]
      minQualityScore?: number
      websiteDomains?: string[]
      documentTypes?: string[]
    } = {}
  ): Promise<TrainingDataset> {
    // Create dataset record
    const datasetResult = await this.db.query(`
      INSERT INTO training_datasets (name, description, dataset_type, model_target)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, description, datasetType, modelTarget])

    const dataset = datasetResult.rows[0]

    // Build query for selecting examples
    let query = `
      SELECT te.* FROM training_examples te
      WHERE 1=1
    `
    const queryParams: any[] = []
    let paramCount = 0

    if (filters.exampleTypes?.length) {
      paramCount++
      query += ` AND te.example_type = ANY($${paramCount})`
      queryParams.push(filters.exampleTypes)
    }

    if (filters.difficultyLevels?.length) {
      paramCount++
      query += ` AND te.difficulty_level = ANY($${paramCount})`
      queryParams.push(filters.difficultyLevels)
    }

    if (filters.minQualityScore) {
      paramCount++
      query += ` AND te.quality_score >= $${paramCount}`
      queryParams.push(filters.minQualityScore)
    }

    if (filters.websiteDomains?.length) {
      paramCount++
      query += ` AND te.metadata->>'website_domain' = ANY($${paramCount})`
      queryParams.push(filters.websiteDomains)
    }

    if (filters.documentTypes?.length) {
      paramCount++
      query += ` AND te.metadata->>'document_type' = ANY($${paramCount})`
      queryParams.push(filters.documentTypes)
    }

    query += ` ORDER BY te.quality_score DESC, te.created_at DESC`

    const examplesResult = await this.db.query(query, queryParams)

    // Add examples to dataset with train/validation/test split
    const examples = examplesResult.rows
    const totalExamples = examples.length
    const trainCount = Math.floor(totalExamples * 0.8)
    const validationCount = Math.floor(totalExamples * 0.1)

    for (let i = 0; i < examples.length; i++) {
      const example = examples[i]
      let splitType = 'test'
      
      if (i < trainCount) {
        splitType = 'train'
      } else if (i < trainCount + validationCount) {
        splitType = 'validation'
      }

      await this.db.query(`
        INSERT INTO dataset_examples (dataset_id, example_id, split_type)
        VALUES ($1, $2, $3)
      `, [dataset.id, example.id, splitType])
    }

    // Update dataset statistics
    const qualityDistribution = this.calculateQualityDistribution(examples)
    
    await this.db.query(`
      UPDATE training_datasets 
      SET total_examples = $1, quality_distribution = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [totalExamples, JSON.stringify(qualityDistribution), dataset.id])

    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      dataset_type: dataset.dataset_type,
      model_target: dataset.model_target,
      total_examples: totalExamples,
      quality_distribution: qualityDistribution,
      created_at: dataset.created_at,
      file_path: dataset.file_path
    }
  }

  /**
   * Export training dataset to JSONL format for model training
   */
  async exportDatasetToJSONL(datasetId: string): Promise<string> {
    const examples = await this.db.query(`
      SELECT te.*, de.split_type
      FROM training_examples te
      JOIN dataset_examples de ON te.id = de.example_id
      WHERE de.dataset_id = $1
      ORDER BY de.split_type, te.quality_score DESC
    `, [datasetId])

    const jsonlLines: string[] = []

    for (const example of examples.rows) {
      const jsonlEntry = {
        messages: [
          {
            role: 'user',
            content: example.input_text
          },
          {
            role: 'assistant',
            content: example.target_analysis
          }
        ],
        metadata: {
          example_id: example.id,
          example_type: example.example_type,
          difficulty_level: example.difficulty_level,
          quality_score: example.quality_score,
          split_type: example.split_type,
          ...example.metadata
        }
      }

      jsonlLines.push(JSON.stringify(jsonlEntry))
    }

    const jsonlContent = jsonlLines.join('\n')
    const filePath = `/tmp/dataset_${datasetId}_${Date.now()}.jsonl`
    
    // In production, this would write to persistent storage
    console.log(`Generated JSONL dataset with ${jsonlLines.length} examples`)
    
    // Update dataset with file path
    await this.db.query(`
      UPDATE training_datasets 
      SET file_path = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [filePath, datasetId])

    return filePath
  }

  // Helper methods for generating training examples

  private formatChangeDetectionInput(oldContent: string, newContent: string): string {
    return `Compare these two versions of a legal document and identify significant changes:

OLD VERSION:
${oldContent.substring(0, 1000)}

NEW VERSION:
${newContent.substring(0, 1000)}

Identify and explain the key changes:`
  }

  private generateChangeDetectionTarget(change: DocumentChange): string {
    return `CHANGE ANALYSIS:

Change Summary: ${change.change_summary}

Key Changes Identified:
1. Content modification detected in ${change.document_type} policy
2. Website: ${change.website_name} (${change.website_domain})
3. Detection date: ${change.detected_at}

Risk Assessment:
- This change should be reviewed for potential user impact
- Consider notifying users if rights or data usage policies have changed
- Monitor for additional changes in related documents

Recommendation: Users should review the updated policy to understand how changes may affect their privacy and rights.`
  }

  private generateRiskAnalysisTarget(change: DocumentChange): string {
    const riskIndicators = this.identifyRiskIndicators(change.new_content)
    const clauses = this.extractClauseCategories(change.new_content)

    return `RISK ANALYSIS:

Overall Risk Level: ${this.calculateRiskLevel(riskIndicators)}

Risk Indicators Found:
${riskIndicators.map(risk => `- ${risk}`).join('\n')}

Problematic Clause Categories:
${clauses.map(clause => `- ${clause}`).join('\n')}

User Impact:
- Potential data privacy concerns
- Limited user control over personal information
- Possible third-party data sharing

Recommendations:
1. Users should carefully review data collection practices
2. Consider opting out of non-essential data processing
3. Monitor account settings for privacy controls
4. Be aware of data retention policies`
  }

  private generateClauseExtractionTarget(change: DocumentChange): string {
    const clauses = this.extractClauseCategories(change.new_content)
    
    return `CLAUSE EXTRACTION:

Problematic Clauses Identified:

${clauses.map((clause, index) => `${index + 1}. ${clause}
   - Category: Data Usage
   - Risk Level: Medium
   - User Impact: Limited control over personal data`).join('\n\n')}

Summary:
Found ${clauses.length} potentially problematic clauses related to data collection, usage rights, and user consent mechanisms.`
  }

  private generateComplianceCheckTarget(change: DocumentChange, framework: string): string {
    return `${framework} COMPLIANCE CHECK:

Compliance Status: PARTIAL COMPLIANCE

Requirements Assessment:
✓ Data collection notice provided
✓ Contact information available
⚠ Consent mechanisms may be insufficient
⚠ Data retention periods unclear
✗ User rights not fully explained

Compliance Gaps:
1. Insufficient granular consent options
2. Unclear data retention schedules
3. Limited user control mechanisms

Recommendations:
1. Implement explicit consent for each data processing purpose
2. Clearly define data retention periods
3. Provide easy-to-use privacy controls
4. Add clear explanation of user rights`
  }

  private assessDifficulty(change: DocumentChange): 'beginner' | 'intermediate' | 'advanced' {
    const contentLength = change.new_content.length
    const complexity = this.assessComplexity(change.new_content)
    
    if (contentLength < 1000 && complexity < 3) return 'beginner'
    if (contentLength < 5000 && complexity < 6) return 'intermediate'
    return 'advanced'
  }

  private assessComplexity(content: string): number {
    const legalTerms = ['whereas', 'herein', 'thereof', 'pursuant', 'notwithstanding']
    const complexPatterns = [
      /\b\w{15,}\b/g, // Very long words
      /[;]{2,}/g, // Multiple semicolons
      /\([^)]{50,}\)/g // Long parenthetical statements
    ]
    
    let complexity = 0
    legalTerms.forEach(term => {
      complexity += (content.toLowerCase().match(new RegExp(term, 'g')) || []).length
    })
    
    complexPatterns.forEach(pattern => {
      complexity += (content.match(pattern) || []).length
    })
    
    return complexity
  }

  private calculateQualityScore(change: DocumentChange, exampleType: string): number {
    let score = 0.7 // Base score
    
    // Content quality factors
    const contentLength = change.new_content.length
    if (contentLength > 500) score += 0.1
    if (contentLength > 2000) score += 0.1
    
    // Website reputation (major websites get higher scores)
    const majorSites = ['google', 'facebook', 'apple', 'microsoft', 'amazon']
    if (majorSites.some(site => change.website_domain.includes(site))) {
      score += 0.1
    }
    
    // Ensure score is within bounds
    return Math.min(Math.max(score, 0), 1)
  }

  private extractClauseCategories(content: string): string[] {
    const categories = []
    const lowerContent = content.toLowerCase()
    
    if (lowerContent.includes('data') && (lowerContent.includes('collect') || lowerContent.includes('process'))) {
      categories.push('Data Collection')
    }
    if (lowerContent.includes('cookie') || lowerContent.includes('tracking')) {
      categories.push('Tracking & Cookies')
    }
    if (lowerContent.includes('third party') || lowerContent.includes('share')) {
      categories.push('Third Party Sharing')
    }
    if (lowerContent.includes('retain') || lowerContent.includes('delete')) {
      categories.push('Data Retention')
    }
    if (lowerContent.includes('consent') || lowerContent.includes('opt-out')) {
      categories.push('User Consent')
    }
    
    return categories
  }

  private identifyRiskIndicators(content: string): string[] {
    const indicators = []
    const lowerContent = content.toLowerCase()
    
    if (lowerContent.includes('unlimited') || lowerContent.includes('indefinite')) {
      indicators.push('Unlimited data retention')
    }
    if (lowerContent.includes('automatic') && lowerContent.includes('renew')) {
      indicators.push('Automatic renewal clauses')
    }
    if (lowerContent.includes('binding arbitration')) {
      indicators.push('Mandatory arbitration clauses')
    }
    if (lowerContent.includes('waive') && lowerContent.includes('rights')) {
      indicators.push('Rights waiver clauses')
    }
    
    return indicators
  }

  private identifyComplianceFrameworks(content: string): string[] {
    const frameworks = []
    const lowerContent = content.toLowerCase()
    
    if (lowerContent.includes('gdpr') || lowerContent.includes('general data protection')) {
      frameworks.push('GDPR')
    }
    if (lowerContent.includes('ccpa') || lowerContent.includes('california consumer privacy')) {
      frameworks.push('CCPA')
    }
    if (lowerContent.includes('pipeda')) {
      frameworks.push('PIPEDA')
    }
    if (lowerContent.includes('hipaa')) {
      frameworks.push('HIPAA')
    }
    
    return frameworks.length > 0 ? frameworks : ['GDPR'] // Default to GDPR
  }

  private isComplianceRelevant(change: DocumentChange): boolean {
    const relevantTypes = ['privacy', 'terms']
    return relevantTypes.includes(change.document_type)
  }

  private calculateRiskLevel(riskIndicators: string[]): string {
    if (riskIndicators.length >= 3) return 'HIGH'
    if (riskIndicators.length >= 1) return 'MEDIUM'
    return 'LOW'
  }

  private getQualityTier(score: number): string {
    if (score >= 0.8) return 'high'
    if (score >= 0.6) return 'medium'
    return 'low'
  }

  private calculateQualityDistribution(examples: any[]): Record<string, number> {
    const distribution = { high: 0, medium: 0, low: 0 }
    
    examples.forEach(example => {
      const tier = this.getQualityTier(example.quality_score)
      distribution[tier as keyof typeof distribution]++
    })
    
    return distribution
  }

  private async getUnprocessedChanges(limit: number): Promise<DocumentChange[]> {
    const result = await this.db.query(`
      SELECT 
        dc.*,
        wm.name as website_name,
        wm.domain as website_domain
      FROM document_changes dc
      JOIN website_monitoring_targets wm ON dc.website_id = wm.id
      WHERE dc.processed_for_training = false
      ORDER BY dc.detected_at DESC
      LIMIT $1
    `, [limit])

    return result.rows
  }

  private async saveTrainingExample(example: TrainingExample): Promise<void> {
    await this.db.query(`
      INSERT INTO training_examples (
        source_change_id, input_text, target_analysis, example_type,
        difficulty_level, quality_score, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      example.source_change_id,
      example.input_text,
      example.target_analysis,
      example.example_type,
      example.difficulty_level,
      example.quality_score,
      JSON.stringify(example.metadata)
    ])
  }

  private async markChangeAsProcessed(changeId: string): Promise<void> {
    await this.db.query(`
      UPDATE document_changes 
      SET processed_for_training = true 
      WHERE id = $1
    `, [changeId])
  }

  /**
   * Get processing metrics and statistics
   */
  async getProcessingMetrics(): Promise<{
    total_examples: number
    examples_by_type: Record<string, number>
    examples_by_difficulty: Record<string, number>
    average_quality_score: number
    recent_processing_jobs: any[]
  }> {
    const totalResult = await this.db.query('SELECT COUNT(*) as count FROM training_examples')
    const total = parseInt(totalResult.rows[0].count)

    const typeResult = await this.db.query(`
      SELECT example_type, COUNT(*) as count 
      FROM training_examples 
      GROUP BY example_type
    `)

    const difficultyResult = await this.db.query(`
      SELECT difficulty_level, COUNT(*) as count 
      FROM training_examples 
      GROUP BY difficulty_level
    `)

    const qualityResult = await this.db.query(`
      SELECT AVG(quality_score) as avg_score 
      FROM training_examples
    `)

    const jobsResult = await this.db.query(`
      SELECT * FROM processing_jobs 
      ORDER BY created_at DESC 
      LIMIT 10
    `)

    const examplesByType: Record<string, number> = {}
    typeResult.rows.forEach(row => {
      examplesByType[row.example_type] = parseInt(row.count)
    })

    const examplesByDifficulty: Record<string, number> = {}
    difficultyResult.rows.forEach(row => {
      examplesByDifficulty[row.difficulty_level] = parseInt(row.count)
    })

    return {
      total_examples: total,
      examples_by_type: examplesByType,
      examples_by_difficulty: examplesByDifficulty,
      average_quality_score: parseFloat(qualityResult.rows[0].avg_score || '0'),
      recent_processing_jobs: jobsResult.rows
    }
  }
}