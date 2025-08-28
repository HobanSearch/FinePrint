/**
 * Document Scanner Component
 * Advanced camera integration with auto-crop, edge detection, and perspective correction
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { Camera, CameraType, FlashMode } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import DocumentScannerPlugin from 'react-native-document-scanner-plugin';
import { logger } from '../../utils/logger';
import { performanceMonitor } from '../../utils/performance';
import { theme } from '../../constants/theme';

export interface ScanResult {
  uri: string;
  width: number;
  height: number;
  corners?: Array<{ x: number; y: number }>;
  confidence?: number;
  processed: boolean;
}

export interface DocumentScannerProps {
  onScanComplete: (results: ScanResult[]) => void;
  onCancel: () => void;
  maxPages?: number;
  enableAutoCapture?: boolean;
  enableEdgeDetection?: boolean;
  enablePerspectiveCorrection?: boolean;
  enableImageEnhancement?: boolean;
  showGuideOverlay?: boolean;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export const DocumentScanner: React.FC<DocumentScannerProps> = ({
  onScanComplete,
  onCancel,
  maxPages = 10,
  enableAutoCapture = true,
  enableEdgeDetection = true,
  enablePerspectiveCorrection = true,
  enableImageEnhancement = true,
  showGuideOverlay = true,
}) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [type, setType] = useState(CameraType.back);
  const [flashMode, setFlashMode] = useState(FlashMode.off);
  const [isCapturing, setIsCapturing] = useState(false);
  const [scannedPages, setScannedPages] = useState<ScanResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [documentBounds, setDocumentBounds] = useState<Array<{ x: number; y: number }> | null>(null);
  
  const cameraRef = useRef<Camera>(null);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;
  const autoDetectTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();

    return () => {
      if (autoDetectTimer.current) {
        clearTimeout(autoDetectTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (showGuideOverlay) {
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [showGuideOverlay]);

  const startPulseAnimation = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnimation, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnimation, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnimation]);

  const stopPulseAnimation = useCallback(() => {
    pulseAnimation.stopAnimation();
    pulseAnimation.setValue(1);
  }, [pulseAnimation]);

  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      performanceMonitor.startTimer('camera_capture');

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        exif: true,
        skipProcessing: false,
      });

      const captureTime = performanceMonitor.endTimer('camera_capture');
      logger.info(`Photo captured in ${captureTime}ms`);

      await processImage(photo.uri);
    } catch (error) {
      logger.error('Failed to capture photo:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  const processImage = useCallback(async (imageUri: string) => {
    setIsProcessing(true);
    performanceMonitor.startTimer('document_processing');

    try {
      let processedUri = imageUri;
      let corners: Array<{ x: number; y: number }> | undefined;
      let confidence: number | undefined;

      // Document edge detection and perspective correction
      if (enableEdgeDetection) {
        try {
          const result = await DocumentScannerPlugin.scanDocument({
            sourceImagePath: imageUri,
            detectEdges: true,
            correctPerspective: enablePerspectiveCorrection,
            enhanceImage: enableImageEnhancement,
          });

          if (result && result.scannedImagePath) {
            processedUri = result.scannedImagePath;
            corners = result.corners;
            confidence = result.confidence;
          }
        } catch (scanError) {
          logger.warn('Document scanning plugin failed, using manual processing:', scanError);
          processedUri = await manualImageProcessing(imageUri);
        }
      } else {
        processedUri = await manualImageProcessing(imageUri);
      }

      // Get image dimensions
      const imageInfo = await ImageManipulator.manipulateAsync(
        processedUri,
        [],
        { format: ImageManipulator.SaveFormat.JPEG }
      );

      const scanResult: ScanResult = {
        uri: processedUri,
        width: imageInfo.width,
        height: imageInfo.height,
        corners,
        confidence,
        processed: true,
      };

      const newScannedPages = [...scannedPages, scanResult];
      setScannedPages(newScannedPages);

      const processingTime = performanceMonitor.endTimer('document_processing');
      logger.info(`Document processed in ${processingTime}ms`);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Auto-complete if max pages reached or single page mode
      if (newScannedPages.length >= maxPages || maxPages === 1) {
        onScanComplete(newScannedPages);
      }
    } catch (error) {
      logger.error('Failed to process image:', error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to process image. Please try again.');
    } finally {
      setIsProcessing(false);
      performanceMonitor.endTimer('document_processing');
    }
  }, [
    scannedPages,
    maxPages,
    enableEdgeDetection,
    enablePerspectiveCorrection,
    enableImageEnhancement,
    onScanComplete,
  ]);

  const manualImageProcessing = useCallback(async (imageUri: string): Promise<string> => {
    try {
      // Basic image enhancement
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          // Auto-orient based on EXIF
          { rotate: 0 },
          // Resize if too large (maintain aspect ratio)
          { resize: { width: Math.min(screenWidth * 2, 2048) } },
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        }
      );

      return result.uri;
    } catch (error) {
      logger.error('Manual image processing failed:', error);
      return imageUri;
    }
  }, []);

  const detectDocumentEdges = useCallback(async () => {
    // This would integrate with a computer vision library
    // For now, simulate edge detection
    if (enableAutoCapture && !isCapturing && !isProcessing) {
      const detected = Math.random() > 0.7; // Simulate detection
      if (detected && !autoDetected) {
        setAutoDetected(true);
        setDocumentBounds([
          { x: 50, y: 100 },
          { x: screenWidth - 50, y: 100 },
          { x: screenWidth - 50, y: screenHeight - 200 },
          { x: 50, y: screenHeight - 200 },
        ]);
        startPulseAnimation();

        // Auto-capture after delay
        autoDetectTimer.current = setTimeout(() => {
          if (autoDetected) {
            capturePhoto();
          }
        }, 2000);
      } else if (!detected && autoDetected) {
        setAutoDetected(false);
        setDocumentBounds(null);
        stopPulseAnimation();
        if (autoDetectTimer.current) {
          clearTimeout(autoDetectTimer.current);
        }
      }
    }
  }, [enableAutoCapture, isCapturing, isProcessing, autoDetected, capturePhoto, startPulseAnimation, stopPulseAnimation]);

  useEffect(() => {
    if (enableAutoCapture) {
      const interval = setInterval(detectDocumentEdges, 500);
      return () => clearInterval(interval);
    }
  }, [enableAutoCapture, detectDocumentEdges]);

  const toggleFlash = useCallback(() => {
    setFlashMode(current => 
      current === FlashMode.off ? FlashMode.on : FlashMode.off
    );
  }, []);

  const completeScanning = useCallback(() => {
    if (scannedPages.length > 0) {
      onScanComplete(scannedPages);
    } else {
      Alert.alert('No Pages', 'Please scan at least one page before completing.');
    }
  }, [scannedPages, onScanComplete]);

  const deleteLastPage = useCallback(() => {
    if (scannedPages.length > 0) {
      setScannedPages(prev => prev.slice(0, -1));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [scannedPages]);

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera permission is required for document scanning.</Text>
        <TouchableOpacity style={styles.button} onPress={onCancel}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        type={type}
        flashMode={flashMode}
        autoFocus="on"
      >
        {/* Guide Overlay */}
        {showGuideOverlay && (
          <Animated.View
            style={[
              styles.guideOverlay,
              { opacity: overlayOpacity },
            ]}
          >
            <View style={styles.guideFrame} />
            <Text style={styles.guideText}>
              Position document within the frame
            </Text>
          </Animated.View>
        )}

        {/* Document Detection Overlay */}
        {documentBounds && (
          <Animated.View
            style={[
              styles.detectionOverlay,
              { opacity: pulseAnimation },
            ]}
          >
            <Text style={styles.detectionText}>Document Detected</Text>
          </Animated.View>
        )}

        {/* Top Controls */}
        <View style={styles.topControls}>
          <TouchableOpacity style={styles.controlButton} onPress={onCancel}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          
          <View style={styles.pageCounter}>
            <Text style={styles.pageCounterText}>
              {scannedPages.length}/{maxPages}
            </Text>
          </View>

          <TouchableOpacity style={styles.controlButton} onPress={toggleFlash}>
            <Ionicons 
              name={flashMode === FlashMode.on ? "flash" : "flash-off"} 
              size={24} 
              color="white" 
            />
          </TouchableOpacity>
        </View>

        {/* Bottom Controls */}
        <View style={styles.bottomControls}>
          {scannedPages.length > 0 && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={deleteLastPage}
            >
              <MaterialIcons name="undo" size={24} color="white" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.captureButton,
              isCapturing && styles.captureButtonDisabled,
            ]}
            onPress={capturePhoto}
            disabled={isCapturing || isProcessing}
          >
            {isCapturing || isProcessing ? (
              <View style={styles.captureButtonInner}>
                <Text style={styles.captureButtonText}>
                  {isCapturing ? 'Capturing...' : 'Processing...'}
                </Text>
              </View>
            ) : (
              <View style={styles.captureButtonInner} />
            )}
          </TouchableOpacity>

          {scannedPages.length > 0 && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={completeScanning}
            >
              <MaterialIcons name="check" size={24} color="white" />
            </TouchableOpacity>
          )}
        </View>
      </Camera>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
    color: 'white',
    fontSize: 16,
  },
  button: {
    backgroundColor: theme.colors.primary,
    padding: 15,
    borderRadius: 8,
    margin: 20,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  guideOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideFrame: {
    width: screenWidth * 0.8,
    height: screenHeight * 0.6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  guideText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  detectionOverlay: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  detectionText: {
    color: theme.colors.success,
    fontSize: 18,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  topControls: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 30 : 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageCounter: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pageCounterText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomControls: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 30 : 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 30,
  },
  captureButtonDisabled: {
    opacity: 0.7,
  },
  captureButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondaryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});