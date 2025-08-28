import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { TeamManager } from '../services/team-manager';
import { WorkflowOrchestrator } from '../services/workflow-orchestrator';
import { AGENT_TEAMS, TEAM_WORKFLOWS } from '../config/agent-teams';
import { TeamPriority } from '../types/teams';

export async function teamRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  const coordinationHub = fastify.coordinationHub;
  const teamManager = new TeamManager(
    {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    },
    coordinationHub
  );

  // Add team manager to fastify context
  fastify.decorate('teamManager', teamManager);

  // Get all teams
  fastify.get('/api/teams', async (request, reply) => {
    try {
      const teams = Object.values(AGENT_TEAMS).map(team => ({
        id: team.id,
        name: team.name,
        description: team.description,
        members: team.members.length,
        capabilities: team.capabilities,
        coordinationType: team.coordinationType,
        priority: team.priority
      }));

      return {
        success: true,
        teams,
        count: teams.length
      };
    } catch (error) {
      fastify.log.error('Failed to get teams', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Get team details
  fastify.get<{
    Params: { teamId: string };
  }>('/api/teams/:teamId', async (request, reply) => {
    try {
      const { teamId } = request.params;
      const team = AGENT_TEAMS[teamId];

      if (!team) {
        reply.code(404);
        return { success: false, error: 'Team not found' };
      }

      const monitoring = await teamManager.getTeamMonitoring(teamId);

      return {
        success: true,
        team: {
          ...team,
          monitoring
        }
      };
    } catch (error) {
      fastify.log.error('Failed to get team details', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Assign agents to team
  fastify.post<{
    Params: { teamId: string };
  }>('/api/teams/:teamId/assign', async (request, reply) => {
    try {
      const { teamId } = request.params;
      const assignments = await teamManager.assignAgentsToTeam(teamId);

      return {
        success: true,
        message: `Assigned ${assignments.length} agents to team ${teamId}`,
        assignments
      };
    } catch (error) {
      fastify.log.error('Failed to assign agents', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Execute business goal
  fastify.post<{
    Body: {
      businessGoal: string;
      requirements: {
        capabilities: string[];
        priority: TeamPriority;
        deadline?: string;
        budget?: number;
      };
    };
  }>('/api/teams/execute-goal', async (request, reply) => {
    try {
      const { businessGoal, requirements } = request.body;
      
      const executionId = await teamManager.executeBusinessGoal(
        businessGoal,
        {
          ...requirements,
          deadline: requirements.deadline ? new Date(requirements.deadline) : undefined
        }
      );

      return {
        success: true,
        message: 'Business goal execution started',
        executionId
      };
    } catch (error) {
      fastify.log.error('Failed to execute business goal', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Execute multi-team operation
  fastify.post<{
    Body: {
      operationType: string;
      context: Record<string, any>;
    };
  }>('/api/teams/execute-operation', async (request, reply) => {
    try {
      const { operationType, context } = request.body;
      
      if (!TEAM_WORKFLOWS[operationType]) {
        reply.code(400);
        return { 
          success: false, 
          error: 'Unknown operation type',
          availableOperations: Object.keys(TEAM_WORKFLOWS)
        };
      }

      const executionIds = await teamManager.executeMultiTeamOperation(
        operationType,
        context
      );

      return {
        success: true,
        message: `Started ${operationType} operation with ${executionIds.length} teams`,
        executionIds,
        teams: TEAM_WORKFLOWS[operationType].teams
      };
    } catch (error) {
      fastify.log.error('Failed to execute multi-team operation', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Get all teams status
  fastify.get('/api/teams/status', async (request, reply) => {
    try {
      const status = await teamManager.getAllTeamsStatus();

      return {
        success: true,
        status,
        summary: {
          totalTeams: Object.keys(status).length,
          healthyTeams: Object.values(status).filter((s: any) => s.health === 'healthy').length,
          degradedTeams: Object.values(status).filter((s: any) => s.health === 'degraded').length,
          criticalTeams: Object.values(status).filter((s: any) => s.health === 'critical').length
        }
      };
    } catch (error) {
      fastify.log.error('Failed to get teams status', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Rebalance teams
  fastify.post('/api/teams/rebalance', async (request, reply) => {
    try {
      await teamManager.rebalanceTeams();

      return {
        success: true,
        message: 'Teams rebalanced successfully'
      };
    } catch (error) {
      fastify.log.error('Failed to rebalance teams', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Get team monitoring data
  fastify.get<{
    Params: { teamId: string };
  }>('/api/teams/:teamId/monitoring', async (request, reply) => {
    try {
      const { teamId } = request.params;
      const monitoring = await teamManager.getTeamMonitoring(teamId);

      return {
        success: true,
        monitoring
      };
    } catch (error) {
      fastify.log.error('Failed to get team monitoring', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // WebSocket endpoint for real-time team updates
  fastify.register(async function (fastify) {
    fastify.get('/ws/teams/:teamId', { websocket: true }, (connection, request) => {
      const teamId = (request.params as any).teamId;
      
      fastify.log.info('Team WebSocket connection established', { teamId });

      // Send initial team status
      teamManager.getTeamMonitoring(teamId).then(monitoring => {
        connection.socket.send(JSON.stringify({
          type: 'team-status',
          teamId,
          monitoring
        }));
      });

      // Listen to team events
      const eventHandlers = {
        teamAssigned: (data: any) => {
          if (data.teamId === teamId) {
            connection.socket.send(JSON.stringify({
              type: 'team-assigned',
              ...data
            }));
          }
        },
        teamWorkflowStarted: (data: any) => {
          if (data.teamId === teamId) {
            connection.socket.send(JSON.stringify({
              type: 'workflow-started',
              ...data
            }));
          }
        },
        teamStepCompleted: (data: any) => {
          connection.socket.send(JSON.stringify({
            type: 'step-completed',
            ...data
          }));
        },
        metricsUpdated: async () => {
          const monitoring = await teamManager.getTeamMonitoring(teamId);
          connection.socket.send(JSON.stringify({
            type: 'metrics-updated',
            teamId,
            monitoring
          }));
        }
      };

      // Register event listeners
      Object.entries(eventHandlers).forEach(([event, handler]) => {
        teamManager.on(event, handler);
      });

      connection.socket.on('close', () => {
        // Remove event listeners
        Object.entries(eventHandlers).forEach(([event, handler]) => {
          teamManager.off(event, handler);
        });
        
        fastify.log.info('Team WebSocket connection closed', { teamId });
      });
    });
  });

  // Demo endpoints for testing
  if (process.env.NODE_ENV === 'development') {
    // Initialize all teams with demo agents
    fastify.post('/api/teams/demo/initialize', async (request, reply) => {
      try {
        const results: Record<string, any> = {};

        // Register demo agents for each type
        const demoAgents: AgentInfo[] = [];
        for (const agentType of Object.values(AgentType)) {
          for (let i = 0; i < 3; i++) {
            demoAgents.push({
              id: `${agentType}-demo-${i}`,
              name: `Demo ${agentType} Agent ${i}`,
              type: agentType,
              capabilities: getAgentCapabilities(agentType),
              currentLoad: Math.floor(Math.random() * 50),
              maxCapacity: 100,
              status: 'healthy' as any,
              lastHeartbeat: new Date(),
              version: '1.0.0',
              endpoint: `http://${agentType}-service:3000`,
              metadata: { demo: true }
            });
          }
        }

        // Register all demo agents
        for (const agent of demoAgents) {
          await coordinationHub.registerAgent(agent);
        }

        // Assign agents to all teams
        for (const teamId of Object.keys(AGENT_TEAMS)) {
          const assignments = await teamManager.assignAgentsToTeam(teamId);
          results[teamId] = {
            assigned: assignments.length,
            agents: assignments.map(a => a.agentId)
          };
        }

        return {
          success: true,
          message: 'Demo teams initialized',
          agentsCreated: demoAgents.length,
          teamAssignments: results
        };
      } catch (error) {
        fastify.log.error('Failed to initialize demo teams', error);
        reply.code(500);
        return { success: false, error: error.message };
      }
    });

    // Simulate team execution
    fastify.post<{
      Body: {
        teamId: string;
        simulationType: 'success' | 'partial' | 'failure';
      };
    }>('/api/teams/demo/simulate', async (request, reply) => {
      try {
        const { teamId, simulationType } = request.body;

        // Create a mock business goal
        const businessGoal = `Demo ${simulationType} simulation for team ${teamId}`;
        
        const executionId = await teamManager.executeTeam(
          teamId,
          businessGoal,
          {
            simulation: true,
            expectedOutcome: simulationType,
            timestamp: new Date()
          }
        );

        return {
          success: true,
          message: 'Simulation started',
          executionId,
          expectedDuration: simulationType === 'success' ? '30s' : '45s'
        };
      } catch (error) {
        fastify.log.error('Failed to simulate team execution', error);
        reply.code(500);
        return { success: false, error: error.message };
      }
    });
  }
}

// Helper function to get agent capabilities
function getAgentCapabilities(agentType: AgentType): string[] {
  const capabilityMap: Record<AgentType, string[]> = {
    [AgentType.UI_UX_DESIGN]: ['ui-design', 'ux-research', 'prototyping'],
    [AgentType.FRONTEND_ARCHITECTURE]: ['react', 'typescript', 'state-management'],
    [AgentType.BACKEND_ARCHITECTURE]: ['api-design', 'microservices', 'scalability'],
    [AgentType.DATABASE_ARCHITECT]: ['database-design', 'optimization', 'migrations'],
    [AgentType.SECURITY_ENGINEER]: ['security-audit', 'vulnerability-assessment'],
    [AgentType.MARKETING_CONTEXT]: ['campaign-analysis', 'customer-segmentation'],
    [AgentType.BUSINESS_INTELLIGENCE]: ['data-analysis', 'reporting', 'insights'],
    // Add more as needed
    [AgentType.DSPY_OPTIMIZER]: ['prompt-optimization', 'business-analysis'],
    [AgentType.KNOWLEDGE_GRAPH]: ['relationship-analysis', 'pattern-recognition'],
    [AgentType.LEGAL_ANALYSIS]: ['document-analysis', 'risk-assessment'],
  };

  return capabilityMap[agentType] || ['general'];
}

// TypeScript declarations
declare module 'fastify' {
  interface FastifyInstance {
    teamManager: TeamManager;
  }
}

import { AgentInfo } from '../types';