"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = preferenceRoutes;
const zod_1 = require("zod");
const logger_1 = require("@fineprintai/shared-logger");
const preferenceService_1 = require("../services/preferenceService");
const logger = (0, logger_1.createServiceLogger)('preference-routes');
const UpdatePreferencesSchema = zod_1.z.object({
    emailEnabled: zod_1.z.boolean().optional(),
    pushEnabled: zod_1.z.boolean().optional(),
    inAppEnabled: zod_1.z.boolean().optional(),
    webhookEnabled: zod_1.z.boolean().optional(),
    webhookUrl: zod_1.z.string().url().optional(),
    webhookSecret: zod_1.z.string().optional(),
    analysisComplete: zod_1.z.boolean().optional(),
    documentChanges: zod_1.z.boolean().optional(),
    highRiskFindings: zod_1.z.boolean().optional(),
    weeklySummary: zod_1.z.boolean().optional(),
    marketingEmails: zod_1.z.boolean().optional(),
    securityAlerts: zod_1.z.boolean().optional(),
    billingUpdates: zod_1.z.boolean().optional(),
    systemMaintenance: zod_1.z.boolean().optional(),
    quietHoursEnabled: zod_1.z.boolean().optional(),
    quietHoursStart: zod_1.z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    quietHoursEnd: zod_1.z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    timezone: zod_1.z.string().optional(),
    batchingEnabled: zod_1.z.boolean().optional(),
    batchingInterval: zod_1.z.number().int().min(1).optional(),
    maxBatchSize: zod_1.z.number().int().min(1).max(100).optional(),
});
const ConsentSchema = zod_1.z.object({
    consentGiven: zod_1.z.boolean(),
    consentTypes: zod_1.z.array(zod_1.z.string()).default([]),
    source: zod_1.z.string().optional(),
});
const UnsubscribeSchema = zod_1.z.object({
    type: zod_1.z.enum(['all', 'marketing', 'transactional', 'specific']),
    categories: zod_1.z.array(zod_1.z.string()).optional(),
    reason: zod_1.z.string().optional(),
    source: zod_1.z.string().default('preferences_page'),
});
async function preferenceRoutes(fastify) {
    fastify.get('/', {
        schema: {
            description: 'Get user notification preferences',
            tags: ['preferences'],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                userId: { type: 'string' },
                                emailEnabled: { type: 'boolean' },
                                browserEnabled: { type: 'boolean' },
                                webhookEnabled: { type: 'boolean' },
                                webhookUrl: { type: ['string', 'null'] },
                                analysisComplete: { type: 'boolean' },
                                documentChanges: { type: 'boolean' },
                                highRiskFindings: { type: 'boolean' },
                                weeklySummary: { type: 'boolean' },
                                marketingEmails: { type: 'boolean' },
                            },
                        },
                    },
                },
                401: { $ref: 'Error' },
                500: { $ref: 'Error' },
            },
        },
    }, async (request, reply) => {
        try {
            const userId = request.user?.id;
            if (!userId) {
                return reply.status(401).send({
                    success: false,
                    error: {
                        code: 'UNAUTHORIZED',
                        message: 'Authentication required',
                    },
                });
            }
            const preferences = await preferenceService_1.preferenceService.getUserPreferences(userId);
            reply.send({
                success: true,
                data: preferences,
            });
        }
        catch (error) {
            logger.error('Failed to get user preferences', { error: error.message });
            reply.status(500).send({
                success: false,
                error: {
                    code: 'PREFERENCES_FETCH_FAILED',
                    message: error.message,
                },
            });
        }
    });
    fastify.put('/', {
        schema: {
            description: 'Update user notification preferences',
            tags: ['preferences'],
            body: UpdatePreferencesSchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                userId: { type: 'string' },
                                emailEnabled: { type: 'boolean' },
                                browserEnabled: { type: 'boolean' },
                                webhookEnabled: { type: 'boolean' },
                                webhookUrl: { type: ['string', 'null'] },
                                analysisComplete: { type: 'boolean' },
                                documentChanges: { type: 'boolean' },
                                highRiskFindings: { type: 'boolean' },
                                weeklySummary: { type: 'boolean' },
                                marketingEmails: { type: 'boolean' },
                            },
                        },
                    },
                },
                400: { $ref: 'Error' },
                401: { $ref: 'Error' },
                500: { $ref: 'Error' },
            },
        },
    }, async (request, reply) => {
        try {
            const userId = request.user?.id;
            const updates = UpdatePreferencesSchema.parse(request.body);
            if (!userId) {
                return reply.status(401).send({
                    success: false,
                    error: {
                        code: 'UNAUTHORIZED',
                        message: 'Authentication required',
                    },
                });
            }
            const preferences = await preferenceService_1.preferenceService.updateUserPreferences(userId, updates);
            reply.send({
                success: true,
                data: preferences,
            });
        }
        catch (error) {
            logger.error('Failed to update user preferences', { error: error.message });
            reply.status(500).send({
                success: false,
                error: {
                    code: 'PREFERENCES_UPDATE_FAILED',
                    message: error.message,
                },
            });
        }
    });
    fastify.post('/consent', {
        schema: {
            description: 'Update user consent for notifications',
            tags: ['preferences'],
            body: ConsentSchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                    },
                },
                400: { $ref: 'Error' },
                401: { $ref: 'Error' },
                500: { $ref: 'Error' },
            },
        },
    }, async (request, reply) => {
        try {
            const userId = request.user?.id;
            const consentRequest = ConsentSchema.parse(request.body);
            if (!userId) {
                return reply.status(401).send({
                    success: false,
                    error: {
                        code: 'UNAUTHORIZED',
                        message: 'Authentication required',
                    },
                });
            }
            const result = await preferenceService_1.preferenceService.updateConsent(userId, {
                ...consentRequest,
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            });
            reply.send(result);
        }
        catch (error) {
            logger.error('Failed to update consent', { error: error.message });
            reply.status(500).send({
                success: false,
                error: {
                    code: 'CONSENT_UPDATE_FAILED',
                    message: error.message,
                },
            });
        }
    });
    fastify.post('/unsubscribe', {
        schema: {
            description: 'Unsubscribe from notifications',
            tags: ['preferences'],
            body: UnsubscribeSchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                    },
                },
                400: { $ref: 'Error' },
                401: { $ref: 'Error' },
                500: { $ref: 'Error' },
            },
        },
    }, async (request, reply) => {
        try {
            const userId = request.user?.id;
            const unsubscribeRequest = UnsubscribeSchema.parse(request.body);
            if (!userId) {
                return reply.status(401).send({
                    success: false,
                    error: {
                        code: 'UNAUTHORIZED',
                        message: 'Authentication required',
                    },
                });
            }
            const result = await preferenceService_1.preferenceService.processUnsubscribe(userId, {
                ...unsubscribeRequest,
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            });
            reply.send(result);
        }
        catch (error) {
            logger.error('Failed to process unsubscribe', { error: error.message });
            reply.status(500).send({
                success: false,
                error: {
                    code: 'UNSUBSCRIBE_FAILED',
                    message: error.message,
                },
            });
        }
    });
    fastify.get('/export', {
        schema: {
            description: 'Export user notification data (GDPR)',
            tags: ['preferences'],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: { type: 'object' },
                    },
                },
                401: { $ref: 'Error' },
                500: { $ref: 'Error' },
            },
        },
    }, async (request, reply) => {
        try {
            const userId = request.user?.id;
            if (!userId) {
                return reply.status(401).send({
                    success: false,
                    error: {
                        code: 'UNAUTHORIZED',
                        message: 'Authentication required',
                    },
                });
            }
            const data = await preferenceService_1.preferenceService.exportUserData(userId);
            reply.send({
                success: true,
                data,
            });
        }
        catch (error) {
            logger.error('Failed to export user data', { error: error.message });
            reply.status(500).send({
                success: false,
                error: {
                    code: 'DATA_EXPORT_FAILED',
                    message: error.message,
                },
            });
        }
    });
    fastify.delete('/data', {
        schema: {
            description: 'Delete user notification data (GDPR right to be forgotten)',
            tags: ['preferences'],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                    },
                },
                401: { $ref: 'Error' },
                500: { $ref: 'Error' },
            },
        },
    }, async (request, reply) => {
        try {
            const userId = request.user?.id;
            if (!userId) {
                return reply.status(401).send({
                    success: false,
                    error: {
                        code: 'UNAUTHORIZED',
                        message: 'Authentication required',
                    },
                });
            }
            const result = await preferenceService_1.preferenceService.deleteUserData(userId);
            reply.send(result);
        }
        catch (error) {
            logger.error('Failed to delete user data', { error: error.message });
            reply.status(500).send({
                success: false,
                error: {
                    code: 'DATA_DELETE_FAILED',
                    message: error.message,
                },
            });
        }
    });
}
//# sourceMappingURL=preferences.js.map