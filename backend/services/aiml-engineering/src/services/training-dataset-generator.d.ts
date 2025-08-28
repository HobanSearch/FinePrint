import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
export declare const DatasetConfigSchema: any;
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
export declare class TrainingDatasetGenerator {
    private prisma;
    private cache;
    private queue;
    private datasetsPath;
    constructor(prisma: PrismaClient, datasetsPath?: string);
    generateDataset(config: DatasetConfig): Promise<Dataset>;
    private generateExamplesByTask;
    private generateRiskAssessmentExamples;
    private generateClauseDetectionExamples;
    private generateComplianceAnalysisExamples;
    private generateRecommendationExamples;
    private getAggregatedDocuments;
    private filterAndValidateExamples;
    private seenHashes;
    private splitDataset;
    private calculateStatistics;
    private saveDatasetFiles;
    private saveExamplesToFile;
    private segmentDocument;
    private formatRiskAssessmentOutput;
    private formatClauseDetectionOutput;
    private formatComplianceAnalysisOutput;
    private formatRecommendationOutput;
    private categorizeRiskLevel;
    private inferJurisdiction;
    private getWebsitesByJurisdiction;
    private getRegulationByJurisdiction;
    private getJurisdictionByRegulation;
    private extractClauseTypes;
    private extractConcerns;
    private extractContextForRecommendation;
    private generateExampleHash;
    getDataset(datasetId: string): Promise<Dataset | null>;
    listDatasets(): Promise<Dataset[]>;
    deleteDataset(datasetId: string): Promise<void>;
}
//# sourceMappingURL=training-dataset-generator.d.ts.map