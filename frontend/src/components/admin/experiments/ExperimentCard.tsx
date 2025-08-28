import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  BarChart3,
  AlertCircle,
  Play,
  Pause,
  Square,
  ChevronRight,
  Zap,
  Trophy,
  Target,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/utils'
import type { Experiment, Variant } from '../hooks/useExperiments'
import { formatNumber, formatPercentage } from '../hooks/useBusinessMetrics'

interface ExperimentCardProps {
  experiment: Experiment
  onSelect: () => void
  onAction: (action: 'stop' | 'pause' | 'resume') => void
  wsMetrics?: Record<string, any>
  className?: string
}

export const ExperimentCard: React.FC<ExperimentCardProps> = ({
  experiment,
  onSelect,
  onAction,
  wsMetrics,
  className,
}) => {
  // Calculate time remaining
  const timeRemaining = useMemo(() => {
    if (!experiment.endDate) {
      const endDate = new Date(experiment.startDate)
      endDate.setDate(endDate.getDate() + experiment.duration)
      const now = new Date()
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return daysLeft > 0 ? `${daysLeft} days` : 'Ending soon'
    }
    const endDate = new Date(experiment.endDate)
    const now = new Date()
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysLeft > 0 ? `${daysLeft} days` : 'Completed'
  }, [experiment])

  // Find control and best variant
  const controlVariant = experiment.variants.find(v => v.isControl)
  const bestVariant = useMemo(() => {
    return experiment.variants.reduce((best, variant) => {
      if (!variant.isControl && variant.metrics.conversionRate > best.metrics.conversionRate) {
        return variant
      }
      return best
    }, experiment.variants[0])
  }, [experiment.variants])

  // Calculate overall progress
  const progress = (experiment.currentSampleSize / experiment.sampleSize) * 100

  // Get real-time metrics if available
  const realtimeMetrics = wsMetrics?.[experiment.id]

  const getTypeColor = (type: Experiment['type']) => {
    switch (type) {
      case 'marketing': return 'text-purple-600 bg-purple-100 dark:bg-purple-900'
      case 'sales': return 'text-blue-600 bg-blue-100 dark:bg-blue-900'
      case 'support': return 'text-green-600 bg-green-100 dark:bg-green-900'
      case 'analytics': return 'text-orange-600 bg-orange-100 dark:bg-orange-900'
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900'
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
      default: return <Zap className="w-4 h-4" />
    }
  }

  return (
    <Card 
      className={cn(
        'relative overflow-hidden transition-all hover:shadow-lg cursor-pointer',
        experiment.status === 'running' && 'ring-2 ring-sage-500/20',
        className
      )}
      onClick={onSelect}
    >
      {/* Status indicator strip */}
      <div className={cn(
        'absolute top-0 left-0 right-0 h-1',
        experiment.status === 'running' && 'bg-sage-500',
        experiment.status === 'paused' && 'bg-alert-500',
        experiment.status === 'completed' && 'bg-guardian-500',
      )} />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className={cn('p-1 rounded', getTypeColor(experiment.type))}>
                {getTypeIcon(experiment.type)}
              </div>
              <h3 className="font-semibold text-foreground">{experiment.name}</h3>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-1">
              {experiment.hypothesis || experiment.description}
            </p>
          </div>
          <Badge variant={getStatusColor(experiment.status) as any} size="sm">
            {experiment.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Variants Performance */}
        <div className="space-y-2">
          {experiment.variants.map((variant) => (
            <VariantMiniCard
              key={variant.id}
              variant={variant}
              isWinner={variant.id === experiment.winner}
              realtimeData={realtimeMetrics?.variants?.[variant.id]}
            />
          ))}
        </div>

        {/* Progress and Sample Size */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Sample Progress</span>
            <span className="font-medium">
              {formatNumber(experiment.currentSampleSize)} / {formatNumber(experiment.sampleSize)}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Statistics Row */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Confidence</div>
            <div className={cn(
              'text-sm font-semibold',
              experiment.confidence >= 95 ? 'text-sage-600' :
              experiment.confidence >= 90 ? 'text-alert-600' : 'text-muted-foreground'
            )}>
              {formatPercentage(experiment.confidence, 0)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Time Left</div>
            <div className="text-sm font-semibold flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" />
              {timeRemaining}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Improvement</div>
            <div className={cn(
              'text-sm font-semibold flex items-center justify-center gap-1',
              bestVariant && !bestVariant.isControl && bestVariant.metrics.improvement > 0
                ? 'text-sage-600' : 'text-muted-foreground'
            )}>
              {bestVariant && !bestVariant.isControl ? (
                <>
                  {bestVariant.metrics.improvement > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {formatPercentage(Math.abs(bestVariant.metrics.improvement), 0)}
                </>
              ) : (
                '-'
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {experiment.status !== 'completed' && (
          <div className="flex items-center gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
            {experiment.status === 'running' ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onAction('pause')}
                  leftIcon={<Pause className="w-3 h-3" />}
                >
                  Pause
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onAction('stop')}
                  leftIcon={<Square className="w-3 h-3" />}
                >
                  Stop
                </Button>
              </>
            ) : experiment.status === 'paused' ? (
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={() => onAction('resume')}
                leftIcon={<Play className="w-3 h-3" />}
              >
                Resume
              </Button>
            ) : null}
          </div>
        )}

        {/* View Details */}
        <button className="w-full flex items-center justify-center gap-2 text-sm text-guardian-600 hover:text-guardian-700 font-medium pt-2">
          View Details
          <ChevronRight className="w-4 h-4" />
        </button>
      </CardContent>
    </Card>
  )
}

// Mini Variant Card Component
interface VariantMiniCardProps {
  variant: Variant
  isWinner?: boolean
  realtimeData?: any
}

const VariantMiniCard: React.FC<VariantMiniCardProps> = ({ 
  variant, 
  isWinner,
  realtimeData 
}) => {
  const conversionRate = realtimeData?.conversionRate ?? variant.metrics.conversionRate
  const improvement = realtimeData?.improvement ?? variant.metrics.improvement

  return (
    <div className={cn(
      'flex items-center justify-between p-2 rounded-lg border transition-all',
      isWinner && 'border-sage-500 bg-sage-50 dark:bg-sage-950',
      variant.isControl && 'bg-neutral-50 dark:bg-neutral-900',
    )}>
      <div className="flex items-center gap-2">
        {isWinner && <Trophy className="w-4 h-4 text-sage-500" />}
        {variant.isControl && <Target className="w-4 h-4 text-muted-foreground" />}
        <div>
          <div className="font-medium text-sm">{variant.name}</div>
          <div className="text-xs text-muted-foreground">
            {variant.allocation}% traffic
          </div>
        </div>
      </div>
      
      <div className="text-right">
        <div className="font-semibold text-sm">
          {formatPercentage(conversionRate)}
        </div>
        {!variant.isControl && (
          <div className={cn(
            'text-xs flex items-center gap-1 justify-end',
            improvement > 0 ? 'text-sage-600' : 'text-danger-600'
          )}>
            {improvement > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {formatPercentage(Math.abs(improvement), 0)}
          </div>
        )}
      </div>
    </div>
  )
}

export default ExperimentCard