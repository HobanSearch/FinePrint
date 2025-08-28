/**
 * Knowledge Graph Integration
 * Connects with Knowledge Graph service for relationship management
 */

import { KnowledgeGraphIntegration, MemorySearchResult } from '../types';
import { Logger } from '../utils/logger';

export class KnowledgeGraphIntegrationAdapter implements KnowledgeGraphIntegration {
  private logger: Logger;
  private knowledgeGraphUrl: string;

  constructor(knowledgeGraphUrl: string = 'http://localhost:3004') {
    this.knowledgeGraphUrl = knowledgeGraphUrl;
    this.logger = Logger.getInstance('KnowledgeGraphIntegration');
  }

  async createMemoryRelations(
    memoryId: string, 
    content: Record<string, any>
  ): Promise<void> {
    try {
      // Extract entities and relationships from memory content
      const entities = this.extractEntities(content);
      const relationships = this.extractRelationships(content);

      const response = await fetch(
        `${this.knowledgeGraphUrl}/api/v1/memories/${memoryId}/relations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            entities,
            relationships,
            memoryId,
            content,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Knowledge Graph service responded with ${response.status}`);
      }

      this.logger.debug(`Created relations for memory ${memoryId}: ${entities.length} entities, ${relationships.length} relationships`);
    } catch (error) {
      this.logger.error(`Failed to create memory relations for ${memoryId}:`, error);
      // Don't throw - this is not critical for memory functionality
    }
  }

  async findRelatedConcepts(concept: string): Promise<string[]> {
    try {
      const response = await fetch(
        `${this.knowledgeGraphUrl}/api/v1/concepts/${encodeURIComponent(concept)}/related`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Knowledge Graph service responded with ${response.status}`);
      }

      const result = await response.json();
      const relatedConcepts = result.data.concepts || [];
      
      this.logger.debug(`Found ${relatedConcepts.length} related concepts for: ${concept}`);
      
      return relatedConcepts;
    } catch (error) {
      this.logger.error(`Failed to find related concepts for ${concept}:`, error);
      return [];
    }
  }

  async updateConceptGraph(memories: MemorySearchResult[]): Promise<void> {
    try {
      // Batch update concept graph with multiple memories
      const conceptData = memories.map(memory => ({
        memoryId: memory.id,
        type: memory.type,
        title: memory.title,
        content: memory.content,
        entities: this.extractEntities(memory.content),
        concepts: this.extractConcepts(memory.content),
        createdAt: memory.createdAt,
      }));

      const response = await fetch(
        `${this.knowledgeGraphUrl}/api/v1/concepts/batch-update`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            memories: conceptData,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Knowledge Graph service responded with ${response.status}`);
      }

      this.logger.info(`Updated concept graph with ${memories.length} memories`);
    } catch (error) {
      this.logger.error('Failed to update concept graph:', error);
      // Don't throw - this is not critical for memory functionality
    }
  }

  private extractEntities(content: Record<string, any>): Array<{
    name: string;
    type: string;
    confidence: number;
  }> {
    const entities: Array<{ name: string; type: string; confidence: number }> = [];

    // Extract entities based on content structure
    this.extractFromField(content, 'concept', 'concept', entities, 0.9);
    this.extractFromField(content, 'domain', 'domain', entities, 0.8);
    this.extractFromField(content, 'procedureName', 'procedure', entities, 0.9);
    this.extractFromField(content, 'businessDomain', 'business_domain', entities, 0.8);
    this.extractFromField(content, 'customerSegment', 'customer_segment', entities, 0.7);
    this.extractFromField(content, 'industryVertical', 'industry', entities, 0.7);

    // Extract entities from arrays
    if (content.participants && Array.isArray(content.participants)) {
      content.participants.forEach((participant: string) => {
        entities.push({
          name: participant,
          type: 'participant',
          confidence: 0.8,
        });
      });
    }

    if (content.tags && Array.isArray(content.tags)) {
      content.tags.forEach((tag: string) => {
        entities.push({
          name: tag,
          type: 'tag',
          confidence: 0.6,
        });
      });
    }

    // Extract entities from facts (semantic memory)
    if (content.facts && Array.isArray(content.facts)) {
      content.facts.forEach((fact: any) => {
        if (fact.statement) {
          const extracted = this.extractEntitiesFromText(fact.statement);
          entities.push(...extracted);
        }
      });
    }

    return entities.slice(0, 20); // Limit to prevent overwhelming the knowledge graph
  }

  private extractFromField(
    content: Record<string, any>,
    field: string,
    type: string,
    entities: Array<{ name: string; type: string; confidence: number }>,
    confidence: number
  ): void {
    if (content[field] && typeof content[field] === 'string') {
      entities.push({
        name: content[field],
        type,
        confidence,
      });
    }
  }

  private extractEntitiesFromText(text: string): Array<{
    name: string;
    type: string;
    confidence: number;
  }> {
    const entities: Array<{ name: string; type: string; confidence: number }> = [];
    
    // Simple entity extraction - in production, use NLP libraries
    const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    
    capitalizedWords.forEach(entity => {
      if (entity.length > 2) {
        entities.push({
          name: entity,
          type: 'named_entity',
          confidence: 0.5,
        });
      }
    });

    return entities;
  }

  private extractRelationships(content: Record<string, any>): Array<{
    from: string;
    to: string;
    type: string;
    confidence: number;
  }> {
    const relationships: Array<{
      from: string;
      to: string;
      type: string;
      confidence: number;
    }> = [];

    // Extract relationships based on content structure
    if (content.concept && content.domain) {
      relationships.push({
        from: content.concept,
        to: content.domain,
        type: 'belongs_to_domain',
        confidence: 0.8,
      });
    }

    if (content.procedureName && content.skillDomain) {
      relationships.push({
        from: content.procedureName,
        to: content.skillDomain,
        type: 'part_of_skill_domain',
        confidence: 0.9,
      });
    }

    if (content.customerSegment && content.industryVertical) {
      relationships.push({
        from: content.customerSegment,
        to: content.industryVertical,
        type: 'operates_in_industry',
        confidence: 0.7,
      });
    }

    // Extract relationships from facts (semantic memory)
    if (content.facts && Array.isArray(content.facts)) {
      content.facts.forEach((fact: any) => {
        if (fact.statement && fact.sources) {
          fact.sources.forEach((source: string) => {
            relationships.push({
              from: fact.statement,
              to: source,
              type: 'supported_by',
              confidence: fact.confidence || 0.5,
            });
          });
        }
      });
    }

    // Extract relationships from rules (semantic memory)
    if (content.rules && Array.isArray(content.rules)) {
      content.rules.forEach((rule: any) => {
        if (rule.condition && rule.conclusion) {
          relationships.push({
            from: rule.condition,
            to: rule.conclusion,
            type: 'implies',
            confidence: rule.confidence || 0.6,
          });
        }
      });
    }

    // Extract relationships from steps (procedural memory)
    if (content.steps && Array.isArray(content.steps)) {
      for (let i = 0; i < content.steps.length - 1; i++) {
        const currentStep = content.steps[i];
        const nextStep = content.steps[i + 1];
        
        if (currentStep.description && nextStep.description) {
          relationships.push({
            from: currentStep.description,
            to: nextStep.description,
            type: 'followed_by',
            confidence: 0.9,
          });
        }
      }
    }

    return relationships.slice(0, 50); // Limit to prevent overwhelming the knowledge graph
  }

  private extractConcepts(content: Record<string, any>): string[] {
    const concepts: string[] = [];

    // Direct concept fields
    if (content.concept) concepts.push(content.concept);
    if (content.domain) concepts.push(content.domain);
    if (content.skillDomain) concepts.push(content.skillDomain);
    if (content.businessDomain) concepts.push(content.businessDomain);

    // Extract concepts from semantic memory
    if (content.applicability && Array.isArray(content.applicability)) {
      concepts.push(...content.applicability);
    }

    // Extract concepts from business memory
    if (content.competitorInfo && typeof content.competitorInfo === 'object') {
      Object.keys(content.competitorInfo).forEach(key => {
        if (typeof content.competitorInfo[key] === 'string') {
          concepts.push(content.competitorInfo[key]);
        }
      });
    }

    // Extract concepts from tags
    if (content.tags && Array.isArray(content.tags)) {
      concepts.push(...content.tags);
    }

    return [...new Set(concepts)].slice(0, 10); // Deduplicate and limit
  }
}