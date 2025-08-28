import { EventEmitter } from 'eventemitter3';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentTeam,
  TeamMember,
  TeamRole,
  TeamCoordinationType,
  TeamPriority,
  TeamExecution,
  ExecutionStatus,
  TeamMonitoring,
  RealTimeMetrics,
  HistoricalPerformance,
  TeamAlert,
  TeamRecommendation
} from '../types/teams';
import {
  AgentInfo,
  AgentType,
  AgentStatus,
  CoordinationRequest,
  CoordinationType,
  BusinessEvent
} from '../types';
import { CoordinationHub } from './coordination-hub';
import { WorkflowOrchestrator } from './workflow-orchestrator';
import { AGENT_TEAMS, TEAM_WORKFLOWS, calculateTeamCapacity } from '../config/agent-teams';

interface TeamAssignment {
  teamId: string;
  agentId: string;
  role: TeamRole;
  assignedAt: Date;
  workload: number;
}

interface TeamPerformanceHistory {
  teamId: string;
  date: Date;
  metrics: {
    tasksCompleted: number;
    tasksFailed: number;
    averageResponseTime: number;
    utilizationRate: number;
    businessValue: number;
  };
}

export class TeamManager extends EventEmitter {
  private redis: Redis;
  private coordinationHub: CoordinationHub;
  private workflowOrchestrator: WorkflowOrchestrator;
  private teamAssignments: Map<string, TeamAssignment[]>;
  private teamMetrics: Map<string, RealTimeMetrics>;
  private performanceHistory: Map<string, TeamPerformanceHistory[]>;
  private activeTeamExecutions: Map<string, string[]>; // teamId -> executionIds

  constructor(
    redisConfig: { host: string; port: number; password?: string },
    coordinationHub: CoordinationHub
  ) {
    super();
    this.redis = new Redis(redisConfig);
    this.coordinationHub = coordinationHub;
    this.workflowOrchestrator = new WorkflowOrchestrator(redisConfig, coordinationHub);
    
    this.teamAssignments = new Map();
    this.teamMetrics = new Map();
    this.performanceHistory = new Map();
    this.activeTeamExecutions = new Map();

    this.initializeTeams();
    this.startMetricsCollection();
    this.setupEventHandlers();
  }

  /**
   * Assign agents to a team
   */
  public async assignAgentsToTeam(teamId: string): Promise<TeamAssignment[]> {
    const team = AGENT_TEAMS[teamId];
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    const assignments: TeamAssignment[] = [];
    const currentAssignments = this.teamAssignments.get(teamId) || [];

    for (const member of team.members) {
      // Check if we already have enough agents of this type
      const existingCount = currentAssignments.filter(
        a => this.getAgentType(a.agentId) === member.agentType
      ).length;

      if (existingCount < member.minInstances) {
        // Find and assign available agents
        const availableAgents = await this.findAvailableAgents(
          member.agentType,
          member.minInstances - existingCount
        );

        for (const agent of availableAgents) {
          const assignment: TeamAssignment = {
            teamId,
            agentId: agent.id,
            role: member.role,
            assignedAt: new Date(),
            workload: 0
          };

          assignments.push(assignment);
          currentAssignments.push(assignment);

          // Notify agent of team assignment
          await this.coordinationHub.sendMessage({
            fromAgent: 'team-manager',
            toAgent: agent.id,
            type: 'TEAM_ASSIGNMENT' as any,
            priority: 'HIGH' as any,
            payload: {
              teamId,
              role: member.role,
              teamName: team.name,
              capabilities: member.capabilities
            }
          });
        }
      }
    }

    this.teamAssignments.set(teamId, currentAssignments);
    this.emit('teamAssigned', { teamId, assignments });

    return assignments;
  }

  /**
   * Execute a business goal with the most suitable team
   */
  public async executeBusinessGoal(
    businessGoal: string,
    requirements: {
      capabilities: string[];
      priority: TeamPriority;
      deadline?: Date;
      budget?: number;
    }
  ): Promise<string> {
    // Find suitable teams based on capabilities
    const suitableTeams = this.findSuitableTeams(requirements.capabilities);

    if (suitableTeams.length === 0) {
      throw new Error(`No teams found with required capabilities: ${requirements.capabilities.join(', ')}`);
    }

    // Select optimal team based on current load and performance
    const selectedTeam = await this.selectOptimalTeam(suitableTeams, requirements);

    // Ensure team has agents assigned
    await this.assignAgentsToTeam(selectedTeam.id);

    // Execute workflow with the team
    const executionId = await this.workflowOrchestrator.executeTeam(
      selectedTeam.id,
      businessGoal,
      {
        requirements,
        initiatedBy: 'business-goal-executor',
        timestamp: new Date()
      }
    );

    // Track execution
    const executions = this.activeTeamExecutions.get(selectedTeam.id) || [];
    executions.push(executionId);
    this.activeTeamExecutions.set(selectedTeam.id, executions);

    this.emit('businessGoalStarted', {
      businessGoal,
      teamId: selectedTeam.id,
      executionId
    });

    return executionId;
  }

  /**
   * Execute multiple teams for complex business operations
   */
  public async executeMultiTeamOperation(
    operationType: string,
    context: Record<string, any>
  ): Promise<string[]> {
    const workflowConfig = TEAM_WORKFLOWS[operationType];
    if (!workflowConfig) {
      throw new Error(`Unknown operation type: ${operationType}`);
    }

    const executionIds: string[] = [];

    // Assign agents to all required teams
    for (const teamId of workflowConfig.teams) {
      await this.assignAgentsToTeam(teamId);
    }

    // Execute teams based on coordination type
    switch (workflowConfig.coordinationType) {
      case TeamCoordinationType.PARALLEL:
        // Execute all teams in parallel
        const parallelExecutions = await Promise.all(
          workflowConfig.teams.map(teamId =>
            this.workflowOrchestrator.executeTeam(teamId, operationType, context)
          )
        );
        executionIds.push(...parallelExecutions);
        break;

      case TeamCoordinationType.SEQUENTIAL:
        // Execute teams one after another
        let previousResult = null;
        for (const teamId of workflowConfig.teams) {
          const executionContext = previousResult 
            ? { ...context, previousResult }
            : context;
          
          const executionId = await this.workflowOrchestrator.executeTeam(
            teamId,
            operationType,
            executionContext
          );
          
          executionIds.push(executionId);
          
          // Wait for completion before next team
          previousResult = await this.waitForExecution(executionId);
        }
        break;

      case TeamCoordinationType.HYBRID:
        // Execute some teams in parallel, others sequential
        // This is a simplified implementation
        const firstBatch = workflowConfig.teams.slice(0, Math.ceil(workflowConfig.teams.length / 2));
        const secondBatch = workflowConfig.teams.slice(Math.ceil(workflowConfig.teams.length / 2));

        const firstExecutions = await Promise.all(
          firstBatch.map(teamId =>
            this.workflowOrchestrator.executeTeam(teamId, operationType, context)
          )
        );
        executionIds.push(...firstExecutions);

        // Wait for first batch to complete
        await Promise.all(firstExecutions.map(id => this.waitForExecution(id)));

        const secondExecutions = await Promise.all(
          secondBatch.map(teamId =>
            this.workflowOrchestrator.executeTeam(teamId, operationType, {
              ...context,
              firstBatchComplete: true
            })
          )
        );
        executionIds.push(...secondExecutions);
        break;
    }

    this.emit('multiTeamOperationStarted', {
      operationType,
      teams: workflowConfig.teams,
      executionIds
    });

    return executionIds;
  }

  /**
   * Get team monitoring dashboard data
   */
  public async getTeamMonitoring(teamId: string): Promise<TeamMonitoring> {
    const team = AGENT_TEAMS[teamId];
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    // Get real-time metrics
    const realTimeMetrics = this.teamMetrics.get(teamId) || this.createDefaultMetrics();

    // Get historical performance
    const history = this.performanceHistory.get(teamId) || [];
    const historicalPerformance = this.calculateHistoricalPerformance(history);

    // Get alerts
    const alerts = await this.generateTeamAlerts(teamId);

    // Get recommendations
    const recommendations = await this.generateTeamRecommendations(teamId, realTimeMetrics);

    return {
      teamId,
      realTimeMetrics,
      historicalPerformance,
      alerts,
      recommendations
    };
  }

  /**
   * Get all teams status
   */
  public async getAllTeamsStatus(): Promise<Record<string, any>> {
    const teamsStatus: Record<string, any> = {};

    for (const [teamId, team] of Object.entries(AGENT_TEAMS)) {
      const assignments = this.teamAssignments.get(teamId) || [];
      const metrics = this.teamMetrics.get(teamId) || this.createDefaultMetrics();
      const activeExecutions = this.activeTeamExecutions.get(teamId) || [];

      teamsStatus[teamId] = {
        team: {
          id: team.id,
          name: team.name,
          priority: team.priority,
          coordinationType: team.coordinationType
        },
        assignments: {
          total: assignments.length,
          byRole: this.groupAssignmentsByRole(assignments),
          averageWorkload: this.calculateAverageWorkload(assignments)
        },
        metrics: {
          activeExecutions: activeExecutions.length,
          successRate: metrics.successRate,
          averageExecutionTime: metrics.averageExecutionTime,
          throughput: metrics.throughput
        },
        capacity: {
          current: assignments.length,
          minimum: team.members.reduce((sum, m) => sum + m.minInstances, 0),
          maximum: team.members.reduce((sum, m) => sum + m.maxInstances, 0),
          utilization: (assignments.length / calculateTeamCapacity(team)) * 100
        },
        health: this.calculateTeamHealth(teamId, metrics, assignments)
      };
    }

    return teamsStatus;
  }

  /**
   * Rebalance team assignments based on workload
   */
  public async rebalanceTeams(): Promise<void> {
    for (const [teamId, assignments] of this.teamAssignments.entries()) {
      const team = AGENT_TEAMS[teamId];
      if (!team) continue;

      // Identify overloaded and underutilized agents
      const overloaded = assignments.filter(a => a.workload > 80);
      const underutilized = assignments.filter(a => a.workload < 20);

      // Rebalance if needed
      if (overloaded.length > 0 && underutilized.length > 0) {
        // Find replacement agents
        for (const assignment of overloaded) {
          const agentType = this.getAgentType(assignment.agentId);
          const member = team.members.find(m => m.agentType === agentType);
          
          if (member && assignments.filter(a => 
            this.getAgentType(a.agentId) === agentType
          ).length < member.maxInstances) {
            // Find and assign a new agent
            const newAgents = await this.findAvailableAgents(agentType, 1);
            if (newAgents.length > 0) {
              const newAssignment: TeamAssignment = {
                teamId,
                agentId: newAgents[0].id,
                role: assignment.role,
                assignedAt: new Date(),
                workload: 0
              };
              assignments.push(newAssignment);
            }
          }
        }

        this.teamAssignments.set(teamId, assignments);
        this.emit('teamRebalanced', { teamId, assignments });
      }
    }
  }

  private async findAvailableAgents(
    agentType: AgentType,
    count: number
  ): Promise<AgentInfo[]> {
    const allAgents = Array.from(this.coordinationHub['agents'].values());
    const availableAgents = allAgents.filter(agent =>
      agent.type === agentType &&
      agent.status === AgentStatus.HEALTHY &&
      agent.currentLoad < 50 && // Less than 50% loaded
      !this.isAgentAssigned(agent.id)
    );

    return availableAgents.slice(0, count);
  }

  private isAgentAssigned(agentId: string): boolean {
    for (const assignments of this.teamAssignments.values()) {
      if (assignments.some(a => a.agentId === agentId)) {
        return true;
      }
    }
    return false;
  }

  private getAgentType(agentId: string): AgentType {
    const agent = this.coordinationHub['agents'].get(agentId);
    return agent ? agent.type : AgentType.BUSINESS_INTELLIGENCE;
  }

  private findSuitableTeams(requiredCapabilities: string[]): AgentTeam[] {
    return Object.values(AGENT_TEAMS).filter(team =>
      requiredCapabilities.every(cap =>
        team.capabilities.includes(cap) ||
        team.members.some(member => member.capabilities.includes(cap))
      )
    );
  }

  private async selectOptimalTeam(
    teams: AgentTeam[],
    requirements: any
  ): Promise<AgentTeam> {
    let bestTeam = teams[0];
    let bestScore = -1;

    for (const team of teams) {
      const score = await this.calculateTeamScore(team, requirements);
      if (score > bestScore) {
        bestScore = score;
        bestTeam = team;
      }
    }

    return bestTeam;
  }

  private async calculateTeamScore(
    team: AgentTeam,
    requirements: any
  ): Promise<number> {
    let score = 100;

    // Priority alignment
    if (team.priority === requirements.priority) {
      score += 20;
    }

    // Current workload (lower is better)
    const metrics = this.teamMetrics.get(team.id);
    if (metrics) {
      const utilizationFactor = 1 - (metrics.agentUtilization['average'] || 0) / 100;
      score *= utilizationFactor;
    }

    // Success rate
    if (metrics && metrics.successRate) {
      score *= (metrics.successRate / 100);
    }

    // Capability match (more specific capabilities = higher score)
    const capabilityMatch = requirements.capabilities.filter(cap =>
      team.capabilities.includes(cap)
    ).length / requirements.capabilities.length;
    score *= (1 + capabilityMatch);

    return score;
  }

  private async waitForExecution(executionId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const status = this.workflowOrchestrator.getExecutionStatus(executionId);
        
        if (!status) {
          clearInterval(checkInterval);
          reject(new Error(`Execution ${executionId} not found`));
          return;
        }

        if (status.status === ExecutionStatus.COMPLETED) {
          clearInterval(checkInterval);
          resolve(status.results);
        } else if (status.status === ExecutionStatus.FAILED) {
          clearInterval(checkInterval);
          reject(new Error(`Execution ${executionId} failed`));
        }
      }, 5000); // Check every 5 seconds

      // Timeout after 30 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`Execution ${executionId} timed out`));
      }, 1800000);
    });
  }

  private createDefaultMetrics(): RealTimeMetrics {
    return {
      activeExecutions: 0,
      queuedExecutions: 0,
      averageExecutionTime: 0,
      successRate: 100,
      agentUtilization: {},
      throughput: 0
    };
  }

  private calculateHistoricalPerformance(
    history: TeamPerformanceHistory[]
  ): HistoricalPerformance {
    if (history.length === 0) {
      return {
        period: { start: new Date(Date.now() - 86400000), end: new Date() },
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        peakHours: [],
        performanceTrend: 'stable'
      };
    }

    const totalExecutions = history.reduce((sum, h) => 
      sum + h.metrics.tasksCompleted + h.metrics.tasksFailed, 0
    );
    const successfulExecutions = history.reduce((sum, h) => 
      sum + h.metrics.tasksCompleted, 0
    );
    const failedExecutions = history.reduce((sum, h) => 
      sum + h.metrics.tasksFailed, 0
    );
    const averageDuration = history.reduce((sum, h) => 
      sum + h.metrics.averageResponseTime, 0
    ) / history.length;

    // Calculate performance trend
    const recentHistory = history.slice(-7);
    const olderHistory = history.slice(-14, -7);
    
    const recentSuccessRate = recentHistory.length > 0
      ? recentHistory.reduce((sum, h) => sum + 
          (h.metrics.tasksCompleted / (h.metrics.tasksCompleted + h.metrics.tasksFailed) * 100), 0
        ) / recentHistory.length
      : 0;
    
    const olderSuccessRate = olderHistory.length > 0
      ? olderHistory.reduce((sum, h) => sum + 
          (h.metrics.tasksCompleted / (h.metrics.tasksCompleted + h.metrics.tasksFailed) * 100), 0
        ) / olderHistory.length
      : 0;

    let performanceTrend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (recentSuccessRate > olderSuccessRate + 5) {
      performanceTrend = 'improving';
    } else if (recentSuccessRate < olderSuccessRate - 5) {
      performanceTrend = 'degrading';
    }

    return {
      period: {
        start: history[0].date,
        end: history[history.length - 1].date
      },
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageDuration,
      peakHours: this.calculatePeakHours(history),
      performanceTrend
    };
  }

  private calculatePeakHours(history: TeamPerformanceHistory[]): number[] {
    const hourlyActivity: Record<number, number> = {};
    
    history.forEach(h => {
      const hour = h.date.getHours();
      hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 
        h.metrics.tasksCompleted + h.metrics.tasksFailed;
    });

    // Find top 3 peak hours
    return Object.entries(hourlyActivity)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));
  }

  private async generateTeamAlerts(teamId: string): Promise<TeamAlert[]> {
    const alerts: TeamAlert[] = [];
    const team = AGENT_TEAMS[teamId];
    const assignments = this.teamAssignments.get(teamId) || [];
    const metrics = this.teamMetrics.get(teamId);

    // Check minimum agent requirements
    for (const member of team.members) {
      const assignedCount = assignments.filter(a =>
        this.getAgentType(a.agentId) === member.agentType
      ).length;

      if (member.required && assignedCount < member.minInstances) {
        alerts.push({
          id: uuidv4(),
          severity: 'critical',
          type: 'insufficient-agents',
          message: `Team ${teamId} has insufficient ${member.agentType} agents (${assignedCount}/${member.minInstances})`,
          timestamp: new Date(),
          affectedAgents: assignments
            .filter(a => this.getAgentType(a.agentId) === member.agentType)
            .map(a => a.agentId),
          suggestedAction: `Assign ${member.minInstances - assignedCount} more ${member.agentType} agents`
        });
      }
    }

    // Check performance metrics
    if (metrics) {
      if (metrics.successRate < 80) {
        alerts.push({
          id: uuidv4(),
          severity: 'warning',
          type: 'low-success-rate',
          message: `Team ${teamId} success rate is ${metrics.successRate.toFixed(1)}%`,
          timestamp: new Date(),
          affectedAgents: assignments.map(a => a.agentId),
          suggestedAction: 'Review recent failures and optimize workflow configuration'
        });
      }

      if (metrics.averageExecutionTime > 600000) { // 10 minutes
        alerts.push({
          id: uuidv4(),
          severity: 'info',
          type: 'slow-execution',
          message: `Team ${teamId} average execution time is ${(metrics.averageExecutionTime / 60000).toFixed(1)} minutes`,
          timestamp: new Date(),
          affectedAgents: assignments.map(a => a.agentId),
          suggestedAction: 'Consider optimizing workflow steps or adding parallel execution'
        });
      }
    }

    return alerts;
  }

  private async generateTeamRecommendations(
    teamId: string,
    metrics: RealTimeMetrics
  ): Promise<TeamRecommendation[]> {
    const recommendations: TeamRecommendation[] = [];
    const team = AGENT_TEAMS[teamId];
    const assignments = this.teamAssignments.get(teamId) || [];

    // Scaling recommendations
    if (metrics.queuedExecutions > 5) {
      recommendations.push({
        type: 'scaling',
        priority: TeamPriority.HIGH,
        description: `Scale up team ${teamId} to handle queued executions`,
        estimatedImpact: 'Reduce queue time by 50% and improve throughput',
        implementation: `Add ${Math.ceil(metrics.queuedExecutions / 3)} more agents to the team`
      });
    }

    // Optimization recommendations
    if (metrics.averageExecutionTime > 300000 && team.coordinationType === TeamCoordinationType.SEQUENTIAL) {
      recommendations.push({
        type: 'optimization',
        priority: TeamPriority.MEDIUM,
        description: 'Switch to parallel or hybrid coordination for faster execution',
        estimatedImpact: 'Reduce execution time by 40-60%',
        implementation: 'Update team coordination type to PARALLEL or HYBRID'
      });
    }

    // Configuration recommendations
    const avgUtilization = Object.values(metrics.agentUtilization).reduce((a, b) => a + b, 0) 
      / Object.values(metrics.agentUtilization).length;
    
    if (avgUtilization < 30) {
      recommendations.push({
        type: 'configuration',
        priority: TeamPriority.LOW,
        description: 'Reduce team size due to low utilization',
        estimatedImpact: 'Optimize resource allocation and reduce costs',
        implementation: `Reduce team to ${Math.ceil(assignments.length * 0.7)} agents`
      });
    }

    return recommendations;
  }

  private groupAssignmentsByRole(assignments: TeamAssignment[]): Record<TeamRole, number> {
    return assignments.reduce((groups, assignment) => {
      groups[assignment.role] = (groups[assignment.role] || 0) + 1;
      return groups;
    }, {} as Record<TeamRole, number>);
  }

  private calculateAverageWorkload(assignments: TeamAssignment[]): number {
    if (assignments.length === 0) return 0;
    return assignments.reduce((sum, a) => sum + a.workload, 0) / assignments.length;
  }

  private calculateTeamHealth(
    teamId: string,
    metrics: RealTimeMetrics,
    assignments: TeamAssignment[]
  ): 'healthy' | 'degraded' | 'critical' {
    const team = AGENT_TEAMS[teamId];
    
    // Check critical conditions
    const hasRequiredAgents = team.members.every(member => {
      if (!member.required) return true;
      const count = assignments.filter(a => 
        this.getAgentType(a.agentId) === member.agentType
      ).length;
      return count >= member.minInstances;
    });

    if (!hasRequiredAgents) return 'critical';

    // Check degraded conditions
    if (metrics.successRate < 80 || metrics.averageExecutionTime > 600000) {
      return 'degraded';
    }

    return 'healthy';
  }

  private initializeTeams(): void {
    // Initialize metrics for all teams
    Object.keys(AGENT_TEAMS).forEach(teamId => {
      this.teamMetrics.set(teamId, this.createDefaultMetrics());
      this.teamAssignments.set(teamId, []);
      this.performanceHistory.set(teamId, []);
      this.activeTeamExecutions.set(teamId, []);
    });
  }

  private startMetricsCollection(): void {
    // Collect metrics every minute
    setInterval(async () => {
      for (const [teamId, team] of Object.entries(AGENT_TEAMS)) {
        const assignments = this.teamAssignments.get(teamId) || [];
        const executions = this.activeTeamExecutions.get(teamId) || [];

        // Calculate agent utilization
        const agentUtilization: Record<string, number> = {};
        for (const assignment of assignments) {
          const agent = this.coordinationHub['agents'].get(assignment.agentId);
          if (agent) {
            agentUtilization[agent.type] = agentUtilization[agent.type] || 0;
            agentUtilization[agent.type] += (agent.currentLoad / agent.maxCapacity) * 100;
          }
        }

        // Average utilization by type
        for (const [type, total] of Object.entries(agentUtilization)) {
          const count = assignments.filter(a => 
            this.getAgentType(a.agentId) === type
          ).length;
          agentUtilization[type] = total / count;
        }

        // Update metrics
        const metrics: RealTimeMetrics = {
          activeExecutions: executions.filter(id => {
            const status = this.workflowOrchestrator.getExecutionStatus(id);
            return status && status.status === ExecutionStatus.RUNNING;
          }).length,
          queuedExecutions: executions.filter(id => {
            const status = this.workflowOrchestrator.getExecutionStatus(id);
            return status && status.status === ExecutionStatus.PENDING;
          }).length,
          averageExecutionTime: await this.calculateAverageExecutionTime(teamId),
          successRate: await this.calculateSuccessRate(teamId),
          agentUtilization,
          throughput: await this.calculateThroughput(teamId)
        };

        this.teamMetrics.set(teamId, metrics);

        // Store in history
        const history = this.performanceHistory.get(teamId) || [];
        history.push({
          teamId,
          date: new Date(),
          metrics: {
            tasksCompleted: executions.filter(id => {
              const status = this.workflowOrchestrator.getExecutionStatus(id);
              return status && status.status === ExecutionStatus.COMPLETED;
            }).length,
            tasksFailed: executions.filter(id => {
              const status = this.workflowOrchestrator.getExecutionStatus(id);
              return status && status.status === ExecutionStatus.FAILED;
            }).length,
            averageResponseTime: metrics.averageExecutionTime,
            utilizationRate: Object.values(agentUtilization).reduce((a, b) => a + b, 0) 
              / Object.values(agentUtilization).length,
            businessValue: 0 // TODO: Calculate actual business value
          }
        });

        // Keep only last 7 days of history
        if (history.length > 10080) { // 7 days * 24 hours * 60 minutes
          history.shift();
        }

        this.performanceHistory.set(teamId, history);
      }

      this.emit('metricsUpdated', { timestamp: new Date() });
    }, 60000); // Every minute
  }

  private async calculateAverageExecutionTime(teamId: string): Promise<number> {
    const executions = this.activeTeamExecutions.get(teamId) || [];
    const completedExecutions = executions
      .map(id => this.workflowOrchestrator.getExecutionStatus(id))
      .filter(status => status && status.status === ExecutionStatus.COMPLETED);

    if (completedExecutions.length === 0) return 0;

    const totalTime = completedExecutions.reduce((sum, execution) => {
      if (execution && execution.endTime && execution.startTime) {
        return sum + (execution.endTime.getTime() - execution.startTime.getTime());
      }
      return sum;
    }, 0);

    return totalTime / completedExecutions.length;
  }

  private async calculateSuccessRate(teamId: string): Promise<number> {
    const executions = this.activeTeamExecutions.get(teamId) || [];
    if (executions.length === 0) return 100;

    const statuses = executions
      .map(id => this.workflowOrchestrator.getExecutionStatus(id))
      .filter(status => status && 
        (status.status === ExecutionStatus.COMPLETED || status.status === ExecutionStatus.FAILED)
      );

    if (statuses.length === 0) return 100;

    const successful = statuses.filter(s => s && s.status === ExecutionStatus.COMPLETED).length;
    return (successful / statuses.length) * 100;
  }

  private async calculateThroughput(teamId: string): Promise<number> {
    const executions = this.activeTeamExecutions.get(teamId) || [];
    const recentCompletions = executions
      .map(id => this.workflowOrchestrator.getExecutionStatus(id))
      .filter(status => status && 
        status.status === ExecutionStatus.COMPLETED &&
        status.endTime &&
        status.endTime.getTime() > Date.now() - 3600000 // Last hour
      );

    return recentCompletions.length; // Completions per hour
  }

  private setupEventHandlers(): void {
    // Listen to workflow orchestrator events
    this.workflowOrchestrator.on('workflowStarted', (data) => {
      this.emit('teamWorkflowStarted', data);
    });

    this.workflowOrchestrator.on('stepCompleted', (data) => {
      this.emit('teamStepCompleted', data);
    });

    this.workflowOrchestrator.on('executionCompleted', (data) => {
      this.emit('teamExecutionCompleted', data);
    });

    // Listen to coordination hub events
    this.coordinationHub.on('agentRegistered', (agent: AgentInfo) => {
      // Check if new agent should be assigned to any team
      this.checkNewAgentAssignment(agent);
    });

    this.coordinationHub.on('agentUnhealthy', (data) => {
      // Handle agent becoming unhealthy
      this.handleUnhealthyAgent(data.agentId);
    });
  }

  private async checkNewAgentAssignment(agent: AgentInfo): Promise<void> {
    // Check all teams to see if they need this agent type
    for (const [teamId, team] of Object.entries(AGENT_TEAMS)) {
      const member = team.members.find(m => m.agentType === agent.type);
      if (member) {
        const assignments = this.teamAssignments.get(teamId) || [];
        const currentCount = assignments.filter(a => 
          this.getAgentType(a.agentId) === agent.type
        ).length;

        if (currentCount < member.minInstances) {
          // Assign this agent to the team
          const assignment: TeamAssignment = {
            teamId,
            agentId: agent.id,
            role: member.role,
            assignedAt: new Date(),
            workload: 0
          };

          assignments.push(assignment);
          this.teamAssignments.set(teamId, assignments);

          this.emit('agentAutoAssigned', {
            teamId,
            agentId: agent.id,
            role: member.role
          });
        }
      }
    }
  }

  private async handleUnhealthyAgent(agentId: string): Promise<void> {
    // Remove agent from all team assignments
    for (const [teamId, assignments] of this.teamAssignments.entries()) {
      const filtered = assignments.filter(a => a.agentId !== agentId);
      if (filtered.length < assignments.length) {
        this.teamAssignments.set(teamId, filtered);
        
        // Check if team still meets minimum requirements
        const team = AGENT_TEAMS[teamId];
        const agentType = this.getAgentType(agentId);
        const member = team.members.find(m => m.agentType === agentType);
        
        if (member && member.required) {
          const remainingCount = filtered.filter(a => 
            this.getAgentType(a.agentId) === agentType
          ).length;
          
          if (remainingCount < member.minInstances) {
            // Try to find replacement
            const replacements = await this.findAvailableAgents(agentType, 1);
            if (replacements.length > 0) {
              const assignment: TeamAssignment = {
                teamId,
                agentId: replacements[0].id,
                role: member.role,
                assignedAt: new Date(),
                workload: 0
              };
              filtered.push(assignment);
              this.teamAssignments.set(teamId, filtered);
            } else {
              // Emit critical alert
              this.emit('teamCritical', {
                teamId,
                reason: `Lost required ${agentType} agent and no replacement available`
              });
            }
          }
        }
      }
    }
  }
}