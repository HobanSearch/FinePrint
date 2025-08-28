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
exports.textProcessor = exports.TextProcessor = void 0;
const pdf = __importStar(require("pdf-parse"));
const mammoth = __importStar(require("mammoth"));
const cheerio = __importStar(require("cheerio"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const crypto_1 = __importDefault(require("crypto"));
const logger = (0, logger_1.createServiceLogger)('text-processor');
class TextProcessor {
    DEFAULT_CHUNKING_OPTIONS = {
        maxChunkSize: 4000,
        overlapSize: 200,
        respectSentences: true,
        respectParagraphs: true,
        preserveFormatting: false
    };
    DEFAULT_EXTRACTION_OPTIONS = {
        documentType: 'unknown',
        language: 'en',
        extractImages: false,
        extractTables: true,
        timeout: 30000,
        chunking: this.DEFAULT_CHUNKING_OPTIONS
    };
    async extractFromBuffer(buffer, filename, options = {}) {
        const opts = { ...this.DEFAULT_EXTRACTION_OPTIONS, ...options };
        const fileExtension = this.getFileExtension(filename);
        const contentHash = crypto_1.default.createHash('sha256').update(buffer).digest('hex');
        const cacheKey = `text_extraction:${contentHash}:${JSON.stringify(opts)}`;
        const cached = await cache_1.analysisCache.get(cacheKey);
        if (cached) {
            logger.debug('Using cached extraction result', { filename, cacheKey });
            return cached;
        }
        logger.info('Starting text extraction', {
            filename,
            fileSize: buffer.length,
            fileExtension,
            options: opts
        });
        let result;
        try {
            switch (fileExtension) {
                case 'pdf':
                    result = await this.extractFromPDF(buffer, opts);
                    break;
                case 'docx':
                case 'doc':
                    result = await this.extractFromWord(buffer, opts);
                    break;
                case 'txt':
                    result = await this.extractFromText(buffer, opts);
                    break;
                case 'html':
                case 'htm':
                    result = await this.extractFromHTML(buffer, opts);
                    break;
                default:
                    throw new Error(`Unsupported file type: ${fileExtension}`);
            }
            result.metadata.documentType = opts.documentType || this.detectDocumentType(result.content);
            result.metadata.language = opts.language || await this.detectLanguage(result.content);
            await cache_1.analysisCache.set(cacheKey, result, 3600);
            logger.info('Text extraction completed', {
                filename,
                contentLength: result.content.length,
                chunksCount: result.chunks.length,
                wordCount: result.metadata.wordCount
            });
            return result;
        }
        catch (error) {
            logger.error('Text extraction failed', {
                error: error.message,
                filename,
                fileExtension
            });
            throw new Error(`Failed to extract text from ${filename}: ${error.message}`);
        }
    }
    async extractFromURL(url, options = {}) {
        const opts = { ...this.DEFAULT_EXTRACTION_OPTIONS, ...options };
        logger.info('Starting URL extraction', { url, options: opts });
        try {
            const response = await axios_1.default.get(url, {
                timeout: opts.timeout,
                headers: {
                    'User-Agent': 'FinePrintAI/1.0 Document Analyzer',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                responseType: 'text'
            });
            const contentType = response.headers['content-type'] || '';
            const buffer = Buffer.from(response.data, 'utf-8');
            if (contentType.includes('application/pdf')) {
                return await this.extractFromPDF(buffer, opts);
            }
            else if (contentType.includes('text/html')) {
                return await this.extractFromHTML(buffer, opts, url);
            }
            else if (contentType.includes('text/plain')) {
                return await this.extractFromText(buffer, opts);
            }
            else {
                return await this.extractFromHTML(buffer, opts, url);
            }
        }
        catch (error) {
            logger.error('URL extraction failed', { error: error.message, url });
            throw new Error(`Failed to extract text from URL ${url}: ${error.message}`);
        }
    }
    async extractFromPDF(buffer, options) {
        try {
            const pdfData = await pdf(buffer);
            const content = this.cleanText(pdfData.text);
            const chunks = this.chunkText(content, options.chunking, 'pdf');
            return {
                content,
                metadata: {
                    title: pdfData.info?.Title,
                    author: pdfData.info?.Author,
                    createdDate: pdfData.info?.CreationDate ? new Date(pdfData.info.CreationDate) : undefined,
                    modifiedDate: pdfData.info?.ModDate ? new Date(pdfData.info.ModDate) : undefined,
                    pageCount: pdfData.numpages,
                    wordCount: this.countWords(content),
                    characterCount: content.length,
                    documentType: options.documentType || 'pdf',
                    extractionMethod: 'pdf-parse'
                },
                chunks
            };
        }
        catch (error) {
            throw new Error(`PDF extraction failed: ${error.message}`);
        }
    }
    async extractFromWord(buffer, options) {
        try {
            const result = await mammoth.extractRawText({ buffer });
            const content = this.cleanText(result.value);
            const chunks = this.chunkText(content, options.chunking, 'docx');
            return {
                content,
                metadata: {
                    wordCount: this.countWords(content),
                    characterCount: content.length,
                    documentType: options.documentType || 'docx',
                    extractionMethod: 'mammoth'
                },
                chunks
            };
        }
        catch (error) {
            throw new Error(`Word document extraction failed: ${error.message}`);
        }
    }
    async extractFromText(buffer, options) {
        const content = this.cleanText(buffer.toString('utf-8'));
        const chunks = this.chunkText(content, options.chunking, 'txt');
        return {
            content,
            metadata: {
                wordCount: this.countWords(content),
                characterCount: content.length,
                documentType: options.documentType || 'txt',
                extractionMethod: 'text'
            },
            chunks
        };
    }
    async extractFromHTML(buffer, options, url) {
        try {
            const $ = cheerio.load(buffer.toString());
            $('script, style, nav, header, footer, aside').remove();
            const title = $('title').text().trim() ||
                $('h1').first().text().trim() ||
                'Untitled Document';
            let content = '';
            const mainSelectors = [
                'main',
                '[role="main"]',
                '.content',
                '#content',
                '.main-content',
                'article',
                '.post-content',
                '.entry-content'
            ];
            let foundMainContent = false;
            for (const selector of mainSelectors) {
                const mainContent = $(selector);
                if (mainContent.length > 0) {
                    content = mainContent.text();
                    foundMainContent = true;
                    break;
                }
            }
            if (!foundMainContent) {
                content = $('body').text();
            }
            content = this.cleanText(content);
            const chunks = this.chunkText(content, options.chunking, 'html');
            return {
                content,
                metadata: {
                    title,
                    wordCount: this.countWords(content),
                    characterCount: content.length,
                    documentType: options.documentType || 'html',
                    extractionMethod: 'cheerio'
                },
                chunks
            };
        }
        catch (error) {
            throw new Error(`HTML extraction failed: ${error.message}`);
        }
    }
    chunkText(text, options, documentType) {
        const chunks = [];
        if (text.length <= options.maxChunkSize) {
            chunks.push({
                id: crypto_1.default.randomUUID(),
                content: text,
                position: 0,
                length: text.length,
                metadata: {
                    chunkIndex: 0,
                    totalChunks: 1,
                    documentType
                }
            });
            return chunks;
        }
        let position = 0;
        let chunkIndex = 0;
        while (position < text.length) {
            let chunkEnd = Math.min(position + options.maxChunkSize, text.length);
            if (options.respectSentences && chunkEnd < text.length) {
                const sentenceEnd = this.findSentenceBoundary(text, chunkEnd);
                if (sentenceEnd > position + options.maxChunkSize * 0.5) {
                    chunkEnd = sentenceEnd;
                }
            }
            if (options.respectParagraphs && chunkEnd < text.length) {
                const paragraphEnd = this.findParagraphBoundary(text, chunkEnd);
                if (paragraphEnd > position + options.maxChunkSize * 0.3) {
                    chunkEnd = paragraphEnd;
                }
            }
            const chunkContent = text.substring(position, chunkEnd);
            chunks.push({
                id: crypto_1.default.randomUUID(),
                content: chunkContent,
                position,
                length: chunkContent.length,
                metadata: {
                    chunkIndex,
                    totalChunks: 0,
                    documentType
                }
            });
            position = chunkEnd - (chunkIndex > 0 ? options.overlapSize : 0);
            chunkIndex++;
        }
        chunks.forEach(chunk => {
            chunk.metadata.totalChunks = chunks.length;
        });
        logger.debug('Text chunking completed', {
            originalLength: text.length,
            chunksCount: chunks.length,
            avgChunkSize: chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length
        });
        return chunks;
    }
    findSentenceBoundary(text, position) {
        const searchStart = Math.max(0, position - 200);
        const searchEnd = Math.min(text.length, position + 200);
        const searchText = text.substring(searchStart, searchEnd);
        const sentenceEndings = /[.!?]+\s+[A-Z]/g;
        let match;
        let lastMatch = position;
        while ((match = sentenceEndings.exec(searchText)) !== null) {
            const actualPosition = searchStart + match.index + match[0].length - 1;
            if (actualPosition <= position) {
                lastMatch = actualPosition;
            }
            else {
                break;
            }
        }
        return lastMatch;
    }
    findParagraphBoundary(text, position) {
        const before = text.lastIndexOf('\n\n', position);
        const after = text.indexOf('\n\n', position);
        if (before !== -1 && position - before < 500) {
            return before;
        }
        if (after !== -1 && after - position < 500) {
            return after;
        }
        const singleNewline = text.lastIndexOf('\n', position);
        if (singleNewline !== -1 && position - singleNewline < 200) {
            return singleNewline;
        }
        return position;
    }
    cleanText(text) {
        return text
            .replace(/\s+/g, ' ')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            .replace(/[""'']/g, '"')
            .replace(/['']/g, "'")
            .replace(/([.!?]){3,}/g, '$1$1$1')
            .trim();
    }
    countWords(text) {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }
    getFileExtension(filename) {
        return filename.split('.').pop()?.toLowerCase() || '';
    }
    detectDocumentType(content) {
        const lowerContent = content.toLowerCase();
        const patterns = {
            'terms-of-service': [
                'terms of service',
                'terms of use',
                'user agreement',
                'service agreement'
            ],
            'privacy-policy': [
                'privacy policy',
                'privacy notice',
                'data protection',
                'information we collect'
            ],
            'eula': [
                'end user license',
                'software license',
                'eula',
                'license agreement'
            ],
            'cookie-policy': [
                'cookie policy',
                'cookie notice',
                'cookies and similar'
            ],
            'data-processing': [
                'data processing',
                'processing agreement',
                'data controller'
            ]
        };
        for (const [type, keywords] of Object.entries(patterns)) {
            if (keywords.some(keyword => lowerContent.includes(keyword))) {
                return type;
            }
        }
        return 'general';
    }
    async detectLanguage(content) {
        const sample = content.substring(0, 1000).toLowerCase();
        const languagePatterns = {
            'en': ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one'],
            'es': ['que', 'del', 'con', 'una', 'por', 'para', 'como', 'más', 'pero', 'sus', 'les'],
            'fr': ['que', 'des', 'les', 'une', 'dans', 'avec', 'pour', 'sur', 'aux', 'ces', 'par'],
            'de': ['und', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einem', 'sich'],
            'it': ['che', 'del', 'della', 'dei', 'delle', 'con', 'per', 'una', 'dalla', 'negli']
        };
        let bestMatch = 'en';
        let bestScore = 0;
        for (const [lang, words] of Object.entries(languagePatterns)) {
            let score = 0;
            for (const word of words) {
                const regex = new RegExp(`\\b${word}\\b`, 'gi');
                const matches = sample.match(regex);
                if (matches) {
                    score += matches.length;
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestMatch = lang;
            }
        }
        return bestMatch;
    }
    async extractMetadata(buffer, filename) {
        const extension = this.getFileExtension(filename);
        try {
            switch (extension) {
                case 'pdf':
                    const pdfData = await pdf(buffer);
                    return {
                        title: pdfData.info?.Title,
                        author: pdfData.info?.Author,
                        subject: pdfData.info?.Subject,
                        creator: pdfData.info?.Creator,
                        producer: pdfData.info?.Producer,
                        creationDate: pdfData.info?.CreationDate,
                        modificationDate: pdfData.info?.ModDate,
                        pages: pdfData.numpages,
                        version: pdfData.version
                    };
                default:
                    return {
                        filename,
                        size: buffer.length,
                        type: extension
                    };
            }
        }
        catch (error) {
            logger.warn('Failed to extract metadata', {
                error: error.message,
                filename
            });
            return {
                filename,
                size: buffer.length,
                type: extension
            };
        }
    }
    mergeChunks(chunks, maxGap = 100) {
        if (chunks.length <= 1)
            return chunks;
        const merged = [];
        let current = chunks[0];
        for (let i = 1; i < chunks.length; i++) {
            const next = chunks[i];
            const gap = next.position - (current.position + current.length);
            if (gap <= maxGap) {
                const mergedContent = current.content +
                    (gap > 0 ? ' '.repeat(gap) : '') +
                    next.content;
                current = {
                    id: crypto_1.default.randomUUID(),
                    content: mergedContent,
                    position: current.position,
                    length: mergedContent.length,
                    metadata: {
                        ...current.metadata,
                        chunkIndex: current.metadata.chunkIndex,
                        totalChunks: 0
                    }
                };
            }
            else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        merged.forEach((chunk, index) => {
            chunk.metadata.chunkIndex = index;
            chunk.metadata.totalChunks = merged.length;
        });
        return merged;
    }
}
exports.TextProcessor = TextProcessor;
exports.textProcessor = new TextProcessor();
//# sourceMappingURL=textProcessor.js.map