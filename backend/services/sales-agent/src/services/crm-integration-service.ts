import { PrismaClient } from '@prisma/client';
import { Client as HubSpotClient } from '@hubspot/api-client';
import { Connection } from '@salesforce/core';
import Pipedrive from 'pipedrive';
import { Lead, Opportunity, Contact, Activity } from '@fineprintai/shared-types';
import { config } from '../config';

interface CrmConfig {
  type: 'hubspot' | 'salesforce' | 'pipedrive';
  credentials: Record<string, string>;
  mappings: Record<string, string>;
  syncSettings: {
    enabled: boolean;
    direction: 'bidirectional' | 'to_crm' | 'from_crm';
    frequency: number; // minutes
  };
}

export class CrmIntegrationService {
  private prisma: PrismaClient;
  private hubspot?: HubSpotClient;
  private salesforce?: Connection;
  private pipedrive?: any;
  private crmConfigs: Map<string, CrmConfig> = new Map();

  constructor() {
    this.prisma = new PrismaClient();
  }

  async initialize() {
    // Initialize CRM connections
    if (config.hubspotApiKey) {
      this.hubspot = new HubSpotClient({ accessToken: config.hubspotApiKey });
    }

    if (config.salesforceClientId && config.salesforceClientSecret) {
      this.salesforce = await Connection.create({
        authInfo: {
          username: config.salesforceUsername!,
          password: config.salesforcePassword!,
          clientId: config.salesforceClientId,
          clientSecret: config.salesforceClientSecret,
        },
      });
    }

    if (config.pipedriveApiToken) {
      this.pipedrive = new Pipedrive.ApiClient();
      this.pipedrive.authentications.api_key.apiKey = config.pipedriveApiToken;
    }

    // Load CRM configurations
    await this.loadCrmConfigurations();
  }

  async syncLeadToCrm(leadId: string, crmType: 'hubspot' | 'salesforce' | 'pipedrive'): Promise<string> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        activities: true,
        opportunities: true,
      },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    switch (crmType) {
      case 'hubspot':
        return await this.syncToHubSpot(lead);
      case 'salesforce':
        return await this.syncToSalesforce(lead);
      case 'pipedrive':
        return await this.syncToPipedrive(lead);
      default:
        throw new Error(`Unsupported CRM: ${crmType}`);
    }
  }

  async syncOpportunityToCrm(opportunityId: string, crmType: string): Promise<string> {
    const opportunity = await this.prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        lead: true,
        activities: true,
        contacts: true,
      },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    switch (crmType) {
      case 'hubspot':
        return await this.syncOpportunityToHubSpot(opportunity);
      case 'salesforce':
        return await this.syncOpportunityToSalesforce(opportunity);
      case 'pipedrive':
        return await this.syncOpportunityToPipedrive(opportunity);
      default:
        throw new Error(`Unsupported CRM: ${crmType}`);
    }
  }

  private async syncToHubSpot(lead: any): Promise<string> {
    if (!this.hubspot) {
      throw new Error('HubSpot not configured');
    }

    try {
      const contactProperties = {
        email: lead.email,
        firstname: lead.firstName,
        lastname: lead.lastName,
        company: lead.company,
        jobtitle: lead.title,
        lead_source: lead.source,
        hs_lead_status: this.mapStageToHubSpot(lead.stage),
        fineprintai_score: lead.score.toString(),
        fineprintai_probability: lead.probability.toString(),
        fineprintai_estimated_value: lead.estimatedValue?.toString(),
      };

      // Check if contact already exists
      let contactId = lead.hubspotContactId;
      
      if (contactId) {
        // Update existing contact
        await this.hubspot.crm.contacts.basicApi.update(contactId, {
          properties: contactProperties,
        });
      } else {
        // Create new contact
        const response = await this.hubspot.crm.contacts.basicApi.create({
          properties: contactProperties,
        });
        contactId = response.id;

        // Store the CRM ID
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { hubspotContactId: contactId },
        });
      }

      // Sync activities as engagements
      for (const activity of lead.activities || []) {
        await this.syncActivityToHubSpot(contactId, activity);
      }

      return contactId;
    } catch (error) {
      console.error('HubSpot sync error:', error);
      throw new Error(`Failed to sync to HubSpot: ${error.message}`);
    }
  }

  private async syncToSalesforce(lead: any): Promise<string> {
    if (!this.salesforce) {
      throw new Error('Salesforce not configured');
    }

    try {
      const leadData = {
        Email: lead.email,
        FirstName: lead.firstName,
        LastName: lead.lastName,
        Company: lead.company || 'Unknown',
        Title: lead.title,
        LeadSource: lead.source,
        Status: this.mapStageToSalesforce(lead.stage),
        FinePrintAI_Score__c: lead.score,
        FinePrintAI_Probability__c: lead.probability,
        FinePrintAI_Estimated_Value__c: lead.estimatedValue,
      };

      let salesforceId = lead.salesforceLeadId;

      if (salesforceId) {
        // Update existing lead
        await this.salesforce.sobject('Lead').update({
          Id: salesforceId,
          ...leadData,
        });
      } else {
        // Create new lead
        const result = await this.salesforce.sobject('Lead').create(leadData);
        salesforceId = result.id;

        // Store the CRM ID
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { salesforceLeadId: salesforceId },
        });
      }

      // Sync activities as tasks
      for (const activity of lead.activities || []) {
        await this.syncActivityToSalesforce(salesforceId, activity, 'Lead');
      }

      return salesforceId;
    } catch (error) {
      console.error('Salesforce sync error:', error);
      throw new Error(`Failed to sync to Salesforce: ${error.message}`);
    }
  }

  private async syncToPipedrive(lead: any): Promise<string> {
    if (!this.pipedrive) {
      throw new Error('Pipedrive not configured');
    }

    try {
      const personData = {
        name: `${lead.firstName} ${lead.lastName}`,
        email: [{ value: lead.email, primary: true }],
        org_name: lead.company,
        job_title: lead.title,
        'fineprintai_score': lead.score,
        'fineprintai_stage': lead.stage,
        'fineprintai_probability': lead.probability,
      };

      const personsApi = new Pipedrive.PersonsApi(this.pipedrive);
      let personId = lead.pipedrivePersonId;

      if (personId) {
        // Update existing person
        await personsApi.updatePerson(personId, { ...personData });
      } else {
        // Create new person
        const response = await personsApi.addPerson({ ...personData });
        personId = response.data.id;

        // Store the CRM ID
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { pipedrivePersonId: personId },
        });
      }

      // Create deal if lead is qualified
      if (lead.stage !== 'new' && lead.estimatedValue > 0) {
        await this.createPipedriveDeal(personId, lead);
      }

      return personId.toString();
    } catch (error) {
      console.error('Pipedrive sync error:', error);
      throw new Error(`Failed to sync to Pipedrive: ${error.message}`);
    }
  }

  private async syncOpportunityToHubSpot(opportunity: any): Promise<string> {
    if (!this.hubspot) {
      throw new Error('HubSpot not configured');
    }

    try {
      const dealProperties = {
        dealname: opportunity.name,
        amount: opportunity.value.toString(),
        dealstage: this.mapOpportunityStageToHubSpot(opportunity.stage),
        probability: opportunity.probability.toString(),
        closedate: opportunity.expectedCloseDate.toISOString(),
        fineprintai_opportunity_id: opportunity.id,
      };

      let dealId = opportunity.hubspotDealId;

      if (dealId) {
        // Update existing deal
        await this.hubspot.crm.deals.basicApi.update(dealId, {
          properties: dealProperties,
        });
      } else {
        // Create new deal
        const response = await this.hubspot.crm.deals.basicApi.create({
          properties: dealProperties,
        });
        dealId = response.id;

        // Store the CRM ID
        await this.prisma.opportunity.update({
          where: { id: opportunity.id },
          data: { hubspotDealId: dealId },
        });
      }

      // Associate with contact
      if (opportunity.lead?.hubspotContactId) {
        await this.hubspot.crm.deals.associationsApi.create(
          dealId,
          'contacts',
          opportunity.lead.hubspotContactId,
          'deal_to_contact'
        );
      }

      return dealId;
    } catch (error) {
      console.error('HubSpot opportunity sync error:', error);
      throw new Error(`Failed to sync opportunity to HubSpot: ${error.message}`);
    }
  }

  private async syncOpportunityToSalesforce(opportunity: any): Promise<string> {
    if (!this.salesforce) {
      throw new Error('Salesforce not configured');
    }

    try {
      const opportunityData = {
        Name: opportunity.name,
        Amount: opportunity.value,
        StageName: this.mapOpportunityStageToSalesforce(opportunity.stage),
        Probability: opportunity.probability,
        CloseDate: opportunity.expectedCloseDate.toISOString().split('T')[0],
        FinePrintAI_Opportunity_ID__c: opportunity.id,
      };

      let salesforceId = opportunity.salesforceOpportunityId;

      if (salesforceId) {
        // Update existing opportunity
        await this.salesforce.sobject('Opportunity').update({
          Id: salesforceId,
          ...opportunityData,
        });
      } else {
        // Create new opportunity
        const result = await this.salesforce.sobject('Opportunity').create(opportunityData);
        salesforceId = result.id;

        // Store the CRM ID
        await this.prisma.opportunity.update({
          where: { id: opportunity.id },
          data: { salesforceOpportunityId: salesforceId },
        });
      }

      return salesforceId;
    } catch (error) {
      console.error('Salesforce opportunity sync error:', error);
      throw new Error(`Failed to sync opportunity to Salesforce: ${error.message}`);
    }
  }

  private async syncOpportunityToPipedrive(opportunity: any): Promise<string> {
    if (!this.pipedrive) {
      throw new Error('Pipedrive not configured');
    }

    try {
      const dealData = {
        title: opportunity.name,
        value: opportunity.value,
        currency: 'USD',
        stage_id: this.mapOpportunityStageToStageId(opportunity.stage),
        probability: opportunity.probability,
        expected_close_date: opportunity.expectedCloseDate.toISOString().split('T')[0],
        person_id: opportunity.lead?.pipedrivePersonId,
      };

      const dealsApi = new Pipedrive.DealsApi(this.pipedrive);
      let dealId = opportunity.pipedriveDealId;

      if (dealId) {
        // Update existing deal
        await dealsApi.updateDeal(dealId, dealData);
      } else {
        // Create new deal
        const response = await dealsApi.addDeal(dealData);
        dealId = response.data.id;

        // Store the CRM ID
        await this.prisma.opportunity.update({
          where: { id: opportunity.id },
          data: { pipedriveDealId: dealId },
        });
      }

      return dealId.toString();
    } catch (error) {
      console.error('Pipedrive opportunity sync error:', error);
      throw new Error(`Failed to sync opportunity to Pipedrive: ${error.message}`);
    }
  }

  // Bidirectional sync methods
  async syncFromCrm(crmType: string): Promise<void> {
    switch (crmType) {
      case 'hubspot':
        await this.syncFromHubSpot();
        break;
      case 'salesforce':
        await this.syncFromSalesforce();
        break;
      case 'pipedrive':
        await this.syncFromPipedrive();
        break;
      default:
        throw new Error(`Unsupported CRM: ${crmType}`);
    }
  }

  private async syncFromHubSpot(): Promise<void> {
    if (!this.hubspot) return;

    try {
      // Get recent contacts
      const contacts = await this.hubspot.crm.contacts.basicApi.getPage(100, undefined, [
        'email', 'firstname', 'lastname', 'company', 'jobtitle', 'hs_lead_status',
        'createdate', 'lastmodifieddate'
      ]);

      for (const contact of contacts.results) {
        await this.importContactFromHubSpot(contact);
      }

      // Get recent deals
      const deals = await this.hubspot.crm.deals.basicApi.getPage(100, undefined, [
        'dealname', 'amount', 'dealstage', 'probability', 'closedate', 'createdate'
      ]);

      for (const deal of deals.results) {
        await this.importDealFromHubSpot(deal);
      }
    } catch (error) {
      console.error('HubSpot import error:', error);
    }
  }

  private async syncFromSalesforce(): Promise<void> {
    if (!this.salesforce) return;

    try {
      // Get recent leads
      const leads = await this.salesforce.query(`
        SELECT Id, Email, FirstName, LastName, Company, Title, Status, CreatedDate, LastModifiedDate
        FROM Lead
        WHERE LastModifiedDate > LAST_N_DAYS:7
      `);

      for (const lead of leads.records) {
        await this.importLeadFromSalesforce(lead);
      }

      // Get recent opportunities
      const opportunities = await this.salesforce.query(`
        SELECT Id, Name, Amount, StageName, Probability, CloseDate, CreatedDate
        FROM Opportunity
        WHERE LastModifiedDate > LAST_N_DAYS:7
      `);

      for (const opportunity of opportunities.records) {
        await this.importOpportunityFromSalesforce(opportunity);
      }
    } catch (error) {
      console.error('Salesforce import error:', error);
    }
  }

  private async syncFromPipedrive(): Promise<void> {
    if (!this.pipedrive) return;

    try {
      const personsApi = new Pipedrive.PersonsApi(this.pipedrive);
      const dealsApi = new Pipedrive.DealsApi(this.pipedrive);

      // Get recent persons
      const persons = await personsApi.getPersons();
      for (const person of persons.data.slice(0, 100)) {
        await this.importPersonFromPipedrive(person);
      }

      // Get recent deals
      const deals = await dealsApi.getDeals();
      for (const deal of deals.data.slice(0, 100)) {
        await this.importDealFromPipedrive(deal);
      }
    } catch (error) {
      console.error('Pipedrive import error:', error);
    }
  }

  // Helper methods for field mapping
  private mapStageToHubSpot(stage: string): string {
    const mapping = {
      'new': 'lead',
      'contacted': 'marketingqualifiedlead',
      'qualified': 'salesqualifiedlead',
      'demo': 'opportunity',
      'proposal': 'qualifiedtobuy',
      'negotiation': 'contractsent',
      'closed_won': 'closedwon',
      'closed_lost': 'closedlost',
    };
    return mapping[stage as keyof typeof mapping] || 'lead';
  }

  private mapStageToSalesforce(stage: string): string {
    const mapping = {
      'new': 'Open - Not Contacted',
      'contacted': 'Working - Contacted',
      'qualified': 'Qualified',
      'demo': 'Qualified',
      'proposal': 'Qualified',
      'negotiation': 'Qualified',
      'closed_won': 'Closed - Converted',
      'closed_lost': 'Closed - Not Converted',
    };
    return mapping[stage as keyof typeof mapping] || 'Open - Not Contacted';
  }

  private mapOpportunityStageToHubSpot(stage: string): string {
    const mapping = {
      'discovery': 'qualifiedtobuy',
      'demo': 'presentationscheduled',
      'proposal': 'decisionmakerboughtin',
      'negotiation': 'contractsent',
      'contract': 'contractsent',
      'closed_won': 'closedwon',
      'closed_lost': 'closedlost',
    };
    return mapping[stage as keyof typeof mapping] || 'qualifiedtobuy';
  }

  private mapOpportunityStageToSalesforce(stage: string): string {
    const mapping = {
      'discovery': 'Qualification',
      'demo': 'Needs Analysis',
      'proposal': 'Proposal/Price Quote',
      'negotiation': 'Negotiation/Review',
      'contract': 'Negotiation/Review',
      'closed_won': 'Closed Won',
      'closed_lost': 'Closed Lost',
    };
    return mapping[stage as keyof typeof mapping] || 'Qualification';
  }

  private mapOpportunityStageToStageId(stage: string): number {
    // This would map to actual Pipedrive stage IDs
    const mapping = {
      'discovery': 1,
      'demo': 2,
      'proposal': 3,
      'negotiation': 4,
      'contract': 5,
      'closed_won': 6,
      'closed_lost': 7,
    };
    return mapping[stage as keyof typeof mapping] || 1;
  }

  // Import methods (placeholder implementations)
  private async importContactFromHubSpot(contact: any): Promise<void> {
    // Implementation for importing HubSpot contact
  }

  private async importDealFromHubSpot(deal: any): Promise<void> {
    // Implementation for importing HubSpot deal
  }

  private async importLeadFromSalesforce(lead: any): Promise<void> {
    // Implementation for importing Salesforce lead
  }

  private async importOpportunityFromSalesforce(opportunity: any): Promise<void> {
    // Implementation for importing Salesforce opportunity
  }

  private async importPersonFromPipedrive(person: any): Promise<void> {
    // Implementation for importing Pipedrive person
  }

  private async importDealFromPipedrive(deal: any): Promise<void> {
    // Implementation for importing Pipedrive deal
  }

  private async syncActivityToHubSpot(contactId: string, activity: any): Promise<void> {
    // Implementation for syncing activities to HubSpot
  }

  private async syncActivityToSalesforce(leadId: string, activity: any, objectType: string): Promise<void> {
    // Implementation for syncing activities to Salesforce
  }

  private async createPipedriveDeal(personId: number, lead: any): Promise<void> {
    // Implementation for creating Pipedrive deal
  }

  private async loadCrmConfigurations(): Promise<void> {
    // Load CRM configurations from database
  }

  // Public API methods
  async getCrmStatus(): Promise<Record<string, boolean>> {
    return {
      hubspot: !!this.hubspot,
      salesforce: !!this.salesforce,
      pipedrive: !!this.pipedrive,
    };
  }

  async bulkSyncToCrm(leadIds: string[], crmType: string): Promise<string[]> {
    const results = [];
    
    for (const leadId of leadIds) {
      try {
        const crmId = await this.syncLeadToCrm(leadId, crmType as any);
        results.push(crmId);
      } catch (error) {
        console.error(`Failed to sync lead ${leadId} to ${crmType}:`, error);
        results.push('');
      }
    }
    
    return results;
  }
}