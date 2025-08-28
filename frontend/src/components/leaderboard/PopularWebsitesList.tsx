import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, AlertCircle, TrendingUp, Globe } from 'lucide-react'
import { Button } from '../ui/Button'
import { LeaderboardCard } from './LeaderboardCard'
import { api } from '../../lib/api-client'
import type { LeaderboardEntry, LeaderboardResponse } from '../../types/leaderboard'

interface PopularWebsitesListProps {
  limit?: number
  showHeader?: boolean
  onAnalyze?: (domain: string) => void
}

export function PopularWebsitesList({ 
  limit = 20, 
  showHeader = true,
  onAnalyze 
}: PopularWebsitesListProps) {
  const [websites, setWebsites] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const fetchPopularWebsites = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await api.leaderboard.popularWebsites(limit)
      const data = response.data as LeaderboardResponse
      
      if (data.success) {
        setWebsites(data.data)
        setLastUpdated(data.meta.last_updated)
      } else {
        throw new Error('Failed to fetch popular websites')
      }
    } catch (err) {
      console.error('Error fetching popular websites:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPopularWebsites()
  }, [limit])

  const formatLastUpdated = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    
    if (diffHours < 1) return 'Updated less than an hour ago'
    if (diffHours < 24) return `Updated ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    
    const diffDays = Math.floor(diffHours / 24)
    return `Updated ${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-3">
          <RefreshCw className="h-5 w-5 animate-spin text-guardian" />
          <span className="text-muted-foreground">Loading popular websites...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Failed to Load Data
          </h3>
          <p className="text-muted-foreground mb-4">
            {error}
          </p>
          <Button onClick={fetchPopularWebsites} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {showHeader && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 bg-guardian/10 rounded-full mb-4">
            <TrendingUp className="h-8 w-8 text-guardian" />
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Most Popular Websites & Apps
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-6">
            Live risk analysis of the world's most visited websites and popular apps. 
            See how your favorite services handle your privacy and terms.
          </p>
          
          {lastUpdated && (
            <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span>{formatLastUpdated(lastUpdated)}</span>
            </div>
          )}
        </motion.div>
      )}

      {websites.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            No popular websites data available at the moment.
          </p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid gap-3"
        >
          {websites.map((website, index) => (
            <LeaderboardCard
              key={`${website.domain}-${website.rank}`}
              entry={website}
              index={index}
              showVisitors={true}
              onAnalyze={onAnalyze}
            />
          ))}
        </motion.div>
      )}

      {websites.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center pt-6 border-t border-border"
        >
          <Button
            onClick={fetchPopularWebsites}
            variant="outline"
            size="sm"
            className="text-sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Data
          </Button>
        </motion.div>
      )}
    </div>
  )
}