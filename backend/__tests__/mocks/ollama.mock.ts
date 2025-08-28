import { jest } from '@jest/globals';
import { OllamaResponse } from '@fineprintai/shared-types';

export class OllamaMock {
  private static instance: OllamaMock;
  private responses: Map<string, OllamaResponse> = new Map();
  private delays: Map<string, number> = new Map();
  private errors: Map<string, Error> = new Map();

  static getInstance(): OllamaMock {
    if (!OllamaMock.instance) {
      OllamaMock.instance = new OllamaMock();
    }
    return OllamaMock.instance;
  }

  /**
   * Mock a specific model response
   */
  mockModelResponse(model: string, response: Partial<OllamaResponse>) {
    const fullResponse: OllamaResponse = {
      model,
      response: 'Mock response',
      done: true,
      context: [1, 2, 3],
      total_duration: 5000000,
      load_duration: 1000000,
      prompt_eval_count: 10,
      prompt_eval_duration: 2000000,
      eval_count: 20,
      eval_duration: 2000000,
      ...response
    };
    
    this.responses.set(model, fullResponse);
  }

  /**
   * Mock response delay for a model
   */
  mockDelay(model: string, delayMs: number) {
    this.delays.set(model, delayMs);
  }

  /**
   * Mock error for a model
   */
  mockError(model: string, error: Error) {
    this.errors.set(model, error);
  }

  /**
   * Clear all mocks
   */
  clearMocks() {
    this.responses.clear();
    this.delays.clear();
    this.errors.clear();
  }

  /**
   * Get mock response for model
   */
  async getMockResponse(model: string, prompt: string): Promise<OllamaResponse> {
    // Check for errors first
    if (this.errors.has(model)) {
      throw this.errors.get(model);
    }

    // Apply delay if set
    const delay = this.delays.get(model);
    if (delay) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Return mock response or default
    return this.responses.get(model) || {
      model,
      response: `Mock response for prompt: ${prompt.substring(0, 50)}...`,
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
   * Mock analysis responses for different document types
   */
  setupAnalysisMocks() {
    // Contract analysis mock
    this.mockModelResponse('mistral:7b', {
      model: 'mistral:7b',
      response: JSON.stringify({
        riskScore: 7.5,
        summary: 'This contract contains several medium-risk clauses that require attention.',
        findings: [
          {
            category: 'liability',
            title: 'Broad Liability Exclusion',
            severity: 'medium',
            confidence: 0.9,
            excerpt: 'Company shall not be liable for any damages...',
            recommendation: 'Negotiate for narrower exclusions'
          }
        ]
      })
    });

    // Terms of Service analysis mock
    this.mockModelResponse('phi-2:2.7b', {
      model: 'phi-2:2.7b',
      response: JSON.stringify({
        riskScore: 5.2,
        summary: 'Standard terms of service with moderate risk profile.',
        findings: [
          {
            category: 'data-usage',
            title: 'Broad Data Collection',
            severity: 'low',
            confidence: 0.8,
            excerpt: 'We may collect and use your personal information...',
            recommendation: 'Review data collection practices'
          }
        ]
      })
    });

    // Privacy Policy analysis mock
    this.mockModelResponse('neural-chat:7b', {
      model: 'neural-chat:7b',
      response: JSON.stringify({
        riskScore: 4.1,
        summary: 'Privacy policy follows standard practices with good transparency.',
        findings: [
          {
            category: 'data-retention',
            title: 'Indefinite Data Retention',
            severity: 'low',
            confidence: 0.7,
            excerpt: 'We retain your data for as long as necessary...',
            recommendation: 'Specify data retention periods'
          }
        ]
      })
    });
  }
}

// Create the singleton instance
export const ollamaMock = OllamaMock.getInstance();

// Jest mock for the Ollama service
export const createOllamaMock = () => {
  return {
    generate: jest.fn().mockImplementation(async (model: string, prompt: string) => {
      return await ollamaMock.getMockResponse(model, prompt);
    }),
    
    listModels: jest.fn().mockResolvedValue({
      models: [
        { name: 'mistral:7b', size: 4.1e9 },
        { name: 'phi-2:2.7b', size: 1.7e9 },
        { name: 'neural-chat:7b', size: 4.1e9 }
      ]
    }),
    
    pullModel: jest.fn().mockResolvedValue({ status: 'success' }),
    
    deleteModel: jest.fn().mockResolvedValue({ status: 'success' }),
    
    isModelAvailable: jest.fn().mockResolvedValue(true),
    
    getModelInfo: jest.fn().mockImplementation((model: string) => ({
      name: model,
      size: 4.1e9,
      digest: 'mock-digest',
      details: {
        format: 'gguf',
        family: 'llama',
        families: ['llama'],
        parameter_size: '7B',
        quantization_level: 'Q4_0'
      }
    }))
  };
};