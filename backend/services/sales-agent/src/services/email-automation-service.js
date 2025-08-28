"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailAutomationService = void 0;
const client_1 = require("@prisma/client");
const mail_1 = __importDefault(require("@sendgrid/mail"));
const openai_1 = __importDefault(require("openai"));
const config_1 = require("../config");
class EmailAutomationService {
    prisma;
    emailQueue;
    openai;
    templates = new Map();
    sequences = new Map();
    constructor() {
        this.prisma = new client_1.PrismaClient();
        this.openai = new openai_1.default({ apiKey: config_1.config.openaiApiKey });
        if (config_1.config.sendgridApiKey) {
            mail_1.default.setApiKey(config_1.config.sendgridApiKey);
        }
    }
    async initialize() {
        await this.loadEmailTemplates();
        await this.loadEmailSequences();
        await this.setupAutomationRules();
        console.log('Email automation service initialized');
    }
    async sendPersonalizedEmail(leadId, templateId, customData) {
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
        const personalizedContent = await this.personalizeEmail(lead, template, customData);
        const emailData = {
            to: lead.email,
            from: { email: config_1.config.emailFrom, name: 'Fine Print AI Sales Team' },
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
            await mail_1.default.send(emailData);
            await this.logEmailActivity(lead.id, template, 'sent');
            return true;
        }
        catch (error) {
            console.error('Email send error:', error);
            await this.logEmailActivity(lead.id, template, 'failed');
            return false;
        }
    }
    async startEmailSequence(leadId, sequenceId) {
        const sequence = this.sequences.get(sequenceId);
        if (!sequence || !sequence.active) {
            throw new Error('Sequence not found or inactive');
        }
        const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) {
            throw new Error('Lead not found');
        }
        const existingSequence = await this.prisma.emailSequenceProgress.findUnique({
            where: {
                leadId_sequenceId: {
                    leadId,
                    sequenceId,
                },
            },
        });
        if (existingSequence && existingSequence.status === 'active') {
            return;
        }
        await this.prisma.emailSequenceProgress.create({
            data: {
                leadId,
                sequenceId,
                currentStep: 0,
                status: 'active',
                startedAt: new Date(),
            },
        });
        await this.scheduleSequenceEmail(leadId, sequenceId, 0);
    }
    async stopEmailSequence(leadId, sequenceId) {
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
    }
    async generateEmailFromContext(leadId, context, emailType) {
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
        }
        catch (error) {
            console.error('Email generation error:', error);
            return this.getFallbackEmail(lead, emailType);
        }
    }
    async handleWebhookEvent(event) {
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
    async personalizeEmail(lead, template, customData) {
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
        const aiPersonalization = await this.getAIPersonalization(lead, template.type);
        variables.aiInsight = aiPersonalization.insight;
        variables.aiRecommendation = aiPersonalization.recommendation;
        let subject = template.subject;
        let content = template.content;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            subject = subject.replace(regex, String(value));
            content = content.replace(regex, String(value));
        }
        const html = this.convertToHtml(content);
        const text = this.convertToText(content);
        return { subject, html, text };
    }
    async getAIPersonalization(lead, emailType) {
        const prompt = `
      Based on this lead information, provide a personalized insight and recommendation for a ${emailType} email:
      
      Lead: ${lead.firstName} ${lead.lastName}
      Company: ${lead.company?.name || 'Unknown'}
      Title: ${lead.title || 'Unknown'}
      Stage: ${lead.stage}
      Score: ${lead.score}
      Recent activities: ${lead.activities?.slice(0, 2).map((a) => a.description).join(', ') || 'None'}
      
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
        }
        catch (error) {
            return {
                insight: 'We noticed your interest in legal document analysis.',
                recommendation: 'Let me show you how Fine Print AI can help.',
            };
        }
    }
    buildEmailGenerationPrompt(lead, context, emailType) {
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
      ${lead.activities?.slice(0, 3).map((a) => `- ${a.description}`).join('\n') || 'None'}
      
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
    async scheduleSequenceEmail(leadId, sequenceId, stepIndex) {
        const sequence = this.sequences.get(sequenceId);
        if (!sequence || stepIndex >= sequence.emails.length) {
            return;
        }
        const step = sequence.emails[stepIndex];
        const delayMs = step.delay * 60 * 60 * 1000;
        if (this.emailQueue) {
            await this.emailQueue.add('send-sequence-email', {
                leadId,
                sequenceId,
                stepIndex,
            }, {
                delay: delayMs,
                jobId: `${leadId}-${sequenceId}-${stepIndex}`,
            });
        }
    }
    async handleEmailOpen(event) {
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
            await this.updateEngagementScore(leadId, 'open');
        }
    }
    async handleEmailClick(event) {
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
            await this.updateEngagementScore(leadId, 'click');
            if (this.isHighValueLink(event.url)) {
                await this.triggerHighValueFollowUp(leadId);
            }
        }
    }
    async handleEmailReply(event) {
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
            await this.updateEngagementScore(leadId, 'reply');
            await this.notifySalesRep(leadId, 'reply', event);
        }
    }
    async handleEmailBounce(event) {
        const leadId = event.leadId;
        if (leadId) {
            await this.prisma.lead.update({
                where: { id: leadId },
                data: {
                    emailBounced: true,
                    emailBounceReason: event.reason,
                },
            });
            await this.prisma.emailSequenceProgress.updateMany({
                where: { leadId, status: 'active' },
                data: { status: 'bounced', stoppedAt: new Date() },
            });
        }
    }
    async handleEmailDelivered(event) {
        const leadId = event.leadId;
        if (leadId) {
            await this.updateDeliveryStatus(leadId, 'delivered');
        }
    }
    async updateEngagementScore(leadId, engagementType) {
        const points = {
            open: 2,
            click: 5,
            reply: 15,
        };
        const scoreIncrease = points[engagementType] || 0;
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
    async logEmailActivity(leadId, template, status) {
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
    convertToHtml(content) {
        return content
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    }
    convertToText(content) {
        return content
            .replace(/<[^>]*>/g, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    }
    getFallbackEmail(lead, emailType) {
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
        return fallbacks[emailType] || fallbacks.follow_up;
    }
    isHighValueLink(url) {
        const highValuePaths = ['/pricing', '/demo', '/contact', '/signup'];
        return highValuePaths.some(path => url.includes(path));
    }
    async triggerHighValueFollowUp(leadId) {
        if (this.emailQueue) {
            await this.emailQueue.add('high-value-followup', { leadId }, { delay: 60 * 60 * 1000 });
        }
    }
    async notifySalesRep(leadId, eventType, eventData) {
    }
    async updateDeliveryStatus(leadId, status) {
        await this.prisma.lead.update({
            where: { id: leadId },
            data: {
                lastEmailDelivered: new Date(),
            },
        });
    }
    async loadEmailTemplates() {
        const defaultTemplates = [
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
        ];
        for (const template of defaultTemplates) {
            this.templates.set(template.id, template);
        }
    }
    async loadEmailSequences() {
    }
    async setupAutomationRules() {
    }
    async getEmailMetrics(leadId) {
        const where = leadId ? { leadId } : {};
        const metrics = await this.prisma.emailEngagement.groupBy({
            by: ['type'],
            where,
            _count: true,
        });
        return metrics.reduce((acc, metric) => {
            acc[metric.type] = metric._count;
            return acc;
        }, {});
    }
    async getActiveSequences() {
        return Array.from(this.sequences.values()).filter(seq => seq.active);
    }
    async createTemplate(template) {
        const newTemplate = {
            ...template,
            id: `template_${Date.now()}`,
        };
        this.templates.set(newTemplate.id, newTemplate);
        return newTemplate;
    }
}
exports.EmailAutomationService = EmailAutomationService;
//# sourceMappingURL=email-automation-service.js.map