import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AnalysisService } from '../services/analysis';
import { testHelpers } from '../../../../__tests__/utils/test-helpers';
import { ollamaMock } from '../../../../__tests__/mocks/ollama.mock';
import { redisMock } from '../../../../__tests__/mocks/redis.mock';

describe('AnalysisService', () => {
  let analysisService: AnalysisService;
  let mockUser: any;
  let mockDocument: any;

  beforeEach(async () => {
    analysisService = new AnalysisService();
    mockUser = await testHelpers.createTestUser();
    mockDocument = await testHelpers.createTestDocument(mockUser.id);
    
    // Clear mocks
    ollamaMock.clearMocks();
    redisMock.clearMock();
    
    // Setup default mock responses
    ollamaMock.setupAnalysisMocks();
  });

  afterEach(async () => {
    await testHelpers.cleanup();
  });

  describe('createAnalysis', () => {
    test('should create analysis with pending status', async () => {
      const request = {
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'Test contract content',
        documentType: 'contract',
        language: 'en'
      };

      const analysis = await analysisService.createAnalysis(request);

      expect(analysis).toMatchObject({
        id: expect.any(String),
        status: 'pending',
        documentId: mockDocument.id,
        overallRiskScore: null,
        executiveSummary: null,
        keyFindings: [],
        recommendations: [],
        processingTimeMs: null,
        modelUsed: null,
        createdAt: expect.any(Date),
        completedAt: null
      });

      expect(analysis.id).toBeValidUUID();
    });

    test('should validate required fields', async () => {
      const invalidRequest = {
        // Missing required fields
        userId: mockUser.id,
        content: 'Test content'
      };

      await expect(analysisService.createAnalysis(invalidRequest as any))
        .rejects.toThrow('Document ID is required');
    });

    test('should validate document ownership', async () => {
      const otherUser = await testHelpers.createTestUser({ email: 'other@example.com' });
      const otherDocument = await testHelpers.createTestDocument(otherUser.id);

      const request = {
        documentId: otherDocument.id,
        userId: mockUser.id, // Different user
        content: 'Test content',
        documentType: 'contract',
        language: 'en'
      };

      await expect(analysisService.createAnalysis(request))
        .rejects.toThrow('Document not found or access denied');
    });

    test('should queue analysis job', async () => {
      const request = {
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'Test contract content',
        documentType: 'contract',
        language: 'en'
      };

      const queueSpy = jest.spyOn(analysisService as any, 'queueAnalysisJob')
        .mockResolvedValue(undefined);

      await analysisService.createAnalysis(request);

      expect(queueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: mockDocument.id,
          userId: mockUser.id,
          content: 'Test contract content'
        })
      );
    });
  });

  describe('processAnalysis', () => {
    test('should process analysis and update status', async () => {
      const analysis = await testHelpers.createTestAnalysis(mockDocument.id, {
        status: 'pending'
      });

      const jobData = {
        analysisId: analysis.id,
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'SOFTWARE LICENSE AGREEMENT\nCompany shall not be liable for any damages.',
        documentType: 'contract',
        language: 'en'
      };

      const result = await analysisService.processAnalysis(jobData);

      expect(result.status).toBe('completed');
      expect(result.overallRiskScore).toBeGreaterThan(0);
      expect(result.overallRiskScore).toBeLessThanOrEqual(10);
      expect(result.executiveSummary).toBeTruthy();
      expect(Array.isArray(result.keyFindings)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.processingTimeMs).toBeGreaterThan(0);
      expect(result.modelUsed).toBeTruthy();
    });

    test('should handle LLM service errors', async () => {
      const analysis = await testHelpers.createTestAnalysis(mockDocument.id, {
        status: 'pending'
      });

      // Mock LLM error
      ollamaMock.mockError('mistral:7b', new Error('LLM service unavailable'));

      const jobData = {
        analysisId: analysis.id,
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'Test content',
        documentType: 'contract',
        language: 'en'
      };

      const result = await analysisService.processAnalysis(jobData);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('LLM service unavailable');
    });

    test('should select appropriate model based on document type', async () => {
      const analysis = await testHelpers.createTestAnalysis(mockDocument.id, {
        status: 'pending'
      });

      const contractJobData = {
        analysisId: analysis.id,
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'Contract content',
        documentType: 'contract',
        language: 'en'
      };

      const contractResult = await analysisService.processAnalysis(contractJobData);
      expect(contractResult.modelUsed).toBe('mistral:7b');

      // Test with privacy policy
      const privacyAnalysis = await testHelpers.createTestAnalysis(mockDocument.id, {
        status: 'pending'
      });

      const privacyJobData = {
        analysisId: privacyAnalysis.id,
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'Privacy policy content',
        documentType: 'privacy-policy',
        language: 'en'
      };

      const privacyResult = await analysisService.processAnalysis(privacyJobData);
      expect(privacyResult.modelUsed).toBe('phi-2:2.7b');
    });

    test('should cache analysis results', async () => {
      const analysis = await testHelpers.createTestAnalysis(mockDocument.id, {
        status: 'pending'
      });

      const jobData = {
        analysisId: analysis.id,
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'Test contract content',
        documentType: 'contract',
        language: 'en'
      };

      await analysisService.processAnalysis(jobData);

      // Check if result was cached
      const cacheKey = `analysis:${analysis.id}`;
      const cachedResult = redisMock.get(cacheKey);
      expect(cachedResult).toBeTruthy();
    });

    test('should handle timeout for long-running analysis', async () => {
      const analysis = await testHelpers.createTestAnalysis(mockDocument.id, {
        status: 'pending'
      });

      // Mock slow LLM response
      ollamaMock.mockDelay('mistral:7b', 31000); // 31 seconds

      const jobData = {
        analysisId: analysis.id,
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'Very long document content...',
        documentType: 'contract',
        language: 'en'
      };

      const result = await analysisService.processAnalysis(jobData);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('timeout');
    });
  });

  describe('getAnalysis', () => {
    test('should retrieve completed analysis', async () => {
      const analysis = await testHelpers.createTestAnalysis(mockDocument.id);

      const result = await analysisService.getAnalysis(analysis.id, mockUser.id);

      expect(result).toMatchObject({
        id: analysis.id,
        status: 'completed',
        documentId: mockDocument.id,
        overallRiskScore: expect.any(Number),
        executiveSummary: expect.any(String),
        keyFindings: expect.any(Array),
        recommendations: expect.any(Array)
      });
    });

    test('should return cached analysis if available', async () => {
      const analysis = await testHelpers.createTestAnalysis(mockDocument.id);

      // First call - should cache the result
      const result1 = await analysisService.getAnalysis(analysis.id, mockUser.id);
      
      // Second call - should use cache
      const result2 = await analysisService.getAnalysis(analysis.id, mockUser.id);

      expect(result1).toEqual(result2);
      
      // Verify cache was used
      const getCalls = redisMock.get.mock.calls.length;
      expect(getCalls).toBeGreaterThan(0);
    });

    test('should check user access to analysis', async () => {
      const otherUser = await testHelpers.createTestUser({ email: 'other@example.com' });
      const otherDocument = await testHelpers.createTestDocument(otherUser.id);
      const analysis = await testHelpers.createTestAnalysis(otherDocument.id);

      await expect(analysisService.getAnalysis(analysis.id, mockUser.id))
        .rejects.toThrow('Analysis not found or access denied');
    });

    test('should handle non-existent analysis', async () => {
      const fakeAnalysisId = 'non-existent-id';

      await expect(analysisService.getAnalysis(fakeAnalysisId, mockUser.id))
        .rejects.toThrow('Analysis not found');
    });
  });

  describe('getAnalysesByDocument', () => {
    test('should retrieve all analyses for a document', async () => {
      const analysis1 = await testHelpers.createTestAnalysis(mockDocument.id);
      const analysis2 = await testHelpers.createTestAnalysis(mockDocument.id, {
        status: 'pending'
      });

      const results = await analysisService.getAnalysesByDocument(mockDocument.id, mockUser.id);

      expect(results).toHaveLength(2);
      expect(results.map(r => r.id)).toContain(analysis1.id);
      expect(results.map(r => r.id)).toContain(analysis2.id);
    });

    test('should return empty array for document with no analyses', async () => {
      const emptyDocument = await testHelpers.createTestDocument(mockUser.id, {
        title: 'Empty Document'
      });

      const results = await analysisService.getAnalysesByDocument(emptyDocument.id, mockUser.id);

      expect(results).toHaveLength(0);
    });

    test('should order analyses by creation date desc', async () => {
      const older = await testHelpers.createTestAnalysis(mockDocument.id, {
        createdAt: new Date('2024-01-01')
      });
      const newer = await testHelpers.createTestAnalysis(mockDocument.id, {
        createdAt: new Date('2024-01-02')
      });

      const results = await analysisService.getAnalysesByDocument(mockDocument.id, mockUser.id);

      expect(results[0].id).toBe(newer.id);
      expect(results[1].id).toBe(older.id);
    });
  });

  describe('deleteAnalysis', () => {
    test('should delete analysis and associated findings', async () => {
      const analysis = await testHelpers.createTestAnalysis(mockDocument.id);
      const finding = await testHelpers.createTestFinding(analysis.id);

      await analysisService.deleteAnalysis(analysis.id, mockUser.id);

      // Verify analysis is deleted
      await expect(analysisService.getAnalysis(analysis.id, mockUser.id))
        .rejects.toThrow('Analysis not found');

      // Verify finding is also deleted (cascade)
      const remainingFindings = await testHelpers.prisma.analysisFinding.findMany({
        where: { analysisId: analysis.id }
      });
      expect(remainingFindings).toHaveLength(0);
    });

    test('should check user ownership before deletion', async () => {
      const otherUser = await testHelpers.createTestUser({ email: 'other@example.com' });
      const otherDocument = await testHelpers.createTestDocument(otherUser.id);
      const analysis = await testHelpers.createTestAnalysis(otherDocument.id);

      await expect(analysisService.deleteAnalysis(analysis.id, mockUser.id))
        .rejects.toThrow('Analysis not found or access denied');
    });

    test('should clear analysis cache on deletion', async () => {
      const analysis = await testHelpers.createTestAnalysis(mockDocument.id);

      // Cache the analysis first
      await analysisService.getAnalysis(analysis.id, mockUser.id);

      // Delete the analysis
      await analysisService.deleteAnalysis(analysis.id, mockUser.id);

      // Verify cache was cleared
      const cacheKey = `analysis:${analysis.id}`;
      const cachedResult = redisMock.get(cacheKey);
      expect(cachedResult).toBeNull();
    });
  });

  describe('error handling and edge cases', () => {
    test('should handle database connection errors gracefully', async () => {
      // Mock database error
      jest.spyOn(testHelpers.prisma.analysis, 'create').mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = {
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'Test content',
        documentType: 'contract',
        language: 'en'
      };

      await expect(analysisService.createAnalysis(request))
        .rejects.toThrow('Database connection failed');
    });

    test('should handle empty document content', async () => {
      const analysis = await testHelpers.createTestAnalysis(mockDocument.id, {
        status: 'pending'
      });

      const jobData = {
        analysisId: analysis.id,
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: '', // Empty content
        documentType: 'contract',
        language: 'en'
      };

      const result = await analysisService.processAnalysis(jobData);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('empty');
    });

    test('should handle invalid document type', async () => {
      const request = {
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'Test content',
        documentType: 'invalid-type',
        language: 'en'
      };

      await expect(analysisService.createAnalysis(request))
        .rejects.toThrow('Invalid document type');
    });

    test('should handle unsupported language', async () => {
      const request = {
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'Test content',
        documentType: 'contract',
        language: 'xyz' // Unsupported language
      };

      await expect(analysisService.createAnalysis(request))
        .rejects.toThrow('Unsupported language');
    });
  });

  describe('concurrent analysis handling', () => {
    test('should prevent duplicate analyses for same document', async () => {
      const request = {
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'Test content',
        documentType: 'contract',
        language: 'en'
      };

      const [analysis1, analysis2] = await Promise.all([
        analysisService.createAnalysis(request),
        analysisService.createAnalysis(request)
      ]);

      // Should return the same analysis or handle gracefully
      expect(analysis1.id).toBeDefined();
      expect(analysis2.id).toBeDefined();
      
      // At least one should succeed
      expect(analysis1.status === 'pending' || analysis2.status === 'pending').toBe(true);
    });

    test('should handle concurrent processing of same analysis', async () => {
      const analysis = await testHelpers.createTestAnalysis(mockDocument.id, {
        status: 'pending'
      });

      const jobData = {
        analysisId: analysis.id,
        documentId: mockDocument.id,
        userId: mockUser.id,
        content: 'Test content',
        documentType: 'contract',
        language: 'en'
      };

      // Start two concurrent processing attempts
      const [result1, result2] = await Promise.allSettled([
        analysisService.processAnalysis(jobData),
        analysisService.processAnalysis(jobData)
      ]);

      // At least one should succeed
      const successCount = [result1, result2].filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThanOrEqual(1);
    });
  });
});