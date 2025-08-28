/**
 * Request Pre-processor for Optimization
 */

import pino from 'pino';
import * as crypto from 'crypto';
import { encode } from 'gpt-tokenizer';
import { RequestContext, ComplexityLevel, ModelCapability } from '../types';

export interface ProcessedDocument {
  original: any;
  optimized: any;
  compressionRatio: number;
  originalTokens: number;
  optimizedTokens: number;
  sections: DocumentSection[];
  metadata: DocumentMetadata;
  hash: string;
  dedupKey?: string;
}

export interface DocumentSection {
  id: string;
  type: SectionType;
  content: string;
  tokens: number;
  importance: number; // 0-1
  canCompress: boolean;
  canOmit: boolean;
  compressed?: string;
}

export enum SectionType {
  TITLE = 'TITLE',
  HEADER = 'HEADER',
  PARAGRAPH = 'PARAGRAPH',
  LIST = 'LIST',
  TABLE = 'TABLE',
  CODE = 'CODE',
  LEGAL = 'LEGAL',
  FOOTER = 'FOOTER',
  METADATA = 'METADATA'
}

export interface DocumentMetadata {
  type: string;
  language: string;
  size: number;
  complexity: ComplexityLevel;
  hasLegalTerms: boolean;
  hasPII: boolean;
  estimatedProcessingTime: number;
  requiredCapabilities: ModelCapability[];
}

export interface CompressionStrategy {
  level: 'none' | 'light' | 'moderate' | 'aggressive';
  preserveLegal: boolean;
  preservePII: boolean;
  maxTokenReduction: number; // percentage
  minImportanceThreshold: number; // 0-1
}

export interface TokenOptimization {
  strategy: 'truncate' | 'summarize' | 'extract' | 'hybrid';
  maxTokens: number;
  preserveStructure: boolean;
  priorityPatterns: string[];
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  originalRequestId?: string;
  similarity: number;
  canReuse: boolean;
}

export interface EarlyTerminationCheck {
  shouldTerminate: boolean;
  reason?: string;
  confidence: number;
  partialResult?: any;
}

export class PreProcessor {
  private logger: pino.Logger;
  private compressionStrategy: CompressionStrategy;
  private tokenOptimization: TokenOptimization;
  private requestCache: Map<string, ProcessedDocument> = new Map();
  private deduplicationIndex: Map<string, string> = new Map();
  private patternCache: Map<string, any> = new Map();

  constructor(
    compressionStrategy?: Partial<CompressionStrategy>,
    tokenOptimization?: Partial<TokenOptimization>
  ) {
    this.logger = pino({ name: 'pre-processor' });
    
    this.compressionStrategy = {
      level: 'moderate',
      preserveLegal: true,
      preservePII: true,
      maxTokenReduction: 50, // 50% max reduction
      minImportanceThreshold: 0.3,
      ...compressionStrategy
    };
    
    this.tokenOptimization = {
      strategy: 'hybrid',
      maxTokens: 4096,
      preserveStructure: true,
      priorityPatterns: [
        'terms', 'conditions', 'privacy', 'liability', 'warranty',
        'payment', 'subscription', 'cancellation', 'refund', 'data'
      ],
      ...tokenOptimization
    };
  }

  /**
   * Pre-process document for optimization
   */
  async processDocument(
    document: any,
    context: RequestContext
  ): Promise<ProcessedDocument> {
    const startTime = Date.now();
    
    // Generate document hash
    const hash = this.generateHash(document);
    
    // Check cache
    const cached = this.requestCache.get(hash);
    if (cached) {
      this.logger.debug({ hash }, 'Using cached processed document');
      return cached;
    }
    
    // Parse document into sections
    const sections = this.parseDocument(document);
    
    // Analyze document metadata
    const metadata = this.analyzeDocument(document, sections);
    
    // Apply compression based on strategy
    const optimizedSections = await this.compressSections(sections, metadata);
    
    // Optimize tokens
    const tokenOptimized = this.optimizeTokens(optimizedSections, context);
    
    // Reconstruct optimized document
    const optimized = this.reconstructDocument(tokenOptimized);
    
    // Calculate metrics
    const originalTokens = this.countTokens(document);
    const optimizedTokens = this.countTokens(optimized);
    
    const processed: ProcessedDocument = {
      original: document,
      optimized,
      compressionRatio: 1 - (optimizedTokens / originalTokens),
      originalTokens,
      optimizedTokens,
      sections: tokenOptimized,
      metadata,
      hash,
      dedupKey: this.generateDedupKey(document, context)
    };
    
    // Cache result
    this.requestCache.set(hash, processed);
    
    // Cleanup old cache entries
    if (this.requestCache.size > 1000) {
      const toDelete = Array.from(this.requestCache.keys()).slice(0, 100);
      toDelete.forEach(key => this.requestCache.delete(key));
    }
    
    this.logger.info({
      hash,
      originalTokens,
      optimizedTokens,
      compressionRatio: processed.compressionRatio,
      processingTime: Date.now() - startTime
    }, 'Document processed');
    
    return processed;
  }

  /**
   * Check for request deduplication
   */
  checkDeduplication(
    document: any,
    context: RequestContext
  ): DeduplicationResult {
    const dedupKey = this.generateDedupKey(document, context);
    const existingRequestId = this.deduplicationIndex.get(dedupKey);
    
    if (existingRequestId) {
      return {
        isDuplicate: true,
        originalRequestId: existingRequestId,
        similarity: 1.0,
        canReuse: true
      };
    }
    
    // Check for similar requests
    const similarity = this.findSimilarRequest(dedupKey);
    
    if (similarity.score > 0.95) {
      return {
        isDuplicate: true,
        originalRequestId: similarity.requestId,
        similarity: similarity.score,
        canReuse: similarity.score > 0.98
      };
    }
    
    // Register this request
    this.deduplicationIndex.set(dedupKey, context.id);
    
    return {
      isDuplicate: false,
      similarity: similarity.score,
      canReuse: false
    };
  }

  /**
   * Check for early termination opportunity
   */
  checkEarlyTermination(
    document: any,
    context: RequestContext,
    partialAnalysis?: any
  ): EarlyTerminationCheck {
    // Check if document is too simple
    if (this.isSimpleDocument(document)) {
      return {
        shouldTerminate: true,
        reason: 'Document is simple enough for basic analysis',
        confidence: 0.95,
        partialResult: this.generateSimpleAnalysis(document)
      };
    }
    
    // Check if we have a cached pattern match
    const patternKey = this.generatePatternKey(document);
    const cachedPattern = this.patternCache.get(patternKey);
    
    if (cachedPattern) {
      return {
        shouldTerminate: true,
        reason: 'Matching pattern found in cache',
        confidence: 0.9,
        partialResult: cachedPattern
      };
    }
    
    // Check if partial analysis is sufficient
    if (partialAnalysis && this.isAnalysisSufficient(partialAnalysis, context)) {
      return {
        shouldTerminate: true,
        reason: 'Partial analysis meets requirements',
        confidence: 0.85,
        partialResult: partialAnalysis
      };
    }
    
    return {
      shouldTerminate: false,
      confidence: 0
    };
  }

  /**
   * Optimize tokens for specific model constraints
   */
  optimizeForModel(
    document: ProcessedDocument,
    modelConstraints: {
      maxTokens: number;
      contextWindow: number;
      capabilities: ModelCapability[];
    }
  ): ProcessedDocument {
    // Filter sections based on model capabilities
    const relevantSections = document.sections.filter(section => 
      this.isSectionRelevant(section, modelConstraints.capabilities)
    );
    
    // Ensure we fit within token limits
    let currentTokens = 0;
    const optimizedSections: DocumentSection[] = [];
    
    // Sort by importance
    relevantSections.sort((a, b) => b.importance - a.importance);
    
    for (const section of relevantSections) {
      if (currentTokens + section.tokens <= modelConstraints.maxTokens) {
        optimizedSections.push(section);
        currentTokens += section.tokens;
      } else if (section.importance > 0.7) {
        // Try to compress important sections
        const compressed = this.aggressiveCompress(section, modelConstraints.maxTokens - currentTokens);
        if (compressed.tokens <= modelConstraints.maxTokens - currentTokens) {
          optimizedSections.push(compressed);
          currentTokens += compressed.tokens;
        }
      }
    }
    
    return {
      ...document,
      optimized: this.reconstructDocument(optimizedSections),
      sections: optimizedSections,
      optimizedTokens: currentTokens
    };
  }

  // Private methods

  private parseDocument(document: any): DocumentSection[] {
    const sections: DocumentSection[] = [];
    const text = typeof document === 'string' ? document : JSON.stringify(document);
    
    // Simple parsing - in production, use proper document parser
    const paragraphs = text.split(/\n\n+/);
    
    paragraphs.forEach((paragraph, index) => {
      const type = this.detectSectionType(paragraph);
      const importance = this.calculateImportance(paragraph, type);
      
      sections.push({
        id: `section-${index}`,
        type,
        content: paragraph,
        tokens: this.countTokens(paragraph),
        importance,
        canCompress: importance < 0.7 && type !== SectionType.LEGAL,
        canOmit: importance < 0.3 && type !== SectionType.LEGAL
      });
    });
    
    return sections;
  }

  private detectSectionType(content: string): SectionType {
    const lower = content.toLowerCase();
    
    if (lower.includes('terms') || lower.includes('conditions') || lower.includes('agreement')) {
      return SectionType.LEGAL;
    }
    if (lower.startsWith('#') || lower.match(/^[A-Z\s]{3,}$/)) {
      return SectionType.HEADER;
    }
    if (lower.includes('```') || lower.includes('code')) {
      return SectionType.CODE;
    }
    if (lower.startsWith('*') || lower.startsWith('-') || lower.match(/^\d+\./)) {
      return SectionType.LIST;
    }
    if (lower.includes('|') && lower.split('|').length > 3) {
      return SectionType.TABLE;
    }
    
    return SectionType.PARAGRAPH;
  }

  private calculateImportance(content: string, type: SectionType): number {
    let importance = 0.5; // baseline
    
    // Type-based importance
    switch (type) {
      case SectionType.LEGAL:
        importance = 0.9;
        break;
      case SectionType.HEADER:
        importance = 0.7;
        break;
      case SectionType.CODE:
        importance = 0.6;
        break;
      case SectionType.TABLE:
        importance = 0.6;
        break;
    }
    
    // Content-based importance
    const lower = content.toLowerCase();
    for (const pattern of this.tokenOptimization.priorityPatterns) {
      if (lower.includes(pattern)) {
        importance = Math.min(1, importance + 0.1);
      }
    }
    
    // Length penalty for very long sections
    if (content.length > 1000) {
      importance *= 0.9;
    }
    
    return importance;
  }

  private analyzeDocument(
    document: any,
    sections: DocumentSection[]
  ): DocumentMetadata {
    const text = typeof document === 'string' ? document : JSON.stringify(document);
    
    // Detect document type
    let type = 'unknown';
    if (text.includes('terms of service') || text.includes('terms and conditions')) {
      type = 'terms_of_service';
    } else if (text.includes('privacy policy')) {
      type = 'privacy_policy';
    } else if (text.includes('end user license') || text.includes('eula')) {
      type = 'eula';
    }
    
    // Detect language (simplified)
    const language = 'en'; // Would use proper language detection
    
    // Check for legal terms
    const hasLegalTerms = sections.some(s => s.type === SectionType.LEGAL);
    
    // Check for PII patterns
    const hasPII = /\b(?:email|phone|address|ssn|credit card)\b/i.test(text);
    
    // Calculate complexity
    const avgTokensPerSection = sections.reduce((sum, s) => sum + s.tokens, 0) / sections.length;
    let complexity: ComplexityLevel;
    
    if (avgTokensPerSection < 50) {
      complexity = ComplexityLevel.SIMPLE;
    } else if (avgTokensPerSection < 150) {
      complexity = ComplexityLevel.MODERATE;
    } else if (avgTokensPerSection < 300) {
      complexity = ComplexityLevel.COMPLEX;
    } else {
      complexity = ComplexityLevel.VERY_COMPLEX;
    }
    
    // Determine required capabilities
    const requiredCapabilities: ModelCapability[] = [ModelCapability.DOCUMENT_ANALYSIS];
    
    if (hasLegalTerms) {
      requiredCapabilities.push(ModelCapability.LEGAL_INTERPRETATION);
    }
    if (type !== 'unknown') {
      requiredCapabilities.push(ModelCapability.PATTERN_DETECTION);
    }
    
    return {
      type,
      language,
      size: text.length,
      complexity,
      hasLegalTerms,
      hasPII,
      estimatedProcessingTime: avgTokensPerSection * sections.length * 10, // ms
      requiredCapabilities
    };
  }

  private async compressSections(
    sections: DocumentSection[],
    metadata: DocumentMetadata
  ): Promise<DocumentSection[]> {
    const compressed: DocumentSection[] = [];
    
    for (const section of sections) {
      if (!section.canCompress || this.compressionStrategy.level === 'none') {
        compressed.push(section);
        continue;
      }
      
      // Preserve legal and PII sections if configured
      if ((metadata.hasLegalTerms && this.compressionStrategy.preserveLegal && section.type === SectionType.LEGAL) ||
          (metadata.hasPII && this.compressionStrategy.preservePII)) {
        compressed.push(section);
        continue;
      }
      
      // Apply compression based on importance
      if (section.importance < this.compressionStrategy.minImportanceThreshold && section.canOmit) {
        // Omit low-importance sections in aggressive mode
        if (this.compressionStrategy.level === 'aggressive') {
          continue;
        }
      }
      
      // Compress content
      const compressedContent = this.compressContent(section.content, this.compressionStrategy.level);
      
      compressed.push({
        ...section,
        compressed: compressedContent,
        tokens: this.countTokens(compressedContent)
      });
    }
    
    return compressed;
  }

  private compressContent(content: string, level: 'light' | 'moderate' | 'aggressive'): string {
    let compressed = content;
    
    switch (level) {
      case 'light':
        // Remove extra whitespace
        compressed = compressed.replace(/\s+/g, ' ').trim();
        break;
        
      case 'moderate':
        // Remove extra whitespace and common words
        compressed = compressed.replace(/\s+/g, ' ').trim();
        compressed = this.removeCommonWords(compressed);
        break;
        
      case 'aggressive':
        // Summarize content
        compressed = this.summarizeContent(compressed);
        break;
    }
    
    return compressed;
  }

  private removeCommonWords(text: string): string {
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'];
    const words = text.split(' ');
    
    return words.filter(word => 
      !commonWords.includes(word.toLowerCase()) || word[0] === word[0].toUpperCase()
    ).join(' ');
  }

  private summarizeContent(text: string): string {
    // Simple extractive summarization
    const sentences = text.split(/[.!?]+/);
    const importantSentences = sentences
      .filter(s => s.length > 20)
      .filter(s => this.tokenOptimization.priorityPatterns.some(p => s.toLowerCase().includes(p)))
      .slice(0, 3);
    
    return importantSentences.join('. ') + '.';
  }

  private optimizeTokens(sections: DocumentSection[], context: RequestContext): DocumentSection[] {
    const maxTokens = this.tokenOptimization.maxTokens;
    let currentTokens = sections.reduce((sum, s) => sum + s.tokens, 0);
    
    if (currentTokens <= maxTokens) {
      return sections;
    }
    
    // Sort by importance
    const sorted = [...sections].sort((a, b) => b.importance - a.importance);
    const optimized: DocumentSection[] = [];
    let tokenCount = 0;
    
    for (const section of sorted) {
      const sectionTokens = section.compressed ? 
        this.countTokens(section.compressed) : 
        section.tokens;
      
      if (tokenCount + sectionTokens <= maxTokens) {
        optimized.push(section);
        tokenCount += sectionTokens;
      } else if (section.importance > 0.7) {
        // Try to fit important sections by truncating
        const remainingTokens = maxTokens - tokenCount;
        if (remainingTokens > 50) {
          const truncated = this.truncateToTokens(
            section.compressed || section.content,
            remainingTokens
          );
          
          optimized.push({
            ...section,
            content: truncated,
            tokens: remainingTokens
          });
          break;
        }
      }
    }
    
    return optimized;
  }

  private truncateToTokens(text: string, maxTokens: number): string {
    const tokens = encode(text);
    if (tokens.length <= maxTokens) {
      return text;
    }
    
    // Rough approximation - would use proper tokenizer
    const ratio = maxTokens / tokens.length;
    const targetLength = Math.floor(text.length * ratio);
    
    return text.substring(0, targetLength) + '...';
  }

  private reconstructDocument(sections: DocumentSection[]): any {
    const content = sections
      .map(s => s.compressed || s.content)
      .join('\n\n');
    
    return {
      content,
      sections: sections.length,
      tokens: this.countTokens(content)
    };
  }

  private countTokens(content: any): number {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    
    try {
      return encode(text).length;
    } catch {
      // Fallback to rough estimation
      return Math.ceil(text.length / 4);
    }
  }

  private generateHash(document: any): string {
    const text = typeof document === 'string' ? document : JSON.stringify(document);
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  private generateDedupKey(document: any, context: RequestContext): string {
    const docHash = this.generateHash(document);
    const contextKey = `${context.userTier}-${context.requestType}-${context.capabilities.join(',')}`;
    return `${docHash}-${contextKey}`;
  }

  private generatePatternKey(document: any): string {
    const text = typeof document === 'string' ? document : JSON.stringify(document);
    // Extract key patterns
    const patterns = this.tokenOptimization.priorityPatterns
      .filter(p => text.toLowerCase().includes(p))
      .join('-');
    
    return `pattern-${patterns}`;
  }

  private findSimilarRequest(dedupKey: string): { requestId: string; score: number } {
    let bestMatch = { requestId: '', score: 0 };
    
    for (const [key, requestId] of this.deduplicationIndex) {
      if (key === dedupKey) continue;
      
      const similarity = this.calculateSimilarity(key, dedupKey);
      if (similarity > bestMatch.score) {
        bestMatch = { requestId, score: similarity };
      }
    }
    
    return bestMatch;
  }

  private calculateSimilarity(key1: string, key2: string): number {
    // Simple Jaccard similarity
    const set1 = new Set(key1.split('-'));
    const set2 = new Set(key2.split('-'));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  private isSimpleDocument(document: any): boolean {
    const text = typeof document === 'string' ? document : JSON.stringify(document);
    
    // Check if document is simple
    return text.length < 1000 && 
           !this.tokenOptimization.priorityPatterns.some(p => text.toLowerCase().includes(p));
  }

  private generateSimpleAnalysis(document: any): any {
    return {
      analysis: 'Simple document - no significant issues found',
      patterns: [],
      riskScore: 0.1,
      recommendations: [],
      confidence: 0.95
    };
  }

  private isAnalysisSufficient(analysis: any, context: RequestContext): boolean {
    // Check if analysis meets requirements
    if (!analysis || !analysis.patterns) return false;
    
    // For simple requests, basic analysis is sufficient
    if (context.complexity === ComplexityLevel.SIMPLE) {
      return analysis.confidence > 0.8;
    }
    
    // For complex requests, need comprehensive analysis
    return false;
  }

  private isSectionRelevant(section: DocumentSection, capabilities: ModelCapability[]): boolean {
    // Check if section is relevant to model capabilities
    if (capabilities.includes(ModelCapability.LEGAL_INTERPRETATION) && 
        section.type === SectionType.LEGAL) {
      return true;
    }
    
    if (capabilities.includes(ModelCapability.PATTERN_DETECTION)) {
      return section.importance > 0.3;
    }
    
    return section.importance > 0.5;
  }

  private aggressiveCompress(section: DocumentSection, maxTokens: number): DocumentSection {
    const compressed = this.summarizeContent(section.content);
    const tokens = this.countTokens(compressed);
    
    if (tokens <= maxTokens) {
      return {
        ...section,
        compressed,
        tokens
      };
    }
    
    // Further truncate if needed
    const truncated = this.truncateToTokens(compressed, maxTokens);
    
    return {
      ...section,
      compressed: truncated,
      tokens: maxTokens
    };
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.requestCache.clear();
    this.deduplicationIndex.clear();
    this.patternCache.clear();
    this.logger.info('Caches cleared');
  }
}