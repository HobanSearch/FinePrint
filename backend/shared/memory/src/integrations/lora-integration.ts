/**
 * LoRA Integration  
 * Connects with LoRA service for model training from memory data
 */

import { LoRAIntegration, MemorySearchResult } from '../types';
import { Logger } from '../utils/logger';

export class LoRAIntegrationAdapter implements LoRAIntegration {
  private logger: Logger;
  private loraServiceUrl: string;

  constructor(loraServiceUrl: string = 'http://localhost:3003') {
    this.loraServiceUrl = loraServiceUrl;
    this.logger = Logger.getInstance('LoRAIntegration');
  }

  async trainFromMemories(agentId: string, memories: MemorySearchResult[]): Promise<string> {
    try {
      // Prepare training data from memories
      const trainingData = this.prepareTrainingData(memories);
      
      const response = await fetch(
        `${this.loraServiceUrl}/api/v1/training/from-memories`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agentId,
            trainingData,
            config: {
              batchSize: 32,
              learningRate: 1e-4,
              epochs: 3,
              loraRank: 16,
              loraAlpha: 32,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`LoRA service responded with ${response.status}`);
      }

      const result = await response.json();
      const modelId = result.data.modelId;
      
      this.logger.info(`Started LoRA training for agent ${agentId} with ${memories.length} memories, model ID: ${modelId}`);
      
      return modelId;
    } catch (error) {
      this.logger.error(`Failed to start LoRA training for agent ${agentId}:`, error);
      throw error;
    }
  }

  async applyMemoryBasedOptimizations(
    modelId: string, 
    memories: MemorySearchResult[]
  ): Promise<void> {
    try {
      // Extract optimization hints from memories
      const optimizations = this.extractOptimizations(memories);
      
      const response = await fetch(
        `${this.loraServiceUrl}/api/v1/models/${modelId}/apply-optimizations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            optimizations,
            memories: memories.map(memory => ({
              id: memory.id,
              type: memory.type,
              relevance: this.calculateRelevance(memory),
            })),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`LoRA service responded with ${response.status}`);
      }

      this.logger.info(`Applied memory-based optimizations to model ${modelId}`);
    } catch (error) {
      this.logger.error(`Failed to apply optimizations to model ${modelId}:`, error);
      throw error;
    }
  }

  private prepareTrainingData(memories: MemorySearchResult[]): Array<{
    input: string;
    output: string;
    metadata: Record<string, any>;
  }> {
    return memories.map(memory => {
      let input = memory.title;
      let output = '';

      // Prepare training data based on memory type
      switch (memory.type) {
        case 'SEMANTIC':
          input = `What do you know about: ${memory.title}`;
          output = JSON.stringify(memory.content);
          break;
          
        case 'PROCEDURAL':
          input = `How do you ${memory.title.toLowerCase()}?`;
          output = this.formatProceduralMemory(memory.content);
          break;
          
        case 'EPISODIC':
          input = `Describe the experience: ${memory.title}`;
          output = this.formatEpisodicMemory(memory.content);
          break;
          
        case 'BUSINESS':
          input = `Analyze the business data: ${memory.title}`;
          output = this.formatBusinessMemory(memory.content);
          break;
          
        default:
          input = memory.title;
          output = JSON.stringify(memory.content);
      }

      return {
        input,
        output,
        metadata: {
          memoryId: memory.id,
          memoryType: memory.type,
          createdAt: memory.createdAt,
          relevanceScore: this.calculateRelevance(memory),
        },
      };
    });
  }

  private extractOptimizations(memories: MemorySearchResult[]): Record<string, any> {
    const optimizations: Record<string, any> = {
      vocabularyExpansion: [],
      contextualPatterns: [],
      domainSpecificKnowledge: [],
      responsePatterns: [],
    };

    memories.forEach(memory => {
      // Extract vocabulary from memory content
      const vocabulary = this.extractVocabulary(memory);
      optimizations.vocabularyExpansion.push(...vocabulary);

      // Extract contextual patterns
      const patterns = this.extractContextualPatterns(memory);
      optimizations.contextualPatterns.push(...patterns);

      // Extract domain-specific knowledge
      if (memory.metadata.domain) {
        optimizations.domainSpecificKnowledge.push({
          domain: memory.metadata.domain,
          concepts: this.extractConcepts(memory),
        });
      }
    });

    // Deduplicate and rank optimizations
    optimizations.vocabularyExpansion = [...new Set(optimizations.vocabularyExpansion)];
    
    return optimizations;
  }

  private formatProceduralMemory(content: any): string {
    if (content.steps && Array.isArray(content.steps)) {
      return content.steps
        .map((step: any, index: number) => `${index + 1}. ${step.description || step}`)
        .join('\n');
    }
    return JSON.stringify(content);
  }

  private formatEpisodicMemory(content: any): string {
    const parts = [];
    
    if (content.outcome) parts.push(`Outcome: ${content.outcome}`);
    if (content.participants) parts.push(`Participants: ${content.participants.join(', ')}`);
    if (content.duration) parts.push(`Duration: ${content.duration}s`);
    if (content.significance) parts.push(`Significance: ${content.significance}`);
    
    return parts.length > 0 ? parts.join('\n') : JSON.stringify(content);
  }

  private formatBusinessMemory(content: any): string {
    const parts = [];
    
    if (content.kpiValue) parts.push(`KPI Value: ${content.kpiValue}`);
    if (content.trend) parts.push(`Trend: ${content.trend}`);
    if (content.revenueImpact) parts.push(`Revenue Impact: ${content.revenueImpact}`);
    if (content.customerSegment) parts.push(`Customer Segment: ${content.customerSegment}`);
    
    return parts.length > 0 ? parts.join('\n') : JSON.stringify(content);
  }

  private calculateRelevance(memory: MemorySearchResult): number {
    // Simple relevance calculation based on recency and content size
    const age = Date.now() - new Date(memory.createdAt).getTime();
    const ageScore = Math.max(0, 1 - age / (30 * 24 * 60 * 60 * 1000)); // Decay over 30 days
    
    const contentSize = JSON.stringify(memory.content).length;
    const sizeScore = Math.min(1, contentSize / 1000); // Normalize to 1KB
    
    return (ageScore * 0.6 + sizeScore * 0.4);
  }

  private extractVocabulary(memory: MemorySearchResult): string[] {
    const text = `${memory.title} ${JSON.stringify(memory.content)}`.toLowerCase();
    
    // Extract meaningful words (simple implementation)
    return text
      .match(/\b[a-z]{3,}\b/g) || []
      .filter(word => !this.isStopWord(word))
      .slice(0, 20); // Limit to top 20 words
  }

  private extractContextualPatterns(memory: MemorySearchResult): string[] {
    const patterns: string[] = [];
    
    // Extract patterns based on memory type
    if (memory.type === 'PROCEDURAL' && memory.content.steps) {
      patterns.push(`procedural_${memory.content.steps.length}_steps`);
    }
    
    if (memory.type === 'BUSINESS' && memory.content.trend) {
      patterns.push(`business_trend_${memory.content.trend}`);
    }
    
    return patterns;
  }

  private extractConcepts(memory: MemorySearchResult): string[] {
    // Simple concept extraction - in production, this would use NLP
    const concepts: string[] = [];
    
    if (memory.content.concept) {
      concepts.push(memory.content.concept);
    }
    
    if (memory.content.domain) {
      concepts.push(memory.content.domain);
    }
    
    return concepts;
  }

  private isStopWord(word: string): boolean {
    const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'];
    return stopWords.includes(word);
  }
}