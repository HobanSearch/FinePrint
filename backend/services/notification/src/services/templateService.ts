import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import mjml2html from 'mjml';
import Handlebars from 'handlebars';

import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('template-service');
const prisma = new PrismaClient();

export interface TemplateCreateRequest {
  name: string;
  type: 'email' | 'push' | 'webhook' | 'in_app';
  category: 'transactional' | 'marketing' | 'system';
  subject?: string;
  content: string;
  htmlContent?: string;
  variables?: Record<string, any>;
  isActive?: boolean;
}

export interface TemplateUpdateRequest {
  name?: string;
  subject?: string;
  content?: string;
  htmlContent?: string;
  variables?: Record<string, any>;
  isActive?: boolean;
}

export interface Template {
  id: string;
  name: string;
  type: string;
  category: string;
  subject?: string;
  content: string;
  htmlContent?: string;
  variables?: Record<string, any>;
  isActive: boolean;
  version: number;
  sentCount: number;
  openCount: number;
  clickCount: number;
  createdAt: Date;
  updatedAt: Date;
}

class TemplateService {
  private initialized = false;
  private compiledTemplates = new Map<string, HandlebarsTemplateDelegate>();

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Test database connection
      await prisma.$connect();

      // Load and compile frequently used templates
      await this.precompilePopularTemplates();

      // Register custom Handlebars helpers
      this.registerHandlebarsHelpers();

      this.initialized = true;
      logger.info('Template service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize template service', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      await prisma.$disconnect();
      this.compiledTemplates.clear();
      this.initialized = false;
      logger.info('Template service shut down successfully');
    } catch (error) {
      logger.error('Error during template service shutdown', { error });
    }
  }

  // Create new template
  public async createTemplate(data: TemplateCreateRequest): Promise<Template> {
    try {
      // Validate template content
      await this.validateTemplate(data);

      // Compile MJML if it's an email template
      let htmlContent = data.htmlContent;
      if (data.type === 'email' && this.isMJML(data.content)) {
        const mjmlResult = mjml2html(data.content, {
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
          id: uuidv4(),
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

      // Cache compiled template
      this.cacheCompiledTemplate(template.id, data.content);

      logger.info('Template created', {
        templateId: template.id,
        name: data.name,
        type: data.type,
        category: data.category,
      });

      return this.mapTemplate(template);
    } catch (error) {
      logger.error('Failed to create template', { error, data });
      throw error;
    }
  }

  // Update existing template
  public async updateTemplate(templateId: string, updates: TemplateUpdateRequest): Promise<Template> {
    try {
      // Get existing template
      const existing = await prisma.notificationTemplate.findUnique({
        where: { id: templateId },
      });

      if (!existing) {
        throw new Error(`Template ${templateId} not found`);
      }

      // Validate updates
      if (updates.content) {
        await this.validateTemplate({
          ...existing,
          ...updates,
          type: existing.type as any,
          category: existing.category as any,
        });
      }

      // Compile MJML if needed
      let htmlContent = updates.htmlContent;
      if (updates.content && existing.type === 'email' && this.isMJML(updates.content)) {
        const mjmlResult = mjml2html(updates.content, {
          keepComments: false,
          beautify: true,
        });
        
        if (mjmlResult.errors.length > 0) {
          throw new Error(`MJML compilation failed: ${mjmlResult.errors.map(e => e.message).join(', ')}`);
        }
        
        htmlContent = mjmlResult.html;
      }

      const updateData: any = {
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

      // Update cached template
      if (updates.content) {
        this.cacheCompiledTemplate(template.id, updates.content);
      }

      logger.info('Template updated', {
        templateId,
        updates: Object.keys(updates),
        version: template.version,
      });

      return this.mapTemplate(template);
    } catch (error) {
      logger.error('Failed to update template', { error, templateId, updates });
      throw error;
    }
  }

  // Get template by ID
  public async getTemplate(templateId: string): Promise<Template | null> {
    try {
      const template = await prisma.notificationTemplate.findUnique({
        where: { id: templateId },
      });

      return template ? this.mapTemplate(template) : null;
    } catch (error) {
      logger.error('Failed to get template', { error, templateId });
      throw error;
    }
  }

  // Get template by name
  public async getTemplateByName(name: string): Promise<Template | null> {
    try {
      const template = await prisma.notificationTemplate.findFirst({
        where: { name, isActive: true },
        orderBy: { version: 'desc' },
      });

      return template ? this.mapTemplate(template) : null;
    } catch (error) {
      logger.error('Failed to get template by name', { error, name });
      throw error;
    }
  }

  // List templates
  public async listTemplates(options: {
    type?: string;
    category?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ templates: Template[]; total: number }> {
    try {
      const {
        type,
        category,
        isActive,
        limit = 50,
        offset = 0,
      } = options;

      const whereClause: any = {};
      if (type) whereClause.type = type;
      if (category) whereClause.category = category;
      if (isActive !== undefined) whereClause.isActive = isActive;

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
    } catch (error) {
      logger.error('Failed to list templates', { error, options });
      throw error;
    }
  }

  // Delete template
  public async deleteTemplate(templateId: string): Promise<void> {
    try {
      // Check if template is in use
      const inUse = await prisma.notification.findFirst({
        where: { templateId },
        select: { id: true },
      });

      if (inUse) {
        // Soft delete by marking as inactive
        await prisma.notificationTemplate.update({
          where: { id: templateId },
          data: { isActive: false },
        });

        logger.info('Template marked as inactive (in use)', { templateId });
      } else {
        // Hard delete if not in use
        await prisma.notificationTemplate.delete({
          where: { id: templateId },
        });

        logger.info('Template deleted', { templateId });
      }

      // Remove from cache
      this.compiledTemplates.delete(templateId);
    } catch (error) {
      logger.error('Failed to delete template', { error, templateId });
      throw error;
    }
  }

  // Render template with data
  public async renderTemplate(
    templateId: string,
    data: Record<string, any>
  ): Promise<{
    subject?: string;
    content: string;
    htmlContent?: string;
  }> {
    try {
      const template = await this.getTemplate(templateId);
      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      // Get compiled template or compile on demand
      let compiledTemplate = this.compiledTemplates.get(templateId);
      if (!compiledTemplate) {
        compiledTemplate = Handlebars.compile(template.content);
        this.compiledTemplates.set(templateId, compiledTemplate);
      }

      // Render content
      const renderedContent = compiledTemplate(data);

      // Render subject if it exists
      let renderedSubject: string | undefined;
      if (template.subject) {
        const subjectTemplate = Handlebars.compile(template.subject);
        renderedSubject = subjectTemplate(data);
      }

      // Render HTML content if it exists
      let renderedHtmlContent: string | undefined;
      if (template.htmlContent) {
        const htmlTemplate = Handlebars.compile(template.htmlContent);
        renderedHtmlContent = htmlTemplate(data);
      }

      // Update template usage stats
      await this.updateTemplateStats(templateId, 'rendered');

      return {
        subject: renderedSubject,
        content: renderedContent,
        htmlContent: renderedHtmlContent,
      };
    } catch (error) {
      logger.error('Failed to render template', { error, templateId, data });
      throw error;
    }
  }

  // Test template rendering
  public async testTemplate(
    templateId: string,
    testData: Record<string, any>
  ): Promise<{
    success: boolean;
    result?: {
      subject?: string;
      content: string;
      htmlContent?: string;
    };
    error?: string;
  }> {
    try {
      const result = await this.renderTemplate(templateId, testData);
      return { success: true, result };
    } catch (error) {
      logger.error('Template test failed', { error, templateId, testData });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Clone template
  public async cloneTemplate(templateId: string, newName: string): Promise<Template> {
    try {
      const original = await this.getTemplate(templateId);
      if (!original) {
        throw new Error(`Template ${templateId} not found`);
      }

      const cloned = await this.createTemplate({
        name: newName,
        type: original.type as any,
        category: original.category as any,
        subject: original.subject,
        content: original.content,
        htmlContent: original.htmlContent,
        variables: original.variables,
        isActive: false, // Start as inactive
      });

      logger.info('Template cloned', {
        originalId: templateId,
        clonedId: cloned.id,
        newName,
      });

      return cloned;
    } catch (error) {
      logger.error('Failed to clone template', { error, templateId, newName });
      throw error;
    }
  }

  // Get template variables schema
  public async getTemplateVariables(templateId: string): Promise<Record<string, any> | null> {
    try {
      const template = await this.getTemplate(templateId);
      return template?.variables || null;
    } catch (error) {
      logger.error('Failed to get template variables', { error, templateId });
      throw error;
    }
  }

  // Update template variables schema
  public async updateTemplateVariables(
    templateId: string,
    variables: Record<string, any>
  ): Promise<void> {
    try {
      await prisma.notificationTemplate.update({
        where: { id: templateId },
        data: {
          variables: JSON.stringify(variables),
          updatedAt: new Date(),
        },
      });

      logger.info('Template variables updated', { templateId });
    } catch (error) {
      logger.error('Failed to update template variables', { error, templateId, variables });
      throw error;
    }
  }

  // Analytics
  public async getTemplateStats(templateId: string): Promise<{
    sentCount: number;
    openCount: number;
    clickCount: number;
    openRate: number;
    clickRate: number;
    lastUsed?: Date;
  }> {
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

      // Get last used date
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
    } catch (error) {
      logger.error('Failed to get template stats', { error, templateId });
      throw error;
    }
  }

  // Private helper methods
  private async validateTemplate(data: any): Promise<void> {
    // Validate template name uniqueness
    const existing = await prisma.notificationTemplate.findFirst({
      where: { 
        name: data.name,
        id: { not: data.id }, // Exclude current template when updating
      },
    });

    if (existing) {
      throw new Error(`Template with name '${data.name}' already exists`);
    }

    // Validate Handlebars syntax
    try {
      Handlebars.compile(data.content);
      if (data.subject) {
        Handlebars.compile(data.subject);
      }
    } catch (error) {
      throw new Error(`Invalid Handlebars syntax: ${error.message}`);
    }

    // Validate MJML syntax for email templates
    if (data.type === 'email' && this.isMJML(data.content)) {
      const mjmlResult = mjml2html(data.content);
      if (mjmlResult.errors.length > 0) {
        throw new Error(`MJML validation failed: ${mjmlResult.errors.map(e => e.message).join(', ')}`);
      }
    }
  }

  private isMJML(content: string): boolean {
    return content.includes('<mjml>') || content.includes('<mj-');
  }

  private mapTemplate(template: any): Template {
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

  private cacheCompiledTemplate(templateId: string, content: string): void {
    try {
      const compiled = Handlebars.compile(content);
      this.compiledTemplates.set(templateId, compiled);
    } catch (error) {
      logger.warn('Failed to cache compiled template', { templateId, error });
    }
  }

  private async updateTemplateStats(templateId: string, metric: 'rendered' | 'sent' | 'opened' | 'clicked'): Promise<void> {
    try {
      const updateData: any = {};
      
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
        // 'rendered' doesn't update stats
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.notificationTemplate.update({
          where: { id: templateId },
          data: updateData,
        });
      }
    } catch (error) {
      logger.warn('Failed to update template stats', { templateId, metric, error });
    }
  }

  private async precompilePopularTemplates(): Promise<void> {
    try {
      // Get most used templates
      const popularTemplates = await prisma.notificationTemplate.findMany({
        where: { isActive: true },
        orderBy: { sentCount: 'desc' },
        take: 20, // Precompile top 20 templates
        select: { id: true, content: true },
      });

      for (const template of popularTemplates) {
        this.cacheCompiledTemplate(template.id, template.content);
      }

      logger.info('Precompiled popular templates', { count: popularTemplates.length });
    } catch (error) {
      logger.warn('Failed to precompile templates', { error });
    }
  }

  private registerHandlebarsHelpers(): void {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', (date: Date, format: string = 'YYYY-MM-DD') => {
      if (!date) return '';
      
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

    // Currency formatting helper
    Handlebars.registerHelper('formatCurrency', (amount: number, currency: string = 'USD') => {
      if (typeof amount !== 'number') return '';
      
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amount);
    });

    // Conditional helper
    Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
      return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    // URL encoding helper
    Handlebars.registerHelper('encodeUrl', (str: string) => {
      return encodeURIComponent(str || '');
    });

    // Truncate text helper
    Handlebars.registerHelper('truncate', (str: string, length: number = 100) => {
      if (!str || str.length <= length) return str;
      return str.substring(0, length) + '...';
    });

    // Uppercase helper
    Handlebars.registerHelper('uppercase', (str: string) => {
      return (str || '').toUpperCase();
    });

    // Lowercase helper
    Handlebars.registerHelper('lowercase', (str: string) => {
      return (str || '').toLowerCase();
    });

    // JSON stringify helper
    Handlebars.registerHelper('json', (obj: any) => {
      return JSON.stringify(obj);
    });
  }

  // Bulk operations
  public async bulkUpdateTemplates(
    templateIds: string[],
    updates: Partial<TemplateUpdateRequest>
  ): Promise<number> {
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
    } catch (error) {
      logger.error('Failed to bulk update templates', { error, templateIds, updates });
      throw error;
    }
  }

  public async exportTemplates(templateIds?: string[]): Promise<Template[]> {
    try {
      const whereClause = templateIds ? { id: { in: templateIds } } : {};
      
      const templates = await prisma.notificationTemplate.findMany({
        where: whereClause,
        orderBy: { name: 'asc' },
      });

      return templates.map(t => this.mapTemplate(t));
    } catch (error) {
      logger.error('Failed to export templates', { error, templateIds });
      throw error;
    }
  }
}

export const templateService = new TemplateService();