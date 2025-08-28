import { AgentRegistry } from '../services/agent-registry';
import { AgentType, AgentCapability } from '../types/agent';

describe('AgentRegistry', () => {
  let agentRegistry: AgentRegistry;

  beforeEach(async () => {
    agentRegistry = new AgentRegistry();
    await agentRegistry.initialize();
  });

  afterEach(async () => {
    await agentRegistry.stop();
  });

  describe('Agent Registration', () => {
    it('should register a new agent successfully', async () => {
      const agentId = await agentRegistry.registerAgent(global.mockAgent);
      
      expect(agentId).toBe(global.mockAgent.id);
      
      const agent = agentRegistry.getAgent(agentId);
      expect(agent).toBeDefined();
      expect(agent?.registration.name).toBe(global.mockAgent.name);
      expect(agent?.registration.type).toBe(global.mockAgent.type);
    });

    it('should throw error when registering duplicate agent', async () => {
      await agentRegistry.registerAgent(global.mockAgent);
      
      await expect(
        agentRegistry.registerAgent(global.mockAgent)
      ).rejects.toThrow('Agent test-agent-id is already registered');
    });

    it('should validate required fields during registration', async () => {
      const invalidAgent = { ...global.mockAgent };
      delete invalidAgent.name;
      
      await expect(
        agentRegistry.registerAgent(invalidAgent as any)
      ).rejects.toThrow();
    });
  });

  describe('Agent Discovery', () => {
    beforeEach(async () => {
      // Register multiple test agents
      await agentRegistry.registerAgent({
        ...global.mockAgent,
        id: 'agent-1',
        type: AgentType.FULLSTACK_AGENT,
        capabilities: [AgentCapability.CODE_GENERATION],
      });
      
      await agentRegistry.registerAgent({
        ...global.mockAgent,
        id: 'agent-2',
        type: AgentType.AIML_ENGINEERING,
        capabilities: [AgentCapability.MODEL_TRAINING],
      });
    });

    it('should find agents by type', async () => {
      const agents = await agentRegistry.findAgents({
        type: AgentType.FULLSTACK_AGENT,
      });
      
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('agent-1');
    });

    it('should find agents by capabilities', async () => {
      const agents = await agentRegistry.findAgents({
        capabilities: [AgentCapability.CODE_GENERATION],
      });
      
      expect(agents).toHaveLength(1);
      expect(agents[0].registration.capabilities).toContain(AgentCapability.CODE_GENERATION);
    });

    it('should return empty array when no agents match criteria', async () => {
      const agents = await agentRegistry.findAgents({
        type: AgentType.SALES_AGENT,
      });
      
      expect(agents).toHaveLength(0);
    });
  });

  describe('Agent Statistics', () => {
    it('should return correct agent count', () => {
      expect(agentRegistry.getAgentCount()).toBe(0);
    });

    it('should return agent statistics', () => {
      const stats = agentRegistry.getAgentStats();
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('healthy');
      expect(stats).toHaveProperty('unhealthy');
      expect(stats).toHaveProperty('offline');
      expect(stats).toHaveProperty('busy');
      expect(stats).toHaveProperty('idle');
    });
  });

  describe('Agent Lifecycle', () => {
    it('should unregister agent successfully', async () => {
      const agentId = await agentRegistry.registerAgent(global.mockAgent);
      
      await agentRegistry.unregisterAgent(agentId);
      
      const agent = agentRegistry.getAgent(agentId);
      expect(agent).toBeUndefined();
    });

    it('should throw error when unregistering non-existent agent', async () => {
      await expect(
        agentRegistry.unregisterAgent('non-existent-id')
      ).rejects.toThrow('Agent non-existent-id not found');
    });

    it('should update agent registration', async () => {
      const agentId = await agentRegistry.registerAgent(global.mockAgent);
      
      await agentRegistry.updateAgent(agentId, {
        name: 'Updated Agent Name',
        priority: 8,
      });
      
      const agent = agentRegistry.getAgent(agentId);
      expect(agent?.registration.name).toBe('Updated Agent Name');
      expect(agent?.registration.priority).toBe(8);
    });
  });

  describe('Task Management', () => {
    it('should assign and complete tasks', async () => {
      const agentId = await agentRegistry.registerAgent(global.mockAgent);
      
      await agentRegistry.assignTask(agentId, 'task-1');
      
      let agent = agentRegistry.getAgent(agentId);
      expect(agent?.activeTaskCount).toBe(1);
      
      await agentRegistry.completeTask(agentId, 'task-1', true);
      
      agent = agentRegistry.getAgent(agentId);
      expect(agent?.activeTaskCount).toBe(0);
      expect(agent?.completedTaskCount).toBe(1);
    });

    it('should track failed tasks', async () => {
      const agentId = await agentRegistry.registerAgent(global.mockAgent);
      
      await agentRegistry.assignTask(agentId, 'task-1');
      await agentRegistry.completeTask(agentId, 'task-1', false);
      
      const agent = agentRegistry.getAgent(agentId);
      expect(agent?.failedTaskCount).toBe(1);
    });
  });
});