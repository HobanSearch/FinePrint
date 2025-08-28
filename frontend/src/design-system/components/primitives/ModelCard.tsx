/**
 * Model-Inspired Card Component
 * Elegant cards with subtle shadows and smooth interactions
 */

import React, { forwardRef } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { tokens } from '../../tokens';
import { useTheme } from '../../providers/ThemeProvider';

// ============================================================================
// TYPES
// ============================================================================

export interface ModelCardProps extends HTMLMotionProps<'div'> {
  variant?: 'default' | 'outlined' | 'elevated' | 'filled' | 'interactive';
  padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  rounded?: keyof typeof tokens.borderRadius;
  shadow?: keyof typeof tokens.shadows;
  hoverable?: boolean;
  pressable?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ModelCard = forwardRef<HTMLDivElement, ModelCardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      rounded = 'xl',
      shadow,
      hoverable = false,
      pressable = false,
      className,
      children,
      onClick,
      ...props
    },
    ref
  ) => {
    const { theme } = useTheme();

    // Base styles
    const baseStyles = cn(
      'relative overflow-hidden',
      'transition-all duration-200 ease-out',
      (hoverable || pressable || onClick) && 'cursor-pointer'
    );

    // Variant styles
    const variantStyles = {
      default: cn(
        'bg-white dark:bg-charcoal-900',
        'border border-smoke-200 dark:border-charcoal-800',
        !shadow && 'shadow-sm'
      ),
      outlined: cn(
        'bg-transparent',
        'border border-smoke-300 dark:border-charcoal-700'
      ),
      elevated: cn(
        'bg-white dark:bg-charcoal-900',
        'border border-smoke-100 dark:border-charcoal-800',
        !shadow && 'shadow-md hover:shadow-lg'
      ),
      filled: cn(
        'bg-smoke-50 dark:bg-charcoal-800',
        'border border-transparent'
      ),
      interactive: cn(
        'bg-white dark:bg-charcoal-900',
        'border border-smoke-200 dark:border-charcoal-800',
        'hover:border-cerulean-300 dark:hover:border-cerulean-700',
        'hover:shadow-md',
        'active:scale-[0.99]',
        !shadow && 'shadow-sm'
      ),
    };

    // Padding styles
    const paddingStyles = {
      none: '',
      xs: 'p-2',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
      xl: 'p-8',
    };

    // Animation variants
    const animationVariants = {
      initial: {
        opacity: 0,
        y: 20,
      },
      animate: {
        opacity: 1,
        y: 0,
        transition: {
          duration: 0.3,
          ease: tokens.animations.timing.smooth,
        },
      },
      hover: hoverable ? {
        y: -2,
        transition: {
          duration: 0.2,
          ease: tokens.animations.timing['smooth-out'],
        },
      } : {},
      tap: pressable ? {
        scale: 0.98,
        transition: {
          duration: 0.1,
          ease: tokens.animations.timing['smooth-in'],
        },
      } : {},
    };

    return (
      <motion.div
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          paddingStyles[padding],
          className
        )}
        style={{
          borderRadius: tokens.borderRadius[rounded],
          boxShadow: shadow ? tokens.shadows[shadow] : undefined,
        }}
        variants={animationVariants}
        initial="initial"
        animate="animate"
        whileHover="hover"
        whileTap="tap"
        onClick={onClick}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

ModelCard.displayName = 'ModelCard';

// ============================================================================
// SPECIALIZED CARD COMPONENTS
// ============================================================================

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
  icon,
  className,
}) => (
  <div className={cn('flex items-start justify-between gap-4', className)}>
    <div className="flex items-start gap-3 flex-1">
      {icon && (
        <div className="shrink-0 w-10 h-10 rounded-lg bg-smoke-100 dark:bg-charcoal-800 flex items-center justify-center text-charcoal-600 dark:text-smoke-400">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-charcoal-900 dark:text-smoke-100 truncate">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-0.5 text-sm text-charcoal-600 dark:text-smoke-400">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {action && (
      <div className="shrink-0">
        {action}
      </div>
    )}
  </div>
);

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export const CardContent: React.FC<CardContentProps> = ({
  children,
  className,
}) => (
  <div className={cn('', className)}>
    {children}
  </div>
);

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
  separated?: boolean;
}

export const CardFooter: React.FC<CardFooterProps> = ({
  children,
  className,
  separated = false,
}) => (
  <div
    className={cn(
      'flex items-center justify-end gap-3',
      separated && 'pt-4 mt-4 border-t border-smoke-200 dark:border-charcoal-800',
      className
    )}
  >
    {children}
  </div>
);

// ============================================================================
// PRESET CARD VARIANTS
// ============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  change?: {
    value: number;
    trend: 'up' | 'down';
  };
  icon?: React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  change,
  icon,
  className,
}) => (
  <ModelCard variant="elevated" padding="lg" className={className}>
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-charcoal-600 dark:text-smoke-400">
          {label}
        </p>
        <p className="mt-2 text-3xl font-semibold text-charcoal-900 dark:text-smoke-100">
          {value}
        </p>
        {change && (
          <div className="mt-2 flex items-center gap-1">
            <motion.span
              className={cn(
                'text-sm font-medium',
                change.trend === 'up'
                  ? 'text-sage-600 dark:text-sage-400'
                  : 'text-crimson-600 dark:text-crimson-400'
              )}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {change.trend === 'up' ? '+' : '-'}{Math.abs(change.value)}%
            </motion.span>
            <svg
              className={cn(
                'w-4 h-4',
                change.trend === 'up'
                  ? 'text-sage-600 dark:text-sage-400'
                  : 'text-crimson-600 dark:text-crimson-400 rotate-180'
              )}
              fill="none"
              viewBox="0 0 16 16"
            >
              <path
                d="M8 10V4M8 4L5 7M8 4L11 7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>
      {icon && (
        <div className="shrink-0 w-12 h-12 rounded-xl bg-cerulean-50 dark:bg-cerulean-950/30 flex items-center justify-center text-cerulean-600 dark:text-cerulean-400">
          {icon}
        </div>
      )}
    </div>
  </ModelCard>
);

interface ActionCardProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const ActionCard: React.FC<ActionCardProps> = ({
  title,
  description,
  icon,
  action,
  className,
}) => (
  <ModelCard
    variant="interactive"
    padding="lg"
    hoverable
    pressable
    onClick={action?.onClick}
    className={className}
  >
    <div className="flex items-start gap-4">
      {icon && (
        <div className="shrink-0 w-12 h-12 rounded-xl bg-smoke-100 dark:bg-charcoal-800 flex items-center justify-center text-charcoal-600 dark:text-smoke-400">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-charcoal-900 dark:text-smoke-100">
          {title}
        </h3>
        <p className="mt-1 text-sm text-charcoal-600 dark:text-smoke-400">
          {description}
        </p>
      </div>
      {action && (
        <svg
          className="shrink-0 w-5 h-5 text-charcoal-400 dark:text-smoke-600 mt-0.5"
          fill="none"
          viewBox="0 0 20 20"
        >
          <path
            d="M7.5 5L12.5 10L7.5 15"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  </ModelCard>
);