/**
 * Fine Print AI Mobile Design System
 * Model-inspired design system adapted for React Native
 */

import { Platform, Dimensions } from 'react-native'
import { colors, typography, spacing, borderRadius, shadows } from '@/constants/theme'

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')

// Device size categories
export const deviceSizes = {
  isSmallDevice: screenWidth < 375,
  isMediumDevice: screenWidth >= 375 && screenWidth < 414,
  isLargeDevice: screenWidth >= 414,
  isTablet: screenWidth >= 768,
}

// Platform-specific values
export const platformSelect = <T>(ios: T, android: T): T => {
  return Platform.select({ ios, android }) || ios
}

// Model-inspired color system with semantic meanings
export const modelColors = {
  // Core brand colors
  brand: {
    primary: '#3B82F6', // Trust blue
    secondary: '#6366F1', // Insight purple
    accent: '#10B981', // Success green
    muted: '#6B7280', // Neutral gray
  },

  // Semantic colors
  semantic: {
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
  },

  // Privacy score colors
  privacyScore: {
    excellent: '#10B981', // 90-100
    good: '#34D399', // 70-89
    fair: '#F59E0B', // 50-69
    poor: '#F87171', // 30-49
    terrible: '#DC2626', // 0-29
  },

  // Document analysis states
  analysis: {
    scanning: '#6366F1',
    processing: '#3B82F6',
    complete: '#10B981',
    error: '#EF4444',
  },

  // Dark mode variants
  dark: {
    background: '#0F172A',
    surface: '#1E293B',
    surfaceLight: '#334155',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    border: '#334155',
  }
}

// Model-inspired typography scale
export const modelTypography = {
  // Display styles
  display: {
    large: {
      fontSize: 32,
      lineHeight: 40,
      fontWeight: '700' as const,
      letterSpacing: -0.5,
    },
    medium: {
      fontSize: 28,
      lineHeight: 36,
      fontWeight: '600' as const,
      letterSpacing: -0.3,
    },
    small: {
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '600' as const,
      letterSpacing: -0.2,
    },
  },

  // Heading styles
  heading: {
    h1: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700' as const,
      letterSpacing: -0.2,
    },
    h2: {
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '600' as const,
      letterSpacing: -0.1,
    },
    h3: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '600' as const,
      letterSpacing: 0,
    },
    h4: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '600' as const,
      letterSpacing: 0,
    },
  },

  // Body styles
  body: {
    large: {
      fontSize: 17,
      lineHeight: 24,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },
    medium: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },
    small: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '400' as const,
      letterSpacing: 0,
    },
  },

  // Label styles
  label: {
    large: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500' as const,
      letterSpacing: 0.1,
    },
    medium: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500' as const,
      letterSpacing: 0.15,
    },
    small: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '500' as const,
      letterSpacing: 0.2,
    },
  },
}

// Model-inspired spacing system
export const modelSpacing = {
  // Base unit: 4
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,

  // Layout spacing
  screenPadding: deviceSizes.isSmallDevice ? 16 : 20,
  cardPadding: 16,
  listItemPadding: 12,
  
  // Component spacing
  buttonPadding: {
    horizontal: 24,
    vertical: 12,
  },
  inputPadding: {
    horizontal: 16,
    vertical: 12,
  },
}

// Model-inspired elevation system
export const modelElevation = {
  none: {
    ...Platform.select({
      ios: {
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  low: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  medium: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  high: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
}

// Model-inspired component styles
export const modelComponents = {
  // Buttons
  button: {
    primary: {
      backgroundColor: modelColors.brand.primary,
      paddingHorizontal: modelSpacing.buttonPadding.horizontal,
      paddingVertical: modelSpacing.buttonPadding.vertical,
      borderRadius: borderRadius.base,
      ...modelElevation.low,
    },
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: modelColors.brand.primary,
      paddingHorizontal: modelSpacing.buttonPadding.horizontal,
      paddingVertical: modelSpacing.buttonPadding.vertical,
      borderRadius: borderRadius.base,
    },
    ghost: {
      backgroundColor: 'transparent',
      paddingHorizontal: modelSpacing.buttonPadding.horizontal,
      paddingVertical: modelSpacing.buttonPadding.vertical,
    },
    danger: {
      backgroundColor: modelColors.semantic.danger,
      paddingHorizontal: modelSpacing.buttonPadding.horizontal,
      paddingVertical: modelSpacing.buttonPadding.vertical,
      borderRadius: borderRadius.base,
      ...modelElevation.low,
    },
  },

  // Cards
  card: {
    base: {
      backgroundColor: '#ffffff',
      borderRadius: borderRadius.lg,
      padding: modelSpacing.cardPadding,
      ...modelElevation.medium,
    },
    interactive: {
      backgroundColor: '#ffffff',
      borderRadius: borderRadius.lg,
      padding: modelSpacing.cardPadding,
      ...modelElevation.low,
    },
  },

  // Inputs
  input: {
    base: {
      backgroundColor: '#ffffff',
      borderWidth: 1,
      borderColor: colors.gray[300],
      borderRadius: borderRadius.base,
      paddingHorizontal: modelSpacing.inputPadding.horizontal,
      paddingVertical: modelSpacing.inputPadding.vertical,
      fontSize: modelTypography.body.medium.fontSize,
    },
    focused: {
      borderColor: modelColors.brand.primary,
      borderWidth: 2,
    },
    error: {
      borderColor: modelColors.semantic.danger,
      borderWidth: 1.5,
    },
  },

  // Badges
  badge: {
    base: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
    },
    success: {
      backgroundColor: modelColors.semantic.success + '20',
      color: modelColors.semantic.success,
    },
    warning: {
      backgroundColor: modelColors.semantic.warning + '20',
      color: modelColors.semantic.warning,
    },
    danger: {
      backgroundColor: modelColors.semantic.danger + '20',
      color: modelColors.semantic.danger,
    },
    info: {
      backgroundColor: modelColors.semantic.info + '20',
      color: modelColors.semantic.info,
    },
  },

  // Privacy score indicator
  privacyScore: {
    container: {
      borderRadius: borderRadius.base,
      padding: modelSpacing.md,
      ...modelElevation.low,
    },
    getColor: (score: number) => {
      if (score >= 90) return modelColors.privacyScore.excellent
      if (score >= 70) return modelColors.privacyScore.good
      if (score >= 50) return modelColors.privacyScore.fair
      if (score >= 30) return modelColors.privacyScore.poor
      return modelColors.privacyScore.terrible
    },
    getLabel: (score: number) => {
      if (score >= 90) return 'Excellent'
      if (score >= 70) return 'Good'
      if (score >= 50) return 'Fair'
      if (score >= 30) return 'Poor'
      return 'Terrible'
    },
  },
}

// Animation configurations
export const modelAnimations = {
  // Spring animations for interactions
  spring: {
    damping: 15,
    stiffness: 150,
    mass: 1,
  },

  // Timing animations
  timing: {
    fast: 150,
    normal: 250,
    slow: 350,
  },

  // Easing functions
  easing: {
    standard: 'ease-in-out',
    decelerate: 'ease-out',
    accelerate: 'ease-in',
  },
}

// Haptic feedback patterns
export const modelHaptics = {
  light: 'impactLight' as const,
  medium: 'impactMedium' as const,
  heavy: 'impactHeavy' as const,
  selection: 'selection' as const,
  success: 'notificationSuccess' as const,
  warning: 'notificationWarning' as const,
  error: 'notificationError' as const,
}

// Accessibility configurations
export const modelAccessibility = {
  // Minimum touch target size
  minTouchTarget: 44,

  // Focus indicators
  focusIndicator: {
    borderWidth: 2,
    borderColor: modelColors.brand.primary,
    borderRadius: borderRadius.base,
  },

  // High contrast mode adjustments
  highContrast: {
    borderWidth: 2,
    textWeight: '600' as const,
  },
}

// Export all design tokens
export default {
  colors: modelColors,
  typography: modelTypography,
  spacing: modelSpacing,
  elevation: modelElevation,
  components: modelComponents,
  animations: modelAnimations,
  haptics: modelHaptics,
  accessibility: modelAccessibility,
  deviceSizes,
  platformSelect,
}