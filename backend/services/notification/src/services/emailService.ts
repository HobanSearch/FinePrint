import sgMail from '@sendgrid/mail';
import { SES } from 'aws-sdk';
import { PrismaClient } from '@prisma/client';
import Handlebars from 'handlebars';
import mjml2html from 'mjml';
import juice from 'juice';
import validator from 'validator';
import { v4 as uuidv4 } from 'uuid';

import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('email-service');
const prisma = new PrismaClient();

export interface EmailSendResult {
  success: boolean;
  providerId?: string;
  providerStatus?: string;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
}

export interface EmailSendRequest {
  userId: string;
  notificationId: string;
  template?: any;
  data: Record<string, any>;
  deliveryId: string;
  to?: string;
  subject?: string;
  content?: string;
}

export interface EmailTemplateData {
  to: string;
  from: {
    email: string;
    name: string;
  };
  subject: string;
  html: string;
  text?: string;
  templateId?: string;
  dynamicTemplateData?: Record<string, any>;
  trackingSettings?: {
    clickTracking?: { enable: boolean };
    openTracking?: { enable: boolean };
    subscriptionTracking?: { enable: boolean };
  };
  customArgs?: Record<string, string>;
}

class EmailService {
  private sendgrid: typeof sgMail;
  private ses: SES;
  private provider: 'sendgrid' | 'ses';
  private initialized = false;

  constructor() {
    this.provider = (config.email.provider as 'sendgrid' | 'ses') || 'sendgrid';
    
    if (this.provider === 'sendgrid') {
      this.sendgrid = sgMail;
      this.sendgrid.setApiKey(config.email.sendgrid.apiKey);
    } else {
      this.ses = new SES({
        accessKeyId: config.email.ses.accessKeyId,
        secretAccessKey: config.email.ses.secretAccessKey,
        region: config.email.ses.region,
      });
    }

    // Register Handlebars helpers
    this.registerHandlebarsHelpers();
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Test email service connection
      if (this.provider === 'sendgrid') {
        // SendGrid doesn't have a ping method, so we'll just validate the API key format
        if (!config.email.sendgrid.apiKey || !config.email.sendgrid.apiKey.startsWith('SG.')) {
          throw new Error('Invalid SendGrid API key format');
        }
      } else {
        // Test SES connection
        await this.ses.getAccountSendingEnabled().promise();
      }

      // Test database connection
      await prisma.$connect();

      this.initialized = true;
      logger.info(`Email service initialized successfully with ${this.provider}`);
    } catch (error) {
      logger.error('Failed to initialize email service', { error, provider: this.provider });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      await prisma.$disconnect();
      this.initialized = false;
      logger.info('Email service shut down successfully');
    } catch (error) {
      logger.error('Error during email service shutdown', { error });
    }
  }

  public async sendEmail(request: EmailSendRequest): Promise<EmailSendResult> {
    try {
      // Get user details
      const user = await this.getUserForEmail(request.userId);
      if (!user) {
        throw new Error(`User ${request.userId} not found`);
      }

      // Check if user has unsubscribed
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

      // Validate email address
      if (!validator.isEmail(user.email)) {
        throw new Error(`Invalid email address: ${user.email}`);
      }

      // Build email content
      const emailData = await this.buildEmailContent(request, user);

      // Send email based on provider
      let result: EmailSendResult;
      if (this.provider === 'sendgrid') {
        result = await this.sendWithSendGrid(emailData, request);
      } else {
        result = await this.sendWithSES(emailData, request);
      }

      // Log successful send
      if (result.success) {
        logger.info('Email sent successfully', {
          userId: request.userId,
          notificationId: request.notificationId,
          deliveryId: request.deliveryId,
          provider: this.provider,
          messageId: result.messageId,
        });

        // Update email template usage stats
        if (request.template?.id) {
          await this.updateTemplateStats(request.template.id, 'sent');
        }
      }

      return result;
    } catch (error) {
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

  private async sendWithSendGrid(emailData: EmailTemplateData, request: EmailSendRequest): Promise<EmailSendResult> {
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
    } catch (error) {
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

  private async sendWithSES(emailData: EmailTemplateData, request: EmailSendRequest): Promise<EmailSendResult> {
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
        ConfigurationSetName: config.email.ses.configurationSet,
      };

      const response = await this.ses.sendEmail(sesParams).promise();
      
      return {
        success: true,
        providerId: 'ses',
        messageId: response.MessageId,
        providerStatus: '200',
      };
    } catch (error) {
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

  private async buildEmailContent(request: EmailSendRequest, user: any): Promise<EmailTemplateData> {
    let subject: string;
    let html: string;
    let text: string | undefined;

    if (request.template) {
      // Use template from database
      const template = await this.getEmailTemplate(request.template.id || request.template.name);
      if (!template) {
        throw new Error(`Email template not found: ${request.template.id || request.template.name}`);
      }

      // Prepare template data
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
          preferencesUrl: `${config.frontend.url}/preferences/notifications`,
        },
        company: {
          name: 'Fine Print AI',
          address: config.company.address,
          supportEmail: config.company.supportEmail,
          website: config.frontend.url,
        },
      };

      // Compile templates
      subject = this.compileHandlebarsTemplate(template.subject, templateData);
      
      if (template.mjmlContent) {
        // Compile MJML template
        const mjmlResult = mjml2html(template.mjmlContent, {
          keepComments: false,
          beautify: true,
        });
        
        if (mjmlResult.errors.length > 0) {
          logger.warn('MJML compilation warnings', { errors: mjmlResult.errors });
        }
        
        // Compile Handlebars in the resulting HTML
        html = this.compileHandlebarsTemplate(mjmlResult.html, templateData);
        
        // Inline CSS for better email client support
        html = juice(html);
      } else {
        // Use HTML template directly
        html = this.compileHandlebarsTemplate(template.htmlContent, templateData);
        html = juice(html);
      }

      // Generate text version if provided
      if (template.textContent) {
        text = this.compileHandlebarsTemplate(template.textContent, templateData);
      } else {
        // Generate basic text version from HTML
        text = this.htmlToText(html);
      }
    } else {
      // Use direct content
      subject = request.subject || 'Notification from Fine Print AI';
      html = request.content || 'You have a new notification.';
      text = this.htmlToText(html);
    }

    return {
      to: user.email,
      from: {
        email: config.email.fromEmail,
        name: config.email.fromName,
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

  private async getEmailTemplate(idOrName: string): Promise<any> {
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

  private async getUserForEmail(userId: string): Promise<any> {
    // This would typically fetch from a users table
    // For now, we'll return a mock user structure
    return {
      id: userId,
      email: `user-${userId}@example.com`, // This should come from actual user data
      displayName: 'User',
      firstName: 'User',
    };
  }

  private async checkUnsubscribeStatus(email: string): Promise<boolean> {
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

  private compileHandlebarsTemplate(template: string, data: any): string {
    try {
      const compiled = Handlebars.compile(template);
      return compiled(data);
    } catch (error) {
      logger.error('Failed to compile Handlebars template', { error, template });
      throw new Error(`Template compilation failed: ${error.message}`);
    }
  }

  private htmlToText(html: string): string {
    // Basic HTML to text conversion
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .replace(/&#39;/g, "'") // Replace &#39; with '
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }

  private generateUnsubscribeUrl(userId: string, notificationId: string): string {
    const token = this.generateUnsubscribeToken(userId, notificationId);
    return `${config.frontend.url}/unsubscribe?token=${token}`;
  }

  private generateUnsubscribeToken(userId: string, notificationId: string): string {
    // Generate a signed token for unsubscribe functionality
    const payload = `${userId}:${notificationId}:${Date.now()}`;
    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', config.email.unsubscribeSecret)
      .update(payload)
      .digest('hex');
    
    return Buffer.from(`${payload}:${signature}`).toString('base64');
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
  }

  private async updateTemplateStats(templateId: string, metric: 'sent' | 'opened' | 'clicked'): Promise<void> {
    try {
      const updateData: any = {};
      updateData[`${metric}Count`] = { increment: 1 };
      
      await prisma.emailTemplate.update({
        where: { id: templateId },
        data: updateData,
      });
    } catch (error) {
      logger.error('Failed to update template stats', { templateId, metric, error });
    }
  }

  private isRetryableError(error: any): boolean {
    // Common retryable error patterns
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

  private isSendGridRetryableError(error: any): boolean {
    const retryableStatusCodes = [429, 500, 502, 503, 504];
    const statusCode = error.response?.statusCode || error.statusCode;
    
    return retryableStatusCodes.includes(statusCode) ||
           this.isRetryableError(error);
  }

  private isSESRetryableError(error: any): boolean {
    const retryableCodes = [
      'Throttling',
      'ServiceUnavailable',
      'InternalFailure',
      'RequestTimeout',
    ];

    return retryableCodes.includes(error.code) ||
           this.isRetryableError(error);
  }

  // Public methods for template management
  public async createEmailTemplate(templateData: {
    name: string;
    subject: string;
    mjmlContent?: string;
    htmlContent?: string;
    textContent?: string;
    variables?: any;
  }): Promise<any> {
    try {
      // Validate MJML if provided
      if (templateData.mjmlContent) {
        const mjmlResult = mjml2html(templateData.mjmlContent);
        if (mjmlResult.errors.length > 0) {
          throw new Error(`MJML validation failed: ${mjmlResult.errors.map(e => e.message).join(', ')}`);
        }
        
        // Store compiled HTML as well
        templateData.htmlContent = mjmlResult.html;
      }

      const template = await prisma.emailTemplate.create({
        data: {
          id: uuidv4(),
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
    } catch (error) {
      logger.error('Failed to create email template', { error, templateData });
      throw error;
    }
  }

  public async updateEmailTemplate(templateId: string, updates: any): Promise<any> {
    try {
      // Validate MJML if provided
      if (updates.mjmlContent) {
        const mjmlResult = mjml2html(updates.mjmlContent);
        if (mjmlResult.errors.length > 0) {
          throw new Error(`MJML validation failed: ${mjmlResult.errors.map(e => e.message).join(', ')}`);
        }
        
        // Update compiled HTML as well
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
    } catch (error) {
      logger.error('Failed to update email template', { error, templateId, updates });
      throw error;
    }
  }

  public async getEmailTemplates(options: {
    limit?: number;
    offset?: number;
    active?: boolean;
  } = {}): Promise<any[]> {
    const { limit = 50, offset = 0, active } = options;
    
    const whereClause: any = {};
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

  public async processUnsubscribe(token: string): Promise<{ success: boolean; message: string }> {
    try {
      // Decode and verify unsubscribe token
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [payload, signature] = decoded.split(':').slice(-2);
      const [userId, notificationId, timestamp] = payload.split(':');

      // Verify signature
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', config.email.unsubscribeSecret)
        .update(`${userId}:${notificationId}:${timestamp}`)
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new Error('Invalid unsubscribe token');
      }

      // Check if token is expired (7 days)
      const tokenAge = Date.now() - parseInt(timestamp);
      if (tokenAge > 7 * 24 * 60 * 60 * 1000) {
        throw new Error('Unsubscribe token has expired');
      }

      // Get user email
      const user = await this.getUserForEmail(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create unsubscribe record
      await prisma.unsubscribeRecord.create({
        data: {
          id: uuidv4(),
          userId,
          email: user.email,
          type: 'all', // For now, unsubscribe from all emails
          reason: 'user_request',
          source: 'email_link',
        },
      });

      logger.info('User unsubscribed', { userId, email: user.email });

      return {
        success: true,
        message: 'Successfully unsubscribed from all emails',
      };
    } catch (error) {
      logger.error('Failed to process unsubscribe', { error, token });
      return {
        success: false,
        message: error.message || 'Failed to process unsubscribe request',
      };
    }
  }

  // Webhook handlers for email events
  public async handleSendGridWebhook(events: any[]): Promise<void> {
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
      } catch (error) {
        logger.error('Failed to process SendGrid webhook event', { error, event });
      }
    }
  }

  public async handleSESWebhook(message: any): Promise<void> {
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
    } catch (error) {
      logger.error('Failed to process SES webhook event', { error, message });
    }
  }

  private async processEmailEvent(event: {
    provider: string;
    messageId?: string;
    event: string;
    timestamp: Date;
    email?: string;
    notificationId?: string;
    deliveryId?: string;
    userId?: string;
    reason?: string;
    url?: string;
  }): Promise<void> {
    try {
      // Find delivery record
      let delivery;
      if (event.deliveryId) {
        delivery = await prisma.notificationDelivery.findUnique({
          where: { id: event.deliveryId },
        });
      } else if (event.messageId) {
        delivery = await prisma.notificationDelivery.findFirst({
          where: { providerId: event.messageId },
        });
      }

      if (!delivery) {
        logger.warn('Delivery record not found for email event', event);
        return;
      }

      // Update delivery status based on event
      const updateData: any = {
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
    } catch (error) {
      logger.error('Failed to process email event', { error, event });
    }
  }
}

export const emailService = new EmailService();