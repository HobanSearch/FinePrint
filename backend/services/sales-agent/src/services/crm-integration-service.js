"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrmIntegrationService = void 0;
const client_1 = require("@prisma/client");
const api_client_1 = require("@hubspot/api-client");
const core_1 = require("@salesforce/core");
const pipedrive_1 = __importDefault(require("pipedrive"));
const config_1 = require("../config");
class CrmIntegrationService {
    prisma;
    hubspot;
    salesforce;
    pipedrive;
    crmConfigs = new Map();
    constructor() {
        this.prisma = new client_1.PrismaClient();
    }
    async initialize() {
        if (config_1.config.hubspotApiKey) {
            this.hubspot = new api_client_1.Client({ accessToken: config_1.config.hubspotApiKey });
        }
        if (config_1.config.salesforceClientId && config_1.config.salesforceClientSecret) {
            this.salesforce = await core_1.Connection.create({
                authInfo: {
                    username: config_1.config.salesforceUsername,
                    password: config_1.config.salesforcePassword,
                    clientId: config_1.config.salesforceClientId,
                    clientSecret: config_1.config.salesforceClientSecret,
                },
            });
        }
        if (config_1.config.pipedriveApiToken) {
            this.pipedrive = new pipedrive_1.default.ApiClient();
            this.pipedrive.authentications.api_key.apiKey = config_1.config.pipedriveApiToken;
        }
        await this.loadCrmConfigurations();
    }
    async syncLeadToCrm(leadId, crmType) {
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
    async syncOpportunityToCrm(opportunityId, crmType) {
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
    async syncToHubSpot(lead) {
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
            let contactId = lead.hubspotContactId;
            if (contactId) {
                await this.hubspot.crm.contacts.basicApi.update(contactId, {
                    properties: contactProperties,
                });
            }
            else {
                const response = await this.hubspot.crm.contacts.basicApi.create({
                    properties: contactProperties,
                });
                contactId = response.id;
                await this.prisma.lead.update({
                    where: { id: lead.id },
                    data: { hubspotContactId: contactId },
                });
            }
            for (const activity of lead.activities || []) {
                await this.syncActivityToHubSpot(contactId, activity);
            }
            return contactId;
        }
        catch (error) {
            console.error('HubSpot sync error:', error);
            throw new Error(`Failed to sync to HubSpot: ${error.message}`);
        }
    }
    async syncToSalesforce(lead) {
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
                await this.salesforce.sobject('Lead').update({
                    Id: salesforceId,
                    ...leadData,
                });
            }
            else {
                const result = await this.salesforce.sobject('Lead').create(leadData);
                salesforceId = result.id;
                await this.prisma.lead.update({
                    where: { id: lead.id },
                    data: { salesforceLeadId: salesforceId },
                });
            }
            for (const activity of lead.activities || []) {
                await this.syncActivityToSalesforce(salesforceId, activity, 'Lead');
            }
            return salesforceId;
        }
        catch (error) {
            console.error('Salesforce sync error:', error);
            throw new Error(`Failed to sync to Salesforce: ${error.message}`);
        }
    }
    async syncToPipedrive(lead) {
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
            const personsApi = new pipedrive_1.default.PersonsApi(this.pipedrive);
            let personId = lead.pipedrivePersonId;
            if (personId) {
                await personsApi.updatePerson(personId, { ...personData });
            }
            else {
                const response = await personsApi.addPerson({ ...personData });
                personId = response.data.id;
                await this.prisma.lead.update({
                    where: { id: lead.id },
                    data: { pipedrivePersonId: personId },
                });
            }
            if (lead.stage !== 'new' && lead.estimatedValue > 0) {
                await this.createPipedriveDeal(personId, lead);
            }
            return personId.toString();
        }
        catch (error) {
            console.error('Pipedrive sync error:', error);
            throw new Error(`Failed to sync to Pipedrive: ${error.message}`);
        }
    }
    async syncOpportunityToHubSpot(opportunity) {
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
                await this.hubspot.crm.deals.basicApi.update(dealId, {
                    properties: dealProperties,
                });
            }
            else {
                const response = await this.hubspot.crm.deals.basicApi.create({
                    properties: dealProperties,
                });
                dealId = response.id;
                await this.prisma.opportunity.update({
                    where: { id: opportunity.id },
                    data: { hubspotDealId: dealId },
                });
            }
            if (opportunity.lead?.hubspotContactId) {
                await this.hubspot.crm.deals.associationsApi.create(dealId, 'contacts', opportunity.lead.hubspotContactId, 'deal_to_contact');
            }
            return dealId;
        }
        catch (error) {
            console.error('HubSpot opportunity sync error:', error);
            throw new Error(`Failed to sync opportunity to HubSpot: ${error.message}`);
        }
    }
    async syncOpportunityToSalesforce(opportunity) {
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
                await this.salesforce.sobject('Opportunity').update({
                    Id: salesforceId,
                    ...opportunityData,
                });
            }
            else {
                const result = await this.salesforce.sobject('Opportunity').create(opportunityData);
                salesforceId = result.id;
                await this.prisma.opportunity.update({
                    where: { id: opportunity.id },
                    data: { salesforceOpportunityId: salesforceId },
                });
            }
            return salesforceId;
        }
        catch (error) {
            console.error('Salesforce opportunity sync error:', error);
            throw new Error(`Failed to sync opportunity to Salesforce: ${error.message}`);
        }
    }
    async syncOpportunityToPipedrive(opportunity) {
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
            const dealsApi = new pipedrive_1.default.DealsApi(this.pipedrive);
            let dealId = opportunity.pipedriveDealId;
            if (dealId) {
                await dealsApi.updateDeal(dealId, dealData);
            }
            else {
                const response = await dealsApi.addDeal(dealData);
                dealId = response.data.id;
                await this.prisma.opportunity.update({
                    where: { id: opportunity.id },
                    data: { pipedriveDealId: dealId },
                });
            }
            return dealId.toString();
        }
        catch (error) {
            console.error('Pipedrive opportunity sync error:', error);
            throw new Error(`Failed to sync opportunity to Pipedrive: ${error.message}`);
        }
    }
    async syncFromCrm(crmType) {
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
    async syncFromHubSpot() {
        if (!this.hubspot)
            return;
        try {
            const contacts = await this.hubspot.crm.contacts.basicApi.getPage(100, undefined, [
                'email', 'firstname', 'lastname', 'company', 'jobtitle', 'hs_lead_status',
                'createdate', 'lastmodifieddate'
            ]);
            for (const contact of contacts.results) {
                await this.importContactFromHubSpot(contact);
            }
            const deals = await this.hubspot.crm.deals.basicApi.getPage(100, undefined, [
                'dealname', 'amount', 'dealstage', 'probability', 'closedate', 'createdate'
            ]);
            for (const deal of deals.results) {
                await this.importDealFromHubSpot(deal);
            }
        }
        catch (error) {
            console.error('HubSpot import error:', error);
        }
    }
    async syncFromSalesforce() {
        if (!this.salesforce)
            return;
        try {
            const leads = await this.salesforce.query(`
        SELECT Id, Email, FirstName, LastName, Company, Title, Status, CreatedDate, LastModifiedDate
        FROM Lead
        WHERE LastModifiedDate > LAST_N_DAYS:7
      `);
            for (const lead of leads.records) {
                await this.importLeadFromSalesforce(lead);
            }
            const opportunities = await this.salesforce.query(`
        SELECT Id, Name, Amount, StageName, Probability, CloseDate, CreatedDate
        FROM Opportunity
        WHERE LastModifiedDate > LAST_N_DAYS:7
      `);
            for (const opportunity of opportunities.records) {
                await this.importOpportunityFromSalesforce(opportunity);
            }
        }
        catch (error) {
            console.error('Salesforce import error:', error);
        }
    }
    async syncFromPipedrive() {
        if (!this.pipedrive)
            return;
        try {
            const personsApi = new pipedrive_1.default.PersonsApi(this.pipedrive);
            const dealsApi = new pipedrive_1.default.DealsApi(this.pipedrive);
            const persons = await personsApi.getPersons();
            for (const person of persons.data.slice(0, 100)) {
                await this.importPersonFromPipedrive(person);
            }
            const deals = await dealsApi.getDeals();
            for (const deal of deals.data.slice(0, 100)) {
                await this.importDealFromPipedrive(deal);
            }
        }
        catch (error) {
            console.error('Pipedrive import error:', error);
        }
    }
    mapStageToHubSpot(stage) {
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
        return mapping[stage] || 'lead';
    }
    mapStageToSalesforce(stage) {
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
        return mapping[stage] || 'Open - Not Contacted';
    }
    mapOpportunityStageToHubSpot(stage) {
        const mapping = {
            'discovery': 'qualifiedtobuy',
            'demo': 'presentationscheduled',
            'proposal': 'decisionmakerboughtin',
            'negotiation': 'contractsent',
            'contract': 'contractsent',
            'closed_won': 'closedwon',
            'closed_lost': 'closedlost',
        };
        return mapping[stage] || 'qualifiedtobuy';
    }
    mapOpportunityStageToSalesforce(stage) {
        const mapping = {
            'discovery': 'Qualification',
            'demo': 'Needs Analysis',
            'proposal': 'Proposal/Price Quote',
            'negotiation': 'Negotiation/Review',
            'contract': 'Negotiation/Review',
            'closed_won': 'Closed Won',
            'closed_lost': 'Closed Lost',
        };
        return mapping[stage] || 'Qualification';
    }
    mapOpportunityStageToStageId(stage) {
        const mapping = {
            'discovery': 1,
            'demo': 2,
            'proposal': 3,
            'negotiation': 4,
            'contract': 5,
            'closed_won': 6,
            'closed_lost': 7,
        };
        return mapping[stage] || 1;
    }
    async importContactFromHubSpot(contact) {
    }
    async importDealFromHubSpot(deal) {
    }
    async importLeadFromSalesforce(lead) {
    }
    async importOpportunityFromSalesforce(opportunity) {
    }
    async importPersonFromPipedrive(person) {
    }
    async importDealFromPipedrive(deal) {
    }
    async syncActivityToHubSpot(contactId, activity) {
    }
    async syncActivityToSalesforce(leadId, activity, objectType) {
    }
    async createPipedriveDeal(personId, lead) {
    }
    async loadCrmConfigurations() {
    }
    async getCrmStatus() {
        return {
            hubspot: !!this.hubspot,
            salesforce: !!this.salesforce,
            pipedrive: !!this.pipedrive,
        };
    }
    async bulkSyncToCrm(leadIds, crmType) {
        const results = [];
        for (const leadId of leadIds) {
            try {
                const crmId = await this.syncLeadToCrm(leadId, crmType);
                results.push(crmId);
            }
            catch (error) {
                console.error(`Failed to sync lead ${leadId} to ${crmType}:`, error);
                results.push('');
            }
        }
        return results;
    }
}
exports.CrmIntegrationService = CrmIntegrationService;
//# sourceMappingURL=crm-integration-service.js.map