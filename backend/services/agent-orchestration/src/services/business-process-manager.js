"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessProcessManager = void 0;
const events_1 = require("events");
const logger_1 = require("../utils/logger");
const logger = logger_1.Logger.child({ component: 'business-process-manager' });
class BusinessProcessManager extends events_1.EventEmitter {
    workflowEngine;
    monitoringService;
    constructor(workflowEngine, monitoringService) {
        super();
        this.workflowEngine = workflowEngine;
        this.monitoringService = monitoringService;
    }
    async initialize() {
        logger.info('Business Process Manager initialized (placeholder)');
    }
    async stop() {
        logger.info('Business Process Manager stopped (placeholder)');
    }
}
exports.BusinessProcessManager = BusinessProcessManager;
//# sourceMappingURL=business-process-manager.js.map