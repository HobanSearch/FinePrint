"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.templateService = void 0;
const client_1 = require("@prisma/client");
const uuid_1 = require("uuid");
const mjml_1 = __importDefault(require("mjml"));
const handlebars_1 = __importDefault(require("handlebars"));
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('template-service');
const prisma = new client_1.PrismaClient();
class TemplateService {
    initialized = false;
    compiledTemplates = new Map();
    async initialize() {
        if (this.initialized)
            return;
        try {
            await prisma.$connect();
            await this.precompilePopularTemplates();
            this.registerHandlebarsHelpers();
            this.initialized = true;
            logger.info('Template service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize template service', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            await prisma.$disconnect();
            this.compiledTemplates.clear();
            this.initialized = false;
            logger.info('Template service shut down successfully');
        }
        catch (error) {
            logger.error('Error during template service shutdown', { error });
        }
    }
    async createTemplate(data) {
        try {
            await this.validateTemplate(data);
            let htmlContent = data.htmlContent;
            if (data.type === 'email' && this.isMJML(data.content)) {
                const mjmlResult = (0, mjml_1.default)(data.content, {
                    keepComments: false,
                    beautify: true,
                });
                if (mjmlResult.errors.length > 0) {
                    throw new Error(`MJML compilation failed: ${mjmlResult.errors.map(e => e.message).join(', ')}`);
                }
                htmlContent = mjmlResult.html;
            }
            const template = await prisma.notificationTemplate.create({
                data: {
                    id: (0, uuid_1.v4)(),
                    name: data.name,
                    type: data.type,
                    category: data.category,
                    subject: data.subject,
                    content: data.content,
                    htmlContent,
                    variables: data.variables ? JSON.stringify(data.variables) : null,
                    isActive: data.isActive ?? true,
                    version: 1,
                },
            });
            this.cacheCompiledTemplate(template.id, data.content);
            logger.info('Template created', {
                templateId: template.id,
                name: data.name,
                type: data.type,
                category: data.category,
            });
            return this.mapTemplate(template);
        }
        catch (error) {
            logger.error('Failed to create template', { error, data });
            throw error;
        }
    }
    async updateTemplate(templateId, updates) {
        try {
            const existing = await prisma.notificationTemplate.findUnique({
                where: { id: templateId },
            });
            if (!existing) {
                throw new Error(`Template ${templateId} not found`);
            }
            if (updates.content) {
                await this.validateTemplate({
                    ...existing,
                    ...updates,
                    type: existing.type,
                    category: existing.category,
                });
            }
            let htmlContent = updates.htmlContent;
            if (updates.content && existing.type === 'email' && this.isMJML(updates.content)) {
                const mjmlResult = (0, mjml_1.default)(updates.content, {
                    keepComments: false,
                    beautify: true,
                });
                if (mjmlResult.errors.length > 0) {
                    throw new Error(`MJML compilation failed: ${mjmlResult.errors.map(e => e.message).join(', ')}`);
                }
                htmlContent = mjmlResult.html;
            }
            const updateData = {
                ...updates,
                htmlContent,
                variables: updates.variables ? JSON.stringify(updates.variables) : undefined,
                version: { increment: 1 },
                updatedAt: new Date(),
            };
            const template = await prisma.notificationTemplate.update({
                where: { id: templateId },
                data: updateData,
            });
            if (updates.content) {
                this.cacheCompiledTemplate(template.id, updates.content);
            }
            logger.info('Template updated', {
                templateId,
                updates: Object.keys(updates),
                version: template.version,
            });
            return this.mapTemplate(template);
        }
        catch (error) {
            logger.error('Failed to update template', { error, templateId, updates });
            throw error;
        }
    }
    async getTemplate(templateId) {
        try {
            const template = await prisma.notificationTemplate.findUnique({
                where: { id: templateId },
            });
            return template ? this.mapTemplate(template) : null;
        }
        catch (error) {
            logger.error('Failed to get template', { error, templateId });
            throw error;
        }
    }
    async getTemplateByName(name) {
        try {
            const template = await prisma.notificationTemplate.findFirst({
                where: { name, isActive: true },
                orderBy: { version: 'desc' },
            });
            return template ? this.mapTemplate(template) : null;
        }
        catch (error) {
            logger.error('Failed to get template by name', { error, name });
            throw error;
        }
    }
    async listTemplates(options = {}) {
        try {
            const { type, category, isActive, limit = 50, offset = 0, } = options;
            const whereClause = {};
            if (type)
                whereClause.type = type;
            if (category)
                whereClause.category = category;
            if (isActive !== undefined)
                whereClause.isActive = isActive;
            const [templates, total] = await Promise.all([
                prisma.notificationTemplate.findMany({
                    where: whereClause,
                    orderBy: { createdAt: 'desc' },
                    take: limit,
                    skip: offset,
                }),
                prisma.notificationTemplate.count({ where: whereClause }),
            ]);
            return {
                templates: templates.map(t => this.mapTemplate(t)),
                total,
            };
        }
        catch (error) {
            logger.error('Failed to list templates', { error, options });
            throw error;
        }
    }
    async deleteTemplate(templateId) {
        try {
            const inUse = await prisma.notification.findFirst({
                where: { templateId },
                select: { id: true },
            });
            if (inUse) {
                await prisma.notificationTemplate.update({
                    where: { id: templateId },
                    data: { isActive: false },
                });
                logger.info('Template marked as inactive (in use)', { templateId });
            }
            else {
                await prisma.notificationTemplate.delete({
                    where: { id: templateId },
                });
                logger.info('Template deleted', { templateId });
            }
            this.compiledTemplates.delete(templateId);
        }
        catch (error) {
            logger.error('Failed to delete template', { error, templateId });
            throw error;
        }
    }
    async renderTemplate(templateId, data) {
        try {
            const template = await this.getTemplate(templateId);
            if (!template) {
                throw new Error(`Template ${templateId} not found`);
            }
            let compiledTemplate = this.compiledTemplates.get(templateId);
            if (!compiledTemplate) {
                compiledTemplate = handlebars_1.default.compile(template.content);
                this.compiledTemplates.set(templateId, compiledTemplate);
            }
            const renderedContent = compiledTemplate(data);
            let renderedSubject;
            if (template.subject) {
                const subjectTemplate = handlebars_1.default.compile(template.subject);
                renderedSubject = subjectTemplate(data);
            }
            let renderedHtmlContent;
            if (template.htmlContent) {
                const htmlTemplate = handlebars_1.default.compile(template.htmlContent);
                renderedHtmlContent = htmlTemplate(data);
            }
            await this.updateTemplateStats(templateId, 'rendered');
            return {
                subject: renderedSubject,
                content: renderedContent,
                htmlContent: renderedHtmlContent,
            };
        }
        catch (error) {
            logger.error('Failed to render template', { error, templateId, data });
            throw error;
        }
    }
    async testTemplate(templateId, testData) {
        try {
            const result = await this.renderTemplate(templateId, testData);
            return { success: true, result };
        }
        catch (error) {
            logger.error('Template test failed', { error, templateId, testData });
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async cloneTemplate(templateId, newName) {
        try {
            const original = await this.getTemplate(templateId);
            if (!original) {
                throw new Error(`Template ${templateId} not found`);
            }
            const cloned = await this.createTemplate({
                name: newName,
                type: original.type,
                category: original.category,
                subject: original.subject,
                content: original.content,
                htmlContent: original.htmlContent,
                variables: original.variables,
                isActive: false,
            });
            logger.info('Template cloned', {
                originalId: templateId,
                clonedId: cloned.id,
                newName,
            });
            return cloned;
        }
        catch (error) {
            logger.error('Failed to clone template', { error, templateId, newName });
            throw error;
        }
    }
    async getTemplateVariables(templateId) {
        try {
            const template = await this.getTemplate(templateId);
            return template?.variables || null;
        }
        catch (error) {
            logger.error('Failed to get template variables', { error, templateId });
            throw error;
        }
    }
    async updateTemplateVariables(templateId, variables) {
        try {
            await prisma.notificationTemplate.update({
                where: { id: templateId },
                data: {
                    variables: JSON.stringify(variables),
                    updatedAt: new Date(),
                },
            });
            logger.info('Template variables updated', { templateId });
        }
        catch (error) {
            logger.error('Failed to update template variables', { error, templateId, variables });
            throw error;
        }
    }
    async getTemplateStats(templateId) {
        try {
            const template = await prisma.notificationTemplate.findUnique({
                where: { id: templateId },
                select: {
                    sentCount: true,
                    openCount: true,
                    clickCount: true,
                },
            });
            if (!template) {
                throw new Error(`Template ${templateId} not found`);
            }
            const lastNotification = await prisma.notification.findFirst({
                where: { templateId },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true },
            });
            const openRate = template.sentCount > 0
                ? (template.openCount / template.sentCount) * 100
                : 0;
            const clickRate = template.openCount > 0
                ? (template.clickCount / template.openCount) * 100
                : 0;
            return {
                sentCount: template.sentCount,
                openCount: template.openCount,
                clickCount: template.clickCount,
                openRate: Math.round(openRate * 100) / 100,
                clickRate: Math.round(clickRate * 100) / 100,
                lastUsed: lastNotification?.createdAt,
            };
        }
        catch (error) {
            logger.error('Failed to get template stats', { error, templateId });
            throw error;
        }
    }
    async validateTemplate(data) {
        const existing = await prisma.notificationTemplate.findFirst({
            where: {
                name: data.name,
                id: { not: data.id },
            },
        });
        if (existing) {
            throw new Error(`Template with name '${data.name}' already exists`);
        }
        try {
            handlebars_1.default.compile(data.content);
            if (data.subject) {
                handlebars_1.default.compile(data.subject);
            }
        }
        catch (error) {
            throw new Error(`Invalid Handlebars syntax: ${error.message}`);
        }
        if (data.type === 'email' && this.isMJML(data.content)) {
            const mjmlResult = (0, mjml_1.default)(data.content);
            if (mjmlResult.errors.length > 0) {
                throw new Error(`MJML validation failed: ${mjmlResult.errors.map(e => e.message).join(', ')}`);
            }
        }
    }
    isMJML(content) {
        return content.includes('<mjml>') || content.includes('<mj-');
    }
    mapTemplate(template) {
        return {
            id: template.id,
            name: template.name,
            type: template.type,
            category: template.category,
            subject: template.subject,
            content: template.content,
            htmlContent: template.htmlContent,
            variables: template.variables ? JSON.parse(template.variables) : undefined,
            isActive: template.isActive,
            version: template.version,
            sentCount: template.sentCount,
            openCount: template.openCount,
            clickCount: template.clickCount,
            createdAt: template.createdAt,
            updatedAt: template.updatedAt,
        };
    }
    cacheCompiledTemplate(templateId, content) {
        try {
            const compiled = handlebars_1.default.compile(content);
            this.compiledTemplates.set(templateId, compiled);
        }
        catch (error) {
            logger.warn('Failed to cache compiled template', { templateId, error });
        }
    }
    async updateTemplateStats(templateId, metric) {
        try {
            const updateData = {};
            switch (metric) {
                case 'sent':
                    updateData.sentCount = { increment: 1 };
                    break;
                case 'opened':
                    updateData.openCount = { increment: 1 };
                    break;
                case 'clicked':
                    updateData.clickCount = { increment: 1 };
                    break;
            }
            if (Object.keys(updateData).length > 0) {
                await prisma.notificationTemplate.update({
                    where: { id: templateId },
                    data: updateData,
                });
            }
        }
        catch (error) {
            logger.warn('Failed to update template stats', { templateId, metric, error });
        }
    }
    async precompilePopularTemplates() {
        try {
            const popularTemplates = await prisma.notificationTemplate.findMany({
                where: { isActive: true },
                orderBy: { sentCount: 'desc' },
                take: 20,
                select: { id: true, content: true },
            });
            for (const template of popularTemplates) {
                this.cacheCompiledTemplate(template.id, template.content);
            }
            logger.info('Precompiled popular templates', { count: popularTemplates.length });
        }
        catch (error) {
            logger.warn('Failed to precompile templates', { error });
        }
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
        handlebars_1.default.registerHelper('uppercase', (str) => {
            return (str || '').toUpperCase();
        });
        handlebars_1.default.registerHelper('lowercase', (str) => {
            return (str || '').toLowerCase();
        });
        handlebars_1.default.registerHelper('json', (obj) => {
            return JSON.stringify(obj);
        });
    }
    async bulkUpdateTemplates(templateIds, updates) {
        try {
            const result = await prisma.notificationTemplate.updateMany({
                where: { id: { in: templateIds } },
                data: {
                    ...updates,
                    variables: updates.variables ? JSON.stringify(updates.variables) : undefined,
                    updatedAt: new Date(),
                },
            });
            logger.info('Bulk template update completed', {
                count: result.count,
                templateIds: templateIds.length,
                updates: Object.keys(updates),
            });
            return result.count;
        }
        catch (error) {
            logger.error('Failed to bulk update templates', { error, templateIds, updates });
            throw error;
        }
    }
    async exportTemplates(templateIds) {
        try {
            const whereClause = templateIds ? { id: { in: templateIds } } : {};
            const templates = await prisma.notificationTemplate.findMany({
                where: whereClause,
                orderBy: { name: 'asc' },
            });
            return templates.map(t => this.mapTemplate(t));
        }
        catch (error) {
            logger.error('Failed to export templates', { error, templateIds });
            throw error;
        }
    }
}
exports.templateService = new TemplateService();
//# sourceMappingURL=templateService.js.map