"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const client_1 = require("@prisma/client");
const config_1 = __importDefault(require("./config"));
const logger_1 = require("./utils/logger");
const billing_1 = __importDefault(require("./routes/billing"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const rate_limit_1 = require("./middleware/rate-limit");
const morgan_1 = __importDefault(require("morgan"));
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", "https://api.stripe.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        const allowedOrigins = [
            process.env.FRONTEND_URL,
            process.env.ADMIN_URL,
            'http://localhost:3000',
            'http://localhost:3001',
        ].filter(Boolean);
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'Stripe-Signature'],
}));
app.use((0, morgan_1.default)('combined', { stream: logger_1.loggerStream }));
app.use(rate_limit_1.rateLimitMiddleware);
app.use('/webhooks', webhooks_1.default);
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.get('/health', async (req, res) => {
    try {
        await prisma.$queryRaw `SELECT 1`;
        res.json({
            success: true,
            service: 'billing-service',
            version: process.env.npm_package_version || '1.0.0',
            timestamp: new Date().toISOString(),
            environment: config_1.default.NODE_ENV,
            database: 'connected',
        });
    }
    catch (error) {
        logger_1.logger.error('Health check failed', { error });
        res.status(503).json({
            success: false,
            service: 'billing-service',
            error: 'Service unhealthy',
            timestamp: new Date().toISOString(),
        });
    }
});
app.use('/api/billing', billing_1.default);
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl,
    });
});
app.use((error, req, res, next) => {
    logger_1.logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userId: req.user?.userId,
    });
    const isDevelopment = config_1.default.NODE_ENV === 'development';
    res.status(error.status || 500).json({
        success: false,
        error: isDevelopment ? error.message : 'Internal server error',
        ...(isDevelopment && { stack: error.stack }),
    });
});
const PORT = parseInt(config_1.default.PORT);
const server = app.listen(PORT, '0.0.0.0', async () => {
    logger_1.logger.info('Billing service started', {
        port: PORT,
        environment: config_1.default.NODE_ENV,
        nodeVersion: process.version,
    });
    try {
        await prisma.$connect();
        logger_1.logger.info('Database connected successfully');
    }
    catch (error) {
        logger_1.logger.error('Database connection failed', { error });
        process.exit(1);
    }
});
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
async function gracefulShutdown(signal) {
    logger_1.logger.info(`Received ${signal}, starting graceful shutdown`);
    server.close(async () => {
        logger_1.logger.info('HTTP server closed');
        try {
            await prisma.$disconnect();
            logger_1.logger.info('Database disconnected');
            process.exit(0);
        }
        catch (error) {
            logger_1.logger.error('Error during shutdown', { error });
            process.exit(1);
        }
    });
    setTimeout(() => {
        logger_1.logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
}
process.on('uncaughtException', (error) => {
    logger_1.logger.error('Uncaught exception', { error });
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.logger.error('Unhandled rejection', { reason, promise });
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=index.js.map