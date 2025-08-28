import React, { useState, useMemo } from 'react'
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { ModelPerformance } from '../hooks/useExperiments'
import { formatPercentage } from '../hooks/useBusinessMetrics'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface ModelComparisonProps {
  models: ModelPerformance[]
  className?: string
}

export const ModelComparison: React.FC<ModelComparisonProps> = ({ models, className }) => {
  const [selectedMetric, setSelectedMetric] = useState<'responseTime' | 'accuracy' | 'userSatisfaction' | 'errorRate'>('accuracy')

  // Prepare comparison data
  const comparisonData = useMemo(() => {
    return models.map(model => ({
      agent: model.agentType,
      responseTime: model.metrics.responseTime,
      accuracy: model.metrics.accuracy,
      userSatisfaction: model.metrics.userSatisfaction,
      errorRate: model.metrics.errorRate,
      throughput: model.metrics.throughput,
    }))
  }, [models])

  // Radar comparison data
  const radarData = useMemo(() => {
    const metrics = ['Speed', 'Accuracy', 'Satisfaction', 'Reliability', 'Throughput']
    
    return metrics.map(metric => {
      const dataPoint: any = { metric }
      
      models.forEach(model => {
        let value = 0
        switch (metric) {
          case 'Speed':
            value = Math.max(0, 100 - (model.metrics.responseTime / 10))
            break
          case 'Accuracy':
            value = model.metrics.accuracy
            break
          case 'Satisfaction':
            value = model.metrics.userSatisfaction
            break
          case 'Reliability':
            value = Math.max(0, 100 - model.metrics.errorRate)
            break
          case 'Throughput':
            value = Math.min(100, model.metrics.throughput * 10)
            break
        }
        dataPoint[model.agentType] = value
      })
      
      return dataPoint
    })
  }, [models])

  // Find best and worst performers
  const rankings = useMemo(() => {
    const sorted = [...models].sort((a, b) => {
      switch (selectedMetric) {
        case 'responseTime':
          return a.metrics.responseTime - b.metrics.responseTime // Lower is better
        case 'errorRate':
          return a.metrics.errorRate - b.metrics.errorRate // Lower is better
        default:
          return b.metrics[selectedMetric] - a.metrics[selectedMetric] // Higher is better
      }
    })

    return {
      best: sorted[0],
      worst: sorted[sorted.length - 1],
      sorted,
    }
  }, [models, selectedMetric])

  const getMetricLabel = (metric: string) => {
    switch (metric) {
      case 'responseTime': return 'Response Time'
      case 'accuracy': return 'Accuracy'
      case 'userSatisfaction': return 'User Satisfaction'
      case 'errorRate': return 'Error Rate'
      default: return metric
    }
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

  return (
    <div className={cn('space-y-6', className)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Model Performance Comparison</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-normal text-muted-foreground">Compare by:</span>
              <select
                className="px-3 py-1 text-sm border rounded-md bg-background"
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value as any)}
              >
                <option value="accuracy">Accuracy</option>
                <option value="responseTime">Response Time</option>
                <option value="userSatisfaction">User Satisfaction</option>
                <option value="errorRate">Error Rate</option>
              </select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Bar Chart Comparison */}
          <div>
            <h4 className="text-sm font-medium mb-3">Performance by Metric</h4>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsBarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis 
                  dataKey="agent" 
                  fontSize={12}
                  tickFormatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
                />
                <YAxis fontSize={12} />
                <Tooltip 
                  formatter={(value: any, name: string) => {
                    if (name === 'Response Time') return `${value}ms`
                    if (name === 'Error Rate') return formatPercentage(value, 2)
                    return formatPercentage(value, 1)
                  }}
                />
                <Legend />
                <Bar 
                  dataKey={selectedMetric} 
                  name={getMetricLabel(selectedMetric)}
                  fill="#3b82f6"
                  radius={[8, 8, 0, 0]}
                >
                  {comparisonData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>

          {/* Radar Chart - Overall Comparison */}
          <div>
            <h4 className="text-sm font-medium mb-3">Overall Performance Comparison</h4>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="metric" fontSize={12} />
                <PolarRadiusAxis domain={[0, 100]} fontSize={10} />
                <Tooltip />
                <Legend />
                {models.map((model, index) => (
                  <Radar
                    key={model.agentType}
                    name={model.agentType.charAt(0).toUpperCase() + model.agentType.slice(1)}
                    dataKey={model.agentType}
                    stroke={COLORS[index % COLORS.length]}
                    fill={COLORS[index % COLORS.length]}
                    fillOpacity={0.2}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Rankings Table */}
          <div>
            <h4 className="text-sm font-medium mb-3">Performance Rankings - {getMetricLabel(selectedMetric)}</h4>
            <div className="space-y-2">
              {rankings.sorted.map((model, index) => {
                const value = model.metrics[selectedMetric]
                const displayValue = selectedMetric === 'responseTime' 
                  ? `${value}ms`
                  : formatPercentage(value, selectedMetric === 'errorRate' ? 2 : 1)

                let trend = <Minus className="w-4 h-4 text-muted-foreground" />
                let trendColor = 'text-muted-foreground'
                
                if (index === 0) {
                  trend = <TrendingUp className="w-4 h-4 text-sage-500" />
                  trendColor = 'text-sage-600'
                } else if (index === rankings.sorted.length - 1) {
                  trend = <TrendingDown className="w-4 h-4 text-danger-500" />
                  trendColor = 'text-danger-600'
                }

                return (
                  <div
                    key={model.agentType}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border',
                      index === 0 && 'bg-sage-50 dark:bg-sage-950 border-sage-200',
                      index === rankings.sorted.length - 1 && 'bg-danger-50 dark:bg-danger-950 border-danger-200'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-bold text-muted-foreground">
                        #{index + 1}
                      </div>
                      <div>
                        <div className="font-medium">
                          {model.agentType.charAt(0).toUpperCase() + model.agentType.slice(1)} Agent
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {model.currentModel} v{model.version}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={cn('text-lg font-semibold', trendColor)}>
                        {displayValue}
                      </div>
                      {trend}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Detailed Comparison Table */}
          <div>
            <h4 className="text-sm font-medium mb-3">Detailed Metrics Comparison</h4>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b">
                  <tr className="text-sm">
                    <th className="text-left py-2 px-3">Agent</th>
                    <th className="text-right py-2 px-3">Response Time</th>
                    <th className="text-right py-2 px-3">Accuracy</th>
                    <th className="text-right py-2 px-3">Satisfaction</th>
                    <th className="text-right py-2 px-3">Error Rate</th>
                    <th className="text-right py-2 px-3">Throughput</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.agentType} className="border-b text-sm">
                      <td className="py-3 px-3 font-medium">
                        {model.agentType.charAt(0).toUpperCase() + model.agentType.slice(1)}
                      </td>
                      <td className="text-right py-3 px-3">
                        <Badge 
                          variant={model.metrics.responseTime < 200 ? 'sage' : 'alert'} 
                          size="sm"
                        >
                          {model.metrics.responseTime}ms
                        </Badge>
                      </td>
                      <td className="text-right py-3 px-3">
                        <Badge 
                          variant={model.metrics.accuracy >= 95 ? 'sage' : 'secondary'} 
                          size="sm"
                        >
                          {formatPercentage(model.metrics.accuracy, 1)}
                        </Badge>
                      </td>
                      <td className="text-right py-3 px-3">
                        <Badge 
                          variant={model.metrics.userSatisfaction >= 90 ? 'sage' : 'secondary'} 
                          size="sm"
                        >
                          {formatPercentage(model.metrics.userSatisfaction, 1)}
                        </Badge>
                      </td>
                      <td className="text-right py-3 px-3">
                        <Badge 
                          variant={model.metrics.errorRate < 1 ? 'sage' : 'destructive'} 
                          size="sm"
                        >
                          {formatPercentage(model.metrics.errorRate, 2)}
                        </Badge>
                      </td>
                      <td className="text-right py-3 px-3">
                        {model.metrics.throughput.toFixed(1)}/s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default ModelComparison