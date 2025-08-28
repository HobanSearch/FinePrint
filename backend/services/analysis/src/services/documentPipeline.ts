import { createServiceLogger } from '@fineprintai/shared-logger';
import { analysisCache } from '@fineprintai/shared-cache';
import { PrismaClient } from '@prisma/client';
import { textProcessor, ExtractionResult } from './textProcessor';
import { embeddingService } from './embeddings';
import crypto from 'crypto';
import fetch from 'node-fetch';
import * as fileType from 'file-type';
import sharp from 'sharp';
import tesseract from 'tesseract.js';

const logger = createServiceLogger('document-pipeline');
const prisma = new PrismaClient();

export interface DocumentInput {
  // Input sources (exactly one must be provided)
  content?: string;
  url?: string;
  fileBuffer?: Buffer;
  filename?: string;
  
  // Metadata
  userId: string;
  teamId?: string;
  title?: string;
  documentType?: 'terms_of_service' | 'privacy_policy' | 'eula' | 'cookie_policy' | 'data_processing_agreement' | 'service_agreement' | 'other';
  language?: string;
  
  // Processing options
  options?: {
    enableOCR?: boolean;
    preserveFormatting?: boolean;
    extractImages?: boolean;
    detectLanguage?: boolean;
    validateContent?: boolean;
    enableDuplicateDetection?: boolean;
    customExtractors?: string[];
  };
}

export interface ProcessedDocument {
  id: string;
  title: string;
  content: string;
  contentHash: string;
  url?: string;
  filename?: string;
  documentType: string;
  language: string;
  wordCount: number;
  characterCount: number;
  
  // Processing metadata
  processingInfo: {
    extractionMethod: 'direct' | 'url' | 'file' | 'ocr';
    processingTimeMs: number;
    contentQuality: 'excellent' | 'good' | 'fair' | 'poor';
    detectedMimeType?: string;
    originalFileSize?: number;
    ocrConfidence?: number;
  };
  
  // Content analysis
  contentAnalysis: {
    readabilityScore?: number;
    sentimentScore?: number;
    keyPhrases: string[];
    entities: Array<{
      text: string;
      type: 'person' | 'organization' | 'location' | 'date' | 'money' | 'url' | 'email' | 'phone';
      confidence: number;
    }>;
    sections: Array<{
      title: string;
      startPosition: number;
      endPosition: number;
      wordCount: number;
    }>;
  };
  
  // Validation results
  validation: {
    isValid: boolean;
    issues: Array<{
      type: 'warning' | 'error';
      message: string;
      severity: 'low' | 'medium' | 'high';
    }>;
    duplicateOf?: string; // ID of duplicate document if found
    similarity?: number;
  };
  
  // Chunks for vector search
  chunks: Array<{
    id: string;
    content: string;
    position: number;
    wordCount: number;
    embedding?: number[];
  }>;
  
  createdAt: Date;
  updatedAt: Date;
}

export class DocumentProcessingPipeline {
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly SUPPORTED_MIME_TYPES = [
    'text/plain',
    'text/html',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp'
  ];

  async processDocument(input: DocumentInput): Promise<ProcessedDocument> {
    const startTime = Date.now();
    
    logger.info('Starting document processing', {
      userId: input.userId,
      hasContent: !!input.content,
      hasUrl: !!input.url,
      hasFile: !!input.fileBuffer,
      documentType: input.documentType
    });

    try {
      // Validate input
      this.validateInput(input);

      // Extract content based on input type
      let extractionResult: ExtractionResult;
      let extractionMethod: 'direct' | 'url' | 'file' | 'ocr';
      let originalFileSize: number | undefined;
      let detectedMimeType: string | undefined;
      let ocrConfidence: number | undefined;

      if (input.content) {
        extractionMethod = 'direct';
        extractionResult = await this.processDirectContent(input.content, input.options);
      } else if (input.url) {
        extractionMethod = 'url';
        extractionResult = await this.processUrl(input.url, input.options);
      } else if (input.fileBuffer && input.filename) {
        originalFileSize = input.fileBuffer.length;
        const fileTypeResult = await fileType.fromBuffer(input.fileBuffer);
        detectedMimeType = fileTypeResult?.mime;
        
        if (this.isImageType(detectedMimeType) && input.options?.enableOCR) {
          extractionMethod = 'ocr';
          const ocrResult = await this.processImageWithOCR(input.fileBuffer, input.options);
          extractionResult = ocrResult.extractionResult;
          ocrConfidence = ocrResult.confidence;
        } else {
          extractionMethod = 'file';
          extractionResult = await this.processFile(input.fileBuffer, input.filename, input.options);
        }
      } else {
        throw new Error('No valid input source provided');
      }

      // Generate content hash for duplicate detection
      const contentHash = crypto.createHash('sha256').update(extractionResult.content).digest('hex');

      // Check for duplicates if enabled
      let duplicateCheck: { isDuplicate: boolean; duplicateId?: string; similarity?: number } = {
        isDuplicate: false
      };
      
      if (input.options?.enableDuplicateDetection) {
        duplicateCheck = await this.checkForDuplicates(contentHash, extractionResult.content, input.userId);
      }

      // Perform content analysis
      const contentAnalysis = await this.analyzeContent(extractionResult.content);

      // Validate content quality
      const validation = await this.validateContent(extractionResult, duplicateCheck);

      // Create document chunks for vector search
      const chunks = await this.createDocumentChunks(extractionResult);

      // Generate embeddings if service is available
      if (embeddingService) {
        try {
          for (const chunk of chunks) {
            chunk.embedding = await embeddingService.generateEmbedding(chunk.content);
          }
        } catch (error) {
          logger.warn('Failed to generate embeddings', { error: error.message });
        }
      }

      // Determine document title
      const title = input.title || 
                   extractionResult.metadata.title || 
                   (input.url ? new URL(input.url).hostname : 
                    (input.filename || 'Untitled Document'));

      // Create document record
      const documentRecord = await this.createDocumentRecord({
        title,
        content: extractionResult.content,
        contentHash,
        url: input.url,
        filename: input.filename,
        documentType: input.documentType || extractionResult.metadata.documentType || 'other',
        language: input.language || extractionResult.metadata.language || 'en',
        userId: input.userId,
        teamId: input.teamId,
        wordCount: extractionResult.metadata.wordCount,
        characterCount: extractionResult.content.length,
        processingTimeMs: Date.now() - startTime,
        extractionMethod,
        originalFileSize,
        detectedMimeType,
        ocrConfidence,
        contentAnalysis,
        validation
      });

      // Store chunks separately for better performance
      if (chunks.length > 0) {
        await this.storeDocumentChunks(documentRecord.id, chunks);
      }

      // Build response
      const processedDocument: ProcessedDocument = {
        id: documentRecord.id,
        title: documentRecord.title,
        content: documentRecord.content,
        contentHash: documentRecord.contentHash,
        url: documentRecord.url || undefined,
        filename: documentRecord.filename || undefined,
        documentType: documentRecord.documentType,
        language: documentRecord.language,
        wordCount: documentRecord.wordCount,
        characterCount: documentRecord.characterCount,
        
        processingInfo: {
          extractionMethod,
          processingTimeMs: Date.now() - startTime,
          contentQuality: this.assessContentQuality(extractionResult, validation),
          detectedMimeType,
          originalFileSize,
          ocrConfidence
        },
        
        contentAnalysis,
        validation,
        chunks,
        
        createdAt: documentRecord.createdAt,
        updatedAt: documentRecord.updatedAt
      };

      logger.info('Document processing completed', {
        documentId: documentRecord.id,
        title: documentRecord.title,
        wordCount: documentRecord.wordCount,
        chunksCreated: chunks.length,
        processingTime: Date.now() - startTime,
        contentQuality: processedDocument.processingInfo.contentQuality
      });

      return processedDocument;

    } catch (error) {
      logger.error('Document processing failed', {
        error: error.message,
        userId: input.userId,
        processingTime: Date.now() - startTime
      });
      throw error;
    }
  }

  async getDocument(documentId: string, userId: string): Promise<ProcessedDocument | null> {
    try {
      const document = await prisma.document.findFirst({
        where: {
          id: documentId,
          userId,
          deletedAt: null
        }
      });

      if (!document) {
        return null;
      }

      // Get chunks
      const chunks = await this.getDocumentChunks(documentId);

      return this.mapDatabaseToProcessedDocument(document, chunks);

    } catch (error) {
      logger.error('Failed to get document', { error: error.message, documentId, userId });
      throw error;
    }
  }

  async searchDocuments(
    userId: string,
    query: {
      text?: string;
      documentType?: string;
      language?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<ProcessedDocument[]> {
    try {
      const { limit = 20, offset = 0 } = query;
      
      const where: any = {
        userId,
        deletedAt: null
      };

      if (query.documentType) {
        where.documentType = query.documentType;
      }

      if (query.language) {
        where.language = query.language;
      }

      if (query.text) {
        where.OR = [
          { title: { contains: query.text, mode: 'insensitive' } },
          { content: { contains: query.text, mode: 'insensitive' } }
        ];
      }

      const documents = await prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      });

      const processedDocuments = [];
      for (const doc of documents) {
        const chunks = await this.getDocumentChunks(doc.id);
        processedDocuments.push(this.mapDatabaseToProcessedDocument(doc, chunks));
      }

      return processedDocuments;

    } catch (error) {
      logger.error('Failed to search documents', { error: error.message, userId, query });
      throw error;
    }
  }

  private validateInput(input: DocumentInput): void {
    // Check that exactly one input source is provided
    const inputSources = [input.content, input.url, input.fileBuffer].filter(Boolean).length;
    if (inputSources !== 1) {
      throw new Error('Exactly one input source must be provided (content, url, or fileBuffer)');
    }

    // Validate file input
    if (input.fileBuffer) {
      if (!input.filename) {
        throw new Error('Filename is required when providing fileBuffer');
      }
      
      if (input.fileBuffer.length > this.MAX_FILE_SIZE) {
        throw new Error(`File size exceeds maximum limit of ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`);
      }
    }

    // Validate URL
    if (input.url) {
      try {
        new URL(input.url);
      } catch {
        throw new Error('Invalid URL provided');
      }
    }

    // Validate user ID
    if (!input.userId) {
      throw new Error('User ID is required');
    }
  }

  private async processDirectContent(content: string, options?: any): Promise<ExtractionResult> {
    return textProcessor.extractFromBuffer(
      Buffer.from(content, 'utf-8'),
      'direct-input.txt',
      {
        documentType: options?.documentType,
        language: options?.language,
        preserveFormatting: options?.preserveFormatting
      }
    );
  }

  private async processUrl(url: string, options?: any): Promise<ExtractionResult> {
    return textProcessor.extractFromURL(url, {
      documentType: options?.documentType,
      language: options?.language,
      preserveFormatting: options?.preserveFormatting
    });
  }

  private async processFile(fileBuffer: Buffer, filename: string, options?: any): Promise<ExtractionResult> {
    return textProcessor.extractFromBuffer(fileBuffer, filename, {
      documentType: options?.documentType,
      language: options?.language,
      preserveFormatting: options?.preserveFormatting
    });
  }

  private async processImageWithOCR(
    imageBuffer: Buffer,
    options?: any
  ): Promise<{ extractionResult: ExtractionResult; confidence: number }> {
    try {
      // Preprocess image for better OCR results
      const processedImage = await sharp(imageBuffer)
        .resize(null, 2000, { withoutEnlargement: true })
        .greyscale()
        .normalize()
        .sharpen()
        .toBuffer();

      // Perform OCR
      const result = await tesseract.recognize(processedImage, 'eng', {
        logger: m => logger.debug('OCR progress', { message: m })
      });

      const extractionResult: ExtractionResult = {
        content: result.data.text,
        metadata: {
          title: 'OCR Extracted Document',
          documentType: options?.documentType || 'other',
          language: options?.language || 'en',
          wordCount: result.data.text.split(/\s+/).length,
          extractionMethod: 'ocr'
        },
        chunks: []
      };

      // Create chunks from OCR text
      const chunkSize = 1000;
      const words = result.data.text.split(/\s+/);
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunkWords = words.slice(i, i + chunkSize);
        extractionResult.chunks.push({
          content: chunkWords.join(' '),
          metadata: {
            chunkIndex: Math.floor(i / chunkSize),
            startWord: i,
            endWord: Math.min(i + chunkSize - 1, words.length - 1)
          }
        });
      }

      return {
        extractionResult,
        confidence: result.data.confidence / 100 // Convert to 0-1 scale
      };

    } catch (error) {
      logger.error('OCR processing failed', { error: error.message });
      throw new Error(`OCR extraction failed: ${error.message}`);
    }
  }

  private isImageType(mimeType?: string): boolean {
    if (!mimeType) return false;
    return ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(mimeType);
  }

  private async checkForDuplicates(
    contentHash: string,
    content: string,
    userId: string
  ): Promise<{ isDuplicate: boolean; duplicateId?: string; similarity?: number }> {
    try {
      // Check for exact hash match
      const exactMatch = await prisma.document.findFirst({
        where: {
          contentHash,
          userId,
          deletedAt: null
        }
      });

      if (exactMatch) {
        return {
          isDuplicate: true,
          duplicateId: exactMatch.id,
          similarity: 1.0
        };
      }

      // For semantic similarity, we'd use embeddings
      // This is a simplified version
      const recentDocuments = await prisma.document.findMany({
        where: {
          userId,
          deletedAt: null,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        select: { id: true, content: true },
        take: 50
      });

      for (const doc of recentDocuments) {
        const similarity = this.calculateTextSimilarity(content, doc.content);
        if (similarity > 0.9) { // 90% similarity threshold
          return {
            isDuplicate: true,
            duplicateId: doc.id,
            similarity
          };
        }
      }

      return { isDuplicate: false };

    } catch (error) {
      logger.warn('Duplicate check failed', { error: error.message });
      return { isDuplicate: false };
    }
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity for now
    // In production, you'd use more sophisticated methods
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private async analyzeContent(content: string): Promise<ProcessedDocument['contentAnalysis']> {
    try {
      // Simple content analysis - in production you'd use more sophisticated NLP
      const keyPhrases = this.extractKeyPhrases(content);
      const entities = this.extractEntities(content);
      const sections = this.extractSections(content);
      
      return {
        keyPhrases,
        entities,
        sections,
        readabilityScore: this.calculateReadabilityScore(content),
        sentimentScore: this.calculateSentimentScore(content)
      };
    } catch (error) {
      logger.warn('Content analysis failed', { error: error.message });
      return {
        keyPhrases: [],
        entities: [],
        sections: []
      };
    }
  }

  private extractKeyPhrases(content: string): string[] {
    // Simple keyword extraction
    const words = content.toLowerCase().split(/\s+/);
    const wordFreq = new Map<string, number>();
    
    // Filter out common words and count frequencies
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    for (const word of words) {
      const cleaned = word.replace(/[^\w]/g, '');
      if (cleaned.length > 3 && !stopWords.has(cleaned)) {
        wordFreq.set(cleaned, (wordFreq.get(cleaned) || 0) + 1);
      }
    }
    
    return Array.from(wordFreq.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word);
  }

  private extractEntities(content: string): Array<{
    text: string;
    type: 'person' | 'organization' | 'location' | 'date' | 'money' | 'url' | 'email' | 'phone';
    confidence: number;
  }> {
    const entities = [];
    
    // Simple regex-based entity extraction
    const patterns = {
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      url: /https?:\/\/[^\s]+/g,
      phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      money: /\$[\d,]+\.?\d*/g,
      date: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g
    };
    
    for (const [type, pattern] of Object.entries(patterns)) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          entities.push({
            text: match,
            type: type as any,
            confidence: 0.8 // Simple confidence score
          });
        }
      }
    }
    
    return entities.slice(0, 50); // Limit results
  }

  private extractSections(content: string): Array<{
    title: string;
    startPosition: number;
    endPosition: number;
    wordCount: number;
  }> {
    const sections = [];
    const lines = content.split('\n');
    let currentPosition = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Simple section detection based on capitalization and length
      if (line.length > 0 && line.length < 100 && 
          (line === line.toUpperCase() || /^\d+\./.test(line))) {
        
        const startPosition = currentPosition;
        let endPosition = currentPosition + line.length;
        let sectionContent = line;
        
        // Look ahead for section content
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine.length > 0 && nextLine.length < 100 && 
              (nextLine === nextLine.toUpperCase() || /^\d+\./.test(nextLine))) {
            break; // Next section found
          }
          sectionContent += ' ' + nextLine;
          endPosition += nextLine.length + 1;
        }
        
        sections.push({
          title: line,
          startPosition,
          endPosition,
          wordCount: sectionContent.split(/\s+/).length
        });
      }
      
      currentPosition += line.length + 1;
    }
    
    return sections;
  }

  private calculateReadabilityScore(content: string): number {
    // Simplified Flesch Reading Ease score
    const sentences = content.split(/[.!?]+/).length;
    const words = content.split(/\s+/).length;
    const syllables = this.countSyllables(content);
    
    const avgWordsPerSentence = words / sentences;
    const avgSyllablesPerWord = syllables / words;
    
    const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    return Math.max(0, Math.min(100, score));
  }

  private countSyllables(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    let syllableCount = 0;
    
    for (const word of words) {
      const cleaned = word.replace(/[^a-z]/g, '');
      if (cleaned.length === 0) continue;
      
      // Simple syllable counting
      const vowels = cleaned.match(/[aeiouy]+/g);
      syllableCount += vowels ? vowels.length : 1;
    }
    
    return syllableCount;
  }

  private calculateSentimentScore(content: string): number {
    // Very simple sentiment analysis
    const positiveWords = ['good', 'great', 'excellent', 'beneficial', 'secure', 'protected', 'safe'];
    const negativeWords = ['bad', 'poor', 'terrible', 'harmful', 'dangerous', 'risky', 'prohibited'];
    
    const words = content.toLowerCase().split(/\s+/);
    let score = 0;
    
    for (const word of words) {
      if (positiveWords.includes(word)) score += 1;
      if (negativeWords.includes(word)) score -= 1;
    }
    
    // Normalize to -1 to 1 range
    return Math.max(-1, Math.min(1, score / words.length * 100));
  }

  private async validateContent(
    extractionResult: ExtractionResult,
    duplicateCheck: any
  ): Promise<ProcessedDocument['validation']> {
    const issues = [];
    
    // Check content length
    if (extractionResult.content.length < 100) {
      issues.push({
        type: 'warning' as const,
        message: 'Document content is very short and may not provide meaningful analysis',
        severity: 'medium' as const
      });
    }
    
    if (extractionResult.content.length > 1000000) {
      issues.push({
        type: 'warning' as const,
        message: 'Document is very long and may require extended processing time',
        severity: 'low' as const
      });
    }
    
    // Check for duplicate
    if (duplicateCheck.isDuplicate) {
      issues.push({
        type: 'warning' as const,
        message: `Document appears to be a duplicate (${Math.round(duplicateCheck.similarity * 100)}% similar)`,
        severity: 'medium' as const
      });
    }
    
    // Check language detection confidence
    if (extractionResult.metadata.language && extractionResult.metadata.language !== 'en') {
      issues.push({
        type: 'warning' as const,
        message: `Document language detected as ${extractionResult.metadata.language}. Analysis may be less accurate.`,
        severity: 'low' as const
      });
    }
    
    return {
      isValid: issues.filter(i => i.type === 'error').length === 0,
      issues,
      duplicateOf: duplicateCheck.duplicateId,
      similarity: duplicateCheck.similarity
    };
  }

  private async createDocumentChunks(extractionResult: ExtractionResult): Promise<Array<{
    id: string;
    content: string;
    position: number;
    wordCount: number;
    embedding?: number[];
  }>> {
    const chunks = [];
    const chunkSize = 500; // words per chunk
    const overlap = 50; // word overlap between chunks
    
    const words = extractionResult.content.split(/\s+/);
    
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunkWords = words.slice(i, i + chunkSize);
      const chunkContent = chunkWords.join(' ');
      
      chunks.push({
        id: crypto.randomUUID(),
        content: chunkContent,
        position: i,
        wordCount: chunkWords.length
      });
      
      if (i + chunkSize >= words.length) break;
    }
    
    return chunks;
  }

  private assessContentQuality(
    extractionResult: ExtractionResult,
    validation: ProcessedDocument['validation']
  ): 'excellent' | 'good' | 'fair' | 'poor' {
    let score = 100;
    
    // Deduct for validation issues
    for (const issue of validation.issues) {
      if (issue.severity === 'high') score -= 30;
      else if (issue.severity === 'medium') score -= 20;
      else score -= 10;
    }
    
    // Deduct for content length issues
    if (extractionResult.content.length < 100) score -= 40;
    else if (extractionResult.content.length < 500) score -= 20;
    
    // Deduct for duplicate content
    if (validation.duplicateOf) score -= 25;
    
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    return 'poor';
  }

  private async createDocumentRecord(data: {
    title: string;
    content: string;
    contentHash: string;
    url?: string;
    filename?: string;
    documentType: string;
    language: string;
    userId: string;
    teamId?: string;
    wordCount: number;
    characterCount: number;
    processingTimeMs: number;
    extractionMethod: string;
    originalFileSize?: number;
    detectedMimeType?: string;
    ocrConfidence?: number;
    contentAnalysis: any;
    validation: any;
  }) {
    return await prisma.document.create({
      data: {
        title: data.title,
        content: data.content,
        contentHash: data.contentHash,
        url: data.url,
        filename: data.filename,
        documentType: data.documentType,
        language: data.language,
        userId: data.userId,
        teamId: data.teamId,
        wordCount: data.wordCount,
        characterCount: data.characterCount,
        processingMetadata: {
          processingTimeMs: data.processingTimeMs,
          extractionMethod: data.extractionMethod,
          originalFileSize: data.originalFileSize,
          detectedMimeType: data.detectedMimeType,
          ocrConfidence: data.ocrConfidence,
          contentAnalysis: data.contentAnalysis,
          validation: data.validation
        }
      }
    });
  }

  private async storeDocumentChunks(documentId: string, chunks: any[]): Promise<void> {
    if (chunks.length === 0) return;
    
    try {
      await prisma.documentChunk.createMany({
        data: chunks.map((chunk, index) => ({
          id: chunk.id,
          documentId,
          content: chunk.content,
          position: index,
          wordCount: chunk.wordCount,
          embedding: chunk.embedding ? JSON.stringify(chunk.embedding) : null
        }))
      });
    } catch (error) {
      logger.error('Failed to store document chunks', { error: error.message, documentId });
    }
  }

  private async getDocumentChunks(documentId: string): Promise<any[]> {
    try {
      const chunks = await prisma.documentChunk.findMany({
        where: { documentId },
        orderBy: { position: 'asc' }
      });

      return chunks.map(chunk => ({
        id: chunk.id,
        content: chunk.content,
        position: chunk.position,
        wordCount: chunk.wordCount,
        embedding: chunk.embedding ? JSON.parse(chunk.embedding) : undefined
      }));
    } catch (error) {
      logger.error('Failed to get document chunks', { error: error.message, documentId });
      return [];
    }
  }

  private mapDatabaseToProcessedDocument(document: any, chunks: any[]): ProcessedDocument {
    const metadata = document.processingMetadata || {};
    
    return {
      id: document.id,
      title: document.title,
      content: document.content,
      contentHash: document.contentHash,
      url: document.url,
      filename: document.filename,
      documentType: document.documentType,
      language: document.language,
      wordCount: document.wordCount,
      characterCount: document.characterCount,
      
      processingInfo: {
        extractionMethod: metadata.extractionMethod || 'unknown',
        processingTimeMs: metadata.processingTimeMs || 0,
        contentQuality: this.assessContentQualityFromMetadata(metadata),
        detectedMimeType: metadata.detectedMimeType,
        originalFileSize: metadata.originalFileSize,
        ocrConfidence: metadata.ocrConfidence
      },
      
      contentAnalysis: metadata.contentAnalysis || {
        keyPhrases: [],
        entities: [],
        sections: []
      },
      
      validation: metadata.validation || {
        isValid: true,
        issues: []
      },
      
      chunks,
      
      createdAt: document.createdAt,
      updatedAt: document.updatedAt
    };
  }

  private assessContentQualityFromMetadata(metadata: any): 'excellent' | 'good' | 'fair' | 'poor' {
    const validation = metadata.validation;
    if (!validation) return 'good';
    
    const errorCount = validation.issues?.filter((i: any) => i.type === 'error').length || 0;
    const warningCount = validation.issues?.filter((i: any) => i.type === 'warning').length || 0;
    
    if (errorCount > 0) return 'poor';
    if (warningCount > 2) return 'fair';
    if (warningCount > 0) return 'good';
    return 'excellent';
  }
}

// Singleton instance
export const documentPipeline = new DocumentProcessingPipeline();