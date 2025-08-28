#!/usr/bin/env node

/**
 * Integration Test Script for Fine Print AI Analysis System
 * 
 * This script performs basic integration testing to validate that all services
 * work together correctly and can achieve the target performance metrics.
 */

import { integrationService } from './services/integration';
import { createServiceLogger } from '@fineprintai/shared-logger';

const logger = createServiceLogger('integration-test');

interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  message: string;
  details?: any;
}

class IntegrationTester {
  private results: TestResult[] = [];
  private startTime: Date;

  constructor() {
    this.startTime = new Date();
  }

  async runAllTests(): Promise<void> {
    logger.info('Starting Fine Print AI Integration Tests');
    
    try {
      // Test 1: System Initialization
      await this.testSystemInitialization();
      
      // Test 2: Model Management
      await this.testModelManagement();
      
      // Test 3: Text Processing
      await this.testTextProcessing();
      
      // Test 4: Pattern Analysis
      await this.testPatternAnalysis();
      
      // Test 5: Risk Scoring
      await this.testRiskScoring();
      
      // Test 6: Document Analysis (End-to-End)
      await this.testDocumentAnalysis();
      
      // Test 7: Performance Validation
      await this.testPerformanceMetrics();
      
      // Test 8: System Health
      await this.testSystemHealth();
      
      // Generate report
      this.generateReport();
      
    } catch (error) {
      logger.error('Integration testing failed', { error: error.message });
      throw error;
    } finally {
      // Cleanup
      await this.cleanup();
    }
  }

  private async testSystemInitialization(): Promise<void> {
    const testName = 'System Initialization';
    const startTime = Date.now();
    
    try {
      logger.info('Testing system initialization...');
      
      await integrationService.initialize();
      
      const duration = Date.now() - startTime;
      
      // Verify initialization completed in reasonable time
      if (duration > 30000) { // 30 seconds
        throw new Error(`Initialization took too long: ${duration}ms`);
      }
      
      this.results.push({
        testName,
        success: true,
        duration,
        message: `System initialized successfully in ${duration}ms`,
        details: { initializationTime: duration }
      });
      
      logger.info('✅ System initialization test passed');
      
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: Date.now() - startTime,
        message: error.message
      });
      
      logger.error('❌ System initialization test failed', { error: error.message });
    }
  }

  private async testModelManagement(): Promise<void> {
    const testName = 'Model Management';
    const startTime = Date.now();
    
    try {
      logger.info('Testing model management...');
      
      const { modelManager } = integrationService.services;
      
      // Test model availability
      const availableModels = modelManager.getAvailableModels();
      if (availableModels.length === 0) {
        throw new Error('No models available');
      }
      
      // Test model selection
      const selection = modelManager.selectOptimalModel({
        contentLength: 5000,
        priority: 'balanced',
        language: 'en'
      });
      
      if (!selection.model) {
        throw new Error('Model selection failed');
      }
      
      const duration = Date.now() - startTime;
      
      this.results.push({
        testName,
        success: true,
        duration,
        message: `Model management working correctly`,
        details: {
          availableModels: availableModels.length,
          selectedModel: selection.model,
          selectionReason: selection.reason
        }
      });
      
      logger.info('✅ Model management test passed');
      
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: Date.now() - startTime,
        message: error.message
      });
      
      logger.error('❌ Model management test failed', { error: error.message });
    }
  }

  private async testTextProcessing(): Promise<void> {
    const testName = 'Text Processing';
    const startTime = Date.now();
    
    try {
      logger.info('Testing text processing...');
      
      const { textProcessor } = integrationService.services;
      
      const sampleText = `
        PRIVACY POLICY
        
        We collect your personal information including name, email, and usage data.
        We may share this information with third parties for marketing purposes.
        You cannot opt out of data collection.
        We retain your data indefinitely.
        By using our service, you agree to binding arbitration.
      `;
      
      const result = await textProcessor.extractFromBuffer(
        Buffer.from(sampleText, 'utf-8'),
        'test.txt',
        { documentType: 'privacy-policy', language: 'en' }
      );
      
      // Validate extraction
      if (!result.content || result.content.length === 0) {
        throw new Error('Text extraction failed');
      }
      
      if (result.chunks.length === 0) {
        throw new Error('Text chunking failed');
      }
      
      const duration = Date.now() - startTime;
      
      this.results.push({
        testName,
        success: true,
        duration,
        message: `Text processing completed successfully`,
        details: {
          contentLength: result.content.length,
          chunksCount: result.chunks.length,
          wordCount: result.metadata.wordCount,
          detectedType: result.metadata.documentType
        }
      });
      
      logger.info('✅ Text processing test passed');
      
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: Date.now() - startTime,
        message: error.message
      });
      
      logger.error('❌ Text processing test failed', { error: error.message });
    }
  }

  private async testPatternAnalysis(): Promise<void> {
    const testName = 'Pattern Analysis';
    const startTime = Date.now();
    
    try {
      logger.info('Testing pattern analysis...');
      
      const { patternLibrary } = integrationService.services;
      
      const sampleText = `
        We collect your personal information including name, email, and usage data.
        We may share this information with third parties for marketing purposes.
        You cannot opt out of data collection.
        We retain your data indefinitely.
        By using our service, you agree to binding arbitration.
        We are not liable for any damages of any kind.
        We may change these terms at any time without notice.
        Your account may be terminated without reason.
      `;
      
      const result = await patternLibrary.analyzeText(sampleText);
      
      // Validate pattern detection
      if (result.totalMatches === 0) {
        throw new Error('Pattern analysis failed to detect any issues');
      }
      
      if (result.riskScore === 0) {
        throw new Error('Risk score calculation failed');
      }
      
      // Should detect multiple categories
      if (Object.keys(result.categorizedMatches).length < 2) {
        throw new Error('Pattern analysis should detect multiple categories');
      }
      
      const duration = Date.now() - startTime;
      
      this.results.push({
        testName,
        success: true,
        duration,
        message: `Pattern analysis completed successfully`,
        details: {
          totalMatches: result.totalMatches,
          riskScore: result.riskScore,
          categories: Object.keys(result.categorizedMatches),
          highestSeverity: result.highestSeverity
        }
      });
      
      logger.info('✅ Pattern analysis test passed');
      
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: Date.now() - startTime,
        message: error.message
      });
      
      logger.error('❌ Pattern analysis test failed', { error: error.message });
    }
  }

  private async testRiskScoring(): Promise<void> {
    const testName = 'Risk Scoring';
    const startTime = Date.now();
    
    try {
      logger.info('Testing risk scoring...');
      
      const { patternLibrary, riskScoringEngine } = integrationService.services;
      
      const sampleText = `
        We collect unlimited personal data.
        We share information with third parties.
        We are not liable for any damages.
        Terms may change without notice.
        Account termination without reason.
        Binding arbitration required.
      `;
      
      const patternResult = await patternLibrary.analyzeText(sampleText);
      const riskAssessment = await riskScoringEngine.calculateRiskScore(
        patternResult,
        { type: 'privacy-policy', wordCount: 100, language: 'en' }
      );
      
      // Validate risk assessment
      if (riskAssessment.overallScore < 0 || riskAssessment.overallScore > 100) {
        throw new Error('Invalid risk score range');
      }
      
      if (!riskAssessment.riskLevel) {
        throw new Error('Risk level not determined');
      }
      
      if (riskAssessment.factors.length === 0) {
        throw new Error('No risk factors identified');
      }
      
      // Should be high risk given the problematic clauses
      if (riskAssessment.overallScore < 50) {
        throw new Error('Risk score too low for problematic document');
      }
      
      const duration = Date.now() - startTime;
      
      this.results.push({
        testName,
        success: true,
        duration,
        message: `Risk scoring completed successfully`,
        details: {
          overallScore: riskAssessment.overallScore,
          riskLevel: riskAssessment.riskLevel,
          confidence: riskAssessment.confidence,
          factorsCount: riskAssessment.factors.length,
          recommendations: riskAssessment.recommendations.length
        }
      });
      
      logger.info('✅ Risk scoring test passed');
      
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: Date.now() - startTime,
        message: error.message
      });
      
      logger.error('❌ Risk scoring test failed', { error: error.message });
    }
  }

  private async testDocumentAnalysis(): Promise<void> {
    const testName = 'End-to-End Document Analysis';
    const startTime = Date.now();
    
    try {
      logger.info('Testing end-to-end document analysis...');
      
      const sampleDocument = `
        PRIVACY POLICY - ACME CORPORATION
        
        Last updated: January 1, 2024
        
        INFORMATION WE COLLECT
        We collect all information you provide to us through any means, including:
        - Personal information (name, email, phone number, address)
        - Usage data and analytics
        - Location data from your device
        - Biometric data including facial recognition patterns
        
        HOW WE USE YOUR INFORMATION  
        We may use your information for any business purpose, including:
        - Providing and improving our services
        - Marketing and advertising (including sharing with partners)
        - Legal compliance and protection
        - Any other purpose we deem necessary
        
        INFORMATION SHARING
        We may share your personal information with third parties, including:
        - Business partners and affiliates
        - Service providers and contractors  
        - Government agencies when required
        - Anyone else at our sole discretion
        
        DATA RETENTION
        We will retain your information for as long as necessary for our business purposes.
        Complete deletion is not guaranteed even after account termination.
        
        YOUR RIGHTS
        You have limited rights regarding your personal information.
        Data export functionality is not available to users.
        Some information will be retained even after deletion requests.
        
        DISPUTE RESOLUTION
        All disputes must be resolved through binding arbitration.
        You waive your right to participate in any class action lawsuit.
        
        CHANGES TO THIS POLICY
        We may change this policy at any time without prior notice.
        Changes will apply retroactively to all past usage.
        
        LIABILITY
        We are not liable for any damages of any kind arising from use of our service.
        You agree to indemnify us against any claims.
        
        TERMINATION
        We may terminate your account at any time for any reason or no reason.
        No refunds will be provided upon termination.
      `;
      
      const analysisRequest = {
        content: sampleDocument,
        documentId: 'test-doc-123',
        analysisId: 'test-analysis-123',
        userId: 'test-user-123',
        options: {
          documentType: 'privacy-policy',
          language: 'en',
          modelPreference: 'balanced' as const,
          includeEmbeddings: false,
          includeSimilarDocuments: false
        }
      };
      
      // Start analysis
      const jobId = await integrationService.analyzeDocument(analysisRequest);
      
      if (!jobId) {
        throw new Error('Failed to queue analysis job');
      }
      
      // Wait for completion (with timeout)
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max
      let status: any;
      
      while (attempts < maxAttempts) {
        status = await integrationService.getAnalysisStatus(
          analysisRequest.analysisId,
          analysisRequest.userId
        );
        
        if (status.status === 'completed') {
          break;
        } else if (status.status === 'failed') {
          throw new Error(`Analysis failed: ${status.error}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        throw new Error('Analysis timed out');
      }
      
      // Validate results
      const result = status.result;
      if (!result) {
        throw new Error('No analysis result returned');
      }
      
      if (result.overallRiskScore < 70) {
        throw new Error(`Risk score too low for highly problematic document: ${result.overallRiskScore}`);
      }
      
      if (result.findings.length < 5) {
        throw new Error(`Too few findings detected: ${result.findings.length}`);
      }
      
      const duration = Date.now() - startTime;
      
      // Validate performance target: < 5 seconds
      if (duration > 5000) {
        logger.warn(`Analysis took longer than target: ${duration}ms`);
      }
      
      this.results.push({
        testName,
        success: true,
        duration,
        message: `End-to-end analysis completed successfully`,
        details: {
          processingTime: duration,
          overallRiskScore: result.overallRiskScore,
          riskLevel: result.riskLevel,
          findingsCount: result.findings.length,
          confidence: result.confidence,
          modelUsed: result.modelUsed,
          meetsPerformanceTarget: duration < 5000
        }
      });
      
      logger.info('✅ End-to-end document analysis test passed');
      
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: Date.now() - startTime,
        message: error.message
      });
      
      logger.error('❌ End-to-end document analysis test failed', { error: error.message });
    }
  }

  private async testPerformanceMetrics(): Promise<void> {
    const testName = 'Performance Metrics';
    const startTime = Date.now();
    
    try {
      logger.info('Testing performance metrics...');
      
      const stats = await integrationService.getSystemStatistics();
      
      // Validate statistics
      if (!stats.analysis) {
        throw new Error('Analysis statistics not available');
      }
      
      if (!stats.queue) {
        throw new Error('Queue statistics not available');
      }
      
      if (!stats.models) {
        throw new Error('Model statistics not available'); 
      }
      
      // Check for reasonable queue performance
      if (stats.queue.currentLoad > 1.0) {
        throw new Error('Queue overloaded');
      }
      
      const duration = Date.now() - startTime;
      
      this.results.push({
        testName,
        success: true,
        duration,
        message: `Performance metrics collection successful`,
        details: {
          analysisStats: stats.analysis,
          queueLoad: stats.queue.currentLoad,
          availableModels: Object.keys(stats.models).length
        }
      });
      
      logger.info('✅ Performance metrics test passed');
      
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: Date.now() - startTime,
        message: error.message
      });
      
      logger.error('❌ Performance metrics test failed', { error: error.message });
    }
  }

  private async testSystemHealth(): Promise<void> {
    const testName = 'System Health';
    const startTime = Date.now();
    
    try {
      logger.info('Testing system health...');
      
      const healthStatus = await integrationService.getSystemStatus();
      
      // Validate health status
      if (!healthStatus.overall) {
        throw new Error('Overall health status not available');
      }
      
      if (healthStatus.services.length === 0) {
        throw new Error('No service health information available');
      }
      
      // Check for any unhealthy services
      const unhealthyServices = healthStatus.services.filter(s => s.status === 'unhealthy');
      if (unhealthyServices.length > 0) {
        throw new Error(`Unhealthy services detected: ${unhealthyServices.map(s => s.service).join(', ')}`);
      }
      
      const duration = Date.now() - startTime;
      
      this.results.push({
        testName,
        success: true,
        duration,
        message: `System health check passed`,
        details: {
          overallStatus: healthStatus.overall,
          servicesCount: healthStatus.services.length,
          healthyServices: healthStatus.services.filter(s => s.status === 'healthy').length,
          degradedServices: healthStatus.services.filter(s => s.status === 'degraded').length,
          uptime: healthStatus.uptime
        }
      });
      
      logger.info('✅ System health test passed');
      
    } catch (error) {
      this.results.push({
        testName,
        success: false,
        duration: Date.now() - startTime,
        message: error.message
      });
      
      logger.error('❌ System health test failed', { error: error.message });
    }
  }

  private generateReport(): void {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = Date.now() - this.startTime.getTime();
    
    logger.info('='.repeat(80));
    logger.info('FINE PRINT AI INTEGRATION TEST REPORT');
    logger.info('='.repeat(80));
    logger.info(`Total Tests: ${totalTests}`);
    logger.info(`Passed: ${passedTests}`);
    logger.info(`Failed: ${failedTests}`);
    logger.info(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    logger.info(`Total Duration: ${totalDuration}ms`);
    logger.info('');
    
    // Individual test results
    this.results.forEach(result => {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      logger.info(`${status} ${result.testName} (${result.duration}ms)`);
      logger.info(`   ${result.message}`);
      
      if (result.details) {
        logger.info(`   Details: ${JSON.stringify(result.details, null, 2)}`);
      }
      logger.info('');
    });
    
    // Performance assessment
    const analysisTest = this.results.find(r => r.testName === 'End-to-End Document Analysis');
    if (analysisTest && analysisTest.success) {
      const meetsTarget = analysisTest.duration < 5000;
      logger.info(`Performance Target (<5s): ${meetsTarget ? '✅ MET' : '❌ NOT MET'}`);
      logger.info(`Actual Time: ${analysisTest.duration}ms`);
    }
    
    logger.info('='.repeat(80));
    
    if (failedTests === 0) {
      logger.info('🎉 ALL TESTS PASSED - SYSTEM READY FOR PRODUCTION');
    } else {
      logger.error(`⚠️  ${failedTests} TEST(S) FAILED - REVIEW REQUIRED`);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      logger.info('Cleaning up test environment...');
      await integrationService.shutdown();
      logger.info('✅ Cleanup completed');
    } catch (error) {
      logger.error('❌ Cleanup failed', { error: error.message });
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
  const tester = new IntegrationTester();
  
  tester.runAllTests()
    .then(() => {
      logger.info('Integration testing completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Integration testing failed', { error: error.message });
      process.exit(1);
    });
}

export { IntegrationTester };