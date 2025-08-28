import { EventEmitter } from 'events';
import { WorkflowEngine } from './workflow-engine';
import { MonitoringService } from './monitoring-service';
export declare class BusinessProcessManager extends EventEmitter {
    private workflowEngine;
    private monitoringService;
    constructor(workflowEngine: WorkflowEngine, monitoringService: MonitoringService);
    initialize(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=business-process-manager.d.ts.map