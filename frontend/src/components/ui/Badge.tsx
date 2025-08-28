import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
        outline: 'text-foreground',
        // Risk level variants aligned with brand colors
        critical: 'border-transparent bg-danger-100 text-danger-800 dark:bg-danger-950 dark:text-danger-200',
        high: 'border-transparent bg-alert-100 text-alert-800 dark:bg-alert-950 dark:text-alert-200',
        medium: 'border-transparent bg-alert-50 text-alert-700 dark:bg-alert-950/50 dark:text-alert-300',
        low: 'border-transparent bg-sage-100 text-sage-800 dark:bg-sage-950 dark:text-sage-200',
        minimal: 'border-transparent bg-sage-50 text-sage-700 dark:bg-sage-950/50 dark:text-sage-300',
        // Category variants
        guardian: 'border-transparent bg-guardian-100 text-guardian-800 dark:bg-guardian-950 dark:text-guardian-200',
        sage: 'border-transparent bg-sage-100 text-sage-800 dark:bg-sage-950 dark:text-sage-200',
        warning: 'border-transparent bg-alert-100 text-alert-800 dark:bg-alert-950 dark:text-alert-200',
        success: 'border-transparent bg-sage-100 text-sage-800 dark:bg-sage-950 dark:text-sage-200',
      },
      size: {
        sm: 'px-1.5 py-0.5 text-xs',
        default: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
      },
      shape: {
        default: 'rounded-full',
        square: 'rounded-md',
        pill: 'rounded-full px-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      shape: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode
}

function Badge({ className, variant, size, shape, icon, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size, shape }), className)} {...props}>
      {icon && <span className="mr-1">{icon}</span>}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }