/**
 * Accessible Components
 * WCAG 2.1 AA compliant components with VoiceOver/TalkBack support
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
  AccessibilityInfo,
  AccessibilityRole,
  AccessibilityState,
  AccessibilityActionEvent,
  AccessibilityActionInfo,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../../constants/theme';
import { logger } from '../../utils/logger';

const { width: screenWidth } = Dimensions.get('window');

// Base accessible component props
export interface AccessibleComponentProps {
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  accessibilityElementsHidden?: boolean;
  accessibilityViewIsModal?: boolean;
  accessible?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
  testID?: string;
}

// Enhanced Button with accessibility features
export interface AccessibleButtonProps extends AccessibleComponentProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'text';
  size?: 'small' | 'medium' | 'large';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  enableHaptics?: boolean;
  minimumAccessibleSize?: number;
}

export const AccessibleButton: React.FC<AccessibleButtonProps> = ({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'medium',
  icon,
  iconPosition = 'left',
  fullWidth = false,
  style,
  titleStyle,
  enableHaptics = true,
  minimumAccessibleSize = 44,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityState,
  accessibilityActions,
  onAccessibilityAction,
  testID,
  ...accessibilityProps
}) => {
  const [focused, setFocused] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    if (disabled || loading) return;

    if (enableHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Scale animation for visual feedback
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    onPress();
  }, [disabled, loading, enableHaptics, onPress, scaleAnim]);

  const handleFocus = useCallback(() => {
    setFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setFocused(false);
  }, []);

  // Calculate button styles
  const getButtonStyle = (): ViewStyle => {
    const baseStyle = {
      ...styles.button,
      ...styles[`button${variant.charAt(0).toUpperCase() + variant.slice(1)}`],
      ...styles[`button${size.charAt(0).toUpperCase() + size.slice(1)}`],
    };

    if (disabled) {
      return { ...baseStyle, ...styles.buttonDisabled };
    }

    if (focused) {
      return { ...baseStyle, ...styles.buttonFocused };
    }

    return baseStyle;
  };

  const getTitleStyle = (): TextStyle => {
    const baseStyle = {
      ...styles.buttonTitle,
      ...styles[`buttonTitle${variant.charAt(0).toUpperCase() + variant.slice(1)}`],
      ...styles[`buttonTitle${size.charAt(0).toUpperCase() + size.slice(1)}`],
    };

    if (disabled) {
      return { ...baseStyle, ...styles.buttonTitleDisabled };
    }

    return baseStyle;
  };

  // Ensure minimum accessible size
  const containerStyle: ViewStyle = {
    ...style,
    minWidth: minimumAccessibleSize,
    minHeight: minimumAccessibleSize,
    width: fullWidth ? '100%' : undefined,
  };

  // Enhanced accessibility label
  const getAccessibilityLabel = (): string => {
    if (accessibilityLabel) return accessibilityLabel;
    
    let label = title;
    if (loading) label += ', loading';
    if (disabled) label += ', disabled';
    
    return label;
  };

  // Enhanced accessibility state
  const getAccessibilityState = (): AccessibilityState => {
    return {
      disabled,
      busy: loading,
      ...accessibilityState,
    };
  };

  return (
    <Animated.View style={[containerStyle, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        style={getButtonStyle()}
        onPress={handlePress}
        disabled={disabled || loading}
        onFocus={handleFocus}
        onBlur={handleBlur}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={getAccessibilityLabel()}
        accessibilityHint={accessibilityHint}
        accessibilityState={getAccessibilityState()}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        testID={testID}
        {...accessibilityProps}
      >
        <View style={styles.buttonContent}>
          {icon && iconPosition === 'left' && (
            <View style={styles.buttonIcon}>{icon}</View>
          )}
          <Text style={[getTitleStyle(), titleStyle]} numberOfLines={1}>
            {title}
          </Text>
          {icon && iconPosition === 'right' && (
            <View style={styles.buttonIcon}>{icon}</View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Accessible Text Input with enhanced features
export interface AccessibleTextInputProps extends AccessibleComponentProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  errorMessage?: string;
  multiline?: boolean;
  numberOfLines?: number;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  editable?: boolean;
  maxLength?: number;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  labelStyle?: TextStyle;
  errorStyle?: TextStyle;
  showCharacterCount?: boolean;
  required?: boolean;
}

export const AccessibleTextInput: React.FC<AccessibleTextInputProps> = ({
  value,
  onChangeText,
  placeholder,
  label,
  errorMessage,
  multiline = false,
  numberOfLines = 1,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoCorrect = true,
  editable = true,
  maxLength,
  style,
  inputStyle,
  labelStyle,
  errorStyle,
  showCharacterCount = false,
  required = false,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'text',
  testID,
  ...accessibilityProps
}) => {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<any>(null);

  const handleFocus = useCallback(() => {
    setFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setFocused(false);
  }, []);

  // Generate accessibility label
  const getAccessibilityLabel = (): string => {
    if (accessibilityLabel) return accessibilityLabel;
    
    let label = placeholder || 'Text input';
    if (required) label += ', required';
    if (errorMessage) label += ', invalid';
    
    return label;
  };

  // Generate accessibility hint
  const getAccessibilityHint = (): string => {
    if (accessibilityHint) return accessibilityHint;
    
    let hint = '';
    if (maxLength) hint += `Maximum ${maxLength} characters. `;
    if (errorMessage) hint += `Error: ${errorMessage}`;
    
    return hint.trim();
  };

  const containerStyle: ViewStyle = {
    ...styles.textInputContainer,
    ...style,
  };

  const inputContainerStyle: ViewStyle = {
    ...styles.textInputWrapper,
    ...(focused && styles.textInputWrapperFocused),
    ...(errorMessage && styles.textInputWrapperError),
    ...(editable === false && styles.textInputWrapperDisabled),
  };

  return (
    <View style={containerStyle}>
      {label && (
        <Text
          style={[styles.textInputLabel, labelStyle]}
          accessibilityRole="text"
          accessibilityLabel={`${label}${required ? ', required' : ''}`}
        >
          {label}
          {required && <Text style={styles.requiredAsterisk}>*</Text>}
        </Text>
      )}
      
      <View style={inputContainerStyle}>
        <TextInput
          ref={inputRef}
          style={[styles.textInput, inputStyle]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines : 1}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          editable={editable}
          maxLength={maxLength}
          onFocus={handleFocus}
          onBlur={handleBlur}
          accessibilityRole={accessibilityRole}
          accessibilityLabel={getAccessibilityLabel()}
          accessibilityHint={getAccessibilityHint()}
          testID={testID}
          {...accessibilityProps}
        />
      </View>

      <View style={styles.textInputFooter}>
        {errorMessage && (
          <Text
            style={[styles.textInputError, errorStyle]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {errorMessage}
          </Text>
        )}
        
        {showCharacterCount && maxLength && (
          <Text
            style={styles.characterCount}
            accessibilityLabel={`${value.length} of ${maxLength} characters used`}
          >
            {value.length}/{maxLength}
          </Text>
        )}
      </View>
    </View>
  );
};

// Accessible Card component
export interface AccessibleCardProps extends AccessibleComponentProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onPress?: () => void;
  elevated?: boolean;
  variant?: 'default' | 'outlined' | 'filled';
  style?: ViewStyle;
  titleStyle?: TextStyle;
  subtitleStyle?: TextStyle;
  enableHaptics?: boolean;
}

export const AccessibleCard: React.FC<AccessibleCardProps> = ({
  children,
  title,
  subtitle,
  onPress,
  elevated = true,
  variant = 'default',
  style,
  titleStyle,
  subtitleStyle,
  enableHaptics = true,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  testID,
  ...accessibilityProps
}) => {
  const [focused, setFocused] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    if (!onPress) return;

    if (enableHaptics) {
      Haptics.selectionAsync();
    }

    // Subtle scale animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.98,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    onPress();
  }, [onPress, enableHaptics, scaleAnim]);

  const getCardStyle = (): ViewStyle => {
    const baseStyle = {
      ...styles.card,
      ...styles[`card${variant.charAt(0).toUpperCase() + variant.slice(1)}`],
    };

    if (elevated) {
      return { ...baseStyle, ...styles.cardElevated };
    }

    if (focused && onPress) {
      return { ...baseStyle, ...styles.cardFocused };
    }

    return baseStyle;
  };

  const getAccessibilityLabel = (): string => {
    if (accessibilityLabel) return accessibilityLabel;
    
    let label = '';
    if (title) label += title;
    if (subtitle) label += `, ${subtitle}`;
    
    return label || 'Card';
  };

  const CardContent = (
    <Animated.View style={[getCardStyle(), style, { transform: [{ scale: scaleAnim }] }]}>
      {(title || subtitle) && (
        <View style={styles.cardHeader}>
          {title && (
            <Text style={[styles.cardTitle, titleStyle]} numberOfLines={2}>
              {title}
            </Text>
          )}
          {subtitle && (
            <Text style={[styles.cardSubtitle, subtitleStyle]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      )}
      
      <View style={styles.cardContent}>
        {children}
      </View>
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityRole={accessibilityRole || 'button'}
        accessibilityLabel={getAccessibilityLabel()}
        accessibilityHint={accessibilityHint}
        testID={testID}
        {...accessibilityProps}
      >
        {CardContent}
      </TouchableOpacity>
    );
  }

  return (
    <View
      accessibilityRole={accessibilityRole || 'text'}
      accessibilityLabel={getAccessibilityLabel()}
      testID={testID}
      {...accessibilityProps}
    >
      {CardContent}
    </View>
  );
};

// Accessible Progress Bar
export interface AccessibleProgressBarProps extends AccessibleComponentProps {
  progress: number; // 0-1
  showPercentage?: boolean;
  animated?: boolean;
  color?: string;
  backgroundColor?: string;
  height?: number;
  style?: ViewStyle;
  labelStyle?: TextStyle;
}

export const AccessibleProgressBar: React.FC<AccessibleProgressBarProps> = ({
  progress,
  showPercentage = true,
  animated = true,
  color = theme.colors.primary,
  backgroundColor = theme.colors.border,
  height = 8,
  style,
  labelStyle,
  accessibilityLabel,
  accessibilityHint,
  testID,
  ...accessibilityProps
}) => {
  const progressAnim = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    if (animated) {
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      progressAnim.setValue(progress);
    }
  }, [progress, animated, progressAnim]);

  const percentage = Math.round(progress * 100);
  
  const getAccessibilityLabel = (): string => {
    if (accessibilityLabel) return accessibilityLabel;
    return `Progress ${percentage} percent`;
  };

  return (
    <View style={[styles.progressContainer, style]}>
      {showPercentage && (
        <Text
          style={[styles.progressLabel, labelStyle]}
          accessibilityRole="text"
        >
          {percentage}%
        </Text>
      )}
      
      <View
        style={[styles.progressTrack, { height, backgroundColor }]}
        accessibilityRole="progressbar"
        accessibilityLabel={getAccessibilityLabel()}
        accessibilityHint={accessibilityHint}
        accessibilityValue={{ min: 0, max: 100, now: percentage }}
        testID={testID}
        {...accessibilityProps}
      >
        <Animated.View
          style={[
            styles.progressFill,
            {
              height,
              backgroundColor: color,
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
      </View>
    </View>
  );
};

// High contrast mode support
export const useHighContrastMode = () => {
  const [isHighContrastEnabled, setIsHighContrastEnabled] = useState(false);

  useEffect(() => {
    const checkHighContrast = async () => {
      try {
        const isEnabled = await AccessibilityInfo.isHighTextContrastEnabled();
        setIsHighContrastEnabled(isEnabled);
      } catch (error) {
        logger.error('Failed to check high contrast mode:', error);
      }
    };

    checkHighContrast();

    const subscription = AccessibilityInfo.addEventListener(
      'highTextContrastChanged',
      setIsHighContrastEnabled
    );

    return () => {
      subscription?.remove();
    };
  }, []);

  return isHighContrastEnabled;
};

// Screen reader support
export const useScreenReader = () => {
  const [isScreenReaderEnabled, setIsScreenReaderEnabled] = useState(false);

  useEffect(() => {
    const checkScreenReader = async () => {
      try {
        const isEnabled = await AccessibilityInfo.isScreenReaderEnabled();
        setIsScreenReaderEnabled(isEnabled);
      } catch (error) {
        logger.error('Failed to check screen reader status:', error);
      }
    };

    checkScreenReader();

    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setIsScreenReaderEnabled
    );

    return () => {
      subscription?.remove();
    };
  }, []);

  return isScreenReaderEnabled;
};

// Announce to screen reader
export const announceToScreenReader = (message: string) => {
  AccessibilityInfo.announceForAccessibility(message);
};

const styles = StyleSheet.create({
  // Button styles
  button: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  buttonSecondary: {
    backgroundColor: theme.colors.secondary,
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  buttonText: {
    backgroundColor: 'transparent',
  },
  buttonSmall: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 32,
  },
  buttonMedium: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  buttonLarge: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    minHeight: 56,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.disabled,
    opacity: 0.6,
  },
  buttonFocused: {
    borderWidth: 2,
    borderColor: theme.colors.focus,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginHorizontal: 4,
  },
  buttonTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonTitlePrimary: {
    color: theme.colors.onPrimary,
  },
  buttonTitleSecondary: {
    color: theme.colors.onSecondary,
  },
  buttonTitleOutline: {
    color: theme.colors.primary,
  },
  buttonTitleText: {
    color: theme.colors.primary,
  },
  buttonTitleSmall: {
    fontSize: 14,
  },
  buttonTitleMedium: {
    fontSize: 16,
  },
  buttonTitleLarge: {
    fontSize: 18,
  },
  buttonTitleDisabled: {
    color: theme.colors.onDisabled,
  },

  // Text Input styles
  textInputContainer: {
    marginVertical: 8,
  },
  textInputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  requiredAsterisk: {
    color: theme.colors.error,
  },
  textInputWrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    minHeight: 44,
  },
  textInputWrapperFocused: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  textInputWrapperError: {
    borderColor: theme.colors.error,
  },
  textInputWrapperDisabled: {
    backgroundColor: theme.colors.disabled,
    opacity: 0.6,
  },
  textInput: {
    fontSize: 16,
    color: theme.colors.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  textInputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  textInputError: {
    fontSize: 14,
    color: theme.colors.error,
    flex: 1,
  },
  characterCount: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },

  // Card styles
  card: {
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    padding: 16,
    marginVertical: 4,
  },
  cardDefault: {
    backgroundColor: theme.colors.surface,
  },
  cardOutlined: {
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardFilled: {
    backgroundColor: theme.colors.primary + '10',
  },
  cardElevated: {
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
  cardFocused: {
    borderWidth: 2,
    borderColor: theme.colors.focus,
  },
  cardHeader: {
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  cardContent: {
    flex: 1,
  },

  // Progress Bar styles
  progressContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  progressTrack: {
    width: '100%',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 4,
  },
});

// Re-import TextInput from react-native for the text input component
import { TextInput } from 'react-native';