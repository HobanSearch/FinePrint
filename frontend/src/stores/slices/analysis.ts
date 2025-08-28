import { StateCreator } from 'zustand'
import type { RootStore, AnalysisState, AnalysisActions } from '../types'
import type { DocumentAnalysisResponse } from '../../../../backend/shared/types/src'
import { apiClient } from '../../lib/api-client'
import { storage } from '../../lib/storage'

const ANALYSIS_CACHE_KEY = 'fineprint_analyses_cache'
const MAX_CACHED_ANALYSES = 50

type AnalysisSlice = AnalysisState & AnalysisActions

export const createAnalysisSlice: StateCreator<
  RootStore,
  [],
  [],
  AnalysisSlice
> = (set, get) => ({
  // Initial state
  analyses: {},
  currentAnalysis: null,
  isAnalyzing: false,
  uploadProgress: 0,
  analysisProgress: {},
  error: null,
  cache: {
    recentAnalyses: [],
    totalAnalyses: 0,
    criticalIssues: 0
  },

  // Actions
  startAnalysis: async (input: File | string, type: 'file' | 'text' | 'url'): Promise<string> => {
    set({ 
      isAnalyzing: true, 
      uploadProgress: 0, 
      error: null 
    })

    try {
      let analysisRequest: any = {}

      if (type === 'file') {
        const file = input as File
        const formData = new FormData()
        formData.append('file', file)
        formData.append('documentType', get().analysis.detectDocumentType(file.name))
        
        // Upload file with progress tracking
        const uploadResponse = await apiClient.post('/documents/upload', formData, {
          onUploadProgress: (progressEvent) => {
            const progress = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1)
            )
            set({ uploadProgress: progress })
          }
        })

        analysisRequest = {
          documentId: uploadResponse.data.id,
          filename: file.name
        }
      } else if (type === 'text') {
        analysisRequest = {
          content: input as string,
          documentType: 'TEXT'
        }
      } else if (type === 'url') {
        analysisRequest = {
          url: input as string,
          documentType: 'WEB_PAGE'
        }
      }

      // Start analysis
      const response = await apiClient.post<{ analysisId: string }>('/analysis/start', analysisRequest)
      const analysisId = response.data.analysisId

      // Initialize progress tracking
      set(state => ({
        analysisProgress: {
          ...state.analysisProgress,
          [analysisId]: 0
        }
      }))

      // Subscribe to progress updates via WebSocket
      get().websocket.subscribe([`analysis:${analysisId}`])

      get().notifications.addNotification({
        type: 'info',
        title: 'Analysis Started',
        message: 'Your document is being analyzed. You will be notified when it\'s complete.'
      })

      return analysisId

    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Analysis failed to start'
      
      set({
        isAnalyzing: false,
        uploadProgress: 0,
        error: errorMessage
      })

      get().notifications.addNotification({
        type: 'error',
        title: 'Analysis Failed',
        message: errorMessage
      })

      throw error
    }
  },

  setAnalysisProgress: (analysisId: string, progress: number) => {
    set(state => ({
      analysisProgress: {
        ...state.analysisProgress,
        [analysisId]: progress
      }
    }))

    // If analysis is complete, fetch the results
    if (progress >= 100) {
      get().analysis.fetchAnalysisResult(analysisId)
    }
  },

  setUploadProgress: (progress: number) => {
    set({ uploadProgress: progress })
  },

  addAnalysis: (analysis: DocumentAnalysisResponse) => {
    set(state => {
      const newAnalyses = {
        ...state.analyses,
        [analysis.id]: analysis
      }

      // Update cache stats
      const criticalFindings = analysis.findings.filter(f => f.severity === 'critical').length
      const newCache = {
        recentAnalyses: [analysis.id, ...state.cache.recentAnalyses.slice(0, 9)],
        totalAnalyses: state.cache.totalAnalyses + 1,
        criticalIssues: state.cache.criticalIssues + criticalFindings
      }

      return {
        analyses: newAnalyses,
        currentAnalysis: analysis,
        isAnalyzing: false,
        cache: newCache,
        analysisProgress: {
          ...state.analysisProgress,
          [analysis.id]: 100
        }
      }
    })

    // Cache to local storage
    get().analysis.cacheAnalyses()

    // Unsubscribe from progress updates
    get().websocket.unsubscribe([`analysis:${analysis.id}`])

    get().notifications.addNotification({
      type: 'success',
      title: 'Analysis Complete',
      message: `Found ${analysis.findings.length} findings with risk score of ${analysis.overallRiskScore}%`,
      action: {
        label: 'View Results',
        handler: () => get().analysis.setCurrentAnalysis(analysis)
      }
    })
  },

  updateAnalysis: (analysisId: string, updates: Partial<DocumentAnalysisResponse>) => {
    set(state => ({
      analyses: {
        ...state.analyses,
        [analysisId]: {
          ...state.analyses[analysisId],
          ...updates
        }
      }
    }))

    // Update current analysis if it's the one being updated
    const currentId = get().analysis.currentAnalysis?.id
    if (currentId === analysisId) {
      set(state => ({
        currentAnalysis: {
          ...state.currentAnalysis!,
          ...updates
        }
      }))
    }
  },

  setCurrentAnalysis: (analysis: DocumentAnalysisResponse | null) => {
    set({ currentAnalysis: analysis })
  },

  clearError: () => {
    set({ error: null })
  },

  loadAnalyses: async () => {
    try {
      // Load from cache first
      const cached = await storage.get(ANALYSIS_CACHE_KEY)
      if (cached?.analyses) {
        set({
          analyses: cached.analyses,
          cache: cached.cache
        })
      }

      // Fetch latest from server
      const response = await apiClient.get<{
        analyses: DocumentAnalysisResponse[]
        total: number
        criticalIssues: number
      }>('/analysis')

      const analysesMap = response.data.analyses.reduce((acc, analysis) => {
        acc[analysis.id] = analysis
        return acc
      }, {} as Record<string, DocumentAnalysisResponse>)

      set({
        analyses: analysesMap,
        cache: {
          recentAnalyses: response.data.analyses.slice(0, 10).map(a => a.id),
          totalAnalyses: response.data.total,
          criticalIssues: response.data.criticalIssues
        }
      })

      // Update cache
      get().analysis.cacheAnalyses()

    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to load analyses'
      set({ error: errorMessage })

      get().notifications.addNotification({
        type: 'error',
        title: 'Load Failed',
        message: errorMessage
      })
    }
  },

  deleteAnalysis: async (analysisId: string) => {
    try {
      await apiClient.delete(`/analysis/${analysisId}`)

      set(state => {
        const { [analysisId]: deleted, ...remainingAnalyses } = state.analyses
        
        return {
          analyses: remainingAnalyses,
          currentAnalysis: state.currentAnalysis?.id === analysisId ? null : state.currentAnalysis,
          cache: {
            ...state.cache,
            recentAnalyses: state.cache.recentAnalyses.filter(id => id !== analysisId),
            totalAnalyses: Math.max(0, state.cache.totalAnalyses - 1)
          }
        }
      })

      // Update cache
      get().analysis.cacheAnalyses()

      get().notifications.addNotification({
        type: 'success',
        title: 'Analysis Deleted',
        message: 'The analysis has been permanently deleted'
      })

    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to delete analysis'
      
      get().notifications.addNotification({
        type: 'error',
        title: 'Delete Failed',
        message: errorMessage
      })

      throw error
    }
  },

  // Helper methods (not exposed in interface)
  cacheAnalyses: async () => {
    const { analyses, cache } = get().analysis
    
    // Keep only recent analyses in cache to avoid storage bloat
    const recentAnalysesMap = cache.recentAnalyses.slice(0, MAX_CACHED_ANALYSES).reduce((acc, id) => {
      if (analyses[id]) {
        acc[id] = analyses[id]
      }
      return acc
    }, {} as Record<string, DocumentAnalysisResponse>)

    await storage.set(ANALYSIS_CACHE_KEY, {
      analyses: recentAnalysesMap,
      cache
    })
  },

  fetchAnalysisResult: async (analysisId: string) => {
    try {
      const response = await apiClient.get<DocumentAnalysisResponse>(`/analysis/${analysisId}`)
      get().analysis.addAnalysis(response.data)
    } catch (error) {
      console.error('Failed to fetch analysis result:', error)
    }
  },

  detectDocumentType: (filename: string): string => {
    const extension = filename.toLowerCase().split('.').pop()
    
    switch (extension) {
      case 'pdf':
        return 'PDF'
      case 'doc':
      case 'docx':
        return 'WORD'
      case 'txt':
        return 'TEXT'
      case 'html':
      case 'htm':
        return 'HTML'
      default:
        return 'UNKNOWN'
    }
  }
} as any) // Type assertion needed for helper methods