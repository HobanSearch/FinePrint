import Joi from 'joi';
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
    allowedAttributes?: {
        [tag: string]: string[];
    };
    removeSqlKeywords?: boolean;
    normalizeWhitespace?: boolean;
    trimWhitespace?: boolean;
    removeControlChars?: boolean;
    maxLength?: number;
}
export declare class InputSanitizer {
    private readonly sqlKeywords;
    private readonly xssPatterns;
    sanitizeString(input: string, options?: SanitizationOptions): string;
    sanitizeHtml(html: string, allowedTags?: string[], allowedAttributes?: {
        [tag: string]: string[];
    }): string;
    sanitizeEmail(email: string): string;
    sanitizeUrl(url: string): string;
    validateUuid(uuid: string): boolean;
    sanitizeJson(jsonString: string, maxDepth?: number): any;
    private sanitizeObject;
    private stripHtml;
    private removeSqlKeywords;
    detectXSS(input: string): boolean;
    validateInput(data: any, rules: ValidationRule[]): {
        isValid: boolean;
        errors: string[];
        sanitizedData: any;
    };
    private validateString;
    private validateNumber;
    private validateDate;
    createJoiSchema(rules: ValidationRule[]): Joi.ObjectSchema;
}
export declare const inputSanitizer: InputSanitizer;
//# sourceMappingURL=input-sanitizer.d.ts.map