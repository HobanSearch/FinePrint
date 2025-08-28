import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { vectorService, EmbeddingUtils } from './vector.js'
import { cacheService } from './cache.js'

const prisma = new PrismaClient()

// Seed data templates
const SAMPLE_COMPANIES = [
  'TechCorp Inc', 'DataFlow Solutions', 'CloudVault Technologies', 'SecureBase Ltd',
  'InnovateLab', 'DigitalFirst Co', 'SafeGuard Systems', 'DataBridge Inc',
  'CyberShield LLC', 'InfoTech Partners', 'SmartCloud Services', 'PrivacyFirst Corp'
];

const SAMPLE_DOCUMENT_TITLES = {
  terms_of_service: [
    'Terms of Service - Premium Cloud Platform',
    'User Agreement - SaaS Analytics Tool',
    'Terms and Conditions - Mobile Application',
    'Service Terms - Enterprise Software Suite',
    'Platform Terms of Use - Data Management System'
  ],
  privacy_policy: [
    'Privacy Policy - Customer Data Protection',
    'Data Privacy Notice - Healthcare Platform',
    'Privacy Statement - Financial Services App',
    'Data Protection Policy - E-commerce Platform',
    'Privacy Guidelines - Marketing Platform'
  ],
  eula: [
    'End User License Agreement - Desktop Software',
    'Software License Terms - Development Tools',
    'Application License Agreement - Mobile App',
    'EULA - Enterprise Security Suite',
    'License Agreement - Creative Software Package'
  ],
  cookie_policy: [
    'Cookie Policy - Website Analytics',
    'Cookie Notice - E-commerce Platform',
    'Cookie Usage Policy - Marketing Site',
    'Web Cookies Policy - SaaS Application',
    'Cookie Management - User Portal'
  ]
};

const SAMPLE_EXECUTIVE_SUMMARIES = [
  'This document contains several high-risk clauses that significantly limit user rights and expand company liability protections beyond industry standards.',
  'The agreement includes moderate risk terms with some concerning data retention policies and limited user control mechanisms.',
  'Overall low-risk document with standard commercial terms, though some data sharing clauses warrant review.',
  'High-risk document with broad indemnification clauses and extensive data collection permissions without clear user benefits.',
  'Medium-risk agreement with automated renewal terms and limited termination rights that may disadvantage users.'
];

const SAMPLE_KEY_FINDINGS = [
  ['Unlimited data retention without user consent', 'Broad liability limitations favor company', 'Automatic renewal without clear notice'],
  ['Extensive third-party data sharing', 'Limited user data access rights', 'Unclear data deletion procedures'],
  ['Broad intellectual property claims', 'Restrictive use limitations', 'Mandatory arbitration clauses'],
  ['Excessive data collection permissions', 'Weak security commitment language', 'Unilateral terms modification rights'],
  ['Limited service availability guarantees', 'Broad termination rights for company', 'User content licensing overreach']
];

const SAMPLE_RECOMMENDATIONS = [
  ['Request data retention limits', 'Negotiate mutual liability terms', 'Add termination notice requirements'],
  ['Clarify data sharing boundaries', 'Establish user data portability rights', 'Define clear deletion timelines'],
  ['Limit IP assignment scope', 'Negotiate fair use provisions', 'Consider alternative dispute resolution'],
  ['Minimize data collection scope', 'Strengthen security commitments', 'Add change notification requirements'],
  ['Define service level agreements', 'Balance termination rights', 'Clarify content ownership terms']
];

const LEGAL_PATTERN_CATEGORIES = [
  'liability', 'data_privacy', 'intellectual_property', 'termination', 'dispute_resolution',
  'service_level', 'payment_terms', 'data_retention', 'user_rights', 'compliance'
];

const PATTERN_TEMPLATES = {
  liability: {
    names: ['Broad Liability Limitation', 'Indemnification Overreach', 'Consequential Damage Exclusion'],
    descriptions: [
      'Clause that excessively limits company liability beyond reasonable commercial standards',
      'Requirements for users to indemnify company for unreasonably broad categories of claims',
      'Exclusion of consequential damages that may be unfair to users in commercial context'
    ]
  },
  data_privacy: {
    names: ['Unlimited Data Retention', 'Broad Data Sharing', 'Weak Consent Mechanism'],
    descriptions: [
      'Policy allowing indefinite retention of user data without clear business justification',
      'Permissions to share user data with third parties without adequate limitations',
      'Consent mechanisms that do not meet GDPR or privacy best practice standards'
    ]
  },
  intellectual_property: {
    names: ['Excessive IP Assignment', 'Broad Usage Rights', 'IP Indemnification'],
    descriptions: [
      'Terms requiring users to assign more IP rights than necessary for service provision',
      'Company claims overly broad rights to use, modify, or distribute user content',
      'User obligations to indemnify company for IP claims beyond reasonable scope'
    ]
  }
};

// Main seeding function
async function main() {
  console.log('🌱 Starting database seeding...')

  try {
    // Initialize vector service
    await vectorService.initialize()
    console.log('✅ Vector service initialized')

    // Clear existing data in development
    if (process.env.NODE_ENV === 'development') {
      await clearExistingData()
      console.log('🧹 Cleared existing development data')
    }

    // Seed users and teams
    const users = await seedUsers()
    console.log(`👥 Created ${users.length} users`)

    const teams = await seedTeams(users)
    console.log(`🏢 Created ${teams.length} teams`)

    // Seed pattern library
    const patterns = await seedPatternLibrary(users)
    console.log(`📚 Created ${patterns.length} legal patterns`)

    // Seed action templates
    const templates = await seedActionTemplates(users)
    console.log(`📝 Created ${templates.length} action templates`)

    // Seed documents and analyses
    const documents = await seedDocuments(users, teams)
    console.log(`📄 Created ${documents.length} documents`)

    const analyses = await seedDocumentAnalyses(documents, users, patterns)
    console.log(`🔍 Created ${analyses.length} document analyses`)

    // Seed user actions
    const actions = await seedUserActions(users, documents, templates)
    console.log(`⚡ Created ${actions.length} user actions`)

    // Seed notifications
    const notifications = await seedNotifications(users)
    console.log(`🔔 Created ${notifications.length} notifications`)

    // Seed analytics data
    await seedAnalyticsData()
    console.log('📊 Created analytics data')

    // Seed API keys for testing
    const apiKeys = await seedApiKeys(users, teams)
    console.log(`🔑 Created ${apiKeys.length} API keys`)

    // Warm up cache with sample data
    await warmUpCache(users)
    console.log('🔥 Warmed up cache with sample data')

    console.log('🎉 Database seeding completed successfully!')

  } catch (error) {
    console.error('❌ Database seeding failed:', error)
    throw error
  }
}

async function clearExistingData() {
  // Delete in reverse dependency order
  await prisma.analysisFinding.deleteMany()
  await prisma.documentAnalysis.deleteMany()
  await prisma.documentChange.deleteMany()
  await prisma.userAction.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.alert.deleteMany()
  await prisma.apiUsage.deleteMany()
  await prisma.apiKey.deleteMany()
  await prisma.integration.deleteMany()
  await prisma.document.deleteMany()
  await prisma.teamMember.deleteMany()
  await prisma.team.deleteMany()
  await prisma.userSession.deleteMany()
  await prisma.notificationPreference.deleteMany()
  await prisma.patternLibrary.deleteMany()
  await prisma.actionTemplate.deleteMany()
  await prisma.usageAnalytics.deleteMany()
  await prisma.systemMetrics.deleteMany()
  await prisma.dataProcessingRecord.deleteMany()
  await prisma.dataExportRequest.deleteMany()
  await prisma.dataDeletionRequest.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.user.deleteMany()
}

async function seedUsers() {
  const users = []

  // Create admin user
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@fineprintai.com',
      emailVerified: true,
      passwordHash: await hash('admin123!', 12),
      displayName: 'System Administrator',
      subscriptionTier: 'enterprise',
      status: 'active',
      preferences: {
        theme: 'dark',
        notifications: true,
        language: 'en'
      },
      privacySettings: {
        analytics: true,
        marketing: false,
        dataRetention: '90days'
      }
    }
  })
  users.push(adminUser)

  // Create test users with different subscription tiers
  const testUsers = [
    {
      email: 'demo@fineprintai.com',
      name: 'Demo User',
      tier: 'professional',
      verified: true
    },
    {
      email: 'legal.team@acmecorp.com',
      name: 'Legal Team Lead',
      tier: 'team',
      verified: true
    },
    {
      email: 'startup@techcorp.com',
      name: 'Startup Founder',
      tier: 'starter',
      verified: true
    },
    {
      email: 'freelancer@consultant.com',
      name: 'Legal Consultant',
      tier: 'professional',
      verified: true
    },
    {
      email: 'enterprise@bigcorp.com',
      name: 'Enterprise User',
      tier: 'enterprise',
      verified: true
    }
  ]

  for (const userData of testUsers) {
    const user = await prisma.user.create({
      data: {
        email: userData.email,
        emailVerified: userData.verified,
        passwordHash: await hash('password123!', 12),
        displayName: userData.name,
        subscriptionTier: userData.tier as any,
        status: 'active',
        loginCount: Math.floor(Math.random() * 50) + 1,
        lastLoginAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        preferences: {
          theme: Math.random() > 0.5 ? 'light' : 'dark',
          notifications: true,
          language: 'en'
        },
        privacySettings: {
          analytics: true,
          marketing: Math.random() > 0.3,
          dataRetention: '90days'
        }
      }
    })
    users.push(user)

    // Create notification preferences
    await prisma.notificationPreference.create({
      data: {
        userId: user.id,
        emailEnabled: true,
        browserEnabled: true,
        analysisComplete: true,
        documentChanges: true,
        highRiskFindings: true,
        weeklySummary: Math.random() > 0.3,
        marketingEmails: Math.random() > 0.7
      }
    })
  }

  return users
}

async function seedTeams(users: any[]) {
  const teams = []

  const teamData = [
    {
      name: 'Legal Operations',
      slug: 'legal-ops',
      description: 'Legal team for enterprise contract review',
      tier: 'enterprise',
      maxMembers: 15
    },
    {
      name: 'Startup Legal',
      slug: 'startup-legal',
      description: 'Legal support for growing startup',
      tier: 'team',
      maxMembers: 5
    },
    {
      name: 'Compliance Team',
      slug: 'compliance-team',
      description: 'Regulatory compliance and risk management',
      tier: 'professional',
      maxMembers: 8
    }
  ]

  for (let i = 0; i < teamData.length; i++) {
    const teamInfo = teamData[i]
    const owner = users[i + 1] // Skip admin user

    const team = await prisma.team.create({
      data: {
        name: teamInfo.name,
        slug: teamInfo.slug,
        description: teamInfo.description,
        ownerId: owner.id,
        subscriptionTier: teamInfo.tier as any,
        maxMembers: teamInfo.maxMembers,
        settings: {
          autoAssignAnalyses: true,
          sharedPatterns: true,
          teamReporting: true
        }
      }
    })
    teams.push(team)

    // Add team members
    const memberCount = Math.min(3, users.length - 1)
    for (let j = 0; j < memberCount; j++) {
      const member = users[j + 2] // Skip owner and admin
      if (member) {
        await prisma.teamMember.create({
          data: {
            teamId: team.id,
            userId: member.id,
            role: j === 0 ? 'admin' : 'member',
            permissions: {
              viewAnalyses: true,
              createAnalyses: true,
              editPatterns: j === 0,
              manageMembers: j === 0
            },
            invitedBy: owner.id,
            invitedAt: new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000)
          }
        })
      }
    }
  }

  return teams
}

async function seedPatternLibrary(users: any[]) {
  const patterns = []

  for (const [category, data] of Object.entries(PATTERN_TEMPLATES)) {
    for (let i = 0; i < data.names.length; i++) {
      const pattern = await prisma.patternLibrary.create({
        data: {
          category,
          name: data.names[i],
          description: data.descriptions[i],
          patternKeywords: generatePatternKeywords(category),
          severity: getRandomSeverity(),
          explanation: `This pattern identifies ${data.descriptions[i].toLowerCase()} which may pose risks to user interests.`,
          recommendation: `Review and negotiate terms to ${getRecommendationForCategory(category)}.`,
          legalContext: `Common in ${category.replace('_', ' ')} clauses in commercial agreements.`,
          examples: generatePatternExamples(category),
          isActive: true,
          isCustom: i > 0 && Math.random() > 0.7,
          createdBy: Math.random() > 0.5 ? users[Math.floor(Math.random() * users.length)].id : undefined,
          version: 1
        }
      })
      patterns.push(pattern)

      // Create vector embedding for pattern (simulated)
      const embedding = EmbeddingUtils.generateRandomVector(768)
      await vectorService.upsertPattern(pattern.id, embedding, {
        patternId: pattern.id,
        category: pattern.category,
        name: pattern.name,
        severity: pattern.severity as any,
        language: 'en',
        version: pattern.version,
        isActive: pattern.isActive,
        isCustom: pattern.isCustom,
        createdBy: pattern.createdBy || undefined,
        metadata: {
          keywords: pattern.patternKeywords,
          legalContext: pattern.legalContext || undefined,
          jurisdictions: ['US', 'EU'],
          lastUpdated: pattern.updatedAt.toISOString()
        }
      })
    }
  }

  // Add some additional generic patterns
  const genericPatterns = [
    {
      category: 'general',
      name: 'Unfair Advantage Clause',
      description: 'Terms that create unfair advantages for one party over another',
      severity: 'medium'
    },
    {
      category: 'general',
      name: 'Unclear Obligations',
      description: 'Vague or ambiguous language regarding party obligations',
      severity: 'low'
    }
  ]

  for (const patternData of genericPatterns) {
    const pattern = await prisma.patternLibrary.create({
      data: {
        category: patternData.category,
        name: patternData.name,
        description: patternData.description,
        patternKeywords: ['unfair', 'unclear', 'ambiguous', 'vague'],
        severity: patternData.severity as any,
        explanation: `This pattern identifies ${patternData.description.toLowerCase()}.`,
        recommendation: 'Request clarification and more balanced terms.',
        examples: ['Example clause text here...'],
        isActive: true,
        isCustom: false,
        version: 1
      }
    })
    patterns.push(pattern)
  }

  return patterns
}

async function seedActionTemplates(users: any[]) {
  const templates = []

  const templateData = [
    {
      category: 'data_privacy',
      name: 'GDPR Data Deletion Request',
      description: 'Template for requesting data deletion under GDPR Article 17',
      legalBasis: 'GDPR Article 17',
      regions: ['EU'],
      successRate: 0.85
    },
    {
      category: 'liability',
      name: 'Liability Cap Negotiation',
      description: 'Template for negotiating reasonable liability limitations',
      legalBasis: 'Commercial negotiation',
      regions: ['US', 'EU'],
      successRate: 0.72
    },
    {
      category: 'termination',
      name: 'Contract Termination Notice',
      description: 'Template for providing proper termination notice',
      legalBasis: 'Contract terms',
      regions: ['US', 'EU', 'CA'],
      successRate: 0.95
    },
    {
      category: 'dispute_resolution',
      name: 'Alternative Dispute Resolution Request',
      description: 'Template for requesting mediation instead of arbitration',
      legalBasis: 'Dispute resolution clause',
      regions: ['US'],
      successRate: 0.45
    }
  ]

  for (const templateInfo of templateData) {
    const template = await prisma.actionTemplate.create({
      data: {
        category: templateInfo.category,
        name: templateInfo.name,
        description: templateInfo.description,
        templateContent: generateTemplateContent(templateInfo.name),
        variables: generateTemplateVariables(templateInfo.category),
        legalBasis: templateInfo.legalBasis,
        applicableRegions: templateInfo.regions,
        successRate: templateInfo.successRate,
        usageCount: Math.floor(Math.random() * 100),
        isActive: true,
        createdBy: users[Math.floor(Math.random() * users.length)].id
      }
    })
    templates.push(template)

    // Create vector embedding for template
    const embedding = EmbeddingUtils.generateRandomVector(768)
    await vectorService.upsertTemplate(template.id, embedding, {
      templateId: template.id,
      category: template.category,
      name: template.name,
      language: 'en',
      jurisdictions: template.applicableRegions,
      successRate: template.successRate || 0,
      usageCount: template.usageCount,
      isActive: template.isActive,
      createdBy: template.createdBy || undefined,
      metadata: {
        variables: template.variables || {},
        legalBasis: template.legalBasis || undefined,
        lastUsed: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        effectiveness: template.successRate || 0
      }
    })
  }

  return templates
}

async function seedDocuments(users: any[], teams: any[]) {
  const documents = []

  for (const user of users.slice(1)) { // Skip admin user
    const docCount = Math.floor(Math.random() * 8) + 2 // 2-10 documents per user
    
    for (let i = 0; i < docCount; i++) {
      const docType = getRandomDocumentType()
      const titles = SAMPLE_DOCUMENT_TITLES[docType as keyof typeof SAMPLE_DOCUMENT_TITLES]
      const title = titles[Math.floor(Math.random() * titles.length)]
      
      // Simulate document content hash (privacy-first - no content stored)
      const documentHash = createHash('sha256')
        .update(`${title}-${user.id}-${Date.now()}-${Math.random()}`)
        .digest('hex')

      const document = await prisma.document.create({
        data: {
          userId: user.id,
          teamId: Math.random() > 0.7 && teams.length > 0 ? teams[Math.floor(Math.random() * teams.length)].id : undefined,
          title,
          url: Math.random() > 0.5 ? `https://example.com/legal/${documentHash.substring(0, 8)}` : undefined,
          documentType: docType as any,
          documentHash,
          contentLength: Math.floor(Math.random() * 50000) + 5000,
          language: 'en',
          sourceInfo: {
            uploadedVia: Math.random() > 0.5 ? 'web' : 'api',
            originalFilename: `${title.replace(/\s+/g, '_')}.pdf`,
            contentType: 'application/pdf'
          },
          monitoringEnabled: Math.random() > 0.4,
          monitoringFrequency: Math.random() > 0.5 ? 86400 : 604800, // Daily or weekly
          lastMonitoredAt: Math.random() > 0.3 ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) : undefined,
          nextMonitorAt: Math.random() > 0.3 ? new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000) : undefined,
          createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000) // Up to 90 days ago
        }
      })
      documents.push(document)

      // Create vector embedding for document
      const embedding = EmbeddingUtils.generateRandomVector(1536)
      await vectorService.upsertDocument(document.id, embedding, {
        documentId: document.id,
        documentHash: document.documentHash,
        title: document.title,
        documentType: document.documentType,
        language: document.language,
        contentLength: document.contentLength || 0,
        userId: document.userId || '',
        teamId: document.teamId || undefined,
        createdAt: document.createdAt.toISOString(),
        metadata: {
          url: document.url || undefined,
          sourceInfo: document.sourceInfo || undefined,
          analysisVersion: 1
        }
      })

      // Create document changes for monitoring
      if (document.monitoringEnabled && Math.random() > 0.6) {
        await prisma.documentChange.create({
          data: {
            documentId: document.id,
            oldHash: createHash('sha256').update(`old-${documentHash}`).digest('hex'),
            newHash: documentHash,
            changeType: 'content_update',
            changeSummary: 'Minor updates to privacy policy section',
            significantChanges: ['Updated data retention period', 'Added new third-party service'],
            riskChange: Math.floor(Math.random() * 20) - 10, // -10 to +10 change
            detectedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
          }
        })
      }
    }
  }

  return documents
}

async function seedDocumentAnalyses(documents: any[], users: any[], patterns: any[]) {
  const analyses = []

  for (const document of documents) {
    // 80% of documents have at least one analysis
    if (Math.random() > 0.2) {
      const analysisCount = Math.random() > 0.7 ? 2 : 1 // Most have 1, some have 2 versions
      
      for (let version = 1; version <= analysisCount; version++) {
        const analysis = await prisma.documentAnalysis.create({
          data: {
            documentId: document.id,
            userId: document.userId,
            version,
            status: version === analysisCount ? 'completed' : 'completed',
            overallRiskScore: Math.floor(Math.random() * 100),
            processingTimeMs: Math.floor(Math.random() * 30000) + 5000,
            modelUsed: 'gpt-4-legal-analysis',
            modelVersion: '1.0.0',
            analysisMetadata: {
              patternsMatched: Math.floor(Math.random() * 15) + 5,
              confidenceLevel: Math.random() * 0.3 + 0.7,
              processingSteps: ['text_extraction', 'pattern_matching', 'risk_scoring', 'recommendation_generation']
            },
            executiveSummary: SAMPLE_EXECUTIVE_SUMMARIES[Math.floor(Math.random() * SAMPLE_EXECUTIVE_SUMMARIES.length)],
            keyFindings: SAMPLE_KEY_FINDINGS[Math.floor(Math.random() * SAMPLE_KEY_FINDINGS.length)],
            recommendations: SAMPLE_RECOMMENDATIONS[Math.floor(Math.random() * SAMPLE_RECOMMENDATIONS.length)],
            startedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
            completedAt: new Date(Date.now() - Math.random() * 29 * 24 * 60 * 60 * 1000),
            expiresAt: new Date(Date.now() + (90 - Math.random() * 30) * 24 * 60 * 60 * 1000) // 60-90 days from now
          }
        })
        analyses.push(analysis)

        // Create findings for this analysis
        const findingCount = Math.floor(Math.random() * 12) + 3 // 3-15 findings
        
        for (let f = 0; f < findingCount; f++) {
          const pattern = patterns[Math.floor(Math.random() * patterns.length)]
          const category = LEGAL_PATTERN_CATEGORIES[Math.floor(Math.random() * LEGAL_PATTERN_CATEGORIES.length)]
          
          const finding = await prisma.analysisFinding.create({
            data: {
              analysisId: analysis.id,
              patternId: Math.random() > 0.3 ? pattern.id : undefined,
              category,
              title: generateFindingTitle(category),
              description: generateFindingDescription(category),
              severity: getRandomSeverity() as any,
              confidenceScore: Math.random() * 0.3 + 0.7,
              textExcerpt: generateTextExcerpt(),
              positionStart: Math.floor(Math.random() * 10000),
              positionEnd: Math.floor(Math.random() * 5000) + 10000,
              recommendation: generateFindingRecommendation(category),
              impactExplanation: generateImpactExplanation(category)
            }
          })

          // Create vector embedding for clause (simulated)
          const clauseEmbedding = EmbeddingUtils.generateRandomVector(768)
          await vectorService.upsertClause(finding.id, clauseEmbedding, {
            clauseId: finding.id,
            documentId: document.id,
            analysisId: analysis.id,
            category: finding.category,
            severity: finding.severity as any,
            confidenceScore: finding.confidenceScore || 0.8,
            position: {
              start: finding.positionStart || 0,
              end: finding.positionEnd || 100
            },
            language: 'en',
            metadata: {
              extractedText: finding.textExcerpt || '',
              patternMatches: pattern ? [pattern.id] : [],
              riskFactors: [category, finding.severity],
              recommendations: [finding.recommendation || '']
            }
          })
        }
      }
    }
  }

  return analyses
}

async function seedUserActions(users: any[], documents: any[], templates: any[]) {
  const actions = []

  for (const user of users.slice(1)) { // Skip admin
    const actionCount = Math.floor(Math.random() * 5) + 1 // 1-5 actions per user
    
    for (let i = 0; i < actionCount; i++) {
      const template = templates[Math.floor(Math.random() * templates.length)]
      const document = documents.filter(d => d.userId === user.id)[Math.floor(Math.random() * documents.filter(d => d.userId === user.id).length)]
      
      if (!document) continue

      const status = getRandomActionStatus()
      const createdAt = new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000)
      
      const action = await prisma.userAction.create({
        data: {
          userId: user.id,
          documentId: document.id,
          templateId: template.id,
          title: `${template.name} - ${document.title}`,
          recipientEmail: Math.random() > 0.3 ? `legal@${SAMPLE_COMPANIES[Math.floor(Math.random() * SAMPLE_COMPANIES.length)].toLowerCase().replace(/\s+/g, '')}.com` : undefined,
          recipientCompany: Math.random() > 0.3 ? SAMPLE_COMPANIES[Math.floor(Math.random() * SAMPLE_COMPANIES.length)] : undefined,
          generatedContent: generateActionContent(template.name),
          status: status as any,
          sentAt: ['sent', 'delivered', 'responded', 'completed'].includes(status) ? new Date(createdAt.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000) : undefined,
          deliveredAt: ['delivered', 'responded', 'completed'].includes(status) ? new Date(createdAt.getTime() + Math.random() * 8 * 24 * 60 * 60 * 1000) : undefined,
          responseReceivedAt: ['responded', 'completed'].includes(status) ? new Date(createdAt.getTime() + Math.random() * 14 * 24 * 60 * 60 * 1000) : undefined,
          responseContent: ['responded', 'completed'].includes(status) ? generateResponseContent() : undefined,
          followUpRequired: Math.random() > 0.7,
          followUpDate: Math.random() > 0.7 ? new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000) : undefined,
          notes: Math.random() > 0.5 ? generateActionNotes() : undefined,
          metadata: {
            source: 'web_app',
            userAgent: 'Mozilla/5.0 (compatible; FinePrintAI/1.0)',
            ipAddress: generateRandomIP()
          },
          createdAt
        }
      })
      actions.push(action)
    }
  }

  return actions
}

async function seedNotifications(users: any[]) {
  const notifications = []

  const notificationTypes = [
    'analysis_complete',
    'document_changed',
    'subscription_update',
    'action_required',
    'system_alert'
  ]

  for (const user of users.slice(1)) { // Skip admin
    const notificationCount = Math.floor(Math.random() * 15) + 5 // 5-20 notifications per user
    
    for (let i = 0; i < notificationCount; i++) {
      const type = notificationTypes[Math.floor(Math.random() * notificationTypes.length)]
      const isRead = Math.random() > 0.3 // 70% read rate
      const createdAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      
      const notification = await prisma.notification.create({
        data: {
          userId: user.id,
          type: type as any,
          title: generateNotificationTitle(type),
          message: generateNotificationMessage(type),
          data: generateNotificationData(type),
          readAt: isRead ? new Date(createdAt.getTime() + Math.random() * 24 * 60 * 60 * 1000) : undefined,
          actionUrl: Math.random() > 0.5 ? `/dashboard/analysis/${randomBytes(8).toString('hex')}` : undefined,
          expiresAt: Math.random() > 0.8 ? new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000) : undefined,
          createdAt
        }
      })
      notifications.push(notification)
    }
  }

  return notifications
}

async function seedAnalyticsData() {
  const subscriptionTiers = ['free', 'starter', 'professional', 'team', 'enterprise']
  
  // Generate 30 days of analytics data
  for (let day = 0; day < 30; day++) {
    const date = new Date(Date.now() - day * 24 * 60 * 60 * 1000)
    
    for (const tier of subscriptionTiers) {
      await prisma.usageAnalytics.create({
        data: {
          date,
          subscriptionTier: tier as any,
          totalUsers: Math.floor(Math.random() * 1000 * (subscriptionTiers.indexOf(tier) + 1)),
          totalAnalyses: Math.floor(Math.random() * 5000 * (subscriptionTiers.indexOf(tier) + 1)),
          totalDocuments: Math.floor(Math.random() * 2000 * (subscriptionTiers.indexOf(tier) + 1)),
          avgRiskScore: Math.random() * 100,
          topDocumentTypes: {
            'terms_of_service': Math.floor(Math.random() * 500),
            'privacy_policy': Math.floor(Math.random() * 400),
            'eula': Math.floor(Math.random() * 300)
          },
          topFindingCategories: {
            'liability': Math.floor(Math.random() * 200),
            'data_privacy': Math.floor(Math.random() * 180),
            'intellectual_property': Math.floor(Math.random() * 150)
          },
          performanceMetrics: {
            avgProcessingTime: Math.floor(Math.random() * 30000) + 5000,
            successRate: Math.random() * 0.1 + 0.9,
            errorRate: Math.random() * 0.05
          }
        }
      })
    }
  }

  // System metrics
  const metricNames = [
    'cpu_usage_percent',
    'memory_usage_bytes',
    'disk_usage_percent',
    'request_count',
    'error_rate',
    'response_time_ms'
  ]

  for (let hour = 0; hour < 24 * 7; hour++) { // 7 days of hourly metrics
    const timestamp = new Date(Date.now() - hour * 60 * 60 * 1000)
    
    for (const metric of metricNames) {
      await prisma.systemMetrics.create({
        data: {
          metricName: metric,
          metricValue: generateMetricValue(metric),
          tags: {
            service: 'api',
            environment: 'production',
            region: 'us-east-1'
          },
          timestamp
        }
      })
    }
  }
}

async function seedApiKeys(users: any[], teams: any[]) {
  const apiKeys = []

  for (const user of users.slice(1, 4)) { // First few users get API keys
    const keyCount = Math.floor(Math.random() * 3) + 1 // 1-3 keys per user
    
    for (let i = 0; i < keyCount; i++) {
      const keyString = `fpai_${randomBytes(16).toString('hex')}`
      const keyHash = createHash('sha256').update(keyString).digest('hex')
      const keyPrefix = keyString.substring(0, 12)
      
      const apiKey = await prisma.apiKey.create({
        data: {
          userId: user.id,
          teamId: Math.random() > 0.5 && teams.length > 0 ? teams[Math.floor(Math.random() * teams.length)].id : undefined,
          name: `API Key ${i + 1}`,
          keyHash,
          keyPrefix,
          permissions: {
            read: true,
            write: Math.random() > 0.5,
            admin: Math.random() > 0.8
          },
          rateLimit: [1000, 5000, 10000][Math.floor(Math.random() * 3)],
          usageCount: Math.floor(Math.random() * 1000),
          lastUsedAt: Math.random() > 0.3 ? new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) : undefined,
          expiresAt: Math.random() > 0.7 ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : undefined,
          isActive: Math.random() > 0.1
        }
      })
      apiKeys.push(apiKey)
      
      console.log(`🔑 Generated API Key: ${keyString} (User: ${user.email})`)
    }
  }

  return apiKeys
}

async function warmUpCache(users: any[]) {
  // Cache some user dashboard data
  for (const user of users.slice(0, 3)) {
    const dashboardData = {
      totalDocuments: Math.floor(Math.random() * 50),
      totalAnalyses: Math.floor(Math.random() * 100),
      avgRiskScore: Math.random() * 100,
      monitoredDocuments: Math.floor(Math.random() * 20),
      totalActions: Math.floor(Math.random() * 30),
      lastAnalysisAt: new Date().toISOString(),
      recentFindings: [
        { category: 'liability', severity: 'high', count: 5 },
        { category: 'data_privacy', severity: 'medium', count: 8 }
      ],
      subscriptionUsage: {
        used: Math.floor(Math.random() * 80),
        limit: 100,
        resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    }
    
    await cacheService.setUserDashboard(user.id, dashboardData)
  }

  // Cache pattern library
  const cachedPatterns = await prisma.patternLibrary.findMany({
    where: { isActive: true },
    take: 50
  })
  await cacheService.setPatternLibrary(cachedPatterns)
}

// Helper functions for generating sample data
function getRandomDocumentType() {
  const types = ['terms_of_service', 'privacy_policy', 'eula', 'cookie_policy']
  return types[Math.floor(Math.random() * types.length)]
}

function getRandomSeverity() {
  const severities = ['low', 'medium', 'high', 'critical']
  const weights = [0.4, 0.35, 0.2, 0.05] // Weighted toward lower severity
  const random = Math.random()
  let sum = 0
  
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i]
    if (random < sum) return severities[i]
  }
  
  return 'medium'
}

function getRandomActionStatus() {
  const statuses = ['draft', 'sent', 'delivered', 'responded', 'completed', 'failed']
  const weights = [0.2, 0.25, 0.2, 0.15, 0.15, 0.05]
  const random = Math.random()
  let sum = 0
  
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i]
    if (random < sum) return statuses[i]
  }
  
  return 'draft'
}

function generatePatternKeywords(category: string): string[] {
  const keywordMap: Record<string, string[]> = {
    liability: ['liability', 'limitation', 'damages', 'indemnify', 'exclude', 'disclaim'],
    data_privacy: ['data', 'privacy', 'personal', 'collect', 'share', 'retain', 'delete'],
    intellectual_property: ['intellectual', 'property', 'copyright', 'trademark', 'patent', 'license'],
    termination: ['terminate', 'end', 'cancel', 'expire', 'breach', 'notice'],
    dispute_resolution: ['dispute', 'arbitration', 'mediation', 'court', 'jurisdiction', 'governing']
  }
  
  return keywordMap[category] || ['clause', 'term', 'provision']
}

function getRecommendationForCategory(category: string): string {
  const recommendations: Record<string, string> = {
    liability: 'ensure mutual liability protections and reasonable caps',
    data_privacy: 'establish clear data handling and user consent mechanisms',
    intellectual_property: 'clarify IP ownership and usage rights',
    termination: 'negotiate fair termination terms and notice periods',
    dispute_resolution: 'consider alternative dispute resolution mechanisms'
  }
  
  return recommendations[category] || 'review and negotiate terms'
}

function generatePatternExamples(category: string): string[] {
  const examples: Record<string, string[]> = {
    liability: [
      'IN NO EVENT SHALL COMPANY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES',
      'User agrees to indemnify and hold harmless Company from any and all claims'
    ],
    data_privacy: [
      'We may collect, use, and share your personal information as described in this policy',
      'Data will be retained for as long as necessary for our business purposes'
    ],
    intellectual_property: [
      'User grants Company a worldwide, perpetual license to use any content submitted',
      'All intellectual property rights in the Service belong to Company'
    ]
  }
  
  return examples[category] || ['Example clause text would appear here']
}

function generateTemplateContent(name: string): string {
  const templates: Record<string, string> = {
    'GDPR Data Deletion Request': `Subject: Request for Data Deletion Under GDPR Article 17

Dear {{recipient_name}},

I am writing to formally request the deletion of my personal data held by {{company_name}} under Article 17 of the General Data Protection Regulation (GDPR).

Account Details:
- Email: {{user_email}}
- Account ID: {{account_id}}

I request that you delete all personal data associated with my account within 30 days as required by GDPR.

Please confirm receipt of this request and provide confirmation once the deletion is complete.

Best regards,
{{user_name}}`,
    
    'Liability Cap Negotiation': `Subject: Request to Review Liability Limitations

Dear {{recipient_name}},

After reviewing the proposed agreement, I would like to discuss the liability limitation clauses outlined in Section {{section_number}}.

The current terms appear to create an imbalance in risk allocation. I propose:
- Mutual liability caps of {{proposed_cap}}
- Exclusions should not apply to gross negligence or willful misconduct
- Data breach liability should have separate, higher limits

I believe these modifications would create a more balanced agreement while still providing reasonable protections.

Please let me know your thoughts on these proposed changes.

Best regards,
{{user_name}}`
  }
  
  return templates[name] || `Template content for ${name} would be generated here with appropriate variables and legal language.`
}

function generateTemplateVariables(category: string): Record<string, any> {
  const variables: Record<string, any> = {
    data_privacy: {
      user_name: { type: 'text', required: true },
      user_email: { type: 'email', required: true },
      company_name: { type: 'text', required: true },
      recipient_name: { type: 'text', required: false }
    },
    liability: {
      user_name: { type: 'text', required: true },
      company_name: { type: 'text', required: true },
      proposed_cap: { type: 'currency', required: true },
      section_number: { type: 'text', required: false }
    }
  }
  
  return variables[category] || {
    user_name: { type: 'text', required: true },
    company_name: { type: 'text', required: true }
  }
}

function generateFindingTitle(category: string): string {
  const titles: Record<string, string[]> = {
    liability: ['Excessive Liability Limitation', 'Broad Indemnification Clause', 'Unfair Damage Exclusion'],
    data_privacy: ['Unlimited Data Retention', 'Broad Data Sharing Rights', 'Weak Consent Mechanism'],
    intellectual_property: ['Overly Broad IP Assignment', 'Perpetual Usage Rights', 'Limited User IP Protection'],
    termination: ['Unilateral Termination Rights', 'Inadequate Notice Period', 'Unfair Survival Clauses'],
    dispute_resolution: ['Mandatory Arbitration Clause', 'Restrictive Venue Selection', 'Limited Appeal Rights']
  }
  
  const categoryTitles = titles[category] || ['Concerning Contract Term', 'Potentially Unfair Clause']
  return categoryTitles[Math.floor(Math.random() * categoryTitles.length)]
}

function generateFindingDescription(category: string): string {
  const descriptions: Record<string, string> = {
    liability: 'This clause appears to limit the company\'s liability in a way that may be unfavorable to users.',
    data_privacy: 'The data handling terms may not provide adequate protection for user privacy rights.',
    intellectual_property: 'The intellectual property terms may grant excessive rights to the company.',
    termination: 'The termination provisions appear to favor the company over the user.',
    dispute_resolution: 'The dispute resolution mechanism may limit user access to legal remedies.'
  }
  
  return descriptions[category] || 'This clause contains terms that may warrant further review.'
}

function generateFindingRecommendation(category: string): string {
  const recommendations: Record<string, string> = {
    liability: 'Consider negotiating for mutual liability caps and reasonable exclusions.',
    data_privacy: 'Request clarification on data retention periods and user control mechanisms.',
    intellectual_property: 'Negotiate for more limited IP grants and better user protections.',
    termination: 'Seek more balanced termination rights and adequate notice periods.',
    dispute_resolution: 'Consider alternative dispute resolution options or court jurisdiction.'
  }
  
  return recommendations[category] || 'Review this clause with legal counsel to assess potential risks.'
}

function generateImpactExplanation(category: string): string {
  const impacts: Record<string, string> = {
    liability: 'This could limit your ability to recover damages if the service causes problems.',
    data_privacy: 'Your personal data may be used or retained longer than necessary.',
    intellectual_property: 'You may lose rights to content or ideas you share with the service.',
    termination: 'The company may be able to terminate your access without adequate notice.',
    dispute_resolution: 'You may have limited options for resolving disputes with the company.'
  }
  
  return impacts[category] || 'This clause may impact your rights or obligations under the agreement.'
}

function generateTextExcerpt(): string {
  const excerpts = [
    'The Company shall not be liable for any indirect, incidental, special, consequential, or punitive damages...',
    'User grants Company a non-exclusive, worldwide, royalty-free license to use, reproduce, and distribute...',
    'This Agreement may be terminated by Company at any time, with or without cause, upon written notice...',
    'All disputes arising under this Agreement shall be resolved through binding arbitration...',
    'Company may collect, use, and disclose personal information as described in the Privacy Policy...'
  ]
  
  return excerpts[Math.floor(Math.random() * excerpts.length)]
}

function generateActionContent(templateName: string): string {
  return `Generated content for ${templateName} action. This would contain the personalized message based on the template and user-provided variables.`
}

function generateResponseContent(): string {
  const responses = [
    'Thank you for your request. We will review the proposed changes and respond within 5 business days.',
    'We acknowledge receipt of your notice and will process your request according to our procedures.',
    'We appreciate your feedback on the contract terms and are open to discussing modifications.',
    'Your request has been forwarded to our legal team for review and consideration.'
  ]
  
  return responses[Math.floor(Math.random() * responses.length)]
}

function generateActionNotes(): string {
  const notes = [
    'Follow up required in 1 week if no response received.',
    'Customer expressed concern about liability terms during initial discussion.',
    'Requested expedited review due to pending project deadline.',
    'Initial response was positive, awaiting formal reply from legal team.'
  ]
  
  return notes[Math.floor(Math.random() * notes.length)]
}

function generateRandomIP(): string {
  return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
}

function generateNotificationTitle(type: string): string {
  const titles: Record<string, string[]> = {
    analysis_complete: ['Document Analysis Complete', 'Your Report is Ready', 'Analysis Finished Successfully'],
    document_changed: ['Document Change Detected', 'Monitored Document Updated', 'Change Alert'],
    subscription_update: ['Subscription Updated', 'Plan Change Confirmed', 'Billing Update'],
    action_required: ['Action Required', 'Response Needed', 'Follow-up Required'],
    system_alert: ['System Maintenance', 'Service Update', 'Important Notice']
  }
  
  const typeTitles = titles[type] || ['Notification']
  return typeTitles[Math.floor(Math.random() * typeTitles.length)]
}

function generateNotificationMessage(type: string): string {
  const messages: Record<string, string> = {
    analysis_complete: 'Your document analysis has been completed and is ready for review.',
    document_changed: 'We detected changes in one of your monitored documents.',
    subscription_update: 'Your subscription has been successfully updated.',
    action_required: 'An action you created requires your attention.',
    system_alert: 'We have an important update about our service.'
  }
  
  return messages[type] || 'You have a new notification.'
}

function generateNotificationData(type: string): Record<string, any> {
  const baseData = {
    timestamp: new Date().toISOString(),
    source: 'system'
  }
  
  switch (type) {
    case 'analysis_complete':
      return {
        ...baseData,
        analysisId: randomBytes(8).toString('hex'),
        riskScore: Math.floor(Math.random() * 100),
        findingCount: Math.floor(Math.random() * 15) + 1
      }
    case 'document_changed':
      return {
        ...baseData,
        documentId: randomBytes(8).toString('hex'),
        changeType: 'content_update',
        riskChange: Math.floor(Math.random() * 20) - 10
      }
    default:
      return baseData
  }
}

function generateMetricValue(metricName: string): number {
  switch (metricName) {
    case 'cpu_usage_percent':
      return Math.random() * 80 + 10
    case 'memory_usage_bytes':
      return Math.random() * 1000000000 + 500000000
    case 'disk_usage_percent':
      return Math.random() * 60 + 20
    case 'request_count':
      return Math.floor(Math.random() * 1000) + 100
    case 'error_rate':
      return Math.random() * 0.05
    case 'response_time_ms':
      return Math.random() * 500 + 50
    default:
      return Math.random() * 100
  }
}

// Run the seeding
main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    console.log('🔌 Database connection closed')
  })