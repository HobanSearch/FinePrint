/**
 * Fine Print AI - Card Component
 * Accessible, flexible card component with multiple variants
 */

import React, { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../../lib/utils'
import { useTheme } from '../../providers/ThemeProvider'
import type { CardVariant, CardPadding } from '../../tokens'

// =============================================================================
// CARD VARIANTS
// =============================================================================

const cardVariants = cva(
  [
    'rounded-lg',
    'transition-all duration-200',
    // High contrast support
    '@media (prefers-contrast: high) { border-width: 2px }',
  ],
  {
    variants: {
      variant: {
        default: [
          'bg-fp-surface-primary',
          'border border-fp-border-primary',
          'shadow-soft',
        ],
        outlined: [
          'bg-fp-surface-primary',
          'border-2 border-fp-border-secondary',
        ],
        elevated: [
          'bg-fp-surface-primary',
          'border border-fp-border-primary',
          'shadow-lg hover:shadow-xl',
        ],
        filled: [
          'bg-fp-surface-secondary',
          'border border-fp-border-primary',
        ],
        ghost: [
          'bg-transparent',
        ],
      },
      padding: {
        none: 'p-0',
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
        xl: 'p-8',
      },
      interactive: {
        true: [
          'cursor-pointer',
          'hover:shadow-medium hover:scale-[1.01]',
          'active:scale-[0.99]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fp-interactive-focus focus-visible:ring-offset-2',
        ],
        false: '',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
      interactive: false,
      fullWidth: false,
    },
  }
)

// =============================================================================
// CARD TYPES
// =============================================================================

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean
  'data-testid'?: string
}

// =============================================================================
// CARD COMPONENT
// =============================================================================

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ 
    className, 
    variant, 
    padding, 
    interactive,
    fullWidth,
    'data-testid': testId,
    ...props 
  }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ 
          variant, 
          padding, 
          interactive,
          fullWidth,
          className 
        }))}
        data-testid={testId}
        tabIndex={interactive ? 0 : undefined}
        role={interactive ? 'button' : undefined}
        {...props}
      />
    )
  }
)

Card.displayName = 'Card'

// =============================================================================
// CARD HEADER COMPONENT
// =============================================================================

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  'data-testid'?: string
}

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, 'data-testid': testId, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      data-testid={testId}
      {...props}
    />
  )
)

CardHeader.displayName = 'CardHeader'

// =============================================================================
// CARD TITLE COMPONENT
// =============================================================================

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  'data-testid'?: string
}

const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Comp = 'h3', 'data-testid': testId, ...props }, ref) => (
    <Comp
      ref={ref}
      className={cn(
        'text-2xl font-semibold leading-none tracking-tight text-fp-fg-primary',
        className
      )}
      data-testid={testId}
      {...props}
    />
  )
)

CardTitle.displayName = 'CardTitle'

// =============================================================================
// CARD DESCRIPTION COMPONENT
// =============================================================================

export interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  'data-testid'?: string
}

const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className, 'data-testid': testId, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm text-fp-fg-secondary', className)}
      data-testid={testId}
      {...props}
    />
  )
)

CardDescription.displayName = 'CardDescription'

// =============================================================================
// CARD CONTENT COMPONENT
// =============================================================================

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  'data-testid'?: string
}

const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, 'data-testid': testId, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('p-6 pt-0', className)}
      data-testid={testId}
      {...props}
    />
  )
)

CardContent.displayName = 'CardContent'

// =============================================================================
// CARD FOOTER COMPONENT
// =============================================================================

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  'data-testid'?: string
}

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, 'data-testid': testId, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center p-6 pt-0', className)}
      data-testid={testId}
      {...props}
    />
  )
)

CardFooter.displayName = 'CardFooter'

// =============================================================================
// SPECIALIZED CARD COMPONENTS
// =============================================================================

// Risk Card - specialized for displaying risk information
export interface RiskCardProps extends Omit<CardProps, 'variant'> {
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical'
  riskScore?: number
  title?: string
  description?: string
  actions?: React.ReactNode
}

const RiskCard = forwardRef<HTMLDivElement, RiskCardProps>(
  ({ 
    riskLevel, 
    riskScore, 
    title, 
    description, 
    actions, 
    children, 
    className,
    ...props 
  }, ref) => {
    const riskColors = {
      safe: 'border-fp-risk-safe bg-gradient-to-br from-fp-risk-safe/10 to-fp-risk-safe/5',
      low: 'border-fp-risk-low bg-gradient-to-br from-fp-risk-low/10 to-fp-risk-low/5',
      medium: 'border-fp-risk-medium bg-gradient-to-br from-fp-risk-medium/10 to-fp-risk-medium/5',
      high: 'border-fp-risk-high bg-gradient-to-br from-fp-risk-high/10 to-fp-risk-high/5',
      critical: 'border-fp-risk-critical bg-gradient-to-br from-fp-risk-critical/10 to-fp-risk-critical/5',
    }

    return (
      <Card
        ref={ref}
        variant="outlined"
        className={cn(
          riskColors[riskLevel],
          'border-l-4',
          className
        )}
        {...props}
      >
        {(title || description || riskScore !== undefined) && (
          <CardHeader>
            {title && (
              <CardTitle className="flex items-center justify-between">
                {title}
                {riskScore !== undefined && (
                  <span className="text-lg font-bold text-fp-fg-secondary">
                    {riskScore}/100
                  </span>
                )}
              </CardTitle>
            )}
            {description && (
              <CardDescription>{description}</CardDescription>
            )}
          </CardHeader>
        )}
        
        {children && (
          <CardContent>{children}</CardContent>
        )}
        
        {actions && (
          <CardFooter>{actions}</CardFooter>
        )}
      </Card>
    )
  }
)

RiskCard.displayName = 'RiskCard'

// Stats Card - for displaying key metrics
export interface StatsCardProps extends Omit<CardProps, 'variant'> {
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: number
    label: string
    direction: 'up' | 'down' | 'neutral'
  }
  icon?: React.ReactNode
}

const StatsCard = forwardRef<HTMLDivElement, StatsCardProps>(
  ({ title, value, subtitle, trend, icon, className, ...props }, ref) => {
    const trendColors = {
      up: 'text-fp-status-success',
      down: 'text-fp-status-error',
      neutral: 'text-fp-fg-secondary',
    }

    return (
      <Card
        ref={ref}
        variant="elevated"
        className={cn('relative overflow-hidden', className)}
        {...props}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-fp-fg-secondary">{title}</p>
              <p className="text-3xl font-bold text-fp-fg-primary">{value}</p>
              {subtitle && (
                <p className="text-xs text-fp-fg-tertiary">{subtitle}</p>
              )}
            </div>
            {icon && (
              <div className="rounded-full bg-fp-surface-secondary p-3 text-fp-fg-secondary">
                {icon}
              </div>
            )}
          </div>
          
          {trend && (
            <div className={cn('mt-4 flex items-center gap-2', trendColors[trend.direction])}>
              <span className="text-sm font-medium">
                {trend.direction === 'up' ? '↗' : trend.direction === 'down' ? '↘' : '→'} 
                {trend.value}%
              </span>
              <span className="text-xs text-fp-fg-tertiary">{trend.label}</span>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }
)

StatsCard.displayName = 'StatsCard'

// =============================================================================
// EXPORTS
// =============================================================================

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  RiskCard,
  StatsCard,
  cardVariants,
}

export type { CardVariant, CardPadding }