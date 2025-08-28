/**
 * A/B Test Failure Analyzer
 * Analyzes losing model variants to identify improvement opportunities
 */

import { EventEmitter } from 'events';
import * as ss from 'simple-statistics';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

export interface ABTestResult {
  experimentId: string;
  winner: string;
  loser: string;
  metrics: TestMetrics;
  confidence: number;
  lift: number;
  duration: number;
  sampleSize: number;
}

export interface TestMetrics {
  conversion: MetricComparison;
  satisfaction: MetricComparison;
  revenue: MetricComparison;
  latency: MetricComparison;
  cost: MetricComparison;
  accuracy: MetricComparison;
}

export interface MetricComparison {
  winner: number;
  loser: number;
  difference: number;
  percentChange: number;
  significance: boolean;
}

export interface FailureAnalysis {
  id: string;
  modelId: string;
  experimentId: string;
  timestamp: Date;
  failureType: FailureType;
  rootCauses: RootCause[];
  patterns: FailurePattern[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  businessImpact: number;
  improvementHypotheses: Hypothesis[];
  requiredData: DataRequirement[];
  recommendedAgents: string[];
}

export enum FailureType {
  ACCURACY = 'ACCURACY',
  LATENCY = 'LATENCY',
  COST = 'COST',
  SATISFACTION = 'SATISFACTION',
  CONVERSION = 'CONVERSION',
  REVENUE = 'REVENUE',
  MULTIPLE = 'MULTIPLE'
}

export interface RootCause {
  id: string;
  category: string;
  description: string;
  evidence: Evidence[];
  confidence: number;
  impact: number;
}

export interface Evidence {
  type: string;
  value: any;
  source: string;
  timestamp: Date;
}

export interface FailurePattern {
  id: string;
  name: string;
  description: string;
  frequency: number;
  affectedSegments: string[];
  conditions: Map<string, any>;
}

export interface Hypothesis {
  id: string;
  type: 'training' | 'architecture' | 'data' | 'hyperparameter' | 'feature';
  description: string;
  expectedImprovement: number;
  confidence: number;
  testingApproach: string;
  requiredResources: string[];
}

export interface DataRequirement {
  type: 'training' | 'validation' | 'edge-case' | 'adversarial';
  quantity: number;
  characteristics: string[];
  source: string;
  priority: 'low' | 'medium' | 'high';
}

export class FailureAnalyzer extends EventEmitter {
  private failureHistory: Map<string, FailureAnalysis[]> = new Map();
  private patternLibrary: Map<string, FailurePattern> = new Map();
  private hypothesisSuccess: Map<string, number> = new Map();

  constructor() {
    super();
    this.initializePatternLibrary();
  }

  /**
   * Analyze A/B test failure
   */
  async analyzeFailure(testResult: ABTestResult): Promise<FailureAnalysis> {
    console.log(`Analyzing failure for model ${testResult.loser} in experiment ${testResult.experimentId}`);

    // Identify failure type
    const failureType = this.identifyFailureType(testResult.metrics);

    // Find root causes
    const rootCauses = await this.findRootCauses(testResult, failureType);

    // Detect patterns
    const patterns = this.detectPatterns(testResult, rootCauses);

    // Calculate severity and impact
    const severity = this.calculateSeverity(testResult, failureType);
    const businessImpact = this.calculateBusinessImpact(testResult);

    // Generate improvement hypotheses
    const hypotheses = this.generateHypotheses(failureType, rootCauses, patterns);

    // Determine data requirements
    const requiredData = this.determineDataRequirements(failureType, patterns);

    // Recommend agents for improvement
    const recommendedAgents = this.recommendAgents(failureType, hypotheses);

    const analysis: FailureAnalysis = {
      id: uuidv4(),
      modelId: testResult.loser,
      experimentId: testResult.experimentId,
      timestamp: new Date(),
      failureType,
      rootCauses,
      patterns,
      severity,
      businessImpact,
      improvementHypotheses: hypotheses,
      requiredData,
      recommendedAgents
    };

    // Store in history
    if (!this.failureHistory.has(testResult.loser)) {
      this.failureHistory.set(testResult.loser, []);
    }
    this.failureHistory.get(testResult.loser)!.push(analysis);

    // Update pattern library
    this.updatePatternLibrary(patterns);

    this.emit('analysis:complete', analysis);
    return analysis;
  }

  /**
   * Identify the primary failure type
   */
  private identifyFailureType(metrics: TestMetrics): FailureType {
    const failures: FailureType[] = [];

    // Check each metric for significant underperformance
    if (metrics.accuracy.percentChange < -10 && metrics.accuracy.significance) {
      failures.push(FailureType.ACCURACY);
    }
    if (metrics.latency.percentChange > 20 && metrics.latency.significance) {
      failures.push(FailureType.LATENCY);
    }
    if (metrics.cost.percentChange > 15 && metrics.cost.significance) {
      failures.push(FailureType.COST);
    }
    if (metrics.satisfaction.percentChange < -5 && metrics.satisfaction.significance) {
      failures.push(FailureType.SATISFACTION);
    }
    if (metrics.conversion.percentChange < -10 && metrics.conversion.significance) {
      failures.push(FailureType.CONVERSION);
    }
    if (metrics.revenue.percentChange < -10 && metrics.revenue.significance) {
      failures.push(FailureType.REVENUE);
    }

    if (failures.length === 0) {
      // No significant failure, but still lost - likely marginal
      return FailureType.ACCURACY;
    } else if (failures.length === 1) {
      return failures[0];
    } else {
      return FailureType.MULTIPLE;
    }
  }

  /**
   * Find root causes of failure
   */
  private async findRootCauses(
    testResult: ABTestResult,
    failureType: FailureType
  ): Promise<RootCause[]> {
    const rootCauses: RootCause[] = [];

    switch (failureType) {
      case FailureType.ACCURACY:
        rootCauses.push(...this.analyzeAccuracyFailure(testResult));
        break;
      case FailureType.LATENCY:
        rootCauses.push(...this.analyzeLatencyFailure(testResult));
        break;
      case FailureType.COST:
        rootCauses.push(...this.analyzeCostFailure(testResult));
        break;
      case FailureType.SATISFACTION:
        rootCauses.push(...this.analyzeSatisfactionFailure(testResult));
        break;
      case FailureType.CONVERSION:
        rootCauses.push(...this.analyzeConversionFailure(testResult));
        break;
      case FailureType.REVENUE:
        rootCauses.push(...this.analyzeRevenueFailure(testResult));
        break;
      case FailureType.MULTIPLE:
        // Analyze all failure types
        rootCauses.push(...this.analyzeAccuracyFailure(testResult));
        rootCauses.push(...this.analyzeLatencyFailure(testResult));
        rootCauses.push(...this.analyzeSatisfactionFailure(testResult));
        break;
    }

    // Fetch additional diagnostic data
    const diagnostics = await this.fetchDiagnostics(testResult.loser);
    rootCauses.push(...this.analyzeDiagnostics(diagnostics));

    // Sort by confidence and impact
    rootCauses.sort((a, b) => (b.confidence * b.impact) - (a.confidence * a.impact));

    return rootCauses.slice(0, 5); // Top 5 root causes
  }

  private analyzeAccuracyFailure(testResult: ABTestResult): RootCause[] {
    const causes: RootCause[] = [];
    const metrics = testResult.metrics;

    if (metrics.accuracy.percentChange < -20) {
      causes.push({
        id: uuidv4(),
        category: 'training',
        description: 'Severe accuracy degradation indicates training data issues',
        evidence: [{
          type: 'metric',
          value: metrics.accuracy,
          source: 'ab-test',
          timestamp: new Date()
        }],
        confidence: 0.9,
        impact: 0.8
      });
    }

    if (metrics.accuracy.loser < 0.7) {
      causes.push({
        id: uuidv4(),
        category: 'architecture',
        description: 'Model architecture may be insufficient for task complexity',
        evidence: [{
          type: 'threshold',
          value: metrics.accuracy.loser,
          source: 'performance',
          timestamp: new Date()
        }],
        confidence: 0.7,
        impact: 0.9
      });
    }

    return causes;
  }

  private analyzeLatencyFailure(testResult: ABTestResult): RootCause[] {
    const causes: RootCause[] = [];
    const metrics = testResult.metrics;

    if (metrics.latency.loser > 1000) {
      causes.push({
        id: uuidv4(),
        category: 'performance',
        description: 'Response time exceeds user tolerance threshold',
        evidence: [{
          type: 'latency',
          value: metrics.latency.loser,
          source: 'monitoring',
          timestamp: new Date()
        }],
        confidence: 0.95,
        impact: 0.7
      });
    }

    if (metrics.latency.percentChange > 50) {
      causes.push({
        id: uuidv4(),
        category: 'optimization',
        description: 'Model lacks performance optimization',
        evidence: [{
          type: 'comparison',
          value: metrics.latency.percentChange,
          source: 'ab-test',
          timestamp: new Date()
        }],
        confidence: 0.8,
        impact: 0.6
      });
    }

    return causes;
  }

  private analyzeCostFailure(testResult: ABTestResult): RootCause[] {
    const causes: RootCause[] = [];
    const metrics = testResult.metrics;

    causes.push({
      id: uuidv4(),
      category: 'resource',
      description: 'Model consumes excessive computational resources',
      evidence: [{
        type: 'cost',
        value: metrics.cost,
        source: 'billing',
        timestamp: new Date()
      }],
      confidence: 0.85,
      impact: 0.5
    });

    return causes;
  }

  private analyzeSatisfactionFailure(testResult: ABTestResult): RootCause[] {
    const causes: RootCause[] = [];
    const metrics = testResult.metrics;

    if (metrics.satisfaction.percentChange < -10) {
      causes.push({
        id: uuidv4(),
        category: 'quality',
        description: 'Output quality does not meet user expectations',
        evidence: [{
          type: 'satisfaction',
          value: metrics.satisfaction,
          source: 'user-feedback',
          timestamp: new Date()
        }],
        confidence: 0.75,
        impact: 0.85
      });
    }

    return causes;
  }

  private analyzeConversionFailure(testResult: ABTestResult): RootCause[] {
    const causes: RootCause[] = [];
    const metrics = testResult.metrics;

    causes.push({
      id: uuidv4(),
      category: 'business',
      description: 'Model outputs do not drive desired user actions',
      evidence: [{
        type: 'conversion',
        value: metrics.conversion,
        source: 'analytics',
        timestamp: new Date()
      }],
      confidence: 0.7,
      impact: 0.9
    });

    return causes;
  }

  private analyzeRevenueFailure(testResult: ABTestResult): RootCause[] {
    const causes: RootCause[] = [];
    const metrics = testResult.metrics;

    causes.push({
      id: uuidv4(),
      category: 'business',
      description: 'Model negatively impacts revenue generation',
      evidence: [{
        type: 'revenue',
        value: metrics.revenue,
        source: 'financial',
        timestamp: new Date()
      }],
      confidence: 0.8,
      impact: 1.0
    });

    return causes;
  }

  private async fetchDiagnostics(modelId: string): Promise<any> {
    try {
      // Fetch model diagnostics from monitoring service
      const response = await axios.get(`http://localhost:3001/models/${modelId}/diagnostics`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch diagnostics:', error);
      return {};
    }
  }

  private analyzeDiagnostics(diagnostics: any): RootCause[] {
    const causes: RootCause[] = [];

    if (diagnostics.memoryUsage > 0.9) {
      causes.push({
        id: uuidv4(),
        category: 'resource',
        description: 'High memory usage affecting performance',
        evidence: [{
          type: 'memory',
          value: diagnostics.memoryUsage,
          source: 'diagnostics',
          timestamp: new Date()
        }],
        confidence: 0.9,
        impact: 0.6
      });
    }

    if (diagnostics.errorRate > 0.05) {
      causes.push({
        id: uuidv4(),
        category: 'reliability',
        description: 'High error rate affecting user experience',
        evidence: [{
          type: 'errors',
          value: diagnostics.errorRate,
          source: 'diagnostics',
          timestamp: new Date()
        }],
        confidence: 0.85,
        impact: 0.8
      });
    }

    return causes;
  }

  /**
   * Detect failure patterns
   */
  private detectPatterns(
    testResult: ABTestResult,
    rootCauses: RootCause[]
  ): FailurePattern[] {
    const patterns: FailurePattern[] = [];

    // Check against known patterns
    for (const [patternId, pattern] of this.patternLibrary) {
      if (this.matchesPattern(testResult, rootCauses, pattern)) {
        patterns.push({
          ...pattern,
          frequency: pattern.frequency + 1
        });
      }
    }

    // Detect new patterns
    const newPattern = this.detectNewPattern(testResult, rootCauses);
    if (newPattern) {
      patterns.push(newPattern);
    }

    return patterns;
  }

  private matchesPattern(
    testResult: ABTestResult,
    rootCauses: RootCause[],
    pattern: FailurePattern
  ): boolean {
    // Check if root causes match pattern conditions
    for (const [key, value] of pattern.conditions) {
      const matchingCause = rootCauses.find(c => 
        c.category === key && c.confidence > 0.6
      );
      
      if (!matchingCause) return false;
    }

    return true;
  }

  private detectNewPattern(
    testResult: ABTestResult,
    rootCauses: RootCause[]
  ): FailurePattern | null {
    // Look for recurring combinations of root causes
    if (rootCauses.length >= 2) {
      const categories = rootCauses.map(c => c.category).sort().join('-');
      const existingPattern = Array.from(this.patternLibrary.values()).find(
        p => p.name === categories
      );

      if (!existingPattern) {
        return {
          id: uuidv4(),
          name: categories,
          description: `Pattern: ${categories}`,
          frequency: 1,
          affectedSegments: [],
          conditions: new Map(rootCauses.map(c => [c.category, c.confidence]))
        };
      }
    }

    return null;
  }

  /**
   * Calculate failure severity
   */
  private calculateSeverity(
    testResult: ABTestResult,
    failureType: FailureType
  ): 'low' | 'medium' | 'high' | 'critical' {
    const metrics = testResult.metrics;
    let severityScore = 0;

    // Revenue impact
    if (metrics.revenue.percentChange < -20) severityScore += 3;
    else if (metrics.revenue.percentChange < -10) severityScore += 2;
    else if (metrics.revenue.percentChange < -5) severityScore += 1;

    // User satisfaction impact
    if (metrics.satisfaction.percentChange < -15) severityScore += 3;
    else if (metrics.satisfaction.percentChange < -10) severityScore += 2;
    else if (metrics.satisfaction.percentChange < -5) severityScore += 1;

    // Accuracy impact
    if (metrics.accuracy.percentChange < -25) severityScore += 2;
    else if (metrics.accuracy.percentChange < -15) severityScore += 1;

    // Multiple failures
    if (failureType === FailureType.MULTIPLE) severityScore += 2;

    if (severityScore >= 7) return 'critical';
    if (severityScore >= 5) return 'high';
    if (severityScore >= 3) return 'medium';
    return 'low';
  }

  /**
   * Calculate business impact
   */
  private calculateBusinessImpact(testResult: ABTestResult): number {
    const metrics = testResult.metrics;
    
    // Weighted impact calculation
    const revenueWeight = 0.4;
    const conversionWeight = 0.3;
    const satisfactionWeight = 0.2;
    const costWeight = 0.1;

    const revenueImpact = Math.abs(metrics.revenue.percentChange) / 100;
    const conversionImpact = Math.abs(metrics.conversion.percentChange) / 100;
    const satisfactionImpact = Math.abs(metrics.satisfaction.percentChange) / 100;
    const costImpact = Math.abs(metrics.cost.percentChange) / 100;

    return (
      revenueImpact * revenueWeight +
      conversionImpact * conversionWeight +
      satisfactionImpact * satisfactionWeight +
      costImpact * costWeight
    );
  }

  /**
   * Generate improvement hypotheses
   */
  private generateHypotheses(
    failureType: FailureType,
    rootCauses: RootCause[],
    patterns: FailurePattern[]
  ): Hypothesis[] {
    const hypotheses: Hypothesis[] = [];

    // Generate hypotheses based on failure type
    switch (failureType) {
      case FailureType.ACCURACY:
        hypotheses.push(...this.generateAccuracyHypotheses(rootCauses));
        break;
      case FailureType.LATENCY:
        hypotheses.push(...this.generateLatencyHypotheses(rootCauses));
        break;
      case FailureType.SATISFACTION:
        hypotheses.push(...this.generateSatisfactionHypotheses(rootCauses));
        break;
      default:
        hypotheses.push(...this.generateGeneralHypotheses(rootCauses));
    }

    // Add pattern-based hypotheses
    for (const pattern of patterns) {
      const patternHypothesis = this.generatePatternHypothesis(pattern);
      if (patternHypothesis) {
        hypotheses.push(patternHypothesis);
      }
    }

    // Sort by expected improvement and confidence
    hypotheses.sort((a, b) => 
      (b.expectedImprovement * b.confidence) - (a.expectedImprovement * a.confidence)
    );

    return hypotheses.slice(0, 5); // Top 5 hypotheses
  }

  private generateAccuracyHypotheses(rootCauses: RootCause[]): Hypothesis[] {
    const hypotheses: Hypothesis[] = [];

    const trainingCause = rootCauses.find(c => c.category === 'training');
    if (trainingCause) {
      hypotheses.push({
        id: uuidv4(),
        type: 'training',
        description: 'Retrain model with augmented dataset including edge cases',
        expectedImprovement: 0.15,
        confidence: 0.8,
        testingApproach: 'Cross-validation with held-out test set',
        requiredResources: ['training-data', 'compute-gpu', 'ml-engineer']
      });

      hypotheses.push({
        id: uuidv4(),
        type: 'data',
        description: 'Clean and rebalance training data to reduce bias',
        expectedImprovement: 0.1,
        confidence: 0.7,
        testingApproach: 'A/B test with cleaned dataset',
        requiredResources: ['data-engineer', 'domain-expert']
      });
    }

    const architectureCause = rootCauses.find(c => c.category === 'architecture');
    if (architectureCause) {
      hypotheses.push({
        id: uuidv4(),
        type: 'architecture',
        description: 'Increase model capacity with deeper layers',
        expectedImprovement: 0.2,
        confidence: 0.6,
        testingApproach: 'Gradual capacity increase with validation',
        requiredResources: ['ml-architect', 'compute-gpu']
      });
    }

    return hypotheses;
  }

  private generateLatencyHypotheses(rootCauses: RootCause[]): Hypothesis[] {
    return [{
      id: uuidv4(),
      type: 'architecture',
      description: 'Implement model quantization to reduce inference time',
      expectedImprovement: 0.3,
      confidence: 0.85,
      testingApproach: 'Benchmark latency with quantized model',
      requiredResources: ['performance-engineer']
    }, {
      id: uuidv4(),
      type: 'feature',
      description: 'Add response caching for common queries',
      expectedImprovement: 0.4,
      confidence: 0.9,
      testingApproach: 'Load test with cache enabled',
      requiredResources: ['backend-engineer', 'redis']
    }];
  }

  private generateSatisfactionHypotheses(rootCauses: RootCause[]): Hypothesis[] {
    return [{
      id: uuidv4(),
      type: 'training',
      description: 'Fine-tune on user feedback data',
      expectedImprovement: 0.25,
      confidence: 0.75,
      testingApproach: 'User study with fine-tuned model',
      requiredResources: ['user-feedback', 'ml-engineer']
    }, {
      id: uuidv4(),
      type: 'feature',
      description: 'Implement response personalization',
      expectedImprovement: 0.2,
      confidence: 0.7,
      testingApproach: 'A/B test personalized responses',
      requiredResources: ['personalization-engine', 'user-data']
    }];
  }

  private generateGeneralHypotheses(rootCauses: RootCause[]): Hypothesis[] {
    return [{
      id: uuidv4(),
      type: 'hyperparameter',
      description: 'Optimize hyperparameters with Bayesian search',
      expectedImprovement: 0.1,
      confidence: 0.8,
      testingApproach: 'Grid search with cross-validation',
      requiredResources: ['compute', 'optuna']
    }];
  }

  private generatePatternHypothesis(pattern: FailurePattern): Hypothesis | null {
    // Check if we've seen this pattern before and what worked
    const previousSuccess = this.hypothesisSuccess.get(pattern.name);
    
    if (previousSuccess && previousSuccess > 0.5) {
      return {
        id: uuidv4(),
        type: 'training',
        description: `Apply proven fix for pattern: ${pattern.name}`,
        expectedImprovement: previousSuccess,
        confidence: 0.9,
        testingApproach: 'Replicate previous successful intervention',
        requiredResources: ['historical-data']
      };
    }

    return null;
  }

  /**
   * Determine data requirements
   */
  private determineDataRequirements(
    failureType: FailureType,
    patterns: FailurePattern[]
  ): DataRequirement[] {
    const requirements: DataRequirement[] = [];

    switch (failureType) {
      case FailureType.ACCURACY:
        requirements.push({
          type: 'training',
          quantity: 10000,
          characteristics: ['diverse', 'balanced', 'annotated'],
          source: 'production-logs',
          priority: 'high'
        });
        requirements.push({
          type: 'edge-case',
          quantity: 1000,
          characteristics: ['failure-cases', 'outliers'],
          source: 'error-analysis',
          priority: 'high'
        });
        break;

      case FailureType.SATISFACTION:
        requirements.push({
          type: 'validation',
          quantity: 5000,
          characteristics: ['user-feedback', 'ratings'],
          source: 'user-studies',
          priority: 'medium'
        });
        break;

      case FailureType.LATENCY:
        requirements.push({
          type: 'validation',
          quantity: 1000,
          characteristics: ['performance-metrics', 'profiling'],
          source: 'benchmarks',
          priority: 'low'
        });
        break;
    }

    // Add adversarial data for robustness
    if (patterns.length > 2) {
      requirements.push({
        type: 'adversarial',
        quantity: 500,
        characteristics: ['synthetic', 'attack-vectors'],
        source: 'generation',
        priority: 'medium'
      });
    }

    return requirements;
  }

  /**
   * Recommend agents for improvement
   */
  private recommendAgents(
    failureType: FailureType,
    hypotheses: Hypothesis[]
  ): string[] {
    const agents = new Set<string>();

    // Base recommendations by failure type
    const failureAgentMap: Record<FailureType, string[]> = {
      [FailureType.ACCURACY]: ['ai-ml-pipeline-debugger', 'qa-automation-specialist'],
      [FailureType.LATENCY]: ['performance-optimization-engineer', 'backend-architecture-engineer'],
      [FailureType.COST]: ['devops-automation-engineer', 'resource-optimizer'],
      [FailureType.SATISFACTION]: ['ui-ux-design-agent', 'customer-success-agent'],
      [FailureType.CONVERSION]: ['business-intelligence-engineer', 'marketing-agent'],
      [FailureType.REVENUE]: ['business-intelligence-engineer', 'sales-agent'],
      [FailureType.MULTIPLE]: ['ai-ml-pipeline-debugger', 'site-reliability-engineer']
    };

    const baseAgents = failureAgentMap[failureType] || [];
    baseAgents.forEach(agent => agents.add(agent));

    // Add agents based on hypotheses
    for (const hypothesis of hypotheses) {
      switch (hypothesis.type) {
        case 'training':
          agents.add('ai-ml-pipeline-debugger');
          agents.add('lora-training-engineer');
          break;
        case 'architecture':
          agents.add('backend-architecture-engineer');
          break;
        case 'data':
          agents.add('data-pipeline-architect');
          break;
        case 'feature':
          agents.add('frontend-architecture-engineer');
          break;
        case 'hyperparameter':
          agents.add('ai-ml-pipeline-debugger');
          break;
      }
    }

    return Array.from(agents);
  }

  /**
   * Initialize pattern library with known patterns
   */
  private initializePatternLibrary(): void {
    // Common failure patterns
    this.patternLibrary.set('accuracy-training', {
      id: 'accuracy-training',
      name: 'accuracy-training',
      description: 'Low accuracy due to insufficient training data',
      frequency: 0,
      affectedSegments: ['new-users', 'edge-cases'],
      conditions: new Map([
        ['training', 0.8],
        ['accuracy', 0.7]
      ])
    });

    this.patternLibrary.set('latency-scale', {
      id: 'latency-scale',
      name: 'latency-scale',
      description: 'High latency under load',
      frequency: 0,
      affectedSegments: ['peak-hours'],
      conditions: new Map([
        ['performance', 0.9],
        ['resource', 0.6]
      ])
    });

    this.patternLibrary.set('satisfaction-quality', {
      id: 'satisfaction-quality',
      name: 'satisfaction-quality',
      description: 'Low satisfaction due to output quality',
      frequency: 0,
      affectedSegments: ['power-users'],
      conditions: new Map([
        ['quality', 0.8],
        ['business', 0.5]
      ])
    });
  }

  /**
   * Update pattern library with new observations
   */
  private updatePatternLibrary(patterns: FailurePattern[]): void {
    for (const pattern of patterns) {
      if (this.patternLibrary.has(pattern.id)) {
        const existing = this.patternLibrary.get(pattern.id)!;
        existing.frequency = pattern.frequency;
        existing.affectedSegments = Array.from(new Set([
          ...existing.affectedSegments,
          ...pattern.affectedSegments
        ]));
      } else {
        this.patternLibrary.set(pattern.id, pattern);
      }
    }
  }

  /**
   * Get failure history for a model
   */
  getFailureHistory(modelId: string): FailureAnalysis[] {
    return this.failureHistory.get(modelId) || [];
  }

  /**
   * Get common failure patterns
   */
  getCommonPatterns(minFrequency: number = 3): FailurePattern[] {
    return Array.from(this.patternLibrary.values())
      .filter(p => p.frequency >= minFrequency)
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Track hypothesis success
   */
  trackHypothesisSuccess(hypothesisId: string, success: boolean): void {
    const currentSuccess = this.hypothesisSuccess.get(hypothesisId) || 0;
    const newSuccess = success ? currentSuccess + 0.1 : currentSuccess - 0.1;
    this.hypothesisSuccess.set(hypothesisId, Math.max(0, Math.min(1, newSuccess)));
  }
}