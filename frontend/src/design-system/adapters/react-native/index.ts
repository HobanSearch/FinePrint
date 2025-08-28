/**
 * Fine Print AI - React Native Platform Adapter
 * Adapters for converting web components to React Native equivalents
 * Enhanced with brand consistency system
 */

import { tokens } from '../../tokens'
import type { RiskLevel } from '../../tokens'
import { BrandSystem, BRAND_COLORS, BRAND_TYPOGRAPHY, BRAND_MESSAGING } from '../../brand/BrandSystem'

// =============================================================================
// STYLE CONVERSION UTILITIES
// =============================================================================

/**
 * Convert web CSS properties to React Native StyleSheet properties
 */
export function convertToReactNativeStyles(webStyles: Record<string, any>) {
  const reactNativeStyles: Record<string, any> = {}

  Object.entries(webStyles).forEach(([key, value]) => {
    switch (key) {
      // Layout properties
      case 'display':
        if (value === 'flex') reactNativeStyles.display = 'flex'
        break
      case 'flexDirection':
        reactNativeStyles.flexDirection = value
        break
      case 'justifyContent':
        reactNativeStyles.justifyContent = value
        break
      case 'alignItems':
        reactNativeStyles.alignItems = value
        break
      case 'flex':
        reactNativeStyles.flex = typeof value === 'string' ? parseInt(value) : value
        break
      
      // Spacing
      case 'padding':
        reactNativeStyles.padding = convertSpacing(value)
        break
      case 'paddingTop':
        reactNativeStyles.paddingTop = convertSpacing(value)
        break
      case 'paddingRight':
        reactNativeStyles.paddingRight = convertSpacing(value)
        break
      case 'paddingBottom':
        reactNativeStyles.paddingBottom = convertSpacing(value)
        break
      case 'paddingLeft':
        reactNativeStyles.paddingLeft = convertSpacing(value)
        break
      case 'margin':
        reactNativeStyles.margin = convertSpacing(value)
        break
      case 'marginTop':
        reactNativeStyles.marginTop = convertSpacing(value)
        break
      case 'marginRight':
        reactNativeStyles.marginRight = convertSpacing(value)
        break
      case 'marginBottom':
        reactNativeStyles.marginBottom = convertSpacing(value)
        break
      case 'marginLeft':
        reactNativeStyles.marginLeft = convertSpacing(value)
        break
      
      // Dimensions
      case 'width':
        reactNativeStyles.width = convertDimension(value)
        break
      case 'height':
        reactNativeStyles.height = convertDimension(value)
        break
      case 'minWidth':
        reactNativeStyles.minWidth = convertDimension(value)
        break
      case 'minHeight':
        reactNativeStyles.minHeight = convertDimension(value)
        break
      case 'maxWidth':
        reactNativeStyles.maxWidth = convertDimension(value)
        break
      case 'maxHeight':
        reactNativeStyles.maxHeight = convertDimension(value)
        break
      
      // Typography
      case 'fontSize':
        reactNativeStyles.fontSize = convertFontSize(value)
        break
      case 'fontFamily':
        reactNativeStyles.fontFamily = value
        break
      case 'fontWeight':
        reactNativeStyles.fontWeight = value
        break
      case 'lineHeight':
        reactNativeStyles.lineHeight = convertLineHeight(value)
        break
      case 'textAlign':
        reactNativeStyles.textAlign = value
        break
      case 'color':
        reactNativeStyles.color = value
        break
      
      // Background
      case 'backgroundColor':
        reactNativeStyles.backgroundColor = value
        break
      
      // Border
      case 'borderRadius':
        reactNativeStyles.borderRadius = convertBorderRadius(value)
        break
      case 'borderWidth':
        reactNativeStyles.borderWidth = convertBorderWidth(value)
        break
      case 'borderColor':
        reactNativeStyles.borderColor = value
        break
      
      // Position
      case 'position':
        if (value === 'absolute' || value === 'relative') {
          reactNativeStyles.position = value
        }
        break
      case 'top':
        reactNativeStyles.top = convertDimension(value)
        break
      case 'right':
        reactNativeStyles.right = convertDimension(value)
        break
      case 'bottom':
        reactNativeStyles.bottom = convertDimension(value)
        break
      case 'left':
        reactNativeStyles.left = convertDimension(value)
        break
      
      // Opacity
      case 'opacity':
        reactNativeStyles.opacity = parseFloat(value)
        break
      
      default:
        // Pass through other properties that might be valid
        if (typeof value === 'string' || typeof value === 'number') {
          reactNativeStyles[key] = value
        }
        break
    }
  })

  return reactNativeStyles
}

// =============================================================================
// CONVERSION HELPER FUNCTIONS
// =============================================================================

function convertSpacing(value: string | number): number {
  if (typeof value === 'number') return value
  
  // Convert rem to approximate pixel values (assuming 16px base)
  if (value.endsWith('rem')) {
    return parseFloat(value) * 16
  }
  
  // Convert px values
  if (value.endsWith('px')) {
    return parseFloat(value)
  }
  
  // Handle spacing tokens
  const spacingKey = value as keyof typeof tokens.spacing
  if (tokens.spacing[spacingKey]) {
    return convertSpacing(tokens.spacing[spacingKey])
  }
  
  return 0
}

function convertDimension(value: string | number): number | string {
  if (typeof value === 'number') return value
  
  // Convert percentage values
  if (value.endsWith('%')) {
    return value
  }
  
  // Convert rem/px values to numbers
  return convertSpacing(value)
}

function convertFontSize(value: string | number): number {
  if (typeof value === 'number') return value
  return convertSpacing(value)
}

function convertLineHeight(value: string | number): number {
  if (typeof value === 'number') return value
  
  // Convert unitless line heights
  const num = parseFloat(value)
  if (!isNaN(num) && value === num.toString()) {
    return num * 16 // Approximate conversion for React Native
  }
  
  return convertSpacing(value)
}

function convertBorderRadius(value: string | number): number {
  if (typeof value === 'number') return value
  return convertSpacing(value)
}

function convertBorderWidth(value: string | number): number {
  if (typeof value === 'number') return value
  return convertSpacing(value)
}

// =============================================================================
// COMPONENT ADAPTERS
// =============================================================================

export interface ReactNativeButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  risk?: RiskLevel
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  style?: any
  testID?: string
}

export function createReactNativeButton(
  TouchableOpacity: any,
  Text: any,
  ActivityIndicator: any,
  View: any
) {
  return function ReactNativeButton({
    title,
    onPress,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    risk,
    leftIcon,
    rightIcon,
    style,
    testID,
  }: ReactNativeButtonProps) {
    const buttonStyles = getReactNativeButtonStyles(variant, size, risk, disabled)
    const textStyles = getReactNativeButtonTextStyles(variant, size, risk, disabled)

    return (
      <TouchableOpacity
        style={[buttonStyles, style]}
        onPress={onPress}
        disabled={disabled || loading}
        testID={testID}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          {loading && (
            <ActivityIndicator
              size="small"
              color={textStyles.color}
              style={{ marginRight: 8 }}
            />
          )}
          {!loading && leftIcon && (
            <View style={{ marginRight: 8 }}>{leftIcon}</View>
          )}
          <Text style={textStyles}>{title}</Text>
          {!loading && rightIcon && (
            <View style={{ marginLeft: 8 }}>{rightIcon}</View>
          )}
        </View>
      </TouchableOpacity>
    )
  }
}

function getReactNativeButtonStyles(
  variant: string,
  size: string,
  risk?: RiskLevel,
  disabled?: boolean
) {
  const baseStyles = {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  }

  // Size styles
  const sizeStyles = {
    sm: { paddingVertical: 6, paddingHorizontal: 12, minHeight: 32 },
    md: { paddingVertical: 10, paddingHorizontal: 16, minHeight: 40 },
    lg: { paddingVertical: 14, paddingHorizontal: 24, minHeight: 48 },
  }

  // Risk-based colors (override variant colors)
  if (risk) {
    const riskColors = {
      safe: tokens.colors.risk.safe[500],
      low: tokens.colors.risk.low[500],
      medium: tokens.colors.risk.medium[500],
      high: tokens.colors.risk.high[500],
      critical: tokens.colors.risk.critical[500],
    }
    
    return {
      ...baseStyles,
      ...sizeStyles[size as keyof typeof sizeStyles],
      backgroundColor: disabled ? tokens.colors.neutral[300] : riskColors[risk],
      opacity: disabled ? 0.5 : 1,
    }
  }

  // Variant styles
  const variantStyles = {
    primary: {
      backgroundColor: disabled ? tokens.colors.neutral[300] : tokens.colors.guardian[500],
    },
    secondary: {
      backgroundColor: disabled ? tokens.colors.neutral[100] : tokens.colors.neutral[100],
      borderWidth: 1,
      borderColor: disabled ? tokens.colors.neutral[300] : tokens.colors.neutral[300],
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: disabled ? tokens.colors.neutral[300] : tokens.colors.guardian[500],
    },
    ghost: {
      backgroundColor: 'transparent',
    },
  }

  return {
    ...baseStyles,
    ...sizeStyles[size as keyof typeof sizeStyles],
    ...variantStyles[variant as keyof typeof variantStyles],
    opacity: disabled ? 0.5 : 1,
  }
}

function getReactNativeButtonTextStyles(
  variant: string,
  size: string,
  risk?: RiskLevel,
  disabled?: boolean
) {
  const baseStyles = {
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  }

  // Size styles
  const sizeStyles = {
    sm: { fontSize: 14 },
    md: { fontSize: 16 },
    lg: { fontSize: 18 },
  }

  // Color based on variant or risk
  let color = tokens.colors.neutral[900]
  
  if (risk || variant === 'primary') {
    color = tokens.colors.neutral[0]
  } else if (variant === 'outline') {
    color = disabled ? tokens.colors.neutral[400] : tokens.colors.guardian[500]
  } else if (variant === 'ghost') {
    color = disabled ? tokens.colors.neutral[400] : tokens.colors.guardian[500]
  }

  return {
    ...baseStyles,
    ...sizeStyles[size as keyof typeof sizeStyles],
    color: disabled && (risk || variant === 'primary') ? tokens.colors.neutral[500] : color,
  }
}

// =============================================================================
// BADGE ADAPTER
// =============================================================================

export interface ReactNativeBadgeProps {
  children: string
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'error'
  size?: 'sm' | 'md' | 'lg'
  risk?: RiskLevel
  style?: any
  testID?: string
}

export function createReactNativeBadge(View: any, Text: any) {
  return function ReactNativeBadge({
    children,
    variant = 'default',
    size = 'md',
    risk,
    style,
    testID,
  }: ReactNativeBadgeProps) {
    const badgeStyles = getReactNativeBadgeStyles(variant, size, risk)
    const textStyles = getReactNativeBadgeTextStyles(variant, size, risk)

    return (
      <View style={[badgeStyles, style]} testID={testID}>
        <Text style={textStyles}>{children}</Text>
      </View>
    )
  }
}

function getReactNativeBadgeStyles(variant: string, size: string, risk?: RiskLevel) {
  const baseStyles = {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  }

  // Size styles
  const sizeStyles = {
    sm: { paddingVertical: 2, paddingHorizontal: 6 },
    md: { paddingVertical: 4, paddingHorizontal: 8 },
    lg: { paddingVertical: 6, paddingHorizontal: 12 },
  }

  // Risk-based colors
  if (risk) {
    const riskColors = {
      safe: tokens.colors.risk.safe[500],
      low: tokens.colors.risk.low[500],
      medium: tokens.colors.risk.medium[500],
      high: tokens.colors.risk.high[500],
      critical: tokens.colors.risk.critical[500],
    }
    
    return {
      ...baseStyles,
      ...sizeStyles[size as keyof typeof sizeStyles],
      backgroundColor: riskColors[risk],
    }
  }

  // Variant styles
  const variantStyles = {
    default: { backgroundColor: tokens.colors.neutral[100] },
    secondary: { backgroundColor: tokens.colors.neutral[200] },
    success: { backgroundColor: tokens.colors.semantic.success },
    warning: { backgroundColor: tokens.colors.semantic.warning },
    error: { backgroundColor: tokens.colors.semantic.error },
  }

  return {
    ...baseStyles,
    ...sizeStyles[size as keyof typeof sizeStyles],
    ...variantStyles[variant as keyof typeof variantStyles],
  }
}

function getReactNativeBadgeTextStyles(variant: string, size: string, risk?: RiskLevel) {
  const baseStyles = {
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  }

  // Size styles
  const sizeStyles = {
    sm: { fontSize: 10 },
    md: { fontSize: 12 },
    lg: { fontSize: 14 },
  }

  // Text color based on background
  let color = tokens.colors.neutral[900]
  
  if (risk || variant === 'success' || variant === 'warning' || variant === 'error') {
    color = tokens.colors.neutral[0]
  }

  return {
    ...baseStyles,
    ...sizeStyles[size as keyof typeof sizeStyles],
    color,
  }
}

// =============================================================================
// THEME ADAPTER
// =============================================================================

export function createReactNativeTheme(theme: any = {}) {
  // Generate brand-consistent theme using the BrandSystem
  const brandTheme = BrandSystem.generateTheme('mobile')
  
  return {
    // Brand colors
    colors: {
      // Primary brand colors
      primary: BRAND_COLORS.guardian[500],
      primaryLight: BRAND_COLORS.guardian[100],
      primaryDark: BRAND_COLORS.guardian[700],
      
      secondary: BRAND_COLORS.sage[500],
      secondaryLight: BRAND_COLORS.sage[100],
      secondaryDark: BRAND_COLORS.sage[700],
      
      // Risk colors
      riskSafe: BRAND_COLORS.sage[500],
      riskLow: BRAND_COLORS.sage[400],
      riskMedium: BRAND_COLORS.alert[500],
      riskHigh: BRAND_COLORS.danger[500],
      riskCritical: BRAND_COLORS.danger[600],
      
      // Semantic colors
      success: BRAND_COLORS.sage[500],
      warning: BRAND_COLORS.alert[500],
      error: BRAND_COLORS.danger[500],
      info: BRAND_COLORS.guardian[500],
      
      // Neutral colors
      text: BRAND_COLORS.neutral[900],
      textSecondary: BRAND_COLORS.neutral[600],
      textMuted: BRAND_COLORS.neutral[500],
      textInverse: BRAND_COLORS.neutral[0],
      
      background: BRAND_COLORS.neutral[0],
      backgroundSecondary: BRAND_COLORS.neutral[50],
      backgroundMuted: BRAND_COLORS.neutral[100],
      
      border: BRAND_COLORS.neutral[200],
      borderLight: BRAND_COLORS.neutral[100],
      borderStrong: BRAND_COLORS.neutral[300],
      
      surface: BRAND_COLORS.neutral[0],
      surfaceSecondary: BRAND_COLORS.neutral[50],
      overlay: 'rgba(0, 0, 0, 0.5)',
      
      // Legacy React Navigation theme support
      card: BRAND_COLORS.neutral[0],
      notification: BRAND_COLORS.danger[500],
    },
    
    // Typography - React Native specific
    typography: {
      fontFamily: {
        regular: 'Inter-Regular',
        medium: 'Inter-Medium',
        semibold: 'Inter-SemiBold',
        bold: 'Inter-Bold',
        mono: 'JetBrainsMono-Regular',
      },
      
      // Text styles
      display: {
        fontFamily: 'Inter-ExtraBold',
        fontSize: 56,
        lineHeight: 56,
        letterSpacing: -0.5,
      },
      h1: {
        fontFamily: 'Inter-Bold',
        fontSize: 32,
        lineHeight: 40,
        letterSpacing: -0.4,
      },
      h2: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 28,
        lineHeight: 36,
        letterSpacing: -0.3,
      },
      h3: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 22,
        lineHeight: 32,
      },
      h4: {
        fontFamily: 'Inter-SemiBold',
        fontSize: 18,
        lineHeight: 28,
      },
      h5: {
        fontFamily: 'Inter-Medium',
        fontSize: 16,
        lineHeight: 28,
      },
      h6: {
        fontFamily: 'Inter-Medium',
        fontSize: 14,
        lineHeight: 24,
      },
      body: {
        fontFamily: 'Inter-Regular',
        fontSize: 16,
        lineHeight: 24,
      },
      bodySmall: {
        fontFamily: 'Inter-Regular',
        fontSize: 14,
        lineHeight: 20,
      },
      caption: {
        fontFamily: 'Inter-Regular',
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 0.5,
      },
      button: {
        fontFamily: 'Inter-Medium',
        fontSize: 14,
        lineHeight: 20,
        letterSpacing: 0.5,
      },
      label: {
        fontFamily: 'Inter-Medium',
        fontSize: 14,
        lineHeight: 20,
      },
    },
    
    // Spacing (React Native uses numbers)
    spacing: {
      0: 0,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
      5: 20,
      6: 24,
      8: 32,
      10: 40,
      12: 48,
      16: 64,
      20: 80,
      24: 96,
      32: 128,
      40: 160,
      48: 192,
      56: 224,
      64: 256,
    },
    
    // Border radius
    borderRadius: {
      none: 0,
      sm: 2,
      base: 4,
      md: 6,
      lg: 8,
      xl: 12,
      '2xl': 16,
      '3xl': 24,
      full: 999,
    },
    
    // Shadows for React Native
    shadows: {
      none: {
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
      },
      sm: {
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
      },
      base: {
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
      },
      md: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 6,
      },
      lg: {
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 15,
        elevation: 15,
      },
      xl: {
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.1,
        shadowRadius: 25,
        elevation: 25,
      },
    },
    
    // Brand messaging for mobile
    messaging: BRAND_MESSAGING,
    
    // Platform-specific configurations
    platform: {
      touchTargetMinSize: 44,
      touchTargetSpacing: 8,
      safeAreaInsets: {
        top: 44,
        bottom: 34,
        left: 0,
        right: 0,
      },
      hapticFeedback: {
        light: 'impactLight',
        medium: 'impactMedium',
        heavy: 'impactHeavy',
        selection: 'selection',
      },
    },
    
    // Legacy support
    dark: theme.isDark || false,
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  convertToReactNativeStyles,
  createReactNativeButton,
  createReactNativeBadge,
  createReactNativeTheme,
}