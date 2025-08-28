import React from 'react'
import { motion, MotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

// Skip Link for keyboard navigation
export const SkipLink: React.FC<{
  href: string
  children: React.ReactNode
  className?: string
}> = ({ href, children, className }) => (
  <a
    href={href}
    className={cn(
      'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50',
      'bg-guardian-600 text-white px-4 py-2 rounded-lg font-medium',
      'focus:outline-none focus:ring-2 focus:ring-guardian-500 focus:ring-offset-2',
      className
    )}
  >
    {children}
  </a>
)

// Screen reader only text
export const ScreenReaderOnly: React.FC<{
  children: React.ReactNode
  as?: keyof JSX.IntrinsicElements
}> = ({ children, as: Component = 'span' }) => (
  <Component className="sr-only">
    {children}
  </Component>
)

// Accessible heading with proper hierarchy
export interface AccessibleHeadingProps {
  level: 1 | 2 | 3 | 4 | 5 | 6
  children: React.ReactNode
  className?: string
  id?: string
  visualLevel?: 1 | 2 | 3 | 4 | 5 | 6 // For styling different from semantic level
}

export const AccessibleHeading: React.FC<AccessibleHeadingProps> = ({
  level,
  children,
  className,
  id,
  visualLevel,
}) => {
  const Component = `h${level}` as keyof JSX.IntrinsicElements
  const displayLevel = visualLevel || level
  
  const levelClasses = {
    1: 'text-4xl font-bold',
    2: 'text-3xl font-bold',
    3: 'text-2xl font-semibold',
    4: 'text-xl font-semibold',
    5: 'text-lg font-medium',
    6: 'text-base font-medium',
  }

  return (
    <Component
      id={id}
      className={cn(levelClasses[displayLevel], 'text-foreground', className)}
    >
      {children}
    </Component>
  )
}

// Accessible button with proper ARIA attributes
export interface AccessibleButtonProps 
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  describedBy?: string
  expanded?: boolean
  controls?: string
  haspopup?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog'
}

export const AccessibleButton: React.FC<AccessibleButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  describedBy,
  expanded,
  controls,
  haspopup,
  disabled,
  className,
  ...props
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2'
  
  const variantClasses = {
    primary: 'bg-guardian-600 text-white hover:bg-guardian-700 focus:ring-guardian-500',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 focus:ring-guardian-500',
    ghost: 'hover:bg-muted hover:text-muted-foreground focus:ring-guardian-500',
    destructive: 'bg-danger-600 text-white hover:bg-danger-700 focus:ring-danger-500',
  }
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  return (
    <button
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        (disabled || loading) && 'opacity-50 cursor-not-allowed',
        className
      )}
      disabled={disabled || loading}
      aria-describedby={describedBy}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-haspopup={haspopup}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <>
          <span className="animate-spin mr-2" role="status" aria-hidden="true">
            ⟳
          </span>
          <ScreenReaderOnly>Loading...</ScreenReaderOnly>
        </>
      )}
      {children}
    </button>
  )
}

// Focus trap for modals and dropdowns
export const FocusTrap: React.FC<{
  children: React.ReactNode
  active?: boolean
  restoreFocus?: boolean
}> = ({ children, active = true, restoreFocus = true }) => {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const previousFocusRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!active) return

    // Store the previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement

    const container = containerRef.current
    if (!container) return

    // Find all focusable elements
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    // Focus the first element
    firstElement?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement?.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement?.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      
      // Restore focus when component unmounts
      if (restoreFocus && previousFocusRef.current) {
        previousFocusRef.current.focus()
      }
    }
  }, [active, restoreFocus])

  return (
    <div ref={containerRef} className="focus-trap">
      {children}
    </div>
  )
}

// Accessible disclosure/expandable content
export interface AccessibleDisclosureProps {
  trigger: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  onChange?: (open: boolean) => void
  className?: string
  triggerClassName?: string
  contentClassName?: string
}

export const AccessibleDisclosure: React.FC<AccessibleDisclosureProps> = ({
  trigger,
  children,
  defaultOpen = false,
  onChange,
  className,
  triggerClassName,
  contentClassName,
}) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)
  const contentId = React.useId()
  const triggerId = React.useId()

  const handleToggle = () => {
    const newState = !isOpen
    setIsOpen(newState)
    onChange?.(newState)
  }

  return (
    <div className={className}>
      <button
        id={triggerId}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className={cn(
          'flex items-center justify-between w-full text-left',
          'focus:outline-none focus:ring-2 focus:ring-guardian-500 focus:ring-offset-2 rounded-lg',
          triggerClassName
        )}
      >
        {trigger}
      </button>
      
      <div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        className={cn(
          'overflow-hidden transition-all duration-300',
          isOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0',
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}

// Accessible form field with proper labeling
export interface AccessibleFieldProps {
  label: string
  children: React.ReactNode
  required?: boolean
  error?: string
  description?: string
  className?: string
}

export const AccessibleField: React.FC<AccessibleFieldProps> = ({
  label,
  children,
  required = false,
  error,
  description,
  className,
}) => {
  const fieldId = React.useId()
  const errorId = React.useId()
  const descriptionId = React.useId()

  return (
    <div className={cn('space-y-2', className)}>
      <label 
        htmlFor={fieldId}
        className="block text-sm font-medium text-foreground"
      >
        {label}
        {required && (
          <span className="text-danger-500 ml-1" aria-label="required">
            *
          </span>
        )}
      </label>
      
      {description && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      
      <div>
        {React.cloneElement(children as React.ReactElement, {
          id: fieldId,
          'aria-describedby': [
            description && descriptionId,
            error && errorId,
          ].filter(Boolean).join(' ') || undefined,
          'aria-invalid': error ? 'true' : undefined,
          'aria-required': required,
        })}
      </div>
      
      {error && (
        <p 
          id={errorId} 
          className="text-sm text-danger-600" 
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}
    </div>
  )
}

// Accessible status announcements
export const StatusAnnouncement: React.FC<{
  message: string
  priority?: 'polite' | 'assertive'
  className?: string
}> = ({ message, priority = 'polite', className }) => (
  <div
    role="status"
    aria-live={priority}
    aria-atomic="true"
    className={cn('sr-only', className)}
  >
    {message}
  </div>
)

// Accessible progress indicator
export interface AccessibleProgressProps {
  value: number
  max?: number
  label?: string
  description?: string
  showPercentage?: boolean
  className?: string
}

export const AccessibleProgress: React.FC<AccessibleProgressProps> = ({
  value,
  max = 100,
  label,
  description,
  showPercentage = true,
  className,
}) => {
  const percentage = Math.round((value / max) * 100)
  const progressId = React.useId()
  const labelId = React.useId()

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex items-center justify-between">
          <label id={labelId} className="text-sm font-medium text-foreground">
            {label}
          </label>
          {showPercentage && (
            <span className="text-sm text-muted-foreground">
              {percentage}%
            </span>
          )}
        </div>
      )}
      
      {description && (
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      
      <div className="w-full bg-muted rounded-full h-2">
        <div
          id={progressId}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-labelledby={label ? labelId : undefined}
          aria-valuetext={`${percentage}% complete`}
          className="bg-guardian-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

// Reduced motion wrapper
export interface ReducedMotionProps extends MotionProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export const ReducedMotion: React.FC<ReducedMotionProps> = ({
  children,
  fallback,
  ...motionProps
}) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  if (prefersReducedMotion) {
    return <>{fallback || children}</>
  }

  return <motion.div {...motionProps}>{children}</motion.div>
}

// High contrast mode detection
export const useHighContrast = () => {
  const [isHighContrast, setIsHighContrast] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-contrast: high)')
    setIsHighContrast(mediaQuery.matches)

    const handleChange = (e: MediaQueryListEvent) => {
      setIsHighContrast(e.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return isHighContrast
}

// Accessible tooltip
export interface AccessibleTooltipProps {
  content: string
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  delayDuration?: number
}

export const AccessibleTooltip: React.FC<AccessibleTooltipProps> = ({
  content,
  children,
  side = 'top',
  delayDuration = 300,
}) => {
  const [isVisible, setIsVisible] = React.useState(false)
  const tooltipId = React.useId()
  const timeoutRef = React.useRef<NodeJS.Timeout>()

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delayDuration)
  }

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        aria-describedby={isVisible ? tooltipId : undefined}
      >
        {children}
      </div>
      
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={cn(
            'absolute z-50 px-2 py-1 text-sm bg-neutral-900 text-white rounded shadow-lg',
            'dark:bg-neutral-100 dark:text-neutral-900',
            side === 'top' && 'bottom-full left-1/2 transform -translate-x-1/2 mb-1',
            side === 'bottom' && 'top-full left-1/2 transform -translate-x-1/2 mt-1',
            side === 'left' && 'right-full top-1/2 transform -translate-y-1/2 mr-1',
            side === 'right' && 'left-full top-1/2 transform -translate-y-1/2 ml-1'
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}