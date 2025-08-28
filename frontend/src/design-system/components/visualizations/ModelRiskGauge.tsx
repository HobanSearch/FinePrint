/**
 * Model-Inspired Risk Gauge Component
 * Sophisticated circular gauge with gradient fills and smooth animations
 */

import React, { useEffect, useRef } from 'react';
import { motion, useAnimation, useMotionValue, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { tokens } from '../../tokens';
import { useTheme } from '../../providers/ThemeProvider';
import { getRiskLevel, getRiskLabel } from '../../theme';

// ============================================================================
// TYPES
// ============================================================================

export interface ModelRiskGaugeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  showLabel?: boolean;
  showPercentage?: boolean;
  thickness?: number;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ModelRiskGauge: React.FC<ModelRiskGaugeProps> = ({
  score,
  size = 'md',
  animated = true,
  showLabel = true,
  showPercentage = true,
  thickness = 8,
  className,
}) => {
  const { theme } = useTheme();
  const controls = useAnimation();
  const progressValue = useMotionValue(0);
  const displayScore = useTransform(progressValue, (value) => Math.round(value));

  // Size configurations
  const sizes = {
    sm: { diameter: 120, fontSize: 24, labelSize: 12 },
    md: { diameter: 200, fontSize: 36, labelSize: 14 },
    lg: { diameter: 280, fontSize: 48, labelSize: 16 },
    xl: { diameter: 360, fontSize: 60, labelSize: 18 },
  };

  const { diameter, fontSize, labelSize } = sizes[size];
  const radius = (diameter - thickness * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  // Get risk level and color
  const riskLevel = getRiskLevel(score);
  const riskColors = {
    safe: { start: '#22c55e', end: '#16a34a' },
    low: { start: '#4ade80', end: '#22c55e' },
    medium: { start: '#fbbf24', end: '#f59e0b' },
    high: { start: '#f87171', end: '#ef4444' },
    critical: { start: '#ef4444', end: '#dc2626' },
  };

  const { start: startColor, end: endColor } = riskColors[riskLevel];

  // Animation
  useEffect(() => {
    if (animated) {
      progressValue.set(0);
      controls.start({
        strokeDashoffset: circumference - (score / 100) * circumference,
        transition: {
          duration: 1.5,
          ease: tokens.animations.timing.smooth,
        },
      });
      
      // Animate the score number
      const animation = progressValue.onChange((v) => {
        if (v >= score) {
          progressValue.set(score);
          animation();
        }
      });
      
      progressValue.set(score);
      
      return animation;
    } else {
      progressValue.set(score);
    }
  }, [score, animated, circumference, controls, progressValue]);

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={diameter}
        height={diameter}
        className="transform -rotate-90"
      >
        <defs>
          <linearGradient id={`gradient-${riskLevel}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={startColor} />
            <stop offset="100%" stopColor={endColor} />
          </linearGradient>
          
          {/* Shadow filter */}
          <filter id="gaugeShadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.1" />
          </filter>
        </defs>

        {/* Background track */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          stroke={theme.isDark ? tokens.colors.charcoal[800] : tokens.colors.smoke[200]}
          strokeWidth={thickness}
          fill="none"
        />

        {/* Subtle inner shadow */}
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius - thickness / 2}
          stroke={theme.isDark ? tokens.colors.charcoal[900] : tokens.colors.smoke[100]}
          strokeWidth={1}
          fill="none"
          opacity={0.5}
        />

        {/* Progress arc */}
        <motion.circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          stroke={`url(#gradient-${riskLevel})`}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={controls}
          filter="url(#gaugeShadow)"
        />

        {/* Decorative elements */}
        <g transform={`translate(${diameter / 2}, ${diameter / 2})`}>
          {/* Start marker */}
          <circle
            cx={0}
            cy={-radius}
            r={thickness / 2}
            fill={theme.isDark ? tokens.colors.charcoal[700] : tokens.colors.smoke[300]}
            className="transform rotate-90 origin-center"
          />
          
          {/* End marker */}
          <motion.circle
            cx={0}
            cy={-radius}
            r={thickness / 2}
            fill={endColor}
            className="transform origin-center"
            animate={{
              rotate: (score / 100) * 360 + 90,
            }}
            transition={{
              duration: animated ? 1.5 : 0,
              ease: tokens.animations.timing.smooth,
            }}
          />
        </g>
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          className="text-charcoal-900 dark:text-smoke-100 font-bold tabular-nums"
          style={{ fontSize }}
        >
          <motion.span>{displayScore}</motion.span>
          {showPercentage && <span className="text-charcoal-500 dark:text-smoke-500">%</span>}
        </motion.div>
        
        {showLabel && (
          <motion.p
            className="text-charcoal-600 dark:text-smoke-400 font-medium mt-1"
            style={{ fontSize: labelSize }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            {getRiskLabel(score)}
          </motion.p>
        )}
      </div>

      {/* Glow effect for high risk */}
      {(riskLevel === 'high' || riskLevel === 'critical') && animated && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${endColor}20 0%, transparent 70%)`,
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: [0, 0.5, 0],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: tokens.animations.timing.smooth,
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// MINI RISK INDICATOR
// ============================================================================

interface MiniRiskIndicatorProps {
  score: number;
  size?: 'xs' | 'sm' | 'md';
  showScore?: boolean;
  className?: string;
}

export const MiniRiskIndicator: React.FC<MiniRiskIndicatorProps> = ({
  score,
  size = 'sm',
  showScore = true,
  className,
}) => {
  const riskLevel = getRiskLevel(score);
  const riskColors = {
    safe: 'bg-sage-500',
    low: 'bg-sage-400',
    medium: 'bg-amber-500',
    high: 'bg-crimson-500',
    critical: 'bg-crimson-600',
  };

  const sizes = {
    xs: 'w-12 h-12 text-xs',
    sm: 'w-16 h-16 text-sm',
    md: 'w-20 h-20 text-base',
  };

  return (
    <div
      className={cn(
        'relative rounded-full flex items-center justify-center',
        'ring-4 ring-offset-2',
        'ring-offset-white dark:ring-offset-charcoal-900',
        riskColors[riskLevel],
        riskLevel === 'safe' || riskLevel === 'low'
          ? 'ring-sage-500/20'
          : riskLevel === 'medium'
          ? 'ring-amber-500/20'
          : 'ring-crimson-500/20',
        sizes[size],
        className
      )}
    >
      {showScore ? (
        <span className="font-bold text-white">{score}</span>
      ) : (
        <svg
          className="w-1/2 h-1/2 text-white"
          fill="none"
          viewBox="0 0 24 24"
        >
          {riskLevel === 'safe' || riskLevel === 'low' ? (
            <path
              d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : riskLevel === 'medium' ? (
            <path
              d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="M12 8V12M12 16H12.01M4.93 4.93L19.07 19.07M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      )}
    </div>
  );
};

// ============================================================================
// RISK BAR
// ============================================================================

interface RiskBarProps {
  score: number;
  height?: number;
  showMarkers?: boolean;
  animated?: boolean;
  className?: string;
}

export const RiskBar: React.FC<RiskBarProps> = ({
  score,
  height = 8,
  showMarkers = true,
  animated = true,
  className,
}) => {
  const riskLevel = getRiskLevel(score);
  const progressWidth = useMotionValue(0);

  useEffect(() => {
    if (animated) {
      progressWidth.set(score);
    }
  }, [score, animated, progressWidth]);

  return (
    <div className={cn('relative', className)}>
      {/* Background bar */}
      <div
        className="w-full rounded-full bg-smoke-200 dark:bg-charcoal-800 overflow-hidden"
        style={{ height }}
      >
        {/* Gradient background */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: 'linear-gradient(to right, #22c55e, #4ade80, #fbbf24, #f87171, #ef4444)',
          }}
        />

        {/* Progress bar */}
        <motion.div
          className="h-full rounded-full relative overflow-hidden"
          style={{
            width: animated ? progressWidth.get() + '%' : score + '%',
            background: `linear-gradient(to right, 
              ${riskLevel === 'safe' ? '#22c55e, #16a34a' :
                riskLevel === 'low' ? '#4ade80, #22c55e' :
                riskLevel === 'medium' ? '#fbbf24, #f59e0b' :
                riskLevel === 'high' ? '#f87171, #ef4444' :
                '#ef4444, #dc2626'}
            )`,
          }}
          animate={animated ? { width: score + '%' } : {}}
          transition={{
            duration: 1.5,
            ease: tokens.animations.timing.smooth,
          }}
        >
          {/* Shimmer effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{
              duration: 1.5,
              delay: 0.5,
              ease: 'linear',
            }}
          />
        </motion.div>
      </div>

      {/* Risk markers */}
      {showMarkers && (
        <div className="flex justify-between mt-2 text-xs text-charcoal-500 dark:text-smoke-500">
          <span>0</span>
          <span>20</span>
          <span>40</span>
          <span>60</span>
          <span>80</span>
          <span>100</span>
        </div>
      )}
    </div>
  );
};