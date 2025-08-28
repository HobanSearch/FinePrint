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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
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
exports.schemas = exports.validationMiddleware = exports.createValidationMiddleware = exports.Joi = exports.z = void 0;
__exportStar(require("./input-sanitizer"), exports);
__exportStar(require("./zod-schemas"), exports);
var zod_1 = require("zod");
Object.defineProperty(exports, "z", { enumerable: true, get: function () { return zod_1.z; } });
exports.Joi = __importStar(require("joi"));
const zod_schemas_1 = require("./zod-schemas");
Object.defineProperty(exports, "schemas", { enumerable: true, get: function () { return zod_schemas_1.schemas; } });
const input_sanitizer_1 = require("./input-sanitizer");
const index_1 = require("../index");
exports.createValidationMiddleware = {
    body: (schema) => {
        return async (request, reply) => {
            try {
                const validated = zod_schemas_1.ZodSecurityValidator.validateRequest(schema, request.body);
                request.body = validated;
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
    },
    query: (schema) => {
        return async (request, reply) => {
            try {
                const validated = zod_schemas_1.ZodSecurityValidator.validateRequest(schema, request.query);
                request.query = validated;
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
    },
    params: (schema) => {
        return async (request, reply) => {
            try {
                const validated = zod_schemas_1.ZodSecurityValidator.validateRequest(schema, request.params);
                request.params = validated;
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
    },
    sanitize: (context = 'html') => {
        return async (request, reply) => {
            if (request.body && typeof request.body === 'object') {
                const sanitizeObject = (obj) => {
                    if (typeof obj === 'string') {
                        return input_sanitizer_1.inputSanitizer.sanitizeString(obj, {
                            removeHtml: context !== 'html',
                            removeSqlKeywords: true,
                            normalizeWhitespace: true
                        });
                    }
                    else if (Array.isArray(obj)) {
                        return obj.map(sanitizeObject);
                    }
                    else if (obj && typeof obj === 'object') {
                        const sanitized = {};
                        for (const [key, value] of Object.entries(obj)) {
                            sanitized[key] = sanitizeObject(value);
                        }
                        return sanitized;
                    }
                    return obj;
                };
                request.body = sanitizeObject(request.body);
            }
        };
    }
};
exports.validationMiddleware = {
    login: exports.createValidationMiddleware.body(zod_schemas_1.schemas.auth.login),
    register: exports.createValidationMiddleware.body(zod_schemas_1.schemas.auth.register),
    forgotPassword: exports.createValidationMiddleware.body(zod_schemas_1.schemas.auth.forgotPassword),
    resetPassword: exports.createValidationMiddleware.body(zod_schemas_1.schemas.auth.resetPassword),
    changePassword: exports.createValidationMiddleware.body(zod_schemas_1.schemas.auth.changePassword),
    createUser: exports.createValidationMiddleware.body(zod_schemas_1.schemas.user.createUser),
    updateUser: exports.createValidationMiddleware.body(zod_schemas_1.schemas.user.updateUser),
    userProfile: exports.createValidationMiddleware.body(zod_schemas_1.schemas.user.userProfile),
    uploadDocument: exports.createValidationMiddleware.body(zod_schemas_1.schemas.document.uploadDocument),
    analyzeDocument: exports.createValidationMiddleware.body(zod_schemas_1.schemas.document.analyzeDocument),
    documentQuery: exports.createValidationMiddleware.query(zod_schemas_1.schemas.document.documentQuery),
    paginationQuery: exports.createValidationMiddleware.query(zod_schemas_1.schemas.api.paginationQuery),
    idParam: exports.createValidationMiddleware.params(zod_schemas_1.schemas.api.idParam),
    bulkAction: exports.createValidationMiddleware.body(zod_schemas_1.schemas.api.bulkAction),
    fileUpload: exports.createValidationMiddleware.body(zod_schemas_1.schemas.fileUpload.validateFile),
    sanitizeHtml: exports.createValidationMiddleware.sanitize('html'),
    sanitizeComment: exports.createValidationMiddleware.sanitize('comment'),
    sanitizeMinimal: exports.createValidationMiddleware.sanitize('minimal'),
    sanitizeNone: exports.createValidationMiddleware.sanitize('none')
};
//# sourceMappingURL=index.js.map