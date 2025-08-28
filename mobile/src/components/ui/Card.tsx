import React from 'react'
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ViewProps,
  TouchableOpacityProps,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import designSystem from '@/design-system'

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity)

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'outlined' | 'interactive'
  padding?: 'none' | 'small' | 'medium' | 'large'
  onPress?: () => void
  hapticFeedback?: boolean
  children: React.ReactNode
}

export default function Card({
  variant = 'default',
  padding = 'medium',
  onPress,
  hapticFeedback = true,
  style,
  children,
  ...props
}: CardProps) {
  const scale = useSharedValue(1)
  const elevation = useSharedValue(variant === 'elevated' ? 1 : 0)

  const animatedStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(
      elevation.value,
      [0, 1],
      [0.05, 0.15],
      Extrapolate.CLAMP
    )

    const shadowRadius = interpolate(
      elevation.value,
      [0, 1],
      [2, 8],
      Extrapolate.CLAMP
    )

    return {
      transform: [{ scale: scale.value }],
      shadowOpacity,
      shadowRadius,
    }
  })

  const handlePressIn = () => {
    scale.value = withSpring(0.98, designSystem.animations.spring)
    if (variant === 'interactive') {
      elevation.value = withSpring(0.5, designSystem.animations.spring)
    }
  }

  const handlePressOut = () => {
    scale.value = withSpring(1, designSystem.animations.spring)
    if (variant === 'interactive') {
      elevation.value = withSpring(1, designSystem.animations.spring)
    }
  }

  const handlePress = () => {
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
    onPress?.()
  }

  const cardStyles = [
    styles.base,
    styles[variant],
    styles[`${padding}Padding`],
    style,
  ]

  if (onPress) {
    return (
      <AnimatedTouchable
        {...props}
        style={[cardStyles, animatedStyle]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        accessibilityRole="button"
      >
        {children}
      </AnimatedTouchable>
    )
  }

  return (
    <Animated.View {...props} style={[cardStyles, animatedStyle]}>
      {children}
    </Animated.View>
  )
}

// Specialized card variants
export function DocumentCard({
  title,
  subtitle,
  status,
  privacyScore,
  onPress,
  style,
}: {
  title: string
  subtitle?: string
  status?: 'pending' | 'analyzing' | 'complete' | 'error'
  privacyScore?: number
  onPress?: () => void
  style?: any
}) {
  const getStatusColor = () => {
    switch (status) {
      case 'pending':
        return designSystem.colors.brand.muted
      case 'analyzing':
        return designSystem.colors.analysis.processing
      case 'complete':
        return designSystem.colors.analysis.complete
      case 'error':
        return designSystem.colors.analysis.error
      default:
        return designSystem.colors.brand.muted
    }
  }

  return (
    <Card variant="interactive" onPress={onPress} style={[styles.documentCard, style]}>
      <View style={styles.documentHeader}>
        <View style={styles.documentInfo}>
          <Text style={styles.documentTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={styles.documentSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {status && (
          <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
        )}
      </View>
      {privacyScore !== undefined && (
        <PrivacyScoreBadge score={privacyScore} style={styles.privacyScore} />
      )}
    </Card>
  )
}

export function PrivacyScoreBadge({
  score,
  size = 'medium',
  style,
}: {
  score: number
  size?: 'small' | 'medium' | 'large'
  style?: any
}) {
  const color = designSystem.components.privacyScore.getColor(score)
  const label = designSystem.components.privacyScore.getLabel(score)

  return (
    <View style={[styles.privacyBadge, styles[`${size}Badge`], { backgroundColor: color + '20' }, style]}>
      <Text style={[styles.privacyScore, styles[`${size}Score`], { color }]}>
        {score}
      </Text>
      <Text style={[styles.privacyLabel, styles[`${size}Label`], { color }]}>
        {label}
      </Text>
    </View>
  )
}

const Text = require('react-native').Text

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#ffffff',
    borderRadius: designSystem.components.card.base.borderRadius,
    overflow: 'hidden',
  },

  // Variants
  default: {
    ...designSystem.components.card.base,
  },
  elevated: {
    ...designSystem.components.card.base,
    ...designSystem.elevation.medium,
  },
  outlined: {
    ...designSystem.components.card.base,
    borderWidth: 1,
    borderColor: designSystem.colors.gray[200],
    shadowOpacity: 0,
    elevation: 0,
  },
  interactive: {
    ...designSystem.components.card.interactive,
  },

  // Padding
  nonePadding: {
    padding: 0,
  },
  smallPadding: {
    padding: designSystem.spacing.sm,
  },
  mediumPadding: {
    padding: designSystem.spacing.md,
  },
  largePadding: {
    padding: designSystem.spacing.lg,
  },

  // Document Card
  documentCard: {
    marginBottom: designSystem.spacing.sm,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  documentInfo: {
    flex: 1,
    marginRight: designSystem.spacing.sm,
  },
  documentTitle: {
    ...designSystem.typography.heading.h4,
    color: designSystem.colors.gray[900],
    marginBottom: designSystem.spacing.xxs,
  },
  documentSubtitle: {
    ...designSystem.typography.body.small,
    color: designSystem.colors.gray[600],
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Privacy Score Badge
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: designSystem.spacing.sm,
    paddingVertical: designSystem.spacing.xxs,
    borderRadius: designSystem.borderRadius.full,
    marginTop: designSystem.spacing.sm,
  },
  privacyScore: {
    fontWeight: '700',
    marginRight: designSystem.spacing.xxs,
  },
  privacyLabel: {
    fontWeight: '500',
  },

  // Badge sizes
  smallBadge: {
    paddingHorizontal: designSystem.spacing.xs,
    paddingVertical: 2,
  },
  mediumBadge: {
    paddingHorizontal: designSystem.spacing.sm,
    paddingVertical: designSystem.spacing.xxs,
  },
  largeBadge: {
    paddingHorizontal: designSystem.spacing.md,
    paddingVertical: designSystem.spacing.xs,
  },

  smallScore: {
    fontSize: designSystem.typography.label.small.fontSize,
  },
  mediumScore: {
    fontSize: designSystem.typography.label.medium.fontSize,
  },
  largeScore: {
    fontSize: designSystem.typography.label.large.fontSize,
  },

  smallLabel: {
    fontSize: designSystem.typography.label.small.fontSize,
  },
  mediumLabel: {
    fontSize: designSystem.typography.label.small.fontSize,
  },
  largeLabel: {
    fontSize: designSystem.typography.label.medium.fontSize,
  },
})