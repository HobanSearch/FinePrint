/**
 * Fine Print AI - Unified Design System Tokens
 * Cross-platform compatible design tokens for web, mobile, and extension
 */

// =============================================================================
// COLOR SYSTEM - Model-Inspired Palette
// =============================================================================

export const colors = {
  // Sophisticated Neutrals - Core Palette
  charcoal: {
    50: '#f8f9fa',
    100: '#f1f3f5',
    200: '#e9ecef',
    300: '#dee2e6',
    400: '#ced4da',
    500: '#adb5bd',
    600: '#868e96',
    700: '#495057',
    800: '#343a40',
    900: '#212529',
    950: '#0d0f12',
  },
  
  graphite: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#eeeeee',
    300: '#e0e0e0',
    400: '#bdbdbd',
    500: '#9e9e9e',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
    950: '#0a0a0a',
  },
  
  smoke: {
    50: '#fbfcfd',
    100: '#f8f9fa',
    200: '#f3f4f6',
    300: '#e9ecef',
    400: '#dde1e6',
    500: '#c9cdd2',
    600: '#a9aeb4',
    700: '#868e96',
    800: '#6c737a',
    900: '#4b5259',
    950: '#2e3338',
  },
  
  // Minimal Accent Colors
  cerulean: { // Trust & Intelligence
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#b9e5fe',
    300: '#7cd4fd',
    400: '#36bffa',
    500: '#0ba5ec', // Primary cerulean
    600: '#0086c9',
    700: '#026aa2',
    800: '#065986',
    900: '#0b4a6f',
    950: '#062c41',
  },
  
  sage: { // Safety & Approval
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e', // Primary sage
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
    950: '#052e16',
  },
  
  amber: { // Warnings & Caution
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b', // Primary amber
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    950: '#451a03',
  },
  
  crimson: { // Alerts & Critical
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444', // Primary crimson
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
    950: '#450a0a',
  },

  // Risk Level Colors
  risk: {
    safe: {
      50: '#ecfdf5',
      100: '#d1fae5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      400: '#34d399',
      500: '#10b981', // Safe - Sage green
      600: '#059669',
      700: '#047857',
      800: '#065f46',
      900: '#064e3b',
    },
    low: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e', // Low risk - Bright green
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d',
    },
    medium: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b', // Medium risk - Alert orange
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
    },
    high: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#ef4444', // High risk - Danger red
      600: '#dc2626',
      700: '#b91c1c',
      800: '#991b1b',
      900: '#7f1d1d',
    },
    critical: {
      50: '#fdf2f8',
      100: '#fce7f3',
      200: '#fbcfe8',
      300: '#f9a8d4',
      400: '#f472b6',
      500: '#ec4899', // Critical - Magenta
      600: '#db2777',
      700: '#be185d',
      800: '#9d174d',
      900: '#831843',
    },
  },

  // Semantic Colors
  semantic: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },

  // Pure Neutrals - Ultra-clean palette
  neutral: {
    0: '#ffffff',
    50: '#fbfcfd',
    100: '#f8f9fa',
    200: '#f3f4f6',
    300: '#e9ecef',
    400: '#dde1e6',
    500: '#c9cdd2',
    600: '#a9aeb4',
    700: '#868e96',
    800: '#6c737a',
    900: '#4b5259',
    950: '#2e3338',
    1000: '#0d0f12',
  },

  // Data Visualization Palette - Refined
  charts: {
    primary: ['#0ba5ec', '#22c55e', '#f59e0b', '#ef4444', '#6366f1'],
    secondary: ['#36bffa', '#4ade80', '#fbbf24', '#f87171', '#818cf8'],
    tertiary: ['#7cd4fd', '#86efac', '#fcd34d', '#fca5a5', '#a5b4fc'],
    monochrome: ['#0d0f12', '#4b5259', '#868e96', '#c9cdd2', '#f3f4f6'],
  },
} as const

// =============================================================================
// TYPOGRAPHY SYSTEM
// =============================================================================

export const typography = {
  fontFamily: {
    sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
    mono: ['SF Mono', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
    serif: ['New York', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
  },

  fontSize: {
    xs: { size: '0.75rem', lineHeight: '1rem' },      // 12px
    sm: { size: '0.875rem', lineHeight: '1.25rem' },   // 14px
    base: { size: '1rem', lineHeight: '1.5rem' },      // 16px
    lg: { size: '1.125rem', lineHeight: '1.75rem' },   // 18px
    xl: { size: '1.25rem', lineHeight: '1.75rem' },    // 20px
    '2xl': { size: '1.5rem', lineHeight: '2rem' },     // 24px
    '3xl': { size: '1.875rem', lineHeight: '2.25rem' }, // 30px
    '4xl': { size: '2.25rem', lineHeight: '2.5rem' },  // 36px
    '5xl': { size: '3rem', lineHeight: '1' },          // 48px
    '6xl': { size: '3.75rem', lineHeight: '1' },       // 60px
    '7xl': { size: '4.5rem', lineHeight: '1' },        // 72px
    '8xl': { size: '6rem', lineHeight: '1' },          // 96px
    '9xl': { size: '8rem', lineHeight: '1' },          // 128px
  },

  fontWeight: {
    thin: '100',
    extralight: '200',
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
    black: '900',
  },

  lineHeight: {
    none: '1',
    tight: '1.25',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
  },

  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const

// =============================================================================
// SPACING SYSTEM - Refined Scale
// =============================================================================

export const spacing = {
  0: '0px',
  0.5: '0.125rem', // 2px
  1: '0.25rem',    // 4px
  1.5: '0.375rem', // 6px
  2: '0.5rem',     // 8px
  2.5: '0.625rem', // 10px
  3: '0.75rem',    // 12px
  3.5: '0.875rem', // 14px
  4: '1rem',       // 16px
  5: '1.25rem',    // 20px
  6: '1.5rem',     // 24px
  7: '1.75rem',    // 28px
  8: '2rem',       // 32px
  9: '2.25rem',    // 36px
  10: '2.5rem',    // 40px
  11: '2.75rem',   // 44px
  12: '3rem',      // 48px
  14: '3.5rem',    // 56px
  16: '4rem',      // 64px
  20: '5rem',      // 80px
  24: '6rem',      // 96px
  28: '7rem',      // 112px
  32: '8rem',      // 128px
  36: '9rem',      // 144px
  40: '10rem',     // 160px
  44: '11rem',     // 176px
  48: '12rem',     // 192px
  52: '13rem',     // 208px
  56: '14rem',     // 224px
  60: '15rem',     // 240px
  64: '16rem',     // 256px
  72: '18rem',     // 288px
  80: '20rem',     // 320px
  96: '24rem',     // 384px
  xs: '0.5rem',    // 8px
  sm: '0.75rem',   // 12px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  xxl: '3rem',     // 48px
} as const

// =============================================================================
// BORDER RADIUS SYSTEM
// =============================================================================

export const borderRadius = {
  none: '0px',
  sm: '0.125rem',   // 2px
  base: '0.25rem',  // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
} as const

// =============================================================================
// SHADOW SYSTEM
// =============================================================================

export const shadows = {
  none: 'none',
  // Ultra-subtle shadows for clean aesthetic
  xs: '0 1px 2px 0 rgb(0 0 0 / 0.02)',
  sm: '0 1px 3px 0 rgb(0 0 0 / 0.03), 0 1px 2px -1px rgb(0 0 0 / 0.02)',
  base: '0 2px 4px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.03)',
  md: '0 4px 8px -1px rgb(0 0 0 / 0.04), 0 2px 4px -2px rgb(0 0 0 / 0.03)',
  lg: '0 8px 16px -3px rgb(0 0 0 / 0.05), 0 4px 8px -4px rgb(0 0 0 / 0.04)',
  xl: '0 12px 24px -5px rgb(0 0 0 / 0.06), 0 8px 16px -6px rgb(0 0 0 / 0.05)',
  '2xl': '0 20px 40px -8px rgb(0 0 0 / 0.08)',
  inner: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.03)',
  
  // Refined colored shadows
  glow: {
    cerulean: '0 0 0 1px rgb(11 165 236 / 0.1), 0 0 16px rgb(11 165 236 / 0.1)',
    sage: '0 0 0 1px rgb(34 197 94 / 0.1), 0 0 16px rgb(34 197 94 / 0.1)',
    warning: '0 0 0 1px rgb(245 158 11 / 0.1), 0 0 16px rgb(245 158 11 / 0.1)',
    danger: '0 0 0 1px rgb(239 68 68 / 0.1), 0 0 16px rgb(239 68 68 / 0.1)',
  },
  
  // Elevation shadows for layers
  elevation: {
    1: '0 2px 4px -1px rgb(0 0 0 / 0.03)',
    2: '0 4px 8px -2px rgb(0 0 0 / 0.04)',
    3: '0 8px 16px -4px rgb(0 0 0 / 0.05)',
    4: '0 12px 24px -6px rgb(0 0 0 / 0.06)',
    5: '0 20px 40px -8px rgb(0 0 0 / 0.08)',
  },
} as const

// =============================================================================
// ANIMATION SYSTEM
// =============================================================================

export const animations = {
  duration: {
    instant: '0ms',
    fast: '150ms',
    normal: '250ms',
    slow: '350ms',
    slower: '500ms',
    // Legacy mapping
    75: '75ms',
    100: '100ms',
    150: '150ms',
    200: '200ms',
    250: '250ms',
    300: '300ms',
    350: '350ms',
    500: '500ms',
    700: '700ms',
    1000: '1000ms',
  },

  timing: {
    linear: 'linear',
    ease: 'ease',
    'ease-in': 'cubic-bezier(0.25, 0, 1, 1)',
    'ease-out': 'cubic-bezier(0, 0, 0.25, 1)',
    'ease-in-out': 'cubic-bezier(0.25, 0, 0.25, 1)',
    // Model-inspired smooth curves
    smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    'smooth-in': 'cubic-bezier(0.4, 0, 1, 1)',
    'smooth-out': 'cubic-bezier(0, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },

  keyframes: {
    fadeIn: {
      from: { opacity: '0' },
      to: { opacity: '1' },
    },
    fadeOut: {
      from: { opacity: '1' },
      to: { opacity: '0' },
    },
    slideInUp: {
      from: { transform: 'translateY(100%)', opacity: '0' },
      to: { transform: 'translateY(0)', opacity: '1' },
    },
    slideInDown: {
      from: { transform: 'translateY(-100%)', opacity: '0' },
      to: { transform: 'translateY(0)', opacity: '1' },
    },
    slideInLeft: {
      from: { transform: 'translateX(-100%)', opacity: '0' },
      to: { transform: 'translateX(0)', opacity: '1' },
    },
    slideInRight: {
      from: { transform: 'translateX(100%)', opacity: '0' },
      to: { transform: 'translateX(0)', opacity: '1' },
    },
    scaleIn: {
      from: { transform: 'scale(0.95)', opacity: '0' },
      to: { transform: 'scale(1)', opacity: '1' },
    },
    spin: {
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
    pulse: {
      '0%, 100%': { opacity: '1' },
      '50%': { opacity: '0.5' },
    },
    bounce: {
      '0%, 100%': { transform: 'translateY(-25%)', animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)' },
      '50%': { transform: 'translateY(0)', animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)' },
    },
  },
} as const

// =============================================================================
// BREAKPOINTS SYSTEM
// =============================================================================

export const breakpoints = {
  xs: '0px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const

// =============================================================================
// Z-INDEX SYSTEM
// =============================================================================

export const zIndex = {
  hide: -1,
  auto: 'auto',
  base: 0,
  docked: 10,
  dropdown: 1000,
  sticky: 1100,
  banner: 1200,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  skipLink: 1600,
  toast: 1700,
  tooltip: 1800,
} as const

// =============================================================================
// COMPONENT VARIANTS
// =============================================================================

export const variants = {
  button: {
    size: ['xs', 'sm', 'md', 'lg', 'xl'] as const,
    variant: ['primary', 'secondary', 'outline', 'ghost', 'link', 'destructive'] as const,
    risk: ['safe', 'low', 'medium', 'high', 'critical'] as const,
  },
  
  card: {
    variant: ['default', 'outlined', 'elevated', 'filled'] as const,
    padding: ['none', 'sm', 'md', 'lg', 'xl'] as const,
  },

  input: {
    size: ['sm', 'md', 'lg'] as const,
    variant: ['default', 'filled', 'underlined'] as const,
    state: ['default', 'error', 'success', 'warning'] as const,
  },

  badge: {
    size: ['sm', 'md', 'lg'] as const,
    variant: ['default', 'secondary', 'outline', 'destructive'] as const,
    risk: ['safe', 'low', 'medium', 'high', 'critical'] as const,
  },
} as const

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type ColorToken = keyof typeof colors
export type TypographyToken = keyof typeof typography
export type SpacingToken = keyof typeof spacing
export type BorderRadiusToken = keyof typeof borderRadius
export type ShadowToken = keyof typeof shadows
export type AnimationToken = keyof typeof animations
export type BreakpointToken = keyof typeof breakpoints
export type ZIndexToken = keyof typeof zIndex

// Component variant types
export type ButtonSize = typeof variants.button.size[number]
export type ButtonVariant = typeof variants.button.variant[number]
export type ButtonRisk = typeof variants.button.risk[number]

export type CardVariant = typeof variants.card.variant[number]
export type CardPadding = typeof variants.card.padding[number]

export type InputSize = typeof variants.input.size[number]
export type InputVariant = typeof variants.input.variant[number]
export type InputState = typeof variants.input.state[number]

export type BadgeSize = typeof variants.badge.size[number]
export type BadgeVariant = typeof variants.badge.variant[number]
export type BadgeRisk = typeof variants.badge.risk[number]

// Risk level type
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical'

// =============================================================================
// DEFAULT EXPORTS
// =============================================================================

export const tokens = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  animations,
  breakpoints,
  zIndex,
  variants,
} as const

export default tokens