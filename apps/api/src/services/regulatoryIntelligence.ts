import { Client as PgClient } from 'pg'
import { pino } from 'pino'
import axios from 'axios'

const logger = pino({ name: 'regulatory-intelligence-service' })

// Regulatory intelligence interfaces
interface Jurisdiction {
  id: string
  code: string
  name: string
  region: string
  regulatory_framework: string[]
  privacy_authority: string
  enforcement_history: number // Risk score based on enforcement history
  gdpr_applicable: boolean
  ccpa_applicable: boolean
  data_localization_required: boolean
  breach_notification_required: boolean
  consent_requirements: string // 'strict' | 'moderate' | 'minimal'
  penalties: {
    max_fine_percentage: number
    max_fine_amount: number
    currency: string
  }
  last_updated: Date
}

interface RegulatoryRequirement {
  id: string
  jurisdiction_code: string
  law_name: string
  law_code: string
  requirement_type: 'privacy' | 'data_protection' | 'consumer_rights' | 'accessibility' | 'other'
  description: string
  compliance_patterns: string[] // Patterns to look for in analysis
  violation_indicators: string[] // Text patterns that indicate violations
  severity: 'low' | 'medium' | 'high' | 'critical'
  effective_date: Date
  last_updated: Date
}

interface CompanyJurisdiction {
  id: string
  company_domain: string
  company_name: string
  headquarters_jurisdiction: string
  operating_jurisdictions: string[]
  data_processing_locations: string[]
  legal_entity_type: string
  privacy_framework_compliance: string[]
  last_assessment: Date
  compliance_score: number
  risk_level: 'low' | 'medium' | 'high' | 'critical'
}

interface RegulatoryUpdate {
  id: string
  jurisdiction_code: string
  law_name: string
  update_type: 'new_law' | 'amendment' | 'enforcement_action' | 'guidance' | 'court_decision'
  title: string
  description: string
  impact_assessment: string
  effective_date: Date
  source_url: string
  created_at: Date
}

interface ComplianceAnalysis {
  company_domain: string
  jurisdiction_codes: string[]
  applicable_laws: RegulatoryRequirement[]
  compliance_gaps: {
    requirement_id: string
    gap_description: string
    severity: string
    recommendation: string
  }[]
  overall_score: number
  risk_assessment: string
  next_review_date: Date
}

export class RegulatoryIntelligenceService {
  private db: PgClient

  constructor(db: PgClient) {
    this.db = db
  }

  // Initialize regulatory intelligence system
  async initializeRegulatoryIntelligence(): Promise<void> {
    const createTablesQuery = `
      -- Jurisdictions with regulatory frameworks
      CREATE TABLE IF NOT EXISTS jurisdictions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code VARCHAR(10) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        region VARCHAR(100),
        regulatory_framework TEXT[] DEFAULT '{}',
        privacy_authority VARCHAR(255),
        enforcement_history INTEGER DEFAULT 50,
        gdpr_applicable BOOLEAN DEFAULT false,
        ccpa_applicable BOOLEAN DEFAULT false,
        data_localization_required BOOLEAN DEFAULT false,
        breach_notification_required BOOLEAN DEFAULT false,
        consent_requirements VARCHAR(20) DEFAULT 'moderate',
        penalties JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Regulatory requirements by jurisdiction
      CREATE TABLE IF NOT EXISTS regulatory_requirements (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        jurisdiction_code VARCHAR(10) REFERENCES jurisdictions(code),
        law_name VARCHAR(255) NOT NULL,
        law_code VARCHAR(50),
        requirement_type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        compliance_patterns TEXT[] DEFAULT '{}',
        violation_indicators TEXT[] DEFAULT '{}',
        severity VARCHAR(20) DEFAULT 'medium',
        effective_date DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Company jurisdiction mapping
      CREATE TABLE IF NOT EXISTS company_jurisdictions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_domain VARCHAR(255) UNIQUE NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        headquarters_jurisdiction VARCHAR(10) REFERENCES jurisdictions(code),
        operating_jurisdictions TEXT[] DEFAULT '{}',
        data_processing_locations TEXT[] DEFAULT '{}',
        legal_entity_type VARCHAR(100),
        privacy_framework_compliance TEXT[] DEFAULT '{}',
        last_assessment TIMESTAMP WITH TIME ZONE,
        compliance_score INTEGER DEFAULT 0,
        risk_level VARCHAR(20) DEFAULT 'medium',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Regulatory updates and changes
      CREATE TABLE IF NOT EXISTS regulatory_updates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        jurisdiction_code VARCHAR(10) REFERENCES jurisdictions(code),
        law_name VARCHAR(255),
        update_type VARCHAR(50) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        impact_assessment TEXT,
        effective_date DATE,
        source_url TEXT,
        processed BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Compliance analysis results
      CREATE TABLE IF NOT EXISTS compliance_analyses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        company_domain VARCHAR(255) NOT NULL,
        jurisdiction_codes TEXT[] DEFAULT '{}',
        applicable_laws TEXT[] DEFAULT '{}',
        compliance_gaps JSONB DEFAULT '[]',
        overall_score INTEGER DEFAULT 0,
        risk_assessment TEXT,
        analysis_metadata JSONB DEFAULT '{}',
        next_review_date DATE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_jurisdictions_code ON jurisdictions(code);
      CREATE INDEX IF NOT EXISTS idx_jurisdictions_region ON jurisdictions(region);
      CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_jurisdiction ON regulatory_requirements(jurisdiction_code);
      CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_type ON regulatory_requirements(requirement_type);
      CREATE INDEX IF NOT EXISTS idx_company_jurisdictions_domain ON company_jurisdictions(company_domain);
      CREATE INDEX IF NOT EXISTS idx_company_jurisdictions_hq ON company_jurisdictions(headquarters_jurisdiction);
      CREATE INDEX IF NOT EXISTS idx_regulatory_updates_jurisdiction ON regulatory_updates(jurisdiction_code);
      CREATE INDEX IF NOT EXISTS idx_regulatory_updates_processed ON regulatory_updates(processed) WHERE processed = false;
      CREATE INDEX IF NOT EXISTS idx_compliance_analyses_domain ON compliance_analyses(company_domain);
      CREATE INDEX IF NOT EXISTS idx_compliance_analyses_score ON compliance_analyses(overall_score);
    `

    await this.db.query(createTablesQuery)
    logger.info('Regulatory intelligence tables initialized')
  }

  // Seed jurisdictions with major privacy laws
  async seedJurisdictions(): Promise<void> {
    const jurisdictions: Omit<Jurisdiction, 'id' | 'last_updated'>[] = [
      // European Union and EEA
      {
        code: 'EU',
        name: 'European Union',
        region: 'Europe',
        regulatory_framework: ['GDPR', 'ePrivacy Directive', 'Digital Services Act', 'Digital Markets Act'],
        privacy_authority: 'European Data Protection Board (EDPB)',
        enforcement_history: 85,
        gdpr_applicable: true,
        ccpa_applicable: false,
        data_localization_required: false,
        breach_notification_required: true,
        consent_requirements: 'strict',
        penalties: {
          max_fine_percentage: 4.0,
          max_fine_amount: 20000000,
          currency: 'EUR'
        }
      },
      {
        code: 'DE',
        name: 'Germany',
        region: 'Europe',
        regulatory_framework: ['GDPR', 'BDSG', 'TMG', 'TKG'],
        privacy_authority: 'Federal Commissioner for Data Protection and Freedom of Information',
        enforcement_history: 90,
        gdpr_applicable: true,
        ccpa_applicable: false,
        data_localization_required: false,
        breach_notification_required: true,
        consent_requirements: 'strict',
        penalties: {
          max_fine_percentage: 4.0,
          max_fine_amount: 20000000,
          currency: 'EUR'
        }
      },
      {
        code: 'FR',
        name: 'France',
        region: 'Europe',
        regulatory_framework: ['GDPR', 'French Data Protection Act'],
        privacy_authority: 'Commission Nationale de l\'Informatique et des Libertés (CNIL)',
        enforcement_history: 85,
        gdpr_applicable: true,
        ccpa_applicable: false,
        data_localization_required: false,
        breach_notification_required: true,
        consent_requirements: 'strict',
        penalties: {
          max_fine_percentage: 4.0,
          max_fine_amount: 20000000,
          currency: 'EUR'
        }
      },

      // United States
      {
        code: 'US',
        name: 'United States',
        region: 'North America',
        regulatory_framework: ['CCPA', 'CPRA', 'COPPA', 'GLBA', 'HIPAA', 'Section 5 FTC Act'],
        privacy_authority: 'Federal Trade Commission (FTC)',
        enforcement_history: 75,
        gdpr_applicable: false,
        ccpa_applicable: true,
        data_localization_required: false,
        breach_notification_required: true,
        consent_requirements: 'moderate',
        penalties: {
          max_fine_percentage: 2.5,
          max_fine_amount: 7500,
          currency: 'USD'
        }
      },
      {
        code: 'CA-US',
        name: 'California, United States',
        region: 'North America',
        regulatory_framework: ['CCPA', 'CPRA', 'CIPA'],
        privacy_authority: 'California Privacy Protection Agency (CPPA)',
        enforcement_history: 80,
        gdpr_applicable: false,
        ccpa_applicable: true,
        data_localization_required: false,
        breach_notification_required: true,
        consent_requirements: 'moderate',
        penalties: {
          max_fine_percentage: 2.5,
          max_fine_amount: 7500,
          currency: 'USD'
        }
      },

      // Canada
      {
        code: 'CA',
        name: 'Canada',
        region: 'North America',
        regulatory_framework: ['PIPEDA', 'Bill C-11'],
        privacy_authority: 'Office of the Privacy Commissioner of Canada (OPC)',
        enforcement_history: 70,
        gdpr_applicable: false,
        ccpa_applicable: false,
        data_localization_required: false,
        breach_notification_required: true,
        consent_requirements: 'moderate',
        penalties: {
          max_fine_percentage: 3.0,
          max_fine_amount: 10000000,
          currency: 'CAD'
        }
      },

      // United Kingdom
      {
        code: 'GB',
        name: 'United Kingdom',
        region: 'Europe',
        regulatory_framework: ['UK GDPR', 'Data Protection Act 2018', 'PECR'],
        privacy_authority: 'Information Commissioner\'s Office (ICO)',
        enforcement_history: 85,
        gdpr_applicable: true,
        ccpa_applicable: false,
        data_localization_required: false,
        breach_notification_required: true,
        consent_requirements: 'strict',
        penalties: {
          max_fine_percentage: 4.0,
          max_fine_amount: 17500000,
          currency: 'GBP'
        }
      },

      // Brazil
      {
        code: 'BR',
        name: 'Brazil',
        region: 'South America',
        regulatory_framework: ['LGPD', 'Marco Civil da Internet'],
        privacy_authority: 'Autoridade Nacional de Proteção de Dados (ANPD)',
        enforcement_history: 60,
        gdpr_applicable: false,
        ccpa_applicable: false,
        data_localization_required: true,
        breach_notification_required: true,
        consent_requirements: 'strict',
        penalties: {
          max_fine_percentage: 2.0,
          max_fine_amount: 50000000,
          currency: 'BRL'
        }
      },

      // China
      {
        code: 'CN',
        name: 'China',
        region: 'Asia Pacific',
        regulatory_framework: ['PIPL', 'Cybersecurity Law', 'Data Security Law'],
        privacy_authority: 'Cyberspace Administration of China (CAC)',
        enforcement_history: 95,
        gdpr_applicable: false,
        ccpa_applicable: false,
        data_localization_required: true,
        breach_notification_required: true,
        consent_requirements: 'strict',
        penalties: {
          max_fine_percentage: 5.0,
          max_fine_amount: 50000000,
          currency: 'CNY'
        }
      },

      // Japan
      {
        code: 'JP',
        name: 'Japan',
        region: 'Asia Pacific',
        regulatory_framework: ['APPI', 'Act on Protection of Personal Information'],
        privacy_authority: 'Personal Information Protection Commission (PPC)',
        enforcement_history: 65,
        gdpr_applicable: false,
        ccpa_applicable: false,
        data_localization_required: false,
        breach_notification_required: true,
        consent_requirements: 'moderate',
        penalties: {
          max_fine_percentage: 1.0,
          max_fine_amount: 100000000,
          currency: 'JPY'
        }
      },

      // Australia
      {
        code: 'AU',
        name: 'Australia',
        region: 'Asia Pacific',
        regulatory_framework: ['Privacy Act 1988', 'Australian Privacy Principles'],
        privacy_authority: 'Office of the Australian Information Commissioner (OAIC)',
        enforcement_history: 60,
        gdpr_applicable: false,
        ccpa_applicable: false,
        data_localization_required: false,
        breach_notification_required: true,
        consent_requirements: 'moderate',
        penalties: {
          max_fine_percentage: 0.0,
          max_fine_amount: 50000000,
          currency: 'AUD'
        }
      },

      // Singapore
      {
        code: 'SG',
        name: 'Singapore',
        region: 'Asia Pacific',
        regulatory_framework: ['PDPA', 'Personal Data Protection Act'],
        privacy_authority: 'Personal Data Protection Commission (PDPC)',
        enforcement_history: 70,
        gdpr_applicable: false,
        ccpa_applicable: false,
        data_localization_required: false,
        breach_notification_required: true,
        consent_requirements: 'moderate',
        penalties: {
          max_fine_percentage: 10.0,
          max_fine_amount: 1000000,
          currency: 'SGD'
        }
      },

      // India
      {
        code: 'IN',
        name: 'India',
        region: 'Asia Pacific',
        regulatory_framework: ['DPDP Act 2023', 'IT Rules 2021'],
        privacy_authority: 'Data Protection Board of India',
        enforcement_history: 50,
        gdpr_applicable: false,
        ccpa_applicable: false,
        data_localization_required: true,
        breach_notification_required: true,
        consent_requirements: 'moderate',
        penalties: {
          max_fine_percentage: 0.0,
          max_fine_amount: 25000000,
          currency: 'INR'
        }
      },

      // South Korea
      {
        code: 'KR',
        name: 'South Korea',
        region: 'Asia Pacific',
        regulatory_framework: ['PIPA', 'Personal Information Protection Act'],
        privacy_authority: 'Korea Internet & Security Agency (KISA)',
        enforcement_history: 75,
        gdpr_applicable: false,
        ccpa_applicable: false,
        data_localization_required: false,
        breach_notification_required: true,
        consent_requirements: 'strict',
        penalties: {
          max_fine_percentage: 3.0,
          max_fine_amount: 100000000,
          currency: 'KRW'
        }
      }
    ]

    for (const jurisdiction of jurisdictions) {
      const insertQuery = `
        INSERT INTO jurisdictions (
          code, name, region, regulatory_framework, privacy_authority,
          enforcement_history, gdpr_applicable, ccpa_applicable,
          data_localization_required, breach_notification_required,
          consent_requirements, penalties
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          region = EXCLUDED.region,
          regulatory_framework = EXCLUDED.regulatory_framework,
          privacy_authority = EXCLUDED.privacy_authority,
          enforcement_history = EXCLUDED.enforcement_history,
          gdpr_applicable = EXCLUDED.gdpr_applicable,
          ccpa_applicable = EXCLUDED.ccpa_applicable,
          data_localization_required = EXCLUDED.data_localization_required,
          breach_notification_required = EXCLUDED.breach_notification_required,
          consent_requirements = EXCLUDED.consent_requirements,
          penalties = EXCLUDED.penalties,
          updated_at = CURRENT_TIMESTAMP
      `

      await this.db.query(insertQuery, [
        jurisdiction.code,
        jurisdiction.name,
        jurisdiction.region,
        jurisdiction.regulatory_framework,
        jurisdiction.privacy_authority,
        jurisdiction.enforcement_history,
        jurisdiction.gdpr_applicable,
        jurisdiction.ccpa_applicable,
        jurisdiction.data_localization_required,
        jurisdiction.breach_notification_required,
        jurisdiction.consent_requirements,
        JSON.stringify(jurisdiction.penalties)
      ])
    }

    logger.info(`Seeded ${jurisdictions.length} jurisdictions`)
  }

  // Seed regulatory requirements
  async seedRegulatoryRequirements(): Promise<void> {
    const requirements: Omit<RegulatoryRequirement, 'id' | 'last_updated'>[] = [
      // GDPR Requirements
      {
        jurisdiction_code: 'EU',
        law_name: 'General Data Protection Regulation',
        law_code: 'GDPR',
        requirement_type: 'privacy',
        description: 'Lawful basis required for processing personal data',
        compliance_patterns: ['lawful basis', 'legal basis', 'consent', 'legitimate interest', 'contractual necessity'],
        violation_indicators: ['we may collect', 'we collect personal data for various purposes', 'broad data collection'],
        severity: 'critical',
        effective_date: new Date('2018-05-25')
      },
      {
        jurisdiction_code: 'EU',
        law_name: 'General Data Protection Regulation',
        law_code: 'GDPR',
        requirement_type: 'privacy',
        description: 'Data subject rights must be clearly communicated',
        compliance_patterns: ['right to access', 'right to rectification', 'right to erasure', 'right to portability', 'right to object'],
        violation_indicators: ['no mention of data rights', 'limited data rights', 'unclear data rights'],
        severity: 'high',
        effective_date: new Date('2018-05-25')
      },
      {
        jurisdiction_code: 'EU',
        law_name: 'General Data Protection Regulation',
        law_code: 'GDPR',
        requirement_type: 'privacy',
        description: 'Data retention periods must be specified',
        compliance_patterns: ['retention period', 'how long we keep', 'data retention', 'deletion schedule'],
        violation_indicators: ['indefinite retention', 'forever', 'permanent storage', 'no deletion mentioned'],
        severity: 'high',
        effective_date: new Date('2018-05-25')
      },

      // CCPA Requirements
      {
        jurisdiction_code: 'CA-US',
        law_name: 'California Consumer Privacy Act',
        law_code: 'CCPA',
        requirement_type: 'privacy',
        description: 'Right to know about personal information collection',
        compliance_patterns: ['categories of personal information', 'sources of information', 'business purposes', 'third parties'],
        violation_indicators: ['vague data collection', 'unclear categories', 'no disclosure of sources'],
        severity: 'high',
        effective_date: new Date('2020-01-01')
      },
      {
        jurisdiction_code: 'CA-US',
        law_name: 'California Consumer Privacy Act',
        law_code: 'CCPA',
        requirement_type: 'consumer_rights',
        description: 'Right to delete personal information',
        compliance_patterns: ['right to delete', 'deletion request', 'remove personal information'],
        violation_indicators: ['no deletion rights', 'limited deletion', 'deletion exceptions'],
        severity: 'high',
        effective_date: new Date('2020-01-01')
      },
      {
        jurisdiction_code: 'CA-US',
        law_name: 'California Consumer Privacy Act',
        law_code: 'CCPA',
        requirement_type: 'consumer_rights',
        description: 'Right to opt-out of sale of personal information',
        compliance_patterns: ['do not sell', 'opt-out', 'sale of personal information'],
        violation_indicators: ['no opt-out mechanism', 'unclear sale definition', 'hidden opt-out'],
        severity: 'critical',
        effective_date: new Date('2020-01-01')
      },

      // PIPEDA Requirements
      {
        jurisdiction_code: 'CA',
        law_name: 'Personal Information Protection and Electronic Documents Act',
        law_code: 'PIPEDA',
        requirement_type: 'privacy',
        description: 'Meaningful consent required for collection',
        compliance_patterns: ['meaningful consent', 'informed consent', 'clear consent', 'specific consent'],
        violation_indicators: ['implied consent', 'blanket consent', 'unclear consent', 'buried consent'],
        severity: 'high',
        effective_date: new Date('2001-01-01')
      },

      // LGPD Requirements
      {
        jurisdiction_code: 'BR',
        law_name: 'Lei Geral de Proteção de Dados',
        law_code: 'LGPD',
        requirement_type: 'privacy',
        description: 'Legal basis required for personal data processing',
        compliance_patterns: ['base legal', 'legal basis', 'legitimate interest', 'consent', 'contractual'],
        violation_indicators: ['no legal basis', 'unclear legal basis', 'broad processing'],
        severity: 'critical',
        effective_date: new Date('2020-09-18')
      },

      // PIPL Requirements
      {
        jurisdiction_code: 'CN',
        law_name: 'Personal Information Protection Law',
        law_code: 'PIPL',
        requirement_type: 'privacy',
        description: 'Separate consent for sensitive personal information',
        compliance_patterns: ['sensitive personal information', 'separate consent', 'biometric data', 'health data'],
        violation_indicators: ['no sensitive data protection', 'blanket consent for sensitive data', 'unclear sensitive data handling'],
        severity: 'critical',
        effective_date: new Date('2021-11-01')
      },

      // UK GDPR Requirements
      {
        jurisdiction_code: 'GB',
        law_name: 'UK General Data Protection Regulation',
        law_code: 'UK GDPR',
        requirement_type: 'privacy',
        description: 'Data Protection Impact Assessment for high-risk processing',
        compliance_patterns: ['impact assessment', 'DPIA', 'risk assessment', 'high-risk processing'],
        violation_indicators: ['no impact assessment', 'no risk evaluation', 'high-risk without assessment'],
        severity: 'high',
        effective_date: new Date('2021-01-01')
      },

      // Generic requirements that apply across multiple jurisdictions
      {
        jurisdiction_code: 'EU',
        law_name: 'General Data Protection Regulation',
        law_code: 'GDPR',
        requirement_type: 'data_protection',
        description: 'Data breach notification within 72 hours',
        compliance_patterns: ['breach notification', '72 hours', 'data breach', 'security incident'],
        violation_indicators: ['no breach notification', 'delayed notification', 'unclear breach procedure'],
        severity: 'high',
        effective_date: new Date('2018-05-25')
      }
    ]

    for (const requirement of requirements) {
      const insertQuery = `
        INSERT INTO regulatory_requirements (
          jurisdiction_code, law_name, law_code, requirement_type,
          description, compliance_patterns, violation_indicators, severity, effective_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT DO NOTHING
      `

      await this.db.query(insertQuery, [
        requirement.jurisdiction_code,
        requirement.law_name,
        requirement.law_code,
        requirement.requirement_type,
        requirement.description,
        requirement.compliance_patterns,
        requirement.violation_indicators,
        requirement.severity,
        requirement.effective_date
      ])
    }

    logger.info(`Seeded ${requirements.length} regulatory requirements`)
  }

  // Map companies to their jurisdictions
  async seedCompanyJurisdictions(): Promise<void> {
    const companies: Omit<CompanyJurisdiction, 'id' | 'last_assessment'>[] = [
      // US Tech Giants
      {
        company_domain: 'google.com',
        company_name: 'Google LLC',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'JP', 'BR', 'IN'],
        data_processing_locations: ['US', 'EU', 'SG'],
        legal_entity_type: 'Corporation',
        privacy_framework_compliance: ['Privacy Shield (defunct)', 'Standard Contractual Clauses', 'Adequacy Decisions'],
        compliance_score: 75,
        risk_level: 'medium'
      },
      {
        company_domain: 'facebook.com',
        company_name: 'Meta Platforms, Inc.',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'BR', 'IN'],
        data_processing_locations: ['US', 'EU'],
        legal_entity_type: 'Corporation',
        privacy_framework_compliance: ['Standard Contractual Clauses', 'Binding Corporate Rules'],
        compliance_score: 60,
        risk_level: 'high'
      },
      {
        company_domain: 'amazon.com',
        company_name: 'Amazon.com, Inc.',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'JP', 'BR', 'IN'],
        data_processing_locations: ['US', 'EU', 'AP'],
        legal_entity_type: 'Corporation',
        privacy_framework_compliance: ['Standard Contractual Clauses', 'Adequacy Decisions'],
        compliance_score: 80,
        risk_level: 'medium'
      },
      {
        company_domain: 'microsoft.com',
        company_name: 'Microsoft Corporation',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'JP', 'BR', 'IN'],
        data_processing_locations: ['US', 'EU', 'AP'],
        legal_entity_type: 'Corporation',
        privacy_framework_compliance: ['Standard Contractual Clauses', 'Binding Corporate Rules'],
        compliance_score: 85,
        risk_level: 'low'
      },
      {
        company_domain: 'apple.com',
        company_name: 'Apple Inc.',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'JP', 'CN'],
        data_processing_locations: ['US', 'EU', 'CN'],
        legal_entity_type: 'Corporation',
        privacy_framework_compliance: ['Standard Contractual Clauses', 'Local Data Residence'],
        compliance_score: 90,
        risk_level: 'low'
      },

      // Chinese Companies
      {
        company_domain: 'tiktok.com',
        company_name: 'TikTok Pte. Ltd.',
        headquarters_jurisdiction: 'SG',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'CN', 'SG'],
        data_processing_locations: ['US', 'SG', 'CN'],
        legal_entity_type: 'Private Limited Company',
        privacy_framework_compliance: ['Standard Contractual Clauses'],
        compliance_score: 50,
        risk_level: 'high'
      },

      // European Companies
      {
        company_domain: 'spotify.com',
        company_name: 'Spotify AB',
        headquarters_jurisdiction: 'EU',
        operating_jurisdictions: ['EU', 'US', 'GB', 'CA', 'AU', 'BR'],
        data_processing_locations: ['EU', 'US'],
        legal_entity_type: 'Aktiebolag',
        privacy_framework_compliance: ['GDPR Compliance', 'Standard Contractual Clauses'],
        compliance_score: 85,
        risk_level: 'low'
      },

      // Financial Services (Higher regulatory requirements)
      {
        company_domain: 'paypal.com',
        company_name: 'PayPal Holdings, Inc.',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'JP'],
        data_processing_locations: ['US', 'EU'],
        legal_entity_type: 'Corporation',
        privacy_framework_compliance: ['PCI DSS', 'SOX', 'Standard Contractual Clauses'],
        compliance_score: 90,
        risk_level: 'low'
      },
      {
        company_domain: 'stripe.com',
        company_name: 'Stripe, Inc.',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'JP', 'SG'],
        data_processing_locations: ['US', 'EU', 'AP'],
        legal_entity_type: 'Corporation',
        privacy_framework_compliance: ['PCI DSS', 'SOC 2', 'Standard Contractual Clauses'],
        compliance_score: 95,
        risk_level: 'low'
      },

      // Communication & Productivity
      {
        company_domain: 'zoom.us',
        company_name: 'Zoom Video Communications, Inc.',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'JP'],
        data_processing_locations: ['US', 'EU'],
        legal_entity_type: 'Corporation',
        privacy_framework_compliance: ['SOC 2', 'Standard Contractual Clauses'],
        compliance_score: 80,
        risk_level: 'medium'
      },
      {
        company_domain: 'slack.com',
        company_name: 'Slack Technologies, LLC',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'JP'],
        data_processing_locations: ['US', 'EU'],
        legal_entity_type: 'Limited Liability Company',
        privacy_framework_compliance: ['SOC 2', 'ISO 27001', 'Standard Contractual Clauses'],
        compliance_score: 85,
        risk_level: 'low'
      },

      // Social Media & Communication
      {
        company_domain: 'twitter.com',
        company_name: 'X Corp.',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'JP', 'BR'],
        data_processing_locations: ['US', 'EU'],
        legal_entity_type: 'Corporation',
        privacy_framework_compliance: ['Standard Contractual Clauses'],
        compliance_score: 65,
        risk_level: 'medium'
      },
      {
        company_domain: 'linkedin.com',
        company_name: 'LinkedIn Corporation',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'JP', 'BR', 'IN'],
        data_processing_locations: ['US', 'EU'],
        legal_entity_type: 'Corporation',
        privacy_framework_compliance: ['Standard Contractual Clauses', 'Binding Corporate Rules'],
        compliance_score: 80,
        risk_level: 'medium'
      },

      // Developer & Cloud Services
      {
        company_domain: 'github.com',
        company_name: 'GitHub, Inc.',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'JP'],
        data_processing_locations: ['US', 'EU'],
        legal_entity_type: 'Corporation',
        privacy_framework_compliance: ['SOC 2', 'Standard Contractual Clauses'],
        compliance_score: 85,
        risk_level: 'low'
      },
      {
        company_domain: 'dropbox.com',
        company_name: 'Dropbox, Inc.',
        headquarters_jurisdiction: 'US',
        operating_jurisdictions: ['US', 'EU', 'GB', 'CA', 'AU', 'JP'],
        data_processing_locations: ['US', 'EU'],
        legal_entity_type: 'Corporation',
        privacy_framework_compliance: ['SOC 2', 'ISO 27001', 'Standard Contractual Clauses'],
        compliance_score: 85,
        risk_level: 'low'
      }
    ]

    for (const company of companies) {
      const insertQuery = `
        INSERT INTO company_jurisdictions (
          company_domain, company_name, headquarters_jurisdiction,
          operating_jurisdictions, data_processing_locations, legal_entity_type,
          privacy_framework_compliance, compliance_score, risk_level
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (company_domain) DO UPDATE SET
          company_name = EXCLUDED.company_name,
          headquarters_jurisdiction = EXCLUDED.headquarters_jurisdiction,
          operating_jurisdictions = EXCLUDED.operating_jurisdictions,
          data_processing_locations = EXCLUDED.data_processing_locations,
          legal_entity_type = EXCLUDED.legal_entity_type,
          privacy_framework_compliance = EXCLUDED.privacy_framework_compliance,
          compliance_score = EXCLUDED.compliance_score,
          risk_level = EXCLUDED.risk_level,
          updated_at = CURRENT_TIMESTAMP
      `

      await this.db.query(insertQuery, [
        company.company_domain,
        company.company_name,
        company.headquarters_jurisdiction,
        company.operating_jurisdictions,
        company.data_processing_locations,
        company.legal_entity_type,
        company.privacy_framework_compliance,
        company.compliance_score,
        company.risk_level
      ])
    }

    logger.info(`Seeded ${companies.length} company jurisdiction mappings`)
  }

  // Get applicable regulations for a company
  async getApplicableRegulations(companyDomain: string): Promise<{
    company: CompanyJurisdiction | null,
    regulations: RegulatoryRequirement[]
  }> {
    // Get company jurisdiction info
    const companyQuery = `
      SELECT * FROM company_jurisdictions WHERE company_domain = $1
    `
    const companyResult = await this.db.query(companyQuery, [companyDomain])
    
    if (companyResult.rows.length === 0) {
      return { company: null, regulations: [] }
    }

    const company = companyResult.rows[0] as CompanyJurisdiction

    // Get applicable regulations based on operating jurisdictions
    const jurisdictions = [company.headquarters_jurisdiction, ...company.operating_jurisdictions]
    const uniqueJurisdictions = [...new Set(jurisdictions)]

    const regulationsQuery = `
      SELECT * FROM regulatory_requirements
      WHERE jurisdiction_code = ANY($1)
      ORDER BY severity DESC, law_name
    `
    const regulationsResult = await this.db.query(regulationsQuery, [uniqueJurisdictions])

    return {
      company,
      regulations: regulationsResult.rows as RegulatoryRequirement[]
    }
  }

  // Analyze compliance for a company
  async analyzeCompliance(companyDomain: string, documentContent: string): Promise<ComplianceAnalysis> {
    const { company, regulations } = await this.getApplicableRegulations(companyDomain)
    
    if (!company) {
      throw new Error(`Company not found: ${companyDomain}`)
    }

    const complianceGaps: ComplianceAnalysis['compliance_gaps'] = []
    let complianceScore = 100

    // Check each regulation against the document content
    for (const regulation of regulations) {
      const hasCompliantPatterns = regulation.compliance_patterns.some(pattern =>
        documentContent.toLowerCase().includes(pattern.toLowerCase())
      )

      const hasViolationIndicators = regulation.violation_indicators.some(indicator =>
        documentContent.toLowerCase().includes(indicator.toLowerCase())
      )

      if (!hasCompliantPatterns || hasViolationIndicators) {
        const severityPenalty = {
          'low': 5,
          'medium': 10,
          'high': 20,
          'critical': 30
        }[regulation.severity] || 10

        complianceScore -= severityPenalty

        complianceGaps.push({
          requirement_id: regulation.id,
          gap_description: `Missing compliance for: ${regulation.description}`,
          severity: regulation.severity,
          recommendation: `Ensure document includes patterns: ${regulation.compliance_patterns.join(', ')}`
        })
      }
    }

    complianceScore = Math.max(0, complianceScore)

    const riskAssessment = complianceScore >= 80 ? 'Low Risk' :
                         complianceScore >= 60 ? 'Medium Risk' :
                         complianceScore >= 40 ? 'High Risk' : 'Critical Risk'

    const nextReviewDate = new Date()
    nextReviewDate.setMonth(nextReviewDate.getMonth() + 6) // Review every 6 months

    // Save analysis result
    const analysisInsertQuery = `
      INSERT INTO compliance_analyses (
        company_domain, jurisdiction_codes, applicable_laws, compliance_gaps,
        overall_score, risk_assessment, next_review_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `

    await this.db.query(analysisInsertQuery, [
      companyDomain,
      [company.headquarters_jurisdiction, ...company.operating_jurisdictions],
      regulations.map(r => r.id),
      JSON.stringify(complianceGaps),
      complianceScore,
      riskAssessment,
      nextReviewDate
    ])

    return {
      company_domain: companyDomain,
      jurisdiction_codes: [company.headquarters_jurisdiction, ...company.operating_jurisdictions],
      applicable_laws: regulations,
      compliance_gaps: complianceGaps,
      overall_score: complianceScore,
      risk_assessment: riskAssessment,
      next_review_date: nextReviewDate
    }
  }

  // Get regulatory intelligence summary
  async getRegulatoryIntelligenceSummary(): Promise<{
    total_jurisdictions: number,
    total_requirements: number,
    total_companies: number,
    high_risk_companies: number,
    recent_updates: number,
    compliance_distribution: Record<string, number>
  }> {
    const summaryQuery = `
      SELECT 
        (SELECT COUNT(*) FROM jurisdictions) as total_jurisdictions,
        (SELECT COUNT(*) FROM regulatory_requirements) as total_requirements,
        (SELECT COUNT(*) FROM company_jurisdictions) as total_companies,
        (SELECT COUNT(*) FROM company_jurisdictions WHERE risk_level = 'high') as high_risk_companies,
        (SELECT COUNT(*) FROM regulatory_updates WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as recent_updates
    `

    const distributionQuery = `
      SELECT risk_level, COUNT(*) as count
      FROM company_jurisdictions
      GROUP BY risk_level
    `

    const summaryResult = await this.db.query(summaryQuery)
    const distributionResult = await this.db.query(distributionQuery)

    const complianceDistribution: Record<string, number> = {}
    distributionResult.rows.forEach(row => {
      complianceDistribution[row.risk_level] = parseInt(row.count)
    })

    return {
      total_jurisdictions: parseInt(summaryResult.rows[0].total_jurisdictions),
      total_requirements: parseInt(summaryResult.rows[0].total_requirements),
      total_companies: parseInt(summaryResult.rows[0].total_companies),
      high_risk_companies: parseInt(summaryResult.rows[0].high_risk_companies),
      recent_updates: parseInt(summaryResult.rows[0].recent_updates),
      compliance_distribution: complianceDistribution
    }
  }
}