import type { StateCreator } from 'zustand'
import { Camera } from 'expo-camera'
import type { CameraCaptureResult, OCRResult } from '@/types'

export interface CameraSlice {
  isCameraEnabled: boolean
  hasCameraPermission: boolean
  isCapturing: boolean
  lastCapture: CameraCaptureResult | null
  
  // Actions
  requestCameraPermission: () => Promise<boolean>
  captureDocument: () => Promise<CameraCaptureResult>
  processOCR: (imageUri: string) => Promise<OCRResult>
}

export const createCameraSlice: StateCreator<
  CameraSlice,
  [['zustand/immer', never], ['zustand/devtools', never], ['zustand/subscribeWithSelector', never]],
  [],
  CameraSlice
> = (set, get) => ({
  // Initial state
  isCameraEnabled: false,
  hasCameraPermission: false,
  isCapturing: false,
  lastCapture: null,

  // Actions
  requestCameraPermission: async () => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync()
      const hasPermission = status === 'granted'
      
      set(state => {
        state.hasCameraPermission = hasPermission
        state.isCameraEnabled = hasPermission
      })
      
      return hasPermission
    } catch (error) {
      console.error('Camera permission request failed:', error)
      return false
    }
  },

  captureDocument: async () => {
    const { hasCameraPermission } = get()
    
    if (!hasCameraPermission) {
      throw new Error('Camera permission not granted')
    }

    set(state => {
      state.isCapturing = true
    })

    try {
      // This would be implemented with actual camera capture logic
      // For now, returning a mock result
      const result: CameraCaptureResult = {
        uri: 'mock://capture/result',
        width: 1920,
        height: 1080,
        type: 'image'
      }

      set(state => {
        state.lastCapture = result
        state.isCapturing = false
      })

      return result
    } catch (error: any) {
      set(state => {
        state.isCapturing = false
      })
      throw error
    }
  },

  processOCR: async (imageUri: string) => {
    // This would integrate with an OCR service
    // For now, returning a mock result
    const mockOCR: OCRResult = {
      text: 'Mock OCR text result',
      confidence: 0.95,
      blocks: []
    }
    
    return mockOCR
  }
})