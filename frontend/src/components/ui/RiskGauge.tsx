import React from 'react'
import { motion } from 'framer-motion'
import { cn, getRiskColor, getRiskLabel } from '@/lib/utils'
import { RISK_LEVELS } from '@/lib/constants'

export interface RiskGaugeProps {
  score: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showLabel?: boolean
  showScore?: boolean
  className?: string
  animated?: boolean
  interactive?: boolean
  onClick?: () => void
}

const sizeConfig = {
  sm: { size: 80, strokeWidth: 6, fontSize: 'text-xs' },
  md: { size: 120, strokeWidth: 8, fontSize: 'text-sm' },
  lg: { size: 160, strokeWidth: 10, fontSize: 'text-base' },
  xl: { size: 200, strokeWidth: 12, fontSize: 'text-lg' },
}

const colorConfig = {
  sage: {
    primary: '#10b981',
    secondary: '#a7f3d0',
    background: '#ecfdf5',
    shadow: '0 0 20px rgba(16, 185, 129, 0.3)',
  },
  alert: {
    primary: '#f59e0b',
    secondary: '#fde68a',
    background: '#fffbeb',
    shadow: '0 0 20px rgba(245, 158, 11, 0.3)',
  },
  danger: {
    primary: '#ef4444',
    secondary: '#fecaca',
    background: '#fef2f2',
    shadow: '0 0 20px rgba(239, 68, 68, 0.3)',
  },
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  score,
  size = 'md',
  showLabel = true,
  showScore = true,
  className,
  animated = true,
  interactive = false,
  onClick,
}) => {
  const config = sizeConfig[size]
  const riskColor = getRiskColor(score)
  const riskLabel = getRiskLabel(score)
  const colors = colorConfig[riskColor as keyof typeof colorConfig]
  
  const radius = (config.size - config.strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference

  // Gauge starts from bottom and goes clockwise
  const startAngle = -90 // Start from top
  const endAngle = startAngle + (score / 100) * 270 // 270 degrees for 3/4 circle

  return (
    <div 
      className={cn(
        'relative inline-flex flex-col items-center gap-2',
        interactive && 'cursor-pointer hover:scale-105 transition-transform',
        className
      )}
      onClick={onClick}
      style={{ width: config.size, height: config.size + (showLabel ? 40 : 0) }}
    >
      {/* Glow effect */}
      {animated && (
        <div
          className="absolute inset-0 rounded-full opacity-20 blur-xl"
          style={{
            background: colors.primary,
            boxShadow: colors.shadow,
          }}
        />
      )}

      {/* SVG Gauge */}
      <svg
        width={config.size}
        height={config.size}
        className="transform -rotate-45"
      >
        {/* Background track */}
        <circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={config.strokeWidth}
          fill="none"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          className="text-neutral-200 dark:text-neutral-700"
        />
        
        {/* Gradient definitions */}
        <defs>
          <linearGradient id={`riskGradient-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colors.secondary} />
            <stop offset="100%" stopColor={colors.primary} />
          </linearGradient>
        </defs>
        
        {/* Progress circle */}
        <motion.circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          stroke={`url(#riskGradient-${score})`}
          strokeWidth={config.strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={animated ? circumference * 0.75 : strokeDashoffset}
          animate={animated ? { strokeDashoffset } : {}}
          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.2 }}
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showScore && (
          <motion.div
            className={cn('font-bold text-center', config.fontSize)}
            style={{ color: colors.primary }}
            initial={animated ? { scale: 0, opacity: 0 } : {}}
            animate={animated ? { scale: 1, opacity: 1 } : {}}
            transition={{ duration: 0.5, delay: animated ? 1 : 0 }}
          >
            <div className="text-2xl sm:text-3xl lg:text-4xl">{Math.round(score)}</div>
            <div className="text-xs text-muted-foreground">/ 100</div>
          </motion.div>
        )}
      </div>

      {/* Risk label */}
      {showLabel && (
        <motion.div
          className={cn(
            'text-center font-medium',
            config.fontSize,
            'mt-2'
          )}
          style={{ color: colors.primary }}
          initial={animated ? { opacity: 0, y: 10 } : {}}
          animate={animated ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: animated ? 1.2 : 0 }}
        >
          {riskLabel}
        </motion.div>
      )}
    </div>
  )
}

// Mini Risk Indicator for inline use
export interface RiskIndicatorProps {
  score: number
  size?: 'xs' | 'sm' | 'md'
  showScore?: boolean
  className?: string
}

export const RiskIndicator: React.FC<RiskIndicatorProps> = ({
  score,
  size = 'sm',
  showScore = true,
  className,
}) => {
  const riskColor = getRiskColor(score)
  const colors = colorConfig[riskColor as keyof typeof colorConfig]
  
  const sizeClasses = {
    xs: 'w-4 h-4',
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
  }
  
  const textSizes = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div 
        className={cn(
          'rounded-full flex items-center justify-center font-bold text-white',
          sizeClasses[size],
          textSizes[size]
        )}
        style={{ backgroundColor: colors.primary }}
      >
        {showScore && Math.round(score)}
      </div>
    </div>
  )
}

// Risk Trend Chart (simplified line chart)
export interface RiskTrendProps {
  data: { date: string; score: number }[]
  height?: number
  className?: string
}

export const RiskTrend: React.FC<RiskTrendProps> = ({
  data,
  height = 100,
  className,
}) => {
  if (!data.length) return null

  const maxScore = Math.max(...data.map(d => d.score))
  const minScore = Math.min(...data.map(d => d.score))
  const range = maxScore - minScore || 1

  const points = data.map((item, index) => ({
    x: (index / (data.length - 1)) * 100,
    y: ((maxScore - item.score) / range) * (height - 20) + 10,
    score: item.score,
    date: item.date,
  }))

  const pathData = points.reduce((path, point, index) => {
    const command = index === 0 ? 'M' : 'L'
    return `${path} ${command} ${point.x} ${point.y}`
  }, '')

  const currentScore = data[data.length - 1]?.score || 0
  const riskColor = getRiskColor(currentScore)
  const colors = colorConfig[riskColor as keyof typeof colorConfig]

  return (
    <div className={cn('relative', className)}>
      <svg width="100%" height={height} className="overflow-visible">
        <defs>
          <linearGradient id="trendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colors.secondary} />
            <stop offset="100%" stopColor={colors.primary} />
          </linearGradient>
        </defs>
        
        {/* Trend line */}
        <motion.path
          d={pathData}
          stroke={colors.primary}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2, ease: 'easeOut' }}
        />
        
        {/* Data points */}
        {points.map((point, index) => (
          <motion.circle
            key={index}
            cx={`${point.x}%`}
            cy={point.y}
            r="3"
            fill={colors.primary}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: index * 0.1 + 0.5 }}
          />
        ))}
      </svg>
    </div>
  )
}