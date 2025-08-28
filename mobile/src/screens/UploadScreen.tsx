import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  TouchableOpacity,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { useMutation } from '@tanstack/react-query'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import Animated, { FadeInDown } from 'react-native-reanimated'

// Design system and components
import designSystem from '@/design-system'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { DocumentScanner, ScanResult } from '@/components/camera/DocumentScanner'

// Services and stores
import { appApi } from '@/services/appApi'
import { documentProcessor } from '@/services/documentProcessor'
import { useDocuments } from '@/stores'

// Types
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types'

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

interface UploadOption {
  id: string
  icon: string
  title: string
  subtitle: string
  action: () => void
}

export default function UploadScreen() {
  const navigation = useNavigation<NavigationProp>()
  const { addDocument } = useDocuments()
  const [showScanner, setShowScanner] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number>(0)

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: {
      uri: string
      name: string
      type: string
      size?: number
    }) => {
      // Create form data
      const formData = new FormData()
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as any)

      // Upload with progress tracking
      return appApi.uploadDocument(formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          )
          setUploadProgress(progress)
        },
      })
    },
    onSuccess: (response, file) => {
      // Add to local store
      addDocument({
        id: response.id,
        name: file.name,
        type: response.documentType,
        size: file.size,
        uri: file.uri,
        uploadedAt: new Date().toISOString(),
        status: 'pending',
      })

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      
      // Navigate to analysis
      navigation.replace('AnalysisDetail', { analysisId: response.analysisId })
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(
        'Upload Failed',
        error.message || 'Failed to upload document. Please try again.'
      )
    },
  })

  const handleScanDocument = useCallback(() => {
    setShowScanner(true)
  }, [])

  const handleScanComplete = useCallback(async (results: ScanResult[]) => {
    setShowScanner(false)
    
    // Process scanned documents
    for (const result of results) {
      await uploadMutation.mutateAsync({
        uri: result.uri,
        name: `scan_${Date.now()}.jpg`,
        type: 'image/jpeg',
        size: 0, // Will be calculated on server
      })
    }
  }, [uploadMutation])

  const handlePickDocument = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain'],
        copyToCacheDirectory: true,
      })

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0]
        await uploadMutation.mutateAsync({
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream',
          size: file.size,
        })
      }
    } catch (error) {
      console.error('Document picker error:', error)
      Alert.alert('Error', 'Failed to pick document')
    }
  }, [uploadMutation])

  const handlePickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      })

      if (!result.canceled && result.assets[0]) {
        const image = result.assets[0]
        await uploadMutation.mutateAsync({
          uri: image.uri,
          name: `image_${Date.now()}.jpg`,
          type: 'image/jpeg',
          size: 0,
        })
      }
    } catch (error) {
      console.error('Image picker error:', error)
      Alert.alert('Error', 'Failed to pick image')
    }
  }, [uploadMutation])

  const handlePasteURL = useCallback(() => {
    Alert.prompt(
      'Enter Document URL',
      'Paste the URL of the Terms of Service or Privacy Policy',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Analyze',
          onPress: async (url) => {
            if (url && url.trim()) {
              try {
                const response = await appApi.analyzeURL({ url: url.trim() })
                navigation.replace('AnalysisDetail', { 
                  analysisId: response.analysisId 
                })
              } catch (error: any) {
                Alert.alert(
                  'Analysis Failed',
                  error.message || 'Failed to analyze URL'
                )
              }
            }
          },
        },
      ],
      'plain-text',
      '',
      'url'
    )
  }, [navigation])

  const uploadOptions: UploadOption[] = [
    {
      id: 'scan',
      icon: '📷',
      title: 'Scan Document',
      subtitle: 'Use camera to capture pages',
      action: handleScanDocument,
    },
    {
      id: 'file',
      icon: '📄',
      title: 'Choose File',
      subtitle: 'Select PDF or text file',
      action: handlePickDocument,
    },
    {
      id: 'photo',
      icon: '🖼️',
      title: 'Photo Library',
      subtitle: 'Select from your photos',
      action: handlePickImage,
    },
    {
      id: 'url',
      icon: '🔗',
      title: 'Paste URL',
      subtitle: 'Analyze online document',
      action: handlePasteURL,
    },
  ]

  if (showScanner) {
    return (
      <DocumentScanner
        onScanComplete={handleScanComplete}
        onCancel={() => setShowScanner(false)}
        maxPages={10}
        enableAutoCapture
        enableEdgeDetection
        enablePerspectiveCorrection
        enableImageEnhancement
        showGuideOverlay
      />
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Upload Document</Text>
          <Text style={styles.subtitle}>
            Choose how you'd like to upload your legal document
          </Text>
        </View>

        {/* Upload Options */}
        <View style={styles.optionsContainer}>
          {uploadOptions.map((option, index) => (
            <Animated.View
              key={option.id}
              entering={FadeInDown.delay(index * 100).springify()}
            >
              <TouchableOpacity
                onPress={option.action}
                disabled={uploadMutation.isPending}
              >
                <Card variant="interactive" style={styles.optionCard}>
                  <Text style={styles.optionIcon}>{option.icon}</Text>
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Card>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>

        {/* Upload Progress */}
        {uploadMutation.isPending && (
          <Animated.View
            entering={FadeInDown.springify()}
            style={styles.progressContainer}
          >
            <Text style={styles.progressText}>Uploading...</Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${uploadProgress}%` },
                ]}
              />
            </View>
            <Text style={styles.progressPercent}>{uploadProgress}%</Text>
          </Animated.View>
        )}

        {/* Info Section */}
        <Animated.View
          entering={FadeInDown.delay(400).springify()}
          style={styles.infoSection}
        >
          <Card variant="outlined" style={styles.infoCard}>
            <Text style={styles.infoIcon}>🔒</Text>
            <Text style={styles.infoTitle}>Your Privacy Matters</Text>
            <Text style={styles.infoText}>
              Documents are processed locally on your device. We never store or 
              transmit your sensitive information.
            </Text>
          </Card>
        </Animated.View>

        {/* Supported Formats */}
        <Animated.View
          entering={FadeInDown.delay(500).springify()}
          style={styles.formatsSection}
        >
          <Text style={styles.formatsTitle}>Supported Formats</Text>
          <Text style={styles.formatsText}>
            PDF, TXT, DOC, DOCX, Images (JPG, PNG), or paste a URL
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: designSystem.colors.gray[50],
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: designSystem.spacing.xl,
  },
  header: {
    padding: designSystem.spacing.screenPadding,
    paddingTop: designSystem.spacing.lg,
    paddingBottom: designSystem.spacing.md,
  },
  title: {
    ...designSystem.typography.heading.h1,
    color: designSystem.colors.gray[900],
    marginBottom: designSystem.spacing.xs,
  },
  subtitle: {
    ...designSystem.typography.body.medium,
    color: designSystem.colors.gray[600],
  },
  optionsContainer: {
    paddingHorizontal: designSystem.spacing.screenPadding,
    marginBottom: designSystem.spacing.xl,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: designSystem.spacing.sm,
    padding: designSystem.spacing.lg,
  },
  optionIcon: {
    fontSize: 32,
    marginRight: designSystem.spacing.md,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    ...designSystem.typography.heading.h4,
    color: designSystem.colors.gray[900],
    marginBottom: designSystem.spacing.xxs,
  },
  optionSubtitle: {
    ...designSystem.typography.body.small,
    color: designSystem.colors.gray[600],
  },
  chevron: {
    fontSize: 24,
    color: designSystem.colors.gray[400],
  },
  progressContainer: {
    paddingHorizontal: designSystem.spacing.screenPadding,
    marginBottom: designSystem.spacing.xl,
  },
  progressText: {
    ...designSystem.typography.label.medium,
    color: designSystem.colors.gray[700],
    marginBottom: designSystem.spacing.xs,
  },
  progressBar: {
    height: 8,
    backgroundColor: designSystem.colors.gray[200],
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: designSystem.spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: designSystem.colors.brand.primary,
    borderRadius: 4,
  },
  progressPercent: {
    ...designSystem.typography.label.small,
    color: designSystem.colors.gray[600],
    textAlign: 'right',
  },
  infoSection: {
    paddingHorizontal: designSystem.spacing.screenPadding,
    marginBottom: designSystem.spacing.lg,
  },
  infoCard: {
    alignItems: 'center',
    padding: designSystem.spacing.xl,
  },
  infoIcon: {
    fontSize: 48,
    marginBottom: designSystem.spacing.md,
  },
  infoTitle: {
    ...designSystem.typography.heading.h3,
    color: designSystem.colors.gray[900],
    marginBottom: designSystem.spacing.sm,
    textAlign: 'center',
  },
  infoText: {
    ...designSystem.typography.body.small,
    color: designSystem.colors.gray[600],
    textAlign: 'center',
    lineHeight: 20,
  },
  formatsSection: {
    paddingHorizontal: designSystem.spacing.screenPadding,
    alignItems: 'center',
  },
  formatsTitle: {
    ...designSystem.typography.label.medium,
    color: designSystem.colors.gray[700],
    marginBottom: designSystem.spacing.xxs,
  },
  formatsText: {
    ...designSystem.typography.body.small,
    color: designSystem.colors.gray[600],
    textAlign: 'center',
  },
})