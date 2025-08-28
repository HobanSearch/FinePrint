import { QueryClient, DefaultOptions } from '@tanstack/react-query'
import { storage } from './storage'

// Default query options
const defaultOptions: DefaultOptions = {
  queries: {
    // Cache for 5 minutes by default
    staleTime: 5 * 60 * 1000,
    
    // Keep in cache for 10 minutes
    gcTime: 10 * 60 * 1000,
    
    // Retry failed requests
    retry: (failureCount, error: any) => {
      // Don't retry on 4xx errors (client errors)
      if (error?.status >= 400 && error?.status < 500) {
        return false
      }
      
      // Retry up to 3 times for server errors
      return failureCount < 3
    },
    
    // Retry delay with exponential backoff
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    
    // Refetch on window focus for critical data
    refetchOnWindowFocus: true,
    
    // Don't refetch on reconnect by default (will be handled selectively)
    refetchOnReconnect: false,
    
    // Network mode
    networkMode: 'online'
  },
  mutations: {
    // Retry mutations once
    retry: 1,
    
    // Network mode for mutations
    networkMode: 'online'
  }
}

// Create query client with custom configuration
export const queryClient = new QueryClient({
  defaultOptions,
  
  // Custom logger for debugging
  logger: {
    log: (...args) => {
      if (import.meta.env.DEV) {
        console.log('[React Query]', ...args)
      }
    },
    warn: (...args) => {
      console.warn('[React Query]', ...args)
    },
    error: (...args) => {
      console.error('[React Query]', ...args)
    }
  }
})

// Query key factories for consistent key generation
export const queryKeys = {
  // Auth queries
  auth: {
    profile: () => ['auth', 'profile'] as const,
    sessions: () => ['auth', 'sessions'] as const
  },
  
  // User queries
  user: {
    all: () => ['user'] as const,
    profile: () => [...queryKeys.user.all(), 'profile'] as const,
    preferences: () => [...queryKeys.user.all(), 'preferences'] as const
  },
  
  // Document queries
  documents: {
    all: () => ['documents'] as const,
    lists: () => [...queryKeys.documents.all(), 'list'] as const,
    list: (filters?: any) => [...queryKeys.documents.lists(), filters] as const,
    details: () => [...queryKeys.documents.all(), 'detail'] as const,
    detail: (id: string) => [...queryKeys.documents.details(), id] as const
  },
  
  // Analysis queries
  analysis: {
    all: () => ['analysis'] as const,
    lists: () => [...queryKeys.analysis.all(), 'list'] as const,
    list: (filters?: any) => [...queryKeys.analysis.lists(), filters] as const,
    details: () => [...queryKeys.analysis.all(), 'detail'] as const,
    detail: (id: string) => [...queryKeys.analysis.details(), id] as const,
    stats: () => [...queryKeys.analysis.all(), 'stats'] as const
  },
  
  // System queries
  system: {
    all: () => ['system'] as const,
    status: () => [...queryKeys.system.all(), 'status'] as const,
    health: () => [...queryKeys.system.all(), 'health'] as const,
    features: () => [...queryKeys.system.all(), 'features'] as const
  }
}

// Persistent cache configuration
const CACHE_VERSION = '1.0'
const CACHE_KEY = 'react-query-offline-cache'

// Persist cache to storage
export async function persistCache() {
  try {
    const cacheData = queryClient.getQueryCache().getAll()
    const serializedCache = cacheData.map(query => ({
      queryKey: query.queryKey,
      queryHash: query.queryHash,
      data: query.state.data,
      dataUpdatedAt: query.state.dataUpdatedAt,
      error: query.state.error
    }))

    await storage.set(CACHE_KEY, {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      queries: serializedCache
    })
  } catch (error) {
    console.error('Failed to persist query cache:', error)
  }
}

// Restore cache from storage
export async function restoreCache() {
  try {
    const cached = await storage.get(CACHE_KEY)
    
    if (!cached || cached.version !== CACHE_VERSION) {
      return // Cache version mismatch, start fresh
    }

    // Only restore cache from last 24 hours
    const maxAge = 24 * 60 * 60 * 1000
    if (Date.now() - cached.timestamp > maxAge) {
      await storage.remove(CACHE_KEY)
      return
    }

    // Restore queries
    for (const query of cached.queries) {
      queryClient.setQueryData(query.queryKey, query.data, {
        updatedAt: query.dataUpdatedAt
      })
    }

    console.log(`Restored ${cached.queries.length} cached queries`)
  } catch (error) {
    console.error('Failed to restore query cache:', error)
  }
}

// Cache invalidation helpers
export const cacheUtils = {
  // Invalidate all user-related data
  invalidateUserData: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.user.all() })
    queryClient.invalidateQueries({ queryKey: queryKeys.auth.profile() })
  },

  // Invalidate all analysis data
  invalidateAnalysisData: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.analysis.all() })
  },

  // Invalidate all document data
  invalidateDocumentData: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.documents.all() })
  },

  // Clear all cached data (on logout)
  clearAllCache: () => {
    queryClient.clear()
  },

  // Optimistically update analysis list
  updateAnalysisList: (newAnalysis: any) => {
    queryClient.setQueryData(queryKeys.analysis.list(), (old: any) => {
      if (!old) return [newAnalysis]
      return [newAnalysis, ...old.filter((a: any) => a.id !== newAnalysis.id)]
    })
  },

  // Remove analysis from cache
  removeAnalysisFromCache: (analysisId: string) => {
    // Remove from detail cache
    queryClient.removeQueries({ 
      queryKey: queryKeys.analysis.detail(analysisId) 
    })
    
    // Update list cache
    queryClient.setQueryData(queryKeys.analysis.list(), (old: any) => {
      if (!old) return old
      return old.filter((a: any) => a.id !== analysisId)
    })
  },

  // Prefetch analysis detail
  prefetchAnalysis: (analysisId: string) => {
    return queryClient.prefetchQuery({
      queryKey: queryKeys.analysis.detail(analysisId),
      queryFn: async () => {
        const { api } = await import('./api-client')
        const response = await api.analysis.get(analysisId)
        return response.data
      },
      staleTime: 2 * 60 * 1000 // 2 minutes
    })
  }
}

// Network status management
let isOnline = navigator.onLine

window.addEventListener('online', () => {
  isOnline = true
  // Resume paused queries when coming back online
  queryClient.resumePausedMutations()
  queryClient.invalidateQueries()
})

window.addEventListener('offline', () => {
  isOnline = false
})

// Custom hook for network status
export function useIsOnline() {
  return isOnline
}

// Setup periodic cache persistence
if (typeof window !== 'undefined') {
  // Persist cache every 5 minutes
  setInterval(persistCache, 5 * 60 * 1000)
  
  // Persist cache on page unload
  window.addEventListener('beforeunload', persistCache)
  
  // Persist cache on visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      persistCache()
    }
  })
}

// Development helpers
if (import.meta.env.DEV) {
  // Log cache statistics
  (window as any).__REACT_QUERY_CLIENT__ = queryClient
  
  // Log query cache size periodically
  setInterval(() => {
    const cache = queryClient.getQueryCache()
    const size = cache.getAll().length
    if (size > 50) {
      console.warn(`Query cache has ${size} entries, consider cleanup`)
    }
  }, 60000)
}

export default queryClient