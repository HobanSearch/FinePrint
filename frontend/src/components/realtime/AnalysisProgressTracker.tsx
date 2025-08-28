import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  FileText, 
  Zap, 
  Brain, 
  Shield, 
  CheckCircle, 
  XCircle,
  Clock,
  Users,
  Activity,
  AlertTriangle
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Progress } from '@/components/ui/Progress'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useWebSocket, useAnalysis } from '@/stores'
import { cn } from '@/lib/utils'

interface AnalysisStep {
  id: string
  label: string
  description: string
  icon: React.ComponentType<any>
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress: number
  estimatedTime?: number
  actualTime?: number
}

interface QueueStatus {
  position: number
  totalInQueue: number
  estimatedWaitTime: number
  processingCapacity: number
  averageProcessingTime: number
}

export interface AnalysisProgressTrackerProps {
  analysisId: string
  documentName?: string
  onCancel?: () => void
  onComplete?: (result: any) => void
  className?: string
}

export const AnalysisProgressTracker: React.FC<AnalysisProgressTrackerProps> = ({
  analysisId,
  documentName = 'Document',
  onCancel,
  onComplete,
  className,
}) => {
  const { isConnected, lastActivity } = useWebSocket()
  const { analysisProgress } = useAnalysis()
  
  const [steps, setSteps] = React.useState<AnalysisStep[]>([
    {
      id: 'queue',
      label: 'Queued for Processing',
      description: 'Document is in the processing queue',
      icon: Clock,
      status: 'processing',
      progress: 0,
    },
    {
      id: 'preprocessing',
      label: 'Document Processing',
      description: 'Extracting and parsing document content',
      icon: FileText,
      status: 'pending',
      progress: 0,
      estimatedTime: 15000, // 15 seconds
    },
    {
      id: 'analysis',
      label: 'AI Analysis',
      description: 'Analyzing content with specialized AI models',
      icon: Brain,
      status: 'pending',
      progress: 0,
      estimatedTime: 45000, // 45 seconds
    },
    {
      id: 'risk_scoring',
      label: 'Risk Assessment',
      description: 'Calculating risk scores and severity levels',
      icon: Shield,
      status: 'pending',
      progress: 0,
      estimatedTime: 10000, // 10 seconds
    },
    {
      id: 'finalization',
      label: 'Finalizing Results',
      description: 'Generating report and recommendations',
      icon: Zap,
      status: 'pending',
      progress: 0,
      estimatedTime: 5000, // 5 seconds
    },
  ])

  const [queueStatus, setQueueStatus] = React.useState<QueueStatus>({
    position: 1,
    totalInQueue: 3,
    estimatedWaitTime: 60000,
    processingCapacity: 5,
    averageProcessingTime: 75000,
  })

  const [currentStep, setCurrentStep] = React.useState(0)
  const [overallProgress, setOverallProgress] = React.useState(0)
  const [startTime] = React.useState(Date.now())
  const [isCompleted, setIsCompleted] = React.useState(false)
  const [hasError, setHasError] = React.useState(false)

  // Update progress from WebSocket
  React.useEffect(() => {
    const progress = analysisProgress[analysisId]
    if (progress !== undefined) {
      setOverallProgress(progress)
      
      // Update step progress based on overall progress
      const stepProgress = progress / 100 * steps.length
      const currentStepIndex = Math.floor(stepProgress)
      const currentStepProgress = (stepProgress % 1) * 100

      setCurrentStep(currentStepIndex)
      
      setSteps(prevSteps => prevSteps.map((step, index) => {
        if (index < currentStepIndex) {
          return { ...step, status: 'completed', progress: 100 }
        } else if (index === currentStepIndex) {
          return { ...step, status: 'processing', progress: currentStepProgress }
        } else {
          return { ...step, status: 'pending', progress: 0 }
        }
      }))

      // Check if completed
      if (progress >= 100) {
        setIsCompleted(true)
        setSteps(prevSteps => prevSteps.map(step => ({
          ...step,
          status: 'completed',
          progress: 100,
        })))
      }
    }
  }, [analysisProgress, analysisId, steps.length])

  // Calculate elapsed time
  const elapsedTime = Date.now() - startTime
  const totalEstimatedTime = steps.reduce((total, step) => total + (step.estimatedTime || 0), 0)
  const remainingTime = Math.max(0, totalEstimatedTime - elapsedTime)

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  const getStatusIcon = (status: AnalysisStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-sage-500" />
      case 'error':
        return <XCircle className="w-4 h-4 text-danger-500" />
      case 'processing':
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Activity className="w-4 h-4 text-guardian-500" />
          </motion.div>
        )
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-neutral-300" />
    }
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    }
  }

  return (
    <Card className={cn('w-full max-w-2xl mx-auto', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5" />
              Analyzing {documentName}
            </CardTitle>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Activity className={cn(
                  'w-3 h-3',
                  isConnected ? 'text-sage-500' : 'text-neutral-400'
                )} />
                {isConnected ? 'Connected' : 'Disconnected'}
              </div>
              {lastActivity && (
                <div>
                  Last update: {new Date(lastActivity).toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
          
          {!isCompleted && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={hasError}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <div className="flex items-center gap-2">
              <span>{Math.round(overallProgress)}%</span>
              {!isCompleted && (
                <Badge variant="outline" size="sm">
                  ~{formatTime(remainingTime)} remaining
                </Badge>
              )}
            </div>
          </div>
          <Progress
            value={overallProgress}
            className="h-2"
            indicatorClassName={cn(
              'transition-all duration-500',
              hasError ? 'bg-danger-500' : 'bg-gradient-to-r from-guardian-500 to-sage-500'
            )}
          />
        </div>

        {/* Queue Status */}
        {currentStep === 0 && queueStatus.position > 1 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg border"
          >
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-guardian-500" />
              <span className="font-medium text-sm">Queue Status</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Position in queue</div>
                <div className="font-medium">{queueStatus.position} of {queueStatus.totalInQueue}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Estimated wait</div>
                <div className="font-medium">{formatTime(queueStatus.estimatedWaitTime)}</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Processing Steps */}
        <div className="space-y-3">
          <h3 className="font-medium text-sm text-muted-foreground">Processing Steps</h3>
          <div className="space-y-2">
            {steps.map((step, index) => {
              const StepIcon = step.icon
              const isActive = index === currentStep
              const isCompleted = step.status === 'completed'
              const hasError = step.status === 'error'

              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0.5 }}
                  animate={{ 
                    opacity: isActive || isCompleted ? 1 : 0.5,
                    scale: isActive ? 1.02 : 1
                  }}
                  className={cn(
                    'p-3 rounded-lg border transition-all duration-300',
                    isActive && 'border-guardian-200 bg-guardian-50 dark:border-guardian-800 dark:bg-guardian-950',
                    isCompleted && 'border-sage-200 bg-sage-50 dark:border-sage-800 dark:bg-sage-950',
                    hasError && 'border-danger-200 bg-danger-50 dark:border-danger-800 dark:bg-danger-950'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {getStatusIcon(step.status)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-sm">{step.label}</h4>
                        {step.progress > 0 && step.progress < 100 && (
                          <span className="text-xs text-muted-foreground">
                            {Math.round(step.progress)}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {step.description}
                      </p>
                      
                      {step.status === 'processing' && step.progress > 0 && (
                        <div className="mt-2">
                          <Progress
                            value={step.progress}
                            className="h-1"
                            indicatorClassName="bg-guardian-500"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0">
                      <StepIcon className={cn(
                        'w-4 h-4',
                        isActive && 'text-guardian-500',
                        isCompleted && 'text-sage-500',
                        hasError && 'text-danger-500',
                        !isActive && !isCompleted && !hasError && 'text-neutral-400'
                      )} />
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Completion Status */}
        <AnimatePresence>
          {isCompleted && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-sage-50 dark:bg-sage-950 rounded-lg border border-sage-200 dark:border-sage-800"
            >
              <div className="flex items-center gap-2 text-sage-700 dark:text-sage-300">
                <CheckCircle className="w-5 h-5" />
                <div>
                  <div className="font-medium">Analysis Complete!</div>
                  <div className="text-sm text-sage-600 dark:text-sage-400">
                    Completed in {formatTime(elapsedTime)}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {hasError && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-danger-50 dark:bg-danger-950 rounded-lg border border-danger-200 dark:border-danger-800"
            >
              <div className="flex items-center gap-2 text-danger-700 dark:text-danger-300">
                <AlertTriangle className="w-5 h-5" />
                <div>
                  <div className="font-medium">Analysis Failed</div>
                  <div className="text-sm text-danger-600 dark:text-danger-400">
                    An error occurred during processing. Please try again.
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Performance Stats */}
        {isCompleted && (
          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-lg font-bold text-guardian-600">
                {formatTime(elapsedTime)}
              </div>
              <div className="text-xs text-muted-foreground">Processing Time</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-sage-600">{steps.length}</div>
              <div className="text-xs text-muted-foreground">Steps Completed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-guardian-600">100%</div>
              <div className="text-xs text-muted-foreground">Success Rate</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Real-time Queue Status Component
export interface QueueStatusWidgetProps {
  className?: string
}

export const QueueStatusWidget: React.FC<QueueStatusWidgetProps> = ({ className }) => {
  const { isConnected } = useWebSocket()
  const [queueStats, setQueueStats] = React.useState({
    totalInQueue: 0,
    processing: 0,
    completed: 0,
    averageWaitTime: 0,
    capacity: 5,
  })

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className={cn(
            'w-4 h-4',
            isConnected ? 'text-sage-500' : 'text-neutral-400'
          )} />
          Processing Queue
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-2 bg-neutral-50 dark:bg-neutral-900 rounded">
            <div className="text-lg font-bold text-guardian-600">
              {queueStats.totalInQueue}
            </div>
            <div className="text-xs text-muted-foreground">In Queue</div>
          </div>
          <div className="text-center p-2 bg-neutral-50 dark:bg-neutral-900 rounded">
            <div className="text-lg font-bold text-sage-600">
              {queueStats.processing}
            </div>
            <div className="text-xs text-muted-foreground">Processing</div>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Avg. wait time</span>
          <span className="font-medium">
            {Math.round(queueStats.averageWaitTime / 1000)}s
          </span>
        </div>
        
        <Progress
          value={(queueStats.processing / queueStats.capacity) * 100}
          className="h-1"
          indicatorClassName="bg-guardian-500"
        />
      </CardContent>
    </Card>
  )
}