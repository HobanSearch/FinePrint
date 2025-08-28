import { EventEmitter } from 'events';
import { AgentRegistry } from './agent-registry';
import { WorkflowEngine } from './workflow-engine';
import { ResourceManager } from './resource-manager';
export declare class MonitoringService extends EventEmitter {
    private agentRegistry;
    private workflowEngine;
    private resourceManager;
    constructor(agentRegistry: AgentRegistry, workflowEngine: WorkflowEngine, resourceManager: ResourceManager);
    initialize(): Promise<void>;
    startMonitoring(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=monitoring-service.d.ts.map