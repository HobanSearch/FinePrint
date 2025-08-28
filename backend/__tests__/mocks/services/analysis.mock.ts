/**
 * Analysis service mock for testing
 * Provides comprehensive mocking for document analysis operations
 */

import { jest } from '@jest/globals';
import { createMockAnalysis, createMockFinding } from '../factories';

class MockAnalysisService {
  private analyses: Map<string, any> = new Map();
  private processingQueue: Set<string> = new Set();

  constructor() {
    this.setupDefaultData();
  }

  private setupDefaultData(): void {
    // Add some default test analyses
    const analysis1 = createMockAnalysis({
      id: 'test-analysis-1',
      documentId: 'test-doc-1',
      status: 'completed',
      overallRiskScore: 75,
    });
    
    const analysis2 = createMockAnalysis({
      id: 'test-analysis-2',
      documentId: 'test-doc-2',
      status: 'processing',
    });

    this.analyses.set(analysis1.id, analysis1);
    this.analyses.set(analysis2.id, analysis2);
  }

  async analyzeDocument(documentId: string, options: any = {}): Promise<any> {
    const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const analysis = createMockAnalysis({
      id: analysisId,
      documentId,
      status: 'pending',
      userId: options.userId,
      metadata: options.metadata,
    });

    this.analyses.set(analysisId, analysis);
    this.processingQueue.add(analysisId);

    // Simulate async processing
    setTimeout(() => {
      this.completeAnalysis(analysisId);
    }, options.simulateDelay || 100);

    return analysis;
  }

  async getAnalysis(analysisId: string): Promise<any> {
    const analysis = this.analyses.get(analysisId);
    if (!analysis) {
      throw new Error(`Analysis not found: ${analysisId}`);
    }
    return analysis;
  }

  async getAnalysesByDocument(documentId: string): Promise<any[]> {
    return Array.from(this.analyses.values())
      .filter(analysis => analysis.documentId === documentId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getAnalysesByUser(userId: string, options: any = {}): Promise<any[]> {
    let analyses = Array.from(this.analyses.values())
      .filter(analysis => analysis.userId === userId);

    // Apply filters
    if (options.status) {
      analyses = analyses.filter(analysis => analysis.status === options.status);
    }

    if (options.dateFrom) {
      analyses = analyses.filter(analysis => 
        new Date(analysis.createdAt) >= new Date(options.dateFrom)
      );
    }

    if (options.dateTo) {
      analyses = analyses.filter(analysis => 
        new Date(analysis.createdAt) <= new Date(options.dateTo)
      );
    }

    // Apply sorting
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder || 'desc';
    
    analyses.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      
      if (sortOrder === 'desc') {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      } else {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
    });

    // Apply pagination
    const skip = options.skip || 0;
    const limit = options.limit || 20;
    
    return analyses.slice(skip, skip + limit);
  }

  async updateAnalysis(analysisId: string, updates: any): Promise<any> {
    const analysis = await this.getAnalysis(analysisId);
    const updated = {
      ...analysis,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.analyses.set(analysisId, updated);
    return updated;
  }

  async deleteAnalysis(analysisId: string): Promise<void> {
    if (!this.analyses.has(analysisId)) {
      throw new Error(`Analysis not found: ${analysisId}`);
    }
    
    this.analyses.delete(analysisId);
    this.processingQueue.delete(analysisId);
  }

  async getAnalysisStats(userId?: string): Promise<any> {
    let analyses = Array.from(this.analyses.values());
    
    if (userId) {
      analyses = analyses.filter(analysis => analysis.userId === userId);
    }

    const stats = {
      total: analyses.length,
      completed: analyses.filter(a => a.status === 'completed').length,
      processing: analyses.filter(a => a.status === 'processing').length,
      failed: analyses.filter(a => a.status === 'failed').length,
      pending: analyses.filter(a => a.status === 'pending').length,
      
      averageRiskScore: 0,
      totalFindings: 0,
      findingsBySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      
      averageProcessingTime: 0,
      documentsAnalyzed: new Set(analyses.map(a => a.documentId)).size,
    };

    const completedAnalyses = analyses.filter(a => a.status === 'completed');
    
    if (completedAnalyses.length > 0) {
      stats.averageRiskScore = completedAnalyses.reduce(
        (sum, a) => sum + (a.overallRiskScore || 0), 0
      ) / completedAnalyses.length;
      
      stats.averageProcessingTime = completedAnalyses.reduce(
        (sum, a) => sum + (a.processingTime || 0), 0
      ) / completedAnalyses.length;
      
      completedAnalyses.forEach(analysis => {
        if (analysis.findings) {
          stats.totalFindings += analysis.findings.length;
          analysis.findings.forEach((finding: any) => {
            if (stats.findingsBySeverity[finding.severity as keyof typeof stats.findingsBySeverity] !== undefined) {
              stats.findingsBySeverity[finding.severity as keyof typeof stats.findingsBySeverity]++;
            }
          });
        }
      });
    }

    return stats;
  }

  async retryFailedAnalysis(analysisId: string): Promise<any> {
    const analysis = await this.getAnalysis(analysisId);
    
    if (analysis.status !== 'failed') {
      throw new Error('Analysis is not in failed state');
    }

    const updated = {
      ...analysis,
      status: 'pending',
      retryCount: (analysis.retryCount || 0) + 1,
      updatedAt: new Date(),
    };

    this.analyses.set(analysisId, updated);
    this.processingQueue.add(analysisId);

    // Simulate retry processing
    setTimeout(() => {
      this.completeAnalysis(analysisId);
    }, 200);

    return updated;
  }

  // Private helper methods
  private completeAnalysis(analysisId: string): void {
    const analysis = this.analyses.get(analysisId);
    if (!analysis) return;

    // Simulate analysis completion with findings
    const findings = Array.from({ length: Math.floor(Math.random() * 8) + 2 }, () =>
      createMockFinding({ analysisId })
    );

    const completed = {
      ...analysis,
      status: 'completed',
      findings,
      overallRiskScore: Math.floor(Math.random() * 100),
      processingTime: Math.floor(Math.random() * 10000) + 1000,
      completedAt: new Date(),
      updatedAt: new Date(),
    };

    this.analyses.set(analysisId, completed);
    this.processingQueue.delete(analysisId);
  }

  // Test utilities
  clearAllData(): void {
    this.analyses.clear();
    this.processingQueue.clear();
    this.setupDefaultData();
  }

  addTestAnalysis(analysis: any): void {
    this.analyses.set(analysis.id, analysis);
  }

  getProcessingQueue(): string[] {
    return Array.from(this.processingQueue);
  }

  getAllAnalyses(): any[] {
    return Array.from(this.analyses.values());
  }

  simulateAnalysisFailure(analysisId: string, error: string = 'Simulated failure'): void {
    const analysis = this.analyses.get(analysisId);
    if (analysis) {
      const failed = {
        ...analysis,
        status: 'failed',
        error,
        failedAt: new Date(),
        updatedAt: new Date(),
      };
      this.analyses.set(analysisId, failed);
      this.processingQueue.delete(analysisId);
    }
  }
}

const mockAnalysisService = new MockAnalysisService();

// Jest mock functions
export const mockAnalyzeDocument = jest.fn().mockImplementation(
  (documentId, options) => mockAnalysisService.analyzeDocument(documentId, options)
);

export const mockGetAnalysis = jest.fn().mockImplementation(
  (analysisId) => mockAnalysisService.getAnalysis(analysisId)
);

export const mockGetAnalysesByDocument = jest.fn().mockImplementation(
  (documentId) => mockAnalysisService.getAnalysesByDocument(documentId)
);

export const mockGetAnalysesByUser = jest.fn().mockImplementation(
  (userId, options) => mockAnalysisService.getAnalysesByUser(userId, options)
);

export const mockUpdateAnalysis = jest.fn().mockImplementation(
  (analysisId, updates) => mockAnalysisService.updateAnalysis(analysisId, updates)
);

export const mockDeleteAnalysis = jest.fn().mockImplementation(
  (analysisId) => mockAnalysisService.deleteAnalysis(analysisId)
);

export const mockGetAnalysisStats = jest.fn().mockImplementation(
  (userId) => mockAnalysisService.getAnalysisStats(userId)
);

export const mockRetryFailedAnalysis = jest.fn().mockImplementation(
  (analysisId) => mockAnalysisService.retryFailedAnalysis(analysisId)
);

// Export default mock service
export default {
  analyzeDocument: mockAnalyzeDocument,
  getAnalysis: mockGetAnalysis,
  getAnalysesByDocument: mockGetAnalysesByDocument,
  getAnalysesByUser: mockGetAnalysesByUser,
  updateAnalysis: mockUpdateAnalysis,
  deleteAnalysis: mockDeleteAnalysis,
  getAnalysisStats: mockGetAnalysisStats,
  retryFailedAnalysis: mockRetryFailedAnalysis,

  // Test utilities
  __mockInstance: mockAnalysisService,
  __clearAllData: () => mockAnalysisService.clearAllData(),
  __addTestAnalysis: (analysis: any) => mockAnalysisService.addTestAnalysis(analysis),
  __getProcessingQueue: () => mockAnalysisService.getProcessingQueue(),
  __getAllAnalyses: () => mockAnalysisService.getAllAnalyses(),
  __simulateFailure: (analysisId: string, error?: string) => 
    mockAnalysisService.simulateAnalysisFailure(analysisId, error),
};