/**
 * Model-Inspired Button Component
 * A sophisticated button with minimal aesthetics and smooth interactions
 */

import React, { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { tokens } from '../../tokens';
import { useTheme } from '../../providers/ThemeProvider';

// ============================================================================
// TYPES
// ============================================================================

export interface ModelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  ripple?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ModelButton = forwardRef<HTMLButtonElement, ModelButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      icon,
      iconPosition = 'left',
      ripple = true,
      className,
      children,
      disabled,
      onClick,
      ...props
    },
    ref
  ) => {
    const { theme } = useTheme();
    const [ripples, setRipples] = React.useState<Array<{ x: number; y: number; id: number }>>([]);

    // Handle ripple effect
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (ripple && !disabled && !loading) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const id = Date.now();

        setRipples((prev) => [...prev, { x, y, id }]);

        setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== id));
        }, 600);
      }

      onClick?.(e);
    };

    // Base styles
    const baseStyles = cn(
      'relative overflow-hidden',
      'inline-flex items-center justify-center',
      'font-medium',
      'transition-all duration-150 ease-out',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed',
      fullWidth && 'w-full'
    );

    // Variant styles
    const variantStyles = {
      primary: cn(
        'bg-cerulean-500 text-white',
        'hover:bg-cerulean-600',
        'active:bg-cerulean-700',
        'focus-visible:ring-cerulean-500',
        'disabled:bg-smoke-300 disabled:text-smoke-500'
      ),
      secondary: cn(
        'bg-transparent text-charcoal-700',
        'border border-smoke-300',
        'hover:bg-smoke-50 hover:border-smoke-400',
        'active:bg-smoke-100',
        'focus-visible:ring-charcoal-500',
        'dark:text-smoke-200 dark:border-charcoal-700',
        'dark:hover:bg-charcoal-800 dark:hover:border-charcoal-600',
        'disabled:border-smoke-200 disabled:text-smoke-400'
      ),
      ghost: cn(
        'bg-transparent text-charcoal-600',
        'hover:bg-smoke-100 hover:text-charcoal-900',
        'active:bg-smoke-200',
        'focus-visible:ring-charcoal-500',
        'dark:text-smoke-300 dark:hover:bg-charcoal-800 dark:hover:text-smoke-100',
        'disabled:text-smoke-400 dark:disabled:text-charcoal-600'
      ),
      destructive: cn(
        'bg-crimson-500 text-white',
        'hover:bg-crimson-600',
        'active:bg-crimson-700',
        'focus-visible:ring-crimson-500',
        'disabled:bg-smoke-300 disabled:text-smoke-500'
      ),
    };

    // Size styles
    const sizeStyles = {
      xs: cn('h-7 px-2.5 text-xs rounded-md gap-1.5'),
      sm: cn('h-8 px-3 text-sm rounded-md gap-2'),
      md: cn('h-10 px-4 text-base rounded-lg gap-2'),
      lg: cn('h-12 px-6 text-lg rounded-lg gap-3'),
      xl: cn('h-14 px-8 text-xl rounded-xl gap-3'),
    };

    // Loading spinner
    const LoadingSpinner = () => (
      <motion.svg
        className="animate-spin"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.15 }}
      >
        <path
          d="M8 1.5C8 0.671573 7.32843 0 6.5 0C5.67157 0 5 0.671573 5 1.5C5 2.32843 5.67157 3 6.5 3C7.32843 3 8 2.32843 8 1.5Z"
          fill="currentColor"
          opacity="0.3"
        />
        <path
          d="M8 14.5C8 13.6716 7.32843 13 6.5 13C5.67157 13 5 13.6716 5 14.5C5 15.3284 5.67157 16 6.5 16C7.32843 16 8 15.3284 8 14.5Z"
          fill="currentColor"
          opacity="0.3"
        />
        <path
          d="M14.5 8C15.3284 8 16 7.32843 16 6.5C16 5.67157 15.3284 5 14.5 5C13.6716 5 13 5.67157 13 6.5C13 7.32843 13.6716 8 14.5 8Z"
          fill="currentColor"
          opacity="0.3"
        />
        <path
          d="M1.5 8C2.32843 8 3 7.32843 3 6.5C3 5.67157 2.32843 5 1.5 5C0.671573 5 0 5.67157 0 6.5C0 7.32843 0.671573 8 1.5 8Z"
          fill="currentColor"
        />
        <path
          d="M12.8033 3.69669C13.4343 4.32777 14.4686 4.32777 15.0997 3.69669C15.7308 3.06561 15.7308 2.03137 15.0997 1.40029C14.4686 0.769207 13.4343 0.769207 12.8033 1.40029C12.1722 2.03137 12.1722 3.06561 12.8033 3.69669Z"
          fill="currentColor"
          opacity="0.3"
        />
        <path
          d="M3.19669 12.8033C3.82777 13.4343 4.86201 13.4343 5.49309 12.8033C6.12417 12.1722 6.12417 11.138 5.49309 10.5069C4.86201 9.87583 3.82777 9.87583 3.19669 10.5069C2.56561 11.138 2.56561 12.1722 3.19669 12.8033Z"
          fill="currentColor"
          opacity="0.3"
        />
        <path
          d="M12.8033 12.8033C12.1722 12.1722 12.1722 11.138 12.8033 10.5069C13.4343 9.87583 14.4686 9.87583 15.0997 10.5069C15.7308 11.138 15.7308 12.1722 15.0997 12.8033C14.4686 13.4343 13.4343 13.4343 12.8033 12.8033Z"
          fill="currentColor"
          opacity="0.3"
        />
        <path
          d="M3.19669 3.69669C2.56561 3.06561 2.56561 2.03137 3.19669 1.40029C3.82777 0.769207 4.86201 0.769207 5.49309 1.40029C6.12417 2.03137 6.12417 3.06561 5.49309 3.69669C4.86201 4.32777 3.82777 4.32777 3.19669 3.69669Z"
          fill="currentColor"
          opacity="0.3"
        />
      </motion.svg>
    );

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={disabled || loading}
        onClick={handleClick}
        {...props}
      >
        {/* Ripple effects */}
        <AnimatePresence>
          {ripples.map((ripple) => (
            <motion.span
              key={ripple.id}
              className="absolute rounded-full bg-current opacity-30 pointer-events-none"
              style={{
                left: ripple.x,
                top: ripple.y,
              }}
              initial={{ width: 0, height: 0, x: 0, y: 0 }}
              animate={{ width: 300, height: 300, x: -150, y: -150 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          ))}
        </AnimatePresence>

        {/* Button content */}
        <AnimatePresence mode="wait">
          {loading ? (
            <LoadingSpinner key="loading" />
          ) : (
            <motion.span
              key="content"
              className="relative z-10 flex items-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {icon && iconPosition === 'left' && (
                <span className="shrink-0">{icon}</span>
              )}
              {children}
              {icon && iconPosition === 'right' && (
                <span className="shrink-0">{icon}</span>
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    );
  }
);

ModelButton.displayName = 'ModelButton';

// ============================================================================
// PRESET VARIANTS
// ============================================================================

export const PrimaryButton: React.FC<Omit<ModelButtonProps, 'variant'>> = (props) => (
  <ModelButton variant="primary" {...props} />
);

export const SecondaryButton: React.FC<Omit<ModelButtonProps, 'variant'>> = (props) => (
  <ModelButton variant="secondary" {...props} />
);

export const GhostButton: React.FC<Omit<ModelButtonProps, 'variant'>> = (props) => (
  <ModelButton variant="ghost" {...props} />
);

export const DestructiveButton: React.FC<Omit<ModelButtonProps, 'variant'>> = (props) => (
  <ModelButton variant="destructive" {...props} />
);

// ============================================================================
// BUTTON GROUP
// ============================================================================

interface ButtonGroupProps {
  children: React.ReactNode;
  className?: string;
  spacing?: keyof typeof tokens.spacing;
}

export const ButtonGroup: React.FC<ButtonGroupProps> = ({
  children,
  className,
  spacing = '2',
}) => (
  <div
    className={cn('flex items-center', className)}
    style={{ gap: tokens.spacing[spacing] }}
  >
    {children}
  </div>
);