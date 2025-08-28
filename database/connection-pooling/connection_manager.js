/**
 * Database Connection Manager for Fine Print AI
 * Intelligent connection pooling with automatic failover and load balancing
 */

const { Pool } = require('pg');
const EventEmitter = require('events');

class DatabaseConnectionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      // Primary database configuration
      primary: {
        host: options.primaryHost || process.env.DB_PRIMARY_HOST || 'localhost',
        port: options.primaryPort || process.env.DB_PRIMARY_PORT || 6432,
        database: options.database || process.env.DB_NAME || 'fineprintai',
        user: options.primaryUser || process.env.DB_PRIMARY_USER || 'fineprintai_app',
        password: options.primaryPassword || process.env.DB_PRIMARY_PASSWORD,
        
        // Connection pool settings optimized for PgBouncer
        max: options.primaryMaxConnections || 50,
        min: options.primaryMinConnections || 5,
        idleTimeoutMillis: options.idleTimeout || 30000,
        connectionTimeoutMillis: options.connectionTimeout || 10000,
        allowExitOnIdle: false,
        
        // Advanced pool settings
        maxUses: 7500, // Close connection after 7500 uses (before PgBouncer limit)
        statement_timeout: 300000, // 5 minutes
        query_timeout: 300000,
        
        // SSL configuration
        ssl: options.ssl || (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
        
        // Application name for monitoring
        application_name: `fineprintai-${process.env.NODE_ENV || 'development'}-${process.pid}`
      },
      
      // Read-only replica configuration
      readonly: {
        host: options.readonlyHost || process.env.DB_READONLY_HOST || 'localhost',
        port: options.readonlyPort || process.env.DB_READONLY_PORT || 6433,
        database: options.database || process.env.DB_NAME || 'fineprintai',
        user: options.readonlyUser || process.env.DB_READONLY_USER || 'fineprintai_readonly',
        password: options.readonlyPassword || process.env.DB_READONLY_PASSWORD,
        
        // Smaller pool for read-only operations
        max: options.readonlyMaxConnections || 25,
        min: options.readonlyMinConnections || 2,
        idleTimeoutMillis: options.idleTimeout || 30000,
        connectionTimeoutMillis: options.connectionTimeout || 10000,
        allowExitOnIdle: false,
        
        maxUses: 7500,
        statement_timeout: 300000,
        query_timeout: 300000,
        
        ssl: options.ssl || (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
        application_name: `fineprintai-readonly-${process.env.NODE_ENV || 'development'}-${process.pid}`
      }
    };
    
    // Connection pools
    this.pools = {
      primary: null,
      readonly: null
    };
    
    // Health monitoring
    this.health = {
      primary: { status: 'unknown', lastCheck: null, consecutiveFailures: 0 },
      readonly: { status: 'unknown', lastCheck: null, consecutiveFailures: 0 }
    };
    
    // Statistics tracking
    this.stats = {
      queries: { total: 0, successful: 0, failed: 0 },
      connections: { primary: 0, readonly: 0 },
      routingDecisions: { primary: 0, readonly: 0, fallback: 0 },
      healthChecks: { primary: 0, readonly: 0 },
      lastReset: new Date()
    };
    
    // Configuration
    this.healthCheckInterval = options.healthCheckInterval || 30000; // 30 seconds
    this.maxConsecutiveFailures = options.maxConsecutiveFailures || 3;
    this.queryTimeout = options.queryTimeout || 300000; // 5 minutes
    this.enableReadReplication = options.enableReadReplication !== false;
    
    this.initialize();
  }

  /**
   * Initialize connection pools and health monitoring
   */
  async initialize() {
    console.log('🔌 Initializing database connection manager...');
    
    try {
      // Create connection pools
      await this.createPools();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      // Set up event handlers
      this.setupEventHandlers();
      
      console.log('✅ Database connection manager initialized successfully');
      this.emit('ready');
      
    } catch (error) {
      console.error('❌ Failed to initialize database connection manager:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Create database connection pools
   */
  async createPools() {
    // Create primary pool
    this.pools.primary = new Pool(this.config.primary);
    
    // Create readonly pool if enabled
    if (this.enableReadReplication) {
      this.pools.readonly = new Pool(this.config.readonly);
    }
    
    // Test initial connections
    await this.testConnections();
  }

  /**
   * Test database connections
   */
  async testConnections() {
    console.log('🔍 Testing database connections...');
    
    // Test primary connection
    try {
      const client = await this.pools.primary.connect();
      await client.query('SELECT 1 as test');
      client.release();
      this.health.primary.status = 'healthy';
      console.log('✅ Primary database connection: OK');
    } catch (error) {
      this.health.primary.status = 'unhealthy';
      console.error('❌ Primary database connection failed:', error.message);
      throw error;
    }
    
    // Test readonly connection if enabled
    if (this.enableReadReplication && this.pools.readonly) {
      try {
        const client = await this.pools.readonly.connect();
        await client.query('SELECT 1 as test');
        client.release();
        this.health.readonly.status = 'healthy';
        console.log('✅ Readonly database connection: OK');
      } catch (error) {
        this.health.readonly.status = 'unhealthy';
        console.warn('⚠️  Readonly database connection failed:', error.message);
        // Don't throw error for readonly - we can fall back to primary
      }
    }
  }

  /**
   * Execute query with intelligent routing
   */
  async query(text, params = [], options = {}) {
    const startTime = Date.now();
    const queryId = this.generateQueryId();
    
    try {
      // Determine which pool to use
      const pool = this.selectPool(text, options);
      const poolType = pool === this.pools.primary ? 'primary' : 'readonly';
      
      // Track routing decision
      this.stats.routingDecisions[poolType]++;
      
      // Execute query with timeout
      const queryPromise = pool.query(text, params);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), this.queryTimeout);
      });
      
      const result = await Promise.race([queryPromise, timeoutPromise]);
      
      // Update statistics
      this.stats.queries.total++;
      this.stats.queries.successful++;
      
      const duration = Date.now() - startTime;
      this.emit('query', {
        queryId,
        poolType,
        duration,
        rowCount: result.rowCount,
        success: true
      });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Update error statistics
      this.stats.queries.total++;
      this.stats.queries.failed++;
      
      this.emit('queryError', {
        queryId,
        duration,
        error: error.message,
        query: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      });
      
      // Handle connection errors
      if (this.isConnectionError(error)) {
        await this.handleConnectionError(error);
      }
      
      throw error;
    }
  }

  /**
   * Select appropriate connection pool based on query characteristics
   */
  selectPool(query, options = {}) {
    // Force primary if specified
    if (options.forcePrimary || !this.enableReadReplication) {
      return this.pools.primary;
    }
    
    // Force readonly if specified and available
    if (options.forceReadonly && this.pools.readonly && this.health.readonly.status === 'healthy') {
      return this.pools.readonly;
    }
    
    // Analyze query to determine if it's read-only
    const isReadOnlyQuery = this.isReadOnlyQuery(query);
    
    // Route read-only queries to readonly pool if healthy
    if (isReadOnlyQuery && this.pools.readonly && this.health.readonly.status === 'healthy') {
      return this.pools.readonly;
    }
    
    // Default to primary pool
    return this.pools.primary;
  }

  /**
   * Determine if query is read-only
   */
  isReadOnlyQuery(query) {
    const normalizedQuery = query.trim().toLowerCase();
    
    // Read-only query patterns
    const readOnlyPatterns = [
      /^select\s/,
      /^with\s.*select\s/,
      /^explain\s/,
      /^show\s/,
      /^describe\s/,
      /^desc\s/
    ];
    
    // Write query patterns (takes precedence)
    const writePatterns = [
      /^insert\s/,
      /^update\s/,
      /^delete\s/,
      /^create\s/,
      /^drop\s/,
      /^alter\s/,
      /^truncate\s/,
      /^replace\s/,
      /^merge\s/,
      /^call\s/,
      /^exec\s/
    ];
    
    // Check for write patterns first
    if (writePatterns.some(pattern => pattern.test(normalizedQuery))) {
      return false;
    }
    
    // Check for read-only patterns
    return readOnlyPatterns.some(pattern => pattern.test(normalizedQuery));
  }

  /**
   * Get database client for transactions
   */
  async getClient(options = {}) {
    const pool = this.selectPool('SELECT 1', options);
    const client = await pool.connect();
    
    // Track connection
    const poolType = pool === this.pools.primary ? 'primary' : 'readonly';
    this.stats.connections[poolType]++;
    
    // Wrap release method to track disconnections
    const originalRelease = client.release.bind(client);
    client.release = (err) => {
      this.stats.connections[poolType]--;
      return originalRelease(err);
    };
    
    return client;
  }

  /**
   * Start transaction with automatic retry
   */
  async transaction(callback, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const client = await this.getClient({ forcePrimary: true }); // Transactions always on primary
      
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        client.release();
        return result;
        
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {}); // Ignore rollback errors
        client.release();
        
        if (attempt === maxRetries || !this.isRetryableError(error)) {
          throw error;
        }
        
        console.warn(`Transaction attempt ${attempt} failed, retrying in ${retryDelay}ms:`, error.message);
        await this.sleep(retryDelay * attempt);
      }
    }
  }

  /**
   * Health monitoring
   */
  startHealthMonitoring() {
    setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthCheckInterval);
    
    // Initial health check
    setTimeout(() => this.performHealthChecks(), 1000);
  }

  /**
   * Perform health checks on all pools
   */
  async performHealthChecks() {
    const checks = [];
    
    // Check primary pool
    checks.push(this.checkPoolHealth('primary', this.pools.primary));
    
    // Check readonly pool if enabled
    if (this.enableReadReplication && this.pools.readonly) {
      checks.push(this.checkPoolHealth('readonly', this.pools.readonly));
    }
    
    await Promise.allSettled(checks);
  }

  /**
   * Check health of a specific pool
   */
  async checkPoolHealth(poolType, pool) {
    const startTime = Date.now();
    this.stats.healthChecks[poolType]++;
    
    try {
      const client = await pool.connect();
      await client.query('SELECT 1 as health_check');
      client.release();
      
      // Update health status
      this.health[poolType].status = 'healthy';
      this.health[poolType].lastCheck = new Date();
      this.health[poolType].consecutiveFailures = 0;
      
      const duration = Date.now() - startTime;
      this.emit('healthCheck', { poolType, status: 'healthy', duration });
      
    } catch (error) {
      this.health[poolType].consecutiveFailures++;
      this.health[poolType].lastCheck = new Date();
      
      if (this.health[poolType].consecutiveFailures >= this.maxConsecutiveFailures) {
        this.health[poolType].status = 'unhealthy';
        this.emit('poolUnhealthy', { poolType, error: error.message, consecutiveFailures: this.health[poolType].consecutiveFailures });
      }
      
      const duration = Date.now() - startTime;
      this.emit('healthCheck', { poolType, status: 'unhealthy', duration, error: error.message });
    }
  }

  /**
   * Set up event handlers for pools
   */
  setupEventHandlers() {
    // Primary pool events
    this.pools.primary.on('connect', (client) => {
      this.emit('connect', { poolType: 'primary', totalCount: this.pools.primary.totalCount });
    });
    
    this.pools.primary.on('error', (error, client) => {
      this.emit('poolError', { poolType: 'primary', error: error.message });
    });
    
    this.pools.primary.on('remove', (client) => {
      this.emit('disconnect', { poolType: 'primary', totalCount: this.pools.primary.totalCount });
    });
    
    // Readonly pool events
    if (this.pools.readonly) {
      this.pools.readonly.on('connect', (client) => {
        this.emit('connect', { poolType: 'readonly', totalCount: this.pools.readonly.totalCount });
      });
      
      this.pools.readonly.on('error', (error, client) => {
        this.emit('poolError', { poolType: 'readonly', error: error.message });
      });
      
      this.pools.readonly.on('remove', (client) => {
        this.emit('disconnect', { poolType: 'readonly', totalCount: this.pools.readonly.totalCount });
      });
    }
  }

  /**
   * Handle connection errors
   */
  async handleConnectionError(error) {
    console.error('Database connection error:', error.message);
    
    // Trigger health checks immediately
    await this.performHealthChecks();
    
    // Emit error event for monitoring
    this.emit('connectionError', { error: error.message, timestamp: new Date() });
  }

  /**
   * Check if error is a connection-related error
   */
  isConnectionError(error) {
    const connectionErrorCodes = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'CONNECTION_CLOSED',
      'CONNECTION_TERMINATED'
    ];
    
    return connectionErrorCodes.some(code => 
      error.code === code || error.message.includes(code)
    );
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ECONNRESET',
      'serialization_failure',
      'deadlock_detected'
    ];
    
    return retryableErrors.some(code => 
      error.code === code || error.message.includes(code)
    );
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const now = new Date();
    const uptime = now - this.stats.lastReset;
    
    return {
      uptime,
      queries: { ...this.stats.queries },
      connections: { ...this.stats.connections },
      routingDecisions: { ...this.stats.routingDecisions },
      healthChecks: { ...this.stats.healthChecks },
      health: { ...this.health },
      pools: {
        primary: {
          totalCount: this.pools.primary?.totalCount || 0,
          idleCount: this.pools.primary?.idleCount || 0,
          waitingCount: this.pools.primary?.waitingCount || 0
        },
        readonly: this.pools.readonly ? {
          totalCount: this.pools.readonly.totalCount,
          idleCount: this.pools.readonly.idleCount,
          waitingCount: this.pools.readonly.waitingCount
        } : null
      },
      timestamp: now
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats.queries = { total: 0, successful: 0, failed: 0 };
    this.stats.connections = { primary: 0, readonly: 0 };
    this.stats.routingDecisions = { primary: 0, readonly: 0, fallback: 0 };
    this.stats.healthChecks = { primary: 0, readonly: 0 };
    this.stats.lastReset = new Date();
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🔌 Shutting down database connection manager...');
    
    try {
      const shutdownPromises = [];
      
      if (this.pools.primary) {
        shutdownPromises.push(this.pools.primary.end());
      }
      
      if (this.pools.readonly) {
        shutdownPromises.push(this.pools.readonly.end());
      }
      
      await Promise.all(shutdownPromises);
      
      console.log('✅ Database connection manager shut down successfully');
      this.emit('shutdown');
      
    } catch (error) {
      console.error('❌ Error during database connection manager shutdown:', error);
      throw error;
    }
  }

  // Utility methods
  generateQueryId() {
    return Math.random().toString(36).substring(2, 15);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DatabaseConnectionManager;