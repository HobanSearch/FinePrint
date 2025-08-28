import { CacheManager } from '@fineprintai/cache';
import { AuditConfig, AuditEvent, AuditEventType, AuditLevel, AuditActor, AuditResource, AuditContext, AuditQuery, AuditStats } from './types';
export declare class AuditLogger {
    private cache;
    private config;
    private alerts;
    private encryptionKey?;
    constructor(cache: CacheManager, config: AuditConfig);
    private initializeEncryption;
    private initializeAlerts;
    logEvent(type: AuditEventType, level: AuditLevel, actor: AuditActor, action: string, outcome: 'success' | 'failure' | 'pending', details?: Record<string, any>, resource?: AuditResource, context?: Partial<AuditContext>): Promise<void>;
    queryEvents(query: AuditQuery): Promise<AuditEvent[]>;
    getStats(): Promise<AuditStats>;
    cleanup(): Promise<number>;
    private sanitizeActor;
    private sanitizeDetails;
    private generateTags;
    private calculateHash;
    private processEvent;
    private storeEvent;
    private addToIndexes;
    private retrieveEvent;
    private encrypt;
    private decrypt;
    private getEventKeys;
    private matchesQuery;
    private checkAlerts;
    private triggerAlert;
    private detectAnomalies;
    private calculateHourlyVolume;
    private forwardEvent;
}
//# sourceMappingURL=auditLogger.d.ts.map