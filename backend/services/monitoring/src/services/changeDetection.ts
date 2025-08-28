import { createServiceLogger } from '@fineprintai/shared-logger';
import * as diff from 'diff';
import * as crypto from 'crypto';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { 
  ChangeAnalysisRequest, 
  ChangeAnalysisResponse, 
  TextSection,
  DocumentChangeDetected 
} from '@fineprintai/shared-types';

const logger = createServiceLogger('change-detection-engine');

interface DetectionConfig {
  minSignificantChange: number;
  structuralChangeThreshold: number;
  semanticAnalysisEnabled: boolean;
  ignoreMinorFormatting: boolean;
}

interface DiffStats {
  totalChanges: number;
  additions: number;
  deletions: number;
  modifications: number;
  structuralChanges: number;
}

class ChangeDetectionEngine {
  private turndownService: TurndownService;
  private config: DetectionConfig;
  private initialized = false;

  constructor() {
    this.config = {
      minSignificantChange: 0.05, // 5% change threshold
      structuralChangeThreshold: 0.15, // 15% for structural changes
      semanticAnalysisEnabled: true,
      ignoreMinorFormatting: true,
    };

    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
    });

    // Configure turndown to ignore minor formatting
    if (this.config.ignoreMinorFormatting) {
      this.turndownService.remove(['style', 'script', 'noscript']);
      this.turndownService.addRule('removeSpans', {
        filter: 'span',
        replacement: (content) => content,
      });
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('Initializing change detection engine...');
    
    try {
      // Test the turndown service
      const testHtml = '<p>Test content</p>';
      const testMarkdown = this.turndownService.turndown(testHtml);
      
      if (!testMarkdown) {
        throw new Error('Turndown service not working properly');
      }

      this.initialized = true;
      logger.info('Change detection engine initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize change detection engine', { error });
      throw error;
    }
  }

  async analyzeChanges(request: ChangeAnalysisRequest): Promise<ChangeAnalysisResponse> {
    if (!this.initialized) {
      throw new Error('Change detection engine not initialized');
    }

    const startTime = Date.now();
    
    try {
      logger.debug('Starting change analysis', {
        oldContentLength: request.oldContent.length,
        newContentLength: request.newContent.length,
        documentType: request.documentType,
      });

      // Normalize content for comparison
      const normalizedOld = await this.normalizeContent(request.oldContent, request.documentType);
      const normalizedNew = await this.normalizeContent(request.newContent, request.documentType);

      // Generate content hashes for quick comparison
      const oldHash = this.generateContentHash(normalizedOld);
      const newHash = this.generateContentHash(normalizedNew);

      if (oldHash === newHash) {
        return {
          changeType: 'minor',
          changeSummary: 'No significant changes detected',
          significantChanges: [],
          riskChange: 0,
          addedSections: [],
          removedSections: [],
          modifiedSections: [],
        };
      }

      // Perform detailed diff analysis
      const diffResult = this.generateDetailedDiff(normalizedOld, normalizedNew);
      const diffStats = this.calculateDiffStats(diffResult);

      // Analyze sections
      const sections = await this.analyzeSections(normalizedOld, normalizedNew, diffResult);

      // Determine change type and severity
      const changeType = this.determineChangeType(diffStats, sections);
      const riskChange = await this.calculateRiskChange(sections, request.documentType);

      // Generate human-readable summary
      const changeSummary = this.generateChangeSummary(diffStats, sections, changeType);
      const significantChanges = this.extractSignificantChanges(sections);

      const analysisTime = Date.now() - startTime;
      logger.info('Change analysis completed', {
        changeType,
        riskChange,
        analysisTime,
        totalChanges: diffStats.totalChanges,
      });

      return {
        changeType,
        changeSummary,
        significantChanges,
        riskChange,
        addedSections: sections.added,
        removedSections: sections.removed,
        modifiedSections: sections.modified,
      };

    } catch (error) {
      logger.error('Change analysis failed', { error });
      throw error;
    }
  }

  private async normalizeContent(content: string, documentType: string): Promise<string> {
    let normalized = content;

    // Handle HTML content
    if (documentType === 'html' || content.includes('<html') || content.includes('<!DOCTYPE')) {
      const dom = new JSDOM(content);
      const document = dom.window.document;

      // Remove scripts, styles, and other non-content elements
      const elementsToRemove = document.querySelectorAll('script, style, noscript, meta, link');
      elementsToRemove.forEach(el => el.remove());

      // Convert to markdown for consistent comparison
      normalized = this.turndownService.turndown(document.body.innerHTML || content);
    }

    // Normalize whitespace
    normalized = normalized
      .replace(/\r\n/g, '\n') // Convert CRLF to LF
      .replace(/\r/g, '\n')   // Convert CR to LF
      .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines
      .trim();

    return normalized;
  }

  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private generateDetailedDiff(oldContent: string, newContent: string): diff.Change[] {
    // Use word-level diff for more granular analysis
    return diff.diffWordsWithSpace(oldContent, newContent, {
      ignoreCase: false,
      ignoreWhitespace: this.config.ignoreMinorFormatting,
    });
  }

  private calculateDiffStats(diffResult: diff.Change[]): DiffStats {
    const stats: DiffStats = {
      totalChanges: 0,
      additions: 0,
      deletions: 0,
      modifications: 0,
      structuralChanges: 0,
    };

    for (const change of diffResult) {
      if (change.added) {
        stats.additions += change.count || 0;
        stats.totalChanges += change.count || 0;
        
        // Check for structural changes (headings, lists, etc.)
        if (this.isStructuralChange(change.value)) {
          stats.structuralChanges++;
        }
      } else if (change.removed) {
        stats.deletions += change.count || 0;
        stats.totalChanges += change.count || 0;
        
        if (this.isStructuralChange(change.value)) {
          stats.structuralChanges++;
        }
      }
    }

    stats.modifications = Math.min(stats.additions, stats.deletions);
    return stats;
  }

  private isStructuralChange(text: string): boolean {
    // Check for markdown structure indicators
    const structuralPatterns = [
      /^#{1,6}\s/, // Headers
      /^\s*[-*+]\s/, // Lists
      /^\s*\d+\.\s/, // Numbered lists
      /^\s*>\s/, // Blockquotes
      /^```/, // Code blocks
      /^\|.*\|/, // Tables
    ];

    return structuralPatterns.some(pattern => pattern.test(text));
  }

  private async analyzeSections(
    oldContent: string, 
    newContent: string, 
    diffResult: diff.Change[]
  ): Promise<{
    added: TextSection[];
    removed: TextSection[];
    modified: TextSection[];
  }> {
    const sections = {
      added: [] as TextSection[],
      removed: [] as TextSection[],
      modified: [] as TextSection[],
    };

    let position = 0;
    
    for (const change of diffResult) {
      const content = change.value;
      const startPosition = position;
      const endPosition = position + content.length;

      if (change.added) {
        const section: TextSection = {
          content: content.trim(),
          startPosition,
          endPosition,
          category: this.categorizeContent(content),
          severity: await this.assessSeverity(content, 'added'),
        };
        sections.added.push(section);
      } else if (change.removed) {
        const section: TextSection = {
          content: content.trim(),
          startPosition,
          endPosition,
          category: this.categorizeContent(content),
          severity: await this.assessSeverity(content, 'removed'),
        };
        sections.removed.push(section);
      }

      if (!change.removed) {
        position = endPosition;
      }
    }

    // Identify modified sections (paired additions/deletions)
    sections.modified = this.identifyModifiedSections(sections.added, sections.removed);

    return sections;
  }

  private categorizeContent(content: string): string {
    const text = content.toLowerCase();
    
    if (text.includes('privacy') || text.includes('data')) return 'privacy';
    if (text.includes('terms') || text.includes('agreement')) return 'terms';
    if (text.includes('cookie') || text.includes('tracking')) return 'cookies';
    if (text.includes('liability') || text.includes('disclaimer')) return 'liability';
    if (text.includes('payment') || text.includes('billing')) return 'payment';
    if (text.includes('refund') || text.includes('cancellation')) return 'refund';
    if (text.includes('intellectual property') || text.includes('copyright')) return 'ip';
    if (text.includes('dispute') || text.includes('arbitration')) return 'dispute';
    
    return 'general';
  }

  private async assessSeverity(content: string, changeType: 'added' | 'removed'): Promise<'low' | 'medium' | 'high' | 'critical'> {
    const text = content.toLowerCase();
    
    // Critical keywords that indicate high-severity changes
    const criticalKeywords = [
      'class action', 'arbitration', 'waive', 'waiver',
      'jurisdiction', 'governing law', 'dispute resolution',
      'automatically renew', 'auto-renewal', 'cancellation fee'
    ];

    // High severity keywords
    const highKeywords = [
      'liability', 'damages', 'indemnify', 'indemnification',
      'third party', 'personal data', 'sensitive information',
      'termination', 'suspend', 'disable account'
    ];

    // Medium severity keywords
    const mediumKeywords = [
      'modify', 'change', 'update', 'revise',
      'fee', 'charge', 'payment', 'billing',
      'content', 'intellectual property', 'license'
    ];

    if (criticalKeywords.some(keyword => text.includes(keyword))) {
      return 'critical';
    }
    
    if (highKeywords.some(keyword => text.includes(keyword))) {
      return 'high';
    }
    
    if (mediumKeywords.some(keyword => text.includes(keyword))) {
      return 'medium';
    }

    // Consider change type and content length
    if (changeType === 'removed' && content.length > 100) {
      return 'high'; // Removing substantial content is concerning
    }

    return 'low';
  }

  private identifyModifiedSections(added: TextSection[], removed: TextSection[]): TextSection[] {
    const modified: TextSection[] = [];
    const usedAdded = new Set<number>();
    const usedRemoved = new Set<number>();

    for (let i = 0; i < removed.length; i++) {
      if (usedRemoved.has(i)) continue;

      const removedSection = removed[i];
      
      for (let j = 0; j < added.length; j++) {
        if (usedAdded.has(j)) continue;

        const addedSection = added[j];
        
        // Check if sections are related (similar category and position)
        if (
          removedSection.category === addedSection.category &&
          this.calculateSimilarity(removedSection.content, addedSection.content) > 0.3
        ) {
          modified.push({
            content: `${removedSection.content} → ${addedSection.content}`,
            startPosition: removedSection.startPosition,
            endPosition: addedSection.endPosition,
            category: removedSection.category,
            severity: this.getHigherSeverity(removedSection.severity!, addedSection.severity!),
          });

          usedAdded.add(j);
          usedRemoved.add(i);
          break;
        }
      }
    }

    return modified;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);
    
    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  private getHigherSeverity(severity1: string, severity2: string): 'low' | 'medium' | 'high' | 'critical' {
    const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
    const higher = Math.max(severityOrder[severity1 as keyof typeof severityOrder], 
                           severityOrder[severity2 as keyof typeof severityOrder]);
    
    return Object.keys(severityOrder).find(key => 
      severityOrder[key as keyof typeof severityOrder] === higher
    ) as 'low' | 'medium' | 'high' | 'critical';
  }

  private determineChangeType(diffStats: DiffStats, sections: any): 'minor' | 'major' | 'structural' {
    const totalWords = diffStats.totalChanges;
    
    // Check for structural changes
    if (diffStats.structuralChanges > 0 || 
        sections.added.some((s: TextSection) => s.severity === 'critical') ||
        sections.removed.some((s: TextSection) => s.severity === 'critical')) {
      return 'structural';
    }

    // Check change percentage (approximate)
    const changePercentage = totalWords / Math.max(totalWords + 1000, 1000); // Rough estimate
    
    if (changePercentage > this.config.structuralChangeThreshold) {
      return 'major';
    }
    
    if (changePercentage > this.config.minSignificantChange) {
      return 'major';
    }

    return 'minor';
  }

  private async calculateRiskChange(sections: any, documentType: string): Promise<number> {
    let riskChange = 0;
    
    // Analyze added sections for risk increase
    for (const section of sections.added) {
      switch (section.severity) {
        case 'critical': riskChange += 25; break;
        case 'high': riskChange += 15; break;
        case 'medium': riskChange += 5; break;
        case 'low': riskChange += 1; break;
      }
    }

    // Analyze removed sections for risk decrease
    for (const section of sections.removed) {
      switch (section.severity) {
        case 'critical': riskChange -= 20; break;
        case 'high': riskChange -= 10; break;
        case 'medium': riskChange -= 3; break;
        case 'low': riskChange -= 1; break;
      }
    }

    // Cap the risk change
    return Math.max(-100, Math.min(100, riskChange));
  }

  private generateChangeSummary(diffStats: DiffStats, sections: any, changeType: string): string {
    const parts = [];
    
    if (diffStats.additions > 0) {
      parts.push(`${diffStats.additions} additions`);
    }
    
    if (diffStats.deletions > 0) {
      parts.push(`${diffStats.deletions} deletions`);
    }
    
    if (sections.modified.length > 0) {
      parts.push(`${sections.modified.length} modifications`);
    }

    const summary = parts.join(', ');
    
    switch (changeType) {
      case 'structural':
        return `Structural changes detected: ${summary}`;
      case 'major':
        return `Major changes detected: ${summary}`;
      default:
        return `Minor changes detected: ${summary}`;
    }
  }

  private extractSignificantChanges(sections: any): string[] {
    const significant = [];
    
    // Extract high and critical severity changes
    for (const section of [...sections.added, ...sections.removed, ...sections.modified]) {
      if (section.severity === 'critical' || section.severity === 'high') {
        const changeType = sections.added.includes(section) ? 'Added' : 
                          sections.removed.includes(section) ? 'Removed' : 'Modified';
        
        significant.push(`${changeType}: ${section.content.substring(0, 100)}...`);
      }
    }

    return significant.slice(0, 10); // Limit to top 10 changes
  }

  async healthCheck(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Change detection engine not initialized');
    }

    // Test basic functionality
    const testResult = await this.analyzeChanges({
      oldContent: 'test content',
      newContent: 'test content modified',
      documentType: 'text',
    });

    if (!testResult) {
      throw new Error('Change detection engine health check failed');
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down change detection engine...');
    this.initialized = false;
    logger.info('Change detection engine shutdown complete');
  }
}

export const changeDetectionEngine = new ChangeDetectionEngine();