"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticationService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const config_1 = require("@fineprintai/shared-config");
const logger = (0, logger_1.createServiceLogger)('auth-service');
class AuthenticationService {
    initialized = false;
    jwtSecret;
    tokenBlacklist = new Set();
    constructor() {
        this.jwtSecret = config_1.config.jwt.secret;
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            await this.loadTokenBlacklist();
            this.startTokenCleanup();
            this.initialized = true;
            logger.info('Authentication service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize authentication service', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            await this.saveTokenBlacklist();
            this.initialized = false;
            logger.info('Authentication service shut down successfully');
        }
        catch (error) {
            logger.error('Error during authentication service shutdown', { error });
        }
    }
    async authenticateSocket(socket) {
        try {
            const token = this.extractToken(socket);
            if (!token) {
                throw new Error('Authentication token required');
            }
            if (this.tokenBlacklist.has(token)) {
                throw new Error('Token has been revoked');
            }
            const decoded = await this.verifyToken(token);
            await this.validateUser(decoded.userId);
            socket.userId = decoded.userId;
            socket.userEmail = decoded.email;
            socket.userName = decoded.name || decoded.email;
            socket.teamId = decoded.teamId;
            socket.isAdmin = this.hasAdminRole(decoded.roles);
            await this.cacheAuthContext(socket.id, {
                userId: decoded.userId,
                email: decoded.email,
                name: decoded.name,
                teamId: decoded.teamId,
                isAdmin: socket.isAdmin,
                roles: decoded.roles || [],
                permissions: decoded.permissions || [],
            });
            logger.debug('Socket authenticated successfully', {
                userId: decoded.userId,
                email: decoded.email,
                socketId: socket.id,
                teamId: decoded.teamId,
                isAdmin: socket.isAdmin,
            });
        }
        catch (error) {
            logger.warn('Socket authentication failed', {
                error: error.message,
                socketId: socket.id,
                ip: socket.handshake.address,
            });
            throw error;
        }
    }
    async validatePermission(socketId, requiredPermission) {
        try {
            const authContext = await this.getAuthContext(socketId);
            if (!authContext) {
                return false;
            }
            if (authContext.isAdmin) {
                return true;
            }
            return authContext.permissions.includes(requiredPermission);
        }
        catch (error) {
            logger.error('Error validating permission', { error, socketId, requiredPermission });
            return false;
        }
    }
    async validateRole(socketId, requiredRole) {
        try {
            const authContext = await this.getAuthContext(socketId);
            if (!authContext) {
                return false;
            }
            if (authContext.isAdmin) {
                return true;
            }
            return authContext.roles.includes(requiredRole);
        }
        catch (error) {
            logger.error('Error validating role', { error, socketId, requiredRole });
            return false;
        }
    }
    async validateTeamAccess(socketId, targetTeamId) {
        try {
            const authContext = await this.getAuthContext(socketId);
            if (!authContext) {
                return false;
            }
            if (authContext.isAdmin) {
                return true;
            }
            return authContext.teamId === targetTeamId;
        }
        catch (error) {
            logger.error('Error validating team access', { error, socketId, targetTeamId });
            return false;
        }
    }
    async validateResourceAccess(socketId, resourceType, resourceId) {
        try {
            const authContext = await this.getAuthContext(socketId);
            if (!authContext) {
                return false;
            }
            if (authContext.isAdmin) {
                return true;
            }
            switch (resourceType) {
                case 'document':
                    return await this.validateDocumentAccess(authContext.userId, resourceId);
                case 'analysis':
                    return await this.validateAnalysisAccess(authContext.userId, resourceId);
                case 'user':
                    return authContext.userId === resourceId;
                case 'team':
                    return authContext.teamId === resourceId;
                default:
                    logger.warn('Unknown resource type for access validation', {
                        resourceType,
                        resourceId,
                        userId: authContext.userId
                    });
                    return false;
            }
        }
        catch (error) {
            logger.error('Error validating resource access', {
                error,
                socketId,
                resourceType,
                resourceId
            });
            return false;
        }
    }
    async revokeToken(token) {
        try {
            this.tokenBlacklist.add(token);
            await this.saveTokenBlacklist();
            logger.info('Token revoked successfully', { tokenHash: this.hashToken(token) });
        }
        catch (error) {
            logger.error('Error revoking token', { error });
            throw error;
        }
    }
    async refreshAuthContext(socketId) {
        try {
            await cache_1.cache.del(`auth:context:${socketId}`);
            return await this.getAuthContext(socketId);
        }
        catch (error) {
            logger.error('Error refreshing auth context', { error, socketId });
            return null;
        }
    }
    extractToken(socket) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        if (socket.handshake.auth && socket.handshake.auth.token) {
            return socket.handshake.auth.token;
        }
        if (socket.handshake.query && socket.handshake.query.token) {
            return Array.isArray(socket.handshake.query.token)
                ? socket.handshake.query.token[0]
                : socket.handshake.query.token;
        }
        return null;
    }
    async verifyToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, this.jwtSecret);
            if (!decoded.userId && !decoded.sub) {
                throw new Error('Token missing user ID');
            }
            return {
                userId: decoded.userId || decoded.sub,
                email: decoded.email,
                name: decoded.name || decoded.displayName,
                teamId: decoded.teamId,
                roles: decoded.roles || [],
                permissions: decoded.permissions || [],
                exp: decoded.exp,
                iat: decoded.iat,
            };
        }
        catch (error) {
            if (error.name === 'JsonWebTokenError') {
                throw new Error('Invalid token');
            }
            else if (error.name === 'TokenExpiredError') {
                throw new Error('Token expired');
            }
            else if (error.name === 'NotBeforeError') {
                throw new Error('Token not active yet');
            }
            else {
                throw new Error('Token verification failed');
            }
        }
    }
    async validateUser(userId) {
        try {
            const userStatus = await cache_1.cache.get(`user:status:${userId}`);
            if (userStatus === 'inactive' || userStatus === 'suspended') {
                throw new Error('User account is inactive');
            }
            if (userStatus === null) {
                await cache_1.cache.set(`user:status:${userId}`, 'active', 300);
            }
        }
        catch (error) {
            logger.error('Error validating user', { error, userId });
            throw new Error('User validation failed');
        }
    }
    hasAdminRole(roles) {
        if (!roles)
            return false;
        return roles.includes('admin') || roles.includes('super_admin') || roles.includes('system_admin');
    }
    async cacheAuthContext(socketId, context) {
        try {
            await cache_1.cache.set(`auth:context:${socketId}`, context, 3600);
        }
        catch (error) {
            logger.error('Error caching auth context', { error, socketId });
        }
    }
    async getAuthContext(socketId) {
        try {
            return await cache_1.cache.get(`auth:context:${socketId}`);
        }
        catch (error) {
            logger.error('Error getting auth context', { error, socketId });
            return null;
        }
    }
    async validateDocumentAccess(userId, documentId) {
        try {
            const permissions = await cache_1.cache.get(`document:permissions:${documentId}`);
            if (permissions && permissions.users) {
                return permissions.users.includes(userId);
            }
            const userTeam = await cache_1.cache.get(`user:team:${userId}`);
            const documentTeam = await cache_1.cache.get(`document:team:${documentId}`);
            return userTeam && documentTeam && userTeam === documentTeam;
        }
        catch (error) {
            logger.error('Error validating document access', { error, userId, documentId });
            return false;
        }
    }
    async validateAnalysisAccess(userId, analysisId) {
        try {
            const analysisOwner = await cache_1.cache.get(`analysis:owner:${analysisId}`);
            if (analysisOwner === userId) {
                return true;
            }
            const userTeam = await cache_1.cache.get(`user:team:${userId}`);
            const analysisTeam = await cache_1.cache.get(`analysis:team:${analysisId}`);
            return userTeam && analysisTeam && userTeam === analysisTeam;
        }
        catch (error) {
            logger.error('Error validating analysis access', { error, userId, analysisId });
            return false;
        }
    }
    async loadTokenBlacklist() {
        try {
            const blacklist = await cache_1.cache.get('auth:token_blacklist') || [];
            this.tokenBlacklist = new Set(blacklist);
            logger.debug('Token blacklist loaded', { count: this.tokenBlacklist.size });
        }
        catch (error) {
            logger.error('Error loading token blacklist', { error });
        }
    }
    async saveTokenBlacklist() {
        try {
            const blacklistArray = Array.from(this.tokenBlacklist);
            await cache_1.cache.set('auth:token_blacklist', blacklistArray, 86400);
            logger.debug('Token blacklist saved', { count: blacklistArray.length });
        }
        catch (error) {
            logger.error('Error saving token blacklist', { error });
        }
    }
    startTokenCleanup() {
        setInterval(() => {
            this.cleanupExpiredTokens();
        }, 60 * 60 * 1000);
    }
    async cleanupExpiredTokens() {
        try {
            const now = Math.floor(Date.now() / 1000);
            let cleanedCount = 0;
            logger.debug('Token cleanup completed', { cleanedCount });
        }
        catch (error) {
            logger.error('Error during token cleanup', { error });
        }
    }
    hashToken(token) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
    }
}
exports.AuthenticationService = AuthenticationService;
//# sourceMappingURL=authService.js.map