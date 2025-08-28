import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface Variant {
  id: string
  name: string
  allocation: number
  metrics: {
    conversions: number
    impressions: number
    conversionRate: number
    confidence: number
    improvement: number
  }
  isControl: boolean
  isWinner?: boolean
}

export interface Experiment {
  id: string
  name: string
  type: 'marketing' | 'sales' | 'support' | 'analytics'
  status: 'draft' | 'running' | 'paused' | 'completed'
  startDate: string
  endDate?: string
  duration: number
  variants: Variant[]
  primaryMetric: string
  secondaryMetrics: string[]
  sampleSize: number
  currentSampleSize: number
  statisticalSignificance: number
  minimumDetectableEffect: number
  confidence: number
  winner?: string
  description?: string
  hypothesis?: string
  successCriteria?: string
}

export interface ExperimentHistory {
  id: string
  experimentId: string
  experimentName: string
  type: string
  startDate: string
  endDate: string
  winner: string
  improvement: number
  confidence: number
  revenue_impact?: number
  status: 'success' | 'failure' | 'inconclusive'
}

export interface ModelPerformance {
  agentType: 'marketing' | 'sales' | 'support' | 'analytics'
  currentModel: string
  version: string
  metrics: {
    responseTime: number
    accuracy: number
    userSatisfaction: number
    errorRate: number
    throughput: number
  }
  history: {
    timestamp: string
    model: string
    version: string
    metrics: any
  }[]
}

// Get active experiments
export const useActiveExperiments = () => {
  return useQuery({
    queryKey: ['experiments', 'active'],
    queryFn: async () => {
      const response = await apiClient.get('/experiments/active')
      return response.data as Experiment[]
    },
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  })
}

// Get experiment history
export const useExperimentHistory = (limit = 50) => {
  return useQuery({
    queryKey: ['experiments', 'history', limit],
    queryFn: async () => {
      const response = await apiClient.get(`/experiments/history?limit=${limit}`)
      return response.data as ExperimentHistory[]
    },
  })
}

// Get specific experiment details
export const useExperiment = (experimentId: string) => {
  return useQuery({
    queryKey: ['experiment', experimentId],
    queryFn: async () => {
      const response = await apiClient.get(`/experiments/${experimentId}`)
      return response.data as Experiment
    },
    enabled: !!experimentId,
  })
}

// Start experiment mutations
export const useStartExperiment = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      type: 'marketing' | 'sales' | 'support' | 'analytics'
      name: string
      variants: {
        name: string
        allocation: number
        isControl?: boolean
      }[]
      primaryMetric: string
      duration: number
      hypothesis?: string
      successCriteria?: string
    }) => {
      const response = await apiClient.post(`/experiments/${data.type}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
    },
  })
}

// Stop experiment
export const useStopExperiment = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (experimentId: string) => {
      const response = await apiClient.post(`/experiments/${experimentId}/stop`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
    },
  })
}

// Pause experiment
export const usePauseExperiment = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (experimentId: string) => {
      const response = await apiClient.post(`/experiments/${experimentId}/pause`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
    },
  })
}

// Resume experiment
export const useResumeExperiment = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (experimentId: string) => {
      const response = await apiClient.post(`/experiments/${experimentId}/resume`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiments'] })
    },
  })
}

// Get model performance
export const useModelPerformance = () => {
  return useQuery({
    queryKey: ['agents', 'performance'],
    queryFn: async () => {
      const response = await apiClient.get('/agents/performance')
      return response.data as ModelPerformance[]
    },
    refetchInterval: 10000, // Refetch every 10 seconds
  })
}

// Rollback model version
export const useRollbackModel = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      agentType: string
      targetVersion: string
    }) => {
      const response = await apiClient.post(`/agents/${data.agentType}/rollback`, {
        version: data.targetVersion
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

// Calculate statistical significance
export const calculateStatisticalSignificance = (
  controlConversions: number,
  controlImpressions: number,
  variantConversions: number,
  variantImpressions: number
): {
  pValue: number
  isSignificant: boolean
  confidence: number
  improvement: number
} => {
  const controlRate = controlConversions / controlImpressions
  const variantRate = variantConversions / variantImpressions
  
  // Calculate pooled probability
  const pooledProbability = (controlConversions + variantConversions) / (controlImpressions + variantImpressions)
  
  // Calculate standard error
  const standardError = Math.sqrt(
    pooledProbability * (1 - pooledProbability) * (1/controlImpressions + 1/variantImpressions)
  )
  
  // Calculate z-score
  const zScore = (variantRate - controlRate) / standardError
  
  // Calculate p-value (two-tailed test)
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)))
  
  // Calculate confidence and improvement
  const confidence = (1 - pValue) * 100
  const improvement = ((variantRate - controlRate) / controlRate) * 100
  
  return {
    pValue,
    isSignificant: pValue < 0.05,
    confidence,
    improvement,
  }
}

// Normal cumulative distribution function
const normalCDF = (z: number): number => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp(-z * z / 2)
  const probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  
  return z > 0 ? 1 - probability : probability
}