/**
 * Fine Print AI - Badge Component
 * Accessible badge component with risk-level variants and status indicators
 */

import React, { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../../lib/utils'
import { useTheme } from '../../providers/ThemeProvider'
import type { BadgeSize, BadgeVariant, BadgeRisk, RiskLevel } from '../../tokens'

// =============================================================================
// BADGE VARIANTS
// =============================================================================

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5',
    'text-xs font-semibold transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
    // High contrast support
    '@media (prefers-contrast: high) { border-width: 2px }',
  ],
  {
    variants: {
      variant: {
        default: [
          'border-transparent bg-fp-surface-secondary text-fp-fg-primary',
          'hover:bg-fp-surface-tertiary',
        ],
        secondary: [
          'border-transparent bg-fp-surface-tertiary text-fp-fg-secondary',
          'hover:bg-fp-border-primary',
        ],
        outline: [
          'border-fp-border-primary text-fp-fg-primary',
          'hover:bg-fp-surface-secondary',
        ],
        destructive: [
          'border-transparent bg-fp-status-error text-fp-fg-inverse',
          'hover:opacity-80',
        ],
        success: [
          'border-transparent bg-fp-status-success text-fp-fg-inverse',
          'hover:opacity-80',
        ],
        warning: [
          'border-transparent bg-fp-status-warning text-fp-fg-inverse',
          'hover:opacity-80',
        ],
        info: [
          'border-transparent bg-fp-status-info text-fp-fg-inverse',
          'hover:opacity-80',
        ],
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
      },
      risk: {
        safe: [
          'border-transparent bg-fp-risk-safe text-fp-fg-inverse',
          'hover:opacity-80',
        ],
        low: [
          'border-transparent bg-fp-risk-low text-fp-fg-inverse',
          'hover:opacity-80',
        ],
        medium: [
          'border-transparent bg-fp-risk-medium text-fp-fg-inverse',
          'hover:opacity-80',
        ],
        high: [
          'border-transparent bg-fp-risk-high text-fp-fg-inverse',
          'hover:opacity-80',
        ],
        critical: [
          'border-transparent bg-fp-risk-critical text-fp-fg-inverse',
          'hover:opacity-80',
        ],
      },
      interactive: {
        true: 'cursor-pointer',
        false: '',
      },
    },
    compoundVariants: [
      // Risk variants override other variants
      {
        risk: ['safe', 'low', 'medium', 'high', 'critical'],
        variant: ['default', 'secondary', 'outline', 'destructive'],
        className: 'border-transparent hover:opacity-80',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'md',
      interactive: false,
    },
  }
)

// =============================================================================
// BADGE TYPES
// =============================================================================

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  children: React.ReactNode
  icon?: React.ReactNode
  onRemove?: () => void
  'data-testid'?: string
}

// =============================================================================
// BADGE COMPONENT
// =============================================================================

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ 
    className, 
    variant, 
    size, 
    risk,
    interactive,
    children,
    icon,
    onRemove,
    'data-testid': testId,
    onClick,
    ...props 
  }, ref) => {
    const isInteractive = interactive || onClick || onRemove

    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ 
          variant, 
          size, 
          risk,
          interactive: isInteractive,
          className 
        }))}
        data-testid={testId}
        onClick={onClick}
        role={isInteractive ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onKeyDown={isInteractive ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick?.(e as any)
          }
        } : undefined}
        {...props}
      >
        {icon && (
          <span className="inline-flex items-center" aria-hidden="true">
            {icon}
          </span>
        )}
        
        <span>{children}</span>
        
        {onRemove && (
          <button
            type="button"
            className="ml-1 inline-flex h-3 w-3 items-center justify-center rounded-full hover:bg-black/20 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-white/50"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            aria-label="Remove"
          >
            <svg className="h-2 w-2" viewBox="0 0 6 6" aria-hidden="true">
              <path
                d="M1 1l4 4M5 1L1 5"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>
    )
  }
)

Badge.displayName = 'Badge'

// =============================================================================
// RISK BADGE COMPONENT
// =============================================================================

export interface RiskBadgeProps extends Omit<BadgeProps, 'variant' | 'risk' | 'children'> {
  riskLevel: RiskLevel
  score?: number
  showScore?: boolean
  showLabel?: boolean
}

const RiskBadge = forwardRef<HTMLDivElement, RiskBadgeProps>(
  ({ 
    riskLevel, 
    score, 
    showScore = false, 
    showLabel = true, 
    className,
    ...props 
  }, ref) => {
    const riskLabels = {
      safe: 'Safe',
      low: 'Low Risk',
      medium: 'Medium Risk',
      high: 'High Risk',
      critical: 'Critical',
    }

    const riskIcons = {
      safe: '✓',
      low: '◐',
      medium: '◑',
      high: '◕',
      critical: '●',
    }

    return (
      <Badge
        ref={ref}
        risk={riskLevel}
        className={cn('font-bold uppercase tracking-wide', className)}
        icon={<span className="text-xs">{riskIcons[riskLevel]}</span>}
        {...props}
      >
        {showLabel && riskLabels[riskLevel]}
        {showScore && score !== undefined && (
          <span className="ml-1">({score})</span>
        )}
      </Badge>
    )
  }
)

RiskBadge.displayName = 'RiskBadge'

// =============================================================================
// STATUS BADGE COMPONENT
// =============================================================================

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant' | 'children'> {
  status: 'success' | 'warning' | 'error' | 'info' | 'processing' | 'default'
  children: React.ReactNode
  pulse?: boolean
}

const StatusBadge = forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ status, children, pulse = false, className, ...props }, ref) => {
    const statusVariants = {
      success: 'success',
      warning: 'warning',
      error: 'destructive',
      info: 'info',
      processing: 'secondary',
      default: 'default',
    } as const

    const statusIcons = {
      success: '✓',
      warning: '⚠',
      error: '✕',
      info: 'ⓘ',
      processing: '○',
      default: null,
    }

    return (
      <Badge
        ref={ref}
        variant={statusVariants[status]}
        className={cn(
          pulse && status === 'processing' && 'animate-pulse',
          className
        )}
        icon={statusIcons[status] ? (
          <span className="text-xs" aria-hidden="true">
            {statusIcons[status]}
          </span>
        ) : undefined}
        {...props}
      >
        {children}
      </Badge>
    )
  }
)

StatusBadge.displayName = 'StatusBadge'

// =============================================================================
// NOTIFICATION BADGE COMPONENT
// =============================================================================

export interface NotificationBadgeProps extends Omit<BadgeProps, 'children'> {
  count: number
  max?: number
  showZero?: boolean
}

const NotificationBadge = forwardRef<HTMLDivElement, NotificationBadgeProps>(
  ({ count, max = 99, showZero = false, className, ...props }, ref) => {
    if (count === 0 && !showZero) return null

    const displayCount = count > max ? `${max}+` : count.toString()

    return (
      <Badge
        ref={ref}
        variant="destructive"
        size="sm"
        className={cn(
          'min-w-[1.25rem] justify-center rounded-full px-1',
          className
        )}
        {...props}
      >
        {displayCount}
      </Badge>
    )
  }
)

NotificationBadge.displayName = 'NotificationBadge'

// =============================================================================
// BADGE GROUP COMPONENT
// =============================================================================

export interface BadgeGroupProps {
  children: React.ReactNode
  className?: string
  spacing?: 'sm' | 'md' | 'lg'
  wrap?: boolean
  'data-testid'?: string
}

const BadgeGroup: React.FC<BadgeGroupProps> = ({
  children,
  className,
  spacing = 'sm',
  wrap = true,
  'data-testid': testId,
}) => {
  const spacingClasses = {
    sm: 'gap-1',
    md: 'gap-2',
    lg: 'gap-3',
  }

  return (
    <div
      className={cn(
        'flex items-center',
        spacingClasses[spacing],
        wrap && 'flex-wrap',
        className
      )}
      data-testid={testId}
      role="group"
    >
      {children}
    </div>
  )
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  Badge,
  RiskBadge,
  StatusBadge,
  NotificationBadge,
  BadgeGroup,
  badgeVariants,
}

export type { BadgeSize, BadgeVariant, BadgeRisk }