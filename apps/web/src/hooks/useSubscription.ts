import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'
import { apiClient } from '../services/api'

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'team' | 'enterprise'
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'inactive'

export interface Subscription {
  id: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEnd?: string
}

export interface Usage {
  analyses: {
    used: number
    limit: number | 'unlimited'
    remaining: number | 'unlimited'
  }
  monitoredDocs: {
    used: number
    limit: number | 'unlimited'
    remaining: number | 'unlimited'
  }
  apiCalls: {
    used: number
    limit: number | 'unlimited'
    remaining: number | 'unlimited'
  }
  teamMembers: {
    used: number
    limit: number | 'unlimited'
    remaining: number | 'unlimited'
  }
}

export interface SubscriptionContextType {
  subscription: Subscription | null
  usage: Usage | null
  isLoading: boolean
  error: string | null
  refreshSubscription: () => Promise<void>
  canUseFeature: (feature: FeatureType) => boolean
  getRemainingUsage: (metric: UsageMetric) => number | 'unlimited'
  isFeatureAvailable: (feature: FeatureType) => boolean
  hasReachedLimit: (metric: UsageMetric) => boolean
  upgradeRequired: (feature: FeatureType) => SubscriptionTier | null
}

export type FeatureType = 
  | 'document_analysis'
  | 'document_monitoring'
  | 'api_access'
  | 'team_collaboration'
  | 'advanced_analytics'
  | 'custom_risk_profiles'
  | 'bulk_processing'
  | 'export_reports'
  | 'priority_support'
  | 'sso_authentication'

export type UsageMetric = 'analyses' | 'monitoredDocs' | 'apiCalls' | 'teamMembers'

// Feature availability matrix
const featureMatrix: Record<FeatureType, SubscriptionTier[]> = {
  document_analysis: ['free', 'starter', 'professional', 'team', 'enterprise'],
  document_monitoring: ['starter', 'professional', 'team', 'enterprise'],
  api_access: ['professional', 'team', 'enterprise'],
  team_collaboration: ['team', 'enterprise'],
  advanced_analytics: ['professional', 'team', 'enterprise'],
  custom_risk_profiles: ['professional', 'team', 'enterprise'],
  bulk_processing: ['professional', 'team', 'enterprise'],
  export_reports: ['starter', 'professional', 'team', 'enterprise'],
  priority_support: ['professional', 'team', 'enterprise'],
  sso_authentication: ['team', 'enterprise']
}

// Tier hierarchy for upgrade suggestions
const tierHierarchy: SubscriptionTier[] = ['free', 'starter', 'professional', 'team', 'enterprise']

const SubscriptionContext = createContext<SubscriptionContextType | null>(null)

export const useSubscription = () => {
  const context = useContext(SubscriptionContext)
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider')
  }
  return context
}

interface SubscriptionProviderProps {
  children: ReactNode
}

export const SubscriptionProvider = ({ children }: SubscriptionProviderProps) => {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSubscriptionData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const response = await apiClient.get('/billing/subscription')
      const { subscription: sub, usage: usageData } = response.data
      
      // Calculate remaining usage
      const calculateRemaining = (used: number, limit: number | 'unlimited') => {
        if (limit === 'unlimited') return 'unlimited' as const
        return Math.max(0, limit - used)
      }
      
      const processedUsage: Usage = {
        analyses: {
          ...usageData.analyses,
          remaining: calculateRemaining(usageData.analyses.used, usageData.analyses.limit)
        },
        monitoredDocs: {
          ...usageData.monitoredDocs,
          remaining: calculateRemaining(usageData.monitoredDocs.used, usageData.monitoredDocs.limit)
        },
        apiCalls: {
          ...usageData.apiCalls,
          remaining: calculateRemaining(usageData.apiCalls.used, usageData.apiCalls.limit)
        },
        teamMembers: {
          ...usageData.teamMembers,
          remaining: calculateRemaining(usageData.teamMembers.used, usageData.teamMembers.limit)
        }
      }
      
      setSubscription(sub)
      setUsage(processedUsage)
    } catch (err) {
      console.error('Failed to fetch subscription data:', err)
      setError('Failed to load subscription information')
      
      // Set default free tier if fetch fails
      setSubscription({
        id: 'default',
        tier: 'free',
        status: 'active',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        cancelAtPeriodEnd: false
      })
      
      setUsage({
        analyses: { used: 0, limit: 3, remaining: 3 },
        monitoredDocs: { used: 0, limit: 0, remaining: 0 },
        apiCalls: { used: 0, limit: 0, remaining: 0 },
        teamMembers: { used: 1, limit: 1, remaining: 0 }
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSubscriptionData()
  }, [fetchSubscriptionData])

  const canUseFeature = useCallback((feature: FeatureType): boolean => {
    if (!subscription) return false
    if (subscription.status !== 'active' && subscription.status !== 'trialing') return false
    
    return featureMatrix[feature].includes(subscription.tier)
  }, [subscription])

  const getRemainingUsage = useCallback((metric: UsageMetric): number | 'unlimited' => {
    if (!usage) return 0
    return usage[metric].remaining
  }, [usage])

  const isFeatureAvailable = useCallback((feature: FeatureType): boolean => {
    if (!subscription) return false
    
    // Check if feature is available in current tier
    const available = featureMatrix[feature].includes(subscription.tier)
    if (!available) return false
    
    // Check usage limits for usage-based features
    if (feature === 'document_analysis' && usage) {
      return usage.analyses.remaining === 'unlimited' || usage.analyses.remaining > 0
    }
    
    if (feature === 'document_monitoring' && usage) {
      return usage.monitoredDocs.remaining === 'unlimited' || usage.monitoredDocs.remaining > 0
    }
    
    if (feature === 'api_access' && usage) {
      return usage.apiCalls.remaining === 'unlimited' || usage.apiCalls.remaining > 0
    }
    
    return true
  }, [subscription, usage])

  const hasReachedLimit = useCallback((metric: UsageMetric): boolean => {
    if (!usage) return false
    const metricData = usage[metric]
    
    if (metricData.limit === 'unlimited') return false
    return metricData.used >= metricData.limit
  }, [usage])

  const upgradeRequired = useCallback((feature: FeatureType): SubscriptionTier | null => {
    if (!subscription) return 'starter'
    
    // If feature is already available, no upgrade needed
    if (canUseFeature(feature)) return null
    
    // Find the minimum tier that has this feature
    const availableTiers = featureMatrix[feature]
    const currentTierIndex = tierHierarchy.indexOf(subscription.tier)
    
    for (let i = currentTierIndex + 1; i < tierHierarchy.length; i++) {
      if (availableTiers.includes(tierHierarchy[i])) {
        return tierHierarchy[i]
      }
    }
    
    return null
  }, [subscription, canUseFeature])

  const value: SubscriptionContextType = {
    subscription,
    usage,
    isLoading,
    error,
    refreshSubscription: fetchSubscriptionData,
    canUseFeature,
    getRemainingUsage,
    isFeatureAvailable,
    hasReachedLimit,
    upgradeRequired
  }

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  )
}

// Custom hook for feature gating
export const useFeatureGate = (feature: FeatureType) => {
  const { canUseFeature, isFeatureAvailable, upgradeRequired } = useSubscription()
  
  return {
    isAllowed: canUseFeature(feature),
    isAvailable: isFeatureAvailable(feature),
    upgradeRequired: upgradeRequired(feature)
  }
}

// Custom hook for usage tracking
export const useUsageTracking = (metric: UsageMetric) => {
  const { usage, getRemainingUsage, hasReachedLimit, refreshSubscription } = useSubscription()
  
  const trackUsage = useCallback(async (quantity: number = 1) => {
    try {
      await apiClient.post('/billing/usage/track', {
        metric,
        quantity
      })
      
      // Refresh subscription data to get updated usage
      await refreshSubscription()
    } catch (error) {
      console.error(`Failed to track ${metric} usage:`, error)
      throw error
    }
  }, [metric, refreshSubscription])
  
  return {
    used: usage?.[metric].used || 0,
    limit: usage?.[metric].limit || 0,
    remaining: getRemainingUsage(metric),
    hasReachedLimit: hasReachedLimit(metric),
    trackUsage
  }
}