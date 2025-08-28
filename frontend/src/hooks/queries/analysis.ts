import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../../lib/api-client'
import { queryKeys, cacheUtils } from '../../lib/query-client'
import { useStore } from '../../stores'

// Get analysis list with infinite scroll
export function useAnalysisList(filters?: any) {
  const isAuthenticated = useStore(state => state.auth.isAuthenticated)

  return useInfiniteQuery({
    queryKey: queryKeys.analysis.list(filters),
    queryFn: async ({ pageParam = 1 }) => {
      const response = await api.analysis.list({
        page: pageParam,
        limit: 20,
        ...filters
      })
      return response.data
    },
    enabled: isAuthenticated,
    initialPageParam: 1,
    getNextPageParam: (lastPage: any) => {
      return lastPage.hasMore ? lastPage.page + 1 : undefined
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000 // 10 minutes
  })
}

// Get analysis detail
export function useAnalysis(analysisId: string) {
  const isAuthenticated = useStore(state => state.auth.isAuthenticated)

  return useQuery({
    queryKey: queryKeys.analysis.detail(analysisId),
    queryFn: async () => {
      const response = await api.analysis.get(analysisId)
      return response.data
    },
    enabled: isAuthenticated && !!analysisId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2
  })
}

// Start analysis mutation
export function useStartAnalysis() {
  const queryClient = useQueryClient()
  const startAnalysis = useStore(state => state.analysis.startAnalysis)
  const addNotification = useStore(state => state.notifications.addNotification)

  return useMutation({
    mutationFn: async ({
      input,
      type
    }: {
      input: File | string
      type: 'file' | 'text' | 'url'
    }) => {
      return await startAnalysis(input, type)
    },
    onSuccess: (analysisId) => {
      // Invalidate analysis list to show the new analysis
      queryClient.invalidateQueries({ queryKey: queryKeys.analysis.lists() })
      
      // Prefetch the analysis detail
      cacheUtils.prefetchAnalysis(analysisId)
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Analysis Failed',
        message: error.message || 'Failed to start analysis'
      })
    }
  })
}

// Delete analysis mutation
export function useDeleteAnalysis() {
  const queryClient = useQueryClient()
  const deleteAnalysis = useStore(state => state.analysis.deleteAnalysis)

  return useMutation({
    mutationFn: async (analysisId: string) => {
      return await deleteAnalysis(analysisId)
    },
    onSuccess: (_, analysisId) => {
      // Remove from cache
      cacheUtils.removeAnalysisFromCache(analysisId)
      
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: queryKeys.analysis.lists() })
    }
  })
}

// Export analysis mutation
export function useExportAnalysis() {
  const addNotification = useStore(state => state.notifications.addNotification)

  return useMutation({
    mutationFn: async ({
      analysisId,
      format
    }: {
      analysisId: string
      format: 'pdf' | 'json' | 'csv'
    }) => {
      const response = await api.analysis.export(analysisId, format)
      
      // Create download link
      const blob = new Blob([response.data], {
        type: response.headers['content-type']
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `analysis-${analysisId}.${format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      return response.data
    },
    onSuccess: (_, { format }) => {
      addNotification({
        type: 'success',
        title: 'Export Complete',
        message: `Analysis exported as ${format.toUpperCase()}`
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Export Failed',
        message: error.message || 'Failed to export analysis'
      })
    }
  })
}

// Get analysis statistics
export function useAnalysisStats() {
  const isAuthenticated = useStore(state => state.auth.isAuthenticated)

  return useQuery({
    queryKey: queryKeys.analysis.stats(),
    queryFn: async () => {
      const response = await api.analysis.list({ 
        stats: true,
        limit: 0 // Just get stats, no actual analyses
      })
      return response.data.stats
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000 // Refetch every 30 seconds
  })
}

// Hook for real-time analysis progress
export function useAnalysisProgress(analysisId: string) {
  const progress = useStore(state => state.analysis.analysisProgress[analysisId] || 0)
  const isAnalyzing = useStore(state => state.analysis.isAnalyzing)
  
  return {
    progress,
    isAnalyzing,
    isComplete: progress >= 100
  }
}

// Hook for bulk analysis operations
export function useBulkAnalysisOperations() {
  const queryClient = useQueryClient()
  const addNotification = useStore(state => state.notifications.addNotification)

  const bulkDelete = useMutation({
    mutationFn: async (analysisIds: string[]) => {
      const promises = analysisIds.map(id => api.analysis.delete(id))
      return await Promise.all(promises)
    },
    onSuccess: (_, analysisIds) => {
      // Remove from cache
      analysisIds.forEach(id => {
        cacheUtils.removeAnalysisFromCache(id)
      })
      
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: queryKeys.analysis.lists() })
      
      addNotification({
        type: 'success',
        title: 'Bulk Delete Complete',
        message: `Deleted ${analysisIds.length} analyses`
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Bulk Delete Failed',
        message: error.message || 'Failed to delete analyses'
      })
    }
  })

  const bulkExport = useMutation({
    mutationFn: async ({
      analysisIds,
      format
    }: {
      analysisIds: string[]
      format: 'pdf' | 'json' | 'csv'
    }) => {
      // For now, export individually
      // In a real app, you might have a bulk export endpoint
      const promises = analysisIds.map(id => 
        api.analysis.export(id, format)
      )
      return await Promise.all(promises)
    },
    onSuccess: (_, { analysisIds, format }) => {
      addNotification({
        type: 'success',
        title: 'Bulk Export Complete',
        message: `Exported ${analysisIds.length} analyses as ${format.toUpperCase()}`
      })
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Bulk Export Failed',
        message: error.message || 'Failed to export analyses'
      })
    }
  })

  return {
    bulkDelete,
    bulkExport
  }
}

// Hook for analysis filters and search
export function useAnalysisFilters() {
  const queryClient = useQueryClient()

  const applyFilter = (filters: any) => {
    // Invalidate current queries with new filters
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.analysis.lists()
    })
  }

  const clearFilters = () => {
    queryClient.invalidateQueries({ 
      queryKey: queryKeys.analysis.lists()
    })
  }

  return {
    applyFilter,
    clearFilters
  }
}

// Hook for optimistic updates
export function useOptimisticAnalysisUpdates() {
  const queryClient = useQueryClient()

  const optimisticallyUpdateAnalysis = (
    analysisId: string, 
    updates: any
  ) => {
    // Update detail cache
    queryClient.setQueryData(
      queryKeys.analysis.detail(analysisId),
      (old: any) => ({ ...old, ...updates })
    )

    // Update list cache
    queryClient.setQueryData(
      queryKeys.analysis.list(),
      (old: any) => {
        if (!old) return old
        
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            analyses: page.analyses.map((analysis: any) =>
              analysis.id === analysisId 
                ? { ...analysis, ...updates }
                : analysis
            )
          }))
        }
      }
    )
  }

  return {
    optimisticallyUpdateAnalysis
  }
}