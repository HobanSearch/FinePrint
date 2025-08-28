"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWorkers = setupWorkers;
const queue_1 = require("@fineprintai/queue");
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const analysis_1 = require("../services/analysis");
const ollama_1 = require("../services/ollama");
const patterns_1 = require("../services/patterns");
const logger = (0, logger_1.createServiceLogger)('analysis-worker');
async function setupWorkers() {
    const analysisService = new analysis_1.AnalysisService();
    const ollamaService = new ollama_1.OllamaService();
    const patternService = new patterns_1.PatternService();
    const analysisWorker = queue_1.queueManager.createWorker('analysis', async (job) => {
        const { analysisId, documentId, userId, content, documentType, language } = job.data;
        try {
            await analysisService.updateAnalysisStatus(analysisId, 'processing');
            await job.updateProgress({
                percentage: 10,
                stage: 'preprocessing',
                message: 'Preparing document for analysis',
            });
            const startTime = Date.now();
            const cleanContent = preprocessDocument(content);
            await job.updateProgress({
                percentage: 20,
                stage: 'pattern_matching',
                message: 'Running pattern-based analysis',
            });
            const patternMatches = await patternService.analyzeDocument(cleanContent, documentType);
            await job.updateProgress({
                percentage: 40,
                stage: 'ai_analysis',
                message: 'Running AI analysis',
            });
            const aiAnalysis = await ollamaService.analyzeDocument(cleanContent, documentType, language);
            await job.updateProgress({
                percentage: 80,
                stage: 'combining_results',
                message: 'Combining analysis results',
            });
            const combinedFindings = combineAnalysisResults(patternMatches, aiAnalysis.findings);
            const finalRiskScore = calculateFinalRiskScore(aiAnalysis.riskScore, combinedFindings);
            const processingTime = Date.now() - startTime;
            await job.updateProgress({
                percentage: 95,
                stage: 'saving_results',
                message: 'Saving analysis results',
            });
            await analysisService.saveAnalysisResults(analysisId, {
                overallRiskScore: finalRiskScore,
                executiveSummary: aiAnalysis.executiveSummary,
                keyFindings: aiAnalysis.keyFindings,
                recommendations: aiAnalysis.recommendations,
                findings: combinedFindings,
                processingTimeMs: processingTime,
                modelUsed: config_1.config.ai.ollama.defaultModel,
            });
            await job.updateProgress({
                percentage: 100,
                stage: 'completed',
                message: 'Analysis completed successfully',
            });
            logger.info('Analysis job completed', {
                analysisId,
                documentId,
                userId,
                processingTime,
                finalRiskScore,
                findingsCount: combinedFindings.length,
            });
            return {
                analysisId,
                status: 'completed',
                overallRiskScore: finalRiskScore,
                executiveSummary: aiAnalysis.executiveSummary,
                keyFindings: aiAnalysis.keyFindings,
                recommendations: aiAnalysis.recommendations,
                findings: combinedFindings,
                processingTimeMs: processingTime,
                modelUsed: config_1.config.ai.ollama.defaultModel,
            };
        }
        catch (error) {
            logger.error('Analysis job failed', {
                error: error.message,
                stack: error.stack,
                analysisId,
                documentId,
                userId,
            });
            await analysisService.updateAnalysisStatus(analysisId, 'failed', error.message);
            throw error;
        }
    }, {
        concurrency: config_1.config.queues.analysis.concurrency,
        limiter: {
            max: 10,
            duration: 60 * 1000,
        },
    });
    logger.info('Analysis workers started', {
        concurrency: config_1.config.queues.analysis.concurrency,
    });
    return { analysisWorker };
}
function preprocessDocument(content) {
    return content
        .replace(/\s+/g, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/[^\w\s.,;:!?()-]/g, '')
        .replace(/\n+/g, '\n')
        .trim();
}
function combineAnalysisResults(patternMatches, aiFindings) {
    const combined = [];
    for (const match of patternMatches) {
        combined.push({
            category: match.category,
            title: match.title,
            description: match.description,
            severity: match.severity,
            confidenceScore: match.confidenceScore,
            textExcerpt: match.textExcerpt,
            recommendation: match.recommendation,
            patternId: match.patternId,
        });
    }
    for (const finding of aiFindings) {
        const isDuplicate = combined.some(existing => similarity(existing.title.toLowerCase(), finding.title.toLowerCase()) > 0.7);
        if (!isDuplicate) {
            combined.push({
                category: finding.category,
                title: finding.title,
                description: finding.description,
                severity: finding.severity,
                confidenceScore: finding.confidenceScore,
                textExcerpt: finding.textExcerpt,
                recommendation: finding.recommendation,
                impactExplanation: finding.impactExplanation,
            });
        }
    }
    return combined.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0)
            return severityDiff;
        return b.confidenceScore - a.confidenceScore;
    });
}
function calculateFinalRiskScore(aiRiskScore, findings) {
    const patternScore = calculatePatternRiskScore(findings);
    const finalScore = Math.round(aiRiskScore * 0.6 + patternScore * 0.4);
    return Math.max(0, Math.min(100, finalScore));
}
function calculatePatternRiskScore(findings) {
    if (findings.length === 0)
        return 0;
    const severityWeights = { critical: 25, high: 15, medium: 8, low: 3 };
    let totalScore = 0;
    for (const finding of findings) {
        const weight = severityWeights[finding.severity] || 0;
        totalScore += weight * finding.confidenceScore;
    }
    return Math.min(100, totalScore);
}
function similarity(a, b) {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0)
        return 1.0;
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}
function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
            }
        }
    }
    return matrix[b.length][a.length];
}
//# sourceMappingURL=index.js.map