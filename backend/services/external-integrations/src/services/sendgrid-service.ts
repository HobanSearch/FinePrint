/**
 * SendGrid Email Service
 * Handles email communications for Fine Print AI
 */

import sgMail from '@sendgrid/mail';
import { EventEmitter } from 'events';
import { createServiceLogger } from '../logger';
import Redis from 'ioredis';
import Handlebars from 'handlebars';
import { readFile } from 'fs/promises';
import path from 'path';

const logger = createServiceLogger('sendgrid-service');

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlTemplate: string;
  textTemplate?: string;
  variables: string[];
  category: string;
}

export interface EmailRecipient {
  email: string;
  name?: string;
  userId?: string;
  customFields?: Record<string, any>;
}

export interface EmailOptions {
  to: EmailRecipient | EmailRecipient[];
  templateId: string;
  variables: Record<string, any>;
  attachments?: Array<{
    content: string;
    filename: string;
    type: string;
    disposition?: string;
  }>;
  scheduledTime?: Date;
  trackingSettings?: {
    clickTracking?: boolean;
    openTracking?: boolean;
    subscriptionTracking?: boolean;
  };
  metadata?: Record<string, any>;
}

export interface EmailCampaign {
  id: string;
  name: string;
  templateId: string;
  recipients: EmailRecipient[];
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledTime?: Date;
  sentCount: number;
  openRate?: number;
  clickRate?: number;
  metadata: Record<string, any>;
}

export interface EmailAnalytics {
  emailId: string;
  campaignId?: string;
  recipient: string;
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class SendGridService extends EventEmitter {
  private redis: Redis;
  private initialized: boolean = false;
  private templates: Map<string, EmailTemplate> = new Map();
  private compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private fromEmail: string;
  private fromName: string;
  private replyToEmail: string;

  // Email templates
  private readonly TEMPLATES: EmailTemplate[] = [
    {
      id: 'welcome',
      name: 'Welcome Email',
      subject: 'Welcome to Fine Print AI - Let\'s Get Started!',
      htmlTemplate: 'welcome.html',
      textTemplate: 'welcome.txt',
      variables: ['userName', 'activationLink', 'planName'],
      category: 'onboarding',
    },
    {
      id: 'document_analysis_complete',
      name: 'Document Analysis Complete',
      subject: 'Your Document Analysis is Ready',
      htmlTemplate: 'analysis-complete.html',
      textTemplate: 'analysis-complete.txt',
      variables: ['userName', 'documentName', 'riskScore', 'resultsLink', 'keyFindings'],
      category: 'notifications',
    },
    {
      id: 'subscription_renewal',
      name: 'Subscription Renewal',
      subject: 'Your Fine Print AI Subscription Renewal',
      htmlTemplate: 'subscription-renewal.html',
      variables: ['userName', 'planName', 'renewalDate', 'amount', 'manageLink'],
      category: 'billing',
    },
    {
      id: 'risk_alert',
      name: 'Risk Alert',
      subject: '⚠️ High Risk Clause Detected',
      htmlTemplate: 'risk-alert.html',
      variables: ['userName', 'documentName', 'riskType', 'riskDescription', 'viewLink'],
      category: 'alerts',
    },
    {
      id: 'weekly_summary',
      name: 'Weekly Summary',
      subject: 'Your Weekly Fine Print AI Summary',
      htmlTemplate: 'weekly-summary.html',
      variables: ['userName', 'documentsAnalyzed', 'risksFound', 'topRisks', 'dashboardLink'],
      category: 'reports',
    },
    {
      id: 'team_invitation',
      name: 'Team Invitation',
      subject: 'You\'ve been invited to join Fine Print AI',
      htmlTemplate: 'team-invitation.html',
      variables: ['inviterName', 'teamName', 'invitationLink', 'features'],
      category: 'team',
    },
    {
      id: 'password_reset',
      name: 'Password Reset',
      subject: 'Reset Your Fine Print AI Password',
      htmlTemplate: 'password-reset.html',
      variables: ['userName', 'resetLink', 'expirationTime'],
      category: 'security',
    },
    {
      id: 'trial_ending',
      name: 'Trial Ending',
      subject: 'Your Fine Print AI Trial is Ending Soon',
      htmlTemplate: 'trial-ending.html',
      variables: ['userName', 'daysRemaining', 'upgradeLink', 'features'],
      category: 'marketing',
    },
  ];

  constructor() {
    super();

    // Initialize SendGrid
    sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

    // Email configuration
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@fineprintai.com';
    this.fromName = process.env.FROM_NAME || 'Fine Print AI';
    this.replyToEmail = process.env.REPLY_TO_EMAIL || 'support@fineprintai.com';

    // Initialize Redis for tracking
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 7, // Dedicated DB for email
    });

    // Load templates
    this.TEMPLATES.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing SendGrid Service...');

      // Test SendGrid connection by verifying sender
      await sgMail.send({
        to: this.fromEmail,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: 'SendGrid Test',
        text: 'SendGrid integration test',
        mailSettings: {
          sandboxMode: {
            enable: true, // Don't actually send
          },
        },
      });

      // Test Redis connection
      await this.redis.ping();

      // Load and compile templates
      await this.loadTemplates();

      this.initialized = true;
      logger.info('SendGrid Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SendGrid Service', { error });
      throw error;
    }
  }

  /**
   * Send a single email
   */
  async sendEmail(options: EmailOptions): Promise<string> {
    try {
      const template = this.templates.get(options.templateId);
      if (!template) {
        throw new Error(`Template ${options.templateId} not found`);
      }

      const compiledHtml = this.compiledTemplates.get(`${options.templateId}_html`);
      const compiledText = this.compiledTemplates.get(`${options.templateId}_text`);

      if (!compiledHtml) {
        throw new Error(`Template ${options.templateId} not compiled`);
      }

      // Generate email ID
      const emailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Prepare recipients
      const recipients = Array.isArray(options.to) ? options.to : [options.to];

      // Build personalizations
      const personalizations = recipients.map(recipient => ({
        to: {
          email: recipient.email,
          name: recipient.name,
        },
        substitutions: {
          ...options.variables,
          ...recipient.customFields,
        },
      }));

      // Prepare email message
      const msg: sgMail.MailDataRequired = {
        personalizations,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        replyTo: this.replyToEmail,
        subject: this.processTemplate(template.subject, options.variables),
        html: compiledHtml(options.variables),
        text: compiledText ? compiledText(options.variables) : undefined,
        categories: [template.category],
        customArgs: {
          emailId,
          templateId: options.templateId,
          ...options.metadata,
        },
        attachments: options.attachments,
        sendAt: options.scheduledTime 
          ? Math.floor(options.scheduledTime.getTime() / 1000)
          : undefined,
        trackingSettings: {
          clickTracking: {
            enable: options.trackingSettings?.clickTracking ?? true,
          },
          openTracking: {
            enable: options.trackingSettings?.openTracking ?? true,
          },
          subscriptionTracking: {
            enable: options.trackingSettings?.subscriptionTracking ?? true,
          },
        },
      };

      // Send email
      await sgMail.send(msg);

      // Track email
      await this.trackEmail({
        emailId,
        recipient: recipients[0].email, // Primary recipient
        status: 'sent',
        timestamp: new Date(),
        metadata: {
          templateId: options.templateId,
          recipientCount: recipients.length,
        },
      });

      logger.info('Email sent', {
        emailId,
        templateId: options.templateId,
        recipientCount: recipients.length,
      });

      this.emit('email:sent', {
        emailId,
        templateId: options.templateId,
        recipients,
      });

      return emailId;
    } catch (error) {
      logger.error('Failed to send email', { error, options });
      throw error;
    }
  }

  /**
   * Send email campaign
   */
  async sendCampaign(campaign: Omit<EmailCampaign, 'id' | 'sentCount'>): Promise<EmailCampaign> {
    try {
      const campaignId = `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const fullCampaign: EmailCampaign = {
        ...campaign,
        id: campaignId,
        sentCount: 0,
        status: campaign.scheduledTime ? 'scheduled' : 'sending',
      };

      // Store campaign
      await this.redis.setex(
        `campaign:${campaignId}`,
        86400 * 30, // 30 days
        JSON.stringify(fullCampaign)
      );

      // Send emails in batches
      const batchSize = 100;
      const batches = [];
      
      for (let i = 0; i < campaign.recipients.length; i += batchSize) {
        batches.push(campaign.recipients.slice(i, i + batchSize));
      }

      logger.info('Starting campaign', {
        campaignId,
        totalRecipients: campaign.recipients.length,
        batches: batches.length,
      });

      // Process batches
      for (const batch of batches) {
        try {
          await this.sendEmail({
            to: batch,
            templateId: campaign.templateId,
            variables: campaign.metadata.variables || {},
            scheduledTime: campaign.scheduledTime,
            metadata: {
              campaignId,
            },
          });

          fullCampaign.sentCount += batch.length;
          
          // Update campaign status
          await this.redis.setex(
            `campaign:${campaignId}`,
            86400 * 30,
            JSON.stringify(fullCampaign)
          );
        } catch (error) {
          logger.error('Failed to send campaign batch', {
            error,
            campaignId,
            batchIndex: batches.indexOf(batch),
          });
        }
      }

      fullCampaign.status = 'sent';
      await this.redis.setex(
        `campaign:${campaignId}`,
        86400 * 30,
        JSON.stringify(fullCampaign)
      );

      this.emit('campaign:sent', fullCampaign);

      return fullCampaign;
    } catch (error) {
      logger.error('Failed to send campaign', { error, campaign });
      throw error;
    }
  }

  /**
   * Handle webhook event from SendGrid
   */
  async handleWebhook(events: any[]): Promise<void> {
    try {
      for (const event of events) {
        const analytics: EmailAnalytics = {
          emailId: event.emailId || event.sg_message_id,
          campaignId: event.campaignId,
          recipient: event.email,
          status: this.mapEventToStatus(event.event),
          timestamp: new Date(event.timestamp * 1000),
          metadata: {
            ...event,
          },
        };

        await this.trackEmail(analytics);

        // Update campaign analytics if applicable
        if (analytics.campaignId) {
          await this.updateCampaignAnalytics(analytics.campaignId, event.event);
        }

        this.emit(`email:${event.event}`, analytics);
      }

      logger.info('Webhook events processed', { count: events.length });
    } catch (error) {
      logger.error('Failed to handle webhook', { error });
      throw error;
    }
  }

  /**
   * Get email analytics
   */
  async getEmailAnalytics(
    filters: {
      emailId?: string;
      campaignId?: string;
      recipient?: string;
      startDate?: Date;
      endDate?: Date;
      status?: string;
    }
  ): Promise<EmailAnalytics[]> {
    try {
      // Build Redis pattern
      let pattern = 'analytics:*';
      if (filters.emailId) {
        pattern = `analytics:email:${filters.emailId}:*`;
      } else if (filters.campaignId) {
        pattern = `analytics:campaign:${filters.campaignId}:*`;
      } else if (filters.recipient) {
        pattern = `analytics:recipient:${filters.recipient}:*`;
      }

      const keys = await this.redis.keys(pattern);
      const analytics: EmailAnalytics[] = [];

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const analytic = JSON.parse(data) as EmailAnalytics;
          analytic.timestamp = new Date(analytic.timestamp);

          // Apply filters
          if (filters.startDate && analytic.timestamp < filters.startDate) continue;
          if (filters.endDate && analytic.timestamp > filters.endDate) continue;
          if (filters.status && analytic.status !== filters.status) continue;

          analytics.push(analytic);
        }
      }

      return analytics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      logger.error('Failed to get email analytics', { error, filters });
      throw error;
    }
  }

  /**
   * Get campaign details
   */
  async getCampaign(campaignId: string): Promise<EmailCampaign | null> {
    try {
      const data = await this.redis.get(`campaign:${campaignId}`);
      if (!data) return null;

      const campaign = JSON.parse(data) as EmailCampaign;
      campaign.scheduledTime = campaign.scheduledTime 
        ? new Date(campaign.scheduledTime) 
        : undefined;

      return campaign;
    } catch (error) {
      logger.error('Failed to get campaign', { error, campaignId });
      throw error;
    }
  }

  /**
   * Create custom email template
   */
  async createTemplate(template: EmailTemplate): Promise<void> {
    try {
      this.templates.set(template.id, template);
      
      // Compile template
      const htmlCompiled = Handlebars.compile(template.htmlTemplate);
      const textCompiled = template.textTemplate 
        ? Handlebars.compile(template.textTemplate)
        : undefined;

      this.compiledTemplates.set(`${template.id}_html`, htmlCompiled);
      if (textCompiled) {
        this.compiledTemplates.set(`${template.id}_text`, textCompiled);
      }

      // Store in Redis
      await this.redis.setex(
        `template:${template.id}`,
        86400 * 365, // 1 year
        JSON.stringify(template)
      );

      logger.info('Template created', { templateId: template.id });
    } catch (error) {
      logger.error('Failed to create template', { error, template });
      throw error;
    }
  }

  /**
   * Schedule recurring email
   */
  async scheduleRecurringEmail(
    options: EmailOptions & {
      frequency: 'daily' | 'weekly' | 'monthly';
      endDate?: Date;
    }
  ): Promise<string> {
    try {
      const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const schedule = {
        id: scheduleId,
        ...options,
        nextRun: this.calculateNextRun(new Date(), options.frequency),
        status: 'active',
      };

      await this.redis.setex(
        `schedule:${scheduleId}`,
        86400 * 365, // 1 year
        JSON.stringify(schedule)
      );

      logger.info('Recurring email scheduled', {
        scheduleId,
        frequency: options.frequency,
      });

      return scheduleId;
    } catch (error) {
      logger.error('Failed to schedule recurring email', { error });
      throw error;
    }
  }

  /**
   * Get email templates
   */
  getTemplates(): EmailTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId: string): EmailTemplate | undefined {
    return this.templates.get(templateId);
  }

  // Private helper methods

  private async loadTemplates(): Promise<void> {
    const templateDir = path.join(__dirname, '../../templates/email');

    for (const template of this.TEMPLATES) {
      try {
        // Load HTML template
        const htmlPath = path.join(templateDir, template.htmlTemplate);
        const htmlContent = await readFile(htmlPath, 'utf-8').catch(() => 
          this.getDefaultTemplate(template.id, 'html')
        );

        // Load text template if exists
        let textContent: string | undefined;
        if (template.textTemplate) {
          const textPath = path.join(templateDir, template.textTemplate);
          textContent = await readFile(textPath, 'utf-8').catch(() => 
            this.getDefaultTemplate(template.id, 'text')
          );
        }

        // Compile templates
        const htmlCompiled = Handlebars.compile(htmlContent);
        this.compiledTemplates.set(`${template.id}_html`, htmlCompiled);

        if (textContent) {
          const textCompiled = Handlebars.compile(textContent);
          this.compiledTemplates.set(`${template.id}_text`, textCompiled);
        }

        logger.debug('Template loaded', { templateId: template.id });
      } catch (error) {
        logger.error('Failed to load template', { error, templateId: template.id });
      }
    }
  }

  private getDefaultTemplate(templateId: string, type: 'html' | 'text'): string {
    if (type === 'html') {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>{{subject}}</title>
        </head>
        <body>
          <h1>Fine Print AI</h1>
          <p>Template: ${templateId}</p>
          <p>{{#each this}}{{@key}}: {{this}}<br>{{/each}}</p>
        </body>
        </html>
      `;
    } else {
      return `Fine Print AI\n\nTemplate: ${templateId}\n\n{{#each this}}{{@key}}: {{this}}\n{{/each}}`;
    }
  }

  private processTemplate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] || match;
    });
  }

  private async trackEmail(analytics: EmailAnalytics): Promise<void> {
    const keys = [
      `analytics:email:${analytics.emailId}:${analytics.status}`,
      `analytics:recipient:${analytics.recipient}:${analytics.emailId}`,
    ];

    if (analytics.campaignId) {
      keys.push(`analytics:campaign:${analytics.campaignId}:${analytics.emailId}`);
    }

    for (const key of keys) {
      await this.redis.setex(
        key,
        86400 * 30, // 30 days
        JSON.stringify(analytics)
      );
    }
  }

  private async updateCampaignAnalytics(
    campaignId: string,
    event: string
  ): Promise<void> {
    const key = `campaign:analytics:${campaignId}`;
    
    switch (event) {
      case 'open':
        await this.redis.hincrby(key, 'opens', 1);
        break;
      case 'click':
        await this.redis.hincrby(key, 'clicks', 1);
        break;
      case 'bounce':
        await this.redis.hincrby(key, 'bounces', 1);
        break;
    }

    await this.redis.expire(key, 86400 * 30); // 30 days
  }

  private mapEventToStatus(event: string): EmailAnalytics['status'] {
    switch (event) {
      case 'processed':
      case 'deferred':
        return 'sent';
      case 'delivered':
        return 'delivered';
      case 'open':
        return 'opened';
      case 'click':
        return 'clicked';
      case 'bounce':
      case 'dropped':
      case 'spamreport':
        return 'bounced';
      default:
        return 'failed';
    }
  }

  private calculateNextRun(
    currentDate: Date,
    frequency: 'daily' | 'weekly' | 'monthly'
  ): Date {
    const next = new Date(currentDate);
    
    switch (frequency) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
    }
    
    return next;
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    this.redis.disconnect();
    logger.info('SendGrid Service shutdown complete');
  }
}