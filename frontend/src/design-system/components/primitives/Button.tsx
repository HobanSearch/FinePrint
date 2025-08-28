/**
 * Fine Print AI - Button Component
 * Accessible, cross-platform button with risk-level variants
 */

import React, { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useTheme } from '../../providers/ThemeProvider'
import type { ButtonSize, ButtonVariant, ButtonRisk } from '../../tokens'

// =============================================================================
// BUTTON VARIANTS
// =============================================================================

const buttonVariants = cva(
  // Base styles
  [
    'inline-flex items-center justify-center gap-2',
    'whitespace-nowrap rounded-lg text-sm font-medium',
    'ring-offset-background transition-all duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    // Accessibility
    'select-none',
    // High contrast support
    '@media (prefers-contrast: high) { border-width: 2px }',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-fp-brand-primary text-fp-fg-inverse',
          'shadow-soft hover:shadow-medium hover:scale-[1.02] active:scale-[0.98]',
          'hover:bg-fp-interactive-hover active:bg-fp-interactive-active',
          'focus-visible:ring-fp-interactive-focus',
        ],
        secondary: [
          'bg-fp-surface-secondary text-fp-fg-primary border border-fp-border-primary',
          'shadow-soft hover:shadow-medium hover:scale-[1.02] active:scale-[0.98]',
          'hover:bg-fp-surface-tertiary active:bg-fp-border-primary',
          'focus-visible:ring-fp-interactive-focus',
        ],
        outline: [
          'border border-fp-border-primary bg-transparent text-fp-fg-primary',
          'shadow-soft hover:shadow-medium',
          'hover:bg-fp-surface-secondary hover:text-fp-fg-primary',
          'focus-visible:ring-fp-interactive-focus',
        ],
        ghost: [
          'bg-transparent text-fp-fg-primary',
          'hover:bg-fp-surface-secondary hover:text-fp-fg-primary',
          'focus-visible:ring-fp-interactive-focus',
        ],
        link: [
          'text-fp-brand-primary underline-offset-4',
          'hover:underline',
          'focus-visible:ring-fp-interactive-focus',
        ],
        destructive: [
          'bg-fp-status-error text-fp-fg-inverse',
          'shadow-soft hover:shadow-medium hover:scale-[1.02] active:scale-[0.98]',
          'hover:opacity-90 active:opacity-80',
          'focus-visible:ring-fp-status-error',
        ],
      },
      size: {
        xs: 'h-6 rounded-md px-2 text-xs',
        sm: 'h-8 rounded-md px-3 text-xs',
        md: 'h-10 px-4 py-2',
        lg: 'h-12 rounded-lg px-8 text-base',
        xl: 'h-14 rounded-xl px-10 text-lg',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8',
        'icon-lg': 'h-12 w-12',
        'icon-xl': 'h-14 w-14',
      },
      risk: {
        safe: 'bg-fp-risk-safe text-fp-fg-inverse hover:opacity-90',
        low: 'bg-fp-risk-low text-fp-fg-inverse hover:opacity-90',
        medium: 'bg-fp-risk-medium text-fp-fg-inverse hover:opacity-90',
        high: 'bg-fp-risk-high text-fp-fg-inverse hover:opacity-90',
        critical: 'bg-fp-risk-critical text-fp-fg-inverse hover:opacity-90',
      },
      loading: {
        true: 'cursor-not-allowed',
        false: '',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    compoundVariants: [
      // Risk variants override other variants
      {
        risk: ['safe', 'low', 'medium', 'high', 'critical'],
        variant: ['primary', 'secondary', 'outline', 'destructive'],
        className: 'shadow-soft hover:shadow-medium hover:scale-[1.02] active:scale-[0.98]',
      },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      loading: false,
      fullWidth: false,
    },
  }
)

// =============================================================================
// BUTTON TYPES
// =============================================================================

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
  'data-testid'?: string
}

// =============================================================================
// BUTTON COMPONENT
// =============================================================================

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant, 
    size, 
    risk,
    asChild = false, 
    loading = false,
    leftIcon,
    rightIcon,
    children,
    disabled,
    fullWidth,
    'data-testid': testId,
    ...props 
  }, ref) => {
    const { theme } = useTheme()
    const Comp = asChild ? Slot : 'button'
    
    // Determine the final variant based on risk level
    const finalVariant = risk ? 'primary' : variant
    
    return (
      <Comp
        className={cn(buttonVariants({ 
          variant: finalVariant, 
          size, 
          risk,
          loading, 
          fullWidth,
          className 
        }))}
        ref={ref}
        disabled={disabled || loading}
        data-testid={testId}
        aria-busy={loading}
        aria-disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading...</span>
          </>
        )}
        {!loading && leftIcon && (
          <span aria-hidden="true">{leftIcon}</span>
        )}
        {children}
        {!loading && rightIcon && (
          <span aria-hidden="true">{rightIcon}</span>
        )}
      </Comp>
    )
  }
)

Button.displayName = 'Button'

// =============================================================================
// BUTTON GROUP COMPONENT
// =============================================================================

export interface ButtonGroupProps {
  children: React.ReactNode
  className?: string
  orientation?: 'horizontal' | 'vertical'
  spacing?: 'none' | 'sm' | 'md' | 'lg'
  'data-testid'?: string
}

export const ButtonGroup: React.FC<ButtonGroupProps> = ({
  children,
  className,
  orientation = 'horizontal',
  spacing = 'sm',
  'data-testid': testId,
}) => {
  const spacingClasses = {
    none: '',
    sm: orientation === 'horizontal' ? 'gap-2' : 'gap-2',
    md: orientation === 'horizontal' ? 'gap-4' : 'gap-4',
    lg: orientation === 'horizontal' ? 'gap-6' : 'gap-6',
  }

  return (
    <div
      className={cn(
        'flex',
        orientation === 'vertical' ? 'flex-col' : 'flex-row',
        spacingClasses[spacing],
        className
      )}
      role="group"
      data-testid={testId}
      data-orientation={orientation}
    >
      {children}
    </div>
  )
}

// =============================================================================
// ICON BUTTON COMPONENT
// =============================================================================

export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children'> {
  icon: React.ReactNode
  'aria-label': string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, size = 'icon', ...props }, ref) => {
    return (
      <Button
        ref={ref}
        size={size}
        {...props}
      >
        {icon}
      </Button>
    )
  }
)

IconButton.displayName = 'IconButton'

// =============================================================================
// EXPORTS
// =============================================================================

export { Button, buttonVariants }
export type { ButtonSize, ButtonVariant, ButtonRisk }