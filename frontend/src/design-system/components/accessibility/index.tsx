/**
 * Fine Print AI - Accessibility Components
 * WCAG 2.1 AA compliant accessibility utilities and components
 */

import React, { forwardRef, useEffect, useRef, useState } from 'react'
import { cn } from '../../../lib/utils'
import { useTheme } from '../../providers/ThemeProvider'

// =============================================================================
// SKIP LINK COMPONENT
// =============================================================================

export interface SkipLinkProps {
  href: string
  children: React.ReactNode
  className?: string
}

export const SkipLink: React.FC<SkipLinkProps> = ({ href, children, className }) => {
  return (
    <a
      href={href}
      className={cn(
        'sr-only focus:not-sr-only',
        'fixed top-4 left-4 z-[1600]',
        'bg-fp-brand-primary text-fp-fg-inverse',
        'px-4 py-2 rounded-md text-sm font-medium',
        'focus:outline-none focus:ring-2 focus:ring-fp-interactive-focus focus:ring-offset-2',
        'transition-all duration-200',
        className
      )}
    >
      {children}
    </a>
  )
}

// =============================================================================
// VISUALLY HIDDEN COMPONENT
// =============================================================================

export interface VisuallyHiddenProps {
  children: React.ReactNode
  asChild?: boolean
  className?: string
}

export const VisuallyHidden: React.FC<VisuallyHiddenProps> = ({ 
  children, 
  asChild = false, 
  className 
}) => {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      className: cn('sr-only', children.props.className, className),
    })
  }

  return <span className={cn('sr-only', className)}>{children}</span>
}

// =============================================================================
// FOCUS TRAP COMPONENT
// =============================================================================

export interface FocusTrapProps {
  children: React.ReactNode
  enabled?: boolean
  restoreFocus?: boolean
  className?: string
}

export const FocusTrap: React.FC<FocusTrapProps> = ({
  children,
  enabled = true,
  restoreFocus = true,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!enabled) return

    // Store the previously active element
    previousActiveElement.current = document.activeElement as HTMLElement

    const container = containerRef.current
    if (!container) return

    // Get all focusable elements
    const getFocusableElements = () => {
      const selectors = [
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'a[href]',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]',
      ].join(', ')

      return Array.from(container.querySelectorAll(selectors)) as HTMLElement[]
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault()
          lastElement.focus()
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault()
          firstElement.focus()
        }
      }
    }

    // Focus first element when trap is enabled
    const focusableElements = getFocusableElements()
    if (focusableElements.length > 0) {
      focusableElements[0].focus()
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      
      // Restore focus to previously active element
      if (restoreFocus && previousActiveElement.current) {
        previousActiveElement.current.focus()
      }
    }
  }, [enabled, restoreFocus])

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  )
}

// =============================================================================
// LIVE REGION COMPONENT
// =============================================================================

export interface LiveRegionProps {
  children: React.ReactNode
  politeness?: 'polite' | 'assertive' | 'off'
  atomic?: boolean
  relevant?: 'additions' | 'removals' | 'text' | 'all'
  className?: string
}

export const LiveRegion: React.FC<LiveRegionProps> = ({
  children,
  politeness = 'polite',
  atomic = false,
  relevant = 'all',
  className,
}) => {
  return (
    <div
      aria-live={politeness}
      aria-atomic={atomic}
      aria-relevant={relevant}
      className={className}
    >
      {children}
    </div>
  )
}

// =============================================================================
// ANNOUNCEMENT COMPONENT
// =============================================================================

export interface AnnouncementProps {
  message: string
  politeness?: 'polite' | 'assertive'
  clearDelay?: number
}

export const Announcement: React.FC<AnnouncementProps> = ({
  message,
  politeness = 'polite',
  clearDelay = 3000,
}) => {
  const [announcement, setAnnouncement] = useState(message)

  useEffect(() => {
    setAnnouncement(message)
    
    if (clearDelay > 0) {
      const timer = setTimeout(() => {
        setAnnouncement('')
      }, clearDelay)
      
      return () => clearTimeout(timer)
    }
  }, [message, clearDelay])

  return (
    <LiveRegion
      politeness={politeness}
      className="sr-only"
    >
      {announcement}
    </LiveRegion>
  )
}

// =============================================================================
// KEYBOARD NAVIGATION COMPONENT
// =============================================================================

export interface KeyboardNavigationProps {
  children: React.ReactNode
  onEscape?: () => void
  onEnter?: () => void
  onArrowUp?: () => void
  onArrowDown?: () => void
  onArrowLeft?: () => void
  onArrowRight?: () => void
  className?: string
}

export const KeyboardNavigation = forwardRef<HTMLDivElement, KeyboardNavigationProps>(
  ({
    children,
    onEscape,
    onEnter,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    className,
    ...props
  }, ref) => {
    const handleKeyDown = (event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          onEscape?.()
          break
        case 'Enter':
          onEnter?.()
          break
        case 'ArrowUp':
          event.preventDefault()
          onArrowUp?.()
          break
        case 'ArrowDown':
          event.preventDefault()
          onArrowDown?.()
          break
        case 'ArrowLeft':
          event.preventDefault()
          onArrowLeft?.()
          break
        case 'ArrowRight':
          event.preventDefault()
          onArrowRight?.()
          break
      }
    }

    return (
      <div
        ref={ref}
        className={className}
        onKeyDown={handleKeyDown}
        {...props}
      >
        {children}
      </div>
    )
  }
)

KeyboardNavigation.displayName = 'KeyboardNavigation'

// =============================================================================
// ROVING TAB INDEX HOOK
// =============================================================================

export function useRovingTabIndex<T extends HTMLElement = HTMLElement>(
  items: React.RefObject<T>[],
  defaultIndex = 0
) {
  const [currentIndex, setCurrentIndex] = useState(defaultIndex)

  const moveToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % items.length)
  }

  const moveToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length)
  }

  const moveToFirst = () => {
    setCurrentIndex(0)
  }

  const moveToLast = () => {
    setCurrentIndex(items.length - 1)
  }

  const moveTo = (index: number) => {
    if (index >= 0 && index < items.length) {
      setCurrentIndex(index)
    }
  }

  // Update tabIndex for all items
  useEffect(() => {
    items.forEach((item, index) => {
      if (item.current) {
        item.current.tabIndex = index === currentIndex ? 0 : -1
      }
    })
  }, [items, currentIndex])

  // Focus current item
  useEffect(() => {
    const currentItem = items[currentIndex]?.current
    if (currentItem && document.activeElement !== currentItem) {
      currentItem.focus()
    }
  }, [items, currentIndex])

  return {
    currentIndex,
    moveToNext,
    moveToPrevious,
    moveToFirst,
    moveToLast,
    moveTo,
  }
}

// =============================================================================
// ACCESSIBLE TOOLTIP COMPONENT
// =============================================================================

export interface AccessibleTooltipProps {
  children: React.ReactElement
  content: React.ReactNode
  delay?: number
  className?: string
  id?: string
}

export const AccessibleTooltip: React.FC<AccessibleTooltipProps> = ({
  children,
  content,
  delay = 500,
  className,
  id,
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null)
  const tooltipId = id || `tooltip-${Math.random().toString(36).substr(2, 9)}`

  const showTooltip = () => {
    const timeout = setTimeout(() => {
      setIsVisible(true)
    }, delay)
    setTimeoutId(timeout)
  }

  const hideTooltip = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      setTimeoutId(null)
    }
    setIsVisible(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      hideTooltip()
    }
  }

  return (
    <>
      {React.cloneElement(children, {
        'aria-describedby': isVisible ? tooltipId : undefined,
        onMouseEnter: showTooltip,
        onMouseLeave: hideTooltip,
        onFocus: showTooltip,
        onBlur: hideTooltip,
        onKeyDown: handleKeyDown,
      })}
      
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={cn(
            'absolute z-[1800] max-w-xs p-2 text-sm',
            'bg-fp-surface-modal border border-fp-border-primary rounded-md shadow-lg',
            'text-fp-fg-primary',
            className
          )}
        >
          {content}
        </div>
      )}
    </>
  )
}

// =============================================================================
// ACCESSIBLE DESCRIPTION COMPONENT
// =============================================================================

export interface AccessibleDescriptionProps {
  children: React.ReactElement
  description: string
  id?: string
}

export const AccessibleDescription: React.FC<AccessibleDescriptionProps> = ({
  children,
  description,
  id,
}) => {
  const descriptionId = id || `description-${Math.random().toString(36).substr(2, 9)}`

  return (
    <>
      {React.cloneElement(children, {
        'aria-describedby': descriptionId,
      })}
      <VisuallyHidden>
        <div id={descriptionId}>{description}</div>
      </VisuallyHidden>
    </>
  )
}

// =============================================================================
// ACCESSIBLE ERROR MESSAGE COMPONENT
// =============================================================================

export interface AccessibleErrorProps {
  children: React.ReactElement
  error?: string
  id?: string
}

export const AccessibleError: React.FC<AccessibleErrorProps> = ({
  children,
  error,
  id,
}) => {
  const errorId = id || `error-${Math.random().toString(36).substr(2, 9)}`

  return (
    <>
      {React.cloneElement(children, {
        'aria-describedby': error ? errorId : undefined,
        'aria-invalid': !!error,
      })}
      {error && (
        <div
          id={errorId}
          role="alert"
          className="mt-1 text-sm text-fp-status-error"
        >
          {error}
        </div>
      )}
    </>
  )
}

// =============================================================================
// MOTION SAFE WRAPPER
// =============================================================================

export interface MotionSafeProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export const MotionSafe: React.FC<MotionSafeProps> = ({ children, fallback }) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handleChange = () => {
      setPrefersReducedMotion(mediaQuery.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  if (prefersReducedMotion && fallback) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  SkipLink,
  VisuallyHidden,
  FocusTrap,
  LiveRegion,
  Announcement,
  KeyboardNavigation,
  useRovingTabIndex,
  AccessibleTooltip,
  AccessibleDescription,
  AccessibleError,
  MotionSafe,
}