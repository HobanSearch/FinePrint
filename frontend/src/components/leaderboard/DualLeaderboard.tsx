import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, AlertTriangle, RefreshCw, Globe, Users } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { LeaderboardCard } from './LeaderboardCard'
import { api } from '../../lib/api-client'
import type { LeaderboardEntry, LeaderboardResponse } from '../../types/leaderboard'

interface DualLeaderboardProps {
  popularLimit?: number
  worstLimit?: number
  onAnalyze?: (domain: string) => void
}

export function DualLeaderboard({ 
  popularLimit = 10, 
  worstLimit = 10,
  onAnalyze 
}: DualLeaderboardProps) {
  const [popularWebsites, setPopularWebsites] = useState<LeaderboardEntry[]>([])
  const [worstOffenders, setWorstOffenders] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const [popularResponse, worstResponse] = await Promise.all([
        api.leaderboard.popularWebsites(popularLimit),
        api.leaderboard.worstOffenders(worstLimit)
      ])
      
      const popularData = popularResponse.data as LeaderboardResponse
      const worstData = worstResponse.data as LeaderboardResponse
      
      if (popularData.success && worstData.success) {
        setPopularWebsites(popularData.data)
        setWorstOffenders(worstData.data)
      } else {
        throw new Error('Failed to fetch leaderboard data')
      }
    } catch (err) {
      console.error('Error fetching leaderboard data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [popularLimit, worstLimit])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center space-x-3">
          <RefreshCw className="h-5 w-5 animate-spin text-guardian" />
          <span className="text-muted-foreground">Loading leaderboards...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Failed to Load Leaderboards
          </h3>
          <p className="text-muted-foreground mb-4">
            {error}
          </p>
          <Button onClick={fetchData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section className="py-16 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 bg-guardian/10 rounded-full mb-4">
            <Globe className="h-8 w-8 text-guardian" />
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Live Risk Analysis of Popular Services
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            See how the world's most popular websites and apps handle your privacy and data. 
            Our AI analyzes their terms in real-time to keep you informed.
          </p>
        </motion.div>

        {/* Dual Leaderboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Popular Websites */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
          >
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Most Popular</h3>
                    <p className="text-sm text-muted-foreground font-normal">
                      Ranked by monthly visitors
                    </p>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {popularWebsites.slice(0, popularLimit).map((website, index) => (
                  <LeaderboardCard
                    key={`popular-${website.domain}-${website.rank}`}
                    entry={website}
                    index={index}
                    showVisitors={true}
                    onAnalyze={onAnalyze}
                  />
                ))}
                
                {popularWebsites.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No popular websites data available
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Worst Offenders */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Highest Risk</h3>
                    <p className="text-sm text-muted-foreground font-normal">
                      Most problematic terms
                    </p>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {worstOffenders.slice(0, worstLimit).map((website, index) => (
                  <LeaderboardCard
                    key={`worst-${website.domain}-${website.rank}`}
                    entry={website}
                    index={index}
                    showVisitors={false}
                    onAnalyze={onAnalyze}
                  />
                ))}
                
                {worstOffenders.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No risk data available
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Action Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          viewport={{ once: true }}
          className="text-center mt-12"
        >
          <div className="bg-gradient-to-r from-guardian/5 to-sage/5 rounded-2xl p-8">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Want to analyze a specific website or app?
            </h3>
            <p className="text-muted-foreground mb-6">
              Upload your own documents or let our AI analyze any service's terms and privacy policy.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-guardian hover:bg-guardian/90">
                <TrendingUp className="h-4 w-4 mr-2" />
                Start Free Analysis
              </Button>
              <Button size="lg" variant="outline" onClick={fetchData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Data
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}