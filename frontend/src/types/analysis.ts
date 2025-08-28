export interface DocumentAnalysis {
  id: string
  documentId: string
  documentType: DocumentType
  overallScore: number
  analysisDate: string
  processingTime: number
  summary: string
  findings: Finding[]
  recommendations: Recommendation[]
  metadata: DocumentMetadata
}

export interface Finding {
  id: string
  category: PatternCategory
  severity: SeverityLevel
  title: string
  description: string
  explanation: string
  impact: string
  relevantClause: string
  sourceText: string
  location: {
    section?: string
    paragraph?: number
    startChar?: number
    endChar?: number
  }
  confidence: number
  tags: string[]
}

export interface Recommendation {
  id: string
  type: ActionType
  priority: Priority
  title: string
  description: string
  actionable: boolean
  templateAvailable: boolean
  estimatedTime: string
  relatedFindings: string[]
  steps?: ActionStep[]
}

export interface ActionStep {
  id: string
  order: number
  title: string
  description: string
  completed: boolean
  url?: string
  template?: string
}

export interface DocumentMetadata {
  fileName?: string
  fileSize?: number
  fileType: string
  uploadMethod: UploadMethod
  language: string
  wordCount: number
  readingTime: number
  lastModified?: string
  company?: CompanyInfo
}

export interface CompanyInfo {
  name: string
  domain?: string
  industry?: string
  location?: string
  size?: CompanySize
}

export type DocumentType = 
  | 'TOS' 
  | 'PRIVACY' 
  | 'EULA' 
  | 'COOKIE' 
  | 'DPA' 
  | 'SLA' 
  | 'OTHER'

export type PatternCategory = 
  | 'DATA_COLLECTION'
  | 'DATA_SHARING'
  | 'USER_RIGHTS'
  | 'LIABILITY'
  | 'TERMINATION'
  | 'PAYMENT'
  | 'CONTENT'
  | 'DISPUTE_RESOLUTION'
  | 'CHANGES'
  | 'SECURITY'

export type SeverityLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type ActionType = 
  | 'OPT_OUT'
  | 'DATA_REQUEST'
  | 'ACCOUNT_DELETION'
  | 'ARBITRATION_OPT_OUT'
  | 'UNSUBSCRIBE'
  | 'COMPLAINT'
  | 'REVIEW'

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export type UploadMethod = 
  | 'FILE_UPLOAD'
  | 'TEXT_PASTE'
  | 'URL_SCRAPE'
  | 'EMAIL_FORWARD'
  | 'BROWSER_EXTENSION'

export type CompanySize = 'STARTUP' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE'

export interface AnalysisFilters {
  severities?: SeverityLevel[]
  categories?: PatternCategory[]
  dateRange?: {
    start: string
    end: string
  }
  companies?: string[]
  documentTypes?: DocumentType[]
}

export interface AnalysisStats {
  totalAnalyses: number
  averageRiskScore: number
  criticalFindings: number
  completedActions: number
  timesSaved: number
  topCategories: Array<{
    category: PatternCategory
    count: number
    avgSeverity: number
  }>
  riskTrend: Array<{
    date: string
    score: number
    count: number
  }>
}