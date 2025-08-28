export interface LeaderboardEntry {
  rank: number
  name: string
  domain: string
  risk_score: number
  category: string
  change_from_last_week: number
  monthly_visitors?: number
  last_updated: string
}

export interface LeaderboardResponse {
  success: boolean
  data: LeaderboardEntry[]
  meta: {
    total: number
    last_updated: string
  }
}

export interface LeaderboardCategory {
  category: string
  count: number
  avg_risk_score: number
}

export interface LeaderboardStats {
  total_websites: number
  avg_risk_score: number
  min_risk_score: number
  max_risk_score: number
  high_risk_count: number
  low_risk_count: number
  total_categories: number
  last_update: string
}

export interface TrendingEntry extends LeaderboardEntry {
  change_magnitude: number
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export function getRiskLevel(score: number): RiskLevel {
  if (score <= 30) return 'low'
  if (score <= 60) return 'medium'
  if (score <= 80) return 'high'
  return 'critical'
}

export function getRiskColor(score: number): string {
  const level = getRiskLevel(score)
  switch (level) {
    case 'low':
      return 'text-green-600 bg-green-50 border-green-200'
    case 'medium':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    case 'high':
      return 'text-orange-600 bg-orange-50 border-orange-200'
    case 'critical':
      return 'text-red-600 bg-red-50 border-red-200'
  }
}

export function formatVisitors(visitors?: number): string {
  if (!visitors) return 'N/A'
  
  if (visitors >= 1_000_000_000) {
    return `${(visitors / 1_000_000_000).toFixed(1)}B`
  }
  if (visitors >= 1_000_000) {
    return `${(visitors / 1_000_000).toFixed(1)}M`
  }
  if (visitors >= 1_000) {
    return `${(visitors / 1_000).toFixed(1)}K`
  }
  return visitors.toString()
}