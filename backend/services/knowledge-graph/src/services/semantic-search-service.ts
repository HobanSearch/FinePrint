import { createServiceLogger } from '@fineprintai/shared-logger';
import { Neo4jService } from './neo4j-service';
import { compromise } from 'compromise';
import { stemmer } from 'stemmer';
import * as natural from 'natural';
import * as _ from 'lodash';

const logger = createServiceLogger('semantic-search-service');

export interface SemanticSearchResult {
  type: 'CONCEPT' | 'CLAUSE' | 'PATTERN' | 'DOCUMENT';
  id: string;
  score: number;
  data: any;
  explanation?: string;
  semantic_features: {
    keywords: string[];
    entities: string[];
    sentiment: number;
    complexity: number;
  };
}

/**
 * Semantic Search Service - Provides intelligent search capabilities
 * using NLP and graph relationships
 */
export class SemanticSearchService {
  private neo4jService: Neo4jService;
  private stemmer = stemmer;
  private tfidf = new natural.TfIdf();
  private initialized = false;

  constructor(neo4jService: Neo4jService) {
    this.neo4jService = neo4jService;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    logger.info('Semantic Search Service initialized');
  }

  /**
   * Expand query with semantic understanding
   */
  async expandQuery(query: string): Promise<string[]> {
    const doc = compromise(query);
    const expansions = new Set<string>();
    
    // Add original query
    expansions.add(query);
    
    // Add stemmed versions
    const words = query.toLowerCase().split(/\s+/);
    words.forEach(word => {
      expansions.add(this.stemmer(word));
    });
    
    // Add synonyms and related terms
    const synonyms = await this.getSynonyms(words);
    synonyms.forEach(synonym => expansions.add(synonym));
    
    return Array.from(expansions);
  }

  /**
   * Search across all node types
   */
  async searchAcrossTypes(query: string, limit: number = 20): Promise<SemanticSearchResult[]> {
    const results: SemanticSearchResult[] = [];
    
    // Search concepts
    const conceptResults = await this.searchConcepts(query, Math.ceil(limit / 4));
    results.push(...conceptResults);
    
    // Search clauses
    const clauseResults = await this.searchClauses(query, Math.ceil(limit / 4));
    results.push(...clauseResults);
    
    // Search patterns
    const patternResults = await this.searchPatterns(query, Math.ceil(limit / 4));
    results.push(...patternResults);
    
    // Search documents
    const documentResults = await this.searchDocuments(query, Math.ceil(limit / 4));
    results.push(...documentResults);
    
    // Sort by score and return top results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async searchConcepts(query: string, limit: number): Promise<SemanticSearchResult[]> {
    try {
      const cypher = `
        CALL db.index.fulltext.queryNodes("legalConceptSearch", $query) YIELD node, score
        RETURN node, score
        LIMIT $limit
      `;
      
      const result = await this.neo4jService.executeQuery(cypher, { query, limit });
      
      return result.records.map(record => ({
        type: 'CONCEPT' as const,
        id: record.get('node').properties.id,
        score: record.get('score'),
        data: record.get('node').properties,
        semantic_features: this.extractSemanticFeatures(query),
      }));
    } catch (error) {
      logger.warn('Concept search failed', { error, query });
      return [];
    }
  }

  private async searchClauses(query: string, limit: number): Promise<SemanticSearchResult[]> {
    try {
      const cypher = `
        CALL db.index.fulltext.queryNodes("legalClauseSearch", $query) YIELD node, score
        RETURN node, score
        LIMIT $limit
      `;
      
      const result = await this.neo4jService.executeQuery(cypher, { query, limit });
      
      return result.records.map(record => ({
        type: 'CLAUSE' as const,
        id: record.get('node').properties.id,
        score: record.get('score'),
        data: record.get('node').properties,
        semantic_features: this.extractSemanticFeatures(query),
      }));
    } catch (error) {
      logger.warn('Clause search failed', { error, query });
      return [];
    }
  }

  private async searchPatterns(query: string, limit: number): Promise<SemanticSearchResult[]> {
    try {
      const cypher = `
        MATCH (p:Pattern)
        WHERE p.name CONTAINS $query OR p.description CONTAINS $query
        RETURN p, 
               CASE 
                 WHEN p.name CONTAINS $query THEN 0.9
                 WHEN p.description CONTAINS $query THEN 0.7
                 ELSE 0.5
               END AS score
        ORDER BY score DESC
        LIMIT $limit
      `;
      
      const result = await this.neo4jService.executeQuery(cypher, { query, limit });
      
      return result.records.map(record => ({
        type: 'PATTERN' as const,
        id: record.get('p').properties.id,
        score: record.get('score'),
        data: record.get('p').properties,
        semantic_features: this.extractSemanticFeatures(query),
      }));
    } catch (error) {
      logger.warn('Pattern search failed', { error, query });
      return [];
    }
  }

  private async searchDocuments(query: string, limit: number): Promise<SemanticSearchResult[]> {
    try {
      const cypher = `
        CALL db.index.fulltext.queryNodes("documentSearch", $query) YIELD node, score
        RETURN node, score
        LIMIT $limit
      `;
      
      const result = await this.neo4jService.executeQuery(cypher, { query, limit });
      
      return result.records.map(record => ({
        type: 'DOCUMENT' as const,
        id: record.get('node').properties.id,
        score: record.get('score'),
        data: record.get('node').properties,
        semantic_features: this.extractSemanticFeatures(query),
      }));
    } catch (error) {
      logger.warn('Document search failed', { error, query });
      return [];
    }
  }

  private extractSemanticFeatures(text: string): {
    keywords: string[];
    entities: string[];
    sentiment: number;
    complexity: number;
  } {
    const doc = compromise(text);
    
    return {
      keywords: doc.nouns().out('array') as string[],
      entities: doc.people().out('array').concat(doc.places().out('array')) as string[],
      sentiment: 0, // Would use proper sentiment analysis
      complexity: text.split(' ').length / 10, // Simple complexity measure
    };
  }

  private async getSynonyms(words: string[]): Promise<string[]> {
    // Simple synonym mapping - in production would use WordNet or similar
    const synonymMap: Record<string, string[]> = {
      'data': ['information', 'details', 'records'],
      'privacy': ['confidentiality', 'secrecy', 'protection'],
      'liability': ['responsibility', 'accountability', 'obligation'],
      'termination': ['ending', 'closure', 'cancellation'],
      'sharing': ['disclosure', 'distribution', 'dissemination'],
    };
    
    const synonyms: string[] = [];
    for (const word of words) {
      const wordSynonyms = synonymMap[word.toLowerCase()];
      if (wordSynonyms) {
        synonyms.push(...wordSynonyms);
      }
    }
    
    return synonyms;
  }
}