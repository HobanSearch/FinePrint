/**
 * Model-Inspired Input Component
 * Clean input fields with floating labels and subtle interactions
 */

import React, { forwardRef, useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { tokens } from '../../tokens';
import { useTheme } from '../../providers/ThemeProvider';

// ============================================================================
// TYPES
// ============================================================================

export interface ModelInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  success?: boolean;
  helperText?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'filled' | 'underlined';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  clearable?: boolean;
  onClear?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ModelInput = forwardRef<HTMLInputElement, ModelInputProps>(
  (
    {
      label,
      error,
      success,
      helperText,
      size = 'md',
      variant = 'default',
      icon,
      iconPosition = 'left',
      clearable = false,
      onClear,
      className,
      id: providedId,
      onFocus,
      onBlur,
      onChange,
      value,
      placeholder,
      disabled,
      ...props
    },
    ref
  ) => {
    const { theme } = useTheme();
    const generatedId = useId();
    const id = providedId || generatedId;
    
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(!!value);

    // Handle focus
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    // Handle blur
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    // Handle change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(!!e.target.value);
      onChange?.(e);
    };

    // Handle clear
    const handleClear = () => {
      if (onClear) {
        onClear();
      } else {
        // Create synthetic event
        const input = document.getElementById(id) as HTMLInputElement;
        if (input) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          )?.set;
          nativeInputValueSetter?.call(input, '');
          const event = new Event('input', { bubbles: true });
          input.dispatchEvent(event);
        }
      }
      setHasValue(false);
    };

    // Container styles
    const containerStyles = cn(
      'relative',
      disabled && 'opacity-50 cursor-not-allowed'
    );

    // Wrapper styles (for border/background)
    const wrapperStyles = {
      default: cn(
        'relative rounded-lg border transition-all duration-150',
        'bg-white dark:bg-charcoal-900',
        error
          ? 'border-crimson-500 focus-within:ring-2 focus-within:ring-crimson-500/20'
          : success
          ? 'border-sage-500 focus-within:ring-2 focus-within:ring-sage-500/20'
          : cn(
              'border-smoke-300 dark:border-charcoal-700',
              'hover:border-smoke-400 dark:hover:border-charcoal-600',
              'focus-within:border-cerulean-500 dark:focus-within:border-cerulean-400',
              'focus-within:ring-2 focus-within:ring-cerulean-500/20'
            )
      ),
      filled: cn(
        'relative rounded-lg transition-all duration-150',
        'bg-smoke-100 dark:bg-charcoal-800',
        'border-2 border-transparent',
        error
          ? 'focus-within:border-crimson-500'
          : success
          ? 'focus-within:border-sage-500'
          : 'focus-within:border-cerulean-500'
      ),
      underlined: cn(
        'relative border-b-2 transition-all duration-150',
        error
          ? 'border-crimson-500'
          : success
          ? 'border-sage-500'
          : cn(
              'border-smoke-300 dark:border-charcoal-700',
              'hover:border-smoke-400 dark:hover:border-charcoal-600',
              'focus-within:border-cerulean-500 dark:focus-within:border-cerulean-400'
            )
      ),
    };

    // Input styles
    const inputStyles = cn(
      'w-full bg-transparent outline-none transition-all duration-150',
      'text-charcoal-900 dark:text-smoke-100',
      'placeholder:text-smoke-500 dark:placeholder:text-charcoal-500',
      disabled && 'cursor-not-allowed',
      // Size styles
      size === 'sm' && 'text-sm',
      size === 'md' && 'text-base',
      size === 'lg' && 'text-lg',
      // Padding based on variant and icon
      variant === 'underlined' ? 'pb-1' : '',
      variant === 'default' && cn(
        size === 'sm' && 'py-2',
        size === 'md' && 'py-2.5',
        size === 'lg' && 'py-3'
      ),
      variant === 'filled' && cn(
        size === 'sm' && 'py-2.5',
        size === 'md' && 'py-3',
        size === 'lg' && 'py-3.5'
      ),
      // Horizontal padding
      icon && iconPosition === 'left' && cn(
        size === 'sm' && 'pl-8 pr-3',
        size === 'md' && 'pl-10 pr-4',
        size === 'lg' && 'pl-12 pr-4'
      ),
      icon && iconPosition === 'right' && cn(
        size === 'sm' && 'pl-3 pr-8',
        size === 'md' && 'pl-4 pr-10',
        size === 'lg' && 'pl-4 pr-12'
      ),
      !icon && cn(
        size === 'sm' && 'px-3',
        size === 'md' && 'px-4',
        size === 'lg' && 'px-4'
      ),
      // Add space for clear button
      clearable && hasValue && 'pr-10'
    );

    // Label styles
    const labelStyles = cn(
      'absolute left-0 transition-all duration-150 pointer-events-none select-none',
      'text-smoke-600 dark:text-charcoal-400',
      // Positioning based on variant
      variant === 'underlined' && 'bottom-1',
      variant !== 'underlined' && cn(
        icon && iconPosition === 'left' && cn(
          size === 'sm' && 'left-8',
          size === 'md' && 'left-10',
          size === 'lg' && 'left-12'
        ),
        (!icon || iconPosition === 'right') && cn(
          size === 'sm' && 'left-3',
          size === 'md' && 'left-4',
          size === 'lg' && 'left-4'
        )
      ),
      // Floating behavior
      (isFocused || hasValue || placeholder) && cn(
        'text-xs',
        variant === 'underlined' && '-top-5',
        variant !== 'underlined' && cn(
          '-top-2 px-1',
          'bg-white dark:bg-charcoal-900',
          variant === 'filled' && 'bg-smoke-100 dark:bg-charcoal-800'
        )
      ),
      // Default position
      !(isFocused || hasValue || placeholder) && cn(
        size === 'sm' && 'text-sm top-2',
        size === 'md' && 'text-base top-2.5',
        size === 'lg' && 'text-lg top-3'
      ),
      // Error/success colors
      error && 'text-crimson-500 dark:text-crimson-400',
      success && 'text-sage-500 dark:text-sage-400',
      isFocused && !error && !success && 'text-cerulean-500 dark:text-cerulean-400'
    );

    // Icon styles
    const iconStyles = cn(
      'absolute flex items-center justify-center',
      'text-smoke-500 dark:text-charcoal-500',
      size === 'sm' && 'w-8 h-8',
      size === 'md' && 'w-10 h-10',
      size === 'lg' && 'w-12 h-12',
      iconPosition === 'left' && 'left-0',
      iconPosition === 'right' && 'right-0',
      variant === 'underlined' && 'bottom-0',
      variant !== 'underlined' && 'top-1/2 -translate-y-1/2'
    );

    // Clear button
    const ClearButton = () => (
      <motion.button
        type="button"
        onClick={handleClear}
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2',
          'w-6 h-6 rounded-full',
          'flex items-center justify-center',
          'text-smoke-500 hover:text-charcoal-700',
          'dark:text-charcoal-500 dark:hover:text-smoke-300',
          'hover:bg-smoke-100 dark:hover:bg-charcoal-800',
          'transition-all duration-150'
        )}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.15 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M9 3L3 9M3 3L9 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </motion.button>
    );

    return (
      <div className={containerStyles}>
        <div className={wrapperStyles[variant]}>
          {/* Icon */}
          {icon && (
            <div className={iconStyles}>
              {icon}
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={id}
            className={cn(inputStyles, className)}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleChange}
            {...props}
          />

          {/* Floating label */}
          {label && (
            <label
              htmlFor={id}
              className={labelStyles}
            >
              {label}
            </label>
          )}

          {/* Clear button */}
          <AnimatePresence>
            {clearable && hasValue && !disabled && (
              <ClearButton />
            )}
          </AnimatePresence>
        </div>

        {/* Helper text or error message */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.p
              key="error"
              className="mt-1.5 text-sm text-crimson-500 dark:text-crimson-400"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {error}
            </motion.p>
          )}
          {!error && helperText && (
            <motion.p
              key="helper"
              className={cn(
                'mt-1.5 text-sm',
                success
                  ? 'text-sage-500 dark:text-sage-400'
                  : 'text-smoke-600 dark:text-charcoal-400'
              )}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {helperText}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

ModelInput.displayName = 'ModelInput';

// ============================================================================
// SPECIALIZED INPUTS
// ============================================================================

export const SearchInput: React.FC<Omit<ModelInputProps, 'icon' | 'iconPosition'>> = (props) => {
  const SearchIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 14L11.1 11.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <ModelInput
      icon={SearchIcon}
      iconPosition="left"
      placeholder="Search..."
      clearable
      {...props}
    />
  );
};

export const PasswordInput: React.FC<Omit<ModelInputProps, 'type'>> = (props) => {
  const [showPassword, setShowPassword] = useState(false);

  const ToggleIcon = (
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="p-1 rounded hover:bg-smoke-100 dark:hover:bg-charcoal-800 transition-colors"
    >
      {showPassword ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M10.7867 10.7867C10.2377 11.3357 9.51365 11.6453 8.75736 11.6453C8.00107 11.6453 7.27697 11.3357 6.72798 10.7867C6.17899 10.2377 5.86939 9.51365 5.86939 8.75736C5.86939 8.00107 6.17899 7.27697 6.72798 6.72798M10.7867 10.7867L13.6569 13.6569M10.7867 10.7867L12.8995 8.674M6.72798 6.72798L3.85785 3.85785M6.72798 6.72798L4.61519 8.84077M13.6569 13.6569L11.7175 11.7175M13.6569 13.6569L14 14M3.85785 3.85785L5.79728 5.79728M3.85785 3.85785L2 2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M1.33333 8C1.33333 8 3.33333 2.66667 8 2.66667C12.6667 2.66667 14.6667 8 14.6667 8C14.6667 8 12.6667 13.3333 8 13.3333C3.33333 13.3333 1.33333 8 1.33333 8Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );

  return (
    <ModelInput
      type={showPassword ? 'text' : 'password'}
      icon={ToggleIcon}
      iconPosition="right"
      {...props}
    />
  );
};