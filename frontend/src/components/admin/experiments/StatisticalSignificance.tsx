import React, { useMemo } from 'react'
import {
  LineChart as RechartsLineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/utils'
import type { Experiment } from '../hooks/useExperiments'
import { calculateStatisticalSignificance } from '../hooks/useExperiments'
import { formatPercentage, formatNumber } from '../hooks/useBusinessMetrics'
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  Calculator,
  Target,
  Activity,
  Zap,
} from 'lucide-react'

interface StatisticalSignificanceProps {
  experiment: Experiment
  className?: string
}

export const StatisticalSignificance: React.FC<StatisticalSignificanceProps> = ({
  experiment,
  className,
}) => {
  // Calculate statistical significance for each variant
  const significanceData = useMemo(() => {
    const control = experiment.variants.find(v => v.isControl)
    if (!control) return []

    return experiment.variants
      .filter(v => !v.isControl)
      .map(variant => {
        const stats = calculateStatisticalSignificance(
          control.metrics.conversions,
          control.metrics.impressions,
          variant.metrics.conversions,
          variant.metrics.impressions
        )

        return {
          variantName: variant.name,
          variantId: variant.id,
          ...stats,
          sampleSize: variant.metrics.impressions,
          requiredSampleSize: experiment.sampleSize / experiment.variants.length,
        }
      })
  }, [experiment])

  // Generate confidence interval visualization data
  const confidenceIntervalData = useMemo(() => {
    const control = experiment.variants.find(v => v.isControl)
    if (!control) return []

    return experiment.variants.map(variant => {
      const rate = variant.metrics.conversionRate
      const n = variant.metrics.impressions
      
      // Calculate confidence interval (95%)
      const z = 1.96 // 95% confidence
      const standardError = Math.sqrt((rate * (100 - rate)) / n)
      const marginOfError = z * standardError
      
      return {
        name: variant.name,
        rate,
        lowerBound: Math.max(0, rate - marginOfError),
        upperBound: Math.min(100, rate + marginOfError),
        isControl: variant.isControl,
        isWinner: variant.isWinner,
      }
    })
  }, [experiment])

  // Power analysis
  const powerAnalysis = useMemo(() => {
    const currentPower = Math.min(
      100,
      (experiment.currentSampleSize / experiment.sampleSize) * 100
    )
    
    const control = experiment.variants.find(v => v.isControl)
    const bestVariant = experiment.variants
      .filter(v => !v.isControl)
      .reduce((best, v) => {
        if (!best || v.metrics.conversionRate > best.metrics.conversionRate) {
          return v
        }
        return best
      }, null)

    const observedEffect = bestVariant && control
      ? Math.abs(bestVariant.metrics.conversionRate - control.metrics.conversionRate)
      : 0

    const detectable = observedEffect >= experiment.minimumDetectableEffect

    return {
      currentPower,
      observedEffect,
      minimumDetectableEffect: experiment.minimumDetectableEffect,
      detectable,
      remainingSamples: Math.max(0, experiment.sampleSize - experiment.currentSampleSize),
    }
  }, [experiment])

  // Historical confidence trend (mock data for demonstration)
  const confidenceTrend = useMemo(() => {
    const days = Math.min(14, experiment.duration)
    return Array.from({ length: days }, (_, i) => {
      const progress = (i + 1) / days
      return {
        day: i + 1,
        confidence: Math.min(99, 50 + progress * 50 + Math.random() * 10),
        sampleSize: Math.floor(experiment.sampleSize * progress),
      }
    })
  }, [experiment])

  const getSignificanceLevel = (pValue: number) => {
    if (pValue < 0.01) return { label: 'Very Strong', color: 'sage' }
    if (pValue < 0.05) return { label: 'Strong', color: 'guardian' }
    if (pValue < 0.10) return { label: 'Moderate', color: 'alert' }
    return { label: 'Weak', color: 'secondary' }
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Statistical Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Calculator className="w-5 h-5 text-guardian-500" />
              <Badge 
                variant={experiment.confidence >= 95 ? 'sage' : 'secondary'} 
                size="sm"
              >
                {experiment.confidence >= 95 ? 'Significant' : 'Not Significant'}
              </Badge>
            </div>
            <div className="text-2xl font-bold">{formatPercentage(experiment.confidence, 1)}</div>
            <div className="text-sm text-muted-foreground">Statistical Confidence</div>
            <Progress 
              value={experiment.confidence} 
              className="h-1 mt-2"
              indicatorClassName={cn(
                experiment.confidence >= 95 ? 'bg-sage-500' :
                experiment.confidence >= 90 ? 'bg-alert-500' : 'bg-neutral-400'
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Target className="w-5 h-5 text-alert-500" />
              <Badge 
                variant={powerAnalysis.detectable ? 'sage' : 'alert'} 
                size="sm"
              >
                {powerAnalysis.detectable ? 'Detectable' : 'Below MDE'}
              </Badge>
            </div>
            <div className="text-2xl font-bold">{formatPercentage(powerAnalysis.observedEffect)}</div>
            <div className="text-sm text-muted-foreground">
              Observed Effect (MDE: {formatPercentage(powerAnalysis.minimumDetectableEffect)})
            </div>
            <Progress 
              value={(powerAnalysis.observedEffect / powerAnalysis.minimumDetectableEffect) * 100} 
              className="h-1 mt-2"
              indicatorClassName={cn(
                powerAnalysis.detectable ? 'bg-sage-500' : 'bg-alert-500'
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-5 h-5 text-sage-500" />
              <span className="text-sm text-muted-foreground">
                {formatNumber(powerAnalysis.remainingSamples)} left
              </span>
            </div>
            <div className="text-2xl font-bold">{formatPercentage(powerAnalysis.currentPower, 0)}</div>
            <div className="text-sm text-muted-foreground">Statistical Power</div>
            <Progress 
              value={powerAnalysis.currentPower} 
              className="h-1 mt-2"
              indicatorClassName="bg-sage-500"
            />
          </CardContent>
        </Card>
      </div>

      {/* Confidence Intervals Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Confidence Intervals (95%)</span>
            <Badge variant="outline" size="sm">
              α = 0.05
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {confidenceIntervalData.map((variant) => (
              <div key={variant.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className={cn(
                    'font-medium',
                    variant.isControl && 'text-muted-foreground',
                    variant.isWinner && 'text-sage-600'
                  )}>
                    {variant.name}
                    {variant.isControl && ' (Control)'}
                    {variant.isWinner && ' ⭐'}
                  </span>
                  <span className="text-muted-foreground">
                    {formatPercentage(variant.lowerBound, 1)} - {formatPercentage(variant.upperBound, 1)}
                  </span>
                </div>
                <div className="relative h-6 bg-neutral-100 dark:bg-neutral-800 rounded">
                  <div 
                    className={cn(
                      'absolute h-full rounded transition-all',
                      variant.isControl ? 'bg-neutral-400' :
                      variant.isWinner ? 'bg-sage-500' : 'bg-guardian-500'
                    )}
                    style={{
                      left: `${variant.lowerBound}%`,
                      width: `${variant.upperBound - variant.lowerBound}%`,
                      opacity: 0.3,
                    }}
                  />
                  <div 
                    className={cn(
                      'absolute h-full w-0.5',
                      variant.isControl ? 'bg-neutral-600' :
                      variant.isWinner ? 'bg-sage-600' : 'bg-guardian-600'
                    )}
                    style={{
                      left: `${variant.rate}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Significance Tests */}
      <Card>
        <CardHeader>
          <CardTitle>Statistical Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {significanceData.map((test) => {
              const level = getSignificanceLevel(test.pValue)
              return (
                <div key={test.variantId} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">{test.variantName} vs Control</h4>
                    <div className="flex items-center gap-2">
                      <Badge variant={level.color as any} size="sm">
                        {level.label}
                      </Badge>
                      {test.isSignificant ? (
                        <CheckCircle className="w-4 h-4 text-sage-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-alert-500" />
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">P-Value</span>
                      <div className="font-semibold">{test.pValue.toFixed(4)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Confidence</span>
                      <div className="font-semibold">{formatPercentage(test.confidence, 1)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Improvement</span>
                      <div className={cn(
                        'font-semibold',
                        test.improvement > 0 ? 'text-sage-600' : 'text-danger-600'
                      )}>
                        {test.improvement > 0 ? '+' : ''}{formatPercentage(test.improvement, 1)}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sample Size</span>
                      <div className="font-semibold">
                        {formatNumber(test.sampleSize)} / {formatNumber(test.requiredSampleSize)}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Confidence Trend Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Confidence Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={confidenceTrend}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis 
                dataKey="day" 
                fontSize={12}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                label={{ value: 'Days', position: 'insideBottom', offset: -5 }}
              />
              <YAxis 
                fontSize={12}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                label={{ value: 'Confidence %', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
                formatter={(value: any) => formatPercentage(value, 1)}
              />
              <ReferenceLine 
                y={95} 
                stroke="#10b981" 
                strokeDasharray="5 5" 
                label="95% Threshold"
              />
              <Area
                type="monotone"
                dataKey="confidence"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.3}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card className="border-guardian-200 bg-guardian-50 dark:bg-guardian-950">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-guardian-600" />
            Statistical Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {experiment.confidence >= 95 && (
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-sage-500 mt-0.5" />
                <span>The experiment has reached statistical significance. You can confidently make a decision.</span>
              </li>
            )}
            {experiment.confidence < 95 && experiment.currentSampleSize >= experiment.sampleSize * 0.8 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-alert-500 mt-0.5" />
                <span>Approaching sample size limit without significance. Consider extending the experiment or accepting inconclusive results.</span>
              </li>
            )}
            {powerAnalysis.observedEffect < powerAnalysis.minimumDetectableEffect && (
              <li className="flex items-start gap-2">
                <Info className="w-4 h-4 text-guardian-500 mt-0.5" />
                <span>The observed effect is below the minimum detectable effect. The experiment may need more samples to detect smaller differences.</span>
              </li>
            )}
            {experiment.confidence >= 90 && experiment.confidence < 95 && (
              <li className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-alert-500 mt-0.5" />
                <span>Confidence is approaching significance. Continue running to reach 95% confidence or accept directional results.</span>
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

export default StatisticalSignificance