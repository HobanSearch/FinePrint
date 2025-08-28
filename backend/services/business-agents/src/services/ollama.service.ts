/**
 * Ollama Service for Business Agent Models
 */

import { Ollama } from 'ollama';
import pRetry from 'p-retry';
import { config } from '../config';
import { AgentType } from '../types';
import { logger } from '../utils/logger';

export class OllamaService {
  private ollama: Ollama;
  private models: Map<AgentType, string>;

  constructor() {
    this.ollama = new Ollama({
      host: config.ollama.host
    });

    this.models = new Map([
      [AgentType.MARKETING, config.ollama.models.marketing],
      [AgentType.SALES, config.ollama.models.sales],
      [AgentType.SUPPORT, config.ollama.models.support],
      [AgentType.ANALYTICS, config.ollama.models.analytics]
    ]);

    this.initializeModels();
  }

  private async initializeModels(): Promise<void> {
    try {
      const availableModels = await this.ollama.list();
      const modelNames = availableModels.models.map(m => m.name);

      for (const [agentType, modelName] of this.models.entries()) {
        if (!modelNames.includes(modelName)) {
          logger.warn(`Model ${modelName} for ${agentType} agent not found in Ollama`);
        } else {
          logger.info(`Model ${modelName} for ${agentType} agent is available`);
        }
      }
    } catch (error) {
      logger.error('Failed to initialize Ollama models:', error);
    }
  }

  async generate(
    agentType: AgentType,
    prompt: string,
    systemPrompt?: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      format?: 'json';
    }
  ): Promise<string> {
    const modelName = this.models.get(agentType);
    if (!modelName) {
      throw new Error(`No model configured for agent type: ${agentType}`);
    }

    const generateFn = async () => {
      const startTime = Date.now();
      
      try {
        const response = await this.ollama.generate({
          model: modelName,
          prompt,
          system: systemPrompt,
          options: {
            temperature: options?.temperature ?? config.ollama.temperature,
            num_predict: options?.maxTokens ?? config.ollama.maxTokens
          },
          format: options?.format
        });

        const duration = Date.now() - startTime;
        
        logger.info({
          agentType,
          model: modelName,
          duration,
          tokensGenerated: response.eval_count,
          msg: 'Generation completed'
        });

        return response.response;
      } catch (error) {
        logger.error({
          agentType,
          model: modelName,
          error,
          msg: 'Generation failed'
        });
        throw error;
      }
    };

    return pRetry(generateFn, {
      retries: config.ollama.maxRetries,
      onFailedAttempt: (error) => {
        logger.warn({
          attempt: error.attemptNumber,
          retriesLeft: error.retriesLeft,
          error: error.message,
          msg: 'Retrying Ollama generation'
        });
      }
    });
  }

  async chat(
    agentType: AgentType,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    const modelName = this.models.get(agentType);
    if (!modelName) {
      throw new Error(`No model configured for agent type: ${agentType}`);
    }

    const chatFn = async () => {
      const startTime = Date.now();
      
      try {
        const response = await this.ollama.chat({
          model: modelName,
          messages,
          options: {
            temperature: options?.temperature ?? config.ollama.temperature,
            num_predict: options?.maxTokens ?? config.ollama.maxTokens
          }
        });

        const duration = Date.now() - startTime;
        
        logger.info({
          agentType,
          model: modelName,
          duration,
          messageCount: messages.length,
          msg: 'Chat completed'
        });

        return response.message.content;
      } catch (error) {
        logger.error({
          agentType,
          model: modelName,
          error,
          msg: 'Chat failed'
        });
        throw error;
      }
    };

    return pRetry(chatFn, {
      retries: config.ollama.maxRetries,
      onFailedAttempt: (error) => {
        logger.warn({
          attempt: error.attemptNumber,
          retriesLeft: error.retriesLeft,
          error: error.message,
          msg: 'Retrying Ollama chat'
        });
      }
    });
  }

  async embeddings(
    agentType: AgentType,
    prompt: string
  ): Promise<number[]> {
    const modelName = this.models.get(agentType);
    if (!modelName) {
      throw new Error(`No model configured for agent type: ${agentType}`);
    }

    try {
      const response = await this.ollama.embeddings({
        model: modelName,
        prompt
      });

      return response.embedding;
    } catch (error) {
      logger.error({
        agentType,
        model: modelName,
        error,
        msg: 'Embeddings generation failed'
      });
      throw error;
    }
  }

  async getModelInfo(agentType: AgentType): Promise<any> {
    const modelName = this.models.get(agentType);
    if (!modelName) {
      throw new Error(`No model configured for agent type: ${agentType}`);
    }

    try {
      const info = await this.ollama.show({
        model: modelName
      });

      return {
        name: modelName,
        ...info
      };
    } catch (error) {
      logger.error({
        agentType,
        model: modelName,
        error,
        msg: 'Failed to get model info'
      });
      throw error;
    }
  }

  async pullModel(agentType: AgentType): Promise<void> {
    const modelName = this.models.get(agentType);
    if (!modelName) {
      throw new Error(`No model configured for agent type: ${agentType}`);
    }

    try {
      logger.info(`Pulling model ${modelName} for ${agentType} agent`);
      
      await this.ollama.pull({
        model: modelName
      });

      logger.info(`Successfully pulled model ${modelName}`);
    } catch (error) {
      logger.error({
        agentType,
        model: modelName,
        error,
        msg: 'Failed to pull model'
      });
      throw error;
    }
  }

  async testModel(agentType: AgentType): Promise<boolean> {
    try {
      const response = await this.generate(
        agentType,
        'Test prompt: Please respond with "OK"',
        'You are a test assistant. Respond only with "OK".'
      );

      return response.toLowerCase().includes('ok');
    } catch (error) {
      logger.error({
        agentType,
        error,
        msg: 'Model test failed'
      });
      return false;
    }
  }
}

export const ollamaService = new OllamaService();