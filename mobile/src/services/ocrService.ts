/**
 * OCR Service - Document Text Recognition
 * Integrates ML Kit and Tesseract for comprehensive text extraction
 */

import * as MLKitTextRecognition from 'expo-ml-kit-text-recognition';
import TesseractOcr, { LANG_ENGLISH } from 'react-native-tesseract-ocr';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { logger } from '../utils/logger';
import { performanceMonitor } from '../utils/performance';

export interface OCRResult {
  text: string;
  confidence: number;
  blocks: TextBlock[];
  processingTime: number;
  method: 'mlkit' | 'tesseract' | 'hybrid';
}

export interface TextBlock {
  text: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  lines: TextLine[];
}

export interface TextLine {
  text: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  words: TextWord[];
}

export interface TextWord {
  text: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCROptions {
  language?: string;
  method?: 'mlkit' | 'tesseract' | 'hybrid';
  enhanceImage?: boolean;
  confidenceThreshold?: number;
  maxImageSize?: number;
}

class OCRService {
  private isInitialized = false;
  private tesseractLanguages: string[] = [LANG_ENGLISH];

  /**
   * Initialize OCR service
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing OCR service...');
      
      // Check ML Kit availability
      const mlKitAvailable = await this.checkMLKitAvailability();
      if (!mlKitAvailable) {
        logger.warn('ML Kit not available on this device');
      }

      // Initialize Tesseract if needed
      await this.initializeTesseract();

      this.isInitialized = true;
      logger.info('OCR service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize OCR service:', error);
      throw error;
    }
  }

  /**
   * Extract text from image using specified method
   */
  async extractText(
    imageUri: string,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const startTime = Date.now();
    
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const {
        method = 'hybrid',
        enhanceImage = true,
        confidenceThreshold = 0.5,
        maxImageSize = 2048,
        language = LANG_ENGLISH
      } = options;

      // Enhance image if requested
      let processedImageUri = imageUri;
      if (enhanceImage) {
        processedImageUri = await this.enhanceImageForOCR(imageUri, maxImageSize);
      }

      let result: OCRResult;

      switch (method) {
        case 'mlkit':
          result = await this.extractWithMLKit(processedImageUri);
          break;
        case 'tesseract':
          result = await this.extractWithTesseract(processedImageUri, language);
          break;
        case 'hybrid':
        default:
          result = await this.extractWithHybridMethod(processedImageUri, language);
          break;
      }

      // Filter results by confidence threshold
      result = this.filterByConfidence(result, confidenceThreshold);
      result.processingTime = Date.now() - startTime;

      logger.info(`OCR completed in ${result.processingTime}ms using ${result.method}`);
      performanceMonitor.recordMetric('ocr_processing_time', result.processingTime);

      return result;
    } catch (error) {
      logger.error('OCR extraction failed:', error);
      throw error;
    }
  }

  /**
   * Extract text using ML Kit
   */
  private async extractWithMLKit(imageUri: string): Promise<OCRResult> {
    try {
      const result = await MLKitTextRecognition.recognizeAsync(imageUri, {
        language: MLKitTextRecognition.TextRecognitionLanguage.LATIN,
      });

      return {
        text: result.text,
        confidence: this.calculateAverageConfidence(result.blocks),
        blocks: this.convertMLKitBlocks(result.blocks),
        processingTime: 0,
        method: 'mlkit'
      };
    } catch (error) {
      logger.error('ML Kit OCR failed:', error);
      throw error;
    }
  }

  /**
   * Extract text using Tesseract
   */
  private async extractWithTesseract(
    imageUri: string,
    language: string = LANG_ENGLISH
  ): Promise<OCRResult> {
    try {
      const text = await TesseractOcr.recognize(imageUri, language, {
        whitelist: null,
        blacklist: null,
      });

      return {
        text,
        confidence: 0.8, // Tesseract doesn't provide confidence scores
        blocks: [], // Simple text extraction without block information
        processingTime: 0,
        method: 'tesseract'
      };
    } catch (error) {
      logger.error('Tesseract OCR failed:', error);
      throw error;
    }
  }

  /**
   * Extract text using hybrid method (ML Kit + Tesseract)
   */
  private async extractWithHybridMethod(
    imageUri: string,
    language: string = LANG_ENGLISH
  ): Promise<OCRResult> {
    try {
      // Try ML Kit first (faster and more accurate for most cases)
      let mlKitResult: OCRResult | null = null;
      try {
        mlKitResult = await this.extractWithMLKit(imageUri);
      } catch (error) {
        logger.warn('ML Kit failed, falling back to Tesseract:', error);
      }

      // If ML Kit result is good enough, use it
      if (mlKitResult && mlKitResult.confidence > 0.7 && mlKitResult.text.length > 50) {
        return { ...mlKitResult, method: 'hybrid' };
      }

      // Otherwise, try Tesseract for better accuracy on difficult images
      const tesseractResult = await this.extractWithTesseract(imageUri, language);

      // Combine results if both are available
      if (mlKitResult) {
        const combinedText = this.combineTextResults(mlKitResult.text, tesseractResult.text);
        return {
          text: combinedText,
          confidence: Math.max(mlKitResult.confidence, tesseractResult.confidence),
          blocks: mlKitResult.blocks,
          processingTime: 0,
          method: 'hybrid'
        };
      }

      return { ...tesseractResult, method: 'hybrid' };
    } catch (error) {
      logger.error('Hybrid OCR failed:', error);
      throw error;
    }
  }

  /**
   * Enhance image for better OCR results
   */
  private async enhanceImageForOCR(
    imageUri: string,
    maxSize: number = 2048
  ): Promise<string> {
    try {
      const imageInfo = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          // Resize if too large
          { resize: { width: maxSize } },
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: false,
        }
      );

      // Additional enhancement could include:
      // - Contrast adjustment
      // - Noise reduction
      // - Sharpening
      // These would require native modules or additional libraries

      return imageInfo.uri;
    } catch (error) {
      logger.error('Image enhancement failed:', error);
      return imageUri; // Return original if enhancement fails
    }
  }

  /**
   * Check if ML Kit is available on device
   */
  private async checkMLKitAvailability(): Promise<boolean> {
    try {
      // This would typically check device capabilities
      // For now, assume it's available on modern devices
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize Tesseract with required languages
   */
  private async initializeTesseract(): Promise<void> {
    try {
      // Pre-download language data if needed
      // This is typically done during app installation
      logger.info('Tesseract initialized with languages:', this.tesseractLanguages);
    } catch (error) {
      logger.error('Tesseract initialization failed:', error);
      throw error;
    }
  }

  /**
   * Convert ML Kit blocks to our standard format
   */
  private convertMLKitBlocks(mlKitBlocks: any[]): TextBlock[] {
    return mlKitBlocks.map(block => ({
      text: block.text,
      confidence: block.confidence || 0.8,
      boundingBox: {
        x: block.frame?.x || 0,
        y: block.frame?.y || 0,
        width: block.frame?.width || 0,
        height: block.frame?.height || 0,
      },
      lines: block.lines?.map((line: any) => ({
        text: line.text,
        confidence: line.confidence || 0.8,
        boundingBox: {
          x: line.frame?.x || 0,
          y: line.frame?.y || 0,
          width: line.frame?.width || 0,
          height: line.frame?.height || 0,
        },
        words: line.words?.map((word: any) => ({
          text: word.text,
          confidence: word.confidence || 0.8,
          boundingBox: {
            x: word.frame?.x || 0,
            y: word.frame?.y || 0,
            width: word.frame?.width || 0,
            height: word.frame?.height || 0,
          },
        })) || []
      })) || []
    }));
  }

  /**
   * Calculate average confidence from blocks
   */
  private calculateAverageConfidence(blocks: any[]): number {
    if (!blocks || blocks.length === 0) return 0;
    
    const totalConfidence = blocks.reduce((sum, block) => sum + (block.confidence || 0.8), 0);
    return totalConfidence / blocks.length;
  }

  /**
   * Filter results by confidence threshold
   */
  private filterByConfidence(result: OCRResult, threshold: number): OCRResult {
    if (result.confidence < threshold) {
      logger.warn(`OCR confidence ${result.confidence} below threshold ${threshold}`);
    }

    // Filter blocks by confidence
    const filteredBlocks = result.blocks.filter(block => block.confidence >= threshold);

    return {
      ...result,
      blocks: filteredBlocks,
      text: filteredBlocks.map(block => block.text).join('\n')
    };
  }

  /**
   * Combine text results from multiple OCR methods
   */
  private combineTextResults(text1: string, text2: string): string {
    // Simple combination logic - could be more sophisticated
    // For now, return the longer result
    return text1.length > text2.length ? text1 : text2;
  }

  /**
   * Extract text from multiple images (batch processing)
   */
  async extractTextBatch(
    imageUris: string[],
    options: OCROptions = {}
  ): Promise<OCRResult[]> {
    const results: OCRResult[] = [];
    
    for (const imageUri of imageUris) {
      try {
        const result = await this.extractText(imageUri, options);
        results.push(result);
      } catch (error) {
        logger.error(`Failed to process image ${imageUri}:`, error);
        // Continue with other images
        results.push({
          text: '',
          confidence: 0,
          blocks: [],
          processingTime: 0,
          method: options.method || 'hybrid'
        });
      }
    }

    return results;
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return this.tesseractLanguages;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    // Clean up any resources if needed
    logger.info('OCR service cleaned up');
  }
}

export const ocrService = new OCRService();