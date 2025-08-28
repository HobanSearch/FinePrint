import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  GitBranch,
  GitCommit,
  Clock,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Info,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { ModelPerformance } from '../hooks/useExperiments'
import { formatPercentage } from '../hooks/useBusinessMetrics'

interface VersionHistoryProps {
  models: ModelPerformance[]
  onRollback: (agentType: string, version: string) => void
  className?: string
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  models,
  onRollback,
  className,
}) => {
  // Combine all version histories with agent type
  const allVersions = useMemo(() => {
    const versions: Array<{
      agentType: string
      timestamp: string
      model: string
      version: string
      metrics: any
      isCurrent: boolean
    }> = []

    models.forEach(model => {
      model.history.forEach((h, index) => {
        versions.push({
          agentType: model.agentType,
          ...h,
          isCurrent: index === 0,
        })
      })
    })

    // Sort by timestamp descending
    return versions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [models])

  // Group versions by date
  const groupedVersions = useMemo(() => {
    const groups: Record<string, typeof allVersions> = {}
    
    allVersions.forEach(version => {
      const date = new Date(version.timestamp).toLocaleDateString()
      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(version)
    })

    return Object.entries(groups).map(([date, versions]) => ({
      date,
      versions,
    }))
  }, [allVersions])

  const getPerformanceChange = (current: any, previous: any) => {
    if (!previous) return null

    const accuracyChange = current.accuracy - previous.accuracy
    const satisfactionChange = current.userSatisfaction - previous.userSatisfaction
    const responseTimeChange = previous.responseTime - current.responseTime // Lower is better
    const errorRateChange = previous.errorRate - current.errorRate // Lower is better

    const overallImprovement = (
      accuracyChange + 
      satisfactionChange + 
      responseTimeChange / 10 + 
      errorRateChange * 10
    ) / 4

    return {
      accuracy: accuracyChange,
      satisfaction: satisfactionChange,
      responseTime: -responseTimeChange, // Flip for display (negative means worse)
      errorRate: -errorRateChange, // Flip for display
      overall: overallImprovement,
    }
  }

  const getAgentColor = (type: string) => {
    switch (type) {
      case 'marketing': return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
      case 'sales': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
      case 'support': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
      case 'analytics': return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Version History Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {groupedVersions.map(({ date, versions }) => (
            <div key={date} className="relative">
              {/* Date Header */}
              <div className="sticky top-0 z-10 bg-background pb-2">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <Badge variant="outline" className="px-3">
                    {date}
                  </Badge>
                  <div className="h-px flex-1 bg-border" />
                </div>
              </div>

              {/* Version Entries */}
              <div className="space-y-3 mt-4">
                {versions.map((version, index) => {
                  // Find previous version for comparison
                  const previousVersion = allVersions.find(
                    v => v.agentType === version.agentType && 
                    new Date(v.timestamp) < new Date(version.timestamp)
                  )
                  
                  const performanceChange = previousVersion 
                    ? getPerformanceChange(version.metrics, previousVersion.metrics)
                    : null

                  return (
                    <motion.div
                      key={`${version.agentType}-${version.version}-${index}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={cn(
                        'relative flex gap-4 p-4 rounded-lg border transition-all hover:shadow-md',
                        version.isCurrent && 'bg-sage-50 dark:bg-sage-950 border-sage-200'
                      )}
                    >
                      {/* Timeline Indicator */}
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center',
                          version.isCurrent ? 'bg-sage-500' : 'bg-neutral-300 dark:bg-neutral-700'
                        )}>
                          <GitCommit className="w-5 h-5 text-white" />
                        </div>
                        {index < versions.length - 1 && (
                          <div className="w-0.5 h-full bg-border mt-2" />
                        )}
                      </div>

                      {/* Version Content */}
                      <div className="flex-1 space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={cn('text-xs', getAgentColor(version.agentType))}>
                                {version.agentType}
                              </Badge>
                              {version.isCurrent && (
                                <Badge variant="sage" size="sm">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Current
                                </Badge>
                              )}
                            </div>
                            <h4 className="font-semibold">
                              {version.model} v{version.version}
                            </h4>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              <Clock className="w-3 h-3" />
                              {new Date(version.timestamp).toLocaleTimeString()}
                            </div>
                          </div>

                          {!version.isCurrent && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onRollback(version.agentType, version.version)}
                              leftIcon={<ArrowLeft className="w-3 h-3" />}
                            >
                              Rollback
                            </Button>
                          )}
                        </div>

                        {/* Metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Accuracy</span>
                            <div className="font-semibold flex items-center gap-1">
                              {formatPercentage(version.metrics.accuracy, 1)}
                              {performanceChange && performanceChange.accuracy !== 0 && (
                                <span className={cn(
                                  'text-xs',
                                  performanceChange.accuracy > 0 ? 'text-sage-600' : 'text-danger-600'
                                )}>
                                  {performanceChange.accuracy > 0 ? '+' : ''}
                                  {performanceChange.accuracy.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Response</span>
                            <div className="font-semibold flex items-center gap-1">
                              {version.metrics.responseTime}ms
                              {performanceChange && performanceChange.responseTime !== 0 && (
                                <span className={cn(
                                  'text-xs',
                                  performanceChange.responseTime < 0 ? 'text-sage-600' : 'text-danger-600'
                                )}>
                                  {performanceChange.responseTime > 0 ? '+' : ''}
                                  {performanceChange.responseTime.toFixed(0)}ms
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Satisfaction</span>
                            <div className="font-semibold flex items-center gap-1">
                              {formatPercentage(version.metrics.userSatisfaction, 1)}
                              {performanceChange && performanceChange.satisfaction !== 0 && (
                                <span className={cn(
                                  'text-xs',
                                  performanceChange.satisfaction > 0 ? 'text-sage-600' : 'text-danger-600'
                                )}>
                                  {performanceChange.satisfaction > 0 ? '+' : ''}
                                  {performanceChange.satisfaction.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Error Rate</span>
                            <div className="font-semibold flex items-center gap-1">
                              {formatPercentage(version.metrics.errorRate, 2)}
                              {performanceChange && performanceChange.errorRate !== 0 && (
                                <span className={cn(
                                  'text-xs',
                                  performanceChange.errorRate < 0 ? 'text-sage-600' : 'text-danger-600'
                                )}>
                                  {performanceChange.errorRate > 0 ? '+' : ''}
                                  {performanceChange.errorRate.toFixed(2)}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Performance Change Summary */}
                        {performanceChange && (
                          <div className={cn(
                            'flex items-center gap-2 p-2 rounded text-sm',
                            performanceChange.overall > 0 
                              ? 'bg-sage-100 dark:bg-sage-900 text-sage-700 dark:text-sage-300'
                              : performanceChange.overall < 0
                              ? 'bg-danger-100 dark:bg-danger-900 text-danger-700 dark:text-danger-300'
                              : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                          )}>
                            {performanceChange.overall > 0 ? (
                              <>
                                <TrendingUp className="w-4 h-4" />
                                <span>Performance improved from previous version</span>
                              </>
                            ) : performanceChange.overall < 0 ? (
                              <>
                                <TrendingDown className="w-4 h-4" />
                                <span>Performance degraded from previous version</span>
                              </>
                            ) : (
                              <>
                                <Info className="w-4 h-4" />
                                <span>No significant change from previous version</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default VersionHistory