export interface Website {
  id: string;
  name: string;
  domain: string;
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  rank: number;
  category: string;
  lastChecked?: Date;
  enabled: boolean;
}

export interface PrivacyScore {
  id: string;
  websiteId: string;
  overallScore: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: ScoreBreakdown;
  patternDetections: PatternDetection[];
  calculatedAt: Date;
  documentHashes: {
    privacyPolicy?: string;
    termsOfService?: string;
  };
  trending: 'improving' | 'declining' | 'stable';
  previousScore?: number;
}

export interface ScoreBreakdown {
  patternDetection: number; // 50% weight
  dataCollection: number; // 20% weight
  userRights: number; // 20% weight
  transparency: number; // 10% weight
}

export interface PatternDetection {
  patternId: string;
  patternName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location: string;
  impact: number; // Impact on score (0-100)
}

export interface DocumentSnapshot {
  id: string;
  websiteId: string;
  documentType: 'privacy_policy' | 'terms_of_service';
  content: string;
  hash: string;
  fetchedAt: Date;
  changes?: DocumentChange[];
}

export interface DocumentChange {
  id: string;
  documentId: string;
  changeType: 'added' | 'removed' | 'modified';
  before?: string;
  after?: string;
  detectedAt: Date;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface ScoringJob {
  id: string;
  websiteId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  attempts: number;
  result?: PrivacyScore;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface ScoreCard {
  websiteId: string;
  websiteName: string;
  score: number;
  grade: string;
  imageUrl: string;
  shareableUrl: string;
  generatedAt: Date;
}

export interface ScoreTrend {
  websiteId: string;
  scores: {
    date: Date;
    score: number;
    grade: string;
  }[];
  averageScore: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface WebhookNotification {
  id: string;
  websiteId: string;
  eventType: 'score_changed' | 'document_updated' | 'new_pattern_detected';
  payload: any;
  webhookUrl: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastAttempt?: Date;
}