/**
 * Share Integration Service
 * Handles share sheet integration for document importing from other apps
 */

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import { Platform, Alert } from 'react-native';
import { logger } from '../utils/logger';
import { performanceMonitor } from '../utils/performance';
import { documentProcessor, ProcessedDocument } from './documentProcessor';
import { ocrService } from './ocrService';

export interface ShareItem {
  id: string;
  type: 'image' | 'pdf' | 'text' | 'url' | 'file';
  source: 'share_sheet' | 'file_picker' | 'camera_roll' | 'clipboard' | 'deep_link';
  uri?: string;
  text?: string;
  title?: string;
  mimeType?: string;
  size?: number;
  metadata: {
    originalName?: string;
    timestamp: string;
    sourceApp?: string;
  };
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface ShareImportResult {
  success: boolean;
  document?: ProcessedDocument;
  error?: string;
  shareItem: ShareItem;
}

export interface ShareExportOptions {
  format: 'pdf' | 'images' | 'text' | 'json';
  includeAnalysis: boolean;
  includeMetadata: boolean;
  compressionLevel?: number;
  password?: string;
}

class ShareIntegrationService {
  private isInitialized = false;
  private shareQueue: ShareItem[] = [];
  private supportedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/plain',
    'text/html',
  ];

  /**
   * Initialize share integration service
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing share integration service...');

      // Set up deep linking
      await this.setupDeepLinking();

      // Request permissions
      await this.requestPermissions();

      this.isInitialized = true;
      logger.info('Share integration service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize share integration service:', error);
      throw error;
    }
  }

  /**
   * Handle incoming share from other apps
   */
  async handleIncomingShare(url: string): Promise<ShareImportResult[]> {
    try {
      logger.info('Handling incoming share:', url);
      performanceMonitor.startTimer('share_import');

      // Parse the share URL
      const shareData = this.parseShareURL(url);
      if (!shareData) {
        throw new Error('Invalid share URL');
      }

      const results: ShareImportResult[] = [];

      // Handle different types of shared content
      switch (shareData.type) {
        case 'file':
          const fileResult = await this.importSharedFile(shareData);
          results.push(fileResult);
          break;
        
        case 'text':
          const textResult = await this.importSharedText(shareData);
          results.push(textResult);
          break;
        
        case 'url':
          const urlResult = await this.importSharedURL(shareData);
          results.push(urlResult);
          break;
        
        case 'multiple':
          const multipleResults = await this.importMultipleSharedItems(shareData);
          results.push(...multipleResults);
          break;
        
        default:
          throw new Error(`Unsupported share type: ${shareData.type}`);
      }

      const processingTime = performanceMonitor.endTimer('share_import');
      logger.info(`Share import completed in ${processingTime}ms`);

      return results;
    } catch (error) {
      logger.error('Failed to handle incoming share:', error);
      return [{
        success: false,
        error: error.message,
        shareItem: {
          id: Date.now().toString(),
          type: 'file',
          source: 'share_sheet',
          metadata: { timestamp: new Date().toISOString() },
          processingStatus: 'failed',
          error: error.message,
        },
      }];
    }
  }

  /**
   * Import document from file picker
   */
  async importFromFilePicker(): Promise<ShareImportResult[]> {
    try {
      logger.info('Opening file picker for document import');

      const result = await DocumentPicker.getDocumentAsync({
        type: this.supportedMimeTypes,
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return [];
      }

      const results: ShareImportResult[] = [];
      const assets = Array.isArray(result.assets) ? result.assets : [result.assets];

      for (const asset of assets) {
        try {
          const shareItem = this.createShareItemFromAsset(asset, 'file_picker');
          const importResult = await this.processShareItem(shareItem);
          results.push(importResult);
        } catch (error) {
          logger.error('Failed to process file picker asset:', error);
          results.push({
            success: false,
            error: error.message,
            shareItem: {
              id: Date.now().toString(),
              type: 'file',
              source: 'file_picker',
              metadata: { timestamp: new Date().toISOString() },
              processingStatus: 'failed',
              error: error.message,
            },
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('File picker import failed:', error);
      return [{
        success: false,
        error: error.message,
        shareItem: {
          id: Date.now().toString(),
          type: 'file',
          source: 'file_picker',
          metadata: { timestamp: new Date().toISOString() },
          processingStatus: 'failed',
          error: error.message,
        },
      }];
    }
  }

  /**
   * Import images from camera roll
   */
  async importFromCameraRoll(): Promise<ShareImportResult[]> {
    try {
      logger.info('Opening camera roll for image import');

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
        allowsEditing: false,
      });

      if (result.canceled) {
        return [];
      }

      const results: ShareImportResult[] = [];
      const assets = result.assets || [];

      for (const asset of assets) {
        try {
          const shareItem: ShareItem = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            type: 'image',
            source: 'camera_roll',
            uri: asset.uri,
            mimeType: 'image/jpeg',
            size: asset.fileSize,
            metadata: {
              originalName: asset.fileName || 'camera_roll_image.jpg',
              timestamp: new Date().toISOString(),
            },
            processingStatus: 'pending',
          };

          const importResult = await this.processShareItem(shareItem);
          results.push(importResult);
        } catch (error) {
          logger.error('Failed to process camera roll asset:', error);
          results.push({
            success: false,
            error: error.message,
            shareItem: {
              id: Date.now().toString(),
              type: 'image',
              source: 'camera_roll',
              metadata: { timestamp: new Date().toISOString() },
              processingStatus: 'failed',
              error: error.message,
            },
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('Camera roll import failed:', error);
      return [{
        success: false,
        error: error.message,
        shareItem: {
          id: Date.now().toString(),
          type: 'image',
          source: 'camera_roll',
          metadata: { timestamp: new Date().toISOString() },
          processingStatus: 'failed',
          error: error.message,
        },
      }];
    }
  }

  /**
   * Export document for sharing
   */
  async exportDocument(
    document: ProcessedDocument,
    options: ShareExportOptions
  ): Promise<string> {
    try {
      logger.info(`Exporting document ${document.id} in ${options.format} format`);
      performanceMonitor.startTimer('document_export');

      let exportPath: string;

      switch (options.format) {
        case 'pdf':
          exportPath = await this.exportToPDF(document, options);
          break;
        
        case 'images':
          exportPath = await this.exportToImages(document, options);
          break;
        
        case 'text':
          exportPath = await this.exportToText(document, options);
          break;
        
        case 'json':
          exportPath = await this.exportToJSON(document, options);
          break;
        
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }

      const exportTime = performanceMonitor.endTimer('document_export');
      logger.info(`Document exported in ${exportTime}ms to ${exportPath}`);

      return exportPath;
    } catch (error) {
      logger.error('Document export failed:', error);
      throw error;
    }
  }

  /**
   * Share exported document
   */
  async shareExportedDocument(
    filePath: string,
    options: {
      title?: string;
      message?: string;
      mimeType?: string;
    } = {}
  ): Promise<void> {
    try {
      const {
        title = 'Fine Print Analysis',
        message = 'Document analysis from Fine Print AI',
        mimeType = 'application/octet-stream',
      } = options;

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Sharing is not available on this device');
      }

      await Sharing.shareAsync(filePath, {
        mimeType,
        dialogTitle: title,
        UTI: mimeType,
      });

      logger.info('Document shared successfully');
    } catch (error) {
      logger.error('Failed to share document:', error);
      throw error;
    }
  }

  /**
   * Process share item
   */
  private async processShareItem(shareItem: ShareItem): Promise<ShareImportResult> {
    try {
      shareItem.processingStatus = 'processing';
      this.shareQueue.push(shareItem);

      let processedDocument: ProcessedDocument;

      switch (shareItem.type) {
        case 'image':
          processedDocument = await this.processImageShare(shareItem);
          break;
        
        case 'pdf':
          processedDocument = await this.processPDFShare(shareItem);
          break;
        
        case 'text':
          processedDocument = await this.processTextShare(shareItem);
          break;
        
        case 'file':
          processedDocument = await this.processFileShare(shareItem);
          break;
        
        default:
          throw new Error(`Unsupported share item type: ${shareItem.type}`);
      }

      shareItem.processingStatus = 'completed';

      return {
        success: true,
        document: processedDocument,
        shareItem,
      };
    } catch (error) {
      shareItem.processingStatus = 'failed';
      shareItem.error = error.message;

      return {
        success: false,
        error: error.message,
        shareItem,
      };
    }
  }

  /**
   * Process image share
   */
  private async processImageShare(shareItem: ShareItem): Promise<ProcessedDocument> {
    if (!shareItem.uri) {
      throw new Error('No URI provided for image share');
    }

    const title = shareItem.metadata.originalName || `Shared Image ${new Date().toLocaleDateString()}`;
    
    return await documentProcessor.processDocument(
      [shareItem.uri],
      title,
      {
        enableOCR: true,
        enableImageEnhancement: true,
        enableThumbnailGeneration: true,
      }
    );
  }

  /**
   * Process PDF share
   */
  private async processPDFShare(shareItem: ShareItem): Promise<ProcessedDocument> {
    if (!shareItem.uri) {
      throw new Error('No URI provided for PDF share');
    }

    // For PDF files, we would need to convert pages to images first
    // This is a simplified implementation
    const title = shareItem.metadata.originalName || `Shared PDF ${new Date().toLocaleDateString()}`;
    
    // Convert PDF to images (would require additional library like react-native-pdf)
    // For now, treat as a single file
    return await documentProcessor.processDocument(
      [shareItem.uri],
      title,
      {
        enableOCR: true,
        enableImageEnhancement: false,
        enableThumbnailGeneration: true,
      }
    );
  }

  /**
   * Process text share
   */
  private async processTextShare(shareItem: ShareItem): Promise<ProcessedDocument> {
    if (!shareItem.text) {
      throw new Error('No text provided for text share');
    }

    // Create a temporary text file
    const fileName = `shared_text_${Date.now()}.txt`;
    const tempFilePath = `${FileSystem.documentDirectory}temp/${fileName}`;
    
    await FileSystem.writeAsStringAsync(tempFilePath, shareItem.text);

    const title = shareItem.title || `Shared Text ${new Date().toLocaleDateString()}`;
    
    return await documentProcessor.processDocument(
      [tempFilePath],
      title,
      {
        enableOCR: false, // Text is already available
        enableImageEnhancement: false,
        enableThumbnailGeneration: false,
      }
    );
  }

  /**
   * Process file share
   */
  private async processFileShare(shareItem: ShareItem): Promise<ProcessedDocument> {
    if (!shareItem.uri) {
      throw new Error('No URI provided for file share');
    }

    const title = shareItem.metadata.originalName || `Shared File ${new Date().toLocaleDateString()}`;
    
    // Determine processing options based on file type
    const options = {
      enableOCR: shareItem.mimeType?.startsWith('image/') || shareItem.mimeType === 'application/pdf',
      enableImageEnhancement: shareItem.mimeType?.startsWith('image/'),
      enableThumbnailGeneration: true,
    };

    return await documentProcessor.processDocument(
      [shareItem.uri],
      title,
      options
    );
  }

  /**
   * Export methods
   */
  private async exportToPDF(
    document: ProcessedDocument,
    options: ShareExportOptions
  ): Promise<string> {
    // This would require a PDF generation library
    // For now, return the first page as fallback
    if (document.pages.length > 0) {
      return document.pages[0].processedUri;
    }
    throw new Error('No pages to export');
  }

  private async exportToImages(
    document: ProcessedDocument,
    options: ShareExportOptions
  ): Promise<string> {
    // Create a zip file with all images
    const exportDir = `${FileSystem.documentDirectory}exports/`;
    const zipPath = `${exportDir}${document.id}_images.zip`;
    
    // This would require a zip library
    // For now, return the first image
    if (document.pages.length > 0) {
      return document.pages[0].processedUri;
    }
    throw new Error('No images to export');
  }

  private async exportToText(
    document: ProcessedDocument,
    options: ShareExportOptions
  ): Promise<string> {
    const exportDir = `${FileSystem.documentDirectory}exports/`;
    const textPath = `${exportDir}${document.id}_text.txt`;
    
    let content = `Document: ${document.title}\n`;
    content += `Created: ${document.createdAt}\n`;
    content += `Pages: ${document.totalPages}\n\n`;
    
    if (options.includeAnalysis && document.analysisResults) {
      content += 'ANALYSIS RESULTS\n';
      content += '================\n\n';
      // Add analysis content
    }
    
    content += 'EXTRACTED TEXT\n';
    content += '==============\n\n';
    
    document.ocrResults?.forEach((result, index) => {
      content += `Page ${index + 1}:\n${result.text}\n\n`;
    });
    
    await FileSystem.writeAsStringAsync(textPath, content);
    return textPath;
  }

  private async exportToJSON(
    document: ProcessedDocument,
    options: ShareExportOptions
  ): Promise<string> {
    const exportDir = `${FileSystem.documentDirectory}exports/`;
    const jsonPath = `${exportDir}${document.id}_data.json`;
    
    const exportData = {
      document: options.includeMetadata ? document : {
        id: document.id,
        title: document.title,
        pages: document.pages.length,
        createdAt: document.createdAt,
      },
      ocrResults: document.ocrResults,
      analysisResults: options.includeAnalysis ? document.analysisResults : undefined,
    };
    
    await FileSystem.writeAsStringAsync(jsonPath, JSON.stringify(exportData, null, 2));
    return jsonPath;
  }

  /**
   * Utility methods
   */
  private parseShareURL(url: string): any {
    // Parse different share URL formats
    // This would handle various URL schemes and formats
    try {
      const parsed = Linking.parse(url);
      return {
        type: 'url',
        url: parsed.path,
        queryParams: parsed.queryParams,
      };
    } catch (error) {
      logger.error('Failed to parse share URL:', error);
      return null;
    }
  }

  private async importSharedFile(shareData: any): Promise<ShareImportResult> {
    // Implementation for file import
    throw new Error('File import not implemented');
  }

  private async importSharedText(shareData: any): Promise<ShareImportResult> {
    // Implementation for text import
    throw new Error('Text import not implemented');
  }

  private async importSharedURL(shareData: any): Promise<ShareImportResult> {
    // Implementation for URL import
    throw new Error('URL import not implemented');
  }

  private async importMultipleSharedItems(shareData: any): Promise<ShareImportResult[]> {
    // Implementation for multiple items import
    throw new Error('Multiple items import not implemented');
  }

  private createShareItemFromAsset(asset: any, source: ShareItem['source']): ShareItem {
    return {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type: this.getTypeFromMimeType(asset.mimeType),
      source,
      uri: asset.uri,
      mimeType: asset.mimeType,
      size: asset.size,
      metadata: {
        originalName: asset.name,
        timestamp: new Date().toISOString(),
      },
      processingStatus: 'pending',
    };
  }

  private getTypeFromMimeType(mimeType: string): ShareItem['type'] {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('text/')) return 'text';
    return 'file';
  }

  private async setupDeepLinking(): Promise<void> {
    try {
      // Register URL schemes for sharing
      const url = await Linking.getInitialURL();
      if (url) {
        logger.info('App opened with URL:', url);
        // Handle initial URL if needed
      }

      // Listen for URL changes
      Linking.addEventListener('url', (event) => {
        logger.info('Received URL:', event.url);
        this.handleIncomingShare(event.url).catch(error => {
          logger.error('Failed to handle incoming share from URL:', error);
        });
      });
    } catch (error) {
      logger.error('Failed to setup deep linking:', error);
    }
  }

  private async requestPermissions(): Promise<void> {
    try {
      // Request camera roll permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        logger.warn('Camera roll permissions not granted');
      }
    } catch (error) {
      logger.error('Failed to request permissions:', error);
    }
  }

  /**
   * Public methods
   */
  getSupportedMimeTypes(): string[] {
    return [...this.supportedMimeTypes];
  }

  getShareQueue(): ShareItem[] {
    return [...this.shareQueue];
  }

  clearShareQueue(): void {
    this.shareQueue = [];
  }

  async openSystemShareSheet(filePath: string, options: any = {}): Promise<void> {
    if (Platform.OS === 'android') {
      await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
        data: filePath,
        type: options.mimeType || 'application/octet-stream',
      });
    } else {
      await this.shareExportedDocument(filePath, options);
    }
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    try {
      // Clean up any temporary files
      const tempDir = `${FileSystem.documentDirectory}temp/`;
      const tempInfo = await FileSystem.getInfoAsync(tempDir);
      if (tempInfo.exists) {
        await FileSystem.deleteAsync(tempDir);
      }

      logger.info('Share integration service cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup share integration service:', error);
    }
  }
}

export const shareIntegrationService = new ShareIntegrationService();