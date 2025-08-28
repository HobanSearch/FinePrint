import { z } from 'zod';

// Feedback Types
export const UserFeedbackSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  documentId: z.string(),
  modelId: z.string(),
  modelVersion: z.string(),
  feedbackType: z.enum(['THUMBS_UP', 'THUMBS_DOWN', 'CORRECTION', 'RATING', 'FLAG']),
  rating: z.number().min(0).max(5).optional(),
  correction: z.record(z.any()).optional(),
  comment: z.string().optional(),
});

export const ImplicitFeedbackSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  documentId: z.string(),
  eventType: z.enum(['dwell_time', 'click_through', 'task_completion', 'scroll_depth', 'interaction']),
  eventData: z.record(z.any()),
  confidence: z.number().min(0).max(1).optional(),
});

// Training Configuration
export const TrainingConfigSchema = z.object({
  modelType: z.enum(['phi2', 'mistral', 'llama2', 'mixtral', 'custom']),
  baseModel: z.string().optional(),
  datasetId: z.string(),
  hyperparameters: z.object({
    learningRate: z.number().min(0).max(1),
    batchSize: z.number().min(1).max(512),
    epochs: z.number().min(1).max(1000),
    warmupSteps: z.number().min(0).optional(),
    weightDecay: z.number().min(0).max(1).optional(),
    gradientClipping: z.number().min(0).optional(),
    earlyStopping: z.boolean().optional(),
    patience: z.number().min(1).optional(),
  }),
  loraConfig: z.object({
    rank: z.number().min(1).max(256),
    alpha: z.number().min(0),
    dropout: z.number().min(0).max(1),
    targetModules: z.array(z.string()),
  }).optional(),
  resources: z.object({
    gpuType: z.string().optional(),
    gpuMemory: z.number().optional(),
    cpuCores: z.number().optional(),
    maxMemory: z.number().optional(),
  }).optional(),
});

// Evaluation Metrics
export const EvaluationMetricsSchema = z.object({
  accuracy: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1Score: z.number().min(0).max(1),
  auc: z.number().min(0).max(1).optional(),
  confusionMatrix: z.array(z.array(z.number())).optional(),
  classMetrics: z.record(z.object({
    precision: z.number(),
    recall: z.number(),
    f1Score: z.number(),
    support: z.number(),
  })).optional(),
});

// Deployment Configuration
export const DeploymentConfigSchema = z.object({
  modelId: z.string(),
  modelVersion: z.string(),
  environment: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION', 'CANARY']),
  deploymentType: z.enum(['CANARY', 'BLUE_GREEN', 'ROLLING', 'SHADOW']),
  replicas: z.number().min(1).max(100).default(1),
  resources: z.object({
    cpuLimit: z.number().optional(),
    memoryLimit: z.number().optional(),
    gpuLimit: z.number().optional(),
  }).optional(),
  rolloutStrategy: z.object({
    strategy: z.enum(['canary', 'blue_green', 'rolling']),
    trafficWeight: z.number().min(0).max(100),
    targetTraffic: z.number().min(0).max(100),
    rolloutSteps: z.array(z.object({
      weight: z.number(),
      duration: z.number(), // in minutes
    })).optional(),
  }),
  healthCheck: z.object({
    enabled: z.boolean(),
    interval: z.number(), // in seconds
    timeout: z.number(),
    threshold: z.number(),
  }).optional(),
});

// AB Test Configuration
export const ABTestConfigSchema = z.object({
  name: z.string(),
  controlModel: z.string(),
  treatmentModel: z.string(),
  trafficSplit: z.number().min(0).max(100).default(50),
  minSampleSize: z.number().min(100),
  maxDuration: z.number().min(1), // in hours
  primaryMetric: z.string(),
  secondaryMetrics: z.array(z.string()).optional(),
  segmentation: z.object({
    enabled: z.boolean(),
    segments: z.array(z.string()),
  }).optional(),
});

// Drift Detection
export const DriftDetectionConfigSchema = z.object({
  modelId: z.string(),
  modelVersion: z.string(),
  driftType: z.enum(['DATA_DRIFT', 'CONCEPT_DRIFT', 'PREDICTION_DRIFT', 'PERFORMANCE_DRIFT']),
  metrics: z.array(z.string()),
  thresholds: z.record(z.number()),
  windowSize: z.number().min(100), // number of predictions
  alerting: z.object({
    enabled: z.boolean(),
    channels: z.array(z.enum(['email', 'slack', 'webhook'])),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  }).optional(),
});

// Privacy Configuration
export const PrivacyConfigSchema = z.object({
  method: z.enum(['differential_privacy', 'k_anonymity', 'l_diversity', 'federated_learning']),
  parameters: z.object({
    epsilon: z.number().optional(), // for differential privacy
    delta: z.number().optional(),
    k: z.number().optional(), // for k-anonymity
    l: z.number().optional(), // for l-diversity
    noiseScale: z.number().optional(),
    clippingThreshold: z.number().optional(),
  }),
  dataRetention: z.object({
    enabled: z.boolean(),
    retentionDays: z.number().min(1),
    anonymizationDays: z.number().min(1),
  }),
  gdprCompliant: z.boolean().default(true),
  rightToForget: z.boolean().default(true),
});

// Active Learning
export const ActiveLearningConfigSchema = z.object({
  strategy: z.enum(['uncertainty', 'diversity', 'hybrid', 'committee']),
  samplingMethod: z.enum(['random', 'stratified', 'cluster', 'adaptive']),
  batchSize: z.number().min(1).max(1000),
  uncertaintyThreshold: z.number().min(0).max(1),
  diversityWeight: z.number().min(0).max(1),
  budget: z.object({
    maxSamples: z.number().min(1),
    maxCost: z.number().min(0).optional(),
    timeLimit: z.number().min(1).optional(), // in hours
  }),
});

// Pipeline Events
export const PipelineEventSchema = z.object({
  eventType: z.enum([
    'FEEDBACK_RECEIVED',
    'TRAINING_STARTED',
    'TRAINING_COMPLETED',
    'EVALUATION_COMPLETED',
    'DRIFT_DETECTED',
    'DEPLOYMENT_INITIATED',
    'DEPLOYMENT_COMPLETED',
    'ROLLBACK_INITIATED',
    'EXPERIMENT_STARTED',
    'EXPERIMENT_COMPLETED',
  ]),
  payload: z.record(z.any()),
  timestamp: z.date(),
  source: z.string(),
  correlationId: z.string().optional(),
});

// Response Types
export interface FeedbackResponse {
  id: string;
  status: 'accepted' | 'processed' | 'rejected';
  message?: string;
}

export interface TrainingResponse {
  runId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  estimatedTime?: number;
  progress?: number;
  metrics?: Record<string, any>;
}

export interface EvaluationResponse {
  evaluationId: string;
  modelId: string;
  modelVersion: string;
  metrics: Record<string, any>;
  passed: boolean;
  recommendations?: string[];
}

export interface DeploymentResponse {
  deploymentId: string;
  status: string;
  url?: string;
  health?: string;
  rolloutProgress?: number;
}

export interface DriftReport {
  detected: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  driftType: string;
  metrics: Record<string, number>;
  recommendations: string[];
  timestamp: Date;
}

// Export validated types
export type UserFeedback = z.infer<typeof UserFeedbackSchema>;
export type ImplicitFeedback = z.infer<typeof ImplicitFeedbackSchema>;
export type TrainingConfig = z.infer<typeof TrainingConfigSchema>;
export type EvaluationMetrics = z.infer<typeof EvaluationMetricsSchema>;
export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;
export type ABTestConfig = z.infer<typeof ABTestConfigSchema>;
export type DriftDetectionConfig = z.infer<typeof DriftDetectionConfigSchema>;
export type PrivacyConfig = z.infer<typeof PrivacyConfigSchema>;
export type ActiveLearningConfig = z.infer<typeof ActiveLearningConfigSchema>;
export type PipelineEvent = z.infer<typeof PipelineEventSchema>;