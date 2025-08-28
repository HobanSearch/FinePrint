import { Queue } from 'bullmq';
export declare let infrastructureQueue: Queue;
export declare let pipelineQueue: Queue;
export declare let securityQueue: Queue;
export declare let monitoringQueue: Queue;
export declare let backupQueue: Queue;
export declare function startBackgroundJobs(): Promise<void>;
export declare function addInfrastructureJob(name: string, data: any, options?: any): Promise<any>;
export declare function addPipelineJob(name: string, data: any, options?: any): Promise<any>;
export declare function addSecurityJob(name: string, data: any, options?: any): Promise<any>;
export declare function addMonitoringJob(name: string, data: any, options?: any): Promise<any>;
export declare function addBackupJob(name: string, data: any, options?: any): Promise<any>;
export declare function stopBackgroundJobs(): Promise<void>;
//# sourceMappingURL=index.d.ts.map