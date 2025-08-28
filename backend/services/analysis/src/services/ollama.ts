import axios, { AxiosInstance } from 'axios';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { CacheService } from '@fineprintai/shared-cache';
import type { OllamaRequest, OllamaResponse } from '@fineprintai/shared-types';

const logger = createServiceLogger('enhanced-ollama-service');

// Enhanced Analysis Configuration
interface EnhancedAnalysisConfig {
  useDSPy: boolean;
  useLoRA: boolean;
  useKnowledgeGraph: boolean;
  curriculumLevel: 'basic' | 'intermediate' | 'advanced';
  adapterId?: string;
  moduleOverride?: string;
  knowledgeContext?: string[];
}

// Enhanced Analysis Result
interface EnhancedAnalysisResult {
  riskScore: number;
  executiveSummary: string;
  keyFindings: string[];
  recommendations: string[];
  findings: Array<{
    category: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidenceScore: number;
    textExcerpt?: string;
    recommendation?: string;
    impactExplanation?: string;
    knowledgeReferences?: string[];
    curriculumContext?: string;
  }>;
  enhancementMetadata: {
    dspyModule?: string;
    loraAdapter?: string;
    knowledgeContext: string[];
    curriculumLevel: string;
    processingTime: number;
    enhancementScore: number;
  };
}

export class EnhancedOllamaService {
  private client: AxiosInstance;
  private baseUrl: string;
  private cache: CacheService;
  private dspyServiceUrl: string;
  private loraServiceUrl: string;
  private knowledgeGraphUrl: string;

  constructor() {
    this.baseUrl = config.ai.ollama.url;
    this.cache = new CacheService();
    this.dspyServiceUrl = config.services.dspy?.url || 'http://localhost:8006';
    this.loraServiceUrl = config.services.lora?.url || 'http://localhost:8007';
    this.knowledgeGraphUrl = config.services.knowledgeGraph?.url || 'http://localhost:8008';
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.ai.ollama.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use((config) => {
      logger.debug('Ollama request', {
        method: config.method,
        url: config.url,
        model: config.data?.model,
      });
      return config;
    });

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Ollama response', {
          status: response.status,
          model: response.data?.model,
          done: response.data?.done,
        });
        return response;
      },
      (error) => {
        logger.error('Ollama request failed', {
          error: error.message,
          status: error.response?.status,
          data: error.response?.data,
        });
        throw error;
      }
    );
  }

  async generate(request: OllamaRequest): Promise<OllamaResponse> {
    try {
      const startTime = Date.now();

      const response = await this.client.post('/api/generate', {
        model: request.model,
        prompt: request.prompt,
        stream: false,
        options: {
          temperature: request.options?.temperature || 0.1,
          top_p: request.options?.top_p || 0.9,
          num_predict: request.options?.max_tokens || 2048,
          ...request.options,
        },
      });

      const duration = Date.now() - startTime;

      logger.apiCall('POST', '/api/generate', response.status, duration);

      return response.data;
    } catch (error) {
      logger.error('Failed to generate with Ollama', {
        error: error.message,
        model: request.model,
        prompt: request.prompt.substring(0, 100),
      });
      throw error;
    }
  }

  async chat(messages: Array<{ role: string; content: string }>, model?: string): Promise<string> {
    try {
      const startTime = Date.now();

      const response = await this.client.post('/api/chat', {
        model: model || config.ai.ollama.defaultModel,
        messages,
        stream: false,
        options: {
          temperature: 0.1,
          top_p: 0.9,
        },
      });

      const duration = Date.now() - startTime;
      logger.apiCall('POST', '/api/chat', response.status, duration);

      return response.data.message.content;
    } catch (error) {
      logger.error('Failed to chat with Ollama', {
        error: error.message,
        model: model || config.ai.ollama.defaultModel,
        messagesCount: messages.length,
      });
      throw error;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/api/tags');
      return response.data.models.map((model: any) => model.name);
    } catch (error) {
      logger.error('Failed to get available models', { error: error.message });
      throw error;
    }
  }

  async pullModel(modelName: string): Promise<boolean> {
    try {
      logger.info('Pulling model', { modelName });
      
      const response = await this.client.post('/api/pull', {
        name: modelName,
      });

      logger.info('Model pulled successfully', { modelName });
      return true;
    } catch (error) {
      logger.error('Failed to pull model', {
        error: error.message,
        modelName,
      });
      return false;
    }
  }

  async isModelAvailable(modelName: string): Promise<boolean> {
    try {
      const models = await this.getAvailableModels();
      return models.includes(modelName);
    } catch (error) {
      logger.error('Failed to check model availability', {
        error: error.message,
        modelName,
      });
      return false;
    }
  }

  async analyzeDocument(
    content: string,
    documentType: string,
    language: string = 'en',
    enhancementConfig?: EnhancedAnalysisConfig
  ): Promise<EnhancedAnalysisResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting enhanced document analysis', {
        documentType,
        language,
        contentLength: content.length,
        enhancements: enhancementConfig,
      });

      // If no enhancements requested, use legacy analysis
      if (!enhancementConfig) {
        const legacyResult = await this.legacyAnalyzeDocument(content, documentType, language);
        return this.wrapLegacyResult(legacyResult, startTime);
      }

      // Enhanced analysis pipeline
      let analysisResult: any;
      const enhancementMetadata: EnhancedAnalysisResult['enhancementMetadata'] = {
        knowledgeContext: enhancementConfig.knowledgeContext || [],
        curriculumLevel: enhancementConfig.curriculumLevel,
        processingTime: 0,
        enhancementScore: 0,
      };

      // Step 1: Knowledge Graph Context Enhancement
      if (enhancementConfig.useKnowledgeGraph) {
        const knowledgeContext = await this.getKnowledgeContext(content, documentType);
        enhancementMetadata.knowledgeContext = knowledgeContext;
      }

      // Step 2: DSPy-Enhanced Analysis
      if (enhancementConfig.useDSPy) {
        analysisResult = await this.dspyEnhancedAnalysis(
          content,
          documentType,
          language,
          enhancementConfig,
          enhancementMetadata.knowledgeContext
        );
        enhancementMetadata.dspyModule = enhancementConfig.moduleOverride || 'auto-selected';
      }

      // Step 3: LoRA Fine-tuned Enhancement
      if (enhancementConfig.useLoRA && enhancementConfig.adapterId) {
        analysisResult = await this.loraEnhancedAnalysis(
          analysisResult || { content, documentType, language },
          enhancementConfig.adapterId
        );
        enhancementMetadata.loraAdapter = enhancementConfig.adapterId;
      }

      // Step 4: Curriculum-aware Post-processing
      if (enhancementConfig.curriculumLevel !== 'basic') {
        analysisResult = await this.curriculumAwareEnhancement(
          analysisResult,
          enhancementConfig.curriculumLevel,
          enhancementMetadata.knowledgeContext
        );
      }

      // Fallback to legacy if enhanced analysis failed
      if (!analysisResult) {
        logger.warn('Enhanced analysis failed, falling back to legacy');
        const legacyResult = await this.legacyAnalyzeDocument(content, documentType, language);
        return this.wrapLegacyResult(legacyResult, startTime);
      }

      // Calculate enhancement metrics
      const processingTime = Date.now() - startTime;
      enhancementMetadata.processingTime = processingTime;
      enhancementMetadata.enhancementScore = this.calculateEnhancementScore(
        enhancementConfig,
        analysisResult,
        processingTime
      );

      // Add knowledge references to findings
      const enhancedFindings = await this.addKnowledgeReferences(
        analysisResult.findings,
        enhancementMetadata.knowledgeContext
      );

      const result: EnhancedAnalysisResult = {
        riskScore: analysisResult.riskScore,
        executiveSummary: analysisResult.executiveSummary,
        keyFindings: analysisResult.keyFindings,
        recommendations: analysisResult.recommendations,
        findings: enhancedFindings,
        enhancementMetadata,
      };

      logger.info('Enhanced document analysis completed', {
        riskScore: result.riskScore,
        findingsCount: result.findings.length,
        processingTime,
        enhancementScore: enhancementMetadata.enhancementScore,
        enhancements: {
          dspy: enhancementConfig.useDSPy,
          lora: enhancementConfig.useLoRA,
          knowledgeGraph: enhancementConfig.useKnowledgeGraph,
        },
      });

      return result;
    } catch (error) {
      logger.error('Enhanced document analysis failed', {
        error: error.message,
        documentType,
        contentLength: content.length,
        enhancements: enhancementConfig,
      });
      throw error;
    }
  }

  // Legacy analysis method (original implementation)
  private async legacyAnalyzeDocument(
    content: string,
    documentType: string,
    language: string = 'en'
  ): Promise<{
    riskScore: number;
    executiveSummary: string;
    keyFindings: string[];
    recommendations: string[];
    findings: Array<{
      category: string;
      title: string;
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      confidenceScore: number;
      textExcerpt?: string;
      recommendation?: string;
      impactExplanation?: string;
    }>;
  }> {
    const prompt = this.buildAnalysisPrompt(content, documentType, language);
    
    const response = await this.generate({
      model: config.ai.ollama.defaultModel,
      prompt,
      options: {
        temperature: 0.1,
        max_tokens: 4096,
      },
    });

    return this.parseAnalysisResponse(response.response);
  }

  private buildAnalysisPrompt(
    content: string, 
    documentType: string, 
    language: string
  ): string {
    return `You are a legal document analysis AI specializing in identifying problematic clauses in terms of service, privacy policies, and other legal documents.

DOCUMENT TYPE: ${documentType}
LANGUAGE: ${language}

ANALYSIS INSTRUCTIONS:
1. Analyze the following document for problematic clauses and terms
2. Focus on user rights, data privacy, liability limitations, and unfair terms
3. Provide a risk score from 0-100 (0 = very safe, 100 = extremely problematic)
4. Identify specific issues with severity levels: low, medium, high, critical

DOCUMENT CONTENT:
${content.substring(0, 8000)} ${content.length > 8000 ? '...[truncated]' : ''}

Please respond with a JSON object in this exact format:
{
  "riskScore": number,
  "executiveSummary": "Brief 2-3 sentence summary of main concerns",
  "keyFindings": ["Finding 1", "Finding 2", "Finding 3"],
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "findings": [
    {
      "category": "Data Privacy" | "User Rights" | "Liability" | "Terms Changes" | "Account Termination" | "Dispute Resolution" | "Other",
      "title": "Brief title of the issue",
      "description": "Detailed explanation of the problem",
      "severity": "low" | "medium" | "high" | "critical",
      "confidenceScore": 0.0-1.0,
      "textExcerpt": "Relevant text from document",
      "recommendation": "What user should do about this",
      "impactExplanation": "How this affects the user"
    }
  ]
}

Ensure the JSON is valid and complete. Focus on the most significant issues.`;
  }

  private parseAnalysisResponse(response: string): {
    riskScore: number;
    executiveSummary: string;
    keyFindings: string[];
    recommendations: string[];
    findings: Array<{
      category: string;
      title: string;
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      confidenceScore: number;
      textExcerpt?: string;
      recommendation?: string;
      impactExplanation?: string;
    }>;
  } {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const result = JSON.parse(jsonMatch[0]);

      // Validate and sanitize the response
      return {
        riskScore: Math.max(0, Math.min(100, Number(result.riskScore) || 50)),
        executiveSummary: String(result.executiveSummary || 'Analysis completed'),
        keyFindings: Array.isArray(result.keyFindings) 
          ? result.keyFindings.slice(0, 10).map(String)
          : [],
        recommendations: Array.isArray(result.recommendations)
          ? result.recommendations.slice(0, 10).map(String)
          : [],
        findings: Array.isArray(result.findings)
          ? result.findings.slice(0, 50).map((finding: any) => ({
              category: String(finding.category || 'Other'),
              title: String(finding.title || 'Issue identified'),
              description: String(finding.description || 'No description provided'),
              severity: ['low', 'medium', 'high', 'critical'].includes(finding.severity)
                ? finding.severity
                : 'medium',
              confidenceScore: Math.max(0, Math.min(1, Number(finding.confidenceScore) || 0.5)),
              textExcerpt: finding.textExcerpt ? String(finding.textExcerpt) : undefined,
              recommendation: finding.recommendation ? String(finding.recommendation) : undefined,
              impactExplanation: finding.impactExplanation ? String(finding.impactExplanation) : undefined,
            }))
          : [],
      };
    } catch (error) {
      logger.error('Failed to parse analysis response', {
        error: error.message,
        response: response.substring(0, 500),
      });

      // Return fallback analysis
      return {
        riskScore: 50,
        executiveSummary: 'Unable to complete detailed analysis due to parsing error.',
        keyFindings: ['Document analysis encountered technical difficulties'],
        recommendations: ['Please try analyzing the document again'],
        findings: [{
          category: 'Other',
          title: 'Analysis Error',
          description: 'The document analysis could not be completed successfully.',
          severity: 'medium' as const,
          confidenceScore: 0.1,
          recommendation: 'Try submitting the document again or contact support',
          impactExplanation: 'Technical issue prevented complete analysis',
        }],
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/tags', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      logger.error('Ollama health check failed', { error: error.message });
      return false;
    }
  }

  // Enhanced Analysis Methods

  private async getKnowledgeContext(content: string, documentType: string): Promise<string[]> {
    try {
      const response = await axios.post(`${this.knowledgeGraphUrl}/api/knowledge/extract`, {
        content,
        document_type: documentType,
        extract_concepts: true,
        extract_patterns: true,
      }, { timeout: 30000 });

      return response.data.concepts || [];
    } catch (error) {
      logger.warn('Failed to get knowledge context', { error: error.message });
      return [];
    }
  }

  private async dspyEnhancedAnalysis(
    content: string,
    documentType: string,
    language: string,
    config: EnhancedAnalysisConfig,
    knowledgeContext: string[]
  ): Promise<any> {
    try {
      const analysisDepth = this.mapCurriculumToDepth(config.curriculumLevel);
      
      const response = await axios.post(`${this.dspyServiceUrl}/api/dspy/analyze`, {
        document_content: content,
        document_type: documentType,
        language,
        analysis_depth: analysisDepth,
        module_name: config.moduleOverride,
        knowledge_context: knowledgeContext,
      }, { timeout: 120000 });

      return {
        riskScore: response.data.risk_score,
        executiveSummary: response.data.executive_summary,
        keyFindings: response.data.key_findings,
        recommendations: response.data.recommendations,
        findings: response.data.findings,
        dspyMetadata: response.data.dspy_metadata,
      };
    } catch (error) {
      logger.error('DSPy enhanced analysis failed', { error: error.message });
      return null;
    }
  }

  private async loraEnhancedAnalysis(
    baseAnalysis: any,
    adapterId: string
  ): Promise<any> {
    try {
      const response = await axios.post(`${this.loraServiceUrl}/api/lora/inference`, {
        adapter_id: adapterId,
        input: JSON.stringify(baseAnalysis),
        task_type: 'legal_analysis',
      }, { timeout: 60000 });

      // Parse LoRA-enhanced output and merge with base analysis
      const loraOutput = JSON.parse(response.data.output);
      
      return {
        ...baseAnalysis,
        ...loraOutput,
        // Enhance risk score with LoRA refinement
        riskScore: Math.round((baseAnalysis.riskScore + loraOutput.riskScore) / 2),
        // Merge findings
        findings: [
          ...baseAnalysis.findings,
          ...(loraOutput.findings || []),
        ].slice(0, 50), // Limit to 50 findings
        loraMetadata: {
          adapter_id: adapterId,
          gate_activations: response.data.gate_activations,
          used_gates: response.data.used_gates,
          inference_time_ms: response.data.inference_time_ms,
        },
      };
    } catch (error) {
      logger.error('LoRA enhanced analysis failed', { error: error.message });
      return baseAnalysis; // Return original if LoRA fails
    }
  }

  private async curriculumAwareEnhancement(
    analysisResult: any,
    curriculumLevel: string,
    knowledgeContext: string[]
  ): Promise<any> {
    try {
      const response = await axios.post(`${this.knowledgeGraphUrl}/api/curriculum/enhance`, {
        analysis_result: analysisResult,
        curriculum_level: curriculumLevel,
        knowledge_context: knowledgeContext,
      }, { timeout: 30000 });

      return {
        ...analysisResult,
        // Add curriculum-specific enhancements
        findings: analysisResult.findings.map((finding: any, index: number) => ({
          ...finding,
          curriculumContext: response.data.enhancements?.[index]?.curriculum_context,
          difficultyLevel: response.data.enhancements?.[index]?.difficulty_level,
          prerequisiteKnowledge: response.data.enhancements?.[index]?.prerequisites,
        })),
        curriculumMetadata: {
          level: curriculumLevel,
          adaptations: response.data.adaptations || [],
          learning_objectives: response.data.learning_objectives || [],
        },
      };
    } catch (error) {
      logger.error('Curriculum-aware enhancement failed', { error: error.message });
      return analysisResult; // Return original if enhancement fails
    }
  }

  private async addKnowledgeReferences(
    findings: any[],
    knowledgeContext: string[]
  ): Promise<any[]> {
    if (knowledgeContext.length === 0) {
      return findings;
    }

    try {
      const response = await axios.post(`${this.knowledgeGraphUrl}/api/knowledge/references`, {
        findings,
        knowledge_context: knowledgeContext,
      }, { timeout: 15000 });

      return findings.map((finding, index) => ({
        ...finding,
        knowledgeReferences: response.data.references?.[index] || [],
        relatedConcepts: response.data.related_concepts?.[index] || [],
        supportingEvidence: response.data.evidence?.[index] || [],
      }));
    } catch (error) {
      logger.warn('Failed to add knowledge references', { error: error.message });
      return findings;
    }
  }

  private wrapLegacyResult(
    legacyResult: any,
    startTime: number
  ): EnhancedAnalysisResult {
    return {
      ...legacyResult,
      findings: legacyResult.findings.map((finding: any) => ({
        ...finding,
        knowledgeReferences: [],
        curriculumContext: undefined,
      })),
      enhancementMetadata: {
        knowledgeContext: [],
        curriculumLevel: 'basic',
        processingTime: Date.now() - startTime,
        enhancementScore: 0,
      },
    };
  }

  private calculateEnhancementScore(
    config: EnhancedAnalysisConfig,
    result: any,
    processingTime: number
  ): number {
    let score = 0;
    
    // Base score for enabled enhancements
    if (config.useDSPy) score += 30;
    if (config.useLoRA) score += 25;
    if (config.useKnowledgeGraph) score += 20;
    
    // Curriculum level bonus
    const curriculumBonus = {
      basic: 5,
      intermediate: 10,
      advanced: 15,
    };
    score += curriculumBonus[config.curriculumLevel];

    // Performance penalty for slow processing
    if (processingTime > 30000) score -= 10; // -10 for >30s
    if (processingTime > 60000) score -= 20; // -20 for >60s

    // Quality bonus based on findings
    const findingsCount = result.findings?.length || 0;
    if (findingsCount > 10) score += 5;
    if (findingsCount > 20) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private mapCurriculumToDepth(level: string): 'basic' | 'detailed' | 'comprehensive' {
    switch (level) {
      case 'basic': return 'basic';
      case 'intermediate': return 'detailed';
      case 'advanced': return 'comprehensive';
      default: return 'detailed';
    }
  }

  // New method for batch enhanced analysis
  async batchAnalyzeDocuments(
    documents: Array<{
      content: string;
      documentType: string;
      language?: string;
      enhancementConfig?: EnhancedAnalysisConfig;
    }>
  ): Promise<EnhancedAnalysisResult[]> {
    const results: EnhancedAnalysisResult[] = [];
    
    logger.info('Starting batch enhanced analysis', {
      documentsCount: documents.length,
    });

    // Process documents in parallel with limited concurrency
    const concurrency = 3;
    const batches = [];
    
    for (let i = 0; i < documents.length; i += concurrency) {
      const batch = documents.slice(i, i + concurrency);
      batches.push(batch);
    }

    for (const batch of batches) {
      const batchPromises = batch.map(doc => 
        this.analyzeDocument(
          doc.content,
          doc.documentType,
          doc.language || 'en',
          doc.enhancementConfig
        ).catch(error => {
          logger.error('Batch analysis item failed', { error: error.message });
          // Return minimal result for failed analysis
          return this.wrapLegacyResult({
            riskScore: 0,
            executiveSummary: 'Analysis failed',
            keyFindings: [],
            recommendations: [],
            findings: [],
          }, Date.now());
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    logger.info('Batch enhanced analysis completed', {
      documentsProcessed: results.length,
      successfulAnalyses: results.filter(r => r.riskScore > 0).length,
    });

    return results;
  }

  // Service integration health checks
  async checkIntegrationHealth(): Promise<{
    ollama: boolean;
    dspy: boolean;
    lora: boolean;
    knowledgeGraph: boolean;
    overall: boolean;
  }> {
    const health = {
      ollama: false,
      dspy: false,
      lora: false,
      knowledgeGraph: false,
      overall: false,
    };

    // Check Ollama
    try {
      health.ollama = await this.healthCheck();
    } catch (error) {
      logger.warn('Ollama health check failed');
    }

    // Check DSPy service
    try {
      const response = await axios.get(`${this.dspyServiceUrl}/health`, { timeout: 5000 });
      health.dspy = response.status === 200;
    } catch (error) {
      logger.warn('DSPy service health check failed');
    }

    // Check LoRA service
    try {
      const response = await axios.get(`${this.loraServiceUrl}/health`, { timeout: 5000 });
      health.lora = response.status === 200;
    } catch (error) {
      logger.warn('LoRA service health check failed');
    }

    // Check Knowledge Graph service
    try {
      const response = await axios.get(`${this.knowledgeGraphUrl}/health`, { timeout: 5000 });
      health.knowledgeGraph = response.status === 200;
    } catch (error) {
      logger.warn('Knowledge Graph service health check failed');
    }

    health.overall = health.ollama; // At minimum, Ollama must be healthy

    return health;
  }
}