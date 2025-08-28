import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as cron from 'node-cron';
import _ from 'lodash';

import { Logger } from '../utils/logger';
import { config } from '../config';
import {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowStatus,
  TaskExecution,
  TaskStatus,
  WorkflowSchedule,
  WorkflowTemplate,
  WorkflowMetrics,
} from '../types/workflow';
import {
  AgentRegistry,
  CommunicationBus,
  DecisionEngine,
  ResourceManager,
} from './';

const logger = Logger.child({ component: 'workflow-engine' });

export class WorkflowEngine extends EventEmitter {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private schedules: Map<string, WorkflowSchedule> = new Map();
  private templates: Map<string, WorkflowTemplate> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private executionQueue: string[] = [];
  private running: boolean = false;

  constructor(
    private agentRegistry: AgentRegistry,
    private communicationBus: CommunicationBus,
    private decisionEngine: DecisionEngine,
    private resourceManager: ResourceManager
  ) {
    super();
    this.setMaxListeners(1000); // Support many concurrent workflows
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Workflow Engine...');

      // Load existing workflows and schedules from database
      await this.loadWorkflows();
      await this.loadSchedules();
      await this.loadTemplates();
      
      // Set up event listeners
      this.setupEventListeners();

      logger.info('Workflow Engine initialized successfully', {
        workflowCount: this.workflows.size,
        templateCount: this.templates.size,
        scheduleCount: this.schedules.size,
      });
    } catch (error) {
      logger.error('Failed to initialize Workflow Engine', { error: error.message });
      throw error;
    }
  }

  async startScheduler(): Promise<void> {
    if (this.running) {
      logger.warn('Workflow scheduler is already running');
      return;
    }

    this.running = true;
    logger.info('Starting workflow scheduler...');

    // Start scheduled workflows
    for (const [scheduleId, schedule] of this.schedules.entries()) {
      if (schedule.enabled) {
        await this.scheduleWorkflow(scheduleId, schedule);
      }
    }

    // Start execution processor
    this.startExecutionProcessor();

    logger.info('Workflow scheduler started successfully');
  }

  async stop(): Promise<void> {
    logger.info('Stopping Workflow Engine...');
    
    this.running = false;

    // Stop all cron jobs
    for (const [scheduleId, task] of this.cronJobs.entries()) {
      task.stop();
      logger.debug('Stopped scheduled workflow', { scheduleId });
    }
    this.cronJobs.clear();

    // Cancel running executions gracefully
    for (const [executionId, execution] of this.executions.entries()) {
      if (execution.status === WorkflowStatus.ACTIVE) {
        await this.cancelExecution(executionId, 'System shutdown');
      }
    }

    logger.info('Workflow Engine stopped');
  }

  // Workflow Definition Management
  async createWorkflow(definition: WorkflowDefinition): Promise<string> {
    try {
      // Validate workflow definition
      await this.validateWorkflowDefinition(definition);

      // Store workflow
      this.workflows.set(definition.id, definition);
      
      // Emit event
      this.emit('workflow:created', { workflowId: definition.id, definition });

      logger.info('Workflow created', { 
        workflowId: definition.id,
        name: definition.name,
        taskCount: definition.tasks.length,
      });

      return definition.id;
    } catch (error) {
      logger.error('Failed to create workflow', { 
        workflowId: definition.id,
        error: error.message,
      });
      throw error;
    }
  }

  async updateWorkflow(workflowId: string, definition: WorkflowDefinition): Promise<void> {
    if (!this.workflows.has(workflowId)) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    try {
      await this.validateWorkflowDefinition(definition);
      
      const oldDefinition = this.workflows.get(workflowId);
      this.workflows.set(workflowId, definition);
      
      this.emit('workflow:updated', { 
        workflowId, 
        oldDefinition, 
        newDefinition: definition,
      });

      logger.info('Workflow updated', { workflowId, name: definition.name });
    } catch (error) {
      logger.error('Failed to update workflow', { workflowId, error: error.message });
      throw error;
    }
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    if (!this.workflows.has(workflowId)) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Check for active executions
    const activeExecutions = Array.from(this.executions.values())
      .filter(exec => exec.workflowId === workflowId && exec.status === WorkflowStatus.ACTIVE);

    if (activeExecutions.length > 0) {
      throw new Error(`Cannot delete workflow ${workflowId}: ${activeExecutions.length} active executions`);
    }

    const definition = this.workflows.get(workflowId);
    this.workflows.delete(workflowId);
    
    this.emit('workflow:deleted', { workflowId, definition });
    
    logger.info('Workflow deleted', { workflowId });
  }

  // Workflow Execution
  async executeWorkflow(
    workflowId: string,
    input: Record<string, any> = {},
    triggeredBy: string = 'manual',
    priority: number = 5
  ): Promise<string> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const executionId = uuidv4();
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      workflowVersion: workflow.version,
      status: WorkflowStatus.ACTIVE,
      triggeredBy,
      triggerData: input,
      startedAt: new Date(),
      taskExecutions: [],
      variables: { ...workflow.variables, ...input },
      metadata: { priority },
    };

    this.executions.set(executionId, execution);
    this.executionQueue.push(executionId);

    this.emit('execution:started', { executionId, execution });

    logger.info('Workflow execution started', {
      executionId,
      workflowId,
      workflowName: workflow.name,
      triggeredBy,
    });

    return executionId;
  }

  async cancelExecution(executionId: string, reason: string = 'Cancelled'): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status !== WorkflowStatus.ACTIVE) {
      throw new Error(`Execution ${executionId} is not active`);
    }

    // Cancel running tasks
    for (const taskExecution of execution.taskExecutions) {
      if (taskExecution.status === TaskStatus.RUNNING) {
        await this.cancelTask(taskExecution.id, reason);
      }
    }

    execution.status = WorkflowStatus.CANCELLED;
    execution.completedAt = new Date();
    execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();
    execution.error = reason;

    this.emit('execution:cancelled', { executionId, execution, reason });

    logger.info('Workflow execution cancelled', { executionId, reason });
  }

  // Task Execution
  private async executeTask(
    execution: WorkflowExecution,
    taskDefinition: any
  ): Promise<TaskExecution> {
    const taskExecutionId = uuidv4();
    const taskExecution: TaskExecution = {
      id: taskExecutionId,
      taskId: taskDefinition.id,
      workflowExecutionId: execution.id,
      status: TaskStatus.PENDING,
      input: this.resolveTaskInput(taskDefinition, execution.variables),
      retryCount: 0,
      logs: [],
      metadata: {},
    };

    execution.taskExecutions.push(taskExecution);

    try {
      // Check dependencies
      if (!this.areTaskDependenciesMet(taskDefinition, execution)) {
        taskExecution.status = TaskStatus.WAITING_FOR_DEPENDENCIES;
        return taskExecution;
      }

      // Check conditions
      if (!this.evaluateTaskConditions(taskDefinition, execution.variables)) {
        taskExecution.status = TaskStatus.SKIPPED;
        taskExecution.completedAt = new Date();
        this.addTaskLog(taskExecution, 'info', 'Task skipped due to conditions');
        return taskExecution;
      }

      taskExecution.status = TaskStatus.RUNNING;
      taskExecution.startedAt = new Date();

      // Select agent for task execution
      const agent = await this.selectAgentForTask(taskDefinition);
      if (!agent) {
        throw new Error(`No suitable agent found for task ${taskDefinition.id}`);
      }

      taskExecution.agentId = agent.id;

      // Execute task
      const result = await this.communicationBus.request({
        id: uuidv4(),
        type: 'request',
        from: 'workflow-engine',
        to: agent.id,
        subject: 'execute_task',
        payload: {
          taskId: taskDefinition.id,
          input: taskExecution.input,
          timeout: taskDefinition.timeout || config.workflow.defaultTimeout,
        },
        timestamp: new Date(),
        priority: 5,
      });

      taskExecution.output = result.payload;
      taskExecution.status = TaskStatus.COMPLETED;
      taskExecution.completedAt = new Date();
      taskExecution.duration = taskExecution.completedAt.getTime() - taskExecution.startedAt!.getTime();

      this.addTaskLog(taskExecution, 'info', 'Task completed successfully');

    } catch (error) {
      taskExecution.error = error.message;
      taskExecution.status = TaskStatus.FAILED;
      taskExecution.completedAt = new Date();
      
      this.addTaskLog(taskExecution, 'error', `Task failed: ${error.message}`);

      // Handle retry logic
      if (taskExecution.retryCount < taskDefinition.retryPolicy.maxRetries) {
        taskExecution.retryCount++;
        taskExecution.status = TaskStatus.PENDING;
        
        const delay = taskDefinition.retryPolicy.initialDelay * 
          Math.pow(taskDefinition.retryPolicy.backoffMultiplier, taskExecution.retryCount - 1);
        
        setTimeout(() => {
          this.executeTask(execution, taskDefinition);
        }, delay);

        this.addTaskLog(taskExecution, 'info', `Retrying task in ${delay}ms (attempt ${taskExecution.retryCount})`);
      }
    }

    return taskExecution;
  }

  private async cancelTask(taskExecutionId: string, reason: string): Promise<void> {
    // Find task execution across all workflow executions
    for (const execution of this.executions.values()) {
      const taskExecution = execution.taskExecutions.find(t => t.id === taskExecutionId);
      if (taskExecution && taskExecution.status === TaskStatus.RUNNING) {
        // Send cancellation message to agent
        if (taskExecution.agentId) {
          await this.communicationBus.publish({
            id: uuidv4(),
            type: 'event',
            from: 'workflow-engine',
            to: taskExecution.agentId,
            subject: 'cancel_task',
            payload: { taskExecutionId, reason },
            timestamp: new Date(),
            priority: 10,
          });
        }

        taskExecution.status = TaskStatus.CANCELLED;
        taskExecution.completedAt = new Date();
        taskExecution.error = reason;
        
        this.addTaskLog(taskExecution, 'warn', `Task cancelled: ${reason}`);
        break;
      }
    }
  }

  // Workflow Templates
  async createTemplate(template: WorkflowTemplate): Promise<string> {
    this.templates.set(template.id, template);
    
    this.emit('template:created', { templateId: template.id, template });
    
    logger.info('Workflow template created', {
      templateId: template.id,
      name: template.name,
      category: template.category,
    });

    return template.id;
  }

  async instantiateTemplate(
    templateId: string,
    customizations: Record<string, any> = {}
  ): Promise<string> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Apply customizations to template
    const definition = this.applyTemplateCustomizations(template.definition, customizations);
    definition.id = uuidv4();

    // Create workflow from template
    const workflowId = await this.createWorkflow(definition);

    // Update template usage statistics
    template.usageCount++;

    logger.info('Workflow instantiated from template', {
      templateId,
      workflowId,
      customizations: Object.keys(customizations),
    });

    return workflowId;
  }

  // Workflow Scheduling
  async scheduleWorkflow(scheduleId: string, schedule: WorkflowSchedule): Promise<void> {
    // Stop existing cron job if any
    if (this.cronJobs.has(scheduleId)) {
      this.cronJobs.get(scheduleId)!.stop();
    }

    if (!schedule.enabled) {
      return;
    }

    try {
      const task = cron.schedule(
        schedule.cronExpression,
        async () => {
          try {
            await this.executeWorkflow(
              schedule.workflowId,
              {},
              `scheduled:${scheduleId}`
            );

            schedule.lastRun = new Date();
            schedule.runCount++;
            schedule.successCount++;
            schedule.nextRun = this.getNextRunDate(schedule.cronExpression, schedule.timezone);

            logger.info('Scheduled workflow executed', {
              scheduleId,
              workflowId: schedule.workflowId,
            });
          } catch (error) {
            schedule.failureCount++;
            
            logger.error('Scheduled workflow execution failed', {
              scheduleId,
              workflowId: schedule.workflowId,
              error: error.message,
            });
          }
        },
        {
          scheduled: false,
          timezone: schedule.timezone,
        }
      );

      task.start();
      this.cronJobs.set(scheduleId, task);

      logger.info('Workflow scheduled', {
        scheduleId,
        workflowId: schedule.workflowId,
        cronExpression: schedule.cronExpression,
        nextRun: schedule.nextRun,
      });
    } catch (error) {
      logger.error('Failed to schedule workflow', {
        scheduleId,
        cronExpression: schedule.cronExpression,
        error: error.message,
      });
      throw error;
    }
  }

  // Metrics and Analytics
  async getWorkflowMetrics(workflowId: string): Promise<WorkflowMetrics> {
    const executions = Array.from(this.executions.values())
      .filter(exec => exec.workflowId === workflowId);

    const successful = executions.filter(exec => exec.status === WorkflowStatus.COMPLETED);
    const failed = executions.filter(exec => exec.status === WorkflowStatus.FAILED);
    
    const durations = successful
      .map(exec => exec.duration || 0)
      .filter(duration => duration > 0);

    const taskCounts = executions.map(exec => exec.taskExecutions.length);
    
    const agentUsage = new Map<string, number>();
    const errorPatterns = new Map<string, number>();

    executions.forEach(exec => {
      exec.taskExecutions.forEach(task => {
        if (task.agentId) {
          const agent = this.agentRegistry.getAgent(task.agentId);
          if (agent) {
            const count = agentUsage.get(agent.registration.type) || 0;
            agentUsage.set(agent.registration.type, count + 1);
          }
        }

        if (task.error) {
          const count = errorPatterns.get(task.error) || 0;
          errorPatterns.set(task.error, count + 1);
        }
      });
    });

    return {
      workflowId,
      totalExecutions: executions.length,
      successfulExecutions: successful.length,
      failedExecutions: failed.length,
      averageDuration: durations.length > 0 ? _.mean(durations) : 0,
      averageTaskCount: taskCounts.length > 0 ? _.mean(taskCounts) : 0,
      mostUsedAgents: Array.from(agentUsage.entries())
        .map(([agentType, usageCount]) => ({ agentType: agentType as any, usageCount }))
        .sort((a, b) => b.usageCount - a.usageCount),
      errorPatterns: Array.from(errorPatterns.entries())
        .map(([error, count]) => ({ error, count }))
        .sort((a, b) => b.count - a.count),
      performanceTrends: this.calculatePerformanceTrends(executions),
    };
  }

  // Private helper methods
  private setupEventListeners(): void {
    // Listen for agent status changes
    this.agentRegistry.on('agent:status_changed', (data) => {
      // Handle agent availability changes
      this.handleAgentStatusChange(data);
    });

    // Listen for resource allocation changes
    this.resourceManager.on('resource:allocated', (data) => {
      // Update task execution status if waiting for resources
      this.handleResourceAllocation(data);
    });
  }

  private async validateWorkflowDefinition(definition: WorkflowDefinition): Promise<void> {
    // Validate workflow structure
    if (!definition.id || !definition.name || !definition.tasks) {
      throw new Error('Invalid workflow definition: missing required fields');
    }

    // Validate task dependencies
    const taskIds = new Set(definition.tasks.map(task => task.id));
    for (const task of definition.tasks) {
      for (const depId of task.dependencies) {
        if (!taskIds.has(depId)) {
          throw new Error(`Task ${task.id} has invalid dependency: ${depId}`);
        }
      }
    }

    // Check for circular dependencies
    this.checkCircularDependencies(definition.tasks);

    // Validate agent requirements
    for (const task of definition.tasks) {
      const availableAgents = await this.agentRegistry.findAgents({
        type: task.agentType,
        capabilities: task.requiredCapabilities,
        status: 'healthy',
      });

      if (availableAgents.length === 0) {
        throw new Error(`No available agents for task ${task.id} (type: ${task.agentType})`);
      }
    }
  }

  private checkCircularDependencies(tasks: any[]): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (taskId: string): boolean => {
      if (recursionStack.has(taskId)) {
        return true; // Circular dependency found
      }
      if (visited.has(taskId)) {
        return false;
      }

      visited.add(taskId);
      recursionStack.add(taskId);

      const task = tasks.find(t => t.id === taskId);
      if (task) {
        for (const depId of task.dependencies) {
          if (dfs(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    for (const task of tasks) {
      if (dfs(task.id)) {
        throw new Error(`Circular dependency detected involving task ${task.id}`);
      }
    }
  }

  private async selectAgentForTask(taskDefinition: any): Promise<any> {
    const candidates = await this.agentRegistry.findAgents({
      type: taskDefinition.agentType,
      capabilities: taskDefinition.requiredCapabilities,
      status: 'healthy',
    });

    if (candidates.length === 0) {
      return null;
    }

    // Use decision engine to select best agent
    const decision = await this.decisionEngine.makeDecision({
      id: uuidv4(),
      type: 'agent_selection',
      context: { task: taskDefinition },
      constraints: [],
      criteria: [
        { name: 'load', weight: 0.4, type: 'numeric', direction: 'minimize' },
        { name: 'performance', weight: 0.3, type: 'numeric', direction: 'maximize' },
        { name: 'availability', weight: 0.3, type: 'numeric', direction: 'maximize' },
      ],
      options: candidates.map(agent => ({
        id: agent.id,
        type: 'agent',
        attributes: {
          load: agent.currentLoad,
          performance: agent.averageResponseTime,
          availability: agent.status === 'healthy' ? 1 : 0,
        },
        cost: 0,
        availability: true,
        metadata: { agent },
      })),
      strategy: 'capability_based',
      timeout: 5000,
      metadata: {},
      createdAt: new Date(),
    });

    return decision.selectedOption.metadata.agent;
  }

  private resolveTaskInput(taskDefinition: any, variables: Record<string, any>): Record<string, any> {
    // Simple variable substitution - in production, use a proper template engine
    const input = { ...taskDefinition.inputSchema };
    
    const resolveValue = (value: any): any => {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        const varName = value.slice(2, -1);
        return variables[varName] || value;
      }
      if (typeof value === 'object' && value !== null) {
        const resolved: any = {};
        for (const [key, val] of Object.entries(value)) {
          resolved[key] = resolveValue(val);
        }
        return resolved;
      }
      return value;
    };

    return resolveValue(input);
  }

  private areTaskDependenciesMet(taskDefinition: any, execution: WorkflowExecution): boolean {
    for (const depId of taskDefinition.dependencies) {
      const depExecution = execution.taskExecutions.find(t => t.taskId === depId);
      if (!depExecution || depExecution.status !== TaskStatus.COMPLETED) {
        return false;
      }
    }
    return true;
  }

  private evaluateTaskConditions(taskDefinition: any, variables: Record<string, any>): boolean {
    if (!taskDefinition.conditions || taskDefinition.conditions.length === 0) {
      return true;
    }

    return taskDefinition.conditions.every((condition: any) => {
      const value = variables[condition.field];
      
      switch (condition.operator) {
        case 'equals':
          return value === condition.value;
        case 'not_equals':
          return value !== condition.value;
        case 'greater_than':
          return value > condition.value;
        case 'less_than':
          return value < condition.value;
        case 'contains':
          return Array.isArray(value) ? value.includes(condition.value) : 
                 typeof value === 'string' ? value.includes(condition.value) : false;
        case 'exists':
          return value !== undefined && value !== null;
        default:
          return false;
      }
    });
  }

  private addTaskLog(taskExecution: TaskExecution, level: string, message: string, data?: any): void {
    taskExecution.logs.push({
      timestamp: new Date(),
      level: level as any,
      message,
      data,
    });
  }

  private startExecutionProcessor(): void {
    // Process execution queue
    setInterval(async () => {
      if (this.executionQueue.length === 0 || !this.running) {
        return;
      }

      const executionId = this.executionQueue.shift();
      if (!executionId) return;

      const execution = this.executions.get(executionId);
      if (!execution) return;

      try {
        await this.processExecution(execution);
      } catch (error) {
        logger.error('Failed to process execution', {
          executionId,
          error: error.message,
        });
      }
    }, 1000); // Process every second
  }

  private async processExecution(execution: WorkflowExecution): Promise<void> {
    const workflow = this.workflows.get(execution.workflowId);
    if (!workflow) {
      execution.status = WorkflowStatus.FAILED;
      execution.error = 'Workflow definition not found';
      return;
    }

    // Find next tasks to execute
    const readyTasks = workflow.tasks.filter(task => {
      const existingExecution = execution.taskExecutions.find(t => t.taskId === task.id);
      return !existingExecution && this.areTaskDependenciesMet(task, execution);
    });

    // Execute ready tasks
    const taskPromises = readyTasks.map(task => this.executeTask(execution, task));
    await Promise.allSettled(taskPromises);

    // Check if workflow is complete
    const allTasksExecuted = workflow.tasks.every(task => 
      execution.taskExecutions.some(t => t.taskId === task.id && 
        [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.SKIPPED].includes(t.status)
      )
    );

    if (allTasksExecuted) {
      const hasFailedTasks = execution.taskExecutions.some(t => t.status === TaskStatus.FAILED);
      
      execution.status = hasFailedTasks ? WorkflowStatus.FAILED : WorkflowStatus.COMPLETED;
      execution.completedAt = new Date();
      execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();

      // Collect outputs
      execution.output = {};
      execution.taskExecutions.forEach(task => {
        if (task.output) {
          execution.output![task.taskId] = task.output;
        }
      });

      this.emit('execution:completed', { executionId: execution.id, execution });

      logger.info('Workflow execution completed', {
        executionId: execution.id,
        workflowId: execution.workflowId,
        status: execution.status,
        duration: execution.duration,
      });
    } else {
      // Re-queue for processing
      this.executionQueue.push(execution.id);
    }
  }

  private applyTemplateCustomizations(
    definition: WorkflowDefinition,
    customizations: Record<string, any>
  ): WorkflowDefinition {
    // Deep clone the definition
    const customized = JSON.parse(JSON.stringify(definition));

    // Apply customizations
    for (const [path, value] of Object.entries(customizations)) {
      _.set(customized, path, value);
    }

    return customized;
  }

  private getNextRunDate(cronExpression: string, timezone: string): Date {
    // Simple implementation - in production, use a proper cron parser
    return new Date(Date.now() + 24 * 60 * 60 * 1000); // Next day
  }

  private calculatePerformanceTrends(executions: WorkflowExecution[]): any[] {
    // Group executions by date
    const groupedByDate = _.groupBy(executions, exec => 
      exec.startedAt.toISOString().split('T')[0]
    );

    return Object.entries(groupedByDate).map(([date, execs]) => ({
      date: new Date(date),
      executionCount: execs.length,
      averageDuration: _.mean(execs.map(e => e.duration || 0)),
      successRate: (execs.filter(e => e.status === WorkflowStatus.COMPLETED).length / execs.length) * 100,
    }));
  }

  private async loadWorkflows(): Promise<void> {
    // Load workflows from database - placeholder implementation
    logger.debug('Loading workflows from database...');
  }

  private async loadSchedules(): Promise<void> {
    // Load schedules from database - placeholder implementation
    logger.debug('Loading schedules from database...');
  }

  private async loadTemplates(): Promise<void> {
    // Load built-in templates
    logger.debug('Loading workflow templates...');
  }

  private handleAgentStatusChange(data: any): void {
    // Handle agent status changes
    logger.debug('Agent status changed', data);
  }

  private handleResourceAllocation(data: any): void {
    // Handle resource allocation changes
    logger.debug('Resource allocated', data);
  }

  // Public getters
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  getTemplate(templateId: string): WorkflowTemplate | undefined {
    return this.templates.get(templateId);
  }

  getAllWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  getAllExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values());
  }

  getAllTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }
}