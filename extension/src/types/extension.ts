// Extension-specific types
export interface ExtensionSettings {
  enabled: boolean;
  autoAnalyze: boolean;
  highlightFindings: boolean;
  showNotifications: boolean;
  analysisThreshold: 'low' | 'medium' | 'high';
  theme: 'light' | 'dark' | 'auto';
  apiEndpoint?: string;
  apiKey?: string;
}

export interface PageAnalysisState {
  url: string;
  isAnalyzing: boolean;
  isTermsPage: boolean;
  isPrivacyPage: boolean;
  documentType?: 'terms' | 'privacy' | 'eula' | 'cookie-policy' | 'other';
  analysisId?: string;
  riskScore?: number;
  lastAnalyzed?: number;
  findings: ExtensionFinding[];
  error?: string;
}

export interface ExtensionFinding {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidenceScore: number;
  textExcerpt: string;
  positionStart: number;
  positionEnd: number;
  recommendation: string;
  impactExplanation: string;
  element?: HTMLElement;
  highlighted?: boolean;
}

export interface ContextMenuAction {
  id: string;
  title: string;
  contexts: chrome.contextMenus.ContextType[];
  action: (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => void;
}

export interface NotificationData {
  id: string;
  type: 'analysis-complete' | 'high-risk-found' | 'error' | 'update-available';
  title: string;
  message: string;
  url?: string;
  iconUrl?: string;
  timestamp: number;
  priority: 'low' | 'normal' | 'high';
}

export interface AnalysisCache {
  [url: string]: {
    result: PageAnalysisState;
    timestamp: number;
    hash: string;
  };
}

export interface ExtensionMessage {
  type: 'ANALYZE_PAGE' | 'GET_ANALYSIS' | 'UPDATE_SETTINGS' | 'HIGHLIGHT_FINDING' | 'GET_PAGE_STATUS';
  payload?: any;
  tabId?: number;
}

export interface PageDetectionResult {
  isTermsPage: boolean;
  isPrivacyPage: boolean;
  documentType: string | null;
  confidence: number;
  indicators: string[];
  title?: string;
  content?: string;
}

export interface HighlightOptions {
  className: string;
  tooltip?: string;
  onClick?: () => void;
  attributes?: Record<string, string>;
}

export interface TooltipData {
  findingId: string;
  title: string;
  description: string;
  severity: string;
  recommendation: string;
  position: { x: number; y: number };
}

export interface AnalysisProgress {
  stage: 'detecting' | 'extracting' | 'analyzing' | 'highlighting' | 'complete';
  progress: number;
  message: string;
}

export interface StorageData {
  settings: ExtensionSettings;
  cache: AnalysisCache;
  lastSync: number;
  userId?: string;
  apiToken?: string;
}

// Bulk Analysis Types
export interface BulkAnalysisJob {
  id: string;
  type: 'session' | 'url-list' | 'monitored-sites';
  name?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  documents: SessionDocument[];
  results: BulkAnalysisResult[];
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  progress: BulkAnalysisProgress;
  settings: ExtensionSettings;
  error?: string;
}

export interface SessionDocument {
  url: string;
  title: string;
  tabId?: number;
  detected: PageDetectionResult;
  lastModified?: number;
}

export interface BulkAnalysisProgress {
  total: number;
  completed: number;
  failed: number;
  currentDocument: SessionDocument | null;
  estimatedTimeRemaining: number | null;
}

export interface BulkAnalysisResult {
  document: SessionDocument;
  analysis: PageAnalysisState;
  status: 'completed' | 'failed';
  error?: string;
  completedAt: number;
}

export interface QueueItem {
  id: string;
  priority: 'low' | 'normal' | 'high';
  timestamp: number;
}

// Site Monitoring Types
export interface MonitoredSite {
  id: string;
  url: string;
  title: string;
  documentType: string;
  isActive: boolean;
  checkInterval: number; // minutes
  lastChecked: number;
  lastModified: number;
  contentHash: string;
  notifications: boolean;
  riskThreshold: number;
  createdAt: number;
  lastAnalysis?: PageAnalysisState;
}

export interface SiteChange {
  siteId: string;
  url: string;
  changeType: 'content' | 'structure' | 'new-findings' | 'removed-findings';
  detectedAt: number;
  oldHash: string;
  newHash: string;
  summary: string;
  requiresReanalysis: boolean;
}

export interface MonitoringSchedule {
  siteId: string;
  nextCheck: number;
  intervalMinutes: number;
  retryCount: number;
}

// Enterprise Types
export interface EnterpriseConfig {
  organizationId: string;
  policies: OrganizationPolicy[];
  branding: BrandingConfig;
  ssoConfig?: SSOConfig;
  reportingConfig: ReportingConfig;
  userRoles: UserRole[];
}

export interface OrganizationPolicy {
  id: string;
  name: string;
  type: 'risk-threshold' | 'required-review' | 'blocked-clauses' | 'auto-approve';
  rules: PolicyRule[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PolicyRule {
  condition: string;
  action: 'block' | 'warn' | 'require-review' | 'auto-approve';
  parameters: Record<string, any>;
}

export interface BrandingConfig {
  organizationName: string;
  logo?: string;
  primaryColor: string;
  secondaryColor: string;
  customCSS?: string;
  hideFinePrintBranding: boolean;
}

export interface SSOConfig {
  provider: 'saml' | 'oidc' | 'azure-ad' | 'google-workspace';
  entityId: string;
  ssoUrl: string;
  certificate: string;
  attributeMappings: Record<string, string>;
  isActive: boolean;
}

export interface ReportingConfig {
  frequency: 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  includeMetrics: string[];
  format: 'pdf' | 'html' | 'json';
  customTemplates?: string[];
}

export interface UserRole {
  id: string;
  name: string;
  permissions: Permission[];
  users: string[];
}

export interface Permission {
  resource: string;
  actions: string[];
}

// Export and Integration Types
export interface ExportOptions {
  format: 'json' | 'csv' | 'pdf' | 'docx';
  includeFindings: boolean;
  includeRecommendations: boolean;
  includeMetadata: boolean;
  dateRange?: { start: number; end: number };
  filterBySeverity?: string[];
}

export interface IntegrationConfig {
  type: 'slack' | 'teams' | 'email' | 'webhook' | 'api';
  name: string;
  settings: Record<string, any>;
  isActive: boolean;
  triggerEvents: string[];
}

export interface SlackIntegration extends IntegrationConfig {
  type: 'slack';
  settings: {
    webhookUrl: string;
    channel: string;
    notifyOnHighRisk: boolean;
    notifyOnNewFindings: boolean;
  };
}

export interface TeamsIntegration extends IntegrationConfig {
  type: 'teams';
  settings: {
    webhookUrl: string;
    notifyOnHighRisk: boolean;
    includeSummary: boolean;
  };
}

export interface EmailIntegration extends IntegrationConfig {
  type: 'email';
  settings: {
    recipients: string[];
    subject: string;
    template: string;
    attachPDF: boolean;
  };
}

export interface WebhookIntegration extends IntegrationConfig {
  type: 'webhook';
  settings: {
    url: string;
    method: 'POST' | 'PUT';
    headers: Record<string, string>;
    authentication?: {
      type: 'bearer' | 'basic' | 'api-key';
      credentials: Record<string, string>;
    };
  };
}

// Cross-browser Support Types
export interface BrowserCapabilities {
  manifestVersion: 2 | 3;
  supportsServiceWorker: boolean;
  supportsDeclarativeNetRequest: boolean;
  supportsDynamicContentScripts: boolean;
  storageQuotaLimit: number;
}

export interface PlatformAdapter {
  browser: 'chrome' | 'firefox' | 'safari' | 'edge';
  version: string;
  capabilities: BrowserCapabilities;
  apiMappings: Record<string, string>;
}

// History and Analytics Types
export interface AnalysisHistory {
  entries: HistoryEntry[];
  totalEntries: number;
  oldestEntry: number;
  newestEntry: number;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  documentType: string;
  analysisDate: number;
  riskScore: number;
  findingsCount: number;
  highRiskFindings: number;
  jobId?: string; // If part of bulk analysis
  tags: string[];
}

export interface AnalyticsData {
  documentsAnalyzed: number;
  averageRiskScore: number;
  commonFindings: Array<{ category: string; count: number }>;
  riskTrends: Array<{ date: number; score: number }>;
  timeSpentAnalyzing: number;
  mostProblematicSites: Array<{ url: string; riskScore: number }>;
}