import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  animated?: boolean
  variant?: 'pulse' | 'wave' | 'shimmer'
  lines?: number
  width?: string | number
  height?: string | number
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  animated = true,
  variant = 'pulse',
  lines = 1,
  width,
  height,
  style,
  ...props
}) => {
  const getAnimationClass = () => {
    if (!animated) return ''
    
    switch (variant) {
      case 'pulse':
        return 'animate-pulse'
      case 'wave':
        return 'animate-pulse'
      case 'shimmer':
        return 'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent dark:before:via-white/10'
      default:
        return 'animate-pulse'
    }
  }

  if (lines > 1) {
    return (
      <div className={cn('space-y-2', className)} {...props}>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cn(
              'bg-muted rounded-md h-4',
              getAnimationClass(),
              i === lines - 1 && 'w-3/4' // Last line is shorter
            )}
            style={{
              width: i === lines - 1 ? '75%' : width,
              height: height || '1rem',
              ...style,
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-muted rounded-md',
        getAnimationClass(),
        className
      )}
      style={{
        width: width || '100%',
        height: height || '1rem',
        ...style,
      }}
      {...props}
    />
  )
}

// Specific skeleton components for common UI patterns
export const SkeletonText: React.FC<{
  lines?: number
  className?: string
}> = ({ lines = 3, className }) => (
  <Skeleton lines={lines} className={className} />
)

export const SkeletonAvatar: React.FC<{
  size?: 'sm' | 'md' | 'lg'
  className?: string
}> = ({ size = 'md', className }) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  }
  
  return (
    <Skeleton
      className={cn('rounded-full', sizeClasses[size], className)}
    />
  )
}

export const SkeletonButton: React.FC<{
  size?: 'sm' | 'md' | 'lg'
  className?: string
}> = ({ size = 'md', className }) => {
  const sizeClasses = {
    sm: 'w-20 h-8',
    md: 'w-24 h-10',
    lg: 'w-32 h-12',
  }
  
  return (
    <Skeleton
      className={cn('rounded-lg', sizeClasses[size], className)}
    />
  )
}

export const SkeletonCard: React.FC<{
  className?: string
  showAvatar?: boolean
  lines?: number
}> = ({ className, showAvatar = false, lines = 3 }) => (
  <div className={cn('p-4 space-y-3', className)}>
    {showAvatar && (
      <div className="flex items-center space-x-3">
        <SkeletonAvatar />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    )}
    <SkeletonText lines={lines} />
    <div className="flex space-x-2">
      <SkeletonButton size="sm" />
      <SkeletonButton size="sm" />
    </div>
  </div>
)

// Analysis-specific skeletons
export const SkeletonRiskGauge: React.FC<{
  size?: 'sm' | 'md' | 'lg'
  className?: string
}> = ({ size = 'md', className }) => {
  const sizeClasses = {
    sm: 'w-20 h-20',
    md: 'w-32 h-32',
    lg: 'w-40 h-40',
  }
  
  return (
    <div className={cn('flex flex-col items-center space-y-2', className)}>
      <Skeleton
        className={cn('rounded-full', sizeClasses[size])}
        variant="shimmer"
      />
      <Skeleton className="h-4 w-16" />
    </div>
  )
}

export const SkeletonFindingCard: React.FC<{
  className?: string
}> = ({ className }) => (
  <div className={cn('p-4 border border-border rounded-lg space-y-3', className)}>
    <div className="flex items-start space-x-3">
      <Skeleton className="w-8 h-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <div className="flex space-x-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
      <Skeleton className="w-6 h-6" />
    </div>
  </div>
)

export const SkeletonAnalysisSummary: React.FC<{
  className?: string
}> = ({ className }) => (
  <div className={cn('space-y-6', className)}>
    {/* Header */}
    <div className="flex items-start justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <SkeletonButton />
    </div>
    
    {/* Risk gauge and stats */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
      <div className="flex justify-center lg:justify-start">
        <SkeletonRiskGauge size="lg" />
      </div>
      <div className="space-y-4 lg:col-span-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="text-center space-y-2">
              <Skeleton className="h-8 w-12 mx-auto" />
              <Skeleton className="h-4 w-20 mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
    
    {/* Summary text */}
    <div className="space-y-2">
      <Skeleton className="h-6 w-48" />
      <SkeletonText lines={3} />
    </div>
    
    {/* Findings preview */}
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <SkeletonButton size="sm" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonFindingCard key={i} />
        ))}
      </div>
    </div>
  </div>
)

// Loading states with messages
export interface LoadingStateProps {
  message?: string
  submessage?: string
  progress?: number
  showProgress?: boolean
  icon?: React.ReactNode
  className?: string
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  submessage,
  progress,
  showProgress = false,
  icon,
  className,
}) => (
  <div className={cn('flex flex-col items-center justify-center p-8 text-center', className)}>
    <div className="mb-4">
      {icon || (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-guardian-200 border-t-guardian-600 rounded-full"
        />
      )}
    </div>
    
    <h3 className="text-lg font-medium text-foreground mb-2">{message}</h3>
    
    {submessage && (
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {submessage}
      </p>
    )}
    
    {showProgress && typeof progress === 'number' && (
      <div className="w-full max-w-xs">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <motion.div
            className="bg-guardian-600 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>
    )}
  </div>
)

// Analysis loading state
export const AnalysisLoadingState: React.FC<{
  stage?: 'uploading' | 'processing' | 'analyzing' | 'generating'
  progress?: number
  className?: string
}> = ({ stage = 'processing', progress = 0, className }) => {
  const stageMessages = {
    uploading: {
      title: 'Uploading Document',
      description: 'Securely transferring your document for analysis...',
    },
    processing: {
      title: 'Processing Document',
      description: 'Extracting text and preparing for AI analysis...',
    },
    analyzing: {
      title: 'Analyzing Terms',
      description: 'Our AI is reviewing clauses and identifying potential issues...',
    },
    generating: {
      title: 'Generating Report',
      description: 'Creating your personalized analysis report...',
    },
  }

  const message = stageMessages[stage]

  return (
    <LoadingState
      message={message.title}
      submessage={message.description}
      progress={progress}
      showProgress={true}
      className={className}
    />
  )
}

// Add shimmer keyframe to CSS
const shimmerKeyframes = `
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}`

// Inject styles if not already present
if (typeof window !== 'undefined' && !document.querySelector('#skeleton-shimmer-styles')) {
  const style = document.createElement('style')
  style.id = 'skeleton-shimmer-styles'
  style.textContent = shimmerKeyframes
  document.head.appendChild(style)
}