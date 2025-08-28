// Input Validation and Sanitization Framework
// Comprehensive input validation, sanitization, and XSS prevention

import * as validator from 'validator';
import * as DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import Joi from 'joi';
import { ValidationError } from '../index';

// Initialize DOMPurify with JSDOM for server-side usage
const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'email' | 'url' | 'uuid' | 'date' | 'json' | 'html' | 'sql';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowedValues?: any[];
  customValidator?: (value: any) => boolean;
  sanitizer?: (value: any) => any;
}

export interface SanitizationOptions {
  removeHtml?: boolean;
  allowedTags?: string[];
  allowedAttributes?: { [tag: string]: string[] };
  removeSqlKeywords?: boolean;
  normalizeWhitespace?: boolean;
  trimWhitespace?: boolean;
  removeControlChars?: boolean;
  maxLength?: number;
}

export class InputSanitizer {
  private readonly sqlKeywords = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'UNION', 'WHERE', 'ORDER', 'GROUP', 'HAVING', 'EXEC', 'EXECUTE',
    'SCRIPT', 'JAVASCRIPT', 'VBSCRIPT', 'ONLOAD', 'ONERROR', 'ONCLICK'
  ];

  private readonly xssPatterns = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
    /<object[\s\S]*?>[\s\S]*?<\/object>/gi,
    /<embed[\s\S]*?>/gi,
    /<link[\s\S]*?>/gi,
    /<meta[\s\S]*?>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:text\/html/gi,
    /on\w+\s*=/gi
  ];

  /**
   * Sanitize string input based on options
   */
  sanitizeString(input: string, options: SanitizationOptions = {}): string {
    if (typeof input !== 'string') {
      throw new ValidationError('Input must be a string');
    }

    let sanitized = input;

    // Trim whitespace
    if (options.trimWhitespace !== false) {
      sanitized = sanitized.trim();
    }

    // Remove control characters
    if (options.removeControlChars !== false) {
      sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    }

    // Normalize whitespace
    if (options.normalizeWhitespace) {
      sanitized = sanitized.replace(/\s+/g, ' ');
    }

    // Remove HTML tags
    if (options.removeHtml) {
      sanitized = this.stripHtml(sanitized, options);
    }

    // Remove SQL keywords
    if (options.removeSqlKeywords) {
      sanitized = this.removeSqlKeywords(sanitized);
    }

    // Enforce max length
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }

    return sanitized;
  }

  /**
   * Sanitize HTML content safely
   */
  sanitizeHtml(html: string, allowedTags?: string[], allowedAttributes?: { [tag: string]: string[] }): string {
    if (typeof html !== 'string') {
      throw new ValidationError('HTML input must be a string');
    }

    const config: any = {
      ALLOWED_TAGS: allowedTags || ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      ALLOWED_ATTR: allowedAttributes || {},
      KEEP_CONTENT: false,
      REMOVE_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'button'],
      REMOVE_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur', 'onsubmit'],
      FORBID_TAGS: ['script', 'style'],
      FORBID_ATTR: ['style', 'on*']
    };

    return purify.sanitize(html, config);
  }

  /**
   * Validate and sanitize email
   */
  sanitizeEmail(email: string): string {
    if (!validator.isEmail(email)) {
      throw new ValidationError('Invalid email format', 'email');
    }

    return validator.normalizeEmail(email, {
      gmail_lowercase: true,
      gmail_remove_dots: false,
      gmail_remove_subaddress: false,
      outlookdotcom_lowercase: true,
      outlookdotcom_remove_subaddress: false,
      yahoo_lowercase: true,
      yahoo_remove_subaddress: false,
      icloud_lowercase: true,
      icloud_remove_subaddress: false
    }) || email.toLowerCase().trim();
  }

  /**
   * Validate and sanitize URL
   */
  sanitizeUrl(url: string): string {
    if (!validator.isURL(url, {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true,
      allow_underscores: false,
      allow_trailing_dot: false,
      allow_protocol_relative_urls: false
    })) {
      throw new ValidationError('Invalid URL format', 'url');
    }

    // Remove dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:'];
    const lowerUrl = url.toLowerCase();
    
    for (const protocol of dangerousProtocols) {
      if (lowerUrl.startsWith(protocol)) {
        throw new ValidationError('Dangerous URL protocol detected', 'url');
      }
    }

    return url.trim();
  }

  /**
   * Validate UUID
   */
  validateUuid(uuid: string): boolean {
    return validator.isUUID(uuid, 4);
  }

  /**
   * Sanitize JSON input
   */
  sanitizeJson(jsonString: string, maxDepth: number = 10): any {
    try {
      const parsed = JSON.parse(jsonString);
      return this.sanitizeObject(parsed, maxDepth);
    } catch (error) {
      throw new ValidationError('Invalid JSON format', 'json');
    }
  }

  /**
   * Sanitize object recursively
   */
  private sanitizeObject(obj: any, maxDepth: number, currentDepth: number = 0): any {
    if (currentDepth > maxDepth) {
      throw new ValidationError('Object depth limit exceeded');
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj, { removeHtml: true, removeSqlKeywords: true });
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, maxDepth, currentDepth + 1));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeString(key, { removeHtml: true, maxLength: 100 });
        sanitized[sanitizedKey] = this.sanitizeObject(value, maxDepth, currentDepth + 1);
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Strip HTML tags with whitelist
   */
  private stripHtml(input: string, options: SanitizationOptions): string {
    if (options.allowedTags && options.allowedTags.length > 0) {
      return purify.sanitize(input, {
        ALLOWED_TAGS: options.allowedTags,
        ALLOWED_ATTR: options.allowedAttributes || {}
      });
    } else {
      return input.replace(/<[^>]*>/g, '');
    }
  }

  /**
   * Remove SQL keywords and dangerous patterns
   */
  private removeSqlKeywords(input: string): string {
    let sanitized = input;
    
    // Remove SQL keywords (case insensitive)
    for (const keyword of this.sqlKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      sanitized = sanitized.replace(regex, '');
    }

    // Remove common SQL injection patterns
    const sqlPatterns = [
      /('|(\\')|(;)|(\-\-)|(\s*(=|!=|<>|<|>|<=|>=)\s*\w+)|(\s+(or|and)\s+)/gi,
      /\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b/gi,
      /'[^']*'/g, // Single quoted strings
      /"[^"]*"/g, // Double quoted strings
      /\/\*.*?\*\//g, // SQL comments
      /--.*$/gm // SQL line comments
    ];

    for (const pattern of sqlPatterns) {
      sanitized = sanitized.replace(pattern, '');
    }

    return sanitized;
  }

  /**
   * Detect XSS attempts
   */
  detectXSS(input: string): boolean {
    const lowerInput = input.toLowerCase();
    
    // Check for XSS patterns
    for (const pattern of this.xssPatterns) {
      if (pattern.test(lowerInput)) {
        return true;
      }
    }

    // Check for JavaScript event handlers
    const eventHandlers = [
      'onload', 'onerror', 'onclick', 'onmouseover', 'onfocus',
      'onblur', 'onchange', 'onsubmit', 'onreset', 'onkeydown',
      'onkeyup', 'onkeypress'
    ];

    for (const handler of eventHandlers) {
      if (lowerInput.includes(handler)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate input against rules
   */
  validateInput(data: any, rules: ValidationRule[]): { isValid: boolean; errors: string[]; sanitizedData: any } {
    const errors: string[] = [];
    const sanitizedData: any = {};

    for (const rule of rules) {
      const value = data[rule.field];

      // Check required fields
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${rule.field} is required`);
        continue;
      }

      // Skip validation for undefined optional fields
      if (!rule.required && (value === undefined || value === null)) {
        continue;
      }

      try {
        // Type-specific validation and sanitization
        let sanitizedValue = value;

        switch (rule.type) {
          case 'string':
            sanitizedValue = this.validateString(value, rule);
            break;
          case 'number':
            sanitizedValue = this.validateNumber(value, rule);
            break;
          case 'email':
            sanitizedValue = this.sanitizeEmail(value);
            break;
          case 'url':
            sanitizedValue = this.sanitizeUrl(value);
            break;
          case 'uuid':
            if (!this.validateUuid(value)) {
              throw new ValidationError('Invalid UUID format');
            }
            sanitizedValue = value;
            break;
          case 'date':
            sanitizedValue = this.validateDate(value);
            break;
          case 'json':
            sanitizedValue = this.sanitizeJson(value);
            break;
          case 'html':
            sanitizedValue = this.sanitizeHtml(value);
            break;
          case 'sql':
            sanitizedValue = this.sanitizeString(value, { removeSqlKeywords: true });
            break;
        }

        // Apply custom sanitizer
        if (rule.sanitizer) {
          sanitizedValue = rule.sanitizer(sanitizedValue);
        }

        // Apply custom validator
        if (rule.customValidator && !rule.customValidator(sanitizedValue)) {
          throw new ValidationError('Custom validation failed');
        }

        sanitizedData[rule.field] = sanitizedValue;

      } catch (error) {
        errors.push(`${rule.field}: ${error.message}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData
    };
  }

  /**
   * Validate string with rules
   */
  private validateString(value: any, rule: ValidationRule): string {
    if (typeof value !== 'string') {
      throw new ValidationError('Must be a string');
    }

    let sanitized = this.sanitizeString(value, {
      removeHtml: true,
      removeSqlKeywords: true,
      normalizeWhitespace: true,
      maxLength: rule.maxLength
    });

    if (rule.minLength && sanitized.length < rule.minLength) {
      throw new ValidationError(`Must be at least ${rule.minLength} characters`);
    }

    if (rule.maxLength && sanitized.length > rule.maxLength) {
      throw new ValidationError(`Must be no more than ${rule.maxLength} characters`);
    }

    if (rule.pattern && !rule.pattern.test(sanitized)) {
      throw new ValidationError('Does not match required pattern');
    }

    if (rule.allowedValues && !rule.allowedValues.includes(sanitized)) {
      throw new ValidationError('Value not in allowed list');
    }

    // Check for XSS
    if (this.detectXSS(sanitized)) {
      throw new ValidationError('Potential XSS detected');
    }

    return sanitized;
  }

  /**
   * Validate number
   */
  private validateNumber(value: any, rule: ValidationRule): number {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    
    if (typeof num !== 'number' || isNaN(num)) {
      throw new ValidationError('Must be a valid number');
    }

    return num;
  }

  /**
   * Validate date
   */
  private validateDate(value: any): Date {
    const date = new Date(value);
    
    if (isNaN(date.getTime())) {
      throw new ValidationError('Must be a valid date');
    }

    return date;
  }

  /**
   * Create Joi schema from validation rules
   */
  createJoiSchema(rules: ValidationRule[]): Joi.ObjectSchema {
    const schemaFields: { [key: string]: Joi.Schema } = {};

    for (const rule of rules) {
      let schema: Joi.Schema;

      switch (rule.type) {
        case 'string':
          schema = Joi.string();
          if (rule.minLength) schema = schema.min(rule.minLength);
          if (rule.maxLength) schema = schema.max(rule.maxLength);
          if (rule.pattern) schema = schema.pattern(rule.pattern);
          if (rule.allowedValues) schema = schema.valid(...rule.allowedValues);
          break;
        case 'number':
          schema = Joi.number();
          break;
        case 'email':
          schema = Joi.string().email();
          break;
        case 'url':
          schema = Joi.string().uri();
          break;
        case 'uuid':
          schema = Joi.string().uuid();
          break;
        case 'date':
          schema = Joi.date();
          break;
        case 'json':
          schema = Joi.object();
          break;
        default:
          schema = Joi.any();
      }

      if (rule.required) {
        schema = schema.required();
      } else {
        schema = schema.optional();
      }

      schemaFields[rule.field] = schema;
    }

    return Joi.object(schemaFields);
  }
}

// Export singleton instance
export const inputSanitizer = new InputSanitizer();