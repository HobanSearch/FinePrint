import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { Lead, Opportunity, Document } from '@fineprintai/shared-types';
import { config } from '../config';

interface ProposalTemplate {
  id: string;
  name: string;
  type: 'standard' | 'enterprise' | 'custom';
  content: string;
  variables: string[];
  sections: ProposalSection[];
}

interface ProposalSection {
  id: string;
  title: string;
  content: string;
  order: number;
  required: boolean;
}

interface ProposalRequest {
  opportunityId: string;
  templateId?: string;
  customizations?: Record<string, any>;
  sections?: string[];
}

export class ProposalGenerationService {
  private prisma: PrismaClient;
  private openai: OpenAI;
  private templates: Map<string, ProposalTemplate> = new Map();

  constructor() {
    this.prisma = new PrismaClient();
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
  }

  async generateProposal(request: ProposalRequest): Promise<{
    id: string;
    content: string;
    sections: any[];
    metadata: any;
  }> {
    const opportunity = await this.getOpportunityDetails(request.opportunityId);
    const template = await this.selectTemplate(opportunity, request.templateId);
    
    // Generate personalized content
    const personalizedSections = await this.personalizeSections(
      opportunity,
      template.sections,
      request.customizations
    );

    // AI-enhanced content generation
    const enhancedSections = await this.enhanceWithAI(opportunity, personalizedSections);

    // Compile final proposal
    const proposalContent = this.compileFinalProposal(enhancedSections);
    
    // Save proposal
    const proposalId = await this.saveProposal({
      opportunityId: request.opportunityId,
      content: proposalContent,
      sections: enhancedSections,
      templateId: template.id,
    });

    return {
      id: proposalId,
      content: proposalContent,
      sections: enhancedSections,
      metadata: {
        templateUsed: template.name,
        generatedAt: new Date().toISOString(),
        opportunityValue: opportunity.value,
        estimatedCloseDate: opportunity.expectedCloseDate,
      },
    };
  }

  async generatePricingOptions(opportunityId: string): Promise<{
    tiers: PricingTier[];
    recommendations: string[];
  }> {
    const opportunity = await this.getOpportunityDetails(opportunityId);
    
    // Generate 3-tier pricing strategy
    const tiers = await this.generateTieredPricing(opportunity);
    const recommendations = await this.generatePricingRecommendations(opportunity, tiers);

    return { tiers, recommendations };
  }

  async generateExecutiveSummary(opportunityId: string): Promise<string> {
    const opportunity = await this.getOpportunityDetails(opportunityId);
    
    const prompt = `
      Create an executive summary for a Fine Print AI proposal:
      
      Company: ${opportunity.lead?.company || 'the client'}
      Contact: ${opportunity.lead?.firstName} ${opportunity.lead?.lastName} (${opportunity.lead?.title})
      Opportunity Value: $${opportunity.value?.toLocaleString()}
      Industry: ${this.inferIndustry(opportunity.lead?.company)}
      
      Key Business Needs:
      - Legal document analysis and risk assessment
      - Compliance monitoring and reporting
      - Time savings on contract review
      - Protection from problematic clauses
      
      Fine Print AI Solutions:
      - AI-powered document analysis (50+ risk patterns)
      - Real-time monitoring of terms changes
      - Automated compliance reporting
      - Risk scoring and recommendations
      - Local LLM processing for privacy
      
      Write a compelling executive summary that:
      1. Addresses their specific business challenges
      2. Positions Fine Print AI as the solution
      3. Highlights ROI and business value
      4. Creates urgency for decision-making
      
      Keep it under 300 words, professional but engaging.
    `;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a sales proposal expert specializing in B2B SaaS solutions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800,
      });

      return response.choices[0]?.message?.content || this.getDefaultExecutiveSummary(opportunity);
    } catch (error) {
      console.error('Executive summary generation error:', error);
      return this.getDefaultExecutiveSummary(opportunity);
    }
  }

  async generateROIAnalysis(opportunityId: string): Promise<{
    currentCosts: any;
    projectedSavings: any;
    roi: number;
    paybackPeriod: number;
    breakdown: any[];
  }> {
    const opportunity = await this.getOpportunityDetails(opportunityId);
    
    // Estimate current costs
    const currentCosts = this.estimateCurrentCosts(opportunity);
    
    // Calculate projected savings
    const projectedSavings = this.calculateProjectedSavings(opportunity, currentCosts);
    
    // Calculate ROI
    const annualSavings = projectedSavings.total_annual_savings;
    const solutionCost = opportunity.value || 50000; // Default if no value
    const roi = ((annualSavings - solutionCost) / solutionCost) * 100;
    const paybackPeriod = solutionCost / (annualSavings / 12); // months

    const breakdown = [
      {
        category: 'Legal Review Time Savings',
        current_cost: currentCosts.legal_review_costs,
        savings: projectedSavings.time_savings,
        description: 'Reduce manual document review time by 80%',
      },
      {
        category: 'Risk Mitigation',
        current_cost: currentCosts.risk_costs,
        savings: projectedSavings.risk_mitigation,
        description: 'Avoid costly legal issues and compliance violations',
      },
      {
        category: 'Process Efficiency',
        current_cost: currentCosts.process_costs,
        savings: projectedSavings.efficiency_gains,
        description: 'Streamline contract workflows and approvals',
      },
    ];

    return {
      currentCosts,
      projectedSavings,
      roi: Math.round(roi),
      paybackPeriod: Math.round(paybackPeriod * 10) / 10,
      breakdown,
    };
  }

  async customizeForIndustry(opportunityId: string, industry: string): Promise<{
    customizations: any;
    case_studies: any[];
    compliance_focus: string[];
  }> {
    const industryCustomizations = {
      healthcare: {
        compliance_focus: ['HIPAA', 'FDA', 'HITECH'],
        use_cases: ['Patient data agreements', 'Vendor contracts', 'Privacy policies'],
        risk_priorities: ['Data privacy', 'Patient safety', 'Regulatory compliance'],
      },
      finance: {
        compliance_focus: ['SOX', 'PCI DSS', 'GDPR', 'CCPA'],
        use_cases: ['Customer agreements', 'Vendor contracts', 'Privacy notices'],
        risk_priorities: ['Financial liability', 'Data security', 'Regulatory reporting'],
      },
      technology: {
        compliance_focus: ['GDPR', 'CCPA', 'SOC 2'],
        use_cases: ['SaaS agreements', 'Privacy policies', 'Terms of service'],
        risk_priorities: ['IP protection', 'Data usage', 'Liability limits'],
      },
      legal: {
        compliance_focus: ['Professional liability', 'Client confidentiality'],
        use_cases: ['Client agreements', 'Vendor contracts', 'Professional services'],
        risk_priorities: ['Professional liability', 'Conflict of interest', 'Fee arrangements'],
      },
    };

    const customizations = industryCustomizations[industry as keyof typeof industryCustomizations] || 
                          industryCustomizations.technology;

    const casStudies = await this.getIndustryCaseStudies(industry);

    return {
      customizations,
      case_studies: casStudies,
      compliance_focus: customizations.compliance_focus,
    };
  }

  private async getOpportunityDetails(opportunityId: string): Promise<any> {
    const opportunity = await this.prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        lead: {
          include: {
            company: true,
            activities: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        },
        contacts: true,
        activities: true,
      },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    return opportunity;
  }

  private async selectTemplate(opportunity: any, templateId?: string): Promise<ProposalTemplate> {
    if (templateId && this.templates.has(templateId)) {
      return this.templates.get(templateId)!;
    }

    // Auto-select based on opportunity value and company size
    const value = opportunity.value || 0;
    
    if (value > 100000) {
      return this.getEnterpriseTemplate();
    } else if (value > 25000) {
      return this.getStandardTemplate();
    } else {
      return this.getBasicTemplate();
    }
  }

  private async personalizeSections(
    opportunity: any,
    sections: ProposalSection[],
    customizations?: Record<string, any>
  ): Promise<any[]> {
    const variables = {
      companyName: opportunity.lead?.company?.name || opportunity.lead?.company || 'your organization',
      contactName: `${opportunity.lead?.firstName} ${opportunity.lead?.lastName}`,
      contactTitle: opportunity.lead?.title || 'there',
      opportunityValue: opportunity.value ? `$${opportunity.value.toLocaleString()}` : '$50,000',
      expectedCloseDate: opportunity.expectedCloseDate?.toLocaleDateString() || 'Q4 2024',
      industry: this.inferIndustry(opportunity.lead?.company),
      employeeCount: this.estimateEmployeeCount(opportunity.lead?.company),
      ...customizations,
    };

    return sections.map(section => ({
      ...section,
      content: this.replaceVariables(section.content, variables),
      personalized: true,
    }));
  }

  private async enhanceWithAI(opportunity: any, sections: any[]): Promise<any[]> {
    const enhancedSections = [];

    for (const section of sections) {
      if (section.title.includes('Business Case') || section.title.includes('ROI')) {
        const enhanced = await this.enhanceSectionWithAI(opportunity, section);
        enhancedSections.push(enhanced);
      } else {
        enhancedSections.push(section);
      }
    }

    return enhancedSections;
  }

  private async enhanceSectionWithAI(opportunity: any, section: any): Promise<any> {
    const prompt = `
      Enhance this proposal section with specific business value for the client:
      
      Company: ${opportunity.lead?.company}
      Industry: ${this.inferIndustry(opportunity.lead?.company)}
      Current Section: ${section.content}
      
      Make it more compelling by:
      1. Adding industry-specific benefits
      2. Including quantifiable outcomes
      3. Addressing potential objections
      4. Creating urgency
      
      Keep the same structure but make it more persuasive and specific.
    `;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
        max_tokens: 1000,
      });

      return {
        ...section,
        content: response.choices[0]?.message?.content || section.content,
        enhanced: true,
      };
    } catch (error) {
      console.error('Section enhancement error:', error);
      return section;
    }
  }

  private compileFinalProposal(sections: any[]): string {
    const sortedSections = sections.sort((a, b) => a.order - b.order);
    
    let proposal = `# ${sortedSections[0]?.companyName || 'Fine Print AI'} Proposal\n\n`;
    proposal += `Generated on: ${new Date().toLocaleDateString()}\n\n`;
    
    for (const section of sortedSections) {
      proposal += `## ${section.title}\n\n`;
      proposal += `${section.content}\n\n`;
    }
    
    return proposal;
  }

  private async saveProposal(data: any): Promise<string> {
    const proposal = await this.prisma.document.create({
      data: {
        name: `Proposal - ${data.opportunityId}`,
        type: 'proposal',
        url: '', // Would be set after saving to storage
        size: data.content.length,
        mimeType: 'text/markdown',
        tags: ['proposal', 'generated'],
        sharedWith: [],
        downloadCount: 0,
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
        // Store in metadata or separate table
        metadata: {
          opportunityId: data.opportunityId,
          templateId: data.templateId,
          content: data.content,
        },
      },
    });

    return proposal.id;
  }

  private async generateTieredPricing(opportunity: any): Promise<PricingTier[]> {
    const basePrice = opportunity.value || 50000;
    
    return [
      {
        name: 'Starter',
        price: Math.round(basePrice * 0.6),
        features: [
          'Document analysis (100/month)',
          'Basic risk patterns',
          'Email support',
          'Standard SLA',
        ],
        recommended: false,
      },
      {
        name: 'Professional',
        price: basePrice,
        features: [
          'Unlimited document analysis',
          'All risk patterns',
          'Real-time monitoring',
          'Priority support',
          'Custom reports',
        ],
        recommended: true,
      },
      {
        name: 'Enterprise',
        price: Math.round(basePrice * 1.5),
        features: [
          'Everything in Professional',
          'Custom risk patterns',
          'API access',
          'Dedicated success manager',
          'SLA guarantee',
          'On-premise option',
        ],
        recommended: false,
      },
    ];
  }

  private async generatePricingRecommendations(opportunity: any, tiers: PricingTier[]): Promise<string[]> {
    const recommendations = [];
    const companySize = this.estimateEmployeeCount(opportunity.lead?.company);
    
    if (companySize > 500) {
      recommendations.push('Enterprise tier recommended for large organizations with complex compliance needs');
    } else if (companySize > 50) {
      recommendations.push('Professional tier offers the best value for growing companies');
    } else {
      recommendations.push('Starter tier is perfect for getting started with automated document analysis');
    }

    if (opportunity.value > 75000) {
      recommendations.push('Consider annual payment for additional 15% discount');
    }

    recommendations.push('All tiers include onboarding and training at no additional cost');
    
    return recommendations;
  }

  // Helper methods
  private replaceVariables(content: string, variables: Record<string, any>): string {
    let result = content;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    }
    return result;
  }

  private inferIndustry(company?: string): string {
    if (!company) return 'Technology';
    
    const companyLower = company.toLowerCase();
    if (companyLower.includes('health') || companyLower.includes('medical')) return 'Healthcare';
    if (companyLower.includes('bank') || companyLower.includes('financial')) return 'Finance';
    if (companyLower.includes('law') || companyLower.includes('legal')) return 'Legal';
    if (companyLower.includes('tech') || companyLower.includes('software')) return 'Technology';
    
    return 'Technology';
  }

  private estimateEmployeeCount(company?: string): number {
    // Simple estimation - in production, use company enrichment data
    if (!company) return 50;
    
    const companyLower = company.toLowerCase();
    if (companyLower.includes('corp') || companyLower.includes('inc')) return 500;
    if (companyLower.includes('llc') || companyLower.includes('ltd')) return 100;
    
    return 50;
  }

  private estimateCurrentCosts(opportunity: any): any {
    const employeeCount = this.estimateEmployeeCount(opportunity.lead?.company);
    const avgLegalHourlyRate = 400;
    const hoursPerMonth = Math.max(10, employeeCount / 10); // Scale with size
    
    return {
      legal_review_costs: avgLegalHourlyRate * hoursPerMonth * 12, // Annual
      risk_costs: 25000, // Estimated annual risk from missed issues
      process_costs: 15000, // Process inefficiency costs
      total_annual_costs: (avgLegalHourlyRate * hoursPerMonth * 12) + 25000 + 15000,
    };
  }

  private calculateProjectedSavings(opportunity: any, currentCosts: any): any {
    return {
      time_savings: currentCosts.legal_review_costs * 0.8, // 80% time savings
      risk_mitigation: currentCosts.risk_costs * 0.6, // 60% risk reduction
      efficiency_gains: currentCosts.process_costs * 0.7, // 70% efficiency improvement
      total_annual_savings: (currentCosts.legal_review_costs * 0.8) + 
                           (currentCosts.risk_costs * 0.6) + 
                           (currentCosts.process_costs * 0.7),
    };
  }

  private async getIndustryCaseStudies(industry: string): Promise<any[]> {
    // Return relevant case studies based on industry
    const caseStudies = {
      healthcare: [
        {
          company: 'Regional Health System',
          challenge: 'HIPAA compliance in vendor contracts',
          solution: 'Automated HIPAA risk assessment',
          result: '90% reduction in compliance review time',
        },
      ],
      finance: [
        {
          company: 'Community Bank',
          challenge: 'SOX compliance documentation',
          solution: 'Automated compliance monitoring',
          result: '95% faster compliance reporting',
        },
      ],
      // Add more case studies for other industries
    };

    return caseStudies[industry as keyof typeof caseStudies] || [];
  }

  private getDefaultExecutiveSummary(opportunity: any): string {
    return `
      ${opportunity.lead?.company || 'Your organization'} faces increasing complexity in managing legal documents and ensuring compliance. Fine Print AI provides an intelligent solution that automates document analysis, identifies risks, and ensures compliance - saving time and reducing legal exposure.

      Our AI-powered platform analyzes documents in seconds, identifying over 50 types of problematic clauses while maintaining complete privacy through local processing. This solution will help ${opportunity.lead?.company || 'your organization'} reduce legal review time by 80% while improving risk detection accuracy.

      We recommend moving forward quickly to realize these benefits and protect your organization from potential legal issues.
    `;
  }

  // Template methods
  private getEnterpriseTemplate(): ProposalTemplate {
    return {
      id: 'enterprise',
      name: 'Enterprise Proposal Template',
      type: 'enterprise',
      content: '',
      variables: ['companyName', 'contactName', 'opportunityValue'],
      sections: [
        {
          id: 'exec-summary',
          title: 'Executive Summary',
          content: 'Executive summary content...',
          order: 1,
          required: true,
        },
        // Add more sections
      ],
    };
  }

  private getStandardTemplate(): ProposalTemplate {
    return {
      id: 'standard',
      name: 'Standard Proposal Template',
      type: 'standard',
      content: '',
      variables: ['companyName', 'contactName'],
      sections: [
        {
          id: 'exec-summary',
          title: 'Executive Summary',
          content: 'Standard executive summary...',
          order: 1,
          required: true,
        },
        // Add more sections
      ],
    };
  }

  private getBasicTemplate(): ProposalTemplate {
    return {
      id: 'basic',
      name: 'Basic Proposal Template',
      type: 'standard',
      content: '',
      variables: ['companyName', 'contactName'],
      sections: [
        {
          id: 'overview',
          title: 'Solution Overview',
          content: 'Basic solution overview...',
          order: 1,
          required: true,
        },
        // Add more sections
      ],
    };
  }
}

interface PricingTier {
  name: string;
  price: number;
  features: string[];
  recommended: boolean;
}