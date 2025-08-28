"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuthMiddleware = exports.requireSubscriptionTier = exports.adminMiddleware = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const config_1 = __importDefault(require("../config"));
const logger_1 = require("../utils/logger");
const prisma = new client_1.PrismaClient();
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Missing or invalid authorization header',
            });
        }
        const token = authHeader.substring(7);
        const decoded = jsonwebtoken_1.default.verify(token, config_1.default.JWT_SECRET);
        if (!decoded.userId) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token payload',
            });
        }
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                email: true,
                subscriptionTier: true,
                status: true,
            },
        });
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found',
            });
        }
        if (user.status !== 'active') {
            return res.status(403).json({
                success: false,
                error: 'Account is not active',
            });
        }
        req.user = {
            userId: user.id,
            email: user.email,
            subscriptionTier: user.subscriptionTier,
            isAdmin: decoded.isAdmin || false,
        };
        next();
    }
    catch (error) {
        logger_1.logger.error('Authentication failed', { error });
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token',
            });
        }
        res.status(500).json({
            success: false,
            error: 'Authentication error',
        });
    }
};
exports.authMiddleware = authMiddleware;
const adminMiddleware = (req, res, next) => {
    if (!req.user?.isAdmin) {
        return res.status(403).json({
            success: false,
            error: 'Admin privileges required',
        });
    }
    next();
};
exports.adminMiddleware = adminMiddleware;
const requireSubscriptionTier = (requiredTiers) => {
    return (req, res, next) => {
        const userTier = req.user?.subscriptionTier;
        if (!userTier || !requiredTiers.includes(userTier)) {
            return res.status(403).json({
                success: false,
                error: `This feature requires one of the following subscription tiers: ${requiredTiers.join(', ')}`,
                requiredTiers,
                currentTier: userTier,
            });
        }
        next();
    };
};
exports.requireSubscriptionTier = requireSubscriptionTier;
const optionalAuthMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }
        const token = authHeader.substring(7);
        const decoded = jsonwebtoken_1.default.verify(token, config_1.default.JWT_SECRET);
        if (decoded.userId) {
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: {
                    id: true,
                    email: true,
                    subscriptionTier: true,
                    status: true,
                },
            });
            if (user && user.status === 'active') {
                req.user = {
                    userId: user.id,
                    email: user.email,
                    subscriptionTier: user.subscriptionTier,
                    isAdmin: decoded.isAdmin || false,
                };
            }
        }
        next();
    }
    catch (error) {
        next();
    }
};
exports.optionalAuthMiddleware = optionalAuthMiddleware;
exports.default = exports.authMiddleware;
//# sourceMappingURL=auth.js.map