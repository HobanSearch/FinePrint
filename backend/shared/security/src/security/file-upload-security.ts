// Secure File Upload Validation and Processing
// Enterprise-grade file upload security with comprehensive threat detection

import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { FastifyRequest, FastifyReply } from 'fastify';
import { SecurityError, ValidationError } from '../index';

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

export class FileUploadSecurity {
  private config: FileUploadConfig;
  
  // File signature database for validation
  private readonly fileSignatures: FileSignature[] = [
    // Images
    { extension: 'jpg', signatures: ['FFD8FF'], offset: 0 },
    { extension: 'jpeg', signatures: ['FFD8FF'], offset: 0 },
    { extension: 'png', signatures: ['89504E47'], offset: 0 },
    { extension: 'gif', signatures: ['474946'], offset: 0 },
    { extension: 'bmp', signatures: ['424D'], offset: 0 },
    { extension: 'webp', signatures: ['52494646'], offset: 0 },
    { extension: 'ico', signatures: ['00000100'], offset: 0 },
    
    // Documents
    { extension: 'pdf', signatures: ['255044462D'], offset: 0 },
    { extension: 'doc', signatures: ['D0CF11E0'], offset: 0 },
    { extension: 'docx', signatures: ['504B0304', '504B0506', '504B0708'], offset: 0 },
    { extension: 'xls', signatures: ['D0CF11E0'], offset: 0 },
    { extension: 'xlsx', signatures: ['504B0304', '504B0506', '504B0708'], offset: 0 },
    { extension: 'ppt', signatures: ['D0CF11E0'], offset: 0 },
    { extension: 'pptx', signatures: ['504B0304', '504B0506', '504B0708'], offset: 0 },
    { extension: 'rtf', signatures: ['7B5C727466'], offset: 0 },
    { extension: 'odt', signatures: ['504B0304'], offset: 0 },
    
    // Text
    { extension: 'txt', signatures: [], offset: 0 }, // No signature for plain text
    { extension: 'csv', signatures: [], offset: 0 },
    { extension: 'xml', signatures: ['3C3F786D6C'], offset: 0 },
    { extension: 'html', signatures: ['3C21646F63', '3C68746D6C', '3C48544D4C'], offset: 0 },
    
    // Archives
    { extension: 'zip', signatures: ['504B0304', '504B0506', '504B0708'], offset: 0 },
    { extension: 'rar', signatures: ['526172211A070100'], offset: 0 },
    { extension: '7z', signatures: ['377ABCAF271C'], offset: 0 },
    { extension: 'tar', signatures: ['7573746172'], offset: 257 },
    { extension: 'gz', signatures: ['1F8B'], offset: 0 },
    
    // Audio
    { extension: 'mp3', signatures: ['494433', 'FFFB', 'FFF3', 'FFF2'], offset: 0 },
    { extension: 'wav', signatures: ['52494646'], offset: 0 },
    { extension: 'flac', signatures: ['664C6143'], offset: 0 },
    { extension: 'ogg', signatures: ['4F676753'], offset: 0 },
    
    // Video
    { extension: 'mp4', signatures: ['66747970'], offset: 4 },
    { extension: 'avi', signatures: ['52494646'], offset: 0 },
    { extension: 'mkv', signatures: ['1A45DFA3'], offset: 0 },
    { extension: 'mov', signatures: ['66747970'], offset: 4 },
    { extension: 'wmv', signatures: ['3026B275'], offset: 0 }
  ];
  
  // Dangerous file extensions that should never be allowed
  private readonly dangerousExtensions = [
    // Executables
    'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'vbe', 'ws', 'wsf', 'wsh',
    // Scripts
    'js', 'jse', 'jar', 'ps1', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2',
    // System files
    'msi', 'msp', 'mst', 'application', 'gadget', 'msc', 'cpl', 'dll', 'ocx',
    // Other dangerous
    'reg', 'scf', 'lnk', 'inf', 'hta', 'crt', 'cer', 'der', 'p7b', 'p7c', 'p12', 'pfx'
  ];
  
  // Suspicious content patterns
  private readonly suspiciousPatterns = [
    // Script injection
    /<script[^>]*>/i,
    /javascript:/i,
    /vbscript:/i,
    /on\w+\s*=/i,
    
    // PHP code
    /<\?php/i,
    /<\?=/i,
    /<?\s*php/i,
    
    // ASP code
    /<%[^>]*%>/i,
    
    // Server-side includes
    /<!--\s*#\s*include/i,
    
    // SQL injection attempts
    /union\s+select/i,
    /drop\s+table/i,
    /delete\s+from/i,
    
    // Binary content that shouldn't be in text files
    /\x00[\x01-\x08\x0e-\x1f]/
  ];

  constructor(config: Partial<FileUploadConfig> = {}) {
    this.config = {
      maxFileSize: 50 * 1024 * 1024, // 50MB
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
      enableVirusScan: false, // Requires ClamAV integration
      maxFilenameLength: 255,
      preserveFilename: false,
      generateThumbnails: false,
      ...config
    };
  }

  /**
   * Main file upload security middleware
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip non-multipart requests
      if (!request.isMultipart()) {
        return;
      }

      try {
        const files = await this.processMultipartUpload(request);
        
        // Validate all uploaded files
        for (const file of files) {
          const validation = await this.validateFile(file);
          
          if (!validation.isValid) {
            // Move suspicious files to quarantine
            if (validation.riskScore > 70) {
              await this.quarantineFile(file, validation.errors);
            }
            
            throw new SecurityError(
              `File upload validation failed: ${validation.errors.join(', ')}`,
              'FILE_VALIDATION_FAILED',
              400
            );
          }
          
          // Log warnings for suspicious but not blocked files
          if (validation.warnings.length > 0) {
            request.log.warn('File upload warnings', {
              filename: file.originalname,
              warnings: validation.warnings,
              riskScore: validation.riskScore
            });
          }
        }
        
        // Add validated files to request
        (request as any).files = files;
        
      } catch (error) {
        if (error instanceof SecurityError || error instanceof ValidationError) {
          throw error;
        }
        
        request.log.error('File upload processing error', { error });
        throw new SecurityError('File upload processing failed', 'UPLOAD_ERROR', 500);
      }
    };
  }

  /**
   * Process multipart file upload
   */
  private async processMultipartUpload(request: FastifyRequest): Promise<UploadedFile[]> {
    const files: UploadedFile[] = [];
    const parts = request.parts();
    
    for await (const part of parts) {
      if (part.file) {
        // Check file count limit
        if (files.length >= this.config.maxFiles) {
          throw new ValidationError(`Maximum ${this.config.maxFiles} files allowed`);
        }
        
        // Read file data
        const chunks: Buffer[] = [];
        let totalSize = 0;
        
        for await (const chunk of part.file) {
          totalSize += chunk.length;
          
          // Check size limit during upload
          if (totalSize > this.config.maxFileSize) {
            throw new ValidationError(`File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
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

  /**
   * Comprehensive file validation
   */
  async validateFile(file: UploadedFile): Promise<FileValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let riskScore = 0;
    
    // Basic validations
    if (file.size === 0) {
      errors.push('Empty file not allowed');
      riskScore += 30;
    }
    
    if (file.size > this.config.maxFileSize) {
      errors.push(`File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
      riskScore += 20;
    }
    
    // Filename validation
    const filenameValidation = this.validateFilename(file.originalname);
    if (!filenameValidation.isValid) {
      errors.push(...filenameValidation.errors);
      riskScore += 25;
    }
    warnings.push(...filenameValidation.warnings);
    
    // Extension validation
    const extension = this.getFileExtension(file.originalname).toLowerCase();
    if (this.config.blockedExtensions.includes(extension)) {
      errors.push(`File extension '${extension}' is not allowed`);
      riskScore += 50;
    }
    
    if (this.config.allowedExtensions.length > 0 && !this.config.allowedExtensions.includes(extension)) {
      errors.push(`File extension '${extension}' is not in allowed list`);
      riskScore += 30;
    }
    
    // MIME type validation
    if (this.config.allowedMimeTypes.length > 0 && !this.config.allowedMimeTypes.includes(file.mimetype)) {
      errors.push(`MIME type '${file.mimetype}' is not allowed`);
      riskScore += 25;
    }
    
    // File signature validation
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
    
    // Content scanning
    const contentValidation = await this.scanFileContent(file.buffer, file.mimetype);
    if (!contentValidation.isValid) {
      errors.push(...contentValidation.errors);
      riskScore += contentValidation.riskScore;
    }
    warnings.push(...contentValidation.warnings);
    
    // Generate file hash
    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    
    // Check against known malicious file hashes (would be implemented with external service)
    // const hashCheck = await this.checkMaliciousHash(fileHash);
    
    // Generate sanitized filename
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

  /**
   * Validate filename for security issues
   */
  private validateFilename(filename: string): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!filename || filename.trim() === '') {
      errors.push('Filename cannot be empty');
    }
    
    if (filename.length > this.config.maxFilenameLength) {
      errors.push(`Filename too long (max ${this.config.maxFilenameLength} characters)`);
    }
    
    // Check for directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      errors.push('Filename contains invalid path characters');
    }
    
    // Check for null bytes
    if (filename.includes('\0')) {
      errors.push('Filename contains null bytes');
    }
    
    // Check for control characters
    if (/[\x00-\x1f\x7f-\x9f]/.test(filename)) {
      errors.push('Filename contains control characters');
    }
    
    // Check for reserved names (Windows)
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    const nameWithoutExt = path.parse(filename).name.toUpperCase();
    if (reservedNames.includes(nameWithoutExt)) {
      errors.push('Filename uses reserved system name');
    }
    
    // Check for suspicious patterns
    if (/\.(php|asp|jsp|cgi|pl|py|rb|sh|bat|cmd)\./i.test(filename)) {
      warnings.push('Filename contains double extension which might be suspicious');
    }
    
    // Check for very long extensions
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

  /**
   * Validate file signature (magic bytes)
   */
  private validateFileSignature(buffer: Buffer, expectedExtension: string): {
    isValid: boolean;
    detectedType?: string;
  } {
    if (buffer.length < 8) {
      return { isValid: false };
    }
    
    const signature = this.fileSignatures.find(sig => 
      sig.extension === expectedExtension.toLowerCase()
    );
    
    if (!signature || signature.signatures.length === 0) {
      // No signature to validate (e.g., text files)
      return { isValid: true };
    }
    
    const fileStart = buffer.subarray(signature.offset, signature.offset + 8).toString('hex').toUpperCase();
    
    for (const sig of signature.signatures) {
      if (fileStart.startsWith(sig.toUpperCase())) {
        return { isValid: true };
      }
    }
    
    // Try to detect actual file type
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

  /**
   * Scan file content for malicious patterns
   */
  private async scanFileContent(buffer: Buffer, mimeType: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    riskScore: number;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let riskScore = 0;
    
    // Convert buffer to string for text-based analysis
    let content = '';
    try {
      // Only analyze first 64KB for performance
      const sampleSize = Math.min(buffer.length, 64 * 1024);
      content = buffer.subarray(0, sampleSize).toString('utf8');
    } catch (error) {
      // Binary file or encoding issue
      content = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('binary');
    }
    
    // Check for suspicious patterns
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(content)) {
        if (mimeType.startsWith('text/') || mimeType.includes('xml') || mimeType.includes('html')) {
          errors.push(`Suspicious content pattern detected`);
          riskScore += 30;
        } else {
          warnings.push('Potential code injection pattern detected in binary file');
          riskScore += 10;
        }
      }
    }
    
    // Check for embedded files (polyglot attacks)
    if (this.detectEmbeddedFiles(buffer)) {
      warnings.push('File appears to contain embedded files');
      riskScore += 20;
    }
    
    // Check file entropy (high entropy might indicate encryption/compression/obfuscation)
    const entropy = this.calculateEntropy(buffer);
    if (entropy > 7.5 && !this.isExpectedHighEntropy(mimeType)) {
      warnings.push('High entropy detected - file might be encrypted or compressed');
      riskScore += 15;
    }
    
    // Check for excessive null bytes (might indicate binary in text file)
    if (mimeType.startsWith('text/')) {
      const nullCount = (content.match(/\0/g) || []).length;
      if (nullCount > content.length * 0.01) { // More than 1% null bytes
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

  /**
   * Detect embedded files (polyglot attack)
   */
  private detectEmbeddedFiles(buffer: Buffer): boolean {
    const commonSignatures = [
      'FFD8FF', // JPEG
      '89504E47', // PNG
      '474946', // GIF
      '255044462D', // PDF
      '504B0304', // ZIP/Office
      'D0CF11E0' // MS Office
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
    
    // If we find multiple different file signatures, it might be a polyglot
    return signatureCount > 1;
  }

  /**
   * Calculate file entropy
   */
  private calculateEntropy(buffer: Buffer): number {
    const frequencies = new Array(256).fill(0);
    
    // Count byte frequencies
    for (let i = 0; i < buffer.length; i++) {
      frequencies[buffer[i]]++;
    }
    
    // Calculate entropy
    let entropy = 0;
    for (const freq of frequencies) {
      if (freq > 0) {
        const probability = freq / buffer.length;
        entropy -= probability * Math.log2(probability);
      }
    }
    
    return entropy;
  }

  /**
   * Check if high entropy is expected for this file type
   */
  private isExpectedHighEntropy(mimeType: string): boolean {
    const highEntropyTypes = [
      'image/', 'video/', 'audio/',
      'application/zip', 'application/x-rar', 'application/x-7z',
      'application/pdf', 'application/octet-stream'
    ];
    
    return highEntropyTypes.some(type => mimeType.startsWith(type));
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(filename: string): string {
    if (!filename) {
      return `file_${Date.now()}`;
    }
    
    // Remove directory traversal
    let sanitized = path.basename(filename);
    
    // Remove or replace dangerous characters
    sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f\x7f-\x9f]/g, '_');
    
    // Limit length
    if (sanitized.length > this.config.maxFilenameLength) {
      const ext = this.getFileExtension(sanitized);
      const name = sanitized.substring(0, this.config.maxFilenameLength - ext.length - 1);
      sanitized = `${name}.${ext}`;
    }
    
    // Ensure it's not empty after sanitization
    if (!sanitized || sanitized === '.') {
      sanitized = `file_${Date.now()}`;
    }
    
    // Add timestamp if not preserving filename
    if (!this.config.preserveFilename) {
      const ext = this.getFileExtension(sanitized);
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(filename).digest('hex').substring(0, 8);
      sanitized = `${timestamp}_${hash}.${ext}`;
    }
    
    return sanitized;
  }

  /**
   * Get file extension
   */
  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot === -1 ? '' : filename.substring(lastDot + 1);
  }

  /**
   * Convert file extension to MIME type
   */
  private extensionToMimeType(extension: string): string {
    const mimeTypes: { [key: string]: string } = {
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

  /**
   * Quarantine suspicious file
   */
  private async quarantineFile(file: UploadedFile, reasons: string[]): Promise<void> {
    try {
      const quarantineDir = this.config.quarantineDirectory;
      const timestamp = Date.now();
      const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
      const quarantineFilename = `${timestamp}_${hash}_${file.originalname}`;
      const quarantinePath = path.join(quarantineDir, quarantineFilename);
      
      // Ensure quarantine directory exists
      await fs.mkdir(quarantineDir, { recursive: true });
      
      // Write file to quarantine
      await fs.writeFile(quarantinePath, file.buffer);
      
      // Write metadata
      const metadata = {
        originalFilename: file.originalname,
        quarantineReason: reasons,
        timestamp,
        hash,
        size: file.size,
        mimetype: file.mimetype
      };
      
      await fs.writeFile(`${quarantinePath}.metadata.json`, JSON.stringify(metadata, null, 2));
      
    } catch (error) {
      console.error('Failed to quarantine file:', error);
    }
  }

  /**
   * Create file upload validation middleware for specific routes
   */
  createValidationMiddleware(options: Partial<FileUploadConfig> = {}) {
    const validator = new FileUploadSecurity({ ...this.config, ...options });
    return validator.middleware();
  }

  /**
   * Validate single file buffer
   */
  async validateFileBuffer(
    buffer: Buffer, 
    filename: string, 
    mimetype: string
  ): Promise<FileValidationResult> {
    const file: UploadedFile = {
      fieldname: 'file',
      originalname: filename,
      encoding: '7bit',
      mimetype,
      size: buffer.length,
      buffer
    };
    
    return await this.validateFile(file);
  }

  /**
   * Get file upload statistics
   */
  getConfig(): FileUploadConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<FileUploadConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Export factory function
export function createFileUploadSecurity(
  config?: Partial<FileUploadConfig>
): FileUploadSecurity {
  return new FileUploadSecurity(config);
}
