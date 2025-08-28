import * as pdf from 'pdf-parse';
import * as mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { analysisCache } from '@fineprintai/shared-cache';
import crypto from 'crypto';

const logger = createServiceLogger('text-processor');

export interface DocumentChunk {
  id: string;
  content: string;
  position: number;
  length: number;
  metadata: {
    chunkIndex: number;
    totalChunks: number;
    documentType: string;
    language?: string;
    headings?: string[];
    pageNumber?: number;
  };
}

export interface ExtractionResult {
  content: string;
  metadata: {
    title?: string;
    author?: string;
    createdDate?: Date;
    modifiedDate?: Date;
    pageCount?: number;
    wordCount: number;
    characterCount: number;
    language?: string;
    documentType: string;
    extractionMethod: string;
  };
  chunks: DocumentChunk[];
}

export interface ChunkingOptions {
  maxChunkSize: number;
  overlapSize: number;
  respectSentences: boolean;
  respectParagraphs: boolean;
  preserveFormatting: boolean;
}

export interface ExtractionOptions {
  documentType?: string;
  language?: string;
  extractImages?: boolean;
  extractTables?: boolean;
  timeout?: number;
  chunking?: ChunkingOptions;
}

export class TextProcessor {
  private readonly DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
    maxChunkSize: 4000,
    overlapSize: 200,
    respectSentences: true,
    respectParagraphs: true,
    preserveFormatting: false
  };

  private readonly DEFAULT_EXTRACTION_OPTIONS: ExtractionOptions = {
    documentType: 'unknown',
    language: 'en',
    extractImages: false,
    extractTables: true,
    timeout: 30000,
    chunking: this.DEFAULT_CHUNKING_OPTIONS
  };

  async extractFromBuffer(
    buffer: Buffer,
    filename: string,
    options: ExtractionOptions = {}
  ): Promise<ExtractionResult> {
    const opts = { ...this.DEFAULT_EXTRACTION_OPTIONS, ...options };
    const fileExtension = this.getFileExtension(filename);
    
    // Generate cache key
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const cacheKey = `text_extraction:${contentHash}:${JSON.stringify(opts)}`;
    
    // Check cache first
    const cached = await analysisCache.get<ExtractionResult>(cacheKey);
    if (cached) {
      logger.debug('Using cached extraction result', { filename, cacheKey });
      return cached;
    }

    logger.info('Starting text extraction', { 
      filename, 
      fileSize: buffer.length, 
      fileExtension,
      options: opts 
    });

    let result: ExtractionResult;

    try {
      switch (fileExtension) {
        case 'pdf':
          result = await this.extractFromPDF(buffer, opts);
          break;
        case 'docx':
        case 'doc':
          result = await this.extractFromWord(buffer, opts);
          break;
        case 'txt':
          result = await this.extractFromText(buffer, opts);
          break;
        case 'html':
        case 'htm':
          result = await this.extractFromHTML(buffer, opts);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      result.metadata.documentType = opts.documentType || this.detectDocumentType(result.content);
      result.metadata.language = opts.language || await this.detectLanguage(result.content);

      // Cache the result for 1 hour
      await analysisCache.set(cacheKey, result, 3600);

      logger.info('Text extraction completed', {
        filename,
        contentLength: result.content.length,
        chunksCount: result.chunks.length,
        wordCount: result.metadata.wordCount
      });

      return result;
    } catch (error) {
      logger.error('Text extraction failed', { 
        error: error.message, 
        filename, 
        fileExtension 
      });
      throw new Error(`Failed to extract text from ${filename}: ${error.message}`);
    }
  }

  async extractFromURL(
    url: string,
    options: ExtractionOptions = {}
  ): Promise<ExtractionResult> {
    const opts = { ...this.DEFAULT_EXTRACTION_OPTIONS, ...options };
    
    logger.info('Starting URL extraction', { url, options: opts });

    try {
      const response = await axios.get(url, {
        timeout: opts.timeout,
        headers: {
          'User-Agent': 'FinePrintAI/1.0 Document Analyzer',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        responseType: 'text'
      });

      const contentType = response.headers['content-type'] || '';
      const buffer = Buffer.from(response.data, 'utf-8');

      if (contentType.includes('application/pdf')) {
        return await this.extractFromPDF(buffer, opts);
      } else if (contentType.includes('text/html')) {
        return await this.extractFromHTML(buffer, opts, url);
      } else if (contentType.includes('text/plain')) {
        return await this.extractFromText(buffer, opts);
      } else {
        // Try to extract as HTML by default
        return await this.extractFromHTML(buffer, opts, url);
      }
    } catch (error) {
      logger.error('URL extraction failed', { error: error.message, url });
      throw new Error(`Failed to extract text from URL ${url}: ${error.message}`);
    }
  }

  private async extractFromPDF(
    buffer: Buffer,
    options: ExtractionOptions
  ): Promise<ExtractionResult> {
    try {
      const pdfData = await pdf(buffer);
      
      const content = this.cleanText(pdfData.text);
      const chunks = this.chunkText(content, options.chunking!, 'pdf');

      return {
        content,
        metadata: {
          title: pdfData.info?.Title,
          author: pdfData.info?.Author,
          createdDate: pdfData.info?.CreationDate ? new Date(pdfData.info.CreationDate) : undefined,
          modifiedDate: pdfData.info?.ModDate ? new Date(pdfData.info.ModDate) : undefined,
          pageCount: pdfData.numpages,
          wordCount: this.countWords(content),
          characterCount: content.length,
          documentType: options.documentType || 'pdf',
          extractionMethod: 'pdf-parse'
        },
        chunks
      };
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  private async extractFromWord(
    buffer: Buffer,
    options: ExtractionOptions
  ): Promise<ExtractionResult> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const content = this.cleanText(result.value);
      const chunks = this.chunkText(content, options.chunking!, 'docx');

      return {
        content,
        metadata: {
          wordCount: this.countWords(content),
          characterCount: content.length,
          documentType: options.documentType || 'docx',
          extractionMethod: 'mammoth'
        },
        chunks
      };
    } catch (error) {
      throw new Error(`Word document extraction failed: ${error.message}`);
    }
  }

  private async extractFromText(
    buffer: Buffer,
    options: ExtractionOptions
  ): Promise<ExtractionResult> {
    const content = this.cleanText(buffer.toString('utf-8'));
    const chunks = this.chunkText(content, options.chunking!, 'txt');

    return {
      content,
      metadata: {
        wordCount: this.countWords(content),
        characterCount: content.length,
        documentType: options.documentType || 'txt',
        extractionMethod: 'text'
      },
      chunks
    };
  }

  private async extractFromHTML(
    buffer: Buffer,
    options: ExtractionOptions,
    url?: string
  ): Promise<ExtractionResult> {
    try {
      const $ = cheerio.load(buffer.toString());
      
      // Remove script and style elements
      $('script, style, nav, header, footer, aside').remove();
      
      // Extract title
      const title = $('title').text().trim() || 
                   $('h1').first().text().trim() || 
                   'Untitled Document';

      // Extract main content
      let content = '';
      
      // Try to find main content areas
      const mainSelectors = [
        'main',
        '[role="main"]',
        '.content',
        '#content',
        '.main-content',
        'article',
        '.post-content',
        '.entry-content'
      ];

      let foundMainContent = false;
      for (const selector of mainSelectors) {
        const mainContent = $(selector);
        if (mainContent.length > 0) {
          content = mainContent.text();
          foundMainContent = true;
          break;
        }
      }

      // Fallback to body if no main content found
      if (!foundMainContent) {
        content = $('body').text();
      }

      content = this.cleanText(content);
      const chunks = this.chunkText(content, options.chunking!, 'html');

      return {
        content,
        metadata: {
          title,
          wordCount: this.countWords(content),
          characterCount: content.length,
          documentType: options.documentType || 'html',
          extractionMethod: 'cheerio'
        },
        chunks
      };
    } catch (error) {
      throw new Error(`HTML extraction failed: ${error.message}`);
    }
  }

  private chunkText(
    text: string,
    options: ChunkingOptions,
    documentType: string
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    
    if (text.length <= options.maxChunkSize) {
      // Text is small enough to fit in one chunk
      chunks.push({
        id: crypto.randomUUID(),
        content: text,
        position: 0,
        length: text.length,
        metadata: {
          chunkIndex: 0,
          totalChunks: 1,
          documentType
        }
      });
      return chunks;
    }

    let position = 0;
    let chunkIndex = 0;

    while (position < text.length) {
      let chunkEnd = Math.min(position + options.maxChunkSize, text.length);
      
      // Respect sentence boundaries if requested
      if (options.respectSentences && chunkEnd < text.length) {
        const sentenceEnd = this.findSentenceBoundary(text, chunkEnd);
        if (sentenceEnd > position + options.maxChunkSize * 0.5) {
          chunkEnd = sentenceEnd;
        }
      }

      // Respect paragraph boundaries if requested
      if (options.respectParagraphs && chunkEnd < text.length) {
        const paragraphEnd = this.findParagraphBoundary(text, chunkEnd);
        if (paragraphEnd > position + options.maxChunkSize * 0.3) {
          chunkEnd = paragraphEnd;
        }
      }

      const chunkContent = text.substring(position, chunkEnd);
      
      chunks.push({
        id: crypto.randomUUID(),
        content: chunkContent,
        position,
        length: chunkContent.length,
        metadata: {
          chunkIndex,
          totalChunks: 0, // Will be updated after all chunks are created
          documentType
        }
      });

      // Move position forward, accounting for overlap
      position = chunkEnd - (chunkIndex > 0 ? options.overlapSize : 0);
      chunkIndex++;
    }

    // Update total chunks count
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });

    logger.debug('Text chunking completed', {
      originalLength: text.length,
      chunksCount: chunks.length,
      avgChunkSize: chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length
    });

    return chunks;
  }

  private findSentenceBoundary(text: string, position: number): number {
    // Look for sentence endings within a reasonable range
    const searchStart = Math.max(0, position - 200);
    const searchEnd = Math.min(text.length, position + 200);
    const searchText = text.substring(searchStart, searchEnd);
    
    const sentenceEndings = /[.!?]+\s+[A-Z]/g;
    let match;
    let lastMatch = position;
    
    while ((match = sentenceEndings.exec(searchText)) !== null) {
      const actualPosition = searchStart + match.index + match[0].length - 1;
      if (actualPosition <= position) {
        lastMatch = actualPosition;
      } else {
        break;
      }
    }
    
    return lastMatch;
  }

  private findParagraphBoundary(text: string, position: number): number {
    // Look for paragraph breaks (double newlines)
    const before = text.lastIndexOf('\n\n', position);
    const after = text.indexOf('\n\n', position);
    
    if (before !== -1 && position - before < 500) {
      return before;
    }
    
    if (after !== -1 && after - position < 500) {
      return after;
    }
    
    // Fallback to single newline
    const singleNewline = text.lastIndexOf('\n', position);
    if (singleNewline !== -1 && position - singleNewline < 200) {
      return singleNewline;
    }
    
    return position;
  }

  private cleanText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove control characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize quotes
      .replace(/[""'']/g, '"')
      .replace(/['']/g, "'")
      // Remove excessive punctuation
      .replace(/([.!?]){3,}/g, '$1$1$1')
      // Trim
      .trim();
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  private detectDocumentType(content: string): string {
    const lowerContent = content.toLowerCase();
    
    // Legal document patterns
    const patterns = {
      'terms-of-service': [
        'terms of service',
        'terms of use',
        'user agreement',
        'service agreement'
      ],
      'privacy-policy': [
        'privacy policy',
        'privacy notice',
        'data protection',
        'information we collect'
      ],
      'eula': [
        'end user license',
        'software license',
        'eula',
        'license agreement'
      ],
      'cookie-policy': [
        'cookie policy',
        'cookie notice',
        'cookies and similar'
      ],
      'data-processing': [
        'data processing',
        'processing agreement',
        'data controller'
      ]
    };

    for (const [type, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => lowerContent.includes(keyword))) {
        return type;
      }
    }

    return 'general';
  }

  private async detectLanguage(content: string): Promise<string> {
    // Simple language detection based on common words
    const sample = content.substring(0, 1000).toLowerCase();
    
    const languagePatterns = {
      'en': ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one'],
      'es': ['que', 'del', 'con', 'una', 'por', 'para', 'como', 'más', 'pero', 'sus', 'les'],
      'fr': ['que', 'des', 'les', 'une', 'dans', 'avec', 'pour', 'sur', 'aux', 'ces', 'par'],
      'de': ['und', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einem', 'sich'],
      'it': ['che', 'del', 'della', 'dei', 'delle', 'con', 'per', 'una', 'dalla', 'negli']
    };

    let bestMatch = 'en';
    let bestScore = 0;

    for (const [lang, words] of Object.entries(languagePatterns)) {
      let score = 0;
      for (const word of words) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const matches = sample.match(regex);
        if (matches) {
          score += matches.length;
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = lang;
      }
    }

    return bestMatch;
  }

  async extractMetadata(buffer: Buffer, filename: string): Promise<any> {
    const extension = this.getFileExtension(filename);
    
    try {
      switch (extension) {
        case 'pdf':
          const pdfData = await pdf(buffer);
          return {
            title: pdfData.info?.Title,
            author: pdfData.info?.Author,
            subject: pdfData.info?.Subject,
            creator: pdfData.info?.Creator,
            producer: pdfData.info?.Producer,
            creationDate: pdfData.info?.CreationDate,
            modificationDate: pdfData.info?.ModDate,
            pages: pdfData.numpages,
            version: pdfData.version
          };
        
        default:
          return {
            filename,
            size: buffer.length,
            type: extension
          };
      }
    } catch (error) {
      logger.warn('Failed to extract metadata', { 
        error: error.message, 
        filename 
      });
      return {
        filename,
        size: buffer.length,
        type: extension
      };
    }
  }

  // Utility method to merge overlapping chunks if needed
  mergeChunks(chunks: DocumentChunk[], maxGap: number = 100): DocumentChunk[] {
    if (chunks.length <= 1) return chunks;

    const merged: DocumentChunk[] = [];
    let current = chunks[0];

    for (let i = 1; i < chunks.length; i++) {
      const next = chunks[i];
      const gap = next.position - (current.position + current.length);

      if (gap <= maxGap) {
        // Merge chunks
        const mergedContent = current.content + 
          (gap > 0 ? ' '.repeat(gap) : '') + 
          next.content;
        
        current = {
          id: crypto.randomUUID(),
          content: mergedContent,
          position: current.position,
          length: mergedContent.length,
          metadata: {
            ...current.metadata,
            chunkIndex: current.metadata.chunkIndex,
            totalChunks: 0 // Will be recalculated
          }
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    
    merged.push(current);

    // Recalculate indices
    merged.forEach((chunk, index) => {
      chunk.metadata.chunkIndex = index;
      chunk.metadata.totalChunks = merged.length;
    });

    return merged;
  }
}

// Singleton instance
export const textProcessor = new TextProcessor();