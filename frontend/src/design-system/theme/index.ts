/**
 * Fine Print AI - Unified Theme System
 * Cross-platform theme provider with dark/light mode support
 */

import { tokens, colors, type RiskLevel } from '../tokens'

// =============================================================================
// THEME TYPES
// =============================================================================

export interface ThemeColors {
  // Background colors
  background: {
    primary: string
    secondary: string
    tertiary: string
    inverse: string
  }
  
  // Foreground colors
  foreground: {
    primary: string
    secondary: string
    tertiary: string
    inverse: string
    muted: string
  }
  
  // Brand colors
  brand: {
    primary: string
    secondary: string
    accent: string
  }
  
  // Interactive colors
  interactive: {
    primary: string
    secondary: string
    hover: string
    active: string
    disabled: string
    focus: string
  }
  
  // Border colors
  border: {
    primary: string
    secondary: string
    tertiary: string
    focus: string
    error: string
  }
  
  // Status colors
  status: {
    success: string
    warning: string
    error: string
    info: string
  }
  
  // Risk level colors
  risk: {
    safe: string
    low: string
    medium: string
    high: string
    critical: string
  }
  
  // Surface colors
  surface: {
    primary: string
    secondary: string
    tertiary: string
    overlay: string
    modal: string
  }
}

export interface Theme {
  name: string
  colors: ThemeColors
  isDark: boolean
}

// =============================================================================
// LIGHT THEME
// =============================================================================

export const lightTheme: Theme = {
  name: 'light',
  isDark: false,
  colors: {
    background: {
      primary: colors.neutral[0],
      secondary: colors.smoke[50],
      tertiary: colors.smoke[100],
      inverse: colors.charcoal[950],
    },
    
    foreground: {
      primary: colors.charcoal[900],
      secondary: colors.charcoal[700],
      tertiary: colors.charcoal[600],
      inverse: colors.neutral[0],
      muted: colors.charcoal[500],
    },
    
    brand: {
      primary: colors.cerulean[500],
      secondary: colors.sage[500],
      accent: colors.cerulean[600],
    },
    
    interactive: {
      primary: colors.cerulean[500],
      secondary: colors.cerulean[50],
      hover: colors.cerulean[600],
      active: colors.cerulean[700],
      disabled: colors.smoke[300],
      focus: colors.cerulean[500],
    },
    
    border: {
      primary: colors.smoke[200],
      secondary: colors.smoke[300],
      tertiary: colors.smoke[400],
      focus: colors.cerulean[500],
      error: colors.crimson[500],
    },
    
    status: {
      success: colors.sage[500],
      warning: colors.amber[500],
      error: colors.crimson[500],
      info: colors.cerulean[500],
    },
    
    risk: {
      safe: colors.sage[500],
      low: colors.sage[400],
      medium: colors.amber[500],
      high: colors.crimson[500],
      critical: colors.crimson[600],
    },
    
    surface: {
      primary: colors.neutral[0],
      secondary: colors.smoke[50],
      tertiary: colors.smoke[100],
      overlay: 'rgba(13, 15, 18, 0.5)',
      modal: colors.neutral[0],
    },
  },
}

// =============================================================================
// DARK THEME
// =============================================================================

export const darkTheme: Theme = {
  name: 'dark',
  isDark: true,
  colors: {
    background: {
      primary: colors.charcoal[950],
      secondary: colors.charcoal[900],
      tertiary: colors.charcoal[800],
      inverse: colors.neutral[0],
    },
    
    foreground: {
      primary: colors.smoke[100],
      secondary: colors.smoke[200],
      tertiary: colors.smoke[400],
      inverse: colors.charcoal[950],
      muted: colors.smoke[500],
    },
    
    brand: {
      primary: colors.cerulean[400],
      secondary: colors.sage[400],
      accent: colors.cerulean[300],
    },
    
    interactive: {
      primary: colors.cerulean[400],
      secondary: colors.cerulean[950],
      hover: colors.cerulean[300],
      active: colors.cerulean[200],
      disabled: colors.charcoal[700],
      focus: colors.cerulean[400],
    },
    
    border: {
      primary: colors.charcoal[800],
      secondary: colors.charcoal[700],
      tertiary: colors.charcoal[600],
      focus: colors.cerulean[400],
      error: colors.crimson[400],
    },
    
    status: {
      success: colors.sage[400],
      warning: colors.amber[400],
      error: colors.crimson[400],
      info: colors.cerulean[400],
    },
    
    risk: {
      safe: colors.sage[400],
      low: colors.sage[300],
      medium: colors.amber[400],
      high: colors.crimson[400],
      critical: colors.crimson[300],
    },
    
    surface: {
      primary: colors.charcoal[950],
      secondary: colors.charcoal[900],
      tertiary: colors.charcoal[800],
      overlay: 'rgba(0, 0, 0, 0.8)',
      modal: colors.charcoal[900],
    },
  },
}

// =============================================================================
// HIGH CONTRAST THEMES
// =============================================================================

export const highContrastLightTheme: Theme = {
  ...lightTheme,
  name: 'high-contrast-light',
  colors: {
    ...lightTheme.colors,
    background: {
      primary: colors.neutral[0],
      secondary: colors.neutral[0],
      tertiary: colors.neutral[50],
      inverse: colors.neutral[1000],
    },
    
    foreground: {
      primary: colors.neutral[1000],
      secondary: colors.neutral[1000],
      tertiary: colors.neutral[800],
      inverse: colors.neutral[0],
      muted: colors.neutral[600],
    },
    
    border: {
      primary: colors.neutral[1000],
      secondary: colors.neutral[800],
      tertiary: colors.neutral[600],
      focus: colors.guardian[700],
      error: colors.risk.high[700],
    },
  },
}

export const highContrastDarkTheme: Theme = {
  ...darkTheme,
  name: 'high-contrast-dark',
  colors: {
    ...darkTheme.colors,
    background: {
      primary: colors.neutral[1000],
      secondary: colors.neutral[1000],
      tertiary: colors.neutral[900],
      inverse: colors.neutral[0],
    },
    
    foreground: {
      primary: colors.neutral[0],
      secondary: colors.neutral[0],
      tertiary: colors.neutral[200],
      inverse: colors.neutral[1000],
      muted: colors.neutral[400],
    },
    
    border: {
      primary: colors.neutral[0],
      secondary: colors.neutral[200],
      tertiary: colors.neutral[400],
      focus: colors.guardian[200],
      error: colors.risk.high[200],
    },
  },
}

// =============================================================================
// THEME UTILITIES
// =============================================================================

export function getRiskColor(score: number, theme: Theme): string {
  if (score <= 20) return theme.colors.risk.safe
  if (score <= 40) return theme.colors.risk.low
  if (score <= 60) return theme.colors.risk.medium
  if (score <= 80) return theme.colors.risk.high
  return theme.colors.risk.critical
}

export function getRiskLevel(score: number): RiskLevel {
  if (score <= 20) return 'safe'
  if (score <= 40) return 'low'
  if (score <= 60) return 'medium'
  if (score <= 80) return 'high'
  return 'critical'
}

export function getRiskLabel(score: number): string {
  const level = getRiskLevel(score)
  const labels = {
    safe: 'Safe',
    low: 'Low Risk',
    medium: 'Medium Risk',
    high: 'High Risk',
    critical: 'Critical Risk',
  }
  return labels[level]
}

export function getContrastColor(backgroundColor: string, theme: Theme): string {
  // Simple contrast calculation - in production, use a proper contrast library
  return theme.isDark ? theme.colors.foreground.primary : theme.colors.foreground.inverse
}

// =============================================================================
// THEME COLLECTION
// =============================================================================

export const themes = {
  light: lightTheme,
  dark: darkTheme,
  'high-contrast-light': highContrastLightTheme,
  'high-contrast-dark': highContrastDarkTheme,
} as const

export type ThemeName = keyof typeof themes

// =============================================================================
// CSS VARIABLES GENERATION
// =============================================================================

export function generateCSSVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {}
  
  // Background colors
  vars['--fp-bg-primary'] = theme.colors.background.primary
  vars['--fp-bg-secondary'] = theme.colors.background.secondary
  vars['--fp-bg-tertiary'] = theme.colors.background.tertiary
  vars['--fp-bg-inverse'] = theme.colors.background.inverse
  
  // Foreground colors
  vars['--fp-fg-primary'] = theme.colors.foreground.primary
  vars['--fp-fg-secondary'] = theme.colors.foreground.secondary
  vars['--fp-fg-tertiary'] = theme.colors.foreground.tertiary
  vars['--fp-fg-inverse'] = theme.colors.foreground.inverse
  vars['--fp-fg-muted'] = theme.colors.foreground.muted
  
  // Brand colors
  vars['--fp-brand-primary'] = theme.colors.brand.primary
  vars['--fp-brand-secondary'] = theme.colors.brand.secondary
  vars['--fp-brand-accent'] = theme.colors.brand.accent
  
  // Interactive colors
  vars['--fp-interactive-primary'] = theme.colors.interactive.primary
  vars['--fp-interactive-secondary'] = theme.colors.interactive.secondary
  vars['--fp-interactive-hover'] = theme.colors.interactive.hover
  vars['--fp-interactive-active'] = theme.colors.interactive.active
  vars['--fp-interactive-disabled'] = theme.colors.interactive.disabled
  vars['--fp-interactive-focus'] = theme.colors.interactive.focus
  
  // Border colors
  vars['--fp-border-primary'] = theme.colors.border.primary
  vars['--fp-border-secondary'] = theme.colors.border.secondary
  vars['--fp-border-tertiary'] = theme.colors.border.tertiary
  vars['--fp-border-focus'] = theme.colors.border.focus
  vars['--fp-border-error'] = theme.colors.border.error
  
  // Status colors
  vars['--fp-status-success'] = theme.colors.status.success
  vars['--fp-status-warning'] = theme.colors.status.warning
  vars['--fp-status-error'] = theme.colors.status.error
  vars['--fp-status-info'] = theme.colors.status.info
  
  // Risk colors
  vars['--fp-risk-safe'] = theme.colors.risk.safe
  vars['--fp-risk-low'] = theme.colors.risk.low
  vars['--fp-risk-medium'] = theme.colors.risk.medium
  vars['--fp-risk-high'] = theme.colors.risk.high
  vars['--fp-risk-critical'] = theme.colors.risk.critical
  
  // Surface colors
  vars['--fp-surface-primary'] = theme.colors.surface.primary
  vars['--fp-surface-secondary'] = theme.colors.surface.secondary
  vars['--fp-surface-tertiary'] = theme.colors.surface.tertiary
  vars['--fp-surface-overlay'] = theme.colors.surface.overlay
  vars['--fp-surface-modal'] = theme.colors.surface.modal
  
  return vars
}

// =============================================================================
// DEFAULT EXPORTS
// =============================================================================

export {
  tokens,
  lightTheme as defaultTheme,
}

export default {
  themes,
  tokens,
  getRiskColor,
  getRiskLevel,
  getRiskLabel,
  getContrastColor,
  generateCSSVariables,
}