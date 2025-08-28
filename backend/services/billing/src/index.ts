import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';
import config from './config';
import { logger, loggerStream } from './utils/logger';
import billingRoutes from './routes/billing';
import webhookRoutes from './routes/webhooks';
import { rateLimitMiddleware } from './middleware/rate-limit';
import morgan from 'morgan';

const app = express();
const prisma = new PrismaClient();

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

// Security headers
app.use(helmet({
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

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests from frontend and admin domains
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
      'http://localhost:3000',
      'http://localhost:3001',
    ].filter(Boolean);

    // Allow requests with no origin (mobile apps, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'Stripe-Signature'],
}));

// Request logging
app.use(morgan('combined', { stream: loggerStream }));

// Global rate limiting
app.use(rateLimitMiddleware);

// Body parsing (except for webhooks)
app.use('/webhooks', webhookRoutes); // Webhooks need raw body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      success: true,
      service: 'billing-service',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      environment: config.NODE_ENV,
      database: 'connected',
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      success: false,
      service: 'billing-service',
      error: 'Service unhealthy',
      timestamp: new Date().toISOString(),
    });
  }
});

// =============================================================================
// API ROUTES
// =============================================================================

app.use('/api/billing', billingRoutes);

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
  });
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userId: (req as any).user?.userId,
  });

  // Don't leak error details in production
  const isDevelopment = config.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    success: false,
    error: isDevelopment ? error.message : 'Internal server error',
    ...(isDevelopment && { stack: error.stack }),
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

const PORT = parseInt(config.PORT);

const server = app.listen(PORT, '0.0.0.0', async () => {
  logger.info('Billing service started', {
    port: PORT,
    environment: config.NODE_ENV,
    nodeVersion: process.version,
  });

  // Initialize database connection
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Database connection failed', { error });
    process.exit(1);
  }
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  // Stop accepting new requests
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Close database connection
      await prisma.$disconnect();
      logger.info('Database disconnected');

      // Exit process
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

export default app;