/**
 * Sales Agent Controller
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  SalesQualifyRequest,
  SalesQualificationResponse,
  AgentType
} from '../types';
import { ollamaService } from '../services/ollama.service';
import { cacheService } from '../services/cache.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('sales-controller');

export class SalesController {
  async qualifyLead(
    request: FastifyRequest<{ Body: SalesQualifyRequest }>,
    reply: FastifyReply
  ): Promise<void> {
    const startTime = Date.now();
    const { body } = request;

    try {
      // Check cache first
      const cached = await cacheService.get<SalesQualificationResponse>(
        AgentType.SALES,
        'qualify',
        body
      );

      if (cached) {
        logger.info('Returning cached lead qualification');
        return reply.send(cached);
      }

      // Prepare context for the AI model
      const context = this.buildLeadContext(body);
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(context);

      // Generate qualification analysis
      const analysisJson = await ollamaService.generate(
        AgentType.SALES,
        userPrompt,
        systemPrompt,
        {
          temperature: 0.3, // Lower temperature for more consistent scoring
          format: 'json'
        }
      );

      // Parse the AI response
      const analysis = this.parseAnalysis(analysisJson);

      // Calculate final score and grade
      const score = this.calculateScore(body, analysis);
      const grade = this.calculateGrade(score);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(body, analysis, score);

      // Calculate propensity to buy
      const propensity = this.calculatePropensityToBuy(body, analysis, score);

      // Create response
      const response: SalesQualificationResponse = {
        id: uuidv4(),
        leadId: body.lead.id || uuidv4(),
        score,
        grade,
        qualified: score >= 70,
        reasoning: analysis.reasoning || 'Lead analysis completed',
        recommendations,
        propensityToBuy: propensity,
        metadata: {
          analyzedAt: new Date(),
          model: 'fine-print-sales',
          version: '1.0.0',
          processingTime: Date.now() - startTime
        }
      };

      // Cache the response
      await cacheService.set(
        AgentType.SALES,
        'qualify',
        body,
        response,
        1800 // 30 minutes TTL
      );

      logger.info({
        leadId: response.leadId,
        score: response.score,
        grade: response.grade,
        qualified: response.qualified,
        processingTime: response.metadata.processingTime,
        msg: 'Lead qualification completed'
      });

      reply.send(response);
    } catch (error) {
      logger.error('Failed to qualify lead:', error);
      reply.code(500).send({
        error: 'QUALIFICATION_FAILED',
        message: 'Failed to qualify lead',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private buildLeadContext(request: SalesQualifyRequest): string {
    const { lead, interactions, criteria } = request;

    let context = `Lead Information:
- Name: ${lead.name}
- Email: ${lead.email}
- Company: ${lead.company || 'Not specified'}
- Title: ${lead.title || 'Not specified'}
- Industry: ${lead.industry || 'Not specified'}
- Company Size: ${lead.companySize || 'Not specified'}
- Source: ${lead.source}
- Notes: ${lead.notes || 'None'}`;

    if (interactions && interactions.length > 0) {
      context += '\n\nInteraction History:';
      interactions.forEach((interaction, index) => {
        context += `\n${index + 1}. ${interaction.type} on ${interaction.date}`;
        if (interaction.duration) {
          context += ` (${interaction.duration} minutes)`;
        }
        if (interaction.notes) {
          context += `\n   Notes: ${interaction.notes}`;
        }
        if (interaction.outcome) {
          context += `\n   Outcome: ${interaction.outcome}`;
        }
      });
    }

    if (criteria) {
      context += '\n\nQualification Criteria:';
      if (criteria.budget) {
        context += `\n- Budget: $${criteria.budget.toLocaleString()}`;
      }
      if (criteria.timeline) {
        context += `\n- Timeline: ${criteria.timeline}`;
      }
      if (criteria.decisionMaker !== undefined) {
        context += `\n- Decision Maker: ${criteria.decisionMaker ? 'Yes' : 'No'}`;
      }
      if (criteria.painPoints && criteria.painPoints.length > 0) {
        context += `\n- Pain Points: ${criteria.painPoints.join(', ')}`;
      }
    }

    return context;
  }

  private buildSystemPrompt(): string {
    return `You are an expert sales qualification AI for Fine Print AI, a B2B SaaS platform that helps businesses analyze legal documents.

Your role is to evaluate leads based on:
1. BANT criteria (Budget, Authority, Need, Timeline)
2. Engagement level and interaction quality
3. Fit with our ideal customer profile
4. Likelihood to convert

Our ideal customers are:
- Privacy-conscious businesses
- Companies dealing with multiple legal documents
- Organizations prioritizing data security
- Businesses seeking to automate legal review processes

Scoring guidelines:
- 90-100: Hot lead, ready to buy, perfect fit
- 70-89: Qualified lead, good fit, needs nurturing
- 50-69: Moderate interest, requires development
- 30-49: Early stage, needs education
- 0-29: Poor fit or not ready

Provide your analysis in JSON format with the following structure:
{
  "fitScore": number (0-100),
  "engagementScore": number (0-100),
  "budgetScore": number (0-100),
  "timelineScore": number (0-100),
  "authorityScore": number (0-100),
  "needScore": number (0-100),
  "reasoning": "string explaining the qualification",
  "strengths": ["array", "of", "strengths"],
  "weaknesses": ["array", "of", "weaknesses"],
  "keyInsights": ["array", "of", "insights"]
}`;
  }

  private buildUserPrompt(context: string): string {
    return `Analyze this lead and provide a comprehensive qualification assessment:

${context}

Evaluate the lead based on all available information and provide your analysis in the specified JSON format.`;
  }

  private parseAnalysis(jsonString: string): any {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      logger.error('Failed to parse AI analysis:', error);
      // Return default structure if parsing fails
      return {
        fitScore: 50,
        engagementScore: 50,
        budgetScore: 50,
        timelineScore: 50,
        authorityScore: 50,
        needScore: 50,
        reasoning: 'Analysis completed with default scoring',
        strengths: [],
        weaknesses: [],
        keyInsights: []
      };
    }
  }

  private calculateScore(request: SalesQualifyRequest, analysis: any): number {
    const weights = {
      fit: 0.25,
      engagement: 0.15,
      budget: 0.20,
      timeline: 0.15,
      authority: 0.15,
      need: 0.10
    };

    // Base scores from AI analysis
    let fitScore = analysis.fitScore || 50;
    let engagementScore = analysis.engagementScore || 50;
    let budgetScore = analysis.budgetScore || 50;
    let timelineScore = analysis.timelineScore || 50;
    let authorityScore = analysis.authorityScore || 50;
    let needScore = analysis.needScore || 50;

    // Adjust scores based on concrete data
    if (request.interactions && request.interactions.length > 0) {
      const recentInteractions = request.interactions.filter(i => {
        const interactionDate = new Date(i.date);
        const daysSince = (Date.now() - interactionDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 30;
      });
      
      if (recentInteractions.length >= 3) {
        engagementScore = Math.min(100, engagementScore + 20);
      }
    }

    if (request.criteria?.decisionMaker === true) {
      authorityScore = Math.min(100, authorityScore + 30);
    }

    if (request.criteria?.timeline) {
      const timelineWords = request.criteria.timeline.toLowerCase();
      if (timelineWords.includes('immediate') || timelineWords.includes('asap')) {
        timelineScore = 95;
      } else if (timelineWords.includes('month')) {
        timelineScore = 80;
      } else if (timelineWords.includes('quarter')) {
        timelineScore = 60;
      }
    }

    // Calculate weighted score
    const weightedScore = 
      fitScore * weights.fit +
      engagementScore * weights.engagement +
      budgetScore * weights.budget +
      timelineScore * weights.timeline +
      authorityScore * weights.authority +
      needScore * weights.need;

    return Math.round(weightedScore);
  }

  private calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  private async generateRecommendations(
    request: SalesQualifyRequest,
    analysis: any,
    score: number
  ): Promise<{
    nextSteps: string[];
    talkingPoints: string[];
    concerns: string[];
    opportunities: string[];
  }> {
    const recommendations = {
      nextSteps: [] as string[],
      talkingPoints: [] as string[],
      concerns: analysis.weaknesses || [],
      opportunities: analysis.strengths || []
    };

    // Generate next steps based on score
    if (score >= 80) {
      recommendations.nextSteps = [
        'Schedule a demo immediately',
        'Send pricing proposal',
        'Connect with decision maker',
        'Prepare contract terms',
        'Set up proof of concept'
      ];
      recommendations.talkingPoints = [
        'ROI and cost savings from automated legal review',
        'Implementation timeline and onboarding process',
        'Success stories from similar companies',
        'Security and compliance certifications',
        'Customization options for their specific needs'
      ];
    } else if (score >= 60) {
      recommendations.nextSteps = [
        'Schedule a discovery call',
        'Send educational content',
        'Identify additional stakeholders',
        'Nurture with case studies',
        'Invite to webinar or event'
      ];
      recommendations.talkingPoints = [
        'Current pain points with legal document review',
        'Volume of documents processed monthly',
        'Existing tools and their limitations',
        'Budget allocation for legal tech',
        'Team structure and approval process'
      ];
    } else if (score >= 40) {
      recommendations.nextSteps = [
        'Add to nurture campaign',
        'Send introductory materials',
        'Schedule follow-up in 3 months',
        'Connect on LinkedIn',
        'Share relevant blog content'
      ];
      recommendations.talkingPoints = [
        'Industry trends in legal technology',
        'Common challenges in document review',
        'Benefits of AI-powered analysis',
        'Privacy and security advantages',
        'Future planning for legal operations'
      ];
    } else {
      recommendations.nextSteps = [
        'Add to long-term nurture list',
        'Send quarterly newsletter',
        'Monitor for trigger events',
        'Review in 6 months',
        'Keep as marketing qualified lead'
      ];
      recommendations.talkingPoints = [
        'General company introduction',
        'High-level value proposition',
        'Industry insights and trends',
        'Educational resources',
        'Future contact preferences'
      ];
    }

    return recommendations;
  }

  private calculatePropensityToBuy(
    request: SalesQualifyRequest,
    analysis: any,
    score: number
  ): {
    score: number;
    timeline: string;
    confidence: number;
  } {
    let propensityScore = score;
    let timeline = '6+ months';
    let confidence = 70;

    // Adjust based on specific indicators
    if (request.criteria?.timeline) {
      const timelineWords = request.criteria.timeline.toLowerCase();
      if (timelineWords.includes('immediate') || timelineWords.includes('urgent')) {
        propensityScore = Math.min(100, propensityScore + 15);
        timeline = '0-30 days';
        confidence = 85;
      } else if (timelineWords.includes('quarter')) {
        timeline = '1-3 months';
        confidence = 75;
      } else if (timelineWords.includes('year')) {
        timeline = '6-12 months';
        confidence = 60;
      }
    }

    if (request.criteria?.budget && request.criteria.budget >= 50000) {
      propensityScore = Math.min(100, propensityScore + 10);
      confidence = Math.min(95, confidence + 10);
    }

    if (request.criteria?.decisionMaker === true) {
      propensityScore = Math.min(100, propensityScore + 10);
      confidence = Math.min(95, confidence + 5);
    }

    // Adjust confidence based on data completeness
    const dataPoints = [
      request.lead.company,
      request.lead.title,
      request.lead.industry,
      request.lead.companySize,
      request.interactions?.length,
      request.criteria?.budget,
      request.criteria?.timeline,
      request.criteria?.painPoints?.length
    ].filter(Boolean).length;

    confidence = Math.min(95, confidence * (dataPoints / 8));

    return {
      score: Math.round(propensityScore),
      timeline,
      confidence: Math.round(confidence)
    };
  }
}

export const salesController = new SalesController();