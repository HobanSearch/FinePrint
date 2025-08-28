import { api } from './api'

// App Store API types
export interface AppSearchResult {
  id: string
  name: string
  developer: string
  category: string
  platform: 'ios' | 'android'
  bundle_id: string
  icon_url: string
  rating: number
  price: number
}

export interface AppMetadata extends AppSearchResult {
  description: string
  review_count: number
  version: string
  updated_at: Date
  terms_url?: string
  privacy_url?: string
  support_url?: string
}

export interface AppAnalysisRequest {
  analysisId: string
  appId: string
  platform: string
  documents: string[]
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

export interface AppAnalysisResult {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  result?: {
    riskScore: number
    findings: any[]
    recommendations: string[]
    summary: string
    appContext: {
      name: string
      developer: string
      platform: string
      category: string
      rating: number
      version: string
    }
    documentTypes: string[]
    analysisType: 'app_store_analysis'
  }
  serviceInfo?: any
  createdAt: string
  updatedAt: string
}

// App Store API client
export class AppStoreApiClient {
  // Search for apps across platforms
  async searchApps(query: string, platform?: 'ios' | 'android', limit: number = 10): Promise<{
    success: boolean
    data: AppSearchResult[]
    error?: string
  }> {
    try {
      const response = await api.apps.search(query, platform, limit)
      return {
        success: true,
        data: response.data.data
      }
    } catch (error: any) {
      return {
        success: false,
        data: [],
        error: error.message || 'Failed to search apps'
      }
    }
  }

  // Get detailed app metadata
  async getAppMetadata(appId: string, platform: 'ios' | 'android'): Promise<{
    success: boolean
    data?: AppMetadata
    error?: string
  }> {
    try {
      const response = await api.apps.getMetadata(appId, platform)
      return {
        success: true,
        data: response.data.data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get app metadata'
      }
    }
  }

  // Analyze app's legal documents
  async analyzeApp(appId: string, platform: 'ios' | 'android', documents: string[] = ['terms', 'privacy']): Promise<{
    success: boolean
    data?: AppAnalysisRequest
    error?: string
  }> {
    try {
      const response = await api.apps.analyze(appId, platform, documents)
      return {
        success: true,
        data: response.data.data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to start app analysis'
      }
    }
  }

  // Get app analysis results
  async getAppAnalysis(analysisId: string): Promise<{
    success: boolean
    data?: AppAnalysisResult
    error?: string
  }> {
    try {
      const response = await api.apps.getAnalysis(analysisId)
      return {
        success: true,
        data: response.data.data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get app analysis'
      }
    }
  }

  // Get popular apps
  async getPopularApps(platform?: 'ios' | 'android', limit: number = 50): Promise<{
    success: boolean
    data: AppMetadata[]
    error?: string
  }> {
    try {
      const response = await api.apps.getPopular(platform, limit)
      return {
        success: true,
        data: response.data.data
      }
    } catch (error: any) {
      return {
        success: false,
        data: [],
        error: error.message || 'Failed to get popular apps'
      }
    }
  }

  // Poll analysis status until completion
  async pollAnalysisStatus(
    analysisId: string, 
    onProgress?: (progress: number, status: string) => void,
    maxAttempts: number = 60, // 5 minutes with 5s intervals
    interval: number = 5000
  ): Promise<AppAnalysisResult | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await this.getAppAnalysis(analysisId)
        
        if (response.success && response.data) {
          const analysis = response.data
          
          // Call progress callback
          if (onProgress) {
            onProgress(analysis.progress, analysis.status)
          }

          // Check if completed or failed
          if (analysis.status === 'completed' || analysis.status === 'failed') {
            return analysis
          }

          // Wait before next poll
          if (attempt < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, interval))
          }
        } else {
          // API error, wait and retry
          await new Promise(resolve => setTimeout(resolve, interval))
        }
      } catch (error) {
        console.error('Error polling analysis status:', error)
        
        // Wait before retry
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, interval))
        }
      }
    }

    return null // Timeout
  }
}

// Create singleton instance
export const appStoreApi = new AppStoreApiClient()

// Convenience functions
export const searchApps = (query: string, platform?: 'ios' | 'android', limit?: number) =>
  appStoreApi.searchApps(query, platform, limit)

export const getAppMetadata = (appId: string, platform: 'ios' | 'android') =>
  appStoreApi.getAppMetadata(appId, platform)

export const analyzeApp = (appId: string, platform: 'ios' | 'android', documents?: string[]) =>
  appStoreApi.analyzeApp(appId, platform, documents)

export const getAppAnalysis = (analysisId: string) =>
  appStoreApi.getAppAnalysis(analysisId)

export const getPopularApps = (platform?: 'ios' | 'android', limit?: number) =>
  appStoreApi.getPopularApps(platform, limit)

export const pollAnalysisStatus = (
  analysisId: string, 
  onProgress?: (progress: number, status: string) => void,
  maxAttempts?: number,
  interval?: number
) => appStoreApi.pollAnalysisStatus(analysisId, onProgress, maxAttempts, interval)