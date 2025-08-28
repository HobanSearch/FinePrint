import type { StateCreator } from 'zustand'
import { apiClient } from '@/services/api'
import type { DocumentAnalysisResponse, AnalysisState, MobileDocument } from '@/types'

export interface AnalysisSlice extends AnalysisState {
  recentAnalyses: string[]
  // Actions
  startAnalysis: (file: File | MobileDocument | string, type: 'file' | 'text' | 'url' | 'mobile_document') => Promise<string>
  setAnalysisProgress: (analysisId: string, progress: number) => void
  setUploadProgress: (progress: number) => void
  addAnalysis: (analysis: DocumentAnalysisResponse) => void
  updateAnalysis: (analysisId: string, updates: Partial<DocumentAnalysisResponse>) => void
  setCurrentAnalysis: (analysis: DocumentAnalysisResponse | null) => void
  clearError: () => void
  loadAnalyses: () => Promise<void>
  deleteAnalysis: (analysisId: string) => Promise<void>
  clearAnalyses: () => void
  exportAnalysis: (analysisId: string, format: 'pdf' | 'json' | 'csv') => Promise<Blob>
  shareAnalysis: (analysisId: string) => Promise<string>
}

export const createAnalysisSlice: StateCreator<
  AnalysisSlice,
  [['zustand/immer', never], ['zustand/devtools', never], ['zustand/subscribeWithSelector', never]],
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
  recentAnalyses: [],
  cache: {
    recentAnalyses: [],
    totalAnalyses: 0,
    criticalIssues: 0
  },

  // Actions
  startAnalysis: async (file, type) => {
    set(state => {
      state.isAnalyzing = true
      state.error = null
      state.uploadProgress = 0
    })

    try {
      let analysisPayload: any = {}
      let analysisId: string

      // Prepare analysis payload based on type
      switch (type) {
        case 'file':
          if (file instanceof File) {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('type', 'file')
            
            const uploadResponse = await apiClient.post('/documents/upload', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
              onUploadProgress: (progressEvent) => {
                if (progressEvent.total) {
                  const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                  set(state => {
                    state.uploadProgress = progress
                  })
                }
              }
            })
            
            analysisPayload = {
              documentId: uploadResponse.data.documentId,
              type: 'file'
            }
          }
          break

        case 'mobile_document':
          if (typeof file === 'object' && 'id' in file) {
            const mobileDoc = file as MobileDocument
            
            // If document needs to be uploaded first
            if (!mobileDoc.id || mobileDoc.needsSync) {
              const formData = new FormData()
              formData.append('file', {
                uri: mobileDoc.uri,
                type: mobileDoc.mimeType,
                name: mobileDoc.name
              } as any)
              formData.append('type', 'mobile_file')
              
              const uploadResponse = await apiClient.post('/documents/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                  if (progressEvent.total) {
                    const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                    set(state => {
                      state.uploadProgress = progress
                    })
                  }
                }
              })
              
              analysisPayload = {
                documentId: uploadResponse.data.documentId,
                type: 'file'
              }
            } else {
              analysisPayload = {
                documentId: mobileDoc.id,
                type: 'file'
              }
            }
          }
          break

        case 'text':
          analysisPayload = {
            text: file as string,
            type: 'text'
          }
          break

        case 'url':
          analysisPayload = {
            url: file as string,
            type: 'url'
          }
          break

        default:
          throw new Error('Invalid analysis type')
      }

      // Start analysis
      const analysisResponse = await apiClient.post('/analysis/start', analysisPayload)
      analysisId = analysisResponse.data.analysisId

      // Add initial analysis entry
      const initialAnalysis: DocumentAnalysisResponse = {
        id: analysisId,
        status: 'processing',
        createdAt: new Date().toISOString(),
        ...analysisResponse.data
      }

      set(state => {
        state.analyses[analysisId] = initialAnalysis
        state.currentAnalysis = initialAnalysis
        state.analysisProgress[analysisId] = 0
        state.recentAnalyses.unshift(analysisId)
        state.cache.totalAnalyses += 1
        
        // Keep only recent 10 analyses
        if (state.recentAnalyses.length > 10) {
          state.recentAnalyses = state.recentAnalyses.slice(0, 10)
        }
      })

      return analysisId

    } catch (error: any) {
      set(state => {
        state.isAnalyzing = false
        state.error = error.message || 'Analysis failed to start'
        state.uploadProgress = 0
      })
      throw error
    }
  },

  setAnalysisProgress: (analysisId: string, progress: number) => {
    set(state => {
      state.analysisProgress[analysisId] = progress
      
      // Update analysis status based on progress
      if (state.analyses[analysisId]) {
        if (progress >= 100) {
          state.analyses[analysisId].status = 'completed'
          state.isAnalyzing = false
        } else if (progress > 0) {
          state.analyses[analysisId].status = 'processing'
        }
      }
    })
  },

  setUploadProgress: (progress: number) => {
    set(state => {
      state.uploadProgress = progress
    })
  },

  addAnalysis: (analysis: DocumentAnalysisResponse) => {
    set(state => {
      state.analyses[analysis.id] = analysis
      
      // Update recent analyses
      const existingIndex = state.recentAnalyses.indexOf(analysis.id)
      if (existingIndex > -1) {
        state.recentAnalyses.splice(existingIndex, 1)
      }
      state.recentAnalyses.unshift(analysis.id)
      
      // Keep only recent 10 analyses
      if (state.recentAnalyses.length > 10) {
        state.recentAnalyses = state.recentAnalyses.slice(0, 10)
      }

      // Update cache
      state.cache.totalAnalyses = Object.keys(state.analyses).length
      state.cache.criticalIssues = Object.values(state.analyses)
        .reduce((count, analysis) => {
          if (analysis.findings) {
            return count + analysis.findings.filter(f => f.severity === 'critical').length
          }
          return count
        }, 0)
    })
  },

  updateAnalysis: (analysisId: string, updates: Partial<DocumentAnalysisResponse>) => {
    set(state => {
      if (state.analyses[analysisId]) {
        state.analyses[analysisId] = { ...state.analyses[analysisId], ...updates }
        
        // Update current analysis if it's the same
        if (state.currentAnalysis?.id === analysisId) {
          state.currentAnalysis = state.analyses[analysisId]
        }
      }
    })
  },

  setCurrentAnalysis: (analysis: DocumentAnalysisResponse | null) => {
    set(state => {
      state.currentAnalysis = analysis
    })
  },

  clearError: () => {
    set(state => {
      state.error = null
    })
  },

  loadAnalyses: async () => {
    try {
      const response = await apiClient.get('/analysis', {
        params: {
          limit: 50,
          sort: 'createdAt',
          order: 'desc'
        }
      })

      const analyses = response.data.analyses || []

      set(state => {
        // Clear existing analyses
        state.analyses = {}
        state.recentAnalyses = []

        // Add loaded analyses
        analyses.forEach((analysis: DocumentAnalysisResponse) => {
          state.analyses[analysis.id] = analysis
          state.recentAnalyses.push(analysis.id)
        })

        // Update cache
        state.cache.totalAnalyses = analyses.length
        state.cache.criticalIssues = analyses.reduce((count, analysis) => {
          if (analysis.findings) {
            return count + analysis.findings.filter(f => f.severity === 'critical').length
          }
          return count
        }, 0)
      })

    } catch (error: any) {
      set(state => {
        state.error = error.message || 'Failed to load analyses'
      })
      throw error
    }
  },

  deleteAnalysis: async (analysisId: string) => {
    try {
      await apiClient.delete(`/analysis/${analysisId}`)

      set(state => {
        // Remove from analyses
        delete state.analyses[analysisId]
        
        // Remove from recent analyses
        const index = state.recentAnalyses.indexOf(analysisId)
        if (index > -1) {
          state.recentAnalyses.splice(index, 1)
        }

        // Clear current analysis if it's the deleted one
        if (state.currentAnalysis?.id === analysisId) {
          state.currentAnalysis = null
        }

        // Remove from progress tracking
        delete state.analysisProgress[analysisId]

        // Update cache
        state.cache.totalAnalyses = Object.keys(state.analyses).length
        state.cache.criticalIssues = Object.values(state.analyses)
          .reduce((count, analysis) => {
            if (analysis.findings) {
              return count + analysis.findings.filter(f => f.severity === 'critical').length
            }
            return count
          }, 0)
      })

    } catch (error: any) {
      set(state => {
        state.error = error.message || 'Failed to delete analysis'
      })
      throw error
    }
  },

  clearAnalyses: () => {
    set(state => {
      state.analyses = {}
      state.currentAnalysis = null
      state.recentAnalyses = []
      state.analysisProgress = {}
      state.cache = {
        recentAnalyses: [],
        totalAnalyses: 0,
        criticalIssues: 0
      }
    })
  },

  exportAnalysis: async (analysisId: string, format: 'pdf' | 'json' | 'csv') => {
    try {
      const response = await apiClient.get(`/analysis/${analysisId}/export`, {
        params: { format },
        responseType: 'blob'
      })

      return response.data
    } catch (error: any) {
      set(state => {
        state.error = error.message || 'Failed to export analysis'
      })
      throw error
    }
  },

  shareAnalysis: async (analysisId: string) => {
    try {
      const response = await apiClient.post(`/analysis/${analysisId}/share`)
      return response.data.shareUrl
    } catch (error: any) {
      set(state => {
        state.error = error.message || 'Failed to share analysis'
      })
      throw error
    }
  }
})