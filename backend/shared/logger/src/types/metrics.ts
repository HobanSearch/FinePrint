/**
 * Specialized metrics type definitions for Fine Print AI
 */

// Custom metrics for Fine Print AI business operations
export interface FinePrintMetrics {
  // Document Analysis Metrics
  documentAnalysis: {
    totalDocuments: number;
    avgAnalysisTime: number;
    successRate: number;
    documentsPerSecond: number;
    patternMatchRate: number;
    riskScoreDistribution: Record<string, number>;
    documentTypes: Record<string, number>;
    languageSupport: Record<string, number>;
  };

  // Pattern Detection Metrics
  patternDetection: {
    totalPatterns: number;
    newPatternsDetected: number;
    falsePositiveRate: number;
    confidenceScores: number[];
    patternCategories: Record<string, number>;
    detectionLatency: number;
    modelAccuracy: number;
  };

  // Risk Assessment Metrics
  riskAssessment: {
    totalAssessments: number;
    riskDistribution: {
      low: number;
      medium: number;
      high: number;
      critical: number;
    };
    assessmentAccuracy: number;
    avgRiskScore: number;
    riskTrends: Array<{
      timestamp: Date;
      avgRisk: number;
    }>;
  };

  // Recommendation Engine Metrics
  recommendations: {
    totalRecommendations: number;
    acceptanceRate: number;
    avgConfidence: number;
    categoryDistribution: Record<string, number>;
    userEngagement: {
      viewRate: number;
      actionRate: number;
      dismissRate: number;
    };
    businessImpact: {
      costSavings: number;
      riskReduction: number;
      complianceImprovement: number;
    };
  };

  // Compliance Monitoring Metrics
  compliance: {
    totalChecks: number;
    complianceRate: number;
    violationTypes: Record<string, number>;
    regulationCoverage: Record<string, number>;
    auditTrailCompleteness: number;
    dataRetentionCompliance: number;
    privacyScorecard: {
      dataMinimization: number;
      consentManagement: number;
      rightToErasure: number;
      dataPortability: number;
    };
  };

  // Customer Experience Metrics
  customerExperience: {
    userSatisfaction: number;
    timeToValue: number; // Time to first insight
    featureAdoption: Record<string, number>;
    supportTickets: {
      total: number;
      avgResolutionTime: number;
      escalationRate: number;
      satisfactionScore: number;
    };
    churnIndicators: {
      riskScore: number;
      engagementTrend: number;
      featureUsageDecline: number;
    };
  };

  // Autonomous Agent Performance
  agentPerformance: {
    taskCompletionRate: number;
    avgTaskDuration: number;
    decisionAccuracy: number;
    learningProgress: Record<string, number>;
    adaptationRate: number;
    errorRecoveryTime: number;
    autonomyLevel: number; // 0-100% human intervention needed
    agentCollaboration: {
      interAgentCommunication: number;
      taskHandoffs: number;
      conflictResolution: number;
    };
  };

  // AI Model Performance
  modelMetrics: {
    training: {
      epochsCompleted: number;
      trainingLoss: number;
      validationLoss: number;
      learningRate: number;
      batchSize: number;
      convergenceTime: number;
    };
    inference: {
      requestsPerSecond: number;
      avgLatency: number;
      p95Latency: number;
      p99Latency: number;
      errorRate: number;
      modelLoadTime: number;
    };
    accuracy: {
      overallAccuracy: number;
      precisionByClass: Record<string, number>;
      recallByClass: Record<string, number>;
      f1ScoreByClass: Record<string, number>;
      confusionMatrix: number[][];
    };
    drift: {
      dataDrift: number;
      conceptDrift: number;
      performanceDrift: number;
      retrainingTrigger: boolean;
    };
  };
}

// Metric aggregation types
export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'p50' | 'p90' | 'p95' | 'p99';

export interface MetricAggregation {
  type: AggregationType;
  value: number;
  timestamp: Date;
  window: string; // e.g., '1m', '5m', '1h', '24h'
  groupBy?: Record<string, string>;
}

// Time series data structure
export interface TimeSeriesData {
  metric: string;
  points: Array<{
    timestamp: Date;
    value: number;
    labels?: Record<string, string>;
  }>;
  aggregations?: Record<AggregationType, number>;
}

// Custom gauge for business KPIs
export interface BusinessKPI {
  name: string;
  value: number;
  target: number;
  trend: 'up' | 'down' | 'stable';
  change: number; // Percentage change
  period: string; // Time period for the change
  status: 'on-track' | 'at-risk' | 'off-track';
  category: 'revenue' | 'engagement' | 'performance' | 'compliance';
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// Revenue-specific metrics
export interface RevenueMetrics {
  mrr: number; // Monthly Recurring Revenue
  arr: number; // Annual Recurring Revenue
  netRevenue: number;
  grossRevenue: number;
  churnRate: number;
  expansionRate: number;
  contractionRate: number;
  ltv: number; // Customer Lifetime Value
  cac: number; // Customer Acquisition Cost
  paybackPeriod: number; // Months
  avgDealSize: number;
  conversionRates: {
    trialToSubscription: number;
    freeToSubscription: number;
    leadToCustomer: number;
  };
  cohortAnalysis: Array<{
    cohort: string;
    retention: number[];
    revenue: number[];
  }>;
}

// Cost and efficiency metrics
export interface CostMetrics {
  infrastructureCost: number;
  computeCost: number;
  storageCost: number;
  networkCost: number;
  aiModelCost: number;
  operationalCost: number;
  costPerRequest: number;
  costPerCustomer: number;
  costEfficiencyRatio: number;
  resourceUtilization: {
    cpu: number;
    memory: number;
    storage: number;
    network: number;
  };
}

// Security metrics
export interface SecurityMetrics {
  threatDetection: {
    threatsDetected: number;
    falsePositives: number;
    responseTime: number;
    resolutionTime: number;
    severityDistribution: Record<string, number>;
  };
  vulnerabilities: {
    totalVulnerabilities: number;
    criticalVulnerabilities: number;
    patchingTime: number;
    vulnerabilityAge: number;
    complianceScore: number;
  };
  accessControl: {
    failedLogins: number;
    successfulLogins: number;
    privilegeEscalations: number;
    accessPatterns: Record<string, number>;
    anomalousAccess: number;
  };
  dataProtection: {
    encryptionCoverage: number;
    dataLeakEvents: number;
    backupSuccess: number;
    recoveryTime: number;
    complianceViolations: number;
  };
}

// Performance benchmarks
export interface PerformanceBenchmarks {
  api: {
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    throughput: number;
    errorRate: number;
    availability: number;
  };
  database: {
    queryTime: number;
    connectionPoolUsage: number;
    slowQueries: number;
    lockWaitTime: number;
    cacheHitRate: number;
  };
  ai: {
    inferenceTime: number;
    batchProcessingTime: number;
    modelLoadTime: number;
    queueDepth: number;
    gpuUtilization: number;
  };
  frontend: {
    pageLoadTime: number;
    firstContentfulPaint: number;
    timeToInteractive: number;
    cumulativeLayoutShift: number;
    largestContentfulPaint: number;
  };
}

// Export specialized metric interfaces
export {
  FinePrintMetrics,
  BusinessKPI,
  RevenueMetrics,
  CostMetrics,
  SecurityMetrics,
  PerformanceBenchmarks,
  MetricAggregation,
  TimeSeriesData,
  AggregationType
};