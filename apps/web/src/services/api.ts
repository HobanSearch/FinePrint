import axios, { AxiosInstance, AxiosResponse } from 'axios'

// Types
interface LoginCredentials {
  email: string
  password: string
}

interface LoginResponse {
  token: string
  user: {
    id: string
    email: string
    name?: string
  }
}

interface AnalysisJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  documentId?: string
  text?: string
  url?: string
  createdAt: string
  updatedAt: string
  result?: AnalysisResult
}

interface AnalysisResult {
  riskScore: number
  totalClauses: number
  problematicClauses: number
  findings: Array<{
    id: string
    type: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    title: string
    description: string
    suggestion: string
    clauseText: string
    position: number
  }>
  recommendations: string[]
  summary: string
}

interface DocumentUploadResponse {
  documentId: string
  filename: string
  size: number
  contentType: string
  uploadedAt: string
}

interface TrackedService {
  id: string
  name: string
  domain: string
  url: string
  risk_score: number
  last_analyzed: string
  last_changed?: string
  is_active: boolean
  notification_enabled: boolean
  created_at: string
  updated_at: string
}

interface ServiceChange {
  id: string
  old_risk_score: number
  new_risk_score: number
  change_summary: string
  detected_at: string
  notified_at?: string
}

class APIClient {
  private client: AxiosInstance
  private token: string | null = null

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Load token from localStorage
    this.token = localStorage.getItem('fineprintai_token')
    if (this.token) {
      this.setAuthHeader(this.token)
    }

    // Response interceptor for handling auth errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.logout()
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  private setAuthHeader(token: string) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`
  }

  private removeAuthHeader() {
    delete this.client.defaults.headers.common['Authorization']
  }

  // Authentication
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response: AxiosResponse<LoginResponse> = await this.client.post('/auth/login', credentials)
    const { token } = response.data
    
    this.token = token
    localStorage.setItem('fineprintai_token', token)
    this.setAuthHeader(token)
    
    return response.data
  }

  logout() {
    this.token = null
    localStorage.removeItem('fineprintai_token')
    this.removeAuthHeader()
  }

  isAuthenticated(): boolean {
    return !!this.token
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.client.get('/health')
    return response.data
  }

  // Document upload
  async uploadDocument(file: File): Promise<DocumentUploadResponse> {
    const formData = new FormData()
    formData.append('document', file)

    const response: AxiosResponse<DocumentUploadResponse> = await this.client.post(
      '/documents/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    return response.data
  }

  // Analysis
  async startAnalysis(data: {
    documentId?: string
    text?: string
    url?: string
    documentType?: 'tos' | 'privacy' | 'contract' | 'agreement'
  }): Promise<AnalysisJob> {
    // Map frontend fields to API fields and add required documentType
    const apiData: any = {}
    
    if (data.text) {
      apiData.documentText = data.text
      apiData.documentType = data.documentType || 'tos' // Default to Terms of Service
    } else if (data.url) {
      apiData.documentUrl = data.url
      apiData.documentType = data.documentType || 'tos' // Default to Terms of Service
    } else if (data.documentId) {
      // Note: Current API doesn't support documentId, this is for future compatibility
      throw new Error('Document ID analysis not supported yet. Please use text or URL analysis.')
    }
    
    if (!apiData.documentText && !apiData.documentUrl) {
      throw new Error('Either text or URL must be provided for analysis')
    }
    
    const response: AxiosResponse<AnalysisJob> = await this.client.post('/analysis', apiData)
    return response.data
  }

  async getAnalysis(id: string): Promise<AnalysisJob> {
    const response = await this.client.get(`/analysis/${id}`)
    const data = response.data
    
    // Map API response to frontend format
    const mappedData: AnalysisJob = {
      id: data.id,
      status: data.status,
      progress: data.progress || 0,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      result: data.overallRiskScore ? {
        riskScore: data.overallRiskScore,
        totalClauses: data.findings?.length * 3 || 5, // Estimated total clauses
        problematicClauses: data.findings?.length || 0,
        findings: data.findings?.map((f: any) => ({
          id: f.id,
          type: f.category,
          severity: f.severity,
          title: f.title,
          description: f.description,
          suggestion: `Consider reviewing this ${f.category} clause carefully.`,
          clauseText: `"${f.description}"`, // Use description as clause text for now
          position: 1
        })) || [],
        recommendations: data.recommendations || [],
        summary: data.executiveSummary || 'Analysis in progress...'
      } : undefined
    }
    
    return mappedData
  }

  async getAnalysisList(page = 1, limit = 10): Promise<{
    analyses: AnalysisJob[]
    total: number
    page: number
    limit: number
  }> {
    const response = await this.client.get('/analysis', {
      params: { page, limit },
    })
    return response.data
  }

  // AI Generation (for testing)
  async generateText(prompt: string): Promise<{ text: string }> {
    const response = await this.client.post('/ollama/generate', { prompt })
    return response.data
  }

  // Service tracking
  async getTrackedServices(page = 1, limit = 20): Promise<{
    services: TrackedService[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }> {
    const response = await this.client.get('/services', {
      params: { page, limit }
    })
    return response.data
  }

  async addTrackedService(data: {
    name: string
    domain: string
    url: string
    notification_enabled?: boolean
  }): Promise<{ id: string; message: string }> {
    const response = await this.client.post('/services', data)
    return response.data
  }

  async updateTrackedService(id: string, updates: {
    notification_enabled?: boolean
    is_active?: boolean
  }): Promise<{ message: string }> {
    const response = await this.client.put(`/services/${id}`, updates)
    return response.data
  }

  async deleteTrackedService(id: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/services/${id}`)
    return response.data
  }

  async getServiceChanges(serviceId: string): Promise<{
    changes: ServiceChange[]
  }> {
    const response = await this.client.get(`/services/${serviceId}/changes`)
    return response.data
  }
}

// Export singleton instance
export const apiClient = new APIClient()
export default apiClient

// Export types
export type {
  LoginCredentials,
  LoginResponse,
  AnalysisJob,
  AnalysisResult,
  DocumentUploadResponse,
  TrackedService,
  ServiceChange,
}