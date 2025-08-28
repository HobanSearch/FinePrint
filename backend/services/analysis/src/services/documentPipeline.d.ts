export interface DocumentInput {
    content?: string;
    url?: string;
    fileBuffer?: Buffer;
    filename?: string;
    userId: string;
    teamId?: string;
    title?: string;
    documentType?: 'terms_of_service' | 'privacy_policy' | 'eula' | 'cookie_policy' | 'data_processing_agreement' | 'service_agreement' | 'other';
    language?: string;
    options?: {
        enableOCR?: boolean;
        preserveFormatting?: boolean;
        extractImages?: boolean;
        detectLanguage?: boolean;
        validateContent?: boolean;
        enableDuplicateDetection?: boolean;
        customExtractors?: string[];
    };
}
export interface ProcessedDocument {
    id: string;
    title: string;
    content: string;
    contentHash: string;
    url?: string;
    filename?: string;
    documentType: string;
    language: string;
    wordCount: number;
    characterCount: number;
    processingInfo: {
        extractionMethod: 'direct' | 'url' | 'file' | 'ocr';
        processingTimeMs: number;
        contentQuality: 'excellent' | 'good' | 'fair' | 'poor';
        detectedMimeType?: string;
        originalFileSize?: number;
        ocrConfidence?: number;
    };
    contentAnalysis: {
        readabilityScore?: number;
        sentimentScore?: number;
        keyPhrases: string[];
        entities: Array<{
            text: string;
            type: 'person' | 'organization' | 'location' | 'date' | 'money' | 'url' | 'email' | 'phone';
            confidence: number;
        }>;
        sections: Array<{
            title: string;
            startPosition: number;
            endPosition: number;
            wordCount: number;
        }>;
    };
    validation: {
        isValid: boolean;
        issues: Array<{
            type: 'warning' | 'error';
            message: string;
            severity: 'low' | 'medium' | 'high';
        }>;
        duplicateOf?: string;
        similarity?: number;
    };
    chunks: Array<{
        id: string;
        content: string;
        position: number;
        wordCount: number;
        embedding?: number[];
    }>;
    createdAt: Date;
    updatedAt: Date;
}
export declare class DocumentProcessingPipeline {
    private readonly MAX_FILE_SIZE;
    private readonly SUPPORTED_MIME_TYPES;
    processDocument(input: DocumentInput): Promise<ProcessedDocument>;
    getDocument(documentId: string, userId: string): Promise<ProcessedDocument | null>;
    searchDocuments(userId: string, query: {
        text?: string;
        documentType?: string;
        language?: string;
        limit?: number;
        offset?: number;
    }): Promise<ProcessedDocument[]>;
    private validateInput;
    private processDirectContent;
    private processUrl;
    private processFile;
    private processImageWithOCR;
    private isImageType;
    private checkForDuplicates;
    private calculateTextSimilarity;
    private analyzeContent;
    private extractKeyPhrases;
    private extractEntities;
    private extractSections;
    private calculateReadabilityScore;
    private countSyllables;
    private calculateSentimentScore;
    private validateContent;
    private createDocumentChunks;
    private assessContentQuality;
    private createDocumentRecord;
    private storeDocumentChunks;
    private getDocumentChunks;
    private mapDatabaseToProcessedDocument;
    private assessContentQualityFromMetadata;
}
export declare const documentPipeline: DocumentProcessingPipeline;
//# sourceMappingURL=documentPipeline.d.ts.map