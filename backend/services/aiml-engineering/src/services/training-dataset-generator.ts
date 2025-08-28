/**
 * Fine Print AI - Training Dataset Generation Service
 * 
 * Transforms aggregated legal documents into training datasets for model fine-tuning
 * Creates labeled datasets for different tasks: risk assessment, clause detection, compliance analysis
 */

import { PrismaClient } from '@prisma/client';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { CacheService } from '@fineprintai/shared-cache';
import { QueueService } from '@fineprintai/queue';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const logger = createServiceLogger('training-dataset-generator');

// Dataset Configuration Schema
export const DatasetConfigSchema = z.object({
  name: z.string(),
  task_type: z.enum(['risk_assessment', 'clause_detection', 'compliance_analysis', 'recommendation_generation']),
  jurisdiction: z.enum(['global', 'eu', 'us', 'ca', 'br', 'sg']).default('global'),
  min_examples: z.number().min(100).default(1000),
  max_examples: z.number().min(1000).default(10000),
  validation_split: z.number().min(0.1).max(0.5).default(0.2),
  test_split: z.number().min(0.1).max(0.3).default(0.1),
  format: z.enum(['jsonl', 'csv', 'parquet', 'huggingface']).default('jsonl'),
  include_metadata: z.boolean().default(true),
  quality_threshold: z.number().min(0.5).max(1.0).default(0.8),
});

export type DatasetConfig = z.infer<typeof DatasetConfigSchema>;

export interface TrainingExample {
  id: string;
  input: string;
  output: string;
  metadata: {
    source_document: string;
    website: string;
    document_type: string;
    jurisdiction: string;
    confidence_score: number;
    risk_level: string;
    clause_types: string[];
    created_at: Date;
  };
}

export interface Dataset {
  id: string;
  name: string;
  config: DatasetConfig;
  examples: TrainingExample[];
  statistics: {
    total_examples: number;
    train_examples: number;
    validation_examples: number;
    test_examples: number;
    avg_input_length: number;
    avg_output_length: number;
    label_distribution: Record<string, number>;
    quality_score: number;
  };
  created_at: Date;
  updated_at: Date;
  status: 'generating' | 'completed' | 'failed';
  file_paths: {
    train: string;
    validation: string;
    test: string;
    metadata: string;
  };
}

export class TrainingDatasetGenerator {
  private prisma: PrismaClient;
  private cache: CacheService;
  private queue: QueueService;
  private datasetsPath: string;

  constructor(prisma: PrismaClient, datasetsPath: string = './datasets') {
    this.prisma = prisma;
    this.cache = new CacheService('training-datasets');
    this.queue = new QueueService('dataset-generation');
    this.datasetsPath = datasetsPath;
  }

  /**
   * Generate training dataset from aggregated documents
   */
  async generateDataset(config: DatasetConfig): Promise<Dataset> {
    logger.info('Starting dataset generation', { config });

    const datasetId = uuidv4();
    const dataset: Dataset = {
      id: datasetId,
      name: config.name,
      config,
      examples: [],
      statistics: {
        total_examples: 0,
        train_examples: 0,
        validation_examples: 0,
        test_examples: 0,
        avg_input_length: 0,
        avg_output_length: 0,
        label_distribution: {},
        quality_score: 0,
      },
      created_at: new Date(),
      updated_at: new Date(),
      status: 'generating',
      file_paths: {
        train: path.join(this.datasetsPath, datasetId, 'train.jsonl'),
        validation: path.join(this.datasetsPath, datasetId, 'validation.jsonl'),
        test: path.join(this.datasetsPath, datasetId, 'test.jsonl'),
        metadata: path.join(this.datasetsPath, datasetId, 'metadata.json'),
      },
    };

    try {
      // Create dataset directory
      await fs.ensureDir(path.dirname(dataset.file_paths.train));

      // Generate examples based on task type
      const examples = await this.generateExamplesByTask(config);
      
      // Filter and validate examples
      const validExamples = await this.filterAndValidateExamples(examples, config);
      
      // Split into train/validation/test
      const splits = this.splitDataset(validExamples, config);
      
      // Calculate statistics
      dataset.statistics = this.calculateStatistics(splits, config);
      dataset.examples = validExamples;
      dataset.status = 'completed';
      dataset.updated_at = new Date();

      // Save dataset files
      await this.saveDatasetFiles(dataset, splits);
      
      // Cache dataset metadata
      await this.cache.set(`dataset:${datasetId}`, dataset, 3600 * 24); // 24 hours

      logger.info('Dataset generation completed', {
        datasetId,
        totalExamples: dataset.statistics.total_examples,
        qualityScore: dataset.statistics.quality_score,
      });

      return dataset;
    } catch (error) {
      dataset.status = 'failed';
      logger.error('Dataset generation failed', { datasetId, error });
      throw error;
    }
  }

  /**
   * Generate examples based on task type
   */
  private async generateExamplesByTask(config: DatasetConfig): Promise<TrainingExample[]> {
    switch (config.task_type) {
      case 'risk_assessment':
        return this.generateRiskAssessmentExamples(config);
      case 'clause_detection':  
        return this.generateClauseDetectionExamples(config);
      case 'compliance_analysis':
        return this.generateComplianceAnalysisExamples(config);
      case 'recommendation_generation':
        return this.generateRecommendationExamples(config);
      default:
        throw new Error(`Unsupported task type: ${config.task_type}`);
    }
  }

  /**
   * Generate risk assessment training examples
   */
  private async generateRiskAssessmentExamples(config: DatasetConfig): Promise<TrainingExample[]> {
    const documents = await this.getAggregatedDocuments(config);
    const examples: TrainingExample[] = [];

    for (const doc of documents) {
      // Get existing analysis for this document
      const analysis = await this.prisma.documentAnalysis.findFirst({
        where: { 
          documentId: doc.id,
          status: 'completed',
        },
        orderBy: { completedAt: 'desc' },
      });

      if (!analysis) continue;

      // Create risk assessment examples from document segments
      const segments = this.segmentDocument(doc.content);
      
      for (const segment of segments) {
        if (segment.length < 100 || segment.length > 2000) continue;

        const example: TrainingExample = {
          id: uuidv4(),
          input: `Analyze the risk level of this legal clause:\n\n${segment}`,
          output: this.formatRiskAssessmentOutput(analysis, segment),
          metadata: {
            source_document: doc.id,
            website: doc.websiteName,
            document_type: doc.documentType,
            jurisdiction: this.inferJurisdiction(doc),
            confidence_score: analysis.riskScore || 0.5,
            risk_level: this.categorizeRiskLevel(analysis.riskScore || 0.5),
            clause_types: this.extractClauseTypes(segment),
            created_at: new Date(),
          },
        };

        examples.push(example);
      }
    }

    return examples.slice(0, config.max_examples);
  }

  /**
   * Generate clause detection training examples
   */
  private async generateClauseDetectionExamples(config: DatasetConfig): Promise<TrainingExample[]> {
    const documents = await this.getAggregatedDocuments(config);
    const examples: TrainingExample[] = [];

    for (const doc of documents) {
      const analysis = await this.prisma.documentAnalysis.findFirst({
        where: { 
          documentId: doc.id,
          status: 'completed',
        },
        orderBy: { completedAt: 'desc' },
      });

      if (!analysis?.problematicClauses) continue;

      const problematicClauses = analysis.problematicClauses as any[];
      
      for (const clause of problematicClauses) {
        if (!clause.text || clause.text.length < 50) continue;

        const example: TrainingExample = {
          id: uuidv4(),
          input: `Identify problematic clauses in this text:\n\n${clause.text}`,
          output: this.formatClauseDetectionOutput(clause),
          metadata: {
            source_document: doc.id,
            website: doc.websiteName,
            document_type: doc.documentType,
            jurisdiction: this.inferJurisdiction(doc),
            confidence_score: clause.confidence || 0.8,
            risk_level: clause.severity || 'medium',
            clause_types: [clause.type || 'unknown'],
            created_at: new Date(),
          },
        };

        examples.push(example);
      }
    }

    return examples.slice(0, config.max_examples);
  }

  /**
   * Generate compliance analysis training examples
   */
  private async generateComplianceAnalysisExamples(config: DatasetConfig): Promise<TrainingExample[]> {
    const complianceAlerts = await this.prisma.complianceAlert.findMany({
      where: {
        isResolved: false,
        ...(config.jurisdiction !== 'global' && {
          regulation: this.getRegulationByJurisdiction(config.jurisdiction),
        }),
      },
      take: config.max_examples,
      include: {
        document: true,
      },
    });

    const examples: TrainingExample[] = [];

    for (const alert of complianceAlerts) {
      if (!alert.document || !alert.excerpt) continue;

      const example: TrainingExample = {
        id: uuidv4(),
        input: `Analyze this text for ${alert.regulation} compliance:\n\n${alert.excerpt}`,
        output: this.formatComplianceAnalysisOutput(alert),
        metadata: {
          source_document: alert.documentId,
          website: alert.websiteName,
          document_type: alert.document.documentType,
          jurisdiction: this.getJurisdictionByRegulation(alert.regulation),
          confidence_score: 0.9, // High confidence for compliance alerts
          risk_level: alert.severity,
          clause_types: [alert.alertType],
          created_at: new Date(),
        },
      };

      examples.push(example);
    }

    return examples;
  }

  /**
   * Generate recommendation training examples
   */
  private async generateRecommendationExamples(config: DatasetConfig): Promise<TrainingExample[]> {
    const documents = await this.getAggregatedDocuments(config);
    const examples: TrainingExample[] = [];

    for (const doc of documents) {
      const analysis = await this.prisma.documentAnalysis.findFirst({
        where: { 
          documentId: doc.id,
          status: 'completed',
        },
        orderBy: { completedAt: 'desc' },
      });

      if (!analysis?.recommendations) continue;

      const recommendations = analysis.recommendations as any[];
      
      for (const rec of recommendations) {
        if (!rec.description || rec.description.length < 50) continue;

        const context = this.extractContextForRecommendation(doc.content, rec);
        
        const example: TrainingExample = {
          id: uuidv4(),
          input: `Given this legal text, provide improvement recommendations:\n\n${context}`,
          output: this.formatRecommendationOutput(rec),
          metadata: {
            source_document: doc.id,
            website: doc.websiteName,
            document_type: doc.documentType,
            jurisdiction: this.inferJurisdiction(doc),
            confidence_score: rec.confidence || 0.7,
            risk_level: rec.priority || 'medium',
            clause_types: [rec.category || 'general'],
            created_at: new Date(),
          },
        };

        examples.push(example);
      }
    }

    return examples.slice(0, config.max_examples);
  }

  /**
   * Get aggregated documents based on configuration
   */
  private async getAggregatedDocuments(config: DatasetConfig) {
    const whereClause: any = {
      status: 'completed',
      content: { not: null },
    };

    // Filter by jurisdiction if specified
    if (config.jurisdiction !== 'global') {
      // Add jurisdiction filtering logic based on website or content analysis
      const jurisdictionWebsites = this.getWebsitesByJurisdiction(config.jurisdiction);
      if (jurisdictionWebsites.length > 0) {
        whereClause.websiteName = { in: jurisdictionWebsites };
      }
    }

    return await this.prisma.aggregatedDocument.findMany({
      where: whereClause,
      take: Math.min(config.max_examples * 2, 5000), // Get more documents to ensure enough examples
      orderBy: { crawledAt: 'desc' },
    });
  }

  /**
   * Filter and validate examples based on quality threshold
   */
  private async filterAndValidateExamples(
    examples: TrainingExample[],
    config: DatasetConfig
  ): Promise<TrainingExample[]> {
    const filtered = examples.filter(example => {
      // Basic validation
      if (!example.input || !example.output) return false;
      if (example.input.length < 50 || example.output.length < 20) return false;
      if (example.metadata.confidence_score < config.quality_threshold) return false;
      
      // Check for duplicates (basic hash comparison)
      const hash = this.generateExampleHash(example);
      if (this.seenHashes.has(hash)) return false;
      this.seenHashes.add(hash);
      
      return true;
    });

    // Ensure we have minimum examples
    if (filtered.length < config.min_examples) {
      logger.warn('Generated examples below minimum threshold', {
        generated: filtered.length,
        minimum: config.min_examples,
      });
    }

    return filtered.slice(0, config.max_examples);
  }

  private seenHashes = new Set<string>();

  /**
   * Split dataset into train/validation/test sets
   */
  private splitDataset(examples: TrainingExample[], config: DatasetConfig) {
    const shuffled = [...examples].sort(() => Math.random() - 0.5);
    
    const testSize = Math.floor(shuffled.length * config.test_split);
    const validationSize = Math.floor(shuffled.length * config.validation_split);
    const trainSize = shuffled.length - testSize - validationSize;

    return {
      train: shuffled.slice(0, trainSize),
      validation: shuffled.slice(trainSize, trainSize + validationSize),
      test: shuffled.slice(trainSize + validationSize),
    };
  }

  /**
   * Calculate dataset statistics
   */
  private calculateStatistics(
    splits: { train: TrainingExample[]; validation: TrainingExample[]; test: TrainingExample[] },
    config: DatasetConfig
  ) {
    const allExamples = [...splits.train, ...splits.validation, ...splits.test];
    
    const inputLengths = allExamples.map(e => e.input.length);
    const outputLengths = allExamples.map(e => e.output.length);
    
    const labelDistribution: Record<string, number> = {};
    allExamples.forEach(example => {
      const label = example.metadata.risk_level;
      labelDistribution[label] = (labelDistribution[label] || 0) + 1;
    });

    const avgConfidence = allExamples.reduce((sum, e) => sum + e.metadata.confidence_score, 0) / allExamples.length;

    return {
      total_examples: allExamples.length,
      train_examples: splits.train.length,
      validation_examples: splits.validation.length,
      test_examples: splits.test.length,
      avg_input_length: Math.round(inputLengths.reduce((a, b) => a + b, 0) / inputLengths.length),
      avg_output_length: Math.round(outputLengths.reduce((a, b) => a + b, 0) / outputLengths.length),
      label_distribution: labelDistribution,
      quality_score: Math.round(avgConfidence * 100) / 100,
    };
  }

  /**
   * Save dataset files to disk
   */
  private async saveDatasetFiles(
    dataset: Dataset,
    splits: { train: TrainingExample[]; validation: TrainingExample[]; test: TrainingExample[] }
  ): Promise<void> {
    // Save training examples
    await this.saveExamplesToFile(splits.train, dataset.file_paths.train, dataset.config.format);
    await this.saveExamplesToFile(splits.validation, dataset.file_paths.validation, dataset.config.format);
    await this.saveExamplesToFile(splits.test, dataset.file_paths.test, dataset.config.format);
    
    // Save metadata
    const metadata = {
      dataset_info: {
        id: dataset.id,
        name: dataset.name,
        config: dataset.config,
        statistics: dataset.statistics,
        created_at: dataset.created_at,
      },
      file_info: dataset.file_paths,
    };
    
    await fs.writeJSON(dataset.file_paths.metadata, metadata, { spaces: 2 });
  }

  /**
   * Save examples to file in specified format
   */
  private async saveExamplesToFile(
    examples: TrainingExample[],
    filePath: string,
    format: string
  ): Promise<void> {
    await fs.ensureDir(path.dirname(filePath));

    switch (format) {
      case 'jsonl':
        const jsonlContent = examples.map(example => JSON.stringify({
          input: example.input,
          output: example.output,
          metadata: example.metadata,
        })).join('\n');
        await fs.writeFile(filePath, jsonlContent);
        break;
        
      case 'csv':
        const csvHeader = 'input,output,website,document_type,risk_level,confidence_score\n';
        const csvContent = examples.map(example => 
          `"${example.input.replace(/"/g, '""')}","${example.output.replace(/"/g, '""')}","${example.metadata.website}","${example.metadata.document_type}","${example.metadata.risk_level}",${example.metadata.confidence_score}`
        ).join('\n');
        await fs.writeFile(filePath, csvHeader + csvContent);
        break;
        
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  // Helper methods
  private segmentDocument(content: string): string[] {
    // Split document into meaningful segments (paragraphs, sections)
    return content
      .split(/\n\s*\n/)
      .filter(segment => segment.trim().length > 50)
      .map(segment => segment.trim());
  }

  private formatRiskAssessmentOutput(analysis: any, segment: string): string {
    const riskScore = analysis.riskScore || 0.5;
    const riskLevel = this.categorizeRiskLevel(riskScore);
    
    return JSON.stringify({
      risk_score: riskScore,
      risk_level: riskLevel,
      reasoning: `This clause presents ${riskLevel} risk based on analysis of similar legal documents.`,
      concerns: this.extractConcerns(segment),
    });
  }

  private formatClauseDetectionOutput(clause: any): string {
    return JSON.stringify({
      clause_type: clause.type || 'problematic',
      severity: clause.severity || 'medium',
      explanation: clause.explanation || 'This clause contains problematic terms.',
      suggested_changes: clause.suggestions || [],
    });
  }

  private formatComplianceAnalysisOutput(alert: any): string {
    return JSON.stringify({
      regulation: alert.regulation,
      compliance_status: 'violation',
      severity: alert.severity,
      violation_type: alert.alertType,
      explanation: alert.description,
      recommendations: alert.recommendations || [],
    });
  }

  private formatRecommendationOutput(recommendation: any): string {
    return JSON.stringify({
      recommendation: recommendation.description,
      priority: recommendation.priority || 'medium',
      category: recommendation.category || 'general',
      implementation_steps: recommendation.steps || [],
      impact: recommendation.impact || 'Improves user privacy and compliance',
    });
  }

  private categorizeRiskLevel(score: number): string {
    if (score >= 0.8) return 'high';
    if (score >= 0.6) return 'medium';
    if (score >= 0.4) return 'low';
    return 'minimal';
  }

  private inferJurisdiction(document: any): string {
    // Simple heuristics to infer jurisdiction from website
    const domain = document.websiteName.toLowerCase();
    if (domain.includes('.eu') || domain.includes('europa.')) return 'eu';
    if (domain.includes('.gov') || domain.includes('.us')) return 'us';
    if (domain.includes('.ca')) return 'ca';
    if (domain.includes('.br')) return 'br';
    if (domain.includes('.sg')) return 'sg';
    return 'global';
  }

  private getWebsitesByJurisdiction(jurisdiction: string): string[] {
    const jurisdictionMap: Record<string, string[]> = {
      'eu': ['spotify.com', 'adidas.com', 'sap.com', 'philips.com'],
      'us': ['facebook.com', 'google.com', 'amazon.com', 'netflix.com', 'apple.com'],
      'ca': ['shopify.com', 'blackberry.com'],
      'br': ['mercadolibre.com', 'nubank.com'],
      'sg': ['grab.com', 'sea.com'],
    };
    return jurisdictionMap[jurisdiction] || [];
  }

  private getRegulationByJurisdiction(jurisdiction: string): string {
    const regulationMap: Record<string, string> = {
      'eu': 'GDPR',
      'us': 'CCPA',
      'ca': 'PIPEDA',
      'br': 'LGPD',
      'sg': 'PDPA',
    };
    return regulationMap[jurisdiction] || 'GDPR';
  }

  private getJurisdictionByRegulation(regulation: string): string {
    const jurisdictionMap: Record<string, string> = {
      'GDPR': 'eu',
      'CCPA': 'us',
      'COPPA': 'us',
      'PIPEDA': 'ca',
      'LGPD': 'br',
      'PDPA': 'sg',
    };
    return jurisdictionMap[regulation] || 'global';
  }

  private extractClauseTypes(segment: string): string[] {
    const types: string[] = [];
    const text = segment.toLowerCase();
    
    if (text.includes('data') && text.includes('collect')) types.push('data_collection');
    if (text.includes('cookie')) types.push('cookies');
    if (text.includes('third party') || text.includes('share')) types.push('data_sharing');
    if (text.includes('delete') || text.includes('remove')) types.push('data_deletion');
    if (text.includes('right') && text.includes('access')) types.push('user_rights');
    if (text.includes('liability') || text.includes('waiv')) types.push('liability_waiver');
    if (text.includes('automatic') && text.includes('renew')) types.push('auto_renewal');
    
    return types.length > 0 ? types : ['general'];
  }

  private extractConcerns(segment: string): string[] {
    const concerns: string[] = [];
    const text = segment.toLowerCase();
    
    if (text.includes('unlimited') || text.includes('unrestricted')) {
      concerns.push('Overly broad permissions');
    }
    if (text.includes('perpetual') || text.includes('forever')) {
      concerns.push('Indefinite terms');
    }
    if (text.includes('waive') || text.includes('disclaim')) {
      concerns.push('Rights waiver');
    }
    if (text.includes('difficult') && text.includes('cancel')) {
      concerns.push('Difficult cancellation');
    }
    
    return concerns;
  }

  private extractContextForRecommendation(content: string, recommendation: any): string {
    // Extract relevant context around the recommendation
    const keywords = recommendation.keywords || [];
    let context = '';
    
    const paragraphs = content.split('\n\n');
    for (const paragraph of paragraphs) {
      if (keywords.some((keyword: string) => paragraph.toLowerCase().includes(keyword.toLowerCase()))) {
        context = paragraph.trim();
        break;
      }
    }
    
    return context || content.substring(0, 500) + '...';
  }

  private generateExampleHash(example: TrainingExample): string {
    const crypto = require('crypto');
    const content = example.input + example.output;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Public API methods
   */

  async getDataset(datasetId: string): Promise<Dataset | null> {
    const cached = await this.cache.get(`dataset:${datasetId}`);
    if (cached) return cached as Dataset;
    
    // In production, this would load from database
    return null;
  }

  async listDatasets(): Promise<Dataset[]> {
    // In production, this would fetch from database
    return [];
  }

  async deleteDataset(datasetId: string): Promise<void> {
    const dataset = await this.getDataset(datasetId);
    if (!dataset) throw new Error('Dataset not found');
    
    // Remove files
    await fs.remove(path.dirname(dataset.file_paths.train));
    
    // Remove from cache
    await this.cache.delete(`dataset:${datasetId}`);
    
    logger.info('Dataset deleted', { datasetId });
  }
}