import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

export class DatabaseFixtures {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create test users with various roles and states
   */
  async createUsers() {
    const passwordHash = await bcrypt.hash('password123', 12);

    const users = await this.prisma.$transaction([
      // Admin user
      this.prisma.user.create({
        data: {
          id: 'admin-user-id',
          email: 'admin@fineprintai.com',
          firstName: 'Admin',
          lastName: 'User',
          passwordHash,
          role: 'admin',
          isEmailVerified: true,
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z')
        }
      }),

      // Regular user
      this.prisma.user.create({
        data: {
          id: 'regular-user-id',
          email: 'user@example.com',
          firstName: 'Regular',
          lastName: 'User',
          passwordHash,
          role: 'user',
          isEmailVerified: true,
          createdAt: new Date('2024-01-02T00:00:00Z'),
          updatedAt: new Date('2024-01-02T00:00:00Z')
        }
      }),

      // Unverified user
      this.prisma.user.create({
        data: {
          id: 'unverified-user-id',
          email: 'unverified@example.com',
          firstName: 'Unverified',
          lastName: 'User',
          passwordHash,
          role: 'user',
          isEmailVerified: false,
          createdAt: new Date('2024-01-03T00:00:00Z'),
          updatedAt: new Date('2024-01-03T00:00:00Z')
        }
      }),

      // Premium user
      this.prisma.user.create({
        data: {
          id: 'premium-user-id',
          email: 'premium@example.com',
          firstName: 'Premium',
          lastName: 'User',
          passwordHash,
          role: 'user',
          isEmailVerified: true,
          subscriptionTier: 'premium',
          createdAt: new Date('2024-01-04T00:00:00Z'),
          updatedAt: new Date('2024-01-04T00:00:00Z')
        }
      })
    ]);

    return users;
  }

  /**
   * Create test documents for different scenarios
   */
  async createDocuments() {
    const users = await this.createUsers();
    const regularUser = users.find(u => u.email === 'user@example.com')!;
    const premiumUser = users.find(u => u.email === 'premium@example.com')!;

    const documents = await this.prisma.$transaction([
      // Contract document
      this.prisma.document.create({
        data: {
          id: 'contract-doc-id',
          title: 'Software License Agreement',
          documentType: 'contract',
          documentHash: 'hash-contract-123',
          contentLength: 15000,
          language: 'en',
          monitoringEnabled: true,
          monitoringFrequency: 24,
          userId: regularUser.id,
          createdAt: new Date('2024-01-01T10:00:00Z'),
          updatedAt: new Date('2024-01-01T10:00:00Z')
        }
      }),

      // Terms of Service document
      this.prisma.document.create({
        data: {
          id: 'tos-doc-id',
          title: 'Terms of Service',
          documentType: 'terms-of-service',
          documentHash: 'hash-tos-456',
          contentLength: 8500,
          language: 'en',
          monitoringEnabled: false,
          monitoringFrequency: 168, // Weekly
          userId: regularUser.id,
          createdAt: new Date('2024-01-02T14:30:00Z'),
          updatedAt: new Date('2024-01-02T14:30:00Z')
        }
      }),

      // Privacy Policy document
      this.prisma.document.create({
        data: {
          id: 'privacy-doc-id',
          title: 'Privacy Policy',
          documentType: 'privacy-policy',
          documentHash: 'hash-privacy-789',
          contentLength: 12000,
          language: 'en',
          monitoringEnabled: true,
          monitoringFrequency: 72, // Every 3 days
          userId: premiumUser.id,
          createdAt: new Date('2024-01-03T09:15:00Z'),
          updatedAt: new Date('2024-01-03T09:15:00Z')
        }
      }),

      // Large document (edge case)
      this.prisma.document.create({
        data: {
          id: 'large-doc-id',
          title: 'Complex Master Agreement',
          documentType: 'contract',
          documentHash: 'hash-large-abc',
          contentLength: 50000,
          language: 'en',
          monitoringEnabled: false,
          monitoringFrequency: 24,
          userId: premiumUser.id,
          createdAt: new Date('2024-01-04T16:45:00Z'),
          updatedAt: new Date('2024-01-04T16:45:00Z')
        }
      })
    ]);

    return documents;
  }

  /**
   * Create test analyses with various statuses and results
   */
  async createAnalyses() {
    const documents = await this.createDocuments();
    const contractDoc = documents.find(d => d.title === 'Software License Agreement')!;
    const tosDoc = documents.find(d => d.title === 'Terms of Service')!;
    const privacyDoc = documents.find(d => d.title === 'Privacy Policy')!;

    const analyses = await this.prisma.$transaction([
      // Completed analysis with high risk
      this.prisma.analysis.create({
        data: {
          id: 'analysis-high-risk-id',
          status: 'completed',
          documentId: contractDoc.id,
          overallRiskScore: 8.5,
          executiveSummary: 'This software license agreement contains several high-risk clauses that significantly favor the licensor. Key concerns include broad liability exclusions, restrictive termination clauses, and extensive intellectual property claims.',
          keyFindings: [
            'Unlimited liability exclusion for the licensor',
            'Broad intellectual property assignment clauses', 
            'Restrictive termination conditions',
            'Automatic renewal without clear opt-out'
          ],
          recommendations: [
            'Negotiate liability caps and carve-outs for gross negligence',
            'Limit intellectual property assignments to work product only',
            'Add mutual termination rights with reasonable notice',
            'Include clear renewal opt-out procedures'
          ],
          processingTimeMs: 12500,
          modelUsed: 'mistral:7b',
          createdAt: new Date('2024-01-01T10:30:00Z'),
          completedAt: new Date('2024-01-01T10:32:30Z')
        }
      }),

      // Completed analysis with medium risk
      this.prisma.analysis.create({
        data: {
          id: 'analysis-medium-risk-id',
          status: 'completed',
          documentId: tosDoc.id,
          overallRiskScore: 5.2,
          executiveSummary: 'The terms of service follow standard industry practices with moderate risk levels. Main concerns relate to data usage and dispute resolution mechanisms.',
          keyFindings: [
            'Broad data collection permissions',
            'Mandatory arbitration clauses',
            'Service modification rights without notice'
          ],
          recommendations: [
            'Clarify data usage limitations and user rights',
            'Review arbitration provisions for fairness',
            'Add notification requirements for significant changes'
          ],
          processingTimeMs: 8200,
          modelUsed: 'phi-2:2.7b',
          createdAt: new Date('2024-01-02T15:00:00Z'),
          completedAt: new Date('2024-01-02T15:01:20Z')
        }
      }),

      // Completed analysis with low risk
      this.prisma.analysis.create({
        data: {
          id: 'analysis-low-risk-id',
          status: 'completed',
          documentId: privacyDoc.id,
          overallRiskScore: 2.8,
          executiveSummary: 'This privacy policy demonstrates good transparency and user control practices with minimal risk concerns.',
          keyFindings: [
            'Clear data retention policies',
            'Comprehensive user rights section',
            'Transparent third-party sharing practices'
          ],
          recommendations: [
            'Consider adding data portability details',
            'Specify international transfer safeguards',
            'Add contact information for privacy inquiries'
          ],
          processingTimeMs: 6800,
          modelUsed: 'neural-chat:7b',
          createdAt: new Date('2024-01-03T09:45:00Z'),
          completedAt: new Date('2024-01-03T09:46:40Z')
        }
      }),

      // Processing analysis
      this.prisma.analysis.create({
        data: {
          id: 'analysis-processing-id',
          status: 'processing',
          documentId: documents[3].id, // Large document
          overallRiskScore: null,
          executiveSummary: null,
          keyFindings: [],
          recommendations: [],
          processingTimeMs: null,
          modelUsed: null,
          createdAt: new Date('2024-01-04T17:00:00Z'),
          completedAt: null
        }
      }),

      // Failed analysis
      this.prisma.analysis.create({
        data: {
          id: 'analysis-failed-id',
          status: 'failed',
          documentId: documents[3].id,
          overallRiskScore: null,
          executiveSummary: null,
          keyFindings: [],
          recommendations: [],
          processingTimeMs: 30000,
          modelUsed: 'mistral:7b',
          errorMessage: 'Document too large for processing',
          createdAt: new Date('2024-01-04T16:50:00Z'),
          completedAt: new Date('2024-01-04T16:50:30Z')
        }
      })
    ]);

    return analyses;
  }

  /**
   * Create test findings for analyses
   */
  async createFindings() {
    const analyses = await this.createAnalyses();
    const highRiskAnalysis = analyses.find(a => a.id === 'analysis-high-risk-id')!;
    const mediumRiskAnalysis = analyses.find(a => a.id === 'analysis-medium-risk-id')!;
    const lowRiskAnalysis = analyses.find(a => a.id === 'analysis-low-risk-id')!;

    const findings = await this.prisma.$transaction([
      // Critical finding
      this.prisma.analysisFinding.create({
        data: {
          id: 'finding-critical-id',
          analysisId: highRiskAnalysis.id,
          category: 'liability',
          title: 'Unlimited Liability Exclusion',
          description: 'The contract contains an extremely broad liability exclusion clause that removes almost all legal recourse for users in case of damages, negligence, or breach of contract.',
          severity: 'critical',
          confidenceScore: 0.95,
          textExcerpt: 'Company shall not be liable under any circumstances for any direct, indirect, incidental, special, consequential, or punitive damages, regardless of cause, even if Company has been advised of the possibility of such damages.',
          positionStart: 2350,
          positionEnd: 2580,
          recommendation: 'Negotiate for liability caps rather than complete exclusions, and ensure carve-outs for gross negligence, willful misconduct, and violations of law.',
          impactExplanation: 'This clause essentially removes all legal recourse if the company causes damages through negligence or breach of contract, leaving users with no protection.'
        }
      }),

      // High finding
      this.prisma.analysisFinding.create({
        data: {
          id: 'finding-high-id',
          analysisId: highRiskAnalysis.id,
          category: 'intellectual-property',
          title: 'Broad IP Assignment',
          description: 'The contract includes overly broad intellectual property assignment clauses that could transfer more rights than intended.',
          severity: 'high',
          confidenceScore: 0.88,
          textExcerpt: 'User hereby assigns, transfers, and conveys to Company all right, title, and interest in and to any and all intellectual property created, developed, or conceived in connection with this agreement.',
          positionStart: 4200,
          positionEnd: 4380,
          recommendation: 'Limit IP assignments to work product directly related to the licensed software and exclude pre-existing IP and general improvements.',
          impactExplanation: 'Could result in unintended transfer of valuable intellectual property rights, including improvements and derivative works.'
        }
      }),

      // Medium finding
      this.prisma.analysisFinding.create({
        data: {
          id: 'finding-medium-id',
          analysisId: mediumRiskAnalysis.id,
          category: 'data-usage',
          title: 'Broad Data Collection',
          description: 'The terms allow for extensive data collection without clear limitations on usage or sharing.',
          severity: 'medium',
          confidenceScore: 0.82,
          textExcerpt: 'We may collect, use, and share any information you provide or that we obtain through your use of our services for any lawful business purpose.',
          positionStart: 1850,
          positionEnd: 1990,
          recommendation: 'Specify the types of data collected, purposes for collection, and limitations on third-party sharing.',
          impactExplanation: 'May result in unexpected use or sharing of personal information beyond user expectations.'
        }
      }),

      // Low finding
      this.prisma.analysisFinding.create({
        data: {
          id: 'finding-low-id',
          analysisId: lowRiskAnalysis.id,
          category: 'data-retention',
          title: 'Unspecified International Transfers',
          description: 'The privacy policy mentions international data transfers but does not specify safeguards.',
          severity: 'low',
          confidenceScore: 0.75,
          textExcerpt: 'Your personal information may be transferred to and processed in countries other than your own.',
          positionStart: 3200,
          positionEnd: 3290,
          recommendation: 'Add details about adequacy decisions, standard contractual clauses, or other transfer safeguards used.',
          impactExplanation: 'Users may be unclear about protections for their data when transferred internationally.'
        }
      })
    ]);

    return findings;
  }

  /**
   * Create complete test dataset
   */
  async createFullDataset() {
    await this.createFindings(); // This creates all dependent data
    console.log('Test dataset created successfully');
  }

  /**
   * Clean all test data
   */
  async cleanup() {
    await this.prisma.$transaction([
      this.prisma.analysisFinding.deleteMany(),
      this.prisma.analysis.deleteMany(),
      this.prisma.document.deleteMany(),
      this.prisma.user.deleteMany()
    ]);
  }

  /**
   * Seed minimal test data for quick tests
   */
  async seedMinimal() {
    const passwordHash = await bcrypt.hash('password123', 12);
    
    const user = await this.prisma.user.create({
      data: {
        id: 'test-user-minimal',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        passwordHash,
        role: 'user',
        isEmailVerified: true
      }
    });

    const document = await this.prisma.document.create({
      data: {
        id: 'test-doc-minimal',
        title: 'Test Document',
        documentType: 'contract',
        documentHash: 'test-hash',
        contentLength: 1000,
        language: 'en',
        monitoringEnabled: false,
        monitoringFrequency: 24,
        userId: user.id
      }
    });

    const analysis = await this.prisma.analysis.create({
      data: {
        id: 'test-analysis-minimal',
        status: 'completed',
        documentId: document.id,
        overallRiskScore: 5.0,
        executiveSummary: 'Test analysis summary',
        keyFindings: ['Test finding'],
        recommendations: ['Test recommendation'],
        processingTimeMs: 5000,
        modelUsed: 'test-model'
      }
    });

    return { user, document, analysis };
  }
}