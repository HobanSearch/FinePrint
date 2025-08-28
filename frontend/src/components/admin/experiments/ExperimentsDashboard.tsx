import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Flask,
  Play,
  Pause,
  Square,
  TrendingUp,
  Users,
  Clock,
  BarChart3,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Plus,
  Filter,
  Download,
  ArrowUp,
  ArrowDown,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/utils'
import { ExperimentCard } from './ExperimentCard'
import { VariantComparison } from './VariantComparison'
import { StatisticalSignificance } from './StatisticalSignificance'
import { useExperimentWebSocket } from '../hooks/useWebSocket'
import { 
  useActiveExperiments, 
  useStartExperiment,
  useStopExperiment,
  usePauseExperiment,
  useResumeExperiment,
  type Experiment 
} from '../hooks/useExperiments'
import { formatNumber, formatPercentage } from '../hooks/useBusinessMetrics'

interface ExperimentsDashboardProps {
  className?: string
}

export const ExperimentsDashboard: React.FC<ExperimentsDashboardProps> = ({ className }) => {
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'marketing' | 'sales' | 'support' | 'analytics'>('all')
  const [showNewExperimentModal, setShowNewExperimentModal] = useState(false)
  
  // Real-time WebSocket connection
  const { isConnected, experiments: wsExperiments, metrics: wsMetrics } = useExperimentWebSocket()
  
  // API hooks
  const { data: apiExperiments, isLoading, refetch } = useActiveExperiments()
  const startExperiment = useStartExperiment()
  const stopExperiment = useStopExperiment()
  const pauseExperiment = usePauseExperiment()
  const resumeExperiment = useResumeExperiment()

  // Merge WebSocket and API data
  const experiments = useMemo(() => {
    if (wsExperiments.length > 0) return wsExperiments
    return apiExperiments || []
  }, [wsExperiments, apiExperiments])

  // Filter experiments
  const filteredExperiments = useMemo(() => {
    if (filterType === 'all') return experiments
    return experiments.filter(exp => exp.type === filterType)
  }, [experiments, filterType])

  // Calculate statistics
  const stats = useMemo(() => {
    const running = experiments.filter(e => e.status === 'running').length
    const paused = experiments.filter(e => e.status === 'paused').length
    const completed = experiments.filter(e => e.status === 'completed').length
    
    const totalImprovement = experiments
      .filter(e => e.winner)
      .reduce((sum, e) => {
        const winner = e.variants.find(v => v.id === e.winner)
        return sum + (winner?.metrics.improvement || 0)
      }, 0)

    const avgConfidence = experiments
      .filter(e => e.status === 'running')
      .reduce((sum, e, _, arr) => sum + e.confidence / arr.length, 0)

    return {
      total: experiments.length,
      running,
      paused,
      completed,
      totalImprovement,
      avgConfidence,
    }
  }, [experiments])

  const handleExperimentAction = async (experimentId: string, action: 'stop' | 'pause' | 'resume') => {
    try {
      switch (action) {
        case 'stop':
          await stopExperiment.mutateAsync(experimentId)
          break
        case 'pause':
          await pauseExperiment.mutateAsync(experimentId)
          break
        case 'resume':
          await resumeExperiment.mutateAsync(experimentId)
          break
      }
      refetch()
    } catch (error) {
      console.error(`Failed to ${action} experiment:`, error)
    }
  }

  const getStatusColor = (status: Experiment['status']) => {
    switch (status) {
      case 'running': return 'sage'
      case 'paused': return 'alert'
      case 'completed': return 'guardian'
      case 'draft': return 'secondary'
      default: return 'outline'
    }
  }

  const getTypeIcon = (type: Experiment['type']) => {
    switch (type) {
      case 'marketing': return <TrendingUp className="w-4 h-4" />
      case 'sales': return <Users className="w-4 h-4" />
      case 'support': return <AlertCircle className="w-4 h-4" />
      case 'analytics': return <BarChart3 className="w-4 h-4" />
      default: return <Flask className="w-4 h-4" />
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
            <Flask className="w-7 h-7 text-guardian-500" />
            A/B Testing Dashboard
          </h2>
          <p className="text-muted-foreground">
            Monitor and manage your experiments in real-time
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
            <div className={cn(
              'w-2 h-2 rounded-full animate-pulse',
              isConnected ? 'bg-sage-500' : 'bg-danger-500'
            )} />
            <span className="text-sm text-muted-foreground">
              {isConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
          
          <Button
            onClick={() => setShowNewExperimentModal(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            New Experiment
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total Experiments</div>
              </div>
              <Flask className="w-8 h-8 text-guardian-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-sage-600">{stats.running}</div>
                <div className="text-sm text-muted-foreground">Running</div>
              </div>
              <Play className="w-8 h-8 text-sage-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-alert-600">{stats.paused}</div>
                <div className="text-sm text-muted-foreground">Paused</div>
              </div>
              <Pause className="w-8 h-8 text-alert-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-guardian-600">{stats.completed}</div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
              <CheckCircle className="w-8 h-8 text-guardian-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-sage-600">
                  +{formatPercentage(stats.totalImprovement / Math.max(stats.completed, 1))}
                </div>
                <div className="text-sm text-muted-foreground">Avg Improvement</div>
              </div>
              <TrendingUp className="w-8 h-8 text-sage-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filter by type:</span>
              <div className="flex items-center gap-1">
                {(['all', 'marketing', 'sales', 'support', 'analytics'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={cn(
                      'px-3 py-1 text-sm rounded-md transition-all',
                      filterType === type
                        ? 'bg-guardian-500 text-white'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-4 h-4" />}
            >
              Export Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Experiments Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredExperiments.map(experiment => (
          <ExperimentCard
            key={experiment.id}
            experiment={experiment}
            onSelect={() => setSelectedExperiment(experiment)}
            onAction={(action) => handleExperimentAction(experiment.id, action)}
            wsMetrics={wsMetrics}
          />
        ))}
        
        {filteredExperiments.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center">
              <Flask className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No experiments found</h3>
              <p className="text-muted-foreground mb-4">
                {filterType === 'all' 
                  ? 'Start your first experiment to begin optimizing'
                  : `No ${filterType} experiments are currently active`}
              </p>
              <Button
                onClick={() => setShowNewExperimentModal(true)}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Create Experiment
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Selected Experiment Detail Modal */}
      <AnimatePresence>
        {selectedExperiment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedExperiment(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getTypeIcon(selectedExperiment.type)}
                    <div>
                      <h2 className="text-xl font-bold">{selectedExperiment.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {selectedExperiment.hypothesis}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={getStatusColor(selectedExperiment.status) as any}>
                      {selectedExperiment.status}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setSelectedExperiment(null)}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                <div className="space-y-6">
                  {/* Variant Comparison */}
                  <VariantComparison 
                    variants={selectedExperiment.variants}
                    primaryMetric={selectedExperiment.primaryMetric}
                  />
                  
                  {/* Statistical Significance */}
                  <StatisticalSignificance
                    experiment={selectedExperiment}
                  />
                  
                  {/* Experiment Details */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Experiment Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Start Date:</span>
                          <span className="ml-2 font-medium">
                            {new Date(selectedExperiment.startDate).toLocaleDateString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Duration:</span>
                          <span className="ml-2 font-medium">
                            {selectedExperiment.duration} days
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sample Size:</span>
                          <span className="ml-2 font-medium">
                            {formatNumber(selectedExperiment.currentSampleSize)} / {formatNumber(selectedExperiment.sampleSize)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">MDE:</span>
                          <span className="ml-2 font-medium">
                            {formatPercentage(selectedExperiment.minimumDetectableEffect)}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Success Criteria:</span>
                          <p className="mt-1 font-medium">
                            {selectedExperiment.successCriteria}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
              
              <div className="p-6 border-t flex justify-between">
                <div className="flex items-center gap-3">
                  {selectedExperiment.status === 'running' && (
                    <>
                      <Button
                        variant="outline"
                        leftIcon={<Pause className="w-4 h-4" />}
                        onClick={() => handleExperimentAction(selectedExperiment.id, 'pause')}
                      >
                        Pause
                      </Button>
                      <Button
                        variant="destructive"
                        leftIcon={<Square className="w-4 h-4" />}
                        onClick={() => handleExperimentAction(selectedExperiment.id, 'stop')}
                      >
                        Stop
                      </Button>
                    </>
                  )}
                  {selectedExperiment.status === 'paused' && (
                    <Button
                      leftIcon={<Play className="w-4 h-4" />}
                      onClick={() => handleExperimentAction(selectedExperiment.id, 'resume')}
                    >
                      Resume
                    </Button>
                  )}
                </div>
                <Button variant="outline" onClick={() => setSelectedExperiment(null)}>
                  Close
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Experiment Modal */}
      <AnimatePresence>
        {showNewExperimentModal && (
          <NewExperimentModal
            onClose={() => setShowNewExperimentModal(false)}
            onSubmit={async (data) => {
              await startExperiment.mutateAsync(data)
              setShowNewExperimentModal(false)
              refetch()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// New Experiment Modal Component
interface NewExperimentModalProps {
  onClose: () => void
  onSubmit: (data: any) => Promise<void>
}

const NewExperimentModal: React.FC<NewExperimentModalProps> = ({ onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    name: '',
    type: 'marketing' as Experiment['type'],
    hypothesis: '',
    primaryMetric: 'conversion_rate',
    duration: 14,
    variants: [
      { name: 'Control', allocation: 50, isControl: true },
      { name: 'Variant A', allocation: 50, isControl: false },
    ],
    successCriteria: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(formData)
  }

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
        className="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl max-w-2xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold">Create New Experiment</h2>
          </div>
          
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="block text-sm font-medium mb-2">Experiment Name</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded-lg"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Type</label>
              <select
                className="w-full px-3 py-2 border rounded-lg"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              >
                <option value="marketing">Marketing</option>
                <option value="sales">Sales</option>
                <option value="support">Support</option>
                <option value="analytics">Analytics</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Hypothesis</label>
              <textarea
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                value={formData.hypothesis}
                onChange={(e) => setFormData({ ...formData, hypothesis: e.target.value })}
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Primary Metric</label>
              <select
                className="w-full px-3 py-2 border rounded-lg"
                value={formData.primaryMetric}
                onChange={(e) => setFormData({ ...formData, primaryMetric: e.target.value })}
              >
                <option value="conversion_rate">Conversion Rate</option>
                <option value="revenue">Revenue</option>
                <option value="engagement">Engagement</option>
                <option value="retention">Retention</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Duration (days)</label>
              <input
                type="number"
                className="w-full px-3 py-2 border rounded-lg"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                min="7"
                max="90"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Success Criteria</label>
              <textarea
                className="w-full px-3 py-2 border rounded-lg"
                rows={2}
                value={formData.successCriteria}
                onChange={(e) => setFormData({ ...formData, successCriteria: e.target.value })}
                required
              />
            </div>
          </div>
          
          <div className="p-6 border-t flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" leftIcon={<Zap className="w-4 h-4" />}>
              Start Experiment
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

export default ExperimentsDashboard