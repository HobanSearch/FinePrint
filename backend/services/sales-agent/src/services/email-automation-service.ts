import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import sgMail from '@sendgrid/mail';
import OpenAI from 'openai';
import { Lead, Opportunity, Activity, AutomationRule } from '@fineprintai/shared-types';
import { config } from '../config';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  type: 'welcome' | 'follow_up' | 'demo_invite' | 'proposal' | 'nurture' | 're_engagement';
  variables: string[];
  active: boolean;
}

interface EmailSequence {
  id: string;
  name: string;
  trigger: 'lead_created' | 'stage_change' | 'time_based' | 'behavior_based';
  emails: EmailSequenceStep[];
  active: boolean;
}

interface EmailSequenceStep {
  id: string;
  delay: number; // hours
  template: EmailTemplate;
  conditions?: any[];
  stopConditions?: any[];
}

export class EmailAutomationService {
  private prisma: PrismaClient;
  private emailQueue: Queue;
  private openai: OpenAI;
  private templates: Map<string, EmailTemplate> = new Map();
  private sequences: Map<string, EmailSequence> = new Map();

  constructor() {
    this.prisma = new PrismaClient();
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    
    if (config.sendgridApiKey) {
      sgMail.setApiKey(config.sendgridApiKey);
    }
  }

  async initialize() {
    await this.loadEmailTemplates();
    await this.loadEmailSequences();
    await this.setupAutomationRules();
    console.log('Email automation service initialized');
  }

  async sendPersonalizedEmail(leadId: string, templateId: string, customData?: Record<string, any>): Promise<boolean> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        company: true,
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Personalize email content
    const personalizedContent = await this.personalizeEmail(lead, template, customData);
    
    const emailData = {
      to: lead.email,
      from: { email: config.emailFrom, name: 'Fine Print AI Sales Team' },
      subject: personalizedContent.subject,
      html: personalizedContent.html,
      text: personalizedContent.text,
      trackingSettings: {
        clickTracking: { enable: true },
        openTracking: { enable: true },
      },
      customArgs: {
        leadId: lead.id,
        templateId,
        campaignType: template.type,
      },
    };

    try {
      await sgMail.send(emailData);
      
      // Log activity
      await this.logEmailActivity(lead.id, template, 'sent');
      
      return true;
    } catch (error) {
      console.error('Email send error:', error);
      await this.logEmailActivity(lead.id, template, 'failed');
      return false;
    }
  }

  async startEmailSequence(leadId: string, sequenceId: string): Promise<void> {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence || !sequence.active) {
      throw new Error('Sequence not found or inactive');
    }

    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      throw new Error('Lead not found');
    }

    // Check if lead is already in this sequence
    const existingSequence = await this.prisma.emailSequenceProgress.findUnique({
      where: {
        leadId_sequenceId: {
          leadId,
          sequenceId,
        },
      },
    });

    if (existingSequence && existingSequence.status === 'active') {
      return; // Already in sequence
    }

    // Create sequence progress record
    await this.prisma.emailSequenceProgress.create({
      data: {
        leadId,
        sequenceId,
        currentStep: 0,
        status: 'active',
        startedAt: new Date(),
      },
    });

    // Schedule first email
    await this.scheduleSequenceEmail(leadId, sequenceId, 0);
  }

  async stopEmailSequence(leadId: string, sequenceId: string): Promise<void> {
    await this.prisma.emailSequenceProgress.updateMany({
      where: {
        leadId,
        sequenceId,
        status: 'active',
      },
      data: {
        status: 'stopped',
        stoppedAt: new Date(),
      },
    });

    // Cancel pending jobs
    // Implementation depends on your queue system
  }

  async generateEmailFromContext(leadId: string, context: string, emailType: string): Promise<{ subject: string; content: string }> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        company: true,
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
        opportunities: true,
      },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const prompt = this.buildEmailGenerationPrompt(lead, context, emailType);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a sales email expert. Write personalized, engaging emails that drive action.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || '';
      const lines = content.split('\n');
      const subject = lines.find(line => line.startsWith('Subject:'))?.replace('Subject:', '').trim() || `Follow up with ${lead.firstName}`;
      const emailContent = content.replace(/^Subject:.*\n/, '').trim();

      return {
        subject,
        content: emailContent,
      };
    } catch (error) {
      console.error('Email generation error:', error);
      return this.getFallbackEmail(lead, emailType);
    }
  }

  async handleWebhookEvent(event: any): Promise<void> {
    switch (event.event) {
      case 'open':
        await this.handleEmailOpen(event);
        break;
      case 'click':
        await this.handleEmailClick(event);
        break;
      case 'bounce':
        await this.handleEmailBounce(event);
        break;
      case 'delivered':
        await this.handleEmailDelivered(event);
        break;
      case 'reply':
        await this.handleEmailReply(event);
        break;
    }
  }

  private async personalizeEmail(lead: any, template: EmailTemplate, customData?: Record<string, any>): Promise<{ subject: string; html: string; text: string }> {
    const variables = {
      firstName: lead.firstName,
      lastName: lead.lastName,
      fullName: `${lead.firstName} ${lead.lastName}`,
      company: lead.company?.name || lead.company || 'your company',
      title: lead.title || 'there',
      score: lead.score,
      stage: lead.stage,
      estimatedValue: lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : '$10,000',
      ...customData,
    };

    // AI-enhanced personalization
    const aiPersonalization = await this.getAIPersonalization(lead, template.type);
    variables.aiInsight = aiPersonalization.insight;
    variables.aiRecommendation = aiPersonalization.recommendation;

    let subject = template.subject;
    let content = template.content;

    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, String(value));
      content = content.replace(regex, String(value));
    }

    // Convert to HTML and text
    const html = this.convertToHtml(content);
    const text = this.convertToText(content);

    return { subject, html, text };
  }

  private async getAIPersonalization(lead: any, emailType: string): Promise<{ insight: string; recommendation: string }> {
    const prompt = `
      Based on this lead information, provide a personalized insight and recommendation for a ${emailType} email:
      
      Lead: ${lead.firstName} ${lead.lastName}
      Company: ${lead.company?.name || 'Unknown'}
      Title: ${lead.title || 'Unknown'}
      Stage: ${lead.stage}
      Score: ${lead.score}
      Recent activities: ${lead.activities?.slice(0, 2).map((a: any) => a.description).join(', ') || 'None'}
      
      Return JSON with 'insight' and 'recommendation' fields. Keep each under 50 words.
    `;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      
      return {
        insight: parsed.insight || 'We noticed your interest in legal document analysis.',
        recommendation: parsed.recommendation || 'Let me show you how Fine Print AI can help.',
      };
    } catch (error) {
      return {
        insight: 'We noticed your interest in legal document analysis.',
        recommendation: 'Let me show you how Fine Print AI can help.',
      };
    }
  }

  private buildEmailGenerationPrompt(lead: any, context: string, emailType: string): string {
    return `
      Write a ${emailType} email for this lead:
      
      Lead Information:
      - Name: ${lead.firstName} ${lead.lastName}
      - Company: ${lead.company?.name || 'Unknown'}
      - Title: ${lead.title || 'Unknown'}
      - Stage: ${lead.stage}
      - Score: ${lead.score}/100
      
      Context: ${context}
      
      Recent Activities:
      ${lead.activities?.slice(0, 3).map((a: any) => `- ${a.description}`).join('\n') || 'None'}
      
      About Fine Print AI:
      - AI-powered legal document analysis platform
      - Identifies problematic clauses in Terms of Service, Privacy Policies, etc.
      - Saves time and protects user rights
      - Local LLM processing for privacy
      
      Requirements:
      - Personalized and relevant
      - Professional but friendly tone
      - Clear call-to-action
      - Under 200 words
      - Include subject line starting with "Subject:"
      
      Generate the email now:
    `;
  }

  private async scheduleSequenceEmail(leadId: string, sequenceId: string, stepIndex: number): Promise<void> {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence || stepIndex >= sequence.emails.length) {
      return;
    }

    const step = sequence.emails[stepIndex];
    const delayMs = step.delay * 60 * 60 * 1000; // Convert hours to milliseconds

    if (this.emailQueue) {
      await this.emailQueue.add(
        'send-sequence-email',
        {
          leadId,
          sequenceId,
          stepIndex,
        },
        {
          delay: delayMs,
          jobId: `${leadId}-${sequenceId}-${stepIndex}`,
        }
      );
    }
  }

  private async handleEmailOpen(event: any): Promise<void> {
    const leadId = event.leadId;
    if (leadId) {
      await this.prisma.emailEngagement.create({
        data: {
          leadId,
          type: 'open',
          timestamp: new Date(event.timestamp * 1000),
          metadata: event,
        },
      });

      // Update lead engagement score
      await this.updateEngagementScore(leadId, 'open');
    }
  }

  private async handleEmailClick(event: any): Promise<void> {
    const leadId = event.leadId;
    if (leadId) {
      await this.prisma.emailEngagement.create({
        data: {
          leadId,
          type: 'click',
          timestamp: new Date(event.timestamp * 1000),
          metadata: event,
        },
      });

      // Update lead engagement score
      await this.updateEngagementScore(leadId, 'click');
      
      // Trigger follow-up if high-value link clicked
      if (this.isHighValueLink(event.url)) {
        await this.triggerHighValueFollowUp(leadId);
      }
    }
  }

  private async handleEmailReply(event: any): Promise<void> {
    const leadId = event.leadId;
    if (leadId) {
      await this.prisma.emailEngagement.create({
        data: {
          leadId,
          type: 'reply',
          timestamp: new Date(event.timestamp * 1000),
          metadata: event,
        },
      });

      // High value engagement - update lead score
      await this.updateEngagementScore(leadId, 'reply');
      
      // Notify sales rep
      await this.notifySalesRep(leadId, 'reply', event);
    }
  }

  private async handleEmailBounce(event: any): Promise<void> {
    const leadId = event.leadId;
    if (leadId) {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: {
          emailBounced: true,
          emailBounceReason: event.reason,
        },
      });

      // Stop all sequences for this lead
      await this.prisma.emailSequenceProgress.updateMany({
        where: { leadId, status: 'active' },
        data: { status: 'bounced', stoppedAt: new Date() },
      });
    }
  }

  private async handleEmailDelivered(event: any): Promise<void> {
    const leadId = event.leadId;
    if (leadId) {
      await this.updateDeliveryStatus(leadId, 'delivered');
    }
  }

  private async updateEngagementScore(leadId: string, engagementType: string): Promise<void> {
    const points = {
      open: 2,
      click: 5,
      reply: 15,
    };

    const scoreIncrease = points[engagementType as keyof typeof points] || 0;
    
    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        score: {
          increment: scoreIncrease,
        },
        lastEngagement: new Date(),
      },
    });
  }

  private async logEmailActivity(leadId: string, template: EmailTemplate, status: string): Promise<void> {
    await this.prisma.activity.create({
      data: {
        type: 'email',
        subject: `Email: ${template.name}`,
        description: `${status === 'sent' ? 'Sent' : 'Failed to send'} ${template.type} email: ${template.subject}`,
        leadId,
        completedAt: status === 'sent' ? new Date() : undefined,
        outcome: status,
        createdBy: 'system',
        createdAt: new Date(),
      },
    });
  }

  private convertToHtml(content: string): string {
    // Convert markdown-like content to HTML
    return content
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

  private convertToText(content: string): string {
    // Convert HTML/markdown to plain text
    return content
      .replace(/<[^>]*>/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  }

  private getFallbackEmail(lead: any, emailType: string): { subject: string; content: string } {
    const fallbacks = {
      follow_up: {
        subject: `Following up, ${lead.firstName}`,
        content: `Hi ${lead.firstName},\n\nI wanted to follow up on our previous conversation about Fine Print AI. Have you had a chance to review how our platform could help ${lead.company || 'your organization'}?\n\nI'd be happy to answer any questions you might have.\n\nBest regards,\nThe Fine Print AI Team`,
      },
      demo_invite: {
        subject: `Quick demo for ${lead.company || lead.firstName}?`,
        content: `Hi ${lead.firstName},\n\nBased on your interest in legal document analysis, I'd love to show you a quick demo of Fine Print AI.\n\nWould you have 15 minutes this week for a personalized walkthrough?\n\nBest regards,\nThe Fine Print AI Team`,
      },
    };

    return fallbacks[emailType as keyof typeof fallbacks] || fallbacks.follow_up;
  }

  private isHighValueLink(url: string): boolean {
    const highValuePaths = ['/pricing', '/demo', '/contact', '/signup'];
    return highValuePaths.some(path => url.includes(path));
  }

  private async triggerHighValueFollowUp(leadId: string): Promise<void> {
    // Schedule immediate follow-up for high-value engagement
    if (this.emailQueue) {
      await this.emailQueue.add(
        'high-value-followup',
        { leadId },
        { delay: 60 * 60 * 1000 } // 1 hour delay
      );
    }
  }

  private async notifySalesRep(leadId: string, eventType: string, eventData: any): Promise<void> {
    // Implementation for notifying sales rep of important email events
  }

  private async updateDeliveryStatus(leadId: string, status: string): Promise<void> {
    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        lastEmailDelivered: new Date(),
      },
    });
  }

  private async loadEmailTemplates(): Promise<void> {
    // Load templates from database or configuration
    const defaultTemplates: EmailTemplate[] = [
      {
        id: 'welcome',
        name: 'Welcome Email',
        subject: 'Welcome to Fine Print AI, {{firstName}}!',
        content: `Hi {{firstName}},

Welcome to Fine Print AI! I'm excited to help you understand those complex legal documents.

Here's what you can do next:
- Upload your first document for analysis
- Explore our browser extension
- Check out our {{aiRecommendation}}

If you have any questions, just reply to this email.

Best regards,
The Fine Print AI Team`,
        type: 'welcome',
        variables: ['firstName', 'aiRecommendation'],
        active: true,
      },
      // Add more default templates...
    ];

    for (const template of defaultTemplates) {
      this.templates.set(template.id, template);
    }
  }

  private async loadEmailSequences(): Promise<void> {
    // Load sequences from database or configuration
  }

  private async setupAutomationRules(): Promise<void> {
    // Setup automation rules for email triggers
  }

  // Public API methods
  async getEmailMetrics(leadId?: string): Promise<any> {
    const where = leadId ? { leadId } : {};
    
    const metrics = await this.prisma.emailEngagement.groupBy({
      by: ['type'],
      where,
      _count: true,
    });

    return metrics.reduce((acc, metric) => {
      acc[metric.type] = metric._count;
      return acc;
    }, {} as Record<string, number>);
  }

  async getActiveSequences(): Promise<EmailSequence[]> {
    return Array.from(this.sequences.values()).filter(seq => seq.active);
  }

  async createTemplate(template: Omit<EmailTemplate, 'id'>): Promise<EmailTemplate> {
    const newTemplate = {
      ...template,
      id: `template_${Date.now()}`,
    };
    
    this.templates.set(newTemplate.id, newTemplate);
    return newTemplate;
  }
}