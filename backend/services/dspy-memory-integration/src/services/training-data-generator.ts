/**
 * Training Data Generator - Creates high-quality training datasets from successful business outcomes
 * Generates synthetic examples, augments existing data, and maintains data quality standards
 */

import { createServiceLogger } from '@fineprintai/shared-logger';
import { 
  BusinessOutcome, 
  BusinessDomain, 
  TrainingExample,
  TrainingSource,
  TrainingInput,
  TrainingOutput,
  LearningPattern 
} from '../types/learning';
import * as stats from 'simple-statistics';

export interface TrainingDataRequest {
  domain: BusinessDomain;
  count: number;
  quality: 'high' | 'medium' | 'low';
  source: 'historical' | 'synthetic' | 'mixed';
  filters?: {
    successOnly?: boolean;
    timeWindow?: { start: Date; end: Date };
    contextFilters?: Record<string, any>;
    minConfidence?: number;
  };
  augmentation?: {
    enabled: boolean;
    techniques: AugmentationTechnique[];
    intensity: number; // 0-1 scale
  };
}

export interface TrainingDataResponse {
  examples: TrainingExample[];
  statistics: {
    totalGenerated: number;
    qualityDistribution: Record<string, number>;
    sourceDistribution: Record<string, number>;
    domainCoverage: Record<string, number>;
    averageQuality: number;
    diversityScore: number;
  };
  recommendations: string[];
  warnings: string[];
}

export enum AugmentationTechnique {
  CONTEXT_VARIATION = 'context_variation',
  PARAPHRASING = 'paraphrasing',
  NOISE_INJECTION = 'noise_injection',
  SEMANTIC_SUBSTITUTION = 'semantic_substitution',
  TEMPORAL_SHIFTING = 'temporal_shifting',
  PARAMETER_PERTURBATION = 'parameter_perturbation'
}

export interface DataQualityMetrics {
  completeness: number; // 0-1 scale
  accuracy: number;
  consistency: number;
  diversity: number;
  relevance: number;
  freshness: number;
  balance: number; // Class balance for success/failure
}

export interface SyntheticGenerationConfig {
  domain: BusinessDomain;
  basePatterns: LearningPattern[];
  variationStrategies: VariationStrategy[];
  qualityThreshold: number;
  maxAttempts: number;
}

export interface VariationStrategy {
  type: 'contextual' | 'parametric' | 'semantic' | 'temporal';
  parameters: Record<string, any>;
  weight: number;
}

export class TrainingDataGenerator {
  private logger = createServiceLogger('training-data-generator');
  
  // Historical data storage
  private historicalOutcomes: Map<BusinessDomain, BusinessOutcome[]> = new Map();
  private patternExamples: Map<string, TrainingExample[]> = new Map();
  
  // Generation templates and rules
  private domainTemplates: Map<BusinessDomain, PromptTemplate[]> = new Map();
  private qualityRules: Map<BusinessDomain, QualityRule[]> = new Map();
  
  // Augmentation engines
  private augmentationStrategies: Map<AugmentationTechnique, AugmentationStrategy> = new Map();

  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Training Data Generator...');
      
      // Initialize domain templates
      await this.initializeDomainTemplates();
      
      // Initialize quality rules
      await this.initializeQualityRules();
      
      // Initialize augmentation strategies
      await this.initializeAugmentationStrategies();
      
      this.logger.info('Training Data Generator initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Training Data Generator', { error });
      throw error;
    }
  }

  private async initializeDomainTemplates(): Promise<void> {
    // Initialize prompt templates for each domain
    Object.values(BusinessDomain).forEach(domain => {
      this.domainTemplates.set(domain, this.getDefaultTemplates(domain));
    });
  }

  private getDefaultTemplates(domain: BusinessDomain): PromptTemplate[] {
    const templates: PromptTemplate[] = [];
    
    switch (domain) {
      case BusinessDomain.LEGAL_ANALYSIS:
        templates.push(
          {
            id: `legal_analysis_1`,
            template: 'Analyze the following legal document for potential risks: {document}',
            parameters: ['document'],
            expectedOutputType: 'risk_analysis',
            contextRequirements: ['documentType', 'jurisdiction'],
          },
          {
            id: `legal_analysis_2`,
            template: 'Review this contract clause for compliance issues: {clause}',
            parameters: ['clause'],
            expectedOutputType: 'compliance_review',
            contextRequirements: ['contractType', 'regulatoryFramework'],
          }
        );
        break;
        
      case BusinessDomain.MARKETING_CONTENT:
        templates.push(
          {
            id: `marketing_content_1`,
            template: 'Generate marketing copy for {product} targeting {audience}',
            parameters: ['product', 'audience'],
            expectedOutputType: 'marketing_copy',
            contextRequirements: ['campaignType', 'tone', 'platform'],
          },
          {
            id: `marketing_content_2`,
            template: 'Create a compelling subject line for {campaign} email campaign',
            parameters: ['campaign'],
            expectedOutputType: 'subject_line',
            contextRequirements: ['audience', 'campaignGoal'],
          }
        );
        break;
        
      case BusinessDomain.SALES_COMMUNICATION:
        templates.push(
          {
            id: `sales_comm_1`,
            template: 'Draft a follow-up email for {prospect} after {interaction}',
            parameters: ['prospect', 'interaction'],
            expectedOutputType: 'follow_up_email',
            contextRequirements: ['dealStage', 'customerSegment'],
          }
        );
        break;
        
      case BusinessDomain.CUSTOMER_SUPPORT:
        templates.push(
          {
            id: `support_1`,
            template: 'Resolve customer issue: {issue} with empathy and efficiency',
            parameters: ['issue'],
            expectedOutputType: 'support_response',
            contextRequirements: ['issueCategory', 'customerTier', 'urgency'],
          }
        );
        break;
        
      default:
        templates.push({
          id: `${domain}_default`,
          template: 'Process {input} for {context}',
          parameters: ['input', 'context'],
          expectedOutputType: 'response',
          contextRequirements: [],
        });
    }
    
    return templates;
  }

  private async initializeQualityRules(): Promise<void> {
    Object.values(BusinessDomain).forEach(domain => {
      this.qualityRules.set(domain, this.getQualityRules(domain));
    });
  }

  private getQualityRules(domain: BusinessDomain): QualityRule[] {
    const commonRules: QualityRule[] = [
      {
        name: 'completeness',
        description: 'All required fields must be present',
        weight: 0.25,
        validator: (example: TrainingExample) => {
          const hasInput = example.input.prompt && example.input.prompt.length > 0;
          const hasOutput = example.output.response && example.output.response.length > 0;
          const hasContext = Object.keys(example.input.context).length > 0;
          return hasInput && hasOutput && hasContext ? 1 : 0;
        },
      },
      {
        name: 'relevance',
        description: 'Example must be relevant to the domain',
        weight: 0.2,
        validator: (example: TrainingExample) => {
          return example.domain === domain ? 1 : 0;
        },
      },
      {
        name: 'quality_score',
        description: 'Must meet minimum quality threshold',
        weight: 0.15,
        validator: (example: TrainingExample) => {
          return example.qualityScore;
        },
      },
      {
        name: 'outcome_success',
        description: 'Should be based on successful business outcomes',
        weight: 0.2,
        validator: (example: TrainingExample) => {
          return example.outcome.success ? 1 : 0.3; // Some weight for failure examples
        },
      },
      {
        name: 'freshness',
        description: 'Recent examples are more valuable',
        weight: 0.1,
        validator: (example: TrainingExample) => {
          const daysSince = (Date.now() - example.timestamp.getTime()) / (1000 * 60 * 60 * 24);
          return Math.max(0, 1 - (daysSince / 90)); // Decay over 90 days
        },
      },
      {
        name: 'diversity',
        description: 'Context should be diverse',
        weight: 0.1,
        validator: (example: TrainingExample) => {
          const contextKeys = Object.keys(example.input.context);
          const contextValues = Object.values(example.input.context).filter(v => v != null);
          return Math.min(1, contextValues.length / Math.max(contextKeys.length, 1));
        },
      },
    ];

    // Add domain-specific rules
    const domainSpecificRules = this.getDomainSpecificQualityRules(domain);
    
    return [...commonRules, ...domainSpecificRules];
  }

  private getDomainSpecificQualityRules(domain: BusinessDomain): QualityRule[] {
    switch (domain) {
      case BusinessDomain.LEGAL_ANALYSIS:
        return [
          {
            name: 'legal_accuracy',
            description: 'Legal analysis must be accurate and compliant',
            weight: 0.3,
            validator: (example: TrainingExample) => {
              // Would implement legal-specific validation
              return example.outcome.confidence;
            },
          },
        ];
        
      case BusinessDomain.CUSTOMER_SUPPORT:
        return [
          {
            name: 'customer_satisfaction',
            description: 'Support responses should lead to customer satisfaction',
            weight: 0.25,
            validator: (example: TrainingExample) => {
              return example.outcome.metrics.satisfaction?.score ? 
                example.outcome.metrics.satisfaction.score / 10 : 0.5;
            },
          },
        ];
        
      default:
        return [];
    }
  }

  private async initializeAugmentationStrategies(): Promise<void> {
    // Context Variation Strategy
    this.augmentationStrategies.set(AugmentationTechnique.CONTEXT_VARIATION, {
      name: 'Context Variation',
      description: 'Varies contextual parameters while maintaining core meaning',
      apply: async (example: TrainingExample, intensity: number) => {
        return await this.applyContextVariation(example, intensity);
      },
    });

    // Temporal Shifting Strategy
    this.augmentationStrategies.set(AugmentationTechnique.TEMPORAL_SHIFTING, {
      name: 'Temporal Shifting',
      description: 'Adjusts temporal context (time of day, season, etc.)',
      apply: async (example: TrainingExample, intensity: number) => {
        return await this.applyTemporalShifting(example, intensity);
      },
    });

    // Parameter Perturbation Strategy
    this.augmentationStrategies.set(AugmentationTechnique.PARAMETER_PERTURBATION, {
      name: 'Parameter Perturbation',
      description: 'Slightly modifies numerical parameters',
      apply: async (example: TrainingExample, intensity: number) => {
        return await this.applyParameterPerturbation(example, intensity);
      },
    });

    // Noise Injection Strategy
    this.augmentationStrategies.set(AugmentationTechnique.NOISE_INJECTION, {
      name: 'Noise Injection',
      description: 'Adds controlled noise to make training more robust',
      apply: async (example: TrainingExample, intensity: number) => {
        return await this.applyNoiseInjection(example, intensity);
      },
    });
  }

  /**
   * Generate training data based on request parameters
   */
  async generateForDomain(domain: BusinessDomain, request: Omit<TrainingDataRequest, 'domain'>): Promise<TrainingDataResponse> {
    try {
      this.logger.info('Generating training data', {
        domain,
        count: request.count,
        quality: request.quality,
        source: request.source,
      });

      const fullRequest: TrainingDataRequest = { ...request, domain };
      const examples: TrainingExample[] = [];
      
      // Generate examples based on source preference
      switch (request.source) {
        case 'historical':
          examples.push(...await this.generateFromHistoricalData(fullRequest));
          break;
          
        case 'synthetic':
          examples.push(...await this.generateSyntheticData(fullRequest));
          break;
          
        case 'mixed':
          const historicalCount = Math.floor(request.count * 0.7);
          const syntheticCount = request.count - historicalCount;
          
          examples.push(...await this.generateFromHistoricalData({
            ...fullRequest,
            count: historicalCount,
          }));
          
          examples.push(...await this.generateSyntheticData({
            ...fullRequest,
            count: syntheticCount,
          }));
          break;
      }

      // Apply augmentation if requested
      if (request.augmentation?.enabled && examples.length > 0) {
        const augmentedExamples = await this.applyAugmentation(examples, request.augmentation);
        examples.push(...augmentedExamples);
      }

      // Filter and sort by quality
      const filteredExamples = examples
        .filter(example => this.meetsQualityThreshold(example, request.quality))
        .sort((a, b) => b.qualityScore - a.qualityScore)
        .slice(0, request.count);

      // Calculate statistics
      const statistics = this.calculateDataStatistics(filteredExamples);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(filteredExamples, request);
      const warnings = this.generateWarnings(filteredExamples, request);

      const response: TrainingDataResponse = {
        examples: filteredExamples,
        statistics,
        recommendations,
        warnings,
      };

      this.logger.info('Training data generation completed', {
        domain,
        requested: request.count,
        generated: filteredExamples.length,
        averageQuality: statistics.averageQuality,
      });

      return response;

    } catch (error) {
      this.logger.error('Failed to generate training data', { error, domain });
      throw error;
    }
  }

  private async generateFromHistoricalData(request: TrainingDataRequest): Promise<TrainingExample[]> {
    const examples: TrainingExample[] = [];
    const domainOutcomes = this.historicalOutcomes.get(request.domain) || [];
    
    if (domainOutcomes.length === 0) {
      this.logger.warn('No historical data available', { domain: request.domain });
      return examples;
    }

    // Filter outcomes based on request criteria
    let filteredOutcomes = domainOutcomes;
    
    if (request.filters) {
      filteredOutcomes = this.applyOutcomeFilters(domainOutcomes, request.filters);
    }

    // Convert successful outcomes to training examples
    const successfulOutcomes = request.filters?.successOnly !== false ? 
      filteredOutcomes.filter(outcome => outcome.success) : filteredOutcomes;

    for (const outcome of successfulOutcomes.slice(0, request.count)) {
      const example = await this.createTrainingExampleFromOutcome(outcome);
      if (example && this.meetsQualityThreshold(example, request.quality)) {
        examples.push(example);
      }
    }

    return examples;
  }

  private applyOutcomeFilters(outcomes: BusinessOutcome[], filters: NonNullable<TrainingDataRequest['filters']>): BusinessOutcome[] {
    let filtered = outcomes;

    if (filters.timeWindow) {
      filtered = filtered.filter(outcome =>
        outcome.timestamp >= filters.timeWindow!.start &&
        outcome.timestamp <= filters.timeWindow!.end
      );
    }

    if (filters.contextFilters) {
      filtered = filtered.filter(outcome => {
        return Object.entries(filters.contextFilters!).every(([key, value]) =>
          outcome.context[key] === value
        );
      });
    }

    if (filters.minConfidence) {
      filtered = filtered.filter(outcome => outcome.confidence >= filters.minConfidence!);
    }

    if (filters.successOnly !== undefined) {
      filtered = filtered.filter(outcome => outcome.success === filters.successOnly);
    }

    return filtered;
  }

  private async createTrainingExampleFromOutcome(outcome: BusinessOutcome): Promise<TrainingExample | null> {
    try {
      // Get appropriate template for the domain
      const templates = this.domainTemplates.get(outcome.domain) || [];
      if (templates.length === 0) {
        this.logger.warn('No templates available for domain', { domain: outcome.domain });
        return null;
      }

      // Select template based on context
      const template = this.selectBestTemplate(templates, outcome.context);
      
      // Generate prompt from template and context
      const prompt = this.generatePromptFromTemplate(template, outcome.context);
      
      // Calculate quality score
      const qualityScore = this.calculateExampleQuality(outcome, template);

      const example: TrainingExample = {
        id: `example_${outcome.id}_${Date.now()}`,
        domain: outcome.domain,
        input: {
          prompt,
          context: outcome.context,
          parameters: this.extractParameters(outcome.context, template),
          expectedType: template.expectedOutputType,
        },
        output: {
          response: this.generateExpectedResponse(outcome, template),
          confidence: outcome.confidence,
          processingTime: outcome.metrics.performance?.responseTime || 0,
          tokens: this.estimateTokenCount(prompt),
          cost: outcome.metrics.cost?.computeCost || 0,
        },
        outcome,
        qualityScore,
        relevanceScore: this.calculateRelevanceScore(outcome, template),
        timestamp: new Date(),
        source: TrainingSource.HISTORICAL_SUCCESS,
      };

      return example;

    } catch (error) {
      this.logger.error('Failed to create training example from outcome', {
        error: error.message,
        outcomeId: outcome.id,
      });
      return null;
    }
  }

  private selectBestTemplate(templates: PromptTemplate[], context: Record<string, any>): PromptTemplate {
    // Score templates based on context requirements match
    const scoredTemplates = templates.map(template => {
      const score = template.contextRequirements.reduce((acc, requirement) => {
        return context[requirement] !== undefined ? acc + 1 : acc;
      }, 0) / Math.max(template.contextRequirements.length, 1);
      
      return { template, score };
    });

    // Sort by score and return best match
    scoredTemplates.sort((a, b) => b.score - a.score);
    return scoredTemplates[0]?.template || templates[0];
  }

  private generatePromptFromTemplate(template: PromptTemplate, context: Record<string, any>): string {
    let prompt = template.template;
    
    // Replace template parameters with context values
    template.parameters.forEach(param => {
      const value = context[param] || `[${param}]`;
      prompt = prompt.replace(new RegExp(`{${param}}`, 'g'), String(value));
    });

    return prompt;
  }

  private extractParameters(context: Record<string, any>, template: PromptTemplate): Record<string, any> {
    const parameters: Record<string, any> = {};
    
    template.parameters.forEach(param => {
      if (context[param] !== undefined) {
        parameters[param] = context[param];
      }
    });

    return parameters;
  }

  private generateExpectedResponse(outcome: BusinessOutcome, template: PromptTemplate): string {
    // In a real implementation, this would extract the actual response from the outcome
    // For now, generate a placeholder based on the outcome success and domain
    
    if (outcome.success) {
      return `Successful ${template.expectedOutputType} based on ${outcome.domain} analysis`;
    } else {
      return `Failed ${template.expectedOutputType} - requires improvement`;
    }
  }

  private estimateTokenCount(text: string): number {
    // Simple estimation: roughly 4 characters per token
    return Math.ceil(text.length / 4);
  }

  private calculateExampleQuality(outcome: BusinessOutcome, template: PromptTemplate): number {
    const rules = this.qualityRules.get(outcome.domain) || [];
    
    // Create a mock training example for evaluation
    const mockExample: TrainingExample = {
      id: 'mock',
      domain: outcome.domain,
      input: {
        prompt: '',
        context: outcome.context,
        parameters: {},
        expectedType: template.expectedOutputType,
      },
      output: {
        response: '',
        confidence: outcome.confidence,
        processingTime: 0,
        tokens: 0,
        cost: 0,
      },
      outcome,
      qualityScore: 0,
      relevanceScore: 0,
      timestamp: new Date(),
      source: TrainingSource.HISTORICAL_SUCCESS,
    };

    let totalScore = 0;
    let totalWeight = 0;

    rules.forEach(rule => {
      const score = rule.validator(mockExample);
      totalScore += score * rule.weight;
      totalWeight += rule.weight;
    });

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private calculateRelevanceScore(outcome: BusinessOutcome, template: PromptTemplate): number {
    // Calculate how relevant this example is for the specific template
    let relevanceScore = 0.5; // Base score

    // Context requirement fulfillment
    const fulfillmentRatio = template.contextRequirements.reduce((count, req) => {
      return outcome.context[req] !== undefined ? count + 1 : count;
    }, 0) / Math.max(template.contextRequirements.length, 1);
    
    relevanceScore += fulfillmentRatio * 0.3;

    // Success rate bonus
    if (outcome.success) {
      relevanceScore += 0.2;
    }

    // Confidence bonus
    relevanceScore += outcome.confidence * 0.2;

    return Math.min(1, relevanceScore);
  }

  private async generateSyntheticData(request: TrainingDataRequest): Promise<TrainingExample[]> {
    const examples: TrainingExample[] = [];
    
    // Get patterns for the domain to base synthetic data on
    const domainPatterns = this.getDomainPatterns(request.domain);
    
    if (domainPatterns.length === 0) {
      this.logger.warn('No patterns available for synthetic data generation', { 
        domain: request.domain,
      });
      return examples;
    }

    const config: SyntheticGenerationConfig = {
      domain: request.domain,
      basePatterns: domainPatterns,
      variationStrategies: this.getVariationStrategies(request.domain),
      qualityThreshold: this.getQualityThreshold(request.quality),
      maxAttempts: request.count * 3, // Allow multiple attempts per desired example
    };

    let attempts = 0;
    while (examples.length < request.count && attempts < config.maxAttempts) {
      const syntheticExample = await this.generateSyntheticExample(config);
      
      if (syntheticExample && this.meetsQualityThreshold(syntheticExample, request.quality)) {
        examples.push(syntheticExample);
      }
      
      attempts++;
    }

    this.logger.debug('Synthetic data generation completed', {
      domain: request.domain,
      requested: request.count,
      generated: examples.length,
      attempts,
    });

    return examples;
  }

  private getDomainPatterns(domain: BusinessDomain): LearningPattern[] {
    // In a real implementation, this would fetch patterns from the pattern engine
    // For now, return empty array - would be populated from actual pattern data
    return [];
  }

  private getVariationStrategies(domain: BusinessDomain): VariationStrategy[] {
    const baseStrategies: VariationStrategy[] = [
      {
        type: 'contextual',
        parameters: { variationRate: 0.3 },
        weight: 0.4,
      },
      {
        type: 'temporal',
        parameters: { timeShiftRange: '7d' },
        weight: 0.2,
      },
      {
        type: 'parametric',
        parameters: { perturbationRate: 0.1 },
        weight: 0.4,
      },
    ];

    // Add domain-specific strategies
    switch (domain) {
      case BusinessDomain.LEGAL_ANALYSIS:
        baseStrategies.push({
          type: 'semantic',
          parameters: { legalTermVariation: true },
          weight: 0.3,
        });
        break;
        
      case BusinessDomain.MARKETING_CONTENT:
        baseStrategies.push({
          type: 'semantic',
          parameters: { toneVariation: true, audienceShift: true },
          weight: 0.5,
        });
        break;
    }

    return baseStrategies;
  }

  private getQualityThreshold(quality: 'high' | 'medium' | 'low'): number {
    const thresholds = {
      high: 0.8,
      medium: 0.6,
      low: 0.4,
    };
    
    return thresholds[quality];
  }

  private async generateSyntheticExample(config: SyntheticGenerationConfig): Promise<TrainingExample | null> {
    try {
      // Select a base pattern
      const basePattern = config.basePatterns[Math.floor(Math.random() * config.basePatterns.length)];
      
      // Generate synthetic context based on pattern
      const syntheticContext = this.generateSyntheticContext(basePattern, config.variationStrategies);
      
      // Get template for the domain
      const templates = this.domainTemplates.get(config.domain) || [];
      if (templates.length === 0) return null;
      
      const template = this.selectBestTemplate(templates, syntheticContext);
      
      // Generate synthetic outcome
      const syntheticOutcome = this.generateSyntheticOutcome(config.domain, syntheticContext, basePattern);
      
      // Create training example
      const example = await this.createTrainingExampleFromOutcome(syntheticOutcome);
      
      if (example) {
        example.source = TrainingSource.SYNTHETIC_GENERATION;
        example.id = `synthetic_${config.domain}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      
      return example;

    } catch (error) {
      this.logger.error('Failed to generate synthetic example', {
        error: error.message,
        domain: config.domain,
      });
      return null;
    }
  }

  private generateSyntheticContext(pattern: LearningPattern, strategies: VariationStrategy[]): Record<string, any> {
    const baseContext = { ...pattern.conditions.contextFilters };
    
    // Apply variation strategies
    strategies.forEach(strategy => {
      switch (strategy.type) {
        case 'contextual':
          this.applyContextualVariation(baseContext, strategy.parameters, strategy.weight);
          break;
        case 'temporal':
          this.applyTemporalVariation(baseContext, strategy.parameters, strategy.weight);
          break;
        case 'parametric':
          this.applyParametricVariation(baseContext, strategy.parameters, strategy.weight);
          break;
      }
    });

    return baseContext;
  }

  private applyContextualVariation(context: Record<string, any>, parameters: any, weight: number): void {
    const variationRate = parameters.variationRate || 0.3;
    
    Object.keys(context).forEach(key => {
      if (Math.random() < variationRate * weight) {
        // Apply contextual variation based on key type
        context[key] = this.varyContextValue(key, context[key]);
      }
    });
  }

  private applyTemporalVariation(context: Record<string, any>, parameters: any, weight: number): void {
    const temporalKeys = ['timeOfDay', 'dayOfWeek', 'seasonality'];
    
    temporalKeys.forEach(key => {
      if (context[key] && Math.random() < weight) {
        context[key] = this.varyTemporalValue(key, context[key]);
      }
    });
  }

  private applyParametricVariation(context: Record<string, any>, parameters: any, weight: number): void {
    const perturbationRate = parameters.perturbationRate || 0.1;
    
    Object.entries(context).forEach(([key, value]) => {
      if (typeof value === 'number' && Math.random() < weight) {
        const perturbation = (Math.random() - 0.5) * 2 * perturbationRate;
        context[key] = value * (1 + perturbation);
      }
    });
  }

  private varyContextValue(key: string, originalValue: any): any {
    // Context-specific variation logic
    switch (key) {
      case 'customerSegment':
        const segments = ['enterprise', 'smb', 'startup', 'individual'];
        return segments[Math.floor(Math.random() * segments.length)];
        
      case 'deviceType':
        const devices = ['desktop', 'mobile', 'tablet'];
        return devices[Math.floor(Math.random() * devices.length)];
        
      case 'location':
        const locations = ['US', 'EU', 'APAC', 'Global'];
        return locations[Math.floor(Math.random() * locations.length)];
        
      default:
        return originalValue;
    }
  }

  private varyTemporalValue(key: string, originalValue: any): any {
    switch (key) {
      case 'timeOfDay':
        const times = ['morning', 'afternoon', 'evening', 'night'];
        return times[Math.floor(Math.random() * times.length)];
        
      case 'dayOfWeek':
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        return days[Math.floor(Math.random() * days.length)];
        
      case 'seasonality':
        const seasons = ['spring', 'summer', 'fall', 'winter'];
        return seasons[Math.floor(Math.random() * seasons.length)];
        
      default:
        return originalValue;
    }
  }

  private generateSyntheticOutcome(
    domain: BusinessDomain, 
    context: Record<string, any>, 
    pattern: LearningPattern
  ): BusinessOutcome {
    // Generate synthetic business outcome based on pattern performance
    const successProbability = pattern.outcomes.successRate;
    const success = Math.random() < successProbability;
    
    return {
      id: `synthetic_outcome_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      promptId: `synthetic_prompt_${Date.now()}`,
      domain,
      timestamp: new Date(),
      metrics: this.generateSyntheticMetrics(domain, success, pattern.outcomes.averageMetrics),
      context,
      success,
      confidence: success ? 0.7 + Math.random() * 0.3 : 0.3 + Math.random() * 0.4,
      metadata: { synthetic: true, basePatternId: pattern.id },
    };
  }

  private generateSyntheticMetrics(domain: BusinessDomain, success: boolean, baseMetrics: any): any {
    const metrics: any = {};
    
    // Generate performance metrics
    if (baseMetrics.performance) {
      metrics.performance = {
        accuracy: success ? 
          0.7 + Math.random() * 0.3 : 
          0.2 + Math.random() * 0.5,
        responseTime: 500 + Math.random() * 1000,
      };
    }
    
    // Generate satisfaction metrics
    if (baseMetrics.satisfaction) {
      metrics.satisfaction = {
        score: success ? 
          7 + Math.random() * 3 : 
          2 + Math.random() * 4,
      };
    }
    
    // Generate revenue metrics for relevant domains
    if ([BusinessDomain.SALES_COMMUNICATION, BusinessDomain.PRICING_OPTIMIZATION].includes(domain)) {
      metrics.revenue = {
        amount: success ? 
          1000 + Math.random() * 9000 : 
          0,
        currency: 'USD',
      };
    }

    return metrics;
  }

  private meetsQualityThreshold(example: TrainingExample, quality: 'high' | 'medium' | 'low'): boolean {
    const threshold = this.getQualityThreshold(quality);
    return example.qualityScore >= threshold;
  }

  private async applyAugmentation(
    examples: TrainingExample[], 
    augmentationConfig: NonNullable<TrainingDataRequest['augmentation']>
  ): Promise<TrainingExample[]> {
    const augmentedExamples: TrainingExample[] = [];
    
    for (const example of examples) {
      for (const technique of augmentationConfig.techniques) {
        const strategy = this.augmentationStrategies.get(technique);
        if (strategy) {
          const augmented = await strategy.apply(example, augmentationConfig.intensity);
          if (augmented.length > 0) {
            augmentedExamples.push(...augmented);
          }
        }
      }
    }
    
    return augmentedExamples;
  }

  private async applyContextVariation(example: TrainingExample, intensity: number): Promise<TrainingExample[]> {
    const variations: TrainingExample[] = [];
    const variationCount = Math.ceil(intensity * 3); // 0-3 variations based on intensity
    
    for (let i = 0; i < variationCount; i++) {
      const variedContext = { ...example.input.context };
      
      // Vary 1-2 context fields
      const keysToVary = Object.keys(variedContext).slice(0, 2);
      keysToVary.forEach(key => {
        if (Math.random() < intensity) {
          variedContext[key] = this.varyContextValue(key, variedContext[key]);
        }
      });
      
      const variation: TrainingExample = {
        ...example,
        id: `${example.id}_ctx_var_${i}`,
        input: {
          ...example.input,
          context: variedContext,
        },
        qualityScore: example.qualityScore * (0.8 + Math.random() * 0.2), // Slight quality reduction
        source: TrainingSource.SYNTHETIC_GENERATION,
        timestamp: new Date(),
      };
      
      variations.push(variation);
    }
    
    return variations;
  }

  private async applyTemporalShifting(example: TrainingExample, intensity: number): Promise<TrainingExample[]> {
    const variations: TrainingExample[] = [];
    const temporalKeys = ['timeOfDay', 'dayOfWeek', 'seasonality'];
    
    temporalKeys.forEach((key, index) => {
      if (example.input.context[key] && Math.random() < intensity) {
        const variation: TrainingExample = {
          ...example,
          id: `${example.id}_temp_shift_${index}`,
          input: {
            ...example.input,
            context: {
              ...example.input.context,
              [key]: this.varyTemporalValue(key, example.input.context[key]),
            },
          },
          qualityScore: example.qualityScore * 0.9,
          source: TrainingSource.SYNTHETIC_GENERATION,
          timestamp: new Date(),
        };
        
        variations.push(variation);
      }
    });
    
    return variations;
  }

  private async applyParameterPerturbation(example: TrainingExample, intensity: number): Promise<TrainingExample[]> {
    const variations: TrainingExample[] = [];
    const perturbedParams = { ...example.input.parameters };
    
    let hasChanges = false;
    Object.entries(perturbedParams).forEach(([key, value]) => {
      if (typeof value === 'number' && Math.random() < intensity) {
        const perturbation = (Math.random() - 0.5) * 2 * intensity * 0.1;
        perturbedParams[key] = value * (1 + perturbation);
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      const variation: TrainingExample = {
        ...example,
        id: `${example.id}_param_perturb`,
        input: {
          ...example.input,
          parameters: perturbedParams,
        },
        qualityScore: example.qualityScore * 0.95,
        source: TrainingSource.SYNTHETIC_GENERATION,
        timestamp: new Date(),
      };
      
      variations.push(variation);
    }
    
    return variations;
  }

  private async applyNoiseInjection(example: TrainingExample, intensity: number): Promise<TrainingExample[]> {
    // Add slight variations to make training more robust
    const variation: TrainingExample = {
      ...example,
      id: `${example.id}_noise`,
      output: {
        ...example.output,
        confidence: Math.max(0, Math.min(1, example.output.confidence + (Math.random() - 0.5) * intensity * 0.1)),
        processingTime: Math.max(0, example.output.processingTime + (Math.random() - 0.5) * intensity * 100),
      },
      qualityScore: example.qualityScore * (0.9 + Math.random() * 0.1),
      source: TrainingSource.SYNTHETIC_GENERATION,
      timestamp: new Date(),
    };
    
    return [variation];
  }

  private calculateDataStatistics(examples: TrainingExample[]): TrainingDataResponse['statistics'] {
    if (examples.length === 0) {
      return {
        totalGenerated: 0,
        qualityDistribution: {},
        sourceDistribution: {},
        domainCoverage: {},
        averageQuality: 0,
        diversityScore: 0,
      };
    }

    // Quality distribution
    const qualityBuckets = { high: 0, medium: 0, low: 0 };
    examples.forEach(example => {
      if (example.qualityScore >= 0.8) qualityBuckets.high++;
      else if (example.qualityScore >= 0.6) qualityBuckets.medium++;
      else qualityBuckets.low++;
    });

    // Source distribution
    const sourceDistribution: Record<string, number> = {};
    examples.forEach(example => {
      sourceDistribution[example.source] = (sourceDistribution[example.source] || 0) + 1;
    });

    // Domain coverage
    const domainCoverage: Record<string, number> = {};
    examples.forEach(example => {
      domainCoverage[example.domain] = (domainCoverage[example.domain] || 0) + 1;
    });

    // Average quality
    const averageQuality = stats.mean(examples.map(e => e.qualityScore));

    // Diversity score (based on context variety)
    const diversityScore = this.calculateDiversityScore(examples);

    return {
      totalGenerated: examples.length,
      qualityDistribution: qualityBuckets,
      sourceDistribution,
      domainCoverage,
      averageQuality,
      diversityScore,
    };
  }

  private calculateDiversityScore(examples: TrainingExample[]): number {
    if (examples.length === 0) return 0;

    // Calculate diversity based on unique context combinations
    const contextCombinations = new Set();
    examples.forEach(example => {
      const contextSignature = JSON.stringify(example.input.context);
      contextCombinations.add(contextSignature);
    });

    return contextCombinations.size / examples.length;
  }

  private generateRecommendations(examples: TrainingExample[], request: TrainingDataRequest): string[] {
    const recommendations: string[] = [];
    
    if (examples.length < request.count) {
      recommendations.push(`Generated ${examples.length} examples instead of requested ${request.count}. Consider lowering quality threshold or adding more historical data.`);
    }

    const averageQuality = stats.mean(examples.map(e => e.qualityScore));
    if (averageQuality < 0.7) {
      recommendations.push('Average quality is below optimal threshold. Consider improving data sources or pattern quality.');
    }

    const diversityScore = this.calculateDiversityScore(examples);
    if (diversityScore < 0.3) {
      recommendations.push('Low diversity detected. Consider enabling augmentation or expanding context filters.');
    }

    const syntheticRatio = examples.filter(e => e.source === TrainingSource.SYNTHETIC_GENERATION).length / examples.length;
    if (syntheticRatio > 0.7) {
      recommendations.push('High synthetic data ratio. Consider collecting more historical successful outcomes.');
    }

    return recommendations;
  }

  private generateWarnings(examples: TrainingExample[], request: TrainingDataRequest): string[] {
    const warnings: string[] = [];
    
    const lowQualityCount = examples.filter(e => e.qualityScore < 0.5).length;
    if (lowQualityCount > examples.length * 0.2) {
      warnings.push(`${lowQualityCount} examples have low quality scores. This may impact training effectiveness.`);
    }

    const oldExamples = examples.filter(e => {
      const daysSince = (Date.now() - e.timestamp.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 90;
    }).length;
    
    if (oldExamples > examples.length * 0.5) {
      warnings.push('Many examples are from old data. Consider prioritizing recent successful outcomes.');
    }

    return warnings;
  }

  /**
   * Add historical outcomes for training data generation
   */
  addHistoricalOutcomes(domain: BusinessDomain, outcomes: BusinessOutcome[]): void {
    if (!this.historicalOutcomes.has(domain)) {
      this.historicalOutcomes.set(domain, []);
    }
    
    const existing = this.historicalOutcomes.get(domain)!;
    existing.push(...outcomes);
    
    // Keep only recent outcomes (last 6 months)
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);
    
    const filtered = existing.filter(outcome => outcome.timestamp >= cutoffDate);
    this.historicalOutcomes.set(domain, filtered);
    
    this.logger.debug('Historical outcomes updated', {
      domain,
      added: outcomes.length,
      total: filtered.length,
    });
  }

  async healthCheck(): Promise<boolean> {
    return true; // Basic health check
  }
}

// Supporting interfaces
interface PromptTemplate {
  id: string;
  template: string;
  parameters: string[];
  expectedOutputType: string;
  contextRequirements: string[];
}

interface QualityRule {
  name: string;
  description: string;
  weight: number;
  validator: (example: TrainingExample) => number;
}

interface AugmentationStrategy {
  name: string;
  description: string;
  apply: (example: TrainingExample, intensity: number) => Promise<TrainingExample[]>;
}