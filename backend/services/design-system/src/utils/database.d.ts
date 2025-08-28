import { PoolClient } from 'pg';
export declare class DatabaseClient {
    private pool;
    private isConnected;
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    healthCheck(): Promise<boolean>;
    query(text: string, params?: any[]): Promise<any>;
    transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
}
//# sourceMappingURL=database.d.ts.map