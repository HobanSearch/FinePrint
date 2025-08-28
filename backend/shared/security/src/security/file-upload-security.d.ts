import { FastifyRequest, FastifyReply } from 'fastify';
export interface FileUploadConfig {
    maxFileSize: number;
    maxFiles: number;
    allowedMimeTypes: string[];
    allowedExtensions: string[];
    blockedExtensions: string[];
    scanForMalware: boolean;
    validateFileSignature: boolean;
    quarantineDirectory: string;
    uploadDirectory: string;
    enableVirusScan: boolean;
    maxFilenameLength: number;
    preserveFilename: boolean;
    generateThumbnails: boolean;
}
export interface FileValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    sanitizedFilename: string;
    detectedMimeType: string;
    fileHash: string;
    riskScore: number;
}
export interface UploadedFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
    filename?: string;
    path?: string;
}
export interface FileSignature {
    extension: string;
    signatures: string[];
    offset: number;
}
export declare class FileUploadSecurity {
    private config;
    private readonly fileSignatures;
    private readonly dangerousExtensions;
    private readonly suspiciousPatterns;
    constructor(config?: Partial<FileUploadConfig>);
    middleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    private processMultipartUpload;
    validateFile(file: UploadedFile): Promise<FileValidationResult>;
    private validateFilename;
    private validateFileSignature;
    private scanFileContent;
    private detectEmbeddedFiles;
    private calculateEntropy;
    private isExpectedHighEntropy;
    private sanitizeFilename;
    private getFileExtension;
    private extensionToMimeType;
    private quarantineFile;
    createValidationMiddleware(options?: Partial<FileUploadConfig>): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    validateFileBuffer(buffer: Buffer, filename: string, mimetype: string): Promise<FileValidationResult>;
    getConfig(): FileUploadConfig;
    updateConfig(updates: Partial<FileUploadConfig>): void;
}
export declare function createFileUploadSecurity(config?: Partial<FileUploadConfig>): FileUploadSecurity;
//# sourceMappingURL=file-upload-security.d.ts.map