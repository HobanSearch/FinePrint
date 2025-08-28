"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowAutomationService = void 0;
const client_1 = require("@prisma/client");
class WorkflowAutomationService {
    prisma;
    automationQueue;
    activeRules = new Map();
    scheduleJobs = new Map();
    constructor() {
        this.prisma = new client_1.PrismaClient();
    }
    async initialize() {
        await this.loadAutomationRules();
        await this.startScheduledAutomations();
        console.log('Workflow automation service initialized');
    }
    async createAutomationRule(rule) {
        const newRule = await this.prisma.automationRule.create({
            data: {
                ...rule,
                executionCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
        if (newRule.active) {
            this.activeRules.set(newRule.id, newRule);
            await this.setupRuleTrigger(newRule);
        }
        return newRule;
    }
    async updateAutomationRule(id, updates) {
        const updatedRule = await this.prisma.automationRule.update({
            where: { id },
            data: {
                ...updates,
                updatedAt: new Date(),
            },
        });
        if (updatedRule.active) {
            this.activeRules.set(id, updatedRule);
            await this.setupRuleTrigger(updatedRule);
        }
        else {
            this.activeRules.delete(id);
            this.clearRuleTrigger(id);
        }
        return updatedRule;
    }
    async executeAutomationRule(ruleId, context) {
        const rule = this.activeRules.get(ruleId);
        if (!rule || !rule.active) {
            return false;
        }
        try {
            const conditionsMet = await this.evaluateConditions(rule.conditions, context);
            if (!conditionsMet) {
                return false;
            }
            await this.executeActions(rule.actions, context);
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
        }
        catch (error) {
            console.error(`Automation rule execution error for ${ruleId}:`, error);
            return false;
        }
    }
    async handleEvent(eventType, eventData) {
        const triggeredRules = Array.from(this.activeRules.values()).filter(rule => rule.trigger.type === 'event_based' && rule.trigger.event === eventType);
        for (const rule of triggeredRules) {
            await this.executeAutomationRule(rule.id, eventData);
        }
    }
    async setupLeadNurturingWorkflow(leadId) {
        const nurturingRule = {
            name: `Lead Nurturing - ${leadId}`,
            type: 'sales',
            trigger: {
                type: 'time_based',
                schedule: '0 9 * * *',
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
    async setupDealAlerts(opportunityId) {
        const dealAlertRule = {
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
    async setupCustomerSuccessHandoff() {
        const handoffRule = {
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
    async setupRevenueTracking() {
        const revenueTrackingRule = {
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
    async loadAutomationRules() {
        const rules = await this.prisma.automationRule.findMany({
            where: { active: true },
        });
        for (const rule of rules) {
            this.activeRules.set(rule.id, rule);
            await this.setupRuleTrigger(rule);
        }
    }
    async setupRuleTrigger(rule) {
        switch (rule.trigger.type) {
            case 'time_based':
                await this.setupScheduledTrigger(rule);
                break;
            case 'event_based':
                break;
            case 'metric_based':
                await this.setupMetricTrigger(rule);
                break;
        }
    }
    async setupScheduledTrigger(rule) {
        if (!rule.trigger.schedule)
            return;
        this.clearRuleTrigger(rule.id);
        const interval = this.parseCronToInterval(rule.trigger.schedule);
        if (interval > 0) {
            const job = setInterval(async () => {
                await this.executeAutomationRule(rule.id, {});
            }, interval);
            this.scheduleJobs.set(rule.id, job);
        }
    }
    async setupMetricTrigger(rule) {
        const checkInterval = setInterval(async () => {
            await this.checkMetricTrigger(rule);
        }, 60 * 60 * 1000);
        this.scheduleJobs.set(rule.id, checkInterval);
    }
    async checkMetricTrigger(rule) {
        const { metric, threshold } = rule.trigger;
        if (!metric || threshold === undefined)
            return;
        const currentValue = await this.getMetricValue(metric);
        if (currentValue >= threshold) {
            await this.executeAutomationRule(rule.id, { [metric]: currentValue });
        }
    }
    async evaluateConditions(conditions, context) {
        if (conditions.length === 0)
            return true;
        for (const condition of conditions) {
            const fieldValue = this.getFieldValue(condition.field, context);
            const conditionMet = this.evaluateCondition(fieldValue, condition.operator, condition.value);
            if (!conditionMet) {
                return false;
            }
        }
        return true;
    }
    evaluateCondition(fieldValue, operator, expectedValue) {
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
    async executeActions(actions, context) {
        for (const action of actions) {
            try {
                await this.executeAction(action, context);
            }
            catch (error) {
                console.error(`Action execution error:`, error);
            }
        }
    }
    async executeAction(action, context) {
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
    async executeSendEmailAction(config, context) {
        console.log('Sending email:', { config, context });
    }
    async executeCreateTaskAction(config, context) {
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
    async executeUpdateFieldAction(config, context) {
        const { entity, field, operation, value } = config;
        if (entity === 'lead' && context.leadId) {
            const updateData = {};
            if (operation === 'set') {
                updateData[field] = value;
            }
            else if (operation === 'add') {
                updateData[field] = { increment: Number(value) };
            }
            else if (operation === 'decrease_by_10') {
                updateData[field] = { decrement: 10 };
            }
            await this.prisma.lead.update({
                where: { id: context.leadId },
                data: updateData,
            });
        }
    }
    async executeCreateOpportunityAction(config, context) {
        console.log('Creating opportunity:', { config, context });
    }
    async executeSendSlackAction(config, context) {
        console.log('Sending Slack message:', { config, context });
    }
    async executeWebhookAction(config, context) {
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
        }
        catch (error) {
            console.error('Webhook execution error:', error);
        }
    }
    getFieldValue(field, context) {
        const fields = field.split('.');
        let value = context;
        for (const f of fields) {
            value = value?.[f];
        }
        return value;
    }
    async getMetricValue(metric) {
        switch (metric) {
            case 'days_in_stage':
                return 0;
            case 'lead_score':
                return 0;
            default:
                return 0;
        }
    }
    parseCronToInterval(cronExpression) {
        if (cronExpression === '0 9 * * *') {
            return 24 * 60 * 60 * 1000;
        }
        if (cronExpression === '0 * * * *') {
            return 60 * 60 * 1000;
        }
        return 0;
    }
    replaceVariables(data, context) {
        if (typeof data === 'string') {
            return data.replace(/\{\{([^}]+)\}\}/g, (match, field) => {
                return this.getFieldValue(field, context) || match;
            });
        }
        if (typeof data === 'object' && data !== null) {
            const result = {};
            for (const [key, value] of Object.entries(data)) {
                result[key] = this.replaceVariables(value, context);
            }
            return result;
        }
        return data;
    }
    clearRuleTrigger(ruleId) {
        const job = this.scheduleJobs.get(ruleId);
        if (job) {
            clearInterval(job);
            this.scheduleJobs.delete(ruleId);
        }
    }
    async startScheduledAutomations() {
        for (const rule of this.activeRules.values()) {
            if (rule.trigger.type === 'time_based') {
                await this.setupScheduledTrigger(rule);
            }
        }
    }
    async getActiveRules() {
        return Array.from(this.activeRules.values());
    }
    async getRuleExecutionHistory(ruleId, limit = 50) {
        return [];
    }
    async pauseRule(ruleId) {
        await this.updateAutomationRule(ruleId, { active: false });
    }
    async resumeRule(ruleId) {
        await this.updateAutomationRule(ruleId, { active: true });
    }
    async deleteRule(ruleId) {
        this.clearRuleTrigger(ruleId);
        this.activeRules.delete(ruleId);
        await this.prisma.automationRule.delete({
            where: { id: ruleId },
        });
    }
}
exports.WorkflowAutomationService = WorkflowAutomationService;
//# sourceMappingURL=workflow-automation-service.js.map