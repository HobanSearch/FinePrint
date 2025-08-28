import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { DatabaseFixtures } from '../fixtures/database-fixtures';
import { testHelpers } from '../utils/test-helpers';

describe('Database Integration Tests', () => {
  let prisma: PrismaClient;
  let fixtures: DatabaseFixtures;

  beforeAll(async () => {
    prisma = testHelpers.prisma;
    fixtures = new DatabaseFixtures(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await fixtures.cleanup();
  });

  describe('User Operations', () => {
    test('should create and retrieve users', async () => {
      const users = await fixtures.createUsers();
      
      expect(users).toHaveLength(4);
      
      const adminUser = users.find(u => u.role === 'admin');
      expect(adminUser).toBeDefined();
      expect(adminUser!.email).toBe('admin@fineprintai.com');
      expect(adminUser!.isEmailVerified).toBe(true);
    });

    test('should enforce email uniqueness', async () => {
      await fixtures.createUsers();
      
      await expect(
        prisma.user.create({
          data: {
            email: 'admin@fineprintai.com', // Duplicate email
            firstName: 'Duplicate',
            lastName: 'User',
            passwordHash: 'hash',
            role: 'user'
          }
        })
      ).rejects.toThrow();
    });

    test('should soft delete users', async () => {
      const users = await fixtures.createUsers();
      const testUser = users[1];

      // Update user with deletedAt timestamp (soft delete)
      await prisma.user.update({
        where: { id: testUser.id },
        data: { deletedAt: new Date() }
      });

      const deletedUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      });

      expect(deletedUser!.deletedAt).not.toBeNull();
    });

    test('should handle user relationships correctly', async () => {
      const users = await fixtures.createUsers();
      const documents = await fixtures.createDocuments();

      const userWithDocuments = await prisma.user.findUnique({
        where: { email: 'user@example.com' },
        include: { documents: true }
      });

      expect(userWithDocuments!.documents.length).toBeGreaterThan(0);
    });
  });

  describe('Document Operations', () => {
    test('should create documents with proper relationships', async () => {
      const documents = await fixtures.createDocuments();
      
      expect(documents).toHaveLength(4);
      
      const contractDoc = documents.find(d => d.documentType === 'contract');
      expect(contractDoc).toBeDefined();
      expect(contractDoc!.userId).toBeDefined();
    });

    test('should enforce document hash uniqueness per user', async () => {
      const users = await fixtures.createUsers();
      const regularUser = users.find(u => u.email === 'user@example.com')!;

      await prisma.document.create({
        data: {
          title: 'First Document',
          documentType: 'contract',
          documentHash: 'duplicate-hash',
          contentLength: 1000,
          language: 'en',
          monitoringEnabled: false,
          monitoringFrequency: 24,
          userId: regularUser.id
        }
      });

      // Should fail due to unique constraint
      await expect(
        prisma.document.create({
          data: {
            title: 'Second Document',
            documentType: 'contract',
            documentHash: 'duplicate-hash', // Same hash, same user
            contentLength: 1000,
            language: 'en',
            monitoringEnabled: false,
            monitoringFrequency: 24,
            userId: regularUser.id
          }
        })
      ).rejects.toThrow();
    });

    test('should calculate next monitoring time correctly', async () => {
      const documents = await fixtures.createDocuments();
      const monitoredDoc = documents.find(d => d.monitoringEnabled);

      expect(monitoredDoc).toBeDefined();
      expect(monitoredDoc!.monitoringFrequency).toBe(24);
      
      // Update with next monitoring time
      const nextMonitorAt = new Date(Date.now() + monitoredDoc!.monitoringFrequency * 60 * 60 * 1000);
      
      await prisma.document.update({
        where: { id: monitoredDoc!.id },
        data: { nextMonitorAt }
      });

      const updatedDoc = await prisma.document.findUnique({
        where: { id: monitoredDoc!.id }
      });

      expect(updatedDoc!.nextMonitorAt).toEqual(nextMonitorAt);
    });

    test('should cascade delete on user removal', async () => {
      const users = await fixtures.createUsers();
      const documents = await fixtures.createDocuments();
      
      const testUser = users.find(u => u.email === 'user@example.com')!;
      const userDocuments = documents.filter(d => d.userId === testUser.id);
      
      expect(userDocuments.length).toBeGreaterThan(0);

      // Delete user (should cascade to documents)
      await prisma.user.delete({
        where: { id: testUser.id }
      });

      // Check that documents are also deleted
      const remainingDocuments = await prisma.document.findMany({
        where: { userId: testUser.id }
      });

      expect(remainingDocuments).toHaveLength(0);
    });
  });

  describe('Analysis Operations', () => {
    test('should create analyses with proper status transitions', async () => {
      const analyses = await fixtures.createAnalyses();
      
      const statusCounts = analyses.reduce((acc, analysis) => {
        acc[analysis.status] = (acc[analysis.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(statusCounts.completed).toBeGreaterThan(0);
      expect(statusCounts.processing).toBe(1);
      expect(statusCounts.failed).toBe(1);
    });

    test('should validate risk score ranges', async () => {
      const analyses = await fixtures.createAnalyses();
      
      analyses.forEach(analysis => {
        if (analysis.overallRiskScore !== null) {
          expect(analysis.overallRiskScore).toBeGreaterThanOrEqual(0);
          expect(analysis.overallRiskScore).toBeLessThanOrEqual(10);
        }
      });
    });

    test('should handle analysis timing correctly', async () => {
      const analyses = await fixtures.createAnalyses();
      
      const completedAnalysis = analyses.find(a => a.status === 'completed');
      expect(completedAnalysis!.createdAt).toBeDefined();
      expect(completedAnalysis!.completedAt).toBeDefined();
      expect(completedAnalysis!.completedAt!.getTime()).toBeGreaterThan(
        completedAnalysis!.createdAt.getTime()
      );
    });

    test('should store JSON arrays correctly', async () => {
      const analyses = await fixtures.createAnalyses();
      
      const completedAnalysis = analyses.find(a => a.keyFindings.length > 0);
      expect(Array.isArray(completedAnalysis!.keyFindings)).toBe(true);
      expect(Array.isArray(completedAnalysis!.recommendations)).toBe(true);
      expect(completedAnalysis!.keyFindings.length).toBeGreaterThan(0);
    });
  });

  describe('Finding Operations', () => {
    test('should create findings with proper severity levels', async () => {
      const findings = await fixtures.createFindings();
      
      const severityLevels = ['low', 'medium', 'high', 'critical'];
      findings.forEach(finding => {
        expect(severityLevels).toContain(finding.severity);
      });
    });

    test('should validate confidence scores', async () => {
      const findings = await fixtures.createFindings();
      
      findings.forEach(finding => {
        if (finding.confidenceScore !== null) {
          expect(finding.confidenceScore).toBeGreaterThanOrEqual(0);
          expect(finding.confidenceScore).toBeLessThanOrEqual(1);
        }
      });
    });

    test('should handle text positions correctly', async () => {
      const findings = await fixtures.createFindings();
      
      findings.forEach(finding => {
        if (finding.positionStart !== null && finding.positionEnd !== null) {
          expect(finding.positionEnd).toBeGreaterThan(finding.positionStart);
        }
      });
    });

    test('should maintain referential integrity with analyses', async () => {
      const findings = await fixtures.createFindings();
      
      for (const finding of findings) {
        const analysis = await prisma.analysis.findUnique({
          where: { id: finding.analysisId }
        });
        expect(analysis).toBeDefined();
      }
    });
  });

  describe('Complex Queries', () => {
    test('should perform efficient joins across all entities', async () => {
      await fixtures.createFullDataset();

      const result = await prisma.user.findMany({
        include: {
          documents: {
            include: {
              analyses: {
                include: {
                  findings: true
                }
              }
            }
          }
        }
      });

      expect(result.length).toBeGreaterThan(0);
      
      const userWithData = result.find(u => u.documents.length > 0);
      expect(userWithData).toBeDefined();
      
      const docWithAnalysis = userWithData!.documents.find(d => d.analyses.length > 0);
      expect(docWithAnalysis).toBeDefined();
    });

    test('should aggregate risk scores correctly', async () => {
      await fixtures.createFullDataset();

      const riskAggregation = await prisma.analysis.aggregate({
        where: {
          status: 'completed',
          overallRiskScore: { not: null }
        },
        _avg: { overallRiskScore: true },
        _max: { overallRiskScore: true },
        _min: { overallRiskScore: true },
        _count: { overallRiskScore: true }
      });

      expect(riskAggregation._count.overallRiskScore).toBeGreaterThan(0);
      expect(riskAggregation._avg.overallRiskScore).toBeGreaterThan(0);
      expect(riskAggregation._max.overallRiskScore).toBeLessThanOrEqual(10);
      expect(riskAggregation._min.overallRiskScore).toBeGreaterThanOrEqual(0);
    });

    test('should filter by date ranges efficiently', async () => {
      await fixtures.createFullDataset();

      const startDate = new Date('2024-01-01T00:00:00Z');
      const endDate = new Date('2024-01-31T23:59:59Z');

      const documentsInRange = await prisma.document.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        }
      });

      expect(documentsInRange.length).toBeGreaterThan(0);
      documentsInRange.forEach(doc => {
        expect(doc.createdAt.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
        expect(doc.createdAt.getTime()).toBeLessThanOrEqual(endDate.getTime());
      });
    });

    test('should handle pagination correctly', async () => {
      await fixtures.createFullDataset();

      const page1 = await prisma.document.findMany({
        take: 2,
        skip: 0,
        orderBy: { createdAt: 'desc' }
      });

      const page2 = await prisma.document.findMany({
        take: 2,
        skip: 2,
        orderBy: { createdAt: 'desc' }
      });

      expect(page1.length).toBeLessThanOrEqual(2);
      expect(page2.length).toBeLessThanOrEqual(2);
      
      // Ensure no overlap between pages
      const page1Ids = page1.map(d => d.id);
      const page2Ids = page2.map(d => d.id);
      const intersection = page1Ids.filter(id => page2Ids.includes(id));
      expect(intersection).toHaveLength(0);
    });
  });

  describe('Database Constraints and Indexes', () => {
    test('should enforce foreign key constraints', async () => {
      // Try to create document with non-existent user
      await expect(
        prisma.document.create({
          data: {
            title: 'Orphan Document',
            documentType: 'contract',
            documentHash: 'orphan-hash',
            contentLength: 1000,
            language: 'en',
            monitoringEnabled: false,
            monitoringFrequency: 24,
            userId: 'non-existent-user-id'
          }
        })
      ).rejects.toThrow();
    });

    test('should perform efficiently on indexed columns', async () => {
      await fixtures.createFullDataset();

      // Query by email (indexed)
      const startTime = process.hrtime.bigint();
      
      const user = await prisma.user.findUnique({
        where: { email: 'user@example.com' }
      });
      
      const endTime = process.hrtime.bigint();
      const queryTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      expect(user).toBeDefined();
      expect(queryTime).toBeLessThan(100); // Should be very fast with index
    });

    test('should handle concurrent operations correctly', async () => {
      const users = await fixtures.createUsers();
      const testUser = users[0];

      // Simulate concurrent updates
      const updatePromises = Array.from({ length: 5 }, (_, i) => 
        prisma.user.update({
          where: { id: testUser.id },
          data: { 
            updatedAt: new Date(),
            firstName: `Updated${i}`
          }
        })
      );

      // All updates should succeed (last one wins)
      const results = await Promise.all(updatePromises);
      expect(results).toHaveLength(5);
      
      const finalUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      });
      
      expect(finalUser!.firstName).toMatch(/^Updated\d$/);
    });
  });

  describe('Transaction Handling', () => {
    test('should rollback failed transactions', async () => {
      const users = await fixtures.createUsers();
      const testUser = users[0];

      try {
        await prisma.$transaction(async (tx) => {
          // Valid operation
          await tx.document.create({
            data: {
              title: 'Transaction Test',
              documentType: 'contract',
              documentHash: 'tx-test-hash',
              contentLength: 1000,
              language: 'en',
              monitoringEnabled: false,
              monitoringFrequency: 24,
              userId: testUser.id
            }
          });

          // Invalid operation (should cause rollback)
          throw new Error('Simulated transaction failure');
        });
      } catch (error) {
        expect(error.message).toBe('Simulated transaction failure');
      }

      // Document should not exist due to rollback
      const documents = await prisma.document.findMany({
        where: { title: 'Transaction Test' }
      });
      
      expect(documents).toHaveLength(0);
    });

    test('should commit successful transactions', async () => {
      const users = await fixtures.createUsers();
      const testUser = users[0];

      const result = await prisma.$transaction(async (tx) => {
        const document = await tx.document.create({
          data: {
            title: 'Successful Transaction',
            documentType: 'contract',
            documentHash: 'success-tx-hash',
            contentLength: 1000,
            language: 'en',
            monitoringEnabled: false,
            monitoringFrequency: 24,
            userId: testUser.id
          }
        });

        const analysis = await tx.analysis.create({
          data: {
            status: 'pending',
            documentId: document.id,
            overallRiskScore: null,
            executiveSummary: null,
            keyFindings: [],
            recommendations: [],
            processingTimeMs: null,
            modelUsed: null
          }
        });

        return { document, analysis };
      });

      expect(result.document).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.analysis.documentId).toBe(result.document.id);

      // Verify data persisted
      const persistedDocument = await prisma.document.findUnique({
        where: { id: result.document.id }
      });
      
      expect(persistedDocument).toBeDefined();
    });
  });
});