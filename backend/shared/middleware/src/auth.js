"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMFATokens = exports.generateTokens = exports.optionalAuth = exports.requireSubscription = exports.requireRole = exports.authenticateApiKey = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("@fineprintai/config");
const types_1 = require("@fineprintai/types");
const security_1 = require("@fineprintai/security");
const authenticateToken = async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        await security_1.auditLogger.logAuth('login', '', request, false, {
            reason: 'missing_token',
            ip: security_1.SecurityUtils.extractClientIP(request)
        });
        throw new types_1.UnauthorizedError('Access token is required');
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.auth.jwt.secret);
        if (decoded.type !== 'access') {
            await security_1.auditLogger.logAuth('login', decoded.sub || '', request, false, {
                reason: 'invalid_token_type',
                tokenType: decoded.type
            });
            throw new types_1.UnauthorizedError('Invalid token type');
        }
        const mfaRequired = security_1.mfaService.shouldRequireMFA({
            userId: decoded.sub,
            ipAddress: security_1.SecurityUtils.extractClientIP(request),
            userAgent: request.headers['user-agent'] || '',
            isNewDevice: true,
            isHighRiskAction: false,
            suspiciousActivity: false
        });
        if (mfaRequired && !decoded.mfaVerified) {
            await security_1.auditLogger.logAuth('mfa', decoded.sub, request, false, {
                reason: 'mfa_required'
            });
            throw new types_1.UnauthorizedError('MFA verification required');
        }
        request.user = {
            id: decoded.sub,
            email: decoded.email,
            role: decoded.role,
            subscriptionTier: decoded.subscriptionTier,
            teamId: decoded.teamId,
        };
        await security_1.auditLogger.logAuth('login', decoded.sub, request, true);
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            await security_1.auditLogger.logAuth('login', '', request, false, {
                reason: 'invalid_token',
                error: error.message
            });
            throw new types_1.UnauthorizedError('Invalid access token');
        }
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            await security_1.auditLogger.logAuth('login', '', request, false, {
                reason: 'token_expired'
            });
            throw new types_1.UnauthorizedError('Access token has expired');
        }
        throw error;
    }
};
exports.authenticateToken = authenticateToken;
const authenticateApiKey = async (request, reply) => {
    const apiKey = request.headers['x-api-key'];
    if (!apiKey) {
        throw new types_1.UnauthorizedError('API key is required');
    }
    throw new Error('API key authentication not yet implemented');
};
exports.authenticateApiKey = authenticateApiKey;
const requireRole = (allowedRoles) => {
    return async (request, reply) => {
        const user = request.user;
        if (!user) {
            throw new types_1.UnauthorizedError('Authentication required');
        }
        if (!allowedRoles.includes(user.role)) {
            throw new types_1.ForbiddenError('Insufficient permissions');
        }
    };
};
exports.requireRole = requireRole;
const requireSubscription = (requiredTiers) => {
    return async (request, reply) => {
        const user = request.user;
        if (!user) {
            throw new types_1.UnauthorizedError('Authentication required');
        }
        if (!requiredTiers.includes(user.subscriptionTier)) {
            throw new types_1.ForbiddenError('Subscription upgrade required');
        }
    };
};
exports.requireSubscription = requireSubscription;
const optionalAuth = async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.auth.jwt.secret);
        if (decoded.type === 'access') {
            request.user = {
                id: decoded.sub,
                email: decoded.email,
                role: decoded.role,
                subscriptionTier: decoded.subscriptionTier,
                teamId: decoded.teamId,
            };
        }
    }
    catch (error) {
        request.log.warn('Invalid token provided for optional auth', { error: error.message });
    }
};
exports.optionalAuth = optionalAuth;
const generateTokens = (payload) => {
    const now = Math.floor(Date.now() / 1000);
    const jti = security_1.SecurityUtils.generateUUID();
    const accessToken = jsonwebtoken_1.default.sign({
        ...payload,
        type: 'access',
        iat: now,
        jti,
        mfaVerified: false
    }, config_1.config.auth.jwt.secret, {
        expiresIn: config_1.config.auth.jwt.accessExpiry,
        algorithm: config_1.config.auth.jwt.algorithm,
        issuer: 'fineprintai.com',
        audience: 'fineprintai-api'
    });
    const refreshToken = jsonwebtoken_1.default.sign({
        sub: payload.sub,
        type: 'refresh',
        iat: now,
        jti: security_1.SecurityUtils.generateUUID()
    }, config_1.config.auth.jwt.secret, {
        expiresIn: config_1.config.auth.jwt.refreshExpiry,
        algorithm: config_1.config.auth.jwt.algorithm,
        issuer: 'fineprintai.com',
        audience: 'fineprintai-api'
    });
    return {
        accessToken,
        refreshToken,
        expiresIn: jsonwebtoken_1.default.decode(accessToken)?.exp || 0,
    };
};
exports.generateTokens = generateTokens;
const generateMFATokens = (payload, mfaVerified = false) => {
    const tokens = (0, exports.generateTokens)(payload);
    if (mfaVerified) {
        const decoded = jsonwebtoken_1.default.decode(tokens.accessToken);
        const updatedToken = jsonwebtoken_1.default.sign({
            ...decoded,
            mfaVerified: true,
            mfaTimestamp: Math.floor(Date.now() / 1000)
        }, config_1.config.auth.jwt.secret, {
            expiresIn: config_1.config.auth.jwt.accessExpiry,
            algorithm: config_1.config.auth.jwt.algorithm,
            issuer: 'fineprintai.com',
            audience: 'fineprintai-api'
        });
        tokens.accessToken = updatedToken;
    }
    return tokens;
};
exports.generateMFATokens = generateMFATokens;
//# sourceMappingURL=auth.js.map