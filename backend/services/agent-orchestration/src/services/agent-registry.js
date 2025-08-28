"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRegistry = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const agent_1 = require("../types/agent");
const logger = logger_1.Logger.child({ component: 'agent-registry' });
class AgentRegistry extends events_1.EventEmitter {
    agents = new Map();
    agentMetrics = new Map();
    healthCheckInterval = null;
    metricsCollectionInterval = null;
    constructor() {
        super();
        this.setMaxListeners(1000);
    }
    async initialize() {
        try {
            logger.info('Initializing Agent Registry...');
            await this.loadAgents();
            if (config_1.config.environment === 'development') {
                await this.autoDiscoverAgents();
            }
            logger.info('Agent Registry initialized successfully', {
                agentCount: this.agents.size,
                agentTypes: this.getAgentTypeDistribution(),
            });
        }
        catch (error) {
            logger.error('Failed to initialize Agent Registry', { error: error.message });
            throw error;
        }
    }
    async startHealthChecking() {
        if (this.healthCheckInterval) {
            logger.warn('Health checking is already running');
            return;
        }
        logger.info('Starting agent health checking...');
        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthChecks();
        }, config_1.config.monitoring.healthCheckInterval);
        this.metricsCollectionInterval = setInterval(async () => {
            await this.collectMetrics();
        }, config_1.config.monitoring.metricsCollectionInterval);
        await this.performHealthChecks();
    }
    async stop() {
        logger.info('Stopping Agent Registry...');
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        if (this.metricsCollectionInterval) {
            clearInterval(this.metricsCollectionInterval);
            this.metricsCollectionInterval = null;
        }
        logger.info('Agent Registry stopped');
    }
    async registerAgent(registration) {
        try {
            this.validateRegistration(registration);
            if (this.agents.has(registration.id)) {
                throw new Error(`Agent ${registration.id} is already registered`);
            }
            const agent = {
                id: registration.id,
                registration,
                status: agent_1.AgentStatus.OFFLINE,
                currentLoad: 0,
                lastHealthCheck: new Date(),
                activeTaskCount: 0,
                completedTaskCount: 0,
                failedTaskCount: 0,
                averageResponseTime: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            this.agents.set(registration.id, agent);
            this.agentMetrics.set(registration.id, []);
            await this.checkAgentHealth(registration.id);
            this.emit('agent:registered', { agentId: registration.id, agent });
            logger.info('Agent registered', {
                agentId: registration.id,
                type: registration.type,
                name: registration.name,
                capabilities: registration.capabilities,
            });
            return registration.id;
        }
        catch (error) {
            logger.error('Failed to register agent', {
                agentId: registration.id,
                error: error.message,
            });
            throw error;
        }
    }
    async unregisterAgent(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        if (agent.activeTaskCount > 0) {
            throw new Error(`Cannot unregister agent ${agentId}: ${agent.activeTaskCount} active tasks`);
        }
        this.agents.delete(agentId);
        this.agentMetrics.delete(agentId);
        this.emit('agent:unregistered', { agentId, agent });
        logger.info('Agent unregistered', { agentId, type: agent.registration.type });
    }
    async updateAgent(agentId, updates) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        const oldRegistration = { ...agent.registration };
        agent.registration = { ...agent.registration, ...updates };
        agent.updatedAt = new Date();
        this.emit('agent:updated', {
            agentId,
            oldRegistration,
            newRegistration: agent.registration
        });
        logger.info('Agent updated', { agentId, updates: Object.keys(updates) });
    }
    async findAgents(criteria) {
        const agents = Array.from(this.agents.values());
        return agents.filter(agent => {
            if (criteria.type && agent.registration.type !== criteria.type) {
                return false;
            }
            if (criteria.capabilities && criteria.capabilities.length > 0) {
                const hasAllCapabilities = criteria.capabilities.every(cap => agent.registration.capabilities.includes(cap));
                if (!hasAllCapabilities)
                    return false;
            }
            if (criteria.status) {
                const statuses = Array.isArray(criteria.status) ? criteria.status : [criteria.status];
                if (!statuses.includes(agent.status))
                    return false;
            }
            if (criteria.minLoad !== undefined && agent.currentLoad < criteria.minLoad) {
                return false;
            }
            if (criteria.maxLoad !== undefined && agent.currentLoad > criteria.maxLoad) {
                return false;
            }
            if (criteria.tags && criteria.tags.length > 0) {
                const agentTags = Object.keys(agent.registration.metadata?.tags || {});
                const hasAllTags = criteria.tags.every(tag => agentTags.includes(tag));
                if (!hasAllTags)
                    return false;
            }
            return true;
        });
    }
    async findBestAgent(criteria) {
        const candidates = await this.findAgents({
            type: criteria.type,
            capabilities: criteria.capabilities,
            status: [agent_1.AgentStatus.HEALTHY, agent_1.AgentStatus.IDLE],
        });
        if (candidates.length === 0) {
            return null;
        }
        const strategy = criteria.strategy || 'least_loaded';
        switch (strategy) {
            case 'least_loaded':
                return candidates.reduce((best, current) => current.currentLoad < best.currentLoad ? current : best);
            case 'performance_based':
                return candidates.reduce((best, current) => current.averageResponseTime < best.averageResponseTime ? current : best);
            case 'round_robin':
                return candidates.reduce((best, current) => current.completedTaskCount < best.completedTaskCount ? current : best);
            default:
                return candidates[0];
        }
    }
    async performHealthChecks() {
        const agents = Array.from(this.agents.values());
        const healthCheckPromises = agents.map(agent => this.checkAgentHealth(agent.id).catch(error => {
            logger.warn('Health check failed', {
                agentId: agent.id,
                error: error.message,
            });
        }));
        await Promise.allSettled(healthCheckPromises);
    }
    async checkAgentHealth(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent)
            return;
        const previousStatus = agent.status;
        try {
            const healthUrl = `${agent.registration.endpoint}${agent.registration.healthCheckPath}`;
            const response = await axios_1.default.get(healthUrl, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'FinePrint-Orchestrator/1.0',
                },
            });
            if (response.status === 200) {
                const healthData = response.data;
                agent.status = this.determineAgentStatus(healthData);
                agent.lastHealthCheck = new Date();
                if (healthData.metrics) {
                    agent.currentLoad = this.calculateLoad(healthData.metrics);
                }
                if (previousStatus !== agent.status) {
                    this.emit('agent:status_changed', {
                        agentId,
                        previousStatus,
                        newStatus: agent.status,
                        healthData,
                    });
                    logger.info('Agent status changed', {
                        agentId,
                        type: agent.registration.type,
                        previousStatus,
                        newStatus: agent.status,
                    });
                }
            }
            else {
                this.markAgentUnhealthy(agent, `HTTP ${response.status}`);
            }
        }
        catch (error) {
            this.markAgentUnhealthy(agent, error.message);
            if (previousStatus !== agent.status) {
                this.emit('agent:status_changed', {
                    agentId,
                    previousStatus,
                    newStatus: agent.status,
                    error: error.message,
                });
            }
        }
    }
    markAgentUnhealthy(agent, reason) {
        const timeSinceLastCheck = Date.now() - agent.lastHealthCheck.getTime();
        if (timeSinceLastCheck > config_1.config.monitoring.healthCheckInterval * 3) {
            agent.status = agent_1.AgentStatus.OFFLINE;
        }
        else {
            agent.status = agent_1.AgentStatus.UNHEALTHY;
        }
        logger.warn('Agent marked unhealthy', {
            agentId: agent.id,
            type: agent.registration.type,
            reason,
            status: agent.status,
        });
    }
    determineAgentStatus(healthData) {
        if (healthData.status === 'healthy') {
            const isBusy = healthData.metrics.queueSize > 10 ||
                healthData.metrics.cpu > 80 ||
                healthData.metrics.memory > 85;
            return isBusy ? agent_1.AgentStatus.BUSY : agent_1.AgentStatus.IDLE;
        }
        else if (healthData.status === 'degraded') {
            return agent_1.AgentStatus.DEGRADED;
        }
        else {
            return agent_1.AgentStatus.UNHEALTHY;
        }
    }
    calculateLoad(metrics) {
        const cpuLoad = metrics.cpu / 100;
        const memoryLoad = metrics.memory / 100;
        const connectionLoad = metrics.activeConnections / 100;
        const queueLoad = Math.min(metrics.queueSize / 50, 1);
        return Math.round((cpuLoad * 0.3 + memoryLoad * 0.3 + connectionLoad * 0.2 + queueLoad * 0.2) * 100);
    }
    async collectMetrics() {
        const agents = Array.from(this.agents.values())
            .filter(agent => agent.status !== agent_1.AgentStatus.OFFLINE);
        for (const agent of agents) {
            try {
                await this.collectAgentMetrics(agent.id);
            }
            catch (error) {
                logger.warn('Failed to collect metrics', {
                    agentId: agent.id,
                    error: error.message,
                });
            }
        }
    }
    async collectAgentMetrics(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent)
            return;
        try {
            const metricsUrl = `${agent.registration.endpoint}/metrics`;
            const response = await axios_1.default.get(metricsUrl, {
                timeout: 3000,
                headers: {
                    'Accept': 'application/json',
                },
            });
            if (response.status === 200) {
                const metrics = {
                    agentId,
                    timestamp: new Date(),
                    cpu: response.data.cpu || 0,
                    memory: response.data.memory || 0,
                    responseTime: response.data.responseTime || 0,
                    throughput: response.data.throughput || 0,
                    errorRate: response.data.errorRate || 0,
                    availability: response.data.availability || 100,
                };
                const agentMetrics = this.agentMetrics.get(agentId) || [];
                agentMetrics.push(metrics);
                if (agentMetrics.length > 1000) {
                    agentMetrics.splice(0, agentMetrics.length - 1000);
                }
                this.agentMetrics.set(agentId, agentMetrics);
                const recentMetrics = agentMetrics.slice(-10);
                agent.averageResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
                this.emit('metrics:collected', { agentId, metrics });
            }
        }
        catch (error) {
            logger.debug('Metrics collection failed', {
                agentId,
                error: error.message,
            });
        }
    }
    async assignTask(agentId, taskId) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        agent.activeTaskCount++;
        agent.updatedAt = new Date();
        this.emit('task:assigned', { agentId, taskId });
        logger.debug('Task assigned to agent', { agentId, taskId });
    }
    async completeTask(agentId, taskId, success) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        agent.activeTaskCount = Math.max(0, agent.activeTaskCount - 1);
        if (success) {
            agent.completedTaskCount++;
        }
        else {
            agent.failedTaskCount++;
        }
        agent.updatedAt = new Date();
        this.emit('task:completed', { agentId, taskId, success });
        logger.debug('Task completed by agent', { agentId, taskId, success });
    }
    async autoDiscoverAgents() {
        logger.info('Auto-discovering agents...');
        const potentialPorts = [3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009];
        for (const port of potentialPorts) {
            try {
                const response = await axios_1.default.get(`http://localhost:${port}/health`, {
                    timeout: 2000,
                });
                if (response.status === 200 && response.data.service) {
                    const serviceInfo = response.data.service;
                    const registration = {
                        id: (0, uuid_1.v4)(),
                        type: this.mapServiceToAgentType(serviceInfo.name),
                        name: serviceInfo.name,
                        version: serviceInfo.version || '1.0.0',
                        capabilities: this.inferCapabilities(serviceInfo.name),
                        endpoint: `http://localhost:${port}`,
                        healthCheckPath: '/health',
                        priority: 5,
                        maxConcurrentTasks: 10,
                        timeout: 300000,
                        retryPolicy: {
                            maxRetries: 3,
                            backoffMultiplier: 2,
                            initialDelay: 1000,
                        },
                        dependencies: [],
                        metadata: {
                            autoDiscovered: true,
                            port,
                        },
                    };
                    await this.registerAgent(registration);
                }
            }
            catch (error) {
                continue;
            }
        }
    }
    validateRegistration(registration) {
        if (!registration.id || !registration.type || !registration.name) {
            throw new Error('Registration missing required fields: id, type, name');
        }
        if (!registration.endpoint || !URL.canParse(registration.endpoint)) {
            throw new Error('Invalid endpoint URL');
        }
        if (registration.capabilities.length === 0) {
            throw new Error('Agent must have at least one capability');
        }
        if (registration.priority < 1 || registration.priority > 10) {
            throw new Error('Priority must be between 1 and 10');
        }
    }
    mapServiceToAgentType(serviceName) {
        const mapping = {
            'fullstack-agent': agent_1.AgentType.FULLSTACK_AGENT,
            'aiml-engineering': agent_1.AgentType.AIML_ENGINEERING,
            'ui-ux-design': agent_1.AgentType.UI_UX_DESIGN,
            'devops-agent': agent_1.AgentType.DEVOPS_AGENT,
            'dspy-framework': agent_1.AgentType.DSPY_FRAMEWORK,
            'gated-lora-system': agent_1.AgentType.GATED_LORA_SYSTEM,
            'knowledge-graph': agent_1.AgentType.KNOWLEDGE_GRAPH,
            'enhanced-ollama': agent_1.AgentType.ENHANCED_OLLAMA,
            'sales-agent': agent_1.AgentType.SALES_AGENT,
            'customer-success-agent': agent_1.AgentType.CUSTOMER_SUCCESS,
            'content-marketing-agent': agent_1.AgentType.CONTENT_MARKETING,
        };
        return mapping[serviceName] || agent_1.AgentType.FULLSTACK_AGENT;
    }
    inferCapabilities(serviceName) {
        const capabilityMapping = {
            'fullstack-agent': [
                agent_1.AgentCapability.CODE_GENERATION,
                agent_1.AgentCapability.ARCHITECTURE_DECISIONS,
                agent_1.AgentCapability.TESTING_AUTOMATION,
            ],
            'aiml-engineering': [
                agent_1.AgentCapability.MODEL_TRAINING,
                agent_1.AgentCapability.HYPERPARAMETER_OPTIMIZATION,
                agent_1.AgentCapability.MODEL_DEPLOYMENT,
                agent_1.AgentCapability.PERFORMANCE_MONITORING,
            ],
            'sales-agent': [
                agent_1.AgentCapability.LEAD_GENERATION,
                agent_1.AgentCapability.CUSTOMER_SUPPORT,
            ],
            'content-marketing-agent': [
                agent_1.AgentCapability.CONTENT_CREATION,
            ],
        };
        return capabilityMapping[serviceName] || [agent_1.AgentCapability.CODE_GENERATION];
    }
    async loadAgents() {
        logger.debug('Loading agents from database...');
    }
    getAgentTypeDistribution() {
        const distribution = {};
        for (const agent of this.agents.values()) {
            const type = agent.registration.type;
            distribution[type] = (distribution[type] || 0) + 1;
        }
        return distribution;
    }
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    getAllAgents() {
        return Array.from(this.agents.values());
    }
    getAgentMetrics(agentId) {
        return this.agentMetrics.get(agentId) || [];
    }
    getAgentsByType(type) {
        return Array.from(this.agents.values())
            .filter(agent => agent.registration.type === type);
    }
    getHealthyAgents() {
        return Array.from(this.agents.values())
            .filter(agent => agent.status === agent_1.AgentStatus.HEALTHY || agent.status === agent_1.AgentStatus.IDLE);
    }
    getAgentCount() {
        return this.agents.size;
    }
    getAgentStats() {
        const agents = Array.from(this.agents.values());
        return {
            total: agents.length,
            healthy: agents.filter(a => a.status === agent_1.AgentStatus.HEALTHY).length,
            unhealthy: agents.filter(a => a.status === agent_1.AgentStatus.UNHEALTHY).length,
            offline: agents.filter(a => a.status === agent_1.AgentStatus.OFFLINE).length,
            busy: agents.filter(a => a.status === agent_1.AgentStatus.BUSY).length,
            idle: agents.filter(a => a.status === agent_1.AgentStatus.IDLE).length,
        };
    }
}
exports.AgentRegistry = AgentRegistry;
//# sourceMappingURL=agent-registry.js.map