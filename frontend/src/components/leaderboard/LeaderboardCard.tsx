import React from 'react'
import { motion } from 'framer-motion'
import { ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import type { LeaderboardEntry } from '../../types/leaderboard'
import { getRiskLevel, getRiskColor, formatVisitors } from '../../types/leaderboard'

interface LeaderboardCardProps {
  entry: LeaderboardEntry
  index: number
  showVisitors?: boolean
  onAnalyze?: (domain: string) => void
}

export function LeaderboardCard({ 
  entry, 
  index, 
  showVisitors = true,
  onAnalyze 
}: LeaderboardCardProps) {
  const riskLevel = getRiskLevel(entry.risk_score)
  const riskColorClass = getRiskColor(entry.risk_score)
  
  const getTrendIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-3 w-3 text-red-500" />
    if (change < 0) return <TrendingDown className="h-3 w-3 text-green-500" />
    return <Minus className="h-3 w-3 text-gray-400" />
  }

  const getTrendColor = (change: number) => {
    if (change > 0) return 'text-red-600 bg-red-50'
    if (change < 0) return 'text-green-600 bg-green-50'
    return 'text-gray-600 bg-gray-50'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card className="hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            {/* Rank and Site Info */}
            <div className="flex items-start space-x-3 flex-1">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-guardian/10 rounded-lg flex items-center justify-center">
                  <span className="text-sm font-bold text-guardian">
                    #{entry.rank}
                  </span>
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <h3 className="text-sm font-semibold text-foreground truncate">
                    {entry.name}
                  </h3>
                  <a
                    href={`https://${entry.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                
                <p className="text-xs text-muted-foreground truncate mb-2">
                  {entry.domain}
                </p>
                
                <div className="flex items-center space-x-2 flex-wrap gap-1">
                  <Badge variant="outline" className="text-xs">
                    {entry.category}
                  </Badge>
                  
                  {showVisitors && entry.monthly_visitors && (
                    <Badge variant="secondary" className="text-xs">
                      {formatVisitors(entry.monthly_visitors)} visitors
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Risk Score and Actions */}
            <div className="flex flex-col items-end space-y-2">
              <div className={`px-2 py-1 rounded-md text-xs font-medium border ${riskColorClass}`}>
                Risk: {entry.risk_score}
              </div>
              
              {entry.change_from_last_week !== 0 && (
                <div className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs ${getTrendColor(entry.change_from_last_week)}`}>
                  {getTrendIcon(entry.change_from_last_week)}
                  <span>{Math.abs(entry.change_from_last_week)}</span>
                </div>
              )}
              
              {onAnalyze && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAnalyze(entry.domain)}
                  className="text-xs h-7 px-2"
                >
                  Analyze
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}