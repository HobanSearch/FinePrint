/**
 * Test data factory functions
 * Provides easy creation of test data with realistic defaults and customization options
 */

import { faker } from '@faker-js/faker';

// Set seed for consistent test data
faker.seed(12345);

export interface TestUserOptions {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: 'user' | 'admin' | 'support';
  subscriptionStatus?: 'free' | 'basic' | 'pro' | 'enterprise';
  createdAt?: Date;
  updatedAt?: Date;
  isActive?: boolean;
  metadata?: Record<string, any>;
}

export interface TestDocumentOptions {
  id?: string;
  userId?: string;
  title?: string;
  type?: 'terms-of-service' | 'privacy-policy' | 'contract' | 'eula' | 'other';
  content?: string;
  language?: string;
  status?: 'active' | 'archived' | 'deleted';
  size?: number;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: Record<string, any>;
}

export interface TestAnalysisOptions {
  id?: string;
  documentId?: string;
  userId?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  overallRiskScore?: number;
  findings?: any[];
  executiveSummary?: string;
  processingTime?: number;
  modelVersion?: string;
  createdAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
}

export interface TestFindingOptions {
  id?: string;
  analysisId?: string;
  category?: string;
  title?: string;
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  confidence?: number;
  location?: { start: number; end: number };
  recommendation?: string;
  references?: string[];
}

export interface TestSubscriptionOptions {
  id?: string;
  userId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status?: 'active' | 'canceled' | 'past_due' | 'unpaid';
  plan?: 'free' | 'basic' | 'pro' | 'enterprise';
  billingCycle?: 'monthly' | 'yearly';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestNotificationOptions {
  id?: string;
  userId?: string;
  type?: 'analysis_complete' | 'subscription_updated' | 'security_alert' | 'system_update';
  title?: string;
  message?: string;
  status?: 'unread' | 'read' | 'archived';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  createdAt?: Date;
  readAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * Creates a test user with realistic data
 */
export function createMockUser(options: TestUserOptions = {}): any {
  const firstName = options.firstName || faker.person.firstName();
  const lastName = options.lastName || faker.person.lastName();
  
  return {
    id: options.id || `user-${faker.string.uuid()}`,
    email: options.email || faker.internet.email({ firstName, lastName }).toLowerCase(),
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    role: options.role || 'user',
    subscriptionStatus: options.subscriptionStatus || 'free',
    isActive: options.isActive ?? true,
    emailVerified: true,
    lastLoginAt: faker.date.recent({ days: 7 }),
    createdAt: options.createdAt || faker.date.past({ years: 1 }),
    updatedAt: options.updatedAt || faker.date.recent({ days: 30 }),
    metadata: options.metadata || {},
    
    // Additional realistic fields
    avatar: faker.image.avatar(),
    timezone: faker.location.timeZone(),
    language: 'en',
    preferences: {
      emailNotifications: true,
      darkMode: faker.datatype.boolean(),
      autoAnalysis: true,
    },
  };
}

/**
 * Creates a test document with realistic legal content
 */
export function createMockDocument(options: TestDocumentOptions = {}): any {
  const documentTypes = {
    'terms-of-service': {
      title: 'Terms of Service Agreement',
      content: generateTermsOfServiceContent(),
    },
    'privacy-policy': {
      title: 'Privacy Policy',
      content: generatePrivacyPolicyContent(),
    },
    'contract': {
      title: 'Service Agreement Contract',
      content: generateContractContent(),
    },
    'eula': {
      title: 'End User License Agreement',
      content: generateEulaContent(),
    },
    'other': {
      title: 'Legal Document',
      content: generateGenericLegalContent(),
    },
  };

  const type = options.type || faker.helpers.arrayElement(['terms-of-service', 'privacy-policy', 'contract', 'eula']);
  const typeData = documentTypes[type];
  const content = options.content || typeData.content;

  return {
    id: options.id || `doc-${faker.string.uuid()}`,
    userId: options.userId || `user-${faker.string.uuid()}`,
    title: options.title || typeData.title,
    type,
    content,
    language: options.language || 'en',
    status: options.status || 'active',
    size: options.size || content.length,
    wordCount: content.split(/\s+/).length,
    checksum: faker.string.alphanumeric(32),
    version: '1.0',
    createdAt: options.createdAt || faker.date.past({ years: 1 }),
    updatedAt: options.updatedAt || faker.date.recent({ days: 30 }),
    metadata: {
      source: faker.helpers.arrayElement(['upload', 'url', 'api']),
      originalFilename: `${faker.system.fileName()}.pdf`,
      ...options.metadata,
    },
  };
}

/**
 * Creates a test analysis with realistic findings
 */
export function createMockAnalysis(options: TestAnalysisOptions = {}): any {
  const status = options.status || 'completed';
  const findings = options.findings || generateMockFindings(faker.number.int({ min: 3, max: 12 }));
  const overallRiskScore = options.overallRiskScore ?? calculateRiskScore(findings);

  return {
    id: options.id || `analysis-${faker.string.uuid()}`,
    documentId: options.documentId || `doc-${faker.string.uuid()}`,
    userId: options.userId || `user-${faker.string.uuid()}`,
    status,
    overallRiskScore,
    findings,
    executiveSummary: options.executiveSummary || generateExecutiveSummary(findings, overallRiskScore),
    processingTime: options.processingTime || faker.number.int({ min: 2000, max: 15000 }),
    modelVersion: options.modelVersion || faker.helpers.arrayElement(['phi:2.7b', 'mistral:7b', 'llama2:13b']),
    confidence: faker.number.float({ min: 0.7, max: 0.98, precision: 0.01 }),
    createdAt: options.createdAt || faker.date.past({ days: 30 }),
    completedAt: status === 'completed' ? (options.completedAt || faker.date.recent({ days: 1 })) : null,
    updatedAt: faker.date.recent({ hours: 1 }),
    metadata: {
      analysisVersion: '2.1.0',
      totalClauses: faker.number.int({ min: 15, max: 50 }),
      flaggedClauses: findings.length,
      ...options.metadata,
    },
  };
}

/**
 * Creates a test finding with realistic legal issue data
 */
export function createMockFinding(options: TestFindingOptions = {}): any {
  const findingTemplates = [
    {
      category: 'data-usage',
      title: 'Broad Data Usage Rights',
      description: 'The service reserves extensive rights to use personal data for undefined purposes.',
      severity: 'high' as const,
      recommendation: 'Request specific limitations on data usage and clear purpose definitions.',
    },
    {
      category: 'liability',
      title: 'Complete Liability Waiver',
      description: 'The agreement contains broad liability waivers that may limit legal recourse.',
      severity: 'critical' as const,
      recommendation: 'Negotiate limitations on liability waivers, especially for negligence.',
    },
    {
      category: 'termination',
      title: 'Unilateral Termination Rights',
      description: 'The service provider can terminate the agreement without cause or notice.',
      severity: 'medium' as const,
      recommendation: 'Request reasonable notice periods and cause requirements for termination.',
    },
    {
      category: 'dispute-resolution',
      title: 'Mandatory Arbitration Clause',
      description: 'All disputes must be resolved through binding arbitration, waiving jury trial rights.',
      severity: 'high' as const,
      recommendation: 'Consider negotiating opt-out provisions or limiting arbitration scope.',
    },
    {
      category: 'content-rights',
      title: 'Perpetual Content License',
      description: 'User-generated content is licensed to the service in perpetuity with broad usage rights.',
      severity: 'medium' as const,
      recommendation: 'Negotiate time-limited licenses and specific usage restrictions.',
    },
  ];

  const template = faker.helpers.arrayElement(findingTemplates);

  return {
    id: options.id || `finding-${faker.string.uuid()}`,
    analysisId: options.analysisId || `analysis-${faker.string.uuid()}`,
    category: options.category || template.category,
    title: options.title || template.title,
    description: options.description || template.description,
    severity: options.severity || template.severity,
    confidence: options.confidence ?? faker.number.float({ min: 0.6, max: 0.95, precision: 0.01 }),
    location: options.location || {
      start: faker.number.int({ min: 0, max: 5000 }),
      end: faker.number.int({ min: 5001, max: 10000 }),
    },
    recommendation: options.recommendation || template.recommendation,
    references: options.references || [
      faker.internet.url(),
      faker.internet.url(),
    ],
    impact: faker.helpers.arrayElement(['financial', 'legal', 'privacy', 'operational']),
    likelihood: faker.helpers.arrayElement(['low', 'medium', 'high']),
    detectedAt: faker.date.recent({ days: 1 }),
  };
}

/**
 * Creates a test subscription
 */
export function createMockSubscription(options: TestSubscriptionOptions = {}): any {
  const plan = options.plan || faker.helpers.arrayElement(['free', 'basic', 'pro']);
  const billingCycle = options.billingCycle || faker.helpers.arrayElement(['monthly', 'yearly']);
  const currentPeriodStart = options.currentPeriodStart || faker.date.past({ days: 15 });
  const currentPeriodEnd = options.currentPeriodEnd || new Date(currentPeriodStart.getTime() + (billingCycle === 'yearly' ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000));

  return {
    id: options.id || `sub-${faker.string.uuid()}`,
    userId: options.userId || `user-${faker.string.uuid()}`,
    stripeCustomerId: options.stripeCustomerId || `cus_${faker.string.alphanumeric(14)}`,
    stripeSubscriptionId: options.stripeSubscriptionId || `sub_${faker.string.alphanumeric(14)}`,
    status: options.status || 'active',
    plan,
    billingCycle,
    currentPeriodStart,
    currentPeriodEnd,
    createdAt: options.createdAt || faker.date.past({ years: 1 }),
    updatedAt: options.updatedAt || faker.date.recent({ days: 30 }),
    
    // Plan-specific limits
    limits: {
      documentsPerMonth: plan === 'free' ? 5 : plan === 'basic' ? 50 : plan === 'pro' ? 200 : 1000,
      analysesPerMonth: plan === 'free' ? 5 : plan === 'basic' ? 50 : plan === 'pro' ? 200 : 1000,
      apiRequestsPerDay: plan === 'free' ? 100 : plan === 'basic' ? 1000 : plan === 'pro' ? 5000 : 25000,
    },
    
    usage: {
      documentsThisMonth: faker.number.int({ min: 0, max: 10 }),
      analysesThisMonth: faker.number.int({ min: 0, max: 10 }),
      apiRequestsToday: faker.number.int({ min: 0, max: 50 }),
    },
  };
}

/**
 * Creates a test notification
 */
export function createMockNotification(options: TestNotificationOptions = {}): any {
  const notificationTemplates = {
    'analysis_complete': {
      title: 'Document Analysis Complete',
      message: 'Your document analysis has been completed successfully.',
    },
    'subscription_updated': {
      title: 'Subscription Updated',
      message: 'Your subscription plan has been updated.',
    },
    'security_alert': {
      title: 'Security Alert',
      message: 'Unusual activity detected on your account.',
    },
    'system_update': {
      title: 'System Update',
      message: 'Fine Print AI has been updated with new features.',
    },
  };

  const type = options.type || faker.helpers.arrayElement(['analysis_complete', 'subscription_updated', 'security_alert', 'system_update']);
  const template = notificationTemplates[type];

  return {
    id: options.id || `notif-${faker.string.uuid()}`,
    userId: options.userId || `user-${faker.string.uuid()}`,
    type,
    title: options.title || template.title,
    message: options.message || template.message,
    status: options.status || faker.helpers.arrayElement(['unread', 'read']),
    priority: options.priority || faker.helpers.arrayElement(['low', 'medium', 'high']),
    createdAt: options.createdAt || faker.date.recent({ days: 7 }),
    readAt: options.readAt || (options.status === 'read' ? faker.date.recent({ days: 3 }) : null),
    metadata: {
      channel: faker.helpers.arrayElement(['email', 'push', 'sms']),
      ...options.metadata,
    },
  };
}

// Helper functions for content generation

function generateTermsOfServiceContent(): string {
  return `
TERMS OF SERVICE AGREEMENT

1. ACCEPTANCE OF TERMS
By accessing and using this service, you accept and agree to be bound by the terms and provision of this agreement.

2. USE LICENSE
Permission is granted to temporarily download one copy of the materials on this website for personal, non-commercial transitory viewing only.

3. DISCLAIMER
The materials on this website are provided on an 'as is' basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including without limitation, implied warranties or conditions of merchantability.

4. LIMITATIONS
In no event shall our company or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on this website.

5. ACCURACY OF MATERIALS
The materials appearing on this website could include technical, typographical, or photographic errors. We do not warrant that any of the materials on its website are accurate, complete, or current.

6. LINKS
We have not reviewed all of the sites linked to our website and are not responsible for the contents of any such linked site.

7. MODIFICATIONS
We may revise these terms of service at any time without notice. By using this website, you are agreeing to be bound by the then current version of these terms of service.

8. GOVERNING LAW
These terms and conditions are governed by and construed in accordance with the laws of [Jurisdiction] and you irrevocably submit to the exclusive jurisdiction of the courts in that state or location.
  `.trim();
}

function generatePrivacyPolicyContent(): string {
  return `
PRIVACY POLICY

1. INFORMATION WE COLLECT
We collect information you provide directly to us, such as when you create an account, make a purchase, or contact us for support.

2. HOW WE USE YOUR INFORMATION
We use the information we collect to provide, maintain, and improve our services, process transactions, and communicate with you.

3. INFORMATION SHARING
We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this policy.

4. DATA SECURITY
We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.

5. COOKIES
We use cookies and similar tracking technologies to track activity on our service and hold certain information.

6. THIRD-PARTY SERVICES
Our service may contain links to third-party websites or services that are not owned or controlled by us.

7. CHILDREN'S PRIVACY
Our service does not address anyone under the age of 13. We do not knowingly collect personal information from children under 13.

8. CHANGES TO THIS POLICY
We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.

9. CONTACT US
If you have any questions about this Privacy Policy, please contact us at privacy@example.com.
  `.trim();
}

function generateContractContent(): string {
  return `
SERVICE AGREEMENT CONTRACT

This Service Agreement is entered into between the Company and the Client for the provision of professional services.

1. SCOPE OF WORK
The Company agrees to provide the services as outlined in the attached Statement of Work.

2. PAYMENT TERMS
Payment is due within 30 days of invoice date. Late payments may incur interest charges of 1.5% per month.

3. INTELLECTUAL PROPERTY
All work products created under this agreement shall be the exclusive property of the Client upon full payment.

4. CONFIDENTIALITY
Both parties agree to maintain the confidentiality of all proprietary information shared during the course of this agreement.

5. LIMITATION OF LIABILITY
The Company's liability shall not exceed the total amount paid under this agreement.

6. TERMINATION
Either party may terminate this agreement with 30 days written notice.

7. GOVERNING LAW
This agreement shall be governed by the laws of [State/Country].
  `.trim();
}

function generateEulaContent(): string {
  return `
END USER LICENSE AGREEMENT (EULA)

This End User License Agreement is a legal agreement between you and our company for the use of our software.

1. GRANT OF LICENSE
We hereby grant you a personal, non-transferable, non-exclusive license to use our software on your devices.

2. RESTRICTIONS
You may not copy, modify, distribute, sell, or lease any part of our software or included documentation.

3. SUPPORT SERVICES
We may provide you with support services related to the software. Any supplemental software code provided shall be considered part of the software and subject to the terms of this EULA.

4. SOFTWARE TRANSFER
You may permanently transfer all of your rights under this EULA, provided you retain no copies and the recipient agrees to the terms of this EULA.

5. TERMINATION
Without prejudice to any other rights, we may terminate this EULA if you fail to comply with the terms and conditions.

6. COPYRIGHT
The software is protected by copyright laws and international copyright treaties, as well as other intellectual property laws and treaties.

7. NO WARRANTIES
The software is provided "as is" without warranty of any kind, either express or implied.

8. LIMITATION OF LIABILITY
In no event shall we be liable for any damages whatsoever arising out of the use of or inability to use this software.
  `.trim();
}

function generateGenericLegalContent(): string {
  return `
LEGAL DOCUMENT

This document contains important legal terms and conditions that govern the relationship between the parties.

1. DEFINITIONS
For the purposes of this document, the following terms shall have the meanings set forth below.

2. OBLIGATIONS
Each party hereby agrees to fulfill their respective obligations as outlined in this document.

3. REPRESENTATIONS AND WARRANTIES
Each party represents and warrants that they have the full right, power, and authority to enter into this agreement.

4. INDEMNIFICATION
Each party agrees to indemnify and hold harmless the other party from any claims arising from their breach of this agreement.

5. DISPUTE RESOLUTION
Any disputes arising under this agreement shall be resolved through binding arbitration.

6. ENTIRE AGREEMENT
This document constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements.

7. AMENDMENTS
This agreement may only be amended in writing and signed by both parties.

8. SEVERABILITY
If any provision of this agreement is found to be unenforceable, the remainder of the agreement shall remain in full force and effect.
  `.trim();
}

function generateMockFindings(count: number): any[] {
  const findings = [];
  for (let i = 0; i < count; i++) {
    findings.push(createMockFinding());
  }
  return findings;
}

function calculateRiskScore(findings: any[]): number {
  if (findings.length === 0) return 0;
  
  const severityWeights = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  
  const totalWeight = findings.reduce((sum, finding) => {
    return sum + (severityWeights[finding.severity as keyof typeof severityWeights] || 1);
  }, 0);
  
  // Normalize to 0-100 scale
  const maxPossibleWeight = findings.length * 4; // All critical
  return Math.min(100, Math.round((totalWeight / maxPossibleWeight) * 100));
}

function generateExecutiveSummary(findings: any[], riskScore: number): string {
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;
  const lowCount = findings.filter(f => f.severity === 'low').length;

  let summary = `This document analysis identified ${findings.length} potential issues with an overall risk score of ${riskScore}/100. `;

  if (criticalCount > 0) {
    summary += `There are ${criticalCount} critical issues that require immediate attention. `;
  }
  
  if (highCount > 0) {
    summary += `${highCount} high-severity issues were found that pose significant risks. `;
  }
  
  if (mediumCount > 0) {
    summary += `${mediumCount} medium-severity issues should be reviewed and addressed. `;
  }
  
  if (lowCount > 0) {
    summary += `${lowCount} low-severity issues were identified for consideration. `;
  }

  summary += "We recommend reviewing all findings and implementing the suggested recommendations to mitigate identified risks.";

  return summary;
}