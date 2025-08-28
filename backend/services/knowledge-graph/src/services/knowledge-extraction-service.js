"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.KnowledgeExtractionService = exports.ExtractionResultSchema = exports.ExtractionRequestSchema = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const compromise_1 = require("compromise");
const natural = __importStar(require("natural"));
const zod_1 = require("zod");
const nanoid_1 = require("nanoid");
const logger = (0, logger_1.createServiceLogger)('knowledge-extraction-service');
exports.ExtractionRequestSchema = zod_1.z.object({
    document_content: zod_1.z.string(),
    document_type: zod_1.z.enum(['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'EULA', 'COOKIE_POLICY']),
    document_metadata: zod_1.z.object({
        title: zod_1.z.string().optional(),
        company_name: zod_1.z.string().optional(),
        company_domain: zod_1.z.string().optional(),
        jurisdiction: zod_1.z.string().optional(),
        language: zod_1.z.string().default('en'),
    }).optional(),
    extraction_depth: zod_1.z.enum(['BASIC', 'DETAILED', 'COMPREHENSIVE']).default('DETAILED'),
    enable_pattern_matching: zod_1.z.boolean().default(true),
    enable_concept_extraction: zod_1.z.boolean().default(true),
    enable_relationship_inference: zod_1.z.boolean().default(true),
});
exports.ExtractionResultSchema = zod_1.z.object({
    extraction_id: zod_1.z.string(),
    document_id: zod_1.z.string(),
    extracted_concepts: zod_1.z.array(zod_1.z.object({
        concept: zod_1.z.any(),
        confidence: zod_1.z.number().min(0).max(1),
        evidence_text: zod_1.z.string(),
        position: zod_1.z.object({
            start: zod_1.z.number(),
            end: zod_1.z.number(),
        }).optional(),
    })),
    extracted_clauses: zod_1.z.array(zod_1.z.object({
        clause: zod_1.z.any(),
        confidence: zod_1.z.number().min(0).max(1),
        matched_patterns: zod_1.z.array(zod_1.z.string()),
        risk_assessment: zod_1.z.object({
            severity: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
            risk_factors: zod_1.z.array(zod_1.z.string()),
            impact_areas: zod_1.z.array(zod_1.z.string()),
        }),
    })),
    inferred_relationships: zod_1.z.array(zod_1.z.object({
        from_id: zod_1.z.string(),
        to_id: zod_1.z.string(),
        relationship_type: zod_1.z.string(),
        confidence: zod_1.z.number().min(0).max(1),
        evidence: zod_1.z.string(),
    })),
    extraction_metadata: zod_1.z.object({
        processing_time_ms: zod_1.z.number(),
        extraction_method: zod_1.z.string(),
        confidence_threshold: zod_1.z.number(),
        patterns_matched: zod_1.z.number(),
        concepts_identified: zod_1.z.number(),
    }),
    quality_metrics: zod_1.z.object({
        completeness_score: zod_1.z.number().min(0).max(1),
        accuracy_estimate: zod_1.z.number().min(0).max(1),
        consistency_score: zod_1.z.number().min(0).max(1),
    }),
});
class KnowledgeExtractionService {
    knowledgeGraph;
    sentenceTokenizer;
    wordTokenizer;
    stemmer;
    posClassifier;
    constructor(knowledgeGraph) {
        this.knowledgeGraph = knowledgeGraph;
        this.initializeNLPTools();
    }
    initializeNLPTools() {
        this.sentenceTokenizer = new natural.SentenceTokenizer();
        this.wordTokenizer = new natural.WordTokenizer();
        this.stemmer = natural.PorterStemmer;
    }
    async extractKnowledge(request) {
        const startTime = Date.now();
        const extractionId = (0, nanoid_1.nanoid)();
        try {
            logger.info('Starting knowledge extraction', {
                extractionId,
                documentType: request.document_type,
                contentLength: request.document_content.length,
                depth: request.extraction_depth,
            });
            const validatedRequest = exports.ExtractionRequestSchema.parse(request);
            const segments = await this.preprocessDocument(validatedRequest.document_content);
            let extractedConcepts = [];
            if (validatedRequest.enable_concept_extraction) {
                extractedConcepts = await this.extractConcepts(segments, validatedRequest.extraction_depth);
            }
            let extractedClauses = [];
            if (validatedRequest.enable_pattern_matching) {
                extractedClauses = await this.extractClauses(segments, validatedRequest.extraction_depth);
            }
            const document = await this.createDocumentEntity(validatedRequest);
            let inferredRelationships = [];
            if (validatedRequest.enable_relationship_inference) {
                inferredRelationships = await this.inferRelationships(extractedConcepts, extractedClauses, segments);
            }
            await this.storeExtractedKnowledge(document, extractedConcepts, extractedClauses, inferredRelationships);
            const qualityMetrics = await this.calculateQualityMetrics(extractedConcepts, extractedClauses, segments);
            const processingTime = Date.now() - startTime;
            const result = {
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
            return exports.ExtractionResultSchema.parse(result);
        }
        catch (error) {
            logger.error('Knowledge extraction failed', {
                error,
                extractionId,
                processingTime: Date.now() - startTime,
            });
            throw error;
        }
    }
    async batchExtractKnowledge(requests, batchSize = 5) {
        const results = [];
        for (let i = 0; i < requests.length; i += batchSize) {
            const batch = requests.slice(i, i + batchSize);
            const batchPromises = batch.map(request => this.extractKnowledge(request).catch(error => {
                logger.error('Batch extraction item failed', { error, index: i });
                return null;
            }));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.filter(result => result !== null));
            logger.debug('Batch extraction completed', {
                batchIndex: Math.floor(i / batchSize) + 1,
                totalBatches: Math.ceil(requests.length / batchSize),
                successfulExtractions: batchResults.filter(r => r !== null).length,
            });
        }
        return results;
    }
    async preprocessDocument(content) {
        try {
            const cleanedContent = this.cleanText(content);
            const segments = await this.segmentDocument(cleanedContent);
            const scoredSegments = await this.scoreSegmentImportance(segments);
            return scoredSegments;
        }
        catch (error) {
            logger.error('Document preprocessing failed', { error });
            throw error;
        }
    }
    cleanText(text) {
        return text
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s.,;:!?()\-]/g, '')
            .trim();
    }
    async segmentDocument(text) {
        const segments = [];
        const doc = (0, compromise_1.compromise)(text);
        const sentences = doc.sentences().out('array');
        let currentPosition = 0;
        for (const sentence of sentences) {
            const startPos = text.indexOf(sentence, currentPosition);
            const endPos = startPos + sentence.length;
            segments.push({
                text: sentence,
                start_position: startPos,
                end_position: endPos,
                segment_type: this.classifySegmentType(sentence),
                importance_score: 0,
            });
            currentPosition = endPos;
        }
        return segments;
    }
    classifySegmentType(text) {
        if (text.match(/^\d+\./))
            return 'LIST_ITEM';
        if (text.match(/^[A-Z][A-Z\s]+$/))
            return 'SECTION';
        if (text.length > 200)
            return 'PARAGRAPH';
        return 'CLAUSE';
    }
    async scoreSegmentImportance(segments) {
        const legalKeywords = [
            'liability', 'privacy', 'data', 'termination', 'dispute', 'arbitration',
            'consent', 'cookies', 'sharing', 'license', 'agreement', 'breach'
        ];
        return segments.map(segment => {
            const words = segment.text.toLowerCase().split(/\s+/);
            const keywordCount = words.filter(word => legalKeywords.some(keyword => word.includes(keyword))).length;
            const keywordDensity = keywordCount / words.length;
            const lengthWeight = Math.min(1, segment.text.length / 100);
            segment.importance_score = (keywordDensity * 0.7) + (lengthWeight * 0.3);
            return segment;
        });
    }
    async extractConcepts(segments, depth) {
        const extractedConcepts = [];
        const ontologyService = this.knowledgeGraph.getOntologyService();
        const existingConcepts = await this.getAllExistingConcepts();
        for (const segment of segments) {
            if (segment.importance_score < 0.3)
                continue;
            const candidates = await this.extractConceptCandidates(segment);
            for (const candidate of candidates) {
                const matchedConcept = await this.matchOrCreateConcept(candidate, existingConcepts, segment);
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
        return this.deduplicateConcepts(extractedConcepts)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, depth === 'COMPREHENSIVE' ? 50 : depth === 'DETAILED' ? 25 : 10);
    }
    async extractConceptCandidates(segment) {
        const candidates = [];
        const doc = (0, compromise_1.compromise)(segment.text);
        const nounPhrases = doc.nouns().out('array');
        for (const phrase of nounPhrases) {
            const startPos = segment.text.indexOf(phrase);
            if (startPos === -1)
                continue;
            const candidate = {
                text: phrase,
                confidence: this.calculateConceptCandidateConfidence(phrase, segment.text),
                position: {
                    start: segment.start_position + startPos,
                    end: segment.start_position + startPos + phrase.length,
                },
                features: {
                    pos_tags: ['NOUN'],
                    entities: doc.people().out('array').concat(doc.places().out('array')),
                    legal_indicators: this.findLegalIndicators(phrase),
                    context_clues: this.extractContextClues(phrase, segment.text),
                },
            };
            candidates.push(candidate);
        }
        return candidates.filter(c => c.confidence > 0.5);
    }
    calculateConceptCandidateConfidence(phrase, context) {
        let confidence = 0.5;
        const legalTerms = ['data', 'privacy', 'liability', 'consent', 'breach'];
        if (legalTerms.some(term => phrase.toLowerCase().includes(term))) {
            confidence += 0.3;
        }
        if (phrase.split(' ').length > 1) {
            confidence += 0.1;
        }
        if (context.toLowerCase().includes('agreement') || context.toLowerCase().includes('terms')) {
            confidence += 0.1;
        }
        return Math.min(1.0, confidence);
    }
    findLegalIndicators(text) {
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
    extractContextClues(phrase, context) {
        const clues = [];
        const sentences = context.split(/[.!?]+/);
        for (const sentence of sentences) {
            if (sentence.includes(phrase)) {
                const words = sentence.split(/\s+/);
                const phraseIndex = words.findIndex(word => sentence.includes(phrase));
                const start = Math.max(0, phraseIndex - 2);
                const end = Math.min(words.length, phraseIndex + 3);
                clues.push(...words.slice(start, end));
            }
        }
        return [...new Set(clues)].filter(clue => clue.length > 2);
    }
    async extractClauses(segments, depth) {
        const extractedClauses = [];
        const patterns = await this.getActivePatterns();
        for (const segment of segments) {
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
    async inferRelationships(concepts, clauses, segments) {
        const relationships = [];
        for (let i = 0; i < concepts.length; i++) {
            for (let j = i + 1; j < concepts.length; j++) {
                const relationship = await this.inferConceptRelationship(concepts[i], concepts[j], segments);
                if (relationship) {
                    relationships.push(relationship);
                }
            }
        }
        for (const concept of concepts) {
            for (const clause of clauses) {
                const relationship = await this.inferConceptClauseRelationship(concept, clause, segments);
                if (relationship) {
                    relationships.push(relationship);
                }
            }
        }
        return relationships.filter(r => r.confidence > 0.6);
    }
    async getAllExistingConcepts() {
        const ontologyService = this.knowledgeGraph.getOntologyService();
        return await ontologyService.getConceptsByDifficulty(1, 10);
    }
    async matchOrCreateConcept(candidate, existingConcepts, segment) {
        for (const existing of existingConcepts) {
            const similarity = this.calculateTextSimilarity(candidate.text, existing.name);
            if (similarity > 0.8) {
                return { concept: existing, confidence: similarity };
            }
        }
        if (candidate.confidence > 0.7) {
            const newConcept = {
                name: candidate.text,
                description: `Auto-extracted concept: ${candidate.text}`,
                category: this.inferConceptCategory(candidate),
                difficulty_level: Math.ceil(candidate.confidence * 5),
                importance_weight: candidate.confidence,
                keywords: [candidate.text.toLowerCase(), ...candidate.features.legal_indicators],
            };
            return { concept: newConcept, confidence: candidate.confidence };
        }
        return null;
    }
    calculateTextSimilarity(text1, text2) {
        const set1 = new Set(text1.toLowerCase().split(/\s+/));
        const set2 = new Set(text2.toLowerCase().split(/\s+/));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }
    inferConceptCategory(candidate) {
        const text = candidate.text.toLowerCase();
        if (text.includes('data') || text.includes('privacy') || text.includes('information')) {
            return 'DATA_PRIVACY';
        }
        else if (text.includes('liability') || text.includes('responsible')) {
            return 'LIABILITY';
        }
        else if (text.includes('terminate') || text.includes('cancel')) {
            return 'TERMINATION';
        }
        else if (text.includes('right') || text.includes('permission')) {
            return 'USER_RIGHTS';
        }
        else if (text.includes('cookie') || text.includes('tracking')) {
            return 'COOKIES_TRACKING';
        }
        else {
            return 'COMPLIANCE';
        }
    }
    deduplicateConcepts(concepts) {
        const seen = new Set();
        return concepts.filter(concept => {
            const key = concept.concept.name.toLowerCase();
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    }
    async getActivePatterns() {
        const ontologyService = this.knowledgeGraph.getOntologyService();
        return await ontologyService.getPatternsByEffectiveness(0.7);
    }
    async matchPatterns(segment, patterns) {
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
                }
                else if (pattern.pattern_type === 'SEMANTIC') {
                    const semanticMatch = this.performSemanticMatch(segment.text, pattern);
                    if (semanticMatch.confidence > 0.7) {
                        matches.push({
                            pattern,
                            confidence: semanticMatch.confidence,
                            match: semanticMatch.text,
                        });
                    }
                }
            }
            catch (error) {
                logger.warn('Pattern matching failed', { error, patternId: pattern.id });
            }
        }
        return matches;
    }
    performSemanticMatch(text, pattern) {
        const patternKeywords = pattern.pattern_definition.toLowerCase().split(/\s+/);
        const textWords = text.toLowerCase().split(/\s+/);
        const matchCount = patternKeywords.filter(keyword => textWords.some(word => word.includes(keyword))).length;
        const confidence = matchCount / patternKeywords.length;
        return {
            confidence,
            text: text.substring(0, 100),
        };
    }
    async createClauseFromMatch(segment, match) {
        return {
            id: (0, nanoid_1.nanoid)(),
            title: `${match.pattern.name} Clause`,
            description: `Auto-extracted clause matching pattern: ${match.pattern.name}`,
            text_content: segment.text,
            pattern_id: match.pattern.id,
            document_id: '',
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
    extractRiskFactors(text) {
        const riskKeywords = [
            'unlimited liability', 'broad data collection', 'third party sharing',
            'automatic renewal', 'binding arbitration', 'class action waiver'
        ];
        return riskKeywords.filter(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
    }
    extractImpactAreas(text) {
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
    async assessClauseRisk(clause, segment) {
        return {
            severity: clause.severity,
            risk_factors: clause.risk_factors,
            impact_areas: clause.impact_areas,
        };
    }
    async createDocumentEntity(request) {
        const ontologyService = this.knowledgeGraph.getOntologyService();
        const document = {
            title: request.document_metadata?.title || 'Untitled Document',
            content: request.document_content,
            document_type: request.document_type,
            content_hash: this.generateContentHash(request.document_content),
            language: request.document_metadata?.language || 'en',
            company_name: request.document_metadata?.company_name,
            company_domain: request.document_metadata?.company_domain,
            word_count: request.document_content.split(/\s+/).length,
        };
        return await ontologyService.createDocument(document, request.document_metadata?.jurisdiction);
    }
    generateContentHash(content) {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
    async storeExtractedKnowledge(document, concepts, clauses, relationships) {
        try {
            const conceptIds = [];
            for (const conceptData of concepts) {
                if (conceptData.concept.id) {
                    conceptIds.push(conceptData.concept.id);
                }
            }
            for (const clauseData of clauses) {
                clauseData.clause.document_id = document.id;
                await this.knowledgeGraph.getOntologyService().createLegalClause(clauseData.clause, conceptIds.slice(0, 5));
            }
            for (const relationship of relationships) {
                await this.knowledgeGraph.getOntologyService().createRelationship(relationship.from_id, relationship.to_id, relationship.relationship_type, { confidence: relationship.confidence });
            }
            await this.knowledgeGraph.getEmbeddingsService().updateDocumentEmbeddings(document.id);
        }
        catch (error) {
            logger.error('Failed to store extracted knowledge', { error });
            throw error;
        }
    }
    async calculateQualityMetrics(concepts, clauses, segments) {
        const importantSegments = segments.filter(s => s.importance_score > 0.7);
        const coveredSegments = concepts.length + clauses.length;
        const completeness_score = Math.min(1.0, coveredSegments / Math.max(1, importantSegments.length));
        const allConfidences = [
            ...concepts.map(c => c.confidence),
            ...clauses.map(c => c.confidence),
        ];
        const accuracy_estimate = allConfidences.length > 0
            ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
            : 0.5;
        const consistency_score = 0.8;
        return {
            completeness_score,
            accuracy_estimate,
            consistency_score,
        };
    }
    async inferConceptRelationship(concept1, concept2, segments) {
        return null;
    }
    async inferConceptClauseRelationship(concept, clause, segments) {
        return null;
    }
}
exports.KnowledgeExtractionService = KnowledgeExtractionService;
//# sourceMappingURL=knowledge-extraction-service.js.map