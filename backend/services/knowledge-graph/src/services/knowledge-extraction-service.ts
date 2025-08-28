import { createServiceLogger } from '@fineprintai/shared-logger';
import { KnowledgeGraphService } from './knowledge-graph-service';
import { LegalConcept, LegalClause, Pattern, Document } from './legal-ontology-service';
import axios from 'axios';
import { config } from '@fineprintai/shared-config';
import { compromise } from 'compromise';
import * as natural from 'natural';
import { z } from 'zod';
import { nanoid } from 'nanoid';

const logger = createServiceLogger('knowledge-extraction-service');

// Extraction Schemas
export const ExtractionRequestSchema = z.object({
  document_content: z.string(),
  document_type: z.enum(['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'EULA', 'COOKIE_POLICY']),
  document_metadata: z.object({
    title: z.string().optional(),
    company_name: z.string().optional(),
    company_domain: z.string().optional(),
    jurisdiction: z.string().optional(),
    language: z.string().default('en'),
  }).optional(),
  extraction_depth: z.enum(['BASIC', 'DETAILED', 'COMPREHENSIVE']).default('DETAILED'),
  enable_pattern_matching: z.boolean().default(true),
  enable_concept_extraction: z.boolean().default(true),
  enable_relationship_inference: z.boolean().default(true),
});

export const ExtractionResultSchema = z.object({
  extraction_id: z.string(),
  document_id: z.string(),
  extracted_concepts: z.array(z.object({
    concept: z.any(), // LegalConcept
    confidence: z.number().min(0).max(1),
    evidence_text: z.string(),
    position: z.object({
      start: z.number(),
      end: z.number(),
    }).optional(),
  })),
  extracted_clauses: z.array(z.object({
    clause: z.any(), // LegalClause
    confidence: z.number().min(0).max(1),
    matched_patterns: z.array(z.string()),
    risk_assessment: z.object({
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
      risk_factors: z.array(z.string()),
      impact_areas: z.array(z.string()),
    }),
  })),
  inferred_relationships: z.array(z.object({
    from_id: z.string(),
    to_id: z.string(),
    relationship_type: z.string(),
    confidence: z.number().min(0).max(1),
    evidence: z.string(),
  })),
  extraction_metadata: z.object({
    processing_time_ms: z.number(),
    extraction_method: z.string(),
    confidence_threshold: z.number(),
    patterns_matched: z.number(),
    concepts_identified: z.number(),
  }),
  quality_metrics: z.object({
    completeness_score: z.number().min(0).max(1),
    accuracy_estimate: z.number().min(0).max(1),
    consistency_score: z.number().min(0).max(1),
  }),
});

export type ExtractionRequest = z.infer<typeof ExtractionRequestSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export interface TextSegment {
  text: string;
  start_position: number;
  end_position: number;
  segment_type: 'PARAGRAPH' | 'SECTION' | 'CLAUSE' | 'LIST_ITEM';
  importance_score: number;
}

export interface ConceptCandidate {
  text: string;
  confidence: number;
  position: { start: number; end: number };
  features: {
    pos_tags: string[];
    entities: string[];
    legal_indicators: string[];
    context_clues: string[];
  };
}

/**
 * Knowledge Extraction Service - Automatically extracts legal concepts,
 * clauses, and relationships from legal documents using NLP and ML techniques
 */
export class KnowledgeExtractionService {
  private knowledgeGraph: KnowledgeGraphService;
  private sentenceTokenizer: any;
  private wordTokenizer: any;
  private stemmer: any;
  private posClassifier: any;
  
  constructor(knowledgeGraph: KnowledgeGraphService) {
    this.knowledgeGraph = knowledgeGraph;
    this.initializeNLPTools();
  }

  private initializeNLPTools(): void {
    this.sentenceTokenizer = new natural.SentenceTokenizer();
    this.wordTokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    // POS classifier would be initialized here
  }

  /**
   * Extract knowledge from a legal document
   */
  async extractKnowledge(request: ExtractionRequest): Promise<ExtractionResult> {
    const startTime = Date.now();
    const extractionId = nanoid();
    
    try {
      logger.info('Starting knowledge extraction', {
        extractionId,
        documentType: request.document_type,
        contentLength: request.document_content.length,
        depth: request.extraction_depth,
      });

      const validatedRequest = ExtractionRequestSchema.parse(request);

      // Step 1: Preprocess and segment the document
      const segments = await this.preprocessDocument(validatedRequest.document_content);

      // Step 2: Extract concepts if enabled
      let extractedConcepts: any[] = [];
      if (validatedRequest.enable_concept_extraction) {
        extractedConcepts = await this.extractConcepts(segments, validatedRequest.extraction_depth);
      }

      // Step 3: Extract clauses using pattern matching if enabled
      let extractedClauses: any[] = [];
      if (validatedRequest.enable_pattern_matching) {
        extractedClauses = await this.extractClauses(segments, validatedRequest.extraction_depth);
      }

      // Step 4: Create document entity
      const document = await this.createDocumentEntity(validatedRequest);

      // Step 5: Infer relationships if enabled
      let inferredRelationships: any[] = [];
      if (validatedRequest.enable_relationship_inference) {
        inferredRelationships = await this.inferRelationships(
          extractedConcepts,
          extractedClauses,
          segments
        );
      }

      // Step 6: Store knowledge in graph
      await this.storeExtractedKnowledge(
        document,
        extractedConcepts,
        extractedClauses,
        inferredRelationships
      );

      // Step 7: Calculate quality metrics
      const qualityMetrics = await this.calculateQualityMetrics(
        extractedConcepts,
        extractedClauses,
        segments
      );

      const processingTime = Date.now() - startTime;

      // Step 8: Compile results
      const result: ExtractionResult = {
        extraction_id: extractionId,
        document_id: document.id,
        extracted_concepts: extractedConcepts,
        extracted_clauses: extractedClauses,
        inferred_relationships: inferredRelationships,
        extraction_metadata: {
          processing_time_ms: processingTime,
          extraction_method: 'HYBRID_NLP_ML',
          confidence_threshold: 0.7,
          patterns_matched: extractedClauses.length,
          concepts_identified: extractedConcepts.length,
        },
        quality_metrics: qualityMetrics,
      };

      logger.info('Knowledge extraction completed', {
        extractionId,
        processingTime,
        conceptsExtracted: extractedConcepts.length,
        clausesExtracted: extractedClauses.length,
        relationshipsInferred: inferredRelationships.length,
        qualityScore: qualityMetrics.completeness_score,
      });

      return ExtractionResultSchema.parse(result);

    } catch (error) {
      logger.error('Knowledge extraction failed', {
        error,
        extractionId,
        processingTime: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Batch extract knowledge from multiple documents
   */
  async batchExtractKnowledge(
    requests: ExtractionRequest[],
    batchSize: number = 5
  ): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];
    
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      const batchPromises = batch.map(request => 
        this.extractKnowledge(request).catch(error => {
          logger.error('Batch extraction item failed', { error, index: i });
          return null;
        })
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null) as ExtractionResult[]);
      
      logger.debug('Batch extraction completed', {
        batchIndex: Math.floor(i / batchSize) + 1,
        totalBatches: Math.ceil(requests.length / batchSize),
        successfulExtractions: batchResults.filter(r => r !== null).length,
      });
    }
    
    return results;
  }

  // ===== DOCUMENT PREPROCESSING =====

  private async preprocessDocument(content: string): Promise<TextSegment[]> {
    try {
      // Clean and normalize text
      const cleanedContent = this.cleanText(content);
      
      // Segment into logical units
      const segments = await this.segmentDocument(cleanedContent);
      
      // Calculate importance scores for each segment
      const scoredSegments = await this.scoreSegmentImportance(segments);
      
      return scoredSegments;

    } catch (error) {
      logger.error('Document preprocessing failed', { error });
      throw error;
    }
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s.,;:!?()\-]/g, '') // Remove special characters
      .trim();
  }

  private async segmentDocument(text: string): Promise<TextSegment[]> {
    const segments: TextSegment[] = [];
    
    // Use compromise.js for sentence segmentation
    const doc = compromise(text);
    const sentences = doc.sentences().out('array') as string[];
    
    let currentPosition = 0;
    
    for (const sentence of sentences) {
      const startPos = text.indexOf(sentence, currentPosition);
      const endPos = startPos + sentence.length;
      
      segments.push({
        text: sentence,
        start_position: startPos,
        end_position: endPos,
        segment_type: this.classifySegmentType(sentence),
        importance_score: 0, // Will be calculated later
      });
      
      currentPosition = endPos;
    }
    
    return segments;
  }

  private classifySegmentType(text: string): TextSegment['segment_type'] {
    // Simple heuristics for segment classification
    if (text.match(/^\d+\./)) return 'LIST_ITEM';
    if (text.match(/^[A-Z][A-Z\s]+$/)) return 'SECTION';
    if (text.length > 200) return 'PARAGRAPH';
    return 'CLAUSE';
  }

  private async scoreSegmentImportance(segments: TextSegment[]): Promise<TextSegment[]> {
    const legalKeywords = [
      'liability', 'privacy', 'data', 'termination', 'dispute', 'arbitration',
      'consent', 'cookies', 'sharing', 'license', 'agreement', 'breach'
    ];
    
    return segments.map(segment => {
      const words = segment.text.toLowerCase().split(/\s+/);
      const keywordCount = words.filter(word => 
        legalKeywords.some(keyword => word.includes(keyword))
      ).length;
      
      // Calculate importance based on keyword density and segment length
      const keywordDensity = keywordCount / words.length;
      const lengthWeight = Math.min(1, segment.text.length / 100);
      
      segment.importance_score = (keywordDensity * 0.7) + (lengthWeight * 0.3);
      return segment;
    });
  }

  // ===== CONCEPT EXTRACTION =====

  private async extractConcepts(
    segments: TextSegment[],
    depth: string
  ): Promise<Array<{
    concept: LegalConcept;
    confidence: number;
    evidence_text: string;
    position?: { start: number; end: number };
  }>> {
    const extractedConcepts = [];
    
    // Get existing concepts from knowledge graph for matching
    const ontologyService = this.knowledgeGraph.getOntologyService();
    const existingConcepts = await this.getAllExistingConcepts();
    
    for (const segment of segments) {
      if (segment.importance_score < 0.3) continue; // Skip unimportant segments
      
      // Extract concept candidates from segment
      const candidates = await this.extractConceptCandidates(segment);
      
      for (const candidate of candidates) {
        // Match against existing concepts or create new ones
        const matchedConcept = await this.matchOrCreateConcept(
          candidate,
          existingConcepts,
          segment
        );
        
        if (matchedConcept) {
          extractedConcepts.push({
            concept: matchedConcept.concept,
            confidence: matchedConcept.confidence,
            evidence_text: candidate.text,
            position: candidate.position,
          });
        }
      }
    }
    
    // Deduplicate and sort by confidence
    return this.deduplicateConcepts(extractedConcepts)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, depth === 'COMPREHENSIVE' ? 50 : depth === 'DETAILED' ? 25 : 10);
  }

  private async extractConceptCandidates(segment: TextSegment): Promise<ConceptCandidate[]> {
    const candidates: ConceptCandidate[] = [];
    const doc = compromise(segment.text);
    
    // Extract noun phrases as concept candidates
    const nounPhrases = doc.nouns().out('array') as string[];
    
    for (const phrase of nounPhrases) {
      const startPos = segment.text.indexOf(phrase);
      if (startPos === -1) continue;
      
      const candidate: ConceptCandidate = {
        text: phrase,
        confidence: this.calculateConceptCandidateConfidence(phrase, segment.text),
        position: {
          start: segment.start_position + startPos,
          end: segment.start_position + startPos + phrase.length,
        },
        features: {
          pos_tags: ['NOUN'], // Simplified
          entities: doc.people().out('array').concat(doc.places().out('array')) as string[],
          legal_indicators: this.findLegalIndicators(phrase),
          context_clues: this.extractContextClues(phrase, segment.text),
        },
      };
      
      candidates.push(candidate);
    }
    
    return candidates.filter(c => c.confidence > 0.5);
  }

  private calculateConceptCandidateConfidence(phrase: string, context: string): number {
    let confidence = 0.5; // Base confidence
    
    // Boost for legal terminology
    const legalTerms = ['data', 'privacy', 'liability', 'consent', 'breach'];
    if (legalTerms.some(term => phrase.toLowerCase().includes(term))) {
      confidence += 0.3;
    }
    
    // Boost for phrase length (multi-word concepts are often more specific)
    if (phrase.split(' ').length > 1) {
      confidence += 0.1;
    }
    
    // Boost for context relevance
    if (context.toLowerCase().includes('agreement') || context.toLowerCase().includes('terms')) {
      confidence += 0.1;
    }
    
    return Math.min(1.0, confidence);
  }

  private findLegalIndicators(text: string): string[] {
    const indicators = [];
    const legalPatterns = [
      /\b(shall|must|may|will|should)\b/gi,
      /\b(liable|responsible|obligation)\b/gi,
      /\b(terminate|cancel|suspend)\b/gi,
      /\b(collect|process|share|disclose)\b/gi,
    ];
    
    for (const pattern of legalPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        indicators.push(...matches.map(m => m.toLowerCase()));
      }
    }
    
    return [...new Set(indicators)];
  }

  private extractContextClues(phrase: string, context: string): string[] {
    const clues = [];
    const sentences = context.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      if (sentence.includes(phrase)) {
        // Extract keywords around the phrase
        const words = sentence.split(/\s+/);
        const phraseIndex = words.findIndex(word => sentence.includes(phrase));
        
        // Get surrounding words
        const start = Math.max(0, phraseIndex - 2);
        const end = Math.min(words.length, phraseIndex + 3);
        clues.push(...words.slice(start, end));
      }
    }
    
    return [...new Set(clues)].filter(clue => clue.length > 2);
  }

  // ===== CLAUSE EXTRACTION =====

  private async extractClauses(
    segments: TextSegment[],
    depth: string
  ): Promise<Array<{
    clause: LegalClause;
    confidence: number;
    matched_patterns: string[];
    risk_assessment: {
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      risk_factors: string[];
      impact_areas: string[];
    };
  }>> {
    const extractedClauses = [];
    
    // Get patterns from knowledge graph
    const patterns = await this.getActivePatterns();
    
    for (const segment of segments) {
      // Apply pattern matching
      const matchedPatterns = await this.matchPatterns(segment, patterns);
      
      for (const match of matchedPatterns) {
        const clause = await this.createClauseFromMatch(segment, match);
        const riskAssessment = await this.assessClauseRisk(clause, segment);
        
        extractedClauses.push({
          clause,
          confidence: match.confidence,
          matched_patterns: [match.pattern.id],
          risk_assessment: riskAssessment,
        });
      }
    }
    
    return extractedClauses
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, depth === 'COMPREHENSIVE' ? 100 : depth === 'DETAILED' ? 50 : 20);
  }

  // ===== RELATIONSHIP INFERENCE =====

  private async inferRelationships(
    concepts: any[],
    clauses: any[],
    segments: TextSegment[]
  ): Promise<Array<{
    from_id: string;
    to_id: string;
    relationship_type: string;
    confidence: number;
    evidence: string;
  }>> {
    const relationships = [];
    
    // Infer concept-concept relationships
    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const relationship = await this.inferConceptRelationship(
          concepts[i],
          concepts[j],
          segments
        );
        if (relationship) {
          relationships.push(relationship);
        }
      }
    }
    
    // Infer concept-clause relationships
    for (const concept of concepts) {
      for (const clause of clauses) {
        const relationship = await this.inferConceptClauseRelationship(
          concept,
          clause,
          segments
        );
        if (relationship) {
          relationships.push(relationship);
        }
      }
    }
    
    return relationships.filter(r => r.confidence > 0.6);
  }

  // ===== HELPER METHODS =====

  private async getAllExistingConcepts(): Promise<LegalConcept[]> {
    // Get concepts from knowledge graph
    const ontologyService = this.knowledgeGraph.getOntologyService();
    return await ontologyService.getConceptsByDifficulty(1, 10);
  }

  private async matchOrCreateConcept(
    candidate: ConceptCandidate,
    existingConcepts: LegalConcept[],
    segment: TextSegment
  ): Promise<{ concept: LegalConcept; confidence: number } | null> {
    // Try to match against existing concepts
    for (const existing of existingConcepts) {
      const similarity = this.calculateTextSimilarity(candidate.text, existing.name);
      if (similarity > 0.8) {
        return { concept: existing, confidence: similarity };
      }
    }
    
    // Create new concept if no match found and confidence is high enough
    if (candidate.confidence > 0.7) {
      const newConcept: Partial<LegalConcept> = {
        name: candidate.text,
        description: `Auto-extracted concept: ${candidate.text}`,
        category: this.inferConceptCategory(candidate),
        difficulty_level: Math.ceil(candidate.confidence * 5),
        importance_weight: candidate.confidence,
        keywords: [candidate.text.toLowerCase(), ...candidate.features.legal_indicators],
      };
      
      return { concept: newConcept as LegalConcept, confidence: candidate.confidence };
    }
    
    return null;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity
    const set1 = new Set(text1.toLowerCase().split(/\s+/));
    const set2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  private inferConceptCategory(candidate: ConceptCandidate): LegalConcept['category'] {
    const text = candidate.text.toLowerCase();
    
    if (text.includes('data') || text.includes('privacy') || text.includes('information')) {
      return 'DATA_PRIVACY';
    } else if (text.includes('liability') || text.includes('responsible')) {
      return 'LIABILITY';
    } else if (text.includes('terminate') || text.includes('cancel')) {
      return 'TERMINATION';
    } else if (text.includes('right') || text.includes('permission')) {
      return 'USER_RIGHTS';
    } else if (text.includes('cookie') || text.includes('tracking')) {
      return 'COOKIES_TRACKING';
    } else {
      return 'COMPLIANCE';
    }
  }

  private deduplicateConcepts(concepts: any[]): any[] {
    const seen = new Set();
    return concepts.filter(concept => {
      const key = concept.concept.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async getActivePatterns(): Promise<Pattern[]> {
    const ontologyService = this.knowledgeGraph.getOntologyService();
    return await ontologyService.getPatternsByEffectiveness(0.7);
  }

  private async matchPatterns(
    segment: TextSegment,
    patterns: Pattern[]
  ): Promise<Array<{ pattern: Pattern; confidence: number; match: string }>> {
    const matches = [];
    
    for (const pattern of patterns) {
      try {
        if (pattern.pattern_type === 'REGEX') {
          const regex = new RegExp(pattern.pattern_definition, 'gi');
          const match = segment.text.match(regex);
          if (match) {
            matches.push({
              pattern,
              confidence: pattern.accuracy,
              match: match[0],
            });
          }
        } else if (pattern.pattern_type === 'SEMANTIC') {
          // Simplified semantic matching
          const semanticMatch = this.performSemanticMatch(segment.text, pattern);
          if (semanticMatch.confidence > 0.7) {
            matches.push({
              pattern,
              confidence: semanticMatch.confidence,
              match: semanticMatch.text,
            });
          }
        }
      } catch (error) {
        logger.warn('Pattern matching failed', { error, patternId: pattern.id });
      }
    }
    
    return matches;
  }

  private performSemanticMatch(text: string, pattern: Pattern): { confidence: number; text: string } {
    // Simplified semantic matching using keyword overlap
    const patternKeywords = pattern.pattern_definition.toLowerCase().split(/\s+/);
    const textWords = text.toLowerCase().split(/\s+/);
    
    const matchCount = patternKeywords.filter(keyword => 
      textWords.some(word => word.includes(keyword))
    ).length;
    
    const confidence = matchCount / patternKeywords.length;
    
    return {
      confidence,
      text: text.substring(0, 100), // Return first part of text as match
    };
  }

  private async createClauseFromMatch(
    segment: TextSegment,
    match: { pattern: Pattern; confidence: number; match: string }
  ): Promise<LegalClause> {
    return {
      id: nanoid(),
      title: `${match.pattern.name} Clause`,
      description: `Auto-extracted clause matching pattern: ${match.pattern.name}`,
      text_content: segment.text,
      pattern_id: match.pattern.id,
      document_id: '', // Will be set when storing
      severity: match.pattern.severity,
      confidence_score: match.confidence,
      risk_factors: this.extractRiskFactors(segment.text),
      impact_areas: this.extractImpactAreas(segment.text),
      position_start: segment.start_position,
      position_end: segment.end_position,
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  private extractRiskFactors(text: string): string[] {
    const riskKeywords = [
      'unlimited liability', 'broad data collection', 'third party sharing',
      'automatic renewal', 'binding arbitration', 'class action waiver'
    ];
    
    return riskKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private extractImpactAreas(text: string): string[] {
    const impactAreas = [];
    
    if (text.toLowerCase().includes('data') || text.toLowerCase().includes('privacy')) {
      impactAreas.push('Data Privacy');
    }
    if (text.toLowerCase().includes('payment') || text.toLowerCase().includes('billing')) {
      impactAreas.push('Financial');
    }
    if (text.toLowerCase().includes('account') || text.toLowerCase().includes('service')) {
      impactAreas.push('Service Access');
    }
    
    return impactAreas;
  }

  private async assessClauseRisk(
    clause: LegalClause,
    segment: TextSegment
  ): Promise<{
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    risk_factors: string[];
    impact_areas: string[];
  }> {
    return {
      severity: clause.severity,
      risk_factors: clause.risk_factors,
      impact_areas: clause.impact_areas,
    };
  }

  private async createDocumentEntity(request: ExtractionRequest): Promise<Document> {
    const ontologyService = this.knowledgeGraph.getOntologyService();
    
    const document: Partial<Document> = {
      title: request.document_metadata?.title || 'Untitled Document',
      content: request.document_content,
      document_type: request.document_type,
      content_hash: this.generateContentHash(request.document_content),
      language: request.document_metadata?.language || 'en',
      company_name: request.document_metadata?.company_name,
      company_domain: request.document_metadata?.company_domain,
      word_count: request.document_content.split(/\s+/).length,
    };
    
    return await ontologyService.createDocument(
      document,
      request.document_metadata?.jurisdiction
    );
  }

  private generateContentHash(content: string): string {
    // Simple hash function - in production would use crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private async storeExtractedKnowledge(
    document: Document,
    concepts: any[],
    clauses: any[],
    relationships: any[]
  ): Promise<void> {
    try {
      // Store concepts and clauses in knowledge graph
      const conceptIds: string[] = [];
      
      for (const conceptData of concepts) {
        if (conceptData.concept.id) {
          conceptIds.push(conceptData.concept.id);
        }
      }
      
      // Store clauses with concept associations
      for (const clauseData of clauses) {
        clauseData.clause.document_id = document.id;
        await this.knowledgeGraph.getOntologyService().createLegalClause(
          clauseData.clause,
          conceptIds.slice(0, 5) // Limit associations
        );
      }
      
      // Store relationships
      for (const relationship of relationships) {
        await this.knowledgeGraph.getOntologyService().createRelationship(
          relationship.from_id,
          relationship.to_id,
          relationship.relationship_type as any,
          { confidence: relationship.confidence }
        );
      }
      
      // Update embeddings
      await this.knowledgeGraph.getEmbeddingsService().updateDocumentEmbeddings(document.id);
      
    } catch (error) {
      logger.error('Failed to store extracted knowledge', { error });
      throw error;
    }
  }

  private async calculateQualityMetrics(
    concepts: any[],
    clauses: any[],
    segments: TextSegment[]
  ): Promise<{
    completeness_score: number;
    accuracy_estimate: number;
    consistency_score: number;
  }> {
    // Calculate coverage of important segments
    const importantSegments = segments.filter(s => s.importance_score > 0.7);
    const coveredSegments = concepts.length + clauses.length;
    const completeness_score = Math.min(1.0, coveredSegments / Math.max(1, importantSegments.length));
    
    // Estimate accuracy based on confidence scores
    const allConfidences = [
      ...concepts.map(c => c.confidence),
      ...clauses.map(c => c.confidence),
    ];
    const accuracy_estimate = allConfidences.length > 0 
      ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
      : 0.5;
    
    // Consistency score based on relationship coherence
    const consistency_score = 0.8; // Simplified for demo
    
    return {
      completeness_score,
      accuracy_estimate,
      consistency_score,
    };
  }

  private async inferConceptRelationship(
    concept1: any,
    concept2: any,
    segments: TextSegment[]
  ): Promise<any> {
    // Simplified relationship inference
    return null;
  }

  private async inferConceptClauseRelationship(
    concept: any,
    clause: any,
    segments: TextSegment[]
  ): Promise<any> {
    // Simplified relationship inference
    return null;
  }
}