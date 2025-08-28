import type { StateCreator } from 'zustand'
import type { MobileDocument, DocumentUploadProgress } from '@/types'

export interface DocumentSlice {
  documents: Record<string, MobileDocument>
  recentDocuments: string[]
  isUploading: boolean
  uploadProgress: Record<string, DocumentUploadProgress>
  
  // Actions
  addDocument: (document: MobileDocument) => void
  removeDocument: (id: string) => void
  updateDocument: (id: string, updates: Partial<MobileDocument>) => void
  setUploadProgress: (documentId: string, progress: DocumentUploadProgress) => void
  clearDocuments: () => void
  getDocument: (id: string) => MobileDocument | undefined
}

export const createDocumentSlice: StateCreator<
  DocumentSlice,
  [['zustand/immer', never], ['zustand/devtools', never], ['zustand/subscribeWithSelector', never]],
  [],
  DocumentSlice
> = (set, get) => ({
  // Initial state
  documents: {},
  recentDocuments: [],
  isUploading: false,
  uploadProgress: {},

  // Actions
  addDocument: (document) => {
    set(state => {
      state.documents[document.id] = document
      
      // Update recent documents
      const existingIndex = state.recentDocuments.indexOf(document.id)
      if (existingIndex > -1) {
        state.recentDocuments.splice(existingIndex, 1)
      }
      state.recentDocuments.unshift(document.id)
      
      // Keep only recent 20 documents
      if (state.recentDocuments.length > 20) {
        const removedIds = state.recentDocuments.splice(20)
        removedIds.forEach(id => {
          delete state.documents[id]
          delete state.uploadProgress[id]
        })
      }
    })
  },

  removeDocument: (id) => {
    set(state => {
      delete state.documents[id]
      delete state.uploadProgress[id]
      
      const index = state.recentDocuments.indexOf(id)
      if (index > -1) {
        state.recentDocuments.splice(index, 1)
      }
    })
  },

  updateDocument: (id, updates) => {
    set(state => {
      if (state.documents[id]) {
        state.documents[id] = {
          ...state.documents[id],
          ...updates
        }
      }
    })
  },

  setUploadProgress: (documentId, progress) => {
    set(state => {
      state.uploadProgress[documentId] = progress
      state.isUploading = Object.values(state.uploadProgress).some(
        p => p.status === 'uploading' || p.status === 'preparing'
      )
    })
  },

  clearDocuments: () => {
    set(state => {
      state.documents = {}
      state.recentDocuments = []
      state.uploadProgress = {}
      state.isUploading = false
    })
  },

  getDocument: (id) => {
    return get().documents[id]
  }
})