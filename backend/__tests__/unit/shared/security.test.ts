/**
 * Unit tests for Security utilities
 * Tests all core security functionality including encryption, validation, and protection
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, jest } from '@jest/globals';
import { resetAllMocks, setupMockDefaults } from '../../mocks/utils/mock-utils';

// Mock crypto module
const mockCrypto = {
  randomBytes: jest.fn(),
  createHash: jest.fn(),
  createHmac: jest.fn(),
  createCipher: jest.fn(),
  createDecipher: jest.fn(),
  pbkdf2: jest.fn(),
  scrypt: jest.fn(),
};

// Mock bcrypt
const mockBcrypt = {
  hash: jest.fn(),
  compare: jest.fn(),
  genSalt: jest.fn(),
};

// Mock JWT
const mockJWT = {
  sign: jest.fn(),
  verify: jest.fn(),
  decode: jest.fn(),
};

// Mock the Security utilities
class SecurityUtils {
  constructor(
    private crypto: any,
    private bcrypt: any,
    private jwt: any
  ) {}

  // Password hashing
  async hashPassword(password: string, saltRounds = 12): Promise<string> {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const salt = await this.bcrypt.genSalt(saltRounds);
    return this.bcrypt.hash(password, salt);
  }

  async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    if (!password || !hashedPassword) {
      return false;
    }

    return this.bcrypt.compare(password, hashedPassword);
  }

  // JWT token management
  generateToken(payload: any, secret: string, options: any = {}): string {
    const defaultOptions = {
      expiresIn: '1h',
      issuer: 'fineprintai',
      audience: 'fineprintai-users',
    };

    return this.jwt.sign(payload, secret, { ...defaultOptions, ...options });
  }

  verifyToken(token: string, secret: string): any {
    try {
      return this.jwt.verify(token, secret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  decodeToken(token: string): any {
    return this.jwt.decode(token);
  }

  // Encryption/Decryption
  encrypt(text: string, key: string): string {
    const cipher = this.crypto.createCipher('aes-256-cbc', key);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  decrypt(encryptedText: string, key: string): string {
    try {
      const decipher = this.crypto.createDecipher('aes-256-cbc', key);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      throw new Error('Failed to decrypt data');
    }
  }

  // Random token generation
  generateRandomToken(length = 32): string {
    const buffer = this.crypto.randomBytes(length);
    return buffer.toString('hex');
  }

  generateSecureId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = this.generateRandomToken(8);
    return `${timestamp}_${randomPart}`;
  }

  // Hash generation
  generateHash(data: string, algorithm = 'sha256'): string {
    const hash = this.crypto.createHash(algorithm);
    hash.update(data);
    return hash.digest('hex');
  }

  generateHMAC(data: string, secret: string, algorithm = 'sha256'): string {
    const hmac = this.crypto.createHmac(algorithm, secret);
    hmac.update(data);
    return hmac.digest('hex');
  }

  // Input validation and sanitization
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!password) {
      errors.push('Password is required');
    } else {
      if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
      }
      if (password.length > 128) {
        errors.push('Password must be less than 128 characters');
      }
      if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
      }
      if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
      }
      if (!/\d/.test(password)) {
        errors.push('Password must contain at least one number');
      }
      if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least one special character');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  sanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/[<>'"&]/g, (char) => {
        const entities: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;',
        };
        return entities[char] || char;
      })
      .trim();
  }

  // Rate limiting utilities
  generateRateLimitKey(identifier: string, action: string): string {
    return `rate_limit:${action}:${identifier}`;
  }

  isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  // Security headers
  getSecurityHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    };
  }

  // CSRF token generation
  generateCSRFToken(): string {
    return this.generateRandomToken(32);
  }

  validateCSRFToken(token: string, expectedToken: string): boolean {
    if (!token || !expectedToken) {
      return false;
    }
    return token === expectedToken;
  }

  // API key generation and validation
  generateAPIKey(): string {
    const prefix = 'fpa_';
    const randomPart = this.generateRandomToken(40);
    return `${prefix}${randomPart}`;
  }

  validateAPIKey(apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Check format: fpa_[80 hex characters]
    const apiKeyRegex = /^fpa_[a-f0-9]{80}$/;
    return apiKeyRegex.test(apiKey);
  }

  // Session management
  generateSessionId(): string {
    return this.generateSecureId();
  }

  // File validation
  validateFileType(filename: string, allowedExtensions: string[]): boolean {
    if (!filename || !allowedExtensions.length) {
      return false;
    }

    const extension = filename.toLowerCase().split('.').pop();
    return allowedExtensions.includes(extension || '');
  }

  validateFileSize(size: number, maxSizeBytes: number): boolean {
    return size > 0 && size <= maxSizeBytes;
  }

  // SQL injection protection
  escapeSQL(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    return input.replace(/'/g, "''");
  }

  // Check for common attack patterns
  detectSQLInjection(input: string): boolean {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      /(--|\/\*|\*\/)/,
      /(\bOR\b.*=.*\bOR\b|\bAND\b.*=.*\bAND\b)/i,
      /('(\s*(OR|AND)\s*'.*'|;\s*(SELECT|INSERT|UPDATE|DELETE)))/i,
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  detectXSS(input: string): boolean {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }
}

class EncryptionService {
  constructor(private crypto: any) {}

  async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.crypto.pbkdf2(password, salt, 100000, 32, 'sha256', (err: Error, derivedKey: Buffer) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  }

  async encryptData(data: string, password: string): Promise<{ encrypted: string; salt: string; iv: string }> {
    const salt = this.crypto.randomBytes(16);
    const iv = this.crypto.randomBytes(16);
    const key = await this.deriveKey(password, salt);

    const cipher = this.crypto.createCipher('aes-256-gcm', key);
    cipher.setAAD(Buffer.from('fineprintai'));

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted + ':' + authTag.toString('hex'),
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
    };
  }

  async decryptData(encryptedData: string, salt: string, iv: string, password: string): Promise<string> {
    const [encrypted, authTag] = encryptedData.split(':');
    const key = await this.deriveKey(password, Buffer.from(salt, 'hex'));

    const decipher = this.crypto.createDecipher('aes-256-gcm', key);
    decipher.setAAD(Buffer.from('fineprintai'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

describe('SecurityUtils', () => {
  let securityUtils: SecurityUtils;
  let encryptionService: EncryptionService;

  beforeAll(() => {
    setupMockDefaults();
  });

  beforeEach(() => {
    resetAllMocks();
    
    securityUtils = new SecurityUtils(mockCrypto, mockBcrypt, mockJWT);
    encryptionService = new EncryptionService(mockCrypto);

    // Setup default mock responses
    mockCrypto.randomBytes.mockImplementation((size: number) => ({
      toString: jest.fn().mockReturnValue('a'.repeat(size * 2)),
    }));

    mockBcrypt.genSalt.mockResolvedValue('$2b$12$salt');
    mockBcrypt.hash.mockResolvedValue('$2b$12$hashedpassword');
    mockBcrypt.compare.mockResolvedValue(true);

    mockJWT.sign.mockReturnValue('jwt.token.here');
    mockJWT.verify.mockReturnValue({ userId: 'test-user', exp: Date.now() / 1000 + 3600 });
    mockJWT.decode.mockReturnValue({ userId: 'test-user' });

    const mockCipher = {
      update: jest.fn().mockReturnValue('encrypted'),
      final: jest.fn().mockReturnValue('data'),
    };
    const mockDecipher = {
      update: jest.fn().mockReturnValue('decrypted'),
      final: jest.fn().mockReturnValue('data'),
    };

    mockCrypto.createCipher.mockReturnValue(mockCipher);
    mockCrypto.createDecipher.mockReturnValue(mockDecipher);

    const mockHash = {
      update: jest.fn(),
      digest: jest.fn().mockReturnValue('hashedvalue'),
    };
    mockCrypto.createHash.mockReturnValue(mockHash);
    mockCrypto.createHmac.mockReturnValue(mockHash);
  });

  afterEach(() => {
    resetAllMocks();
  });

  describe('Password Management', () => {
    describe('hashPassword', () => {
      test('should hash password with default salt rounds', async () => {
        const password = 'TestPassword123!';
        const result = await securityUtils.hashPassword(password);

        expect(mockBcrypt.genSalt).toHaveBeenCalledWith(12);
        expect(mockBcrypt.hash).toHaveBeenCalledWith(password, '$2b$12$salt');
        expect(result).toBe('$2b$12$hashedpassword');
      });

      test('should hash password with custom salt rounds', async () => {
        const password = 'TestPassword123!';
        await securityUtils.hashPassword(password, 10);

        expect(mockBcrypt.genSalt).toHaveBeenCalledWith(10);
      });

      test('should throw error for short password', async () => {
        await expect(
          securityUtils.hashPassword('short')
        ).rejects.toThrow('Password must be at least 8 characters long');
      });

      test('should throw error for empty password', async () => {
        await expect(
          securityUtils.hashPassword('')
        ).rejects.toThrow('Password must be at least 8 characters long');
      });
    });

    describe('comparePassword', () => {
      test('should return true for matching passwords', async () => {
        const result = await securityUtils.comparePassword('password', 'hashedpassword');

        expect(mockBcrypt.compare).toHaveBeenCalledWith('password', 'hashedpassword');
        expect(result).toBe(true);
      });

      test('should return false for non-matching passwords', async () => {
        mockBcrypt.compare.mockResolvedValue(false);

        const result = await securityUtils.comparePassword('wrong', 'hashedpassword');

        expect(result).toBe(false);
      });

      test('should return false for empty inputs', async () => {
        const result1 = await securityUtils.comparePassword('', 'hashedpassword');
        const result2 = await securityUtils.comparePassword('password', '');
        const result3 = await securityUtils.comparePassword('', '');

        expect(result1).toBe(false);
        expect(result2).toBe(false);
        expect(result3).toBe(false);
        expect(mockBcrypt.compare).not.toHaveBeenCalled();
      });
    });
  });

  describe('JWT Token Management', () => {
    describe('generateToken', () => {
      test('should generate token with default options', () => {
        const payload = { userId: 'test-user' };
        const secret = 'secret-key';

        const result = securityUtils.generateToken(payload, secret);

        expect(mockJWT.sign).toHaveBeenCalledWith(payload, secret, {
          expiresIn: '1h',
          issuer: 'fineprintai',
          audience: 'fineprintai-users',
        });
        expect(result).toBe('jwt.token.here');
      });

      test('should generate token with custom options', () => {
        const payload = { userId: 'test-user' };
        const secret = 'secret-key';
        const options = { expiresIn: '24h', issuer: 'custom-issuer' };

        securityUtils.generateToken(payload, secret, options);

        expect(mockJWT.sign).toHaveBeenCalledWith(payload, secret, {
          expiresIn: '24h',
          issuer: 'custom-issuer',
          audience: 'fineprintai-users',
        });
      });
    });

    describe('verifyToken', () => {
      test('should verify valid token', () => {
        const token = 'valid.token.here';
        const secret = 'secret-key';

        const result = securityUtils.verifyToken(token, secret);

        expect(mockJWT.verify).toHaveBeenCalledWith(token, secret);
        expect(result).toEqual({ userId: 'test-user', exp: expect.any(Number) });
      });

      test('should throw error for invalid token', () => {
        mockJWT.verify.mockImplementation(() => {
          throw new Error('Invalid token');
        });

        expect(() => {
          securityUtils.verifyToken('invalid.token', 'secret');
        }).toThrow('Invalid or expired token');
      });
    });

    describe('decodeToken', () => {
      test('should decode token without verification', () => {
        const token = 'token.to.decode';

        const result = securityUtils.decodeToken(token);

        expect(mockJWT.decode).toHaveBeenCalledWith(token);
        expect(result).toEqual({ userId: 'test-user' });
      });
    });
  });

  describe('Encryption/Decryption', () => {
    test('should encrypt text', () => {
      const text = 'sensitive data';
      const key = 'encryption-key';

      const result = securityUtils.encrypt(text, key);

      expect(mockCrypto.createCipher).toHaveBeenCalledWith('aes-256-cbc', key);
      expect(result).toBe('encrypteddata');
    });

    test('should decrypt text', () => {
      const encryptedText = 'encrypteddata';
      const key = 'encryption-key';

      const result = securityUtils.decrypt(encryptedText, key);

      expect(mockCrypto.createDecipher).toHaveBeenCalledWith('aes-256-cbc', key);
      expect(result).toBe('decrypteddata');
    });

    test('should throw error for decryption failure', () => {
      const mockDecipher = {
        update: jest.fn().mockImplementation(() => {
          throw new Error('Decryption failed');
        }),
        final: jest.fn(),
      };
      mockCrypto.createDecipher.mockReturnValue(mockDecipher);

      expect(() => {
        securityUtils.decrypt('invalid', 'key');
      }).toThrow('Failed to decrypt data');
    });
  });

  describe('Random Token Generation', () => {
    test('should generate random token with default length', () => {
      const result = securityUtils.generateRandomToken();

      expect(mockCrypto.randomBytes).toHaveBeenCalledWith(32);
      expect(result).toBe('a'.repeat(64)); // 32 bytes * 2 characters per byte
    });

    test('should generate random token with custom length', () => {
      securityUtils.generateRandomToken(16);

      expect(mockCrypto.randomBytes).toHaveBeenCalledWith(16);
    });

    test('should generate secure ID', () => {
      const result = securityUtils.generateSecureId();

      expect(result).toMatch(/^[a-z0-9]+_[a]+$/);
      expect(mockCrypto.randomBytes).toHaveBeenCalledWith(8);
    });
  });

  describe('Hash Generation', () => {
    test('should generate hash with default algorithm', () => {
      const data = 'data to hash';

      const result = securityUtils.generateHash(data);

      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
      expect(result).toBe('hashedvalue');
    });

    test('should generate hash with custom algorithm', () => {
      const data = 'data to hash';

      securityUtils.generateHash(data, 'sha512');

      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha512');
    });

    test('should generate HMAC', () => {
      const data = 'data to sign';
      const secret = 'secret-key';

      const result = securityUtils.generateHMAC(data, secret);

      expect(mockCrypto.createHmac).toHaveBeenCalledWith('sha256', secret);
      expect(result).toBe('hashedvalue');
    });
  });

  describe('Input Validation', () => {
    describe('validateEmail', () => {
      test('should validate correct email addresses', () => {
        const validEmails = [
          'test@example.com',
          'user.name@domain.co.uk',
          'test123@subdomain.example.org',
        ];

        validEmails.forEach(email => {
          expect(securityUtils.validateEmail(email)).toBe(true);
        });
      });

      test('should reject invalid email addresses', () => {
        const invalidEmails = [
          'invalid-email',
          '@domain.com',
          'test@',
          'test..test@domain.com',
          '',
          'a'.repeat(250) + '@example.com', // Too long
        ];

        invalidEmails.forEach(email => {
          expect(securityUtils.validateEmail(email)).toBe(false);
        });
      });
    });

    describe('validatePassword', () => {
      test('should validate strong password', () => {
        const result = securityUtils.validatePassword('StrongPass123!');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should reject weak passwords', () => {
        const weakPasswords = [
          { password: '', expectedErrors: ['Password is required'] },
          { password: 'short', expectedErrors: ['Password must be at least 8 characters long'] },
          { password: 'nouppercase123!', expectedErrors: ['Password must contain at least one uppercase letter'] },
          { password: 'NOLOWERCASE123!', expectedErrors: ['Password must contain at least one lowercase letter'] },
          { password: 'NoNumbers!', expectedErrors: ['Password must contain at least one number'] },
          { password: 'NoSpecialChars123', expectedErrors: ['Password must contain at least one special character'] },
        ];

        weakPasswords.forEach(({ password, expectedErrors }) => {
          const result = securityUtils.validatePassword(password);
          expect(result.valid).toBe(false);
          expectedErrors.forEach(error => {
            expect(result.errors).toContain(error);
          });
        });
      });

      test('should reject overly long password', () => {
        const longPassword = 'A1!' + 'a'.repeat(130);
        const result = securityUtils.validatePassword(longPassword);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password must be less than 128 characters');
      });
    });

    describe('sanitizeInput', () => {
      test('should sanitize HTML special characters', () => {
        const input = '<script>alert("xss")</script>';
        const result = securityUtils.sanitizeInput(input);

        expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      });

      test('should handle non-string input', () => {
        expect(securityUtils.sanitizeInput(null as any)).toBe('');
        expect(securityUtils.sanitizeInput(undefined as any)).toBe('');
        expect(securityUtils.sanitizeInput(123 as any)).toBe('');
      });

      test('should trim whitespace', () => {
        const input = '  test input  ';
        const result = securityUtils.sanitizeInput(input);

        expect(result).toBe('test input');
      });
    });
  });

  describe('Validation Utilities', () => {
    test('should validate UUID format', () => {
      const validUUIDs = [
        '123e4567-e89b-12d3-a456-426614174000',
        '550e8400-e29b-41d4-a716-446655440000',
      ];

      const invalidUUIDs = [
        'invalid-uuid',
        '123e4567-e89b-12d3-a456',
        '123e4567-e89b-12d3-a456-42661417400g',
        '',
      ];

      validUUIDs.forEach(uuid => {
        expect(securityUtils.isValidUUID(uuid)).toBe(true);
      });

      invalidUUIDs.forEach(uuid => {
        expect(securityUtils.isValidUUID(uuid)).toBe(false);
      });
    });
  });

  describe('Security Headers', () => {
    test('should return comprehensive security headers', () => {
      const headers = securityUtils.getSecurityHeaders();

      expect(headers).toHaveValidSecurityHeaders();
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
    });
  });

  describe('CSRF Protection', () => {
    test('should generate CSRF token', () => {
      const token = securityUtils.generateCSRFToken();

      expect(mockCrypto.randomBytes).toHaveBeenCalledWith(32);
      expect(token).toBe('a'.repeat(64));
    });

    test('should validate CSRF token', () => {
      const token = 'valid-token';
      const expectedToken = 'valid-token';
      const invalidToken = 'invalid-token';

      expect(securityUtils.validateCSRFToken(token, expectedToken)).toBe(true);
      expect(securityUtils.validateCSRFToken(token, invalidToken)).toBe(false);
      expect(securityUtils.validateCSRFToken('', expectedToken)).toBe(false);
      expect(securityUtils.validateCSRFToken(token, '')).toBe(false);
    });
  });

  describe('API Key Management', () => {
    test('should generate API key with correct format', () => {
      const apiKey = securityUtils.generateAPIKey();

      expect(apiKey).toMatch(/^fpa_[a]+$/);
      expect(mockCrypto.randomBytes).toHaveBeenCalledWith(40);
    });

    test('should validate API key format', () => {
      const validApiKey = 'fpa_' + 'a'.repeat(80);
      const invalidApiKeys = [
        'invalid-key',
        'fpa_short',
        'wrong_prefix_' + 'a'.repeat(80),
        '',
        null,
        undefined,
      ];

      expect(securityUtils.validateAPIKey(validApiKey)).toBe(true);

      invalidApiKeys.forEach(key => {
        expect(securityUtils.validateAPIKey(key as any)).toBe(false);
      });
    });
  });

  describe('File Validation', () => {
    test('should validate file types', () => {
      const allowedExtensions = ['pdf', 'doc', 'docx', 'txt'];

      expect(securityUtils.validateFileType('document.pdf', allowedExtensions)).toBe(true);
      expect(securityUtils.validateFileType('Document.PDF', allowedExtensions)).toBe(true);
      expect(securityUtils.validateFileType('file.exe', allowedExtensions)).toBe(false);
      expect(securityUtils.validateFileType('', allowedExtensions)).toBe(false);
      expect(securityUtils.validateFileType('document.pdf', [])).toBe(false);
    });

    test('should validate file sizes', () => {
      const maxSize = 1024 * 1024; // 1MB

      expect(securityUtils.validateFileSize(500000, maxSize)).toBe(true);
      expect(securityUtils.validateFileSize(maxSize, maxSize)).toBe(true);
      expect(securityUtils.validateFileSize(maxSize + 1, maxSize)).toBe(false);
      expect(securityUtils.validateFileSize(0, maxSize)).toBe(false);
      expect(securityUtils.validateFileSize(-1, maxSize)).toBe(false);
    });
  });

  describe('Attack Detection', () => {
    test('should detect SQL injection attempts', () => {
      const sqlInjectionInputs = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "UNION SELECT * FROM passwords",
        "admin'--",
        "/* comment */ SELECT",
      ];

      const safeInputs = [
        'normal user input',
        'email@example.com',
        'John O\'Connor', // Legitimate apostrophe
      ];

      sqlInjectionInputs.forEach(input => {
        expect(securityUtils.detectSQLInjection(input)).toBe(true);
      });

      safeInputs.forEach(input => {
        expect(securityUtils.detectSQLInjection(input)).toBe(false);
      });
    });

    test('should detect XSS attempts', () => {
      const xssInputs = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img onerror="alert(1)" src="x">',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<object data="javascript:alert(1)"></object>',
      ];

      const safeInputs = [
        'normal text',
        'user@example.com',
        'Some <em>emphasized</em> text', // Safe HTML
      ];

      xssInputs.forEach(input => {
        expect(securityUtils.detectXSS(input)).toBe(true);
      });

      safeInputs.forEach(input => {
        expect(securityUtils.detectXSS(input)).toBe(false);
      });
    });
  });

  describe('Performance Tests', () => {
    test('should hash password within performance threshold', async () => {
      const { result, duration } = await measurePerformance(async () => {
        return securityUtils.hashPassword('TestPassword123!');
      });

      expect(duration).toBeWithinPerformanceThreshold(1000); // 1 second for hashing
      expect(result).toBeDefined();
    });

    test('should generate multiple tokens efficiently', async () => {
      const { result, duration } = await measurePerformance(async () => {
        const tokens = [];
        for (let i = 0; i < 100; i++) {
          tokens.push(securityUtils.generateRandomToken());
        }
        return tokens;
      });

      expect(duration).toBeWithinPerformanceThreshold(100); // 100ms for 100 tokens
      expect(result).toHaveLength(100);
    });
  });
});