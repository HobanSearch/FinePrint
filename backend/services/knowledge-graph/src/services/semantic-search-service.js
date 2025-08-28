"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SemanticSearchService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const compromise_1 = require("compromise");
const stemmer_1 = require("stemmer");
const natural = __importStar(require("natural"));
const logger = (0, logger_1.createServiceLogger)('semantic-search-service');
class SemanticSearchService {
    neo4jService;
    stemmer = stemmer_1.stemmer;
    tfidf = new natural.TfIdf();
    initialized = false;
    constructor(neo4jService) {
        this.neo4jService = neo4jService;
    }
    async initialize() {
        this.initialized = true;
        logger.info('Semantic Search Service initialized');
    }
    async expandQuery(query) {
        const doc = (0, compromise_1.compromise)(query);
        const expansions = new Set();
        expansions.add(query);
        const words = query.toLowerCase().split(/\s+/);
        words.forEach(word => {
            expansions.add(this.stemmer(word));
        });
        const synonyms = await this.getSynonyms(words);
        synonyms.forEach(synonym => expansions.add(synonym));
        return Array.from(expansions);
    }
    async searchAcrossTypes(query, limit = 20) {
        const results = [];
        const conceptResults = await this.searchConcepts(query, Math.ceil(limit / 4));
        results.push(...conceptResults);
        const clauseResults = await this.searchClauses(query, Math.ceil(limit / 4));
        results.push(...clauseResults);
        const patternResults = await this.searchPatterns(query, Math.ceil(limit / 4));
        results.push(...patternResults);
        const documentResults = await this.searchDocuments(query, Math.ceil(limit / 4));
        results.push(...documentResults);
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
    async searchConcepts(query, limit) {
        try {
            const cypher = `
        CALL db.index.fulltext.queryNodes("legalConceptSearch", $query) YIELD node, score
        RETURN node, score
        LIMIT $limit
      `;
            const result = await this.neo4jService.executeQuery(cypher, { query, limit });
            return result.records.map(record => ({
                type: 'CONCEPT',
                id: record.get('node').properties.id,
                score: record.get('score'),
                data: record.get('node').properties,
                semantic_features: this.extractSemanticFeatures(query),
            }));
        }
        catch (error) {
            logger.warn('Concept search failed', { error, query });
            return [];
        }
    }
    async searchClauses(query, limit) {
        try {
            const cypher = `
        CALL db.index.fulltext.queryNodes("legalClauseSearch", $query) YIELD node, score
        RETURN node, score
        LIMIT $limit
      `;
            const result = await this.neo4jService.executeQuery(cypher, { query, limit });
            return result.records.map(record => ({
                type: 'CLAUSE',
                id: record.get('node').properties.id,
                score: record.get('score'),
                data: record.get('node').properties,
                semantic_features: this.extractSemanticFeatures(query),
            }));
        }
        catch (error) {
            logger.warn('Clause search failed', { error, query });
            return [];
        }
    }
    async searchPatterns(query, limit) {
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
                type: 'PATTERN',
                id: record.get('p').properties.id,
                score: record.get('score'),
                data: record.get('p').properties,
                semantic_features: this.extractSemanticFeatures(query),
            }));
        }
        catch (error) {
            logger.warn('Pattern search failed', { error, query });
            return [];
        }
    }
    async searchDocuments(query, limit) {
        try {
            const cypher = `
        CALL db.index.fulltext.queryNodes("documentSearch", $query) YIELD node, score
        RETURN node, score
        LIMIT $limit
      `;
            const result = await this.neo4jService.executeQuery(cypher, { query, limit });
            return result.records.map(record => ({
                type: 'DOCUMENT',
                id: record.get('node').properties.id,
                score: record.get('score'),
                data: record.get('node').properties,
                semantic_features: this.extractSemanticFeatures(query),
            }));
        }
        catch (error) {
            logger.warn('Document search failed', { error, query });
            return [];
        }
    }
    extractSemanticFeatures(text) {
        const doc = (0, compromise_1.compromise)(text);
        return {
            keywords: doc.nouns().out('array'),
            entities: doc.people().out('array').concat(doc.places().out('array')),
            sentiment: 0,
            complexity: text.split(' ').length / 10,
        };
    }
    async getSynonyms(words) {
        const synonymMap = {
            'data': ['information', 'details', 'records'],
            'privacy': ['confidentiality', 'secrecy', 'protection'],
            'liability': ['responsibility', 'accountability', 'obligation'],
            'termination': ['ending', 'closure', 'cancellation'],
            'sharing': ['disclosure', 'distribution', 'dissemination'],
        };
        const synonyms = [];
        for (const word of words) {
            const wordSynonyms = synonymMap[word.toLowerCase()];
            if (wordSynonyms) {
                synonyms.push(...wordSynonyms);
            }
        }
        return synonyms;
    }
}
exports.SemanticSearchService = SemanticSearchService;
//# sourceMappingURL=semantic-search-service.js.map