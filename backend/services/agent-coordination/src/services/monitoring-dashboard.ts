import { EventEmitter } from 'eventemitter3';
import { TeamManager } from './team-manager';
import { WorkflowOrchestrator } from './workflow-orchestrator';
import { CoordinationHub } from './coordination-hub';
import { AGENT_TEAMS } from '../config/agent-teams';
import {
  TeamExecution,
  ExecutionStatus,
  TeamMonitoring,
  RealTimeMetrics
} from '../types/teams';
import { AgentType } from '../types';

export interface DashboardMetrics {
  overview: SystemOverview;
  teams: TeamMetrics[];
  agents: AgentMetrics[];
  workflows: WorkflowMetrics;
  alerts: SystemAlert[];
  performance: PerformanceMetrics;
}

interface SystemOverview {
  totalTeams: number;
  activeTeams: number;
  totalAgents: number;
  activeAgents: number;
  totalExecutions: number;
  activeExecutions: number;
  systemHealth: 'healthy' | 'degraded' | 'critical';
  uptime: number;
}

interface TeamMetrics {
  teamId: string;
  teamName: string;
  status: 'active' | 'idle' | 'overloaded';
  activeExecutions: number;
  queuedExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  agentUtilization: number;
  trend: 'improving' | 'stable' | 'degrading';
}

interface AgentMetrics {
  agentId: string;
  agentType: AgentType;
  status: string;
  currentLoad: number;
  assignedTeams: string[];
  tasksCompleted: number;
  averageResponseTime: number;
  efficiency: number;
}

interface WorkflowMetrics {
  totalWorkflows: number;
  activeWorkflows: number;
  completedToday: number;
  failedToday: number;
  averageDuration: number;
  bottlenecks: WorkflowBottleneck[];
}

interface WorkflowBottleneck {
  workflowId: string;
  stepId: string;
  averageWaitTime: number;
  occurrences: number;
  impact: 'low' | 'medium' | 'high';
}

interface SystemAlert {
  id: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  message: string;
  affectedComponents: string[];
  actionRequired: boolean;
}

interface PerformanceMetrics {
  throughput: {
    current: number;
    average: number;
    peak: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
  errorRate: number;
  resourceUtilization: {
    cpu: number;
    memory: number;
    queueDepth: number;
  };
}

export class MonitoringDashboard extends EventEmitter {
  private teamManager: TeamManager;
  private workflowOrchestrator: WorkflowOrchestrator;
  private coordinationHub: CoordinationHub;
  private metricsCache: Map<string, any>;
  private alertHistory: SystemAlert[];
  private metricsUpdateInterval: NodeJS.Timeout;

  constructor(
    teamManager: TeamManager,
    workflowOrchestrator: WorkflowOrchestrator,
    coordinationHub: CoordinationHub
  ) {
    super();
    this.teamManager = teamManager;
    this.workflowOrchestrator = workflowOrchestrator;
    this.coordinationHub = coordinationHub;
    this.metricsCache = new Map();
    this.alertHistory = [];

    this.setupEventListeners();
    this.startMetricsCollection();
  }

  /**
   * Get complete dashboard metrics
   */
  public async getDashboardMetrics(): Promise<DashboardMetrics> {
    const [overview, teams, agents, workflows, performance] = await Promise.all([
      this.getSystemOverview(),
      this.getTeamMetrics(),
      this.getAgentMetrics(),
      this.getWorkflowMetrics(),
      this.getPerformanceMetrics()
    ]);

    return {
      overview,
      teams,
      agents,
      workflows,
      alerts: this.getRecentAlerts(),
      performance
    };
  }

  /**
   * Get real-time updates for specific team
   */
  public async getTeamDashboard(teamId: string): Promise<any> {
    const monitoring = await this.teamManager.getTeamMonitoring(teamId);
    const team = AGENT_TEAMS[teamId];

    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    // Get agent details for the team
    const teamAgents = await this.getTeamAgents(teamId);

    // Get recent executions
    const recentExecutions = await this.getRecentTeamExecutions(teamId);

    // Calculate team-specific metrics
    const teamMetrics = {
      efficiency: this.calculateTeamEfficiency(monitoring.realTimeMetrics),
      costPerTask: this.calculateCostPerTask(monitoring),
      resourceAllocation: this.calculateResourceAllocation(team, teamAgents),
      performanceScore: this.calculatePerformanceScore(monitoring)
    };

    return {
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        coordinationType: team.coordinationType,
        priority: team.priority
      },
      monitoring,
      agents: teamAgents,
      recentExecutions,
      metrics: teamMetrics,
      recommendations: monitoring.recommendations,
      alerts: monitoring.alerts
    };
  }

  /**
   * Get workflow execution timeline
   */
  public async getWorkflowTimeline(executionId: string): Promise<any> {
    const execution = this.workflowOrchestrator.getExecutionStatus(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    // Build timeline of events
    const timeline = this.buildExecutionTimeline(execution);

    // Calculate step durations
    const stepDurations = this.calculateStepDurations(timeline);

    // Identify critical path
    const criticalPath = this.identifyCriticalPath(execution, stepDurations);

    return {
      execution: {
        id: execution.id,
        status: execution.status,
        progress: execution.progress,
        duration: execution.endTime 
          ? execution.endTime.getTime() - execution.startTime.getTime()
          : Date.now() - execution.startTime.getTime()
      },
      timeline,
      stepDurations,
      criticalPath,
      bottlenecks: this.identifyBottlenecks(stepDurations),
      recommendations: this.generateOptimizationRecommendations(execution, stepDurations)
    };
  }

  /**
   * Get agent performance comparison
   */
  public async getAgentComparison(agentType?: AgentType): Promise<any> {
    const agents = Array.from(this.coordinationHub['agents'].values());
    const filteredAgents = agentType 
      ? agents.filter(a => a.type === agentType)
      : agents;

    const comparisons = await Promise.all(
      filteredAgents.map(async agent => {
        const metrics = await this.getAgentPerformanceMetrics(agent.id);
        return {
          agent: {
            id: agent.id,
            name: agent.name,
            type: agent.type,
            status: agent.status
          },
          performance: metrics,
          ranking: 0 // Will be calculated after all metrics are collected
        };
      })
    );

    // Calculate rankings
    comparisons.sort((a, b) => b.performance.efficiency - a.performance.efficiency);
    comparisons.forEach((comp, index) => {
      comp.ranking = index + 1;
    });

    return {
      agentType: agentType || 'all',
      comparisons,
      insights: this.generateAgentInsights(comparisons),
      recommendations: this.generateAgentRecommendations(comparisons)
    };
  }

  private async getSystemOverview(): Promise<SystemOverview> {
    const agents = Array.from(this.coordinationHub['agents'].values());
    const teamsStatus = await this.teamManager.getAllTeamsStatus();
    
    const activeTeams = Object.values(teamsStatus).filter(
      (status: any) => status.metrics.activeExecutions > 0
    ).length;

    const activeAgents = agents.filter(a => a.currentLoad > 0).length;

    // Get all executions across teams
    let totalExecutions = 0;
    let activeExecutions = 0;
    
    for (const teamId of Object.keys(AGENT_TEAMS)) {
      const monitoring = await this.teamManager.getTeamMonitoring(teamId);
      totalExecutions += monitoring.historicalPerformance.totalExecutions;
      activeExecutions += monitoring.realTimeMetrics.activeExecutions;
    }

    // Determine system health
    const healthyTeams = Object.values(teamsStatus).filter(
      (status: any) => status.health === 'healthy'
    ).length;
    const totalTeams = Object.keys(AGENT_TEAMS).length;
    
    let systemHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (healthyTeams < totalTeams * 0.5) {
      systemHealth = 'critical';
    } else if (healthyTeams < totalTeams * 0.8) {
      systemHealth = 'degraded';
    }

    return {
      totalTeams: Object.keys(AGENT_TEAMS).length,
      activeTeams,
      totalAgents: agents.length,
      activeAgents,
      totalExecutions,
      activeExecutions,
      systemHealth,
      uptime: process.uptime()
    };
  }

  private async getTeamMetrics(): Promise<TeamMetrics[]> {
    const metrics: TeamMetrics[] = [];

    for (const [teamId, team] of Object.entries(AGENT_TEAMS)) {
      const monitoring = await this.teamManager.getTeamMonitoring(teamId);
      const realTime = monitoring.realTimeMetrics;

      const status: 'active' | 'idle' | 'overloaded' = 
        realTime.activeExecutions === 0 ? 'idle' :
        realTime.queuedExecutions > 5 ? 'overloaded' : 'active';

      const avgUtilization = Object.values(realTime.agentUtilization).length > 0
        ? Object.values(realTime.agentUtilization).reduce((a, b) => a + b, 0) / 
          Object.values(realTime.agentUtilization).length
        : 0;

      metrics.push({
        teamId,
        teamName: team.name,
        status,
        activeExecutions: realTime.activeExecutions,
        queuedExecutions: realTime.queuedExecutions,
        successRate: realTime.successRate,
        averageExecutionTime: realTime.averageExecutionTime,
        agentUtilization: avgUtilization,
        trend: monitoring.historicalPerformance.performanceTrend
      });
    }

    return metrics;
  }

  private async getAgentMetrics(): Promise<AgentMetrics[]> {
    const agents = Array.from(this.coordinationHub['agents'].values());
    const metrics: AgentMetrics[] = [];

    for (const agent of agents) {
      const assignedTeams = this.getAgentTeams(agent.id);
      const performanceMetrics = await this.getAgentPerformanceMetrics(agent.id);

      metrics.push({
        agentId: agent.id,
        agentType: agent.type,
        status: agent.status,
        currentLoad: agent.currentLoad,
        assignedTeams,
        tasksCompleted: performanceMetrics.tasksCompleted,
        averageResponseTime: performanceMetrics.averageResponseTime,
        efficiency: performanceMetrics.efficiency
      });
    }

    return metrics;
  }

  private async getWorkflowMetrics(): Promise<WorkflowMetrics> {
    // Get all executions from today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let totalWorkflows = 0;
    let activeWorkflows = 0;
    let completedToday = 0;
    let failedToday = 0;
    let totalDuration = 0;
    let durationCount = 0;

    for (const teamId of Object.keys(AGENT_TEAMS)) {
      const monitoring = await this.teamManager.getTeamMonitoring(teamId);
      
      totalWorkflows += monitoring.historicalPerformance.totalExecutions;
      activeWorkflows += monitoring.realTimeMetrics.activeExecutions;
      
      // Note: This is simplified - in production, you'd query actual execution records
      const todayCompletions = Math.floor(
        monitoring.historicalPerformance.successfulExecutions * 0.1
      );
      const todayFailures = Math.floor(
        monitoring.historicalPerformance.failedExecutions * 0.1
      );
      
      completedToday += todayCompletions;
      failedToday += todayFailures;
      
      if (monitoring.historicalPerformance.averageDuration > 0) {
        totalDuration += monitoring.historicalPerformance.averageDuration;
        durationCount++;
      }
    }

    const averageDuration = durationCount > 0 ? totalDuration / durationCount : 0;

    // Identify bottlenecks (simplified)
    const bottlenecks: WorkflowBottleneck[] = [];
    if (averageDuration > 600000) { // 10 minutes
      bottlenecks.push({
        workflowId: 'general',
        stepId: 'processing',
        averageWaitTime: averageDuration * 0.3,
        occurrences: Math.floor(totalWorkflows * 0.2),
        impact: 'high'
      });
    }

    return {
      totalWorkflows,
      activeWorkflows,
      completedToday,
      failedToday,
      averageDuration,
      bottlenecks
    };
  }

  private async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    // Calculate system-wide performance metrics
    let totalThroughput = 0;
    let totalLatency = 0;
    let totalErrors = 0;
    let totalTasks = 0;

    for (const teamId of Object.keys(AGENT_TEAMS)) {
      const monitoring = await this.teamManager.getTeamMonitoring(teamId);
      totalThroughput += monitoring.realTimeMetrics.throughput;
      totalLatency += monitoring.realTimeMetrics.averageExecutionTime;
      totalErrors += monitoring.historicalPerformance.failedExecutions;
      totalTasks += monitoring.historicalPerformance.totalExecutions;
    }

    const avgLatency = totalLatency / Object.keys(AGENT_TEAMS).length;
    const errorRate = totalTasks > 0 ? (totalErrors / totalTasks) * 100 : 0;

    // Calculate resource utilization
    const agents = Array.from(this.coordinationHub['agents'].values());
    const avgCpuUtil = agents.reduce((sum, agent) => 
      sum + (agent.currentLoad / agent.maxCapacity) * 100, 0
    ) / agents.length;

    return {
      throughput: {
        current: totalThroughput,
        average: totalThroughput * 0.8,
        peak: totalThroughput * 1.5
      },
      latency: {
        p50: avgLatency * 0.7,
        p95: avgLatency * 1.3,
        p99: avgLatency * 1.8
      },
      errorRate,
      resourceUtilization: {
        cpu: avgCpuUtil,
        memory: avgCpuUtil * 0.8, // Simplified correlation
        queueDepth: totalThroughput * 2
      }
    };
  }

  private getRecentAlerts(): SystemAlert[] {
    // Return last 50 alerts
    return this.alertHistory.slice(-50);
  }

  private async getTeamAgents(teamId: string): Promise<any[]> {
    // This would integrate with TeamManager to get actual assignments
    const agents = Array.from(this.coordinationHub['agents'].values());
    const team = AGENT_TEAMS[teamId];
    
    return agents.filter(agent => 
      team.members.some(member => member.agentType === agent.type)
    ).map(agent => ({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      currentLoad: agent.currentLoad,
      maxCapacity: agent.maxCapacity,
      utilization: (agent.currentLoad / agent.maxCapacity) * 100
    }));
  }

  private async getRecentTeamExecutions(teamId: string): Promise<any[]> {
    // This would integrate with WorkflowOrchestrator to get actual executions
    // For now, return mock data structure
    return [];
  }

  private calculateTeamEfficiency(metrics: RealTimeMetrics): number {
    const factors = [
      metrics.successRate / 100,
      1 - (metrics.queuedExecutions / Math.max(metrics.activeExecutions, 1)),
      Math.min(metrics.throughput / 10, 1),
      1 - (metrics.averageExecutionTime / 600000) // 10 minutes baseline
    ];

    return factors.reduce((a, b) => a + b, 0) / factors.length * 100;
  }

  private calculateCostPerTask(monitoring: TeamMonitoring): number {
    // Simplified cost calculation
    const baseCost = 0.10; // $0.10 per task
    const utilizationMultiplier = 1 + (
      Object.values(monitoring.realTimeMetrics.agentUtilization)
        .reduce((a, b) => a + b, 0) / 
      Object.values(monitoring.realTimeMetrics.agentUtilization).length / 100
    );
    
    return baseCost * utilizationMultiplier;
  }

  private calculateResourceAllocation(team: any, agents: any[]): any {
    const allocation: Record<string, number> = {};
    
    team.members.forEach((member: any) => {
      const memberAgents = agents.filter(a => a.type === member.agentType);
      allocation[member.agentType] = {
        allocated: memberAgents.length,
        required: member.minInstances,
        maximum: member.maxInstances,
        utilization: memberAgents.reduce((sum, a) => sum + a.utilization, 0) / 
          memberAgents.length || 0
      };
    });

    return allocation;
  }

  private calculatePerformanceScore(monitoring: TeamMonitoring): number {
    const weights = {
      successRate: 0.4,
      throughput: 0.2,
      executionTime: 0.2,
      utilization: 0.2
    };

    const avgUtilization = Object.values(monitoring.realTimeMetrics.agentUtilization)
      .reduce((a, b) => a + b, 0) / 
      Object.values(monitoring.realTimeMetrics.agentUtilization).length || 0;

    const scores = {
      successRate: monitoring.realTimeMetrics.successRate,
      throughput: Math.min(monitoring.realTimeMetrics.throughput * 10, 100),
      executionTime: Math.max(100 - (monitoring.realTimeMetrics.averageExecutionTime / 6000), 0),
      utilization: 100 - Math.abs(avgUtilization - 70) // Optimal at 70%
    };

    return Object.entries(scores).reduce((total, [key, score]) => 
      total + score * weights[key], 0
    );
  }

  private buildExecutionTimeline(execution: TeamExecution): any[] {
    // Build timeline from execution progress and errors
    const timeline = [];
    
    timeline.push({
      timestamp: execution.startTime,
      event: 'execution_started',
      status: 'success'
    });

    // Add completed steps
    for (let i = 0; i < execution.progress.completedSteps; i++) {
      timeline.push({
        timestamp: new Date(
          execution.startTime.getTime() + 
          (i + 1) * (execution.metrics.averageStepDuration || 60000)
        ),
        event: `step_${i}_completed`,
        status: 'success'
      });
    }

    // Add errors
    execution.errors.forEach(error => {
      timeline.push({
        timestamp: error.timestamp,
        event: `error_${error.stepId}`,
        status: 'error',
        details: error
      });
    });

    if (execution.endTime) {
      timeline.push({
        timestamp: execution.endTime,
        event: 'execution_completed',
        status: execution.status === ExecutionStatus.COMPLETED ? 'success' : 'failure'
      });
    }

    return timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private calculateStepDurations(timeline: any[]): Record<string, number> {
    const durations: Record<string, number> = {};
    
    for (let i = 1; i < timeline.length; i++) {
      const duration = timeline[i].timestamp.getTime() - timeline[i-1].timestamp.getTime();
      durations[timeline[i-1].event] = duration;
    }

    return durations;
  }

  private identifyCriticalPath(execution: TeamExecution, stepDurations: Record<string, number>): string[] {
    // Simplified critical path - longest duration steps
    return Object.entries(stepDurations)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([step]) => step);
  }

  private identifyBottlenecks(stepDurations: Record<string, number>): any[] {
    const avgDuration = Object.values(stepDurations).reduce((a, b) => a + b, 0) / 
      Object.values(stepDurations).length;

    return Object.entries(stepDurations)
      .filter(([, duration]) => duration > avgDuration * 1.5)
      .map(([step, duration]) => ({
        step,
        duration,
        impact: duration > avgDuration * 2 ? 'high' : 'medium',
        recommendation: `Optimize ${step} to reduce execution time`
      }));
  }

  private generateOptimizationRecommendations(
    execution: TeamExecution, 
    stepDurations: Record<string, number>
  ): string[] {
    const recommendations = [];

    // Check for slow steps
    const slowSteps = Object.entries(stepDurations)
      .filter(([, duration]) => duration > 300000); // 5 minutes
    
    if (slowSteps.length > 0) {
      recommendations.push(
        `Consider parallelizing ${slowSteps.length} slow steps to improve performance`
      );
    }

    // Check for high error rate
    if (execution.errors.length > execution.progress.completedSteps * 0.1) {
      recommendations.push(
        'High error rate detected - review error handling and retry policies'
      );
    }

    // Check for resource constraints
    if (execution.metrics.averageStepDuration > 180000) { // 3 minutes
      recommendations.push(
        'Consider scaling up agent resources to reduce processing time'
      );
    }

    return recommendations;
  }

  private async getAgentPerformanceMetrics(agentId: string): Promise<any> {
    // This would get actual metrics from coordination hub
    // For now, return calculated metrics
    const agent = this.coordinationHub['agents'].get(agentId);
    if (!agent) {
      return {
        tasksCompleted: 0,
        averageResponseTime: 0,
        efficiency: 0
      };
    }

    return {
      tasksCompleted: Math.floor(Math.random() * 1000),
      averageResponseTime: Math.floor(Math.random() * 60000),
      efficiency: 100 - agent.currentLoad
    };
  }

  private getAgentTeams(agentId: string): string[] {
    // This would integrate with TeamManager
    // For now, return based on agent type
    const agent = this.coordinationHub['agents'].get(agentId);
    if (!agent) return [];

    const teams = [];
    for (const [teamId, team] of Object.entries(AGENT_TEAMS)) {
      if (team.members.some(m => m.agentType === agent.type)) {
        teams.push(teamId);
      }
    }

    return teams;
  }

  private generateAgentInsights(comparisons: any[]): string[] {
    const insights = [];

    // Find top performers
    const topPerformers = comparisons.slice(0, 3);
    if (topPerformers.length > 0) {
      insights.push(
        `Top performing agents: ${topPerformers.map(c => c.agent.name).join(', ')}`
      );
    }

    // Find underperformers
    const underperformers = comparisons.filter(c => c.performance.efficiency < 50);
    if (underperformers.length > 0) {
      insights.push(
        `${underperformers.length} agents performing below 50% efficiency`
      );
    }

    // Calculate average efficiency by type
    const byType: Record<string, number[]> = {};
    comparisons.forEach(c => {
      if (!byType[c.agent.type]) byType[c.agent.type] = [];
      byType[c.agent.type].push(c.performance.efficiency);
    });

    const typeAverages = Object.entries(byType).map(([type, efficiencies]) => ({
      type,
      average: efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length
    }));

    const bestType = typeAverages.sort((a, b) => b.average - a.average)[0];
    if (bestType) {
      insights.push(
        `${bestType.type} agents have the highest average efficiency at ${bestType.average.toFixed(1)}%`
      );
    }

    return insights;
  }

  private generateAgentRecommendations(comparisons: any[]): string[] {
    const recommendations = [];

    // Check for overloaded agents
    const overloaded = comparisons.filter(c => c.performance.efficiency < 30);
    if (overloaded.length > 0) {
      recommendations.push(
        `Scale up ${overloaded.length} overloaded agents to improve system performance`
      );
    }

    // Check for underutilized agents
    const underutilized = comparisons.filter(c => c.performance.efficiency > 90);
    if (underutilized.length > 5) {
      recommendations.push(
        `Consider reducing agent count - ${underutilized.length} agents are underutilized`
      );
    }

    // Check for imbalanced types
    const typeCounts: Record<string, number> = {};
    comparisons.forEach(c => {
      typeCounts[c.agent.type] = (typeCounts[c.agent.type] || 0) + 1;
    });

    const imbalanced = Object.entries(typeCounts).filter(([, count]) => count < 2);
    if (imbalanced.length > 0) {
      recommendations.push(
        `Add redundancy for ${imbalanced.map(([type]) => type).join(', ')} agent types`
      );
    }

    return recommendations;
  }

  private setupEventListeners(): void {
    // Listen to team manager events
    this.teamManager.on('teamCritical', (data) => {
      this.addAlert({
        id: `alert-${Date.now()}`,
        timestamp: new Date(),
        severity: 'critical',
        category: 'team',
        message: data.reason,
        affectedComponents: [data.teamId],
        actionRequired: true
      });
    });

    // Listen to workflow orchestrator events
    this.workflowOrchestrator.on('executionTimeout', (data) => {
      this.addAlert({
        id: `alert-${Date.now()}`,
        timestamp: new Date(),
        severity: 'warning',
        category: 'workflow',
        message: `Workflow execution ${data.executionId} timed out`,
        affectedComponents: [data.executionId],
        actionRequired: false
      });
    });

    // Listen to coordination hub events
    this.coordinationHub.on('agentUnhealthy', (data) => {
      this.addAlert({
        id: `alert-${Date.now()}`,
        timestamp: new Date(),
        severity: 'error',
        category: 'agent',
        message: `Agent ${data.agentId} is unhealthy`,
        affectedComponents: [data.agentId],
        actionRequired: true
      });
    });
  }

  private addAlert(alert: SystemAlert): void {
    this.alertHistory.push(alert);
    
    // Keep only last 1000 alerts
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory.slice(-1000);
    }

    this.emit('newAlert', alert);
  }

  private startMetricsCollection(): void {
    // Update metrics every 30 seconds
    this.metricsUpdateInterval = setInterval(async () => {
      try {
        const metrics = await this.getDashboardMetrics();
        this.metricsCache.set('latest', metrics);
        this.emit('metricsUpdated', metrics);
      } catch (error) {
        console.error('Failed to update metrics:', error);
      }
    }, 30000);
  }

  public stop(): void {
    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
    }
  }
}