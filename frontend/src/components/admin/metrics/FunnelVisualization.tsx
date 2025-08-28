import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Info,
  Users,
  MousePointer,
  ShoppingCart,
  CreditCard,
  ChevronDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/utils'
import { 
  useConversionFunnel,
  calculateFunnelMetrics,
  formatPercentage,
  formatNumber,
  type FunnelStage,
} from '../hooks/useBusinessMetrics'

interface FunnelVisualizationProps {
  funnelType?: 'signup' | 'purchase' | 'upgrade'
  className?: string
}

export const FunnelVisualization: React.FC<FunnelVisualizationProps> = ({
  funnelType = 'signup',
  className,
}) => {
  const { data: funnelData, isLoading } = useConversionFunnel(funnelType)
  
  const metrics = useMemo(() => {
    if (!funnelData) return null
    return calculateFunnelMetrics(funnelData)
  }, [funnelData])

  const getStageIcon = (stageName: string) => {
    const name = stageName.toLowerCase()
    if (name.includes('visit') || name.includes('land')) return <Users className="w-4 h-4" />
    if (name.includes('click') || name.includes('engage')) return <MousePointer className="w-4 h-4" />
    if (name.includes('cart') || name.includes('add')) return <ShoppingCart className="w-4 h-4" />
    if (name.includes('checkout') || name.includes('payment')) return <CreditCard className="w-4 h-4" />
    return <ChevronDown className="w-4 h-4" />
  }

  const getDropoffSeverity = (dropoffRate: number) => {
    if (dropoffRate > 50) return { color: 'danger', label: 'Critical' }
    if (dropoffRate > 30) return { color: 'alert', label: 'High' }
    if (dropoffRate > 15) return { color: 'secondary', label: 'Normal' }
    return { color: 'sage', label: 'Low' }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-guardian-500" />
      </div>
    )
  }

  if (!funnelData || !metrics) {
    return null
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Funnel Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{formatNumber(metrics.totalVisitors)}</div>
            <div className="text-sm text-muted-foreground">Total Visitors</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{formatNumber(metrics.finalConversions)}</div>
            <div className="text-sm text-muted-foreground">Conversions</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-sage-600">
              {formatPercentage(metrics.overallConversionRate)}
            </div>
            <div className="text-sm text-muted-foreground">Overall Rate</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-danger-600">
              {formatPercentage(metrics.avgDropoffRate)}
            </div>
            <div className="text-sm text-muted-foreground">Avg Dropoff</div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Conversion Funnel - {funnelType.charAt(0).toUpperCase() + funnelType.slice(1)}</span>
            {metrics.bottlenecks.filter(b => b?.isBottleneck).length > 0 && (
              <Badge variant="alert" size="sm">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {metrics.bottlenecks.filter(b => b?.isBottleneck).length} Bottleneck(s)
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {funnelData.map((stage, index) => {
              const widthPercent = (stage.visitors / funnelData[0].visitors) * 100
              const dropoff = index > 0 
                ? ((funnelData[index - 1].conversions - stage.visitors) / funnelData[index - 1].conversions) * 100
                : 0
              const severity = getDropoffSeverity(dropoff)
              const isBottleneck = dropoff > 30

              return (
                <motion.div
                  key={stage.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="space-y-2"
                >
                  {/* Dropoff Indicator */}
                  {index > 0 && (
                    <div className="flex items-center justify-center">
                      <div className={cn(
                        'flex items-center gap-2 px-3 py-1 rounded-full text-sm',
                        isBottleneck 
                          ? 'bg-danger-100 dark:bg-danger-900 text-danger-700 dark:text-danger-300'
                          : 'bg-neutral-100 dark:bg-neutral-900 text-muted-foreground'
                      )}>
                        <TrendingDown className="w-3 h-3" />
                        <span>{formatPercentage(dropoff, 1)} dropoff</span>
                        {isBottleneck && (
                          <Badge variant="destructive" size="sm">Bottleneck</Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Stage */}
                  <div
                    className={cn(
                      'relative overflow-hidden rounded-lg border-2 transition-all',
                      isBottleneck && 'border-danger-200 dark:border-danger-800'
                    )}
                    style={{
                      width: `${Math.max(widthPercent, 20)}%`,
                      marginLeft: index > 0 ? `${(100 - Math.max(widthPercent, 20)) / 2}%` : 0,
                    }}
                  >
                    <div className="p-4 bg-gradient-to-r from-guardian-50 to-guardian-100 dark:from-guardian-950 dark:to-guardian-900">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStageIcon(stage.name)}
                          <h4 className="font-semibold">{stage.name}</h4>
                        </div>
                        <Badge variant={severity.color as any} size="sm">
                          {severity.label}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Visitors</span>
                          <div className="font-semibold">{formatNumber(stage.visitors)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Conversions</span>
                          <div className="font-semibold">{formatNumber(stage.conversions)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Rate</span>
                          <div className="font-semibold text-sage-600">
                            {formatPercentage(stage.conversionRate)}
                          </div>
                        </div>
                      </div>

                      {stage.avgTimeSpent > 0 && (
                        <div className="mt-2 pt-2 border-t">
                          <span className="text-xs text-muted-foreground">
                            Avg time: {Math.round(stage.avgTimeSpent / 60)}min
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Bottleneck Analysis */}
      {metrics.bottlenecks.filter(b => b?.isBottleneck).length > 0 && (
        <Card className="border-alert-200 bg-alert-50 dark:bg-alert-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-alert-600" />
              Bottleneck Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.bottlenecks
                .filter(b => b?.isBottleneck)
                .map((bottleneck) => {
                  if (!bottleneck) return null
                  const stage = funnelData.find(s => s.name === bottleneck.stage)
                  
                  return (
                    <div key={bottleneck.stage} className="p-3 bg-white dark:bg-neutral-800 rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium">{bottleneck.stage}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatPercentage(bottleneck.dropoff, 1)} of users drop off at this stage
                          </p>
                        </div>
                        <Badge variant="destructive" size="sm">
                          High Dropoff
                        </Badge>
                      </div>
                      
                      {stage && stage.exitPages && stage.exitPages.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <h5 className="text-sm font-medium mb-2">Top Exit Pages</h5>
                          <div className="space-y-1">
                            {stage.exitPages.slice(0, 3).map((exit) => (
                              <div key={exit.page} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{exit.page}</span>
                                <span>{formatNumber(exit.exits)} exits</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-guardian-600" />
            Optimization Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {metrics.bottlenecks.filter(b => b?.isBottleneck).length > 0 && (
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-sage-500 mt-0.5" />
                <span>
                  Focus on optimizing the {metrics.bottlenecks.filter(b => b?.isBottleneck)[0]?.stage} stage,
                  which has the highest dropoff rate.
                </span>
              </li>
            )}
            {metrics.overallConversionRate < 5 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-alert-500 mt-0.5" />
                <span>
                  Overall conversion rate is below industry average. Consider A/B testing different
                  funnel flows or messaging.
                </span>
              </li>
            )}
            {metrics.avgDropoffRate > 25 && (
              <li className="flex items-start gap-2">
                <Info className="w-4 h-4 text-guardian-500 mt-0.5" />
                <span>
                  Average dropoff rate is high. Review user session recordings to understand
                  friction points in the funnel.
                </span>
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

export default FunnelVisualization