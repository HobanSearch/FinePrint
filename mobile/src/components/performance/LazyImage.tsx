/**
 * Lazy Image Component
 * Optimized image loading with caching and memory management
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  ViewStyle,
  ImageStyle,
  ActivityIndicator,
  Text,
  Dimensions,
} from 'react-native';
import FastImage, { Source, ResizeMode, Priority } from 'react-native-fast-image';
import { logger } from '../../utils/logger';
import { performanceMonitor } from '../../utils/performance';
import { theme } from '../../constants/theme';

const { width: screenWidth } = Dimensions.get('window');

export interface LazyImageProps {
  source: Source | number;
  style?: ImageStyle;
  containerStyle?: ViewStyle;
  placeholder?: React.ReactNode;
  errorComponent?: React.ReactNode;
  resizeMode?: ResizeMode;
  priority?: Priority;
  cacheKey?: string;
  enableProgressiveLoading?: boolean;
  enableFadeAnimation?: boolean;
  loadingThreshold?: number; // pixels from viewport
  maxWidth?: number;
  maxHeight?: number;
  compressionQuality?: number;
  enableMemoryOptimization?: boolean;
  onLoad?: () => void;
  onError?: (error: any) => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onProgress?: (event: { loaded: number; total: number }) => void;
  testID?: string;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  source,
  style,
  containerStyle,
  placeholder,
  errorComponent,
  resizeMode = FastImage.resizeMode.cover,
  priority = FastImage.priority.normal,
  cacheKey,
  enableProgressiveLoading = true,
  enableFadeAnimation = true,
  loadingThreshold = 50,
  maxWidth = screenWidth,
  maxHeight = screenWidth,
  compressionQuality = 0.8,
  enableMemoryOptimization = true,
  onLoad,
  onError,
  onLoadStart,
  onLoadEnd,
  onProgress,
  testID,
}) => {
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const viewRef = useRef<View>(null);
  const loadStartTime = useRef<number>(0);

  // Intersection observer for lazy loading
  useEffect(() => {
    const checkVisibility = () => {
      if (viewRef.current && !shouldLoad) {
        viewRef.current.measure((x, y, width, height, pageX, pageY) => {
          const screenHeight = Dimensions.get('window').height;
          const isVisible = pageY < screenHeight + loadingThreshold && pageY + height > -loadingThreshold;
          
          if (isVisible) {
            setShouldLoad(true);
          }
        });
      }
    };

    const timer = setInterval(checkVisibility, 100);
    checkVisibility(); // Check immediately

    return () => clearInterval(timer);
  }, [shouldLoad, loadingThreshold]);

  // Optimize image source
  const optimizedSource = useCallback(() => {
    if (typeof source === 'number') {
      return source; // Local image
    }

    const optimized: Source = { ...source };

    // Add cache key if provided
    if (cacheKey) {
      optimized.cache = FastImage.cacheControl.immutable;
    }

    // Optimize dimensions if needed
    if (enableMemoryOptimization && imageSize) {
      const scaleFactor = Math.min(
        maxWidth / imageSize.width,
        maxHeight / imageSize.height,
        1
      );

      if (scaleFactor < 1) {
        optimized.uri = `${optimized.uri}?w=${Math.round(imageSize.width * scaleFactor)}&h=${Math.round(imageSize.height * scaleFactor)}&q=${Math.round(compressionQuality * 100)}`;
      }
    }

    return optimized;
  }, [source, cacheKey, enableMemoryOptimization, imageSize, maxWidth, maxHeight, compressionQuality]);

  // Handle load start
  const handleLoadStart = useCallback(() => {
    setLoadingState('loading');
    setLoadProgress(0);
    loadStartTime.current = Date.now();
    performanceMonitor.startTimer(`image_load_${cacheKey || 'unknown'}`);
    
    if (enableProgressiveLoading) {
      Animated.timing(progressAnim, {
        toValue: 0.1,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }

    onLoadStart?.();
  }, [cacheKey, enableProgressiveLoading, onLoadStart, progressAnim]);

  // Handle load progress
  const handleProgress = useCallback((event: { nativeEvent: { loaded: number; total: number } }) => {
    const { loaded, total } = event.nativeEvent;
    const progress = total > 0 ? loaded / total : 0;
    setLoadProgress(progress);

    if (enableProgressiveLoading) {
      Animated.timing(progressAnim, {
        toValue: 0.1 + (progress * 0.3), // 10% to 40% opacity during loading
        duration: 100,
        useNativeDriver: false,
      }).start();
    }

    onProgress?.({ loaded, total });
  }, [enableProgressiveLoading, onProgress, progressAnim]);

  // Handle successful load
  const handleLoad = useCallback((event: any) => {
    const loadTime = Date.now() - loadStartTime.current;
    performanceMonitor.endTimer(`image_load_${cacheKey || 'unknown'}`);
    
    setLoadingState('loaded');
    setLoadProgress(1);

    // Get image dimensions for optimization
    if (event.nativeEvent) {
      setImageSize({
        width: event.nativeEvent.width,
        height: event.nativeEvent.height,
      });
    }

    // Fade in animation
    if (enableFadeAnimation) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(1);
      progressAnim.setValue(1);
    }

    logger.debug(`Image loaded in ${loadTime}ms:`, { cacheKey, loadTime });
    onLoad?.();
  }, [cacheKey, enableFadeAnimation, fadeAnim, progressAnim, onLoad]);

  // Handle load error
  const handleError = useCallback((error: any) => {
    const loadTime = Date.now() - loadStartTime.current;
    performanceMonitor.endTimer(`image_load_${cacheKey || 'unknown'}`);
    
    setLoadingState('error');
    setLoadProgress(0);

    logger.error(`Image load failed after ${loadTime}ms:`, { cacheKey, error });
    onError?.(error);
  }, [cacheKey, onError]);

  // Handle load end (success or failure)
  const handleLoadEnd = useCallback(() => {
    onLoadEnd?.();
  }, [onLoadEnd]);

  // Render placeholder
  const renderPlaceholder = () => {
    if (placeholder) {
      return placeholder;
    }

    return (
      <View style={styles.placeholderContainer}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        {enableProgressiveLoading && loadProgress > 0 && (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              {Math.round(loadProgress * 100)}%
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill,
                  { width: `${loadProgress * 100}%` }
                ]} 
              />
            </View>
          </View>
        )}
      </View>
    );
  };

  // Render error component
  const renderError = () => {
    if (errorComponent) {
      return errorComponent;
    }

    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load image</Text>
      </View>
    );
  };

  // Calculate container style with aspect ratio if needed
  const getContainerStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      ...styles.container,
      ...containerStyle,
    };

    // Apply aspect ratio if image size is known
    if (imageSize && enableMemoryOptimization) {
      const aspectRatio = imageSize.width / imageSize.height;
      baseStyle.aspectRatio = aspectRatio;
    }

    return baseStyle;
  };

  // Calculate image style
  const getImageStyle = (): ImageStyle => {
    return {
      ...styles.image,
      ...style,
      opacity: enableFadeAnimation ? fadeAnim : 1,
    };
  };

  return (
    <View ref={viewRef} style={getContainerStyle()} testID={testID}>
      {!shouldLoad && renderPlaceholder()}
      
      {shouldLoad && loadingState === 'loading' && renderPlaceholder()}
      
      {shouldLoad && loadingState === 'error' && renderError()}
      
      {shouldLoad && (
        <Animated.View style={{ flex: 1, opacity: enableProgressiveLoading ? progressAnim : 1 }}>
          <FastImage
            source={optimizedSource()}
            style={getImageStyle()}
            resizeMode={resizeMode}
            priority={priority}
            onLoadStart={handleLoadStart}
            onProgress={handleProgress}
            onLoad={handleLoad}
            onError={handleError}
            onLoadEnd={handleLoadEnd}
            testID={`${testID}-image`}
          />
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.error + '20',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 12,
    textAlign: 'center',
  },
  progressContainer: {
    marginTop: 10,
    alignItems: 'center',
    minWidth: 80,
  },
  progressText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 5,
  },
  progressBar: {
    width: 80,
    height: 2,
    backgroundColor: theme.colors.border,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
  },
});