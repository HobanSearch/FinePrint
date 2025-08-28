import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  CheckCircle,
  XCircle,
  AlertCircle,
  Filter,
  Calendar,
  GitBranch,
  Zap,
  Target,
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
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { useExperimentHistory, type ExperimentHistory } from '../hooks/useExperiments'
import { formatCurrency, formatPercentage, formatNumber } from '../hooks/useBusinessMetrics'

interface ImprovementHistoryProps {
  className?: string
}

export const ImprovementHistory: React.FC<ImprovementHistoryProps> = ({ className }) => {
  const [filterType, setFilterType] = useState<'all' | 'success' | 'failure' | 'inconclusive'>('all')
  const [selectedTimeRange, setSelectedTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')
  
  const { data: history, isLoading } = useExperimentHistory(100)

  // Filter history based on selected filters
  const filteredHistory = useMemo(() => {
    if (!history) return []
    
    let filtered = [...history]
    
    // Filter by status
    if (filterType !== 'all') {
      filtered = filtered.filter(h => h.status === filterType)
    }
    
    // Filter by time range
    if (selectedTimeRange !== 'all') {
      const days = selectedTimeRange === '7d' ? 7 : selectedTimeRange === '30d' ? 30 : 90
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)
      filtered = filtered.filter(h => new Date(h.endDate) >= cutoffDate)
    }
    
    return filtered.sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())
  }, [history, filterType, selectedTimeRange])

  // Calculate aggregate statistics
  const stats = useMemo(() => {
    if (!filteredHistory || filteredHistory.length === 0) return null
    
    const successful = filteredHistory.filter(h => h.status === 'success')
    const failed = filteredHistory.filter(h => h.status === 'failure')
    const totalRevenue = successful.reduce((sum, h) => sum + (h.revenue_impact || 0), 0)
    const avgImprovement = successful.length > 0
      ? successful.reduce((sum, h) => sum + h.improvement, 0) / successful.length
      : 0
    const successRate = (successful.length / filteredHistory.length) * 100
    
    return {
      total: filteredHistory.length,
      successful: successful.length,
      failed: failed.length,
      inconclusive: filteredHistory.filter(h => h.status === 'inconclusive').length,
      totalRevenue,
      avgImprovement,
      successRate,
    }
  }, [filteredHistory])

  // Prepare timeline chart data
  const timelineData = useMemo(() => {
    if (!filteredHistory) return []
    
    // Group by month
    const grouped: Record<string, { success: number; failure: number; revenue: number }> = {}
    
    filteredHistory.forEach(h => {
      const month = new Date(h.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
      if (!grouped[month]) {
        grouped[month] = { success: 0, failure: 0, revenue: 0 }
      }
      
      if (h.status === 'success') {
        grouped[month].success++
        grouped[month].revenue += h.revenue_impact || 0
      } else if (h.status === 'failure') {
        grouped[month].failure++
      }
    })
    
    return Object.entries(grouped).map(([month, data]) => ({
      month,
      ...data,
    })).reverse()
  }, [filteredHistory])

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'marketing': return <TrendingUp className="w-4 h-4" />
      case 'sales': return <Users className="w-4 h-4" />
      case 'support': return <AlertCircle className="w-4 h-4" />
      case 'analytics': return <BarChart3 className="w-4 h-4" />
      default: return <Zap className="w-4 h-4" />
    }
  }

  const getStatusIcon = (status: ExperimentHistory['status']) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4 text-sage-500" />
      case 'failure': return <XCircle className="w-4 h-4 text-danger-500" />
      case 'inconclusive': return <AlertCircle className="w-4 h-4 text-alert-500" />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'marketing': return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
      case 'sales': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
      case 'support': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
      case 'analytics': return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-guardian-500" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Trophy className="w-7 h-7 text-guardian-500" />
            Improvement History
          </h2>
          <p className="text-muted-foreground">
            Track the impact of all experiments and improvements
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            className="px-3 py-2 text-sm border rounded-md bg-background"
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value as any)}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <div className="text-sm text-muted-foreground">Total Experiments</div>
                </div>
                <GitBranch className="w-8 h-8 text-guardian-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold text-sage-600">{stats.successful}</div>
                  <div className="text-sm text-muted-foreground">Successful</div>
                </div>
                <CheckCircle className="w-8 h-8 text-sage-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{formatPercentage(stats.successRate, 0)}</div>
                  <div className="text-sm text-muted-foreground">Success Rate</div>
                </div>
                <Target className="w-8 h-8 text-guardian-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold text-sage-600">
                    +{formatPercentage(stats.avgImprovement, 1)}
                  </div>
                  <div className="text-sm text-muted-foreground">Avg Improvement</div>
                </div>
                <TrendingUp className="w-8 h-8 text-sage-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold text-sage-600">
                    {formatCurrency(stats.totalRevenue)}
                  </div>
                  <div className="text-sm text-muted-foreground">Revenue Impact</div>
                </div>
                <DollarSign className="w-8 h-8 text-sage-500 opacity-20" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filter by status:</span>
            <div className="flex items-center gap-1">
              {(['all', 'success', 'failure', 'inconclusive'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setFilterType(status)}
                  className={cn(
                    'px-3 py-1 text-sm rounded-md transition-all',
                    filterType === status
                      ? 'bg-guardian-500 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Success Timeline Chart */}
      {timelineData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Experiment Success Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="success"
                  stackId="1"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.6}
                  name="Successful"
                />
                <Area
                  type="monotone"
                  dataKey="failure"
                  stackId="1"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.6}
                  name="Failed"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Experiment History List */}
      <Card>
        <CardHeader>
          <CardTitle>Experiment Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredHistory.map((experiment, index) => (
              <motion.div
                key={experiment.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  'flex gap-4 p-4 rounded-lg border transition-all hover:shadow-md',
                  experiment.status === 'success' && 'bg-sage-50 dark:bg-sage-950 border-sage-200',
                  experiment.status === 'failure' && 'bg-danger-50 dark:bg-danger-950 border-danger-200'
                )}
              >
                {/* Status Icon */}
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center',
                    experiment.status === 'success' ? 'bg-sage-100 dark:bg-sage-900' :
                    experiment.status === 'failure' ? 'bg-danger-100 dark:bg-danger-900' :
                    'bg-alert-100 dark:bg-alert-900'
                  )}>
                    {getStatusIcon(experiment.status)}
                  </div>
                  {index < filteredHistory.length - 1 && (
                    <div className="w-0.5 h-full bg-border mt-2" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={cn('text-xs', getTypeColor(experiment.type))}>
                          {experiment.type}
                        </Badge>
                        <h4 className="font-semibold">{experiment.experimentName}</h4>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(experiment.startDate).toLocaleDateString()} - {new Date(experiment.endDate).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {Math.ceil((new Date(experiment.endDate).getTime() - new Date(experiment.startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                        </span>
                      </div>
                    </div>

                    {experiment.revenue_impact && experiment.revenue_impact > 0 && (
                      <Badge variant="sage" size="sm">
                        +{formatCurrency(experiment.revenue_impact)}
                      </Badge>
                    )}
                  </div>

                  {/* Results */}
                  <div className="flex items-center gap-6 text-sm">
                    {experiment.winner && (
                      <div className="flex items-center gap-1">
                        <Trophy className="w-4 h-4 text-sage-500" />
                        <span className="font-medium">Winner: {experiment.winner}</span>
                      </div>
                    )}
                    {experiment.status === 'success' && (
                      <>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="w-4 h-4 text-sage-500" />
                          <span>+{formatPercentage(experiment.improvement, 1)} improvement</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Target className="w-4 h-4 text-guardian-500" />
                          <span>{formatPercentage(experiment.confidence, 0)} confidence</span>
                        </div>
                      </>
                    )}
                    {experiment.status === 'failure' && (
                      <span className="text-danger-600">No significant improvement detected</span>
                    )}
                    {experiment.status === 'inconclusive' && (
                      <span className="text-alert-600">Results were inconclusive</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default ImprovementHistory