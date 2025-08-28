import type { 
  UserProfile, 
  TokenPair,
  DocumentAnalysisResponse,
  AnalysisFindingResponse 
} from '../../../backend/shared/types/src'

// Auth Store Types
export interface AuthState {
  user: UserProfile | null
  tokens: TokenPair | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

export interface AuthActions {
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>
  logout: () => void
  refreshToken: () => Promise<void>
  setUser: (user: UserProfile) => void
  setTokens: (tokens: TokenPair) => void
  clearError: () => void
  checkAuthStatus: () => Promise<void>
}

// Analysis Store Types
export interface AnalysisState {
  analyses: Record<string, DocumentAnalysisResponse>
  currentAnalysis: DocumentAnalysisResponse | null
  isAnalyzing: boolean
  uploadProgress: number
  analysisProgress: Record<string, number>
  error: string | null
  cache: {
    recentAnalyses: string[]
    totalAnalyses: number
    criticalIssues: number
  }
}

export interface AnalysisActions {
  startAnalysis: (file: File | string, type: 'file' | 'text' | 'url') => Promise<string>
  setAnalysisProgress: (analysisId: string, progress: number) => void
  setUploadProgress: (progress: number) => void
  addAnalysis: (analysis: DocumentAnalysisResponse) => void
  updateAnalysis: (analysisId: string, updates: Partial<DocumentAnalysisResponse>) => void
  setCurrentAnalysis: (analysis: DocumentAnalysisResponse | null) => void
  clearError: () => void
  loadAnalyses: () => Promise<void>
  deleteAnalysis: (analysisId: string) => Promise<void>
}

// Notification Store Types
export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  timestamp: Date
  read: boolean
  persistent?: boolean
  action?: {
    label: string
    handler: () => void
  }
}

export interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  isEnabled: boolean
}

export interface NotificationActions {
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  removeNotification: (id: string) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
  setEnabled: (enabled: boolean) => void
}

// User Preferences Store Types
export interface UserPreferencesState {
  theme: 'light' | 'dark' | 'system'
  language: string
  timezone: string
  notifications: {
    email: boolean
    push: boolean
    analysisComplete: boolean
    documentChanges: boolean
    weeklyDigest: boolean
  }
  dashboard: {
    defaultView: 'upload' | 'analysis' | 'actions'
    showQuickStats: boolean
    chartsType: 'line' | 'bar' | 'area'
  }
  analysis: {
    autoStart: boolean
    showConfidenceScores: boolean
    groupByCategory: boolean
    defaultSeverityFilter: 'all' | 'critical' | 'high' | 'medium' | 'low'
  }
  accessibility: {
    reducedMotion: boolean
    highContrast: boolean
    fontSize: 'small' | 'medium' | 'large'
    screenReader: boolean
  }
}

export interface UserPreferencesActions {
  updatePreferences: (updates: Partial<UserPreferencesState>) => void
  resetPreferences: () => void
  syncPreferences: () => Promise<void>
  setTheme: (theme: UserPreferencesState['theme']) => void
  setLanguage: (language: string) => void
}

// WebSocket Store Types
export interface WebSocketState {
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  lastActivity: Date | null
  reconnectAttempts: number
  subscriptions: string[]
}

export interface WebSocketActions {
  connect: () => void
  disconnect: () => void
  subscribe: (channels: string[]) => void
  unsubscribe: (channels: string[]) => void
  send: (type: string, payload: any) => void
  clearError: () => void
}

// Global App Store Types
export interface AppState {
  isInitialized: boolean
  version: string
  buildInfo: {
    version: string
    buildTime: string
    gitCommit: string
  }
  features: Record<string, boolean>
  maintenance: {
    isActive: boolean
    message?: string
    estimatedDuration?: string
  }
}

export interface AppActions {
  initialize: () => Promise<void>
  setFeatureFlag: (feature: string, enabled: boolean) => void
  setMaintenanceMode: (active: boolean, message?: string, duration?: string) => void
}

// Combined Store Type
export interface RootStore {
  auth: AuthState & AuthActions
  analysis: AnalysisState & AnalysisActions
  notifications: NotificationState & NotificationActions
  preferences: UserPreferencesState & UserPreferencesActions
  websocket: WebSocketState & WebSocketActions
  app: AppState & AppActions
  offline: import('./slices/offline').OfflineSlice
  enterprise: import('./slices/enterprise').EnterpriseState & import('./slices/enterprise').EnterpriseActions
}