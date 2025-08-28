"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Neo4jService = void 0;
const neo4j_driver_1 = __importDefault(require("neo4j-driver"));
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const ioredis_1 = __importDefault(require("ioredis"));
const zod_1 = require("zod");
const logger = (0, logger_1.createServiceLogger)('neo4j-service');
const Neo4jConfigSchema = zod_1.z.object({
    url: zod_1.z.string().url(),
    username: zod_1.z.string(),
    password: zod_1.z.string(),
    database: zod_1.z.string().default('neo4j'),
    max_connection_lifetime: zod_1.z.number().default(3600000),
    max_connection_pool_size: zod_1.z.number().default(50),
    connection_acquisition_timeout: zod_1.z.number().default(60000),
    max_transaction_retry_time: zod_1.z.number().default(30000),
});
class Neo4jService {
    driver = null;
    config;
    redis;
    queryCache = new Map();
    queryStats = [];
    cacheTimeout = 300000;
    maxCacheSize = 10000;
    maxStatsHistory = 1000;
    constructor() {
        this.config = Neo4jConfigSchema.parse({
            url: config_1.config.neo4j?.url || 'bolt://localhost:7687',
            username: config_1.config.neo4j?.username || 'neo4j',
            password: config_1.config.neo4j?.password || 'password',
            database: config_1.config.neo4j?.database || 'neo4j',
            max_connection_lifetime: config_1.config.neo4j?.maxConnectionLifetime || 3600000,
            max_connection_pool_size: config_1.config.neo4j?.maxConnectionPoolSize || 50,
            connection_acquisition_timeout: config_1.config.neo4j?.connectionAcquisitionTimeout || 60000,
            max_transaction_retry_time: config_1.config.neo4j?.maxTransactionRetryTime || 30000,
        });
        this.redis = new ioredis_1.default({
            host: config_1.config.redis?.host || 'localhost',
            port: config_1.config.redis?.port || 6379,
            password: config_1.config.redis?.password,
            db: config_1.config.redis?.database || 5,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
        });
    }
    async initialize() {
        try {
            this.driver = neo4j_driver_1.default.driver(this.config.url, neo4j_driver_1.default.auth.basic(this.config.username, this.config.password), {
                maxConnectionLifetime: this.config.max_connection_lifetime,
                maxConnectionPoolSize: this.config.max_connection_pool_size,
                connectionAcquisitionTimeout: this.config.connection_acquisition_timeout,
                maxTransactionRetryTime: this.config.max_transaction_retry_time,
                disableLosslessIntegers: true,
            });
            await this.driver.getServerInfo();
            await this.redis.connect();
            await this.setupDatabaseSchema();
            logger.info('Neo4j service initialized successfully', {
                url: this.config.url,
                database: this.config.database,
                poolSize: this.config.max_connection_pool_size,
            });
        }
        catch (error) {
            logger.error('Failed to initialize Neo4j service', { error });
            throw error;
        }
    }
    async setupDatabaseSchema() {
        const session = this.getSession();
        try {
            const schemaQueries = [
                'CREATE CONSTRAINT legal_concept_id IF NOT EXISTS FOR (lc:LegalConcept) REQUIRE lc.id IS UNIQUE',
                'CREATE CONSTRAINT legal_concept_name IF NOT EXISTS FOR (lc:LegalConcept) REQUIRE lc.name IS UNIQUE',
                'CREATE CONSTRAINT legal_clause_id IF NOT EXISTS FOR (lc:LegalClause) REQUIRE lc.id IS UNIQUE',
                'CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE',
                'CREATE CONSTRAINT document_hash IF NOT EXISTS FOR (d:Document) REQUIRE d.content_hash IS UNIQUE',
                'CREATE CONSTRAINT pattern_id IF NOT EXISTS FOR (p:Pattern) REQUIRE p.id IS UNIQUE',
                'CREATE CONSTRAINT pattern_name IF NOT EXISTS FOR (p:Pattern) REQUIRE p.name IS UNIQUE',
                'CREATE CONSTRAINT jurisdiction_code IF NOT EXISTS FOR (j:Jurisdiction) REQUIRE j.code IS UNIQUE',
                'CREATE INDEX legal_concept_category IF NOT EXISTS FOR (lc:LegalConcept) ON (lc.category)',
                'CREATE INDEX legal_concept_difficulty IF NOT EXISTS FOR (lc:LegalConcept) ON (lc.difficulty_level)',
                'CREATE INDEX legal_clause_severity IF NOT EXISTS FOR (lc:LegalClause) ON (lc.severity)',
                'CREATE INDEX legal_clause_confidence IF NOT EXISTS FOR (lc:LegalClause) ON (lc.confidence_score)',
                'CREATE INDEX document_type IF NOT EXISTS FOR (d:Document) ON (d.document_type)',
                'CREATE INDEX document_created IF NOT EXISTS FOR (d:Document) ON (d.created_at)',
                'CREATE INDEX pattern_severity IF NOT EXISTS FOR (p:Pattern) ON (p.severity)',
                'CREATE INDEX pattern_frequency IF NOT EXISTS FOR (p:Pattern) ON (p.frequency)',
                'CALL db.index.fulltext.createNodeIndex("legalConceptSearch", ["LegalConcept"], ["name", "description", "keywords"])',
                'CALL db.index.fulltext.createNodeIndex("legalClauseSearch", ["LegalClause"], ["title", "description", "text_content"])',
                'CALL db.index.fulltext.createNodeIndex("documentSearch", ["Document"], ["title", "content"])',
            ];
            for (const query of schemaQueries) {
                try {
                    await session.run(query);
                    logger.debug('Schema query executed', { query });
                }
                catch (error) {
                    if (!error.message.includes('already exists') && !error.message.includes('equivalent')) {
                        logger.warn('Schema query failed', { query, error: error.message });
                    }
                }
            }
            logger.info('Database schema setup completed');
        }
        finally {
            await session.close();
        }
    }
    getSession(database, mode = 'WRITE') {
        if (!this.driver) {
            throw new Error('Neo4j driver not initialized');
        }
        return this.driver.session({
            database: database || this.config.database,
            defaultAccessMode: mode === 'READ' ? neo4j_driver_1.default.session.READ : neo4j_driver_1.default.session.WRITE,
        });
    }
    async executeQuery(cypher, parameters = {}, options = {}) {
        const startTime = Date.now();
        const cacheKey = options.cacheKey || this.generateCacheKey(cypher, parameters);
        if (options.cache !== false) {
            const cached = await this.getCachedResult(cacheKey);
            if (cached) {
                logger.debug('Query result returned from cache', { cacheKey });
                return cached;
            }
        }
        const session = options.session || this.getSession();
        const shouldCloseSession = !options.session;
        try {
            logger.debug('Executing Cypher query', {
                cypher: cypher.substring(0, 200),
                parametersCount: Object.keys(parameters).length
            });
            const result = await session.run(cypher, parameters);
            const executionTime = Date.now() - startTime;
            this.collectQueryStats(cypher, parameters, result, executionTime);
            if (options.cache !== false && result.records.length > 0) {
                await this.cacheResult(cacheKey, result);
            }
            logger.debug('Query executed successfully', {
                executionTime,
                recordsReturned: result.records.length,
                cached: options.cache !== false,
            });
            return result;
        }
        catch (error) {
            logger.error('Query execution failed', {
                error,
                cypher: cypher.substring(0, 200),
                parametersCount: Object.keys(parameters).length,
                executionTime: Date.now() - startTime,
            });
            throw error;
        }
        finally {
            if (shouldCloseSession) {
                await session.close();
            }
        }
    }
    async executeTransaction(transactionFunction, options = {}) {
        const session = this.getSession(undefined, options.mode || 'WRITE');
        try {
            const result = await session.executeWrite(async (tx) => {
                if (options.timeout) {
                    tx.run('CALL apoc.util.sleep($timeout)', { timeout: options.timeout });
                }
                return await transactionFunction(tx);
            });
            return result;
        }
        catch (error) {
            logger.error('Transaction execution failed', { error, options });
            throw error;
        }
        finally {
            await session.close();
        }
    }
    queryBuilder() {
        return new CypherQueryBuilder();
    }
    async batchExecute(queries, batchSize = 100) {
        const results = [];
        const session = this.getSession();
        try {
            for (let i = 0; i < queries.length; i += batchSize) {
                const batch = queries.slice(i, i + batchSize);
                const batchResults = await Promise.all(batch.map(({ cypher, parameters }) => session.run(cypher, parameters)));
                results.push(...batchResults);
                logger.debug('Batch executed', {
                    batchIndex: Math.floor(i / batchSize) + 1,
                    batchSize: batch.length,
                    totalBatches: Math.ceil(queries.length / batchSize),
                });
            }
            return results;
        }
        finally {
            await session.close();
        }
    }
    getQueryStats() {
        return [...this.queryStats];
    }
    clearQueryStats() {
        this.queryStats = [];
    }
    async healthCheck() {
        try {
            if (!this.driver)
                return false;
            const session = this.getSession();
            try {
                await session.run('RETURN 1');
                return true;
            }
            finally {
                await session.close();
            }
        }
        catch (error) {
            logger.error('Neo4j health check failed', { error });
            return false;
        }
    }
    async getDatabaseInfo() {
        const session = this.getSession('system', 'READ');
        try {
            const versionResult = await session.run('CALL dbms.components()');
            const version = versionResult.records[0]?.get('versions')[0] || 'unknown';
            const edition = versionResult.records[0]?.get('edition') || 'unknown';
            const mainSession = this.getSession(this.config.database, 'READ');
            try {
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
            }
            finally {
                await mainSession.close();
            }
        }
        catch (error) {
            logger.error('Failed to get database info', { error });
            throw error;
        }
        finally {
            await session.close();
        }
    }
    async shutdown() {
        try {
            if (this.driver) {
                await this.driver.close();
                this.driver = null;
            }
            await this.redis.disconnect();
            logger.info('Neo4j service shutdown completed');
        }
        catch (error) {
            logger.error('Error during Neo4j service shutdown', { error });
            throw error;
        }
    }
    generateCacheKey(cypher, parameters) {
        const paramString = JSON.stringify(parameters, Object.keys(parameters).sort());
        return `neo4j:${Buffer.from(cypher + paramString).toString('base64')}`;
    }
    async getCachedResult(cacheKey) {
        try {
            const cached = this.queryCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.result;
            }
            const redisCached = await this.redis.get(cacheKey);
            if (redisCached) {
                const result = JSON.parse(redisCached);
                this.queryCache.set(cacheKey, { result, timestamp: Date.now() });
                return result;
            }
            return null;
        }
        catch (error) {
            logger.warn('Failed to get cached result', { error, cacheKey });
            return null;
        }
    }
    async cacheResult(cacheKey, result) {
        try {
            if (this.queryCache.size >= this.maxCacheSize) {
                const oldestKey = this.queryCache.keys().next().value;
                this.queryCache.delete(oldestKey);
            }
            this.queryCache.set(cacheKey, { result, timestamp: Date.now() });
            await this.redis.setex(cacheKey, Math.floor(this.cacheTimeout / 1000), JSON.stringify(result));
        }
        catch (error) {
            logger.warn('Failed to cache result', { error, cacheKey });
        }
    }
    collectQueryStats(cypher, parameters, result, executionTime) {
        try {
            const stats = {
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
            if (this.queryStats.length > this.maxStatsHistory) {
                this.queryStats = this.queryStats.slice(-this.maxStatsHistory);
            }
        }
        catch (error) {
            logger.warn('Failed to collect query stats', { error });
        }
    }
}
exports.Neo4jService = Neo4jService;
class CypherQueryBuilder {
    clauses = [];
    params = {};
    paramCounter = 0;
    match(pattern) {
        this.clauses.push(`MATCH ${pattern}`);
        return this;
    }
    where(condition) {
        this.clauses.push(`WHERE ${condition}`);
        return this;
    }
    create(pattern) {
        this.clauses.push(`CREATE ${pattern}`);
        return this;
    }
    merge(pattern) {
        this.clauses.push(`MERGE ${pattern}`);
        return this;
    }
    set(properties) {
        this.clauses.push(`SET ${properties}`);
        return this;
    }
    delete(nodes) {
        this.clauses.push(`DELETE ${nodes}`);
        return this;
    }
    return(fields) {
        this.clauses.push(`RETURN ${fields}`);
        return this;
    }
    orderBy(field, direction = 'ASC') {
        this.clauses.push(`ORDER BY ${field} ${direction}`);
        return this;
    }
    limit(count) {
        this.clauses.push(`LIMIT ${count}`);
        return this;
    }
    skip(count) {
        this.clauses.push(`SKIP ${count}`);
        return this;
    }
    with(fields) {
        this.clauses.push(`WITH ${fields}`);
        return this;
    }
    optional(pattern) {
        this.clauses.push(`OPTIONAL MATCH ${pattern}`);
        return this;
    }
    unwind(collection, variable) {
        this.clauses.push(`UNWIND ${collection} AS ${variable}`);
        return this;
    }
    build() {
        return {
            cypher: this.clauses.join('\n'),
            parameters: this.params,
        };
    }
    addParameter(value) {
        const paramName = `param${this.paramCounter++}`;
        this.params[paramName] = value;
        return `$${paramName}`;
    }
}
//# sourceMappingURL=neo4j-service.js.map