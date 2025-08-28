import { Job } from 'bullmq';
import { queueManager } from '@fineprintai/queue';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import type { AnalysisJobData, AnalysisJobResult } from '@fineprintai/shared-types';
import { AnalysisService } from '../services/analysis';
import { OllamaService } from '../services/ollama';
import { PatternService } from '../services/patterns';

const logger = createServiceLogger('analysis-worker');

export async function setupWorkers() {
  const analysisService = new AnalysisService();
  const ollamaService = new OllamaService();
  const patternService = new PatternService();

  // Create analysis worker
  const analysisWorker = queueManager.createWorker<AnalysisJobData>(
    'analysis',
    async (job: Job<AnalysisJobData>) => {
      const { analysisId, documentId, userId, content, documentType, language } = job.data;

      try {
        // Update status to processing
        await analysisService.updateAnalysisStatus(analysisId, 'processing');

        // Update job progress
        await job.updateProgress({
          percentage: 10,
          stage: 'preprocessing',
          message: 'Preparing document for analysis',
        });

        const startTime = Date.now();

        // Preprocess content
        const cleanContent = preprocessDocument(content);
        
        await job.updateProgress({
          percentage: 20,
          stage: 'pattern_matching',
          message: 'Running pattern-based analysis',
        });

        // Run pattern-based analysis first (faster)
        const patternMatches = await patternService.analyzeDocument(
          cleanContent,
          documentType
        );

        await job.updateProgress({
          percentage: 40,
          stage: 'ai_analysis',
          message: 'Running AI analysis',
        });

        // Run AI analysis
        const aiAnalysis = await ollamaService.analyzeDocument(
          cleanContent,
          documentType,
          language
        );

        await job.updateProgress({
          percentage: 80,
          stage: 'combining_results',
          message: 'Combining analysis results',
        });

        // Combine pattern matches with AI analysis
        const combinedFindings = combineAnalysisResults(patternMatches, aiAnalysis.findings);

        // Calculate final risk score
        const finalRiskScore = calculateFinalRiskScore(
          aiAnalysis.riskScore,
          combinedFindings
        );

        const processingTime = Date.now() - startTime;

        await job.updateProgress({
          percentage: 95,
          stage: 'saving_results',
          message: 'Saving analysis results',
        });

        // Save results to database
        await analysisService.saveAnalysisResults(analysisId, {
          overallRiskScore: finalRiskScore,
          executiveSummary: aiAnalysis.executiveSummary,
          keyFindings: aiAnalysis.keyFindings,
          recommendations: aiAnalysis.recommendations,
          findings: combinedFindings,
          processingTimeMs: processingTime,
          modelUsed: config.ai.ollama.defaultModel,
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
          status: 'completed' as const,
          overallRiskScore: finalRiskScore,
          executiveSummary: aiAnalysis.executiveSummary,
          keyFindings: aiAnalysis.keyFindings,
          recommendations: aiAnalysis.recommendations,
          findings: combinedFindings,
          processingTimeMs: processingTime,
          modelUsed: config.ai.ollama.defaultModel,
        };

      } catch (error) {
        logger.error('Analysis job failed', {
          error: error.message,
          stack: error.stack,
          analysisId,
          documentId,
          userId,
        });

        // Update analysis status to failed
        await analysisService.updateAnalysisStatus(
          analysisId, 
          'failed', 
          error.message
        );

        throw error;
      }
    },
    {
      concurrency: config.queues.analysis.concurrency,
      limiter: {
        max: 10,
        duration: 60 * 1000, // 10 jobs per minute
      },
    }
  );

  logger.info('Analysis workers started', {
    concurrency: config.queues.analysis.concurrency,
  });

  return { analysisWorker };
}

function preprocessDocument(content: string): string {
  // Clean up the document content
  return content
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    // Remove HTML tags if any
    .replace(/<[^>]*>/g, '')
    // Remove special characters that might interfere with analysis
    .replace(/[^\w\s.,;:!?()-]/g, '')
    // Normalize line breaks
    .replace(/\n+/g, '\n')
    // Trim
    .trim();
}

function combineAnalysisResults(
  patternMatches: Array<{
    category: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidenceScore: number;
    textExcerpt?: string;
    recommendation?: string;
    patternId?: string;
  }>,
  aiFindings: Array<{
    category: string;
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidenceScore: number;
    textExcerpt?: string;
    recommendation?: string;
    impactExplanation?: string;
  }>
): Array<{
  category: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidenceScore: number;
  textExcerpt?: string;
  positionStart?: number;
  positionEnd?: number;
  recommendation?: string;
  impactExplanation?: string;
  patternId?: string;
}> {
  const combined = [];

  // Add pattern matches first (they're more reliable)
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

  // Add AI findings, but avoid duplicates
  for (const finding of aiFindings) {
    // Simple deduplication based on title similarity
    const isDuplicate = combined.some(existing => 
      similarity(existing.title.toLowerCase(), finding.title.toLowerCase()) > 0.7
    );

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

  // Sort by severity and confidence
  return combined.sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.confidenceScore - a.confidenceScore;
  });
}

function calculateFinalRiskScore(
  aiRiskScore: number,
  findings: Array<{ severity: string; confidenceScore: number }>
): number {
  // Weight AI score 60%, pattern-based score 40%
  const patternScore = calculatePatternRiskScore(findings);
  const finalScore = Math.round(aiRiskScore * 0.6 + patternScore * 0.4);
  return Math.max(0, Math.min(100, finalScore));
}

function calculatePatternRiskScore(
  findings: Array<{ severity: string; confidenceScore: number }>
): number {
  if (findings.length === 0) return 0;

  const severityWeights = { critical: 25, high: 15, medium: 8, low: 3 };
  let totalScore = 0;

  for (const finding of findings) {
    const weight = severityWeights[finding.severity as keyof typeof severityWeights] || 0;
    totalScore += weight * finding.confidenceScore;
  }

  return Math.min(100, totalScore);
}

function similarity(a: string, b: string): number {
  // Simple string similarity calculation
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(a: string, b: string): number {
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
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}