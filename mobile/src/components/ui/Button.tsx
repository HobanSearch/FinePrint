import React from 'react'
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacityProps,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import designSystem from '@/design-system'

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity)

interface ButtonProps extends TouchableOpacityProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'small' | 'medium' | 'large'
  loading?: boolean
  fullWidth?: boolean
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  children: React.ReactNode
  hapticFeedback?: boolean
}

export default function Button({
  variant = 'primary',
  size = 'medium',
  loading = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  children,
  hapticFeedback = true,
  disabled,
  onPress,
  style,
  ...props
}: ButtonProps) {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  const handlePressIn = () => {
    scale.value = withSpring(0.95, designSystem.animations.spring)
    opacity.value = withSpring(0.8, designSystem.animations.spring)
  }

  const handlePressOut = () => {
    scale.value = withSpring(1, designSystem.animations.spring)
    opacity.value = withSpring(1, designSystem.animations.spring)
  }

  const handlePress = (event: any) => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
    onPress?.(event)
  }

  const isDisabled = disabled || loading

  const buttonStyles = [
    styles.base,
    styles[variant],
    styles[`${size}Size`],
    fullWidth && styles.fullWidth,
    isDisabled && styles.disabled,
    isDisabled && styles[`${variant}Disabled`],
    style,
  ]

  const textStyles = [
    styles.text,
    styles[`${variant}Text`],
    styles[`${size}Text`],
    isDisabled && styles.disabledText,
  ]

  const content = (
    <>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#ffffff' : designSystem.colors.brand.primary}
        />
      ) : (
        <View style={styles.contentContainer}>
          {icon && iconPosition === 'left' && (
            <View style={[styles.iconContainer, styles.iconLeft]}>{icon}</View>
          )}
          <Text style={textStyles}>{children}</Text>
          {icon && iconPosition === 'right' && (
            <View style={[styles.iconContainer, styles.iconRight]}>{icon}</View>
          )}
        </View>
      )}
    </>
  )

  return (
    <AnimatedTouchable
      {...props}
      style={[buttonStyles, animatedStyle]}
      disabled={isDisabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {content}
    </AnimatedTouchable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: designSystem.accessibility.minTouchTarget,
  },

  // Variants
  primary: designSystem.components.button.primary,
  secondary: designSystem.components.button.secondary,
  ghost: designSystem.components.button.ghost,
  danger: designSystem.components.button.danger,

  // Sizes
  smallSize: {
    paddingHorizontal: designSystem.spacing.md,
    paddingVertical: designSystem.spacing.xs,
    minHeight: 36,
  },
  mediumSize: {
    paddingHorizontal: designSystem.spacing.lg,
    paddingVertical: designSystem.spacing.sm,
    minHeight: 44,
  },
  largeSize: {
    paddingHorizontal: designSystem.spacing.xl,
    paddingVertical: designSystem.spacing.md,
    minHeight: 52,
  },

  // States
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  primaryDisabled: {
    backgroundColor: designSystem.colors.brand.muted,
  },
  secondaryDisabled: {
    borderColor: designSystem.colors.brand.muted,
  },
  ghostDisabled: {},
  dangerDisabled: {
    backgroundColor: designSystem.colors.semantic.danger + '40',
  },

  // Text styles
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryText: {
    color: '#ffffff',
  },
  secondaryText: {
    color: designSystem.colors.brand.primary,
  },
  ghostText: {
    color: designSystem.colors.brand.primary,
  },
  dangerText: {
    color: '#ffffff',
  },
  disabledText: {
    color: designSystem.colors.brand.muted,
  },

  // Text sizes
  smallText: {
    fontSize: designSystem.typography.label.medium.fontSize,
    lineHeight: designSystem.typography.label.medium.lineHeight,
  },
  mediumText: {
    fontSize: designSystem.typography.label.large.fontSize,
    lineHeight: designSystem.typography.label.large.lineHeight,
  },
  largeText: {
    fontSize: designSystem.typography.body.large.fontSize,
    lineHeight: designSystem.typography.body.large.lineHeight,
  },

  // Content
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconLeft: {
    marginRight: designSystem.spacing.xs,
  },
  iconRight: {
    marginLeft: designSystem.spacing.xs,
  },
})