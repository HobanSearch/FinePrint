export interface MonitoringJobData {
  documentId: string;
  url: string;
  lastHash: string;
  userId: string;
  teamId?: string;
}

export interface DocumentChangeDetected {
  documentId: string;
  oldHash: string;
  newHash: string;
  changeType: 'minor' | 'major' | 'structural';
  changeSummary: string | null;
  significantChanges: string[];
  riskChange: number | null;
  userId: string;
  teamId?: string;
}

export interface MonitoringSchedule {
  documentId: string;
  frequency: number; // seconds
  nextRunAt: Date;
  isActive: boolean;
  retryCount: number;
  lastError: string | null;
}

export interface DocumentCrawlResult {
  url: string;
  success: boolean;
  content?: string;
  contentHash?: string;
  error?: string;
  statusCode?: number;
  redirectUrl?: string;
  crawledAt: Date;
}

export interface ChangeAnalysisRequest {
  oldContent: string;
  newContent: string;
  documentType: string;
  language?: string;
}

export interface ChangeAnalysisResponse {
  changeType: 'minor' | 'major' | 'structural';
  changeSummary: string;
  significantChanges: string[];
  riskChange: number; // -100 to +100
  addedSections: TextSection[];
  removedSections: TextSection[];
  modifiedSections: TextSection[];
}

export interface TextSection {
  content: string;
  startPosition: number;
  endPosition: number;
  category?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface MonitoringAlert {
  documentId: string;
  alertType: 'document_change' | 'new_risk' | 'monitoring_error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  metadata: Record<string, any>;
  userId: string;
  teamId?: string;
}

export interface CrawlerConfig {
  userAgent: string;
  timeout: number;
  retries: number;
  respectRobotsTxt: boolean;
  followRedirects: boolean;
  maxRedirects: number;
  headers: Record<string, string>;
}

export interface MonitoringStats {
  totalDocuments: number;
  activeMonitoring: number;
  totalChangesDetected: number;
  lastCrawlTime: Date | null;
  averageProcessingTime: number;
  errorRate: number;
  queueDepth: number;
}