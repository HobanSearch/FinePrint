import React, { useState, useRef } from 'react'
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
  Platform,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated'
import designSystem from '@/design-system'

interface InputProps extends TextInputProps {
  label?: string
  error?: string
  helper?: string
  icon?: React.ReactNode
  rightIcon?: React.ReactNode
  onRightIconPress?: () => void
  variant?: 'default' | 'filled' | 'outlined'
  size?: 'small' | 'medium' | 'large'
}

export default function Input({
  label,
  error,
  helper,
  icon,
  rightIcon,
  onRightIconPress,
  variant = 'outlined',
  size = 'medium',
  style,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const focusAnimation = useSharedValue(0)
  const errorAnimation = useSharedValue(error ? 1 : 0)

  React.useEffect(() => {
    errorAnimation.value = withSpring(error ? 1 : 0, designSystem.animations.spring)
  }, [error])

  const handleFocus = (e: any) => {
    setIsFocused(true)
    focusAnimation.value = withSpring(1, designSystem.animations.spring)
    onFocus?.(e)
  }

  const handleBlur = (e: any) => {
    setIsFocused(false)
    focusAnimation.value = withSpring(0, designSystem.animations.spring)
    onBlur?.(e)
  }

  const animatedContainerStyle = useAnimatedStyle(() => {
    const borderWidth = interpolate(
      focusAnimation.value,
      [0, 1],
      [1, 2],
      Extrapolate.CLAMP
    )

    const borderColor = interpolate(
      errorAnimation.value,
      [0, 1],
      [0, 1],
      Extrapolate.CLAMP
    )

    return {
      borderWidth,
      borderColor: borderColor === 1 
        ? designSystem.colors.semantic.danger 
        : focusAnimation.value === 1 
          ? designSystem.colors.brand.primary
          : designSystem.colors.gray[300],
    }
  })

  const animatedLabelStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      focusAnimation.value,
      [0, 1],
      [1, 0.85],
      Extrapolate.CLAMP
    )

    const translateY = interpolate(
      focusAnimation.value,
      [0, 1],
      [0, -10],
      Extrapolate.CLAMP
    )

    return {
      transform: [
        { scale },
        { translateY },
      ],
    }
  })

  const inputStyles = [
    styles.input,
    styles[`${size}Input`],
    icon && styles.inputWithIcon,
    rightIcon && styles.inputWithRightIcon,
  ]

  const containerStyles = [
    styles.container,
    styles[`${variant}Container`],
    styles[`${size}Container`],
    error && styles.errorContainer,
    style,
  ]

  return (
    <View style={styles.wrapper}>
      {label && (
        <Animated.Text style={[styles.label, animatedLabelStyle]}>
          {label}
        </Animated.Text>
      )}
      
      <Animated.View style={[containerStyles, animatedContainerStyle]}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        
        <TextInput
          ref={inputRef}
          style={inputStyles}
          placeholderTextColor={designSystem.colors.gray[400]}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        
        {rightIcon && (
          <TouchableOpacity
            style={styles.rightIconContainer}
            onPress={onRightIconPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {rightIcon}
          </TouchableOpacity>
        )}
      </Animated.View>
      
      {(error || helper) && (
        <Text style={[styles.helperText, error && styles.errorText]}>
          {error || helper}
        </Text>
      )}
    </View>
  )
}

// Specialized input components
export function SearchInput({
  value,
  onChangeText,
  placeholder = 'Search...',
  onClear,
  ...props
}: InputProps & { onClear?: () => void }) {
  const SearchIcon = () => (
    <Text style={styles.iconText}>🔍</Text>
  )

  const ClearIcon = () => (
    <Text style={styles.iconText}>✕</Text>
  )

  return (
    <Input
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      icon={<SearchIcon />}
      rightIcon={value ? <ClearIcon /> : undefined}
      onRightIconPress={onClear}
      returnKeyType="search"
      {...props}
    />
  )
}

export function PasswordInput({
  value,
  onChangeText,
  placeholder = 'Password',
  ...props
}: InputProps) {
  const [isSecure, setIsSecure] = useState(true)

  const EyeIcon = () => (
    <Text style={styles.iconText}>{isSecure ? '👁' : '👁‍🗨'}</Text>
  )

  return (
    <Input
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      secureTextEntry={isSecure}
      rightIcon={<EyeIcon />}
      onRightIconPress={() => setIsSecure(!isSecure)}
      autoCapitalize="none"
      {...props}
    />
  )
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: designSystem.spacing.md,
  },

  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: designSystem.borderRadius.base,
    overflow: 'hidden',
  },

  // Variants
  defaultContainer: {
    ...designSystem.components.input.base,
  },
  outlinedContainer: {
    ...designSystem.components.input.base,
  },
  filledContainer: {
    ...designSystem.components.input.base,
    backgroundColor: designSystem.colors.gray[50],
    borderWidth: 0,
  },

  // Sizes
  smallContainer: {
    height: 40,
  },
  mediumContainer: {
    height: 48,
  },
  largeContainer: {
    height: 56,
  },

  // Input
  input: {
    flex: 1,
    color: designSystem.colors.gray[900],
    paddingHorizontal: designSystem.spacing.md,
    ...Platform.select({
      ios: {
        paddingVertical: 0,
      },
      android: {
        paddingVertical: designSystem.spacing.xs,
      },
    }),
  },

  smallInput: {
    fontSize: designSystem.typography.body.small.fontSize,
  },
  mediumInput: {
    fontSize: designSystem.typography.body.medium.fontSize,
  },
  largeInput: {
    fontSize: designSystem.typography.body.large.fontSize,
  },

  inputWithIcon: {
    paddingLeft: 0,
  },
  inputWithRightIcon: {
    paddingRight: 0,
  },

  // Icons
  iconContainer: {
    paddingLeft: designSystem.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightIconContainer: {
    paddingRight: designSystem.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 18,
  },

  // Label
  label: {
    ...designSystem.typography.label.medium,
    color: designSystem.colors.gray[700],
    marginBottom: designSystem.spacing.xs,
  },

  // Helper text
  helperText: {
    ...designSystem.typography.label.small,
    color: designSystem.colors.gray[600],
    marginTop: designSystem.spacing.xxs,
    paddingHorizontal: designSystem.spacing.sm,
  },

  // Error states
  errorContainer: {
    borderColor: designSystem.colors.semantic.danger,
  },
  errorText: {
    color: designSystem.colors.semantic.danger,
  },
})