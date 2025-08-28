import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

export class TestHelpers {
  static prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  static redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379/1');

  /**
   * Generate test user data
   */
  static generateUser(overrides: Partial<any> = {}) {
    return {
      id: randomUUID(),
      email: `test-${randomUUID()}@example.com`,
      firstName: 'Test',
      lastName: 'User',
      passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKYpK9X1l9oG.km', // "password123"
      isEmailVerified: true,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  /**
   * Generate test document data
   */
  static generateDocument(userId: string, overrides: Partial<any> = {}) {
    return {
      id: randomUUID(),
      title: 'Test Document',
      documentType: 'contract',
      documentHash: randomUUID(),
      contentLength: 1000,
      language: 'en',
      monitoringEnabled: false,
      monitoringFrequency: 24,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  /**
   * Generate test analysis data
   */
  static generateAnalysis(documentId: string, overrides: Partial<any> = {}) {
    return {
      id: randomUUID(),
      status: 'completed' as const,
      documentId,
      overallRiskScore: 7.5,
      executiveSummary: 'Test analysis summary',
      keyFindings: ['Finding 1', 'Finding 2'],
      recommendations: ['Recommendation 1', 'Recommendation 2'],
      processingTimeMs: 5000,
      modelUsed: 'mistral:7b',
      createdAt: new Date(),
      completedAt: new Date(),
      ...overrides
    };
  }

  /**
   * Generate test finding data
   */
  static generateFinding(analysisId: string, overrides: Partial<any> = {}) {
    return {
      id: randomUUID(),
      analysisId,
      category: 'liability',
      title: 'Test Finding',
      description: 'Test finding description',
      severity: 'medium' as const,
      confidenceScore: 0.85,
      textExcerpt: 'Test excerpt from document',
      positionStart: 100,
      positionEnd: 200,
      recommendation: 'Test recommendation',
      impactExplanation: 'Test impact explanation',
      ...overrides
    };
  }

  /**
   * Create test user in database
   */
  static async createTestUser(overrides: Partial<any> = {}) {
    const userData = this.generateUser(overrides);
    return await this.prisma.user.create({ data: userData });
  }

  /**
   * Create test document in database
   */
  static async createTestDocument(userId: string, overrides: Partial<any> = {}) {
    const documentData = this.generateDocument(userId, overrides);
    return await this.prisma.document.create({ data: documentData });
  }

  /**
   * Create test analysis in database
   */
  static async createTestAnalysis(documentId: string, overrides: Partial<any> = {}) {
    const analysisData = this.generateAnalysis(documentId, overrides);
    return await this.prisma.analysis.create({ data: analysisData });
  }

  /**
   * Clean up test data
   */
  static async cleanup() {
    await this.prisma.analysisFinding.deleteMany();
    await this.prisma.analysis.deleteMany();
    await this.prisma.document.deleteMany();
    await this.prisma.user.deleteMany();
    await this.redis.flushall();
  }

  /**
   * Generate JWT token for testing
   */
  static generateJwtToken(payload: any = {}) {
    const jwt = require('jsonwebtoken');
    const defaultPayload = {
      userId: randomUUID(),
      email: 'test@example.com',
      role: 'user',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
    };
    
    return jwt.sign(
      { ...defaultPayload, ...payload },
      process.env.JWT_SECRET || 'test-secret'
    );
  }

  /**
   * Create authenticated test request headers
   */
  static createAuthHeaders(token?: string) {
    return {
      'Authorization': `Bearer ${token || this.generateJwtToken()}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Wait for condition to be true
   */
  static async waitFor(
    condition: () => Promise<boolean> | boolean,
    timeout = 5000,
    interval = 100
  ): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Mock Ollama API responses
   */
  static mockOllamaResponse(model: string = 'mistral:7b', response: string = 'Mock AI response') {
    return {
      model,
      response,
      done: true,
      context: [1, 2, 3],
      total_duration: 5000000,
      load_duration: 1000000,
      prompt_eval_count: 10,
      prompt_eval_duration: 2000000,
      eval_count: 20,
      eval_duration: 2000000
    };
  }

  /**
   * Mock analysis result
   */
  static mockAnalysisResult() {
    return {
      overallRiskScore: 7.5,
      executiveSummary: 'This contract contains several medium-risk clauses that require attention.',
      keyFindings: [
        'Broad liability exclusion clause',
        'Automatic renewal terms',
        'Termination penalties'
      ],
      recommendations: [
        'Negotiate narrower liability exclusions',
        'Add opt-out provisions for automatic renewal',
        'Review termination penalty amounts'
      ],
      findings: [
        {
          category: 'liability',
          title: 'Broad Liability Exclusion',
          description: 'The contract includes overly broad liability exclusions',
          severity: 'medium' as const,
          confidenceScore: 0.9,
          textExcerpt: 'Company shall not be liable for any damages...',
          positionStart: 1250,
          positionEnd: 1380,
          recommendation: 'Negotiate for narrower exclusions',
          impactExplanation: 'May limit recourse in case of company negligence'
        }
      ]
    };
  }

  /**
   * Create test server instance
   */
  static async createTestServer(serverFactory: () => Promise<FastifyInstance>) {
    const server = await serverFactory();
    return server;
  }

  /**
   * Simulate file upload
   */
  static createMockFile(
    content: string = 'Test document content',
    filename: string = 'test-document.txt',
    mimetype: string = 'text/plain'
  ) {
    return {
      buffer: Buffer.from(content),
      filename,
      mimetype,
      encoding: '7bit',
      fieldname: 'file'
    };
  }
}

// Export singleton instance for convenience
export const testHelpers = new TestHelpers();