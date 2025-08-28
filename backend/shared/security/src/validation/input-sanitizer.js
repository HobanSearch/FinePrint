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
exports.inputSanitizer = exports.InputSanitizer = void 0;
const validator = __importStar(require("validator"));
const DOMPurify = __importStar(require("dompurify"));
const jsdom_1 = require("jsdom");
const joi_1 = __importDefault(require("joi"));
const index_1 = require("../index");
const window = new jsdom_1.JSDOM('').window;
const purify = DOMPurify(window);
class InputSanitizer {
    sqlKeywords = [
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
        'UNION', 'WHERE', 'ORDER', 'GROUP', 'HAVING', 'EXEC', 'EXECUTE',
        'SCRIPT', 'JAVASCRIPT', 'VBSCRIPT', 'ONLOAD', 'ONERROR', 'ONCLICK'
    ];
    xssPatterns = [
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
    sanitizeString(input, options = {}) {
        if (typeof input !== 'string') {
            throw new index_1.ValidationError('Input must be a string');
        }
        let sanitized = input;
        if (options.trimWhitespace !== false) {
            sanitized = sanitized.trim();
        }
        if (options.removeControlChars !== false) {
            sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
        }
        if (options.normalizeWhitespace) {
            sanitized = sanitized.replace(/\s+/g, ' ');
        }
        if (options.removeHtml) {
            sanitized = this.stripHtml(sanitized, options);
        }
        if (options.removeSqlKeywords) {
            sanitized = this.removeSqlKeywords(sanitized);
        }
        if (options.maxLength && sanitized.length > options.maxLength) {
            sanitized = sanitized.substring(0, options.maxLength);
        }
        return sanitized;
    }
    sanitizeHtml(html, allowedTags, allowedAttributes) {
        if (typeof html !== 'string') {
            throw new index_1.ValidationError('HTML input must be a string');
        }
        const config = {
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
    sanitizeEmail(email) {
        if (!validator.isEmail(email)) {
            throw new index_1.ValidationError('Invalid email format', 'email');
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
    sanitizeUrl(url) {
        if (!validator.isURL(url, {
            protocols: ['http', 'https'],
            require_protocol: true,
            require_valid_protocol: true,
            allow_underscores: false,
            allow_trailing_dot: false,
            allow_protocol_relative_urls: false
        })) {
            throw new index_1.ValidationError('Invalid URL format', 'url');
        }
        const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:'];
        const lowerUrl = url.toLowerCase();
        for (const protocol of dangerousProtocols) {
            if (lowerUrl.startsWith(protocol)) {
                throw new index_1.ValidationError('Dangerous URL protocol detected', 'url');
            }
        }
        return url.trim();
    }
    validateUuid(uuid) {
        return validator.isUUID(uuid, 4);
    }
    sanitizeJson(jsonString, maxDepth = 10) {
        try {
            const parsed = JSON.parse(jsonString);
            return this.sanitizeObject(parsed, maxDepth);
        }
        catch (error) {
            throw new index_1.ValidationError('Invalid JSON format', 'json');
        }
    }
    sanitizeObject(obj, maxDepth, currentDepth = 0) {
        if (currentDepth > maxDepth) {
            throw new index_1.ValidationError('Object depth limit exceeded');
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
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                const sanitizedKey = this.sanitizeString(key, { removeHtml: true, maxLength: 100 });
                sanitized[sanitizedKey] = this.sanitizeObject(value, maxDepth, currentDepth + 1);
            }
            return sanitized;
        }
        return obj;
    }
    stripHtml(input, options) {
        if (options.allowedTags && options.allowedTags.length > 0) {
            return purify.sanitize(input, {
                ALLOWED_TAGS: options.allowedTags,
                ALLOWED_ATTR: options.allowedAttributes || {}
            });
        }
        else {
            return input.replace(/<[^>]*>/g, '');
        }
    }
    removeSqlKeywords(input) {
        let sanitized = input;
        for (const keyword of this.sqlKeywords) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            sanitized = sanitized.replace(regex, '');
        }
        const sqlPatterns = [
            /('|(\\')|(;)|(\-\-)|(\s*(=|!=|<>|<|>|<=|>=)\s*\w+)|(\s+(or|and)\s+)/gi,
            /\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b/gi,
            /'[^']*'/g,
            /"[^"]*"/g,
            /\/\*.*?\*\//g,
            /--.*$/gm
        ];
        for (const pattern of sqlPatterns) {
            sanitized = sanitized.replace(pattern, '');
        }
        return sanitized;
    }
    detectXSS(input) {
        const lowerInput = input.toLowerCase();
        for (const pattern of this.xssPatterns) {
            if (pattern.test(lowerInput)) {
                return true;
            }
        }
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
    validateInput(data, rules) {
        const errors = [];
        const sanitizedData = {};
        for (const rule of rules) {
            const value = data[rule.field];
            if (rule.required && (value === undefined || value === null || value === '')) {
                errors.push(`${rule.field} is required`);
                continue;
            }
            if (!rule.required && (value === undefined || value === null)) {
                continue;
            }
            try {
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
                            throw new index_1.ValidationError('Invalid UUID format');
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
                if (rule.sanitizer) {
                    sanitizedValue = rule.sanitizer(sanitizedValue);
                }
                if (rule.customValidator && !rule.customValidator(sanitizedValue)) {
                    throw new index_1.ValidationError('Custom validation failed');
                }
                sanitizedData[rule.field] = sanitizedValue;
            }
            catch (error) {
                errors.push(`${rule.field}: ${error.message}`);
            }
        }
        return {
            isValid: errors.length === 0,
            errors,
            sanitizedData
        };
    }
    validateString(value, rule) {
        if (typeof value !== 'string') {
            throw new index_1.ValidationError('Must be a string');
        }
        let sanitized = this.sanitizeString(value, {
            removeHtml: true,
            removeSqlKeywords: true,
            normalizeWhitespace: true,
            maxLength: rule.maxLength
        });
        if (rule.minLength && sanitized.length < rule.minLength) {
            throw new index_1.ValidationError(`Must be at least ${rule.minLength} characters`);
        }
        if (rule.maxLength && sanitized.length > rule.maxLength) {
            throw new index_1.ValidationError(`Must be no more than ${rule.maxLength} characters`);
        }
        if (rule.pattern && !rule.pattern.test(sanitized)) {
            throw new index_1.ValidationError('Does not match required pattern');
        }
        if (rule.allowedValues && !rule.allowedValues.includes(sanitized)) {
            throw new index_1.ValidationError('Value not in allowed list');
        }
        if (this.detectXSS(sanitized)) {
            throw new index_1.ValidationError('Potential XSS detected');
        }
        return sanitized;
    }
    validateNumber(value, rule) {
        const num = typeof value === 'string' ? parseFloat(value) : value;
        if (typeof num !== 'number' || isNaN(num)) {
            throw new index_1.ValidationError('Must be a valid number');
        }
        return num;
    }
    validateDate(value) {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
            throw new index_1.ValidationError('Must be a valid date');
        }
        return date;
    }
    createJoiSchema(rules) {
        const schemaFields = {};
        for (const rule of rules) {
            let schema;
            switch (rule.type) {
                case 'string':
                    schema = joi_1.default.string();
                    if (rule.minLength)
                        schema = schema.min(rule.minLength);
                    if (rule.maxLength)
                        schema = schema.max(rule.maxLength);
                    if (rule.pattern)
                        schema = schema.pattern(rule.pattern);
                    if (rule.allowedValues)
                        schema = schema.valid(...rule.allowedValues);
                    break;
                case 'number':
                    schema = joi_1.default.number();
                    break;
                case 'email':
                    schema = joi_1.default.string().email();
                    break;
                case 'url':
                    schema = joi_1.default.string().uri();
                    break;
                case 'uuid':
                    schema = joi_1.default.string().uuid();
                    break;
                case 'date':
                    schema = joi_1.default.date();
                    break;
                case 'json':
                    schema = joi_1.default.object();
                    break;
                default:
                    schema = joi_1.default.any();
            }
            if (rule.required) {
                schema = schema.required();
            }
            else {
                schema = schema.optional();
            }
            schemaFields[rule.field] = schema;
        }
        return joi_1.default.object(schemaFields);
    }
}
exports.InputSanitizer = InputSanitizer;
exports.inputSanitizer = new InputSanitizer();
//# sourceMappingURL=input-sanitizer.js.map