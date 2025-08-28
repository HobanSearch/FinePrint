import neo4j, { Driver, Session, Transaction, Result, Integer } from 'neo4j-driver';
import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import Redis from 'ioredis';
import { z } from 'zod';

const logger = createServiceLogger('neo4j-service');

// Neo4j Configuration Schema
const Neo4jConfigSchema = z.object({
  url: z.string().url(),
  username: z.string(),
  password: z.string(),
  database: z.string().default('neo4j'),
  max_connection_lifetime: z.number().default(3600000), // 1 hour
  max_connection_pool_size: z.number().default(50),
  connection_acquisition_timeout: z.number().default(60000), // 1 minute
  max_transaction_retry_time: z.number().default(30000), // 30 seconds
});

type Neo4jConfig = z.infer<typeof Neo4jConfigSchema>;

// Query Builder Interface
export interface QueryBuilder {
  match(pattern: string): QueryBuilder;
  where(condition: string): QueryBuilder;
  create(pattern: string): QueryBuilder;
  merge(pattern: string): QueryBuilder;
  set(properties: string): QueryBuilder;
  delete(nodes: string): QueryBuilder;
  return(fields: string): QueryBuilder;
  orderBy(field: string, direction?: 'ASC' | 'DESC'): QueryBuilder;
  limit(count: number): QueryBuilder;
  skip(count: number): QueryBuilder;
  with(fields: string): QueryBuilder;
  optional(pattern: string): QueryBuilder;
  unwind(collection: string, variable: string): QueryBuilder;
  build(): { cypher: string; parameters: Record<string, any> };
}

// Transaction Options
export interface TransactionOptions {
  timeout?: number;
  metadata?: Record<string, any>;
  mode?: 'READ' | 'WRITE';
}

// Query Statistics
export interface QueryStats {
  query: string;
  parameters: Record<string, any>;
  execution_time_ms: number;
  records_returned: number;
  nodes_created: number;
  nodes_deleted: number;
  relationships_created: number;
  relationships_deleted: number;
  properties_set: number;
  labels_added: number;
  labels_removed: number;
  indexes_added: number;
  indexes_removed: number;
  constraints_added: number;
  constraints_removed: number;
}

/**
 * Enhanced Neo4j Service with connection pooling, query optimization,
 * caching, and comprehensive monitoring
 */
export class Neo4jService {
  private driver: Driver | null = null;
  private config: Neo4jConfig;
  private redis: Redis;
  private queryCache: Map<string, { result: any; timestamp: number }> = new Map();
  private queryStats: QueryStats[] = [];
  private readonly cacheTimeout = 300000; // 5 minutes
  private readonly maxCacheSize = 10000;
  private readonly maxStatsHistory = 1000;

  constructor() {
    this.config = Neo4jConfigSchema.parse({
      url: config.neo4j?.url || 'bolt://localhost:7687',
      username: config.neo4j?.username || 'neo4j',
      password: config.neo4j?.password || 'password',
      database: config.neo4j?.database || 'neo4j',
      max_connection_lifetime: config.neo4j?.maxConnectionLifetime || 3600000,
      max_connection_pool_size: config.neo4j?.maxConnectionPoolSize || 50,
      connection_acquisition_timeout: config.neo4j?.connectionAcquisitionTimeout || 60000,
      max_transaction_retry_time: config.neo4j?.maxTransactionRetryTime || 30000,
    });

    this.redis = new Redis({
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      password: config.redis?.password,
      db: config.redis?.database || 5, // Separate DB for knowledge graph cache
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  /**
   * Initialize Neo4j connection and set up database constraints
   */
  async initialize(): Promise<void> {
    try {
      // Create Neo4j driver
      this.driver = neo4j.driver(
        this.config.url,
        neo4j.auth.basic(this.config.username, this.config.password),
        {
          maxConnectionLifetime: this.config.max_connection_lifetime,
          maxConnectionPoolSize: this.config.max_connection_pool_size,
          connectionAcquisitionTimeout: this.config.connection_acquisition_timeout,
          maxTransactionRetryTime: this.config.max_transaction_retry_time,
          disableLosslessIntegers: true,
        }
      );

      // Verify connectivity
      await this.driver.getServerInfo();

      // Connect to Redis
      await this.redis.connect();

      // Set up database schema and indexes
      await this.setupDatabaseSchema();

      logger.info('Neo4j service initialized successfully', {
        url: this.config.url,
        database: this.config.database,
        poolSize: this.config.max_connection_pool_size,
      });

    } catch (error) {
      logger.error('Failed to initialize Neo4j service', { error });
      throw error;
    }
  }

  /**
   * Set up database schema, constraints, and indexes for optimal performance
   */
  private async setupDatabaseSchema(): Promise<void> {
    const session = this.getSession();
    
    try {
      // Create constraints and indexes for comprehensive business intelligence graph
      const schemaQueries = [
        // ===== CUSTOMER RELATIONSHIP GRAPH CONSTRAINTS =====
        'CREATE CONSTRAINT customer_id IF NOT EXISTS FOR (c:Customer) REQUIRE c.id IS UNIQUE',
        'CREATE CONSTRAINT customer_email IF NOT EXISTS FOR (c:Customer) REQUIRE c.email IS UNIQUE',
        'CREATE CONSTRAINT customer_interaction_id IF NOT EXISTS FOR (ci:CustomerInteraction) REQUIRE ci.id IS UNIQUE',
        'CREATE CONSTRAINT customer_journey_stage_id IF NOT EXISTS FOR (cjs:CustomerJourneyStage) REQUIRE cjs.id IS UNIQUE',
        
        // ===== PRODUCT KNOWLEDGE GRAPH CONSTRAINTS =====
        'CREATE CONSTRAINT product_feature_id IF NOT EXISTS FOR (pf:ProductFeature) REQUIRE pf.id IS UNIQUE',
        'CREATE CONSTRAINT product_feature_name IF NOT EXISTS FOR (pf:ProductFeature) REQUIRE pf.name IS UNIQUE',
        'CREATE CONSTRAINT product_usage_event_id IF NOT EXISTS FOR (pue:ProductUsageEvent) REQUIRE pue.id IS UNIQUE',
        'CREATE CONSTRAINT product_feedback_id IF NOT EXISTS FOR (pf:ProductFeedback) REQUIRE pf.id IS UNIQUE',
        
        // ===== LEGAL KNOWLEDGE GRAPH CONSTRAINTS =====
        'CREATE CONSTRAINT legal_document_type_id IF NOT EXISTS FOR (ldt:LegalDocumentType) REQUIRE ldt.id IS UNIQUE',
        'CREATE CONSTRAINT legal_clause_type_id IF NOT EXISTS FOR (lct:LegalClauseType) REQUIRE lct.id IS UNIQUE',
        'CREATE CONSTRAINT risk_pattern_id IF NOT EXISTS FOR (rp:RiskPattern) REQUIRE rp.id IS UNIQUE',
        'CREATE CONSTRAINT risk_pattern_name IF NOT EXISTS FOR (rp:RiskPattern) REQUIRE rp.name IS UNIQUE',
        
        // ===== MARKET INTELLIGENCE GRAPH CONSTRAINTS =====
        'CREATE CONSTRAINT competitor_id IF NOT EXISTS FOR (c:Competitor) REQUIRE c.id IS UNIQUE',
        'CREATE CONSTRAINT competitor_name IF NOT EXISTS FOR (c:Competitor) REQUIRE c.name IS UNIQUE',
        'CREATE CONSTRAINT market_trend_id IF NOT EXISTS FOR (mt:MarketTrend) REQUIRE mt.id IS UNIQUE',
        'CREATE CONSTRAINT market_opportunity_id IF NOT EXISTS FOR (mo:MarketOpportunity) REQUIRE mo.id IS UNIQUE',
        
        // ===== BUSINESS PROCESS GRAPH CONSTRAINTS =====
        'CREATE CONSTRAINT business_process_id IF NOT EXISTS FOR (bp:BusinessProcess) REQUIRE bp.id IS UNIQUE',
        'CREATE CONSTRAINT business_process_name IF NOT EXISTS FOR (bp:BusinessProcess) REQUIRE bp.name IS UNIQUE',
        'CREATE CONSTRAINT process_step_id IF NOT EXISTS FOR (ps:ProcessStep) REQUIRE ps.id IS UNIQUE',
        'CREATE CONSTRAINT process_bottleneck_id IF NOT EXISTS FOR (pb:ProcessBottleneck) REQUIRE pb.id IS UNIQUE',
        
        // ===== AGENT COORDINATION GRAPH CONSTRAINTS =====
        'CREATE CONSTRAINT agent_id IF NOT EXISTS FOR (a:Agent) REQUIRE a.id IS UNIQUE',
        'CREATE CONSTRAINT agent_name IF NOT EXISTS FOR (a:Agent) REQUIRE a.name IS UNIQUE',
        'CREATE CONSTRAINT task_id IF NOT EXISTS FOR (t:Task) REQUIRE t.id IS UNIQUE',
        'CREATE CONSTRAINT agent_collaboration_id IF NOT EXISTS FOR (ac:AgentCollaboration) REQUIRE ac.id IS UNIQUE',
        
        // ===== LEGACY LEGAL CONSTRAINTS (backward compatibility) =====
        'CREATE CONSTRAINT legal_concept_id IF NOT EXISTS FOR (lc:LegalConcept) REQUIRE lc.id IS UNIQUE',
        'CREATE CONSTRAINT legal_concept_name IF NOT EXISTS FOR (lc:LegalConcept) REQUIRE lc.name IS UNIQUE',
        'CREATE CONSTRAINT legal_clause_id IF NOT EXISTS FOR (lc:LegalClause) REQUIRE lc.id IS UNIQUE',
        'CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE',
        'CREATE CONSTRAINT document_hash IF NOT EXISTS FOR (d:Document) REQUIRE d.content_hash IS UNIQUE',
        'CREATE CONSTRAINT pattern_id IF NOT EXISTS FOR (p:Pattern) REQUIRE p.id IS UNIQUE',
        'CREATE CONSTRAINT pattern_name IF NOT EXISTS FOR (p:Pattern) REQUIRE p.name IS UNIQUE',
        'CREATE CONSTRAINT jurisdiction_code IF NOT EXISTS FOR (j:Jurisdiction) REQUIRE j.code IS UNIQUE',
        
        // ===== PERFORMANCE INDEXES =====
        
        // Customer indexes
        'CREATE INDEX customer_status IF NOT EXISTS FOR (c:Customer) ON (c.status)',
        'CREATE INDEX customer_subscription_tier IF NOT EXISTS FOR (c:Customer) ON (c.subscription_tier)',
        'CREATE INDEX customer_industry IF NOT EXISTS FOR (c:Customer) ON (c.industry)',
        'CREATE INDEX customer_risk_score IF NOT EXISTS FOR (c:Customer) ON (c.risk_score)',
        'CREATE INDEX customer_created_at IF NOT EXISTS FOR (c:Customer) ON (c.created_at)',
        'CREATE INDEX customer_last_active IF NOT EXISTS FOR (c:Customer) ON (c.last_active)',
        
        // Customer interaction indexes
        'CREATE INDEX customer_interaction_type IF NOT EXISTS FOR (ci:CustomerInteraction) ON (ci.type)',
        'CREATE INDEX customer_interaction_timestamp IF NOT EXISTS FOR (ci:CustomerInteraction) ON (ci.timestamp)',
        'CREATE INDEX customer_interaction_outcome IF NOT EXISTS FOR (ci:CustomerInteraction) ON (ci.outcome)',
        'CREATE INDEX customer_interaction_channel IF NOT EXISTS FOR (ci:CustomerInteraction) ON (ci.channel)',
        
        // Product feature indexes
        'CREATE INDEX product_feature_category IF NOT EXISTS FOR (pf:ProductFeature) ON (pf.category)',
        'CREATE INDEX product_feature_status IF NOT EXISTS FOR (pf:ProductFeature) ON (pf.status)',
        'CREATE INDEX product_feature_success_rate IF NOT EXISTS FOR (pf:ProductFeature) ON (pf.success_rate)',
        'CREATE INDEX product_feature_usage_count IF NOT EXISTS FOR (pf:ProductFeature) ON (pf.usage_count)',
        
        // Product usage indexes
        'CREATE INDEX product_usage_timestamp IF NOT EXISTS FOR (pue:ProductUsageEvent) ON (pue.timestamp)',
        'CREATE INDEX product_usage_success IF NOT EXISTS FOR (pue:ProductUsageEvent) ON (pue.success)',
        'CREATE INDEX product_usage_processing_time IF NOT EXISTS FOR (pue:ProductUsageEvent) ON (pue.processing_time_ms)',
        
        // Legal knowledge indexes
        'CREATE INDEX legal_document_type_category IF NOT EXISTS FOR (ldt:LegalDocumentType) ON (ldt.category)',
        'CREATE INDEX legal_clause_type_category IF NOT EXISTS FOR (lct:LegalClauseType) ON (lct.category)',
        'CREATE INDEX legal_clause_type_severity IF NOT EXISTS FOR (lct:LegalClauseType) ON (lct.severity)',
        'CREATE INDEX risk_pattern_category IF NOT EXISTS FOR (rp:RiskPattern) ON (rp.category)',
        'CREATE INDEX risk_pattern_severity IF NOT EXISTS FOR (rp:RiskPattern) ON (rp.severity)',
        'CREATE INDEX risk_pattern_accuracy IF NOT EXISTS FOR (rp:RiskPattern) ON (rp.accuracy)',
        
        // Market intelligence indexes
        'CREATE INDEX competitor_category IF NOT EXISTS FOR (c:Competitor) ON (c.category)',
        'CREATE INDEX market_trend_category IF NOT EXISTS FOR (mt:MarketTrend) ON (mt.category)',
        'CREATE INDEX market_trend_impact IF NOT EXISTS FOR (mt:MarketTrend) ON (mt.impact)',
        'CREATE INDEX market_trend_confidence IF NOT EXISTS FOR (mt:MarketTrend) ON (mt.confidence)',
        'CREATE INDEX market_opportunity_category IF NOT EXISTS FOR (mo:MarketOpportunity) ON (mo.category)',
        'CREATE INDEX market_opportunity_status IF NOT EXISTS FOR (mo:MarketOpportunity) ON (mo.status)',
        'CREATE INDEX market_opportunity_revenue_potential IF NOT EXISTS FOR (mo:MarketOpportunity) ON (mo.revenue_potential)',
        
        // Business process indexes
        'CREATE INDEX business_process_category IF NOT EXISTS FOR (bp:BusinessProcess) ON (bp.category)',
        'CREATE INDEX business_process_status IF NOT EXISTS FOR (bp:BusinessProcess) ON (bp.status)',
        'CREATE INDEX business_process_automation_level IF NOT EXISTS FOR (bp:BusinessProcess) ON (bp.automation_level)',
        'CREATE INDEX business_process_success_rate IF NOT EXISTS FOR (bp:BusinessProcess) ON (bp.success_rate)',
        'CREATE INDEX process_step_order IF NOT EXISTS FOR (ps:ProcessStep) ON (ps.order)',
        'CREATE INDEX process_step_type IF NOT EXISTS FOR (ps:ProcessStep) ON (ps.type)',
        'CREATE INDEX process_bottleneck_impact_score IF NOT EXISTS FOR (pb:ProcessBottleneck) ON (pb.impact_score)',
        'CREATE INDEX process_bottleneck_status IF NOT EXISTS FOR (pb:ProcessBottleneck) ON (pb.status)',
        
        // Agent coordination indexes
        'CREATE INDEX agent_type IF NOT EXISTS FOR (a:Agent) ON (a.type)',
        'CREATE INDEX agent_status IF NOT EXISTS FOR (a:Agent) ON (a.status)',
        'CREATE INDEX agent_load_factor IF NOT EXISTS FOR (a:Agent) ON (a.load_factor)',
        'CREATE INDEX agent_success_rate IF NOT EXISTS FOR (a:Agent) ON (a.success_rate)',
        'CREATE INDEX task_type IF NOT EXISTS FOR (t:Task) ON (t.type)',
        'CREATE INDEX task_priority IF NOT EXISTS FOR (t:Task) ON (t.priority)',
        'CREATE INDEX task_status IF NOT EXISTS FOR (t:Task) ON (t.status)',
        'CREATE INDEX task_created_at IF NOT EXISTS FOR (t:Task) ON (t.created_at)',
        'CREATE INDEX task_due_date IF NOT EXISTS FOR (t:Task) ON (t.due_date)',
        
        // Legacy legal indexes (backward compatibility)
        'CREATE INDEX legal_concept_category IF NOT EXISTS FOR (lc:LegalConcept) ON (lc.category)',
        'CREATE INDEX legal_concept_difficulty IF NOT EXISTS FOR (lc:LegalConcept) ON (lc.difficulty_level)',
        'CREATE INDEX legal_clause_severity IF NOT EXISTS FOR (lc:LegalClause) ON (lc.severity)',
        'CREATE INDEX legal_clause_confidence IF NOT EXISTS FOR (lc:LegalClause) ON (lc.confidence_score)',
        'CREATE INDEX document_type IF NOT EXISTS FOR (d:Document) ON (d.document_type)',
        'CREATE INDEX document_created IF NOT EXISTS FOR (d:Document) ON (d.created_at)',
        'CREATE INDEX pattern_severity IF NOT EXISTS FOR (p:Pattern) ON (p.severity)',
        'CREATE INDEX pattern_frequency IF NOT EXISTS FOR (p:Pattern) ON (p.frequency)',
        
        // ===== FULL-TEXT SEARCH INDEXES =====
        'CALL db.index.fulltext.createNodeIndex("customerSearch", ["Customer"], ["name", "email", "company"])',
        'CALL db.index.fulltext.createNodeIndex("productFeatureSearch", ["ProductFeature"], ["name", "description"])',
        'CALL db.index.fulltext.createNodeIndex("productFeedbackSearch", ["ProductFeedback"], ["title", "description"])',
        'CALL db.index.fulltext.createNodeIndex("competitorSearch", ["Competitor"], ["name", "description"])',
        'CALL db.index.fulltext.createNodeIndex("marketTrendSearch", ["MarketTrend"], ["name", "description"])',
        'CALL db.index.fulltext.createNodeIndex("businessProcessSearch", ["BusinessProcess"], ["name", "description"])',
        'CALL db.index.fulltext.createNodeIndex("agentSearch", ["Agent"], ["name", "description", "capabilities"])',
        'CALL db.index.fulltext.createNodeIndex("taskSearch", ["Task"], ["title", "description"])',
        
        // Legacy full-text indexes (backward compatibility)
        'CALL db.index.fulltext.createNodeIndex("legalConceptSearch", ["LegalConcept"], ["name", "description", "keywords"])',
        'CALL db.index.fulltext.createNodeIndex("legalClauseSearch", ["LegalClause"], ["title", "description", "text_content"])',
        'CALL db.index.fulltext.createNodeIndex("documentSearch", ["Document"], ["title", "content"])',
        
        // ===== VECTOR INDEXES FOR SEMANTIC SEARCH =====
        'CALL db.index.vector.createNodeIndex("customerEmbedding", "Customer", "embedding", 384, "cosine")',
        'CALL db.index.vector.createNodeIndex("productFeatureEmbedding", "ProductFeature", "embedding", 384, "cosine")',
        'CALL db.index.vector.createNodeIndex("marketTrendEmbedding", "MarketTrend", "embedding", 384, "cosine")',
        'CALL db.index.vector.createNodeIndex("processEmbedding", "BusinessProcess", "embedding", 384, "cosine")',
        'CALL db.index.vector.createNodeIndex("agentEmbedding", "Agent", "embedding", 384, "cosine")',
      ];

      for (const query of schemaQueries) {
        try {
          await session.run(query);
          logger.debug('Schema query executed', { query });
        } catch (error: any) {
          // Ignore constraint/index already exists errors
          if (!error.message.includes('already exists') && !error.message.includes('equivalent')) {
            logger.warn('Schema query failed', { query, error: error.message });
          }
        }
      }

      logger.info('Database schema setup completed');

    } finally {
      await session.close();
    }
  }

  /**
   * Get a new session for database operations
   */
  getSession(database?: string, mode: 'READ' | 'WRITE' = 'WRITE'): Session {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized');
    }

    return this.driver.session({
      database: database || this.config.database,
      defaultAccessMode: mode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE,
    });
  }

  /**
   * Execute a Cypher query with caching and performance monitoring
   */
  async executeQuery(
    cypher: string,
    parameters: Record<string, any> = {},
    options: {
      cache?: boolean;
      cacheKey?: string;
      timeout?: number;
      session?: Session;
    } = {}
  ): Promise<Result> {
    const startTime = Date.now();
    const cacheKey = options.cacheKey || this.generateCacheKey(cypher, parameters);

    // Check cache first
    if (options.cache !== false) {
      const cached = await this.getCachedResult(cacheKey);
      if (cached) {
        logger.debug('Query result returned from cache', { cacheKey });
        return cached;
      }
    }

    // Execute query
    const session = options.session || this.getSession();
    const shouldCloseSession = !options.session;

    try {
      logger.debug('Executing Cypher query', { 
        cypher: cypher.substring(0, 200),
        parametersCount: Object.keys(parameters).length 
      });

      const result = await session.run(cypher, parameters);
      const executionTime = Date.now() - startTime;

      // Collect statistics
      this.collectQueryStats(cypher, parameters, result, executionTime);

      // Cache result if requested
      if (options.cache !== false && result.records.length > 0) {
        await this.cacheResult(cacheKey, result);
      }

      logger.debug('Query executed successfully', {
        executionTime,
        recordsReturned: result.records.length,
        cached: options.cache !== false,
      });

      return result;

    } catch (error) {
      logger.error('Query execution failed', {
        error,
        cypher: cypher.substring(0, 200),
        parametersCount: Object.keys(parameters).length,
        executionTime: Date.now() - startTime,
      });
      throw error;
    } finally {
      if (shouldCloseSession) {
        await session.close();
      }
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async executeTransaction<T>(
    transactionFunction: (tx: Transaction) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const session = this.getSession(undefined, options.mode || 'WRITE');
    
    try {
      const result = await session.executeWrite(async (tx) => {
        if (options.timeout) {
          tx.run('CALL apoc.util.sleep($timeout)', { timeout: options.timeout });
        }
        return await transactionFunction(tx);
      });

      return result;
    } catch (error) {
      logger.error('Transaction execution failed', { error, options });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create a query builder for fluent query construction
   */
  queryBuilder(): QueryBuilder {
    return new CypherQueryBuilder();
  }

  /**
   * Batch operations for better performance
   */
  async batchExecute(
    queries: Array<{ cypher: string; parameters: Record<string, any> }>,
    batchSize: number = 100
  ): Promise<Result[]> {
    const results: Result[] = [];
    const session = this.getSession();

    try {
      for (let i = 0; i < queries.length; i += batchSize) {
        const batch = queries.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(
          batch.map(({ cypher, parameters }) => 
            session.run(cypher, parameters)
          )
        );
        
        results.push(...batchResults);
        
        logger.debug('Batch executed', {
          batchIndex: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
          totalBatches: Math.ceil(queries.length / batchSize),
        });
      }

      return results;
    } finally {
      await session.close();
    }
  }

  /**
   * Get query performance statistics
   */
  getQueryStats(): QueryStats[] {
    return [...this.queryStats];
  }

  /**
   * Clear query statistics
   */
  clearQueryStats(): void {
    this.queryStats = [];
  }

  /**
   * Health check for Neo4j connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.driver) return false;
      
      const session = this.getSession();
      try {
        await session.run('RETURN 1');
        return true;
      } finally {
        await session.close();
      }
    } catch (error) {
      logger.error('Neo4j health check failed', { error });
      return false;
    }
  }

  /**
   * Get database information and statistics
   */
  async getDatabaseInfo(): Promise<{
    version: string;
    edition: string;
    nodeCount: number;
    relationshipCount: number;
    propertyCount: number;
    labelCount: number;
    relationshipTypeCount: number;
  }> {
    const session = this.getSession('system', 'READ');
    
    try {
      // Get version info
      const versionResult = await session.run('CALL dbms.components()');
      const version = versionResult.records[0]?.get('versions')[0] || 'unknown';
      const edition = versionResult.records[0]?.get('edition') || 'unknown';

      // Switch to main database for counts
      const mainSession = this.getSession(this.config.database, 'READ');
      
      try {
        // Get counts
        const countsResult = await mainSession.run(`
          CALL apoc.meta.stats() YIELD nodeCount, relCount, propCount, labelCount, relTypeCount
          RETURN nodeCount, relCount AS relationshipCount, propCount AS propertyCount, 
                 labelCount, relTypeCount AS relationshipTypeCount
        `);

        const counts = countsResult.records[0];
        
        return {
          version,
          edition,
          nodeCount: counts?.get('nodeCount')?.toNumber() || 0,
          relationshipCount: counts?.get('relationshipCount')?.toNumber() || 0,
          propertyCount: counts?.get('propertyCount')?.toNumber() || 0,
          labelCount: counts?.get('labelCount')?.toNumber() || 0,
          relationshipTypeCount: counts?.get('relationshipTypeCount')?.toNumber() || 0,
        };
      } finally {
        await mainSession.close();
      }
    } catch (error) {
      logger.error('Failed to get database info', { error });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Shutdown service and close connections
   */
  async shutdown(): Promise<void> {
    try {
      if (this.driver) {
        await this.driver.close();
        this.driver = null;
      }
      
      await this.redis.disconnect();
      
      logger.info('Neo4j service shutdown completed');
    } catch (error) {
      logger.error('Error during Neo4j service shutdown', { error });
      throw error;
    }
  }

  // Private helper methods

  private generateCacheKey(cypher: string, parameters: Record<string, any>): string {
    const paramString = JSON.stringify(parameters, Object.keys(parameters).sort());
    return `neo4j:${Buffer.from(cypher + paramString).toString('base64')}`;
  }

  private async getCachedResult(cacheKey: string): Promise<Result | null> {
    try {
      const cached = this.queryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.result;
      }

      // Try Redis cache
      const redisCached = await this.redis.get(cacheKey);
      if (redisCached) {
        const result = JSON.parse(redisCached);
        this.queryCache.set(cacheKey, { result, timestamp: Date.now() });
        return result;
      }

      return null;
    } catch (error) {
      logger.warn('Failed to get cached result', { error, cacheKey });
      return null;
    }
  }

  private async cacheResult(cacheKey: string, result: Result): Promise<void> {
    try {
      // Cache in memory
      if (this.queryCache.size >= this.maxCacheSize) {
        const oldestKey = this.queryCache.keys().next().value;
        this.queryCache.delete(oldestKey);
      }
      
      this.queryCache.set(cacheKey, { result, timestamp: Date.now() });

      // Cache in Redis
      await this.redis.setex(cacheKey, Math.floor(this.cacheTimeout / 1000), JSON.stringify(result));
    } catch (error) {
      logger.warn('Failed to cache result', { error, cacheKey });
    }
  }

  private collectQueryStats(
    cypher: string,
    parameters: Record<string, any>,
    result: Result,
    executionTime: number
  ): void {
    try {
      const stats: QueryStats = {
        query: cypher.substring(0, 200),
        parameters,
        execution_time_ms: executionTime,
        records_returned: result.records.length,
        nodes_created: result.summary.counters.updates().nodesCreated,
        nodes_deleted: result.summary.counters.updates().nodesDeleted,
        relationships_created: result.summary.counters.updates().relationshipsCreated,
        relationships_deleted: result.summary.counters.updates().relationshipsDeleted,
        properties_set: result.summary.counters.updates().propertiesSet,
        labels_added: result.summary.counters.updates().labelsAdded,
        labels_removed: result.summary.counters.updates().labelsRemoved,
        indexes_added: result.summary.counters.updates().indexesAdded,
        indexes_removed: result.summary.counters.updates().indexesRemoved,
        constraints_added: result.summary.counters.updates().constraintsAdded,
        constraints_removed: result.summary.counters.updates().constraintsRemoved,
      };

      this.queryStats.push(stats);

      // Keep only recent stats
      if (this.queryStats.length > this.maxStatsHistory) {
        this.queryStats = this.queryStats.slice(-this.maxStatsHistory);
      }
    } catch (error) {
      logger.warn('Failed to collect query stats', { error });
    }
  }
}

/**
 * Fluent Cypher Query Builder
 */
class CypherQueryBuilder implements QueryBuilder {
  private clauses: string[] = [];
  private params: Record<string, any> = {};
  private paramCounter = 0;

  match(pattern: string): QueryBuilder {
    this.clauses.push(`MATCH ${pattern}`);
    return this;
  }

  where(condition: string): QueryBuilder {
    this.clauses.push(`WHERE ${condition}`);
    return this;
  }

  create(pattern: string): QueryBuilder {
    this.clauses.push(`CREATE ${pattern}`);
    return this;
  }

  merge(pattern: string): QueryBuilder {
    this.clauses.push(`MERGE ${pattern}`);
    return this;
  }

  set(properties: string): QueryBuilder {
    this.clauses.push(`SET ${properties}`);
    return this;
  }

  delete(nodes: string): QueryBuilder {
    this.clauses.push(`DELETE ${nodes}`);
    return this;
  }

  return(fields: string): QueryBuilder {
    this.clauses.push(`RETURN ${fields}`);
    return this;
  }

  orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): QueryBuilder {
    this.clauses.push(`ORDER BY ${field} ${direction}`);
    return this;
  }

  limit(count: number): QueryBuilder {
    this.clauses.push(`LIMIT ${count}`);
    return this;
  }

  skip(count: number): QueryBuilder {
    this.clauses.push(`SKIP ${count}`);
    return this;
  }

  with(fields: string): QueryBuilder {
    this.clauses.push(`WITH ${fields}`);
    return this;
  }

  optional(pattern: string): QueryBuilder {
    this.clauses.push(`OPTIONAL MATCH ${pattern}`);
    return this;
  }

  unwind(collection: string, variable: string): QueryBuilder {
    this.clauses.push(`UNWIND ${collection} AS ${variable}`);
    return this;
  }

  build(): { cypher: string; parameters: Record<string, any> } {
    return {
      cypher: this.clauses.join('\n'),
      parameters: this.params,
    };
  }

  private addParameter(value: any): string {
    const paramName = `param${this.paramCounter++}`;
    this.params[paramName] = value;
    return `$${paramName}`;
  }
}