import { Session, Transaction, Result } from 'neo4j-driver';
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
    build(): {
        cypher: string;
        parameters: Record<string, any>;
    };
}
export interface TransactionOptions {
    timeout?: number;
    metadata?: Record<string, any>;
    mode?: 'READ' | 'WRITE';
}
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
export declare class Neo4jService {
    private driver;
    private config;
    private redis;
    private queryCache;
    private queryStats;
    private readonly cacheTimeout;
    private readonly maxCacheSize;
    private readonly maxStatsHistory;
    constructor();
    initialize(): Promise<void>;
    private setupDatabaseSchema;
    getSession(database?: string, mode?: 'READ' | 'WRITE'): Session;
    executeQuery(cypher: string, parameters?: Record<string, any>, options?: {
        cache?: boolean;
        cacheKey?: string;
        timeout?: number;
        session?: Session;
    }): Promise<Result>;
    executeTransaction<T>(transactionFunction: (tx: Transaction) => Promise<T>, options?: TransactionOptions): Promise<T>;
    queryBuilder(): QueryBuilder;
    batchExecute(queries: Array<{
        cypher: string;
        parameters: Record<string, any>;
    }>, batchSize?: number): Promise<Result[]>;
    getQueryStats(): QueryStats[];
    clearQueryStats(): void;
    healthCheck(): Promise<boolean>;
    getDatabaseInfo(): Promise<{
        version: string;
        edition: string;
        nodeCount: number;
        relationshipCount: number;
        propertyCount: number;
        labelCount: number;
        relationshipTypeCount: number;
    }>;
    shutdown(): Promise<void>;
    private generateCacheKey;
    private getCachedResult;
    private cacheResult;
    private collectQueryStats;
}
//# sourceMappingURL=neo4j-service.d.ts.map