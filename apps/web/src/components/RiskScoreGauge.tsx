import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'

interface RiskScoreGaugeProps {
  score: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  animated?: boolean
  showDetails?: boolean
  className?: string
}

const RiskScoreGauge: React.FC<RiskScoreGaugeProps> = ({ 
  score, 
  size = 'md', 
  animated = true, 
  showDetails = true,
  className 
}) => {
  const [animatedScore, setAnimatedScore] = useState(0)
  
  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => {
        setAnimatedScore(score)
      }, 200)
      return () => clearTimeout(timer)
    } else {
      setAnimatedScore(score)
    }
  }, [score, animated])

  // Size configurations
  const sizeConfig = {
    sm: { 
      size: 120, 
      strokeWidth: 8, 
      textSize: 'text-lg', 
      labelSize: 'text-xs',
      padding: 'p-4'
    },
    md: { 
      size: 160, 
      strokeWidth: 10, 
      textSize: 'text-2xl', 
      labelSize: 'text-sm',
      padding: 'p-6'
    },
    lg: { 
      size: 200, 
      strokeWidth: 12, 
      textSize: 'text-3xl', 
      labelSize: 'text-base',
      padding: 'p-8'
    },
    xl: { 
      size: 240, 
      strokeWidth: 14, 
      textSize: 'text-4xl', 
      labelSize: 'text-lg',
      padding: 'p-10'
    }
  }

  const config = sizeConfig[size]
  const radius = (config.size - config.strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (animatedScore / 100) * circumference

  // Risk level determination
  const getRiskLevel = (score: number) => {
    if (score >= 80) return { level: 'Critical', color: 'red', bgColor: 'bg-red-50', borderColor: 'border-red-200' }
    if (score >= 65) return { level: 'High', color: 'orange', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' }
    if (score >= 40) return { level: 'Medium', color: 'yellow', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' }
    return { level: 'Low', color: 'green', bgColor: 'bg-green-50', borderColor: 'border-green-200' }
  }

  const riskInfo = getRiskLevel(score)

  // Color gradients based on risk level
  const getStrokeColor = (color: string) => {
    switch (color) {
      case 'red': return 'stroke-red-500'
      case 'orange': return 'stroke-orange-500'
      case 'yellow': return 'stroke-yellow-500'
      case 'green': return 'stroke-green-500'
      default: return 'stroke-gray-500'
    }
  }

  const getGradientId = (color: string) => `gradient-${color}-${size}`

  return (
    <div className={clsx(
      'relative flex flex-col items-center justify-center',
      config.padding,
      riskInfo.bgColor,
      riskInfo.borderColor,
      'border-2 rounded-2xl shadow-lg',
      className
    )}>
      {/* Gauge SVG */}
      <div className="relative">
        <svg
          width={config.size}
          height={config.size}
          className="transform -rotate-90"
        >
          <defs>
            {/* Gradient definitions for each risk level */}
            <linearGradient id={getGradientId('red')} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#DC2626" />
              <stop offset="100%" stopColor="#B91C1C" />
            </linearGradient>
            <linearGradient id={getGradientId('orange')} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#EA580C" />
              <stop offset="100%" stopColor="#C2410C" />
            </linearGradient>
            <linearGradient id={getGradientId('yellow')} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#B45309" />
            </linearGradient>
            <linearGradient id={getGradientId('green')} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#16A34A" />
              <stop offset="100%" stopColor="#15803D" />
            </linearGradient>
          </defs>
          
          {/* Background circle */}
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            fill="none"
            className="text-gray-200"
          />
          
          {/* Progress circle */}
          <motion.circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={radius}
            stroke={`url(#${getGradientId(riskInfo.color)})`}
            strokeWidth={config.strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ 
              duration: animated ? 1.5 : 0, 
              ease: "easeOut",
              delay: animated ? 0.3 : 0
            }}
            className="drop-shadow-sm"
          />
          
          {/* Pulse animation for high risk */}
          {score >= 80 && animated && (
            <motion.circle
              cx={config.size / 2}
              cy={config.size / 2}
              r={radius}
              stroke={`url(#${getGradientId('red')})`}
              strokeWidth={2}
              fill="none"
              strokeOpacity={0.4}
              animate={{
                r: [radius, radius + 8, radius],
                strokeOpacity: [0.4, 0.1, 0.4]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          )}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ 
              duration: animated ? 0.6 : 0, 
              delay: animated ? 0.5 : 0,
              type: "spring",
              stiffness: 300
            }}
            className="text-center"
          >
            <div className={clsx(
              'font-bold',
              config.textSize,
              `text-${riskInfo.color}-600`
            )}>
              {Math.round(animatedScore)}%
            </div>
            {showDetails && (
              <div className={clsx(
                'font-medium',
                config.labelSize,
                `text-${riskInfo.color}-500`
              )}>
                {riskInfo.level} Risk
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Risk indicator dots */}
      {showDetails && (
        <motion.div 
          className="flex items-center space-x-1 mt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: animated ? 1 : 0 }}
        >
          {[
            { range: [0, 25], color: 'green', label: 'Low' },
            { range: [25, 50], color: 'yellow', label: 'Medium' },
            { range: [50, 80], color: 'orange', label: 'High' },
            { range: [80, 100], color: 'red', label: 'Critical' }
          ].map((level, index) => {
            const isActive = score >= level.range[0] && score < level.range[1]
            return (
              <div
                key={index}
                className={clsx(
                  'w-2 h-2 rounded-full transition-all duration-300',
                  isActive ? `bg-${level.color}-500 shadow-lg` : 'bg-gray-200'
                )}
                title={`${level.label}: ${level.range[0]}-${level.range[1]}%`}
              />
            )
          })}
        </motion.div>
      )}

      {/* Accessibility support */}
      <div className="sr-only">
        Risk score: {score} out of 100. Risk level: {riskInfo.level}.
      </div>
    </div>
  )
}

export default RiskScoreGauge