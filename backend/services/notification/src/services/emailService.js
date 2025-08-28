"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const mail_1 = __importDefault(require("@sendgrid/mail"));
const aws_sdk_1 = require("aws-sdk");
const client_1 = require("@prisma/client");
const handlebars_1 = __importDefault(require("handlebars"));
const mjml_1 = __importDefault(require("mjml"));
const juice_1 = __importDefault(require("juice"));
const validator_1 = __importDefault(require("validator"));
const uuid_1 = require("uuid");
const config_1 = require("@fineprintai/shared-config");
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('email-service');
const prisma = new client_1.PrismaClient();
class EmailService {
    sendgrid;
    ses;
    provider;
    initialized = false;
    constructor() {
        this.provider = config_1.config.email.provider || 'sendgrid';
        if (this.provider === 'sendgrid') {
            this.sendgrid = mail_1.default;
            this.sendgrid.setApiKey(config_1.config.email.sendgrid.apiKey);
        }
        else {
            this.ses = new aws_sdk_1.SES({
                accessKeyId: config_1.config.email.ses.accessKeyId,
                secretAccessKey: config_1.config.email.ses.secretAccessKey,
                region: config_1.config.email.ses.region,
            });
        }
        this.registerHandlebarsHelpers();
    }
    async initialize() {
        if (this.initialized)
            return;
        try {
            if (this.provider === 'sendgrid') {
                if (!config_1.config.email.sendgrid.apiKey || !config_1.config.email.sendgrid.apiKey.startsWith('SG.')) {
                    throw new Error('Invalid SendGrid API key format');
                }
            }
            else {
                await this.ses.getAccountSendingEnabled().promise();
            }
            await prisma.$connect();
            this.initialized = true;
            logger.info(`Email service initialized successfully with ${this.provider}`);
        }
        catch (error) {
            logger.error('Failed to initialize email service', { error, provider: this.provider });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            await prisma.$disconnect();
            this.initialized = false;
            logger.info('Email service shut down successfully');
        }
        catch (error) {
            logger.error('Error during email service shutdown', { error });
        }
    }
    async sendEmail(request) {
        try {
            const user = await this.getUserForEmail(request.userId);
            if (!user) {
                throw new Error(`User ${request.userId} not found`);
            }
            const isUnsubscribed = await this.checkUnsubscribeStatus(user.email);
            if (isUnsubscribed) {
                logger.warn('User has unsubscribed, skipping email', { userId: request.userId, email: user.email });
                return {
                    success: false,
                    errorCode: 'USER_UNSUBSCRIBED',
                    errorMessage: 'User has unsubscribed from emails',
                    retryable: false,
                };
            }
            if (!validator_1.default.isEmail(user.email)) {
                throw new Error(`Invalid email address: ${user.email}`);
            }
            const emailData = await this.buildEmailContent(request, user);
            let result;
            if (this.provider === 'sendgrid') {
                result = await this.sendWithSendGrid(emailData, request);
            }
            else {
                result = await this.sendWithSES(emailData, request);
            }
            if (result.success) {
                logger.info('Email sent successfully', {
                    userId: request.userId,
                    notificationId: request.notificationId,
                    deliveryId: request.deliveryId,
                    provider: this.provider,
                    messageId: result.messageId,
                });
                if (request.template?.id) {
                    await this.updateTemplateStats(request.template.id, 'sent');
                }
            }
            return result;
        }
        catch (error) {
            logger.error('Failed to send email', {
                error: error.message,
                userId: request.userId,
                notificationId: request.notificationId,
                deliveryId: request.deliveryId,
            });
            return {
                success: false,
                errorCode: 'SEND_FAILED',
                errorMessage: error.message,
                retryable: this.isRetryableError(error),
            };
        }
    }
    async sendWithSendGrid(emailData, request) {
        try {
            const sgEmailData = {
                ...emailData,
                customArgs: {
                    ...emailData.customArgs,
                    notificationId: request.notificationId,
                    deliveryId: request.deliveryId,
                    userId: request.userId,
                },
                trackingSettings: {
                    clickTracking: { enable: true },
                    openTracking: { enable: true },
                    subscriptionTracking: {
                        enable: true,
                        substitutionTag: '[unsubscribe]',
                    },
                },
            };
            const response = await this.sendgrid.send(sgEmailData);
            return {
                success: true,
                providerId: 'sendgrid',
                messageId: response[0]?.headers['x-message-id'],
                providerStatus: response[0]?.statusCode?.toString(),
            };
        }
        catch (error) {
            logger.error('SendGrid send failed', { error: error.response?.body || error.message });
            return {
                success: false,
                providerId: 'sendgrid',
                errorCode: error.code || 'SENDGRID_ERROR',
                errorMessage: error.message,
                providerStatus: error.response?.statusCode?.toString(),
                retryable: this.isSendGridRetryableError(error),
            };
        }
    }
    async sendWithSES(emailData, request) {
        try {
            const sesParams = {
                Source: `${emailData.from.name} <${emailData.from.email}>`,
                Destination: {
                    ToAddresses: [emailData.to],
                },
                Message: {
                    Subject: {
                        Data: emailData.subject,
                        Charset: 'UTF-8',
                    },
                    Body: {
                        Html: {
                            Data: emailData.html,
                            Charset: 'UTF-8',
                        },
                        ...(emailData.text && {
                            Text: {
                                Data: emailData.text,
                                Charset: 'UTF-8',
                            },
                        }),
                    },
                },
                Tags: [
                    { Name: 'NotificationId', Value: request.notificationId },
                    { Name: 'DeliveryId', Value: request.deliveryId },
                    { Name: 'UserId', Value: request.userId },
                ],
                ConfigurationSetName: config_1.config.email.ses.configurationSet,
            };
            const response = await this.ses.sendEmail(sesParams).promise();
            return {
                success: true,
                providerId: 'ses',
                messageId: response.MessageId,
                providerStatus: '200',
            };
        }
        catch (error) {
            logger.error('SES send failed', { error: error.message, code: error.code });
            return {
                success: false,
                providerId: 'ses',
                errorCode: error.code || 'SES_ERROR',
                errorMessage: error.message,
                retryable: this.isSESRetryableError(error),
            };
        }
    }
    async buildEmailContent(request, user) {
        let subject;
        let html;
        let text;
        if (request.template) {
            const template = await this.getEmailTemplate(request.template.id || request.template.name);
            if (!template) {
                throw new Error(`Email template not found: ${request.template.id || request.template.name}`);
            }
            const templateData = {
                ...request.data,
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.displayName || user.name || 'User',
                    firstName: user.firstName || user.displayName?.split(' ')[0] || 'User',
                },
                notification: {
                    id: request.notificationId,
                    unsubscribeUrl: this.generateUnsubscribeUrl(user.id, request.notificationId),
                    preferencesUrl: `${config_1.config.frontend.url}/preferences/notifications`,
                },
                company: {
                    name: 'Fine Print AI',
                    address: config_1.config.company.address,
                    supportEmail: config_1.config.company.supportEmail,
                    website: config_1.config.frontend.url,
                },
            };
            subject = this.compileHandlebarsTemplate(template.subject, templateData);
            if (template.mjmlContent) {
                const mjmlResult = (0, mjml_1.default)(template.mjmlContent, {
                    keepComments: false,
                    beautify: true,
                });
                if (mjmlResult.errors.length > 0) {
                    logger.warn('MJML compilation warnings', { errors: mjmlResult.errors });
                }
                html = this.compileHandlebarsTemplate(mjmlResult.html, templateData);
                html = (0, juice_1.default)(html);
            }
            else {
                html = this.compileHandlebarsTemplate(template.htmlContent, templateData);
                html = (0, juice_1.default)(html);
            }
            if (template.textContent) {
                text = this.compileHandlebarsTemplate(template.textContent, templateData);
            }
            else {
                text = this.htmlToText(html);
            }
        }
        else {
            subject = request.subject || 'Notification from Fine Print AI';
            html = request.content || 'You have a new notification.';
            text = this.htmlToText(html);
        }
        return {
            to: user.email,
            from: {
                email: config_1.config.email.fromEmail,
                name: config_1.config.email.fromName,
            },
            subject,
            html,
            text,
            customArgs: {
                notificationId: request.notificationId,
                deliveryId: request.deliveryId,
                userId: request.userId,
            },
        };
    }
    async getEmailTemplate(idOrName) {
        return prisma.emailTemplate.findFirst({
            where: {
                OR: [
                    { id: idOrName },
                    { name: idOrName },
                ],
                isActive: true,
            },
        });
    }
    async getUserForEmail(userId) {
        return {
            id: userId,
            email: `user-${userId}@example.com`,
            displayName: 'User',
            firstName: 'User',
        };
    }
    async checkUnsubscribeStatus(email) {
        const unsubscribe = await prisma.unsubscribeRecord.findFirst({
            where: {
                email,
                OR: [
                    { type: 'all' },
                    { type: 'transactional' },
                ],
            },
        });
        return !!unsubscribe;
    }
    compileHandlebarsTemplate(template, data) {
        try {
            const compiled = handlebars_1.default.compile(template);
            return compiled(data);
        }
        catch (error) {
            logger.error('Failed to compile Handlebars template', { error, template });
            throw new Error(`Template compilation failed: ${error.message}`);
        }
    }
    htmlToText(html) {
        return html
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }
    generateUnsubscribeUrl(userId, notificationId) {
        const token = this.generateUnsubscribeToken(userId, notificationId);
        return `${config_1.config.frontend.url}/unsubscribe?token=${token}`;
    }
    generateUnsubscribeToken(userId, notificationId) {
        const payload = `${userId}:${notificationId}:${Date.now()}`;
        const crypto = require('crypto');
        const signature = crypto
            .createHmac('sha256', config_1.config.email.unsubscribeSecret)
            .update(payload)
            .digest('hex');
        return Buffer.from(`${payload}:${signature}`).toString('base64');
    }
    registerHandlebarsHelpers() {
        handlebars_1.default.registerHelper('formatDate', (date, format = 'YYYY-MM-DD') => {
            if (!date)
                return '';
            const d = new Date(date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            switch (format) {
                case 'YYYY-MM-DD':
                    return `${year}-${month}-${day}`;
                case 'MM/DD/YYYY':
                    return `${month}/${day}/${year}`;
                case 'long':
                    return d.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                default:
                    return d.toLocaleDateString();
            }
        });
        handlebars_1.default.registerHelper('formatCurrency', (amount, currency = 'USD') => {
            if (typeof amount !== 'number')
                return '';
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency.toUpperCase(),
            }).format(amount);
        });
        handlebars_1.default.registerHelper('ifEquals', function (arg1, arg2, options) {
            return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
        });
        handlebars_1.default.registerHelper('encodeUrl', (str) => {
            return encodeURIComponent(str || '');
        });
        handlebars_1.default.registerHelper('truncate', (str, length = 100) => {
            if (!str || str.length <= length)
                return str;
            return str.substring(0, length) + '...';
        });
    }
    async updateTemplateStats(templateId, metric) {
        try {
            const updateData = {};
            updateData[`${metric}Count`] = { increment: 1 };
            await prisma.emailTemplate.update({
                where: { id: templateId },
                data: updateData,
            });
        }
        catch (error) {
            logger.error('Failed to update template stats', { templateId, metric, error });
        }
    }
    isRetryableError(error) {
        const retryablePatterns = [
            'timeout',
            'connection',
            'network',
            'rate limit',
            'throttle',
            'service unavailable',
            'internal server error',
        ];
        const errorMessage = (error.message || '').toLowerCase();
        return retryablePatterns.some(pattern => errorMessage.includes(pattern));
    }
    isSendGridRetryableError(error) {
        const retryableStatusCodes = [429, 500, 502, 503, 504];
        const statusCode = error.response?.statusCode || error.statusCode;
        return retryableStatusCodes.includes(statusCode) ||
            this.isRetryableError(error);
    }
    isSESRetryableError(error) {
        const retryableCodes = [
            'Throttling',
            'ServiceUnavailable',
            'InternalFailure',
            'RequestTimeout',
        ];
        return retryableCodes.includes(error.code) ||
            this.isRetryableError(error);
    }
    async createEmailTemplate(templateData) {
        try {
            if (templateData.mjmlContent) {
                const mjmlResult = (0, mjml_1.default)(templateData.mjmlContent);
                if (mjmlResult.errors.length > 0) {
                    throw new Error(`MJML validation failed: ${mjmlResult.errors.map(e => e.message).join(', ')}`);
                }
                templateData.htmlContent = mjmlResult.html;
            }
            const template = await prisma.emailTemplate.create({
                data: {
                    id: (0, uuid_1.v4)(),
                    name: templateData.name,
                    subject: templateData.subject,
                    mjmlContent: templateData.mjmlContent || '',
                    htmlContent: templateData.htmlContent || '',
                    textContent: templateData.textContent,
                    variables: templateData.variables ? JSON.stringify(templateData.variables) : null,
                },
            });
            logger.info('Email template created', { templateId: template.id, name: template.name });
            return template;
        }
        catch (error) {
            logger.error('Failed to create email template', { error, templateData });
            throw error;
        }
    }
    async updateEmailTemplate(templateId, updates) {
        try {
            if (updates.mjmlContent) {
                const mjmlResult = (0, mjml_1.default)(updates.mjmlContent);
                if (mjmlResult.errors.length > 0) {
                    throw new Error(`MJML validation failed: ${mjmlResult.errors.map(e => e.message).join(', ')}`);
                }
                updates.htmlContent = mjmlResult.html;
            }
            const template = await prisma.emailTemplate.update({
                where: { id: templateId },
                data: {
                    ...updates,
                    variables: updates.variables ? JSON.stringify(updates.variables) : undefined,
                },
            });
            logger.info('Email template updated', { templateId, name: template.name });
            return template;
        }
        catch (error) {
            logger.error('Failed to update email template', { error, templateId, updates });
            throw error;
        }
    }
    async getEmailTemplates(options = {}) {
        const { limit = 50, offset = 0, active } = options;
        const whereClause = {};
        if (active !== undefined) {
            whereClause.isActive = active;
        }
        return prisma.emailTemplate.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        });
    }
    async processUnsubscribe(token) {
        try {
            const decoded = Buffer.from(token, 'base64').toString('utf-8');
            const [payload, signature] = decoded.split(':').slice(-2);
            const [userId, notificationId, timestamp] = payload.split(':');
            const crypto = require('crypto');
            const expectedSignature = crypto
                .createHmac('sha256', config_1.config.email.unsubscribeSecret)
                .update(`${userId}:${notificationId}:${timestamp}`)
                .digest('hex');
            if (signature !== expectedSignature) {
                throw new Error('Invalid unsubscribe token');
            }
            const tokenAge = Date.now() - parseInt(timestamp);
            if (tokenAge > 7 * 24 * 60 * 60 * 1000) {
                throw new Error('Unsubscribe token has expired');
            }
            const user = await this.getUserForEmail(userId);
            if (!user) {
                throw new Error('User not found');
            }
            await prisma.unsubscribeRecord.create({
                data: {
                    id: (0, uuid_1.v4)(),
                    userId,
                    email: user.email,
                    type: 'all',
                    reason: 'user_request',
                    source: 'email_link',
                },
            });
            logger.info('User unsubscribed', { userId, email: user.email });
            return {
                success: true,
                message: 'Successfully unsubscribed from all emails',
            };
        }
        catch (error) {
            logger.error('Failed to process unsubscribe', { error, token });
            return {
                success: false,
                message: error.message || 'Failed to process unsubscribe request',
            };
        }
    }
    async handleSendGridWebhook(events) {
        for (const event of events) {
            try {
                await this.processEmailEvent({
                    provider: 'sendgrid',
                    messageId: event.sg_message_id,
                    event: event.event,
                    timestamp: new Date(event.timestamp * 1000),
                    email: event.email,
                    notificationId: event.notificationId,
                    deliveryId: event.deliveryId,
                    userId: event.userId,
                    reason: event.reason,
                    url: event.url,
                });
            }
            catch (error) {
                logger.error('Failed to process SendGrid webhook event', { error, event });
            }
        }
    }
    async handleSESWebhook(message) {
        try {
            const eventType = message.eventType || message.notificationType;
            await this.processEmailEvent({
                provider: 'ses',
                messageId: message.mail?.messageId,
                event: eventType.toLowerCase(),
                timestamp: new Date(message.mail?.timestamp || Date.now()),
                email: message.mail?.destination?.[0],
                reason: message.bounce?.bounceType || message.complaint?.complaintFeedbackType,
                url: message.click?.link,
            });
        }
        catch (error) {
            logger.error('Failed to process SES webhook event', { error, message });
        }
    }
    async processEmailEvent(event) {
        try {
            let delivery;
            if (event.deliveryId) {
                delivery = await prisma.notificationDelivery.findUnique({
                    where: { id: event.deliveryId },
                });
            }
            else if (event.messageId) {
                delivery = await prisma.notificationDelivery.findFirst({
                    where: { providerId: event.messageId },
                });
            }
            if (!delivery) {
                logger.warn('Delivery record not found for email event', event);
                return;
            }
            const updateData = {
                providerStatus: event.event,
            };
            switch (event.event) {
                case 'delivered':
                    updateData.status = 'delivered';
                    updateData.deliveredAt = event.timestamp;
                    break;
                case 'open':
                case 'opened':
                    updateData.status = 'opened';
                    updateData.openedAt = event.timestamp;
                    break;
                case 'click':
                case 'clicked':
                    updateData.status = 'clicked';
                    updateData.clickedAt = event.timestamp;
                    break;
                case 'bounce':
                case 'bounced':
                    updateData.status = 'bounced';
                    updateData.errorMessage = event.reason;
                    updateData.failedAt = event.timestamp;
                    break;
                case 'dropped':
                case 'blocked':
                    updateData.status = 'failed';
                    updateData.errorMessage = event.reason;
                    updateData.failedAt = event.timestamp;
                    break;
            }
            await prisma.notificationDelivery.update({
                where: { id: delivery.id },
                data: updateData,
            });
            logger.info('Email event processed', {
                deliveryId: delivery.id,
                event: event.event,
                status: updateData.status,
            });
        }
        catch (error) {
            logger.error('Failed to process email event', { error, event });
        }
    }
}
exports.emailService = new EmailService();
//# sourceMappingURL=emailService.js.map