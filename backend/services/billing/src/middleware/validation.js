"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateApiKey = exports.validateFileUpload = exports.commonSchemas = exports.validateCommonParams = exports.validateRequest = void 0;
const zod_1 = require("zod");
const logger_1 = require("../utils/logger");
const validateRequest = (schema, source = 'body') => {
    return (req, res, next) => {
        try {
            const data = req[source];
            const validatedData = schema.parse(data);
            req[source] = validatedData;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                logger_1.logger.warn('Request validation failed', {
                    errors: error.errors,
                    source,
                    data: req[source],
                });
                return res.status(400).json({
                    success: false,
                    error: 'Invalid request data',
                    details: error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message,
                        code: err.code,
                    })),
                });
            }
            logger_1.logger.error('Validation middleware error', { error });
            res.status(500).json({
                success: false,
                error: 'Validation error',
            });
        }
    };
};
exports.validateRequest = validateRequest;
const validateCommonParams = (req, res, next) => {
    try {
        if (req.query.limit) {
            const limit = parseInt(req.query.limit);
            if (isNaN(limit) || limit < 1 || limit > 1000) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid limit parameter (must be between 1 and 1000)',
                });
            }
            req.query.limit = limit.toString();
        }
        if (req.query.offset) {
            const offset = parseInt(req.query.offset);
            if (isNaN(offset) || offset < 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid offset parameter (must be >= 0)',
                });
            }
            req.query.offset = offset.toString();
        }
        if (req.query.startDate) {
            const startDate = new Date(req.query.startDate);
            if (isNaN(startDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid startDate parameter',
                });
            }
        }
        if (req.query.endDate) {
            const endDate = new Date(req.query.endDate);
            if (isNaN(endDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid endDate parameter',
                });
            }
        }
        if (req.query.startDate && req.query.endDate) {
            const startDate = new Date(req.query.startDate);
            const endDate = new Date(req.query.endDate);
            if (startDate > endDate) {
                return res.status(400).json({
                    success: false,
                    error: 'startDate must be before endDate',
                });
            }
            const oneYear = 365 * 24 * 60 * 60 * 1000;
            if (endDate.getTime() - startDate.getTime() > oneYear) {
                return res.status(400).json({
                    success: false,
                    error: 'Date range cannot exceed 1 year',
                });
            }
        }
        next();
    }
    catch (error) {
        logger_1.logger.error('Parameter validation error', { error });
        res.status(500).json({
            success: false,
            error: 'Parameter validation error',
        });
    }
};
exports.validateCommonParams = validateCommonParams;
exports.commonSchemas = {
    uuid: zod_1.z.string().uuid('Invalid UUID format'),
    email: zod_1.z.string().email('Invalid email format'),
    currency: zod_1.z.string().length(3, 'Currency must be 3 characters').toUpperCase(),
    amount: zod_1.z.number().min(0).max(999999.99),
    pagination: zod_1.z.object({
        limit: zod_1.z.number().int().min(1).max(1000).default(50),
        offset: zod_1.z.number().int().min(0).default(0),
    }),
    dateRange: zod_1.z.object({
        startDate: zod_1.z.string().transform(str => new Date(str)),
        endDate: zod_1.z.string().transform(str => new Date(str)),
    }).refine(data => data.startDate <= data.endDate, 'startDate must be before or equal to endDate'),
    subscriptionTier: zod_1.z.enum(['free', 'starter', 'professional', 'team', 'enterprise']),
    paymentMethodType: zod_1.z.enum(['card', 'sepa_debit', 'us_bank_account']),
    invoiceStatus: zod_1.z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']),
};
const validateFileUpload = (allowedTypes, maxSize = 5 * 1024 * 1024) => {
    return (req, res, next) => {
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No files uploaded',
            });
        }
        const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
        for (const file of files) {
            if (!allowedTypes.includes(file.mimetype)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
                });
            }
            if (file.size > maxSize) {
                return res.status(400).json({
                    success: false,
                    error: `File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`,
                });
            }
        }
        next();
    };
};
exports.validateFileUpload = validateFileUpload;
const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        return res.status(401).json({
            success: false,
            error: 'API key required',
        });
    }
    const apiKeyPattern = /^fp_(live|test)_[a-zA-Z0-9]{32}$/;
    if (!apiKeyPattern.test(apiKey)) {
        return res.status(401).json({
            success: false,
            error: 'Invalid API key format',
        });
    }
    next();
};
exports.validateApiKey = validateApiKey;
exports.default = exports.validateRequest;
//# sourceMappingURL=validation.js.map