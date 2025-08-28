import { EventEmitter } from 'events';
import { AgentType, AgentStatus, AgentCapability, AgentRegistration, AgentInstance, AgentMetrics } from '@/types/agent';
export declare class AgentRegistry extends EventEmitter {
    private agents;
    private agentMetrics;
    private healthCheckInterval;
    private metricsCollectionInterval;
    constructor();
    initialize(): Promise<void>;
    startHealthChecking(): Promise<void>;
    stop(): Promise<void>;
    registerAgent(registration: AgentRegistration): Promise<string>;
    unregisterAgent(agentId: string): Promise<void>;
    updateAgent(agentId: string, updates: Partial<AgentRegistration>): Promise<void>;
    findAgents(criteria: {
        type?: AgentType;
        capabilities?: AgentCapability[];
        status?: AgentStatus | AgentStatus[];
        minLoad?: number;
        maxLoad?: number;
        tags?: string[];
    }): Promise<AgentInstance[]>;
    findBestAgent(criteria: {
        type: AgentType;
        capabilities: AgentCapability[];
        strategy?: 'least_loaded' | 'round_robin' | 'performance_based';
    }): Promise<AgentInstance | null>;
    private performHealthChecks;
    private checkAgentHealth;
    private markAgentUnhealthy;
    private determineAgentStatus;
    private calculateLoad;
    private collectMetrics;
    private collectAgentMetrics;
    assignTask(agentId: string, taskId: string): Promise<void>;
    completeTask(agentId: string, taskId: string, success: boolean): Promise<void>;
    private autoDiscoverAgents;
    private validateRegistration;
    private mapServiceToAgentType;
    private inferCapabilities;
    private loadAgents;
    private getAgentTypeDistribution;
    getAgent(agentId: string): AgentInstance | undefined;
    getAllAgents(): AgentInstance[];
    getAgentMetrics(agentId: string): AgentMetrics[];
    getAgentsByType(type: AgentType): AgentInstance[];
    getHealthyAgents(): AgentInstance[];
    getAgentCount(): number;
    getAgentStats(): {
        total: number;
        healthy: number;
        unhealthy: number;
        offline: number;
        busy: number;
        idle: number;
    };
}
//# sourceMappingURL=agent-registry.d.ts.map