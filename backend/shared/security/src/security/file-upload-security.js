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
exports.FileUploadSecurity = void 0;
exports.createFileUploadSecurity = createFileUploadSecurity;
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const index_1 = require("../index");
class FileUploadSecurity {
    config;
    fileSignatures = [
        { extension: 'jpg', signatures: ['FFD8FF'], offset: 0 },
        { extension: 'jpeg', signatures: ['FFD8FF'], offset: 0 },
        { extension: 'png', signatures: ['89504E47'], offset: 0 },
        { extension: 'gif', signatures: ['474946'], offset: 0 },
        { extension: 'bmp', signatures: ['424D'], offset: 0 },
        { extension: 'webp', signatures: ['52494646'], offset: 0 },
        { extension: 'ico', signatures: ['00000100'], offset: 0 },
        { extension: 'pdf', signatures: ['255044462D'], offset: 0 },
        { extension: 'doc', signatures: ['D0CF11E0'], offset: 0 },
        { extension: 'docx', signatures: ['504B0304', '504B0506', '504B0708'], offset: 0 },
        { extension: 'xls', signatures: ['D0CF11E0'], offset: 0 },
        { extension: 'xlsx', signatures: ['504B0304', '504B0506', '504B0708'], offset: 0 },
        { extension: 'ppt', signatures: ['D0CF11E0'], offset: 0 },
        { extension: 'pptx', signatures: ['504B0304', '504B0506', '504B0708'], offset: 0 },
        { extension: 'rtf', signatures: ['7B5C727466'], offset: 0 },
        { extension: 'odt', signatures: ['504B0304'], offset: 0 },
        { extension: 'txt', signatures: [], offset: 0 },
        { extension: 'csv', signatures: [], offset: 0 },
        { extension: 'xml', signatures: ['3C3F786D6C'], offset: 0 },
        { extension: 'html', signatures: ['3C21646F63', '3C68746D6C', '3C48544D4C'], offset: 0 },
        { extension: 'zip', signatures: ['504B0304', '504B0506', '504B0708'], offset: 0 },
        { extension: 'rar', signatures: ['526172211A070100'], offset: 0 },
        { extension: '7z', signatures: ['377ABCAF271C'], offset: 0 },
        { extension: 'tar', signatures: ['7573746172'], offset: 257 },
        { extension: 'gz', signatures: ['1F8B'], offset: 0 },
        { extension: 'mp3', signatures: ['494433', 'FFFB', 'FFF3', 'FFF2'], offset: 0 },
        { extension: 'wav', signatures: ['52494646'], offset: 0 },
        { extension: 'flac', signatures: ['664C6143'], offset: 0 },
        { extension: 'ogg', signatures: ['4F676753'], offset: 0 },
        { extension: 'mp4', signatures: ['66747970'], offset: 4 },
        { extension: 'avi', signatures: ['52494646'], offset: 0 },
        { extension: 'mkv', signatures: ['1A45DFA3'], offset: 0 },
        { extension: 'mov', signatures: ['66747970'], offset: 4 },
        { extension: 'wmv', signatures: ['3026B275'], offset: 0 }
    ];
    dangerousExtensions = [
        'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'vbe', 'ws', 'wsf', 'wsh',
        'js', 'jse', 'jar', 'ps1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2',
        'msi', 'msp', 'mst', 'application', 'gadget', 'msc', 'cpl', 'dll', 'ocx',
        'reg', 'scf', 'lnk', 'inf', 'hta', 'crt', 'cer', 'der', 'p7b', 'p7c', 'p12', 'pfx'
    ];
    suspiciousPatterns = [
        /<script[^>]*>/i,
        /javascript:/i,
        /vbscript:/i,
        /on\w+\s*=/i,
        /<\?php/i,
        /<\?=/i,
        /<?\s*php/i,
        /<%[^>]*%>/i,
        /<!--\s*#\s*include/i,
        /union\s+select/i,
        /drop\s+table/i,
        /delete\s+from/i,
        /\x00[\x01-\x08\x0e-\x1f]/
    ];
    constructor(config = {}) {
        this.config = {
            maxFileSize: 50 * 1024 * 1024,
            maxFiles: 10,
            allowedMimeTypes: [
                'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
                'application/pdf',
                'text/plain', 'text/csv',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ],
            allowedExtensions: [
                'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp',
                'pdf',
                'txt', 'csv',
                'doc', 'docx',
                'xls', 'xlsx'
            ],
            blockedExtensions: this.dangerousExtensions,
            scanForMalware: true,
            validateFileSignature: true,
            quarantineDirectory: '/tmp/quarantine',
            uploadDirectory: '/tmp/uploads',
            enableVirusScan: false,
            maxFilenameLength: 255,
            preserveFilename: false,
            generateThumbnails: false,
            ...config
        };
    }
    middleware() {
        return async (request, reply) => {
            if (!request.isMultipart()) {
                return;
            }
            try {
                const files = await this.processMultipartUpload(request);
                for (const file of files) {
                    const validation = await this.validateFile(file);
                    if (!validation.isValid) {
                        if (validation.riskScore > 70) {
                            await this.quarantineFile(file, validation.errors);
                        }
                        throw new index_1.SecurityError(`File upload validation failed: ${validation.errors.join(', ')}`, 'FILE_VALIDATION_FAILED', 400);
                    }
                    if (validation.warnings.length > 0) {
                        request.log.warn('File upload warnings', {
                            filename: file.originalname,
                            warnings: validation.warnings,
                            riskScore: validation.riskScore
                        });
                    }
                }
                request.files = files;
            }
            catch (error) {
                if (error instanceof index_1.SecurityError || error instanceof index_1.ValidationError) {
                    throw error;
                }
                request.log.error('File upload processing error', { error });
                throw new index_1.SecurityError('File upload processing failed', 'UPLOAD_ERROR', 500);
            }
        };
    }
    async processMultipartUpload(request) {
        const files = [];
        const parts = request.parts();
        for await (const part of parts) {
            if (part.file) {
                if (files.length >= this.config.maxFiles) {
                    throw new index_1.ValidationError(`Maximum ${this.config.maxFiles} files allowed`);
                }
                const chunks = [];
                let totalSize = 0;
                for await (const chunk of part.file) {
                    totalSize += chunk.length;
                    if (totalSize > this.config.maxFileSize) {
                        throw new index_1.ValidationError(`File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
                    }
                    chunks.push(chunk);
                }
                const buffer = Buffer.concat(chunks);
                files.push({
                    fieldname: part.fieldname,
                    originalname: part.filename || 'unknown',
                    encoding: part.encoding,
                    mimetype: part.mimetype || 'application/octet-stream',
                    size: buffer.length,
                    buffer
                });
            }
        }
        return files;
    }
    async validateFile(file) {
        const errors = [];
        const warnings = [];
        let riskScore = 0;
        if (file.size === 0) {
            errors.push('Empty file not allowed');
            riskScore += 30;
        }
        if (file.size > this.config.maxFileSize) {
            errors.push(`File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
            riskScore += 20;
        }
        const filenameValidation = this.validateFilename(file.originalname);
        if (!filenameValidation.isValid) {
            errors.push(...filenameValidation.errors);
            riskScore += 25;
        }
        warnings.push(...filenameValidation.warnings);
        const extension = this.getFileExtension(file.originalname).toLowerCase();
        if (this.config.blockedExtensions.includes(extension)) {
            errors.push(`File extension '${extension}' is not allowed`);
            riskScore += 50;
        }
        if (this.config.allowedExtensions.length > 0 && !this.config.allowedExtensions.includes(extension)) {
            errors.push(`File extension '${extension}' is not in allowed list`);
            riskScore += 30;
        }
        if (this.config.allowedMimeTypes.length > 0 && !this.config.allowedMimeTypes.includes(file.mimetype)) {
            errors.push(`MIME type '${file.mimetype}' is not allowed`);
            riskScore += 25;
        }
        let detectedMimeType = file.mimetype;
        if (this.config.validateFileSignature) {
            const signatureValidation = this.validateFileSignature(file.buffer, extension);
            if (!signatureValidation.isValid) {
                errors.push('File signature does not match extension');
                riskScore += 40;
            }
            if (signatureValidation.detectedType) {
                detectedMimeType = signatureValidation.detectedType;
            }
        }
        const contentValidation = await this.scanFileContent(file.buffer, file.mimetype);
        if (!contentValidation.isValid) {
            errors.push(...contentValidation.errors);
            riskScore += contentValidation.riskScore;
        }
        warnings.push(...contentValidation.warnings);
        const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
        const sanitizedFilename = this.sanitizeFilename(file.originalname);
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            sanitizedFilename,
            detectedMimeType,
            fileHash,
            riskScore
        };
    }
    validateFilename(filename) {
        const errors = [];
        const warnings = [];
        if (!filename || filename.trim() === '') {
            errors.push('Filename cannot be empty');
        }
        if (filename.length > this.config.maxFilenameLength) {
            errors.push(`Filename too long (max ${this.config.maxFilenameLength} characters)`);
        }
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            errors.push('Filename contains invalid path characters');
        }
        if (filename.includes('\0')) {
            errors.push('Filename contains null bytes');
        }
        if (/[\x00-\x1f\x7f-\x9f]/.test(filename)) {
            errors.push('Filename contains control characters');
        }
        const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
        const nameWithoutExt = path.parse(filename).name.toUpperCase();
        if (reservedNames.includes(nameWithoutExt)) {
            errors.push('Filename uses reserved system name');
        }
        if (/\.(php|asp|jsp|cgi|pl|py|rb|sh|bat|cmd)\./i.test(filename)) {
            warnings.push('Filename contains double extension which might be suspicious');
        }
        const extension = this.getFileExtension(filename);
        if (extension.length > 10) {
            warnings.push('Unusually long file extension');
        }
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }
    validateFileSignature(buffer, expectedExtension) {
        if (buffer.length < 8) {
            return { isValid: false };
        }
        const signature = this.fileSignatures.find(sig => sig.extension === expectedExtension.toLowerCase());
        if (!signature || signature.signatures.length === 0) {
            return { isValid: true };
        }
        const fileStart = buffer.subarray(signature.offset, signature.offset + 8).toString('hex').toUpperCase();
        for (const sig of signature.signatures) {
            if (fileStart.startsWith(sig.toUpperCase())) {
                return { isValid: true };
            }
        }
        for (const sig of this.fileSignatures) {
            for (const sigPattern of sig.signatures) {
                if (sigPattern && fileStart.startsWith(sigPattern.toUpperCase())) {
                    return {
                        isValid: false,
                        detectedType: this.extensionToMimeType(sig.extension)
                    };
                }
            }
        }
        return { isValid: false };
    }
    async scanFileContent(buffer, mimeType) {
        const errors = [];
        const warnings = [];
        let riskScore = 0;
        let content = '';
        try {
            const sampleSize = Math.min(buffer.length, 64 * 1024);
            content = buffer.subarray(0, sampleSize).toString('utf8');
        }
        catch (error) {
            content = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('binary');
        }
        for (const pattern of this.suspiciousPatterns) {
            if (pattern.test(content)) {
                if (mimeType.startsWith('text/') || mimeType.includes('xml') || mimeType.includes('html')) {
                    errors.push(`Suspicious content pattern detected`);
                    riskScore += 30;
                }
                else {
                    warnings.push('Potential code injection pattern detected in binary file');
                    riskScore += 10;
                }
            }
        }
        if (this.detectEmbeddedFiles(buffer)) {
            warnings.push('File appears to contain embedded files');
            riskScore += 20;
        }
        const entropy = this.calculateEntropy(buffer);
        if (entropy > 7.5 && !this.isExpectedHighEntropy(mimeType)) {
            warnings.push('High entropy detected - file might be encrypted or compressed');
            riskScore += 15;
        }
        if (mimeType.startsWith('text/')) {
            const nullCount = (content.match(/\0/g) || []).length;
            if (nullCount > content.length * 0.01) {
                errors.push('Text file contains excessive null bytes');
                riskScore += 25;
            }
        }
        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            riskScore
        };
    }
    detectEmbeddedFiles(buffer) {
        const commonSignatures = [
            'FFD8FF',
            '89504E47',
            '474946',
            '255044462D',
            '504B0304',
            'D0CF11E0'
        ];
        const hex = buffer.toString('hex').toUpperCase();
        let signatureCount = 0;
        for (const sig of commonSignatures) {
            const regex = new RegExp(sig, 'g');
            const matches = hex.match(regex);
            if (matches) {
                signatureCount += matches.length;
            }
        }
        return signatureCount > 1;
    }
    calculateEntropy(buffer) {
        const frequencies = new Array(256).fill(0);
        for (let i = 0; i < buffer.length; i++) {
            frequencies[buffer[i]]++;
        }
        let entropy = 0;
        for (const freq of frequencies) {
            if (freq > 0) {
                const probability = freq / buffer.length;
                entropy -= probability * Math.log2(probability);
            }
        }
        return entropy;
    }
    isExpectedHighEntropy(mimeType) {
        const highEntropyTypes = [
            'image/', 'video/', 'audio/',
            'application/zip', 'application/x-rar', 'application/x-7z',
            'application/pdf', 'application/octet-stream'
        ];
        return highEntropyTypes.some(type => mimeType.startsWith(type));
    }
    sanitizeFilename(filename) {
        if (!filename) {
            return `file_${Date.now()}`;
        }
        let sanitized = path.basename(filename);
        sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f\x7f-\x9f]/g, '_');
        if (sanitized.length > this.config.maxFilenameLength) {
            const ext = this.getFileExtension(sanitized);
            const name = sanitized.substring(0, this.config.maxFilenameLength - ext.length - 1);
            sanitized = `${name}.${ext}`;
        }
        if (!sanitized || sanitized === '.') {
            sanitized = `file_${Date.now()}`;
        }
        if (!this.config.preserveFilename) {
            const ext = this.getFileExtension(sanitized);
            const timestamp = Date.now();
            const hash = crypto.createHash('md5').update(filename).digest('hex').substring(0, 8);
            sanitized = `${timestamp}_${hash}.${ext}`;
        }
        return sanitized;
    }
    getFileExtension(filename) {
        const lastDot = filename.lastIndexOf('.');
        return lastDot === -1 ? '' : filename.substring(lastDot + 1);
    }
    extensionToMimeType(extension) {
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'bmp': 'image/bmp',
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'txt': 'text/plain',
            'csv': 'text/csv',
            'html': 'text/html',
            'xml': 'application/xml'
        };
        return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
    }
    async quarantineFile(file, reasons) {
        try {
            const quarantineDir = this.config.quarantineDirectory;
            const timestamp = Date.now();
            const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
            const quarantineFilename = `${timestamp}_${hash}_${file.originalname}`;
            const quarantinePath = path.join(quarantineDir, quarantineFilename);
            await fs.mkdir(quarantineDir, { recursive: true });
            await fs.writeFile(quarantinePath, file.buffer);
            const metadata = {
                originalFilename: file.originalname,
                quarantineReason: reasons,
                timestamp,
                hash,
                size: file.size,
                mimetype: file.mimetype
            };
            await fs.writeFile(`${quarantinePath}.metadata.json`, JSON.stringify(metadata, null, 2));
        }
        catch (error) {
            console.error('Failed to quarantine file:', error);
        }
    }
    createValidationMiddleware(options = {}) {
        const validator = new FileUploadSecurity({ ...this.config, ...options });
        return validator.middleware();
    }
    async validateFileBuffer(buffer, filename, mimetype) {
        const file = {
            fieldname: 'file',
            originalname: filename,
            encoding: '7bit',
            mimetype,
            size: buffer.length,
            buffer
        };
        return await this.validateFile(file);
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
}
exports.FileUploadSecurity = FileUploadSecurity;
function createFileUploadSecurity(config) {
    return new FileUploadSecurity(config);
}
//# sourceMappingURL=file-upload-security.js.map