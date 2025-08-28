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
exports.TrainingDatasetGenerator = exports.DatasetConfigSchema = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const queue_1 = require("@fineprintai/queue");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const zod_1 = require("zod");
const logger = (0, logger_1.createServiceLogger)('training-dataset-generator');
exports.DatasetConfigSchema = zod_1.z.object({
    name: zod_1.z.string(),
    task_type: zod_1.z.enum(['risk_assessment', 'clause_detection', 'compliance_analysis', 'recommendation_generation']),
    jurisdiction: zod_1.z.enum(['global', 'eu', 'us', 'ca', 'br', 'sg']).default('global'),
    min_examples: zod_1.z.number().min(100).default(1000),
    max_examples: zod_1.z.number().min(1000).default(10000),
    validation_split: zod_1.z.number().min(0.1).max(0.5).default(0.2),
    test_split: zod_1.z.number().min(0.1).max(0.3).default(0.1),
    format: zod_1.z.enum(['jsonl', 'csv', 'parquet', 'huggingface']).default('jsonl'),
    include_metadata: zod_1.z.boolean().default(true),
    quality_threshold: zod_1.z.number().min(0.5).max(1.0).default(0.8),
});
class TrainingDatasetGenerator {
    prisma;
    cache;
    queue;
    datasetsPath;
    constructor(prisma, datasetsPath = './datasets') {
        this.prisma = prisma;
        this.cache = new cache_1.CacheService('training-datasets');
        this.queue = new queue_1.QueueService('dataset-generation');
        this.datasetsPath = datasetsPath;
    }
    async generateDataset(config) {
        logger.info('Starting dataset generation', { config });
        const datasetId = (0, uuid_1.v4)();
        const dataset = {
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
            await fs.ensureDir(path.dirname(dataset.file_paths.train));
            const examples = await this.generateExamplesByTask(config);
            const validExamples = await this.filterAndValidateExamples(examples, config);
            const splits = this.splitDataset(validExamples, config);
            dataset.statistics = this.calculateStatistics(splits, config);
            dataset.examples = validExamples;
            dataset.status = 'completed';
            dataset.updated_at = new Date();
            await this.saveDatasetFiles(dataset, splits);
            await this.cache.set(`dataset:${datasetId}`, dataset, 3600 * 24);
            logger.info('Dataset generation completed', {
                datasetId,
                totalExamples: dataset.statistics.total_examples,
                qualityScore: dataset.statistics.quality_score,
            });
            return dataset;
        }
        catch (error) {
            dataset.status = 'failed';
            logger.error('Dataset generation failed', { datasetId, error });
            throw error;
        }
    }
    async generateExamplesByTask(config) {
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
    async generateRiskAssessmentExamples(config) {
        const documents = await this.getAggregatedDocuments(config);
        const examples = [];
        for (const doc of documents) {
            const analysis = await this.prisma.documentAnalysis.findFirst({
                where: {
                    documentId: doc.id,
                    status: 'completed',
                },
                orderBy: { completedAt: 'desc' },
            });
            if (!analysis)
                continue;
            const segments = this.segmentDocument(doc.content);
            for (const segment of segments) {
                if (segment.length < 100 || segment.length > 2000)
                    continue;
                const example = {
                    id: (0, uuid_1.v4)(),
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
    async generateClauseDetectionExamples(config) {
        const documents = await this.getAggregatedDocuments(config);
        const examples = [];
        for (const doc of documents) {
            const analysis = await this.prisma.documentAnalysis.findFirst({
                where: {
                    documentId: doc.id,
                    status: 'completed',
                },
                orderBy: { completedAt: 'desc' },
            });
            if (!analysis?.problematicClauses)
                continue;
            const problematicClauses = analysis.problematicClauses;
            for (const clause of problematicClauses) {
                if (!clause.text || clause.text.length < 50)
                    continue;
                const example = {
                    id: (0, uuid_1.v4)(),
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
    async generateComplianceAnalysisExamples(config) {
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
        const examples = [];
        for (const alert of complianceAlerts) {
            if (!alert.document || !alert.excerpt)
                continue;
            const example = {
                id: (0, uuid_1.v4)(),
                input: `Analyze this text for ${alert.regulation} compliance:\n\n${alert.excerpt}`,
                output: this.formatComplianceAnalysisOutput(alert),
                metadata: {
                    source_document: alert.documentId,
                    website: alert.websiteName,
                    document_type: alert.document.documentType,
                    jurisdiction: this.getJurisdictionByRegulation(alert.regulation),
                    confidence_score: 0.9,
                    risk_level: alert.severity,
                    clause_types: [alert.alertType],
                    created_at: new Date(),
                },
            };
            examples.push(example);
        }
        return examples;
    }
    async generateRecommendationExamples(config) {
        const documents = await this.getAggregatedDocuments(config);
        const examples = [];
        for (const doc of documents) {
            const analysis = await this.prisma.documentAnalysis.findFirst({
                where: {
                    documentId: doc.id,
                    status: 'completed',
                },
                orderBy: { completedAt: 'desc' },
            });
            if (!analysis?.recommendations)
                continue;
            const recommendations = analysis.recommendations;
            for (const rec of recommendations) {
                if (!rec.description || rec.description.length < 50)
                    continue;
                const context = this.extractContextForRecommendation(doc.content, rec);
                const example = {
                    id: (0, uuid_1.v4)(),
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
    async getAggregatedDocuments(config) {
        const whereClause = {
            status: 'completed',
            content: { not: null },
        };
        if (config.jurisdiction !== 'global') {
            const jurisdictionWebsites = this.getWebsitesByJurisdiction(config.jurisdiction);
            if (jurisdictionWebsites.length > 0) {
                whereClause.websiteName = { in: jurisdictionWebsites };
            }
        }
        return await this.prisma.aggregatedDocument.findMany({
            where: whereClause,
            take: Math.min(config.max_examples * 2, 5000),
            orderBy: { crawledAt: 'desc' },
        });
    }
    async filterAndValidateExamples(examples, config) {
        const filtered = examples.filter(example => {
            if (!example.input || !example.output)
                return false;
            if (example.input.length < 50 || example.output.length < 20)
                return false;
            if (example.metadata.confidence_score < config.quality_threshold)
                return false;
            const hash = this.generateExampleHash(example);
            if (this.seenHashes.has(hash))
                return false;
            this.seenHashes.add(hash);
            return true;
        });
        if (filtered.length < config.min_examples) {
            logger.warn('Generated examples below minimum threshold', {
                generated: filtered.length,
                minimum: config.min_examples,
            });
        }
        return filtered.slice(0, config.max_examples);
    }
    seenHashes = new Set();
    splitDataset(examples, config) {
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
    calculateStatistics(splits, config) {
        const allExamples = [...splits.train, ...splits.validation, ...splits.test];
        const inputLengths = allExamples.map(e => e.input.length);
        const outputLengths = allExamples.map(e => e.output.length);
        const labelDistribution = {};
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
    async saveDatasetFiles(dataset, splits) {
        await this.saveExamplesToFile(splits.train, dataset.file_paths.train, dataset.config.format);
        await this.saveExamplesToFile(splits.validation, dataset.file_paths.validation, dataset.config.format);
        await this.saveExamplesToFile(splits.test, dataset.file_paths.test, dataset.config.format);
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
    async saveExamplesToFile(examples, filePath, format) {
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
                const csvContent = examples.map(example => `"${example.input.replace(/"/g, '""')}","${example.output.replace(/"/g, '""')}","${example.metadata.website}","${example.metadata.document_type}","${example.metadata.risk_level}",${example.metadata.confidence_score}`).join('\n');
                await fs.writeFile(filePath, csvHeader + csvContent);
                break;
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }
    segmentDocument(content) {
        return content
            .split(/\n\s*\n/)
            .filter(segment => segment.trim().length > 50)
            .map(segment => segment.trim());
    }
    formatRiskAssessmentOutput(analysis, segment) {
        const riskScore = analysis.riskScore || 0.5;
        const riskLevel = this.categorizeRiskLevel(riskScore);
        return JSON.stringify({
            risk_score: riskScore,
            risk_level: riskLevel,
            reasoning: `This clause presents ${riskLevel} risk based on analysis of similar legal documents.`,
            concerns: this.extractConcerns(segment),
        });
    }
    formatClauseDetectionOutput(clause) {
        return JSON.stringify({
            clause_type: clause.type || 'problematic',
            severity: clause.severity || 'medium',
            explanation: clause.explanation || 'This clause contains problematic terms.',
            suggested_changes: clause.suggestions || [],
        });
    }
    formatComplianceAnalysisOutput(alert) {
        return JSON.stringify({
            regulation: alert.regulation,
            compliance_status: 'violation',
            severity: alert.severity,
            violation_type: alert.alertType,
            explanation: alert.description,
            recommendations: alert.recommendations || [],
        });
    }
    formatRecommendationOutput(recommendation) {
        return JSON.stringify({
            recommendation: recommendation.description,
            priority: recommendation.priority || 'medium',
            category: recommendation.category || 'general',
            implementation_steps: recommendation.steps || [],
            impact: recommendation.impact || 'Improves user privacy and compliance',
        });
    }
    categorizeRiskLevel(score) {
        if (score >= 0.8)
            return 'high';
        if (score >= 0.6)
            return 'medium';
        if (score >= 0.4)
            return 'low';
        return 'minimal';
    }
    inferJurisdiction(document) {
        const domain = document.websiteName.toLowerCase();
        if (domain.includes('.eu') || domain.includes('europa.'))
            return 'eu';
        if (domain.includes('.gov') || domain.includes('.us'))
            return 'us';
        if (domain.includes('.ca'))
            return 'ca';
        if (domain.includes('.br'))
            return 'br';
        if (domain.includes('.sg'))
            return 'sg';
        return 'global';
    }
    getWebsitesByJurisdiction(jurisdiction) {
        const jurisdictionMap = {
            'eu': ['spotify.com', 'adidas.com', 'sap.com', 'philips.com'],
            'us': ['facebook.com', 'google.com', 'amazon.com', 'netflix.com', 'apple.com'],
            'ca': ['shopify.com', 'blackberry.com'],
            'br': ['mercadolibre.com', 'nubank.com'],
            'sg': ['grab.com', 'sea.com'],
        };
        return jurisdictionMap[jurisdiction] || [];
    }
    getRegulationByJurisdiction(jurisdiction) {
        const regulationMap = {
            'eu': 'GDPR',
            'us': 'CCPA',
            'ca': 'PIPEDA',
            'br': 'LGPD',
            'sg': 'PDPA',
        };
        return regulationMap[jurisdiction] || 'GDPR';
    }
    getJurisdictionByRegulation(regulation) {
        const jurisdictionMap = {
            'GDPR': 'eu',
            'CCPA': 'us',
            'COPPA': 'us',
            'PIPEDA': 'ca',
            'LGPD': 'br',
            'PDPA': 'sg',
        };
        return jurisdictionMap[regulation] || 'global';
    }
    extractClauseTypes(segment) {
        const types = [];
        const text = segment.toLowerCase();
        if (text.includes('data') && text.includes('collect'))
            types.push('data_collection');
        if (text.includes('cookie'))
            types.push('cookies');
        if (text.includes('third party') || text.includes('share'))
            types.push('data_sharing');
        if (text.includes('delete') || text.includes('remove'))
            types.push('data_deletion');
        if (text.includes('right') && text.includes('access'))
            types.push('user_rights');
        if (text.includes('liability') || text.includes('waiv'))
            types.push('liability_waiver');
        if (text.includes('automatic') && text.includes('renew'))
            types.push('auto_renewal');
        return types.length > 0 ? types : ['general'];
    }
    extractConcerns(segment) {
        const concerns = [];
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
    extractContextForRecommendation(content, recommendation) {
        const keywords = recommendation.keywords || [];
        let context = '';
        const paragraphs = content.split('\n\n');
        for (const paragraph of paragraphs) {
            if (keywords.some((keyword) => paragraph.toLowerCase().includes(keyword.toLowerCase()))) {
                context = paragraph.trim();
                break;
            }
        }
        return context || content.substring(0, 500) + '...';
    }
    generateExampleHash(example) {
        const crypto = require('crypto');
        const content = example.input + example.output;
        return crypto.createHash('md5').update(content).digest('hex');
    }
    async getDataset(datasetId) {
        const cached = await this.cache.get(`dataset:${datasetId}`);
        if (cached)
            return cached;
        return null;
    }
    async listDatasets() {
        return [];
    }
    async deleteDataset(datasetId) {
        const dataset = await this.getDataset(datasetId);
        if (!dataset)
            throw new Error('Dataset not found');
        await fs.remove(path.dirname(dataset.file_paths.train));
        await this.cache.delete(`dataset:${datasetId}`);
        logger.info('Dataset deleted', { datasetId });
    }
}
exports.TrainingDatasetGenerator = TrainingDatasetGenerator;
//# sourceMappingURL=training-dataset-generator.js.map