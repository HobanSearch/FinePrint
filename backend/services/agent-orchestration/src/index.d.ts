import { FastifyInstance } from 'fastify';
import { AgentRegistry } from './services/agent-registry';
import { WorkflowEngine } from './services/workflow-engine';
import { CommunicationBus } from './services/communication-bus';
import { DecisionEngine } from './services/decision-engine';
import { ResourceManager } from './services/resource-manager';
import { MonitoringService } from './services/monitoring-service';
import { BusinessProcessManager } from './services/business-process-manager';
declare module 'fastify' {
    interface FastifyRequest {
        user?: {
            id: string;
            email: string;
            role: string;
        };
    }
    interface FastifyInstance {
        authenticate: any;
        verifyJWT: any;
        orchestrationServices: {
            agentRegistry: AgentRegistry;
            workflowEngine: WorkflowEngine;
            communicationBus: CommunicationBus;
            decisionEngine: DecisionEngine;
            resourceManager: ResourceManager;
            monitoringService: MonitoringService;
            businessProcessManager: BusinessProcessManager;
        };
    }
}
declare function createServer(): Promise<FastifyInstance>;
declare function start(): Promise<void>;
export { createServer, start };
//# sourceMappingURL=index.d.ts.map