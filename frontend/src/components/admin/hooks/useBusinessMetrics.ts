import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface BusinessMetrics {
  timestamp: string
  revenue: {
    current: number
    previous: number
    change: number
    changePercent: number
  }
  conversion: {
    rate: number
    total: number
    change: number
    funnel: {
      stage: string
      count: number
      rate: number
    }[]
  }
  churn: {
    rate: number
    total: number
    change: number
    reasons: {
      reason: string
      count: number
      percentage: number
    }[]
  }
  acquisition: {
    newUsers: number
    cost: number
    channels: {
      channel: string
      users: number
      cost: number
      roi: number
    }[]
  }
  engagement: {
    dau: number // Daily Active Users
    mau: number // Monthly Active Users
    sessionDuration: number
    pageViews: number
    bounceRate: number
  }
}

export interface SEOMetrics {
  organicTraffic: number
  rankings: {
    keyword: string
    position: number
    change: number
    volume: number
  }[]
  backlinks: number
  domainAuthority: number
  pageSpeed: {
    mobile: number
    desktop: number
  }
  coreWebVitals: {
    lcp: number // Largest Contentful Paint
    fid: number // First Input Delay
    cls: number // Cumulative Layout Shift
  }
}

export interface CustomerSegment {
  id: string
  name: string
  size: number
  value: number
  growth: number
  characteristics: {
    avgRevenue: number
    avgLifetime: number
    churnRisk: 'low' | 'medium' | 'high'
    engagement: 'low' | 'medium' | 'high'
  }
  trends: {
    date: string
    size: number
    value: number
  }[]
}

export interface FunnelStage {
  name: string
  visitors: number
  conversions: number
  conversionRate: number
  dropoffRate: number
  avgTimeSpent: number
  exitPages: {
    page: string
    exits: number
  }[]
}

export interface MarketingCampaign {
  id: string
  name: string
  channel: string
  status: 'active' | 'paused' | 'completed'
  budget: number
  spent: number
  impressions: number
  clicks: number
  conversions: number
  roi: number
  ctr: number // Click-through rate
  cpc: number // Cost per click
  cpa: number // Cost per acquisition
}

// Get current business metrics
export const useBusinessMetrics = (timeRange: '1h' | '24h' | '7d' | '30d' = '24h') => {
  return useQuery({
    queryKey: ['business-metrics', timeRange],
    queryFn: async () => {
      const response = await apiClient.get(`/metrics/business?range=${timeRange}`)
      return response.data as BusinessMetrics
    },
    refetchInterval: 60000, // Refetch every minute
  })
}

// Get historical business metrics
export const useBusinessMetricsHistory = (days = 30) => {
  return useQuery({
    queryKey: ['business-metrics-history', days],
    queryFn: async () => {
      const response = await apiClient.get(`/metrics/business/history?days=${days}`)
      return response.data as BusinessMetrics[]
    },
  })
}

// Get SEO metrics
export const useSEOMetrics = () => {
  return useQuery({
    queryKey: ['seo-metrics'],
    queryFn: async () => {
      const response = await apiClient.get('/metrics/seo')
      return response.data as SEOMetrics
    },
    refetchInterval: 3600000, // Refetch every hour
  })
}

// Get customer segments
export const useCustomerSegments = () => {
  return useQuery({
    queryKey: ['customer-segments'],
    queryFn: async () => {
      const response = await apiClient.get('/metrics/segments')
      return response.data as CustomerSegment[]
    },
  })
}

// Get conversion funnel
export const useConversionFunnel = (funnelType: 'signup' | 'purchase' | 'upgrade' = 'signup') => {
  return useQuery({
    queryKey: ['conversion-funnel', funnelType],
    queryFn: async () => {
      const response = await apiClient.get(`/metrics/funnel/${funnelType}`)
      return response.data as FunnelStage[]
    },
  })
}

// Get marketing campaigns
export const useMarketingCampaigns = (status?: 'active' | 'paused' | 'completed') => {
  return useQuery({
    queryKey: ['marketing-campaigns', status],
    queryFn: async () => {
      const url = status ? `/metrics/campaigns?status=${status}` : '/metrics/campaigns'
      const response = await apiClient.get(url)
      return response.data as MarketingCampaign[]
    },
  })
}

// Calculate funnel metrics
export const calculateFunnelMetrics = (stages: FunnelStage[]) => {
  if (stages.length === 0) return null

  const totalVisitors = stages[0].visitors
  const finalConversions = stages[stages.length - 1].conversions
  const overallConversionRate = (finalConversions / totalVisitors) * 100

  const bottlenecks = stages.map((stage, index) => {
    if (index === 0) return null
    const prevStage = stages[index - 1]
    const dropoff = ((prevStage.conversions - stage.visitors) / prevStage.conversions) * 100
    return {
      stage: stage.name,
      dropoff,
      isBottleneck: dropoff > 30, // Flag if dropoff is more than 30%
    }
  }).filter(Boolean)

  return {
    overallConversionRate,
    totalVisitors,
    finalConversions,
    bottlenecks,
    avgDropoffRate: bottlenecks.reduce((sum, b) => sum + (b?.dropoff || 0), 0) / bottlenecks.length,
  }
}

// Calculate ROI
export const calculateROI = (revenue: number, cost: number): number => {
  if (cost === 0) return 0
  return ((revenue - cost) / cost) * 100
}

// Calculate LTV (Lifetime Value)
export const calculateLTV = (
  avgOrderValue: number,
  purchaseFrequency: number,
  customerLifespan: number
): number => {
  return avgOrderValue * purchaseFrequency * customerLifespan
}

// Calculate CAC (Customer Acquisition Cost)
export const calculateCAC = (
  marketingSpend: number,
  salesSpend: number,
  newCustomers: number
): number => {
  if (newCustomers === 0) return 0
  return (marketingSpend + salesSpend) / newCustomers
}

// Format currency
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Format percentage
export const formatPercentage = (value: number, decimals = 1): string => {
  return `${value.toFixed(decimals)}%`
}

// Format large numbers
export const formatNumber = (value: number): string => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toString()
}