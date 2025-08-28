/**
 * Fine Print AI - Brand Consistency Service
 * 
 * Orchestrates brand consistency across all platforms (web, mobile, extension)
 * Ensures unified experience and maintains brand standards
 */

import { BrandSystem, BRAND_IDENTITY, BRAND_COLORS, BRAND_TYPOGRAPHY, BRAND_MESSAGING } from './BrandSystem'
import { createReactNativeTheme } from '../adapters/react-native'
import { generateExtensionCSS } from '../adapters/extension'

// =============================================================================
// BRAND CONSISTENCY CONFIGURATION
// =============================================================================

export interface BrandConsistencyConfig {
  platform: 'web' | 'mobile' | 'extension'
  darkMode: boolean
  highContrast: boolean
  reducedMotion: boolean
  fontSize: 'small' | 'medium' | 'large'
  customizations?: {
    primaryColor?: string
    accentColor?: string
    logoUrl?: string
  }
}

// =============================================================================
// BRAND CONSISTENCY SERVICE
// =============================================================================

export class BrandConsistencyService {
  private static instance: BrandConsistencyService
  private config: BrandConsistencyConfig
  private themes: Map<string, any> = new Map()
  private observers: Set<(config: BrandConsistencyConfig) => void> = new Set()

  private constructor(config: BrandConsistencyConfig) {
    this.config = config
    this.initializeThemes()
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: BrandConsistencyConfig): BrandConsistencyService {
    if (!BrandConsistencyService.instance) {
      if (!config) {
        throw new Error('BrandConsistencyService must be initialized with config')
      }
      BrandConsistencyService.instance = new BrandConsistencyService(config)
    }
    return BrandConsistencyService.instance
  }

  /**
   * Initialize themes for all platforms
   */
  private initializeThemes(): void {
    // Generate web theme
    const webTheme = BrandSystem.generateTheme('web')
    this.themes.set('web', this.applyConfigToTheme(webTheme, 'web'))

    // Generate mobile theme
    const mobileTheme = createReactNativeTheme()
    this.themes.set('mobile', this.applyConfigToTheme(mobileTheme, 'mobile'))

    // Generate extension theme
    const extensionTheme = BrandSystem.generateTheme('extension')
    this.themes.set('extension', this.applyConfigToTheme(extensionTheme, 'extension'))
  }

  /**
   * Apply configuration customizations to theme
   */
  private applyConfigToTheme(theme: any, platform: string): any {
    const customizedTheme = { ...theme }

    // Apply dark mode
    if (this.config.darkMode && platform === 'web') {
      customizedTheme.colors = {
        ...customizedTheme.colors,
        background: BRAND_COLORS.neutral[900],
        backgroundSecondary: BRAND_COLORS.neutral[800],
        text: BRAND_COLORS.neutral[100],
        textSecondary: BRAND_COLORS.neutral[300],
      }
    }

    // Apply high contrast
    if (this.config.highContrast) {
      customizedTheme.colors = {
        ...customizedTheme.colors,
        primary: platform === 'web' ? '#0000FF' : BRAND_COLORS.guardian[600],
        border: BRAND_COLORS.neutral[900],
      }
    }

    // Apply font size adjustments
    if (this.config.fontSize !== 'medium') {
      const scaleMap = { small: 0.875, medium: 1, large: 1.125 }
      const scale = scaleMap[this.config.fontSize]
      
      if (platform === 'web' && customizedTheme.typography) {
        Object.keys(customizedTheme.typography.typeScale || {}).forEach(key => {
          const typeStyle = customizedTheme.typography.typeScale[key]
          if (typeStyle.fontSize) {
            typeStyle.fontSize = `${parseFloat(typeStyle.fontSize) * scale}rem`
          }
        })
      }
    }

    // Apply custom colors
    if (this.config.customizations) {
      if (this.config.customizations.primaryColor) {
        customizedTheme.colors.primary = this.config.customizations.primaryColor
      }
      if (this.config.customizations.accentColor) {
        customizedTheme.colors.secondary = this.config.customizations.accentColor
      }
    }

    return customizedTheme
  }

  /**
   * Get theme for specific platform
   */
  getTheme(platform: 'web' | 'mobile' | 'extension'): any {
    return this.themes.get(platform) || this.themes.get('web')
  }

  /**
   * Get current configuration
   */
  getConfig(): BrandConsistencyConfig {
    return { ...this.config }
  }

  /**
   * Update configuration and regenerate themes
   */
  updateConfig(updates: Partial<BrandConsistencyConfig>): void {
    this.config = { ...this.config, ...updates }
    this.initializeThemes()
    this.notifyObservers()
  }

  /**
   * Subscribe to configuration changes
   */
  subscribe(callback: (config: BrandConsistencyConfig) => void): () => void {
    this.observers.add(callback)
    return () => this.observers.delete(callback)
  }

  /**
   * Notify all observers of configuration changes
   */
  private notifyObservers(): void {
    this.observers.forEach(callback => callback(this.config))
  }

  /**
   * Generate platform-specific CSS/styles
   */
  generateStyles(platform: 'web' | 'mobile' | 'extension'): string | object {
    const theme = this.getTheme(platform)

    switch (platform) {
      case 'web':
        return this.generateWebCSS(theme)
      
      case 'mobile':
        return theme // React Native uses theme object directly
      
      case 'extension':
        return generateExtensionCSS(theme)
      
      default:
        return ''
    }
  }

  /**
   * Generate web CSS
   */
  private generateWebCSS(theme: any): string {
    return `
      :root {
        /* Brand Colors */
        --fp-guardian-50: ${BRAND_COLORS.guardian[50]};
        --fp-guardian-100: ${BRAND_COLORS.guardian[100]};
        --fp-guardian-200: ${BRAND_COLORS.guardian[200]};
        --fp-guardian-300: ${BRAND_COLORS.guardian[300]};
        --fp-guardian-400: ${BRAND_COLORS.guardian[400]};
        --fp-guardian-500: ${BRAND_COLORS.guardian[500]};
        --fp-guardian-600: ${BRAND_COLORS.guardian[600]};
        --fp-guardian-700: ${BRAND_COLORS.guardian[700]};
        --fp-guardian-800: ${BRAND_COLORS.guardian[800]};
        --fp-guardian-900: ${BRAND_COLORS.guardian[900]};
        
        --fp-sage-50: ${BRAND_COLORS.sage[50]};
        --fp-sage-100: ${BRAND_COLORS.sage[100]};
        --fp-sage-200: ${BRAND_COLORS.sage[200]};
        --fp-sage-300: ${BRAND_COLORS.sage[300]};
        --fp-sage-400: ${BRAND_COLORS.sage[400]};
        --fp-sage-500: ${BRAND_COLORS.sage[500]};
        --fp-sage-600: ${BRAND_COLORS.sage[600]};
        --fp-sage-700: ${BRAND_COLORS.sage[700]};
        --fp-sage-800: ${BRAND_COLORS.sage[800]};
        --fp-sage-900: ${BRAND_COLORS.sage[900]};
        
        --fp-alert-50: ${BRAND_COLORS.alert[50]};
        --fp-alert-100: ${BRAND_COLORS.alert[100]};
        --fp-alert-200: ${BRAND_COLORS.alert[200]};
        --fp-alert-300: ${BRAND_COLORS.alert[300]};
        --fp-alert-400: ${BRAND_COLORS.alert[400]};
        --fp-alert-500: ${BRAND_COLORS.alert[500]};
        --fp-alert-600: ${BRAND_COLORS.alert[600]};
        --fp-alert-700: ${BRAND_COLORS.alert[700]};
        --fp-alert-800: ${BRAND_COLORS.alert[800]};
        --fp-alert-900: ${BRAND_COLORS.alert[900]};
        
        --fp-danger-50: ${BRAND_COLORS.danger[50]};
        --fp-danger-100: ${BRAND_COLORS.danger[100]};
        --fp-danger-200: ${BRAND_COLORS.danger[200]};
        --fp-danger-300: ${BRAND_COLORS.danger[300]};
        --fp-danger-400: ${BRAND_COLORS.danger[400]};
        --fp-danger-500: ${BRAND_COLORS.danger[500]};
        --fp-danger-600: ${BRAND_COLORS.danger[600]};
        --fp-danger-700: ${BRAND_COLORS.danger[700]};
        --fp-danger-800: ${BRAND_COLORS.danger[800]};
        --fp-danger-900: ${BRAND_COLORS.danger[900]};
        
        /* Neutral Colors */
        --fp-neutral-0: ${BRAND_COLORS.neutral[0]};
        --fp-neutral-50: ${BRAND_COLORS.neutral[50]};
        --fp-neutral-100: ${BRAND_COLORS.neutral[100]};
        --fp-neutral-200: ${BRAND_COLORS.neutral[200]};
        --fp-neutral-300: ${BRAND_COLORS.neutral[300]};
        --fp-neutral-400: ${BRAND_COLORS.neutral[400]};
        --fp-neutral-500: ${BRAND_COLORS.neutral[500]};
        --fp-neutral-600: ${BRAND_COLORS.neutral[600]};
        --fp-neutral-700: ${BRAND_COLORS.neutral[700]};
        --fp-neutral-800: ${BRAND_COLORS.neutral[800]};
        --fp-neutral-900: ${BRAND_COLORS.neutral[900]};
        --fp-neutral-950: ${BRAND_COLORS.neutral[950]};
        --fp-neutral-1000: ${BRAND_COLORS.neutral[1000]};
        
        /* Semantic Colors */
        --fp-primary: var(--fp-guardian-500);
        --fp-secondary: var(--fp-sage-500);
        --fp-success: var(--fp-sage-500);
        --fp-warning: var(--fp-alert-500);
        --fp-error: var(--fp-danger-500);
        --fp-info: var(--fp-guardian-500);
        
        /* Typography */
        --fp-font-sans: ${BRAND_TYPOGRAPHY.fontFamily.primary.join(', ')};
        --fp-font-mono: ${BRAND_TYPOGRAPHY.fontFamily.mono.join(', ')};
        
        /* Font Sizes */
        --fp-text-display: ${BRAND_TYPOGRAPHY.typeScale.display.fontSize};
        --fp-text-h1: ${BRAND_TYPOGRAPHY.typeScale.h1.fontSize};
        --fp-text-h2: ${BRAND_TYPOGRAPHY.typeScale.h2.fontSize};
        --fp-text-h3: ${BRAND_TYPOGRAPHY.typeScale.h3.fontSize};
        --fp-text-h4: ${BRAND_TYPOGRAPHY.typeScale.h4.fontSize};
        --fp-text-h5: ${BRAND_TYPOGRAPHY.typeScale.h5.fontSize};
        --fp-text-h6: ${BRAND_TYPOGRAPHY.typeScale.h6.fontSize};
        --fp-text-body: ${BRAND_TYPOGRAPHY.typeScale.body.fontSize};
        --fp-text-body-small: ${BRAND_TYPOGRAPHY.typeScale.bodySmall.fontSize};
        --fp-text-caption: ${BRAND_TYPOGRAPHY.typeScale.caption.fontSize};
      }
      
      /* Dark mode overrides */
      [data-theme="dark"] {
        --fp-primary: var(--fp-guardian-400);
        --fp-secondary: var(--fp-sage-400);
        --fp-bg-primary: var(--fp-neutral-900);
        --fp-bg-secondary: var(--fp-neutral-800);
        --fp-text-primary: var(--fp-neutral-100);
        --fp-text-secondary: var(--fp-neutral-300);
        --fp-border-primary: var(--fp-neutral-700);
      }
      
      /* High contrast mode */
      [data-contrast="high"] {
        --fp-primary: #0000FF;
        --fp-secondary: #00AA00;
        --fp-error: #FF0000;
        --fp-warning: #FF8800;
        --fp-border-primary: var(--fp-neutral-900);
      }
      
      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        * {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
    `
  }

  /**
   * Get brand messaging for platform
   */
  getMessaging(context: 'analyzing' | 'warning' | 'educating' | 'celebrating' = 'analyzing'): typeof BRAND_MESSAGING {
    return BRAND_MESSAGING
  }

  /**
   * Get brand identity information
   */
  getIdentity(): typeof BRAND_IDENTITY {
    return BRAND_IDENTITY
  }

  /**
   * Validate component against brand guidelines
   */
  validateComponent(component: {
    colors: string[]
    typography: string[]
    spacing: string[]
    messaging: string[]
  }): {
    isValid: boolean
    violations: string[]
    recommendations: string[]
  } {
    const violations: string[] = []
    const recommendations: string[] = []

    // Check colors against brand palette
    component.colors.forEach(color => {
      if (color.startsWith('#') || color.startsWith('rgb')) {
        const isInPalette = Object.values(BRAND_COLORS).some(palette =>
          Object.values(palette).includes(color)
        )
        if (!isInPalette) {
          violations.push(`Color ${color} is not in brand palette`)
          recommendations.push('Use colors from the brand color palette')
        }
      }
    })

    // Check typography
    component.typography.forEach(font => {
      if (!BRAND_TYPOGRAPHY.fontFamily.primary.some(brandFont => 
        font.toLowerCase().includes(brandFont.toLowerCase())
      )) {
        violations.push(`Font ${font} is not brand-consistent`)
        recommendations.push('Use Inter font family for consistency')
      }
    })

    // Check messaging tone
    component.messaging.forEach(message => {
      if (message.includes('utilize') || message.includes('jurisprudential')) {
        violations.push(`Message "${message}" uses complex language`)
        recommendations.push('Use clear, simple language following brand voice principles')
      }
    })

    return {
      isValid: violations.length === 0,
      violations,
      recommendations: [...new Set(recommendations)]
    }
  }

  /**
   * Generate component template with brand consistency
   */
  generateComponentTemplate(
    componentType: 'button' | 'card' | 'badge' | 'input',
    platform: 'web' | 'mobile' | 'extension',
    variant: string = 'primary'
  ): any {
    const theme = this.getTheme(platform)

    switch (componentType) {
      case 'button':
        return this.generateButtonTemplate(platform, variant, theme)
      case 'card':
        return this.generateCardTemplate(platform, variant, theme)
      case 'badge':
        return this.generateBadgeTemplate(platform, variant, theme)
      case 'input':
        return this.generateInputTemplate(platform, variant, theme)
      default:
        return null
    }
  }

  /**
   * Generate button template
   */
  private generateButtonTemplate(platform: string, variant: string, theme: any): any {
    const baseStyles = {
      fontFamily: platform === 'web' ? 'var(--fp-font-sans)' : theme.typography.fontFamily.medium,
      fontSize: platform === 'web' ? 'var(--fp-text-body-small)' : 14,
      fontWeight: platform === 'web' ? '500' : 'medium',
      borderRadius: platform === 'extension' ? '4px' : '8px',
      padding: platform === 'mobile' ? '12px 16px' : '10px 16px',
      display: platform === 'web' ? 'inline-flex' : 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      transition: platform === 'web' ? 'all 0.2s ease' : undefined,
    }

    const variantStyles = {
      primary: {
        backgroundColor: platform === 'web' ? 'var(--fp-primary)' : theme.colors.primary,
        color: platform === 'web' ? 'var(--fp-neutral-0)' : theme.colors.textInverse,
        border: 'none',
      },
      secondary: {
        backgroundColor: platform === 'web' ? 'var(--fp-secondary)' : theme.colors.secondary,
        color: platform === 'web' ? 'var(--fp-neutral-0)' : theme.colors.textInverse,
        border: 'none',
      },
      outline: {
        backgroundColor: 'transparent',
        color: platform === 'web' ? 'var(--fp-primary)' : theme.colors.primary,
        border: platform === 'web' ? '1px solid var(--fp-primary)' : `1px solid ${theme.colors.primary}`,
      }
    }

    return {
      ...baseStyles,
      ...variantStyles[variant as keyof typeof variantStyles] || variantStyles.primary
    }
  }

  /**
   * Generate card template
   */
  private generateCardTemplate(platform: string, variant: string, theme: any): any {
    return {
      backgroundColor: platform === 'web' ? 'var(--fp-neutral-0)' : theme.colors.surface,
      border: platform === 'web' ? '1px solid var(--fp-neutral-200)' : `1px solid ${theme.colors.border}`,
      borderRadius: platform === 'extension' ? '6px' : '8px',
      padding: platform === 'mobile' ? 16 : '1rem',
      boxShadow: platform === 'extension' ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.1)',
    }
  }

  /**
   * Generate badge template  
   */
  private generateBadgeTemplate(platform: string, variant: string, theme: any): any {
    return {
      display: platform === 'web' ? 'inline-flex' : 'flex',
      alignItems: 'center',
      padding: platform === 'mobile' ? '4px 8px' : '0.25rem 0.5rem',
      borderRadius: platform === 'extension' ? '12px' : '9999px',
      fontSize: platform === 'web' ? 'var(--fp-text-caption)' : 12,
      fontWeight: platform === 'web' ? '600' : 'semibold',
      backgroundColor: platform === 'web' ? 'var(--fp-neutral-100)' : theme.colors.backgroundMuted,
      color: platform === 'web' ? 'var(--fp-neutral-700)' : theme.colors.text,
    }
  }

  /**
   * Generate input template
   */
  private generateInputTemplate(platform: string, variant: string, theme: any): any {
    return {
      fontFamily: platform === 'web' ? 'var(--fp-font-sans)' : theme.typography.fontFamily.regular,
      fontSize: platform === 'web' ? 'var(--fp-text-body)' : 16,
      padding: platform === 'mobile' ? 12 : '0.75rem',
      border: platform === 'web' ? '1px solid var(--fp-neutral-300)' : `1px solid ${theme.colors.border}`,
      borderRadius: platform === 'extension' ? '4px' : '6px',
      backgroundColor: platform === 'web' ? 'var(--fp-neutral-0)' : theme.colors.background,
      color: platform === 'web' ? 'var(--fp-neutral-900)' : theme.colors.text,
    }
  }
}

// =============================================================================
// BRAND CONSISTENCY HOOKS & UTILITIES
// =============================================================================

/**
 * Initialize brand consistency for a platform
 */
export function initializeBrandConsistency(config: BrandConsistencyConfig): BrandConsistencyService {
  return BrandConsistencyService.getInstance(config)
}

/**
 * Get brand-consistent theme for current platform
 */
export function useBrandTheme(platform: 'web' | 'mobile' | 'extension'): any {
  const service = BrandConsistencyService.getInstance()
  return service.getTheme(platform)
}

/**
 * Apply brand styles to element (for web/extension)
 */
export function applyBrandStyles(
  element: HTMLElement,
  platform: 'web' | 'extension',
  componentType: 'button' | 'card' | 'badge' | 'input' = 'card'
): void {
  const service = BrandConsistencyService.getInstance()
  const styles = service.generateComponentTemplate(componentType, platform)
  
  Object.assign(element.style, styles)
}

/**
 * Validate brand consistency across platforms
 */
export function validateBrandConsistency(
  webComponent: any,
  mobileComponent: any,
  extensionComponent: any
): {
  isConsistent: boolean
  issues: string[]
  recommendations: string[]
} {
  const service = BrandConsistencyService.getInstance()
  const issues: string[] = []
  const recommendations: string[] = []

  // Check color consistency
  const webColors = extractColors(webComponent)
  const mobileColors = extractColors(mobileComponent)
  const extensionColors = extractColors(extensionComponent)

  if (!arraysEqual(webColors, mobileColors) || !arraysEqual(webColors, extensionColors)) {
    issues.push('Color inconsistency across platforms')
    recommendations.push('Use brand color variables for consistent colors')
  }

  return {
    isConsistent: issues.length === 0,
    issues,
    recommendations
  }
}

// Helper functions
function extractColors(component: any): string[] {
  // Simplified color extraction - in practice, would be more sophisticated
  return Object.values(component).filter(value => 
    typeof value === 'string' && (value.startsWith('#') || value.startsWith('rgb'))
  ) as string[]
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((val, i) => val === b[i])
}

// =============================================================================
// EXPORTS
// =============================================================================

export default BrandConsistencyService

export {
  BrandConsistencyService,
  initializeBrandConsistency,
  useBrandTheme,
  applyBrandStyles,
  validateBrandConsistency
}