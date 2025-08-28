"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedOllamaService = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const logger = (0, logger_1.createServiceLogger)('enhanced-ollama-service');
class EnhancedOllamaService {
    client;
    baseUrl;
    cache;
    dspyServiceUrl;
    loraServiceUrl;
    knowledgeGraphUrl;
    constructor() {
        this.baseUrl = config_1.config.ai.ollama.url;
        this.cache = new cache_1.CacheService();
        this.dspyServiceUrl = config_1.config.services.dspy?.url || 'http://localhost:8006';
        this.loraServiceUrl = config_1.config.services.lora?.url || 'http://localhost:8007';
        this.knowledgeGraphUrl = config_1.config.services.knowledgeGraph?.url || 'http://localhost:8008';
        this.client = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: config_1.config.ai.ollama.timeout,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        this.client.interceptors.request.use((config) => {
            logger.debug('Ollama request', {
                method: config.method,
                url: config.url,
                model: config.data?.model,
            });
            return config;
        });
        this.client.interceptors.response.use((response) => {
            logger.debug('Ollama response', {
                status: response.status,
                model: response.data?.model,
                done: response.data?.done,
            });
            return response;
        }, (error) => {
            logger.error('Ollama request failed', {
                error: error.message,
                status: error.response?.status,
                data: error.response?.data,
            });
            throw error;
        });
    }
    async generate(request) {
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
        }
        catch (error) {
            logger.error('Failed to generate with Ollama', {
                error: error.message,
                model: request.model,
                prompt: request.prompt.substring(0, 100),
            });
            throw error;
        }
    }
    async chat(messages, model) {
        try {
            const startTime = Date.now();
            const response = await this.client.post('/api/chat', {
                model: model || config_1.config.ai.ollama.defaultModel,
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
        }
        catch (error) {
            logger.error('Failed to chat with Ollama', {
                error: error.message,
                model: model || config_1.config.ai.ollama.defaultModel,
                messagesCount: messages.length,
            });
            throw error;
        }
    }
    async getAvailableModels() {
        try {
            const response = await this.client.get('/api/tags');
            return response.data.models.map((model) => model.name);
        }
        catch (error) {
            logger.error('Failed to get available models', { error: error.message });
            throw error;
        }
    }
    async pullModel(modelName) {
        try {
            logger.info('Pulling model', { modelName });
            const response = await this.client.post('/api/pull', {
                name: modelName,
            });
            logger.info('Model pulled successfully', { modelName });
            return true;
        }
        catch (error) {
            logger.error('Failed to pull model', {
                error: error.message,
                modelName,
            });
            return false;
        }
    }
    async isModelAvailable(modelName) {
        try {
            const models = await this.getAvailableModels();
            return models.includes(modelName);
        }
        catch (error) {
            logger.error('Failed to check model availability', {
                error: error.message,
                modelName,
            });
            return false;
        }
    }
    async analyzeDocument(content, documentType, language = 'en', enhancementConfig) {
        const startTime = Date.now();
        try {
            logger.info('Starting enhanced document analysis', {
                documentType,
                language,
                contentLength: content.length,
                enhancements: enhancementConfig,
            });
            if (!enhancementConfig) {
                const legacyResult = await this.legacyAnalyzeDocument(content, documentType, language);
                return this.wrapLegacyResult(legacyResult, startTime);
            }
            let analysisResult;
            const enhancementMetadata = {
                knowledgeContext: enhancementConfig.knowledgeContext || [],
                curriculumLevel: enhancementConfig.curriculumLevel,
                processingTime: 0,
                enhancementScore: 0,
            };
            if (enhancementConfig.useKnowledgeGraph) {
                const knowledgeContext = await this.getKnowledgeContext(content, documentType);
                enhancementMetadata.knowledgeContext = knowledgeContext;
            }
            if (enhancementConfig.useDSPy) {
                analysisResult = await this.dspyEnhancedAnalysis(content, documentType, language, enhancementConfig, enhancementMetadata.knowledgeContext);
                enhancementMetadata.dspyModule = enhancementConfig.moduleOverride || 'auto-selected';
            }
            if (enhancementConfig.useLoRA && enhancementConfig.adapterId) {
                analysisResult = await this.loraEnhancedAnalysis(analysisResult || { content, documentType, language }, enhancementConfig.adapterId);
                enhancementMetadata.loraAdapter = enhancementConfig.adapterId;
            }
            if (enhancementConfig.curriculumLevel !== 'basic') {
                analysisResult = await this.curriculumAwareEnhancement(analysisResult, enhancementConfig.curriculumLevel, enhancementMetadata.knowledgeContext);
            }
            if (!analysisResult) {
                logger.warn('Enhanced analysis failed, falling back to legacy');
                const legacyResult = await this.legacyAnalyzeDocument(content, documentType, language);
                return this.wrapLegacyResult(legacyResult, startTime);
            }
            const processingTime = Date.now() - startTime;
            enhancementMetadata.processingTime = processingTime;
            enhancementMetadata.enhancementScore = this.calculateEnhancementScore(enhancementConfig, analysisResult, processingTime);
            const enhancedFindings = await this.addKnowledgeReferences(analysisResult.findings, enhancementMetadata.knowledgeContext);
            const result = {
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
        }
        catch (error) {
            logger.error('Enhanced document analysis failed', {
                error: error.message,
                documentType,
                contentLength: content.length,
                enhancements: enhancementConfig,
            });
            throw error;
        }
    }
    async legacyAnalyzeDocument(content, documentType, language = 'en') {
        const prompt = this.buildAnalysisPrompt(content, documentType, language);
        const response = await this.generate({
            model: config_1.config.ai.ollama.defaultModel,
            prompt,
            options: {
                temperature: 0.1,
                max_tokens: 4096,
            },
        });
        return this.parseAnalysisResponse(response.response);
    }
    buildAnalysisPrompt(content, documentType, language) {
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
    parseAnalysisResponse(response) {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            const result = JSON.parse(jsonMatch[0]);
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
                    ? result.findings.slice(0, 50).map((finding) => ({
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
        }
        catch (error) {
            logger.error('Failed to parse analysis response', {
                error: error.message,
                response: response.substring(0, 500),
            });
            return {
                riskScore: 50,
                executiveSummary: 'Unable to complete detailed analysis due to parsing error.',
                keyFindings: ['Document analysis encountered technical difficulties'],
                recommendations: ['Please try analyzing the document again'],
                findings: [{
                        category: 'Other',
                        title: 'Analysis Error',
                        description: 'The document analysis could not be completed successfully.',
                        severity: 'medium',
                        confidenceScore: 0.1,
                        recommendation: 'Try submitting the document again or contact support',
                        impactExplanation: 'Technical issue prevented complete analysis',
                    }],
            };
        }
    }
    async healthCheck() {
        try {
            const response = await this.client.get('/api/tags', { timeout: 5000 });
            return response.status === 200;
        }
        catch (error) {
            logger.error('Ollama health check failed', { error: error.message });
            return false;
        }
    }
    async getKnowledgeContext(content, documentType) {
        try {
            const response = await axios_1.default.post(`${this.knowledgeGraphUrl}/api/knowledge/extract`, {
                content,
                document_type: documentType,
                extract_concepts: true,
                extract_patterns: true,
            }, { timeout: 30000 });
            return response.data.concepts || [];
        }
        catch (error) {
            logger.warn('Failed to get knowledge context', { error: error.message });
            return [];
        }
    }
    async dspyEnhancedAnalysis(content, documentType, language, config, knowledgeContext) {
        try {
            const analysisDepth = this.mapCurriculumToDepth(config.curriculumLevel);
            const response = await axios_1.default.post(`${this.dspyServiceUrl}/api/dspy/analyze`, {
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
        }
        catch (error) {
            logger.error('DSPy enhanced analysis failed', { error: error.message });
            return null;
        }
    }
    async loraEnhancedAnalysis(baseAnalysis, adapterId) {
        try {
            const response = await axios_1.default.post(`${this.loraServiceUrl}/api/lora/inference`, {
                adapter_id: adapterId,
                input: JSON.stringify(baseAnalysis),
                task_type: 'legal_analysis',
            }, { timeout: 60000 });
            const loraOutput = JSON.parse(response.data.output);
            return {
                ...baseAnalysis,
                ...loraOutput,
                riskScore: Math.round((baseAnalysis.riskScore + loraOutput.riskScore) / 2),
                findings: [
                    ...baseAnalysis.findings,
                    ...(loraOutput.findings || []),
                ].slice(0, 50),
                loraMetadata: {
                    adapter_id: adapterId,
                    gate_activations: response.data.gate_activations,
                    used_gates: response.data.used_gates,
                    inference_time_ms: response.data.inference_time_ms,
                },
            };
        }
        catch (error) {
            logger.error('LoRA enhanced analysis failed', { error: error.message });
            return baseAnalysis;
        }
    }
    async curriculumAwareEnhancement(analysisResult, curriculumLevel, knowledgeContext) {
        try {
            const response = await axios_1.default.post(`${this.knowledgeGraphUrl}/api/curriculum/enhance`, {
                analysis_result: analysisResult,
                curriculum_level: curriculumLevel,
                knowledge_context: knowledgeContext,
            }, { timeout: 30000 });
            return {
                ...analysisResult,
                findings: analysisResult.findings.map((finding, index) => ({
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
        }
        catch (error) {
            logger.error('Curriculum-aware enhancement failed', { error: error.message });
            return analysisResult;
        }
    }
    async addKnowledgeReferences(findings, knowledgeContext) {
        if (knowledgeContext.length === 0) {
            return findings;
        }
        try {
            const response = await axios_1.default.post(`${this.knowledgeGraphUrl}/api/knowledge/references`, {
                findings,
                knowledge_context: knowledgeContext,
            }, { timeout: 15000 });
            return findings.map((finding, index) => ({
                ...finding,
                knowledgeReferences: response.data.references?.[index] || [],
                relatedConcepts: response.data.related_concepts?.[index] || [],
                supportingEvidence: response.data.evidence?.[index] || [],
            }));
        }
        catch (error) {
            logger.warn('Failed to add knowledge references', { error: error.message });
            return findings;
        }
    }
    wrapLegacyResult(legacyResult, startTime) {
        return {
            ...legacyResult,
            findings: legacyResult.findings.map((finding) => ({
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
    calculateEnhancementScore(config, result, processingTime) {
        let score = 0;
        if (config.useDSPy)
            score += 30;
        if (config.useLoRA)
            score += 25;
        if (config.useKnowledgeGraph)
            score += 20;
        const curriculumBonus = {
            basic: 5,
            intermediate: 10,
            advanced: 15,
        };
        score += curriculumBonus[config.curriculumLevel];
        if (processingTime > 30000)
            score -= 10;
        if (processingTime > 60000)
            score -= 20;
        const findingsCount = result.findings?.length || 0;
        if (findingsCount > 10)
            score += 5;
        if (findingsCount > 20)
            score += 5;
        return Math.max(0, Math.min(100, score));
    }
    mapCurriculumToDepth(level) {
        switch (level) {
            case 'basic': return 'basic';
            case 'intermediate': return 'detailed';
            case 'advanced': return 'comprehensive';
            default: return 'detailed';
        }
    }
    async batchAnalyzeDocuments(documents) {
        const results = [];
        logger.info('Starting batch enhanced analysis', {
            documentsCount: documents.length,
        });
        const concurrency = 3;
        const batches = [];
        for (let i = 0; i < documents.length; i += concurrency) {
            const batch = documents.slice(i, i + concurrency);
            batches.push(batch);
        }
        for (const batch of batches) {
            const batchPromises = batch.map(doc => this.analyzeDocument(doc.content, doc.documentType, doc.language || 'en', doc.enhancementConfig).catch(error => {
                logger.error('Batch analysis item failed', { error: error.message });
                return this.wrapLegacyResult({
                    riskScore: 0,
                    executiveSummary: 'Analysis failed',
                    keyFindings: [],
                    recommendations: [],
                    findings: [],
                }, Date.now());
            }));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }
        logger.info('Batch enhanced analysis completed', {
            documentsProcessed: results.length,
            successfulAnalyses: results.filter(r => r.riskScore > 0).length,
        });
        return results;
    }
    async checkIntegrationHealth() {
        const health = {
            ollama: false,
            dspy: false,
            lora: false,
            knowledgeGraph: false,
            overall: false,
        };
        try {
            health.ollama = await this.healthCheck();
        }
        catch (error) {
            logger.warn('Ollama health check failed');
        }
        try {
            const response = await axios_1.default.get(`${this.dspyServiceUrl}/health`, { timeout: 5000 });
            health.dspy = response.status === 200;
        }
        catch (error) {
            logger.warn('DSPy service health check failed');
        }
        try {
            const response = await axios_1.default.get(`${this.loraServiceUrl}/health`, { timeout: 5000 });
            health.lora = response.status === 200;
        }
        catch (error) {
            logger.warn('LoRA service health check failed');
        }
        try {
            const response = await axios_1.default.get(`${this.knowledgeGraphUrl}/health`, { timeout: 5000 });
            health.knowledgeGraph = response.status === 200;
        }
        catch (error) {
            logger.warn('Knowledge Graph service health check failed');
        }
        health.overall = health.ollama;
        return health;
    }
}
exports.EnhancedOllamaService = EnhancedOllamaService;
//# sourceMappingURL=ollama.js.map