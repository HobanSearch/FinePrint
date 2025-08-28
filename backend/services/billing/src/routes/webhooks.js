"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const webhook_service_1 = require("../services/webhook.service");
const logger_1 = require("../utils/logger");
const router = express_1.default.Router();
router.post('/stripe', express_1.default.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['stripe-signature'];
        if (!signature) {
            logger_1.logger.warn('Missing Stripe signature header');
            return res.status(400).json({
                success: false,
                error: 'Missing Stripe signature',
            });
        }
        const result = await webhook_service_1.WebhookService.processWebhook(req.body, signature);
        logger_1.logger.info('Stripe webhook processed successfully', {
            eventType: result.eventType,
        });
        res.json({
            success: true,
            received: result.received,
            eventType: result.eventType,
        });
    }
    catch (error) {
        logger_1.logger.error('Stripe webhook processing failed', { error });
        if (error instanceof Error && error.message.includes('signature')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid webhook signature',
            });
        }
        res.status(500).json({
            success: false,
            error: 'Webhook processing failed',
        });
    }
});
router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'billing-webhooks',
        timestamp: new Date().toISOString(),
    });
});
exports.default = router;
//# sourceMappingURL=webhooks.js.map