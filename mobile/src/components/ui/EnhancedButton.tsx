/**
 * Fine Print AI - Enhanced Button Component
 * 
 * Button component with integrated brand consistency, haptic feedback,
 * and native platform optimizations
 */

import React, { useCallback, useMemo } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Platform,
} from 'react-native';
import { useBrandConsistency } from '../../../frontend/src/design-system/hooks/useBrandConsistency';
import HapticFeedbackService from '../../services/HapticFeedbackService';
import { logger } from '../../utils/logger';

export interface EnhancedButtonProps {
  title: string;
  onPress: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  hapticType?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';
  testID?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  riskLevel?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  animationDisabled?: boolean;
}

const EnhancedButton: React.FC<EnhancedButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  hapticType,
  testID,
  style,
  textStyle,
  riskLevel,
  animationDisabled = false,
}) => {
  const { theme, getColor, getTypography, getRiskStyling } = useBrandConsistency({
    platform: 'mobile',
  });

  const hapticService = HapticFeedbackService.getInstance();

  // Generate button styles based on variant, size, and risk level
  const buttonStyles = useMemo(() => {
    const baseStyles: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      minHeight: 44, // Minimum touch target
    };

    // Size adjustments
    const sizeStyles: Record<string, Partial<ViewStyle>> = {
      small: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        minHeight: 32,
        borderRadius: 6,
      },
      medium: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 44,
        borderRadius: 8,
      },
      large: {
        paddingHorizontal: 24,
        paddingVertical: 16,
        minHeight: 52,
        borderRadius: 10,
      },
      xlarge: {
        paddingHorizontal: 32,
        paddingVertical: 20,
        minHeight: 60,
        borderRadius: 12,
      },
    };

    // Risk-based styling override
    if (riskLevel) {
      const riskStyling = getRiskStyling(riskLevel, 'background');
      return {
        ...baseStyles,
        ...sizeStyles[size],
        backgroundColor: riskStyling.backgroundColor,
        borderColor: riskStyling.borderColor,
        borderWidth: 1,
        ...(fullWidth && { width: '100%' }),
        ...(disabled && { opacity: 0.5 }),
      };
    }

    // Variant-based styling
    const variantStyles: Record<string, Partial<ViewStyle>> = {
      primary: {
        backgroundColor: getColor('guardian', 500),
        borderWidth: 0,
      },
      secondary: {
        backgroundColor: getColor('sage', 500),
        borderWidth: 0,
      },
      outline: {
        backgroundColor: 'transparent',
        borderColor: getColor('guardian', 500),
        borderWidth: 1.5,
      },
      ghost: {
        backgroundColor: 'transparent',
        borderWidth: 0,
      },
      danger: {
        backgroundColor: getColor('danger', 500),
        borderWidth: 0,
      },
    };

    return {
      ...baseStyles,
      ...sizeStyles[size],
      ...variantStyles[variant],
      ...(fullWidth && { width: '100%' }),
      ...(disabled && { opacity: 0.5 }),
    };
  }, [variant, size, riskLevel, fullWidth, disabled, getColor, getRiskStyling]);

  // Generate text styles
  const textStyles = useMemo(() => {
    const typography = getTypography('button');
    
    const baseTextStyles: TextStyle = {
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    };

    // Size-based text adjustments
    const sizeTextStyles: Record<string, Partial<TextStyle>> = {
      small: { fontSize: 14 },
      medium: { fontSize: 16 },
      large: { fontSize: 18 },
      xlarge: { fontSize: 20 },
    };

    // Risk-based text color
    if (riskLevel) {
      const riskStyling = getRiskStyling(riskLevel, 'text');
      return {
        ...baseTextStyles,
        ...sizeTextStyles[size],
        color: riskStyling.color,
        fontFamily: typography.fontFamily || 'Inter-Medium',
      };
    }

    // Variant-based text color
    const variantTextStyles: Record<string, Partial<TextStyle>> = {
      primary: { color: getColor('neutral', 0) },
      secondary: { color: getColor('neutral', 0) },
      outline: { color: getColor('guardian', 500) },
      ghost: { color: getColor('guardian', 500) },
      danger: { color: getColor('neutral', 0) },
    };

    return {
      ...baseTextStyles,
      ...sizeTextStyles[size],
      ...variantTextStyles[variant],
      fontFamily: typography.fontFamily || 'Inter-Medium',
    };
  }, [variant, size, riskLevel, getColor, getTypography, getRiskStyling]);

  // Handle button press with haptic feedback
  const handlePress = useCallback(async () => {
    if (disabled || loading) {
      return;
    }

    try {
      // Provide haptic feedback
      if (hapticService.isHapticEnabled()) {
        if (hapticType) {
          await hapticService.trigger(hapticType);
        } else {
          // Default haptic based on variant
          const hapticMap: Record<string, Parameters<typeof hapticService.trigger>[0]> = {
            primary: 'impactMedium',
            secondary: 'impactLight',
            outline: 'selection',
            ghost: 'selection',
            danger: 'error',
          };
          await hapticService.trigger(hapticMap[variant] || 'impactLight');
        }
      }

      // Execute the onPress handler
      await onPress();
    } catch (error) {
      logger.error('Button press error:', error);
      
      // Provide error haptic feedback
      if (hapticService.isHapticEnabled()) {
        await hapticService.errorOccurred('minor');
      }
    }
  }, [disabled, loading, hapticType, variant, onPress, hapticService]);

  return (
    <TouchableOpacity
      style={[buttonStyles, style]}
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={animationDisabled ? 1 : 0.8}
      testID={testID}
      accessible={true}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{
        disabled: disabled || loading,
        busy: loading,
      }}
    >
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="small"
            color={
              variant === 'outline' || variant === 'ghost'
                ? getColor('guardian', 500)
                : getColor('neutral', 0)
            }
            style={styles.loadingIndicator}
          />
          <Text style={[textStyles, textStyle, styles.loadingText]}>
            Processing...
          </Text>
        </View>
      ) : (
        <>
          {leftIcon && (
            <View style={[styles.iconContainer, styles.leftIcon]}>
              {leftIcon}
            </View>
          )}
          
          <Text style={[textStyles, textStyle]} numberOfLines={1}>
            {title}
          </Text>
          
          {rightIcon && (
            <View style={[styles.iconContainer, styles.rightIcon]}>
              {rightIcon}
            </View>
          )}
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingIndicator: {
    marginRight: 8,
  },
  loadingText: {
    opacity: 0.8,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftIcon: {
    marginRight: 8,
  },
  rightIcon: {
    marginLeft: 8,
  },
});

export default EnhancedButton;