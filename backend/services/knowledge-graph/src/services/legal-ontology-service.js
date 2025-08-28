"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegalOntologyService = exports.RelationshipType = exports.JurisdictionSchema = exports.DocumentSchema = exports.PatternSchema = exports.LegalClauseSchema = exports.LegalConceptSchema = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const zod_1 = require("zod");
const nanoid_1 = require("nanoid");
const logger = (0, logger_1.createServiceLogger)('legal-ontology-service');
exports.LegalConceptSchema = zod_1.z.object({
    id: zod_1.z.string().default(() => (0, nanoid_1.nanoid)()),
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    category: zod_1.z.enum([
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
    difficulty_level: zod_1.z.number().min(1).max(10),
    importance_weight: zod_1.z.number().min(0).max(1),
    keywords: zod_1.z.array(zod_1.z.string()),
    aliases: zod_1.z.array(zod_1.z.string()).default([]),
    legal_basis: zod_1.z.array(zod_1.z.string()).default([]),
    created_at: zod_1.z.date().default(() => new Date()),
    updated_at: zod_1.z.date().default(() => new Date()),
});
exports.LegalClauseSchema = zod_1.z.object({
    id: zod_1.z.string().default(() => (0, nanoid_1.nanoid)()),
    title: zod_1.z.string(),
    description: zod_1.z.string(),
    text_content: zod_1.z.string(),
    pattern_id: zod_1.z.string().optional(),
    document_id: zod_1.z.string(),
    severity: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    confidence_score: zod_1.z.number().min(0).max(1),
    risk_factors: zod_1.z.array(zod_1.z.string()),
    impact_areas: zod_1.z.array(zod_1.z.string()),
    position_start: zod_1.z.number().optional(),
    position_end: zod_1.z.number().optional(),
    created_at: zod_1.z.date().default(() => new Date()),
    updated_at: zod_1.z.date().default(() => new Date()),
});
exports.PatternSchema = zod_1.z.object({
    id: zod_1.z.string().default(() => (0, nanoid_1.nanoid)()),
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    pattern_type: zod_1.z.enum([
        'REGEX',
        'SEMANTIC',
        'STRUCTURAL',
        'CONTEXTUAL',
        'HYBRID',
    ]),
    pattern_definition: zod_1.z.string(),
    severity: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    frequency: zod_1.z.number().default(0),
    accuracy: zod_1.z.number().min(0).max(1).default(0),
    false_positive_rate: zod_1.z.number().min(0).max(1).default(0),
    enabled: zod_1.z.boolean().default(true),
    version: zod_1.z.string().default('1.0.0'),
    created_at: zod_1.z.date().default(() => new Date()),
    updated_at: zod_1.z.date().default(() => new Date()),
});
exports.DocumentSchema = zod_1.z.object({
    id: zod_1.z.string().default(() => (0, nanoid_1.nanoid)()),
    title: zod_1.z.string(),
    content: zod_1.z.string(),
    document_type: zod_1.z.enum([
        'TERMS_OF_SERVICE',
        'PRIVACY_POLICY',
        'EULA',
        'COOKIE_POLICY',
        'DATA_PROCESSING_AGREEMENT',
        'USER_AGREEMENT',
        'LICENSE_AGREEMENT',
    ]),
    content_hash: zod_1.z.string(),
    language: zod_1.z.string().default('en'),
    jurisdiction: zod_1.z.string().optional(),
    company_name: zod_1.z.string().optional(),
    company_domain: zod_1.z.string().optional(),
    version: zod_1.z.string().optional(),
    effective_date: zod_1.z.date().optional(),
    word_count: zod_1.z.number().default(0),
    created_at: zod_1.z.date().default(() => new Date()),
    updated_at: zod_1.z.date().default(() => new Date()),
});
exports.JurisdictionSchema = zod_1.z.object({
    code: zod_1.z.string(),
    name: zod_1.z.string(),
    legal_system: zod_1.z.enum(['COMMON_LAW', 'CIVIL_LAW', 'MIXED']),
    data_protection_laws: zod_1.z.array(zod_1.z.string()).default([]),
    consumer_protection_laws: zod_1.z.array(zod_1.z.string()).default([]),
    contract_law_principles: zod_1.z.array(zod_1.z.string()).default([]),
    enforcement_strength: zod_1.z.number().min(1).max(10).default(5),
    created_at: zod_1.z.date().default(() => new Date()),
    updated_at: zod_1.z.date().default(() => new Date()),
});
var RelationshipType;
(function (RelationshipType) {
    RelationshipType["CONTAINS"] = "CONTAINS";
    RelationshipType["REFERENCES"] = "REFERENCES";
    RelationshipType["CONTRADICTS"] = "CONTRADICTS";
    RelationshipType["IMPLIES"] = "IMPLIES";
    RelationshipType["REQUIRES"] = "REQUIRES";
    RelationshipType["OVERRIDES"] = "OVERRIDES";
    RelationshipType["SIMILAR_TO"] = "SIMILAR_TO";
    RelationshipType["DERIVED_FROM"] = "DERIVED_FROM";
    RelationshipType["APPLIES_TO"] = "APPLIES_TO";
    RelationshipType["GOVERNED_BY"] = "GOVERNED_BY";
    RelationshipType["MATCHES"] = "MATCHES";
    RelationshipType["DEPENDS_ON"] = "DEPENDS_ON";
    RelationshipType["CONFLICTS_WITH"] = "CONFLICTS_WITH";
    RelationshipType["STRENGTHENS"] = "STRENGTHENS";
    RelationshipType["WEAKENS"] = "WEAKENS";
})(RelationshipType || (exports.RelationshipType = RelationshipType = {}));
class LegalOntologyService {
    neo4jService;
    constructor(neo4jService) {
        this.neo4jService = neo4jService;
    }
    async initialize() {
        try {
            await this.createCoreOntology();
            await this.createCommonPatterns();
            await this.createJurisdictions();
            await this.createConceptRelationships();
            logger.info('Legal ontology initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize legal ontology', { error });
            throw error;
        }
    }
    async createLegalConcept(concept) {
        const validatedConcept = exports.LegalConceptSchema.parse(concept);
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
    async getLegalConcept(id) {
        const query = `
      MATCH (lc:LegalConcept {id: $id})
      RETURN lc
    `;
        const result = await this.neo4jService.executeQuery(query, { id }, { cache: true });
        return result.records[0]?.get('lc').properties || null;
    }
    async searchLegalConcepts(query, category, difficultyRange) {
        let cypher = `
      CALL db.index.fulltext.queryNodes("legalConceptSearch", $query) YIELD node AS lc, score
    `;
        const parameters = { query };
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
    async getConceptsByDifficulty(minLevel, maxLevel, category) {
        let cypher = `
      MATCH (lc:LegalConcept)
      WHERE lc.difficulty_level >= $minLevel AND lc.difficulty_level <= $maxLevel
    `;
        const parameters = { minLevel, maxLevel };
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
    async createLegalClause(clause, conceptIds) {
        const validatedClause = exports.LegalClauseSchema.parse(clause);
        return await this.neo4jService.executeTransaction(async (tx) => {
            const createResult = await tx.run(`
        CREATE (lc:LegalClause $properties)
        RETURN lc
      `, { properties: validatedClause });
            const createdClause = createResult.records[0]?.get('lc').properties;
            if (conceptIds && conceptIds.length > 0) {
                await tx.run(`
          MATCH (lc:LegalClause {id: $clauseId})
          MATCH (concept:LegalConcept)
          WHERE concept.id IN $conceptIds
          CREATE (lc)-[:RELATES_TO]->(concept)
        `, { clauseId: createdClause.id, conceptIds });
            }
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
    async getClausesBySeverity(severity, minConfidence = 0.7, limit = 100) {
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
    async createPattern(pattern) {
        const validatedPattern = exports.PatternSchema.parse(pattern);
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
    async getPatternsByEffectiveness(minAccuracy = 0.8) {
        const query = `
      MATCH (p:Pattern)
      WHERE p.enabled = true AND p.accuracy >= $minAccuracy
      RETURN p
      ORDER BY p.accuracy DESC, p.frequency DESC
    `;
        const result = await this.neo4jService.executeQuery(query, { minAccuracy }, { cache: true });
        return result.records.map(record => record.get('p').properties);
    }
    async createDocument(document, jurisdictionCode) {
        const validatedDocument = exports.DocumentSchema.parse(document);
        return await this.neo4jService.executeTransaction(async (tx) => {
            const createResult = await tx.run(`
        CREATE (d:Document $properties)
        RETURN d
      `, { properties: validatedDocument });
            const createdDocument = createResult.records[0]?.get('d').properties;
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
    async createRelationship(fromNodeId, toNodeId, relationshipType, properties = {}) {
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
    async getRelatedConcepts(conceptId, relationshipTypes = [RelationshipType.REQUIRES, RelationshipType.DEPENDS_ON], maxDepth = 2) {
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
    async findSimilarClauses(clauseId, similarityThreshold = 0.8, limit = 10) {
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
    async getConceptPrerequisites(conceptId) {
        const query = `
      MATCH (target:LegalConcept {id: $conceptId})<-[:REQUIRES|DEPENDS_ON*1..3]-(prerequisite:LegalConcept)
      RETURN DISTINCT prerequisite
      ORDER BY prerequisite.difficulty_level ASC
    `;
        const result = await this.neo4jService.executeQuery(query, { conceptId }, { cache: true });
        return result.records.map(record => record.get('prerequisite').properties);
    }
    async createCoreOntology() {
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
        ].map(concept => ({ ...concept, id: (0, nanoid_1.nanoid)(), created_at: new Date(), updated_at: new Date() }));
        await this.neo4jService.executeQuery(coreConceptsQuery, { concepts });
        logger.info('Core legal concepts created', { count: concepts.length });
    }
    async createCommonPatterns() {
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
            id: (0, nanoid_1.nanoid)(),
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
    async createJurisdictions() {
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
    async createConceptRelationships() {
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
exports.LegalOntologyService = LegalOntologyService;
//# sourceMappingURL=legal-ontology-service.js.map