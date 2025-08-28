import { createServiceLogger } from '@fineprintai/shared-logger';
import { analysisCache } from '@fineprintai/shared-cache';
import { modelManager } from './modelManager';
import { textProcessor, ExtractionResult } from './textProcessor';
import { patternLibrary } from './patterns';
import { embeddingService } from './embeddings';
import { riskScoringEngine } from './riskScoring';
import { OllamaService } from './ollama';
import crypto from 'crypto';

const logger = createServiceLogger('enhanced-analysis');

export interface AnalysisRequest {
  content?: string;
  url?: string;
  fileBuffer?: Buffer;
  filename?: string;
  documentId: string;
  analysisId: string;
  userId: string;
  options?: {
    documentType?: string;
    language?: string;
    modelPreference?: 'speed' | 'accuracy' | 'balanced';
    includeEmbeddings?: boolean;
    includeSimilarDocuments?: boolean;
    customPatterns?: string[];
  };
}

export interface EnhancedAnalysisResult {
  analysisId: string;
  documentId: string;
  status: 'completed' | 'failed';
  
  // Core Analysis
  overallRiskScore: number;
  riskLevel: 'minimal' | 'low' | 'moderate' | 'high' | 'critical';
  executiveSummary: string;
  keyFindings: string[];
  recommendations: string[];
  
  // Detailed Findings
  findings: Array<{
    id: string;
    category: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidenceScore: number;
    textExcerpt: string;
    positionStart?: number;
    positionEnd?: number;
    recommendation: string;
    impactExplanation: string;
    patternId?: string;
  }>;
  
  // Advanced Features
  semanticInsights?: {
    keyThemes: string[];
    documentSimilarity: Array<{
      documentId: string;
      similarity: number;
      title: string;
    }>;
    conceptClusters: string[];
  };
  
  // Processing Metadata
  processingTimeMs: number;
  modelUsed: string;
  confidence: number;
  
  // Analytics
  categoryScores: { [category: string]: number };
  patternMatches: {
    total: number;
    byCategory: { [category: string]: number };
    bySeverity: { [severity: string]: number };
  };
  
  // Quality Metrics
  extractionQuality: {
    textLength: number;
    wordCount: number;
    chunksProcessed: number;
    languageDetected: string;
    documentTypeDetected: string;
  };
}

export interface CitationReference {
  id: string;
  text: string;
  position: {
    start: number;
    end: number;
    page?: number;
    section?: string;
  };
  context: string;
  relevanceScore: number;
}

export class EnhancedAnalysisEngine {
  private ollamaService: OllamaService;

  constructor() {
    this.ollamaService = new OllamaService();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Enhanced Analysis Engine');
    
    try {
      // Initialize all dependent services
      await Promise.all([
        modelManager.initialize(),
        embeddingService.initialize()
      ]);
      
      logger.info('Enhanced Analysis Engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Enhanced Analysis Engine', { error: error.message });
      throw error;
    }
  }

  async analyzeDocument(request: AnalysisRequest): Promise<EnhancedAnalysisResult> {
    const startTime = Date.now();
    const { documentId, analysisId, userId, options = {} } = request;
    
    // Generate cache key
    const contentHash = this.generateContentHash(request);
    const cacheKey = `enhanced_analysis:${contentHash}:${JSON.stringify(options)}`;
    
    // Check cache first
    const cached = await analysisCache.get<EnhancedAnalysisResult>(cacheKey);
    if (cached && cached.analysisId !== analysisId) {
      // Update IDs and return cached result
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
      // Step 1: Extract and process text
      const extractionResult = await this.extractText(request);
      
      // Step 2: Select optimal model
      const modelSelection = modelManager.selectOptimalModel({
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

      // Reserve the model
      const modelReserved = await modelManager.reserveModel(modelSelection.model);
      if (!modelReserved) {
        logger.warn('Model reservation failed, using fallback', { model: modelSelection.model });
      }

      try {
        // Step 3: Parallel processing
        const [
          patternAnalysis,
          aiAnalysis,
          embeddingResults
        ] = await Promise.all([
          // Pattern-based analysis
          patternLibrary.analyzeText(extractionResult.content),
          
          // AI-powered analysis
          this.performAIAnalysis(extractionResult, modelSelection.model, options),
          
          // Embedding and semantic analysis (if requested)
          options.includeEmbeddings 
            ? this.performSemanticAnalysis(extractionResult, documentId)
            : Promise.resolve(null)
        ]);

        // Step 4: Risk scoring
        const riskAssessment = await riskScoringEngine.calculateRiskScore(
          patternAnalysis,
          {
            type: extractionResult.metadata.documentType,
            wordCount: extractionResult.metadata.wordCount,
            language: extractionResult.metadata.language
          }
        );

        // Step 5: Combine and enhance findings
        const enhancedFindings = await this.combineFindings(
          patternAnalysis,
          aiAnalysis,
          extractionResult,
          riskAssessment
        );

        // Step 6: Generate semantic insights
        const semanticInsights = embeddingResults 
          ? await this.generateSemanticInsights(embeddingResults, documentId, options)
          : undefined;

        // Step 7: Create final result
        const processingTime = Date.now() - startTime;
        const result: EnhancedAnalysisResult = {
          analysisId,
          documentId,
          status: 'completed',
          
          // Core results
          overallRiskScore: riskAssessment.overallScore,
          riskLevel: riskAssessment.riskLevel,
          executiveSummary: riskAssessment.executiveSummary,
          keyFindings: riskAssessment.recommendations.slice(0, 5),
          recommendations: riskAssessment.recommendations,
          
          // Enhanced findings
          findings: enhancedFindings,
          
          // Semantic insights
          semanticInsights,
          
          // Processing metadata
          processingTimeMs: processingTime,
          modelUsed: modelSelection.model,
          confidence: riskAssessment.confidence,
          
          // Analytics
          categoryScores: riskAssessment.categoryScores,
          patternMatches: {
            total: patternAnalysis.totalMatches,
            byCategory: Object.fromEntries(
              Object.entries(patternAnalysis.categorizedMatches).map(
                ([cat, matches]) => [cat, matches.length]
              )
            ),
            bySeverity: this.calculateSeverityDistribution(patternAnalysis)
          },
          
          // Quality metrics
          extractionQuality: {
            textLength: extractionResult.content.length,
            wordCount: extractionResult.metadata.wordCount,
            chunksProcessed: extractionResult.chunks.length,
            languageDetected: extractionResult.metadata.language || 'unknown',
            documentTypeDetected: extractionResult.metadata.documentType
          }
        };

        // Update model performance metrics
        await modelManager.updateModelPerformance(modelSelection.model, {
          analysisTime: processingTime,
          accuracy: result.confidence
        });

        // Cache the result for 1 hour
        await analysisCache.set(cacheKey, result, 3600);

        logger.info('Enhanced analysis completed successfully', {
          analysisId,
          overallScore: result.overallRiskScore,
          riskLevel: result.riskLevel,
          findingsCount: result.findings.length,
          processingTime
        });

        return result;

      } finally {
        // Always release the model
        modelManager.releaseModel(modelSelection.model);
      }

    } catch (error) {
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

  private async extractText(request: AnalysisRequest): Promise<ExtractionResult> {
    if (request.content) {
      // Direct text content
      return textProcessor.extractFromBuffer(
        Buffer.from(request.content, 'utf-8'),
        'text.txt',
        {
          documentType: request.options?.documentType,
          language: request.options?.language
        }
      );
    } else if (request.fileBuffer && request.filename) {
      // File upload
      return textProcessor.extractFromBuffer(
        request.fileBuffer,
        request.filename,
        {
          documentType: request.options?.documentType,
          language: request.options?.language
        }
      );
    } else if (request.url) {
      // URL extraction
      return textProcessor.extractFromURL(
        request.url,
        {
          documentType: request.options?.documentType,
          language: request.options?.language
        }
      );
    } else {
      throw new Error('No content source provided for analysis');
    }
  }

  private async performAIAnalysis(
    extractionResult: ExtractionResult,
    model: string,
    options: any
  ): Promise<any> {
    const enhancedPrompt = this.buildEnhancedAnalysisPrompt(
      extractionResult.content,
      extractionResult.metadata.documentType,
      extractionResult.metadata.language || 'en'
    );

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

  private buildEnhancedAnalysisPrompt(
    content: string,
    documentType: string,
    language: string
  ): string {
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

  private parseEnhancedAnalysisResponse(response: string): any {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI analysis response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate and sanitize the response
      return {
        findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0, 50) : [],
        keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes.slice(0, 10) : [],
        complianceIssues: Array.isArray(parsed.complianceIssues) ? parsed.complianceIssues.slice(0, 10) : [],
        positiveAspects: Array.isArray(parsed.positiveAspects) ? parsed.positiveAspects.slice(0, 10) : [],
        redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.slice(0, 10) : [],
        citations: Array.isArray(parsed.citations) ? parsed.citations.slice(0, 20) : []
      };
    } catch (error) {
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

  private async performSemanticAnalysis(
    extractionResult: ExtractionResult,
    documentId: string
  ): Promise<any> {
    try {
      // Index document chunks for semantic search
      await embeddingService.indexDocumentChunks(
        documentId,
        extractionResult.chunks
      );

      // Perform semantic analysis
      const semanticResults = await Promise.all([
        // Find key concepts through clustering
        this.identifyKeyConcepts(extractionResult.chunks),
        
        // Find similar documents if requested
        embeddingService.findSimilarDocuments(documentId, 5, 0.7)
      ]);

      return {
        chunks: extractionResult.chunks,
        keyConcepts: semanticResults[0],
        similarDocuments: semanticResults[1]
      };
    } catch (error) {
      logger.error('Semantic analysis failed', { error: error.message, documentId });
      return null;
    }
  }

  private async identifyKeyConcepts(chunks: any[]): Promise<string[]> {
    // Simple concept extraction based on chunk content
    const allText = chunks.map(c => c.content).join(' ');
    const words = allText.toLowerCase().split(/\s+/);
    
    // Legal concept keywords
    const legalConcepts = [
      'privacy', 'data', 'information', 'personal', 'collect', 'share', 'use',
      'liability', 'responsible', 'damages', 'claims', 'indemnify',
      'terminate', 'cancel', 'suspend', 'delete', 'remove',
      'arbitration', 'dispute', 'court', 'jurisdiction', 'law',
      'modify', 'change', 'update', 'notice', 'consent',
      'rights', 'license', 'ownership', 'intellectual', 'content'
    ];

    const conceptCounts: { [key: string]: number } = {};
    
    for (const word of words) {
      for (const concept of legalConcepts) {
        if (word.includes(concept)) {
          conceptCounts[concept] = (conceptCounts[concept] || 0) + 1;
        }
      }
    }

    // Return top concepts
    return Object.entries(conceptCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([concept]) => concept);
  }

  private async combineFindings(
    patternAnalysis: any,
    aiAnalysis: any,
    extractionResult: ExtractionResult,
    riskAssessment: any
  ): Promise<any[]> {
    const combinedFindings: any[] = [];

    // Add pattern-based findings
    for (const [category, matches] of Object.entries(patternAnalysis.categorizedMatches)) {
      for (const match of matches as any[]) {
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

    // Add AI-generated findings
    for (const finding of aiAnalysis.findings || []) {
      combinedFindings.push({
        id: `ai_${crypto.randomUUID()}`,
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

    // Sort by severity and confidence
    combinedFindings.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;
      return b.confidenceScore - a.confidenceScore;
    });

    return combinedFindings.slice(0, 100); // Limit findings
  }

  private async generateSemanticInsights(
    embeddingResults: any,
    documentId: string,
    options: any
  ): Promise<any> {
    const keyThemes = embeddingResults.keyConcepts || [];
    
    const documentSimilarity = options.includeSimilarDocuments 
      ? (embeddingResults.similarDocuments || []).map((doc: any) => ({
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

  private calculateSeverityDistribution(patternAnalysis: any): { [severity: string]: number } {
    const distribution: { [severity: string]: number } = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    for (const matches of Object.values(patternAnalysis.categorizedMatches)) {
      for (const match of matches as any[]) {
        distribution[match.severity] = (distribution[match.severity] || 0) + 1;
      }
    }

    return distribution;
  }

  private generateContentHash(request: AnalysisRequest): string {
    const content = request.content || 
                   (request.fileBuffer ? request.fileBuffer.toString() : '') ||
                   request.url || '';
    
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // Progress tracking method for WebSocket integration
  async analyzeDocumentWithProgress(
    request: AnalysisRequest,
    progressCallback?: (progress: { step: string; percentage: number; message: string }) => void
  ): Promise<EnhancedAnalysisResult> {
    const updateProgress = (step: string, percentage: number, message: string) => {
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
      const modelSelection = modelManager.selectOptimalModel({
        documentType: request.options?.documentType || extractionResult.metadata.documentType,
        contentLength: extractionResult.content.length,
        priority: request.options?.modelPreference || 'balanced'
      });

      updateProgress('pattern_analysis', 40, 'Analyzing legal patterns');
      const patternAnalysis = await patternLibrary.analyzeText(extractionResult.content);
      
      updateProgress('ai_analysis', 60, 'Performing AI-powered analysis');
      const aiAnalysis = await this.performAIAnalysis(extractionResult, modelSelection.model, request.options);
      
      updateProgress('semantic_analysis', 75, 'Generating semantic insights');
      const embeddingResults = request.options?.includeEmbeddings 
        ? await this.performSemanticAnalysis(extractionResult, request.documentId)
        : null;

      updateProgress('risk_scoring', 85, 'Calculating risk scores');
      const riskAssessment = await riskScoringEngine.calculateRiskScore(patternAnalysis, {
        type: extractionResult.metadata.documentType,
        wordCount: extractionResult.metadata.wordCount,
        language: extractionResult.metadata.language
      });

      updateProgress('finalizing', 95, 'Finalizing analysis results');
      const enhancedFindings = await this.combineFindings(
        patternAnalysis,
        aiAnalysis,
        extractionResult,
        riskAssessment
      );

      updateProgress('completed', 100, 'Analysis completed successfully');

      // Build final result (same as regular analyze method)
      const result: EnhancedAnalysisResult = {
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
        processingTimeMs: 0, // Will be calculated by caller
        modelUsed: modelSelection.model,
        confidence: riskAssessment.confidence,
        categoryScores: riskAssessment.categoryScores,
        patternMatches: {
          total: patternAnalysis.totalMatches,
          byCategory: Object.fromEntries(
            Object.entries(patternAnalysis.categorizedMatches).map(
              ([cat, matches]) => [cat, matches.length]
            )
          ),
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

    } catch (error) {
      updateProgress('error', 0, `Analysis failed: ${error.message}`);
      throw error;
    }
  }
}

// Singleton instance 
export const enhancedAnalysisEngine = new EnhancedAnalysisEngine();