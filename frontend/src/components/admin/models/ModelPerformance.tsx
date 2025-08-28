import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Brain,
  Zap,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  History,
  GitBranch,
  ArrowLeft,
  Activity,
  Cpu,
  Users,
  BarChart3,
} from 'lucide-react'
import {
  LineChart as RechartsLineChart,
  Line,
  AreaChart,
  Area,
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
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/utils'
import { ModelComparison } from './ModelComparison'
import { VersionHistory } from './VersionHistory'
import { useModelPerformance, useRollbackModel, type ModelPerformance as ModelPerf } from '../hooks/useExperiments'
import { formatNumber, formatPercentage } from '../hooks/useBusinessMetrics'

interface ModelPerformanceProps {
  className?: string
}

export const ModelPerformance: React.FC<ModelPerformanceProps> = ({ className }) => {
  const [selectedAgent, setSelectedAgent] = useState<'all' | 'marketing' | 'sales' | 'support' | 'analytics'>('all')
  const [showComparison, setShowComparison] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedModel, setSelectedModel] = useState<ModelPerf | null>(null)

  const { data: models, isLoading, refetch } = useModelPerformance()
  const rollbackModel = useRollbackModel()

  // Filter models by agent type
  const filteredModels = useMemo(() => {
    if (!models) return []
    if (selectedAgent === 'all') return models
    return models.filter(model => model.agentType === selectedAgent)
  }, [models, selectedAgent])

  // Calculate aggregate metrics
  const aggregateMetrics = useMemo(() => {
    if (!models || models.length === 0) return null

    const avgResponseTime = models.reduce((sum, m) => sum + m.metrics.responseTime, 0) / models.length
    const avgAccuracy = models.reduce((sum, m) => sum + m.metrics.accuracy, 0) / models.length
    const avgSatisfaction = models.reduce((sum, m) => sum + m.metrics.userSatisfaction, 0) / models.length
    const avgErrorRate = models.reduce((sum, m) => sum + m.metrics.errorRate, 0) / models.length

    return {
      avgResponseTime,
      avgAccuracy,
      avgSatisfaction,
      avgErrorRate,
      totalModels: models.length,
    }
  }, [models])

  const handleRollback = async (agentType: string, targetVersion: string) => {
    try {
      await rollbackModel.mutateAsync({ agentType, targetVersion })
      refetch()
    } catch (error) {
      console.error('Failed to rollback model:', error)
    }
  }

  const getAgentIcon = (type: string) => {
    switch (type) {
      case 'marketing': return <TrendingUp className="w-4 h-4" />
      case 'sales': return <Users className="w-4 h-4" />
      case 'support': return <AlertTriangle className="w-4 h-4" />
      case 'analytics': return <BarChart3 className="w-4 h-4" />
      default: return <Brain className="w-4 h-4" />
    }
  }

  const getMetricStatus = (metric: string, value: number) => {
    switch (metric) {
      case 'responseTime':
        if (value < 200) return { color: 'sage', label: 'Excellent' }
        if (value < 500) return { color: 'alert', label: 'Good' }
        return { color: 'danger', label: 'Poor' }
      case 'accuracy':
        if (value >= 95) return { color: 'sage', label: 'Excellent' }
        if (value >= 85) return { color: 'alert', label: 'Good' }
        return { color: 'danger', label: 'Poor' }
      case 'userSatisfaction':
        if (value >= 90) return { color: 'sage', label: 'Excellent' }
        if (value >= 75) return { color: 'alert', label: 'Good' }
        return { color: 'danger', label: 'Poor' }
      case 'errorRate':
        if (value < 1) return { color: 'sage', label: 'Excellent' }
        if (value < 5) return { color: 'alert', label: 'Good' }
        return { color: 'danger', label: 'Poor' }
      default:
        return { color: 'secondary', label: 'Unknown' }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-guardian-500" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Brain className="w-7 h-7 text-guardian-500" />
            Model Performance
          </h2>
          <p className="text-muted-foreground">
            Monitor and manage AI model versions across all business agents
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowComparison(!showComparison)}
            leftIcon={<GitBranch className="w-4 h-4" />}
          >
            Compare Models
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowHistory(!showHistory)}
            leftIcon={<History className="w-4 h-4" />}
          >
            Version History
          </Button>
        </div>
      </div>

      {/* Aggregate Metrics */}
      {aggregateMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{aggregateMetrics.totalModels}</div>
                  <div className="text-sm text-muted-foreground">Active Models</div>
                </div>
                <Brain className="w-8 h-8 text-guardian-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{aggregateMetrics.avgResponseTime.toFixed(0)}ms</div>
                  <div className="text-sm text-muted-foreground">Avg Response Time</div>
                </div>
                <Clock className="w-8 h-8 text-alert-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{formatPercentage(aggregateMetrics.avgAccuracy, 1)}</div>
                  <div className="text-sm text-muted-foreground">Avg Accuracy</div>
                </div>
                <CheckCircle className="w-8 h-8 text-sage-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{formatPercentage(aggregateMetrics.avgSatisfaction, 1)}</div>
                  <div className="text-sm text-muted-foreground">User Satisfaction</div>
                </div>
                <Users className="w-8 h-8 text-guardian-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold text-danger-600">{formatPercentage(aggregateMetrics.avgErrorRate, 2)}</div>
                  <div className="text-sm text-muted-foreground">Error Rate</div>
                </div>
                <AlertTriangle className="w-8 h-8 text-danger-500 opacity-20" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Agent Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filter by agent:</span>
            <div className="flex items-center gap-1">
              {(['all', 'marketing', 'sales', 'support', 'analytics'] as const).map(agent => (
                <button
                  key={agent}
                  onClick={() => setSelectedAgent(agent)}
                  className={cn(
                    'px-3 py-1 text-sm rounded-md transition-all',
                    selectedAgent === agent
                      ? 'bg-guardian-500 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {agent.charAt(0).toUpperCase() + agent.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredModels.map((model) => (
          <ModelCard
            key={model.agentType}
            model={model}
            onSelect={() => setSelectedModel(model)}
            onRollback={(version) => handleRollback(model.agentType, version)}
            getAgentIcon={getAgentIcon}
            getMetricStatus={getMetricStatus}
          />
        ))}
      </div>

      {/* Comparison View */}
      {showComparison && models && (
        <ModelComparison models={models} />
      )}

      {/* Version History */}
      {showHistory && models && (
        <VersionHistory models={models} onRollback={handleRollback} />
      )}

      {/* Model Detail Modal */}
      {selectedModel && (
        <ModelDetailModal
          model={selectedModel}
          onClose={() => setSelectedModel(null)}
          onRollback={(version) => handleRollback(selectedModel.agentType, version)}
        />
      )}
    </div>
  )
}

// Model Card Component
interface ModelCardProps {
  model: ModelPerf
  onSelect: () => void
  onRollback: (version: string) => void
  getAgentIcon: (type: string) => React.ReactNode
  getMetricStatus: (metric: string, value: number) => { color: string; label: string }
}

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  onSelect,
  onRollback,
  getAgentIcon,
  getMetricStatus,
}) => {
  // Performance radar chart data
  const radarData = [
    {
      metric: 'Speed',
      value: Math.max(0, 100 - (model.metrics.responseTime / 10)),
      fullMark: 100,
    },
    {
      metric: 'Accuracy',
      value: model.metrics.accuracy,
      fullMark: 100,
    },
    {
      metric: 'Satisfaction',
      value: model.metrics.userSatisfaction,
      fullMark: 100,
    },
    {
      metric: 'Reliability',
      value: Math.max(0, 100 - model.metrics.errorRate),
      fullMark: 100,
    },
    {
      metric: 'Throughput',
      value: Math.min(100, model.metrics.throughput * 10),
      fullMark: 100,
    },
  ]

  return (
    <Card className="cursor-pointer hover:shadow-lg transition-all" onClick={onSelect}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {getAgentIcon(model.agentType)}
            <div>
              <h3 className="font-semibold">
                {model.agentType.charAt(0).toUpperCase() + model.agentType.slice(1)} Agent
              </h3>
              <p className="text-sm text-muted-foreground">
                {model.currentModel} v{model.version}
              </p>
            </div>
          </div>
          <Badge variant="outline" size="sm">
            <Activity className="w-3 h-3 mr-1" />
            Active
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Performance Radar */}
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid strokeDasharray="3 3" />
              <PolarAngleAxis dataKey="metric" fontSize={10} />
              <PolarRadiusAxis domain={[0, 100]} fontSize={10} />
              <Radar
                name="Performance"
                dataKey="value"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.3}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Response Time</div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{model.metrics.responseTime}ms</span>
              <Badge 
                variant={getMetricStatus('responseTime', model.metrics.responseTime).color as any} 
                size="sm"
              >
                {getMetricStatus('responseTime', model.metrics.responseTime).label}
              </Badge>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Accuracy</div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{formatPercentage(model.metrics.accuracy, 1)}</span>
              <Badge 
                variant={getMetricStatus('accuracy', model.metrics.accuracy).color as any} 
                size="sm"
              >
                {getMetricStatus('accuracy', model.metrics.accuracy).label}
              </Badge>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">User Satisfaction</div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{formatPercentage(model.metrics.userSatisfaction, 1)}</span>
              <Badge 
                variant={getMetricStatus('userSatisfaction', model.metrics.userSatisfaction).color as any} 
                size="sm"
              >
                {getMetricStatus('userSatisfaction', model.metrics.userSatisfaction).label}
              </Badge>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Error Rate</div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{formatPercentage(model.metrics.errorRate, 2)}</span>
              <Badge 
                variant={getMetricStatus('errorRate', model.metrics.errorRate).color as any} 
                size="sm"
              >
                {getMetricStatus('errorRate', model.metrics.errorRate).label}
              </Badge>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            leftIcon={<History className="w-3 h-3" />}
          >
            View History
          </Button>
          {model.history.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onRollback(model.history[1].version)}
              leftIcon={<ArrowLeft className="w-3 h-3" />}
            >
              Rollback
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Model Detail Modal
interface ModelDetailModalProps {
  model: ModelPerf
  onClose: () => void
  onRollback: (version: string) => void
}

const ModelDetailModal: React.FC<ModelDetailModalProps> = ({
  model,
  onClose,
  onRollback,
}) => {
  // Performance history chart data
  const historyData = model.history.slice(-10).map(h => ({
    timestamp: new Date(h.timestamp).toLocaleDateString(),
    responseTime: h.metrics.responseTime,
    accuracy: h.metrics.accuracy,
    satisfaction: h.metrics.userSatisfaction,
  }))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">
              {model.agentType.charAt(0).toUpperCase() + model.agentType.slice(1)} Agent Details
            </h2>
            <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)] space-y-6">
          {/* Current Model Info */}
          <Card>
            <CardHeader>
              <CardTitle>Current Model</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">Model Name</span>
                  <div className="font-semibold">{model.currentModel}</div>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Version</span>
                  <div className="font-semibold">v{model.version}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance History Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Performance History</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <RechartsLineChart data={historyData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="timestamp" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="Accuracy %"
                  />
                  <Line
                    type="monotone"
                    dataKey="satisfaction"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Satisfaction %"
                  />
                </RechartsLineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Version History Table */}
          <Card>
            <CardHeader>
              <CardTitle>Version History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {model.history.slice(0, 5).map((version, index) => (
                  <div
                    key={index}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border',
                      index === 0 && 'bg-sage-50 dark:bg-sage-950 border-sage-200'
                    )}
                  >
                    <div>
                      <div className="font-medium">
                        {version.model} v{version.version}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(version.timestamp).toLocaleString()}
                      </div>
                    </div>
                    {index === 0 ? (
                      <Badge variant="sage" size="sm">Current</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRollback(version.version)}
                      >
                        Rollback
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="p-6 border-t flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default ModelPerformance