import React, { useMemo } from 'react'
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { Variant } from '../hooks/useExperiments'
import { formatNumber, formatPercentage } from '../hooks/useBusinessMetrics'
import { Trophy, Target, TrendingUp, TrendingDown, Users, MousePointer } from 'lucide-react'

interface VariantComparisonProps {
  variants: Variant[]
  primaryMetric: string
  className?: string
}

export const VariantComparison: React.FC<VariantComparisonProps> = ({
  variants,
  primaryMetric,
  className,
}) => {
  // Prepare chart data
  const chartData = useMemo(() => {
    return variants.map(variant => ({
      name: variant.name,
      conversionRate: variant.metrics.conversionRate,
      impressions: variant.metrics.impressions,
      conversions: variant.metrics.conversions,
      improvement: variant.metrics.improvement,
      isControl: variant.isControl,
      isWinner: variant.isWinner,
    }))
  }, [variants])

  // Find best performing variant
  const bestVariant = useMemo(() => {
    return variants.reduce((best, variant) => {
      if (variant.metrics.conversionRate > best.metrics.conversionRate) {
        return variant
      }
      return best
    }, variants[0])
  }, [variants])

  // Calculate overall statistics
  const stats = useMemo(() => {
    const totalImpressions = variants.reduce((sum, v) => sum + v.metrics.impressions, 0)
    const totalConversions = variants.reduce((sum, v) => sum + v.metrics.conversions, 0)
    const avgConversionRate = totalImpressions > 0 ? (totalConversions / totalImpressions) * 100 : 0
    
    const control = variants.find(v => v.isControl)
    const bestNonControl = variants
      .filter(v => !v.isControl)
      .reduce((best, v) => {
        if (!best || v.metrics.conversionRate > best.metrics.conversionRate) {
          return v
        }
        return best
      }, null as Variant | null)

    return {
      totalImpressions,
      totalConversions,
      avgConversionRate,
      control,
      bestNonControl,
      lift: bestNonControl && control 
        ? ((bestNonControl.metrics.conversionRate - control.metrics.conversionRate) / control.metrics.conversionRate) * 100
        : 0,
    }
  }, [variants])

  const getVariantColor = (variant: any) => {
    if (variant.isWinner) return '#10b981' // sage-500
    if (variant.isControl) return '#6b7280' // neutral-500
    return '#3b82f6' // guardian-500
  }

  const formatMetricName = (metric: string) => {
    return metric
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatNumber(stats.totalImpressions)}</div>
                <div className="text-sm text-muted-foreground">Total Impressions</div>
              </div>
              <Users className="w-8 h-8 text-guardian-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatNumber(stats.totalConversions)}</div>
                <div className="text-sm text-muted-foreground">Total Conversions</div>
              </div>
              <MousePointer className="w-8 h-8 text-sage-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatPercentage(stats.avgConversionRate)}</div>
                <div className="text-sm text-muted-foreground">Avg Conversion Rate</div>
              </div>
              <TrendingUp className="w-8 h-8 text-alert-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className={cn(
                  'text-2xl font-bold flex items-center gap-1',
                  stats.lift > 0 ? 'text-sage-600' : 'text-danger-600'
                )}>
                  {stats.lift > 0 ? '+' : ''}{formatPercentage(stats.lift, 1)}
                </div>
                <div className="text-sm text-muted-foreground">Best Lift</div>
              </div>
              {stats.lift > 0 ? (
                <TrendingUp className="w-8 h-8 text-sage-500 opacity-20" />
              ) : (
                <TrendingDown className="w-8 h-8 text-danger-500 opacity-20" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Variant Comparison Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Variant Performance - {formatMetricName(primaryMetric)}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" size="sm">
                <Target className="w-3 h-3 mr-1" />
                Control
              </Badge>
              {bestVariant && !bestVariant.isControl && (
                <Badge variant="sage" size="sm">
                  <Trophy className="w-3 h-3 mr-1" />
                  Leading
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <RechartsBarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis 
                dataKey="name" 
                fontSize={12}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                fontSize={12}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px'
                }}
                formatter={(value: any) => formatPercentage(value)}
              />
              <Bar 
                dataKey="conversionRate" 
                name="Conversion Rate"
                radius={[8, 8, 0, 0]}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getVariantColor(entry)} />
                ))}
              </Bar>
            </RechartsBarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detailed Variant Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-sm">
                  <th className="text-left py-2 px-3">Variant</th>
                  <th className="text-right py-2 px-3">Allocation</th>
                  <th className="text-right py-2 px-3">Impressions</th>
                  <th className="text-right py-2 px-3">Conversions</th>
                  <th className="text-right py-2 px-3">Conv. Rate</th>
                  <th className="text-right py-2 px-3">Confidence</th>
                  <th className="text-right py-2 px-3">Improvement</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => (
                  <tr 
                    key={variant.id}
                    className={cn(
                      'border-b text-sm',
                      variant.isWinner && 'bg-sage-50 dark:bg-sage-950',
                      variant.isControl && 'bg-neutral-50 dark:bg-neutral-900'
                    )}
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {variant.isWinner && <Trophy className="w-4 h-4 text-sage-500" />}
                        {variant.isControl && <Target className="w-4 h-4 text-muted-foreground" />}
                        <span className="font-medium">{variant.name}</span>
                      </div>
                    </td>
                    <td className="text-right py-3 px-3">
                      {variant.allocation}%
                    </td>
                    <td className="text-right py-3 px-3">
                      {formatNumber(variant.metrics.impressions)}
                    </td>
                    <td className="text-right py-3 px-3">
                      {formatNumber(variant.metrics.conversions)}
                    </td>
                    <td className="text-right py-3 px-3 font-semibold">
                      {formatPercentage(variant.metrics.conversionRate)}
                    </td>
                    <td className="text-right py-3 px-3">
                      <Badge 
                        variant={
                          variant.metrics.confidence >= 95 ? 'sage' :
                          variant.metrics.confidence >= 90 ? 'secondary' : 'outline'
                        }
                        size="sm"
                      >
                        {formatPercentage(variant.metrics.confidence, 0)}
                      </Badge>
                    </td>
                    <td className="text-right py-3 px-3">
                      {!variant.isControl ? (
                        <div className={cn(
                          'flex items-center justify-end gap-1',
                          variant.metrics.improvement > 0 ? 'text-sage-600' : 'text-danger-600'
                        )}>
                          {variant.metrics.improvement > 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {formatPercentage(Math.abs(variant.metrics.improvement), 1)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default VariantComparison