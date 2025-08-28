"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowEngine = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const cron = __importStar(require("node-cron"));
const lodash_1 = __importDefault(require("lodash"));
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const workflow_1 = require("../types/workflow");
const logger = logger_1.Logger.child({ component: 'workflow-engine' });
class WorkflowEngine extends events_1.EventEmitter {
    agentRegistry;
    communicationBus;
    decisionEngine;
    resourceManager;
    workflows = new Map();
    executions = new Map();
    schedules = new Map();
    templates = new Map();
    cronJobs = new Map();
    executionQueue = [];
    running = false;
    constructor(agentRegistry, communicationBus, decisionEngine, resourceManager) {
        super();
        this.agentRegistry = agentRegistry;
        this.communicationBus = communicationBus;
        this.decisionEngine = decisionEngine;
        this.resourceManager = resourceManager;
        this.setMaxListeners(1000);
    }
    async initialize() {
        try {
            logger.info('Initializing Workflow Engine...');
            await this.loadWorkflows();
            await this.loadSchedules();
            await this.loadTemplates();
            this.setupEventListeners();
            logger.info('Workflow Engine initialized successfully', {
                workflowCount: this.workflows.size,
                templateCount: this.templates.size,
                scheduleCount: this.schedules.size,
            });
        }
        catch (error) {
            logger.error('Failed to initialize Workflow Engine', { error: error.message });
            throw error;
        }
    }
    async startScheduler() {
        if (this.running) {
            logger.warn('Workflow scheduler is already running');
            return;
        }
        this.running = true;
        logger.info('Starting workflow scheduler...');
        for (const [scheduleId, schedule] of this.schedules.entries()) {
            if (schedule.enabled) {
                await this.scheduleWorkflow(scheduleId, schedule);
            }
        }
        this.startExecutionProcessor();
        logger.info('Workflow scheduler started successfully');
    }
    async stop() {
        logger.info('Stopping Workflow Engine...');
        this.running = false;
        for (const [scheduleId, task] of this.cronJobs.entries()) {
            task.stop();
            logger.debug('Stopped scheduled workflow', { scheduleId });
        }
        this.cronJobs.clear();
        for (const [executionId, execution] of this.executions.entries()) {
            if (execution.status === workflow_1.WorkflowStatus.ACTIVE) {
                await this.cancelExecution(executionId, 'System shutdown');
            }
        }
        logger.info('Workflow Engine stopped');
    }
    async createWorkflow(definition) {
        try {
            await this.validateWorkflowDefinition(definition);
            this.workflows.set(definition.id, definition);
            this.emit('workflow:created', { workflowId: definition.id, definition });
            logger.info('Workflow created', {
                workflowId: definition.id,
                name: definition.name,
                taskCount: definition.tasks.length,
            });
            return definition.id;
        }
        catch (error) {
            logger.error('Failed to create workflow', {
                workflowId: definition.id,
                error: error.message,
            });
            throw error;
        }
    }
    async updateWorkflow(workflowId, definition) {
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
        }
        catch (error) {
            logger.error('Failed to update workflow', { workflowId, error: error.message });
            throw error;
        }
    }
    async deleteWorkflow(workflowId) {
        if (!this.workflows.has(workflowId)) {
            throw new Error(`Workflow ${workflowId} not found`);
        }
        const activeExecutions = Array.from(this.executions.values())
            .filter(exec => exec.workflowId === workflowId && exec.status === workflow_1.WorkflowStatus.ACTIVE);
        if (activeExecutions.length > 0) {
            throw new Error(`Cannot delete workflow ${workflowId}: ${activeExecutions.length} active executions`);
        }
        const definition = this.workflows.get(workflowId);
        this.workflows.delete(workflowId);
        this.emit('workflow:deleted', { workflowId, definition });
        logger.info('Workflow deleted', { workflowId });
    }
    async executeWorkflow(workflowId, input = {}, triggeredBy = 'manual', priority = 5) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }
        const executionId = (0, uuid_1.v4)();
        const execution = {
            id: executionId,
            workflowId,
            workflowVersion: workflow.version,
            status: workflow_1.WorkflowStatus.ACTIVE,
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
    async cancelExecution(executionId, reason = 'Cancelled') {
        const execution = this.executions.get(executionId);
        if (!execution) {
            throw new Error(`Execution ${executionId} not found`);
        }
        if (execution.status !== workflow_1.WorkflowStatus.ACTIVE) {
            throw new Error(`Execution ${executionId} is not active`);
        }
        for (const taskExecution of execution.taskExecutions) {
            if (taskExecution.status === workflow_1.TaskStatus.RUNNING) {
                await this.cancelTask(taskExecution.id, reason);
            }
        }
        execution.status = workflow_1.WorkflowStatus.CANCELLED;
        execution.completedAt = new Date();
        execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();
        execution.error = reason;
        this.emit('execution:cancelled', { executionId, execution, reason });
        logger.info('Workflow execution cancelled', { executionId, reason });
    }
    async executeTask(execution, taskDefinition) {
        const taskExecutionId = (0, uuid_1.v4)();
        const taskExecution = {
            id: taskExecutionId,
            taskId: taskDefinition.id,
            workflowExecutionId: execution.id,
            status: workflow_1.TaskStatus.PENDING,
            input: this.resolveTaskInput(taskDefinition, execution.variables),
            retryCount: 0,
            logs: [],
            metadata: {},
        };
        execution.taskExecutions.push(taskExecution);
        try {
            if (!this.areTaskDependenciesMet(taskDefinition, execution)) {
                taskExecution.status = workflow_1.TaskStatus.WAITING_FOR_DEPENDENCIES;
                return taskExecution;
            }
            if (!this.evaluateTaskConditions(taskDefinition, execution.variables)) {
                taskExecution.status = workflow_1.TaskStatus.SKIPPED;
                taskExecution.completedAt = new Date();
                this.addTaskLog(taskExecution, 'info', 'Task skipped due to conditions');
                return taskExecution;
            }
            taskExecution.status = workflow_1.TaskStatus.RUNNING;
            taskExecution.startedAt = new Date();
            const agent = await this.selectAgentForTask(taskDefinition);
            if (!agent) {
                throw new Error(`No suitable agent found for task ${taskDefinition.id}`);
            }
            taskExecution.agentId = agent.id;
            const result = await this.communicationBus.request({
                id: (0, uuid_1.v4)(),
                type: 'request',
                from: 'workflow-engine',
                to: agent.id,
                subject: 'execute_task',
                payload: {
                    taskId: taskDefinition.id,
                    input: taskExecution.input,
                    timeout: taskDefinition.timeout || config_1.config.workflow.defaultTimeout,
                },
                timestamp: new Date(),
                priority: 5,
            });
            taskExecution.output = result.payload;
            taskExecution.status = workflow_1.TaskStatus.COMPLETED;
            taskExecution.completedAt = new Date();
            taskExecution.duration = taskExecution.completedAt.getTime() - taskExecution.startedAt.getTime();
            this.addTaskLog(taskExecution, 'info', 'Task completed successfully');
        }
        catch (error) {
            taskExecution.error = error.message;
            taskExecution.status = workflow_1.TaskStatus.FAILED;
            taskExecution.completedAt = new Date();
            this.addTaskLog(taskExecution, 'error', `Task failed: ${error.message}`);
            if (taskExecution.retryCount < taskDefinition.retryPolicy.maxRetries) {
                taskExecution.retryCount++;
                taskExecution.status = workflow_1.TaskStatus.PENDING;
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
    async cancelTask(taskExecutionId, reason) {
        for (const execution of this.executions.values()) {
            const taskExecution = execution.taskExecutions.find(t => t.id === taskExecutionId);
            if (taskExecution && taskExecution.status === workflow_1.TaskStatus.RUNNING) {
                if (taskExecution.agentId) {
                    await this.communicationBus.publish({
                        id: (0, uuid_1.v4)(),
                        type: 'event',
                        from: 'workflow-engine',
                        to: taskExecution.agentId,
                        subject: 'cancel_task',
                        payload: { taskExecutionId, reason },
                        timestamp: new Date(),
                        priority: 10,
                    });
                }
                taskExecution.status = workflow_1.TaskStatus.CANCELLED;
                taskExecution.completedAt = new Date();
                taskExecution.error = reason;
                this.addTaskLog(taskExecution, 'warn', `Task cancelled: ${reason}`);
                break;
            }
        }
    }
    async createTemplate(template) {
        this.templates.set(template.id, template);
        this.emit('template:created', { templateId: template.id, template });
        logger.info('Workflow template created', {
            templateId: template.id,
            name: template.name,
            category: template.category,
        });
        return template.id;
    }
    async instantiateTemplate(templateId, customizations = {}) {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`Template ${templateId} not found`);
        }
        const definition = this.applyTemplateCustomizations(template.definition, customizations);
        definition.id = (0, uuid_1.v4)();
        const workflowId = await this.createWorkflow(definition);
        template.usageCount++;
        logger.info('Workflow instantiated from template', {
            templateId,
            workflowId,
            customizations: Object.keys(customizations),
        });
        return workflowId;
    }
    async scheduleWorkflow(scheduleId, schedule) {
        if (this.cronJobs.has(scheduleId)) {
            this.cronJobs.get(scheduleId).stop();
        }
        if (!schedule.enabled) {
            return;
        }
        try {
            const task = cron.schedule(schedule.cronExpression, async () => {
                try {
                    await this.executeWorkflow(schedule.workflowId, {}, `scheduled:${scheduleId}`);
                    schedule.lastRun = new Date();
                    schedule.runCount++;
                    schedule.successCount++;
                    schedule.nextRun = this.getNextRunDate(schedule.cronExpression, schedule.timezone);
                    logger.info('Scheduled workflow executed', {
                        scheduleId,
                        workflowId: schedule.workflowId,
                    });
                }
                catch (error) {
                    schedule.failureCount++;
                    logger.error('Scheduled workflow execution failed', {
                        scheduleId,
                        workflowId: schedule.workflowId,
                        error: error.message,
                    });
                }
            }, {
                scheduled: false,
                timezone: schedule.timezone,
            });
            task.start();
            this.cronJobs.set(scheduleId, task);
            logger.info('Workflow scheduled', {
                scheduleId,
                workflowId: schedule.workflowId,
                cronExpression: schedule.cronExpression,
                nextRun: schedule.nextRun,
            });
        }
        catch (error) {
            logger.error('Failed to schedule workflow', {
                scheduleId,
                cronExpression: schedule.cronExpression,
                error: error.message,
            });
            throw error;
        }
    }
    async getWorkflowMetrics(workflowId) {
        const executions = Array.from(this.executions.values())
            .filter(exec => exec.workflowId === workflowId);
        const successful = executions.filter(exec => exec.status === workflow_1.WorkflowStatus.COMPLETED);
        const failed = executions.filter(exec => exec.status === workflow_1.WorkflowStatus.FAILED);
        const durations = successful
            .map(exec => exec.duration || 0)
            .filter(duration => duration > 0);
        const taskCounts = executions.map(exec => exec.taskExecutions.length);
        const agentUsage = new Map();
        const errorPatterns = new Map();
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
            averageDuration: durations.length > 0 ? lodash_1.default.mean(durations) : 0,
            averageTaskCount: taskCounts.length > 0 ? lodash_1.default.mean(taskCounts) : 0,
            mostUsedAgents: Array.from(agentUsage.entries())
                .map(([agentType, usageCount]) => ({ agentType: agentType, usageCount }))
                .sort((a, b) => b.usageCount - a.usageCount),
            errorPatterns: Array.from(errorPatterns.entries())
                .map(([error, count]) => ({ error, count }))
                .sort((a, b) => b.count - a.count),
            performanceTrends: this.calculatePerformanceTrends(executions),
        };
    }
    setupEventListeners() {
        this.agentRegistry.on('agent:status_changed', (data) => {
            this.handleAgentStatusChange(data);
        });
        this.resourceManager.on('resource:allocated', (data) => {
            this.handleResourceAllocation(data);
        });
    }
    async validateWorkflowDefinition(definition) {
        if (!definition.id || !definition.name || !definition.tasks) {
            throw new Error('Invalid workflow definition: missing required fields');
        }
        const taskIds = new Set(definition.tasks.map(task => task.id));
        for (const task of definition.tasks) {
            for (const depId of task.dependencies) {
                if (!taskIds.has(depId)) {
                    throw new Error(`Task ${task.id} has invalid dependency: ${depId}`);
                }
            }
        }
        this.checkCircularDependencies(definition.tasks);
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
    checkCircularDependencies(tasks) {
        const visited = new Set();
        const recursionStack = new Set();
        const dfs = (taskId) => {
            if (recursionStack.has(taskId)) {
                return true;
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
    async selectAgentForTask(taskDefinition) {
        const candidates = await this.agentRegistry.findAgents({
            type: taskDefinition.agentType,
            capabilities: taskDefinition.requiredCapabilities,
            status: 'healthy',
        });
        if (candidates.length === 0) {
            return null;
        }
        const decision = await this.decisionEngine.makeDecision({
            id: (0, uuid_1.v4)(),
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
    resolveTaskInput(taskDefinition, variables) {
        const input = { ...taskDefinition.inputSchema };
        const resolveValue = (value) => {
            if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
                const varName = value.slice(2, -1);
                return variables[varName] || value;
            }
            if (typeof value === 'object' && value !== null) {
                const resolved = {};
                for (const [key, val] of Object.entries(value)) {
                    resolved[key] = resolveValue(val);
                }
                return resolved;
            }
            return value;
        };
        return resolveValue(input);
    }
    areTaskDependenciesMet(taskDefinition, execution) {
        for (const depId of taskDefinition.dependencies) {
            const depExecution = execution.taskExecutions.find(t => t.taskId === depId);
            if (!depExecution || depExecution.status !== workflow_1.TaskStatus.COMPLETED) {
                return false;
            }
        }
        return true;
    }
    evaluateTaskConditions(taskDefinition, variables) {
        if (!taskDefinition.conditions || taskDefinition.conditions.length === 0) {
            return true;
        }
        return taskDefinition.conditions.every((condition) => {
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
    addTaskLog(taskExecution, level, message, data) {
        taskExecution.logs.push({
            timestamp: new Date(),
            level: level,
            message,
            data,
        });
    }
    startExecutionProcessor() {
        setInterval(async () => {
            if (this.executionQueue.length === 0 || !this.running) {
                return;
            }
            const executionId = this.executionQueue.shift();
            if (!executionId)
                return;
            const execution = this.executions.get(executionId);
            if (!execution)
                return;
            try {
                await this.processExecution(execution);
            }
            catch (error) {
                logger.error('Failed to process execution', {
                    executionId,
                    error: error.message,
                });
            }
        }, 1000);
    }
    async processExecution(execution) {
        const workflow = this.workflows.get(execution.workflowId);
        if (!workflow) {
            execution.status = workflow_1.WorkflowStatus.FAILED;
            execution.error = 'Workflow definition not found';
            return;
        }
        const readyTasks = workflow.tasks.filter(task => {
            const existingExecution = execution.taskExecutions.find(t => t.taskId === task.id);
            return !existingExecution && this.areTaskDependenciesMet(task, execution);
        });
        const taskPromises = readyTasks.map(task => this.executeTask(execution, task));
        await Promise.allSettled(taskPromises);
        const allTasksExecuted = workflow.tasks.every(task => execution.taskExecutions.some(t => t.taskId === task.id &&
            [workflow_1.TaskStatus.COMPLETED, workflow_1.TaskStatus.FAILED, workflow_1.TaskStatus.SKIPPED].includes(t.status)));
        if (allTasksExecuted) {
            const hasFailedTasks = execution.taskExecutions.some(t => t.status === workflow_1.TaskStatus.FAILED);
            execution.status = hasFailedTasks ? workflow_1.WorkflowStatus.FAILED : workflow_1.WorkflowStatus.COMPLETED;
            execution.completedAt = new Date();
            execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();
            execution.output = {};
            execution.taskExecutions.forEach(task => {
                if (task.output) {
                    execution.output[task.taskId] = task.output;
                }
            });
            this.emit('execution:completed', { executionId: execution.id, execution });
            logger.info('Workflow execution completed', {
                executionId: execution.id,
                workflowId: execution.workflowId,
                status: execution.status,
                duration: execution.duration,
            });
        }
        else {
            this.executionQueue.push(execution.id);
        }
    }
    applyTemplateCustomizations(definition, customizations) {
        const customized = JSON.parse(JSON.stringify(definition));
        for (const [path, value] of Object.entries(customizations)) {
            lodash_1.default.set(customized, path, value);
        }
        return customized;
    }
    getNextRunDate(cronExpression, timezone) {
        return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    calculatePerformanceTrends(executions) {
        const groupedByDate = lodash_1.default.groupBy(executions, exec => exec.startedAt.toISOString().split('T')[0]);
        return Object.entries(groupedByDate).map(([date, execs]) => ({
            date: new Date(date),
            executionCount: execs.length,
            averageDuration: lodash_1.default.mean(execs.map(e => e.duration || 0)),
            successRate: (execs.filter(e => e.status === workflow_1.WorkflowStatus.COMPLETED).length / execs.length) * 100,
        }));
    }
    async loadWorkflows() {
        logger.debug('Loading workflows from database...');
    }
    async loadSchedules() {
        logger.debug('Loading schedules from database...');
    }
    async loadTemplates() {
        logger.debug('Loading workflow templates...');
    }
    handleAgentStatusChange(data) {
        logger.debug('Agent status changed', data);
    }
    handleResourceAllocation(data) {
        logger.debug('Resource allocated', data);
    }
    getWorkflow(workflowId) {
        return this.workflows.get(workflowId);
    }
    getExecution(executionId) {
        return this.executions.get(executionId);
    }
    getTemplate(templateId) {
        return this.templates.get(templateId);
    }
    getAllWorkflows() {
        return Array.from(this.workflows.values());
    }
    getAllExecutions() {
        return Array.from(this.executions.values());
    }
    getAllTemplates() {
        return Array.from(this.templates.values());
    }
}
exports.WorkflowEngine = WorkflowEngine;
//# sourceMappingURL=workflow-engine.js.map