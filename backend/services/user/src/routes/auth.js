"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const logger_1 = require("@fineprintai/shared-logger");
const middleware_1 = require("@fineprintai/shared-middleware");
const auth_1 = require("../services/auth");
const user_1 = require("../services/user");
const email_1 = require("../services/email");
const logger = (0, logger_1.createServiceLogger)('auth-routes');
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    rememberMe: zod_1.z.boolean().default(false),
});
const signupSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8).max(128),
    displayName: zod_1.z.string().min(1).max(100).optional(),
    acceptTerms: zod_1.z.boolean().refine(val => val === true, {
        message: 'You must accept the terms of service',
    }),
});
const resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
const resetPasswordConfirmSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8).max(128),
});
const changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8).max(128),
});
const refreshTokenSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
async function authRoutes(server) {
    const authService = new auth_1.AuthService();
    const userService = new user_1.UserService();
    const emailService = new email_1.EmailService();
    server.post('/signup', {
        schema: {
            tags: ['Authentication'],
            summary: 'User registration',
            description: 'Register a new user account',
            body: {
                type: 'object',
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8, maxLength: 128 },
                    displayName: { type: 'string', minLength: 1, maxLength: 100 },
                    acceptTerms: { type: 'boolean' },
                },
                required: ['email', 'password', 'acceptTerms'],
            },
            response: {
                201: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                user: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        email: { type: 'string' },
                                        displayName: { type: 'string', nullable: true },
                                        emailVerified: { type: 'boolean' },
                                    },
                                },
                                tokens: {
                                    type: 'object',
                                    properties: {
                                        accessToken: { type: 'string' },
                                        refreshToken: { type: 'string' },
                                        expiresIn: { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                },
                400: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                        message: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const body = signupSchema.parse(request.body);
        try {
            const existingUser = await userService.getUserByEmail(body.email);
            if (existingUser) {
                return reply.status(400).send({
                    success: false,
                    error: 'EMAIL_ALREADY_EXISTS',
                    message: 'An account with this email already exists',
                });
            }
            const passwordHash = await bcryptjs_1.default.hash(body.password, 12);
            const user = await userService.createUser({
                email: body.email,
                passwordHash,
                displayName: body.displayName || null,
            });
            const tokens = (0, middleware_1.generateTokens)({
                sub: user.id,
                email: user.email,
                role: 'user',
                subscriptionTier: user.subscriptionTier,
                teamId: user.teamId || undefined,
            });
            await authService.createSession({
                userId: user.id,
                sessionToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                deviceInfo: {
                    userAgent: request.headers['user-agent'],
                },
                ipAddress: request.ip,
                expiresAt: new Date(tokens.expiresIn * 1000),
            });
            await emailService.sendVerificationEmail(user.email, user.displayName || 'User');
            logger.info('User registered successfully', {
                userId: user.id,
                email: user.email,
                ip: request.ip,
            });
            return reply.status(201).send({
                success: true,
                data: {
                    user: {
                        id: user.id,
                        email: user.email,
                        displayName: user.displayName,
                        emailVerified: user.emailVerified,
                        subscriptionTier: user.subscriptionTier,
                        createdAt: user.createdAt,
                    },
                    tokens,
                },
            });
        }
        catch (error) {
            logger.error('Failed to register user', { error, email: body.email });
            throw error;
        }
    });
    server.post('/login', {
        schema: {
            tags: ['Authentication'],
            summary: 'User login',
            description: 'Authenticate user and return access tokens',
            body: {
                type: 'object',
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    rememberMe: { type: 'boolean', default: false },
                },
                required: ['email', 'password'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                user: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        email: { type: 'string' },
                                        displayName: { type: 'string', nullable: true },
                                        subscriptionTier: { type: 'string' },
                                    },
                                },
                                tokens: {
                                    type: 'object',
                                    properties: {
                                        accessToken: { type: 'string' },
                                        refreshToken: { type: 'string' },
                                        expiresIn: { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                },
                401: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                        message: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const body = loginSchema.parse(request.body);
        try {
            const user = await userService.getUserByEmail(body.email);
            if (!user || !user.passwordHash) {
                return reply.status(401).send({
                    success: false,
                    error: 'INVALID_CREDENTIALS',
                    message: 'Invalid email or password',
                });
            }
            const isValidPassword = await bcryptjs_1.default.compare(body.password, user.passwordHash);
            if (!isValidPassword) {
                logger.security('Failed login attempt', {
                    email: body.email,
                    ip: request.ip,
                    reason: 'invalid_password',
                });
                return reply.status(401).send({
                    success: false,
                    error: 'INVALID_CREDENTIALS',
                    message: 'Invalid email or password',
                });
            }
            if (user.status !== 'active') {
                return reply.status(401).send({
                    success: false,
                    error: 'ACCOUNT_SUSPENDED',
                    message: 'Your account has been suspended',
                });
            }
            const tokens = (0, middleware_1.generateTokens)({
                sub: user.id,
                email: user.email,
                role: 'user',
                subscriptionTier: user.subscriptionTier,
                teamId: user.teamId || undefined,
            });
            await authService.createSession({
                userId: user.id,
                sessionToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                deviceInfo: {
                    userAgent: request.headers['user-agent'],
                },
                ipAddress: request.ip,
                expiresAt: new Date(tokens.expiresIn * 1000),
            });
            await userService.updateLoginStats(user.id);
            logger.info('User logged in successfully', {
                userId: user.id,
                email: user.email,
                ip: request.ip,
            });
            return reply.send({
                success: true,
                data: {
                    user: {
                        id: user.id,
                        email: user.email,
                        displayName: user.displayName,
                        subscriptionTier: user.subscriptionTier,
                        emailVerified: user.emailVerified,
                    },
                    tokens,
                },
            });
        }
        catch (error) {
            logger.error('Failed to login user', { error, email: body.email });
            throw error;
        }
    });
    server.post('/refresh', {
        schema: {
            tags: ['Authentication'],
            summary: 'Refresh access token',
            description: 'Generate new access token using refresh token',
            body: {
                type: 'object',
                properties: {
                    refreshToken: { type: 'string' },
                },
                required: ['refreshToken'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                accessToken: { type: 'string' },
                                refreshToken: { type: 'string' },
                                expiresIn: { type: 'number' },
                            },
                        },
                    },
                },
                401: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                        message: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const body = refreshTokenSchema.parse(request.body);
        try {
            const result = await authService.refreshToken(body.refreshToken);
            if (!result) {
                return reply.status(401).send({
                    success: false,
                    error: 'INVALID_REFRESH_TOKEN',
                    message: 'Invalid or expired refresh token',
                });
            }
            return reply.send({
                success: true,
                data: result.tokens,
            });
        }
        catch (error) {
            logger.error('Failed to refresh token', { error });
            throw error;
        }
    });
    server.post('/logout', {
        preHandler: [middleware_1.authenticateToken],
        schema: {
            tags: ['Authentication'],
            summary: 'User logout',
            description: 'Invalidate user session and tokens',
            security: [{ bearerAuth: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        try {
            const authHeader = request.headers.authorization;
            const token = authHeader?.split(' ')[1];
            if (token) {
                await authService.invalidateSession(user.id, token);
            }
            logger.info('User logged out', { userId: user.id });
            return reply.send({
                success: true,
                message: 'Logged out successfully',
            });
        }
        catch (error) {
            logger.error('Failed to logout user', { error, userId: user.id });
            throw error;
        }
    });
    server.post('/logout-all', {
        preHandler: [middleware_1.authenticateToken],
        schema: {
            tags: ['Authentication'],
            summary: 'Logout all sessions',
            description: 'Invalidate all user sessions across all devices',
            security: [{ bearerAuth: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        try {
            await authService.invalidateAllSessions(user.id);
            logger.info('All sessions invalidated', { userId: user.id });
            return reply.send({
                success: true,
                message: 'All sessions logged out successfully',
            });
        }
        catch (error) {
            logger.error('Failed to logout all sessions', { error, userId: user.id });
            throw error;
        }
    });
    server.post('/reset-password', {
        schema: {
            tags: ['Authentication'],
            summary: 'Request password reset',
            description: 'Send password reset email to user',
            body: {
                type: 'object',
                properties: {
                    email: { type: 'string', format: 'email' },
                },
                required: ['email'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const body = resetPasswordSchema.parse(request.body);
        try {
            const user = await userService.getUserByEmail(body.email);
            if (user) {
                const resetToken = await authService.createPasswordResetToken(user.id);
                await emailService.sendPasswordResetEmail(user.email, user.displayName || 'User', resetToken);
                logger.info('Password reset requested', {
                    userId: user.id,
                    email: user.email,
                    ip: request.ip,
                });
            }
            return reply.send({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent',
            });
        }
        catch (error) {
            logger.error('Failed to process password reset', { error, email: body.email });
            throw error;
        }
    });
    server.post('/reset-password/confirm', {
        schema: {
            tags: ['Authentication'],
            summary: 'Confirm password reset',
            description: 'Reset password using reset token',
            body: {
                type: 'object',
                properties: {
                    token: { type: 'string' },
                    newPassword: { type: 'string', minLength: 8, maxLength: 128 },
                },
                required: ['token', 'newPassword'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                    },
                },
                400: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                        message: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const body = resetPasswordConfirmSchema.parse(request.body);
        try {
            const userId = await authService.validatePasswordResetToken(body.token);
            if (!userId) {
                return reply.status(400).send({
                    success: false,
                    error: 'INVALID_TOKEN',
                    message: 'Invalid or expired reset token',
                });
            }
            const passwordHash = await bcryptjs_1.default.hash(body.newPassword, 12);
            await userService.updatePassword(userId, passwordHash);
            await authService.invalidateAllSessions(userId);
            logger.info('Password reset completed', { userId, ip: request.ip });
            return reply.send({
                success: true,
                message: 'Password has been reset successfully',
            });
        }
        catch (error) {
            logger.error('Failed to reset password', { error });
            throw error;
        }
    });
    server.post('/change-password', {
        preHandler: [middleware_1.authenticateToken],
        schema: {
            tags: ['Authentication'],
            summary: 'Change password',
            description: 'Change user password (requires current password)',
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                properties: {
                    currentPassword: { type: 'string' },
                    newPassword: { type: 'string', minLength: 8, maxLength: 128 },
                },
                required: ['currentPassword', 'newPassword'],
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                    },
                },
                400: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                        message: { type: 'string' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        const body = changePasswordSchema.parse(request.body);
        try {
            const userRecord = await userService.getUserById(user.id);
            if (!userRecord?.passwordHash) {
                return reply.status(400).send({
                    success: false,
                    error: 'INVALID_REQUEST',
                    message: 'Unable to change password',
                });
            }
            const isValidPassword = await bcryptjs_1.default.compare(body.currentPassword, userRecord.passwordHash);
            if (!isValidPassword) {
                return reply.status(400).send({
                    success: false,
                    error: 'INVALID_PASSWORD',
                    message: 'Current password is incorrect',
                });
            }
            const passwordHash = await bcryptjs_1.default.hash(body.newPassword, 12);
            await userService.updatePassword(user.id, passwordHash);
            logger.info('Password changed', { userId: user.id });
            return reply.send({
                success: true,
                message: 'Password changed successfully',
            });
        }
        catch (error) {
            logger.error('Failed to change password', { error, userId: user.id });
            throw error;
        }
    });
}
//# sourceMappingURL=auth.js.map