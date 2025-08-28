#!/usr/bin/env ts-node

/**
 * Test script for Business Agent Integration
 * Demonstrates the digital twin system with real Ollama models
 */

import axios from 'axios';
import WebSocket from 'ws';
import { logger } from '../src/utils/logger';

const API_URL = process.env.API_URL || 'http://localhost:3020';
const WS_URL = process.env.WS_URL || 'ws://localhost:3020/ws';

interface TestResult {
  test: string;
  success: boolean;
  duration: number;
  result?: any;
  error?: string;
}

class BusinessAgentTester {
  private results: TestResult[] = [];
  private ws: WebSocket | null = null;

  /**
   * Test agent connectivity
   */
  async testAgentConnectivity(): Promise<TestResult> {
    const startTime = Date.now();
    const test = 'Agent Connectivity';

    try {
      logger.info(`Testing ${test}...`);

      // Test each agent type
      const agentTypes: Array<'marketing' | 'sales' | 'support' | 'analytics'> = [
        'marketing', 'sales', 'support', 'analytics'
      ];

      const results = await Promise.all(
        agentTypes.map(async (type) => {
          const response = await axios.post(`${API_URL}/agents/test`, {
            type,
            prompt: `Test prompt for ${type} agent`,
            context: {
              test: true,
              timestamp: new Date()
            }
          });
          return { type, response: response.data };
        })
      );

      const allSuccess = results.every(r => r.response.success);

      return {
        test,
        success: allSuccess,
        duration: Date.now() - startTime,
        result: results
      };
    } catch (error: any) {
      return {
        test,
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Test marketing A/B experiment
   */
  async testMarketingExperiment(): Promise<TestResult> {
    const startTime = Date.now();
    const test = 'Marketing A/B Experiment';

    try {
      logger.info(`Starting ${test}...`);

      const response = await axios.post(`${API_URL}/experiments/marketing`, {
        duration: 1, // 1 day simulation
        variants: ['control', 'personalized']
      });

      return {
        test,
        success: response.data.success,
        duration: Date.now() - startTime,
        result: response.data.result
      };
    } catch (error: any) {
      return {
        test,
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Test sales qualification experiment
   */
  async testSalesExperiment(): Promise<TestResult> {
    const startTime = Date.now();
    const test = 'Sales Qualification Experiment';

    try {
      logger.info(`Starting ${test}...`);

      const response = await axios.post(`${API_URL}/experiments/sales`, {
        duration: 2 // 2 days simulation
      });

      return {
        test,
        success: response.data.success,
        duration: Date.now() - startTime,
        result: response.data.result
      };
    } catch (error: any) {
      return {
        test,
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Test support quality experiment
   */
  async testSupportExperiment(): Promise<TestResult> {
    const startTime = Date.now();
    const test = 'Support Quality Experiment';

    try {
      logger.info(`Starting ${test}...`);

      const response = await axios.post(`${API_URL}/experiments/support`, {
        duration: 1 // 1 day simulation
      });

      return {
        test,
        success: response.data.success,
        duration: Date.now() - startTime,
        result: response.data.result
      };
    } catch (error: any) {
      return {
        test,
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Test environment simulation with real models
   */
  async testEnvironmentSimulation(): Promise<TestResult> {
    const startTime = Date.now();
    const test = 'Environment Simulation with Real Models';

    try {
      logger.info(`Starting ${test}...`);

      // Create environment
      const envResponse = await axios.post(`${API_URL}/environments`, {
        name: 'Test Environment',
        type: 'INTEGRATED',
        parameters: {
          marketSize: 10000,
          competitorCount: 3,
          seasonality: { type: 'none', factors: [] },
          economicConditions: {
            growth: 0.05,
            volatility: 0.2,
            consumerConfidence: 0.7
          },
          customerSegments: [
            {
              id: 'test-segment',
              name: 'Test Segment',
              size: 1000,
              growthRate: 0.1,
              priceSensitivity: 0.5,
              qualitySensitivity: 0.7,
              brandLoyalty: 0.6,
              churnRate: 0.1,
              averageLifetimeValue: 5000
            }
          ],
          productOfferings: [
            {
              id: 'test-product',
              name: 'Test Product',
              tier: 'professional',
              price: 299,
              features: ['Feature 1', 'Feature 2'],
              targetSegments: ['test-segment']
            }
          ],
          pricingStrategy: {
            type: 'fixed',
            discountPolicy: {
              volumeDiscounts: [],
              seasonalDiscounts: [],
              loyaltyDiscounts: []
            },
            promotions: []
          }
        }
      });

      const environmentId = envResponse.data.environment.id;

      // Start simulation with real models
      const simResponse = await axios.post(`${API_URL}/environments/${environmentId}/simulate`, {
        duration: 1, // 1 day
        speed: 100, // 100x speed
        models: [
          {
            id: 'marketing-v1',
            type: 'marketing',
            version: 'fine-print-marketing:latest',
            parameters: {},
            allocationPercent: 100
          },
          {
            id: 'sales-v1',
            type: 'sales',
            version: 'fine-print-sales:latest',
            parameters: {},
            allocationPercent: 100
          },
          {
            id: 'support-v1',
            type: 'support',
            version: 'fine-print-customer:latest',
            parameters: {},
            allocationPercent: 100
          }
        ]
      });

      // Wait for simulation to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Get results
      const resultsResponse = await axios.get(`${API_URL}/environments/${environmentId}`);

      return {
        test,
        success: simResponse.data.success,
        duration: Date.now() - startTime,
        result: resultsResponse.data
      };
    } catch (error: any) {
      return {
        test,
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Test WebSocket real-time updates
   */
  async testWebSocketUpdates(): Promise<TestResult> {
    const startTime = Date.now();
    const test = 'WebSocket Real-time Updates';

    return new Promise((resolve) => {
      try {
        logger.info(`Testing ${test}...`);

        const messages: any[] = [];
        this.ws = new WebSocket(WS_URL);

        this.ws.on('open', () => {
          logger.info('WebSocket connected');
          
          // Subscribe to experiment updates
          this.ws!.send(JSON.stringify({
            type: 'subscribe:experiments'
          }));
        });

        this.ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          messages.push(message);
          logger.info(`Received WebSocket message: ${message.type}`);
        });

        this.ws.on('error', (error) => {
          resolve({
            test,
            success: false,
            duration: Date.now() - startTime,
            error: error.message
          });
        });

        // Wait for some messages then close
        setTimeout(() => {
          if (this.ws) {
            this.ws.close();
          }
          
          resolve({
            test,
            success: messages.length > 0,
            duration: Date.now() - startTime,
            result: {
              messageCount: messages.length,
              messageTypes: [...new Set(messages.map(m => m.type))]
            }
          });
        }, 3000);

      } catch (error: any) {
        resolve({
          test,
          success: false,
          duration: Date.now() - startTime,
          error: error.message
        });
      }
    });
  }

  /**
   * Test agent performance metrics
   */
  async testPerformanceMetrics(): Promise<TestResult> {
    const startTime = Date.now();
    const test = 'Agent Performance Metrics';

    try {
      logger.info(`Testing ${test}...`);

      const response = await axios.get(`${API_URL}/agents/performance`);

      return {
        test,
        success: response.data.success,
        duration: Date.now() - startTime,
        result: response.data.performance
      };
    } catch (error: any) {
      return {
        test,
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    logger.info('Starting Business Agent Integration Tests');
    logger.info('=' .repeat(50));

    // Test connectivity first
    this.results.push(await this.testAgentConnectivity());
    
    // Run experiments in parallel for efficiency
    const experimentTests = await Promise.all([
      this.testMarketingExperiment(),
      this.testSalesExperiment(),
      this.testSupportExperiment()
    ]);
    this.results.push(...experimentTests);

    // Test environment simulation
    this.results.push(await this.testEnvironmentSimulation());

    // Test WebSocket
    this.results.push(await this.testWebSocketUpdates());

    // Test performance metrics
    this.results.push(await this.testPerformanceMetrics());

    // Print results
    this.printResults();
  }

  /**
   * Print test results
   */
  private printResults(): void {
    logger.info('\n' + '=' .repeat(50));
    logger.info('TEST RESULTS');
    logger.info('=' .repeat(50));

    let totalTests = this.results.length;
    let passedTests = this.results.filter(r => r.success).length;

    this.results.forEach((result) => {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      logger.info(`${status} | ${result.test} (${result.duration}ms)`);
      
      if (!result.success && result.error) {
        logger.error(`  Error: ${result.error}`);
      }
      
      if (result.success && result.result) {
        logger.info(`  Result: ${JSON.stringify(result.result, null, 2).substring(0, 200)}...`);
      }
    });

    logger.info('=' .repeat(50));
    logger.info(`SUMMARY: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      logger.info('🎉 All tests passed! Business agents are properly integrated.');
    } else {
      logger.warn('⚠️ Some tests failed. Please check the errors above.');
    }
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Main execution
async function main() {
  const tester = new BusinessAgentTester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    logger.error('Test execution failed:', error);
  } finally {
    tester.cleanup();
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { BusinessAgentTester };