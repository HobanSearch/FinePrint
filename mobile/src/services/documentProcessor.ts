/**
 * Document Processing Service
 * Handles image optimization, multi-page support, batch processing, and document management
 */

import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import { ocrService, OCRResult } from './ocrService';
import { logger } from '../utils/logger';
import { performanceMonitor } from '../utils/performance';

export interface ProcessedDocument {
  id: string;
  title: string;
  pages: DocumentPage[];
  createdAt: string;
  updatedAt: string;
  totalPages: number;
  totalSize: number;
  ocrResults?: OCRResult[];
  analysisResults?: any[];
  thumbnailUri?: string;
  metadata: DocumentMetadata;
}

export interface DocumentPage {
  id: string;
  originalUri: string;
  processedUri: string;
  thumbnailUri: string;
  pageNumber: number;
  width: number;
  height: number;
  fileSize: number;
  ocrResult?: OCRResult;
  corners?: Array<{ x: number; y: number }>;
}

export interface DocumentMetadata {
  source: 'camera' | 'import' | 'share';
  deviceInfo: {
    platform: string;
    model?: string;
  };
  processingInfo: {
    ocrMethod: string;
    processingTime: number;
    imageEnhanced: boolean;
  };
  quality: {
    averageConfidence: number;
    totalTextLength: number;
    pageQualityScores: number[];
  };
}

export interface ProcessingOptions {
  enableOCR?: boolean;
  enableImageEnhancement?: boolean;
  enableThumbnailGeneration?: boolean;
  maxImageSize?: number;
  compressionQuality?: number;
  ocrLanguage?: string;
}

export interface BatchProcessingStatus {
  total: number;
  completed: number;
  failed: number;
  currentPage?: string;
  estimatedTimeRemaining?: number;
}

class DocumentProcessor {
  private documentsDirectory: string;
  private thumbnailsDirectory: string;
  private tempDirectory: string;

  constructor() {
    this.documentsDirectory = `${FileSystem.documentDirectory}documents/`;
    this.thumbnailsDirectory = `${FileSystem.documentDirectory}thumbnails/`;
    this.tempDirectory = `${FileSystem.documentDirectory}temp/`;
  }

  /**
   * Initialize the document processor
   */
  async initialize(): Promise<void> {
    try {
      // Create necessary directories
      await this.ensureDirectoryExists(this.documentsDirectory);
      await this.ensureDirectoryExists(this.thumbnailsDirectory);
      await this.ensureDirectoryExists(this.tempDirectory);

      // Initialize OCR service
      await ocrService.initialize();

      logger.info('Document processor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize document processor:', error);
      throw error;
    }
  }

  /**
   * Process a single document from multiple image URIs
   */
  async processDocument(
    imageUris: string[],
    title: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessedDocument> {
    const startTime = Date.now();
    performanceMonitor.startTimer('document_processing_full');

    try {
      const documentId = await this.generateDocumentId();
      const {
        enableOCR = true,
        enableImageEnhancement = true,
        enableThumbnailGeneration = true,
        maxImageSize = 2048,
        compressionQuality = 0.8,
        ocrLanguage = 'eng',
      } = options;

      logger.info(`Processing document with ${imageUris.length} pages`);

      // Process each page
      const pages: DocumentPage[] = [];
      const ocrResults: OCRResult[] = [];
      let totalSize = 0;

      for (let i = 0; i < imageUris.length; i++) {
        const imageUri = imageUris[i];
        
        try {
          const page = await this.processPage(
            imageUri,
            i + 1,
            documentId,
            {
              enableOCR,
              enableImageEnhancement,
              enableThumbnailGeneration,
              maxImageSize,
              compressionQuality,
              ocrLanguage,
            }
          );

          pages.push(page);
          totalSize += page.fileSize;

          if (page.ocrResult) {
            ocrResults.push(page.ocrResult);
          }
        } catch (error) {
          logger.error(`Failed to process page ${i + 1}:`, error);
          // Continue with other pages
        }
      }

      // Generate document thumbnail from first page
      let thumbnailUri: string | undefined;
      if (enableThumbnailGeneration && pages.length > 0) {
        thumbnailUri = await this.generateDocumentThumbnail(pages[0].processedUri, documentId);
      }

      // Calculate quality metrics
      const qualityMetrics = this.calculateQualityMetrics(ocrResults);

      const document: ProcessedDocument = {
        id: documentId,
        title,
        pages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalPages: pages.length,
        totalSize,
        ocrResults,
        thumbnailUri,
        metadata: {
          source: 'camera',
          deviceInfo: {
            platform: Platform.OS,
          },
          processingInfo: {
            ocrMethod: enableOCR ? 'hybrid' : 'none',
            processingTime: Date.now() - startTime,
            imageEnhanced: enableImageEnhancement,
          },
          quality: qualityMetrics,
        },
      };

      // Save document metadata
      await this.saveDocumentMetadata(document);

      const processingTime = performanceMonitor.endTimer('document_processing_full');
      logger.info(`Document processed successfully in ${processingTime}ms`);

      return document;
    } catch (error) {
      logger.error('Document processing failed:', error);
      throw error;
    }
  }

  /**
   * Process a single page of a document
   */
  private async processPage(
    imageUri: string,
    pageNumber: number,
    documentId: string,
    options: ProcessingOptions
  ): Promise<DocumentPage> {
    const pageId = `${documentId}_page_${pageNumber}`;
    
    try {
      // Get original image info
      const originalInfo = await FileSystem.getInfoAsync(imageUri);
      if (!originalInfo.exists) {
        throw new Error('Image file does not exist');
      }

      // Enhance image if enabled
      let processedUri = imageUri;
      if (options.enableImageEnhancement) {
        processedUri = await this.enhanceImage(imageUri, options);
      }

      // Move processed image to documents directory
      const finalUri = `${this.documentsDirectory}${pageId}.jpg`;
      await FileSystem.copyAsync({
        from: processedUri,
        to: finalUri,
      });

      // Generate thumbnail
      let thumbnailUri = '';
      if (options.enableThumbnailGeneration) {
        thumbnailUri = await this.generateThumbnail(finalUri, pageId);
      }

      // Get image dimensions
      const imageInfo = await ImageManipulator.manipulateAsync(
        finalUri,
        [],
        { format: ImageManipulator.SaveFormat.JPEG }
      );

      // Perform OCR if enabled
      let ocrResult: OCRResult | undefined;
      if (options.enableOCR) {
        try {
          ocrResult = await ocrService.extractText(finalUri, {
            language: options.ocrLanguage,
            method: 'hybrid',
          });
        } catch (ocrError) {
          logger.warn(`OCR failed for page ${pageNumber}:`, ocrError);
        }
      }

      const finalInfo = await FileSystem.getInfoAsync(finalUri);

      return {
        id: pageId,
        originalUri: imageUri,
        processedUri: finalUri,
        thumbnailUri,
        pageNumber,
        width: imageInfo.width,
        height: imageInfo.height,
        fileSize: finalInfo.size || 0,
        ocrResult,
      };
    } catch (error) {
      logger.error(`Failed to process page ${pageNumber}:`, error);
      throw error;
    }
  }

  /**
   * Enhance image quality for better OCR and storage
   */
  private async enhanceImage(
    imageUri: string,
    options: ProcessingOptions
  ): Promise<string> {
    try {
      const manipulationActions: ImageManipulator.Action[] = [];

      // Resize if needed
      if (options.maxImageSize) {
        manipulationActions.push({
          resize: { width: options.maxImageSize },
        });
      }

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        manipulationActions,
        {
          compress: options.compressionQuality || 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        }
      );

      return result.uri;
    } catch (error) {
      logger.error('Image enhancement failed:', error);
      return imageUri; // Return original if enhancement fails
    }
  }

  /**
   * Generate thumbnail for a page
   */
  private async generateThumbnail(
    imageUri: string,
    pageId: string
  ): Promise<string> {
    try {
      const thumbnailUri = `${this.thumbnailsDirectory}${pageId}_thumb.jpg`;

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 200 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        }
      );

      await FileSystem.copyAsync({
        from: result.uri,
        to: thumbnailUri,
      });

      return thumbnailUri;
    } catch (error) {
      logger.error('Thumbnail generation failed:', error);
      return '';
    }
  }

  /**
   * Generate document thumbnail from first page
   */
  private async generateDocumentThumbnail(
    firstPageUri: string,
    documentId: string
  ): Promise<string> {
    try {
      const thumbnailUri = `${this.thumbnailsDirectory}${documentId}_doc_thumb.jpg`;

      const result = await ImageManipulator.manipulateAsync(
        firstPageUri,
        [{ resize: { width: 300 } }],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        }
      );

      await FileSystem.copyAsync({
        from: result.uri,
        to: thumbnailUri,
      });

      return thumbnailUri;
    } catch (error) {
      logger.error('Document thumbnail generation failed:', error);
      return '';
    }
  }

  /**
   * Batch process multiple documents
   */
  async batchProcessDocuments(
    documentsData: Array<{
      imageUris: string[];
      title: string;
      options?: ProcessingOptions;
    }>,
    onProgress?: (status: BatchProcessingStatus) => void
  ): Promise<ProcessedDocument[]> {
    const results: ProcessedDocument[] = [];
    const total = documentsData.length;
    let completed = 0;
    let failed = 0;

    for (const docData of documentsData) {
      try {
        onProgress?.({
          total,
          completed,
          failed,
          currentPage: docData.title,
        });

        const document = await this.processDocument(
          docData.imageUris,
          docData.title,
          docData.options
        );

        results.push(document);
        completed++;
      } catch (error) {
        logger.error(`Failed to process document ${docData.title}:`, error);
        failed++;
      }

      onProgress?.({
        total,
        completed,
        failed,
      });
    }

    return results;
  }

  /**
   * Save document metadata to filesystem
   */
  private async saveDocumentMetadata(document: ProcessedDocument): Promise<void> {
    try {
      const metadataPath = `${this.documentsDirectory}${document.id}_metadata.json`;
      await FileSystem.writeAsStringAsync(
        metadataPath,
        JSON.stringify(document, null, 2)
      );
    } catch (error) {
      logger.error('Failed to save document metadata:', error);
    }
  }

  /**
   * Load document metadata from filesystem
   */
  async loadDocumentMetadata(documentId: string): Promise<ProcessedDocument | null> {
    try {
      const metadataPath = `${this.documentsDirectory}${documentId}_metadata.json`;
      const metadataString = await FileSystem.readAsStringAsync(metadataPath);
      return JSON.parse(metadataString);
    } catch (error) {
      logger.error('Failed to load document metadata:', error);
      return null;
    }
  }

  /**
   * Export document as PDF
   */
  async exportToPDF(document: ProcessedDocument): Promise<string | null> {
    try {
      // This would require a PDF generation library
      // For now, return the first page as fallback
      if (document.pages.length > 0) {
        return document.pages[0].processedUri;
      }
      return null;
    } catch (error) {
      logger.error('PDF export failed:', error);
      return null;
    }
  }

  /**
   * Share document
   */
  async shareDocument(document: ProcessedDocument): Promise<void> {
    try {
      if (document.pages.length === 0) {
        throw new Error('No pages to share');
      }

      // Share first page for now (could be enhanced to share all pages or PDF)
      const firstPage = document.pages[0];
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(firstPage.processedUri, {
          mimeType: 'image/jpeg',
          dialogTitle: `Share ${document.title}`,
        });
      } else {
        throw new Error('Sharing is not available on this device');
      }
    } catch (error) {
      logger.error('Document sharing failed:', error);
      throw error;
    }
  }

  /**
   * Delete document and all associated files
   */
  async deleteDocument(documentId: string): Promise<void> {
    try {
      const document = await this.loadDocumentMetadata(documentId);
      if (!document) {
        throw new Error('Document not found');
      }

      // Delete all page files
      for (const page of document.pages) {
        try {
          await FileSystem.deleteAsync(page.processedUri, { idempotent: true });
          if (page.thumbnailUri) {
            await FileSystem.deleteAsync(page.thumbnailUri, { idempotent: true });
          }
        } catch (error) {
          logger.warn(`Failed to delete page file:`, error);
        }
      }

      // Delete document thumbnail
      if (document.thumbnailUri) {
        await FileSystem.deleteAsync(document.thumbnailUri, { idempotent: true });
      }

      // Delete metadata file
      const metadataPath = `${this.documentsDirectory}${documentId}_metadata.json`;
      await FileSystem.deleteAsync(metadataPath, { idempotent: true });

      logger.info(`Document ${documentId} deleted successfully`);
    } catch (error) {
      logger.error('Failed to delete document:', error);
      throw error;
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats(): Promise<{
    totalDocuments: number;
    totalSize: number;
    averageDocumentSize: number;
    storageByType: {
      documents: number;
      thumbnails: number;
      temp: number;
    };
  }> {
    try {
      const documentsInfo = await FileSystem.getInfoAsync(this.documentsDirectory);
      const thumbnailsInfo = await FileSystem.getInfoAsync(this.thumbnailsDirectory);
      const tempInfo = await FileSystem.getInfoAsync(this.tempDirectory);

      return {
        totalDocuments: 0, // Would need to count metadata files
        totalSize: (documentsInfo.size || 0) + (thumbnailsInfo.size || 0) + (tempInfo.size || 0),
        averageDocumentSize: 0,
        storageByType: {
          documents: documentsInfo.size || 0,
          thumbnails: thumbnailsInfo.size || 0,
          temp: tempInfo.size || 0,
        },
      };
    } catch (error) {
      logger.error('Failed to get storage stats:', error);
      return {
        totalDocuments: 0,
        totalSize: 0,
        averageDocumentSize: 0,
        storageByType: {
          documents: 0,
          thumbnails: 0,
          temp: 0,
        },
      };
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles(): Promise<void> {
    try {
      const tempInfo = await FileSystem.getInfoAsync(this.tempDirectory);
      if (tempInfo.exists) {
        await FileSystem.deleteAsync(this.tempDirectory);
        await FileSystem.makeDirectoryAsync(this.tempDirectory);
      }
      logger.info('Temporary files cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup temp files:', error);
    }
  }

  /**
   * Utility methods
   */
  private async generateDocumentId(): Promise<string> {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.MD5,
      `${timestamp}_${random}`
    );
    return hash.substring(0, 16);
  }

  private async ensureDirectoryExists(directory: string): Promise<void> {
    const info = await FileSystem.getInfoAsync(directory);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    }
  }

  private calculateQualityMetrics(ocrResults: OCRResult[]): {
    averageConfidence: number;
    totalTextLength: number;
    pageQualityScores: number[];
  } {
    if (ocrResults.length === 0) {
      return {
        averageConfidence: 0,
        totalTextLength: 0,
        pageQualityScores: [],
      };
    }

    const confidences = ocrResults.map(result => result.confidence);
    const textLengths = ocrResults.map(result => result.text.length);
    const totalTextLength = textLengths.reduce((sum, length) => sum + length, 0);
    const averageConfidence = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;

    return {
      averageConfidence,
      totalTextLength,
      pageQualityScores: confidences,
    };
  }
}

export const documentProcessor = new DocumentProcessor();