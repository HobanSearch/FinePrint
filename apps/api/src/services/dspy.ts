import { Client as PgClient } from 'pg'
import { pino } from 'pino'

const logger = pino({ name: 'dspy-service' })

// DSPy Module Types
interface DSPyModule {
  id: string
  name: string
  module_type: 'analyzer' | 'classifier' | 'generator' | 'evaluator'
  description: string
  signature_definition: {
    input_fields: string[]
    output_fields: string[]
    instructions: string
  }
  optimization_config: {
    optimizer: 'BootstrapFewShot' | 'MIPROv2' | 'COPRO'
    max_bootstrapped_demos: number
    max_labeled_demos: number
    num_candidate_programs: number
    num_threads: number
  }
  compiled_module?: any
  performance_metrics?: any
  status: 'draft' | 'training' | 'deployed' | 'archived'
}

interface TrainingExample {
  input: Record<string, any>
  output: Record<string, any>
  metadata?: Record<string, any>
}

interface OptimizationSession {
  id: string
  module_id: string
  optimizer_type: string
  training_config: any
  training_data: TrainingExample[]
  validation_data: TrainingExample[]
  optimization_results?: any
  final_prompts?: any
  performance_improvement?: number
  status: 'pending' | 'running' | 'completed' | 'failed'
}

export class DSPyService {
  private db: PgClient
  private ollamaUrl: string

  constructor(db: PgClient, ollamaUrl: string = 'http://localhost:11434') {
    this.db = db
    this.ollamaUrl = ollamaUrl
  }

  // Create a new DSPy module
  async createModule(moduleData: Omit<DSPyModule, 'id'>): Promise<string> {
    const query = `
      INSERT INTO dspy_modules 
      (name, module_type, description, signature_definition, optimization_config, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id
    `
    
    const result = await this.db.query(query, [
      moduleData.name,
      moduleData.module_type,
      moduleData.description,
      JSON.stringify(moduleData.signature_definition),
      JSON.stringify(moduleData.optimization_config),
      moduleData.status
    ])

    const moduleId = result.rows[0].id
    logger.info('Created DSPy module', { moduleId, name: moduleData.name, type: moduleData.module_type })
    
    return moduleId
  }

  // Get module by ID
  async getModule(moduleId: string): Promise<DSPyModule | null> {
    const query = 'SELECT * FROM dspy_modules WHERE id = $1'
    const result = await this.db.query(query, [moduleId])
    
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id,
      name: row.name,
      module_type: row.module_type,
      description: row.description,
      signature_definition: row.signature_definition,
      optimization_config: row.optimization_config,
      compiled_module: row.compiled_module,
      performance_metrics: row.performance_metrics,
      status: row.status
    }
  }

  // Start optimization session
  async startOptimization(
    moduleId: string, 
    trainingData: TrainingExample[], 
    validationData: TrainingExample[]
  ): Promise<string> {
    const module = await this.getModule(moduleId)
    if (!module) {
      throw new Error(`Module ${moduleId} not found`)
    }

    // Create optimization session
    const sessionQuery = `
      INSERT INTO dspy_optimization_sessions
      (module_id, optimizer_type, training_config, training_data, validation_data, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
      RETURNING id
    `

    const sessionResult = await this.db.query(sessionQuery, [
      moduleId,
      module.optimization_config.optimizer,
      JSON.stringify(module.optimization_config),
      JSON.stringify(trainingData),
      JSON.stringify(validationData)
    ])

    const sessionId = sessionResult.rows[0].id
    
    // Start background optimization
    this.runOptimization(sessionId).catch(error => {
      logger.error('Optimization failed', { sessionId, error })
    })

    logger.info('Started DSPy optimization session', { sessionId, moduleId })
    return sessionId
  }

  // Run optimization process
  private async runOptimization(sessionId: string): Promise<void> {
    try {
      // Update session status
      await this.db.query(
        'UPDATE dspy_optimization_sessions SET status = $1, started_at = NOW() WHERE id = $2',
        ['running', sessionId]
      )

      // Get session data
      const sessionQuery = `
        SELECT os.*, m.name as module_name, m.signature_definition, m.optimization_config
        FROM dspy_optimization_sessions os
        JOIN dspy_modules m ON os.module_id = m.id
        WHERE os.id = $1
      `
      const sessionResult = await this.db.query(sessionQuery, [sessionId])
      const session = sessionResult.rows[0]

      // Simulate DSPy optimization process
      const optimizationResults = await this.simulateOptimization(session)

      // Update session with results
      await this.db.query(`
        UPDATE dspy_optimization_sessions 
        SET status = $1, completed_at = NOW(), optimization_results = $2, 
            final_prompts = $3, performance_improvement = $4
        WHERE id = $5
      `, [
        'completed',
        JSON.stringify(optimizationResults.results),
        JSON.stringify(optimizationResults.prompts),
        optimizationResults.improvement,
        sessionId
      ])

      // Update module with compiled version
      await this.db.query(`
        UPDATE dspy_modules 
        SET compiled_module = $1, performance_metrics = $2, status = 'deployed', updated_at = NOW()
        WHERE id = $3
      `, [
        JSON.stringify(optimizationResults.compiled),
        JSON.stringify(optimizationResults.metrics),
        session.module_id
      ])

      logger.info('DSPy optimization completed', { 
        sessionId, 
        improvement: optimizationResults.improvement 
      })

    } catch (error) {
      await this.db.query(
        'UPDATE dspy_optimization_sessions SET status = $1 WHERE id = $2',
        ['failed', sessionId]
      )
      throw error
    }
  }

  // Simulate optimization process (replace with real DSPy integration)
  private async simulateOptimization(session: any) {
    const trainingData = session.training_data as TrainingExample[]
    const validationData = session.validation_data as TrainingExample[]
    
    // Simulate training process
    await new Promise(resolve => setTimeout(resolve, 5000)) // 5 second simulation

    // Generate optimized prompts based on training data patterns
    const optimizedPrompts = this.generateOptimizedPrompts(session.signature_definition, trainingData)
    
    // Calculate performance improvement
    const baselineAccuracy = 0.65 // Simulated baseline
    const optimizedAccuracy = Math.min(0.95, baselineAccuracy + (trainingData.length * 0.01))
    const improvement = ((optimizedAccuracy - baselineAccuracy) / baselineAccuracy) * 100

    return {
      results: {
        training_accuracy: optimizedAccuracy,
        validation_accuracy: optimizedAccuracy - 0.05,
        total_examples: trainingData.length,
        optimization_rounds: 3,
        best_candidate: 1
      },
      prompts: optimizedPrompts,
      improvement,
      compiled: {
        optimized_instructions: optimizedPrompts.system,
        few_shot_examples: trainingData.slice(0, 5),
        validation_score: optimizedAccuracy
      },
      metrics: {
        accuracy: optimizedAccuracy,
        precision: optimizedAccuracy - 0.02,
        recall: optimizedAccuracy - 0.01,
        f1_score: optimizedAccuracy - 0.015
      }
    }
  }

  // Generate optimized prompts from training data
  private generateOptimizedPrompts(signature: any, trainingData: TrainingExample[]) {
    const commonPatterns = this.extractPatterns(trainingData)
    
    return {
      system: `You are a legal document analysis expert. Analyze the provided text and identify problematic clauses with high accuracy.

Key patterns to look for:
${commonPatterns.map(p => `- ${p}`).join('\n')}

Focus on: ${signature.instructions}

Provide detailed analysis with confidence scores and specific recommendations.`,
      
      user_template: `Analyze this legal document text:

{document_text}

Identify all problematic clauses and provide:
1. Risk score (0-100)
2. Specific findings with severity levels
3. Actionable recommendations`,

      few_shot_examples: trainingData.slice(0, 3).map(example => ({
        input: example.input,
        output: example.output
      }))
    }
  }

  // Extract common patterns from training data
  private extractPatterns(trainingData: TrainingExample[]): string[] {
    const patterns = new Set<string>()
    
    trainingData.forEach(example => {
      if (example.output.findings) {
        example.output.findings.forEach((finding: any) => {
          if (finding.category) {
            patterns.add(`${finding.category} clauses (${finding.severity} severity)`)
          }
        })
      }
    })

    return Array.from(patterns).slice(0, 10) // Top 10 patterns
  }

  // Add training example from analysis result
  async addTrainingExample(
    moduleId: string,
    analysisInput: Record<string, any>,
    analysisOutput: Record<string, any>,
    userFeedback?: Record<string, any>
  ): Promise<void> {
    const trainingExample: TrainingExample = {
      input: analysisInput,
      output: analysisOutput,
      metadata: {
        timestamp: new Date().toISOString(),
        feedback: userFeedback,
        source: 'user_analysis'
      }
    }

    // Store in a training examples table (we'll create this)
    const query = `
      INSERT INTO training_examples (module_id, input_data, output_data, metadata, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `

    await this.db.query(query, [
      moduleId,
      JSON.stringify(trainingExample.input),
      JSON.stringify(trainingExample.output),
      JSON.stringify(trainingExample.metadata)
    ])

    logger.info('Added training example', { moduleId })

    // Check if we have enough examples to trigger retraining
    const countQuery = 'SELECT COUNT(*) FROM training_examples WHERE module_id = $1'
    const countResult = await this.db.query(countQuery, [moduleId])
    const exampleCount = parseInt(countResult.rows[0].count)

    // Trigger retraining every 50 examples
    if (exampleCount % 50 === 0) {
      await this.triggerRetraining(moduleId)
    }
  }

  // Trigger retraining with accumulated examples
  private async triggerRetraining(moduleId: string): Promise<void> {
    // Get recent training examples
    const examplesQuery = `
      SELECT input_data, output_data, metadata 
      FROM training_examples 
      WHERE module_id = $1 
      ORDER BY created_at DESC 
      LIMIT 200
    `
    const examplesResult = await this.db.query(examplesQuery, [moduleId])
    
    const trainingData: TrainingExample[] = examplesResult.rows.map(row => ({
      input: row.input_data,
      output: row.output_data,
      metadata: row.metadata
    }))

    // Split into training and validation
    const splitIndex = Math.floor(trainingData.length * 0.8)
    const training = trainingData.slice(0, splitIndex)
    const validation = trainingData.slice(splitIndex)

    // Start optimization
    await this.startOptimization(moduleId, training, validation)
    
    logger.info('Triggered retraining', { moduleId, trainingSize: training.length })
  }

  // Use optimized module for inference
  async runInference(moduleId: string, input: Record<string, any>): Promise<any> {
    const module = await this.getModule(moduleId)
    if (!module || !module.compiled_module) {
      throw new Error(`Module ${moduleId} not found or not compiled`)
    }

    // Use the optimized prompts for Ollama inference
    const systemPrompt = module.compiled_module.optimized_instructions
    const userPrompt = this.formatInput(input, module.signature_definition)

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama2', // or configurable model
          prompt: userPrompt,
          system: systemPrompt,
          stream: false,
          options: {
            temperature: 0.3, // Lower for more consistent results
            top_p: 0.9,
            num_predict: 2000
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`)
      }

      const result = await response.json()
      return this.parseOutput(result.response, module.signature_definition)
      
    } catch (error) {
      logger.error('Inference failed', { moduleId, error })
      throw error
    }
  }

  // Format input according to module signature
  private formatInput(input: Record<string, any>, signature: any): string {
    const template = signature.user_template || `Analyze this document:\n\n{document_text}`
    
    let formatted = template
    for (const [key, value] of Object.entries(input)) {
      formatted = formatted.replace(`{${key}}`, String(value))
    }
    
    return formatted
  }

  // Parse structured output from LLM response
  private parseOutput(response: string, signature: any): any {
    try {
      // Try to extract JSON if present
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }

      // Fallback: parse structured text response
      return this.parseStructuredText(response)
      
    } catch (error) {
      logger.warn('Failed to parse structured output, returning raw text', { error })
      return { raw_response: response }
    }
  }

  // Parse structured text response
  private parseStructuredText(text: string): any {
    const result: any = {}
    
    // Extract risk score
    const riskMatch = text.match(/risk\s*score[:\s]*(\d+)/i)
    if (riskMatch) {
      result.riskScore = parseInt(riskMatch[1])
    }

    // Extract findings
    const findingsMatch = text.match(/findings?[:\s]*([\s\S]*?)(?=recommendations?|$)/i)
    if (findingsMatch) {
      const findingsText = findingsMatch[1]
      result.findings = this.extractFindings(findingsText)
    }

    // Extract recommendations
    const recsMatch = text.match(/recommendations?[:\s]*([\s\S]*?)$/i)
    if (recsMatch) {
      result.recommendations = recsMatch[1]
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.replace(/^[\d\-\*\.\s]+/, '').trim())
        .filter(line => line.length > 0)
    }

    return result
  }

  // Extract findings from text
  private extractFindings(text: string): any[] {
    const findings = []
    const lines = text.split('\n').filter(line => line.trim())
    
    let currentFinding: any = null
    
    for (const line of lines) {
      const trimmed = line.trim()
      
      // Check for severity indicators
      if (trimmed.match(/\b(high|critical|medium|low)\s+(risk|severity)/i)) {
        if (currentFinding) findings.push(currentFinding)
        
        const severityMatch = trimmed.match(/\b(high|critical|medium|low)/i)
        currentFinding = {
          id: `finding_${findings.length + 1}`,
          severity: severityMatch ? severityMatch[1].toLowerCase() : 'medium',
          title: trimmed,
          description: '',
          category: 'general'
        }
      } else if (currentFinding && trimmed.length > 10) {
        currentFinding.description += (currentFinding.description ? ' ' : '') + trimmed
      }
    }
    
    if (currentFinding) findings.push(currentFinding)
    
    return findings.length > 0 ? findings : [{
      id: 'finding_1',
      severity: 'medium',
      title: 'Analysis completed',
      description: text.substring(0, 200),
      category: 'general'
    }]
  }

  // Get optimization session status
  async getOptimizationStatus(sessionId: string): Promise<OptimizationSession | null> {
    const query = `
      SELECT os.*, m.name as module_name
      FROM dspy_optimization_sessions os
      JOIN dspy_modules m ON os.module_id = m.id
      WHERE os.id = $1
    `
    const result = await this.db.query(query, [sessionId])
    
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id,
      module_id: row.module_id,
      optimizer_type: row.optimizer_type,
      training_config: row.training_config,
      training_data: row.training_data,
      validation_data: row.validation_data,
      optimization_results: row.optimization_results,
      final_prompts: row.final_prompts,
      performance_improvement: row.performance_improvement,
      status: row.status
    }
  }
}