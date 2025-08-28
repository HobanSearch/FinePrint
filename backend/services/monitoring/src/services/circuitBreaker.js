"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.circuitBreakerService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const opossum_1 = __importDefault(require("opossum"));
const events_1 = require("events");
const p_timeout_1 = __importDefault(require("p-timeout"));
const logger = (0, logger_1.createServiceLogger)('circuit-breaker-service');
class CircuitBreakerService extends events_1.EventEmitter {
    breakers = new Map();
    groups = new Map();
    initialized = false;
    statsCollectionInterval = null;
    constructor() {
        super();
    }
    async initialize() {
        if (this.initialized)
            return;
        logger.info('Initializing circuit breaker service...');
        try {
            this.startStatsCollection();
            this.initialized = true;
            logger.info('Circuit breaker service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize circuit breaker service', { error });
            throw error;
        }
    }
    createCircuitBreaker(name, action, options = {}) {
        if (this.breakers.has(name)) {
            logger.warn('Circuit breaker already exists, returning existing instance', { name });
            return this.breakers.get(name);
        }
        const defaultOptions = {
            timeout: 30000,
            errorThresholdPercentage: 50,
            resetTimeout: 60000,
            rollingCountTimeout: 10000,
            rollingCountBuckets: 10,
            volumeThreshold: 10,
            allowWarmUp: true,
            name,
            ...options,
        };
        const wrappedAction = options.timeout
            ? (...args) => (0, p_timeout_1.default)(action(...args), options.timeout, `Circuit breaker timeout: ${name}`)
            : action;
        const breaker = new opossum_1.default(wrappedAction, defaultOptions);
        this.setupBreakerEventListeners(breaker, name);
        this.breakers.set(name, breaker);
        if (options.group) {
            this.addBreakerToGroup(options.group, name, breaker);
        }
        logger.info('Created circuit breaker', {
            name,
            group: options.group,
            timeout: defaultOptions.timeout,
            errorThreshold: defaultOptions.errorThresholdPercentage,
        });
        return breaker;
    }
    async execute(name, action, options = {}) {
        let breaker = this.breakers.get(name);
        if (!breaker) {
            breaker = this.createCircuitBreaker(name, action, options);
        }
        try {
            const result = await breaker.fire(...[]);
            return result;
        }
        catch (error) {
            if (error.message?.includes('Circuit breaker is OPEN')) {
                logger.warn('Circuit breaker is open, rejecting request', { name });
            }
            else if (error.message?.includes('timeout')) {
                logger.warn('Circuit breaker timeout', { name, timeout: options.timeout });
            }
            throw error;
        }
    }
    getCircuitBreaker(name) {
        return this.breakers.get(name);
    }
    getAllCircuitBreakers() {
        return new Map(this.breakers);
    }
    getBreakerStats(name) {
        const breaker = this.breakers.get(name);
        if (!breaker)
            return undefined;
        const stats = breaker.stats;
        const totalRequests = stats.successes + stats.failures;
        const failureRate = totalRequests > 0 ? (stats.failures / totalRequests) * 100 : 0;
        return {
            name,
            state: breaker.opened ? 'OPEN' : breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
            failureCount: stats.failures,
            successCount: stats.successes,
            rejectionCount: stats.fallbacks,
            failureRate,
            averageResponseTime: stats.latencyMean,
            lastFailureTime: stats.failures > 0 ? new Date() : undefined,
            lastSuccessTime: stats.successes > 0 ? new Date() : undefined,
        };
    }
    getAllBreakerStats() {
        return Array.from(this.breakers.keys())
            .map(name => this.getBreakerStats(name))
            .filter(stats => stats !== undefined);
    }
    getGroupStats(groupName) {
        return this.groups.get(groupName);
    }
    getAllGroupStats() {
        return Array.from(this.groups.values());
    }
    openCircuitBreaker(name) {
        const breaker = this.breakers.get(name);
        if (!breaker)
            return false;
        breaker.open();
        logger.info('Manually opened circuit breaker', { name });
        return true;
    }
    closeCircuitBreaker(name) {
        const breaker = this.breakers.get(name);
        if (!breaker)
            return false;
        breaker.close();
        logger.info('Manually closed circuit breaker', { name });
        return true;
    }
    resetCircuitBreaker(name) {
        const breaker = this.breakers.get(name);
        if (!breaker)
            return false;
        breaker.clearCache();
        logger.info('Reset circuit breaker cache', { name });
        return true;
    }
    openAllBreakersInGroup(groupName) {
        const group = this.groups.get(groupName);
        if (!group)
            return 0;
        let openedCount = 0;
        for (const [name, breaker] of group.breakers) {
            breaker.open();
            openedCount++;
            logger.info('Opened circuit breaker in group', { name, group: groupName });
        }
        return openedCount;
    }
    closeAllBreakersInGroup(groupName) {
        const group = this.groups.get(groupName);
        if (!group)
            return 0;
        let closedCount = 0;
        for (const [name, breaker] of group.breakers) {
            breaker.close();
            closedCount++;
            logger.info('Closed circuit breaker in group', { name, group: groupName });
        }
        return closedCount;
    }
    removeCircuitBreaker(name) {
        const breaker = this.breakers.get(name);
        if (!breaker)
            return false;
        for (const group of this.groups.values()) {
            group.breakers.delete(name);
            this.updateGroupStats(group);
        }
        breaker.removeAllListeners();
        this.breakers.delete(name);
        logger.info('Removed circuit breaker', { name });
        return true;
    }
    setupBreakerEventListeners(breaker, name) {
        breaker.on('open', () => {
            logger.warn('Circuit breaker opened', { name });
            this.emit('breakerOpened', { name, breaker });
        });
        breaker.on('halfOpen', () => {
            logger.info('Circuit breaker half-opened', { name });
            this.emit('breakerHalfOpened', { name, breaker });
        });
        breaker.on('close', () => {
            logger.info('Circuit breaker closed', { name });
            this.emit('breakerClosed', { name, breaker });
        });
        breaker.on('success', (result, latency) => {
            logger.debug('Circuit breaker success', { name, latency });
            this.emit('breakerSuccess', { name, result, latency });
        });
        breaker.on('failure', (error, latency) => {
            logger.warn('Circuit breaker failure', {
                name,
                error: error.message,
                latency
            });
            this.emit('breakerFailure', { name, error, latency });
        });
        breaker.on('reject', () => {
            logger.warn('Circuit breaker rejected request', { name });
            this.emit('breakerRejected', { name });
        });
        breaker.on('timeout', () => {
            logger.warn('Circuit breaker timeout', { name });
            this.emit('breakerTimeout', { name });
        });
        breaker.on('fallback', (result) => {
            logger.info('Circuit breaker fallback executed', { name });
            this.emit('breakerFallback', { name, result });
        });
    }
    addBreakerToGroup(groupName, breakerName, breaker) {
        let group = this.groups.get(groupName);
        if (!group) {
            group = {
                name: groupName,
                breakers: new Map(),
                stats: {
                    totalBreakers: 0,
                    openBreakers: 0,
                    halfOpenBreakers: 0,
                    closedBreakers: 0,
                },
            };
            this.groups.set(groupName, group);
        }
        group.breakers.set(breakerName, breaker);
        this.updateGroupStats(group);
        logger.debug('Added circuit breaker to group', {
            breakerName,
            groupName,
            groupSize: group.breakers.size,
        });
    }
    updateGroupStats(group) {
        group.stats.totalBreakers = group.breakers.size;
        group.stats.openBreakers = 0;
        group.stats.halfOpenBreakers = 0;
        group.stats.closedBreakers = 0;
        for (const breaker of group.breakers.values()) {
            if (breaker.opened) {
                group.stats.openBreakers++;
            }
            else if (breaker.halfOpen) {
                group.stats.halfOpenBreakers++;
            }
            else {
                group.stats.closedBreakers++;
            }
        }
    }
    startStatsCollection() {
        this.statsCollectionInterval = setInterval(() => {
            for (const group of this.groups.values()) {
                this.updateGroupStats(group);
            }
        }, 30000);
        logger.debug('Started circuit breaker stats collection');
    }
    stopStatsCollection() {
        if (this.statsCollectionInterval) {
            clearInterval(this.statsCollectionInterval);
            this.statsCollectionInterval = null;
        }
    }
    async healthCheck() {
        if (!this.initialized) {
            throw new Error('Circuit breaker service not initialized');
        }
        const criticalBreakers = ['database', 'external-api', 'llm-service'];
        const openCriticalBreakers = criticalBreakers.filter(name => {
            const breaker = this.breakers.get(name);
            return breaker && breaker.opened;
        });
        if (openCriticalBreakers.length > 0) {
            logger.warn('Critical circuit breakers are open', {
                openBreakers: openCriticalBreakers,
            });
        }
        const allStats = this.getAllBreakerStats();
        const openBreakers = allStats.filter(s => s.state === 'OPEN');
        logger.info('Circuit breaker health check completed', {
            totalBreakers: allStats.length,
            openBreakers: openBreakers.length,
            groups: this.groups.size,
        });
    }
    getHealthStatus() {
        const allStats = this.getAllBreakerStats();
        const openBreakers = allStats.filter(s => s.state === 'OPEN');
        const halfOpenBreakers = allStats.filter(s => s.state === 'HALF_OPEN');
        const criticalBreakers = ['database', 'external-api', 'llm-service'];
        const criticalBreakersOpen = criticalBreakers.filter(name => {
            const breaker = this.breakers.get(name);
            return breaker && breaker.opened;
        });
        return {
            healthy: criticalBreakersOpen.length === 0,
            totalBreakers: allStats.length,
            openBreakers: openBreakers.length,
            halfOpenBreakers: halfOpenBreakers.length,
            groups: this.groups.size,
            criticalBreakersOpen,
        };
    }
    updateBreakerConfig(name, options) {
        const breaker = this.breakers.get(name);
        if (!breaker)
            return false;
        logger.warn('Circuit breaker config update requires recreation', {
            name,
            note: 'Consider removing and recreating the breaker'
        });
        return false;
    }
    exportConfiguration() {
        const config = {};
        for (const [name, breaker] of this.breakers) {
            config[name] = {
                name,
                options: breaker.options,
                stats: this.getBreakerStats(name),
            };
        }
        return config;
    }
    async shutdown() {
        logger.info('Shutting down circuit breaker service...');
        this.stopStatsCollection();
        for (const [name, breaker] of this.breakers) {
            breaker.removeAllListeners();
            breaker.shutdown();
            logger.debug('Shut down circuit breaker', { name });
        }
        this.breakers.clear();
        this.groups.clear();
        this.removeAllListeners();
        this.initialized = false;
        logger.info('Circuit breaker service shutdown complete');
    }
}
exports.circuitBreakerService = new CircuitBreakerService();
//# sourceMappingURL=circuitBreaker.js.map