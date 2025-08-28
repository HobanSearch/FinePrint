/**
 * Improvement planning activities for creating actionable improvement plans
 */

import { Context } from '@temporalio/activity';
import {
  FailureAnalysis,
  ImprovementPlan,
  Improvement,
  ImprovementType,
  ImprovementStatus,
  ImprovementPriority,
  ModelType,
  ExpectedOutcome,
  MetricImprovement,
  RiskAssessment,
  RollbackPlan,
  RollbackTrigger,
  ImprovementResult,
  WorkflowContext
} from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface GenerateImprovementPlanInput {
  analysis: FailureAnalysis;
  modelType: ModelType;
  priority: ImprovementPriority;
  constraints: {
    maxDuration: number; // milliseconds
    maxCost: number;
    requiresApproval: boolean;
  };
}

export async function generateImprovementPlan(
  input: GenerateImprovementPlanInput
): Promise<ImprovementPlan> {
  const { heartbeat } = Context.current();
  
  try {
    await heartbeat();

    // Generate improvements based on analysis
    const improvements = await generateImprovements(
      input.analysis,
      input.modelType,
      input.constraints
    );

    // Order improvements by dependencies
    const orderedImprovements = orderByDependencies(improvements);

    // Calculate expected outcome
    const expectedOutcome = calculateExpectedOutcome(
      orderedImprovements,
      input.analysis
    );

    // Assess if approval is needed
    const approvalRequired = determineApprovalRequirement(
      expectedOutcome,
      input.constraints,
      input.priority
    );

    // Calculate total duration
    const estimatedDuration = orderedImprovements.reduce(
      (sum, imp) => sum + imp.estimatedDuration,
      0
    );

    return {
      id: `plan_${uuidv4()}`,
      failureId: input.analysis.failureId,
      modelType: input.modelType,
      priority: input.priority,
      improvements: orderedImprovements,
      estimatedDuration,
      expectedOutcome,
      approvalRequired,
      createdAt: new Date()
    };

  } catch (error) {
    console.error('Failed to generate improvement plan:', error);
    throw error;
  }
}

async function generateImprovements(
  analysis: FailureAnalysis,
  modelType: ModelType,
  constraints: any
): Promise<Improvement[]> {
  const improvements: Improvement[] = [];
  let totalDuration = 0;
  let totalCost = 0;

  // Priority 1: Quick wins with high confidence
  for (const hypothesis of analysis.hypotheses) {
    if (hypothesis.confidence > 0.8 && hypothesis.riskLevel === 'low') {
      const improvement = createImprovement(hypothesis, modelType);
      
      if (totalDuration + improvement.estimatedDuration <= constraints.maxDuration &&
          totalCost + estimateCost(improvement) <= constraints.maxCost) {
        improvements.push(improvement);
        totalDuration += improvement.estimatedDuration;
        totalCost += estimateCost(improvement);
      }
    }
  }

  // Priority 2: Data quality improvements
  const dataQualityIssues = analysis.rootCauses.filter(c => c.category === 'data_quality');
  if (dataQualityIssues.length > 0) {
    improvements.push({
      id: `imp_${uuidv4()}`,
      type: ImprovementType.DATASET_ENHANCEMENT,
      description: 'Enhance dataset quality and diversity',
      parameters: {
        strategies: ['outlier_removal', 'class_balancing', 'synthetic_generation'],
        targetQualityScore: 0.95,
        validationSplit: 0.2
      },
      dependencies: [],
      estimatedDuration: 2 * 60 * 60 * 1000, // 2 hours
      status: ImprovementStatus.PENDING
    });
  }

  // Priority 3: Hyperparameter optimization
  const hyperparamIssues = analysis.rootCauses.filter(c => c.category === 'hyperparameters');
  if (hyperparamIssues.length > 0) {
    improvements.push({
      id: `imp_${uuidv4()}`,
      type: ImprovementType.HYPERPARAMETER_TUNING,
      description: 'Optimize hyperparameters using Bayesian search',
      parameters: {
        searchSpace: getHyperparameterSearchSpace(modelType),
        trials: 50,
        metric: 'conversion_rate',
        strategy: 'bayesian'
      },
      dependencies: [],
      estimatedDuration: 4 * 60 * 60 * 1000, // 4 hours
      status: ImprovementStatus.PENDING
    });
  }

  // Priority 4: Feature engineering
  if (analysis.confidence < 0.7) {
    improvements.push({
      id: `imp_${uuidv4()}`,
      type: ImprovementType.FEATURE_ENGINEERING,
      description: 'Engineer new features to capture patterns',
      parameters: {
        techniques: ['polynomial_features', 'interaction_terms', 'embedding_extraction'],
        featureSelection: 'mutual_information',
        maxFeatures: 100
      },
      dependencies: [],
      estimatedDuration: 3 * 60 * 60 * 1000, // 3 hours
      status: ImprovementStatus.PENDING
    });
  }

  // Priority 5: Model-specific improvements
  switch (modelType) {
    case ModelType.MARKETING:
      improvements.push({
        id: `imp_${uuidv4()}`,
        type: ImprovementType.PROMPT_OPTIMIZATION,
        description: 'Optimize marketing content generation prompts',
        parameters: {
          techniques: ['few_shot_learning', 'chain_of_thought', 'persona_tuning'],
          testVariations: 10,
          evaluationMetric: 'engagement_rate'
        },
        dependencies: [],
        estimatedDuration: 1 * 60 * 60 * 1000, // 1 hour
        status: ImprovementStatus.PENDING
      });
      break;

    case ModelType.SALES:
      improvements.push({
        id: `imp_${uuidv4()}`,
        type: ImprovementType.CONTEXT_ADJUSTMENT,
        description: 'Adjust sales context for better lead qualification',
        parameters: {
          contextWindow: 2048,
          includeHistory: true,
          personalizeByIndustry: true
        },
        dependencies: [],
        estimatedDuration: 1.5 * 60 * 60 * 1000, // 1.5 hours
        status: ImprovementStatus.PENDING
      });
      break;

    case ModelType.SUPPORT:
      improvements.push({
        id: `imp_${uuidv4()}`,
        type: ImprovementType.FINE_TUNING,
        description: 'Fine-tune support model on recent tickets',
        parameters: {
          dataSource: 'recent_tickets',
          epochs: 10,
          batchSize: 16,
          learningRate: 0.0001
        },
        dependencies: [],
        estimatedDuration: 5 * 60 * 60 * 1000, // 5 hours
        status: ImprovementStatus.PENDING
      });
      break;
  }

  return improvements;
}

function createImprovement(hypothesis: any, modelType: ModelType): Improvement {
  const typeMap: Record<string, ImprovementType> = {
    'data': ImprovementType.DATASET_ENHANCEMENT,
    'hyperparameter': ImprovementType.HYPERPARAMETER_TUNING,
    'architecture': ImprovementType.ARCHITECTURE_CHANGE,
    'feature': ImprovementType.FEATURE_ENGINEERING,
    'prompt': ImprovementType.PROMPT_OPTIMIZATION,
    'context': ImprovementType.CONTEXT_ADJUSTMENT,
    'training': ImprovementType.FINE_TUNING
  };

  const type = Object.keys(typeMap).find(key => 
    hypothesis.description.toLowerCase().includes(key)
  ) || 'training';

  return {
    id: `imp_${uuidv4()}`,
    type: typeMap[type],
    description: hypothesis.description,
    parameters: {
      hypothesisId: hypothesis.id,
      changes: hypothesis.requiredChanges,
      expectedImprovement: hypothesis.expectedImprovement
    },
    dependencies: [],
    estimatedDuration: hypothesis.estimatedEffort * 60 * 60 * 1000, // Convert hours to ms
    status: ImprovementStatus.PENDING
  };
}

function orderByDependencies(improvements: Improvement[]): Improvement[] {
  // Simple topological sort for dependencies
  const sorted: Improvement[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(improvement: Improvement) {
    if (visited.has(improvement.id)) return;
    if (visiting.has(improvement.id)) {
      throw new Error('Circular dependency detected');
    }

    visiting.add(improvement.id);

    for (const depId of improvement.dependencies) {
      const dep = improvements.find(i => i.id === depId);
      if (dep) visit(dep);
    }

    visiting.delete(improvement.id);
    visited.add(improvement.id);
    sorted.push(improvement);
  }

  for (const improvement of improvements) {
    visit(improvement);
  }

  return sorted;
}

function calculateExpectedOutcome(
  improvements: Improvement[],
  analysis: FailureAnalysis
): ExpectedOutcome {
  // Calculate cumulative improvements
  let totalImprovement = 0;
  const metricImprovements: MetricImprovement[] = [];

  for (const improvement of improvements) {
    const expectedImprovement = improvement.parameters.expectedImprovement || 0.1;
    totalImprovement = totalImprovement + expectedImprovement * (1 - totalImprovement); // Diminishing returns
    
    metricImprovements.push({
      metric: 'conversion_rate',
      currentValue: 0.05, // Example baseline
      targetValue: 0.05 * (1 + totalImprovement),
      improvementPercentage: totalImprovement * 100,
      confidence: 0.7
    });
  }

  // Assess risk
  const riskLevel = improvements.some(i => 
    i.type === ImprovementType.ARCHITECTURE_CHANGE
  ) ? 'high' : improvements.length > 5 ? 'medium' : 'low';

  const riskAssessment: RiskAssessment = {
    level: riskLevel,
    factors: [
      improvements.length > 5 ? 'Multiple concurrent changes' : '',
      improvements.some(i => i.type === ImprovementType.ARCHITECTURE_CHANGE) ? 'Architecture changes' : '',
      totalImprovement > 0.3 ? 'Aggressive improvement target' : ''
    ].filter(Boolean),
    mitigations: [
      'Gradual rollout',
      'Comprehensive testing',
      'Monitoring and alerting',
      'Quick rollback capability'
    ],
    acceptableDowntime: 0 // Zero downtime deployment
  };

  // Define rollback plan
  const rollbackPlan: RollbackPlan = {
    trigger: {
      conditions: [
        { metric: 'error_rate', operator: 'gt', value: 0.05 },
        { metric: 'conversion_rate', operator: 'lt', value: 0.04 },
        { metric: 'latency_p99', operator: 'gt', value: 2000 }
      ],
      threshold: 1, // Any condition triggers rollback
      evaluationPeriod: 5 * 60 * 1000 // 5 minutes
    },
    steps: [
      'Stop new traffic to updated model',
      'Route all traffic to previous version',
      'Preserve logs and metrics for analysis',
      'Notify stakeholders',
      'Initiate root cause analysis'
    ],
    estimatedDuration: 2 * 60 * 1000, // 2 minutes
    dataBackup: true
  };

  return {
    metricImprovements,
    riskAssessment,
    successProbability: Math.max(0.5, Math.min(0.95, 1 - (riskLevel === 'high' ? 0.3 : riskLevel === 'medium' ? 0.15 : 0.05))),
    rollbackPlan
  };
}

function determineApprovalRequirement(
  outcome: ExpectedOutcome,
  constraints: any,
  priority: ImprovementPriority
): boolean {
  // Require approval for high-risk or critical changes
  if (outcome.riskAssessment.level === 'high' || outcome.riskAssessment.level === 'critical') {
    return true;
  }

  // Require approval if explicitly set in constraints
  if (constraints.requiresApproval) {
    return true;
  }

  // Require approval for non-critical low-confidence changes
  if (priority !== ImprovementPriority.CRITICAL && outcome.successProbability < 0.7) {
    return true;
  }

  return false;
}

function estimateCost(improvement: Improvement): number {
  // Estimate computational cost based on improvement type
  const costMap: Record<ImprovementType, number> = {
    [ImprovementType.DATASET_ENHANCEMENT]: 50,
    [ImprovementType.HYPERPARAMETER_TUNING]: 200,
    [ImprovementType.ARCHITECTURE_CHANGE]: 300,
    [ImprovementType.FEATURE_ENGINEERING]: 100,
    [ImprovementType.PROMPT_OPTIMIZATION]: 30,
    [ImprovementType.CONTEXT_ADJUSTMENT]: 20,
    [ImprovementType.FINE_TUNING]: 150
  };

  return costMap[improvement.type] || 100;
}

function getHyperparameterSearchSpace(modelType: ModelType): any {
  const baseSpace = {
    learning_rate: [0.0001, 0.001, 0.01],
    batch_size: [16, 32, 64, 128],
    dropout: [0.1, 0.2, 0.3, 0.4],
    weight_decay: [0.0, 0.0001, 0.001]
  };

  const modelSpecificSpace: Record<ModelType, any> = {
    [ModelType.MARKETING]: {
      ...baseSpace,
      temperature: [0.7, 0.8, 0.9, 1.0],
      top_p: [0.8, 0.9, 0.95],
      max_tokens: [100, 200, 500]
    },
    [ModelType.SALES]: {
      ...baseSpace,
      context_window: [512, 1024, 2048],
      attention_heads: [4, 8, 12],
      hidden_size: [256, 512, 768]
    },
    [ModelType.SUPPORT]: {
      ...baseSpace,
      sequence_length: [128, 256, 512],
      embedding_dim: [128, 256, 512],
      num_layers: [2, 3, 4]
    },
    [ModelType.ANALYTICS]: {
      ...baseSpace,
      n_estimators: [100, 200, 500],
      max_depth: [5, 10, 15, 20],
      min_samples_split: [2, 5, 10]
    },
    [ModelType.CONTENT]: {
      ...baseSpace,
      beam_width: [1, 3, 5],
      length_penalty: [0.5, 1.0, 1.5],
      repetition_penalty: [1.0, 1.2, 1.5]
    }
  };

  return modelSpecificSpace[modelType] || baseSpace;
}

export interface ExecuteImprovementInput {
  improvement: Improvement;
  context: WorkflowContext;
  timeout: number;
}

export async function executeImprovement(
  input: ExecuteImprovementInput
): Promise<ImprovementResult> {
  const { heartbeat } = Context.current();
  const startTime = Date.now();

  try {
    await heartbeat();

    // Simulate improvement execution based on type
    const result = await executeImprovementByType(
      input.improvement,
      input.context
    );

    const duration = Date.now() - startTime;

    return {
      improvementId: input.improvement.id,
      type: input.improvement.type,
      status: ImprovementStatus.COMPLETED,
      metrics: result.metrics,
      duration,
      details: result.details
    };

  } catch (error) {
    console.error(`Failed to execute improvement ${input.improvement.id}:`, error);
    
    return {
      improvementId: input.improvement.id,
      type: input.improvement.type,
      status: ImprovementStatus.FAILED,
      metrics: {},
      duration: Date.now() - startTime,
      details: { error: error.message }
    };
  }
}

async function executeImprovementByType(
  improvement: Improvement,
  context: WorkflowContext
): Promise<any> {
  // Simulate different improvement executions
  await new Promise(resolve => setTimeout(resolve, Math.random() * 5000));

  const successRate = Math.random() > 0.1; // 90% success rate
  
  if (!successRate) {
    throw new Error(`Improvement execution failed: ${improvement.type}`);
  }

  return {
    metrics: {
      improvement_score: Math.random() * 0.3 + 0.1,
      execution_time: Math.random() * 1000,
      resource_usage: Math.random() * 100
    },
    details: {
      type: improvement.type,
      parameters: improvement.parameters,
      context: context.metadata
    }
  };
}