"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DunningService = exports.DunningAttemptStatus = exports.DunningAttemptType = exports.DunningStatus = void 0;
const client_1 = require("@prisma/client");
const stripe_1 = require("../lib/stripe");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const notification_service_1 = require("./notification.service");
const luxon_1 = require("luxon");
const prisma = new client_1.PrismaClient();
var DunningStatus;
(function (DunningStatus) {
    DunningStatus["ACTIVE"] = "active";
    DunningStatus["PAUSED"] = "paused";
    DunningStatus["COMPLETED"] = "completed";
    DunningStatus["FAILED"] = "failed";
    DunningStatus["CANCELED"] = "canceled";
})(DunningStatus || (exports.DunningStatus = DunningStatus = {}));
var DunningAttemptType;
(function (DunningAttemptType) {
    DunningAttemptType["EMAIL_REMINDER"] = "email_reminder";
    DunningAttemptType["PAYMENT_RETRY"] = "payment_retry";
    DunningAttemptType["PHONE_CALL"] = "phone_call";
    DunningAttemptType["FINAL_NOTICE"] = "final_notice";
    DunningAttemptType["ACCOUNT_SUSPENSION"] = "account_suspension";
})(DunningAttemptType || (exports.DunningAttemptType = DunningAttemptType = {}));
var DunningAttemptStatus;
(function (DunningAttemptStatus) {
    DunningAttemptStatus["SCHEDULED"] = "scheduled";
    DunningAttemptStatus["PROCESSING"] = "processing";
    DunningAttemptStatus["COMPLETED"] = "completed";
    DunningAttemptStatus["FAILED"] = "failed";
    DunningAttemptStatus["SKIPPED"] = "skipped";
})(DunningAttemptStatus || (exports.DunningAttemptStatus = DunningAttemptStatus = {}));
class DunningService {
    static async startDunningProcess(userId, invoiceId, metadata) {
        try {
            const existingCampaign = await prisma.dunningCampaign.findFirst({
                where: { invoiceId },
            });
            if (existingCampaign) {
                logger_1.logger.info('Dunning campaign already exists', {
                    campaignId: existingCampaign.id,
                    invoiceId
                });
                return existingCampaign;
            }
            const campaign = await prisma.dunningCampaign.create({
                data: {
                    userId,
                    invoiceId,
                    status: DunningStatus.ACTIVE,
                    attemptCount: 0,
                    maxAttempts: config_1.BILLING_CONFIG.dunningRetryAttempts,
                    nextAttemptAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    metadata: metadata ? JSON.stringify(metadata) : undefined,
                },
            });
            await this.scheduleDunningAttempts(campaign.id);
            logger_1.logger.info('Dunning campaign started', {
                campaignId: campaign.id,
                userId,
                invoiceId,
            });
            return campaign;
        }
        catch (error) {
            logger_1.logger.error('Failed to start dunning process', { error, userId, invoiceId });
            throw error;
        }
    }
    static async scheduleDunningAttempts(campaignId) {
        try {
            const campaign = await prisma.dunningCampaign.findUnique({
                where: { id: campaignId },
            });
            if (!campaign) {
                throw new Error('Dunning campaign not found');
            }
            const scheduleOffsets = [1, 3, 7, 14, 21, 30];
            const baseDate = luxon_1.DateTime.now();
            const attempts = [
                {
                    attemptNumber: 1,
                    type: DunningAttemptType.EMAIL_REMINDER,
                    scheduledAt: baseDate.plus({ days: scheduleOffsets[0] }).toJSDate(),
                },
                {
                    attemptNumber: 2,
                    type: DunningAttemptType.PAYMENT_RETRY,
                    scheduledAt: baseDate.plus({ days: scheduleOffsets[1] }).toJSDate(),
                },
                {
                    attemptNumber: 3,
                    type: DunningAttemptType.EMAIL_REMINDER,
                    scheduledAt: baseDate.plus({ days: scheduleOffsets[2] }).toJSDate(),
                },
                {
                    attemptNumber: 4,
                    type: DunningAttemptType.PAYMENT_RETRY,
                    scheduledAt: baseDate.plus({ days: scheduleOffsets[3] }).toJSDate(),
                },
                {
                    attemptNumber: 5,
                    type: DunningAttemptType.FINAL_NOTICE,
                    scheduledAt: baseDate.plus({ days: scheduleOffsets[4] }).toJSDate(),
                },
                {
                    attemptNumber: 6,
                    type: DunningAttemptType.ACCOUNT_SUSPENSION,
                    scheduledAt: baseDate.plus({ days: scheduleOffsets[5] }).toJSDate(),
                },
            ];
            for (const attempt of attempts) {
                await prisma.dunningAttempt.create({
                    data: {
                        campaignId,
                        attemptNumber: attempt.attemptNumber,
                        type: attempt.type,
                        status: DunningAttemptStatus.SCHEDULED,
                        scheduledAt: attempt.scheduledAt,
                    },
                });
            }
            logger_1.logger.info('Dunning attempts scheduled', {
                campaignId,
                attemptCount: attempts.length,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to schedule dunning attempts', { error, campaignId });
            throw error;
        }
    }
    static async processDueDunningAttempts() {
        try {
            const dueAttempts = await prisma.dunningAttempt.findMany({
                where: {
                    status: DunningAttemptStatus.SCHEDULED,
                    scheduledAt: {
                        lte: new Date(),
                    },
                },
                include: {
                    campaign: {
                        include: {
                            user: true,
                            invoice: true,
                        },
                    },
                },
                orderBy: {
                    scheduledAt: 'asc',
                },
                take: 50,
            });
            for (const attempt of dueAttempts) {
                await this.executeDunningAttempt(attempt.id);
            }
            logger_1.logger.info('Processed due dunning attempts', { count: dueAttempts.length });
        }
        catch (error) {
            logger_1.logger.error('Failed to process due dunning attempts', { error });
        }
    }
    static async executeDunningAttempt(attemptId) {
        try {
            const attempt = await prisma.dunningAttempt.findUnique({
                where: { id: attemptId },
                include: {
                    campaign: {
                        include: {
                            user: true,
                            invoice: true,
                        },
                    },
                },
            });
            if (!attempt || !attempt.campaign) {
                logger_1.logger.warn('Dunning attempt or campaign not found', { attemptId });
                return;
            }
            await prisma.dunningAttempt.update({
                where: { id: attemptId },
                data: {
                    status: DunningAttemptStatus.PROCESSING,
                    executedAt: new Date(),
                },
            });
            try {
                switch (attempt.type) {
                    case DunningAttemptType.EMAIL_REMINDER:
                        await this.sendEmailReminder(attempt);
                        break;
                    case DunningAttemptType.PAYMENT_RETRY:
                        await this.retryPayment(attempt);
                        break;
                    case DunningAttemptType.FINAL_NOTICE:
                        await this.sendFinalNotice(attempt);
                        break;
                    case DunningAttemptType.ACCOUNT_SUSPENSION:
                        await this.suspendAccount(attempt);
                        break;
                    default:
                        logger_1.logger.warn('Unknown dunning attempt type', {
                            attemptId,
                            type: attempt.type
                        });
                        return;
                }
                await prisma.dunningAttempt.update({
                    where: { id: attemptId },
                    data: { status: DunningAttemptStatus.COMPLETED },
                });
                await prisma.dunningCampaign.update({
                    where: { id: attempt.campaignId },
                    data: {
                        attemptCount: { increment: 1 },
                        lastAttemptAt: new Date(),
                    },
                });
                logger_1.logger.info('Dunning attempt executed successfully', {
                    attemptId,
                    campaignId: attempt.campaignId,
                    type: attempt.type,
                });
            }
            catch (executionError) {
                await prisma.dunningAttempt.update({
                    where: { id: attemptId },
                    data: {
                        status: DunningAttemptStatus.FAILED,
                        errorMessage: executionError.message,
                    },
                });
                logger_1.logger.error('Dunning attempt execution failed', {
                    attemptId,
                    error: executionError,
                });
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to execute dunning attempt', { error, attemptId });
        }
    }
    static async sendEmailReminder(attempt) {
        const { campaign } = attempt;
        const user = campaign.user;
        const invoice = campaign.invoice;
        await notification_service_1.NotificationService.sendDunningReminder(user.id, {
            attemptNumber: attempt.attemptNumber,
            amount: Number(invoice.total),
            currency: invoice.currency,
            dueDate: invoice.dueDate,
            invoiceUrl: `${process.env.FRONTEND_URL}/billing/invoices/${invoice.id}`,
        });
    }
    static async retryPayment(attempt) {
        const { campaign } = attempt;
        const invoice = campaign.invoice;
        try {
            const stripeInvoice = await (0, stripe_1.retryFailedPayment)(invoice.stripeInvoiceId);
            if (stripeInvoice.status === 'paid') {
                await this.completeDunningCampaign(campaign.id, 'payment_successful');
                await notification_service_1.NotificationService.sendPaymentSuccess(campaign.userId, {
                    amount: Number(invoice.total),
                    currency: invoice.currency,
                });
            }
            else {
                await this.sendEmailReminder(attempt);
            }
        }
        catch (error) {
            await this.sendEmailReminder(attempt);
            throw error;
        }
    }
    static async sendFinalNotice(attempt) {
        const { campaign } = attempt;
        const user = campaign.user;
        const invoice = campaign.invoice;
        await notification_service_1.NotificationService.sendFinalNotice(user.id, {
            amount: Number(invoice.total),
            currency: invoice.currency,
            suspensionDate: luxon_1.DateTime.now().plus({ days: 7 }).toJSDate(),
            paymentUrl: `${process.env.FRONTEND_URL}/billing/payment/${invoice.id}`,
        });
    }
    static async suspendAccount(attempt) {
        const { campaign } = attempt;
        const user = campaign.user;
        await prisma.user.update({
            where: { id: user.id },
            data: { status: 'suspended' },
        });
        if (user.subscriptionId) {
            try {
                await stripe_1.stripe.subscriptions.cancel(user.subscriptionId, {
                    prorate: false,
                });
            }
            catch (error) {
                logger_1.logger.error('Failed to cancel subscription during suspension', {
                    userId: user.id,
                    subscriptionId: user.subscriptionId,
                    error,
                });
            }
        }
        await this.completeDunningCampaign(campaign.id, 'account_suspended');
        await notification_service_1.NotificationService.sendAccountSuspended(user.id);
        logger_1.logger.info('Account suspended for non-payment', {
            userId: user.id,
            campaignId: campaign.id,
        });
    }
    static async completeDunningCampaign(campaignId, reason) {
        await prisma.dunningCampaign.update({
            where: { id: campaignId },
            data: {
                status: DunningStatus.COMPLETED,
                completedAt: new Date(),
                metadata: JSON.stringify({ completionReason: reason }),
            },
        });
        await prisma.dunningAttempt.updateMany({
            where: {
                campaignId,
                status: DunningAttemptStatus.SCHEDULED,
            },
            data: {
                status: DunningAttemptStatus.SKIPPED,
            },
        });
        logger_1.logger.info('Dunning campaign completed', { campaignId, reason });
    }
    static async pauseDunningCampaign(campaignId) {
        await prisma.dunningCampaign.update({
            where: { id: campaignId },
            data: { status: DunningStatus.PAUSED },
        });
        logger_1.logger.info('Dunning campaign paused', { campaignId });
    }
    static async resumeDunningCampaign(campaignId) {
        await prisma.dunningCampaign.update({
            where: { id: campaignId },
            data: { status: DunningStatus.ACTIVE },
        });
        logger_1.logger.info('Dunning campaign resumed', { campaignId });
    }
    static async cancelDunningCampaign(campaignId, reason) {
        await prisma.dunningCampaign.update({
            where: { id: campaignId },
            data: {
                status: DunningStatus.CANCELED,
                completedAt: new Date(),
                metadata: JSON.stringify({ cancellationReason: reason }),
            },
        });
        await prisma.dunningAttempt.updateMany({
            where: {
                campaignId,
                status: DunningAttemptStatus.SCHEDULED,
            },
            data: {
                status: DunningAttemptStatus.SKIPPED,
            },
        });
        logger_1.logger.info('Dunning campaign canceled', { campaignId, reason });
    }
    static async getDunningAnalytics(startDate, endDate) {
        try {
            const campaigns = await prisma.dunningCampaign.findMany({
                where: {
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                include: {
                    attempts: true,
                },
            });
            const totalCampaigns = campaigns.length;
            const successfulRecoveries = campaigns.filter(c => c.status === DunningStatus.COMPLETED &&
                JSON.parse(c.metadata || '{}').completionReason === 'payment_successful').length;
            const suspendedAccounts = campaigns.filter(c => c.status === DunningStatus.COMPLETED &&
                JSON.parse(c.metadata || '{}').completionReason === 'account_suspended').length;
            const recoveryRate = totalCampaigns > 0 ? (successfulRecoveries / totalCampaigns) * 100 : 0;
            const recoveredCampaigns = campaigns.filter(c => c.status === DunningStatus.COMPLETED &&
                JSON.parse(c.metadata || '{}').completionReason === 'payment_successful');
            const averageRecoveryTime = recoveredCampaigns.length > 0
                ? recoveredCampaigns.reduce((sum, c) => {
                    const recoveryTime = c.completedAt.getTime() - c.createdAt.getTime();
                    return sum + recoveryTime;
                }, 0) / recoveredCampaigns.length / (1000 * 60 * 60 * 24)
                : 0;
            const campaignsByStatus = campaigns.reduce((acc, c) => {
                acc[c.status] = (acc[c.status] || 0) + 1;
                return acc;
            }, {});
            return {
                totalCampaigns,
                successfulRecoveries,
                suspendedAccounts,
                recoveryRate,
                averageRecoveryTime,
                campaignsByStatus,
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get dunning analytics', { error, startDate, endDate });
            throw error;
        }
    }
    static async getUserDunningCampaigns(userId) {
        try {
            const campaigns = await prisma.dunningCampaign.findMany({
                where: {
                    userId,
                    status: { in: [DunningStatus.ACTIVE, DunningStatus.PAUSED] },
                },
                include: {
                    attempts: {
                        orderBy: { attemptNumber: 'asc' },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
            return campaigns;
        }
        catch (error) {
            logger_1.logger.error('Failed to get user dunning campaigns', { error, userId });
            throw error;
        }
    }
}
exports.DunningService = DunningService;
exports.default = DunningService;
//# sourceMappingURL=dunning.service.js.map