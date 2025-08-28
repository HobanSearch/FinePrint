// Re-export shared types from the main app
export * from './extension';

// Import types from the main application (when available)
export interface DocumentAnalysisRequest {
  content?: string;
  url?: string;
  fileBuffer?: Buffer;
  filename?: string;
  documentType?: string;
  language?: string;
  userId: string;
  teamId?: string;
}

export interface DocumentAnalysisResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  documentId: string;
  overallRiskScore: number | null;
  executiveSummary: string | null;
  keyFindings: string[];
  recommendations: string[];
  findings: AnalysisFindingResponse[];
  processingTimeMs: number | null;
  modelUsed: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface AnalysisFindingResponse {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidenceScore: number | null;
  textExcerpt: string | null;
  positionStart: number | null;
  positionEnd: number | null;
  recommendation: string | null;
  impactExplanation: string | null;
}

export interface PatternMatch {
  patternId: string;
  category: string;
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  matches: TextMatch[];
}

export interface TextMatch {
  text: string;
  start: number;
  end: number;
  context: string;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: number;
    requestId: string;
    version: string;
  };
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: any;
}