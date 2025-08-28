import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { Queue, Worker, Job, FlowProducer } from 'bullmq';
import Redis from 'ioredis';
import {
  AgentTeam,
  TeamWorkflow,
  WorkflowStep,
  TeamExecution,
  ExecutionStatus,
  ExecutionProgress,
  ExecutionError,
  ExecutionMetrics,
  WorkflowDependency,
  DependencyType,
  TeamRole,
  TeamCoordinationType,
  TriggerType,
  RetryPolicy
} from '../types/teams';
import {
  AgentInfo,
  AgentType,
  AgentStatus,
  TaskRequest,
  MessagePriority
} from '../types';
import { CoordinationHub } from './coordination-hub';
import { AGENT_TEAMS, TEAM_WORKFLOWS } from '../config/agent-teams';

interface WorkflowContext {
  executionId: string;
  teamId: string;
  workflowId: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  stepResults: Map<string, any>;
  errors: ExecutionError[];
  startTime: Date;
  metadata: Record<string, any>;
}

export class WorkflowOrchestrator extends EventEmitter {
  private redis: Redis;
  private flowProducer: FlowProducer;
  private workflowQueue: Queue;
  private workflowWorker: Worker;
  private coordinationHub: CoordinationHub;
  private activeExecutions: Map<string, TeamExecution>;
  private workflowDefinitions: Map<string, TeamWorkflow>;
  private executionContexts: Map<string, WorkflowContext>;

  constructor(
    redisConfig: { host: string; port: number; password?: string },
    coordinationHub: CoordinationHub
  ) {
    super();
    this.redis = new Redis(redisConfig);
    this.coordinationHub = coordinationHub;
    this.activeExecutions = new Map();
    this.workflowDefinitions = new Map();
    this.executionContexts = new Map();

    // Initialize BullMQ Flow Producer for complex workflows
    this.flowProducer = new FlowProducer({ connection: redisConfig });

    // Initialize workflow queue
    this.workflowQueue = new Queue('team-workflows', {
      connection: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    });

    // Initialize workflow worker
    this.workflowWorker = new Worker(
      'team-workflows',
      async (job: Job) => this.processWorkflowJob(job),
      { 
        connection: redisConfig,
        concurrency: 10
      }
    );

    this.initializeDefaultWorkflows();
    this.startExecutionMonitoring();
  }

  /**
   * Execute a team workflow
   */
  public async executeWorkflow(
    teamId: string,
    workflowId: string,
    inputs: Record<string, any>,
    triggeredBy: string
  ): Promise<string> {
    const team = AGENT_TEAMS[teamId];
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    const workflow = this.workflowDefinitions.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Validate team has required agents available
    await this.validateTeamAvailability(team);

    const executionId = uuidv4();
    const execution: TeamExecution = {
      id: executionId,
      teamId,
      workflowId,
      status: ExecutionStatus.PENDING,
      startTime: new Date(),
      progress: {
        totalSteps: workflow.steps.length,
        completedSteps: 0,
        currentSteps: [],
        percentage: 0
      },
      results: {},
      errors: [],
      metrics: {
        duration: 0,
        agentsInvolved: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        averageStepDuration: 0,
        resourceUtilization: {},
        businessImpact: {}
      }
    };

    const context: WorkflowContext = {
      executionId,
      teamId,
      workflowId,
      inputs,
      outputs: {},
      stepResults: new Map(),
      errors: [],
      startTime: new Date(),
      metadata: { triggeredBy }
    };

    this.activeExecutions.set(executionId, execution);
    this.executionContexts.set(executionId, context);

    // Create workflow flow based on dependencies
    const flow = await this.createWorkflowFlow(workflow, context);

    // Add workflow to queue
    await this.flowProducer.add({
      name: 'workflow-execution',
      queueName: 'team-workflows',
      data: {
        executionId,
        teamId,
        workflowId,
        inputs,
        flow
      },
      children: flow.children
    });

    this.emit('workflowStarted', { executionId, teamId, workflowId });

    return executionId;
  }

  /**
   * Execute a team for a specific business goal
   */
  public async executeTeam(
    teamId: string,
    businessGoal: string,
    context: Record<string, any>
  ): Promise<string> {
    const team = AGENT_TEAMS[teamId];
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    // Create dynamic workflow based on business goal
    const workflow = await this.createDynamicWorkflow(team, businessGoal, context);
    const workflowId = `dynamic-${teamId}-${Date.now()}`;
    
    this.workflowDefinitions.set(workflowId, workflow);

    return this.executeWorkflow(teamId, workflowId, context, 'system');
  }

  /**
   * Execute multiple teams in parallel
   */
  public async executeTeams(
    teamIds: string[],
    businessGoal: string,
    context: Record<string, any>
  ): Promise<string[]> {
    const executionPromises = teamIds.map(teamId =>
      this.executeTeam(teamId, businessGoal, context)
    );

    return Promise.all(executionPromises);
  }

  /**
   * Get execution status
   */
  public getExecutionStatus(executionId: string): TeamExecution | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * Pause execution
   */
  public async pauseExecution(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    execution.status = ExecutionStatus.PAUSED;
    await this.workflowQueue.pause();
    
    this.emit('executionPaused', { executionId });
  }

  /**
   * Resume execution
   */
  public async resumeExecution(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    execution.status = ExecutionStatus.RUNNING;
    await this.workflowQueue.resume();
    
    this.emit('executionResumed', { executionId });
  }

  /**
   * Cancel execution
   */
  public async cancelExecution(executionId: string): Promise<void> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    execution.status = ExecutionStatus.CANCELLED;
    execution.endTime = new Date();

    // Remove all related jobs
    const jobs = await this.workflowQueue.getJobs(['active', 'waiting', 'delayed']);
    for (const job of jobs) {
      if (job.data.executionId === executionId) {
        await job.remove();
      }
    }

    this.emit('executionCancelled', { executionId });
  }

  /**
   * Get team monitoring data
   */
  public async getTeamMonitoring(teamId: string): Promise<any> {
    const team = AGENT_TEAMS[teamId];
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    const executions = Array.from(this.activeExecutions.values())
      .filter(e => e.teamId === teamId);

    const activeCount = executions.filter(e => e.status === ExecutionStatus.RUNNING).length;
    const queuedCount = executions.filter(e => e.status === ExecutionStatus.PENDING).length;

    const successfulExecutions = executions.filter(e => e.status === ExecutionStatus.COMPLETED);
    const failedExecutions = executions.filter(e => e.status === ExecutionStatus.FAILED);

    const averageDuration = successfulExecutions.length > 0
      ? successfulExecutions.reduce((sum, e) => sum + e.metrics.duration, 0) / successfulExecutions.length
      : 0;

    const successRate = executions.length > 0
      ? (successfulExecutions.length / executions.length) * 100
      : 0;

    // Get agent utilization
    const agentUtilization: Record<string, number> = {};
    for (const member of team.members) {
      const agents = await this.getAvailableAgents(member.agentType);
      const utilization = agents.reduce((sum, agent) => 
        sum + (agent.currentLoad / agent.maxCapacity), 0
      ) / agents.length * 100;
      agentUtilization[member.agentType] = utilization;
    }

    return {
      teamId,
      realTimeMetrics: {
        activeExecutions: activeCount,
        queuedExecutions: queuedCount,
        averageExecutionTime: averageDuration,
        successRate,
        agentUtilization,
        throughput: activeCount / 60 // per minute
      },
      historicalPerformance: {
        period: { start: new Date(Date.now() - 86400000), end: new Date() },
        totalExecutions: executions.length,
        successfulExecutions: successfulExecutions.length,
        failedExecutions: failedExecutions.length,
        averageDuration,
        peakHours: [], // TODO: Implement peak hour calculation
        performanceTrend: this.calculatePerformanceTrend(executions)
      },
      alerts: await this.getTeamAlerts(teamId),
      recommendations: await this.getTeamRecommendations(teamId, agentUtilization)
    };
  }

  private async processWorkflowJob(job: Job): Promise<any> {
    const { executionId, stepId } = job.data;
    const execution = this.activeExecutions.get(executionId);
    const context = this.executionContexts.get(executionId);

    if (!execution || !context) {
      throw new Error(`Execution context not found: ${executionId}`);
    }

    const workflow = this.workflowDefinitions.get(execution.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${execution.workflowId}`);
    }

    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    try {
      // Update execution status
      execution.status = ExecutionStatus.RUNNING;
      execution.progress.currentSteps.push(stepId);

      // Execute step
      const result = await this.executeStep(step, context, execution);

      // Store result
      context.stepResults.set(stepId, result);
      context.outputs[stepId] = result;

      // Update progress
      execution.progress.completedSteps++;
      execution.progress.percentage = 
        (execution.progress.completedSteps / execution.progress.totalSteps) * 100;

      // Remove from current steps
      execution.progress.currentSteps = execution.progress.currentSteps
        .filter(id => id !== stepId);

      this.emit('stepCompleted', { executionId, stepId, result });

      return result;

    } catch (error) {
      const executionError: ExecutionError = {
        stepId,
        agentId: 'unknown',
        timestamp: new Date(),
        message: error.message,
        code: error.code || 'STEP_FAILED',
        recoverable: true,
        retryCount: job.attemptsMade
      };

      execution.errors.push(executionError);
      context.errors.push(executionError);

      this.emit('stepFailed', { executionId, stepId, error: executionError });

      throw error;
    }
  }

  private async executeStep(
    step: WorkflowStep,
    context: WorkflowContext,
    execution: TeamExecution
  ): Promise<any> {
    // Get available agents for the step
    const agents = await this.getAvailableAgents(step.agentType);
    if (agents.length === 0) {
      throw new Error(`No available agents of type: ${step.agentType}`);
    }

    // Prepare step inputs
    const inputs = this.resolveStepInputs(step, context);

    // Create task request
    const taskRequest: TaskRequest = {
      taskType: step.action,
      requiredCapabilities: this.getAgentCapabilities(step.agentType),
      input: inputs,
      deadline: new Date(Date.now() + step.timeout),
      context: {
        businessProcess: context.workflowId,
        workflowId: context.workflowId,
        sessionId: context.executionId,
        priority: MessagePriority.HIGH,
        tags: ['team-execution', context.teamId]
      }
    };

    // Send task to coordination hub
    const messageId = await this.coordinationHub.requestTask(
      taskRequest,
      `workflow-orchestrator-${context.executionId}`
    );

    // Wait for response with timeout
    const result = await this.waitForTaskResponse(messageId, step.timeout);

    // Update metrics
    execution.metrics.tasksCompleted++;
    execution.metrics.agentsInvolved = new Set([
      ...Array.from(execution.metrics.agentsInvolved || []),
      ...agents.map(a => a.id)
    ]).size;

    return result;
  }

  private async createWorkflowFlow(
    workflow: TeamWorkflow,
    context: WorkflowContext
  ): Promise<any> {
    const flow = {
      name: `workflow-${workflow.id}`,
      queueName: 'team-workflows',
      data: {
        executionId: context.executionId,
        workflowId: workflow.id
      },
      children: []
    };

    // Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(workflow);

    // Create jobs for each step based on dependencies
    for (const step of workflow.steps) {
      const dependencies = dependencyGraph.get(step.id) || [];
      
      const jobConfig = {
        name: `step-${step.id}`,
        queueName: 'team-workflows',
        data: {
          executionId: context.executionId,
          stepId: step.id
        },
        opts: {
          attempts: step.retryPolicy.maxRetries,
          backoff: {
            type: step.retryPolicy.backoffStrategy,
            delay: step.retryPolicy.baseDelay
          }
        }
      };

      if (dependencies.length === 0 || step.parallel) {
        // Add as direct child for parallel execution
        flow.children.push(jobConfig);
      } else {
        // Add with dependencies for sequential execution
        jobConfig['depends_on'] = dependencies.map(d => `step-${d}`);
        flow.children.push(jobConfig);
      }
    }

    return flow;
  }

  private buildDependencyGraph(workflow: TeamWorkflow): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const dep of workflow.dependencies) {
      const existing = graph.get(dep.to) || [];
      existing.push(dep.from);
      graph.set(dep.to, existing);
    }

    return graph;
  }

  private async createDynamicWorkflow(
    team: AgentTeam,
    businessGoal: string,
    context: Record<string, any>
  ): Promise<TeamWorkflow> {
    // Create workflow based on team coordination type
    const steps: WorkflowStep[] = [];
    const dependencies: WorkflowDependency[] = [];

    switch (team.coordinationType) {
      case TeamCoordinationType.PARALLEL:
        // All team members work in parallel
        team.members.forEach((member, index) => {
          steps.push({
            id: `${member.agentType}-${index}`,
            name: `Execute ${member.agentType}`,
            agentType: member.agentType,
            action: 'process-business-goal',
            inputs: { businessGoal, context },
            outputs: [`${member.agentType}-result`],
            parallel: true,
            timeout: 300000, // 5 minutes
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: 'exponential',
              baseDelay: 2000,
              maxDelay: 30000
            }
          });
        });
        break;

      case TeamCoordinationType.SEQUENTIAL:
        // Team members work in sequence
        team.members.forEach((member, index) => {
          const stepId = `${member.agentType}-${index}`;
          steps.push({
            id: stepId,
            name: `Execute ${member.agentType}`,
            agentType: member.agentType,
            action: 'process-business-goal',
            inputs: { businessGoal, context },
            outputs: [`${member.agentType}-result`],
            parallel: false,
            timeout: 300000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: 'exponential',
              baseDelay: 2000,
              maxDelay: 30000
            }
          });

          if (index > 0) {
            dependencies.push({
              from: steps[index - 1].id,
              to: stepId,
              type: DependencyType.SEQUENTIAL
            });
          }
        });
        break;

      case TeamCoordinationType.PIPELINE:
        // Create pipeline with data flow
        team.members.forEach((member, index) => {
          const stepId = `${member.agentType}-${index}`;
          const previousStep = index > 0 ? steps[index - 1] : null;

          steps.push({
            id: stepId,
            name: `Execute ${member.agentType}`,
            agentType: member.agentType,
            action: 'process-business-goal',
            inputs: previousStep 
              ? { businessGoal, context, previousResult: `{{${previousStep.id}.result}}` }
              : { businessGoal, context },
            outputs: [`${member.agentType}-result`],
            parallel: false,
            timeout: 300000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: 'exponential',
              baseDelay: 2000,
              maxDelay: 30000
            }
          });

          if (previousStep) {
            dependencies.push({
              from: previousStep.id,
              to: stepId,
              type: DependencyType.DATA,
              dataMapping: {
                result: 'previousResult'
              }
            });
          }
        });
        break;

      default:
        // Default to hybrid approach
        const leaders = team.members.filter(m => m.role === TeamRole.LEADER);
        const others = team.members.filter(m => m.role !== TeamRole.LEADER);

        // Leaders work first
        leaders.forEach((member, index) => {
          steps.push({
            id: `leader-${member.agentType}-${index}`,
            name: `Leader ${member.agentType}`,
            agentType: member.agentType,
            action: 'analyze-business-goal',
            inputs: { businessGoal, context },
            outputs: [`${member.agentType}-analysis`],
            parallel: true,
            timeout: 180000,
            retryPolicy: {
              maxRetries: 2,
              backoffStrategy: 'linear',
              baseDelay: 5000,
              maxDelay: 15000
            }
          });
        });

        // Others work based on leader analysis
        others.forEach((member, index) => {
          const stepId = `${member.agentType}-${index}`;
          steps.push({
            id: stepId,
            name: `Execute ${member.agentType}`,
            agentType: member.agentType,
            action: 'execute-based-on-analysis',
            inputs: { businessGoal, context, leaderAnalysis: '{{leader-outputs}}' },
            outputs: [`${member.agentType}-result`],
            parallel: member.role === TeamRole.EXECUTOR,
            timeout: 300000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: 'exponential',
              baseDelay: 2000,
              maxDelay: 30000
            }
          });

          // Add dependencies from all leaders
          leaders.forEach(leader => {
            dependencies.push({
              from: `leader-${leader.agentType}-${leaders.indexOf(leader)}`,
              to: stepId,
              type: DependencyType.DATA
            });
          });
        });
    }

    return {
      id: `dynamic-${team.id}-${Date.now()}`,
      teamId: team.id,
      name: `Dynamic workflow for ${businessGoal}`,
      description: `Dynamically generated workflow for team ${team.name}`,
      trigger: {
        type: TriggerType.API,
        config: { endpoint: '/api/workflows/execute' }
      },
      steps,
      dependencies,
      timeout: 3600000, // 1 hour
      retryPolicy: {
        maxRetries: 1,
        backoffStrategy: 'exponential',
        baseDelay: 10000,
        maxDelay: 60000
      },
      successCriteria: {
        required: steps.map(s => s.outputs[0]),
        optional: [],
        businessMetrics: [],
        minimumAgents: Math.ceil(team.members.filter(m => m.required).length * 0.8),
        timeConstraints: {
          maxDuration: 3600000,
          businessHoursOnly: false,
          timezone: 'UTC'
        }
      }
    };
  }

  private async validateTeamAvailability(team: AgentTeam): Promise<void> {
    const unavailableTypes: string[] = [];

    for (const member of team.members) {
      if (member.required) {
        const agents = await this.getAvailableAgents(member.agentType);
        if (agents.length < member.minInstances) {
          unavailableTypes.push(member.agentType);
        }
      }
    }

    if (unavailableTypes.length > 0) {
      throw new Error(
        `Required agents not available: ${unavailableTypes.join(', ')}`
      );
    }
  }

  private async getAvailableAgents(agentType: AgentType): Promise<AgentInfo[]> {
    const allAgents = Array.from(this.coordinationHub['agents'].values());
    return allAgents.filter(agent => 
      agent.type === agentType && 
      agent.status === AgentStatus.HEALTHY &&
      agent.currentLoad < agent.maxCapacity * 0.8
    );
  }

  private getAgentCapabilities(agentType: AgentType): string[] {
    // Get capabilities from team configuration
    for (const team of Object.values(AGENT_TEAMS)) {
      const member = team.members.find(m => m.agentType === agentType);
      if (member) {
        return member.capabilities;
      }
    }
    return [];
  }

  private resolveStepInputs(
    step: WorkflowStep,
    context: WorkflowContext
  ): Record<string, any> {
    const resolvedInputs: Record<string, any> = {};

    for (const [key, value] of Object.entries(step.inputs)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        // Template variable - resolve from context
        const path = value.slice(2, -2);
        const parts = path.split('.');
        
        if (parts[0] === 'inputs') {
          resolvedInputs[key] = context.inputs[parts[1]];
        } else if (context.stepResults.has(parts[0])) {
          const stepResult = context.stepResults.get(parts[0]);
          resolvedInputs[key] = parts[1] ? stepResult[parts[1]] : stepResult;
        } else {
          resolvedInputs[key] = value; // Keep as is if not found
        }
      } else {
        resolvedInputs[key] = value;
      }
    }

    return resolvedInputs;
  }

  private async waitForTaskResponse(
    messageId: string,
    timeout: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.coordinationHub.off(`response:${messageId}`, responseHandler);
        reject(new Error(`Task timeout after ${timeout}ms`));
      }, timeout);

      const responseHandler = (response: any) => {
        clearTimeout(timeoutId);
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.result);
        }
      };

      this.coordinationHub.once(`response:${messageId}`, responseHandler);
    });
  }

  private calculatePerformanceTrend(
    executions: TeamExecution[]
  ): 'improving' | 'stable' | 'degrading' {
    if (executions.length < 10) return 'stable';

    const recent = executions.slice(-5);
    const previous = executions.slice(-10, -5);

    const recentSuccess = recent.filter(e => e.status === ExecutionStatus.COMPLETED).length;
    const previousSuccess = previous.filter(e => e.status === ExecutionStatus.COMPLETED).length;

    if (recentSuccess > previousSuccess) return 'improving';
    if (recentSuccess < previousSuccess) return 'degrading';
    return 'stable';
  }

  private async getTeamAlerts(teamId: string): Promise<any[]> {
    const alerts = [];
    const team = AGENT_TEAMS[teamId];

    // Check agent availability
    for (const member of team.members) {
      const agents = await this.getAvailableAgents(member.agentType);
      if (member.required && agents.length < member.minInstances) {
        alerts.push({
          id: uuidv4(),
          severity: 'critical',
          type: 'agent-unavailability',
          message: `Insufficient ${member.agentType} agents available`,
          timestamp: new Date(),
          affectedAgents: agents.map(a => a.id),
          suggestedAction: `Scale up ${member.agentType} agents to meet minimum requirement of ${member.minInstances}`
        });
      }
    }

    // Check execution failures
    const recentExecutions = Array.from(this.activeExecutions.values())
      .filter(e => e.teamId === teamId && e.endTime && 
        e.endTime.getTime() > Date.now() - 3600000); // Last hour

    const failureRate = recentExecutions.filter(e => e.status === ExecutionStatus.FAILED).length 
      / recentExecutions.length;

    if (failureRate > 0.3) {
      alerts.push({
        id: uuidv4(),
        severity: 'warning',
        type: 'high-failure-rate',
        message: `Team ${teamId} has ${(failureRate * 100).toFixed(1)}% failure rate`,
        timestamp: new Date(),
        affectedAgents: [],
        suggestedAction: 'Review recent failures and adjust workflow configuration'
      });
    }

    return alerts;
  }

  private async getTeamRecommendations(
    teamId: string,
    agentUtilization: Record<string, number>
  ): Promise<any[]> {
    const recommendations = [];
    const team = AGENT_TEAMS[teamId];

    // Check for scaling opportunities
    for (const [agentType, utilization] of Object.entries(agentUtilization)) {
      if (utilization > 80) {
        const member = team.members.find(m => m.agentType === agentType);
        if (member) {
          recommendations.push({
            type: 'scaling',
            priority: utilization > 90 ? 'critical' : 'high',
            description: `Scale up ${agentType} agents due to high utilization (${utilization.toFixed(1)}%)`,
            estimatedImpact: 'Reduce queue times and improve throughput by 20-30%',
            implementation: `Increase ${agentType} instances from current to ${member.maxInstances}`
          });
        }
      }
    }

    // Check for optimization opportunities
    const executions = Array.from(this.activeExecutions.values())
      .filter(e => e.teamId === teamId && e.status === ExecutionStatus.COMPLETED);

    if (executions.length > 10) {
      const avgDuration = executions.reduce((sum, e) => sum + e.metrics.duration, 0) / executions.length;
      if (avgDuration > 600000) { // 10 minutes
        recommendations.push({
          type: 'optimization',
          priority: 'medium',
          description: 'Optimize workflow for faster execution',
          estimatedImpact: 'Reduce average execution time by 30-40%',
          implementation: 'Enable parallel execution for independent steps'
        });
      }
    }

    return recommendations;
  }

  private initializeDefaultWorkflows(): void {
    // Initialize predefined workflows
    const predefinedWorkflows: TeamWorkflow[] = [
      {
        id: 'product-launch-workflow',
        teamId: 'multi-team',
        name: 'Product Launch Workflow',
        description: 'Coordinate multiple teams for product launch',
        trigger: {
          type: TriggerType.API,
          config: { endpoint: '/api/workflows/product-launch' }
        },
        steps: [
          {
            id: 'design-ui',
            name: 'Design UI Components',
            agentType: AgentType.UI_UX_DESIGN,
            action: 'design-product-ui',
            inputs: { productSpec: '{{inputs.productSpec}}' },
            outputs: ['ui-designs'],
            parallel: true,
            timeout: 1800000,
            retryPolicy: {
              maxRetries: 2,
              backoffStrategy: 'exponential',
              baseDelay: 5000,
              maxDelay: 30000
            }
          },
          {
            id: 'develop-backend',
            name: 'Develop Backend Services',
            agentType: AgentType.BACKEND_ARCHITECTURE,
            action: 'develop-backend',
            inputs: { productSpec: '{{inputs.productSpec}}' },
            outputs: ['backend-services'],
            parallel: true,
            timeout: 3600000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: 'exponential',
              baseDelay: 10000,
              maxDelay: 60000
            }
          },
          {
            id: 'security-review',
            name: 'Security Review',
            agentType: AgentType.SECURITY_ENGINEER,
            action: 'security-assessment',
            inputs: { 
              uiDesigns: '{{design-ui.ui-designs}}',
              backendServices: '{{develop-backend.backend-services}}'
            },
            outputs: ['security-report'],
            parallel: false,
            timeout: 1800000,
            retryPolicy: {
              maxRetries: 2,
              backoffStrategy: 'linear',
              baseDelay: 10000,
              maxDelay: 30000
            }
          }
        ],
        dependencies: [
          {
            from: 'design-ui',
            to: 'security-review',
            type: DependencyType.DATA
          },
          {
            from: 'develop-backend',
            to: 'security-review',
            type: DependencyType.DATA
          }
        ],
        timeout: 7200000,
        retryPolicy: {
          maxRetries: 1,
          backoffStrategy: 'exponential',
          baseDelay: 30000,
          maxDelay: 180000
        },
        successCriteria: {
          required: ['ui-designs', 'backend-services', 'security-report'],
          optional: [],
          businessMetrics: [
            {
              name: 'launch-readiness',
              target: 95,
              operator: 'gte',
              unit: 'percent'
            }
          ],
          minimumAgents: 3,
          timeConstraints: {
            maxDuration: 7200000,
            businessHoursOnly: true,
            timezone: 'America/New_York'
          }
        }
      }
    ];

    predefinedWorkflows.forEach(workflow => {
      this.workflowDefinitions.set(workflow.id, workflow);
    });
  }

  private startExecutionMonitoring(): void {
    // Monitor execution health every 30 seconds
    setInterval(() => {
      for (const [executionId, execution] of this.activeExecutions.entries()) {
        // Check for timeouts
        if (execution.status === ExecutionStatus.RUNNING) {
          const elapsed = Date.now() - execution.startTime.getTime();
          const workflow = this.workflowDefinitions.get(execution.workflowId);
          
          if (workflow && elapsed > workflow.timeout) {
            execution.status = ExecutionStatus.TIMEOUT;
            execution.endTime = new Date();
            this.emit('executionTimeout', { executionId });
          }
        }

        // Clean up completed executions after 1 hour
        if (execution.endTime) {
          const age = Date.now() - execution.endTime.getTime();
          if (age > 3600000) {
            this.activeExecutions.delete(executionId);
            this.executionContexts.delete(executionId);
          }
        }
      }
    }, 30000);

    // Monitor queue health
    setInterval(async () => {
      const health = await this.workflowQueue.getJobCounts();
      
      if (health.failed > 100) {
        this.emit('queueAlert', {
          type: 'high-failure-count',
          count: health.failed,
          severity: 'warning'
        });
      }

      if (health.delayed > 1000) {
        this.emit('queueAlert', {
          type: 'high-delayed-count',
          count: health.delayed,
          severity: 'info'
        });
      }
    }, 60000);
  }
}