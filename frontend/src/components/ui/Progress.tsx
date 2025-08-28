import React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

const progressVariants = cva(
  'relative h-2 w-full overflow-hidden rounded-full bg-secondary',
  {
    variants: {
      size: {
        sm: 'h-1',
        default: 'h-2',
        lg: 'h-3',
        xl: 'h-4',
      },
      variant: {
        default: 'bg-secondary',
        gradient: 'bg-gradient-to-r from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-600',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
  }
)

const progressBarVariants = cva(
  'h-full w-full flex-1 transition-all duration-500 ease-out',
  {
    variants: {
      color: {
        default: 'bg-primary',
        guardian: 'gradient-guardian',
        sage: 'gradient-sage',
        warning: 'gradient-alert',
        danger: 'gradient-danger',
        // Risk-based colors
        minimal: 'gradient-sage',
        low: 'gradient-sage',
        medium: 'gradient-alert',
        high: 'gradient-alert',
        critical: 'gradient-danger',
      },
      animated: {
        true: 'animate-pulse',
        false: '',
      },
    },
    defaultVariants: {
      color: 'default',
      animated: false,
    },
  }
)

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
    VariantProps<typeof progressVariants> {
  value?: number
  max?: number
  color?: VariantProps<typeof progressBarVariants>['color']
  animated?: boolean
  showValue?: boolean
  formatValue?: (value: number, max: number) => string
  indeterminate?: boolean
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ 
  className, 
  value = 0, 
  max = 100,
  size,
  variant,
  color = 'default',
  animated = false,
  showValue = false,
  formatValue,
  indeterminate = false,
  ...props 
}, ref) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  
  const defaultFormatValue = (val: number, maximum: number) => 
    `${Math.round((val / maximum) * 100)}%`

  return (
    <div className="w-full space-y-2">
      {showValue && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Progress</span>
          <span>
            {formatValue ? formatValue(value, max) : defaultFormatValue(value, max)}
          </span>
        </div>
      )}
      
      <ProgressPrimitive.Root
        ref={ref}
        className={cn(progressVariants({ size, variant }), className)}
        {...props}
      >
        {indeterminate ? (
          <motion.div
            className={cn(progressBarVariants({ color, animated: true }))}
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{
              repeat: Infinity,
              duration: 1.5,
              ease: 'easeInOut'
            }}
            style={{ width: '30%' }}
          />
        ) : (
          <ProgressPrimitive.Indicator
            className={cn(progressBarVariants({ color, animated }))}
            style={{ transform: `translateX(-${100 - percentage}%)` }}
          />
        )}
      </ProgressPrimitive.Root>
    </div>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

// Circular Progress Component
export interface CircularProgressProps {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  color?: VariantProps<typeof progressBarVariants>['color']
  showValue?: boolean
  className?: string
  children?: React.ReactNode
}

const CircularProgress = React.forwardRef<HTMLDivElement, CircularProgressProps>(
  ({ 
    value, 
    max = 100, 
    size = 120, 
    strokeWidth = 8,
    color = 'default',
    showValue = false,
    className,
    children 
  }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (percentage / 100) * circumference

    const colorMap = {
      default: '#2563eb',
      guardian: '#2563eb',
      sage: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      minimal: '#10b981',
      low: '#10b981',
      medium: '#f59e0b',
      high: '#f59e0b',
      critical: '#ef4444',
    }

    return (
      <div 
        ref={ref}
        className={cn('relative inline-flex items-center justify-center', className)}
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="none"
            className="text-neutral-200 dark:text-neutral-700"
          />
          
          {/* Progress circle */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colorMap[color]}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex items-center justify-center">
          {children || (showValue && (
            <span className="text-sm font-medium">
              {Math.round(percentage)}%
            </span>
          ))}
        </div>
      </div>
    )
  }
)
CircularProgress.displayName = 'CircularProgress'

export { Progress, CircularProgress }