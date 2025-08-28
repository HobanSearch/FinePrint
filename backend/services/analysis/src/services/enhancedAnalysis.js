"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhancedAnalysisEngine = exports.EnhancedAnalysisEngine = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const modelManager_1 = require("./modelManager");
const textProcessor_1 = require("./textProcessor");
const patterns_1 = require("./patterns");
const embeddings_1 = require("./embeddings");
const riskScoring_1 = require("./riskScoring");
const ollama_1 = require("./ollama");
const crypto_1 = __importDefault(require("crypto"));
const logger = (0, logger_1.createServiceLogger)('enhanced-analysis');
class EnhancedAnalysisEngine {
    ollamaService;
    constructor() {
        this.ollamaService = new ollama_1.OllamaService();
    }
    async initialize() {
        logger.info('Initializing Enhanced Analysis Engine');
        try {
            await Promise.all([
                modelManager_1.modelManager.initialize(),
                embeddings_1.embeddingService.initialize()
            ]);
            logger.info('Enhanced Analysis Engine initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize Enhanced Analysis Engine', { error: error.message });
            throw error;
        }
    }
    async analyzeDocument(request) {
        const startTime = Date.now();
        const { documentId, analysisId, userId, options = {} } = request;
        const contentHash = this.generateContentHash(request);
        const cacheKey = `enhanced_analysis:${contentHash}:${JSON.stringify(options)}`;
        const cached = await cache_1.analysisCache.get(cacheKey);
        if (cached && cached.analysisId !== analysisId) {
            cached.analysisId = analysisId;
            cached.documentId = documentId;
            logger.info('Using cached analysis result', { analysisId, cacheKey });
            return cached;
        }
        logger.info('Starting enhanced document analysis', {
            analysisId,
            documentId,
            userId,
            options
        });
        try {
            const extractionResult = await this.extractText(request);
            const modelSelection = modelManager_1.modelManager.selectOptimalModel({
                documentType: options.documentType || extractionResult.metadata.documentType,
                contentLength: extractionResult.content.length,
                priority: options.modelPreference || 'balanced',
                language: options.language || extractionResult.metadata.language
            });
            logger.info('Model selected for analysis', {
                model: modelSelection.model,
                reason: modelSelection.reason,
                expectedPerformance: modelSelection.expectedPerformance
            });
            const modelReserved = await modelManager_1.modelManager.reserveModel(modelSelection.model);
            if (!modelReserved) {
                logger.warn('Model reservation failed, using fallback', { model: modelSelection.model });
            }
            try {
                const [patternAnalysis, aiAnalysis, embeddingResults] = await Promise.all([
                    patterns_1.patternLibrary.analyzeText(extractionResult.content),
                    this.performAIAnalysis(extractionResult, modelSelection.model, options),
                    options.includeEmbeddings
                        ? this.performSemanticAnalysis(extractionResult, documentId)
                        : Promise.resolve(null)
                ]);
                const riskAssessment = await riskScoring_1.riskScoringEngine.calculateRiskScore(patternAnalysis, {
                    type: extractionResult.metadata.documentType,
                    wordCount: extractionResult.metadata.wordCount,
                    language: extractionResult.metadata.language
                });
                const enhancedFindings = await this.combineFindings(patternAnalysis, aiAnalysis, extractionResult, riskAssessment);
                const semanticInsights = embeddingResults
                    ? await this.generateSemanticInsights(embeddingResults, documentId, options)
                    : undefined;
                const processingTime = Date.now() - startTime;
                const result = {
                    analysisId,
                    documentId,
                    status: 'completed',
                    overallRiskScore: riskAssessment.overallScore,
                    riskLevel: riskAssessment.riskLevel,
                    executiveSummary: riskAssessment.executiveSummary,
                    keyFindings: riskAssessment.recommendations.slice(0, 5),
                    recommendations: riskAssessment.recommendations,
                    findings: enhancedFindings,
                    semanticInsights,
                    processingTimeMs: processingTime,
                    modelUsed: modelSelection.model,
                    confidence: riskAssessment.confidence,
                    categoryScores: riskAssessment.categoryScores,
                    patternMatches: {
                        total: patternAnalysis.totalMatches,
                        byCategory: Object.fromEntries(Object.entries(patternAnalysis.categorizedMatches).map(([cat, matches]) => [cat, matches.length])),
                        bySeverity: this.calculateSeverityDistribution(patternAnalysis)
                    },
                    extractionQuality: {
                        textLength: extractionResult.content.length,
                        wordCount: extractionResult.metadata.wordCount,
                        chunksProcessed: extractionResult.chunks.length,
                        languageDetected: extractionResult.metadata.language || 'unknown',
                        documentTypeDetected: extractionResult.metadata.documentType
                    }
                };
                await modelManager_1.modelManager.updateModelPerformance(modelSelection.model, {
                    analysisTime: processingTime,
                    accuracy: result.confidence
                });
                await cache_1.analysisCache.set(cacheKey, result, 3600);
                logger.info('Enhanced analysis completed successfully', {
                    analysisId,
                    overallScore: result.overallRiskScore,
                    riskLevel: result.riskLevel,
                    findingsCount: result.findings.length,
                    processingTime
                });
                return result;
            }
            finally {
                modelManager_1.modelManager.releaseModel(modelSelection.model);
            }
        }
        catch (error) {
            logger.error('Enhanced analysis failed', {
                error: error.message,
                analysisId,
                documentId
            });
            return {
                analysisId,
                documentId,
                status: 'failed',
                overallRiskScore: 0,
                riskLevel: 'minimal',
                executiveSummary: 'Analysis failed due to technical error',
                keyFindings: [],
                recommendations: ['Please try again or contact support'],
                findings: [],
                processingTimeMs: Date.now() - startTime,
                modelUsed: 'none',
                confidence: 0,
                categoryScores: {},
                patternMatches: { total: 0, byCategory: {}, bySeverity: {} },
                extractionQuality: {
                    textLength: 0,
                    wordCount: 0,
                    chunksProcessed: 0,
                    languageDetected: 'unknown',
                    documentTypeDetected: 'unknown'
                }
            };
        }
    }
    async extractText(request) {
        if (request.content) {
            return textProcessor_1.textProcessor.extractFromBuffer(Buffer.from(request.content, 'utf-8'), 'text.txt', {
                documentType: request.options?.documentType,
                language: request.options?.language
            });
        }
        else if (request.fileBuffer && request.filename) {
            return textProcessor_1.textProcessor.extractFromBuffer(request.fileBuffer, request.filename, {
                documentType: request.options?.documentType,
                language: request.options?.language
            });
        }
        else if (request.url) {
            return textProcessor_1.textProcessor.extractFromURL(request.url, {
                documentType: request.options?.documentType,
                language: request.options?.language
            });
        }
        else {
            throw new Error('No content source provided for analysis');
        }
    }
    async performAIAnalysis(extractionResult, model, options) {
        const enhancedPrompt = this.buildEnhancedAnalysisPrompt(extractionResult.content, extractionResult.metadata.documentType, extractionResult.metadata.language || 'en');
        const response = await this.ollamaService.generate({
            model,
            prompt: enhancedPrompt,
            options: {
                temperature: 0.1,
                max_tokens: 4096
            }
        });
        return this.parseEnhancedAnalysisResponse(response.response);
    }
    buildEnhancedAnalysisPrompt(content, documentType, language) {
        return `You are an expert legal document analyzer specializing in consumer protection and privacy rights. Analyze the following ${documentType} document with extreme attention to detail.

DOCUMENT TYPE: ${documentType}
LANGUAGE: ${language}

ANALYSIS FRAMEWORK:
1. CONSUMER RIGHTS ANALYSIS
   - Right to privacy and data protection
   - Right to fair contract terms
   - Right to transparency and clear information
   - Right to remedy and dispute resolution

2. RISK ASSESSMENT CRITERIA
   - Data collection and usage practices
   - Liability limitations and disclaimers
   - Termination and cancellation rights
   - Dispute resolution mechanisms
   - Contract modification procedures

3. REGULATORY COMPLIANCE
   - GDPR compliance (EU users)
   - CCPA compliance (California users)  
   - Consumer protection laws
   - Unfair contract terms legislation

DOCUMENT CONTENT:
${content.substring(0, 12000)}${content.length > 12000 ? '...[truncated for analysis]' : ''}

REQUIRED OUTPUT:
Provide a detailed JSON analysis with the following structure:

{
  "findings": [
    {
      "category": "Data Privacy|User Rights|Liability|Terms Changes|Account Termination|Dispute Resolution|Auto-Renewal|Content Rights|Payment|Age Restrictions|Jurisdiction",
      "title": "Specific issue title",
      "description": "Detailed explanation of the problem and its implications",
      "severity": "low|medium|high|critical",
      "confidenceScore": 0.0-1.0,
      "textExcerpt": "Exact text from document that supports this finding",
      "recommendation": "Specific advice for the user",
      "impactExplanation": "How this affects the user's rights or experience",
      "legalBasis": "Relevant laws or regulations that support this concern"
    }
  ],
  "keyThemes": ["Theme 1", "Theme 2", "Theme 3"],
  "complianceIssues": ["Issue 1", "Issue 2"],
  "positiveAspects": ["Good practice 1", "Good practice 2"],
  "redFlags": ["Critical concern 1", "Critical concern 2"],
  "citations": [
    {
      "text": "Quoted text from document",
      "section": "Section where found",
      "concern": "Why this is concerning",
      "position": "approximate character position"
    }
  ]
}

Focus on identifying subtle but important issues that might not be obvious to typical users. Be thorough but precise. Ensure all findings are supported by specific text from the document.`;
    }
    parseEnhancedAnalysisResponse(response) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in AI analysis response');
            }
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0, 50) : [],
                keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes.slice(0, 10) : [],
                complianceIssues: Array.isArray(parsed.complianceIssues) ? parsed.complianceIssues.slice(0, 10) : [],
                positiveAspects: Array.isArray(parsed.positiveAspects) ? parsed.positiveAspects.slice(0, 10) : [],
                redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.slice(0, 10) : [],
                citations: Array.isArray(parsed.citations) ? parsed.citations.slice(0, 20) : []
            };
        }
        catch (error) {
            logger.error('Failed to parse AI analysis response', {
                error: error.message,
                response: response.substring(0, 500)
            });
            return {
                findings: [],
                keyThemes: [],
                complianceIssues: [],
                positiveAspects: [],
                redFlags: [],
                citations: []
            };
        }
    }
    async performSemanticAnalysis(extractionResult, documentId) {
        try {
            await embeddings_1.embeddingService.indexDocumentChunks(documentId, extractionResult.chunks);
            const semanticResults = await Promise.all([
                this.identifyKeyConcepts(extractionResult.chunks),
                embeddings_1.embeddingService.findSimilarDocuments(documentId, 5, 0.7)
            ]);
            return {
                chunks: extractionResult.chunks,
                keyConcepts: semanticResults[0],
                similarDocuments: semanticResults[1]
            };
        }
        catch (error) {
            logger.error('Semantic analysis failed', { error: error.message, documentId });
            return null;
        }
    }
    async identifyKeyConcepts(chunks) {
        const allText = chunks.map(c => c.content).join(' ');
        const words = allText.toLowerCase().split(/\s+/);
        const legalConcepts = [
            'privacy', 'data', 'information', 'personal', 'collect', 'share', 'use',
            'liability', 'responsible', 'damages', 'claims', 'indemnify',
            'terminate', 'cancel', 'suspend', 'delete', 'remove',
            'arbitration', 'dispute', 'court', 'jurisdiction', 'law',
            'modify', 'change', 'update', 'notice', 'consent',
            'rights', 'license', 'ownership', 'intellectual', 'content'
        ];
        const conceptCounts = {};
        for (const word of words) {
            for (const concept of legalConcepts) {
                if (word.includes(concept)) {
                    conceptCounts[concept] = (conceptCounts[concept] || 0) + 1;
                }
            }
        }
        return Object.entries(conceptCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 8)
            .map(([concept]) => concept);
    }
    async combineFindings(patternAnalysis, aiAnalysis, extractionResult, riskAssessment) {
        const combinedFindings = [];
        for (const [category, matches] of Object.entries(patternAnalysis.categorizedMatches)) {
            for (const match of matches) {
                combinedFindings.push({
                    id: `pattern_${match.patternId}`,
                    category,
                    title: match.name,
                    description: `Pattern-based finding: ${match.name}`,
                    severity: match.severity,
                    confidenceScore: match.confidence,
                    textExcerpt: match.matches[0]?.text || '',
                    positionStart: match.matches[0]?.start,
                    positionEnd: match.matches[0]?.end,
                    recommendation: `Review this ${match.severity} severity issue carefully`,
                    impactExplanation: `This ${category.toLowerCase()} issue may affect your rights`,
                    patternId: match.patternId
                });
            }
        }
        for (const finding of aiAnalysis.findings || []) {
            combinedFindings.push({
                id: `ai_${crypto_1.default.randomUUID()}`,
                category: finding.category || 'General',
                title: finding.title || 'AI-identified issue',
                description: finding.description || 'AI analysis identified this concern',
                severity: finding.severity || 'medium',
                confidenceScore: finding.confidenceScore || 0.7,
                textExcerpt: finding.textExcerpt || '',
                recommendation: finding.recommendation || 'Review this finding carefully',
                impactExplanation: finding.impactExplanation || 'Impact assessment needed'
            });
        }
        combinedFindings.sort((a, b) => {
            const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
            const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
            if (severityDiff !== 0)
                return severityDiff;
            return b.confidenceScore - a.confidenceScore;
        });
        return combinedFindings.slice(0, 100);
    }
    async generateSemanticInsights(embeddingResults, documentId, options) {
        const keyThemes = embeddingResults.keyConcepts || [];
        const documentSimilarity = options.includeSimilarDocuments
            ? (embeddingResults.similarDocuments || []).map((doc) => ({
                documentId: doc.documentId,
                similarity: doc.score,
                title: doc.metadata?.title || 'Unknown Document'
            }))
            : [];
        return {
            keyThemes,
            documentSimilarity,
            conceptClusters: keyThemes.slice(0, 5)
        };
    }
    calculateSeverityDistribution(patternAnalysis) {
        const distribution = {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0
        };
        for (const matches of Object.values(patternAnalysis.categorizedMatches)) {
            for (const match of matches) {
                distribution[match.severity] = (distribution[match.severity] || 0) + 1;
            }
        }
        return distribution;
    }
    generateContentHash(request) {
        const content = request.content ||
            (request.fileBuffer ? request.fileBuffer.toString() : '') ||
            request.url || '';
        return crypto_1.default.createHash('sha256').update(content).digest('hex');
    }
    async analyzeDocumentWithProgress(request, progressCallback) {
        const updateProgress = (step, percentage, message) => {
            if (progressCallback) {
                progressCallback({ step, percentage, message });
            }
            logger.debug('Analysis progress', { step, percentage, message });
        };
        try {
            updateProgress('initialization', 5, 'Initializing analysis engine');
            updateProgress('extraction', 15, 'Extracting text from document');
            const extractionResult = await this.extractText(request);
            updateProgress('model_selection', 25, 'Selecting optimal AI model');
            const modelSelection = modelManager_1.modelManager.selectOptimalModel({
                documentType: request.options?.documentType || extractionResult.metadata.documentType,
                contentLength: extractionResult.content.length,
                priority: request.options?.modelPreference || 'balanced'
            });
            updateProgress('pattern_analysis', 40, 'Analyzing legal patterns');
            const patternAnalysis = await patterns_1.patternLibrary.analyzeText(extractionResult.content);
            updateProgress('ai_analysis', 60, 'Performing AI-powered analysis');
            const aiAnalysis = await this.performAIAnalysis(extractionResult, modelSelection.model, request.options);
            updateProgress('semantic_analysis', 75, 'Generating semantic insights');
            const embeddingResults = request.options?.includeEmbeddings
                ? await this.performSemanticAnalysis(extractionResult, request.documentId)
                : null;
            updateProgress('risk_scoring', 85, 'Calculating risk scores');
            const riskAssessment = await riskScoring_1.riskScoringEngine.calculateRiskScore(patternAnalysis, {
                type: extractionResult.metadata.documentType,
                wordCount: extractionResult.metadata.wordCount,
                language: extractionResult.metadata.language
            });
            updateProgress('finalizing', 95, 'Finalizing analysis results');
            const enhancedFindings = await this.combineFindings(patternAnalysis, aiAnalysis, extractionResult, riskAssessment);
            updateProgress('completed', 100, 'Analysis completed successfully');
            const result = {
                analysisId: request.analysisId,
                documentId: request.documentId,
                status: 'completed',
                overallRiskScore: riskAssessment.overallScore,
                riskLevel: riskAssessment.riskLevel,
                executiveSummary: riskAssessment.executiveSummary,
                keyFindings: riskAssessment.recommendations.slice(0, 5),
                recommendations: riskAssessment.recommendations,
                findings: enhancedFindings,
                semanticInsights: embeddingResults ? await this.generateSemanticInsights(embeddingResults, request.documentId, request.options) : undefined,
                processingTimeMs: 0,
                modelUsed: modelSelection.model,
                confidence: riskAssessment.confidence,
                categoryScores: riskAssessment.categoryScores,
                patternMatches: {
                    total: patternAnalysis.totalMatches,
                    byCategory: Object.fromEntries(Object.entries(patternAnalysis.categorizedMatches).map(([cat, matches]) => [cat, matches.length])),
                    bySeverity: this.calculateSeverityDistribution(patternAnalysis)
                },
                extractionQuality: {
                    textLength: extractionResult.content.length,
                    wordCount: extractionResult.metadata.wordCount,
                    chunksProcessed: extractionResult.chunks.length,
                    languageDetected: extractionResult.metadata.language || 'unknown',
                    documentTypeDetected: extractionResult.metadata.documentType
                }
            };
            return result;
        }
        catch (error) {
            updateProgress('error', 0, `Analysis failed: ${error.message}`);
            throw error;
        }
    }
}
exports.EnhancedAnalysisEngine = EnhancedAnalysisEngine;
exports.enhancedAnalysisEngine = new EnhancedAnalysisEngine();
//# sourceMappingURL=enhancedAnalysis.js.map