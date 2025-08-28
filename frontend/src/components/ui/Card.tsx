import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ANIMATION_VARIANTS } from '@/lib/constants'

const cardVariants = cva(
  'rounded-xl border bg-card text-card-foreground transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'shadow-soft hover:shadow-medium',
        elevated: 'shadow-medium hover:shadow-strong',
        flat: 'border-border',
        ghost: 'border-transparent bg-transparent',
        gradient: 'bg-gradient-to-br from-white/50 to-white/25 dark:from-white/5 dark:to-white/2 backdrop-blur-sm',
      },
      padding: {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
        xl: 'p-10',
      },
      hover: {
        none: '',
        lift: 'hover:-translate-y-1 hover:scale-[1.02]',
        glow: 'hover:shadow-glow-guardian dark:hover:shadow-glow-guardian',
        scale: 'hover:scale-[1.02]',
      },
      interactive: {
        true: 'cursor-pointer select-none',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
      hover: 'none',
      interactive: false,
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean
  animated?: boolean
  animationVariant?: keyof typeof ANIMATION_VARIANTS
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ 
    className, 
    variant, 
    padding, 
    hover, 
    interactive,
    animated = false,
    animationVariant = 'slideUp',
    children,
    ...props 
  }, ref) => {
    const cardContent = (
      <div
        className={cn(cardVariants({ variant, padding, hover, interactive, className }))}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    )

    if (animated) {
      return (
        <motion.div
          variants={ANIMATION_VARIANTS[animationVariant]}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {cardContent}
        </motion.div>
      )
    }

    return cardContent
  }
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-0', className)}
    {...props}
  />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('font-semibold leading-none tracking-tight text-xl', className)}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-0 pt-6', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-0 pt-6', className)}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }