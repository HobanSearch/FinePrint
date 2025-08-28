/**
 * Fine Print AI - Browser Extension Platform Adapter
 * Adapters for converting web components to extension-optimized versions
 * Enhanced with brand consistency system
 */

import { tokens } from '../../tokens'
import type { RiskLevel } from '../../tokens'
import { BrandSystem, BRAND_COLORS, BRAND_TYPOGRAPHY, BRAND_MESSAGING, BRAND_ICONOGRAPHY } from '../../brand/BrandSystem'

// =============================================================================
// EXTENSION-SPECIFIC UTILITIES
// =============================================================================

/**
 * Generate CSS classes for extension components with proper scoping
 * Uses brand-consistent colors and typography
 */
export function generateExtensionCSS(theme: any = {}): string {
  // Generate brand-consistent theme for extension
  const brandTheme = BrandSystem.generateTheme('extension')
  
  return `
    /* Fine Print AI Extension Styles - Brand Consistent */
    .fineprint-extension {
      /* Brand Colors */
      --fp-guardian-primary: ${BRAND_COLORS.guardian[500]};
      --fp-guardian-light: ${BRAND_COLORS.guardian[100]};
      --fp-guardian-dark: ${BRAND_COLORS.guardian[700]};
      
      --fp-sage-primary: ${BRAND_COLORS.sage[500]};
      --fp-sage-light: ${BRAND_COLORS.sage[100]};
      --fp-sage-dark: ${BRAND_COLORS.sage[700]};
      
      --fp-alert-primary: ${BRAND_COLORS.alert[500]};
      --fp-alert-light: ${BRAND_COLORS.alert[100]};
      --fp-alert-dark: ${BRAND_COLORS.alert[700]};
      
      --fp-danger-primary: ${BRAND_COLORS.danger[500]};
      --fp-danger-light: ${BRAND_COLORS.danger[100]};
      --fp-danger-dark: ${BRAND_COLORS.danger[700]};
      
      /* Legacy color variables for compatibility */
      --fp-primary: var(--fp-guardian-primary);
      --fp-bg-primary: ${BRAND_COLORS.neutral[0]};
      --fp-bg-secondary: ${BRAND_COLORS.neutral[50]};
      --fp-bg-muted: ${BRAND_COLORS.neutral[100]};
      --fp-text-primary: ${BRAND_COLORS.neutral[900]};
      --fp-text-secondary: ${BRAND_COLORS.neutral[600]};
      --fp-text-muted: ${BRAND_COLORS.neutral[500]};
      --fp-text-inverse: ${BRAND_COLORS.neutral[0]};
      --fp-border-primary: ${BRAND_COLORS.neutral[200]};
      --fp-border-secondary: ${BRAND_COLORS.neutral[300]};
      
      /* Risk colors - Brand consistent */
      --fp-risk-safe: var(--fp-sage-primary);
      --fp-risk-low: var(--fp-sage-primary);
      --fp-risk-medium: var(--fp-alert-primary);
      --fp-risk-high: var(--fp-danger-primary);
      --fp-risk-critical: var(--fp-danger-dark);
      
      /* Status colors */
      --fp-success: var(--fp-sage-primary);
      --fp-warning: var(--fp-alert-primary);
      --fp-error: var(--fp-danger-primary);
      --fp-info: var(--fp-guardian-primary);
      
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--fp-text-primary);
      background: var(--fp-bg-primary);
      
      /* Reset styles to prevent page interference */
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      /* Ensure proper stacking */
      position: relative;
      z-index: 999999;
      
      /* Prevent page styles from interfering */
      all: initial;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    
    /* Button styles */
    .fineprint-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid transparent;
      background: var(--fp-primary);
      color: white;
    }
    
    .fineprint-button:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }
    
    .fineprint-button:active {
      transform: translateY(0);
    }
    
    .fineprint-button--secondary {
      background: var(--fp-bg-secondary);
      color: var(--fp-text-primary);
      border-color: var(--fp-border-primary);
    }
    
    .fineprint-button--outline {
      background: transparent;
      color: var(--fp-primary);
      border-color: var(--fp-primary);
    }
    
    .fineprint-button--small {
      padding: 0.25rem 0.75rem;
      font-size: 0.75rem;
    }
    
    .fineprint-button--large {
      padding: 0.75rem 1.5rem;
      font-size: 1rem;
    }
    
    /* Risk button variants */
    .fineprint-button--risk-safe { background: var(--fp-risk-safe); }
    .fineprint-button--risk-low { background: var(--fp-risk-low); }
    .fineprint-button--risk-medium { background: var(--fp-risk-medium); }
    .fineprint-button--risk-high { background: var(--fp-risk-high); }
    .fineprint-button--risk-critical { background: var(--fp-risk-critical); }
    
    /* Badge styles */
    .fineprint-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--fp-bg-secondary);
      color: var(--fp-text-primary);
      border: 1px solid var(--fp-border-primary);
    }
    
    .fineprint-badge--small {
      padding: 0.125rem 0.375rem;
      font-size: 0.625rem;
    }
    
    .fineprint-badge--large {
      padding: 0.25rem 0.75rem;
      font-size: 0.875rem;
    }
    
    /* Risk badge variants */
    .fineprint-badge--risk-safe {
      background: var(--fp-risk-safe);
      color: white;
      border-color: var(--fp-risk-safe);
    }
    
    .fineprint-badge--risk-low {
      background: var(--fp-risk-low);
      color: white;
      border-color: var(--fp-risk-low);
    }
    
    .fineprint-badge--risk-medium {
      background: var(--fp-risk-medium);
      color: white;
      border-color: var(--fp-risk-medium);
    }
    
    .fineprint-badge--risk-high {
      background: var(--fp-risk-high);
      color: white;
      border-color: var(--fp-risk-high);
    }
    
    .fineprint-badge--risk-critical {
      background: var(--fp-risk-critical);
      color: white;
      border-color: var(--fp-risk-critical);
    }
    
    /* Card styles */
    .fineprint-card {
      background: var(--fp-bg-primary);
      border: 1px solid var(--fp-border-primary);
      border-radius: 0.5rem;
      padding: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    
    .fineprint-card--elevated {
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .fineprint-card--compact {
      padding: 0.75rem;
    }
    
    /* Widget styles */
    .fineprint-widget {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      max-width: 320px;
      background: var(--fp-bg-primary);
      border: 1px solid var(--fp-border-primary);
      border-radius: 0.75rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      animation: slideInRight 0.3s ease-out;
    }
    
    .fineprint-widget--minimized {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      overflow: hidden;
    }
    
    /* Highlight styles */
    .fineprint-highlight {
      position: relative;
      border-radius: 2px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .fineprint-highlight--risk-safe {
      background: linear-gradient(120deg, var(--fp-risk-safe)20, var(--fp-risk-safe)10);
    }
    
    .fineprint-highlight--risk-low {
      background: linear-gradient(120deg, var(--fp-risk-low)20, var(--fp-risk-low)10);
    }
    
    .fineprint-highlight--risk-medium {
      background: linear-gradient(120deg, var(--fp-risk-medium)30, var(--fp-risk-medium)10);
    }
    
    .fineprint-highlight--risk-high {
      background: linear-gradient(120deg, var(--fp-risk-high)30, var(--fp-risk-high)10);
    }
    
    .fineprint-highlight--risk-critical {
      background: linear-gradient(120deg, var(--fp-risk-critical)40, var(--fp-risk-critical)20);
    }
    
    .fineprint-highlight:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    
    /* Tooltip styles */
    .fineprint-tooltip {
      position: absolute;
      z-index: 999999;
      background: var(--fp-bg-primary);
      border: 1px solid var(--fp-border-primary);
      border-radius: 0.5rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      max-width: 300px;
      padding: 0.75rem;
      font-size: 0.875rem;
      color: var(--fp-text-primary);
      pointer-events: none;
      opacity: 0;
      transform: translateY(5px);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    
    .fineprint-tooltip--visible {
      opacity: 1;
      transform: translateY(0);
    }
    
    /* Progress styles */
    .fineprint-progress {
      width: 100%;
      height: 4px;
      background: var(--fp-bg-secondary);
      border-radius: 2px;
      overflow: hidden;
    }
    
    .fineprint-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, var(--fp-primary), var(--fp-primary)80);
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    
    /* Animations */
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .fineprint-pulse {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    
    /* Accessibility */
    .fineprint-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    
    .fineprint-focus-visible:focus-visible {
      outline: 2px solid var(--fp-primary);
      outline-offset: 2px;
    }
    
    /* Dark mode */
    .fineprint-extension.fineprint-dark {
      --fp-bg-primary: ${theme.isDark ? theme.colors.background.primary : '#1f2937'};
      --fp-bg-secondary: ${theme.isDark ? theme.colors.background.secondary : '#374151'};
      --fp-text-primary: ${theme.isDark ? theme.colors.foreground.primary : '#f9fafb'};
      --fp-text-secondary: ${theme.isDark ? theme.colors.foreground.secondary : '#d1d5db'};
      --fp-border-primary: ${theme.isDark ? theme.colors.border.primary : '#4b5563'};
      --fp-border-secondary: ${theme.isDark ? theme.colors.border.secondary : '#6b7280'};
    }
    
    /* High contrast mode */
    @media (prefers-contrast: high) {
      .fineprint-highlight {
        border: 2px solid;
      }
      
      .fineprint-highlight--risk-safe { border-color: var(--fp-risk-safe); }
      .fineprint-highlight--risk-low { border-color: var(--fp-risk-low); }
      .fineprint-highlight--risk-medium { border-color: var(--fp-risk-medium); }
      .fineprint-highlight--risk-high { border-color: var(--fp-risk-high); }
      .fineprint-highlight--risk-critical { border-color: var(--fp-risk-critical); }
      
      .fineprint-button,
      .fineprint-badge,
      .fineprint-card {
        border-width: 2px;
      }
    }
    
    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .fineprint-highlight,
      .fineprint-tooltip,
      .fineprint-widget,
      .fineprint-button,
      .fineprint-progress-bar {
        transition: none;
        animation: none;
      }
    }
  `
}

// =============================================================================
// COMPONENT GENERATORS
// =============================================================================

/**
 * Generate HTML for extension button
 */
export function createExtensionButton({
  text,
  onClick,
  variant = 'primary',
  size = 'medium',
  risk,
  disabled = false,
  className = '',
  id,
}: {
  text: string
  onClick?: string // JavaScript code as string
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'small' | 'medium' | 'large'
  risk?: RiskLevel
  disabled?: boolean
  className?: string
  id?: string
}): string {
  const baseClass = 'fineprint-button'
  const variantClass = variant !== 'primary' ? `${baseClass}--${variant}` : ''
  const sizeClass = size !== 'medium' ? `${baseClass}--${size}` : ''
  const riskClass = risk ? `${baseClass}--risk-${risk}` : ''
  const disabledAttr = disabled ? 'disabled' : ''
  const onClickAttr = onClick && !disabled ? `onclick="${onClick}"` : ''
  const idAttr = id ? `id="${id}"` : ''
  
  const classes = [baseClass, variantClass, sizeClass, riskClass, className]
    .filter(Boolean)
    .join(' ')

  return `
    <button 
      class="${classes}"
      ${disabledAttr}
      ${onClickAttr}
      ${idAttr}
      type="button"
    >
      ${text}
    </button>
  `
}

/**
 * Generate HTML for extension badge
 */
export function createExtensionBadge({
  text,
  variant = 'default',
  size = 'medium',
  risk,
  className = '',
  id,
}: {
  text: string
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'error'
  size?: 'small' | 'medium' | 'large'
  risk?: RiskLevel
  className?: string
  id?: string
}): string {
  const baseClass = 'fineprint-badge'
  const variantClass = variant !== 'default' ? `${baseClass}--${variant}` : ''
  const sizeClass = size !== 'medium' ? `${baseClass}--${size}` : ''
  const riskClass = risk ? `${baseClass}--risk-${risk}` : ''
  const idAttr = id ? `id="${id}"` : ''
  
  const classes = [baseClass, variantClass, sizeClass, riskClass, className]
    .filter(Boolean)
    .join(' ')

  return `
    <span class="${classes}" ${idAttr}>
      ${text}
    </span>
  `
}

/**
 * Generate HTML for extension card
 */
export function createExtensionCard({
  content,
  variant = 'default',
  className = '',
  id,
}: {
  content: string
  variant?: 'default' | 'elevated' | 'compact'
  className?: string
  id?: string
}): string {
  const baseClass = 'fineprint-card'
  const variantClass = variant !== 'default' ? `${baseClass}--${variant}` : ''
  const idAttr = id ? `id="${id}"` : ''
  
  const classes = [baseClass, variantClass, className]
    .filter(Boolean)
    .join(' ')

  return `
    <div class="${classes}" ${idAttr}>
      ${content}
    </div>
  `
}

/**
 * Generate HTML for risk highlight
 */
export function createRiskHighlight({
  text,
  riskLevel,
  tooltip,
  onClick,
  className = '',
  id,
}: {
  text: string
  riskLevel: RiskLevel
  tooltip?: string
  onClick?: string
  className?: string
  id?: string
}): string {
  const baseClass = 'fineprint-highlight'
  const riskClass = `${baseClass}--risk-${riskLevel}`
  const onClickAttr = onClick ? `onclick="${onClick}"` : ''
  const titleAttr = tooltip ? `title="${tooltip}"` : ''
  const idAttr = id ? `id="${id}"` : ''
  
  const classes = [baseClass, riskClass, 'fineprint-focus-visible', className]
    .filter(Boolean)
    .join(' ')

  return `
    <span 
      class="${classes}"
      ${onClickAttr}
      ${titleAttr}
      ${idAttr}
      tabindex="0"
      role="button"
      aria-label="Risk level: ${riskLevel}"
    >
      ${text}
    </span>
  `
}

/**
 * Generate HTML for floating widget
 */
export function createFloatingWidget({
  content,
  minimized = false,
  className = '',
  id = 'fineprint-widget',
}: {
  content: string
  minimized?: boolean
  className?: string
  id?: string
}): string {
  const baseClass = 'fineprint-widget'
  const minimizedClass = minimized ? `${baseClass}--minimized` : ''
  
  const classes = [baseClass, minimizedClass, className]
    .filter(Boolean)
    .join(' ')

  return `
    <div class="${classes}" id="${id}">
      ${content}
    </div>
  `
}

/**
 * Generate HTML for progress bar
 */
export function createProgressBar({
  value,
  max = 100,
  className = '',
  id,
}: {
  value: number
  max?: number
  className?: string
  id?: string
}): string {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  const idAttr = id ? `id="${id}"` : ''
  
  return `
    <div class="fineprint-progress ${className}" ${idAttr} role="progressbar" aria-valuenow="${value}" aria-valuemax="${max}">
      <div class="fineprint-progress-bar" style="width: ${percentage}%"></div>
    </div>
  `
}

// =============================================================================
// INJECTION UTILITIES
// =============================================================================

/**
 * Inject CSS into the page
 */
export function injectCSS(css: string, id = 'fineprint-styles'): void {
  // Remove existing styles
  const existing = document.getElementById(id)
  if (existing) {
    existing.remove()
  }

  // Create and inject new styles
  const style = document.createElement('style')
  style.id = id
  style.textContent = css
  document.head.appendChild(style)
}

/**
 * Create a scoped container for extension content
 */
export function createScopedContainer({
  content,
  className = '',
  darkMode = false,
}: {
  content: string
  className?: string
  darkMode?: boolean
}): HTMLDivElement {
  const container = document.createElement('div')
  container.className = `fineprint-extension ${darkMode ? 'fineprint-dark' : ''} ${className}`
  container.innerHTML = content
  return container
}

/**
 * Safely append element to body with proper isolation
 */
export function appendToBody(element: HTMLElement): void {
  // Ensure the element is properly isolated
  element.style.all = 'initial'
  element.style.fontFamily = "'Inter', system-ui, -apple-system, sans-serif"
  
  document.body.appendChild(element)
}

// =============================================================================
// EVENT HANDLING
// =============================================================================

/**
 * Create safe event handler for extension
 */
export function createEventHandler(handler: () => void): string {
  // Generate a unique function name
  const functionName = `fineprintHandler_${Math.random().toString(36).substr(2, 9)}`
  
  // Attach to window temporarily
  ;(window as any)[functionName] = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    handler()
    // Clean up
    delete (window as any)[functionName]
  }
  
  return `${functionName}(event)`
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  generateExtensionCSS,
  createExtensionButton,
  createExtensionBadge,
  createExtensionCard,
  createRiskHighlight,
  createFloatingWidget,
  createProgressBar,
  injectCSS,
  createScopedContainer,
  appendToBody,
  createEventHandler,
}