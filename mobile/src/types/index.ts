// Re-export backend shared types
export * from '@shared/index'

// Mobile-specific type extensions
import type { 
  UserProfile, 
  TokenPair,
  DocumentAnalysisResponse,
  AnalysisFindingResponse 
} from '@shared/index'

// Mobile Navigation Types
export type RootStackParamList = {
  Splash: undefined
  Onboarding: undefined
  Auth: undefined
  Main: undefined
  DocumentDetail: { documentId: string }
  AnalysisDetail: { analysisId: string }
  Settings: undefined
  Profile: undefined
}

export type MainTabParamList = {
  Dashboard: undefined
  Upload: undefined
  Analysis: undefined
  Documents: undefined
  Profile: undefined
}

export type AuthStackParamList = {
  Login: undefined
  Signup: undefined
  ForgotPassword: undefined
  ResetPassword: { token: string }
  BiometricSetup: undefined
}

// Mobile-specific auth types
export interface MobileAuthState extends Omit<AuthState, 'isLoading'> {
  user: UserProfile | null
  tokens: TokenPair | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  biometricEnabled: boolean
  biometricType: 'fingerprint' | 'face' | 'iris' | null
}

// Offline sync types
export interface OfflineAction {
  id: string
  type: string
  payload: any
  timestamp: number
  retryCount: number
  maxRetries: number
}

export interface SyncState {
  isOnline: boolean
  isSync: boolean
  pendingActions: OfflineAction[]
  lastSyncTime: number | null
  syncError: string | null
}

// Mobile document types
export interface MobileDocument {
  id: string
  name: string
  type: 'pdf' | 'image' | 'text' | 'url'
  size?: number
  uri: string
  localPath?: string
  mimeType: string
  uploadedAt: string
  isOffline: boolean
  needsSync: boolean
}

export interface DocumentUploadProgress {
  documentId: string
  progress: number
  status: 'preparing' | 'uploading' | 'processing' | 'complete' | 'error'
  error?: string
}

// Camera and OCR types
export interface OCRResult {
  text: string
  confidence: number
  blocks: OCRBlock[]
}

export interface OCRBlock {
  text: string
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
  confidence: number
}

export interface CameraCaptureResult {
  uri: string
  width: number
  height: number
  type: 'image'
  ocrResult?: OCRResult
}

// Push notification types
export interface PushNotificationData {
  type: 'analysis_complete' | 'document_shared' | 'reminder' | 'system'
  title: string
  body: string
  data?: Record<string, any>
  scheduled?: Date
}

export interface NotificationPreferences {
  enabled: boolean
  analysisComplete: boolean
  documentShared: boolean
  weeklyDigest: boolean
  systemUpdates: boolean
  quietHours: {
    enabled: boolean
    start: string // HH:mm format
    end: string // HH:mm format
  }
}

// Biometric authentication types
export interface BiometricAuthOptions {
  promptMessage: string
  cancelButtonText?: string
  fallbackLabel?: string
  disableDeviceFallback?: boolean
}

export interface BiometricAuthResult {
  success: boolean
  error?: string
  warning?: string
}

// App state and preferences
export interface MobilePreferences {
  theme: 'light' | 'dark' | 'system'
  language: string
  fontSize: 'small' | 'medium' | 'large'
  animations: boolean
  hapticFeedback: boolean
  autoUpload: boolean
  wifiOnly: boolean
  keepScreenOn: boolean
  notifications: NotificationPreferences
  security: {
    biometricLogin: boolean
    autoLockTime: number // minutes
    requireBiometricForActions: boolean
  }
  analytics: {
    allowCrashReporting: boolean
    allowUsageAnalytics: boolean
    allowPerformanceTracking: boolean
  }
}

// Error types
export interface MobileError {
  code: string
  message: string
  details?: any
  timestamp: number
  stack?: string
  userAgent?: string
  appVersion?: string
}

// Performance monitoring
export interface PerformanceMetric {
  name: string
  startTime: number
  endTime: number
  duration: number
  metadata?: Record<string, any>
}

// Analytics events
export interface AnalyticsEvent {
  name: string
  properties?: Record<string, any>
  timestamp: number
  userId?: string
  sessionId: string
}

// Deep linking
export interface DeepLinkData {
  url: string
  path: string
  params: Record<string, string>
  handled: boolean
}

// Background task types
export interface BackgroundTask {
  id: string
  type: 'sync' | 'upload' | 'analysis' | 'cleanup'
  payload: any
  scheduled: Date
  completed: boolean
  error?: string
}

// Device info
export interface DeviceInfo {
  platform: 'ios' | 'android'
  version: string
  model: string
  manufacturer: string
  isTablet: boolean
  hasNotch: boolean
  screenDimensions: {
    width: number
    height: number
  }
  supportedBiometrics: Array<'fingerprint' | 'face' | 'iris'>
}

// Shared store types adapted for mobile
export interface AuthState {
  user: UserProfile | null
  tokens: TokenPair | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

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