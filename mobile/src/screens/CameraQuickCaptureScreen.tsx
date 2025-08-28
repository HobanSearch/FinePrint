/**
 * Fine Print AI - Camera Quick Capture Screen
 * 
 * Optimized camera interface for quick document capture with native integrations
 * Includes Live Activities, haptic feedback, and brand-consistent UI
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { Camera, CameraType, FlashMode } from 'expo-camera';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { DocumentScanner, ScanResult } from '../components/camera/DocumentScanner';
import { useBrandConsistency } from '../../frontend/src/design-system/hooks/useBrandConsistency';
import NativeIntegrationService from '../services/NativeIntegrationService';
import HapticFeedbackService from '../services/HapticFeedbackService';
import EnhancedButton from '../components/ui/EnhancedButton';
import { logger } from '../utils/logger';

interface CameraQuickCaptureScreenProps {
  navigation: any;
  route?: {
    params?: {
      mode?: 'single' | 'multi' | 'batch';
      maxPages?: number;
      returnTo?: string;
    };
  };
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const CameraQuickCaptureScreen: React.FC<CameraQuickCaptureScreenProps> = ({
  navigation,
  route,
}) => {
  const params = route?.params;
  const captureMode = params?.mode || 'single';
  const maxPages = params?.maxPages || (captureMode === 'single' ? 1 : 10);
  const returnScreen = params?.returnTo || 'Dashboard';

  // State
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);

  // Services
  const { theme, getColor } = useBrandConsistency({ platform: 'mobile' });
  const nativeService = NativeIntegrationService.getInstance();
  const hapticService = HapticFeedbackService.getInstance();

  // Animations
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Initialize camera permissions and native services
  useFocusEffect(
    useCallback(() => {
      initializeCamera();
      return () => {
        // Cleanup when screen loses focus
        setShowScanner(false);
      };
    }, [])
  );

  const initializeCamera = async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      
      if (status === 'granted') {
        setShowScanner(true);
        animateOverlay(true);
      } else {
        Alert.alert(
          'Camera Permission Required',
          'Please enable camera access to scan documents.',
          [
            { text: 'Cancel', onPress: () => navigation.goBack() },
            { text: 'Settings', onPress: () => {} }, // Could open settings
          ]
        );
      }
    } catch (error) {
      logger.error('Failed to initialize camera:', error);
      Alert.alert('Error', 'Failed to initialize camera');
    }
  };

  const animateOverlay = (show: boolean) => {
    Animated.timing(overlayOpacity, {
      toValue: show ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const animateButton = () => {
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Handle document scan completion
  const handleScanComplete = useCallback(async (results: ScanResult[]) => {
    try {
      setIsProcessing(true);
      setCapturedCount(results.length);

      // Provide success haptic feedback
      await hapticService.trigger('success');

      logger.info(`Captured ${results.length} document pages`);

      // Start analysis with native integration
      if (results.length > 0) {
        const analysisId = await nativeService.startDocumentAnalysis(
          `quick_capture_${Date.now()}`,
          `Quick Capture (${results.length} pages)`,
          30000 // 30 second estimated duration
        );

        // Navigate to processing screen or directly to results
        if (captureMode === 'single' && returnScreen === 'Dashboard') {
          // For single document mode, go directly to analysis
          navigation.replace('AnalysisProgress', {
            analysisId,
            documents: results,
            mode: 'quick_capture',
          });
        } else {
          // For batch mode or custom return, show results
          navigation.navigate('CaptureReview', {
            results,
            analysisId,
            returnTo: returnScreen,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to process scan results:', error);
      await hapticService.errorOccurred('major');
      
      Alert.alert(
        'Processing Error',
        'Failed to process captured documents. Please try again.',
        [{ text: 'OK', onPress: () => setIsProcessing(false) }]
      );
    }
  }, [captureMode, returnScreen, navigation, hapticService, nativeService]);

  // Handle scan cancellation
  const handleScanCancel = useCallback(async () => {
    await hapticService.buttonPressed('secondary');
    animateOverlay(false);
    
    setTimeout(() => {
      navigation.goBack();
    }, 300);
  }, [navigation, hapticService]);

  // Handle camera permission denial
  if (hasPermission === false) {
    return (
      <SafeAreaView style={[styles.container, styles.permissionContainer]}>
        <StatusBar barStyle="light-content" backgroundColor="black" />
        <View style={styles.permissionContent}>
          <Ionicons 
            name="camera-outline" 
            size={64} 
            color={getColor('neutral', 400)} 
            style={styles.permissionIcon}
          />
          <Text style={[styles.permissionTitle, { color: getColor('neutral', 100) }]}>
            Camera Access Required
          </Text>
          <Text style={[styles.permissionMessage, { color: getColor('neutral', 400) }]}>
            Fine Print AI needs camera access to scan and analyze documents
          </Text>
          
          <View style={styles.permissionButtons}>
            <EnhancedButton
              title="Go Back"
              variant="outline"
              onPress={() => navigation.goBack()}
              style={styles.permissionButton}
            />
            <EnhancedButton
              title="Grant Permission"
              variant="primary"
              onPress={initializeCamera}
              style={styles.permissionButton}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Show loading while checking permissions
  if (hasPermission === null) {
    return (
      <SafeAreaView style={[styles.container, styles.loadingContainer]}>
        <StatusBar barStyle="light-content" backgroundColor="black" />
        <Text style={[styles.loadingText, { color: getColor('neutral', 100) }]}>
          Initializing camera...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="black" />
      
      {/* Camera Scanner */}
      {showScanner && (
        <DocumentScanner
          onScanComplete={handleScanComplete}
          onCancel={handleScanCancel}
          maxPages={maxPages}
          enableAutoCapture={captureMode === 'single'}
          enableEdgeDetection={true}
          enablePerspectiveCorrection={true}
          enableImageEnhancement={true}
          showGuideOverlay={true}
        />
      )}

      {/* Mode Indicator Overlay */}
      <Animated.View 
        style={[
          styles.modeIndicator,
          { opacity: overlayOpacity }
        ]}
      >
        <View style={[styles.modeCard, { backgroundColor: getColor('neutral', 900, 'mobile') + 'E6' }]}>
          <MaterialIcons 
            name={captureMode === 'single' ? 'camera-alt' : 'burst-mode'} 
            size={20} 
            color={getColor('guardian', 400)} 
          />
          <Text style={[styles.modeText, { color: getColor('neutral', 100) }]}>
            {captureMode === 'single' ? 'Single Document' : `Batch Mode (${maxPages} max)`}
          </Text>
          {capturedCount > 0 && (
            <Text style={[styles.captureCount, { color: getColor('sage', 400) }]}>
              {capturedCount} captured
            </Text>
          )}
        </View>
      </Animated.View>

      {/* Processing Overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <View style={[styles.processingCard, { backgroundColor: getColor('neutral', 900) }]}>
            <MaterialIcons 
              name="hourglass-empty" 
              size={32} 
              color={getColor('guardian', 500)} 
            />
            <Text style={[styles.processingTitle, { color: getColor('neutral', 100) }]}>
              Processing Documents
            </Text>
            <Text style={[styles.processingMessage, { color: getColor('neutral', 400) }]}>
              Preparing {capturedCount} document{capturedCount !== 1 ? 's' : ''} for analysis...
            </Text>
          </View>
        </View>
      )}

      {/* Quick Action Buttons (shown when not in single mode) */}
      {captureMode !== 'single' && !isProcessing && (
        <Animated.View 
          style={[
            styles.quickActions,
            { opacity: overlayOpacity }
          ]}
        >
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: getColor('sage', 500) + 'CC' }]}
              onPress={() => {
                animateButton();
                // Handle batch processing
              }}
            >
              <MaterialIcons name="done-all" size={24} color="white" />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  permissionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionContent: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  permissionIcon: {
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionMessage: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 32,
  },
  permissionButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  permissionButton: {
    minWidth: 120,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '500',
  },
  modeIndicator: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    right: 20,
    zIndex: 10,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  modeText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  captureCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  processingCard: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderRadius: 16,
    marginHorizontal: 32,
  },
  processingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  processingMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  quickActions: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 120 : 100,
    right: 20,
    zIndex: 10,
  },
  quickActionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});

export default CameraQuickCaptureScreen;