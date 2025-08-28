import { createServiceLogger } from '@fineprintai/shared-logger';
import { Neo4jService } from './neo4j-service';
import { z } from 'zod';
import { nanoid } from 'nanoid';

const logger = createServiceLogger('legal-ontology-service');

// Schema Definitions for Legal Knowledge Graph

export const LegalConceptSchema = z.object({
  id: z.string().default(() => nanoid()),
  name: z.string(),
  description: z.string(),
  category: z.enum([
    'DATA_PRIVACY',
    'USER_RIGHTS',
    'LIABILITY',
    'TERMINATION',
    'INTELLECTUAL_PROPERTY',
    'DISPUTE_RESOLUTION',
    'PAYMENT_TERMS',
    'CONTENT_LICENSING',
    'ACCOUNT_MANAGEMENT',
    'COMPLIANCE',
    'SECURITY',
    'COOKIES_TRACKING',
  ]),
  difficulty_level: z.number().min(1).max(10),
  importance_weight: z.number().min(0).max(1),
  keywords: z.array(z.string()),
  aliases: z.array(z.string()).default([]),
  legal_basis: z.array(z.string()).default([]),
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
});

export const LegalClauseSchema = z.object({
  id: z.string().default(() => nanoid()),
  title: z.string(),
  description: z.string(),
  text_content: z.string(),
  pattern_id: z.string().optional(),
  document_id: z.string(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  confidence_score: z.number().min(0).max(1),
  risk_factors: z.array(z.string()),
  impact_areas: z.array(z.string()),
  position_start: z.number().optional(),
  position_end: z.number().optional(),
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
});

export const PatternSchema = z.object({
  id: z.string().default(() => nanoid()),
  name: z.string(),
  description: z.string(),
  pattern_type: z.enum([
    'REGEX',
    'SEMANTIC',
    'STRUCTURAL',
    'CONTEXTUAL',
    'HYBRID',
  ]),
  pattern_definition: z.string(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  frequency: z.number().default(0),
  accuracy: z.number().min(0).max(1).default(0),
  false_positive_rate: z.number().min(0).max(1).default(0),
  enabled: z.boolean().default(true),
  version: z.string().default('1.0.0'),
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
});

export const DocumentSchema = z.object({
  id: z.string().default(() => nanoid()),
  title: z.string(),
  content: z.string(),
  document_type: z.enum([
    'TERMS_OF_SERVICE',
    'PRIVACY_POLICY',
    'EULA',
    'COOKIE_POLICY',
    'DATA_PROCESSING_AGREEMENT',
    'USER_AGREEMENT',
    'LICENSE_AGREEMENT',
  ]),
  content_hash: z.string(),
  language: z.string().default('en'),
  jurisdiction: z.string().optional(),
  company_name: z.string().optional(),
  company_domain: z.string().optional(),
  version: z.string().optional(),
  effective_date: z.date().optional(),
  word_count: z.number().default(0),
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
});

export const JurisdictionSchema = z.object({
  code: z.string(), // ISO 3166-1 alpha-2 (US, EU, etc.)
  name: z.string(),
  legal_system: z.enum(['COMMON_LAW', 'CIVIL_LAW', 'MIXED']),
  data_protection_laws: z.array(z.string()).default([]),
  consumer_protection_laws: z.array(z.string()).default([]),
  contract_law_principles: z.array(z.string()).default([]),
  enforcement_strength: z.number().min(1).max(10).default(5),
  created_at: z.date().default(() => new Date()),
  updated_at: z.date().default(() => new Date()),
});

export type LegalConcept = z.infer<typeof LegalConceptSchema>;
export type LegalClause = z.infer<typeof LegalClauseSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type Jurisdiction = z.infer<typeof JurisdictionSchema>;

// Relationship Types
export enum RelationshipType {
  CONTAINS = 'CONTAINS',
  REFERENCES = 'REFERENCES',
  CONTRADICTS = 'CONTRADICTS',
  IMPLIES = 'IMPLIES',
  REQUIRES = 'REQUIRES',
  OVERRIDES = 'OVERRIDES',
  SIMILAR_TO = 'SIMILAR_TO',
  DERIVED_FROM = 'DERIVED_FROM',
  APPLIES_TO = 'APPLIES_TO',
  GOVERNED_BY = 'GOVERNED_BY',
  MATCHES = 'MATCHES',
  DEPENDS_ON = 'DEPENDS_ON',
  CONFLICTS_WITH = 'CONFLICTS_WITH',
  STRENGTHENS = 'STRENGTHENS',
  WEAKENS = 'WEAKENS',
}

/**
 * Legal Ontology Service - Manages the knowledge graph schema
 * and provides semantic operations for legal concepts
 */
export class LegalOntologyService {
  private neo4jService: Neo4jService;

  constructor(neo4jService: Neo4jService) {
    this.neo4jService = neo4jService;
  }

  /**
   * Initialize the legal ontology with predefined concepts and relationships
   */
  async initialize(): Promise<void> {
    try {
      await this.createCoreOntology();
      await this.createCommonPatterns();
      await this.createJurisdictions();
      await this.createConceptRelationships();
      
      logger.info('Legal ontology initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize legal ontology', { error });
      throw error;
    }
  }

  // ===== LEGAL CONCEPT MANAGEMENT =====

  /**
   * Create a new legal concept
   */
  async createLegalConcept(concept: Partial<LegalConcept>): Promise<LegalConcept> {
    const validatedConcept = LegalConceptSchema.parse(concept);
    
    const query = `
      CREATE (lc:LegalConcept $properties)
      RETURN lc
    `;
    
    const result = await this.neo4jService.executeQuery(query, {
      properties: validatedConcept,
    });

    const createdConcept = result.records[0]?.get('lc').properties;
    logger.info('Legal concept created', { conceptId: createdConcept.id, name: createdConcept.name });
    
    return createdConcept;
  }

  /**
   * Get legal concept by ID
   */
  async getLegalConcept(id: string): Promise<LegalConcept | null> {
    const query = `
      MATCH (lc:LegalConcept {id: $id})
      RETURN lc
    `;
    
    const result = await this.neo4jService.executeQuery(query, { id }, { cache: true });
    return result.records[0]?.get('lc').properties || null;
  }

  /**
   * Search legal concepts by keyword or category
   */
  async searchLegalConcepts(
    query: string,
    category?: string,
    difficultyRange?: [number, number]
  ): Promise<LegalConcept[]> {
    let cypher = `
      CALL db.index.fulltext.queryNodes("legalConceptSearch", $query) YIELD node AS lc, score
    `;
    const parameters: any = { query };

    if (category) {
      cypher += ` WHERE lc.category = $category`;
      parameters.category = category;
    }

    if (difficultyRange) {
      cypher += ` ${category ? 'AND' : 'WHERE'} lc.difficulty_level >= $minDifficulty AND lc.difficulty_level <= $maxDifficulty`;
      parameters.minDifficulty = difficultyRange[0];
      parameters.maxDifficulty = difficultyRange[1];
    }

    cypher += ` RETURN lc ORDER BY score DESC LIMIT 50`;

    const result = await this.neo4jService.executeQuery(cypher, parameters, { cache: true });
    return result.records.map(record => record.get('lc').properties);
  }

  /**
   * Get concepts by difficulty level for curriculum learning
   */
  async getConceptsByDifficulty(
    minLevel: number,
    maxLevel: number,
    category?: string
  ): Promise<LegalConcept[]> {
    let cypher = `
      MATCH (lc:LegalConcept)
      WHERE lc.difficulty_level >= $minLevel AND lc.difficulty_level <= $maxLevel
    `;
    const parameters: any = { minLevel, maxLevel };

    if (category) {
      cypher += ` AND lc.category = $category`;
      parameters.category = category;
    }

    cypher += `
      RETURN lc
      ORDER BY lc.difficulty_level ASC, lc.importance_weight DESC
    `;

    const result = await this.neo4jService.executeQuery(cypher, parameters, { cache: true });
    return result.records.map(record => record.get('lc').properties);
  }

  // ===== LEGAL CLAUSE MANAGEMENT =====

  /**
   * Create a legal clause with concept associations
   */
  async createLegalClause(clause: Partial<LegalClause>, conceptIds?: string[]): Promise<LegalClause> {
    const validatedClause = LegalClauseSchema.parse(clause);
    
    return await this.neo4jService.executeTransaction(async (tx) => {
      // Create the clause
      const createResult = await tx.run(`
        CREATE (lc:LegalClause $properties)
        RETURN lc
      `, { properties: validatedClause });

      const createdClause = createResult.records[0]?.get('lc').properties;

      // Link to concepts if provided
      if (conceptIds && conceptIds.length > 0) {
        await tx.run(`
          MATCH (lc:LegalClause {id: $clauseId})
          MATCH (concept:LegalConcept)
          WHERE concept.id IN $conceptIds
          CREATE (lc)-[:RELATES_TO]->(concept)
        `, { clauseId: createdClause.id, conceptIds });
      }

      // Link to document
      await tx.run(`
        MATCH (lc:LegalClause {id: $clauseId})
        MATCH (d:Document {id: $documentId})
        CREATE (d)-[:CONTAINS]->(lc)
      `, { clauseId: createdClause.id, documentId: validatedClause.document_id });

      logger.info('Legal clause created', { 
        clauseId: createdClause.id, 
        documentId: validatedClause.document_id,
        conceptsLinked: conceptIds?.length || 0 
      });

      return createdClause;
    });
  }

  /**
   * Get clauses by severity and confidence for curriculum learning
   */
  async getClausesBySeverity(
    severity: string[],
    minConfidence: number = 0.7,
    limit: number = 100
  ): Promise<LegalClause[]> {
    const query = `
      MATCH (lc:LegalClause)
      WHERE lc.severity IN $severity AND lc.confidence_score >= $minConfidence
      RETURN lc
      ORDER BY lc.confidence_score DESC, lc.severity DESC
      LIMIT $limit
    `;

    const result = await this.neo4jService.executeQuery(query, {
      severity,
      minConfidence,
      limit,
    }, { cache: true });

    return result.records.map(record => record.get('lc').properties);
  }

  // ===== PATTERN MANAGEMENT =====

  /**
   * Create a new legal pattern
   */
  async createPattern(pattern: Partial<Pattern>): Promise<Pattern> {
    const validatedPattern = PatternSchema.parse(pattern);
    
    const query = `
      CREATE (p:Pattern $properties)
      RETURN p
    `;
    
    const result = await this.neo4jService.executeQuery(query, {
      properties: validatedPattern,
    });

    const createdPattern = result.records[0]?.get('p').properties;
    logger.info('Pattern created', { patternId: createdPattern.id, name: createdPattern.name });
    
    return createdPattern;
  }

  /**
   * Get patterns by effectiveness for curriculum learning
   */
  async getPatternsByEffectiveness(minAccuracy: number = 0.8): Promise<Pattern[]> {
    const query = `
      MATCH (p:Pattern)
      WHERE p.enabled = true AND p.accuracy >= $minAccuracy
      RETURN p
      ORDER BY p.accuracy DESC, p.frequency DESC
    `;

    const result = await this.neo4jService.executeQuery(query, { minAccuracy }, { cache: true });
    return result.records.map(record => record.get('p').properties);
  }

  // ===== DOCUMENT MANAGEMENT =====

  /**
   * Create a document with jurisdiction association
   */
  async createDocument(document: Partial<Document>, jurisdictionCode?: string): Promise<Document> {
    const validatedDocument = DocumentSchema.parse(document);
    
    return await this.neo4jService.executeTransaction(async (tx) => {
      // Create the document
      const createResult = await tx.run(`
        CREATE (d:Document $properties)
        RETURN d
      `, { properties: validatedDocument });

      const createdDocument = createResult.records[0]?.get('d').properties;

      // Link to jurisdiction if provided
      if (jurisdictionCode) {
        await tx.run(`
          MATCH (d:Document {id: $documentId})
          MATCH (j:Jurisdiction {code: $jurisdictionCode})
          CREATE (d)-[:GOVERNED_BY]->(j)
        `, { documentId: createdDocument.id, jurisdictionCode });
      }

      logger.info('Document created', { 
        documentId: createdDocument.id, 
        type: createdDocument.document_type,
        jurisdiction: jurisdictionCode 
      });

      return createdDocument;
    });
  }

  // ===== RELATIONSHIP MANAGEMENT =====

  /**
   * Create a relationship between two nodes
   */
  async createRelationship(
    fromNodeId: string,
    toNodeId: string,
    relationshipType: RelationshipType,
    properties: Record<string, any> = {}
  ): Promise<void> {
    const query = `
      MATCH (from {id: $fromNodeId})
      MATCH (to {id: $toNodeId})
      CREATE (from)-[r:${relationshipType} $properties]->(to)
      RETURN r
    `;

    await this.neo4jService.executeQuery(query, {
      fromNodeId,
      toNodeId,
      properties,
    });

    logger.debug('Relationship created', { fromNodeId, toNodeId, relationshipType });
  }

  /**
   * Get related concepts for curriculum sequencing
   */
  async getRelatedConcepts(
    conceptId: string,
    relationshipTypes: RelationshipType[] = [RelationshipType.REQUIRES, RelationshipType.DEPENDS_ON],
    maxDepth: number = 2
  ): Promise<{ concept: LegalConcept; relationship: string; depth: number }[]> {
    const query = `
      MATCH path = (lc:LegalConcept {id: $conceptId})-[r*1..${maxDepth}]->(related:LegalConcept)
      WHERE ALL(rel IN relationships(path) WHERE type(rel) IN $relationshipTypes)
      RETURN related AS concept, type(last(relationships(path))) AS relationship, length(path) AS depth
      ORDER BY depth ASC, related.difficulty_level ASC
    `;

    const result = await this.neo4jService.executeQuery(query, {
      conceptId,
      relationshipTypes,
    }, { cache: true });

    return result.records.map(record => ({
      concept: record.get('concept').properties,
      relationship: record.get('relationship'),
      depth: record.get('depth').toNumber(),
    }));
  }

  // ===== SEMANTIC REASONING =====

  /**
   * Find similar clauses using graph relationships and embeddings
   */
  async findSimilarClauses(
    clauseId: string,
    similarityThreshold: number = 0.8,
    limit: number = 10
  ): Promise<{ clause: LegalClause; similarity: number }[]> {
    const query = `
      MATCH (lc1:LegalClause {id: $clauseId})-[:RELATES_TO]->(concept:LegalConcept)<-[:RELATES_TO]-(lc2:LegalClause)
      WHERE lc1 <> lc2 AND lc1.severity = lc2.severity
      WITH lc2, count(concept) AS shared_concepts
      WHERE shared_concepts >= 2
      MATCH (lc2)-[:SIMILAR_TO]->(similar:LegalClause)
      WHERE similar.confidence_score >= $similarityThreshold
      RETURN lc2 AS clause, similar.confidence_score AS similarity
      ORDER BY similarity DESC, shared_concepts DESC
      LIMIT $limit
    `;

    const result = await this.neo4jService.executeQuery(query, {
      clauseId,
      similarityThreshold,
      limit,
    }, { cache: true });

    return result.records.map(record => ({
      clause: record.get('clause').properties,
      similarity: record.get('similarity'),
    }));
  }

  /**
   * Get concept prerequisites for curriculum learning
   */
  async getConceptPrerequisites(conceptId: string): Promise<LegalConcept[]> {
    const query = `
      MATCH (target:LegalConcept {id: $conceptId})<-[:REQUIRES|DEPENDS_ON*1..3]-(prerequisite:LegalConcept)
      RETURN DISTINCT prerequisite
      ORDER BY prerequisite.difficulty_level ASC
    `;

    const result = await this.neo4jService.executeQuery(query, { conceptId }, { cache: true });
    return result.records.map(record => record.get('prerequisite').properties);
  }

  // ===== PRIVATE INITIALIZATION METHODS =====

  /**
   * Create core legal concepts in the ontology
   */
  private async createCoreOntology(): Promise<void> {
    const coreConceptsQuery = `
      UNWIND $concepts AS concept
      MERGE (lc:LegalConcept {name: concept.name})
      SET lc += concept
    `;

    const concepts = [
      {
        name: 'Data Collection',
        description: 'The practice of gathering user information',
        category: 'DATA_PRIVACY',
        difficulty_level: 3,
        importance_weight: 0.9,
        keywords: ['data collection', 'information gathering', 'user data', 'personal information'],
      },
      {
        name: 'Data Sharing',
        description: 'Sharing user data with third parties',
        category: 'DATA_PRIVACY',
        difficulty_level: 5,
        importance_weight: 0.95,
        keywords: ['data sharing', 'third parties', 'data disclosure', 'information sharing'],
      },
      {
        name: 'Account Termination',
        description: 'Conditions under which user accounts can be terminated',
        category: 'TERMINATION',
        difficulty_level: 4,
        importance_weight: 0.8,
        keywords: ['account termination', 'suspension', 'account closure', 'ban'],
      },
      {
        name: 'Liability Limitation',
        description: 'Clauses that limit company liability',
        category: 'LIABILITY',
        difficulty_level: 7,
        importance_weight: 0.85,
        keywords: ['liability limitation', 'damages exclusion', 'limitation of liability'],
      },
      {
        name: 'Dispute Resolution',
        description: 'Mechanisms for resolving legal disputes',
        category: 'DISPUTE_RESOLUTION',
        difficulty_level: 6,
        importance_weight: 0.75,
        keywords: ['arbitration', 'dispute resolution', 'legal proceedings', 'jurisdiction'],
      },
      {
        name: 'Content Licensing',
        description: 'Rights granted to user-generated content',
        category: 'CONTENT_LICENSING',
        difficulty_level: 5,
        importance_weight: 0.7,
        keywords: ['content license', 'user content', 'intellectual property', 'content rights'],
      },
      {
        name: 'Automatic Renewal',
        description: 'Automatic subscription or service renewal terms',
        category: 'PAYMENT_TERMS',
        difficulty_level: 4,
        importance_weight: 0.8,
        keywords: ['automatic renewal', 'auto-renewal', 'subscription renewal', 'recurring payment'],
      },
      {
        name: 'Cookie Usage',
        description: 'Use of cookies and tracking technologies',
        category: 'COOKIES_TRACKING',
        difficulty_level: 3,
        importance_weight: 0.6,
        keywords: ['cookies', 'tracking', 'web beacons', 'analytics'],
      },
    ].map(concept => ({ ...concept, id: nanoid(), created_at: new Date(), updated_at: new Date() }));

    await this.neo4jService.executeQuery(coreConceptsQuery, { concepts });
    logger.info('Core legal concepts created', { count: concepts.length });
  }

  /**
   * Create common legal patterns
   */
  private async createCommonPatterns(): Promise<void> {
    const patternsQuery = `
      UNWIND $patterns AS pattern
      MERGE (p:Pattern {name: pattern.name})
      SET p += pattern
    `;

    const patterns = [
      {
        name: 'Broad Data Collection',
        description: 'Pattern for detecting overly broad data collection clauses',
        pattern_type: 'SEMANTIC',
        pattern_definition: 'collect.*(?:all|any|every|broad|extensive).*(?:information|data)',
        severity: 'HIGH',
        accuracy: 0.85,
      },
      {
        name: 'Unlimited Liability Waiver',
        description: 'Pattern for detecting unlimited liability waivers',
        pattern_type: 'REGEX',
        pattern_definition: 'waive.*(?:all|any|every).*(?:liability|damages|claims)',
        severity: 'CRITICAL',
        accuracy: 0.92,
      },
      {
        name: 'Forced Arbitration',
        description: 'Pattern for detecting mandatory arbitration clauses',
        pattern_type: 'CONTEXTUAL',
        pattern_definition: 'arbitration.*(?:mandatory|required|binding|exclusive)',
        severity: 'MEDIUM',
        accuracy: 0.88,
      },
      {
        name: 'Perpetual Content License',
        description: 'Pattern for detecting perpetual content licensing',
        pattern_type: 'SEMANTIC',
        pattern_definition: 'license.*(?:perpetual|forever|permanent|irrevocable).*content',
        severity: 'HIGH',
        accuracy: 0.83,
      },
    ].map(pattern => ({ 
      ...pattern, 
      id: nanoid(), 
      frequency: 0, 
      false_positive_rate: 0.1,
      enabled: true,
      version: '1.0.0',
      created_at: new Date(), 
      updated_at: new Date() 
    }));

    await this.neo4jService.executeQuery(patternsQuery, { patterns });
    logger.info('Common patterns created', { count: patterns.length });
  }

  /**
   * Create jurisdictions
   */
  private async createJurisdictions(): Promise<void> {
    const jurisdictionsQuery = `
      UNWIND $jurisdictions AS jurisdiction
      MERGE (j:Jurisdiction {code: jurisdiction.code})
      SET j += jurisdiction
    `;

    const jurisdictions = [
      {
        code: 'US',
        name: 'United States',
        legal_system: 'COMMON_LAW',
        data_protection_laws: ['CCPA', 'COPPA', 'HIPAA'],
        consumer_protection_laws: ['FTC Act', 'TCPA'],
        contract_law_principles: ['Freedom of Contract', 'Unconscionability Doctrine'],
        enforcement_strength: 8,
      },
      {
        code: 'EU',
        name: 'European Union',
        legal_system: 'CIVIL_LAW',
        data_protection_laws: ['GDPR', 'ePrivacy Directive'],
        consumer_protection_laws: ['Consumer Rights Directive', 'Unfair Contract Terms Directive'],
        contract_law_principles: ['Good Faith', 'Consumer Protection'],
        enforcement_strength: 9,
      },
      {
        code: 'UK',
        name: 'United Kingdom',
        legal_system: 'COMMON_LAW',
        data_protection_laws: ['UK GDPR', 'DPA 2018'],
        consumer_protection_laws: ['Consumer Rights Act 2015'],
        contract_law_principles: ['Freedom of Contract', 'Unfair Contract Terms'],
        enforcement_strength: 8,
      },
    ].map(jurisdiction => ({ 
      ...jurisdiction, 
      created_at: new Date(), 
      updated_at: new Date() 
    }));

    await this.neo4jService.executeQuery(jurisdictionsQuery, { jurisdictions });
    logger.info('Jurisdictions created', { count: jurisdictions.length });
  }

  /**
   * Create relationships between concepts for dependency management
   */
  private async createConceptRelationships(): Promise<void> {
    const relationshipsQuery = `
      UNWIND $relationships AS rel
      MATCH (from:LegalConcept {name: rel.from})
      MATCH (to:LegalConcept {name: rel.to})
      CREATE (from)-[r:REQUIRES {weight: rel.weight}]->(to)
    `;

    const relationships = [
      { from: 'Data Sharing', to: 'Data Collection', weight: 0.9 },
      { from: 'Liability Limitation', to: 'Dispute Resolution', weight: 0.7 },
      { from: 'Content Licensing', to: 'Account Termination', weight: 0.6 },
      { from: 'Automatic Renewal', to: 'Account Termination', weight: 0.8 },
    ];

    await this.neo4jService.executeQuery(relationshipsQuery, { relationships });
    logger.info('Concept relationships created', { count: relationships.length });
  }
}