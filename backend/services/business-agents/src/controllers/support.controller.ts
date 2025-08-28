/**
 * Support Agent Controller
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  SupportRespondRequest,
  SupportResponse,
  AgentType
} from '../types';
import { ollamaService } from '../services/ollama.service';
import { cacheService } from '../services/cache.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('support-controller');

export class SupportController {
  async generateResponse(
    request: FastifyRequest<{ Body: SupportRespondRequest }>,
    reply: FastifyReply
  ): Promise<void> {
    const startTime = Date.now();
    const { body } = request;

    try {
      // Check cache first (with shorter key for support tickets)
      const cacheKey = {
        subject: body.ticket.subject,
        category: body.ticket.category,
        responseType: body.responseType
      };

      const cached = await cacheService.get<SupportResponse>(
        AgentType.SUPPORT,
        'respond',
        cacheKey
      );

      if (cached && body.responseType !== 'escalation') {
        logger.info('Returning cached support response');
        return reply.send(cached);
      }

      // Build context and prompts
      const context = this.buildTicketContext(body);
      const systemPrompt = this.buildSystemPrompt(body.tone);
      const userPrompt = this.buildUserPrompt(context, body.responseType);

      // Generate support response
      const aiResponse = await ollamaService.generate(
        AgentType.SUPPORT,
        userPrompt,
        systemPrompt,
        {
          temperature: this.getTemperatureForTone(body.tone),
          format: 'json'
        }
      );

      // Parse AI response
      const parsed = this.parseAIResponse(aiResponse);

      // Analyze sentiment
      const sentiment = await this.analyzeSentiment(body, parsed);

      // Determine escalation needs
      const escalation = this.determineEscalation(body, sentiment, parsed);

      // Create response
      const response: SupportResponse = {
        id: uuidv4(),
        ticketId: body.ticket.id,
        response: {
          subject: parsed.subject || `Re: ${body.ticket.subject}`,
          body: parsed.body || 'Thank you for contacting Fine Print AI support.',
          summary: parsed.summary || 'Support response generated',
          suggestedActions: parsed.suggestedActions || [],
          internalNotes: parsed.internalNotes
        },
        sentiment,
        escalation,
        metadata: {
          generatedAt: new Date(),
          model: 'fine-print-customer',
          version: '1.0.0',
          processingTime: Date.now() - startTime
        }
      };

      // Cache the response (except escalations)
      if (body.responseType !== 'escalation') {
        await cacheService.set(
          AgentType.SUPPORT,
          'respond',
          cacheKey,
          response,
          900 // 15 minutes TTL
        );
      }

      logger.info({
        ticketId: response.ticketId,
        responseType: body.responseType,
        sentiment: response.sentiment.customer,
        escalationRequired: response.escalation.required,
        processingTime: response.metadata.processingTime,
        msg: 'Support response generated'
      });

      reply.send(response);
    } catch (error) {
      logger.error('Failed to generate support response:', error);
      reply.code(500).send({
        error: 'RESPONSE_GENERATION_FAILED',
        message: 'Failed to generate support response',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private buildTicketContext(request: SupportRespondRequest): string {
    const { ticket, context } = request;

    let contextStr = `Ticket Information:
- Subject: ${ticket.subject}
- Description: ${ticket.description}
- Priority: ${ticket.priority || 'medium'}
- Category: ${ticket.category || 'general'}

Customer Information:
- Name: ${ticket.customer.name}
- Email: ${ticket.customer.email}
- Tier: ${ticket.customer.tier || 'FREE'}`;

    if (ticket.customer.history && ticket.customer.history.length > 0) {
      contextStr += `\n- Previous Issues: ${ticket.customer.history.join(', ')}`;
    }

    if (context?.previousInteractions && context.previousInteractions.length > 0) {
      contextStr += '\n\nPrevious Interactions:';
      context.previousInteractions.forEach((interaction, index) => {
        contextStr += `\n${index + 1}. ${interaction.type} on ${interaction.date}: ${interaction.summary}`;
      });
    }

    if (context?.knownIssues && context.knownIssues.length > 0) {
      contextStr += `\n\nKnown Issues: ${context.knownIssues.join(', ')}`;
    }

    if (context?.documentationLinks && context.documentationLinks.length > 0) {
      contextStr += `\n\nRelevant Documentation:\n${context.documentationLinks.join('\n')}`;
    }

    return contextStr;
  }

  private buildSystemPrompt(tone: 'empathetic' | 'professional' | 'technical' | 'friendly'): string {
    const toneInstructions = {
      empathetic: 'Show genuine understanding and concern for the customer\'s situation. Use warm, supportive language.',
      professional: 'Maintain a formal, courteous tone. Be clear and concise while remaining helpful.',
      technical: 'Provide detailed technical explanations. Use precise terminology while ensuring clarity.',
      friendly: 'Use a conversational, approachable tone. Be helpful and personable.'
    };

    return `You are a customer support specialist for Fine Print AI, an AI-powered legal document analysis platform.

Your role is to:
1. Provide helpful, accurate responses to customer inquiries
2. ${toneInstructions[tone]}
3. Offer clear solutions and actionable next steps
4. Maintain our commitment to privacy and security
5. Escalate when necessary

Key product information:
- Fine Print AI analyzes legal documents locally using AI
- We prioritize user privacy with no data retention
- Our platform detects 50+ problematic patterns in legal documents
- We offer Free, Starter, Professional, and Enterprise tiers

Response guidelines:
- Always acknowledge the customer's concern
- Provide a clear solution or explanation
- Offer additional resources when relevant
- Include internal notes for complex issues
- Suggest escalation if the issue requires specialized attention

Provide your response in JSON format:
{
  "subject": "string - email subject line",
  "body": "string - complete response to customer",
  "summary": "string - brief summary of the response",
  "suggestedActions": ["array", "of", "suggested", "follow-up", "actions"],
  "internalNotes": "string - notes for support team (optional)",
  "requiresEscalation": boolean,
  "escalationReason": "string - if escalation needed"
}`;
  }

  private buildUserPrompt(context: string, responseType: string): string {
    const typeInstructions = {
      initial: 'This is the first response to this ticket. Acknowledge receipt, show understanding, and provide initial guidance.',
      followup: 'This is a follow-up response. Reference previous interactions and provide additional assistance.',
      resolution: 'This ticket is being resolved. Provide the solution, confirm resolution, and offer further assistance if needed.',
      escalation: 'This ticket needs escalation. Explain why it\'s being escalated and set expectations for next steps.'
    };

    return `Generate a ${responseType} support response for the following ticket:

${context}

Instructions: ${typeInstructions[responseType as keyof typeof typeInstructions]}

Provide a complete, helpful response in the specified JSON format.`;
  }

  private getTemperatureForTone(tone: string): number {
    const temperatures = {
      empathetic: 0.7,
      professional: 0.3,
      technical: 0.2,
      friendly: 0.6
    };
    return temperatures[tone as keyof typeof temperatures] || 0.5;
  }

  private parseAIResponse(jsonString: string): any {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      logger.error('Failed to parse AI response:', error);
      // Return default structure
      return {
        subject: 'Re: Your support request',
        body: 'Thank you for contacting Fine Print AI support. We are reviewing your request and will respond shortly.',
        summary: 'Acknowledgment sent',
        suggestedActions: ['Review ticket', 'Follow up within 24 hours'],
        internalNotes: 'AI response parsing failed - manual review needed',
        requiresEscalation: true,
        escalationReason: 'Failed to generate proper response'
      };
    }
  }

  private async analyzeSentiment(
    request: SupportRespondRequest,
    aiResponse: any
  ): Promise<{
    customer: 'positive' | 'neutral' | 'negative';
    urgency: 'low' | 'medium' | 'high';
    satisfaction: number;
  }> {
    // Analyze customer sentiment from ticket description
    const description = request.ticket.description.toLowerCase();
    const priority = request.ticket.priority || 'medium';

    let customerSentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    let urgency: 'low' | 'medium' | 'high' = 'medium';
    let satisfaction = 70;

    // Simple sentiment analysis based on keywords
    const negativeWords = ['angry', 'frustrated', 'disappointed', 'terrible', 'awful', 'unacceptable', 'broken', 'failed'];
    const positiveWords = ['thank', 'appreciate', 'great', 'excellent', 'love', 'awesome', 'perfect', 'wonderful'];
    const urgentWords = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'blocked', 'stopping'];

    const hasNegative = negativeWords.some(word => description.includes(word));
    const hasPositive = positiveWords.some(word => description.includes(word));
    const hasUrgent = urgentWords.some(word => description.includes(word));

    if (hasNegative) {
      customerSentiment = 'negative';
      satisfaction = 30;
    } else if (hasPositive) {
      customerSentiment = 'positive';
      satisfaction = 85;
    }

    // Determine urgency
    if (hasUrgent || priority === 'urgent' || priority === 'high') {
      urgency = 'high';
    } else if (priority === 'low') {
      urgency = 'low';
    }

    // Adjust satisfaction based on customer tier
    if (request.ticket.customer.tier === 'ENTERPRISE' || request.ticket.customer.tier === 'PROFESSIONAL') {
      satisfaction = Math.max(satisfaction - 10, 20); // Enterprise customers expect more
    }

    return {
      customer: customerSentiment,
      urgency,
      satisfaction
    };
  }

  private determineEscalation(
    request: SupportRespondRequest,
    sentiment: any,
    aiResponse: any
  ): {
    required: boolean;
    reason?: string;
    department?: string;
  } {
    let required = false;
    let reason: string | undefined;
    let department: string | undefined;

    // Check AI response for escalation flag
    if (aiResponse.requiresEscalation) {
      required = true;
      reason = aiResponse.escalationReason || 'AI determined escalation needed';
    }

    // Check sentiment and urgency
    if (sentiment.customer === 'negative' && sentiment.urgency === 'high') {
      required = true;
      reason = 'High urgency negative sentiment';
      department = 'senior_support';
    }

    // Check customer tier
    if (request.ticket.customer.tier === 'ENTERPRISE' && sentiment.satisfaction < 50) {
      required = true;
      reason = 'Enterprise customer with low satisfaction';
      department = 'account_management';
    }

    // Check ticket priority
    if (request.ticket.priority === 'urgent') {
      required = true;
      reason = reason || 'Urgent priority ticket';
      department = department || 'senior_support';
    }

    // Check for specific categories that need escalation
    const escalationCategories = ['billing', 'security', 'data_breach', 'legal', 'compliance'];
    if (request.ticket.category && escalationCategories.includes(request.ticket.category.toLowerCase())) {
      required = true;
      reason = `${request.ticket.category} issue requires specialized attention`;
      department = request.ticket.category.toLowerCase();
    }

    return {
      required,
      reason,
      department
    };
  }
}

export const supportController = new SupportController();