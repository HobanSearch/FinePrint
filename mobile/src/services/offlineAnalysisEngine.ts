/**
 * Offline Analysis Engine
 * Local pattern matching with cached models and SQLite storage
 */

import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { performanceMonitor } from '../utils/performance';
import { OCRResult } from './ocrService';

export interface AnalysisPattern {
  id: string;
  name: string;
  category: 'privacy' | 'financial' | 'legal' | 'data_collection' | 'termination' | 'liability';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  keywords: string[];
  regexPatterns: string[];
  contextPatterns: string[];
  weight: number;
  version: string;
  lastUpdated: string;
}

export interface AnalysisResult {
  id: string;
  documentId: string;
  analysisDate: string;
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  findings: Finding[];
  summary: AnalysisSummary;
  metadata: {
    patternsVersion: string;
    processingTime: number;
    textLength: number;
    confidence: number;
  };
}

export interface Finding {
  id: string;
  patternId: string;
  patternName: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  confidence: number;
  description: string;
  context: string;
  textSnippet: string;
  position: {
    start: number;
    end: number;
    page?: number;
  };
  recommendations: string[];
}

export interface AnalysisSummary {
  totalFindings: number;
  findingsByCategory: Record<string, number>;
  findingsBySeverity: Record<string, number>;
  topConcerns: string[];
  riskFactors: string[];
  positiveAspects: string[];
}

export interface CachedModel {
  id: string;
  name: string;
  version: string;
  type: 'patterns' | 'embeddings' | 'classifier';
  size: number;
  lastUpdated: string;
  filePath: string;
  checksum: string;
}

class OfflineAnalysisEngine {
  private db: SQLite.WebSQLDatabase | null = null;
  private patterns: AnalysisPattern[] = [];
  private modelsDirectory: string;
  private isInitialized = false;
  private cachedModels: Map<string, CachedModel> = new Map();

  constructor() {
    this.modelsDirectory = `${FileSystem.documentDirectory}models/`;
  }

  /**
   * Initialize the offline analysis engine
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing offline analysis engine...');

      // Initialize SQLite database
      await this.initializeDatabase();

      // Create models directory
      await this.ensureDirectoryExists(this.modelsDirectory);

      // Load cached patterns
      await this.loadCachedPatterns();

      // Load model information
      await this.loadCachedModels();

      this.isInitialized = true;
      logger.info('Offline analysis engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize offline analysis engine:', error);
      throw error;
    }
  }

  /**
   * Analyze document text using local patterns
   */
  async analyzeDocument(
    documentId: string,
    ocrResults: OCRResult[],
    options: {
      enableCaching?: boolean;
      minConfidence?: number;
    } = {}
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    performanceMonitor.startTimer('offline_analysis');

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const { enableCaching = true, minConfidence = 0.5 } = options;

      // Check for cached results
      if (enableCaching) {
        const cachedResult = await this.getCachedAnalysisResult(documentId);
        if (cachedResult) {
          logger.info('Using cached analysis result');
          return cachedResult;
        }
      }

      // Combine all OCR text
      const combinedText = ocrResults.map(result => result.text).join('\n\n');
      const averageConfidence = ocrResults.reduce((sum, result) => sum + result.confidence, 0) / ocrResults.length;

      if (averageConfidence < minConfidence) {
        logger.warn(`OCR confidence ${averageConfidence} below threshold ${minConfidence}`);
      }

      // Perform pattern matching
      const findings = await this.performPatternMatching(combinedText, ocrResults);

      // Calculate overall score and risk level
      const { overallScore, riskLevel } = this.calculateRiskScore(findings);

      // Generate summary
      const summary = this.generateAnalysisSummary(findings);

      const analysisResult: AnalysisResult = {
        id: `${documentId}_analysis_${Date.now()}`,
        documentId,
        analysisDate: new Date().toISOString(),
        overallScore,
        riskLevel,
        findings,
        summary,
        metadata: {
          patternsVersion: this.getPatternsVersion(),
          processingTime: Date.now() - startTime,
          textLength: combinedText.length,
          confidence: averageConfidence,
        },
      };

      // Cache the result
      if (enableCaching) {
        await this.cacheAnalysisResult(analysisResult);
      }

      const processingTime = performanceMonitor.endTimer('offline_analysis');
      logger.info(`Document analysis completed in ${processingTime}ms`);

      return analysisResult;
    } catch (error) {
      logger.error('Document analysis failed:', error);
      throw error;
    }
  }

  /**
   * Perform pattern matching against document text
   */
  private async performPatternMatching(
    text: string,
    ocrResults: OCRResult[]
  ): Promise<Finding[]> {
    const findings: Finding[] = [];
    const normalizedText = text.toLowerCase();

    for (const pattern of this.patterns) {
      try {
        // Keyword matching
        const keywordMatches = this.findKeywordMatches(normalizedText, pattern);
        
        // Regex pattern matching
        const regexMatches = this.findRegexMatches(text, pattern);
        
        // Context pattern matching
        const contextMatches = this.findContextMatches(normalizedText, pattern);

        // Combine and score matches
        const allMatches = [...keywordMatches, ...regexMatches, ...contextMatches];
        
        for (const match of allMatches) {
          const finding: Finding = {
            id: `${pattern.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            patternId: pattern.id,
            patternName: pattern.name,
            category: pattern.category,
            severity: pattern.severity,
            score: this.calculateMatchScore(match, pattern),
            confidence: match.confidence,
            description: pattern.description,
            context: this.extractContext(text, match.position),
            textSnippet: match.snippet,
            position: match.position,
            recommendations: this.generateRecommendations(pattern),
          };

          findings.push(finding);
        }
      } catch (error) {
        logger.warn(`Pattern matching failed for pattern ${pattern.id}:`, error);
      }
    }

    // Remove duplicates and sort by severity/score
    return this.deduplicateAndSort(findings);
  }

  /**
   * Find keyword matches in text
   */
  private findKeywordMatches(
    normalizedText: string,
    pattern: AnalysisPattern
  ): Array<{
    snippet: string;
    position: { start: number; end: number };
    confidence: number;
  }> {
    const matches: Array<{
      snippet: string;
      position: { start: number; end: number };
      confidence: number;
    }> = [];

    for (const keyword of pattern.keywords) {
      const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'gi');
      let match;

      while ((match = regex.exec(normalizedText)) !== null) {
        matches.push({
          snippet: match[0],
          position: { start: match.index, end: match.index + match[0].length },
          confidence: 0.8,
        });
      }
    }

    return matches;
  }

  /**
   * Find regex pattern matches in text
   */
  private findRegexMatches(
    text: string,
    pattern: AnalysisPattern
  ): Array<{
    snippet: string;
    position: { start: number; end: number };
    confidence: number;
  }> {
    const matches: Array<{
      snippet: string;
      position: { start: number; end: number };
      confidence: number;
    }> = [];

    for (const regexPattern of pattern.regexPatterns) {
      try {
        const regex = new RegExp(regexPattern, 'gi');
        let match;

        while ((match = regex.exec(text)) !== null) {
          matches.push({
            snippet: match[0],
            position: { start: match.index, end: match.index + match[0].length },
            confidence: 0.9,
          });
        }
      } catch (error) {
        logger.warn(`Invalid regex pattern: ${regexPattern}`, error);
      }
    }

    return matches;
  }

  /**
   * Find context pattern matches
   */
  private findContextMatches(
    normalizedText: string,
    pattern: AnalysisPattern
  ): Array<{
    snippet: string;
    position: { start: number; end: number };
    confidence: number;
  }> {
    const matches: Array<{
      snippet: string;
      position: { start: number; end: number };
      confidence: number;
    }> = [];

    for (const contextPattern of pattern.contextPatterns) {
      const words = contextPattern.toLowerCase().split(' ');
      const windowSize = 50; // words

      // Simple context matching - could be enhanced with NLP
      const textWords = normalizedText.split(/\s+/);
      
      for (let i = 0; i < textWords.length - words.length + 1; i++) {
        const window = textWords.slice(i, i + windowSize);
        const matchCount = words.filter(word => window.includes(word)).length;
        
        if (matchCount >= words.length * 0.7) { // 70% of words must match
          const start = normalizedText.indexOf(window[0]);
          const end = start + window.join(' ').length;
          
          matches.push({
            snippet: window.join(' '),
            position: { start, end },
            confidence: matchCount / words.length,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Calculate match score based on pattern weight and match quality
   */
  private calculateMatchScore(
    match: { confidence: number; snippet: string },
    pattern: AnalysisPattern
  ): number {
    const baseScore = pattern.weight * match.confidence;
    const snippetLength = match.snippet.length;
    const lengthMultiplier = Math.min(snippetLength / 50, 2); // Longer matches get higher scores
    
    return Math.min(baseScore * lengthMultiplier, 100);
  }

  /**
   * Extract context around a match
   */
  private extractContext(text: string, position: { start: number; end: number }): string {
    const contextLength = 200;
    const start = Math.max(0, position.start - contextLength);
    const end = Math.min(text.length, position.end + contextLength);
    
    return text.substring(start, end).trim();
  }

  /**
   * Generate recommendations for a pattern
   */
  private generateRecommendations(pattern: AnalysisPattern): string[] {
    const recommendations: Record<string, string[]> = {
      privacy: [
        'Review data collection practices',
        'Check opt-out options',
        'Verify data sharing policies',
      ],
      financial: [
        'Review billing terms carefully',
        'Check for hidden fees',
        'Understand cancellation policy',
      ],
      legal: [
        'Consider legal implications',
        'Consult with legal counsel if needed',
        'Review jurisdiction clauses',
      ],
      data_collection: [
        'Understand what data is collected',
        'Check data retention periods',
        'Review third-party sharing',
      ],
      termination: [
        'Review termination conditions',
        'Check notice requirements',
        'Understand data handling after termination',
      ],
      liability: [
        'Review liability limitations',
        'Check indemnification clauses',
        'Understand dispute resolution process',
      ],
    };

    return recommendations[pattern.category] || ['Review this clause carefully'];
  }

  /**
   * Calculate overall risk score and level
   */
  private calculateRiskScore(findings: Finding[]): {
    overallScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  } {
    if (findings.length === 0) {
      return { overallScore: 0, riskLevel: 'low' };
    }

    const severityWeights = { low: 1, medium: 2, high: 3, critical: 4 };
    const totalWeight = findings.reduce(
      (sum, finding) => sum + severityWeights[finding.severity] * finding.score,
      0
    );

    const averageScore = totalWeight / findings.length;
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;

    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    
    if (criticalCount > 0 || averageScore > 80) {
      riskLevel = 'critical';
    } else if (highCount > 2 || averageScore > 60) {
      riskLevel = 'high';
    } else if (averageScore > 30) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return { overallScore: Math.round(averageScore), riskLevel };
  }

  /**
   * Generate analysis summary
   */
  private generateAnalysisSummary(findings: Finding[]): AnalysisSummary {
    const findingsByCategory: Record<string, number> = {};
    const findingsBySeverity: Record<string, number> = {};

    findings.forEach(finding => {
      findingsByCategory[finding.category] = (findingsByCategory[finding.category] || 0) + 1;
      findingsBySeverity[finding.severity] = (findingsBySeverity[finding.severity] || 0) + 1;
    });

    const topConcerns = findings
      .filter(f => f.severity === 'critical' || f.severity === 'high')
      .slice(0, 5)
      .map(f => f.patternName);

    const riskFactors = Object.keys(findingsByCategory)
      .filter(category => findingsByCategory[category] > 1)
      .slice(0, 3);

    return {
      totalFindings: findings.length,
      findingsByCategory,
      findingsBySeverity,
      topConcerns,
      riskFactors,
      positiveAspects: [], // Would be populated with positive pattern matches
    };
  }

  /**
   * Remove duplicate findings and sort by importance
   */
  private deduplicateAndSort(findings: Finding[]): Finding[] {
    // Simple deduplication based on pattern and position similarity
    const unique = findings.filter((finding, index, array) => {
      return !array.slice(0, index).some(prev => 
        prev.patternId === finding.patternId &&
        Math.abs(prev.position.start - finding.position.start) < 50
      );
    });

    // Sort by severity and score
    return unique.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      
      if (severityDiff !== 0) return severityDiff;
      return b.score - a.score;
    });
  }

  /**
   * Database and caching methods
   */
  private async initializeDatabase(): Promise<void> {
    this.db = SQLite.openDatabase('fine_print_analysis.db');
    
    await this.executeSql(`
      CREATE TABLE IF NOT EXISTS analysis_results (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        result_data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(document_id)
      )
    `);

    await this.executeSql(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        pattern_data TEXT NOT NULL,
        version TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  private async executeSql(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.transaction(tx => {
        tx.executeSql(
          sql,
          params,
          (_, result) => resolve(result),
          (_, error) => {
            reject(error);
            return false;
          }
        );
      });
    });
  }

  private async loadCachedPatterns(): Promise<void> {
    try {
      // First try to load from SQLite
      const result = await this.executeSql('SELECT * FROM patterns ORDER BY updated_at DESC');
      
      if (result.rows.length > 0) {
        const patternsData = JSON.parse(result.rows.item(0).pattern_data);
        this.patterns = patternsData;
        logger.info(`Loaded ${this.patterns.length} patterns from cache`);
        return;
      }

      // Fallback to default patterns
      await this.loadDefaultPatterns();
    } catch (error) {
      logger.error('Failed to load cached patterns:', error);
      await this.loadDefaultPatterns();
    }
  }

  private async loadDefaultPatterns(): Promise<void> {
    // Load default patterns - in production, these would be more comprehensive
    this.patterns = [
      {
        id: 'auto_renewal',
        name: 'Automatic Renewal',
        category: 'financial',
        severity: 'medium',
        description: 'Automatic renewal clause that may be difficult to cancel',
        keywords: ['automatic renewal', 'auto-renew', 'automatically renew'],
        regexPatterns: ['auto.{0,10}renew', 'automatic.{0,20}renewal'],
        contextPatterns: ['subscription automatically renews', 'will be charged automatically'],
        weight: 70,
        version: '1.0',
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'data_sharing',
        name: 'Broad Data Sharing',
        category: 'privacy',
        severity: 'high',
        description: 'Broad permissions for sharing personal data with third parties',
        keywords: ['share data', 'third parties', 'partners', 'affiliates'],
        regexPatterns: ['share.{0,20}information.{0,20}third.{0,10}part'],
        contextPatterns: ['may share your information with third parties'],
        weight: 85,
        version: '1.0',
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'class_action_waiver',
        name: 'Class Action Waiver',
        category: 'legal',
        severity: 'critical',
        description: 'Waiver of right to participate in class action lawsuits',
        keywords: ['class action', 'waive', 'jury trial'],
        regexPatterns: ['waiv.{0,10}class.{0,10}action', 'no.{0,10}class.{0,10}action'],
        contextPatterns: ['waive right to class action', 'agree not to participate in class action'],
        weight: 95,
        version: '1.0',
        lastUpdated: new Date().toISOString(),
      },
    ];

    // Cache the default patterns
    await this.cachePatterns(this.patterns);
    logger.info('Loaded default patterns');
  }

  private async cachePatterns(patterns: AnalysisPattern[]): Promise<void> {
    try {
      await this.executeSql(
        'INSERT OR REPLACE INTO patterns (id, pattern_data, version, updated_at) VALUES (?, ?, ?, ?)',
        ['default', JSON.stringify(patterns), '1.0', new Date().toISOString()]
      );
    } catch (error) {
      logger.error('Failed to cache patterns:', error);
    }
  }

  private async getCachedAnalysisResult(documentId: string): Promise<AnalysisResult | null> {
    try {
      const result = await this.executeSql(
        'SELECT result_data FROM analysis_results WHERE document_id = ?',
        [documentId]
      );

      if (result.rows.length > 0) {
        return JSON.parse(result.rows.item(0).result_data);
      }

      return null;
    } catch (error) {
      logger.error('Failed to get cached analysis result:', error);
      return null;
    }
  }

  private async cacheAnalysisResult(result: AnalysisResult): Promise<void> {
    try {
      await this.executeSql(
        'INSERT OR REPLACE INTO analysis_results (id, document_id, result_data, created_at) VALUES (?, ?, ?, ?)',
        [result.id, result.documentId, JSON.stringify(result), result.analysisDate]
      );
    } catch (error) {
      logger.error('Failed to cache analysis result:', error);
    }
  }

  private async loadCachedModels(): Promise<void> {
    try {
      const modelsInfo = await AsyncStorage.getItem('cached_models');
      if (modelsInfo) {
        const models: CachedModel[] = JSON.parse(modelsInfo);
        models.forEach(model => this.cachedModels.set(model.id, model));
        logger.info(`Loaded ${models.length} cached models`);
      }
    } catch (error) {
      logger.error('Failed to load cached models:', error);
    }
  }

  private getPatternsVersion(): string {
    return '1.0'; // Would be dynamic based on loaded patterns
  }

  private async ensureDirectoryExists(directory: string): Promise<void> {
    const info = await FileSystem.getInfoAsync(directory);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    }
  }

  /**
   * Update patterns from server (when online)
   */
  async updatePatterns(newPatterns: AnalysisPattern[]): Promise<void> {
    try {
      this.patterns = newPatterns;
      await this.cachePatterns(newPatterns);
      logger.info(`Updated ${newPatterns.length} patterns`);
    } catch (error) {
      logger.error('Failed to update patterns:', error);
      throw error;
    }
  }

  /**
   * Get analysis statistics
   */
  async getAnalysisStats(): Promise<{
    totalAnalyses: number;
    averageProcessingTime: number;
    patternMatchStats: Record<string, number>;
  }> {
    try {
      const result = await this.executeSql('SELECT COUNT(*) as count FROM analysis_results');
      const totalAnalyses = result.rows.item(0).count;

      return {
        totalAnalyses,
        averageProcessingTime: 0, // Would calculate from stored results
        patternMatchStats: {}, // Would aggregate pattern match counts
      };
    } catch (error) {
      logger.error('Failed to get analysis stats:', error);
      return {
        totalAnalyses: 0,
        averageProcessingTime: 0,
        patternMatchStats: {},
      };
    }
  }
}

export const offlineAnalysisEngine = new OfflineAnalysisEngine();