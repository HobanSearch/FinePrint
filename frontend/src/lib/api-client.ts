import axios, { 
  AxiosResponse, 
  AxiosError, 
  InternalAxiosRequestConfig,
  AxiosRequestConfig 
} from 'axios'
import { storage } from './storage'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'
const AUTH_STORAGE_KEY = 'fineprint_auth'

// Create axios instance
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      // Get stored auth data
      const authData = await storage.get(AUTH_STORAGE_KEY)
      
      if (authData?.tokens?.accessToken) {
        config.headers.Authorization = `Bearer ${authData.tokens.accessToken}`
      }

      // Add request ID for tracking
      config.headers['X-Request-ID'] = crypto.randomUUID()

      // Add timestamp
      config.headers['X-Request-Time'] = new Date().toISOString()

      return config
    } catch (error) {
      console.error('Request interceptor error:', error)
      return config
    }
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling and token refresh
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Handle 401 Unauthorized - Token expired
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        // Get stored auth data
        const authData = await storage.get(AUTH_STORAGE_KEY)
        
        if (authData?.tokens?.refreshToken) {
          // Attempt to refresh token
          const refreshResponse = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken: authData.tokens.refreshToken
          })

          const newTokens = refreshResponse.data

          // Update stored tokens
          await storage.set(AUTH_STORAGE_KEY, {
            ...authData,
            tokens: newTokens
          })

          // Update the original request with new token
          originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`

          // Retry the original request
          return apiClient(originalRequest)
        }
      } catch (refreshError) {
        // Refresh failed - clear auth data and redirect to login
        await storage.remove(AUTH_STORAGE_KEY)
        
        // Emit custom event for auth failure
        window.dispatchEvent(new CustomEvent('auth:expired'))
        
        return Promise.reject(refreshError)
      }
    }

    // Handle other errors
    const enhancedError = enhanceError(error)
    return Promise.reject(enhancedError)
  }
)

// Enhanced error handling
interface ApiError extends Error {
  status?: number
  code?: string
  details?: any
  requestId?: string
}

function enhanceError(error: AxiosError): ApiError {
  const enhanced: ApiError = new Error(error.message)
  
  enhanced.name = 'ApiError'
  enhanced.status = error.response?.status
  enhanced.requestId = error.config?.headers?.['X-Request-ID'] as string
  
  if (error.response?.data) {
    const data = error.response.data as any
    enhanced.message = data.message || data.error || error.message
    enhanced.code = data.code
    enhanced.details = data.details
  }

  // Add context based on status code
  switch (error.response?.status) {
    case 400:
      enhanced.message = enhanced.message || 'Invalid request. Please check your input.'
      break
    case 401:
      enhanced.message = enhanced.message || 'Authentication required. Please log in.'
      break
    case 403:
      enhanced.message = enhanced.message || 'Access denied. You don\'t have permission to perform this action.'
      break
    case 404:
      enhanced.message = enhanced.message || 'The requested resource was not found.'
      break
    case 409:
      enhanced.message = enhanced.message || 'Conflict. The resource already exists or is in use.'
      break
    case 429:
      enhanced.message = enhanced.message || 'Too many requests. Please wait and try again.'
      break
    case 500:
      enhanced.message = enhanced.message || 'Internal server error. Please try again later.'
      break
    case 502:
    case 503:
    case 504:
      enhanced.message = enhanced.message || 'Service temporarily unavailable. Please try again later.'
      break
    default:
      if (!error.response) {
        enhanced.message = 'Network error. Please check your connection.'
      }
  }

  return enhanced
}

// Retry helper for critical requests
export async function retryRequest<T>(
  requestFn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn()
    } catch (error) {
      lastError = error as Error
      
      // Don't retry on client errors (4xx)
      if (error instanceof Error && 'status' in error) {
        const status = (error as any).status
        if (status >= 400 && status < 500) {
          throw error
        }
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError!
}

// Specialized API methods
export const api = {
  // Auth endpoints
  auth: {
    login: (email: string, password: string, rememberMe?: boolean) =>
      apiClient.post('/auth/login', { email, password, rememberMe }),
    
    logout: (refreshToken: string) =>
      apiClient.post('/auth/logout', { refreshToken }),
    
    refresh: (refreshToken: string) =>
      apiClient.post('/auth/refresh', { refreshToken }),
    
    signup: (email: string, password: string, displayName?: string) =>
      apiClient.post('/auth/signup', { email, password, displayName, acceptTerms: true }),
    
    forgotPassword: (email: string) =>
      apiClient.post('/auth/forgot-password', { email }),
    
    resetPassword: (token: string, newPassword: string) =>
      apiClient.post('/auth/reset-password', { token, newPassword }),
    
    changePassword: (currentPassword: string, newPassword: string) =>
      apiClient.post('/auth/change-password', { currentPassword, newPassword }),
    
    verifyEmail: (token: string) =>
      apiClient.post('/auth/verify-email', { token })
  },

  // User endpoints
  user: {
    profile: () => apiClient.get('/user/profile'),
    
    updateProfile: (data: any) =>
      apiClient.put('/user/profile', data),
    
    preferences: () => apiClient.get('/user/preferences'),
    
    updatePreferences: (preferences: any) =>
      apiClient.put('/user/preferences', preferences),
    
    resetPreferences: () =>
      apiClient.post('/user/preferences/reset'),
    
    sessions: () => apiClient.get('/user/sessions'),
    
    revokeSessions: (sessionIds: string[]) =>
      apiClient.post('/user/sessions/revoke', { sessionIds }),
    
    deleteAccount: () => apiClient.delete('/user/account')
  },

  // Document endpoints
  documents: {
    list: (params?: any) => apiClient.get('/documents', { params }),
    
    get: (id: string) => apiClient.get(`/documents/${id}`),
    
    upload: (formData: FormData, config?: AxiosRequestConfig) =>
      apiClient.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        ...config
      }),
    
    delete: (id: string) => apiClient.delete(`/documents/${id}`),
    
    update: (id: string, data: any) =>
      apiClient.put(`/documents/${id}`, data)
  },

  // Analysis endpoints
  analysis: {
    list: (params?: any) => apiClient.get('/analysis', { params }),
    
    get: (id: string) => apiClient.get(`/analysis/${id}`),
    
    start: (data: any) => apiClient.post('/analysis/start', data),
    
    delete: (id: string) => apiClient.delete(`/analysis/${id}`),
    
    export: (id: string, format: 'pdf' | 'json' | 'csv') =>
      apiClient.get(`/analysis/${id}/export`, {
        params: { format },
        responseType: 'blob'
      })
  },

  // System endpoints
  system: {
    status: () => apiClient.get('/system/status'),
    
    health: () => apiClient.get('/health'),
    
    version: () => apiClient.get('/system/version'),
    
    features: () => apiClient.get('/system/features')
  },

  // Leaderboard endpoints
  leaderboard: {
    popularWebsites: (limit?: number) =>
      apiClient.get('/leaderboard/popular-websites', { params: { limit } }),
    
    topSafe: (limit?: number) =>
      apiClient.get('/leaderboard/top-safe', { params: { limit } }),
    
    worstOffenders: (limit?: number) =>
      apiClient.get('/leaderboard/worst-offenders', { params: { limit } }),
    
    categories: () => apiClient.get('/leaderboard/categories'),
    
    categoryLeaderboard: (category: string, type?: 'best' | 'worst', limit?: number) =>
      apiClient.get(`/leaderboard/category/${encodeURIComponent(category)}`, { 
        params: { type, limit } 
      }),
    
    trending: (limit?: number) =>
      apiClient.get('/leaderboard/trending', { params: { limit } }),
    
    stats: () => apiClient.get('/leaderboard/stats'),
    
    analyzeWebsite: (domain: string) =>
      apiClient.post(`/leaderboard/analyze/${encodeURIComponent(domain)}`),
    
    updateDaily: () =>
      apiClient.post('/leaderboard/update')
  }
}

// Upload helper with progress tracking
export async function uploadWithProgress(
  file: File,
  onProgress?: (progress: number) => void
): Promise<AxiosResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return apiClient.post('/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        )
        onProgress(progress)
      }
    }
  })
}

// WebSocket URL helper
export function getWebSocketUrl(): string {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsHost = import.meta.env.VITE_WS_HOST || window.location.host
  return `${wsProtocol}//${wsHost}/ws`
}

export default apiClient