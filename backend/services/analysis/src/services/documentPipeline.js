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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentPipeline = exports.DocumentProcessingPipeline = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const client_1 = require("@prisma/client");
const textProcessor_1 = require("./textProcessor");
const embeddings_1 = require("./embeddings");
const crypto_1 = __importDefault(require("crypto"));
const fileType = __importStar(require("file-type"));
const sharp_1 = __importDefault(require("sharp"));
const tesseract_js_1 = __importDefault(require("tesseract.js"));
const logger = (0, logger_1.createServiceLogger)('document-pipeline');
const prisma = new client_1.PrismaClient();
class DocumentProcessingPipeline {
    MAX_FILE_SIZE = 50 * 1024 * 1024;
    SUPPORTED_MIME_TYPES = [
        'text/plain',
        'text/html',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/webp'
    ];
    async processDocument(input) {
        const startTime = Date.now();
        logger.info('Starting document processing', {
            userId: input.userId,
            hasContent: !!input.content,
            hasUrl: !!input.url,
            hasFile: !!input.fileBuffer,
            documentType: input.documentType
        });
        try {
            this.validateInput(input);
            let extractionResult;
            let extractionMethod;
            let originalFileSize;
            let detectedMimeType;
            let ocrConfidence;
            if (input.content) {
                extractionMethod = 'direct';
                extractionResult = await this.processDirectContent(input.content, input.options);
            }
            else if (input.url) {
                extractionMethod = 'url';
                extractionResult = await this.processUrl(input.url, input.options);
            }
            else if (input.fileBuffer && input.filename) {
                originalFileSize = input.fileBuffer.length;
                const fileTypeResult = await fileType.fromBuffer(input.fileBuffer);
                detectedMimeType = fileTypeResult?.mime;
                if (this.isImageType(detectedMimeType) && input.options?.enableOCR) {
                    extractionMethod = 'ocr';
                    const ocrResult = await this.processImageWithOCR(input.fileBuffer, input.options);
                    extractionResult = ocrResult.extractionResult;
                    ocrConfidence = ocrResult.confidence;
                }
                else {
                    extractionMethod = 'file';
                    extractionResult = await this.processFile(input.fileBuffer, input.filename, input.options);
                }
            }
            else {
                throw new Error('No valid input source provided');
            }
            const contentHash = crypto_1.default.createHash('sha256').update(extractionResult.content).digest('hex');
            let duplicateCheck = {
                isDuplicate: false
            };
            if (input.options?.enableDuplicateDetection) {
                duplicateCheck = await this.checkForDuplicates(contentHash, extractionResult.content, input.userId);
            }
            const contentAnalysis = await this.analyzeContent(extractionResult.content);
            const validation = await this.validateContent(extractionResult, duplicateCheck);
            const chunks = await this.createDocumentChunks(extractionResult);
            if (embeddings_1.embeddingService) {
                try {
                    for (const chunk of chunks) {
                        chunk.embedding = await embeddings_1.embeddingService.generateEmbedding(chunk.content);
                    }
                }
                catch (error) {
                    logger.warn('Failed to generate embeddings', { error: error.message });
                }
            }
            const title = input.title ||
                extractionResult.metadata.title ||
                (input.url ? new URL(input.url).hostname :
                    (input.filename || 'Untitled Document'));
            const documentRecord = await this.createDocumentRecord({
                title,
                content: extractionResult.content,
                contentHash,
                url: input.url,
                filename: input.filename,
                documentType: input.documentType || extractionResult.metadata.documentType || 'other',
                language: input.language || extractionResult.metadata.language || 'en',
                userId: input.userId,
                teamId: input.teamId,
                wordCount: extractionResult.metadata.wordCount,
                characterCount: extractionResult.content.length,
                processingTimeMs: Date.now() - startTime,
                extractionMethod,
                originalFileSize,
                detectedMimeType,
                ocrConfidence,
                contentAnalysis,
                validation
            });
            if (chunks.length > 0) {
                await this.storeDocumentChunks(documentRecord.id, chunks);
            }
            const processedDocument = {
                id: documentRecord.id,
                title: documentRecord.title,
                content: documentRecord.content,
                contentHash: documentRecord.contentHash,
                url: documentRecord.url || undefined,
                filename: documentRecord.filename || undefined,
                documentType: documentRecord.documentType,
                language: documentRecord.language,
                wordCount: documentRecord.wordCount,
                characterCount: documentRecord.characterCount,
                processingInfo: {
                    extractionMethod,
                    processingTimeMs: Date.now() - startTime,
                    contentQuality: this.assessContentQuality(extractionResult, validation),
                    detectedMimeType,
                    originalFileSize,
                    ocrConfidence
                },
                contentAnalysis,
                validation,
                chunks,
                createdAt: documentRecord.createdAt,
                updatedAt: documentRecord.updatedAt
            };
            logger.info('Document processing completed', {
                documentId: documentRecord.id,
                title: documentRecord.title,
                wordCount: documentRecord.wordCount,
                chunksCreated: chunks.length,
                processingTime: Date.now() - startTime,
                contentQuality: processedDocument.processingInfo.contentQuality
            });
            return processedDocument;
        }
        catch (error) {
            logger.error('Document processing failed', {
                error: error.message,
                userId: input.userId,
                processingTime: Date.now() - startTime
            });
            throw error;
        }
    }
    async getDocument(documentId, userId) {
        try {
            const document = await prisma.document.findFirst({
                where: {
                    id: documentId,
                    userId,
                    deletedAt: null
                }
            });
            if (!document) {
                return null;
            }
            const chunks = await this.getDocumentChunks(documentId);
            return this.mapDatabaseToProcessedDocument(document, chunks);
        }
        catch (error) {
            logger.error('Failed to get document', { error: error.message, documentId, userId });
            throw error;
        }
    }
    async searchDocuments(userId, query) {
        try {
            const { limit = 20, offset = 0 } = query;
            const where = {
                userId,
                deletedAt: null
            };
            if (query.documentType) {
                where.documentType = query.documentType;
            }
            if (query.language) {
                where.language = query.language;
            }
            if (query.text) {
                where.OR = [
                    { title: { contains: query.text, mode: 'insensitive' } },
                    { content: { contains: query.text, mode: 'insensitive' } }
                ];
            }
            const documents = await prisma.document.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset
            });
            const processedDocuments = [];
            for (const doc of documents) {
                const chunks = await this.getDocumentChunks(doc.id);
                processedDocuments.push(this.mapDatabaseToProcessedDocument(doc, chunks));
            }
            return processedDocuments;
        }
        catch (error) {
            logger.error('Failed to search documents', { error: error.message, userId, query });
            throw error;
        }
    }
    validateInput(input) {
        const inputSources = [input.content, input.url, input.fileBuffer].filter(Boolean).length;
        if (inputSources !== 1) {
            throw new Error('Exactly one input source must be provided (content, url, or fileBuffer)');
        }
        if (input.fileBuffer) {
            if (!input.filename) {
                throw new Error('Filename is required when providing fileBuffer');
            }
            if (input.fileBuffer.length > this.MAX_FILE_SIZE) {
                throw new Error(`File size exceeds maximum limit of ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`);
            }
        }
        if (input.url) {
            try {
                new URL(input.url);
            }
            catch {
                throw new Error('Invalid URL provided');
            }
        }
        if (!input.userId) {
            throw new Error('User ID is required');
        }
    }
    async processDirectContent(content, options) {
        return textProcessor_1.textProcessor.extractFromBuffer(Buffer.from(content, 'utf-8'), 'direct-input.txt', {
            documentType: options?.documentType,
            language: options?.language,
            preserveFormatting: options?.preserveFormatting
        });
    }
    async processUrl(url, options) {
        return textProcessor_1.textProcessor.extractFromURL(url, {
            documentType: options?.documentType,
            language: options?.language,
            preserveFormatting: options?.preserveFormatting
        });
    }
    async processFile(fileBuffer, filename, options) {
        return textProcessor_1.textProcessor.extractFromBuffer(fileBuffer, filename, {
            documentType: options?.documentType,
            language: options?.language,
            preserveFormatting: options?.preserveFormatting
        });
    }
    async processImageWithOCR(imageBuffer, options) {
        try {
            const processedImage = await (0, sharp_1.default)(imageBuffer)
                .resize(null, 2000, { withoutEnlargement: true })
                .greyscale()
                .normalize()
                .sharpen()
                .toBuffer();
            const result = await tesseract_js_1.default.recognize(processedImage, 'eng', {
                logger: m => logger.debug('OCR progress', { message: m })
            });
            const extractionResult = {
                content: result.data.text,
                metadata: {
                    title: 'OCR Extracted Document',
                    documentType: options?.documentType || 'other',
                    language: options?.language || 'en',
                    wordCount: result.data.text.split(/\s+/).length,
                    extractionMethod: 'ocr'
                },
                chunks: []
            };
            const chunkSize = 1000;
            const words = result.data.text.split(/\s+/);
            for (let i = 0; i < words.length; i += chunkSize) {
                const chunkWords = words.slice(i, i + chunkSize);
                extractionResult.chunks.push({
                    content: chunkWords.join(' '),
                    metadata: {
                        chunkIndex: Math.floor(i / chunkSize),
                        startWord: i,
                        endWord: Math.min(i + chunkSize - 1, words.length - 1)
                    }
                });
            }
            return {
                extractionResult,
                confidence: result.data.confidence / 100
            };
        }
        catch (error) {
            logger.error('OCR processing failed', { error: error.message });
            throw new Error(`OCR extraction failed: ${error.message}`);
        }
    }
    isImageType(mimeType) {
        if (!mimeType)
            return false;
        return ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(mimeType);
    }
    async checkForDuplicates(contentHash, content, userId) {
        try {
            const exactMatch = await prisma.document.findFirst({
                where: {
                    contentHash,
                    userId,
                    deletedAt: null
                }
            });
            if (exactMatch) {
                return {
                    isDuplicate: true,
                    duplicateId: exactMatch.id,
                    similarity: 1.0
                };
            }
            const recentDocuments = await prisma.document.findMany({
                where: {
                    userId,
                    deletedAt: null,
                    createdAt: {
                        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    }
                },
                select: { id: true, content: true },
                take: 50
            });
            for (const doc of recentDocuments) {
                const similarity = this.calculateTextSimilarity(content, doc.content);
                if (similarity > 0.9) {
                    return {
                        isDuplicate: true,
                        duplicateId: doc.id,
                        similarity
                    };
                }
            }
            return { isDuplicate: false };
        }
        catch (error) {
            logger.warn('Duplicate check failed', { error: error.message });
            return { isDuplicate: false };
        }
    }
    calculateTextSimilarity(text1, text2) {
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));
        const intersection = new Set([...words1].filter(word => words2.has(word)));
        const union = new Set([...words1, ...words2]);
        return intersection.size / union.size;
    }
    async analyzeContent(content) {
        try {
            const keyPhrases = this.extractKeyPhrases(content);
            const entities = this.extractEntities(content);
            const sections = this.extractSections(content);
            return {
                keyPhrases,
                entities,
                sections,
                readabilityScore: this.calculateReadabilityScore(content),
                sentimentScore: this.calculateSentimentScore(content)
            };
        }
        catch (error) {
            logger.warn('Content analysis failed', { error: error.message });
            return {
                keyPhrases: [],
                entities: [],
                sections: []
            };
        }
    }
    extractKeyPhrases(content) {
        const words = content.toLowerCase().split(/\s+/);
        const wordFreq = new Map();
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
        for (const word of words) {
            const cleaned = word.replace(/[^\w]/g, '');
            if (cleaned.length > 3 && !stopWords.has(cleaned)) {
                wordFreq.set(cleaned, (wordFreq.get(cleaned) || 0) + 1);
            }
        }
        return Array.from(wordFreq.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, 20)
            .map(([word]) => word);
    }
    extractEntities(content) {
        const entities = [];
        const patterns = {
            email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            url: /https?:\/\/[^\s]+/g,
            phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
            money: /\$[\d,]+\.?\d*/g,
            date: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g
        };
        for (const [type, pattern] of Object.entries(patterns)) {
            const matches = content.match(pattern);
            if (matches) {
                for (const match of matches) {
                    entities.push({
                        text: match,
                        type: type,
                        confidence: 0.8
                    });
                }
            }
        }
        return entities.slice(0, 50);
    }
    extractSections(content) {
        const sections = [];
        const lines = content.split('\n');
        let currentPosition = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length > 0 && line.length < 100 &&
                (line === line.toUpperCase() || /^\d+\./.test(line))) {
                const startPosition = currentPosition;
                let endPosition = currentPosition + line.length;
                let sectionContent = line;
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j].trim();
                    if (nextLine.length > 0 && nextLine.length < 100 &&
                        (nextLine === nextLine.toUpperCase() || /^\d+\./.test(nextLine))) {
                        break;
                    }
                    sectionContent += ' ' + nextLine;
                    endPosition += nextLine.length + 1;
                }
                sections.push({
                    title: line,
                    startPosition,
                    endPosition,
                    wordCount: sectionContent.split(/\s+/).length
                });
            }
            currentPosition += line.length + 1;
        }
        return sections;
    }
    calculateReadabilityScore(content) {
        const sentences = content.split(/[.!?]+/).length;
        const words = content.split(/\s+/).length;
        const syllables = this.countSyllables(content);
        const avgWordsPerSentence = words / sentences;
        const avgSyllablesPerWord = syllables / words;
        const score = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
        return Math.max(0, Math.min(100, score));
    }
    countSyllables(text) {
        const words = text.toLowerCase().split(/\s+/);
        let syllableCount = 0;
        for (const word of words) {
            const cleaned = word.replace(/[^a-z]/g, '');
            if (cleaned.length === 0)
                continue;
            const vowels = cleaned.match(/[aeiouy]+/g);
            syllableCount += vowels ? vowels.length : 1;
        }
        return syllableCount;
    }
    calculateSentimentScore(content) {
        const positiveWords = ['good', 'great', 'excellent', 'beneficial', 'secure', 'protected', 'safe'];
        const negativeWords = ['bad', 'poor', 'terrible', 'harmful', 'dangerous', 'risky', 'prohibited'];
        const words = content.toLowerCase().split(/\s+/);
        let score = 0;
        for (const word of words) {
            if (positiveWords.includes(word))
                score += 1;
            if (negativeWords.includes(word))
                score -= 1;
        }
        return Math.max(-1, Math.min(1, score / words.length * 100));
    }
    async validateContent(extractionResult, duplicateCheck) {
        const issues = [];
        if (extractionResult.content.length < 100) {
            issues.push({
                type: 'warning',
                message: 'Document content is very short and may not provide meaningful analysis',
                severity: 'medium'
            });
        }
        if (extractionResult.content.length > 1000000) {
            issues.push({
                type: 'warning',
                message: 'Document is very long and may require extended processing time',
                severity: 'low'
            });
        }
        if (duplicateCheck.isDuplicate) {
            issues.push({
                type: 'warning',
                message: `Document appears to be a duplicate (${Math.round(duplicateCheck.similarity * 100)}% similar)`,
                severity: 'medium'
            });
        }
        if (extractionResult.metadata.language && extractionResult.metadata.language !== 'en') {
            issues.push({
                type: 'warning',
                message: `Document language detected as ${extractionResult.metadata.language}. Analysis may be less accurate.`,
                severity: 'low'
            });
        }
        return {
            isValid: issues.filter(i => i.type === 'error').length === 0,
            issues,
            duplicateOf: duplicateCheck.duplicateId,
            similarity: duplicateCheck.similarity
        };
    }
    async createDocumentChunks(extractionResult) {
        const chunks = [];
        const chunkSize = 500;
        const overlap = 50;
        const words = extractionResult.content.split(/\s+/);
        for (let i = 0; i < words.length; i += chunkSize - overlap) {
            const chunkWords = words.slice(i, i + chunkSize);
            const chunkContent = chunkWords.join(' ');
            chunks.push({
                id: crypto_1.default.randomUUID(),
                content: chunkContent,
                position: i,
                wordCount: chunkWords.length
            });
            if (i + chunkSize >= words.length)
                break;
        }
        return chunks;
    }
    assessContentQuality(extractionResult, validation) {
        let score = 100;
        for (const issue of validation.issues) {
            if (issue.severity === 'high')
                score -= 30;
            else if (issue.severity === 'medium')
                score -= 20;
            else
                score -= 10;
        }
        if (extractionResult.content.length < 100)
            score -= 40;
        else if (extractionResult.content.length < 500)
            score -= 20;
        if (validation.duplicateOf)
            score -= 25;
        if (score >= 90)
            return 'excellent';
        if (score >= 70)
            return 'good';
        if (score >= 50)
            return 'fair';
        return 'poor';
    }
    async createDocumentRecord(data) {
        return await prisma.document.create({
            data: {
                title: data.title,
                content: data.content,
                contentHash: data.contentHash,
                url: data.url,
                filename: data.filename,
                documentType: data.documentType,
                language: data.language,
                userId: data.userId,
                teamId: data.teamId,
                wordCount: data.wordCount,
                characterCount: data.characterCount,
                processingMetadata: {
                    processingTimeMs: data.processingTimeMs,
                    extractionMethod: data.extractionMethod,
                    originalFileSize: data.originalFileSize,
                    detectedMimeType: data.detectedMimeType,
                    ocrConfidence: data.ocrConfidence,
                    contentAnalysis: data.contentAnalysis,
                    validation: data.validation
                }
            }
        });
    }
    async storeDocumentChunks(documentId, chunks) {
        if (chunks.length === 0)
            return;
        try {
            await prisma.documentChunk.createMany({
                data: chunks.map((chunk, index) => ({
                    id: chunk.id,
                    documentId,
                    content: chunk.content,
                    position: index,
                    wordCount: chunk.wordCount,
                    embedding: chunk.embedding ? JSON.stringify(chunk.embedding) : null
                }))
            });
        }
        catch (error) {
            logger.error('Failed to store document chunks', { error: error.message, documentId });
        }
    }
    async getDocumentChunks(documentId) {
        try {
            const chunks = await prisma.documentChunk.findMany({
                where: { documentId },
                orderBy: { position: 'asc' }
            });
            return chunks.map(chunk => ({
                id: chunk.id,
                content: chunk.content,
                position: chunk.position,
                wordCount: chunk.wordCount,
                embedding: chunk.embedding ? JSON.parse(chunk.embedding) : undefined
            }));
        }
        catch (error) {
            logger.error('Failed to get document chunks', { error: error.message, documentId });
            return [];
        }
    }
    mapDatabaseToProcessedDocument(document, chunks) {
        const metadata = document.processingMetadata || {};
        return {
            id: document.id,
            title: document.title,
            content: document.content,
            contentHash: document.contentHash,
            url: document.url,
            filename: document.filename,
            documentType: document.documentType,
            language: document.language,
            wordCount: document.wordCount,
            characterCount: document.characterCount,
            processingInfo: {
                extractionMethod: metadata.extractionMethod || 'unknown',
                processingTimeMs: metadata.processingTimeMs || 0,
                contentQuality: this.assessContentQualityFromMetadata(metadata),
                detectedMimeType: metadata.detectedMimeType,
                originalFileSize: metadata.originalFileSize,
                ocrConfidence: metadata.ocrConfidence
            },
            contentAnalysis: metadata.contentAnalysis || {
                keyPhrases: [],
                entities: [],
                sections: []
            },
            validation: metadata.validation || {
                isValid: true,
                issues: []
            },
            chunks,
            createdAt: document.createdAt,
            updatedAt: document.updatedAt
        };
    }
    assessContentQualityFromMetadata(metadata) {
        const validation = metadata.validation;
        if (!validation)
            return 'good';
        const errorCount = validation.issues?.filter((i) => i.type === 'error').length || 0;
        const warningCount = validation.issues?.filter((i) => i.type === 'warning').length || 0;
        if (errorCount > 0)
            return 'poor';
        if (warningCount > 2)
            return 'fair';
        if (warningCount > 0)
            return 'good';
        return 'excellent';
    }
}
exports.DocumentProcessingPipeline = DocumentProcessingPipeline;
exports.documentPipeline = new DocumentProcessingPipeline();
//# sourceMappingURL=documentPipeline.js.map