/**
 * DSPy Integration
 * Connects with DSPy service for prompt optimization using memory patterns
 */

import { DSPyIntegration, MemorySearchResult } from '../types';
import { Logger } from '../utils/logger';

export class DSPyIntegrationAdapter implements DSPyIntegration {
  private logger: Logger;
  private dspyServiceUrl: string;

  constructor(dspyServiceUrl: string = 'http://localhost:3002') {
    this.dspyServiceUrl = dspyServiceUrl;
    this.logger = Logger.getInstance('DSPyIntegration');
  }

  async optimizeMemoryPrompts(memories: MemorySearchResult[]): Promise<string[]> {
    try {
      const response = await fetch(
        `${this.dspyServiceUrl}/api/v1/optimize/memory-prompts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            memories: memories.map(memory => ({
              id: memory.id,
              type: memory.type,
              title: memory.title,
              content: memory.content,
              metadata: memory.metadata,
            })),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`DSPy service responded with ${response.status}`);
      }

      const result = await response.json();
      this.logger.debug(`Optimized prompts for ${memories.length} memories`);
      
      return result.data.optimizedPrompts || [];
    } catch (error) {
      this.logger.error('Failed to optimize memory prompts:', error);
      
      // Return basic prompts on failure
      return memories.map(memory => 
        `Analyze the following ${memory.type.toLowerCase()} memory: ${memory.title}`
      );
    }
  }

  async extractMemoryPatterns(memories: MemorySearchResult[]): Promise<Record<string, any>> {
    try {
      const response = await fetch(
        `${this.dspyServiceUrl}/api/v1/analyze/memory-patterns`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            memories: memories.map(memory => ({
              id: memory.id,
              type: memory.type,
              title: memory.title,
              content: memory.content,
              createdAt: memory.createdAt,
            })),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`DSPy service responded with ${response.status}`);
      }

      const result = await response.json();
      this.logger.debug(`Extracted patterns from ${memories.length} memories`);
      
      return result.data.patterns || {};
    } catch (error) {
      this.logger.error('Failed to extract memory patterns:', error);
      
      // Return basic pattern analysis on failure
      return {
        commonThemes: [],
        temporalPatterns: {},
        typeDistribution: this.analyzeTypeDistribution(memories),
        averageContentLength: this.calculateAverageContentLength(memories),
      };
    }
  }

  private analyzeTypeDistribution(memories: MemorySearchResult[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    memories.forEach(memory => {
      distribution[memory.type] = (distribution[memory.type] || 0) + 1;
    });
    
    return distribution;
  }

  private calculateAverageContentLength(memories: MemorySearchResult[]): number {
    if (memories.length === 0) return 0;
    
    const totalLength = memories.reduce((sum, memory) => {
      return sum + JSON.stringify(memory.content).length;
    }, 0);
    
    return Math.round(totalLength / memories.length);
  }
}