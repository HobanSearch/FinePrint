/**
 * Business Agent Model Connector
 * Integrates with Ollama for business agent model inference
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { 
  ModelConfiguration, 
  InteractionType, 
  Customer,
  InteractionOutcome 
} from '../types';

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface AgentPrompt {
  role: string;
  content: string;
  context?: Record<string, any>;
}

export interface AgentResponse {
  success: boolean;
  content: string;
  metrics?: {
    responseTime: number;
    tokenCount: number;
    modelVersion: string;
  };
  error?: string;
}

export class BusinessAgentConnector extends EventEmitter {
  private ollamaClient: AxiosInstance;
  private modelCache: Map<string, OllamaModel> = new Map();
  private contextCache: Map<string, number[]> = new Map();
  private performanceMetrics: Map<string, any[]> = new Map();
  private fallbackMode: boolean = false;
  private readonly maxRetries: number = 3;
  private readonly timeout: number = 30000; // 30 seconds

  // Model mapping
  private readonly modelMapping = {
    marketing: 'fine-print-marketing:latest',
    sales: 'fine-print-sales:latest',
    support: 'fine-print-customer:latest',
    analytics: 'fine-print-analytics:latest'
  };

  constructor(
    private ollamaUrl: string = process.env.OLLAMA_URL || 'http://localhost:11434',
    private enableMetrics: boolean = true
  ) {
    super();
    
    this.ollamaClient = axios.create({
      baseURL: this.ollamaUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.initializeModels();
  }

  /**
   * Initialize and verify available models
   */
  private async initializeModels(): Promise<void> {
    try {
      logger.info('Initializing business agent models');
      
      // Check Ollama availability
      const health = await this.checkOllamaHealth();
      if (!health) {
        logger.warn('Ollama service not available, enabling fallback mode');
        this.fallbackMode = true;
        return;
      }

      // List available models
      const response = await this.ollamaClient.get('/api/tags');
      const models: OllamaModel[] = response.data.models || [];
      
      // Cache available business models
      for (const model of models) {
        if (Object.values(this.modelMapping).includes(model.name)) {
          this.modelCache.set(model.name, model);
          logger.info(`Loaded business model: ${model.name}`);
        }
      }

      // Verify all required models are available
      for (const [type, modelName] of Object.entries(this.modelMapping)) {
        if (!this.modelCache.has(modelName)) {
          logger.warn(`Business model not found: ${modelName} for type: ${type}`);
          // Pull the model if not available
          await this.pullModel(modelName);
        }
      }

      this.fallbackMode = false;
      logger.info('Business agent models initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize business models', error);
      this.fallbackMode = true;
    }
  }

  /**
   * Check Ollama service health
   */
  private async checkOllamaHealth(): Promise<boolean> {
    try {
      const response = await this.ollamaClient.get('/api/version');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Pull a model from Ollama registry
   */
  private async pullModel(modelName: string): Promise<void> {
    try {
      logger.info(`Pulling model: ${modelName}`);
      
      const response = await this.ollamaClient.post('/api/pull', {
        name: modelName,
        stream: false
      });

      if (response.data.status === 'success') {
        logger.info(`Successfully pulled model: ${modelName}`);
        // Refresh model cache
        await this.initializeModels();
      }
    } catch (error) {
      logger.error(`Failed to pull model: ${modelName}`, error);
    }
  }

  /**
   * Invoke a business agent model
   */
  async invokeAgent(
    type: 'marketing' | 'sales' | 'support' | 'analytics',
    prompt: AgentPrompt,
    config?: ModelConfiguration
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      // Check fallback mode
      if (this.fallbackMode) {
        return this.generateFallbackResponse(type, prompt);
      }

      const modelName = config?.version || this.modelMapping[type];
      
      // Verify model availability
      if (!this.modelCache.has(modelName)) {
        logger.warn(`Model not available: ${modelName}, using fallback`);
        return this.generateFallbackResponse(type, prompt);
      }

      // Prepare the prompt with context
      const fullPrompt = this.preparePrompt(type, prompt);
      
      // Get cached context if available
      const contextKey = `${type}-${prompt.context?.customerId || 'default'}`;
      const cachedContext = this.contextCache.get(contextKey);

      // Call Ollama API
      const response = await this.callOllamaWithRetry(modelName, fullPrompt, cachedContext);
      
      // Cache the context for conversation continuity
      if (response.context) {
        this.contextCache.set(contextKey, response.context);
      }

      // Record metrics
      const metrics = {
        responseTime: Date.now() - startTime,
        tokenCount: response.eval_count || 0,
        modelVersion: modelName,
        promptEvalDuration: response.prompt_eval_duration,
        evalDuration: response.eval_duration
      };

      if (this.enableMetrics) {
        this.recordPerformanceMetrics(type, metrics);
      }

      // Emit event for monitoring
      this.emit('agent:invoked', {
        type,
        modelName,
        metrics,
        success: true
      });

      return {
        success: true,
        content: response.response,
        metrics
      };

    } catch (error: any) {
      logger.error(`Failed to invoke ${type} agent`, error);
      
      // Emit error event
      this.emit('agent:error', {
        type,
        error: error.message,
        duration: Date.now() - startTime
      });

      // Return fallback response
      return this.generateFallbackResponse(type, prompt);
    }
  }

  /**
   * Call Ollama API with retry logic
   */
  private async callOllamaWithRetry(
    model: string,
    prompt: string,
    context?: number[],
    attempt: number = 1
  ): Promise<OllamaResponse> {
    try {
      const response = await this.ollamaClient.post('/api/generate', {
        model,
        prompt,
        context,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40,
          repeat_penalty: 1.1,
          num_predict: 500
        }
      });

      return response.data;

    } catch (error: any) {
      if (attempt < this.maxRetries) {
        logger.warn(`Ollama call failed, retrying (attempt ${attempt + 1}/${this.maxRetries})`);
        await this.delay(1000 * attempt); // Exponential backoff
        return this.callOllamaWithRetry(model, prompt, context, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Prepare prompt with appropriate context for each agent type
   */
  private preparePrompt(type: string, prompt: AgentPrompt): string {
    const basePrompt = prompt.content;
    const context = prompt.context || {};

    switch (type) {
      case 'marketing':
        return this.prepareMarketingPrompt(basePrompt, context);
      case 'sales':
        return this.prepareSalesPrompt(basePrompt, context);
      case 'support':
        return this.prepareSupportPrompt(basePrompt, context);
      case 'analytics':
        return this.prepareAnalyticsPrompt(basePrompt, context);
      default:
        return basePrompt;
    }
  }

  /**
   * Prepare marketing agent prompt
   */
  private prepareMarketingPrompt(base: string, context: Record<string, any>): string {
    return `You are a marketing specialist for Fine Print AI, a legal document analysis service.
    
Customer Context:
- Segment: ${context.segment || 'General'}
- Stage: ${context.stage || 'Awareness'}
- Previous Interactions: ${context.interactionCount || 0}
- Industry: ${context.industry || 'Technology'}

Task: ${base}

Provide a response that:
1. Addresses the customer's specific needs
2. Highlights relevant product benefits
3. Includes a clear call-to-action
4. Maintains brand voice and compliance standards`;
  }

  /**
   * Prepare sales agent prompt
   */
  private prepareSalesPrompt(base: string, context: Record<string, any>): string {
    return `You are a sales representative for Fine Print AI, focusing on enterprise solutions.

Customer Profile:
- Company Size: ${context.companySize || 'Mid-market'}
- Current Solution: ${context.currentSolution || 'Manual review'}
- Pain Points: ${context.painPoints || 'Time-consuming manual review'}
- Budget Range: ${context.budgetRange || 'Not specified'}
- Decision Timeline: ${context.timeline || '3-6 months'}

Objective: ${base}

Your response should:
1. Demonstrate understanding of their challenges
2. Position Fine Print AI as the solution
3. Address potential objections
4. Move the conversation toward next steps`;
  }

  /**
   * Prepare support agent prompt
   */
  private prepareSupportPrompt(base: string, context: Record<string, any>): string {
    return `You are a customer support specialist for Fine Print AI.

Customer Information:
- Account Type: ${context.accountType || 'Professional'}
- Issue Category: ${context.issueCategory || 'General'}
- Urgency: ${context.urgency || 'Medium'}
- Previous Tickets: ${context.ticketHistory || 'None'}
- Satisfaction Score: ${context.satisfactionScore || 'Not rated'}

Request: ${base}

Provide support that:
1. Acknowledges the customer's concern
2. Offers clear, actionable solutions
3. Ensures customer satisfaction
4. Follows up appropriately`;
  }

  /**
   * Prepare analytics agent prompt
   */
  private prepareAnalyticsPrompt(base: string, context: Record<string, any>): string {
    return `You are a business analytics specialist analyzing Fine Print AI metrics.

Data Context:
- Time Period: ${context.timePeriod || 'Last 30 days'}
- Metrics Focus: ${context.metricsFocus || 'Revenue and growth'}
- Comparison Baseline: ${context.baseline || 'Previous period'}
- Segments: ${context.segments || 'All segments'}

Analysis Request: ${base}

Provide insights that:
1. Identify key trends and patterns
2. Highlight actionable opportunities
3. Flag potential risks
4. Recommend specific actions with expected impact`;
  }

  /**
   * Generate interaction outcome based on agent response
   */
  async generateInteractionOutcome(
    customer: Customer,
    interactionType: InteractionType,
    modelType: string,
    config?: ModelConfiguration
  ): Promise<InteractionOutcome> {
    // Prepare context for the agent
    const context = {
      customerId: customer.id,
      segment: customer.segmentId,
      stage: customer.status,
      interactionCount: customer.interactionHistory.length,
      satisfactionScore: customer.satisfactionScore,
      lifetimeValue: customer.lifetimeValue
    };

    // Generate appropriate prompt based on interaction type
    const prompt = this.generateInteractionPrompt(interactionType, customer);

    // Invoke the agent
    const response = await this.invokeAgent(
      modelType as 'marketing' | 'sales' | 'support' | 'analytics',
      { role: 'assistant', content: prompt, context },
      config
    );

    // Parse response to determine outcome
    return this.parseAgentResponse(response, interactionType, customer);
  }

  /**
   * Generate interaction-specific prompt
   */
  private generateInteractionPrompt(type: InteractionType, customer: Customer): string {
    const prompts: Record<InteractionType, string> = {
      [InteractionType.MARKETING_EMAIL]: 
        `Generate a personalized marketing email for a ${customer.status} in the legal tech space. Focus on document analysis benefits.`,
      
      [InteractionType.SALES_CALL]: 
        `Conduct a sales conversation with a ${customer.status} interested in Fine Print AI. Address their needs and move toward closing.`,
      
      [InteractionType.SUPPORT_TICKET]: 
        `Resolve a support ticket for a customer experiencing issues with document analysis. Provide clear troubleshooting steps.`,
      
      [InteractionType.PRODUCT_DEMO]: 
        `Present a compelling product demo highlighting Fine Print AI's key features and ROI for legal document analysis.`,
      
      [InteractionType.ONBOARDING]: 
        `Guide a new customer through the Fine Print AI onboarding process. Ensure they understand key features and best practices.`,
      
      [InteractionType.FEATURE_REQUEST]: 
        `Respond to a customer's feature request. Acknowledge their needs and explain our product roadmap.`,
      
      [InteractionType.COMPLAINT]: 
        `Address a customer complaint professionally. Show empathy, provide solutions, and work to restore satisfaction.`,
      
      [InteractionType.RENEWAL_DISCUSSION]: 
        `Discuss renewal options with an existing customer. Highlight value delivered and introduce potential upgrades.`
    };

    return prompts[type] || 'Interact with the customer appropriately.';
  }

  /**
   * Parse agent response to determine interaction outcome
   */
  private parseAgentResponse(
    response: AgentResponse,
    interactionType: InteractionType,
    customer: Customer
  ): InteractionOutcome {
    if (!response.success) {
      return {
        success: false,
        sentiment: -0.5,
        nextAction: 'Follow up required'
      };
    }

    // Analyze response sentiment and quality
    const sentiment = this.analyzeSentiment(response.content);
    const quality = this.assessResponseQuality(response.content, interactionType);
    
    // Determine success based on quality and sentiment
    const success = quality > 0.6 && sentiment > -0.3;

    // Determine conversion based on interaction type and success
    let conversionType: InteractionOutcome['conversionType'];
    let revenue: number | undefined;

    if (success) {
      switch (interactionType) {
        case InteractionType.MARKETING_EMAIL:
          if (customer.status === 'prospect' && quality > 0.7) {
            conversionType = 'lead';
          }
          break;
          
        case InteractionType.SALES_CALL:
          if (customer.status === 'lead' && quality > 0.8) {
            conversionType = 'sale';
            revenue = this.calculateDealValue(customer);
          } else if (quality > 0.7) {
            conversionType = 'opportunity';
          }
          break;
          
        case InteractionType.RENEWAL_DISCUSSION:
          if (customer.status === 'customer' && quality > 0.75) {
            conversionType = 'renewal';
            revenue = this.calculateRenewalValue(customer);
          }
          break;
      }
    }

    return {
      success,
      sentiment,
      conversionType,
      revenue,
      nextAction: this.determineNextAction(interactionType, success)
    };
  }

  /**
   * Analyze sentiment of agent response
   */
  private analyzeSentiment(content: string): number {
    // Simple sentiment analysis based on keywords
    const positiveWords = ['excellent', 'great', 'perfect', 'wonderful', 'amazing', 'fantastic', 'love', 'appreciate'];
    const negativeWords = ['problem', 'issue', 'concern', 'difficult', 'frustrated', 'disappointed', 'unhappy', 'poor'];
    
    const lowerContent = content.toLowerCase();
    let score = 0;
    
    positiveWords.forEach(word => {
      if (lowerContent.includes(word)) score += 0.2;
    });
    
    negativeWords.forEach(word => {
      if (lowerContent.includes(word)) score -= 0.2;
    });
    
    return Math.max(-1, Math.min(1, score));
  }

  /**
   * Assess quality of agent response
   */
  private assessResponseQuality(content: string, interactionType: InteractionType): number {
    let quality = 0.5; // Base quality
    
    // Check response length (not too short, not too long)
    const wordCount = content.split(' ').length;
    if (wordCount > 50 && wordCount < 500) quality += 0.1;
    
    // Check for personalization indicators
    if (content.includes('you') || content.includes('your')) quality += 0.1;
    
    // Check for call-to-action
    if (content.includes('next step') || content.includes('schedule') || content.includes('try')) quality += 0.1;
    
    // Interaction-specific quality checks
    switch (interactionType) {
      case InteractionType.SALES_CALL:
        if (content.includes('value') || content.includes('ROI') || content.includes('benefit')) quality += 0.15;
        break;
      case InteractionType.SUPPORT_TICKET:
        if (content.includes('resolve') || content.includes('solution') || content.includes('help')) quality += 0.15;
        break;
      case InteractionType.MARKETING_EMAIL:
        if (content.includes('offer') || content.includes('exclusive') || content.includes('limited')) quality += 0.1;
        break;
    }
    
    return Math.min(1, quality);
  }

  /**
   * Calculate deal value based on customer profile
   */
  private calculateDealValue(customer: Customer): number {
    const baseValue = 1200; // Base annual value
    const ltv = customer.lifetimeValue || 0;
    const multiplier = 1 + (customer.satisfactionScore || 0.5);
    
    return baseValue * multiplier + (ltv * 0.1);
  }

  /**
   * Calculate renewal value
   */
  private calculateRenewalValue(customer: Customer): number {
    const currentValue = customer.lifetimeValue || 1200;
    const upsellPotential = customer.satisfactionScore > 0.8 ? 1.2 : 1.0;
    
    return currentValue * upsellPotential;
  }

  /**
   * Determine next action based on interaction outcome
   */
  private determineNextAction(interactionType: InteractionType, success: boolean): string {
    if (!success) {
      return 'Schedule follow-up';
    }

    const nextActions: Record<InteractionType, string> = {
      [InteractionType.MARKETING_EMAIL]: 'Send follow-up sequence',
      [InteractionType.SALES_CALL]: 'Schedule product demo',
      [InteractionType.SUPPORT_TICKET]: 'Monitor for resolution',
      [InteractionType.PRODUCT_DEMO]: 'Send proposal',
      [InteractionType.ONBOARDING]: 'Schedule check-in call',
      [InteractionType.FEATURE_REQUEST]: 'Add to product roadmap',
      [InteractionType.COMPLAINT]: 'Escalate to management',
      [InteractionType.RENEWAL_DISCUSSION]: 'Send renewal contract'
    };

    return nextActions[interactionType] || 'No action required';
  }

  /**
   * Generate fallback response when models are unavailable
   */
  private generateFallbackResponse(type: string, prompt: AgentPrompt): AgentResponse {
    logger.warn(`Using fallback response for ${type} agent`);
    
    const fallbackResponses: Record<string, string> = {
      marketing: 'Thank you for your interest in Fine Print AI. Our AI-powered legal document analysis can save your team hours of manual review time while ensuring nothing important is missed.',
      sales: 'I understand your needs and believe Fine Print AI can provide significant value. Our solution typically reduces document review time by 80% while improving accuracy. Can we schedule a demo to show you how it works with your specific use case?',
      support: 'Thank you for reaching out. I understand your concern and am here to help. Let me guide you through the solution step by step to resolve this issue quickly.',
      analytics: 'Based on the current metrics, we see positive trends in customer acquisition and retention. Key opportunities include improving conversion rates and expanding into new market segments.'
    };

    return {
      success: true,
      content: fallbackResponses[type] || 'Thank you for contacting Fine Print AI. How can I assist you today?',
      metrics: {
        responseTime: 100,
        tokenCount: 50,
        modelVersion: 'fallback'
      }
    };
  }

  /**
   * Record performance metrics for analysis
   */
  private recordPerformanceMetrics(type: string, metrics: any): void {
    if (!this.performanceMetrics.has(type)) {
      this.performanceMetrics.set(type, []);
    }
    
    const typeMetrics = this.performanceMetrics.get(type)!;
    typeMetrics.push({
      ...metrics,
      timestamp: new Date()
    });
    
    // Keep only last 1000 metrics per type
    if (typeMetrics.length > 1000) {
      typeMetrics.shift();
    }

    // Emit metrics event for real-time monitoring
    this.emit('metrics:recorded', {
      type,
      metrics,
      aggregates: this.calculateAggregateMetrics(type)
    });
  }

  /**
   * Calculate aggregate metrics for a model type
   */
  private calculateAggregateMetrics(type: string): any {
    const metrics = this.performanceMetrics.get(type) || [];
    if (metrics.length === 0) return {};

    const responseTimes = metrics.map(m => m.responseTime);
    const tokenCounts = metrics.map(m => m.tokenCount);

    return {
      avgResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      p95ResponseTime: this.percentile(responseTimes, 0.95),
      avgTokenCount: tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length,
      totalInvocations: metrics.length
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index] || 0;
  }

  /**
   * Get performance report for all models
   */
  getPerformanceReport(): Record<string, any> {
    const report: Record<string, any> = {};
    
    for (const [type, _] of Object.entries(this.modelMapping)) {
      report[type] = this.calculateAggregateMetrics(type);
    }
    
    return report;
  }

  /**
   * Clear context cache for a specific customer or all
   */
  clearContextCache(customerId?: string): void {
    if (customerId) {
      // Clear specific customer contexts
      for (const key of this.contextCache.keys()) {
        if (key.includes(customerId)) {
          this.contextCache.delete(key);
        }
      }
    } else {
      // Clear all contexts
      this.contextCache.clear();
    }
    
    logger.info('Context cache cleared', { customerId });
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.contextCache.clear();
    this.performanceMetrics.clear();
    this.removeAllListeners();
    logger.info('Business agent connector cleaned up');
  }
}