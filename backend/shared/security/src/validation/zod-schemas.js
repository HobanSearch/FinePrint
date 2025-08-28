"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.z = exports.schemas = exports.ZodSecurityValidator = exports.fileUploadSchemas = exports.integrationSchemas = exports.adminSchemas = exports.apiSchemas = exports.documentSchemas = exports.userSchemas = exports.authSchemas = exports.commonSchemas = void 0;
const zod_1 = require("zod");
const index_1 = require("../index");
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const IP_ADDRESS_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
const HEX_REGEX = /^[a-fA-F0-9]+$/;
const secureString = (minLength = 1, maxLength = 1000) => zod_1.z.string()
    .min(minLength)
    .max(maxLength)
    .refine((val) => {
    const xssPatterns = [
        /<script[\s\S]*?>/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /<iframe[\s\S]*?>/i,
        /<object[\s\S]*?>/i,
        /<embed[\s\S]*?>/i
    ];
    return !xssPatterns.some(pattern => pattern.test(val));
}, 'Contains potentially dangerous content')
    .refine((val) => {
    const sqlPatterns = [
        /\b(union|select|insert|update|delete|drop|create|alter)\b/i,
        /['"]\s*(or|and)\s*['"]?\w/i,
        /\-\-/,
        /\/\*[\s\S]*?\*\//
    ];
    return !sqlPatterns.some(pattern => pattern.test(val));
}, 'Contains potentially dangerous SQL patterns');
exports.commonSchemas = {
    uuid: zod_1.z.string().regex(UUID_REGEX, 'Invalid UUID format'),
    id: zod_1.z.union([zod_1.z.string().min(1), zod_1.z.number().positive()]),
    name: secureString(1, 100),
    title: secureString(1, 200),
    description: secureString(0, 2000),
    comment: secureString(0, 1000),
    slug: zod_1.z.string().regex(SLUG_REGEX, 'Invalid slug format').max(100),
    email: zod_1.z.string().email().max(320),
    phone: zod_1.z.string().regex(PHONE_REGEX, 'Invalid phone number format').optional(),
    url: zod_1.z.string().url().max(2048),
    ipAddress: zod_1.z.string().regex(IP_ADDRESS_REGEX, 'Invalid IP address'),
    userAgent: secureString(1, 512),
    sessionId: zod_1.z.string().min(16).max(128),
    token: zod_1.z.string().min(16).max(2048),
    filename: secureString(1, 255).refine((val) => !val.includes('..') && !val.includes('/') && !val.includes('\\'), 'Invalid filename'),
    mimeType: zod_1.z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/, 'Invalid MIME type'),
    fileSize: zod_1.z.number().positive().max(100 * 1024 * 1024),
    isoDate: zod_1.z.string().datetime(),
    timestamp: zod_1.z.number().positive(),
    base64: zod_1.z.string().regex(BASE64_REGEX, 'Invalid base64 format'),
    hex: zod_1.z.string().regex(HEX_REGEX, 'Invalid hex format'),
    page: zod_1.z.number().int().positive().default(1),
    limit: zod_1.z.number().int().positive().max(1000).default(20),
    offset: zod_1.z.number().int().nonnegative().default(0),
    sortBy: secureString(1, 50),
    sortOrder: zod_1.z.enum(['asc', 'desc']).default('asc'),
    search: secureString(0, 200),
    password: zod_1.z.string()
        .min(12, 'Password must be at least 12 characters')
        .max(128, 'Password must not exceed 128 characters')
        .refine((val) => /[A-Z]/.test(val), 'Password must contain at least one uppercase letter')
        .refine((val) => /[a-z]/.test(val), 'Password must contain at least one lowercase letter')
        .refine((val) => /\d/.test(val), 'Password must contain at least one number')
        .refine((val) => /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(val), 'Password must contain at least one special character'),
    confirmPassword: (passwordField) => zod_1.z.string()
        .refine((val, ctx) => {
        const password = ctx.parent[passwordField];
        return val === password;
    }, 'Passwords do not match'),
    mfaCode: zod_1.z.string().regex(/^\d{6}$/, 'MFA code must be 6 digits'),
    role: zod_1.z.enum(['user', 'admin', 'moderator', 'viewer']),
    permission: secureString(1, 100),
    status: zod_1.z.enum(['active', 'inactive', 'pending', 'suspended', 'deleted']),
    boolean: zod_1.z.boolean(),
    country: zod_1.z.string().length(2, 'Country code must be 2 characters'),
    timezone: secureString(1, 50),
    eventName: secureString(1, 100),
    eventData: zod_1.z.record(zod_1.z.unknown()).optional(),
    apiKey: zod_1.z.string().min(32).max(128),
    bearerToken: zod_1.z.string().startsWith('Bearer '),
    content: secureString(0, 50000),
    markdown: secureString(0, 50000),
    json: zod_1.z.string().refine((val) => {
        try {
            JSON.parse(val);
            return true;
        }
        catch {
            return false;
        }
    }, 'Invalid JSON format'),
    port: zod_1.z.number().int().min(1).max(65535),
    domain: zod_1.z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/, 'Invalid domain format'),
    tag: secureString(1, 50),
    tags: zod_1.z.array(secureString(1, 50)).max(20),
    category: secureString(1, 100)
};
exports.authSchemas = {
    login: zod_1.z.object({
        email: exports.commonSchemas.email,
        password: zod_1.z.string().min(1).max(128),
        rememberMe: zod_1.z.boolean().optional()
    }),
    register: zod_1.z.object({
        email: exports.commonSchemas.email,
        password: exports.commonSchemas.password,
        confirmPassword: exports.commonSchemas.confirmPassword('password'),
        firstName: exports.commonSchemas.name,
        lastName: exports.commonSchemas.name,
        acceptTerms: zod_1.z.boolean().refine(val => val === true, 'Must accept terms and conditions')
    }),
    forgotPassword: zod_1.z.object({
        email: exports.commonSchemas.email
    }),
    resetPassword: zod_1.z.object({
        token: exports.commonSchemas.token,
        password: exports.commonSchemas.password,
        confirmPassword: exports.commonSchemas.confirmPassword('password')
    }),
    changePassword: zod_1.z.object({
        currentPassword: zod_1.z.string().min(1),
        newPassword: exports.commonSchemas.password,
        confirmPassword: exports.commonSchemas.confirmPassword('newPassword')
    }),
    setupMFA: zod_1.z.object({
        secret: zod_1.z.string().min(16),
        code: exports.commonSchemas.mfaCode
    }),
    verifyMFA: zod_1.z.object({
        code: exports.commonSchemas.mfaCode
    })
};
exports.userSchemas = {
    createUser: zod_1.z.object({
        email: exports.commonSchemas.email,
        firstName: exports.commonSchemas.name,
        lastName: exports.commonSchemas.name,
        role: exports.commonSchemas.role.optional(),
        status: exports.commonSchemas.status.optional()
    }),
    updateUser: zod_1.z.object({
        firstName: exports.commonSchemas.name.optional(),
        lastName: exports.commonSchemas.name.optional(),
        email: exports.commonSchemas.email.optional(),
        role: exports.commonSchemas.role.optional(),
        status: exports.commonSchemas.status.optional()
    }),
    userProfile: zod_1.z.object({
        firstName: exports.commonSchemas.name,
        lastName: exports.commonSchemas.name,
        email: exports.commonSchemas.email,
        phone: exports.commonSchemas.phone,
        timezone: exports.commonSchemas.timezone.optional(),
        country: exports.commonSchemas.country.optional()
    })
};
exports.documentSchemas = {
    uploadDocument: zod_1.z.object({
        filename: exports.commonSchemas.filename,
        mimeType: exports.commonSchemas.mimeType.refine((val) => ['application/pdf', 'text/plain', 'text/html', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(val), 'Unsupported file type'),
        size: exports.commonSchemas.fileSize,
        content: exports.commonSchemas.base64.optional()
    }),
    analyzeDocument: zod_1.z.object({
        documentId: exports.commonSchemas.uuid,
        analysisType: zod_1.z.enum(['quick', 'detailed', 'comprehensive']).optional(),
        options: zod_1.z.object({
            includeRecommendations: zod_1.z.boolean().optional(),
            includeRiskScore: zod_1.z.boolean().optional(),
            includeSummary: zod_1.z.boolean().optional()
        }).optional()
    }),
    documentQuery: zod_1.z.object({
        page: exports.commonSchemas.page,
        limit: exports.commonSchemas.limit,
        search: exports.commonSchemas.search.optional(),
        status: zod_1.z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
        sortBy: zod_1.z.enum(['createdAt', 'updatedAt', 'filename', 'status']).optional(),
        sortOrder: exports.commonSchemas.sortOrder
    })
};
exports.apiSchemas = {
    paginationQuery: zod_1.z.object({
        page: exports.commonSchemas.page,
        limit: exports.commonSchemas.limit,
        search: exports.commonSchemas.search.optional(),
        sortBy: exports.commonSchemas.sortBy.optional(),
        sortOrder: exports.commonSchemas.sortOrder
    }),
    idParam: zod_1.z.object({
        id: exports.commonSchemas.uuid
    }),
    bulkAction: zod_1.z.object({
        ids: zod_1.z.array(exports.commonSchemas.uuid).min(1).max(100),
        action: zod_1.z.enum(['delete', 'archive', 'restore', 'export'])
    }),
    analyticsEvent: zod_1.z.object({
        event: exports.commonSchemas.eventName,
        userId: exports.commonSchemas.uuid.optional(),
        sessionId: exports.commonSchemas.sessionId.optional(),
        data: exports.commonSchemas.eventData,
        timestamp: exports.commonSchemas.timestamp.optional()
    })
};
exports.adminSchemas = {
    systemSettings: zod_1.z.object({
        maintenanceMode: zod_1.z.boolean().optional(),
        registrationEnabled: zod_1.z.boolean().optional(),
        maxFileSize: zod_1.z.number().positive().max(1024 * 1024 * 1024).optional(),
        allowedFileTypes: zod_1.z.array(zod_1.z.string()).optional(),
        sessionTimeout: zod_1.z.number().positive().max(24 * 60 * 60 * 1000).optional()
    }),
    userManagement: zod_1.z.object({
        userId: exports.commonSchemas.uuid,
        action: zod_1.z.enum(['suspend', 'activate', 'delete', 'promote', 'demote']),
        reason: exports.commonSchemas.description.optional()
    }),
    securityAudit: zod_1.z.object({
        startDate: exports.commonSchemas.isoDate,
        endDate: exports.commonSchemas.isoDate,
        eventTypes: zod_1.z.array(zod_1.z.string()).optional(),
        userId: exports.commonSchemas.uuid.optional(),
        ipAddress: exports.commonSchemas.ipAddress.optional()
    })
};
exports.integrationSchemas = {
    webhook: zod_1.z.object({
        url: exports.commonSchemas.url,
        events: zod_1.z.array(exports.commonSchemas.eventName).min(1),
        secret: zod_1.z.string().min(16).max(128).optional(),
        active: zod_1.z.boolean().optional()
    }),
    apiKeyGeneration: zod_1.z.object({
        name: exports.commonSchemas.name,
        permissions: zod_1.z.array(exports.commonSchemas.permission),
        expiresAt: exports.commonSchemas.isoDate.optional()
    })
};
exports.fileUploadSchemas = {
    validateFile: zod_1.z.object({
        filename: exports.commonSchemas.filename,
        mimeType: exports.commonSchemas.mimeType,
        size: exports.commonSchemas.fileSize,
        checksum: exports.commonSchemas.hex.optional()
    }).refine((data) => {
        const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.jar', '.js', '.vbs', '.php'];
        const extension = data.filename.toLowerCase().substring(data.filename.lastIndexOf('.'));
        return !dangerousExtensions.includes(extension);
    }, 'File type not allowed for security reasons'),
    chunkedUpload: zod_1.z.object({
        chunkIndex: zod_1.z.number().int().nonnegative(),
        totalChunks: zod_1.z.number().int().positive(),
        chunkSize: zod_1.z.number().positive().max(10 * 1024 * 1024),
        totalSize: exports.commonSchemas.fileSize,
        filename: exports.commonSchemas.filename,
        uploadId: exports.commonSchemas.uuid
    })
};
class ZodSecurityValidator {
    static validateRequest(schema, data, options = {}) {
        try {
            if (options.allowUnknown) {
                return schema.parse(data);
            }
            else {
                return schema.strict().parse(data);
            }
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                const errorMessages = error.errors.map(err => {
                    const path = err.path.join('.');
                    return path ? `${path}: ${err.message}` : err.message;
                });
                throw new index_1.ValidationError(`Validation failed: ${errorMessages.join(', ')}`);
            }
            throw error;
        }
    }
    static safeValidate(schema, data) {
        const result = schema.safeParse(data);
        if (result.success) {
            return { success: true, data: result.data };
        }
        else {
            const errors = result.error.errors.map(err => {
                const path = err.path.join('.');
                return path ? `${path}: ${err.message}` : err.message;
            });
            return { success: false, errors };
        }
    }
    static createMiddleware(schema, target = 'body') {
        return async (request, reply) => {
            try {
                const data = request[target];
                const validated = ZodSecurityValidator.validateRequest(schema, data);
                request[target] = validated;
            }
            catch (error) {
                if (error instanceof index_1.ValidationError) {
                    return reply.status(400).send({
                        success: false,
                        error: 'VALIDATION_ERROR',
                        message: error.message
                    });
                }
                throw error;
            }
        };
    }
    static validateFileUpload(file) {
        const fileSignatures = {
            'pdf': ['255044462D'],
            'jpg': ['FFD8FF'],
            'png': ['89504E47'],
            'gif': ['474946'],
            'zip': ['504B0304'],
            'doc': ['D0CF11E0'],
            'docx': ['504B0304']
        };
        return ZodSecurityValidator.validateRequest(exports.fileUploadSchemas.validateFile, file);
    }
    static withRateLimit(schema, limits) {
        return schema.describe(`Rate limited: ${limits.maxRequests} requests per ${limits.windowMs}ms`);
    }
}
exports.ZodSecurityValidator = ZodSecurityValidator;
exports.schemas = {
    common: exports.commonSchemas,
    auth: exports.authSchemas,
    user: exports.userSchemas,
    document: exports.documentSchemas,
    api: exports.apiSchemas,
    admin: exports.adminSchemas,
    integration: exports.integrationSchemas,
    fileUpload: exports.fileUploadSchemas
};
var zod_2 = require("zod");
Object.defineProperty(exports, "z", { enumerable: true, get: function () { return zod_2.z; } });
exports.default = ZodSecurityValidator;
//# sourceMappingURL=zod-schemas.js.map