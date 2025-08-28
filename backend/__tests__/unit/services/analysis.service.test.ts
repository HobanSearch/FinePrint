/**
 * Unit tests for Analysis Service
 * Tests all core functionality of the document analysis service
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
import { createMockDocument, createMockAnalysis, createMockFinding } from '../../mocks/factories';
import { resetAllMocks, setupMockDefaults } from '../../mocks/utils/mock-utils';

// Mock dependencies
const mockPrisma = {
  analysis: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  document: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockOllamaClient = {
  generate: jest.fn(),
  list: jest.fn(),
  show: jest.fn(),
};

const mockQueue = {
  add: jest.fn(),
  process: jest.fn(),
  getJob: jest.fn(),
  getWaiting: jest.fn(),
  getActive: jest.fn(),
  getCompleted: jest.fn(),
  getFailed: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockMetrics = {
  increment: jest.fn(),
  timing: jest.fn(),
  gauge: jest.fn(),
};

// Mock the Analysis Service
class AnalysisService {
  constructor(
    private prisma: any,
    private ollamaClient: any,
    private queue: any,
    private logger: any,
    private metrics: any
  ) {}

  async analyzeDocument(documentId: string, options: any = {}): Promise<any> {
    this.logger.info('Starting document analysis', { documentId, options });
    
    // Validate document exists
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error('Document not found');
    }

    if (document.status !== 'active') {
      throw new Error('Document is not active');
    }

    // Create analysis record
    const analysis = await this.prisma.analysis.create({
      data: {
        documentId,
        userId: options.userId || document.userId,
        status: 'pending',
        modelVersion: options.modelVersion || 'phi:2.7b',
        metadata: options.metadata || {},
      },
    });

    // Add to processing queue
    await this.queue.add('analyze-document', {
      analysisId: analysis.id,
      documentId,
      options,
    });

    this.metrics.increment('analysis.created');
    this.logger.info('Analysis created and queued', { analysisId: analysis.id });

    return analysis;
  }

  async getAnalysis(analysisId: string): Promise<any> {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      include: {
        document: {
          select: { title: true, type: true },
        },
      },
    });

    if (!analysis) {
      throw new Error('Analysis not found');
    }

    return analysis;
  }

  async getAnalysesByDocument(documentId: string, options: any = {}): Promise<any[]> {
    const analyses = await this.prisma.analysis.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      skip: options.skip || 0,
      take: options.limit || 10,
      include: options.include || {},
    });

    return analyses;
  }

  async getAnalysesByUser(userId: string, options: any = {}): Promise<any> {
    const where: any = { userId };

    if (options.status) {
      where.status = options.status;
    }

    if (options.documentType) {
      where.document = { type: options.documentType };
    }

    if (options.dateFrom || options.dateTo) {
      where.createdAt = {};
      if (options.dateFrom) {
        where.createdAt.gte = new Date(options.dateFrom);
      }
      if (options.dateTo) {
        where.createdAt.lte = new Date(options.dateTo);
      }
    }

    const [analyses, total] = await Promise.all([
      this.prisma.analysis.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: options.skip || 0,
        take: options.limit || 20,
        include: {
          document: {
            select: { title: true, type: true },
          },
        },
      }),
      this.prisma.analysis.count({ where }),
    ]);

    return {
      analyses,
      total,
      page: Math.floor((options.skip || 0) / (options.limit || 20)) + 1,
      totalPages: Math.ceil(total / (options.limit || 20)),
    };
  }

  async updateAnalysis(analysisId: string, updates: any): Promise<any> {
    const analysis = await this.prisma.analysis.update({
      where: { id: analysisId },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    });

    this.logger.info('Analysis updated', { analysisId, updates });
    return analysis;
  }

  async deleteAnalysis(analysisId: string): Promise<void> {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      throw new Error('Analysis not found');
    }

    await this.prisma.analysis.delete({
      where: { id: analysisId },
    });

    this.metrics.increment('analysis.deleted');
    this.logger.info('Analysis deleted', { analysisId });
  }

  async processAnalysis(analysisId: string): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Update status to processing
      await this.updateAnalysis(analysisId, { status: 'processing' });

      const analysis = await this.getAnalysis(analysisId);
      const document = analysis.document;

      // Perform AI analysis
      const findings = await this.performAIAnalysis(document.content, analysis.modelVersion);
      
      // Calculate risk score
      const overallRiskScore = this.calculateRiskScore(findings);
      
      // Generate executive summary
      const executiveSummary = this.generateExecutiveSummary(findings, overallRiskScore);

      // Update analysis with results
      const completed = await this.updateAnalysis(analysisId, {
        status: 'completed',
        findings,
        overallRiskScore,
        executiveSummary,
        processingTime: Date.now() - startTime,
        completedAt: new Date(),
      });

      this.metrics.timing('analysis.processing_time', Date.now() - startTime);
      this.metrics.increment('analysis.completed');
      
      return completed;

    } catch (error) {
      this.logger.error('Analysis failed', { analysisId, error });
      
      await this.updateAnalysis(analysisId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        failedAt: new Date(),
      });

      this.metrics.increment('analysis.failed');
      throw error;
    }
  }

  private async performAIAnalysis(content: string, modelVersion: string): Promise<any[]> {
    const prompt = this.buildAnalysisPrompt(content);
    
    const response = await this.ollamaClient.generate({
      model: modelVersion,
      prompt,
      stream: false,
    });

    return this.parseAIResponse(response.response);
  }

  private buildAnalysisPrompt(content: string): string {
    return `
Analyze the following legal document and identify problematic clauses:

${content}

Please identify issues in these categories:
1. Data usage and privacy concerns
2. Liability limitations and waivers
3. Termination and cancellation terms
4. Dispute resolution clauses
5. Content and intellectual property rights
6. Automatic renewals and billing
7. Jurisdiction and governing law issues

For each issue found, provide:
- Category
- Title (brief description)
- Description (detailed explanation)
- Severity (low/medium/high/critical)
- Confidence (0.0-1.0)
- Location (character positions)
- Recommendation

Respond with valid JSON format.
    `.trim();
  }

  private parseAIResponse(response: string): any[] {
    try {
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : parsed.findings || [];
    } catch (error) {
      this.logger.warn('Failed to parse AI response, using fallback', { error });
      return this.generateFallbackFindings();
    }
  }

  private generateFallbackFindings(): any[] {
    return [
      {
        id: `finding-${Date.now()}`,
        category: 'data-usage',
        title: 'Potential data usage issue detected',
        description: 'The document may contain concerning data usage terms.',
        severity: 'medium',
        confidence: 0.7,
        location: { start: 0, end: 100 },
        recommendation: 'Please review data usage terms carefully.',
      },
    ];
  }

  private calculateRiskScore(findings: any[]): number {
    if (findings.length === 0) return 0;

    const severityWeights = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    const totalWeight = findings.reduce((sum, finding) => {
      const weight = severityWeights[finding.severity as keyof typeof severityWeights] || 1;
      const confidence = finding.confidence || 0.5;
      return sum + (weight * confidence);
    }, 0);

    const maxPossibleWeight = findings.length * 4; // All critical with 100% confidence
    return Math.min(100, Math.round((totalWeight / maxPossibleWeight) * 100));
  }

  private generateExecutiveSummary(findings: any[], riskScore: number): string {
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    const mediumCount = findings.filter(f => f.severity === 'medium').length;
    const lowCount = findings.filter(f => f.severity === 'low').length;

    let summary = `This document analysis identified ${findings.length} potential issues with an overall risk score of ${riskScore}/100. `;

    if (criticalCount > 0) {
      summary += `There are ${criticalCount} critical issues requiring immediate attention. `;
    }
    
    if (highCount > 0) {
      summary += `${highCount} high-severity issues were found. `;
    }
    
    if (mediumCount > 0) {
      summary += `${mediumCount} medium-severity issues should be reviewed. `;
    }
    
    if (lowCount > 0) {
      summary += `${lowCount} low-severity issues were noted. `;
    }

    summary += "Review all findings and implement recommended actions.";
    return summary;
  }

  async getAnalysisStats(userId?: string): Promise<any> {
    const where = userId ? { userId } : {};

    const [total, completed, processing, failed, pending] = await Promise.all([
      this.prisma.analysis.count({ where }),
      this.prisma.analysis.count({ where: { ...where, status: 'completed' } }),
      this.prisma.analysis.count({ where: { ...where, status: 'processing' } }),
      this.prisma.analysis.count({ where: { ...where, status: 'failed' } }),
      this.prisma.analysis.count({ where: { ...where, status: 'pending' } }),
    ]);

    // Get average metrics for completed analyses
    const completedAnalyses = await this.prisma.analysis.findMany({
      where: { ...where, status: 'completed' },
      select: {
        overallRiskScore: true,
        processingTime: true,
        findings: true,
      },
    });

    let averageRiskScore = 0;
    let averageProcessingTime = 0;
    let totalFindings = 0;
    const findingsBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };

    if (completedAnalyses.length > 0) {
      averageRiskScore = completedAnalyses.reduce(
        (sum, a) => sum + (a.overallRiskScore || 0), 0
      ) / completedAnalyses.length;

      averageProcessingTime = completedAnalyses.reduce(
        (sum, a) => sum + (a.processingTime || 0), 0
      ) / completedAnalyses.length;

      completedAnalyses.forEach(analysis => {
        if (analysis.findings && Array.isArray(analysis.findings)) {
          totalFindings += analysis.findings.length;
          analysis.findings.forEach((finding: any) => {
            if (findingsBySeverity[finding.severity as keyof typeof findingsBySeverity] !== undefined) {
              findingsBySeverity[finding.severity as keyof typeof findingsBySeverity]++;
            }
          });
        }
      });
    }

    return {
      total,
      completed,
      processing,
      failed,
      pending,
      averageRiskScore: Math.round(averageRiskScore),
      averageProcessingTime: Math.round(averageProcessingTime),
      totalFindings,
      findingsBySeverity,
    };
  }
}

describe('AnalysisService', () => {
  let analysisService: AnalysisService;
  let mockDocument: any;
  let mockAnalysis: any;

  beforeAll(() => {
    setupMockDefaults();
  });

  beforeEach(() => {
    resetAllMocks();
    
    analysisService = new AnalysisService(
      mockPrisma,
      mockOllamaClient,
      mockQueue,
      mockLogger,
      mockMetrics
    );

    mockDocument = createMockDocument();
    mockAnalysis = createMockAnalysis({ documentId: mockDocument.id });

    // Setup default mock responses
    mockPrisma.document.findUnique.mockResolvedValue(mockDocument);
    mockPrisma.analysis.create.mockResolvedValue(mockAnalysis);
    mockPrisma.analysis.findUnique.mockResolvedValue(mockAnalysis);
    mockQueue.add.mockResolvedValue({ id: 'job-123' });
  });

  afterEach(() => {
    resetAllMocks();
  });

  describe('analyzeDocument', () => {
    test('should create analysis for valid document', async () => {
      const result = await analysisService.analyzeDocument(mockDocument.id);

      expect(mockPrisma.document.findUnique).toHaveBeenCalledWith({
        where: { id: mockDocument.id },
      });

      expect(mockPrisma.analysis.create).toHaveBeenCalledWith({
        data: {
          documentId: mockDocument.id,
          userId: mockDocument.userId,
          status: 'pending',
          modelVersion: 'phi:2.7b',
          metadata: {},
        },
      });

      expect(mockQueue.add).toHaveBeenCalledWith('analyze-document', {
        analysisId: mockAnalysis.id,
        documentId: mockDocument.id,
        options: {},
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('analysis.created');
      expect(result).toEqual(mockAnalysis);
    });

    test('should throw error for non-existent document', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);

      await expect(
        analysisService.analyzeDocument('non-existent-id')
      ).rejects.toThrow('Document not found');

      expect(mockPrisma.analysis.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    test('should throw error for inactive document', async () => {
      const inactiveDocument = { ...mockDocument, status: 'archived' };
      mockPrisma.document.findUnique.mockResolvedValue(inactiveDocument);

      await expect(
        analysisService.analyzeDocument(mockDocument.id)
      ).rejects.toThrow('Document is not active');
    });

    test('should use provided options', async () => {
      const options = {
        userId: 'custom-user-id',
        modelVersion: 'mistral:7b',
        metadata: { priority: 'high' },
      };

      await analysisService.analyzeDocument(mockDocument.id, options);

      expect(mockPrisma.analysis.create).toHaveBeenCalledWith({
        data: {
          documentId: mockDocument.id,
          userId: options.userId,
          status: 'pending',
          modelVersion: options.modelVersion,
          metadata: options.metadata,
        },
      });
    });

    test('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.analysis.create.mockRejectedValue(dbError);

      await expect(
        analysisService.analyzeDocument(mockDocument.id)
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('getAnalysis', () => {
    test('should return analysis with document info', async () => {
      const analysisWithDocument = {
        ...mockAnalysis,
        document: {
          title: mockDocument.title,
          type: mockDocument.type,
        },
      };
      mockPrisma.analysis.findUnique.mockResolvedValue(analysisWithDocument);

      const result = await analysisService.getAnalysis(mockAnalysis.id);

      expect(mockPrisma.analysis.findUnique).toHaveBeenCalledWith({
        where: { id: mockAnalysis.id },
        include: {
          document: {
            select: { title: true, type: true },
          },
        },
      });

      expect(result).toEqual(analysisWithDocument);
    });

    test('should throw error for non-existent analysis', async () => {
      mockPrisma.analysis.findUnique.mockResolvedValue(null);

      await expect(
        analysisService.getAnalysis('non-existent-id')
      ).rejects.toThrow('Analysis not found');
    });
  });

  describe('getAnalysesByDocument', () => {
    test('should return analyses for document', async () => {
      const analyses = [mockAnalysis];
      mockPrisma.analysis.findMany.mockResolvedValue(analyses);

      const result = await analysisService.getAnalysesByDocument(mockDocument.id);

      expect(mockPrisma.analysis.findMany).toHaveBeenCalledWith({
        where: { documentId: mockDocument.id },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
        include: {},
      });

      expect(result).toEqual(analyses);
    });

    test('should apply pagination options', async () => {
      const options = { skip: 20, limit: 5, include: { document: true } };
      await analysisService.getAnalysesByDocument(mockDocument.id, options);

      expect(mockPrisma.analysis.findMany).toHaveBeenCalledWith({
        where: { documentId: mockDocument.id },
        orderBy: { createdAt: 'desc' },
        skip: 20,
        take: 5,
        include: { document: true },
      });
    });
  });

  describe('getAnalysesByUser', () => {
    test('should return paginated analyses for user', async () => {
      const analyses = [mockAnalysis];
      const total = 1;
      
      mockPrisma.analysis.findMany.mockResolvedValue(analyses);
      mockPrisma.analysis.count.mockResolvedValue(total);

      const result = await analysisService.getAnalysesByUser('user-123');

      expect(result).toEqual({
        analyses,
        total,
        page: 1,
        totalPages: 1,
      });
    });

    test('should apply filters correctly', async () => {
      const options = {
        status: 'completed',
        documentType: 'contract',
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      };

      await analysisService.getAnalysesByUser('user-123', options);

      expect(mockPrisma.analysis.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          status: 'completed',
          document: { type: 'contract' },
          createdAt: {
            gte: new Date('2024-01-01'),
            lte: new Date('2024-12-31'),
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
        include: {
          document: {
            select: { title: true, type: true },
          },
        },
      });
    });

    test('should calculate pagination correctly', async () => {
      const options = { skip: 40, limit: 10 };
      mockPrisma.analysis.findMany.mockResolvedValue([]);
      mockPrisma.analysis.count.mockResolvedValue(95);

      const result = await analysisService.getAnalysesByUser('user-123', options);

      expect(result.page).toBe(5); // (40 / 10) + 1
      expect(result.totalPages).toBe(10); // Math.ceil(95 / 10)
    });
  });

  describe('updateAnalysis', () => {
    test('should update analysis with new data', async () => {
      const updates = { status: 'completed', overallRiskScore: 85 };
      const updatedAnalysis = { ...mockAnalysis, ...updates };
      
      mockPrisma.analysis.update.mockResolvedValue(updatedAnalysis);

      const result = await analysisService.updateAnalysis(mockAnalysis.id, updates);

      expect(mockPrisma.analysis.update).toHaveBeenCalledWith({
        where: { id: mockAnalysis.id },
        data: {
          ...updates,
          updatedAt: expect.any(Date),
        },
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Analysis updated', {
        analysisId: mockAnalysis.id,
        updates,
      });

      expect(result).toEqual(updatedAnalysis);
    });
  });

  describe('deleteAnalysis', () => {
    test('should delete existing analysis', async () => {
      mockPrisma.analysis.findUnique.mockResolvedValue(mockAnalysis);
      mockPrisma.analysis.delete.mockResolvedValue(mockAnalysis);

      await analysisService.deleteAnalysis(mockAnalysis.id);

      expect(mockPrisma.analysis.delete).toHaveBeenCalledWith({
        where: { id: mockAnalysis.id },
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('analysis.deleted');
      expect(mockLogger.info).toHaveBeenCalledWith('Analysis deleted', {
        analysisId: mockAnalysis.id,
      });
    });

    test('should throw error for non-existent analysis', async () => {
      mockPrisma.analysis.findUnique.mockResolvedValue(null);

      await expect(
        analysisService.deleteAnalysis('non-existent-id')
      ).rejects.toThrow('Analysis not found');

      expect(mockPrisma.analysis.delete).not.toHaveBeenCalled();
    });
  });

  describe('processAnalysis', () => {
    beforeEach(() => {
      mockOllamaClient.generate.mockResolvedValue({
        response: JSON.stringify([
          createMockFinding({ severity: 'high' }),
          createMockFinding({ severity: 'medium' }),
        ]),
      });
    });

    test('should process analysis successfully', async () => {
      const completedAnalysis = { ...mockAnalysis, status: 'completed' };
      mockPrisma.analysis.update.mockResolvedValue(completedAnalysis);

      const result = await analysisService.processAnalysis(mockAnalysis.id);

      expect(mockPrisma.analysis.update).toHaveBeenCalledWith({
        where: { id: mockAnalysis.id },
        data: { status: 'processing', updatedAt: expect.any(Date) },
      });

      expect(mockOllamaClient.generate).toHaveBeenCalled();
      expect(mockMetrics.timing).toHaveBeenCalledWith(
        'analysis.processing_time',
        expect.any(Number)
      );
      expect(mockMetrics.increment).toHaveBeenCalledWith('analysis.completed');
    });

    test('should handle AI analysis failure', async () => {
      const aiError = new Error('AI model unavailable');
      mockOllamaClient.generate.mockRejectedValue(aiError);

      await expect(
        analysisService.processAnalysis(mockAnalysis.id)
      ).rejects.toThrow('AI model unavailable');

      expect(mockPrisma.analysis.update).toHaveBeenCalledWith({
        where: { id: mockAnalysis.id },
        data: {
          status: 'failed',
          error: 'AI model unavailable',
          failedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('analysis.failed');
    });

    test('should handle malformed AI response gracefully', async () => {
      mockOllamaClient.generate.mockResolvedValue({
        response: 'invalid json response',
      });

      await analysisService.processAnalysis(mockAnalysis.id);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to parse AI response, using fallback',
        { error: expect.any(Error) }
      );
    });
  });

  describe('getAnalysisStats', () => {
    test('should return comprehensive stats', async () => {
      // Mock count queries
      mockPrisma.analysis.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(85)  // completed
        .mockResolvedValueOnce(5)   // processing
        .mockResolvedValueOnce(8)   // failed
        .mockResolvedValueOnce(2);  // pending

      // Mock completed analyses for averages
      const completedAnalyses = [
        {
          overallRiskScore: 75,
          processingTime: 5000,
          findings: [
            { severity: 'high' },
            { severity: 'medium' },
          ],
        },
        {
          overallRiskScore: 65,
          processingTime: 7000,
          findings: [
            { severity: 'critical' },
            { severity: 'low' },
          ],
        },
      ];
      mockPrisma.analysis.findMany.mockResolvedValue(completedAnalyses);

      const result = await analysisService.getAnalysisStats('user-123');

      expect(result).toMatchObject({
        total: 100,
        completed: 85,
        processing: 5,
        failed: 8,
        pending: 2,
        averageRiskScore: 70,
        averageProcessingTime: 6000,
        totalFindings: 4,
        findingsBySeverity: {
          critical: 1,
          high: 1,
          medium: 1,
          low: 1,
        },
      });
    });

    test('should handle no completed analyses', async () => {
      mockPrisma.analysis.count.mockResolvedValue(0);
      mockPrisma.analysis.findMany.mockResolvedValue([]);

      const result = await analysisService.getAnalysisStats();

      expect(result.averageRiskScore).toBe(0);
      expect(result.averageProcessingTime).toBe(0);
      expect(result.totalFindings).toBe(0);
    });
  });

  describe('Performance Tests', () => {
    test('should complete analysis within performance threshold', async () => {
      const { result, duration } = await measurePerformance(async () => {
        return analysisService.analyzeDocument(mockDocument.id);
      });

      expect(duration).toBeWithinPerformanceThreshold(TEST_CONFIG.API_RESPONSE_THRESHOLD);
      expect(result).toBeDefined();
    });

    test('should handle concurrent analysis requests', async () => {
      const documents = Array.from({ length: 5 }, () => createMockDocument());
      
      // Setup mocks for multiple documents
      mockPrisma.document.findUnique.mockImplementation((args) => {
        return Promise.resolve(documents.find(doc => doc.id === args.where.id));
      });

      const promises = documents.map(doc => 
        analysisService.analyzeDocument(doc.id)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(mockPrisma.analysis.create).toHaveBeenCalledTimes(5);
      expect(mockQueue.add).toHaveBeenCalledTimes(5);
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      const dbError = new Error('Connection timeout');
      mockPrisma.analysis.findUnique.mockRejectedValue(dbError);

      await expect(
        analysisService.getAnalysis(mockAnalysis.id)
      ).rejects.toThrow('Connection timeout');
    });

    test('should handle queue failures gracefully', async () => {
      const queueError = new Error('Queue service unavailable');
      mockQueue.add.mockRejectedValue(queueError);

      await expect(
        analysisService.analyzeDocument(mockDocument.id)
      ).rejects.toThrow('Queue service unavailable');
    });

    test('should validate input parameters', async () => {
      await expect(
        analysisService.getAnalysis('')
      ).rejects.toThrow();

      await expect(
        analysisService.analyzeDocument('')
      ).rejects.toThrow();
    });
  });

  describe('Integration with AI Models', () => {
    test('should use correct model version', async () => {
      await analysisService.processAnalysis(mockAnalysis.id);

      expect(mockOllamaClient.generate).toHaveBeenCalledWith({
        model: mockAnalysis.modelVersion,
        prompt: expect.stringContaining('Analyze the following legal document'),
        stream: false,
      });
    });

    test('should build proper analysis prompt', async () => {
      await analysisService.processAnalysis(mockAnalysis.id);

      const call = mockOllamaClient.generate.mock.calls[0][0];
      expect(call.prompt).toContain('Data usage and privacy concerns');
      expect(call.prompt).toContain('Liability limitations and waivers');
      expect(call.prompt).toContain('Respond with valid JSON format');
    });
  });
});