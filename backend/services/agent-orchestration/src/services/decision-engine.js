"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionEngine = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const lodash_1 = __importDefault(require("lodash"));
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const decision_1 = require("../types/decision");
const logger = logger_1.Logger.child({ component: 'decision-engine' });
class DecisionEngine extends events_1.EventEmitter {
    agentRegistry;
    resourceManager;
    policies = new Map();
    escalationPolicies = new Map();
    authorityMatrix = new Map();
    auditLog = new Map();
    pendingDecisions = new Map();
    conflictResolutions = new Map();
    decisionMetrics;
    constructor(agentRegistry, resourceManager) {
        super();
        this.agentRegistry = agentRegistry;
        this.resourceManager = resourceManager;
        this.initializeMetrics();
    }
    async initialize() {
        try {
            logger.info('Initializing Decision Engine...');
            await this.loadPolicies();
            await this.loadEscalationPolicies();
            await this.loadAuthorityMatrix();
            await this.setupDefaultPolicies();
            logger.info('Decision Engine initialized successfully', {
                policyCount: this.policies.size,
                escalationPolicyCount: this.escalationPolicies.size,
                authorityMatrixCount: this.authorityMatrix.size,
            });
        }
        catch (error) {
            logger.error('Failed to initialize Decision Engine', { error: error.message });
            throw error;
        }
    }
    async makeDecision(request) {
        const startTime = Date.now();
        try {
            logger.debug('Processing decision request', {
                requestId: request.id,
                type: request.type,
                strategy: request.strategy,
                optionCount: request.options.length,
            });
            this.pendingDecisions.set(request.id, request);
            const applicablePolicies = this.findApplicablePolicies(request);
            const validOptions = this.applyConstraints(request.options, request.constraints);
            if (validOptions.length === 0) {
                throw new Error('No valid options after applying constraints');
            }
            const result = await this.executeDecisionStrategy(request, validOptions, applicablePolicies);
            result.processingTime = Date.now() - startTime;
            await this.auditDecision(request, result);
            this.updateMetrics(request, result);
            this.pendingDecisions.delete(request.id);
            this.emit('decision:made', { request, result });
            logger.info('Decision made', {
                requestId: request.id,
                selectedOptionId: result.selectedOption.id,
                score: result.score,
                confidence: result.confidence,
                processingTime: result.processingTime,
            });
            return result;
        }
        catch (error) {
            logger.error('Decision making failed', {
                requestId: request.id,
                error: error.message,
                processingTime: Date.now() - startTime,
            });
            if (this.shouldEscalate(request, error)) {
                await this.escalateDecision(request, error);
            }
            throw error;
        }
    }
    async executeDecisionStrategy(request, options, policies) {
        switch (request.strategy) {
            case decision_1.DecisionStrategy.ROUND_ROBIN:
                return this.roundRobinStrategy(request, options);
            case decision_1.DecisionStrategy.LEAST_LOADED:
                return this.leastLoadedStrategy(request, options);
            case decision_1.DecisionStrategy.WEIGHTED_ROUND_ROBIN:
                return this.weightedRoundRobinStrategy(request, options);
            case decision_1.DecisionStrategy.CAPABILITY_BASED:
                return this.capabilityBasedStrategy(request, options);
            case decision_1.DecisionStrategy.PERFORMANCE_BASED:
                return this.performanceBasedStrategy(request, options);
            case decision_1.DecisionStrategy.COST_OPTIMIZED:
                return this.costOptimizedStrategy(request, options);
            case decision_1.DecisionStrategy.CUSTOM:
                return this.customStrategy(request, options, policies);
            default:
                return this.multiCriteriaStrategy(request, options);
        }
    }
    async multiCriteriaStrategy(request, options) {
        const scores = new Map();
        for (const option of options) {
            let totalScore = 0;
            const reasoning = [];
            for (const criterion of request.criteria) {
                const value = this.extractCriterionValue(option, criterion);
                const normalizedScore = this.normalizeCriterionScore(value, criterion, options);
                const weightedScore = normalizedScore * criterion.weight;
                totalScore += weightedScore;
                reasoning.push({
                    criterion: criterion.name,
                    weight: criterion.weight,
                    score: normalizedScore,
                    explanation: `${criterion.name}: ${value} -> ${normalizedScore.toFixed(2)} (weighted: ${weightedScore.toFixed(2)})`,
                    evidence: { value, normalizedScore, weightedScore },
                });
            }
            scores.set(option.id, { score: totalScore, reasoning });
        }
        const bestEntry = Array.from(scores.entries())
            .reduce((best, current) => current[1].score > best[1].score ? current : best);
        const [bestOptionId, { score, reasoning }] = bestEntry;
        const selectedOption = options.find(opt => opt.id === bestOptionId);
        const allScores = Array.from(scores.values()).map(s => s.score);
        const confidence = this.calculateConfidence(score, allScores);
        const alternatives = Array.from(scores.entries())
            .filter(([id]) => id !== bestOptionId)
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, 3)
            .map(([id, data]) => ({
            option: options.find(opt => opt.id === id),
            score: data.score,
            reason: `Score: ${data.score.toFixed(2)}`,
        }));
        return {
            id: (0, uuid_1.v4)(),
            requestId: request.id,
            selectedOption,
            score,
            confidence,
            reasoning,
            alternatives,
            processedAt: new Date(),
            processingTime: 0,
            metadata: {
                strategy: 'multi_criteria',
                totalOptions: options.length,
            },
        };
    }
    async resolveConflict(type, conflictingItems, strategy = 'priority_based') {
        const conflictId = (0, uuid_1.v4)();
        const startTime = Date.now();
        try {
            logger.info('Resolving conflict', {
                conflictId,
                type,
                itemCount: conflictingItems.length,
                strategy,
            });
            let resolution = {};
            switch (strategy) {
                case 'first_come_first_serve':
                    resolution = this.resolveByTimestamp(conflictingItems);
                    break;
                case 'priority_based':
                    resolution = this.resolveByPriority(conflictingItems);
                    break;
                case 'negotiation':
                    resolution = await this.resolveByNegotiation(conflictingItems);
                    break;
                case 'resource_sharing':
                    resolution = await this.resolveByResourceSharing(conflictingItems);
                    break;
                case 'escalation':
                    resolution = await this.resolveByEscalation(conflictingItems);
                    break;
                default:
                    throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
            }
            const conflictResolution = {
                id: conflictId,
                type: type,
                conflictingItems,
                resolutionStrategy: strategy,
                resolution,
                resolvedAt: new Date(),
                processingTime: Date.now() - startTime,
                metadata: {},
            };
            this.conflictResolutions.set(conflictId, conflictResolution);
            this.emit('conflict:resolved', { conflictId, resolution: conflictResolution });
            logger.info('Conflict resolved', {
                conflictId,
                strategy,
                processingTime: conflictResolution.processingTime,
            });
            return conflictResolution;
        }
        catch (error) {
            logger.error('Conflict resolution failed', {
                conflictId,
                type,
                strategy,
                error: error.message,
            });
            throw error;
        }
    }
    async createPolicy(policy) {
        this.validatePolicy(policy);
        this.policies.set(policy.id, policy);
        this.emit('policy:created', { policyId: policy.id, policy });
        logger.info('Decision policy created', {
            policyId: policy.id,
            name: policy.name,
            type: policy.type,
            priority: policy.priority,
        });
        return policy.id;
    }
    async updatePolicy(policyId, updates) {
        const policy = this.policies.get(policyId);
        if (!policy) {
            throw new Error(`Policy ${policyId} not found`);
        }
        const updatedPolicy = { ...policy, ...updates, updatedAt: new Date() };
        this.validatePolicy(updatedPolicy);
        this.policies.set(policyId, updatedPolicy);
        this.emit('policy:updated', { policyId, oldPolicy: policy, newPolicy: updatedPolicy });
        logger.info('Decision policy updated', { policyId, updates: Object.keys(updates) });
    }
    async deletePolicy(policyId) {
        const policy = this.policies.get(policyId);
        if (!policy) {
            throw new Error(`Policy ${policyId} not found`);
        }
        this.policies.delete(policyId);
        this.emit('policy:deleted', { policyId, policy });
        logger.info('Decision policy deleted', { policyId });
    }
    async escalateDecision(request, error) {
        const escalationId = (0, uuid_1.v4)();
        logger.warn('Escalating decision', {
            escalationId,
            requestId: request.id,
            error: error.message,
        });
        const escalationPolicy = this.findEscalationPolicy(request);
        if (escalationPolicy) {
            await this.executeEscalation(escalationId, escalationPolicy, request, error);
        }
        else {
            await this.notifyHumanOperator(escalationId, request, error);
        }
        this.emit('decision:escalated', {
            escalationId,
            requestId: request.id,
            error: error.message,
        });
    }
    async checkAuthority(agentType, domain, level, context = {}) {
        const authority = this.authorityMatrix.get(agentType);
        if (!authority) {
            return false;
        }
        const directAuthority = authority.authorities.find(auth => auth.domain === domain && this.hasRequiredLevel(auth.level, level));
        if (directAuthority) {
            return this.evaluateAuthorityConstraints(directAuthority.constraints, context);
        }
        for (const delegation of authority.delegations) {
            if (delegation.domain === domain &&
                this.hasRequiredLevel(delegation.level, level) &&
                this.evaluateDelegationConditions(delegation.conditions, context)) {
                return true;
            }
        }
        return false;
    }
    extractCriterionValue(option, criterion) {
        const value = lodash_1.default.get(option.attributes, criterion.name);
        if (typeof value === 'number') {
            return value;
        }
        else if (typeof value === 'boolean') {
            return value ? 1 : 0;
        }
        else if (typeof value === 'string') {
            return this.categoricalToNumeric(value, criterion);
        }
        return 0;
    }
    normalizeCriterionScore(value, criterion, allOptions) {
        const allValues = allOptions.map(opt => this.extractCriterionValue(opt, criterion));
        const min = Math.min(...allValues);
        const max = Math.max(...allValues);
        if (min === max)
            return 1;
        let normalized = (value - min) / (max - min);
        if (criterion.direction === 'minimize') {
            normalized = 1 - normalized;
        }
        return normalized;
    }
    calculateConfidence(bestScore, allScores) {
        if (allScores.length <= 1)
            return 1;
        const sortedScores = allScores.sort((a, b) => b - a);
        const bestScore2 = sortedScores[0];
        const secondBest = sortedScores[1];
        const gap = bestScore2 - secondBest;
        const maxPossibleGap = bestScore2;
        return Math.min(gap / maxPossibleGap, 1);
    }
    findApplicablePolicies(request) {
        return Array.from(this.policies.values())
            .filter(policy => policy.enabled &&
            policy.type === request.type &&
            this.evaluatePolicyConditions(policy, request))
            .sort((a, b) => b.priority - a.priority);
    }
    applyConstraints(options, constraints) {
        return options.filter(option => constraints.every(constraint => this.evaluateConstraint(option, constraint)));
    }
    evaluateConstraint(option, constraint) {
        const value = lodash_1.default.get(option.attributes, constraint.field);
        switch (constraint.operator) {
            case 'equals':
                return value === constraint.value;
            case 'not_equals':
                return value !== constraint.value;
            case 'greater_than':
                return value > constraint.value;
            case 'less_than':
                return value < constraint.value;
            case 'in':
                return Array.isArray(constraint.value) && constraint.value.includes(value);
            case 'not_in':
                return Array.isArray(constraint.value) && !constraint.value.includes(value);
            case 'exists':
                return value !== undefined && value !== null;
            default:
                return false;
        }
    }
    async auditDecision(request, result) {
        if (!config_1.config.decisions.auditEnabled)
            return;
        const audit = {
            id: (0, uuid_1.v4)(),
            requestId: request.id,
            decisionId: result.id,
            action: 'created',
            newState: {
                selectedOption: result.selectedOption.id,
                score: result.score,
                confidence: result.confidence,
            },
            reason: 'Decision made by engine',
            timestamp: new Date(),
            metadata: {
                strategy: request.strategy,
                criteriaCount: request.criteria.length,
                processingTime: result.processingTime,
            },
        };
        const auditLog = this.auditLog.get(request.id) || [];
        auditLog.push(audit);
        this.auditLog.set(request.id, auditLog);
        this.emit('decision:audited', { audit });
    }
    initializeMetrics() {
        this.decisionMetrics = {
            totalDecisions: 0,
            averageProcessingTime: 0,
            accuracyRate: 0,
            conflictRate: 0,
            escalationRate: 0,
            strategyEffectiveness: {},
            criteriaImportance: {},
            performanceTrends: [],
        };
    }
    updateMetrics(request, result) {
        this.decisionMetrics.totalDecisions++;
        const totalTime = this.decisionMetrics.averageProcessingTime * (this.decisionMetrics.totalDecisions - 1);
        this.decisionMetrics.averageProcessingTime =
            (totalTime + result.processingTime) / this.decisionMetrics.totalDecisions;
        if (!this.decisionMetrics.strategyEffectiveness[request.strategy]) {
            this.decisionMetrics.strategyEffectiveness[request.strategy] = {
                usage: 0,
                successRate: 0,
                averageScore: 0,
            };
        }
        const strategyStats = this.decisionMetrics.strategyEffectiveness[request.strategy];
        strategyStats.usage++;
        strategyStats.averageScore =
            (strategyStats.averageScore * (strategyStats.usage - 1) + result.score) / strategyStats.usage;
        for (const reasoning of result.reasoning) {
            if (!this.decisionMetrics.criteriaImportance[reasoning.criterion]) {
                this.decisionMetrics.criteriaImportance[reasoning.criterion] = 0;
            }
            this.decisionMetrics.criteriaImportance[reasoning.criterion] += reasoning.weight;
        }
    }
    async roundRobinStrategy(request, options) {
        const selected = options.reduce((best, current) => (current.metadata?.usageCount || 0) < (best.metadata?.usageCount || 0) ? current : best);
        return this.createSimpleResult(request, selected, options, 'round_robin');
    }
    async leastLoadedStrategy(request, options) {
        const selected = options.reduce((best, current) => (current.attributes?.load || 0) < (best.attributes?.load || 0) ? current : best);
        return this.createSimpleResult(request, selected, options, 'least_loaded');
    }
    createSimpleResult(request, selectedOption, options, strategy) {
        const alternatives = options
            .filter(opt => opt.id !== selectedOption.id)
            .slice(0, 3)
            .map(opt => ({
            option: opt,
            score: 0.5,
            reason: `Alternative option`,
        }));
        return {
            id: (0, uuid_1.v4)(),
            requestId: request.id,
            selectedOption,
            score: 1.0,
            confidence: 0.8,
            reasoning: [{
                    criterion: 'strategy',
                    weight: 1.0,
                    score: 1.0,
                    explanation: `Selected by ${strategy} strategy`,
                    evidence: { strategy },
                }],
            alternatives,
            processedAt: new Date(),
            processingTime: 0,
            metadata: { strategy },
        };
    }
    async loadPolicies() { }
    async loadEscalationPolicies() { }
    async loadAuthorityMatrix() { }
    async setupDefaultPolicies() { }
    validatePolicy(policy) { }
    evaluatePolicyConditions(policy, request) { return true; }
    shouldEscalate(request, error) { return false; }
    findEscalationPolicy(request) { return null; }
    async executeEscalation(id, policy, request, error) { }
    async notifyHumanOperator(id, request, error) { }
    hasRequiredLevel(authLevel, requiredLevel) { return true; }
    evaluateAuthorityConstraints(constraints, context) { return true; }
    evaluateDelegationConditions(conditions, context) { return true; }
    categoricalToNumeric(value, criterion) { return 0; }
    resolveByTimestamp(items) { return { winner: items[0]?.id }; }
    resolveByPriority(items) { return { winner: items[0]?.id }; }
    async resolveByNegotiation(items) { return { compromise: {} }; }
    async resolveByResourceSharing(items) { return { allocation: {} }; }
    async resolveByEscalation(items) { return { escalatedTo: 'human' }; }
    async weightedRoundRobinStrategy(request, options) { return this.roundRobinStrategy(request, options); }
    async capabilityBasedStrategy(request, options) { return this.multiCriteriaStrategy(request, options); }
    async performanceBasedStrategy(request, options) { return this.multiCriteriaStrategy(request, options); }
    async costOptimizedStrategy(request, options) { return this.multiCriteriaStrategy(request, options); }
    async customStrategy(request, options, policies) { return this.multiCriteriaStrategy(request, options); }
    getMetrics() {
        return { ...this.decisionMetrics };
    }
    getPolicies() {
        return this.policies;
    }
    getAuditLog(requestId) {
        return this.auditLog.get(requestId) || [];
    }
}
exports.DecisionEngine = DecisionEngine;
//# sourceMappingURL=decision-engine.js.map