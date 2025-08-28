/**
 * Fine Print AI - Risk Visualization Components
 * Specialized components for visualizing legal document risk assessment
 */

import React, { forwardRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../../lib/utils'
import { useTheme } from '../../providers/ThemeProvider'
import { getRiskColor, getRiskLevel, getRiskLabel } from '../../theme'
import type { RiskLevel } from '../../tokens'

// =============================================================================
// RISK GAUGE COMPONENT
// =============================================================================

export interface RiskGaugeProps {
  score: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showLabel?: boolean
  showScore?: boolean
  className?: string
  animated?: boolean
  interactive?: boolean
  onClick?: () => void
  'data-testid'?: string
}

const sizeConfig = {
  sm: { size: 80, strokeWidth: 6, fontSize: 'text-xs' },
  md: { size: 120, strokeWidth: 8, fontSize: 'text-sm' },
  lg: { size: 160, strokeWidth: 10, fontSize: 'text-base' },
  xl: { size: 200, strokeWidth: 12, fontSize: 'text-lg' },
}

export const RiskGauge = forwardRef<HTMLDivElement, RiskGaugeProps>(
  ({
    score,
    size = 'md',
    showLabel = true,
    showScore = true,
    className,
    animated = true,
    interactive = false,
    onClick,
    'data-testid': testId,
  }, ref) => {
    const { theme } = useTheme()
    const config = sizeConfig[size]
    const riskColor = getRiskColor(score, theme)
    const riskLabel = getRiskLabel(score)
    
    const radius = (config.size - config.strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference - (score / 100) * circumference * 0.75

    // Calculate the gauge path (3/4 circle starting from -135 degrees)
    const startAngle = -135
    const endAngle = startAngle + (score / 100) * 270

    return (
      <div 
        ref={ref}
        className={cn(
          'relative inline-flex flex-col items-center gap-2',
          interactive && 'cursor-pointer hover:scale-105 transition-transform',
          className
        )}
        onClick={onClick}
        data-testid={testId}
        style={{ width: config.size, height: config.size + (showLabel ? 40 : 0) }}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `Risk score ${score} - ${riskLabel}` : undefined}
      >
        {/* Glow effect */}
        {animated && (
          <div
            className="absolute inset-0 rounded-full opacity-20 blur-xl animate-pulse"
            style={{
              background: riskColor,
              boxShadow: `0 0 30px ${riskColor}30`,
            }}
          />
        )}

        {/* SVG Gauge */}
        <svg
          width={config.size}
          height={config.size}
          className="transform -rotate-45"
          role="img"
          aria-hidden="true"
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
            className="text-fp-border-primary opacity-30"
          />
          
          {/* Gradient definitions */}
          <defs>
            <linearGradient id={`riskGradient-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={`${riskColor}80`} />
              <stop offset="100%" stopColor={riskColor} />
            </linearGradient>
            <filter id={`glow-${score}`}>
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
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
            filter={`url(#glow-${score})`}
            animate={animated ? { strokeDashoffset } : {}}
            transition={{ duration: 1.5, ease: 'easeOut', delay: 0.2 }}
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {showScore && (
            <motion.div
              className="text-center"
              style={{ color: riskColor }}
              initial={animated ? { scale: 0, opacity: 0 } : {}}
              animate={animated ? { scale: 1, opacity: 1 } : {}}
              transition={{ duration: 0.5, delay: animated ? 1 : 0 }}
            >
              <div className={cn('font-bold', config.fontSize)}>
                {Math.round(score)}
              </div>
              <div className="text-xs text-fp-fg-tertiary">/100</div>
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
            style={{ color: riskColor }}
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
)

RiskGauge.displayName = 'RiskGauge'

// =============================================================================
// RISK DISTRIBUTION CHART
// =============================================================================

export interface RiskDistributionProps {
  data: Array<{
    category: string
    value: number
    riskLevel: RiskLevel
  }>
  height?: number
  className?: string
  showLabels?: boolean
  'data-testid'?: string
}

export const RiskDistribution = forwardRef<HTMLDivElement, RiskDistributionProps>(
  ({ data, height = 200, className, showLabels = true, 'data-testid': testId }, ref) => {
    const { theme } = useTheme()
    
    const total = data.reduce((sum, item) => sum + item.value, 0)
    const maxValue = Math.max(...data.map(item => item.value))
    
    const bars = data.map((item, index) => ({
      ...item,
      percentage: (item.value / total) * 100,
      height: (item.value / maxValue) * (height - 40),
      color: getRiskColor(
        item.riskLevel === 'safe' ? 10 :
        item.riskLevel === 'low' ? 30 :
        item.riskLevel === 'medium' ? 50 :
        item.riskLevel === 'high' ? 70 : 90,
        theme
      ),
    }))

    return (
      <div ref={ref} className={cn('w-full', className)} data-testid={testId}>
        <div 
          className="flex items-end justify-center gap-4 px-4"
          style={{ height: height }}
        >
          {bars.map((bar, index) => (
            <div key={bar.category} className="flex flex-col items-center gap-2">
              {/* Bar */}
              <motion.div
                className="relative rounded-t-lg min-w-[40px]"
                style={{ 
                  backgroundColor: bar.color,
                  height: bar.height,
                }}
                initial={{ height: 0 }}
                animate={{ height: bar.height }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
              >
                {/* Value label */}
                {showLabels && (
                  <motion.span
                    className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-medium text-fp-fg-primary"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 + index * 0.1 }}
                  >
                    {bar.value}
                  </motion.span>
                )}
              </motion.div>
              
              {/* Category label */}
              <span className="text-xs text-fp-fg-secondary text-center max-w-[60px] leading-tight">
                {bar.category}
              </span>
            </div>
          ))}
        </div>
        
        {/* Legend */}
        <div className="mt-4 flex flex-wrap justify-center gap-4">
          {bars.map((bar) => (
            <div key={bar.category} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: bar.color }}
              />
              <span className="text-sm text-fp-fg-secondary">
                {bar.category} ({bar.percentage.toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
)

RiskDistribution.displayName = 'RiskDistribution'

// =============================================================================
// RISK HEATMAP
// =============================================================================

export interface RiskHeatmapProps {
  data: Array<Array<{
    value: number
    label?: string
    category?: string
  }>>
  width?: number
  height?: number
  className?: string
  'data-testid'?: string
}

export const RiskHeatmap = forwardRef<HTMLDivElement, RiskHeatmapProps>(
  ({ data, width = 400, height = 300, className, 'data-testid': testId }, ref) => {
    const { theme } = useTheme()
    
    const flatData = data.flat()
    const maxValue = Math.max(...flatData.map(cell => cell.value))
    const minValue = Math.min(...flatData.map(cell => cell.value))
    
    const cellWidth = width / data[0].length
    const cellHeight = height / data.length

    return (
      <div ref={ref} className={cn('relative', className)} data-testid={testId}>
        <svg width={width} height={height} className="rounded-lg overflow-hidden">
          {data.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const intensity = (cell.value - minValue) / (maxValue - minValue)
              const riskScore = intensity * 100
              const color = getRiskColor(riskScore, theme)
              
              return (
                <motion.rect
                  key={`${rowIndex}-${colIndex}`}
                  x={colIndex * cellWidth}
                  y={rowIndex * cellHeight}
                  width={cellWidth}
                  height={cellHeight}
                  fill={color}
                  opacity={0.3 + intensity * 0.7}
                  stroke={theme.colors.border.primary}
                  strokeWidth={1}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.3 + intensity * 0.7 }}
                  transition={{ delay: (rowIndex + colIndex) * 0.05 }}
                >
                  <title>
                    {cell.label || `Value: ${cell.value}`}
                    {cell.category && ` (${cell.category})`}
                  </title>
                </motion.rect>
              )
            })
          )}
        </svg>
        
        {/* Color scale legend */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-fp-fg-secondary">Low</span>
          <div className="flex h-4 w-32 rounded overflow-hidden">
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className="flex-1"
                style={{
                  backgroundColor: getRiskColor(i * 10, theme),
                  opacity: 0.3 + (i / 10) * 0.7,
                }}
              />
            ))}
          </div>
          <span className="text-sm text-fp-fg-secondary">High</span>
        </div>
      </div>
    )
  }
)

RiskHeatmap.displayName = 'RiskHeatmap'

// =============================================================================
// RISK TREND TIMELINE
// =============================================================================

export interface RiskTrendProps {
  data: Array<{
    date: string
    score: number
    label?: string
    events?: Array<{
      type: 'change' | 'update' | 'alert'
      description: string
    }>
  }>
  height?: number
  className?: string
  'data-testid'?: string
}

export const RiskTrend = forwardRef<HTMLDivElement, RiskTrendProps>(
  ({ data, height = 200, className, 'data-testid': testId }, ref) => {
    const { theme } = useTheme()
    
    if (!data.length) return null

    const maxScore = Math.max(...data.map(d => d.score))
    const minScore = Math.min(...data.map(d => d.score))
    const range = maxScore - minScore || 1
    const width = 400

    const points = data.map((item, index) => ({
      x: (index / (data.length - 1)) * (width - 40) + 20,
      y: height - 40 - ((item.score - minScore) / range) * (height - 80),
      score: item.score,
      date: item.date,
      label: item.label,
      events: item.events,
      color: getRiskColor(item.score, theme),
    }))

    // Generate SVG path
    const pathData = points.reduce((path, point, index) => {
      const command = index === 0 ? 'M' : 'L'
      return `${path} ${command} ${point.x} ${point.y}`
    }, '')

    // Generate smooth curve path
    const smoothPath = useMemo(() => {
      if (points.length < 2) return pathData
      
      let path = `M ${points[0].x} ${points[0].y}`
      
      for (let i = 1; i < points.length; i++) {
        const cp1x = points[i - 1].x + (points[i].x - points[i - 1].x) / 3
        const cp1y = points[i - 1].y
        const cp2x = points[i].x - (points[i].x - points[i - 1].x) / 3
        const cp2y = points[i].y
        
        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${points[i].x} ${points[i].y}`
      }
      
      return path
    }, [points])

    return (
      <div ref={ref} className={cn('w-full', className)} data-testid={testId}>
        <svg width={width} height={height} className="overflow-visible">
          <defs>
            <linearGradient id="trendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={points[0]?.color || theme.colors.brand.primary} />
              <stop offset="100%" stopColor={points[points.length - 1]?.color || theme.colors.brand.primary} />
            </linearGradient>
            
            {/* Glow filter */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* Grid lines */}
          {Array.from({ length: 5 }, (_, i) => (
            <line
              key={i}
              x1={20}
              y1={20 + (i * (height - 40)) / 4}
              x2={width - 20}
              y2={20 + (i * (height - 40)) / 4}
              stroke={theme.colors.border.primary}
              strokeOpacity={0.3}
              strokeDasharray="2,2"
            />
          ))}
          
          {/* Area under curve */}
          <motion.path
            d={`${smoothPath} L ${points[points.length - 1].x} ${height - 20} L ${points[0].x} ${height - 20} Z`}
            fill="url(#trendGradient)"
            fillOpacity={0.1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
          />
          
          {/* Trend line */}
          <motion.path
            d={smoothPath}
            stroke="url(#trendGradient)"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#glow)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2, ease: 'easeOut' }}
          />
          
          {/* Data points */}
          {points.map((point, index) => (
            <motion.g key={index}>
              <motion.circle
                cx={point.x}
                cy={point.y}
                r="6"
                fill={point.color}
                stroke={theme.colors.surface.primary}
                strokeWidth="2"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.1 + 1 }}
                className="cursor-pointer hover:r-8 transition-all"
              >
                <title>
                  {point.date}: {point.score}/100
                  {point.label && ` - ${point.label}`}
                </title>
              </motion.circle>
              
              {/* Event indicators */}
              {point.events?.map((event, eventIndex) => (
                <motion.circle
                  key={eventIndex}
                  cx={point.x}
                  cy={point.y - 15 - eventIndex * 8}
                  r="3"
                  fill={
                    event.type === 'alert' ? theme.colors.status.error :
                    event.type === 'change' ? theme.colors.status.warning :
                    theme.colors.status.info
                  }
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1 + 1.5 }}
                >
                  <title>{event.description}</title>
                </motion.circle>
              ))}
            </motion.g>
          ))}
        </svg>
        
        {/* Time axis labels */}
        <div className="flex justify-between mt-2 px-5">
          {data.map((item, index) => (
            index % Math.ceil(data.length / 5) === 0 && (
              <span key={index} className="text-xs text-fp-fg-secondary">
                {new Date(item.date).toLocaleDateString()}
              </span>
            )
          ))}
        </div>
      </div>
    )
  }
)

RiskTrend.displayName = 'RiskTrend'

// =============================================================================
// EXPORTS
// =============================================================================

export {
  RiskGauge,
  RiskDistribution,
  RiskHeatmap,
  RiskTrend,
}