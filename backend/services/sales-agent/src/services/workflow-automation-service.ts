import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { AutomationRule, AutomationTrigger, AutomationCondition, AutomationAction } from '@fineprintai/shared-types';
import { config } from '../config';

export class WorkflowAutomationService {
  private prisma: PrismaClient;
  private automationQueue: Queue;
  private activeRules: Map<string, AutomationRule> = new Map();
  private scheduleJobs: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.prisma = new PrismaClient();
  }

  async initialize() {
    await this.loadAutomationRules();
    await this.startScheduledAutomations();
    console.log('Workflow automation service initialized');
  }

  async createAutomationRule(rule: Omit<AutomationRule, 'id' | 'executionCount' | 'createdAt' | 'updatedAt'>): Promise<AutomationRule> {
    const newRule = await this.prisma.automationRule.create({
      data: {
        ...rule,
        executionCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Add to active rules if enabled
    if (newRule.active) {
      this.activeRules.set(newRule.id, newRule as AutomationRule);
      await this.setupRuleTrigger(newRule as AutomationRule);
    }

    return newRule as AutomationRule;
  }

  async updateAutomationRule(id: string, updates: Partial<AutomationRule>): Promise<AutomationRule> {
    const updatedRule = await this.prisma.automationRule.update({
      where: { id },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    });

    // Update in memory and re-setup triggers
    if (updatedRule.active) {
      this.activeRules.set(id, updatedRule as AutomationRule);
      await this.setupRuleTrigger(updatedRule as AutomationRule);
    } else {
      this.activeRules.delete(id);
      this.clearRuleTrigger(id);
    }

    return updatedRule as AutomationRule;
  }

  async executeAutomationRule(ruleId: string, context: any): Promise<boolean> {
    const rule = this.activeRules.get(ruleId);
    if (!rule || !rule.active) {
      return false;
    }

    try {
      // Check conditions
      const conditionsMet = await this.evaluateConditions(rule.conditions, context);
      if (!conditionsMet) {
        return false;
      }

      // Execute actions
      await this.executeActions(rule.actions, context);

      // Update execution count and last executed
      await this.prisma.automationRule.update({
        where: { id: ruleId },
        data: {
          executionCount: { increment: 1 },
          lastExecuted: new Date(),
        },
      });

      rule.executionCount += 1;
      rule.lastExecuted = new Date();

      return true;
    } catch (error) {
      console.error(`Automation rule execution error for ${ruleId}:`, error);
      return false;
    }
  }

  async handleEvent(eventType: string, eventData: any): Promise<void> {
    // Find rules triggered by this event
    const triggeredRules = Array.from(this.activeRules.values()).filter(
      rule => rule.trigger.type === 'event_based' && rule.trigger.event === eventType
    );

    for (const rule of triggeredRules) {
      await this.executeAutomationRule(rule.id, eventData);
    }
  }

  // Predefined automation workflows
  async setupLeadNurturingWorkflow(leadId: string): Promise<void> {
    const nurturingRule: Omit<AutomationRule, 'id' | 'executionCount' | 'createdAt' | 'updatedAt'> = {
      name: `Lead Nurturing - ${leadId}`,
      type: 'sales',
      trigger: {
        type: 'time_based',
        schedule: '0 9 * * *', // Daily at 9 AM
      },
      conditions: [
        {
          field: 'stage',
          operator: 'equals',
          value: 'new',
        },
        {
          field: 'daysSinceCreated',
          operator: 'greater_than',
          value: 1,
        },
      ],
      actions: [
        {
          type: 'send_email',
          config: {
            templateId: 'nurturing_email_1',
            delay: 0,
          },
        },
        {
          type: 'create_task',
          config: {
            title: 'Follow up with lead',
            assignedTo: 'auto_assign',
            dueDate: '+2d',
          },
        },
      ],
      active: true,
      createdBy: 'system',
    };

    await this.createAutomationRule(nurturingRule);
  }

  async setupDealAlerts(opportunityId: string): Promise<void> {
    const dealAlertRule: Omit<AutomationRule, 'id' | 'executionCount' | 'createdAt' | 'updatedAt'> = {
      name: `Deal Alerts - ${opportunityId}`,
      type: 'sales',
      trigger: {
        type: 'metric_based',
        metric: 'days_in_stage',
        threshold: 30,
      },
      conditions: [
        {
          field: 'stage',
          operator: 'not_in',
          value: ['closed_won', 'closed_lost'],
        },
      ],
      actions: [
        {
          type: 'send_slack',
          config: {
            channel: '#sales-alerts',
            message: 'Deal has been in stage for 30+ days',
            mentions: ['@sales-manager'],
          },
        },
        {
          type: 'update_field',
          config: {
            field: 'probability',
            value: 'decrease_by_10',
          },
        },
      ],
      active: true,
      createdBy: 'system',
    };

    await this.createAutomationRule(dealAlertRule);
  }

  async setupCustomerSuccessHandoff(): Promise<void> {
    const handoffRule: Omit<AutomationRule, 'id' | 'executionCount' | 'createdAt' | 'updatedAt'> = {
      name: 'Customer Success Handoff',
      type: 'customer_success',
      trigger: {
        type: 'event_based',
        event: 'opportunity.closed_won',
      },
      conditions: [
        {
          field: 'value',
          operator: 'greater_than',
          value: 10000,
        },
      ],
      actions: [
        {
          type: 'create_opportunity',
          config: {
            type: 'onboarding',
            assignedTo: 'customer_success_team',
            priority: 'high',
          },
        },
        {
          type: 'send_email',
          config: {
            templateId: 'welcome_customer',
            to: 'primary_contact',
          },
        },
        {
          type: 'webhook',
          config: {
            url: '/api/customer-success/new-customer',
            method: 'POST',
            data: 'opportunity_data',
          },
        },
      ],
      active: true,
      createdBy: 'system',
    };

    await this.createAutomationRule(handoffRule);
  }

  async setupRevenueTracking(): Promise<void> {
    const revenueTrackingRule: Omit<AutomationRule, 'id' | 'executionCount' | 'createdAt' | 'updatedAt'> = {
      name: 'Revenue Milestone Tracking',
      type: 'sales',
      trigger: {
        type: 'event_based',
        event: 'opportunity.closed_won',
      },
      conditions: [],
      actions: [
        {
          type: 'webhook',
          config: {
            url: '/api/analytics/revenue-update',
            method: 'POST',
            data: {
              amount: '{{opportunity.value}}',
              date: '{{opportunity.actualCloseDate}}',
              source: 'sales',
            },
          },
        },
        {
          type: 'update_field',
          config: {
            entity: 'lead',
            field: 'lifetimeValue',
            operation: 'add',
            value: '{{opportunity.value}}',
          },
        },
      ],
      active: true,
      createdBy: 'system',
    };

    await this.createAutomationRule(revenueTrackingRule);
  }

  private async loadAutomationRules(): Promise<void> {
    const rules = await this.prisma.automationRule.findMany({
      where: { active: true },
    });

    for (const rule of rules) {
      this.activeRules.set(rule.id, rule as AutomationRule);
      await this.setupRuleTrigger(rule as AutomationRule);
    }
  }

  private async setupRuleTrigger(rule: AutomationRule): Promise<void> {
    switch (rule.trigger.type) {
      case 'time_based':
        await this.setupScheduledTrigger(rule);
        break;
      case 'event_based':
        // Event-based triggers are handled by the handleEvent method
        break;
      case 'metric_based':
        await this.setupMetricTrigger(rule);
        break;
    }
  }

  private async setupScheduledTrigger(rule: AutomationRule): Promise<void> {
    if (!rule.trigger.schedule) return;

    // Clear existing job if any
    this.clearRuleTrigger(rule.id);

    // For simplicity, using setTimeout - in production, use a proper cron library
    const interval = this.parseCronToInterval(rule.trigger.schedule);
    if (interval > 0) {
      const job = setInterval(async () => {
        await this.executeAutomationRule(rule.id, {});
      }, interval);

      this.scheduleJobs.set(rule.id, job);
    }
  }

  private async setupMetricTrigger(rule: AutomationRule): Promise<void> {
    // Metric-based triggers would be checked periodically
    // This is a simplified implementation
    const checkInterval = setInterval(async () => {
      await this.checkMetricTrigger(rule);
    }, 60 * 60 * 1000); // Check every hour

    this.scheduleJobs.set(rule.id, checkInterval);
  }

  private async checkMetricTrigger(rule: AutomationRule): Promise<void> {
    const { metric, threshold } = rule.trigger;
    if (!metric || threshold === undefined) return;

    // This would query the database for the specific metric
    // Implementation depends on the specific metric being tracked
    const currentValue = await this.getMetricValue(metric);
    
    if (currentValue >= threshold) {
      await this.executeAutomationRule(rule.id, { [metric]: currentValue });
    }
  }

  private async evaluateConditions(conditions: AutomationCondition[], context: any): Promise<boolean> {
    if (conditions.length === 0) return true;

    for (const condition of conditions) {
      const fieldValue = this.getFieldValue(condition.field, context);
      const conditionMet = this.evaluateCondition(fieldValue, condition.operator, condition.value);
      
      if (!conditionMet) {
        return false; // All conditions must be met (AND logic)
      }
    }

    return true;
  }

  private evaluateCondition(fieldValue: any, operator: string, expectedValue: any): boolean {
    switch (operator) {
      case 'equals':
        return fieldValue === expectedValue;
      case 'not_equals':
        return fieldValue !== expectedValue;
      case 'greater_than':
        return Number(fieldValue) > Number(expectedValue);
      case 'less_than':
        return Number(fieldValue) < Number(expectedValue);
      case 'contains':
        return String(fieldValue).includes(String(expectedValue));
      case 'in':
        return Array.isArray(expectedValue) && expectedValue.includes(fieldValue);
      case 'not_in':
        return Array.isArray(expectedValue) && !expectedValue.includes(fieldValue);
      default:
        return false;
    }
  }

  private async executeActions(actions: AutomationAction[], context: any): Promise<void> {
    for (const action of actions) {
      try {
        await this.executeAction(action, context);
      } catch (error) {
        console.error(`Action execution error:`, error);
        // Continue with other actions even if one fails
      }
    }
  }

  private async executeAction(action: AutomationAction, context: any): Promise<void> {
    switch (action.type) {
      case 'send_email':
        await this.executeSendEmailAction(action.config, context);
        break;
      case 'create_task':
        await this.executeCreateTaskAction(action.config, context);
        break;
      case 'update_field':
        await this.executeUpdateFieldAction(action.config, context);
        break;
      case 'create_opportunity':
        await this.executeCreateOpportunityAction(action.config, context);
        break;
      case 'send_slack':
        await this.executeSendSlackAction(action.config, context);
        break;
      case 'webhook':
        await this.executeWebhookAction(action.config, context);
        break;
      default:
        console.warn(`Unknown action type: ${action.type}`);
    }
  }

  private async executeSendEmailAction(config: any, context: any): Promise<void> {
    // Implementation would integrate with EmailAutomationService
    console.log('Sending email:', { config, context });
  }

  private async executeCreateTaskAction(config: any, context: any): Promise<void> {
    await this.prisma.activity.create({
      data: {
        type: 'task',
        subject: config.title,
        description: `Automated task: ${config.title}`,
        leadId: context.leadId,
        opportunityId: context.opportunityId,
        createdBy: config.assignedTo || 'system',
        createdAt: new Date(),
      },
    });
  }

  private async executeUpdateFieldAction(config: any, context: any): Promise<void> {
    const { entity, field, operation, value } = config;
    
    if (entity === 'lead' && context.leadId) {
      const updateData: any = {};
      
      if (operation === 'set') {
        updateData[field] = value;
      } else if (operation === 'add') {
        updateData[field] = { increment: Number(value) };
      } else if (operation === 'decrease_by_10') {
        updateData[field] = { decrement: 10 };
      }

      await this.prisma.lead.update({
        where: { id: context.leadId },
        data: updateData,
      });
    }
  }

  private async executeCreateOpportunityAction(config: any, context: any): Promise<void> {
    // Implementation for creating opportunities
    console.log('Creating opportunity:', { config, context });
  }

  private async executeSendSlackAction(config: any, context: any): Promise<void> {
    // Implementation would integrate with Slack API
    console.log('Sending Slack message:', { config, context });
  }

  private async executeWebhookAction(config: any, context: any): Promise<void> {
    const { url, method, data } = config;
    
    try {
      const response = await fetch(url, {
        method: method || 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.replaceVariables(data, context)),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Webhook execution error:', error);
    }
  }

  private getFieldValue(field: string, context: any): any {
    // Support nested field access like 'lead.score'
    const fields = field.split('.');
    let value = context;
    
    for (const f of fields) {
      value = value?.[f];
    }
    
    return value;
  }

  private async getMetricValue(metric: string): Promise<number> {
    // Implementation depends on the specific metric
    switch (metric) {
      case 'days_in_stage':
        // Would calculate days in current stage for opportunities
        return 0;
      case 'lead_score':
        // Would get average lead score
        return 0;
      default:
        return 0;
    }
  }

  private parseCronToInterval(cronExpression: string): number {
    // Simple cron parser - in production, use a proper cron library
    if (cronExpression === '0 9 * * *') {
      return 24 * 60 * 60 * 1000; // Daily
    }
    if (cronExpression === '0 * * * *') {
      return 60 * 60 * 1000; // Hourly
    }
    return 0;
  }

  private replaceVariables(data: any, context: any): any {
    if (typeof data === 'string') {
      return data.replace(/\{\{([^}]+)\}\}/g, (match, field) => {
        return this.getFieldValue(field, context) || match;
      });
    }
    
    if (typeof data === 'object' && data !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.replaceVariables(value, context);
      }
      return result;
    }
    
    return data;
  }

  private clearRuleTrigger(ruleId: string): void {
    const job = this.scheduleJobs.get(ruleId);
    if (job) {
      clearInterval(job);
      this.scheduleJobs.delete(ruleId);
    }
  }

  private async startScheduledAutomations(): Promise<void> {
    // Start any time-based automations
    for (const rule of this.activeRules.values()) {
      if (rule.trigger.type === 'time_based') {
        await this.setupScheduledTrigger(rule);
      }
    }
  }

  // Public API methods
  async getActiveRules(): Promise<AutomationRule[]> {
    return Array.from(this.activeRules.values());
  }

  async getRuleExecutionHistory(ruleId: string, limit: number = 50): Promise<any[]> {
    // In a full implementation, this would track execution history
    return [];
  }

  async pauseRule(ruleId: string): Promise<void> {
    await this.updateAutomationRule(ruleId, { active: false });
  }

  async resumeRule(ruleId: string): Promise<void> {
    await this.updateAutomationRule(ruleId, { active: true });
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.clearRuleTrigger(ruleId);
    this.activeRules.delete(ruleId);
    
    await this.prisma.automationRule.delete({
      where: { id: ruleId },
    });
  }
}