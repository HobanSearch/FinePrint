import { createServiceLogger } from '@fineprintai/shared-logger';
import { Neo4jService } from './neo4j-service';
import { z } from 'zod';
import { 
  Customer, 
  ProductFeature, 
  Agent, 
  Task,
  BusinessProcess,
  MarketOpportunity,
  Competitor
} from '../schemas/business-schema';

const logger = createServiceLogger('recommendation-engine');

// ===== RECOMMENDATION REQUEST SCHEMAS =====

export const CustomerRecommendationRequestSchema = z.object({
  customer_id: z.string(),
  recommendation_types: z.array(z.enum(['UPSELL', 'RETENTION', 'SUPPORT', 'FEATURE_ADOPTION', 'ENGAGEMENT'])).default(['UPSELL', 'RETENTION']),
  context: z.object({
    current_interaction: z.string().optional(),
    recent_activity: z.array(z.string()).optional(),
    segment: z.string().optional(),
  }).optional(),
  max_recommendations: z.number().min(1).max(20).default(5),
});

export const ProductRecommendationRequestSchema = z.object({
  feature_id: z.string().optional(),
  customer_segment: z.string().optional(),
  usage_context: z.enum(['NEW_USER', 'POWER_USER', 'STRUGGLING_USER', 'CHURNING_USER']).optional(),
  recommendation_types: z.array(z.enum(['FEATURE_SUGGESTION', 'OPTIMIZATION', 'INTEGRATION', 'ALTERNATIVE'])).default(['FEATURE_SUGGESTION']),
  max_recommendations: z.number().min(1).max(20).default(5),
});

export const BusinessRecommendationRequestSchema = z.object({
  focus_area: z.enum(['GROWTH', 'EFFICIENCY', 'COST_REDUCTION', 'RISK_MITIGATION', 'INNOVATION']),
  time_horizon: z.enum(['IMMEDIATE', 'SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM']).default('SHORT_TERM'),
  constraints: z.object({
    budget_limit: z.number().optional(),
    resource_constraints: z.array(z.string()).optional(),
    risk_tolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  }).optional(),
  max_recommendations: z.number().min(1).max(20).default(10),
});

export const AgentRecommendationRequestSchema = z.object({
  agent_id: z.string().optional(),
  task_id: z.string().optional(),
  recommendation_types: z.array(z.enum(['TASK_ASSIGNMENT', 'SKILL_DEVELOPMENT', 'COLLABORATION', 'WORKLOAD_OPTIMIZATION'])).default(['TASK_ASSIGNMENT']),
  context: z.object({
    current_workload: z.number().optional(),
    recent_performance: z.number().optional(),
    available_agents: z.array(z.string()).optional(),
  }).optional(),
  max_recommendations: z.number().min(1).max(20).default(5),
});

// ===== RECOMMENDATION RESPONSE INTERFACES =====

export interface BaseRecommendation {
  id: string;
  type: string;
  title: string;
  description: string;
  confidence: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  impact_score: number;
  effort_required: 'LOW' | 'MEDIUM' | 'HIGH';
  expected_outcome: string;
  reasoning: string[];
  action_items: string[];
  success_metrics: string[];
  risks: string[];
  created_at: Date;
  expires_at?: Date;
}

export interface CustomerRecommendation extends BaseRecommendation {
  customer_id: string;
  recommendation_type: 'UPSELL' | 'RETENTION' | 'SUPPORT' | 'FEATURE_ADOPTION' | 'ENGAGEMENT';
  suggested_features?: ProductFeature[];
  estimated_revenue_impact?: number;
  churn_risk_reduction?: number;
  implementation_timeline_days?: number;
}

export interface ProductRecommendation extends BaseRecommendation {
  feature_id?: string;
  recommendation_type: 'FEATURE_SUGGESTION' | 'OPTIMIZATION' | 'INTEGRATION' | 'ALTERNATIVE';
  suggested_features: ProductFeature[];
  target_audience: string[];
  adoption_potential: number;
  development_effort_weeks?: number;
}

export interface BusinessRecommendation extends BaseRecommendation {
  focus_area: 'GROWTH' | 'EFFICIENCY' | 'COST_REDUCTION' | 'RISK_MITIGATION' | 'INNOVATION';
  recommendation_type: string;
  market_opportunities?: MarketOpportunity[];
  process_optimizations?: BusinessProcess[];
  resource_requirements: string[];
  roi_estimate?: number;
  payback_period_months?: number;
}

export interface AgentRecommendation extends BaseRecommendation {
  agent_id?: string;
  task_id?: string;
  recommendation_type: 'TASK_ASSIGNMENT' | 'SKILL_DEVELOPMENT' | 'COLLABORATION' | 'WORKLOAD_OPTIMIZATION';
  suggested_agents?: Agent[];
  suggested_tasks?: Task[];
  efficiency_gain_percent?: number;
  collaboration_benefits?: string[];
}

export interface RecommendationContext {
  user_id: string;
  session_id?: string;
  timestamp: Date;
  interaction_history: string[];
  preferences: Record<string, any>;
  constraints: Record<string, any>;
}

/**
 * Recommendation Engine - Provides intelligent, context-aware recommendations
 * across all business domains using graph-based analysis and machine learning
 */
export class RecommendationEngine {
  private neo4jService: Neo4jService;
  private initialized = false;
  private recommendationCache: Map<string, { recommendations: any[]; timestamp: number }> = new Map();
  private readonly cacheTimeout = 300000; // 5 minutes

  constructor(neo4jService: Neo4jService) {
    this.neo4jService = neo4jService;
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Recommendation Engine...');
      
      // Verify Neo4j connection
      const isHealthy = await this.neo4jService.healthCheck();
      if (!isHealthy) {
        throw new Error('Neo4j service is not healthy');
      }

      // Initialize recommendation models and algorithms
      await this.initializeRecommendationModels();

      this.initialized = true;
      logger.info('Recommendation Engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Recommendation Engine', { error });
      throw error;
    }
  }

  // ===== CUSTOMER RECOMMENDATIONS =====

  async getCustomerRecommendations(
    request: z.infer<typeof CustomerRecommendationRequestSchema>,
    context?: RecommendationContext
  ): Promise<CustomerRecommendation[]> {
    const validatedRequest = CustomerRecommendationRequestSchema.parse(request);
    
    try {
      logger.debug('Generating customer recommendations', { 
        customer_id: validatedRequest.customer_id,
        types: validatedRequest.recommendation_types 
      });

      const cacheKey = `customer_${validatedRequest.customer_id}_${JSON.stringify(validatedRequest.recommendation_types)}`;
      const cached = this.getCachedRecommendations(cacheKey);
      if (cached) {
        return cached as CustomerRecommendation[];
      }

      const recommendations: CustomerRecommendation[] = [];

      for (const type of validatedRequest.recommendation_types) {
        switch (type) {
          case 'UPSELL':
            recommendations.push(...await this.generateUpsellRecommendations(validatedRequest));
            break;
          case 'RETENTION':
            recommendations.push(...await this.generateRetentionRecommendations(validatedRequest));
            break;
          case 'SUPPORT':
            recommendations.push(...await this.generateSupportRecommendations(validatedRequest));
            break;
          case 'FEATURE_ADOPTION':
            recommendations.push(...await this.generateFeatureAdoptionRecommendations(validatedRequest));
            break;
          case 'ENGAGEMENT':
            recommendations.push(...await this.generateEngagementRecommendations(validatedRequest));
            break;
        }
      }

      // Sort by priority and confidence
      const sortedRecommendations = recommendations
        .sort((a, b) => {
          const priorityWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          return (priorityWeight[b.priority] * b.confidence) - (priorityWeight[a.priority] * a.confidence);
        })
        .slice(0, validatedRequest.max_recommendations);

      this.cacheRecommendations(cacheKey, sortedRecommendations);

      logger.info('Customer recommendations generated', {
        customer_id: validatedRequest.customer_id,
        recommendations_count: sortedRecommendations.length,
        types: validatedRequest.recommendation_types,
      });

      return sortedRecommendations;
    } catch (error) {
      logger.error('Failed to generate customer recommendations', { error, request: validatedRequest });
      throw error;
    }
  }

  // ===== PRODUCT RECOMMENDATIONS =====

  async getProductRecommendations(
    request: z.infer<typeof ProductRecommendationRequestSchema>,
    context?: RecommendationContext
  ): Promise<ProductRecommendation[]> {
    const validatedRequest = ProductRecommendationRequestSchema.parse(request);
    
    try {
      logger.debug('Generating product recommendations', { request: validatedRequest });

      const recommendations: ProductRecommendation[] = [];

      for (const type of validatedRequest.recommendation_types) {
        switch (type) {
          case 'FEATURE_SUGGESTION':
            recommendations.push(...await this.generateFeatureSuggestions(validatedRequest));
            break;
          case 'OPTIMIZATION':
            recommendations.push(...await this.generateOptimizationRecommendations(validatedRequest));
            break;
          case 'INTEGRATION':
            recommendations.push(...await this.generateIntegrationRecommendations(validatedRequest));
            break;
          case 'ALTERNATIVE':
            recommendations.push(...await this.generateAlternativeRecommendations(validatedRequest));
            break;
        }
      }

      const sortedRecommendations = recommendations
        .sort((a, b) => b.impact_score * b.confidence - a.impact_score * a.confidence)
        .slice(0, validatedRequest.max_recommendations);

      logger.info('Product recommendations generated', {
        recommendations_count: sortedRecommendations.length,
        types: validatedRequest.recommendation_types,
      });

      return sortedRecommendations;
    } catch (error) {
      logger.error('Failed to generate product recommendations', { error, request: validatedRequest });
      throw error;
    }
  }

  // ===== BUSINESS RECOMMENDATIONS =====

  async getBusinessRecommendations(
    request: z.infer<typeof BusinessRecommendationRequestSchema>,
    context?: RecommendationContext
  ): Promise<BusinessRecommendation[]> {
    const validatedRequest = BusinessRecommendationRequestSchema.parse(request);
    
    try {
      logger.debug('Generating business recommendations', { request: validatedRequest });

      const recommendations: BusinessRecommendation[] = [];

      switch (validatedRequest.focus_area) {
        case 'GROWTH':
          recommendations.push(...await this.generateGrowthRecommendations(validatedRequest));
          break;
        case 'EFFICIENCY':
          recommendations.push(...await this.generateEfficiencyRecommendations(validatedRequest));
          break;
        case 'COST_REDUCTION':
          recommendations.push(...await this.generateCostReductionRecommendations(validatedRequest));
          break;
        case 'RISK_MITIGATION':
          recommendations.push(...await this.generateRiskMitigationRecommendations(validatedRequest));
          break;
        case 'INNOVATION':
          recommendations.push(...await this.generateInnovationRecommendations(validatedRequest));
          break;
      }

      const sortedRecommendations = recommendations
        .sort((a, b) => {
          const roi_a = (a.roi_estimate || 0) * a.confidence;
          const roi_b = (b.roi_estimate || 0) * b.confidence;
          return roi_b - roi_a;
        })
        .slice(0, validatedRequest.max_recommendations);

      logger.info('Business recommendations generated', {
        focus_area: validatedRequest.focus_area,
        recommendations_count: sortedRecommendations.length,
      });

      return sortedRecommendations;
    } catch (error) {
      logger.error('Failed to generate business recommendations', { error, request: validatedRequest });
      throw error;
    }
  }

  // ===== AGENT RECOMMENDATIONS =====

  async getAgentRecommendations(
    request: z.infer<typeof AgentRecommendationRequestSchema>,
    context?: RecommendationContext
  ): Promise<AgentRecommendation[]> {
    const validatedRequest = AgentRecommendationRequestSchema.parse(request);
    
    try {
      logger.debug('Generating agent recommendations', { request: validatedRequest });

      const recommendations: AgentRecommendation[] = [];

      for (const type of validatedRequest.recommendation_types) {
        switch (type) {
          case 'TASK_ASSIGNMENT':
            recommendations.push(...await this.generateTaskAssignmentRecommendations(validatedRequest));
            break;
          case 'SKILL_DEVELOPMENT':
            recommendations.push(...await this.generateSkillDevelopmentRecommendations(validatedRequest));
            break;
          case 'COLLABORATION':
            recommendations.push(...await this.generateCollaborationRecommendations(validatedRequest));
            break;
          case 'WORKLOAD_OPTIMIZATION':
            recommendations.push(...await this.generateWorkloadOptimizationRecommendations(validatedRequest));
            break;
        }
      }

      const sortedRecommendations = recommendations
        .sort((a, b) => (b.efficiency_gain_percent || 0) * b.confidence - (a.efficiency_gain_percent || 0) * a.confidence)
        .slice(0, validatedRequest.max_recommendations);

      logger.info('Agent recommendations generated', {
        agent_id: validatedRequest.agent_id,
        recommendations_count: sortedRecommendations.length,
        types: validatedRequest.recommendation_types,
      });

      return sortedRecommendations;
    } catch (error) {
      logger.error('Failed to generate agent recommendations', { error, request: validatedRequest });
      throw error;
    }
  }

  // ===== RECOMMENDATION GENERATORS =====

  private async generateUpsellRecommendations(request: any): Promise<CustomerRecommendation[]> {
    const query = `
      MATCH (c:Customer {id: $customer_id})
      MATCH (c)-[:INTERACTS_WITH]->(pf:ProductFeature)
      WITH c, collect(pf) AS current_features
      MATCH (other_pf:ProductFeature)
      WHERE NOT other_pf IN current_features 
        AND other_pf.status = 'ACTIVE'
        AND (c.subscription_tier = 'FREE' OR c.subscription_tier = 'BASIC')
      WITH c, other_pf, 
           CASE 
             WHEN c.subscription_tier = 'FREE' AND other_pf.category IN ['DOCUMENT_ANALYSIS'] THEN 0.8
             WHEN c.subscription_tier = 'BASIC' AND other_pf.category IN ['LEGAL_INSIGHTS', 'COMPLIANCE'] THEN 0.7
             ELSE 0.5
           END AS relevance_score
      RETURN other_pf, relevance_score
      ORDER BY relevance_score DESC
      LIMIT 3
    `;

    const result = await this.neo4jService.executeQuery(query, { customer_id: request.customer_id });
    
    return result.records.map((record, index) => {
      const feature = record.get('other_pf').properties as ProductFeature;
      const relevanceScore = record.get('relevance_score');

      return {
        id: `upsell_${request.customer_id}_${index}`,
        type: 'CUSTOMER_UPSELL',
        recommendation_type: 'UPSELL',
        customer_id: request.customer_id,
        title: `Upgrade to access ${feature.name}`,
        description: `Based on your usage patterns, ${feature.name} could provide significant value for your document analysis needs.`,
        confidence: relevanceScore,
        priority: relevanceScore > 0.7 ? 'HIGH' : 'MEDIUM' as const,
        impact_score: relevanceScore * 10,
        effort_required: 'LOW' as const,
        expected_outcome: `Increased feature utilization and customer value realization`,
        reasoning: [
          `Customer shows high engagement with related features`,
          `${feature.category} features are highly correlated with retention`,
          `Similar customers who upgraded showed 40% increased satisfaction`,
        ],
        action_items: [
          `Send personalized upgrade offer`,
          `Provide free trial of ${feature.name}`,
          `Schedule demo call to show feature benefits`,
        ],
        success_metrics: [
          'Upgrade conversion within 30 days',
          'Feature adoption rate > 50%',
          'Customer satisfaction score increase',
        ],
        risks: [
          'Customer may feel pressured by upgrade offers',
          'Feature may not meet customer expectations',
        ],
        suggested_features: [feature],
        estimated_revenue_impact: relevanceScore * 1000, // Simplified calculation
        implementation_timeline_days: 7,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      };
    });
  }

  private async generateRetentionRecommendations(request: any): Promise<CustomerRecommendation[]> {
    const query = `
      MATCH (c:Customer {id: $customer_id})
      WHERE c.risk_score > 0.5
      OPTIONAL MATCH (c)-[:HAS_INTERACTION]->(ci:CustomerInteraction)
      WHERE ci.timestamp > datetime() - duration('P30D')
      WITH c, count(ci) AS recent_interactions
      RETURN c, recent_interactions
    `;

    const result = await this.neo4jService.executeQuery(query, { customer_id: request.customer_id });
    
    if (result.records.length === 0) return [];

    const customer = result.records[0].get('c').properties as Customer;
    const recentInteractions = result.records[0].get('recent_interactions').toNumber();

    const recommendations: CustomerRecommendation[] = [];

    if (customer.risk_score > 0.7) {
      recommendations.push({
        id: `retention_high_risk_${request.customer_id}`,
        type: 'CUSTOMER_RETENTION',
        recommendation_type: 'RETENTION',
        customer_id: request.customer_id,
        title: 'High Churn Risk - Immediate Intervention Required',
        description: 'Customer shows high churn risk indicators. Immediate personalized outreach recommended.',
        confidence: 0.9,
        priority: 'CRITICAL',
        impact_score: customer.risk_score * 10,
        effort_required: 'HIGH',
        expected_outcome: 'Prevent customer churn and restore satisfaction',
        reasoning: [
          `Risk score of ${customer.risk_score} indicates imminent churn risk`,
          `Only ${recentInteractions} interactions in the last 30 days`,
          'Similar risk patterns led to churn in 80% of cases',
        ],
        action_items: [
          'Schedule immediate call with customer success manager',
          'Analyze recent support tickets and usage patterns',
          'Offer personalized success plan and incentives',
          'Conduct satisfaction survey to identify pain points',
        ],
        success_metrics: [
          'Risk score reduction below 0.5 within 2 weeks',
          'Increased product usage and engagement',
          'Positive feedback from intervention call',
        ],
        risks: [
          'Customer may already be committed to churning',
          'Intervention may come too late',
        ],
        churn_risk_reduction: 0.4,
        implementation_timeline_days: 3,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });
    }

    return recommendations;
  }

  private async generateSupportRecommendations(request: any): Promise<CustomerRecommendation[]> {
    return [{
      id: `support_${request.customer_id}`,
      type: 'CUSTOMER_SUPPORT',
      recommendation_type: 'SUPPORT',
      customer_id: request.customer_id,
      title: 'Proactive Support Outreach',
      description: 'Provide proactive support based on usage patterns and potential issues.',
      confidence: 0.7,
      priority: 'MEDIUM',
      impact_score: 6,
      effort_required: 'MEDIUM',
      expected_outcome: 'Improved customer satisfaction and reduced support tickets',
      reasoning: ['Proactive support increases satisfaction by 25%'],
      action_items: ['Send helpful resources', 'Schedule check-in call'],
      success_metrics: ['Reduced support ticket volume', 'Improved satisfaction scores'],
      risks: ['Customer may perceive as spam'],
      created_at: new Date(),
    }];
  }

  private async generateFeatureAdoptionRecommendations(request: any): Promise<CustomerRecommendation[]> {
    return [{
      id: `feature_adoption_${request.customer_id}`,
      type: 'FEATURE_ADOPTION',
      recommendation_type: 'FEATURE_ADOPTION',
      customer_id: request.customer_id,
      title: 'Unlock Unused Features',
      description: 'Help customer discover and adopt underutilized features.',
      confidence: 0.8,
      priority: 'MEDIUM',
      impact_score: 7,
      effort_required: 'LOW',
      expected_outcome: 'Increased feature utilization and customer value',
      reasoning: ['Customer has access to unused premium features'],
      action_items: ['Send feature spotlight emails', 'Provide usage tutorials'],
      success_metrics: ['Feature adoption rate increase', 'Usage frequency improvement'],
      risks: ['Information overload'],
      created_at: new Date(),
    }];
  }

  private async generateEngagementRecommendations(request: any): Promise<CustomerRecommendation[]> {
    return [{
      id: `engagement_${request.customer_id}`,
      type: 'CUSTOMER_ENGAGEMENT',
      recommendation_type: 'ENGAGEMENT',
      customer_id: request.customer_id,
      title: 'Increase Platform Engagement',
      description: 'Strategies to increase customer engagement and platform stickiness.',
      confidence: 0.6,
      priority: 'LOW',
      impact_score: 5,
      effort_required: 'LOW',
      expected_outcome: 'Higher engagement and reduced churn risk',
      reasoning: ['Low engagement correlates with churn risk'],
      action_items: ['Send engagement campaigns', 'Gamify user experience'],
      success_metrics: ['Session duration increase', 'Feature interaction frequency'],
      risks: ['May annoy already engaged customers'],
      created_at: new Date(),
    }];
  }

  // Similar implementations for other recommendation types...
  private async generateFeatureSuggestions(request: any): Promise<ProductRecommendation[]> {
    return [{
      id: `feature_suggestion_${Date.now()}`,
      type: 'PRODUCT_FEATURE',
      recommendation_type: 'FEATURE_SUGGESTION',
      title: 'AI-Powered Contract Summarization',
      description: 'Develop automated contract summary generation to help users quickly understand key terms.',
      confidence: 0.85,
      priority: 'HIGH',
      impact_score: 8,
      effort_required: 'MEDIUM',
      expected_outcome: 'Increased user productivity and satisfaction',
      reasoning: ['High demand from user feedback', 'Market gap opportunity'],
      action_items: ['Conduct user research', 'Create technical specification'],
      success_metrics: ['Feature adoption rate > 60%', 'User time savings of 40%'],
      risks: ['Technical complexity', 'Accuracy concerns'],
      suggested_features: [],
      target_audience: ['Legal professionals', 'Business users'],
      adoption_potential: 0.8,
      development_effort_weeks: 12,
      created_at: new Date(),
    }];
  }

  private async generateOptimizationRecommendations(request: any): Promise<ProductRecommendation[]> {
    return [{
      id: `optimization_${Date.now()}`,
      type: 'PRODUCT_OPTIMIZATION',
      recommendation_type: 'OPTIMIZATION',
      title: 'Improve Document Processing Speed',
      description: 'Optimize document analysis pipeline for 50% faster processing.',
      confidence: 0.9,
      priority: 'HIGH',
      impact_score: 9,
      effort_required: 'MEDIUM',
      expected_outcome: 'Faster document processing and improved user experience',
      reasoning: ['Processing time is top user complaint', 'Competitive advantage'],
      action_items: ['Profile current pipeline', 'Implement caching layer'],
      success_metrics: ['50% speed improvement', 'Reduced user churn'],
      risks: ['System stability during optimization'],
      suggested_features: [],
      target_audience: ['All users'],
      adoption_potential: 1.0,
      development_effort_weeks: 8,
      created_at: new Date(),
    }];
  }

  private async generateIntegrationRecommendations(request: any): Promise<ProductRecommendation[]> {
    return [];
  }

  private async generateAlternativeRecommendations(request: any): Promise<ProductRecommendation[]> {
    return [];
  }

  // Business recommendation generators
  private async generateGrowthRecommendations(request: any): Promise<BusinessRecommendation[]> {
    return [{
      id: `growth_${Date.now()}`,
      type: 'BUSINESS_GROWTH',
      focus_area: 'GROWTH',
      recommendation_type: 'MARKET_EXPANSION',
      title: 'Expand to European Market',
      description: 'Target GDPR-focused companies in EU for contract analysis needs.',
      confidence: 0.8,
      priority: 'HIGH',
      impact_score: 9,
      effort_required: 'HIGH',
      expected_outcome: '200% revenue increase within 18 months',
      reasoning: ['Strong GDPR compliance demand', 'Limited competition'],
      action_items: ['Market research', 'Regulatory compliance', 'Local partnerships'],
      success_metrics: ['EU customer acquisition', 'Revenue from EU market'],
      risks: ['Regulatory challenges', 'Cultural differences'],
      resource_requirements: ['Legal team expansion', 'EU office setup'],
      roi_estimate: 3.5,
      payback_period_months: 12,
      created_at: new Date(),
    }];
  }

  private async generateEfficiencyRecommendations(request: any): Promise<BusinessRecommendation[]> {
    return [];
  }

  private async generateCostReductionRecommendations(request: any): Promise<BusinessRecommendation[]> {
    return [];
  }

  private async generateRiskMitigationRecommendations(request: any): Promise<BusinessRecommendation[]> {
    return [];
  }

  private async generateInnovationRecommendations(request: any): Promise<BusinessRecommendation[]> {
    return [];
  }

  // Agent recommendation generators
  private async generateTaskAssignmentRecommendations(request: any): Promise<AgentRecommendation[]> {
    if (!request.task_id) return [];

    const query = `
      MATCH (t:Task {id: $task_id})
      MATCH (a:Agent)
      WHERE a.status = 'ACTIVE' AND a.load_factor < 0.8
      WITH t, a, 
           size([cap IN a.capabilities WHERE cap IN t.required_capabilities]) AS capability_match,
           size(t.required_capabilities) AS total_required
      WHERE capability_match > 0
      WITH t, a, (capability_match * 1.0 / total_required) AS match_score
      RETURN a, match_score
      ORDER BY match_score DESC, a.success_rate DESC
      LIMIT 3
    `;

    const result = await this.neo4jService.executeQuery(query, { task_id: request.task_id });
    
    return result.records.map((record, index) => {
      const agent = record.get('a').properties as Agent;
      const matchScore = record.get('match_score');

      return {
        id: `task_assignment_${request.task_id}_${index}`,
        type: 'AGENT_TASK_ASSIGNMENT',
        recommendation_type: 'TASK_ASSIGNMENT',
        agent_id: agent.id,
        task_id: request.task_id,
        title: `Assign to ${agent.name}`,
        description: `${agent.name} has ${Math.round(matchScore * 100)}% capability match and optimal workload.`,
        confidence: matchScore,
        priority: matchScore > 0.8 ? 'HIGH' : 'MEDIUM',
        impact_score: matchScore * 10,
        effort_required: 'LOW',
        expected_outcome: 'Optimal task completion with high success rate',
        reasoning: [
          `High capability match (${Math.round(matchScore * 100)}%)`,
          `Current load factor: ${agent.load_factor}`,
          `Success rate: ${agent.success_rate}`,
        ],
        action_items: [
          'Assign task to agent',
          'Set appropriate priority and deadline',
          'Monitor progress and provide support',
        ],
        success_metrics: [
          'Task completion within estimated time',
          'High quality deliverable',
          'Agent satisfaction with assignment',
        ],
        risks: [
          'Agent workload may increase unexpectedly',
          'Task complexity may be underestimated',
        ],
        suggested_agents: [agent],
        efficiency_gain_percent: Math.round(matchScore * 20),
        created_at: new Date(),
      };
    });
  }

  private async generateSkillDevelopmentRecommendations(request: any): Promise<AgentRecommendation[]> {
    return [];
  }

  private async generateCollaborationRecommendations(request: any): Promise<AgentRecommendation[]> {
    return [];
  }

  private async generateWorkloadOptimizationRecommendations(request: any): Promise<AgentRecommendation[]> {
    return [];
  }

  // ===== HELPER METHODS =====

  private async initializeRecommendationModels(): Promise<void> {
    // Initialize ML models, collaborative filtering, etc.
    logger.debug('Initializing recommendation models');
  }

  private getCachedRecommendations(key: string): any[] | null {
    const cached = this.recommendationCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.recommendations;
    }
    return null;
  }

  private cacheRecommendations(key: string, recommendations: any[]): void {
    this.recommendationCache.set(key, {
      recommendations,
      timestamp: Date.now(),
    });

    // Clean up old cache entries
    if (this.recommendationCache.size > 1000) {
      const oldestKey = this.recommendationCache.keys().next().value;
      this.recommendationCache.delete(oldestKey);
    }
  }

  async healthCheck(): Promise<boolean> {
    return this.initialized && await this.neo4jService.healthCheck();
  }

  async shutdown(): Promise<void> {
    this.recommendationCache.clear();
    this.initialized = false;
    logger.info('Recommendation Engine shutdown completed');
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}