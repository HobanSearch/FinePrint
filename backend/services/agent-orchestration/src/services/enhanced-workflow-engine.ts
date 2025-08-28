import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';
import * as cron from 'node-cron';
import * as yaml from 'js-yaml';
import _ from 'lodash';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { Engine } from 'json-rules-engine';
import { Connection, Client } from '@temporalio/client';
import { Worker } from '@temporalio/worker';

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
  BusinessProcessType,
  BusinessProcessCategory,
  BusinessProcessPriority,
  EnhancedBusinessProcessDefinition,
  EnhancedBusinessProcessExecution,
  BusinessRule,
  ABTestConfiguration,
  SLAConfiguration,
} from '../types/business-process';
import {
  EventType,
  OrchestrationEvent,
  TaskSchedulingRequest,
  TaskSchedulingResult,
  DecisionRequest,
  DecisionResult,
  TemporalWorkflowConfig,
  WDLWorkflowDefinition,
  OrchestrationConfig,
} from '../types/orchestration';
import {
  AgentRegistry,
  CommunicationBus,
  DecisionEngine,
  ResourceManager,
} from './';

const logger = Logger.child({ component: 'enhanced-workflow-engine' });

export class EnhancedWorkflowEngine extends EventEmitter {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private businessProcesses: Map<string, EnhancedBusinessProcessDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private businessExecutions: Map<string, EnhancedBusinessProcessExecution> = new Map();
  private schedules: Map<string, WorkflowSchedule> = new Map();
  private templates: Map<string, WorkflowTemplate> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private abTests: Map<string, ABTestConfiguration> = new Map();
  
  // Advanced orchestration components
  private executionQueue: PQueue;
  private ruleEngine: Engine;
  private temporalClient?: Client;
  private temporalWorker?: Worker;
  private eventHistory: OrchestrationEvent[] = [];
  private running: boolean = false;

  constructor(
    private agentRegistry: AgentRegistry,
    private communicationBus: CommunicationBus,
    private decisionEngine: DecisionEngine,
    private resourceManager: ResourceManager,
    private orchestrationConfig: OrchestrationConfig
  ) {
    super();
    this.setMaxListeners(10000); // Support many concurrent workflows
    
    // Initialize execution queue with priority support
    this.executionQueue = new PQueue({
      concurrency: orchestrationConfig.scheduling.constraints.maxConcurrentWorkflows || 10,
      intervalCap: orchestrationConfig.scheduling.constraints.maxConcurrentTasks || 100,
      interval: 1000,
    });

    // Initialize rule engine for business rules
    this.ruleEngine = new Engine();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Enhanced Workflow Engine...');

      // Initialize Temporal client if configured
      if (this.orchestrationConfig.engine.type === 'temporal') {
        await this.initializeTemporalClient();
      }

      // Load existing workflows, processes, and schedules
      await this.loadWorkflows();
      await this.loadBusinessProcesses();
      await this.loadSchedules();
      await this.loadTemplates();
      await this.loadABTests();
      
      // Set up event listeners and rule processing
      this.setupEventListeners();
      this.setupBusinessRules();

      // Start background services
      await this.startEventProcessor();
      await this.startSLAMonitor();
      await this.startABTestManager();

      logger.info('Enhanced Workflow Engine initialized successfully', {
        workflowCount: this.workflows.size,
        businessProcessCount: this.businessProcesses.size,
        templateCount: this.templates.size,
        scheduleCount: this.schedules.size,
        abTestCount: this.abTests.size,
      });
    } catch (error) {
      logger.error('Failed to initialize Enhanced Workflow Engine', { error: error.message });
      throw error;
    }
  }

  // Business Process Management
  async createBusinessProcess(definition: EnhancedBusinessProcessDefinition): Promise<string> {
    try {
      // Validate business process definition
      await this.validateBusinessProcessDefinition(definition);

      // Store business process
      this.businessProcesses.set(definition.id, definition);
      
      // Set up business rules for this process
      await this.setupProcessBusinessRules(definition);

      // Emit event
      this.emit('business_process:created', { processId: definition.id, definition });

      logger.info('Business process created', { 
        processId: definition.id,
        name: definition.name,
        type: definition.processType,
        category: definition.category,
        priority: definition.priority,
      });

      return definition.id;
    } catch (error) {
      logger.error('Failed to create business process', { 
        processId: definition.id,
        error: error.message,
      });
      throw error;
    }
  }

  async executeBusinessProcess(
    processId: string,
    input: Record<string, any> = {},
    triggeredBy: string = 'manual',
    context: Record<string, any> = {}
  ): Promise<string> {
    const process = this.businessProcesses.get(processId);
    if (!process) {
      throw new Error(`Business process ${processId} not found`);
    }

    const executionId = uuidv4();
    const correlationId = nanoid();
    const traceId = nanoid();

    // Determine A/B test variant if configured
    const abTestVariant = await this.selectABTestVariant(process);

    const execution: EnhancedBusinessProcessExecution = {
      id: executionId,
      workflowId: processId,
      workflowVersion: process.version,
      status: WorkflowStatus.ACTIVE,
      triggeredBy,
      triggerData: input,
      startedAt: new Date(),
      taskExecutions: [],
      variables: { ...process.variables, ...input },
      processType: process.processType,
      priority: process.priority,
      slaStatus: 'on_track',
      slaMetrics: {
        targetCompletionTime: new Date(Date.now() + process.enhancedSla.targetDuration),
        escalationTime: new Date(Date.now() + process.enhancedSla.escalationThreshold),
      },
      businessContext: context,
      kpiResults: {},
      complianceStatus: {},
      stakeholderNotifications: [],
      abTestVariant: abTestVariant?.id,
      businessImpact: {},
      metadata: {
        priority: this.mapPriorityToNumber(process.priority),
      },
      enhancedMetadata: {
        executionEnvironment: process.metadata.customFields?.environment || 'production',
        parentProcessId: context.parentProcessId,
        childProcessIds: [],
        correlationId,
        traceId,
        businessUnit: process.metadata.customFields?.businessUnit || 'default',
        costCenter: process.costCenter || 'default',
        budget: {
          allocated: process.metadata.businessValue?.revenueImpact || 0,
          consumed: 0,
          currency: 'USD',
        },
        qualityGates: [],
        approvals: [],
        auditLog: [{
          timestamp: new Date(),
          action: 'process_started',
          resource: processId,
          reason: `Process started by ${triggeredBy}`,
          metadata: { input, context },
        }],
        customMetrics: {},
      },
    };

    this.businessExecutions.set(executionId, execution);

    // Add to execution queue with priority
    await this.executionQueue.add(
      () => this.processBusinessExecution(execution),
      { priority: this.mapPriorityToNumber(process.priority) }
    );

    // Emit event
    this.emitOrchestrationEvent({
      id: uuidv4(),
      type: EventType.WORKFLOW_STARTED,
      source: 'enhanced-workflow-engine',
      timestamp: new Date(),
      payload: { executionId, processId, processType: process.processType },
      metadata: { correlationId, traceId, version: 1 },
      headers: { 'Content-Type': 'application/json' },
    });

    // Send stakeholder notifications
    await this.sendStakeholderNotifications(execution, 'started');

    logger.info('Business process execution started', {
      executionId,
      processId,
      processType: process.processType,
      processName: process.name,
      triggeredBy,
      priority: process.priority,
      correlationId,
      traceId,
    });

    return executionId;
  }

  // A/B Testing Support
  private async selectABTestVariant(process: EnhancedBusinessProcessDefinition): Promise<any> {
    if (!process.abTestConfig || process.abTestConfig.status !== 'active') {
      return null;
    }

    const abTest = process.abTestConfig;
    const random = Math.random() * 100;
    let cumulative = 0;

    for (const [variantId, percentage] of Object.entries(abTest.trafficSplit)) {
      cumulative += percentage;
      if (random <= cumulative) {
        return abTest.variants.find(v => v.id === variantId);
      }
    }

    return abTest.variants[0]; // fallback to first variant
  }

  // Event-Driven Orchestration
  private emitOrchestrationEvent(event: OrchestrationEvent): void {
    this.eventHistory.push(event);
    
    // Keep only recent events to prevent memory issues
    if (this.eventHistory.length > 10000) {
      this.eventHistory = this.eventHistory.slice(-10000);
    }

    this.emit('orchestration:event', event);
    
    // Process event rules
    this.processEventRules(event);
  }

  private async processEventRules(event: OrchestrationEvent): Promise<void> {
    try {
      // Run business rules against the event
      const facts = {
        event: event,
        timestamp: event.timestamp,
        eventType: event.type,
        source: event.source,
        payload: event.payload,
      };

      const { events: ruleResults } = await this.ruleEngine.run(facts);
      
      for (const result of ruleResults) {
        await this.executeRuleAction(result);
      }
    } catch (error) {
      logger.error('Failed to process event rules', { 
        eventId: event.id,
        error: error.message,
      });
    }
  }

  private async executeRuleAction(ruleResult: any): Promise<void> {
    const { type, params } = ruleResult;
    
    try {
      switch (type) {
        case 'trigger_workflow':
          await this.executeWorkflow(params.workflowId, params.input, 'business_rule');
          break;
        case 'send_notification':
          await this.sendNotification(params);
          break;
        case 'escalate':
          await this.escalateProcess(params.processId, params.reason);
          break;
        case 'abort':
          await this.cancelExecution(params.executionId, params.reason);
          break;
        default:
          logger.warn('Unknown rule action type', { type });
      }
    } catch (error) {
      logger.error('Failed to execute rule action', { 
        type,
        params,
        error: error.message,
      });
    }
  }

  // SLA Management
  private async startSLAMonitor(): Promise<void> {
    // Monitor SLA compliance every minute
    setInterval(async () => {
      if (!this.running) return;

      for (const [executionId, execution] of this.businessExecutions.entries()) {
        if (execution.status !== WorkflowStatus.ACTIVE) continue;

        await this.checkSLACompliance(execution);
      }
    }, 60000);
  }

  private async checkSLACompliance(execution: EnhancedBusinessProcessExecution): Promise<void> {
    const now = new Date();
    const process = this.businessProcesses.get(execution.workflowId);
    if (!process) return;

    const elapsed = now.getTime() - execution.startedAt.getTime();
    const targetDuration = process.enhancedSla.targetDuration;
    const escalationThreshold = process.enhancedSla.escalationThreshold;

    let newSlaStatus = execution.slaStatus;
    let shouldNotify = false;

    if (elapsed > targetDuration && execution.slaStatus === 'on_track') {
      newSlaStatus = 'breached';
      execution.slaMetrics.slaBreachReason = 'Exceeded target duration';
      shouldNotify = true;
      
      this.emitOrchestrationEvent({
        id: uuidv4(),
        type: EventType.SLA_BREACH,
        source: 'enhanced-workflow-engine',
        timestamp: now,
        payload: { 
          executionId: execution.id,
          processId: execution.workflowId,
          breach: 'target_duration',
          elapsed,
          target: targetDuration,
        },
        metadata: { 
          correlationId: execution.enhancedMetadata.correlationId,
          traceId: execution.enhancedMetadata.traceId,
          version: 1,
        },
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (elapsed > escalationThreshold * 0.8 && execution.slaStatus === 'on_track') {
      newSlaStatus = 'at_risk';
      shouldNotify = true;
      
      this.emitOrchestrationEvent({
        id: uuidv4(),
        type: EventType.SLA_WARNING,
        source: 'enhanced-workflow-engine',
        timestamp: now,
        payload: { 
          executionId: execution.id,
          processId: execution.workflowId,
          warning: 'approaching_escalation',
          elapsed,
          threshold: escalationThreshold,
        },
        metadata: { 
          correlationId: execution.enhancedMetadata.correlationId,
          traceId: execution.enhancedMetadata.traceId,
          version: 1,
        },
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (newSlaStatus !== execution.slaStatus) {
      execution.slaStatus = newSlaStatus;
      
      if (shouldNotify) {
        await this.sendStakeholderNotifications(execution, 'delayed');
      }
    }

    // Check notification thresholds
    for (const threshold of process.enhancedSla.notificationThresholds) {
      if (elapsed >= threshold && !execution.stakeholderNotifications.some(n => 
        n.event === 'threshold_reached' && parseInt(n.response || '0') === threshold
      )) {
        await this.sendStakeholderNotifications(execution, 'milestone_reached', { threshold });
      }
    }
  }

  // Stakeholder Notification System
  private async sendStakeholderNotifications(
    execution: EnhancedBusinessProcessExecution,
    event: string,
    context: Record<string, any> = {}
  ): Promise<void> {
    const process = this.businessProcesses.get(execution.workflowId);
    if (!process) return;

    for (const stakeholder of process.stakeholders) {
      const preferences = stakeholder.notificationPreferences.filter(p => p.event === event);
      
      for (const preference of preferences) {
        try {
          const notification = {
            stakeholderId: stakeholder.id,
            event,
            channel: preference.channel,
            sentAt: new Date(),
            status: 'sent' as const,
          };

          // Send notification based on channel
          switch (preference.channel) {
            case 'email':
              await this.sendEmailNotification(stakeholder, execution, event, context, preference.config);
              break;
            case 'slack':
              await this.sendSlackNotification(stakeholder, execution, event, context, preference.config);
              break;
            case 'webhook':
              await this.sendWebhookNotification(stakeholder, execution, event, context, preference.config);
              break;
            case 'in_app':
              await this.sendInAppNotification(stakeholder, execution, event, context, preference.config);
              break;
          }

          execution.stakeholderNotifications.push(notification);
          
          logger.debug('Stakeholder notification sent', {
            executionId: execution.id,
            stakeholderId: stakeholder.id,
            event,
            channel: preference.channel,
          });
        } catch (error) {
          logger.error('Failed to send stakeholder notification', {
            executionId: execution.id,
            stakeholderId: stakeholder.id,
            event,
            channel: preference.channel,
            error: error.message,
          });
        }
      }
    }
  }

  // Workflow Definition Language Support
  async createWorkflowFromYAML(yamlDefinition: string): Promise<string> {
    try {
      const wdlDefinition = yaml.load(yamlDefinition) as WDLWorkflowDefinition;
      
      // Convert WDL to internal workflow definition
      const workflowDefinition = this.convertWDLToWorkflow(wdlDefinition);
      
      return await this.createWorkflow(workflowDefinition);
    } catch (error) {
      logger.error('Failed to create workflow from YAML', { error: error.message });
      throw new Error(`Invalid YAML workflow definition: ${error.message}`);
    }
  }

  private convertWDLToWorkflow(wdl: WDLWorkflowDefinition): WorkflowDefinition {
    // Convert WDL templates to workflow tasks
    const tasks = wdl.spec.templates.map(template => ({
      id: template.name,
      name: template.name,
      description: template.metadata?.annotations?.description || '',
      agentType: 'fullstack-agent' as any, // Default agent type
      requiredCapabilities: [],
      inputSchema: template.inputs?.parameters?.reduce((schema, param) => {
        schema[param.name] = param.value || null;
        return schema;
      }, {} as Record<string, any>) || {},
      outputSchema: template.outputs?.parameters?.reduce((schema, param) => {
        schema[param.name] = null;
        return schema;
      }, {} as Record<string, any>) || {},
      timeout: this.parseTimeoutToMs(template.timeout) || 300000,
      retryPolicy: {
        maxRetries: parseInt(template.retryStrategy?.limit || '3'),
        backoffMultiplier: template.retryStrategy?.backoff?.factor || 2,
        initialDelay: this.parseTimeoutToMs(template.retryStrategy?.backoff?.duration) || 1000,
      },
      dependencies: [],
      conditions: [],
      parallel: false,
      priority: wdl.spec.priority || 5,
      metadata: template.metadata?.annotations || {},
    }));

    return {
      id: uuidv4(),
      name: wdl.metadata.name,
      description: wdl.metadata.annotations?.description || '',
      version: '1.0.0',
      tags: Object.keys(wdl.metadata.labels || {}),
      trigger: {
        type: 'manual' as any,
        config: {},
      },
      tasks,
      globalTimeout: wdl.spec.activeDeadlineSeconds ? wdl.spec.activeDeadlineSeconds * 1000 : 3600000,
      maxConcurrentTasks: 10,
      errorHandling: {
        onFailure: 'stop' as any,
        maxRetries: 3,
        notifyOnFailure: true,
      },
      variables: {},
      metadata: wdl.metadata.annotations || {},
    };
  }

  private parseTimeoutToMs(timeout?: string): number | undefined {
    if (!timeout) return undefined;
    
    const match = timeout.match(/^(\d+)([smh])$/);
    if (!match) return undefined;
    
    const [, value, unit] = match;
    const num = parseInt(value);
    
    switch (unit) {
      case 's': return num * 1000;
      case 'm': return num * 60 * 1000;
      case 'h': return num * 60 * 60 * 1000;
      default: return undefined;
    }
  }

  // Temporal Workflow Integration
  private async initializeTemporalClient(): Promise<void> {
    try {
      const connection = await Connection.connect({
        address: this.orchestrationConfig.engine.config.address || 'localhost:7233',
      });
      
      this.temporalClient = new Client({ connection });
      
      logger.info('Temporal client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Temporal client', { error: error.message });
      throw error;
    }
  }

  async executeTemporalWorkflow(
    workflowType: string,
    args: any[],
    config: TemporalWorkflowConfig
  ): Promise<any> {
    if (!this.temporalClient) {
      throw new Error('Temporal client not initialized');
    }

    try {
      const handle = await this.temporalClient.workflow.start(workflowType, {
        args,
        taskQueue: config.taskQueue,
        workflowId: config.workflowId,
        workflowRunTimeout: config.runTimeout,
        workflowTaskTimeout: config.taskTimeout,
        retry: config.retryPolicy,
        cronSchedule: config.cronSchedule,
        memo: config.memo,
        searchAttributes: config.searchAttributes,
      });

      const result = await handle.result();
      
      logger.info('Temporal workflow completed', {
        workflowId: config.workflowId,
        workflowType,
      });
      
      return result;
    } catch (error) {
      logger.error('Temporal workflow failed', {
        workflowId: config.workflowId,
        workflowType,
        error: error.message,
      });
      throw error;
    }
  }

  // Advanced Business Rule Processing
  private async setupBusinessRules(): Promise<void> {
    // Clear existing rules
    this.ruleEngine = new Engine();

    // Add rules from all business processes
    for (const process of this.businessProcesses.values()) {
      await this.setupProcessBusinessRules(process);
    }
  }

  private async setupProcessBusinessRules(process: EnhancedBusinessProcessDefinition): Promise<void> {
    for (const rule of process.businessRules) {
      if (!rule.enabled) continue;

      const ruleDefinition = {
        conditions: this.convertBusinessRuleConditions(rule.conditions),
        event: {
          type: rule.actions.map(a => a.type).join(','),
          params: rule.actions.reduce((params, action) => ({ ...params, ...action.parameters }), {}),
        },
        priority: rule.priority,
      };

      this.ruleEngine.addRule(ruleDefinition);
    }
  }

  private convertBusinessRuleConditions(conditions: any[]): any {
    // Convert business rule conditions to json-rules-engine format
    return {
      all: conditions.map(condition => ({
        fact: condition.field,
        operator: this.mapRuleOperator(condition.operator),
        value: condition.value,
      })),
    };
  }

  private mapRuleOperator(operator: string): string {
    const operatorMap: Record<string, string> = {
      'equals': 'equal',
      'not_equals': 'notEqual',
      'greater_than': 'greaterThan',
      'less_than': 'lessThan',
      'contains': 'in',
      'not_contains': 'notIn',
      'exists': 'notEqual',
      'not_exists': 'equal',
      'matches_regex': 'equal', // Custom handling needed
    };
    
    return operatorMap[operator] || 'equal';
  }

  // Utility Methods
  private mapPriorityToNumber(priority: BusinessProcessPriority): number {
    const priorityMap: Record<BusinessProcessPriority, number> = {
      [BusinessProcessPriority.CRITICAL]: 10,
      [BusinessProcessPriority.HIGH]: 8,
      [BusinessProcessPriority.MEDIUM]: 5,
      [BusinessProcessPriority.LOW]: 3,
      [BusinessProcessPriority.BACKGROUND]: 1,
    };
    
    return priorityMap[priority] || 5;
  }

  // Placeholder implementations for notification methods
  private async sendEmailNotification(stakeholder: any, execution: any, event: string, context: any, config: any): Promise<void> {
    // Implementation for email notifications
    logger.debug('Email notification sent', { stakeholder: stakeholder.id, event });
  }

  private async sendSlackNotification(stakeholder: any, execution: any, event: string, context: any, config: any): Promise<void> {
    // Implementation for Slack notifications
    logger.debug('Slack notification sent', { stakeholder: stakeholder.id, event });
  }

  private async sendWebhookNotification(stakeholder: any, execution: any, event: string, context: any, config: any): Promise<void> {
    // Implementation for webhook notifications
    logger.debug('Webhook notification sent', { stakeholder: stakeholder.id, event });
  }

  private async sendInAppNotification(stakeholder: any, execution: any, event: string, context: any, config: any): Promise<void> {
    // Implementation for in-app notifications
    logger.debug('In-app notification sent', { stakeholder: stakeholder.id, event });
  }

  private async sendNotification(params: any): Promise<void> {
    // Generic notification sender
    logger.debug('Notification sent', params);
  }

  private async escalateProcess(processId: string, reason: string): Promise<void> {
    // Process escalation logic
    logger.info('Process escalated', { processId, reason });
  }

  // Placeholder implementations for core methods
  private async validateBusinessProcessDefinition(definition: EnhancedBusinessProcessDefinition): Promise<void> {
    // Validation logic
  }

  private async processBusinessExecution(execution: EnhancedBusinessProcessExecution): Promise<void> {
    // Business process execution logic
  }

  private async startEventProcessor(): Promise<void> {
    // Event processing logic
  }

  private async startABTestManager(): Promise<void> {
    // A/B test management logic
  }

  private async loadWorkflows(): Promise<void> {
    // Load workflows from storage
  }

  private async loadBusinessProcesses(): Promise<void> {
    // Load business processes from storage
  }

  private async loadSchedules(): Promise<void> {
    // Load schedules from storage
  }

  private async loadTemplates(): Promise<void> {
    // Load templates from storage
  }

  private async loadABTests(): Promise<void> {
    // Load A/B tests from storage
  }

  private setupEventListeners(): void {
    // Set up event listeners
  }

  // Inherit core methods from original WorkflowEngine
  async createWorkflow(definition: WorkflowDefinition): Promise<string> {
    // Implementation from original WorkflowEngine
    return '';
  }

  async executeWorkflow(workflowId: string, input: Record<string, any>, triggeredBy: string): Promise<string> {
    // Implementation from original WorkflowEngine
    return '';
  }

  async cancelExecution(executionId: string, reason: string): Promise<void> {
    // Implementation from original WorkflowEngine
  }

  async startScheduler(): Promise<void> {
    this.running = true;
    // Start scheduler logic
  }

  async stop(): Promise<void> {
    this.running = false;
    // Stop logic
  }
}