import { Client as PgClient } from 'pg'
import { pino } from 'pino'
import { createHash } from 'crypto'

const logger = pino({ name: 'lora-service' })

// LoRA Adapter Types
interface LoRAAdapter {
  id: string
  name: string
  base_model: string
  task_domain: 'legal_analysis' | 'risk_assessment' | 'clause_detection' | 'recommendation'
  adapter_config: {
    rank: number
    alpha: number
    dropout: number
    target_modules: string[]
    gate_threshold: number
  }
  training_config: {
    learning_rate: number
    batch_size: number
    epochs: number
    warmup_steps: number
    weight_decay: number
  }
  adapter_weights?: any
  gating_weights?: any
  performance_metrics?: any
  status: 'training' | 'completed' | 'deployed' | 'archived'
}

interface LoRATrainingSession {
  id: string
  adapter_id: string
  training_dataset: any[]
  validation_dataset: any[]
  hyperparameters: any
  training_logs: any[]
  checkpoint_data?: any
  final_metrics?: any
  status: 'pending' | 'running' | 'completed' | 'failed'
}

interface RoutingDecision {
  request_id: string
  input_text: string
  selected_adapters: string[]
  router_confidence: Record<string, number>
  execution_time_ms: number
  performance_metrics?: any
}

export class LoRAService {
  private db: PgClient
  private ollamaUrl: string
  private adapters: Map<string, LoRAAdapter> = new Map()

  constructor(db: PgClient, ollamaUrl: string = 'http://localhost:11434') {
    this.db = db
    this.ollamaUrl = ollamaUrl
    this.loadAdapters()
  }

  // Load adapters into memory for fast routing
  private async loadAdapters(): Promise<void> {
    try {
      const query = 'SELECT * FROM lora_adapters WHERE status = $1'
      const result = await this.db.query(query, ['deployed'])
      
      for (const row of result.rows) {
        const adapter: LoRAAdapter = {
          id: row.id,
          name: row.name,
          base_model: row.base_model,
          task_domain: row.task_domain,
          adapter_config: row.adapter_config,
          training_config: row.training_config,
          adapter_weights: row.adapter_weights,
          gating_weights: row.gating_weights,
          performance_metrics: row.performance_metrics,
          status: row.status
        }
        this.adapters.set(adapter.id, adapter)
      }
      
      logger.info('Loaded LoRA adapters', { count: this.adapters.size })
    } catch (error) {
      logger.error('Failed to load LoRA adapters', { error })
    }
  }

  // Create new LoRA adapter
  async createAdapter(adapterData: Omit<LoRAAdapter, 'id'>): Promise<string> {
    const query = `
      INSERT INTO lora_adapters 
      (name, base_model, task_domain, adapter_config, training_config, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id
    `
    
    const result = await this.db.query(query, [
      adapterData.name,
      adapterData.base_model,
      adapterData.task_domain,
      JSON.stringify(adapterData.adapter_config),
      JSON.stringify(adapterData.training_config),
      adapterData.status
    ])

    const adapterId = result.rows[0].id
    logger.info('Created LoRA adapter', { adapterId, name: adapterData.name })
    
    return adapterId
  }

  // Start LoRA training session
  async startTraining(
    adapterId: string,
    trainingDataset: any[],
    validationDataset: any[],
    hyperparameters: any = {}
  ): Promise<string> {
    const adapter = await this.getAdapter(adapterId)
    if (!adapter) {
      throw new Error(`Adapter ${adapterId} not found`)
    }

    // Create training session
    const sessionQuery = `
      INSERT INTO lora_training_sessions
      (adapter_id, training_dataset, validation_dataset, hyperparameters, status, created_at)
      VALUES ($1, $2, $3, $4, 'pending', NOW())
      RETURNING id
    `

    const sessionResult = await this.db.query(sessionQuery, [
      adapterId,
      JSON.stringify(trainingDataset),
      JSON.stringify(validationDataset),
      JSON.stringify({
        ...adapter.training_config,
        ...hyperparameters
      })
    ])

    const sessionId = sessionResult.rows[0].id
    
    // Start background training
    this.runTraining(sessionId).catch(error => {
      logger.error('LoRA training failed', { sessionId, error })
    })

    logger.info('Started LoRA training session', { sessionId, adapterId })
    return sessionId
  }

  // Run LoRA training process
  private async runTraining(sessionId: string): Promise<void> {
    try {
      // Update session status
      await this.db.query(
        'UPDATE lora_training_sessions SET status = $1, started_at = NOW() WHERE id = $2',
        ['running', sessionId]
      )

      // Get session data
      const sessionQuery = `
        SELECT ts.*, a.name as adapter_name, a.adapter_config, a.base_model
        FROM lora_training_sessions ts
        JOIN lora_adapters a ON ts.adapter_id = a.id
        WHERE ts.id = $1
      `
      const sessionResult = await this.db.query(sessionQuery, [sessionId])
      const session = sessionResult.rows[0]

      // Simulate LoRA training process
      const trainingResults = await this.simulateLoRATraining(session)

      // Update session with results
      await this.db.query(`
        UPDATE lora_training_sessions 
        SET status = $1, completed_at = NOW(), training_logs = $2, 
            checkpoint_data = $3, final_metrics = $4
        WHERE id = $5
      `, [
        'completed',
        JSON.stringify(trainingResults.logs),
        JSON.stringify(trainingResults.checkpoint),
        JSON.stringify(trainingResults.metrics),
        sessionId
      ])

      // Update adapter with trained weights
      await this.db.query(`
        UPDATE lora_adapters 
        SET adapter_weights = $1, gating_weights = $2, performance_metrics = $3, 
            status = 'deployed', updated_at = NOW()
        WHERE id = $4
      `, [
        JSON.stringify(trainingResults.adapter_weights),
        JSON.stringify(trainingResults.gating_weights),
        JSON.stringify(trainingResults.metrics),
        session.adapter_id
      ])

      // Reload adapters
      await this.loadAdapters()

      logger.info('LoRA training completed', { 
        sessionId, 
        finalLoss: trainingResults.metrics.final_loss 
      })

    } catch (error) {
      await this.db.query(
        'UPDATE lora_training_sessions SET status = $1 WHERE id = $2',
        ['failed', sessionId]
      )
      throw error
    }
  }

  // Simulate LoRA training (replace with real training pipeline)
  private async simulateLoRATraining(session: any) {
    const trainingDataset = session.training_dataset as any[]
    const validationDataset = session.validation_dataset as any[]
    const config = session.adapter_config
    
    // Simulate training epochs
    const logs = []
    const epochs = session.hyperparameters.epochs || 3
    
    for (let epoch = 1; epoch <= epochs; epoch++) {
      await new Promise(resolve => setTimeout(resolve, 2000)) // Simulate training time
      
      const trainLoss = Math.max(0.1, 2.0 - (epoch * 0.3) + (Math.random() * 0.2))
      const valLoss = trainLoss + 0.1 + (Math.random() * 0.1)
      const accuracy = Math.min(0.98, 0.6 + (epoch * 0.1) + (Math.random() * 0.05))
      
      logs.push({
        epoch,
        train_loss: trainLoss,
        val_loss: valLoss,
        accuracy,
        timestamp: new Date().toISOString()
      })
    }

    // Generate adapter weights based on task domain
    const adapterWeights = this.generateAdapterWeights(session.task_domain, config)
    const gatingWeights = this.generateGatingWeights(session.task_domain)

    return {
      logs,
      checkpoint: {
        epoch: epochs,
        model_state: 'checkpoint_data_placeholder',
        optimizer_state: 'optimizer_state_placeholder'
      },
      adapter_weights: adapterWeights,
      gating_weights: gatingWeights,
      metrics: {
        final_loss: logs[logs.length - 1].train_loss,
        final_accuracy: logs[logs.length - 1].accuracy,
        training_samples: trainingDataset.length,
        validation_samples: validationDataset.length,
        convergence_epoch: Math.ceil(epochs * 0.7),
        parameter_efficiency: (config.rank * config.alpha) / 1000000 // Simulate efficiency
      }
    }
  }

  // Generate adapter weights based on task domain
  private generateAdapterWeights(taskDomain: string, config: any) {
    const weights: any = {}
    
    // Simulate different weight patterns for different domains
    switch (taskDomain) {
      case 'legal_analysis':
        weights.attention_layers = Array(12).fill(0).map(() => Math.random() * 0.1)
        weights.feedforward_layers = Array(12).fill(0).map(() => Math.random() * 0.05)
        break
      case 'risk_assessment':
        weights.attention_layers = Array(12).fill(0).map(() => Math.random() * 0.08)
        weights.classification_head = Array(4).fill(0).map(() => Math.random() * 0.2)
        break
      case 'clause_detection':
        weights.token_embeddings = Array(50000).fill(0).map(() => Math.random() * 0.001)
        weights.attention_layers = Array(12).fill(0).map(() => Math.random() * 0.12)
        break
      default:
        weights.general = Array(100).fill(0).map(() => Math.random() * 0.01)
    }
    
    return weights
  }

  // Generate gating weights for adapter routing
  private generateGatingWeights(taskDomain: string) {
    const baseWeights = {
      legal_analysis: 0.8,
      risk_assessment: 0.7,
      clause_detection: 0.9,
      recommendation: 0.6
    }
    
    return {
      domain_affinity: baseWeights[taskDomain as keyof typeof baseWeights] || 0.5,
      confidence_threshold: 0.75,
      routing_weights: {
        semantic_similarity: 0.4,
        task_specific: 0.4,
        performance_history: 0.2
      }
    }
  }

  // Smart routing to select best adapters for a request
  async routeRequest(requestId: string, inputText: string, taskHint?: string): Promise<RoutingDecision> {
    const startTime = Date.now()
    
    // Calculate adapter scores based on multiple factors
    const adapterScores = new Map<string, number>()
    
    for (const [adapterId, adapter] of this.adapters) {
      let score = 0
      
      // Task domain matching
      if (taskHint && adapter.task_domain === taskHint) {
        score += 0.4
      }
      
      // Performance history
      if (adapter.performance_metrics?.final_accuracy) {
        score += adapter.performance_metrics.final_accuracy * 0.3
      }
      
      // Semantic similarity (simplified)
      const semanticScore = this.calculateSemanticSimilarity(inputText, adapter.task_domain)
      score += semanticScore * 0.3
      
      adapterScores.set(adapterId, score)
    }
    
    // Select top adapters above threshold
    const threshold = 0.5
    const selectedAdapters = Array.from(adapterScores.entries())
      .filter(([_, score]) => score >= threshold)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 2) // Max 2 adapters for efficiency
      .map(([adapterId, _]) => adapterId)
    
    const executionTime = Date.now() - startTime
    
    // Store routing decision
    const decision: RoutingDecision = {
      request_id: requestId,
      input_text: inputText.substring(0, 500), // Store truncated version
      selected_adapters: selectedAdapters,
      router_confidence: Object.fromEntries(adapterScores),
      execution_time_ms: executionTime
    }
    
    await this.storeRoutingDecision(decision)
    
    logger.info('LoRA routing decision', { 
      requestId, 
      selectedAdapters: selectedAdapters.length,
      executionTime 
    })
    
    return decision
  }

  // Calculate semantic similarity (simplified implementation)
  private calculateSemanticSimilarity(text: string, taskDomain: string): number {
    const domainKeywords = {
      legal_analysis: ['contract', 'agreement', 'terms', 'clause', 'legal', 'provision'],
      risk_assessment: ['risk', 'liability', 'danger', 'warning', 'consequence', 'impact'],
      clause_detection: ['section', 'paragraph', 'subsection', 'article', 'clause', 'provision'],
      recommendation: ['suggest', 'recommend', 'advice', 'improve', 'consider', 'should']
    }
    
    const keywords = domainKeywords[taskDomain as keyof typeof domainKeywords] || []
    const textLower = text.toLowerCase()
    
    let matches = 0
    for (const keyword of keywords) {
      if (textLower.includes(keyword)) matches++
    }
    
    return Math.min(1.0, matches / keywords.length)
  }

  // Store routing decision for analysis
  private async storeRoutingDecision(decision: RoutingDecision): Promise<void> {
    const query = `
      INSERT INTO lora_routing_decisions 
      (request_id, input_text, selected_adapters, router_confidence, execution_time_ms, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `
    
    await this.db.query(query, [
      decision.request_id,
      decision.input_text,
      JSON.stringify(decision.selected_adapters),
      JSON.stringify(decision.router_confidence),
      decision.execution_time_ms
    ])
  }

  // Run inference with selected adapters
  async runInference(
    selectedAdapters: string[], 
    input: string, 
    baseModel: string = 'llama2'
  ): Promise<any> {
    if (selectedAdapters.length === 0) {
      // Fallback to base model
      return this.runBaseModelInference(input, baseModel)
    }
    
    // Get adapter configurations
    const adapters = selectedAdapters
      .map(id => this.adapters.get(id))
      .filter(Boolean) as LoRAAdapter[]
    
    // Combine adapter prompts and run inference
    const combinedPrompt = this.combineAdapterPrompts(adapters, input)
    
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: baseModel,
          prompt: combinedPrompt.user,
          system: combinedPrompt.system,
          stream: false,
          options: {
            temperature: 0.2, // Lower for adapter consistency
            top_p: 0.8,
            num_predict: 1500
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`)
      }

      const result = await response.json()
      return this.parseAdapterOutput(result.response, adapters)
      
    } catch (error) {
      logger.error('LoRA inference failed', { selectedAdapters, error })
      // Fallback to base model
      return this.runBaseModelInference(input, baseModel)
    }
  }

  // Combine multiple adapter prompts
  private combineAdapterPrompts(adapters: LoRAAdapter[], input: string) {
    const systemPrompts = adapters.map(adapter => 
      `As a ${adapter.task_domain.replace('_', ' ')} expert, `
    ).join('')
    
    const combinedSystem = `${systemPrompts}analyze the following legal document with high precision and accuracy. Focus on your specialized domain expertise.`
    
    const userPrompt = `Please analyze this legal document:

${input}

Provide analysis in the following format:
{
  "risk_score": <0-100>,
  "findings": [
    {
      "id": "finding_1",
      "category": "<category>",
      "severity": "<low|medium|high|critical>",
      "title": "<title>",
      "description": "<description>",
      "confidence": <0.0-1.0>
    }
  ],
  "recommendations": ["<recommendation1>", "<recommendation2>"],
  "summary": "<executive summary>"
}`

    return {
      system: combinedSystem,
      user: userPrompt
    }
  }

  // Parse output from multiple adapters
  private parseAdapterOutput(response: string, adapters: LoRAAdapter[]): any {
    try {
      // Try to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        
        // Add adapter metadata
        parsed.adapters_used = adapters.map(a => ({
          id: a.id,
          name: a.name,
          domain: a.task_domain,
          confidence: a.performance_metrics?.final_accuracy || 0.8
        }))
        
        return parsed
      }
    } catch (error) {
      logger.warn('Failed to parse adapter output as JSON', { error })
    }
    
    // Fallback parsing
    return {
      raw_response: response,
      adapters_used: adapters.map(a => a.name),
      parsed: false
    }
  }

  // Fallback to base model inference
  private async runBaseModelInference(input: string, baseModel: string): Promise<any> {
    const response = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: baseModel,
        prompt: `Analyze this legal document and identify risks:\n\n${input}`,
        system: 'You are a legal document analysis expert. Provide detailed risk assessment.',
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 1000
        }
      })
    })

    const result = await response.json()
    return {
      raw_response: result.response,
      fallback_used: true,
      base_model: baseModel
    }
  }

  // Get adapter by ID
  async getAdapter(adapterId: string): Promise<LoRAAdapter | null> {
    const query = 'SELECT * FROM lora_adapters WHERE id = $1'
    const result = await this.db.query(query, [adapterId])
    
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id,
      name: row.name,
      base_model: row.base_model,
      task_domain: row.task_domain,
      adapter_config: row.adapter_config,
      training_config: row.training_config,
      adapter_weights: row.adapter_weights,
      gating_weights: row.gating_weights,
      performance_metrics: row.performance_metrics,
      status: row.status
    }
  }

  // Get training session status
  async getTrainingStatus(sessionId: string): Promise<LoRATrainingSession | null> {
    const query = `
      SELECT ts.*, a.name as adapter_name
      FROM lora_training_sessions ts
      JOIN lora_adapters a ON ts.adapter_id = a.id
      WHERE ts.id = $1
    `
    const result = await this.db.query(query, [sessionId])
    
    if (result.rows.length === 0) return null
    
    const row = result.rows[0]
    return {
      id: row.id,
      adapter_id: row.adapter_id,
      training_dataset: row.training_dataset,
      validation_dataset: row.validation_dataset,
      hyperparameters: row.hyperparameters,
      training_logs: row.training_logs || [],
      checkpoint_data: row.checkpoint_data,
      final_metrics: row.final_metrics,
      status: row.status
    }
  }

  // Add feedback to improve routing
  async addRoutingFeedback(
    requestId: string, 
    actualPerformance: any, 
    userRating?: number
  ): Promise<void> {
    // Update routing decision with performance data
    const updateQuery = `
      UPDATE lora_routing_decisions 
      SET performance_metrics = $1
      WHERE request_id = $2
    `
    
    const performanceData = {
      actual_performance: actualPerformance,
      user_rating: userRating,
      feedback_timestamp: new Date().toISOString()
    }
    
    await this.db.query(updateQuery, [JSON.stringify(performanceData), requestId])
    
    logger.info('Added routing feedback', { requestId, userRating })
  }

  // Get routing statistics
  async getRoutingStats(): Promise<any> {
    const query = `
      SELECT 
        COUNT(*) as total_requests,
        AVG(execution_time_ms) as avg_execution_time,
        COUNT(DISTINCT jsonb_array_elements_text(selected_adapters)) as unique_adapters_used,
        AVG(CASE 
          WHEN performance_metrics->>'user_rating' IS NOT NULL 
          THEN CAST(performance_metrics->>'user_rating' AS NUMERIC) 
          ELSE NULL 
        END) as avg_user_rating
      FROM lora_routing_decisions
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `
    
    const result = await this.db.query(query)
    return result.rows[0]
  }
}