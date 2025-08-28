/**
 * Fine Print AI - Brand Consistency System
 * 
 * Ensures unified brand experience across web, mobile, and extension platforms
 * Implements Guardian Sage archetype with consistent visual identity
 */

import { tokens } from '../tokens'

// =============================================================================
// BRAND IDENTITY CONSTANTS
// =============================================================================

export const BRAND_IDENTITY = {
  name: 'Fine Print AI',
  tagline: 'Your Digital Rights Guardian',
  mission: 'Democratizing legal comprehension through AI',
  vision: 'A world where legal transparency is the norm',
  
  // Brand Archetype
  archetype: {
    primary: 'Guardian',
    secondary: 'Sage',
    traits: ['Protective', 'Intelligent', 'Approachable', 'Clear', 'Empowering'],
  },
  
  // Voice & Tone
  voice: {
    principles: [
      'Clear, not complex',
      'Human, not robotic', 
      'Confident, not arrogant',
      'Helpful, not preachy'
    ],
    tones: {
      analyzing: 'Professional but friendly',
      warning: 'Urgent but not alarmist',
      educating: 'Patient and encouraging',
      celebrating: 'Warm and supportive'
    }
  }
} as const

// =============================================================================
// BRAND COLORS
// =============================================================================

export const BRAND_COLORS = {
  // Primary Brand Colors
  guardian: {
    50: '#eff6ff',
    100: '#dbeafe', 
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#2563eb', // Primary guardian blue
    600: '#1d4ed8',
    700: '#1e40af',
    800: '#1e3a8a',
    900: '#172554',
    950: '#0f1729',
  },
  
  sage: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0', 
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981', // Primary sage green
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  },

  // Supporting Colors
  alert: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d', 
    400: '#fbbf24',
    500: '#f59e0b', // Alert orange
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },

  danger: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444', // Danger red
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },

  // Neutral Palette
  neutral: {
    0: '#ffffff',
    50: '#f9fafb', 
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712',
    1000: '#000000',
  }
} as const

// =============================================================================
// BRAND TYPOGRAPHY
// =============================================================================

export const BRAND_TYPOGRAPHY = {
  // Font Families
  fontFamily: {
    primary: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
    mono: ['JetBrains Mono', 'Fira Code', 'Monaco', 'Consolas', 'monospace'],
  },

  // Type Scale - Optimized for readability
  typeScale: {
    display: {
      fontSize: '3.75rem', // 60px
      lineHeight: '1',
      fontWeight: '800',
      letterSpacing: '-0.025em',
    },
    h1: {
      fontSize: '2.25rem', // 36px  
      lineHeight: '2.5rem',
      fontWeight: '700',
      letterSpacing: '-0.025em',
    },
    h2: {
      fontSize: '1.875rem', // 30px
      lineHeight: '2.25rem', 
      fontWeight: '600',
      letterSpacing: '-0.025em',
    },
    h3: {
      fontSize: '1.5rem', // 24px
      lineHeight: '2rem',
      fontWeight: '600',
    },
    h4: {
      fontSize: '1.25rem', // 20px
      lineHeight: '1.75rem',
      fontWeight: '600',
    },
    h5: {
      fontSize: '1.125rem', // 18px
      lineHeight: '1.75rem',
      fontWeight: '500',
    },
    h6: {
      fontSize: '1rem', // 16px
      lineHeight: '1.5rem',
      fontWeight: '500',
    },
    body: {
      fontSize: '1rem', // 16px
      lineHeight: '1.5rem',
      fontWeight: '400',
    },
    bodySmall: {
      fontSize: '0.875rem', // 14px
      lineHeight: '1.25rem',
      fontWeight: '400',
    },
    caption: {
      fontSize: '0.75rem', // 12px
      lineHeight: '1rem',
      fontWeight: '400',
    },
    button: {
      fontSize: '0.875rem', // 14px
      lineHeight: '1.25rem',
      fontWeight: '500',
      letterSpacing: '0.025em',
    },
    label: {
      fontSize: '0.875rem', // 14px
      lineHeight: '1.25rem',
      fontWeight: '500',
    }
  }
} as const

// =============================================================================
// BRAND ICONOGRAPHY
// =============================================================================

export const BRAND_ICONOGRAPHY = {
  style: {
    type: 'outlined',
    strokeWidth: 2,
    cornerRadius: 2,
    size: {
      xs: 16,
      sm: 20,
      md: 24,
      lg: 32,
      xl: 48,
    }
  },

  // Core brand icons
  icons: {
    // Brand identity
    logo: 'shield-check',
    logoMark: 'shield',
    
    // Risk levels
    safe: 'check-circle',
    low: 'info-circle',
    medium: 'alert-triangle',
    high: 'x-circle',
    critical: 'alert-octagon',
    
    // Actions
    analyze: 'search',
    protect: 'shield',
    educate: 'book-open',
    monitor: 'eye',
    
    // UI elements
    menu: 'menu',
    close: 'x',
    chevronDown: 'chevron-down',
    chevronUp: 'chevron-up',
    chevronLeft: 'chevron-left',
    chevronRight: 'chevron-right',
    
    // Features
    document: 'file-text',
    upload: 'upload',
    download: 'download',
    share: 'share',
    settings: 'settings',
    help: 'help-circle',
  }
} as const

// =============================================================================
// BRAND MESSAGING
// =============================================================================

export const BRAND_MESSAGING = {
  // Value propositions
  primaryValue: 'Understand legal documents in seconds, not hours',
  secondaryValues: [
    'Privacy-first AI analysis',
    'No document storage or tracking', 
    'Actionable insights and recommendations',
    'Real-time protection alerts'
  ],

  // Call-to-actions
  cta: {
    primary: 'Analyze Document',
    secondary: 'Try Free',
    emergency: 'Check This Now',
    educational: 'Learn More',
    protective: 'Protect Yourself'
  },

  // Status messages
  status: {
    analyzing: 'Analyzing your document...',
    complete: 'Analysis complete',
    safe: 'Document looks safe',
    warning: 'Found some concerns',
    danger: 'Critical issues detected',
    error: 'Analysis failed',
    empty: 'No documents analyzed yet'
  },

  // Risk explanations
  riskExplanations: {
    safe: 'This document appears fair and transparent',
    low: 'Minor concerns that you should be aware of',
    medium: 'Several clauses that could affect you',
    high: 'Significant risks to your rights or privacy',
    critical: 'Serious threats that require immediate attention'
  },

  // Educational content
  education: {
    whyAnalyze: 'Most people never read terms of service, but they contain important information about your rights, privacy, and obligations.',
    howItWorks: 'Our AI reads through complex legal language and identifies clauses that could impact you, then explains them in plain English.',
    privacy: 'Your documents are analyzed locally and never stored or shared. Your privacy is our priority.'
  }
} as const

// =============================================================================
// PLATFORM-SPECIFIC ADAPTATIONS
// =============================================================================

export const PLATFORM_ADAPTATIONS = {
  web: {
    containerMaxWidth: '1280px',
    breakpoints: {
      mobile: '640px',
      tablet: '768px', 
      desktop: '1024px',
      wide: '1280px'
    },
    animations: {
      enabled: true,
      duration: 200,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
    }
  },

  mobile: {
    safeArea: {
      top: 44,
      bottom: 34,
      left: 0,
      right: 0
    },
    touchTargets: {
      minSize: 44,
      spacing: 8
    },
    gestures: {
      swipeThreshold: 50,
      tapTimeout: 100
    }
  },

  extension: {
    popup: {
      width: 400,
      maxHeight: 600,
      padding: 16
    },
    notification: {
      duration: 5000,
      position: 'top-right'
    },
    overlay: {
      zIndex: 999999,
      backdrop: 'rgba(0, 0, 0, 0.5)'
    }
  }
} as const

// =============================================================================
// BRAND CONSISTENCY UTILITIES
// =============================================================================

export class BrandSystem {
  /**
   * Get brand color with proper contrast
   */
  static getColor(
    colorName: keyof typeof BRAND_COLORS,
    shade: number = 500,
    platform: 'web' | 'mobile' | 'extension' = 'web'
  ): string {
    const color = BRAND_COLORS[colorName]
    if (!color) return BRAND_COLORS.neutral[500]
    
    const colorValue = color[shade as keyof typeof color]
    if (!colorValue) return BRAND_COLORS.neutral[500]
    
    // Platform-specific color adjustments
    switch (platform) {
      case 'mobile':
        // Slightly higher contrast for mobile
        if (shade >= 500) return colorValue
        return color[Math.min(shade + 100, 900) as keyof typeof color] || colorValue
      
      case 'extension':
        // Ensure visibility in various webpage contexts
        if (shade < 400) return color[600] || colorValue
        return colorValue
      
      default:
        return colorValue
    }
  }

  /**
   * Get typography styles for platform
   */
  static getTypography(
    variant: keyof typeof BRAND_TYPOGRAPHY.typeScale,
    platform: 'web' | 'mobile' | 'extension' = 'web'
  ) {
    const baseStyle = BRAND_TYPOGRAPHY.typeScale[variant]
    
    switch (platform) {
      case 'mobile':
        return {
          ...baseStyle,
          fontSize: `${parseFloat(baseStyle.fontSize) * 0.9}rem`, // Slightly smaller for mobile
        }
      
      case 'extension':
        return {
          ...baseStyle,
          fontSize: `${parseFloat(baseStyle.fontSize) * 0.85}rem`, // Smaller for extension popup
        }
      
      default:
        return baseStyle
    }
  }

  /**
   * Get platform-appropriate spacing
   */
  static getSpacing(
    size: keyof typeof tokens.spacing,
    platform: 'web' | 'mobile' | 'extension' = 'web'
  ): string {
    const baseSpacing = tokens.spacing[size]
    
    switch (platform) {
      case 'mobile':
        // Larger touch targets
        if (['1', '2', '3'].includes(size)) {
          return tokens.spacing[Math.min(Number(size) + 1, 8) as keyof typeof tokens.spacing]
        }
        return baseSpacing
      
      case 'extension':
        // Compact spacing for limited real estate
        if (Number(size) > 6) {
          return tokens.spacing[Math.max(Number(size) - 2, 1) as keyof typeof tokens.spacing]
        }
        return baseSpacing
      
      default:
        return baseSpacing
    }
  }

  /**
   * Get risk level styling
   */
  static getRiskStyling(
    riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical',
    element: 'background' | 'border' | 'text' | 'icon' = 'background'
  ) {
    const riskColorMap = {
      safe: 'sage',
      low: 'sage',
      medium: 'alert',
      high: 'danger',
      critical: 'danger'
    } as const

    const colorName = riskColorMap[riskLevel]
    
    switch (element) {
      case 'background':
        return {
          backgroundColor: BrandSystem.getColor(colorName, 50),
          borderColor: BrandSystem.getColor(colorName, 200),
          color: BrandSystem.getColor(colorName, 900)
        }
      
      case 'border':
        return {
          borderColor: BrandSystem.getColor(colorName, 300),
        }
      
      case 'text':
        return {
          color: BrandSystem.getColor(colorName, 700),
        }
      
      case 'icon':
        return {
          color: BrandSystem.getColor(colorName, 600),
        }
      
      default:
        return {}
    }
  }

  /**
   * Generate consistent shadow based on elevation
   */
  static getShadow(
    elevation: 'none' | 'low' | 'medium' | 'high' | 'highest' = 'low',
    platform: 'web' | 'mobile' | 'extension' = 'web'
  ): string {
    const shadows = {
      none: 'none',
      low: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      medium: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      high: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      highest: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
    }

    const shadow = shadows[elevation]
    
    // Platform adjustments
    switch (platform) {
      case 'mobile':
        // Softer shadows for mobile
        return shadow.replace(/rgba\(0, 0, 0, ([\d.]+)\)/g, (match, opacity) => 
          `rgba(0, 0, 0, ${parseFloat(opacity) * 0.7})`
        )
      
      case 'extension':
        // Stronger shadows for better separation from webpage content
        return shadow.replace(/rgba\(0, 0, 0, ([\d.]+)\)/g, (match, opacity) => 
          `rgba(0, 0, 0, ${Math.min(parseFloat(opacity) * 1.3, 0.25)})`
        )
      
      default:
        return shadow
    }
  }

  /**
   * Get consistent border radius
   */
  static getBorderRadius(
    size: 'none' | 'sm' | 'base' | 'md' | 'lg' | 'xl' | 'full' = 'base',
    platform: 'web' | 'mobile' | 'extension' = 'web'
  ): string {
    const radii = {
      none: '0px',
      sm: '0.125rem',
      base: '0.25rem', 
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      full: '9999px'
    }

    const baseRadius = radii[size]
    
    // Platform adjustments
    switch (platform) {
      case 'mobile':
        // Slightly larger radius for better touch experience
        if (size !== 'none' && size !== 'full') {
          return `${parseFloat(baseRadius) * 1.2}rem`
        }
        return baseRadius
      
      default:
        return baseRadius
    }
  }

  /**
   * Generate platform-specific theme object
   */
  static generateTheme(platform: 'web' | 'mobile' | 'extension' = 'web') {
    return {
      colors: BRAND_COLORS,
      typography: BRAND_TYPOGRAPHY,
      spacing: tokens.spacing,
      shadows: tokens.shadows,
      borderRadius: tokens.borderRadius,
      
      // Platform-specific adaptations
      platform: PLATFORM_ADAPTATIONS[platform],
      
      // Brand-specific utilities
      brand: {
        identity: BRAND_IDENTITY,
        messaging: BRAND_MESSAGING,
        iconography: BRAND_ICONOGRAPHY,
      },
      
      // Utility functions bound to platform
      getColor: (color: keyof typeof BRAND_COLORS, shade?: number) => 
        BrandSystem.getColor(color, shade, platform),
      
      getTypography: (variant: keyof typeof BRAND_TYPOGRAPHY.typeScale) =>
        BrandSystem.getTypography(variant, platform),
      
      getSpacing: (size: keyof typeof tokens.spacing) =>
        BrandSystem.getSpacing(size, platform),
      
      getRiskStyling: (risk: 'safe' | 'low' | 'medium' | 'high' | 'critical', element?: 'background' | 'border' | 'text' | 'icon') =>
        BrandSystem.getRiskStyling(risk, element),
      
      getShadow: (elevation?: 'none' | 'low' | 'medium' | 'high' | 'highest') =>
        BrandSystem.getShadow(elevation, platform),
      
      getBorderRadius: (size?: 'none' | 'sm' | 'base' | 'md' | 'lg' | 'xl' | 'full') =>
        BrandSystem.getBorderRadius(size, platform),
    }
  }
}

// =============================================================================
// BRAND VALIDATION UTILITIES
// =============================================================================

export class BrandValidator {
  /**
   * Validate color contrast meets accessibility standards
   */
  static validateContrast(
    foreground: string,
    background: string,
    level: 'AA' | 'AAA' = 'AA'
  ): boolean {
    // Simplified contrast validation
    // In production, you'd use a proper contrast calculation library
    const requiredRatio = level === 'AAA' ? 7 : 4.5
    
    // Mock validation - replace with actual contrast calculation
    return true
  }

  /**
   * Validate brand consistency across components
   */
  static validateBrandConsistency(
    componentConfig: {
      colors: string[]
      typography: string[]
      spacing: string[]
    }
  ): {
    valid: boolean
    violations: string[]
  } {
    const violations: string[] = []
    
    // Check if colors are from brand palette
    componentConfig.colors.forEach(color => {
      if (!color.startsWith('#') && !Object.values(BRAND_COLORS).some(palette => 
        Object.values(palette).includes(color)
      )) {
        violations.push(`Color ${color} is not in brand palette`)
      }
    })
    
    return {
      valid: violations.length === 0,
      violations
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default BrandSystem

export {
  BRAND_IDENTITY,
  BRAND_COLORS,
  BRAND_TYPOGRAPHY,
  BRAND_ICONOGRAPHY,
  BRAND_MESSAGING,
  PLATFORM_ADAPTATIONS
}