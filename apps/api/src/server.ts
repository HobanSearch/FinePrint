import Fastify, { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'

// Database and Cache Clients
import { Client as PgClient } from 'pg'
import Redis from 'ioredis'
import { QdrantClient } from '@qdrant/js-client-rest'

// Services and Utilities
import { promisify } from 'util'
import { createHash } from 'crypto'
import { pino } from 'pino'
import { DSPyService } from './services/dspy'
import { LoRAService } from './services/lora'
import { LeaderboardService } from './services/leaderboard'
import { DataAggregationService } from './services/dataAggregation'
import { RegulatoryIntelligenceService } from './services/regulatoryIntelligence'
import { SOC2ComplianceService } from './services/soc2Compliance'
import { DocumentProcessingService } from './services/documentProcessing'
import { ChangeDetectionService } from './services/changeDetection'
import { RegulatoryIntelligenceEngine } from './services/regulatoryEngine'
import { ComplianceMonitoringService } from './services/complianceMonitoring'
import { RealTimeMonitoringService } from './services/realTimeMonitoring'
import { AppStoreService } from './services/appstore'

// Types
interface DatabaseConnections {
  postgres: PgClient
  redis: Redis
  qdrant: QdrantClient
}

interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded'
  lastCheck: Date
  latency?: number
  error?: string
}

// Global metrics store
interface Metrics {
  requests: number
  errors: number
  latency: number[]
  connections: number
  dbQueries: number
  cacheHits: number
  cacheMisses: number
}

const metrics: Metrics = {
  requests: 0,
  errors: 0,
  latency: [],
  connections: 0,
  dbQueries: 0,
  cacheHits: 0,
  cacheMisses: 0
}

// Service health tracking
const serviceHealth = new Map<string, ServiceHealth>()

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    } : undefined,
  },
  trustProxy: true,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId'
})

// Initialize database connections and AI services
let db: DatabaseConnections
let dspyService: DSPyService
let loraService: LoRAService
let leaderboardService: LeaderboardService
let dataAggregationService: DataAggregationService
let regulatoryIntelligenceService: RegulatoryIntelligenceService
let soc2ComplianceService: SOC2ComplianceService
let documentProcessingService: DocumentProcessingService
let changeDetectionService: ChangeDetectionService
let regulatoryEngine: RegulatoryIntelligenceEngine
let complianceMonitoringService: ComplianceMonitoringService
let realTimeMonitoringService: RealTimeMonitoringService
let appStoreService: AppStoreService

async function initializeDatabases(): Promise<DatabaseConnections> {
  const postgres = new PgClient({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  })

  const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    checkCompatibility: false,
  })

  // Test connections
  await postgres.connect()
  await redis.connect()
  
  // Initialize AI services
  dspyService = new DSPyService(postgres, process.env.OLLAMA_URL)
  loraService = new LoRAService(postgres, process.env.OLLAMA_URL)
  leaderboardService = new LeaderboardService(postgres)
  appStoreService = new AppStoreService(postgres)
  
  // Initialize leaderboard data
  await leaderboardService.initializePublicWebsites()
  await leaderboardService.seedPopularWebsites()

  // Initialize data aggregation service
  dataAggregationService = new DataAggregationService(postgres)
  await dataAggregationService.initializeDataAggregation()
  await dataAggregationService.seedPopularWebsitesForMonitoring()

  // Initialize regulatory intelligence service
  regulatoryIntelligenceService = new RegulatoryIntelligenceService(postgres)
  await regulatoryIntelligenceService.initializeRegulatoryIntelligence()
  await regulatoryIntelligenceService.seedJurisdictions()
  await regulatoryIntelligenceService.seedRegulatoryRequirements()
  await regulatoryIntelligenceService.seedCompanyJurisdictions()

  // Initialize SOC2 compliance service
  soc2ComplianceService = new SOC2ComplianceService(postgres)
  await soc2ComplianceService.initializeSOC2Compliance()
  await soc2ComplianceService.seedSOC2Controls()

  // Initialize document processing service
  documentProcessingService = new DocumentProcessingService(postgres)
  await documentProcessingService.initializeDocumentProcessing()

  // Initialize change detection service
  changeDetectionService = new ChangeDetectionService(postgres)
  await changeDetectionService.initializeChangeDetection()

  // Initialize regulatory intelligence engine
  regulatoryEngine = new RegulatoryIntelligenceEngine(postgres)
  await regulatoryEngine.initializeRegulatoryEngine()
  await regulatoryEngine.seedMonitoringSources()

  // Initialize compliance monitoring service
  complianceMonitoringService = new ComplianceMonitoringService(postgres)
  await complianceMonitoringService.initializeComplianceMonitoring()

  // Initialize real-time monitoring service
  realTimeMonitoringService = new RealTimeMonitoringService(postgres)
  await realTimeMonitoringService.initializeMonitoring()
  
  // Initialize app store data
  await appStoreService.initializeAppStoreTables()
  
  fastify.log.info('Database connections, AI services, leaderboard, data aggregation, regulatory intelligence, SOC2 compliance, document processing, change detection, regulatory engine, and compliance monitoring initialized')
  
  return { postgres, redis, qdrant }
}

// Security middleware
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
})

// JWT Authentication
await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'dev-secret',
  sign: {
    expiresIn: '1h'
  }
})

// Rate limiting
await fastify.register(rateLimit, {
  max: parseInt(process.env.RATE_LIMIT_REQUESTS || '1000'),
  timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '3600') * 1000,
  skipSuccessfulRequests: true,
})

// WebSocket support
await fastify.register(websocket)

// Multipart form support
await fastify.register(multipart, {
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  }
})

// Register CORS
await fastify.register(cors, {
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3003'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id']
})

// Middleware for request metrics
fastify.addHook('onRequest', async (request, reply) => {
  metrics.requests++
  request.startTime = Date.now()
})

fastify.addHook('onResponse', async (request, reply) => {
  const latency = Date.now() - (request.startTime || Date.now())
  metrics.latency.push(latency)
  
  // Keep only last 1000 latency measurements
  if (metrics.latency.length > 1000) {
    metrics.latency = metrics.latency.slice(-1000)
  }
  
  if (reply.statusCode >= 400) {
    metrics.errors++
  }
})

// Error handler
fastify.setErrorHandler(async (error, request, reply) => {
  metrics.errors++
  
  fastify.log.error({
    error: error.message,
    stack: error.stack,
    reqId: request.id,
    url: request.url,
    method: request.method
  }, 'Request error')

  const statusCode = error.statusCode || 500
  const message = statusCode === 500 ? 'Internal Server Error' : error.message

  return reply.status(statusCode).send({
    error: {
      message,
      statusCode,
      reqId: request.id,
      timestamp: new Date().toISOString()
    }
  })
})

// Register Swagger
await fastify.register(swagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'Fine Print AI API',
      description: 'AI-powered legal document analysis platform with microservices architecture',
      version: '0.1.0',
      contact: {
        name: 'Fine Print AI Team'
      }
    },
    servers: [
      {
        url: 'http://localhost:8000',
        description: 'Development server',
      },
      {
        url: 'https://api.fineprintai.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
})

await fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
    displayOperationId: true,
    filter: true
  },
  uiHooks: {
    onRequest: function (request, reply, next) {
      next()
    },
    preHandler: function (request, reply, next) {
      next()
    }
  },
  staticCSP: true,
  transformStaticCSP: (header) => header
})

// Authentication middleware
const authenticate = async (request: any, reply: any) => {
  try {
    await request.jwtVerify()
    
    // Check if token is blacklisted
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (token) {
      const isBlacklisted = await db.redis.get(`blacklist:${token}`)
      if (isBlacklisted) {
        // Log blacklisted token usage attempt for SOC2 compliance
        await soc2ComplianceService.logAccess({
          user_id: request.user?.userId || null,
          user_email: request.user?.email || 'unknown',
          action: 'blacklisted_token_usage',
          resource: 'authentication',
          ip_address: request.ip,
          user_agent: request.headers['user-agent'] || '',
          result: 'blocked',
          risk_score: 80,
          session_id: request.id,
          additional_context: { reason: 'token_blacklisted' }
        }).catch(() => {}) // Don't fail if logging fails
        
        return reply.status(401).send({ error: 'Token has been revoked' })
      }
    }
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' })
  }
}

// Optional authentication middleware
const optionalAuthenticate = async (request: any, reply: any) => {
  try {
    await request.jwtVerify()
  } catch (err) {
    // Continue without authentication
  }
}

// Service health check functions
async function checkDatabaseHealth(): Promise<ServiceHealth> {
  const start = Date.now()
  try {
    if (!db?.postgres) throw new Error('Database not initialized')
    await db.postgres.query('SELECT 1')
    metrics.dbQueries++
    
    return {
      status: 'healthy',
      lastCheck: new Date(),
      latency: Date.now() - start
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      lastCheck: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function checkRedisHealth(): Promise<ServiceHealth> {
  const start = Date.now()
  try {
    if (!db?.redis) throw new Error('Redis not initialized')
    await db.redis.ping()
    
    return {
      status: 'healthy',
      lastCheck: new Date(),
      latency: Date.now() - start
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      lastCheck: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function checkQdrantHealth(): Promise<ServiceHealth> {
  const start = Date.now()
  try {
    if (!db?.qdrant) throw new Error('Qdrant not initialized')
    await db.qdrant.getCollections()
    
    return {
      status: 'healthy',
      lastCheck: new Date(),
      latency: Date.now() - start
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      lastCheck: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

async function checkOllamaHealth(): Promise<ServiceHealth> {
  const start = Date.now()
  try {
    const response = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/tags`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    
    return {
      status: 'healthy',
      lastCheck: new Date(),
      latency: Date.now() - start
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      lastCheck: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Health check endpoint
fastify.get('/health', {
  schema: {
    description: 'Basic health check endpoint',
    tags: ['monitoring'],
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          timestamp: { type: 'string' },
          uptime: { type: 'number' },
          version: { type: 'string' },
          pid: { type: 'number' },
          memory: {
            type: 'object',
            properties: {
              used: { type: 'number' },
              total: { type: 'number' },
              free: { type: 'number' }
            }
          }
        },
      },
    },
  },
}, async (request, reply) => {
  const memUsage = process.memoryUsage()
  
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '0.1.0',
    pid: process.pid,
    memory: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024),
      total: Math.round(memUsage.heapTotal / 1024 / 1024),
      free: Math.round((memUsage.heapTotal - memUsage.heapUsed) / 1024 / 1024)
    }
  }
})

// Comprehensive readiness check endpoint
fastify.get('/ready', {
  schema: {
    description: 'Comprehensive readiness check with service dependencies',
    tags: ['monitoring'],
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          timestamp: { type: 'string' },
          services: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                latency: { type: 'number' },
                lastCheck: { type: 'string' },
                error: { type: 'string' }
              }
            }
          },
          metrics: {
            type: 'object',
            properties: {
              requests: { type: 'number' },
              errors: { type: 'number' },
              avgLatency: { type: 'number' }
            }
          }
        },
      },
      503: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          timestamp: { type: 'string' },
          services: { type: 'object' }
        }
      }
    },
  },
}, async (request, reply) => {
  const healthChecks = await Promise.allSettled([
    checkDatabaseHealth(),
    checkRedisHealth(),
    checkQdrantHealth(),
    checkOllamaHealth()
  ])

  const services = {
    postgres: healthChecks[0].status === 'fulfilled' ? healthChecks[0].value : { status: 'unhealthy', error: 'Check failed' },
    redis: healthChecks[1].status === 'fulfilled' ? healthChecks[1].value : { status: 'unhealthy', error: 'Check failed' },
    qdrant: healthChecks[2].status === 'fulfilled' ? healthChecks[2].value : { status: 'unhealthy', error: 'Check failed' },
    ollama: healthChecks[3].status === 'fulfilled' ? healthChecks[3].value : { status: 'unhealthy', error: 'Check failed' }
  }

  // Update service health cache
  Object.entries(services).forEach(([service, health]) => {
    serviceHealth.set(service, health as ServiceHealth)
  })

  const allHealthy = Object.values(services).every(s => s.status === 'healthy')
  const avgLatency = metrics.latency.length > 0 
    ? metrics.latency.reduce((a, b) => a + b, 0) / metrics.latency.length 
    : 0

  const response = {
    status: allHealthy ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    services,
    metrics: {
      requests: metrics.requests,
      errors: metrics.errors,
      avgLatency: Math.round(avgLatency)
    }
  }

  const statusCode = allHealthy ? 200 : 503
  return reply.status(statusCode).send(response)
})

// Authentication endpoints
fastify.post('/api/auth/login', {
  schema: {
    description: 'User login',
    tags: ['authentication'],
    body: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 6 }
      },
      required: ['email', 'password']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          refreshToken: { type: 'string' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              name: { type: 'string' }
            }
          }
        }
      },
      401: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { email, password } = request.body as any
  
  try {
    // Implement proper authentication with database lookup and password hashing
    const userQuery = `
      SELECT id, email, password_hash, role, status, failed_login_attempts, locked_until
      FROM users 
      WHERE email = $1
    `
    const userResult = await db.postgres.query(userQuery, [email])
    
    if (userResult.rows.length === 0) {
      // Log failed authentication attempt for SOC2 compliance
      await soc2ComplianceService.logAccess({
        user_id: null,
        user_email: email,
        action: 'login_attempt',
        resource: 'authentication',
        ip_address: request.ip,
        user_agent: request.headers['user-agent'] || '',
        result: 'failure',
        risk_score: 75,
        session_id: request.id,
        additional_context: { reason: 'user_not_found' }
      })
      
      return reply.status(401).send({ error: 'Invalid credentials' })
    }
    
    const user = userResult.rows[0]
    
    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await soc2ComplianceService.logAccess({
        user_id: user.id,
        user_email: email,
        action: 'login_attempt',
        resource: 'authentication',
        ip_address: request.ip,
        user_agent: request.headers['user-agent'] || '',
        result: 'blocked',
        risk_score: 90,
        session_id: request.id,
        additional_context: { reason: 'account_locked' }
      })
      
      return reply.status(423).send({ error: 'Account temporarily locked due to failed login attempts' })
    }
    
    // Verify password (would use bcrypt in production)
    const bcrypt = require('bcrypt')
    const isValidPassword = await bcrypt.compare(password, user.password_hash).catch(() => false)
    
    if (!isValidPassword) {
      // Increment failed login attempts
      const newFailedAttempts = (user.failed_login_attempts || 0) + 1
      let lockUntil = null
      
      if (newFailedAttempts >= 5) {
        lockUntil = new Date(Date.now() + 30 * 60 * 1000) // Lock for 30 minutes
      }
      
      await db.postgres.query(`
        UPDATE users 
        SET failed_login_attempts = $1, locked_until = $2, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $3
      `, [newFailedAttempts, lockUntil, user.id])
      
      // Log failed authentication attempt
      await soc2ComplianceService.logAccess({
        user_id: user.id,
        user_email: email,
        action: 'login_attempt',
        resource: 'authentication',
        ip_address: request.ip,
        user_agent: request.headers['user-agent'] || '',
        result: 'failure',
        risk_score: newFailedAttempts >= 3 ? 85 : 65,
        session_id: request.id,
        additional_context: { 
          reason: 'invalid_password',
          failed_attempts: newFailedAttempts,
          account_locked: lockUntil !== null
        }
      })
      
      return reply.status(401).send({ error: 'Invalid credentials' })
    }
    
    // Reset failed login attempts on successful login
    await db.postgres.query(`
      UPDATE users 
      SET failed_login_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [user.id])
    
    // Generate tokens
    const token = fastify.jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      { expiresIn: '1h' }
    )
    
    const refreshToken = fastify.jwt.sign(
      { userId: user.id, type: 'refresh' },
      { expiresIn: '30d' }
    )
    
    // Log successful authentication
    await soc2ComplianceService.logAccess({
      user_id: user.id,
      user_email: email,
      action: 'login_success',
      resource: 'authentication',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'] || '',
      result: 'success',
      risk_score: 10,
      session_id: request.id,
      additional_context: { role: user.role }
    })
    
    return {
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.display_name || user.email
      }
    }
  } catch (error) {
    fastify.log.error('Authentication error:', error)
    
    // Log system error for SOC2 compliance
    await soc2ComplianceService.logAccess({
      user_id: null,
      user_email: email || 'unknown',
      action: 'login_error',
      resource: 'authentication',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'] || '',
      result: 'failure',
      risk_score: 50,
      session_id: request.id,
      additional_context: { error: 'system_error' }
    }).catch(() => {}) // Don't fail if logging fails
    
    return reply.status(500).send({ error: 'Authentication system error' })
  }
})

fastify.post('/api/auth/refresh', {
  schema: {
    description: 'Refresh JWT token',
    tags: ['authentication'],
    body: {
      type: 'object',
      properties: {
        refreshToken: { type: 'string' }
      },
      required: ['refreshToken']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          token: { type: 'string' }
        }
      },
      401: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { refreshToken } = request.body as any
  
  try {
    const decoded = fastify.jwt.verify(refreshToken) as any
    
    if (decoded.type !== 'refresh') {
      return reply.status(401).send({ error: 'Invalid refresh token' })
    }
    
    const newToken = fastify.jwt.sign(
      { userId: decoded.userId, role: 'admin' },
      { expiresIn: '1h' }
    )
    
    return { token: newToken }
  } catch (error) {
    return reply.status(401).send({ error: 'Invalid refresh token' })
  }
})

fastify.post('/api/auth/logout', {
  preHandler: authenticate,
  schema: {
    description: 'User logout',
    tags: ['authentication'],
    security: [{ bearerAuth: [] }],
    response: {
      200: {
        type: 'object',
        properties: {
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const user = (request as any).user
    const token = request.headers.authorization?.replace('Bearer ', '')
    
    if (token) {
      // Add token to blacklist in Redis with expiration matching token expiry
      const decoded = fastify.jwt.decode(token) as any
      const tokenExpiry = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600 // 1 hour default
      
      if (tokenExpiry > 0) {
        await db.redis.setex(`blacklist:${token}`, tokenExpiry, 'true')
      }
      
      // Log logout event for SOC2 compliance
      await soc2ComplianceService.logAccess({
        user_id: user.userId,
        user_email: user.email,
        action: 'logout',
        resource: 'authentication',
        ip_address: request.ip,
        user_agent: request.headers['user-agent'] || '',
        result: 'success',
        risk_score: 5,
        session_id: request.id,
        additional_context: { token_blacklisted: true }
      })
    }
    
    return { message: 'Logged out successfully' }
  } catch (error) {
    fastify.log.error('Logout error:', error)
    return reply.status(500).send({ error: 'Logout failed' })
  }
})

// User endpoints
fastify.get('/api/user/profile', {
  preHandler: authenticate,
  schema: {
    description: 'Get user profile',
    tags: ['user'],
    security: [{ bearerAuth: [] }],
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
          name: { type: 'string' },
          createdAt: { type: 'string' },
          preferences: { type: 'object' }
        }
      }
    }
  }
}, async (request, reply) => {
  const user = (request as any).user
  
  return {
    id: user.userId,
    email: user.email,
    name: 'Admin User',
    createdAt: new Date().toISOString(),
    preferences: {
      notifications: true,
      theme: 'light'
    }
  }
})

// In-memory analysis store (in production, this would be in database)
interface AnalysisJob {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  documentText?: string
  documentUrl?: string
  documentType: 'tos' | 'privacy' | 'contract' | 'agreement'
  userId: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  progress: number
  serviceInfo?: {
    name: string
    domain: string
    contentHash?: string
  }
  result?: {
    overallRiskScore: number
    executiveSummary: string
    keyFindings: string[]
    recommendations: string[]
    findings: Array<{
      id: string
      category: string
      title: string
      description: string
      severity: 'low' | 'medium' | 'high' | 'critical'
      confidenceScore: number
    }>
  }
}

const analysisStore = new Map<string, AnalysisJob>()

// Add sample analysis for demonstration
analysisStore.set('analysis_1', {
  id: 'analysis_1',
  status: 'completed',
  documentType: 'tos',
  userId: '1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  progress: 100,
  result: {
    overallRiskScore: 75,
    executiveSummary: 'This document contains several high-risk clauses that require attention.',
    keyFindings: [
      'Broad liability limitations',
      'Automatic renewal clause',
      'Restrictive termination terms'
    ],
    recommendations: [
      'Review liability limitations',
      'Negotiate termination clauses',
      'Add user data protection terms'
    ],
    findings: [
      {
        id: 'finding_1',
        category: 'liability',
        title: 'Broad Liability Limitation',
        description: 'The service provider limits liability to an unreasonable extent.',
        severity: 'high',
        confidenceScore: 0.95
      }
    ]
  }
})

// Function to simulate analysis processing
function simulateAnalysisProcessing(analysisId: string) {
  const analysis = analysisStore.get(analysisId)
  if (!analysis) return
  
  // Step 1: Processing
  analysis.status = 'processing'
  analysis.progress = 25
  analysis.updatedAt = new Date().toISOString()
  analysisStore.set(analysisId, analysis)
  
  setTimeout(() => {
    const analysis = analysisStore.get(analysisId)
    if (!analysis) return
    
    // Step 2: More processing
    analysis.progress = 75
    analysis.updatedAt = new Date().toISOString()
    analysisStore.set(analysisId, analysis)
    
    setTimeout(async () => {
      const analysis = analysisStore.get(analysisId)
      if (!analysis) return
      
      // Step 3: Complete
      analysis.status = 'completed'
      analysis.progress = 100
      analysis.completedAt = new Date().toISOString()
      analysis.updatedAt = new Date().toISOString()
      
      // Run real AI analysis using DSPy + LoRA pipeline
      const text = analysis.documentText || analysis.documentUrl || ''
      const aiResult = await runAIAnalysis(analysisId, text)
      
      analysis.result = {
        overallRiskScore: aiResult.riskScore,
        executiveSummary: aiResult.summary || `Analysis completed. Found ${aiResult.findings.length} potential issues with an overall risk score of ${aiResult.riskScore}%.`,
        keyFindings: aiResult.findings.map(f => f.title),
        recommendations: aiResult.recommendations || [
          'Review all highlighted clauses carefully',
          'Consider negotiating problematic terms',
          'Consult with legal counsel for high-risk items'
        ],
        findings: aiResult.findings
      }
      
      analysisStore.set(analysisId, analysis)
      
      // Update service risk score if this was a URL analysis
      if (analysis.documentUrl && analysis.serviceInfo && db?.postgres) {
        try {
          const updateRiskQuery = `
            UPDATE services 
            SET risk_score = $1, last_analyzed = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE domain = $2 AND url = $3
          `
          await db.postgres.query(updateRiskQuery, [
            riskScore, 
            analysis.serviceInfo.domain, 
            analysis.documentUrl
          ])
          
          fastify.log.info('Updated service risk score', {
            analysisId,
            domain: analysis.serviceInfo.domain,
            riskScore
          })
        } catch (error) {
          fastify.log.warn('Failed to update service risk score', { 
            error, 
            analysisId, 
            domain: analysis.serviceInfo?.domain 
          })
        }
      }
      
      // In production, would emit WebSocket event here
      console.log(`Analysis ${analysisId} completed with risk score ${riskScore}`)
      
    }, 2000) // 2 seconds for final processing
  }, 2000) // 2 seconds for initial processing
}

function calculateMockRiskScore(text: string): number {
  let score = 30 // Base score (30%)
  
  // Check for risky terms
  const riskyTerms = [
    'automatic renewal', 'auto-renew', 'automatically renew',
    'jury trial', 'waive', 'binding arbitration',
    'liability', 'not liable', 'exclude liability',
    'termination', 'terminate', 'suspend',
    'intellectual property', 'license', 'perpetual'
  ]
  
  riskyTerms.forEach(term => {
    if (text.toLowerCase().includes(term)) {
      score += 10 // Add 10 points per risky term
    }
  })
  
  return Math.min(score, 95) // Cap at 95%
}

function generateMockFindings(text: string): Array<{
  id: string
  category: string
  title: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  confidenceScore: number
}> {
  const findings = []
  let findingId = 1
  
  if (text.toLowerCase().includes('automatic renewal') || text.toLowerCase().includes('auto-renew')) {
    findings.push({
      id: `finding_${findingId++}`,
      category: 'subscription',
      title: 'Automatic Renewal Clause',
      description: 'The document contains automatic renewal terms that may make cancellation difficult.',
      severity: 'high' as const,
      confidenceScore: 0.9
    })
  }
  
  if (text.toLowerCase().includes('jury trial') || text.toLowerCase().includes('arbitration')) {
    findings.push({
      id: `finding_${findingId++}`,
      category: 'legal_rights',
      title: 'Waiver of Legal Rights',
      description: 'The document may waive your right to jury trial or class action lawsuits.',
      severity: 'critical' as const,
      confidenceScore: 0.85
    })
  }
  
  if (text.toLowerCase().includes('liability') || text.toLowerCase().includes('not liable')) {
    findings.push({
      id: `finding_${findingId++}`,
      category: 'liability',
      title: 'Broad Liability Limitation',
      description: 'The service provider limits their liability in broad terms.',
      severity: 'medium' as const,
      confidenceScore: 0.8
    })
  }
  
  return findings
}

// Function to extract service information from URL
function extractServiceInfo(url: string): { name: string; domain: string } {
  try {
    const urlObj = new URL(url)
    const domain = urlObj.hostname.replace('www.', '')
    
    // Map common domains to service names
    const serviceMap: { [key: string]: string } = {
      'github.com': 'GitHub',
      'google.com': 'Google',
      'facebook.com': 'Facebook',
      'twitter.com': 'Twitter',
      'instagram.com': 'Instagram',
      'linkedin.com': 'LinkedIn',
      'microsoft.com': 'Microsoft',
      'apple.com': 'Apple',
      'amazon.com': 'Amazon',
      'netflix.com': 'Netflix',
      'spotify.com': 'Spotify',
      'zoom.us': 'Zoom',
      'slack.com': 'Slack',
      'discord.com': 'Discord',
      'reddit.com': 'Reddit',
      'youtube.com': 'YouTube',
      'paypal.com': 'PayPal',
      'stripe.com': 'Stripe',
      'dropbox.com': 'Dropbox'
    }
    
    const serviceName = serviceMap[domain] || 
                       domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1)
    
    return { name: serviceName, domain }
  } catch (error) {
    return { name: 'Unknown Service', domain: 'unknown' }
  }
}

// Function to generate content hash for change detection  
function generateContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

// Real AI analysis using DSPy + LoRA pipeline
async function runAIAnalysis(analysisId: string, text: string): Promise<any> {
  try {
    // Step 1: LoRA routing to select best adapters
    const routingDecision = await loraService.routeRequest(analysisId, text, 'legal_analysis')
    
    let aiResult: any = {}
    
    if (routingDecision.selected_adapters.length > 0) {
      // Step 2: Run inference with selected LoRA adapters
      aiResult = await loraService.runInference(routingDecision.selected_adapters, text)
    }
    
    // Step 3: Fallback to DSPy module if LoRA fails or no adapters selected
    if (!aiResult.risk_score && !aiResult.riskScore) {
      try {
        // Try to get the main legal analysis DSPy module
        const legalModuleId = await getOrCreateLegalAnalysisModule()
        aiResult = await dspyService.runInference(legalModuleId, { document_text: text })
      } catch (dspyError) {
        fastify.log.warn('DSPy inference failed, using enhanced fallback', { analysisId, error: dspyError })
        aiResult = await enhancedFallbackAnalysis(text)
      }
    }
    
    // Step 4: Normalize the result format
    const normalizedResult = normalizeAIResult(aiResult)
    
    // Step 5: Add training data for continuous learning
    if (dspyService && normalizedResult.riskScore > 0) {
      try {
        const legalModuleId = await getOrCreateLegalAnalysisModule()
        await dspyService.addTrainingExample(
          legalModuleId,
          { document_text: text },
          {
            risk_score: normalizedResult.riskScore,
            findings: normalizedResult.findings,
            recommendations: normalizedResult.recommendations,
            summary: normalizedResult.summary
          }
        )
      } catch (trainingError) {
        fastify.log.warn('Failed to add training example', { analysisId, error: trainingError })
      }
    }
    
    fastify.log.info('AI analysis completed', { 
      analysisId, 
      riskScore: normalizedResult.riskScore,
      findingsCount: normalizedResult.findings.length,
      adaptersUsed: aiResult.adapters_used?.length || 0
    })
    
    return normalizedResult
    
  } catch (error) {
    fastify.log.error('AI analysis failed, using fallback', { analysisId, error })
    return await enhancedFallbackAnalysis(text)
  }
}

// Get or create the main legal analysis DSPy module
async function getOrCreateLegalAnalysisModule(): Promise<string> {
  try {
    // Try to get existing module
    const query = 'SELECT id FROM dspy_modules WHERE name = $1 AND status = $2'
    const result = await db.postgres.query(query, ['Legal Document Analyzer', 'deployed'])
    
    if (result.rows.length > 0) {
      return result.rows[0].id
    }
    
    // Create new module if not exists
    const moduleId = await dspyService.createModule({
      name: 'Legal Document Analyzer',
      module_type: 'analyzer',
      description: 'Main DSPy module for analyzing legal documents and identifying problematic clauses',
      signature_definition: {
        input_fields: ['document_text'],
        output_fields: ['risk_score', 'findings', 'recommendations', 'summary'],
        instructions: 'Analyze legal documents to identify problematic clauses, assess risk levels, and provide actionable recommendations.'
      },
      optimization_config: {
        optimizer: 'MIPROv2',
        max_bootstrapped_demos: 20,
        max_labeled_demos: 100,
        num_candidate_programs: 10,
        num_threads: 4
      },
      status: 'draft'
    })
    
    // Initialize with some basic training data
    const initialTrainingData = getInitialTrainingData()
    if (initialTrainingData.length > 0) {
      await dspyService.startOptimization(
        moduleId,
        initialTrainingData.slice(0, 16), // Training set
        initialTrainingData.slice(16, 20)  // Validation set
      )
    }
    
    return moduleId
    
  } catch (error) {
    fastify.log.error('Failed to get/create legal analysis module', { error })
    throw error
  }
}

// Get initial training data for the legal analysis module
function getInitialTrainingData() {
  return [
    {
      input: { document_text: "You agree to binding arbitration and waive your right to a jury trial. We may terminate your account at any time without notice." },
      output: {
        risk_score: 85,
        findings: [
          {
            id: "finding_1",
            category: "legal_rights",
            title: "Jury Trial Waiver",
            description: "The agreement waives your constitutional right to a jury trial",
            severity: "critical",
            confidence: 0.95
          },
          {
            id: "finding_2", 
            category: "termination",
            title: "Arbitrary Termination",
            description: "Service can be terminated without notice or cause",
            severity: "high",
            confidence: 0.9
          }
        ],
        recommendations: ["Negotiate jury trial clause", "Seek notice period for termination"],
        summary: "This agreement contains critical legal rights waivers and unfair termination clauses."
      }
    },
    {
      input: { document_text: "We automatically renew your subscription and charge your payment method unless you cancel 30 days before renewal." },
      output: {
        risk_score: 65,
        findings: [
          {
            id: "finding_1",
            category: "billing",
            title: "Automatic Renewal",
            description: "Subscription automatically renews with difficult cancellation requirements",
            severity: "medium",
            confidence: 0.85
          }
        ],
        recommendations: ["Set calendar reminder to cancel if needed", "Review cancellation process"],
        summary: "Standard automatic renewal with reasonable notice period."
      }
    },
    {
      input: { document_text: "We collect minimal data necessary to provide our service and never sell your personal information to third parties." },
      output: {
        risk_score: 25,
        findings: [],
        recommendations: ["Review what constitutes 'minimal data'", "Verify third-party sharing policy"],
        summary: "Privacy-friendly policy with reasonable data collection practices."
      }
    },
    {
      input: { document_text: "You grant us a perpetual, irrevocable, worldwide license to use any content you upload, even after account deletion." },
      output: {
        risk_score: 90,
        findings: [
          {
            id: "finding_1",
            category: "intellectual_property",
            title: "Perpetual Content License",
            description: "You permanently give up rights to your uploaded content",
            severity: "critical",
            confidence: 0.98
          }
        ],
        recommendations: ["Avoid uploading valuable intellectual property", "Negotiate content rights clause"],
        summary: "Extremely problematic intellectual property clause that permanently transfers your content rights."
      }
    }
  ]
}

// Normalize AI result to consistent format
function normalizeAIResult(aiResult: any): any {
  // Handle different result formats from LoRA vs DSPy
  const riskScore = aiResult.risk_score || aiResult.riskScore || aiResult.overallRiskScore || 50
  const findings = aiResult.findings || []
  const recommendations = aiResult.recommendations || ['Review document carefully']
  const summary = aiResult.summary || aiResult.executiveSummary || 'Analysis completed'
  
  // Ensure findings have required fields
  const normalizedFindings = findings.map((finding: any, index: number) => ({
    id: finding.id || `finding_${index + 1}`,
    category: finding.category || 'general',
    title: finding.title || 'Issue detected',
    description: finding.description || 'Potential issue found in document',
    severity: finding.severity || 'medium',
    confidenceScore: finding.confidence || finding.confidenceScore || 0.8
  }))
  
  return {
    riskScore: Math.min(95, Math.max(5, Math.round(riskScore))), // Ensure 5-95 range
    findings: normalizedFindings,
    recommendations: Array.isArray(recommendations) ? recommendations : [recommendations],
    summary: summary,
    aiMetadata: {
      adapters_used: aiResult.adapters_used || [],
      fallback_used: aiResult.fallback_used || false,
      confidence: aiResult.confidence || 0.8
    }
  }
}

// Enhanced fallback analysis (improved version of mock analysis)
async function enhancedFallbackAnalysis(text: string): Promise<any> {
  const riskScore = calculateMockRiskScore(text)
  const findings = generateMockFindings(text)
  
  return {
    riskScore,
    findings,
    recommendations: [
      'Review all highlighted clauses carefully',
      'Consider consulting with legal counsel',
      'Negotiate problematic terms where possible'
    ],
    summary: `Fallback analysis completed. Identified ${findings.length} potential issues with ${riskScore}% risk score.`,
    fallback_used: true
  }
}

// Analysis endpoints
fastify.get('/api/analysis', {
  preHandler: optionalAuthenticate,
  schema: {
    description: 'Get analysis list with pagination',
    tags: ['analysis'],
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
        documentType: { type: 'string' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          analyses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                status: { type: 'string' },
                documentTitle: { type: 'string' },
                overallRiskScore: { type: 'number' },
                createdAt: { type: 'string' },
                completedAt: { type: 'string' }
              }
            }
          },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
              hasNext: { type: 'boolean' },
              hasPrev: { type: 'boolean' }
            }
          }
        },
      },
    },
  },
}, async (request, reply) => {
  const query = request.query as any
  const user = (request as any).user
  
  // Get analyses from store, filter by user if authenticated
  const allAnalyses = Array.from(analysisStore.values())
  const userAnalyses = user ? allAnalyses.filter(a => a.userId === user.userId) : allAnalyses
  
  // Apply filters
  let filteredAnalyses = userAnalyses
  if (query.status) {
    filteredAnalyses = filteredAnalyses.filter(a => a.status === query.status)
  }
  if (query.documentType) {
    filteredAnalyses = filteredAnalyses.filter(a => a.documentType === query.documentType)
  }
  
  // Sort by creation date (newest first)
  filteredAnalyses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  
  // Pagination
  const page = query.page || 1
  const limit = query.limit || 20
  const total = filteredAnalyses.length
  const totalPages = Math.ceil(total / limit)
  const startIndex = (page - 1) * limit
  const endIndex = startIndex + limit
  const paginatedAnalyses = filteredAnalyses.slice(startIndex, endIndex)
  
  return {
    analyses: paginatedAnalyses.map(analysis => ({
      id: analysis.id,
      status: analysis.status,
      documentTitle: analysis.documentType === 'tos' ? 'Terms of Service' : 
                    analysis.documentType === 'privacy' ? 'Privacy Policy' :
                    analysis.documentType === 'contract' ? 'Contract' : 'Agreement',
      overallRiskScore: analysis.result?.overallRiskScore || null,
      progress: analysis.progress,
      createdAt: analysis.createdAt,
      completedAt: analysis.completedAt
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  }
})

fastify.get('/api/analysis/:id', {
  preHandler: optionalAuthenticate,
  schema: {
    description: 'Get specific analysis by ID',
    tags: ['analysis'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string' },
          documentId: { type: 'string' },
          overallRiskScore: { type: 'number' },
          executiveSummary: { type: 'string' },
          keyFindings: {
            type: 'array',
            items: { type: 'string' }
          },
          recommendations: {
            type: 'array',
            items: { type: 'string' }
          },
          findings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                category: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                severity: { type: 'string' },
                confidenceScore: { type: 'number' }
              }
            }
          },
          createdAt: { type: 'string' },
          completedAt: { type: 'string' }
        }
      },
      404: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { id } = request.params as any
  const user = (request as any).user
  
  // Get analysis from store
  const analysis = analysisStore.get(id)
  
  if (!analysis) {
    return reply.status(404).send({ error: 'Analysis not found' })
  }
  
  // Check if user has access to this analysis (if authenticated)
  if (user && analysis.userId !== user.userId) {
    return reply.status(403).send({ error: 'Access denied' })
  }
  
  // Return analysis data
  const response: any = {
    id: analysis.id,
    status: analysis.status,
    documentType: analysis.documentType,
    progress: analysis.progress,
    createdAt: analysis.createdAt,
    updatedAt: analysis.updatedAt
  }
  
  if (analysis.completedAt) {
    response.completedAt = analysis.completedAt
  }
  
  if (analysis.result) {
    response.overallRiskScore = analysis.result.overallRiskScore
    response.executiveSummary = analysis.result.executiveSummary
    response.keyFindings = analysis.result.keyFindings
    response.recommendations = analysis.result.recommendations
    response.findings = analysis.result.findings
  }
  
  return response
})

fastify.post('/api/analysis', {
  preHandler: authenticate,
  schema: {
    description: 'Start new document analysis',
    tags: ['analysis'],
    security: [{ bearerAuth: [] }],
    body: {
      type: 'object',
      properties: {
        documentUrl: { type: 'string', format: 'uri' },
        documentText: { type: 'string' },
        documentType: { type: 'string', enum: ['tos', 'privacy', 'contract', 'agreement'] },
        analysisType: { type: 'string', enum: ['quick', 'detailed', 'compliance'] },
        options: {
          type: 'object',
          properties: {
            includeRecommendations: { type: 'boolean', default: true },
            focusAreas: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      },
      oneOf: [
        { required: ['documentUrl', 'documentType'] },
        { required: ['documentText', 'documentType'] }
      ]
    },
    response: {
      202: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string' },
          message: { type: 'string' },
          estimatedCompletionTime: { type: 'string' }
        },
      },
      400: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      }
    },
  },
}, async (request, reply) => {
  const body = request.body as any
  const user = (request as any).user
  
  // Generate analysis ID
  const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  // Extract service info for URL analysis
  let serviceInfo: { name: string; domain: string; contentHash?: string } | undefined
  if (body.documentUrl) {
    serviceInfo = extractServiceInfo(body.documentUrl)
    // Generate hash for the URL content (in production, would fetch and hash actual content)
    serviceInfo.contentHash = generateContentHash(body.documentUrl + Date.now())
  }

  // Create analysis job and store it
  const analysisJob: AnalysisJob = {
    id: analysisId,
    status: 'queued',
    documentText: body.documentText,
    documentUrl: body.documentUrl,
    documentType: body.documentType,
    userId: user.userId,
    serviceInfo,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    progress: 0
  }
  
  analysisStore.set(analysisId, analysisJob)
  
  // Auto-track service if URL analysis and user wants monitoring
  if (body.documentUrl && serviceInfo) {
    try {
      // Check if service already exists for this user
      const existingQuery = 'SELECT id FROM services WHERE user_id = $1 AND domain = $2'
      const existingResult = await db.postgres.query(existingQuery, [user.userId, serviceInfo.domain])
      
      if (existingResult.rows.length === 0) {
        // Add new service for monitoring
        const insertQuery = `
          INSERT INTO services (user_id, name, domain, url, terms_hash, notification_enabled, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `
        const insertResult = await db.postgres.query(insertQuery, [
          user.userId, 
          serviceInfo.name, 
          serviceInfo.domain, 
          body.documentUrl, 
          serviceInfo.contentHash,
          true // Enable notifications by default
        ])
        
        fastify.log.info('Auto-tracked service for URL analysis', {
          serviceId: insertResult.rows[0].id,
          analysisId,
          userId: user.userId,
          domain: serviceInfo.domain
        })
      } else {
        // Update existing service with latest analysis info
        await db.postgres.query(
          `UPDATE services SET 
           terms_hash = $1, 
           last_analyzed = CURRENT_TIMESTAMP, 
           updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [serviceInfo.contentHash, existingResult.rows[0].id]
        )
      }
    } catch (error) {
      // Don't fail the analysis if service tracking fails
      fastify.log.warn('Failed to auto-track service', { error, analysisId, domain: serviceInfo.domain })
    }
  }
  
  // Simulate analysis processing (in production, this would be handled by worker)
  setTimeout(() => {
    simulateAnalysisProcessing(analysisId)
  }, 1000)
  
  fastify.log.info('Analysis queued', { 
    analysisId, 
    userId: user.userId, 
    documentType: body.documentType 
  })
  
  return reply.status(202).send({
    id: analysisId,
    status: 'queued',
    message: 'Document analysis has been queued for processing',
    estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  })
})

// WebSocket endpoint for real-time updates
fastify.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    metrics.connections++
    
    connection.socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString())
        
        switch (data.type) {
          case 'subscribe':
            // Subscribe to analysis updates
            connection.socket.send(JSON.stringify({
              type: 'subscribed',
              analysisId: data.analysisId,
              message: 'Subscribed to analysis updates'
            }))
            break
            
          case 'ping':
            connection.socket.send(JSON.stringify({ type: 'pong' }))
            break
            
          default:
            connection.socket.send(JSON.stringify({
              type: 'error',
              message: 'Unknown message type'
            }))
        }
      } catch (error) {
        connection.socket.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }))
      }
    })
    
    connection.socket.on('close', () => {
      metrics.connections--
    })
    
    // Send welcome message
    connection.socket.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to Fine Print AI WebSocket'
    }))
  })
})

// Document upload endpoint
fastify.post('/api/documents/upload', {
  preHandler: authenticate,
  schema: {
    description: 'Upload document for analysis',
    tags: ['documents'],
    security: [{ bearerAuth: [] }],
    consumes: ['multipart/form-data'],
    response: {
      201: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          filename: { type: 'string' },
          size: { type: 'number' },
          contentType: { type: 'string' },
          uploadedAt: { type: 'string' }
        }
      },
      400: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const user = (request as any).user
  
  try {
    const data = await request.file()
    
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' })
    }
    
    const allowedTypes = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.status(400).send({ error: 'Unsupported file type' })
    }
    
    // Save file to storage with proper organization and security
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Create storage directory structure
    const fs = require('fs')
    const path = require('path')
    const crypto = require('crypto')
    
    const uploadDir = process.env.UPLOAD_DIR || './uploads'
    const userDir = path.join(uploadDir, user.userId)
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }
    
    // Generate secure filename with hash to prevent directory traversal
    const fileExtension = path.extname(data.filename || '').toLowerCase()
    const sanitizedName = data.filename?.replace(/[^a-zA-Z0-9.-]/g, '_') || 'document'
    const secureFilename = `${documentId}_${sanitizedName}${fileExtension}`
    const filePath = path.join(userDir, secureFilename)
    
    // Save file buffer with encryption consideration for sensitive documents
    const fileBuffer = await data.file.toBuffer()
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
    
    fs.writeFileSync(filePath, fileBuffer)
    
    // Store document metadata in database
    await db.postgres.query(`
      INSERT INTO documents (
        id, user_id, filename, original_filename, file_path, file_size, 
        content_type, file_hash, uploaded_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, 'uploaded')
    `, [
      documentId,
      user.userId,
      secureFilename,
      data.filename,
      filePath,
      fileBuffer.length,
      data.mimetype,
      fileHash
    ])
    
    // Log document upload for SOC2 compliance
    await soc2ComplianceService.logAccess({
      user_id: user.userId,
      user_email: user.email,
      action: 'document_upload',
      resource: 'documents',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'] || '',
      result: 'success',
      risk_score: 15,
      session_id: request.id,
      additional_context: {
        document_id: documentId,
        filename: data.filename,
        file_size: fileBuffer.length,
        content_type: data.mimetype,
        file_hash: fileHash
      }
    })
    
    fastify.log.info('Document uploaded and stored', {
      documentId,
      userId: user.userId,
      filename: data.filename,
      size: fileBuffer.length,
      contentType: data.mimetype,
      filePath,
      fileHash
    })
    
    return reply.status(201).send({
      id: documentId,
      filename: data.filename,
      size: fileBuffer.length,
      contentType: data.mimetype,
      uploadedAt: new Date().toISOString(),
      hash: fileHash
    })
    
  } catch (error) {
    fastify.log.error('File upload failed', { error, userId: user.userId })
    
    // Log upload failure for SOC2 compliance
    await soc2ComplianceService.logAccess({
      user_id: user.userId,
      user_email: user.email,
      action: 'document_upload',
      resource: 'documents',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'] || '',
      result: 'failure',
      risk_score: 25,
      session_id: request.id,
      additional_context: { error: 'upload_failed' }
    }).catch(() => {}) // Don't fail if logging fails
    
    return reply.status(500).send({ error: 'Upload failed' })
  }
})

// Monitoring endpoints
fastify.get('/api/monitoring/stats', {
  schema: {
    description: 'Get system statistics',
    tags: ['monitoring'],
    response: {
      200: {
        type: 'object',
        properties: {
          requests: { type: 'number' },
          errors: { type: 'number' },
          avgLatency: { type: 'number' },
          connections: { type: 'number' },
          dbQueries: { type: 'number' },
          cacheHits: { type: 'number' },
          cacheMisses: { type: 'number' },
          uptime: { type: 'number' },
          memoryUsage: {
            type: 'object',
            properties: {
              used: { type: 'number' },
              total: { type: 'number' },
              percentage: { type: 'number' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  const memUsage = process.memoryUsage()
  const avgLatency = metrics.latency.length > 0 
    ? metrics.latency.reduce((a, b) => a + b, 0) / metrics.latency.length 
    : 0
    
  return {
    requests: metrics.requests,
    errors: metrics.errors,
    avgLatency: Math.round(avgLatency),
    connections: metrics.connections,
    dbQueries: metrics.dbQueries,
    cacheHits: metrics.cacheHits,
    cacheMisses: metrics.cacheMisses,
    uptime: process.uptime(),
    memoryUsage: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024),
      total: Math.round(memUsage.heapTotal / 1024 / 1024),
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
    }
  }
})

// Prometheus metrics endpoint
fastify.get('/metrics', {
  schema: {
    description: 'Prometheus metrics endpoint',
    tags: ['monitoring'],
  },
}, async (request, reply) => {
  const avgLatency = metrics.latency.length > 0 
    ? metrics.latency.reduce((a, b) => a + b, 0) / metrics.latency.length 
    : 0
    
  const memUsage = process.memoryUsage()
  
  reply.type('text/plain')
  return `# HELP fineprintai_requests_total Total number of requests
# TYPE fineprintai_requests_total counter
fineprintai_requests_total ${metrics.requests}

# HELP fineprintai_errors_total Total number of errors
# TYPE fineprintai_errors_total counter
fineprintai_errors_total ${metrics.errors}

# HELP fineprintai_request_duration_ms Average request duration in milliseconds
# TYPE fineprintai_request_duration_ms gauge
fineprintai_request_duration_ms ${Math.round(avgLatency)}

# HELP fineprintai_connections_active Active WebSocket connections
# TYPE fineprintai_connections_active gauge
fineprintai_connections_active ${metrics.connections}

# HELP fineprintai_db_queries_total Total database queries
# TYPE fineprintai_db_queries_total counter
fineprintai_db_queries_total ${metrics.dbQueries}

# HELP fineprintai_cache_hits_total Total cache hits
# TYPE fineprintai_cache_hits_total counter
fineprintai_cache_hits_total ${metrics.cacheHits}

# HELP fineprintai_cache_misses_total Total cache misses
# TYPE fineprintai_cache_misses_total counter
fineprintai_cache_misses_total ${metrics.cacheMisses}

# HELP fineprintai_memory_usage_bytes Memory usage in bytes
# TYPE fineprintai_memory_usage_bytes gauge
fineprintai_memory_usage_bytes ${memUsage.heapUsed}

# HELP fineprintai_uptime_seconds Process uptime in seconds
# TYPE fineprintai_uptime_seconds gauge
fineprintai_uptime_seconds ${Math.floor(process.uptime())}
`
})

// Ollama LLM integration endpoints
fastify.get('/api/ollama/models', {
  schema: {
    description: 'List available Ollama models',
    tags: ['ai'],
    response: {
      200: {
        type: 'object',
        properties: {
          models: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                size: { type: 'number' },
                modified_at: { type: 'string' }
              }
            }
          }
        }
      },
      503: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const response = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/tags`)
    
    if (!response.ok) {
      return reply.status(503).send({ error: 'Ollama service unavailable' })
    }
    
    const data = await response.json()
    return { models: data.models || [] }
  } catch (error) {
    fastify.log.error('Failed to fetch Ollama models', { error })
    return reply.status(503).send({ error: 'Ollama service unavailable' })
  }
})

fastify.post('/api/ollama/generate', {
  preHandler: authenticate,
  schema: {
    description: 'Generate text using Ollama',
    tags: ['ai'],
    security: [{ bearerAuth: [] }],
    body: {
      type: 'object',
      properties: {
        model: { type: 'string', default: 'llama2' },
        prompt: { type: 'string' },
        system: { type: 'string' },
        options: {
          type: 'object',
          properties: {
            temperature: { type: 'number', minimum: 0, maximum: 2 },
            top_p: { type: 'number', minimum: 0, maximum: 1 },
            max_tokens: { type: 'integer', minimum: 1, maximum: 4096 }
          }
        }
      },
      required: ['model', 'prompt']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          response: { type: 'string' },
          model: { type: 'string' },
          created_at: { type: 'string' },
          done: { type: 'boolean' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { model, prompt, system, options } = request.body as any
  const user = (request as any).user
  
  try {
    const response = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt,
        system,
        stream: false,
        options: {
          temperature: options?.temperature || 0.7,
          top_p: options?.top_p || 0.9,
          num_predict: options?.max_tokens || 1000
        }
      })
    })
    
    if (!response.ok) {
      return reply.status(503).send({ error: 'LLM service unavailable' })
    }
    
    const data = await response.json()
    
    fastify.log.info('LLM generation completed', {
      userId: user.userId,
      model,
      promptLength: prompt.length,
      responseLength: data.response?.length || 0
    })
    
    return data
  } catch (error) {
    fastify.log.error('LLM generation failed', { error, userId: user.userId })
    return reply.status(503).send({ error: 'LLM service unavailable' })
  }
})

// Service tracking endpoints
fastify.get('/api/services', {
  preHandler: authenticate,
  schema: {
    description: 'Get user services for change monitoring',
    tags: ['services'],
    security: [{ bearerAuth: [] }],
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        is_active: { type: 'boolean' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          services: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                domain: { type: 'string' },
                url: { type: 'string' },
                risk_score: { type: 'number' },
                last_analyzed: { type: 'string' },
                last_changed: { type: 'string' },
                is_active: { type: 'boolean' },
                notification_enabled: { type: 'boolean' }
              }
            }
          },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  const query = request.query as any
  const user = (request as any).user
  
  try {
    const page = query.page || 1
    const limit = query.limit || 20
    const offset = (page - 1) * limit
    
    let whereClause = 'WHERE user_id = $1'
    const params = [user.userId]
    
    if (query.is_active !== undefined) {
      whereClause += ` AND is_active = $${params.length + 1}`
      params.push(query.is_active)
    }
    
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM services ${whereClause}`
    const countResult = await db.postgres.query(countQuery, params)
    const total = parseInt(countResult.rows[0].count)
    
    // Get services
    const servicesQuery = `
      SELECT id, name, domain, url, risk_score, last_analyzed, last_changed, 
             is_active, notification_enabled, created_at, updated_at
      FROM services 
      ${whereClause}
      ORDER BY last_analyzed DESC, created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `
    params.push(limit, offset)
    
    const servicesResult = await db.postgres.query(servicesQuery, params)
    
    return {
      services: servicesResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  } catch (error) {
    fastify.log.error('Failed to get services', { error, userId: user.userId })
    return reply.status(500).send({ error: 'Failed to get services' })
  }
})

fastify.post('/api/services', {
  preHandler: authenticate,
  schema: {
    description: 'Add service for change monitoring',
    tags: ['services'],
    security: [{ bearerAuth: [] }],
    body: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        domain: { type: 'string' },
        url: { type: 'string', format: 'uri' },
        notification_enabled: { type: 'boolean', default: true }
      },
      required: ['name', 'domain', 'url']
    },
    response: {
      201: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { name, domain, url, notification_enabled = true } = request.body as any
  const user = (request as any).user
  
  try {
    // Check if service already exists for this user
    const existingQuery = 'SELECT id FROM services WHERE user_id = $1 AND domain = $2'
    const existingResult = await db.postgres.query(existingQuery, [user.userId, domain])
    
    if (existingResult.rows.length > 0) {
      return reply.status(409).send({ error: 'Service already being tracked' })
    }
    
    // Generate initial content hash
    const initialHash = generateContentHash(url + Date.now())
    
    // Insert new service
    const insertQuery = `
      INSERT INTO services (user_id, name, domain, url, terms_hash, notification_enabled, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `
    const insertResult = await db.postgres.query(insertQuery, [
      user.userId, name, domain, url, initialHash, notification_enabled
    ])
    
    const serviceId = insertResult.rows[0].id
    
    fastify.log.info('Service added for monitoring', {
      serviceId,
      userId: user.userId,
      domain
    })
    
    return reply.status(201).send({
      id: serviceId,
      message: 'Service added for change monitoring'
    })
  } catch (error) {
    fastify.log.error('Failed to add service', { error, userId: user.userId })
    return reply.status(500).send({ error: 'Failed to add service' })
  }
})

fastify.put('/api/services/:id', {
  preHandler: authenticate,
  schema: {
    description: 'Update service monitoring settings',
    tags: ['services'],
    security: [{ bearerAuth: [] }],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    body: {
      type: 'object',
      properties: {
        notification_enabled: { type: 'boolean' },
        is_active: { type: 'boolean' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { id } = request.params as any
  const updates = request.body as any
  const user = (request as any).user
  
  try {
    // Verify service belongs to user
    const checkQuery = 'SELECT id FROM services WHERE id = $1 AND user_id = $2'
    const checkResult = await db.postgres.query(checkQuery, [id, user.userId])
    
    if (checkResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Service not found' })
    }
    
    // Build update query
    const updateFields = []
    const params = []
    let paramIndex = 1
    
    if (updates.notification_enabled !== undefined) {
      updateFields.push(`notification_enabled = $${paramIndex++}`)
      params.push(updates.notification_enabled)
    }
    
    if (updates.is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`)
      params.push(updates.is_active)
    }
    
    if (updateFields.length === 0) {
      return reply.status(400).send({ error: 'No valid updates provided' })
    }
    
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`)
    params.push(id, user.userId)
    
    const updateQuery = `
      UPDATE services 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
    `
    
    await db.postgres.query(updateQuery, params)
    
    return { message: 'Service updated successfully' }
  } catch (error) {
    fastify.log.error('Failed to update service', { error, userId: user.userId })
    return reply.status(500).send({ error: 'Failed to update service' })
  }
})

fastify.delete('/api/services/:id', {
  preHandler: authenticate,
  schema: {
    description: 'Remove service from monitoring',
    tags: ['services'],
    security: [{ bearerAuth: [] }],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { id } = request.params as any
  const user = (request as any).user
  
  try {
    const deleteQuery = 'DELETE FROM services WHERE id = $1 AND user_id = $2'
    const result = await db.postgres.query(deleteQuery, [id, user.userId])
    
    if (result.rowCount === 0) {
      return reply.status(404).send({ error: 'Service not found' })
    }
    
    return { message: 'Service removed from monitoring' }
  } catch (error) {
    fastify.log.error('Failed to delete service', { error, userId: user.userId })
    return reply.status(500).send({ error: 'Failed to delete service' })
  }
})

fastify.get('/api/services/:id/changes', {
  preHandler: authenticate,
  schema: {
    description: 'Get service change history',
    tags: ['services'],
    security: [{ bearerAuth: [] }],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          changes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                old_risk_score: { type: 'number' },
                new_risk_score: { type: 'number' },
                change_summary: { type: 'string' },
                detected_at: { type: 'string' },
                notified_at: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  const { id } = request.params as any
  const user = (request as any).user
  
  try {
    // Verify service belongs to user
    const checkQuery = 'SELECT id FROM services WHERE id = $1 AND user_id = $2'
    const checkResult = await db.postgres.query(checkQuery, [id, user.userId])
    
    if (checkResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Service not found' })
    }
    
    // Get change history
    const changesQuery = `
      SELECT id, old_hash, new_hash, old_risk_score, new_risk_score, 
             change_summary, detected_at, notified_at
      FROM service_changes 
      WHERE service_id = $1
      ORDER BY detected_at DESC
      LIMIT 50
    `
    const changesResult = await db.postgres.query(changesQuery, [id])
    
    return {
      changes: changesResult.rows
    }
  } catch (error) {
    fastify.log.error('Failed to get service changes', { error, userId: user.userId })
    return reply.status(500).send({ error: 'Failed to get service changes' })
  }
})

// ============================================================================
// LEADERBOARD API ENDPOINTS
// ============================================================================

// Get top 50 safest websites
fastify.get('/api/leaderboard/top-safe', {
  schema: {
    description: 'Get the top 50 safest websites with lowest risk scores',
    tags: ['leaderboard'],
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rank: { type: 'integer' },
                name: { type: 'string' },
                domain: { type: 'string' },
                risk_score: { type: 'integer' },
                category: { type: 'string' },
                change_from_last_week: { type: 'integer' },
                monthly_visitors: { type: 'integer', nullable: true },
                last_updated: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { limit = 50 } = request.query as { limit?: number }
    const topSafeWebsites = await leaderboardService.getTopSafeWebsites(limit)
    
    return reply.send({
      success: true,
      data: topSafeWebsites
    })
  } catch (error) {
    fastify.log.error('Failed to get top safe websites', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to get top safe websites' 
    })
  }
})

// Get worst offenders (highest risk scores)
fastify.get('/api/leaderboard/worst-offenders', {
  schema: {
    description: 'Get the worst offender websites with highest risk scores',
    tags: ['leaderboard'],
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rank: { type: 'integer' },
                name: { type: 'string' },
                domain: { type: 'string' },
                risk_score: { type: 'integer' },
                category: { type: 'string' },
                change_from_last_week: { type: 'integer' },
                monthly_visitors: { type: 'integer', nullable: true },
                last_updated: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { limit = 50 } = request.query as { limit?: number }
    const worstOffenders = await leaderboardService.getWorstOffenders(limit)
    
    return reply.send({
      success: true,
      data: worstOffenders
    })
  } catch (error) {
    fastify.log.error('Failed to get worst offenders', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to get worst offenders' 
    })
  }
})

// Get available categories
fastify.get('/api/leaderboard/categories', {
  schema: {
    description: 'Get all available website categories with statistics',
    tags: ['leaderboard'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                count: { type: 'integer' },
                avg_risk_score: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const categories = await leaderboardService.getCategories()
    
    return reply.send({
      success: true,
      data: categories
    })
  } catch (error) {
    fastify.log.error('Failed to get categories', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to get categories' 
    })
  }
})

// Get popular websites (most visited/used)
fastify.get('/api/leaderboard/popular-websites', {
  schema: {
    description: 'Get most popular websites ordered by monthly visitors',
    tags: ['leaderboard'],
    querystring: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 50,
          description: 'Number of websites to return'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rank: { type: 'integer' },
                name: { type: 'string' },
                domain: { type: 'string' },
                risk_score: { type: 'integer' },
                category: { type: 'string' },
                change_from_last_week: { type: 'integer' },
                monthly_visitors: { type: 'integer' },
                last_updated: { type: 'string', format: 'date-time' }
              }
            }
          },
          meta: {
            type: 'object',
            properties: {
              total: { type: 'integer' },
              last_updated: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { limit = 50 } = request.query as { limit?: number }
    
    const popularWebsites = await leaderboardService.getPopularWebsites(limit)
    
    return reply.send({
      success: true,
      data: popularWebsites,
      meta: {
        total: popularWebsites.length,
        last_updated: new Date().toISOString()
      }
    })
  } catch (error) {
    fastify.log.error('Failed to get popular websites', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get popular websites'
    })
  }
})

// Get category leaderboard (best or worst in a specific category)
fastify.get('/api/leaderboard/category/:category', {
  schema: {
    description: 'Get leaderboard for a specific category',
    tags: ['leaderboard'],
    params: {
      type: 'object',
      properties: {
        category: { type: 'string' }
      },
      required: ['category']
    },
    querystring: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['best', 'worst'], default: 'best' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rank: { type: 'integer' },
                name: { type: 'string' },
                domain: { type: 'string' },
                risk_score: { type: 'integer' },
                category: { type: 'string' },
                change_from_last_week: { type: 'integer' },
                monthly_visitors: { type: 'integer', nullable: true },
                last_updated: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { category } = request.params as { category: string }
    const { type = 'best', limit = 20 } = request.query as { type?: 'best' | 'worst'; limit?: number }
    
    const categoryLeaderboard = await leaderboardService.getCategoryLeaderboard(
      decodeURIComponent(category), 
      type, 
      limit
    )
    
    return reply.send({
      success: true,
      data: categoryLeaderboard
    })
  } catch (error) {
    fastify.log.error('Failed to get category leaderboard', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to get category leaderboard' 
    })
  }
})

// Get trending websites (biggest changes in risk scores)
fastify.get('/api/leaderboard/trending', {
  schema: {
    description: 'Get websites with the biggest risk score changes',
    tags: ['leaderboard'],
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rank: { type: 'integer' },
                name: { type: 'string' },
                domain: { type: 'string' },
                risk_score: { type: 'integer' },
                category: { type: 'string' },
                change_from_last_week: { type: 'integer' },
                monthly_visitors: { type: 'integer', nullable: true },
                last_updated: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { limit = 10 } = request.query as { limit?: number }
    const trendingWebsites = await leaderboardService.getTrendingWebsites(limit)
    
    return reply.send({
      success: true,
      data: trendingWebsites
    })
  } catch (error) {
    fastify.log.error('Failed to get trending websites', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to get trending websites' 
    })
  }
})

// Get leaderboard statistics
fastify.get('/api/leaderboard/stats', {
  schema: {
    description: 'Get overall leaderboard statistics',
    tags: ['leaderboard'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              total_websites: { type: 'string' },
              avg_risk_score: { type: 'string' },
              min_risk_score: { type: 'string' },
              max_risk_score: { type: 'string' },
              high_risk_count: { type: 'string' },
              low_risk_count: { type: 'string' },
              total_categories: { type: 'string' },
              last_update: { type: 'string', format: 'date-time', nullable: true }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const stats = await leaderboardService.getLeaderboardStats()
    
    return reply.send({
      success: true,
      data: stats
    })
  } catch (error) {
    fastify.log.error('Failed to get leaderboard stats', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to get leaderboard stats' 
    })
  }
})

// Trigger manual analysis for a specific website (admin only)
fastify.post('/api/leaderboard/analyze/:domain', {
  preHandler: [authenticate], // Require authentication
  schema: {
    description: 'Trigger manual analysis for a specific website',
    tags: ['leaderboard'],
    params: {
      type: 'object',
      properties: {
        domain: { type: 'string' }
      },
      required: ['domain']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { domain } = request.params as { domain: string }
    
    // Queue the website for analysis
    await leaderboardService.queueWebsiteAnalysis(decodeURIComponent(domain))
    
    return reply.send({
      success: true,
      message: `Analysis queued for ${domain}`
    })
  } catch (error) {
    fastify.log.error('Failed to queue website analysis', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to queue website analysis' 
    })
  }
})

// Run daily update (background job endpoint)
fastify.post('/api/leaderboard/update', {
  preHandler: [authenticate], // Require authentication  
  schema: {
    description: 'Run daily leaderboard update (background job)',
    tags: ['leaderboard'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    // Run the daily update in the background
    leaderboardService.runDailyUpdate().catch(error => {
      fastify.log.error('Daily update failed', { error })
    })
    
    return reply.send({
      success: true,
      message: 'Daily update started in background'
    })
  } catch (error) {
    fastify.log.error('Failed to start daily update', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to start daily update' 
    })
  }
})

// ============================================================================
// DATA AGGREGATION API ENDPOINTS
// ============================================================================

// Get data quality metrics
fastify.get('/api/data-aggregation/metrics', {
  schema: {
    description: 'Get data quality metrics and training dataset statistics',
    tags: ['data-aggregation'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              total_documents: { type: 'integer' },
              processing_success_rate: { type: 'number' },
              average_quality_score: { type: 'number' },
              label_distribution: { type: 'object' },
              jurisdiction_coverage: { type: 'object' },
              last_updated: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const metrics = await dataAggregationService.getDataQualityMetrics()
    
    return reply.send({
      success: true,
      data: metrics
    })
  } catch (error) {
    fastify.log.error('Failed to get data quality metrics', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get data quality metrics'
    })
  }
})

// Run monitoring cycle manually
fastify.post('/api/data-aggregation/monitor', {
  schema: {
    description: 'Run website monitoring cycle manually',
    tags: ['data-aggregation'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              monitored: { type: 'integer' },
              changes: { type: 'integer' },
              errors: { type: 'integer' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const result = await dataAggregationService.runMonitoringCycle()
    
    return reply.send({
      success: true,
      data: result
    })
  } catch (error) {
    fastify.log.error('Failed to run monitoring cycle', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to run monitoring cycle'
    })
  }
})

// Get unprocessed changes for ML processing
fastify.get('/api/data-aggregation/changes/unprocessed', {
  schema: {
    description: 'Get unprocessed document changes for ML processing',
    tags: ['data-aggregation'],
    querystring: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          default: 100,
          description: 'Number of changes to return'
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                website_id: { type: 'string' },
                document_type: { type: 'string' },
                change_type: { type: 'string' },
                diff_summary: { type: 'string' },
                change_percentage: { type: 'number' },
                detected_at: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { limit = 100 } = request.query as { limit?: number }
    
    const changes = await dataAggregationService.getUnprocessedChanges(limit)
    
    return reply.send({
      success: true,
      data: changes
    })
  } catch (error) {
    fastify.log.error('Failed to get unprocessed changes', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get unprocessed changes'
    })
  }
})

// Mark changes as processed
fastify.post('/api/data-aggregation/changes/mark-processed', {
  schema: {
    description: 'Mark document changes as processed',
    tags: ['data-aggregation'],
    body: {
      type: 'object',
      properties: {
        change_ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Array of change IDs to mark as processed'
        },
        processing_notes: {
          type: 'string',
          description: 'Optional notes about the processing'
        }
      },
      required: ['change_ids']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { change_ids, processing_notes } = request.body as { 
      change_ids: string[], 
      processing_notes?: string 
    }
    
    await dataAggregationService.markChangesProcessed(change_ids, processing_notes)
    
    return reply.send({
      success: true,
      message: `Marked ${change_ids.length} changes as processed`
    })
  } catch (error) {
    fastify.log.error('Failed to mark changes as processed', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to mark changes as processed'
    })
  }
})

// Create training data from changes
fastify.post('/api/data-aggregation/training-data/create', {
  schema: {
    description: 'Create training data from processed document changes',
    tags: ['data-aggregation'],
    body: {
      type: 'object',
      properties: {
        change_ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Array of change IDs to create training data from'
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Labels to apply to the training data'
        },
        severity: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Severity level of the issues found'
        }
      },
      required: ['change_ids', 'labels', 'severity']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              created_count: { type: 'integer' },
              training_data_points: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    content_snippet: { type: 'string' },
                    labels: { type: 'array', items: { type: 'string' } },
                    severity: { type: 'string' },
                    quality_score: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { change_ids, labels, severity } = request.body as { 
      change_ids: string[], 
      labels: string[], 
      severity: 'low' | 'medium' | 'high' | 'critical'
    }
    
    const trainingData = await dataAggregationService.createTrainingDataFromChanges(
      change_ids, 
      labels, 
      severity
    )
    
    return reply.send({
      success: true,
      data: {
        created_count: trainingData.length,
        training_data_points: trainingData
      }
    })
  } catch (error) {
    fastify.log.error('Failed to create training data', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to create training data'
    })
  }
})

// ============================================================================
// SOC2 COMPLIANCE API ENDPOINTS
// ============================================================================


// Get SOC2 controls
fastify.get('/api/soc2/controls', {
  schema: {
    description: 'Get SOC2 controls with filtering options',
    tags: ['soc2-compliance'],
    security: [{ bearerAuth: [] }],
    querystring: {
      type: 'object',
      properties: {
        trust_service_criteria: { type: 'string' },
        implementation_status: { type: 'string' },
        risk_level: { type: 'string' },
        overdue_only: { type: 'boolean' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                control_id: { type: 'string' },
                control_name: { type: 'string' },
                trust_service_criteria: { type: 'string' },
                control_description: { type: 'string' },
                implementation_status: { type: 'string' },
                risk_level: { type: 'string' },
                compliance_score: { type: 'integer' },
                last_tested: { type: 'string', format: 'date-time' },
                next_test_due: { type: 'string', format: 'date-time' },
                automated_testing: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  },
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const query = request.query as any
    let controls: any[]
    
    if (query.overdue_only === true) {
      controls = await soc2ComplianceService.getControlsDueForTesting()
    } else {
      // For now, get all controls (could add filtering later)
      controls = await soc2ComplianceService.getControlsDueForTesting()
    }
    
    return reply.send({
      success: true,
      data: controls
    })
  } catch (error) {
    fastify.log.error('Failed to get SOC2 controls', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get SOC2 controls'
    })
  }
})

// Run automated SOC2 tests
fastify.post('/api/soc2/tests/run', {
  schema: {
    description: 'Run automated SOC2 compliance tests',
    tags: ['soc2-compliance'],
    security: [{ bearerAuth: [] }],
    body: {
      type: 'object',
      properties: {
        control_ids: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              tested: { type: 'integer' },
              passed: { type: 'integer' },
              failed: { type: 'integer' },
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    control_id: { type: 'string' },
                    status: { type: 'string' },
                    findings: { type: 'array', items: { type: 'string' } },
                    recommendations: { type: 'array', items: { type: 'string' } }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const body = request.body as any
    
    // If specific controls are requested, we could implement targeted testing
    // For now, run all automated tests
    const testResults = await soc2ComplianceService.runAutomatedTests()
    
    return reply.send({
      success: true,
      data: {
        tested: testResults.tested,
        passed: testResults.passed,
        failed: testResults.failed,
        results: [] // Could be populated with detailed results
      }
    })
  } catch (error) {
    fastify.log.error('Failed to run SOC2 tests', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to run SOC2 tests'
    })
  }
})

// Collect evidence for SOC2 control
fastify.post('/api/soc2/evidence', {
  schema: {
    description: 'Collect evidence for a SOC2 control',
    tags: ['soc2-compliance'],
    security: [{ bearerAuth: [] }],
    body: {
      type: 'object',
      required: ['control_id', 'evidence_type', 'evidence_name', 'collected_by'],
      properties: {
        control_id: { type: 'string' },
        evidence_type: { 
          type: 'string',
          enum: ['policy', 'procedure', 'screenshot', 'log_file', 'report', 'certificate', 'other']
        },
        evidence_name: { type: 'string' },
        description: { type: 'string' },
        file_path: { type: 'string' },
        collected_by: { type: 'string' },
        retention_period: { type: 'integer', default: 2555 },
        tags: { type: 'array', items: { type: 'string' } }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              evidence_id: { type: 'string' }
            }
          }
        }
      }
    }
  },
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const body = request.body as any
    const user = (request as any).user
    
    const evidenceId = await soc2ComplianceService.collectEvidence({
      control_id: body.control_id,
      evidence_type: body.evidence_type,
      evidence_name: body.evidence_name,
      description: body.description,
      file_path: body.file_path,
      collected_by: body.collected_by || user.email,
      retention_period: body.retention_period || 2555,
      tags: body.tags || []
    })
    
    return reply.send({
      success: true,
      data: { evidence_id: evidenceId }
    })
  } catch (error) {
    fastify.log.error('Failed to collect SOC2 evidence', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to collect SOC2 evidence'
    })
  }
})

// Generate SOC2 compliance report
fastify.get('/api/soc2/reports', {
  schema: {
    description: 'Generate comprehensive SOC2 compliance report',
    tags: ['soc2-compliance'],
    security: [{ bearerAuth: [] }],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              summary: {
                type: 'object',
                properties: {
                  total_controls: { type: 'integer' },
                  implemented_controls: { type: 'integer' },
                  compliance_percentage: { type: 'integer' }
                }
              },
              controls_by_criteria: { type: 'object' },
              recent_audits: { type: 'array' },
              open_incidents: { type: 'array' },
              overdue_controls: { type: 'array' }
            }
          }
        }
      }
    }
  },
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const report = await soc2ComplianceService.generateComplianceReport()
    
    return reply.send({
      success: true,
      data: report
    })
  } catch (error) {
    fastify.log.error('Failed to generate SOC2 compliance report', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to generate SOC2 compliance report'
    })
  }
})

// Create security incident
fastify.post('/api/soc2/incidents', {
  schema: {
    description: 'Create a new SOC2 security incident',
    tags: ['soc2-compliance'],
    security: [{ bearerAuth: [] }],
    body: {
      type: 'object',
      required: ['title', 'description', 'severity', 'reporter'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        severity: { 
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical']
        },
        affected_controls: { type: 'array', items: { type: 'string' } },
        impact_assessment: { type: 'string' },
        root_cause: { type: 'string' },
        remediation_actions: { type: 'array', items: { type: 'string' } },
        reporter: { type: 'string' },
        assignee: { type: 'string' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              incident_id: { type: 'string' }
            }
          }
        }
      }
    }
  },
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const body = request.body as any
    const user = (request as any).user
    
    const incidentId = await soc2ComplianceService.createSecurityIncident({
      title: body.title,
      description: body.description,
      severity: body.severity,
      affected_controls: body.affected_controls || [],
      impact_assessment: body.impact_assessment,
      root_cause: body.root_cause,
      remediation_actions: body.remediation_actions || [],
      incident_status: 'open',
      resolved_at: null,
      reporter: body.reporter || user.email,
      assignee: body.assignee
    })
    
    return reply.send({
      success: true,
      data: { incident_id: incidentId }
    })
  } catch (error) {
    fastify.log.error('Failed to create SOC2 security incident', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to create SOC2 security incident'
    })
  }
})

// Log access event for SOC2 monitoring
fastify.post('/api/soc2/access-logs', {
  schema: {
    description: 'Log access events for SOC2 compliance monitoring',
    tags: ['soc2-compliance'],
    security: [{ bearerAuth: [] }],
    body: {
      type: 'object',
      required: ['action', 'resource', 'result'],
      properties: {
        user_id: { type: 'string' },
        user_email: { type: 'string' },
        action: { type: 'string' },
        resource: { type: 'string' },
        ip_address: { type: 'string' },
        user_agent: { type: 'string' },
        result: { 
          type: 'string',
          enum: ['success', 'failure', 'blocked']
        },
        risk_score: { type: 'integer', minimum: 0, maximum: 100 },
        session_id: { type: 'string' },
        additional_context: { type: 'object' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  },
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const body = request.body as any
    const user = (request as any).user
    
    await soc2ComplianceService.logAccess({
      user_id: body.user_id || user.userId,
      user_email: body.user_email || user.email,
      action: body.action,
      resource: body.resource,
      ip_address: body.ip_address || request.ip,
      user_agent: body.user_agent || request.headers['user-agent'] || '',
      result: body.result,
      risk_score: body.risk_score || 0,
      session_id: body.session_id || request.id,
      additional_context: body.additional_context || {}
    })
    
    return reply.send({
      success: true,
      message: 'Access event logged successfully'
    })
  } catch (error) {
    fastify.log.error('Failed to log SOC2 access event', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to log SOC2 access event'
    })
  }
})

// Get evidence for a control or all evidence
fastify.get('/api/soc2/evidence', {
  schema: {
    description: 'Get SOC2 evidence with filtering options',
    tags: ['soc2-compliance'],
    security: [{ bearerAuth: [] }],
    querystring: {
      type: 'object',
      properties: {
        control_id: { type: 'string' },
        evidence_type: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              evidence: { type: 'array' },
              total: { type: 'integer' },
              has_more: { type: 'boolean' }
            }
          }
        }
      }
    }
  },
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const query = request.query as any
    let whereClause = '1=1'
    const params: any[] = []
    let paramCount = 0

    if (query.control_id) {
      paramCount++
      whereClause += ` AND control_id = $${paramCount}`
      params.push(query.control_id)
    }

    if (query.evidence_type) {
      paramCount++
      whereClause += ` AND evidence_type = $${paramCount}`
      params.push(query.evidence_type)
    }

    // Get total count
    const countResult = await db.postgres.query(`
      SELECT COUNT(*) as total FROM soc2_evidence WHERE ${whereClause}
    `, params)

    const total = parseInt(countResult.rows[0].total)

    // Get evidence with pagination
    paramCount++
    whereClause += ` ORDER BY collected_at DESC LIMIT $${paramCount}`
    params.push(query.limit || 20)

    paramCount++
    whereClause += ` OFFSET $${paramCount}`
    params.push(query.offset || 0)

    const evidenceResult = await db.postgres.query(`
      SELECT 
        evidence_id, control_id, evidence_type, evidence_name, description,
        file_path, collected_at, collected_by, retention_period, tags
      FROM soc2_evidence 
      WHERE ${whereClause}
    `, params)

    const hasMore = (query.offset || 0) + (query.limit || 20) < total

    return reply.send({
      success: true,
      data: {
        evidence: evidenceResult.rows,
        total,
        has_more: hasMore
      }
    })
  } catch (error) {
    fastify.log.error('Failed to get SOC2 evidence', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get SOC2 evidence'
    })
  }
})

// Upload evidence file
fastify.post('/api/soc2/evidence/upload', {
  schema: {
    description: 'Upload evidence file for SOC2 control',
    tags: ['soc2-compliance'],
    security: [{ bearerAuth: [] }],
    consumes: ['multipart/form-data'],
    response: {
      201: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              evidence_id: { type: 'string' },
              file_path: { type: 'string' },
              file_hash: { type: 'string' }
            }
          }
        }
      }
    }
  },
  preHandler: authenticate
}, async (request, reply) => {
  const user = (request as any).user
  
  try {
    const data = await request.file()
    
    if (!data) {
      return reply.status(400).send({ success: false, error: 'No file uploaded' })
    }

    // Get form fields
    const formData = data.fields as any
    const controlId = formData.control_id?.value
    const evidenceType = formData.evidence_type?.value
    const evidenceName = formData.evidence_name?.value
    const description = formData.description?.value
    const tags = formData.tags?.value ? formData.tags.value.split(',') : []

    if (!controlId || !evidenceType || !evidenceName) {
      return reply.status(400).send({ 
        success: false, 
        error: 'Missing required fields: control_id, evidence_type, evidence_name' 
      })
    }

    // Validate file type for evidence
    const allowedTypes = [
      'application/pdf', 'text/plain', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png', 'image/jpeg', 'image/gif', 'application/json',
      'text/csv', 'application/zip'
    ]
    
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.status(400).send({ 
        success: false, 
        error: 'Unsupported file type for evidence' 
      })
    }

    // Create evidence storage directory
    const fs = require('fs')
    const path = require('path')
    const crypto = require('crypto')
    
    const evidenceDir = process.env.EVIDENCE_DIR || './evidence'
    const controlDir = path.join(evidenceDir, controlId)
    
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true })
    }
    if (!fs.existsSync(controlDir)) {
      fs.mkdirSync(controlDir, { recursive: true })
    }

    // Generate secure filename
    const fileExtension = path.extname(data.filename || '').toLowerCase()
    const evidenceId = crypto.randomUUID()
    const sanitizedName = data.filename?.replace(/[^a-zA-Z0-9.-]/g, '_') || 'evidence'
    const secureFilename = `${evidenceId}_${sanitizedName}${fileExtension}`
    const filePath = path.join(controlDir, secureFilename)

    // Save file and calculate hash
    const fileBuffer = await data.file.toBuffer()
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
    
    fs.writeFileSync(filePath, fileBuffer)

    // Store evidence in database
    const insertResult = await soc2ComplianceService.collectEvidence({
      control_id: controlId,
      evidence_type: evidenceType,
      evidence_name: evidenceName,
      description: description || '',
      file_path: filePath,
      collected_by: user.email,
      retention_period: 2555, // 7 years default
      tags
    })

    // Update evidence record with file hash
    await db.postgres.query(`
      UPDATE soc2_evidence 
      SET file_path = $1, tags = array_append(tags, $2)
      WHERE evidence_id = $3
    `, [filePath, `hash:${fileHash}`, insertResult])

    // Log evidence collection for SOC2 compliance
    await soc2ComplianceService.logAccess({
      user_id: user.userId,
      user_email: user.email,
      action: 'evidence_upload',
      resource: 'soc2_evidence',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'] || '',
      result: 'success',
      risk_score: 5,
      session_id: request.id,
      additional_context: {
        evidence_id: insertResult,
        control_id: controlId,
        evidence_type: evidenceType,
        file_size: fileBuffer.length,
        file_hash: fileHash
      }
    })

    return reply.status(201).send({
      success: true,
      data: {
        evidence_id: insertResult,
        file_path: filePath,
        file_hash: fileHash
      }
    })
  } catch (error) {
    fastify.log.error('Failed to upload SOC2 evidence', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to upload SOC2 evidence'
    })
  }
})

// Update evidence status or metadata
fastify.put('/api/soc2/evidence/:evidenceId', {
  schema: {
    description: 'Update SOC2 evidence metadata',
    tags: ['soc2-compliance'],
    security: [{ bearerAuth: [] }],
    params: {
      type: 'object',
      properties: {
        evidenceId: { type: 'string' }
      },
      required: ['evidenceId']
    },
    body: {
      type: 'object',
      properties: {
        evidence_name: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        retention_period: { type: 'integer' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  },
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const { evidenceId } = request.params as any
    const body = request.body as any
    const user = (request as any).user

    const updateFields: string[] = []
    const params: any[] = []
    let paramCount = 0

    if (body.evidence_name) {
      paramCount++
      updateFields.push(`evidence_name = $${paramCount}`)
      params.push(body.evidence_name)
    }

    if (body.description) {
      paramCount++
      updateFields.push(`description = $${paramCount}`)
      params.push(body.description)
    }

    if (body.tags) {
      paramCount++
      updateFields.push(`tags = $${paramCount}`)
      params.push(body.tags)
    }

    if (body.retention_period) {
      paramCount++
      updateFields.push(`retention_period = $${paramCount}`)
      params.push(body.retention_period)
    }

    if (updateFields.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'No fields to update'
      })
    }

    paramCount++
    const updateQuery = `
      UPDATE soc2_evidence 
      SET ${updateFields.join(', ')}, collected_at = CURRENT_TIMESTAMP
      WHERE evidence_id = $${paramCount}
    `
    params.push(evidenceId)

    const result = await db.postgres.query(updateQuery, params)

    if (result.rowCount === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Evidence not found'
      })
    }

    // Log evidence update
    await soc2ComplianceService.logAccess({
      user_id: user.userId,
      user_email: user.email,
      action: 'evidence_update',
      resource: 'soc2_evidence',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'] || '',
      result: 'success',
      risk_score: 10,
      session_id: request.id,
      additional_context: {
        evidence_id: evidenceId,
        updated_fields: Object.keys(body)
      }
    })

    return reply.send({
      success: true,
      message: 'Evidence updated successfully'
    })
  } catch (error) {
    fastify.log.error('Failed to update SOC2 evidence', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to update SOC2 evidence'
    })
  }
})

// Delete evidence
fastify.delete('/api/soc2/evidence/:evidenceId', {
  schema: {
    description: 'Delete SOC2 evidence (with retention policy check)',
    tags: ['soc2-compliance'],
    security: [{ bearerAuth: [] }],
    params: {
      type: 'object',
      properties: {
        evidenceId: { type: 'string' }
      },
      required: ['evidenceId']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  },
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const { evidenceId } = request.params as any
    const user = (request as any).user

    // Get evidence details first
    const evidenceResult = await db.postgres.query(`
      SELECT evidence_id, file_path, collected_at, retention_period, control_id
      FROM soc2_evidence 
      WHERE evidence_id = $1
    `, [evidenceId])

    if (evidenceResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Evidence not found'
      })
    }

    const evidence = evidenceResult.rows[0]
    
    // Check if evidence is within retention period
    const collectedDate = new Date(evidence.collected_at)
    const retentionEndDate = new Date(collectedDate.getTime() + (evidence.retention_period * 24 * 60 * 60 * 1000))
    const now = new Date()

    if (now < retentionEndDate) {
      return reply.status(403).send({
        success: false,
        error: `Evidence cannot be deleted. Retention period ends on ${retentionEndDate.toDateString()}`
      })
    }

    // Delete file from filesystem
    const fs = require('fs')
    if (evidence.file_path && fs.existsSync(evidence.file_path)) {
      fs.unlinkSync(evidence.file_path)
    }

    // Delete from database
    await db.postgres.query('DELETE FROM soc2_evidence WHERE evidence_id = $1', [evidenceId])

    // Log evidence deletion
    await soc2ComplianceService.logAccess({
      user_id: user.userId,
      user_email: user.email,
      action: 'evidence_deletion',
      resource: 'soc2_evidence',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'] || '',
      result: 'success',
      risk_score: 25,
      session_id: request.id,
      additional_context: {
        evidence_id: evidenceId,
        control_id: evidence.control_id,
        retention_expired: true
      }
    })

    return reply.send({
      success: true,
      message: 'Evidence deleted successfully'
    })
  } catch (error) {
    fastify.log.error('Failed to delete SOC2 evidence', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to delete SOC2 evidence'
    })
  }
})

// Get evidence workflow status
fastify.get('/api/soc2/evidence/workflow/:controlId', {
  schema: {
    description: 'Get evidence collection workflow status for a control',
    tags: ['soc2-compliance'],
    security: [{ bearerAuth: [] }],
    params: {
      type: 'object',
      properties: {
        controlId: { type: 'string' }
      },
      required: ['controlId']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              control_id: { type: 'string' },
              evidence_requirements: { type: 'array' },
              collected_evidence: { type: 'array' },
              missing_evidence: { type: 'array' },
              workflow_status: { type: 'string' },
              completion_percentage: { type: 'number' }
            }
          }
        }
      }
    }
  },
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const { controlId } = request.params as any

    // Get control requirements
    const controlResult = await db.postgres.query(`
      SELECT control_id, control_name, evidence_requirements
      FROM soc2_controls 
      WHERE control_id = $1
    `, [controlId])

    if (controlResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Control not found'
      })
    }

    const control = controlResult.rows[0]
    
    // Get collected evidence
    const evidenceResult = await db.postgres.query(`
      SELECT evidence_type, evidence_name, collected_at, collected_by
      FROM soc2_evidence 
      WHERE control_id = $1
      ORDER BY collected_at DESC
    `, [controlId])

    const collectedEvidence = evidenceResult.rows
    const evidenceRequirements = control.evidence_requirements || []
    
    // Calculate missing evidence
    const collectedTypes = collectedEvidence.map(e => e.evidence_type.toLowerCase())
    const missingEvidence = evidenceRequirements.filter(req => 
      !collectedTypes.some(type => req.toLowerCase().includes(type))
    )

    // Calculate workflow status
    const completionPercentage = evidenceRequirements.length > 0 
      ? Math.round(((evidenceRequirements.length - missingEvidence.length) / evidenceRequirements.length) * 100)
      : 100

    const workflowStatus = completionPercentage === 100 ? 'complete' : 
                          completionPercentage >= 50 ? 'in_progress' : 'not_started'

    return reply.send({
      success: true,
      data: {
        control_id: controlId,
        control_name: control.control_name,
        evidence_requirements: evidenceRequirements,
        collected_evidence: collectedEvidence,
        missing_evidence: missingEvidence,
        workflow_status: workflowStatus,
        completion_percentage: completionPercentage
      }
    })
  } catch (error) {
    fastify.log.error('Failed to get evidence workflow status', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get evidence workflow status'
    })
  }
})

// ============================================================================
// REGULATORY INTELLIGENCE API ENDPOINTS
// ============================================================================

// Get regulatory intelligence summary
fastify.get('/api/regulatory-intelligence/summary', {
  schema: {
    description: 'Get overview of regulatory intelligence system',
    tags: ['regulatory-intelligence'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              total_jurisdictions: { type: 'integer' },
              total_requirements: { type: 'integer' },
              total_companies: { type: 'integer' },
              high_risk_companies: { type: 'integer' },
              recent_updates: { type: 'integer' },
              compliance_distribution: { type: 'object' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const summary = await regulatoryIntelligenceService.getRegulatoryIntelligenceSummary()
    
    return reply.send({
      success: true,
      data: summary
    })
  } catch (error) {
    fastify.log.error('Failed to get regulatory intelligence summary', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get regulatory intelligence summary'
    })
  }
})

// Get applicable regulations for a company
fastify.get('/api/regulatory-intelligence/company/:domain/regulations', {
  schema: {
    description: 'Get applicable regulations for a specific company',
    tags: ['regulatory-intelligence'],
    params: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Company domain name' }
      },
      required: ['domain']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              company: {
                type: 'object',
                properties: {
                  company_domain: { type: 'string' },
                  company_name: { type: 'string' },
                  headquarters_jurisdiction: { type: 'string' },
                  operating_jurisdictions: { type: 'array', items: { type: 'string' } },
                  compliance_score: { type: 'integer' },
                  risk_level: { type: 'string' }
                }
              },
              regulations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    jurisdiction_code: { type: 'string' },
                    law_name: { type: 'string' },
                    requirement_type: { type: 'string' },
                    description: { type: 'string' },
                    severity: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { domain } = request.params as { domain: string }
    
    const result = await regulatoryIntelligenceService.getApplicableRegulations(domain)
    
    if (!result.company) {
      return reply.status(404).send({
        success: false,
        error: `Company not found: ${domain}`
      })
    }
    
    return reply.send({
      success: true,
      data: result
    })
  } catch (error) {
    fastify.log.error('Failed to get applicable regulations', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get applicable regulations'
    })
  }
})

// Analyze compliance for a company's document
fastify.post('/api/regulatory-intelligence/company/:domain/analyze', {
  schema: {
    description: 'Analyze compliance of a company document against applicable regulations',
    tags: ['regulatory-intelligence'],
    params: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Company domain name' }
      },
      required: ['domain']
    },
    body: {
      type: 'object',
      properties: {
        document_content: {
          type: 'string',
          minLength: 100,
          description: 'Content of the legal document to analyze'
        },
        document_type: {
          type: 'string',
          enum: ['terms_of_service', 'privacy_policy', 'cookie_policy', 'other'],
          description: 'Type of document being analyzed'
        }
      },
      required: ['document_content']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              company_domain: { type: 'string' },
              jurisdiction_codes: { type: 'array', items: { type: 'string' } },
              overall_score: { type: 'integer' },
              risk_assessment: { type: 'string' },
              compliance_gaps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    requirement_id: { type: 'string' },
                    gap_description: { type: 'string' },
                    severity: { type: 'string' },
                    recommendation: { type: 'string' }
                  }
                }
              },
              next_review_date: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { domain } = request.params as { domain: string }
    const { document_content } = request.body as { document_content: string }
    
    const analysis = await regulatoryIntelligenceService.analyzeCompliance(domain, document_content)
    
    return reply.send({
      success: true,
      data: analysis
    })
  } catch (error) {
    fastify.log.error('Failed to analyze compliance', { error })
    
    if (error instanceof Error && error.message.includes('Company not found')) {
      return reply.status(404).send({
        success: false,
        error: error.message
      })
    }
    
    return reply.status(500).send({
      success: false,
      error: 'Failed to analyze compliance'
    })
  }
})

// Get all jurisdictions
fastify.get('/api/regulatory-intelligence/jurisdictions', {
  schema: {
    description: 'Get all supported jurisdictions and their regulatory frameworks',
    tags: ['regulatory-intelligence'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                name: { type: 'string' },
                region: { type: 'string' },
                regulatory_framework: { type: 'array', items: { type: 'string' } },
                privacy_authority: { type: 'string' },
                enforcement_history: { type: 'integer' },
                gdpr_applicable: { type: 'boolean' },
                ccpa_applicable: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const query = `
      SELECT code, name, region, regulatory_framework, privacy_authority,
             enforcement_history, gdpr_applicable, ccpa_applicable,
             data_localization_required, breach_notification_required,
             consent_requirements, penalties
      FROM jurisdictions
      ORDER BY enforcement_history DESC, name
    `
    
    const result = await db.postgres.query(query)
    
    return reply.send({
      success: true,
      data: result.rows
    })
  } catch (error) {
    fastify.log.error('Failed to get jurisdictions', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get jurisdictions'
    })
  }
})

// Get regulatory requirements by jurisdiction
fastify.get('/api/regulatory-intelligence/jurisdictions/:code/requirements', {
  schema: {
    description: 'Get regulatory requirements for a specific jurisdiction',
    tags: ['regulatory-intelligence'],
    params: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Jurisdiction code (e.g., EU, US, CA)' }
      },
      required: ['code']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                law_name: { type: 'string' },
                law_code: { type: 'string' },
                requirement_type: { type: 'string' },
                description: { type: 'string' },
                severity: { type: 'string' },
                effective_date: { type: 'string', format: 'date' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { code } = request.params as { code: string }
    
    const query = `
      SELECT id, law_name, law_code, requirement_type, description,
             compliance_patterns, violation_indicators, severity, effective_date
      FROM regulatory_requirements
      WHERE jurisdiction_code = $1
      ORDER BY severity DESC, law_name
    `
    
    const result = await db.postgres.query(query, [code.toUpperCase()])
    
    return reply.send({
      success: true,
      data: result.rows
    })
  } catch (error) {
    fastify.log.error('Failed to get regulatory requirements', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get regulatory requirements'
    })
  }
})

// ============================================================================
// SOC2 COMPLIANCE API ENDPOINTS (DUPLICATE - COMMENTED OUT)
// ============================================================================

// Get SOC2 compliance overview
/*
fastify.get('/api/soc2/overview', {
  schema: {
    description: 'Get SOC2 compliance overview including control status and metrics',
    tags: ['soc2-compliance'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              total_controls: { type: 'integer' },
              compliant_controls: { type: 'integer' },
              non_compliant_controls: { type: 'integer' },
              compliance_percentage: { type: 'number' },
              trust_service_criteria: {
                type: 'object',
                properties: {
                  security: { type: 'integer' },
                  availability: { type: 'integer' },
                  processing_integrity: { type: 'integer' },
                  confidentiality: { type: 'integer' },
                  privacy: { type: 'integer' }
                }
              },
              last_assessment: { type: 'string', format: 'date-time' },
              next_assessment_due: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const overview = await soc2ComplianceService.getComplianceOverview()
    
    return reply.send({
      success: true,
      data: overview
    })
  } catch (error) {
    fastify.log.error('Failed to get SOC2 overview', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get SOC2 compliance overview'
    })
  }
})

// Get SOC2 controls status
fastify.get('/api/soc2/controls', {
  schema: {
    description: 'Get all SOC2 controls with their current status',
    tags: ['soc2-compliance'],
    querystring: {
      type: 'object',
      properties: {
        criteria: { type: 'string', enum: ['Security', 'Availability', 'Processing Integrity', 'Confidentiality', 'Privacy'] },
        status: { type: 'string', enum: ['Compliant', 'Non-Compliant', 'Needs Review'] }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                control_id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                trust_service_criteria: { type: 'string' },
                control_type: { type: 'string' },
                status: { type: 'string' },
                last_tested: { type: 'string', format: 'date-time' },
                next_test_due: { type: 'string', format: 'date-time' },
                automated_testing: { type: 'boolean' },
                risk_rating: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { criteria, status } = request.query as { criteria?: string; status?: string }
    const controls = await soc2ComplianceService.getControls(criteria, status)
    
    return reply.send({
      success: true,
      data: controls
    })
  } catch (error) {
    fastify.log.error('Failed to get SOC2 controls', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get SOC2 controls'
    })
  }
})

// Run automated tests
fastify.post('/api/soc2/tests/run', {
  schema: {
    description: 'Run automated tests for SOC2 controls',
    tags: ['soc2-compliance'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              tested: { type: 'integer' },
              passed: { type: 'integer' },
              failed: { type: 'integer' },
              test_results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    control_id: { type: 'string' },
                    test_name: { type: 'string' },
                    status: { type: 'string' },
                    details: { type: 'string' },
                    tested_at: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const results = await soc2ComplianceService.runAutomatedTests()
    
    return reply.send({
      success: true,
      data: results
    })
  } catch (error) {
    fastify.log.error('Failed to run SOC2 automated tests', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to run automated tests'
    })
  }
})

// Get evidence collection status
fastify.get('/api/soc2/evidence', {
  schema: {
    description: 'Get evidence collection status and available evidence',
    tags: ['soc2-compliance'],
    querystring: {
      type: 'object',
      properties: {
        control_id: { type: 'string' },
        evidence_type: { type: 'string' },
        date_from: { type: 'string', format: 'date' },
        date_to: { type: 'string', format: 'date' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                control_id: { type: 'string' },
                evidence_type: { type: 'string' },
                description: { type: 'string' },
                file_path: { type: 'string' },
                collection_method: { type: 'string' },
                collected_at: { type: 'string', format: 'date-time' },
                retention_until: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { control_id, evidence_type, date_from, date_to } = request.query as { 
      control_id?: string; 
      evidence_type?: string; 
      date_from?: string; 
      date_to?: string 
    }
    
    const evidence = await soc2ComplianceService.getEvidence({
      control_id,
      evidence_type,
      date_from,
      date_to
    })
    
    return reply.send({
      success: true,
      data: evidence
    })
  } catch (error) {
    fastify.log.error('Failed to get SOC2 evidence', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get evidence collection status'
    })
  }
})

// Get compliance metrics
fastify.get('/api/soc2/metrics', {
  schema: {
    description: 'Get SOC2 compliance metrics and KPIs',
    tags: ['soc2-compliance'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              compliance_score: { type: 'number' },
              trend_7d: { type: 'number' },
              trend_30d: { type: 'number' },
              controls_by_status: {
                type: 'object',
                properties: {
                  compliant: { type: 'integer' },
                  non_compliant: { type: 'integer' },
                  needs_review: { type: 'integer' }
                }
              },
              evidence_collection_rate: { type: 'number' },
              automated_test_success_rate: { type: 'number' },
              last_full_assessment: { type: 'string', format: 'date-time' },
              next_assessment_due: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const metrics = await soc2ComplianceService.getComplianceMetrics()
    
    return reply.send({
      success: true,
      data: metrics
    })
  } catch (error) {
    fastify.log.error('Failed to get SOC2 metrics', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get compliance metrics'
    })
  }
})

// ============================================================================
// DOCUMENT PROCESSING API ENDPOINTS
// ============================================================================

// Process document changes for training
fastify.post('/api/document-processing/process', {
  schema: {
    description: 'Process unprocessed document changes into ML training examples',
    tags: ['document-processing'],
    body: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              total_changes_processed: { type: 'integer' },
              training_examples_generated: { type: 'integer' },
              quality_distribution: { type: 'object' },
              processing_time_ms: { type: 'integer' },
              error_count: { type: 'integer' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { limit = 100 } = request.body as { limit?: number }
    const metrics = await documentProcessingService.processChangesForTraining(limit)
    
    return reply.send({
      success: true,
      data: metrics
    })
  } catch (error) {
    fastify.log.error('Failed to process document changes', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to process document changes for training'
    })
  }
})

// Get processing metrics
fastify.get('/api/document-processing/metrics', {
  schema: {
    description: 'Get document processing metrics and statistics',
    tags: ['document-processing'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              total_examples: { type: 'integer' },
              examples_by_type: { type: 'object' },
              examples_by_difficulty: { type: 'object' },
              average_quality_score: { type: 'number' },
              recent_processing_jobs: { type: 'array' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const metrics = await documentProcessingService.getProcessingMetrics()
    
    return reply.send({
      success: true,
      data: metrics
    })
  } catch (error) {
    fastify.log.error('Failed to get processing metrics', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get processing metrics'
    })
  }
})

// Create training dataset
fastify.post('/api/document-processing/datasets', {
  schema: {
    description: 'Create a training dataset from processed examples',
    tags: ['document-processing'],
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string' },
        dataset_type: { type: 'string', enum: ['fine_tuning', 'evaluation', 'benchmark'] },
        model_target: { type: 'string', minLength: 1, maxLength: 100 },
        filters: {
          type: 'object',
          properties: {
            example_types: { type: 'array', items: { type: 'string' } },
            difficulty_levels: { type: 'array', items: { type: 'string' } },
            min_quality_score: { type: 'number', minimum: 0, maximum: 1 },
            website_domains: { type: 'array', items: { type: 'string' } },
            document_types: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      required: ['name', 'dataset_type', 'model_target']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              dataset_type: { type: 'string' },
              model_target: { type: 'string' },
              total_examples: { type: 'integer' },
              quality_distribution: { type: 'object' },
              created_at: { type: 'string', format: 'date-time' },
              file_path: { type: 'string' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { name, description, dataset_type, model_target, filters = {} } = request.body as {
      name: string
      description?: string
      dataset_type: 'fine_tuning' | 'evaluation' | 'benchmark'
      model_target: string
      filters?: any
    }
    
    const dataset = await documentProcessingService.createTrainingDataset(
      name,
      description || '',
      dataset_type,
      model_target,
      filters
    )
    
    return reply.send({
      success: true,
      data: dataset
    })
  } catch (error) {
    fastify.log.error('Failed to create training dataset', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to create training dataset'
    })
  }
})

// Export dataset to JSONL
fastify.post('/api/document-processing/datasets/:id/export', {
  schema: {
    description: 'Export training dataset to JSONL format for model training',
    tags: ['document-processing'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' }
      },
      required: ['id']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              file_path: { type: 'string' },
              export_completed_at: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { id } = request.params as { id: string }
    const filePath = await documentProcessingService.exportDatasetToJSONL(id)
    
    return reply.send({
      success: true,
      data: {
        file_path: filePath,
        export_completed_at: new Date().toISOString()
      }
    })
  } catch (error) {
    fastify.log.error('Failed to export dataset', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to export dataset to JSONL'
    })
  }
})

// ============================================================================
// REAL-TIME COMPLIANCE MONITORING API ENDPOINTS
// ============================================================================

// Get real-time compliance metrics
fastify.get('/api/monitoring/metrics', {
  schema: {
    description: 'Get real-time compliance metrics',
    tags: ['compliance-monitoring'],
    security: [{ bearerAuth: [] }],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              overall_score: { type: 'number' },
              score_trend_24h: { type: 'number' },
              score_trend_7d: { type: 'number' },
              score_trend_30d: { type: 'number' },
              control_scores: { type: 'object' },
              failed_controls: { type: 'array', items: { type: 'string' } },
              overdue_evidence: { type: 'number' },
              upcoming_deadlines: { type: 'number' },
              critical_alerts: { type: 'number' },
              high_alerts: { type: 'number' },
              medium_alerts: { type: 'number' },
              low_alerts: { type: 'number' },
              last_updated: { type: 'string' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ success: false, error: 'Authentication required' })
    }

    const token = authHeader.split(' ')[1]
    const userQuery = 'SELECT email, organization FROM users WHERE token = $1 AND active = true'
    const userResult = await db.postgres.query(userQuery, [token])
    
    if (userResult.rows.length === 0) {
      return reply.status(401).send({ success: false, error: 'Invalid authentication token' })
    }

    const user = userResult.rows[0]
    const companyDomain = user.organization || 'default.com'
    
    const metrics = await realTimeMonitoringService.getRealtimeMetrics(companyDomain)
    
    return reply.send({
      success: true,
      data: metrics
    })
  } catch (error) {
    fastify.log.error('Failed to get real-time metrics', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get real-time metrics'
    })
  }
})

// Get active compliance alerts
fastify.get('/api/monitoring/alerts', {
  schema: {
    description: 'Get active compliance alerts',
    tags: ['compliance-monitoring'],
    security: [{ bearerAuth: [] }],
    querystring: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                alert_type: { type: 'string' },
                severity: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                company_domain: { type: 'string' },
                control_id: { type: 'string' },
                triggered_at: { type: 'string' },
                acknowledged: { type: 'boolean' },
                resolved: { type: 'boolean' },
                recommendations: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ success: false, error: 'Authentication required' })
    }

    const token = authHeader.split(' ')[1]
    const userQuery = 'SELECT email, organization FROM users WHERE token = $1 AND active = true'
    const userResult = await db.postgres.query(userQuery, [token])
    
    if (userResult.rows.length === 0) {
      return reply.status(401).send({ success: false, error: 'Invalid authentication token' })
    }

    const user = userResult.rows[0]
    const companyDomain = user.organization || 'default.com'
    const { severity } = request.query as { severity?: string }
    
    const alerts = await realTimeMonitoringService.getActiveAlerts(companyDomain, severity)
    
    return reply.send({
      success: true,
      data: alerts
    })
  } catch (error) {
    fastify.log.error('Failed to get alerts', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get alerts'
    })
  }
})

// Acknowledge compliance alert
fastify.post('/api/monitoring/alerts/:alertId/acknowledge', {
  schema: {
    description: 'Acknowledge a compliance alert',
    tags: ['compliance-monitoring'],
    security: [{ bearerAuth: [] }],
    params: {
      type: 'object',
      properties: {
        alertId: { type: 'string' }
      },
      required: ['alertId']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ success: false, error: 'Authentication required' })
    }

    const token = authHeader.split(' ')[1]
    const userQuery = 'SELECT email FROM users WHERE token = $1 AND active = true'
    const userResult = await db.postgres.query(userQuery, [token])
    
    if (userResult.rows.length === 0) {
      return reply.status(401).send({ success: false, error: 'Invalid authentication token' })
    }

    const user = userResult.rows[0]
    const { alertId } = request.params as { alertId: string }
    
    await realTimeMonitoringService.acknowledgeAlert(alertId, user.email)
    
    return reply.send({
      success: true,
      message: 'Alert acknowledged successfully'
    })
  } catch (error) {
    fastify.log.error('Failed to acknowledge alert', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to acknowledge alert'
    })
  }
})

// Resolve compliance alert
fastify.post('/api/monitoring/alerts/:alertId/resolve', {
  schema: {
    description: 'Resolve a compliance alert',
    tags: ['compliance-monitoring'],
    security: [{ bearerAuth: [] }],
    params: {
      type: 'object',
      properties: {
        alertId: { type: 'string' }
      },
      required: ['alertId']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ success: false, error: 'Authentication required' })
    }

    const token = authHeader.split(' ')[1]
    const userQuery = 'SELECT email FROM users WHERE token = $1 AND active = true'
    const userResult = await db.postgres.query(userQuery, [token])
    
    if (userResult.rows.length === 0) {
      return reply.status(401).send({ success: false, error: 'Invalid authentication token' })
    }

    const { alertId } = request.params as { alertId: string }
    
    await realTimeMonitoringService.resolveAlert(alertId)
    
    return reply.send({
      success: true,
      message: 'Alert resolved successfully'
    })
  } catch (error) {
    fastify.log.error('Failed to resolve alert', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to resolve alert'
    })
  }
})

// Create monitoring webhook
fastify.post('/api/monitoring/webhooks', {
  schema: {
    description: 'Create a monitoring webhook',
    tags: ['compliance-monitoring'],
    security: [{ bearerAuth: [] }],
    body: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 200 },
        url: { type: 'string', format: 'uri' },
        secret: { type: 'string', minLength: 16 },
        enabled: { type: 'boolean', default: true },
        events: { 
          type: 'array', 
          items: { 
            type: 'string',
            enum: ['score_decline', 'control_failure', 'evidence_overdue', 'assessment_due', 'critical_gap', 'security_incident']
          },
          minItems: 1
        },
        headers: { type: 'object' }
      },
      required: ['name', 'url', 'secret', 'events']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              url: { type: 'string' },
              enabled: { type: 'boolean' },
              events: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ success: false, error: 'Authentication required' })
    }

    const token = authHeader.split(' ')[1]
    const userQuery = 'SELECT email, organization FROM users WHERE token = $1 AND active = true'
    const userResult = await db.postgres.query(userQuery, [token])
    
    if (userResult.rows.length === 0) {
      return reply.status(401).send({ success: false, error: 'Invalid authentication token' })
    }

    const user = userResult.rows[0]
    const companyDomain = user.organization || 'default.com'
    const body = request.body as any
    
    const webhook = await realTimeMonitoringService.createWebhook({
      ...body,
      company_domain: companyDomain
    })
    
    return reply.send({
      success: true,
      data: {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        enabled: webhook.enabled,
        events: webhook.events
      }
    })
  } catch (error) {
    fastify.log.error('Failed to create webhook', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to create webhook'
    })
  }
})

// ============================================================================
// CHANGE DETECTION API ENDPOINTS
// ============================================================================

// Add document to monitoring
fastify.post('/api/change-detection/monitor', {
  schema: {
    description: 'Add a document to change monitoring',
    tags: ['change-detection'],
    body: {
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri' },
        document_type: { type: 'string', enum: ['terms', 'privacy', 'cookie', 'eula'] },
        check_frequency: { type: 'integer', minimum: 3600, maximum: 604800, default: 86400 }
      },
      required: ['url', 'document_type']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              url: { type: 'string' },
              document_type: { type: 'string' },
              title: { type: 'string' },
              monitoring_active: { type: 'boolean' },
              next_check: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { url, document_type, check_frequency = 86400 } = request.body as {
      url: string
      document_type: 'terms' | 'privacy' | 'cookie' | 'eula'
      check_frequency?: number
    }

    // In production, would get user_id from JWT token
    const userId = undefined // request.user?.userId

    const monitoredDoc = await changeDetectionService.addDocumentToMonitoring(
      url,
      document_type,
      userId,
      check_frequency
    )
    
    return reply.send({
      success: true,
      data: monitoredDoc
    })
  } catch (error) {
    fastify.log.error('Failed to add document to monitoring', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to add document to monitoring'
    })
  }
})

// Run monitoring cycle
fastify.post('/api/change-detection/run-cycle', {
  schema: {
    description: 'Run change detection monitoring cycle for due documents',
    tags: ['change-detection'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              total_monitored_documents: { type: 'integer' },
              active_monitors: { type: 'integer' },
              changes_detected_24h: { type: 'integer' },
              changes_detected_7d: { type: 'integer' },
              average_significance_score: { type: 'number' },
              most_changed_document_types: { type: 'object' },
              recent_significant_changes: { type: 'array' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const metrics = await changeDetectionService.runMonitoringCycle()
    
    return reply.send({
      success: true,
      data: metrics
    })
  } catch (error) {
    fastify.log.error('Failed to run monitoring cycle', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to run monitoring cycle'
    })
  }
})

// Get monitoring metrics
fastify.get('/api/change-detection/metrics', {
  schema: {
    description: 'Get change detection monitoring metrics and statistics',
    tags: ['change-detection'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              total_monitored_documents: { type: 'integer' },
              active_monitors: { type: 'integer' },
              changes_detected_24h: { type: 'integer' },
              changes_detected_7d: { type: 'integer' },
              average_significance_score: { type: 'number' },
              most_changed_document_types: { type: 'object' },
              recent_significant_changes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    change_summary: { type: 'string' },
                    significance_score: { type: 'integer' },
                    detected_at: { type: 'string', format: 'date-time' },
                    title: { type: 'string' },
                    document_type: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const metrics = await changeDetectionService.getMonitoringMetrics()
    
    return reply.send({
      success: true,
      data: metrics
    })
  } catch (error) {
    fastify.log.error('Failed to get monitoring metrics', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get monitoring metrics'
    })
  }
})

// Get user's monitored documents
fastify.get('/api/change-detection/documents', {
  schema: {
    description: 'Get all monitored documents for the current user',
    tags: ['change-detection'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                url: { type: 'string' },
                document_type: { type: 'string' },
                title: { type: 'string' },
                domain: { type: 'string' },
                monitoring_active: { type: 'boolean' },
                notification_enabled: { type: 'boolean' },
                last_checked: { type: 'string', format: 'date-time' },
                next_check: { type: 'string', format: 'date-time' },
                created_at: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    // In production, would get user_id from JWT token
    const userId = 'mock-user-id' // request.user?.userId

    const documents = await changeDetectionService.getUserMonitoredDocuments(userId)
    
    return reply.send({
      success: true,
      data: documents
    })
  } catch (error) {
    fastify.log.error('Failed to get monitored documents', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get monitored documents'
    })
  }
})

// Get user's recent changes
fastify.get('/api/change-detection/changes', {
  schema: {
    description: 'Get recent document changes for the current user',
    tags: ['change-detection'],
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                change_summary: { type: 'string' },
                significance_score: { type: 'integer' },
                change_type: { type: 'string' },
                affected_sections: { type: 'array', items: { type: 'string' } },
                detected_at: { type: 'string', format: 'date-time' },
                title: { type: 'string' },
                url: { type: 'string' },
                document_type: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { limit = 20 } = request.query as { limit?: number }
    // In production, would get user_id from JWT token
    const userId = 'mock-user-id' // request.user?.userId

    const changes = await changeDetectionService.getUserRecentChanges(userId, limit)
    
    return reply.send({
      success: true,
      data: changes
    })
  } catch (error) {
    fastify.log.error('Failed to get recent changes', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get recent changes'
    })
  }
})

// Update monitoring settings
fastify.put('/api/change-detection/documents/:id/settings', {
  schema: {
    description: 'Update monitoring settings for a specific document',
    tags: ['change-detection'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' }
      },
      required: ['id']
    },
    body: {
      type: 'object',
      properties: {
        check_frequency: { type: 'integer', minimum: 3600, maximum: 604800 },
        notification_enabled: { type: 'boolean' },
        monitoring_active: { type: 'boolean' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { id } = request.params as { id: string }
    const settings = request.body as {
      check_frequency?: number
      notification_enabled?: boolean
      monitoring_active?: boolean
    }

    await changeDetectionService.updateMonitoringSettings(id, settings)
    
    return reply.send({
      success: true,
      message: 'Monitoring settings updated successfully'
    })
  } catch (error) {
    fastify.log.error('Failed to update monitoring settings', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to update monitoring settings'
    })
  }
})
*/

// ============================================================================
// REGULATORY INTELLIGENCE ENGINE API ENDPOINTS
// ============================================================================

// Get regulatory tracking metrics
fastify.get('/api/regulatory-engine/metrics', {
  schema: {
    description: 'Get regulatory intelligence tracking metrics and law updates',
    tags: ['regulatory-engine'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              total_regulations_tracked: { type: 'integer' },
              updates_this_month: { type: 'integer' },
              high_impact_updates: { type: 'integer' },
              pending_compliance_deadlines: { type: 'integer' },
              alerts_generated: { type: 'integer' },
              most_updated_jurisdictions: { type: 'object' },
              compliance_cost_estimates: {
                type: 'object',
                properties: {
                  total_estimated_cost: { type: 'number' },
                  average_per_company: { type: 'number' },
                  by_industry: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const metrics = await regulatoryEngine.getRegulatoryMetrics()
    
    return reply.send({
      success: true,
      data: metrics
    })
  } catch (error) {
    fastify.log.error('Failed to get regulatory metrics', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get regulatory tracking metrics'
    })
  }
})

// Get recent regulatory updates
fastify.get('/api/regulatory-engine/updates', {
  schema: {
    description: 'Get recent regulatory updates and law changes',
    tags: ['regulatory-engine'],
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        jurisdiction: { type: 'string' },
        impact_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                jurisdiction_name: { type: 'string' },
                regulation_name: { type: 'string' },
                update_type: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                impact_level: { type: 'string' },
                effective_date: { type: 'string', format: 'date' },
                announcement_date: { type: 'string', format: 'date' },
                key_changes: { type: 'array', items: { type: 'string' } },
                compliance_requirements: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { limit = 20 } = request.query as { limit?: number }
    const updates = await regulatoryEngine.getRecentUpdates(limit)
    
    return reply.send({
      success: true,
      data: updates
    })
  } catch (error) {
    fastify.log.error('Failed to get regulatory updates', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get regulatory updates'
    })
  }
})

// Run regulatory monitoring cycle
fastify.post('/api/regulatory-engine/monitor', {
  schema: {
    description: 'Run regulatory monitoring cycle to check for new updates',
    tags: ['regulatory-engine'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              sources_checked: { type: 'integer' },
              updates_found: { type: 'integer' },
              alerts_generated: { type: 'integer' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const results = await regulatoryEngine.runRegulatoryMonitoring()
    
    return reply.send({
      success: true,
      data: results
    })
  } catch (error) {
    fastify.log.error('Failed to run regulatory monitoring', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to run regulatory monitoring cycle'
    })
  }
})

// Add new regulatory update
fastify.post('/api/regulatory-engine/updates', {
  schema: {
    description: 'Add a new regulatory update to the tracking system',
    tags: ['regulatory-engine'],
    body: {
      type: 'object',
      properties: {
        jurisdiction_code: { type: 'string', minLength: 2, maxLength: 10 },
        regulation_name: { type: 'string', minLength: 1, maxLength: 200 },
        update_type: { type: 'string', enum: ['new_regulation', 'amendment', 'guidance', 'enforcement_action', 'deadline_change'] },
        title: { type: 'string', minLength: 1, maxLength: 500 },
        description: { type: 'string', minLength: 1 },
        effective_date: { type: 'string', format: 'date' },
        announcement_date: { type: 'string', format: 'date' },
        source_url: { type: 'string', format: 'uri' },
        impact_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        affected_industries: { type: 'array', items: { type: 'string' } },
        key_changes: { type: 'array', items: { type: 'string' } },
        compliance_requirements: { type: 'array', items: { type: 'string' } }
      },
      required: ['jurisdiction_code', 'regulation_name', 'update_type', 'title', 'description', 'announcement_date', 'impact_level']
    },
    response: {
      201: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              jurisdiction_code: { type: 'string' },
              impact_level: { type: 'string' },
              created_at: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const updateData = request.body as any
    const newUpdate = await regulatoryEngine.addRegulatoryUpdate(updateData)
    
    return reply.status(201).send({
      success: true,
      data: newUpdate
    })
  } catch (error) {
    fastify.log.error('Failed to add regulatory update', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to add regulatory update'
    })
  }
})

// Get regulatory alerts for a company
fastify.get('/api/regulatory-engine/alerts/:domain', {
  schema: {
    description: 'Get regulatory alerts for a specific company domain',
    tags: ['regulatory-engine'],
    params: {
      type: 'object',
      properties: {
        domain: { type: 'string' }
      },
      required: ['domain']
    },
    querystring: {
      type: 'object',
      properties: {
        include_acknowledged: { type: 'boolean', default: false }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                alert_type: { type: 'string' },
                priority: { type: 'string' },
                title: { type: 'string' },
                message: { type: 'string' },
                action_required: { type: 'boolean' },
                deadline_date: { type: 'string', format: 'date' },
                created_at: { type: 'string', format: 'date-time' },
                update_title: { type: 'string' },
                regulation_name: { type: 'string' },
                jurisdiction_name: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { domain } = request.params as { domain: string }
    const { include_acknowledged = false } = request.query as { include_acknowledged?: boolean }
    
    const alerts = await regulatoryEngine.getCompanyAlerts(domain, include_acknowledged)
    
    return reply.send({
      success: true,
      data: alerts
    })
  } catch (error) {
    fastify.log.error('Failed to get company alerts', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get regulatory alerts'
    })
  }
})

// Get compliance recommendations for a company
fastify.get('/api/regulatory-engine/recommendations/:domain', {
  schema: {
    description: 'Get compliance recommendations for a specific company domain',
    tags: ['regulatory-engine'],
    params: {
      type: 'object',
      properties: {
        domain: { type: 'string' }
      },
      required: ['domain']
    },
    querystring: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'deferred'] }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                recommendation_type: { type: 'string' },
                priority: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                implementation_steps: { type: 'array', items: { type: 'string' } },
                estimated_effort: { type: 'string' },
                deadline: { type: 'string', format: 'date' },
                cost_estimate: { type: 'number' },
                status: { type: 'string' },
                update_title: { type: 'string' },
                regulation_name: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { domain } = request.params as { domain: string }
    const { status } = request.query as { status?: string }
    
    const recommendations = await regulatoryEngine.getCompanyRecommendations(domain, status)
    
    return reply.send({
      success: true,
      data: recommendations
    })
  } catch (error) {
    fastify.log.error('Failed to get company recommendations', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get compliance recommendations'
    })
  }
})

// ============================================================================
// COMPLIANCE MONITORING API ENDPOINTS
// ============================================================================

// Get compliance dashboard
fastify.get('/api/compliance/dashboard/:domain', {
  schema: {
    description: 'Get comprehensive compliance dashboard for a company',
    tags: ['compliance-monitoring'],
    params: {
      type: 'object',
      properties: {
        domain: { type: 'string' }
      },
      required: ['domain']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              overall_score: { type: 'integer' },
              trend_7d: { type: 'integer' },
              trend_30d: { type: 'integer' },
              jurisdiction_scores: { type: 'object' },
              regulation_scores: { type: 'object' },
              critical_issues: { type: 'integer' },
              overdue_actions: { type: 'integer' },
              upcoming_deadlines: { type: 'array' },
              recent_activities: { type: 'array' },
              compliance_heat_map: { type: 'array' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { domain } = request.params as { domain: string }
    const dashboard = await complianceMonitoringService.getComplianceDashboard(domain)
    
    return reply.send({
      success: true,
      data: dashboard
    })
  } catch (error) {
    fastify.log.error('Failed to get compliance dashboard', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get compliance dashboard'
    })
  }
})

// Run compliance assessment
fastify.post('/api/compliance/assess/:domain', {
  schema: {
    description: 'Run comprehensive compliance assessment for a company',
    tags: ['compliance-monitoring'],
    params: {
      type: 'object',
      properties: {
        domain: { type: 'string' }
      },
      required: ['domain']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              overall_score: { type: 'integer' },
              assessment_results: { type: 'array' },
              recommendations: { type: 'array', items: { type: 'string' } },
              critical_actions: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { domain } = request.params as { domain: string }
    const assessment = await complianceMonitoringService.runComplianceAssessment(domain)
    
    return reply.send({
      success: true,
      data: assessment
    })
  } catch (error) {
    fastify.log.error('Failed to run compliance assessment', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to run compliance assessment'
    })
  }
})

// Generate compliance report
fastify.post('/api/compliance/reports/:domain', {
  schema: {
    description: 'Generate comprehensive compliance report for a company',
    tags: ['compliance-monitoring'],
    params: {
      type: 'object',
      properties: {
        domain: { type: 'string' }
      },
      required: ['domain']
    },
    body: {
      type: 'object',
      properties: {
        report_type: { type: 'string', enum: ['executive_summary', 'detailed_assessment', 'gap_analysis', 'audit_preparation', 'regulatory_update'] },
        period_start: { type: 'string', format: 'date' },
        period_end: { type: 'string', format: 'date' }
      },
      required: ['report_type', 'period_start', 'period_end']
    },
    response: {
      201: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              report_type: { type: 'string' },
              overall_compliance_score: { type: 'integer' },
              key_findings: { type: 'array', items: { type: 'string' } },
              recommendations: { type: 'array', items: { type: 'string' } },
              action_items: { type: 'array' },
              generated_at: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { domain } = request.params as { domain: string }
    const { report_type, period_start, period_end } = request.body as {
      report_type: 'executive_summary' | 'detailed_assessment' | 'gap_analysis' | 'audit_preparation' | 'regulatory_update'
      period_start: string
      period_end: string
    }
    
    const report = await complianceMonitoringService.generateComplianceReport(
      domain,
      report_type,
      period_start,
      period_end
    )
    
    return reply.status(201).send({
      success: true,
      data: report
    })
  } catch (error) {
    fastify.log.error('Failed to generate compliance report', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to generate compliance report'
    })
  }
})

// Get compliance monitoring metrics
fastify.get('/api/compliance/metrics', {
  schema: {
    description: 'Get overall compliance monitoring metrics and statistics',
    tags: ['compliance-monitoring'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              total_companies_monitored: { type: 'integer' },
              active_compliance_checks: { type: 'integer' },
              audit_events_24h: { type: 'integer' },
              average_compliance_score: { type: 'number' },
              compliance_distribution: {
                type: 'object',
                properties: {
                  compliant: { type: 'integer' },
                  partially_compliant: { type: 'integer' },
                  non_compliant: { type: 'integer' },
                  unknown: { type: 'integer' }
                }
              },
              top_compliance_gaps: { type: 'array' },
              upcoming_deadlines_7d: { type: 'integer' },
              recent_improvements: { type: 'array' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const metrics = await complianceMonitoringService.getComplianceMetrics()
    
    return reply.send({
      success: true,
      data: metrics
    })
  } catch (error) {
    fastify.log.error('Failed to get compliance metrics', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get compliance monitoring metrics'
    })
  }
})

// Get audit trail
fastify.get('/api/compliance/audit/:domain', {
  schema: {
    description: 'Get audit trail for a specific company',
    tags: ['compliance-monitoring'],
    params: {
      type: 'object',
      properties: {
        domain: { type: 'string' }
      },
      required: ['domain']
    },
    querystring: {
      type: 'object',
      properties: {
        start_date: { type: 'string', format: 'date' },
        end_date: { type: 'string', format: 'date' },
        event_types: { type: 'array', items: { type: 'string' } },
        limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                event_type: { type: 'string' },
                event_category: { type: 'string' },
                action_performed: { type: 'string' },
                resource_type: { type: 'string' },
                resource_id: { type: 'string' },
                risk_level: { type: 'string' },
                compliance_implications: { type: 'array', items: { type: 'string' } },
                timestamp: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { domain } = request.params as { domain: string }
    const { start_date, end_date, event_types, limit = 100 } = request.query as {
      start_date?: string
      end_date?: string
      event_types?: string[]
      limit?: number
    }
    
    const auditTrail = await complianceMonitoringService.getAuditTrail(
      domain,
      start_date,
      end_date,
      event_types,
      limit
    )
    
    return reply.send({
      success: true,
      data: auditTrail
    })
  } catch (error) {
    fastify.log.error('Failed to get audit trail', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get audit trail'
    })
  }
})

// Get compliance reports
fastify.get('/api/compliance/reports/:domain', {
  schema: {
    description: 'Get compliance reports for a specific company',
    tags: ['compliance-monitoring'],
    params: {
      type: 'object',
      properties: {
        domain: { type: 'string' }
      },
      required: ['domain']
    },
    querystring: {
      type: 'object',
      properties: {
        report_type: { type: 'string', enum: ['executive_summary', 'detailed_assessment', 'gap_analysis', 'audit_preparation', 'regulatory_update'] }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                report_type: { type: 'string' },
                overall_compliance_score: { type: 'integer' },
                jurisdictions_covered: { type: 'array', items: { type: 'string' } },
                regulations_covered: { type: 'array', items: { type: 'string' } },
                key_findings: { type: 'array', items: { type: 'string' } },
                recommendations: { type: 'array', items: { type: 'string' } },
                generated_at: { type: 'string', format: 'date-time' },
                generated_by: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { domain } = request.params as { domain: string }
    const { report_type } = request.query as { report_type?: string }
    
    const reports = await complianceMonitoringService.getComplianceReports(domain, report_type)
    
    return reply.send({
      success: true,
      data: reports
    })
  } catch (error) {
    fastify.log.error('Failed to get compliance reports', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to get compliance reports'
    })
  }
})

// Record audit event
fastify.post('/api/compliance/audit', {
  schema: {
    description: 'Record a new audit event in the compliance monitoring system',
    tags: ['compliance-monitoring'],
    body: {
      type: 'object',
      properties: {
        event_type: { type: 'string', enum: ['policy_update', 'user_action', 'system_change', 'compliance_check', 'data_access', 'security_event'] },
        event_category: { type: 'string', enum: ['data_processing', 'user_management', 'system_admin', 'compliance', 'security'] },
        company_domain: { type: 'string' },
        resource_type: { type: 'string' },
        resource_id: { type: 'string' },
        action_performed: { type: 'string' },
        event_details: { type: 'object' },
        compliance_implications: { type: 'array', items: { type: 'string' } },
        risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
      },
      required: ['event_type', 'event_category', 'resource_type', 'resource_id', 'action_performed', 'risk_level']
    },
    response: {
      201: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              event_type: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const eventData = request.body as any
    const auditEvent = await complianceMonitoringService.recordAuditEvent(eventData)
    
    return reply.status(201).send({
      success: true,
      data: {
        id: auditEvent.id,
        event_type: auditEvent.event_type,
        timestamp: auditEvent.timestamp
      }
    })
  } catch (error) {
    fastify.log.error('Failed to record audit event', { error })
    return reply.status(500).send({
      success: false,
      error: 'Failed to record audit event'
    })
  }
})

// ============================================================================
// APP STORE API ENDPOINTS
// ============================================================================

// Search for apps across platforms
fastify.get('/api/apps/search', {
  schema: {
    description: 'Search for apps across iOS App Store and Google Play Store',
    tags: ['apps'],
    querystring: {
      type: 'object',
      properties: {
        q: { type: 'string', minLength: 2, description: 'Search query' },
        platform: { type: 'string', enum: ['ios', 'android'], description: 'Specific platform to search' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 }
      },
      required: ['q']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                developer: { type: 'string' },
                category: { type: 'string' },
                platform: { type: 'string', enum: ['ios', 'android'] },
                bundle_id: { type: 'string' },
                icon_url: { type: 'string' },
                rating: { type: 'number' },
                price: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { q, platform, limit = 10 } = request.query as { 
      q: string; 
      platform?: 'ios' | 'android'; 
      limit?: number 
    }

    const results = await appStoreService.searchApps(q, platform, limit)
    
    return reply.send({
      success: true,
      data: results
    })
  } catch (error) {
    fastify.log.error('Failed to search apps', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to search apps' 
    })
  }
})

// Get detailed app metadata
fastify.get('/api/apps/:platform/:appId', {
  schema: {
    description: 'Get detailed metadata for a specific app',
    tags: ['apps'],
    params: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['ios', 'android'] },
        appId: { type: 'string' }
      },
      required: ['platform', 'appId']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              developer: { type: 'string' },
              category: { type: 'string' },
              platform: { type: 'string' },
              bundle_id: { type: 'string' },
              icon_url: { type: 'string' },
              description: { type: 'string' },
              rating: { type: 'number' },
              review_count: { type: 'integer' },
              price: { type: 'number' },
              version: { type: 'string' },
              updated_at: { type: 'string', format: 'date-time' },
              terms_url: { type: 'string', nullable: true },
              privacy_url: { type: 'string', nullable: true },
              support_url: { type: 'string', nullable: true }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { platform, appId } = request.params as { platform: 'ios' | 'android'; appId: string }

    const metadata = await appStoreService.getAppMetadata(appId, platform)
    
    if (!metadata) {
      return reply.status(404).send({
        success: false,
        error: 'App not found'
      })
    }

    return reply.send({
      success: true,
      data: metadata
    })
  } catch (error) {
    fastify.log.error('Failed to get app metadata', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to get app metadata' 
    })
  }
})

// Analyze app's legal documents
fastify.post('/api/apps/:platform/:appId/analyze', {
  schema: {
    description: 'Analyze an app\'s terms of service and privacy policy',
    tags: ['apps'],
    params: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['ios', 'android'] },
        appId: { type: 'string' }
      },
      required: ['platform', 'appId']
    },
    body: {
      type: 'object',
      properties: {
        documents: {
          type: 'array',
          items: { type: 'string', enum: ['terms', 'privacy'] },
          default: ['terms', 'privacy']
        }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              analysisId: { type: 'string' },
              appId: { type: 'string' },
              platform: { type: 'string' },
              documents: {
                type: 'array',
                items: { type: 'string' }
              },
              status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { platform, appId } = request.params as { platform: 'ios' | 'android'; appId: string }
    const { documents = ['terms', 'privacy'] } = request.body as { documents?: string[] }

    // Get app metadata first
    const metadata = await appStoreService.getAppMetadata(appId, platform)
    if (!metadata) {
      return reply.status(404).send({
        success: false,
        error: 'App not found'
      })
    }

    // Extract documents if not already cached
    const appDocuments = await appStoreService.getAppDocuments(appId)
    const existingDocs = new Set(appDocuments.map(doc => doc.document_type))

    for (const docType of documents) {
      if (!existingDocs.has(docType as 'terms' | 'privacy')) {
        const url = docType === 'terms' ? metadata.terms_url : metadata.privacy_url
        if (url) {
          await appStoreService.extractAppDocument(appId, docType as 'terms' | 'privacy', url)
        }
      }
    }

    // Create analysis job
    const analysisId = generateId()
    const combinedText = appDocuments
      .filter(doc => documents.includes(doc.document_type))
      .map(doc => doc.content)
      .join('\n\n')

    if (!combinedText) {
      return reply.status(400).send({
        success: false,
        error: 'No documents available for analysis'
      })
    }

    // Store analysis job
    const insertQuery = `
      INSERT INTO analysis_jobs (id, user_id, status, progress, service_info, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `
    
    await db.postgres.query(insertQuery, [
      analysisId,
      'system', // System user for app store analyses
      'pending',
      0,
      JSON.stringify({
        type: 'app_analysis',
        appId,
        platform,
        appName: metadata.name,
        developer: metadata.developer,
        documents
      })
    ])

    // Process analysis asynchronously
    processAppAnalysis(analysisId, combinedText, metadata).catch(error => {
      fastify.log.error('App analysis failed', { error, analysisId, appId, platform })
    })

    return reply.send({
      success: true,
      data: {
        analysisId,
        appId,
        platform,
        documents,
        status: 'pending'
      }
    })
  } catch (error) {
    fastify.log.error('Failed to start app analysis', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to start app analysis' 
    })
  }
})

// Get app analysis results
fastify.get('/api/apps/analysis/:analysisId', {
  schema: {
    description: 'Get app analysis results',
    tags: ['apps'],
    params: {
      type: 'object',
      properties: {
        analysisId: { type: 'string' }
      },
      required: ['analysisId']
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string' },
              progress: { type: 'integer' },
              result: { type: 'object', nullable: true },
              serviceInfo: { type: 'object', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { analysisId } = request.params as { analysisId: string }

    const query = `
      SELECT id, status, progress, result, service_info as "serviceInfo", 
             created_at as "createdAt", updated_at as "updatedAt"
      FROM analysis_jobs 
      WHERE id = $1
    `
    
    const result = await db.postgres.query(query, [analysisId])
    
    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Analysis not found'
      })
    }

    return reply.send({
      success: true,
      data: result.rows[0]
    })
  } catch (error) {
    fastify.log.error('Failed to get app analysis', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to get app analysis' 
    })
  }
})

// Get popular apps
fastify.get('/api/apps/popular', {
  schema: {
    description: 'Get popular apps from app stores',
    tags: ['apps'],
    querystring: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['ios', 'android'] },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                developer: { type: 'string' },
                category: { type: 'string' },
                platform: { type: 'string' },
                bundle_id: { type: 'string' },
                icon_url: { type: 'string' },
                rating: { type: 'number' },
                review_count: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { platform, limit = 50 } = request.query as { 
      platform?: 'ios' | 'android'; 
      limit?: number 
    }

    const apps = await appStoreService.getPopularApps(platform, limit)
    
    return reply.send({
      success: true,
      data: apps
    })
  } catch (error) {
    fastify.log.error('Failed to get popular apps', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to get popular apps' 
    })
  }
})

// Cleanup expired cache (maintenance endpoint)
fastify.post('/api/apps/cleanup-cache', {
  preHandler: [authenticate], // Require authentication
  schema: {
    description: 'Cleanup expired app store cache entries',
    tags: ['apps'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    await appStoreService.cleanupExpiredCache()
    
    return reply.send({
      success: true,
      message: 'Cache cleanup completed'
    })
  } catch (error) {
    fastify.log.error('Failed to cleanup cache', { error })
    return reply.status(500).send({ 
      success: false, 
      error: 'Failed to cleanup cache' 
    })
  }
})

// Process app analysis (similar to existing document analysis)
async function processAppAnalysis(analysisId: string, text: string, appMetadata: any): Promise<void> {
  try {
    // Update status to processing
    await db.postgres.query(`
      UPDATE analysis_jobs 
      SET status = 'processing', progress = 10, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [analysisId])

    // Run AI analysis using the existing pipeline
    const aiResult = await runAIAnalysis(analysisId, text)

    // Enhanced result with app context
    const enhancedResult = {
      ...aiResult,
      appContext: {
        name: appMetadata.name,
        developer: appMetadata.developer,
        platform: appMetadata.platform,
        category: appMetadata.category,
        rating: appMetadata.rating,
        version: appMetadata.version
      },
      documentTypes: ['terms', 'privacy'], // Could be dynamic based on what was analyzed
      analysisType: 'app_store_analysis'
    }

    // Update with final results
    await db.postgres.query(`
      UPDATE analysis_jobs 
      SET status = 'completed', progress = 100, result = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [JSON.stringify(enhancedResult), analysisId])

    fastify.log.info('App analysis completed', { 
      analysisId, 
      appName: appMetadata.name,
      riskScore: aiResult.riskScore 
    })

  } catch (error) {
    // Update status to failed
    await db.postgres.query(`
      UPDATE analysis_jobs 
      SET status = 'failed', updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [analysisId])

    fastify.log.error('App analysis failed', { error, analysisId })
  }
}

// Graceful shutdown handling
const gracefulShutdown = async () => {
  fastify.log.info('Received shutdown signal, starting graceful shutdown...')
  
  try {
    // Close database connections
    if (db?.postgres) {
      await db.postgres.end()
      fastify.log.info('PostgreSQL connection closed')
    }
    
    if (db?.redis) {
      await db.redis.disconnect()
      fastify.log.info('Redis connection closed')
    }
    
    // Close Fastify server
    await fastify.close()
    fastify.log.info('Server closed successfully')
    
    process.exit(0)
  } catch (error) {
    fastify.log.error('Error during shutdown', { error })
    process.exit(1)
  }
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  fastify.log.fatal('Uncaught exception', { error })
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  fastify.log.fatal('Unhandled rejection', { reason, promise })
  process.exit(1)
})

// Start server
const start = async () => {
  try {
    // Initialize database connections
    db = await initializeDatabases()
    
    const port = Number(process.env.API_PORT) || 8000
    const host = process.env.API_HOST || '0.0.0.0'
    
    await fastify.listen({ port, host })
    
    fastify.log.info(`🚀 Fine Print AI API server listening on http://${host}:${port}`)
    fastify.log.info(`📚 API documentation available at http://${host}:${port}/docs`)
    fastify.log.info(`🔌 WebSocket endpoint available at ws://${host}:${port}/ws`)
    fastify.log.info(`📊 Metrics endpoint available at http://${host}:${port}/metrics`)
    fastify.log.info(`❤️  Health check available at http://${host}:${port}/health`)
    fastify.log.info(`✅ Readiness check available at http://${host}:${port}/ready`)
    
    // Log service configuration
    fastify.log.info('Service configuration:', {
      nodeEnv: process.env.NODE_ENV,
      logLevel: process.env.LOG_LEVEL,
      databaseUrl: process.env.DATABASE_URL ? '[CONFIGURED]' : '[NOT CONFIGURED]',
      redisUrl: process.env.REDIS_URL ? '[CONFIGURED]' : '[NOT CONFIGURED]',
      qdrantUrl: process.env.QDRANT_URL ? '[CONFIGURED]' : '[NOT CONFIGURED]',
      ollamaUrl: process.env.OLLAMA_URL ? '[CONFIGURED]' : '[NOT CONFIGURED]',
      corsOrigins: process.env.CORS_ORIGINS,
      featuresEnabled: {
        documentProcessing: process.env.ENABLE_DOCUMENT_PROCESSING === 'true',
        aiAnalysis: process.env.ENABLE_AI_ANALYSIS === 'true',
        realTimeMonitoring: process.env.ENABLE_REAL_TIME_MONITORING === 'true',
        metrics: process.env.ENABLE_METRICS === 'true'
      }
    })
    
  } catch (err) {
    console.error('Failed to start server - detailed error:')
    console.error(err)
    fastify.log.error('Failed to start server', { error: err?.message, stack: err?.stack })
    process.exit(1)
  }
}

start()

// Type declarations
declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number
    user?: {
      userId: string
      email: string
      role: string
    }
  }
}