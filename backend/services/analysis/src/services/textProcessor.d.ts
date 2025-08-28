export interface DocumentChunk {
    id: string;
    content: string;
    position: number;
    length: number;
    metadata: {
        chunkIndex: number;
        totalChunks: number;
        documentType: string;
        language?: string;
        headings?: string[];
        pageNumber?: number;
    };
}
export interface ExtractionResult {
    content: string;
    metadata: {
        title?: string;
        author?: string;
        createdDate?: Date;
        modifiedDate?: Date;
        pageCount?: number;
        wordCount: number;
        characterCount: number;
        language?: string;
        documentType: string;
        extractionMethod: string;
    };
    chunks: DocumentChunk[];
}
export interface ChunkingOptions {
    maxChunkSize: number;
    overlapSize: number;
    respectSentences: boolean;
    respectParagraphs: boolean;
    preserveFormatting: boolean;
}
export interface ExtractionOptions {
    documentType?: string;
    language?: string;
    extractImages?: boolean;
    extractTables?: boolean;
    timeout?: number;
    chunking?: ChunkingOptions;
}
export declare class TextProcessor {
    private readonly DEFAULT_CHUNKING_OPTIONS;
    private readonly DEFAULT_EXTRACTION_OPTIONS;
    extractFromBuffer(buffer: Buffer, filename: string, options?: ExtractionOptions): Promise<ExtractionResult>;
    extractFromURL(url: string, options?: ExtractionOptions): Promise<ExtractionResult>;
    private extractFromPDF;
    private extractFromWord;
    private extractFromText;
    private extractFromHTML;
    private chunkText;
    private findSentenceBoundary;
    private findParagraphBoundary;
    private cleanText;
    private countWords;
    private getFileExtension;
    private detectDocumentType;
    private detectLanguage;
    extractMetadata(buffer: Buffer, filename: string): Promise<any>;
    mergeChunks(chunks: DocumentChunk[], maxGap?: number): DocumentChunk[];
}
export declare const textProcessor: TextProcessor;
//# sourceMappingURL=textProcessor.d.ts.map