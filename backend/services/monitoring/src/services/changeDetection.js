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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeDetectionEngine = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const diff = __importStar(require("diff"));
const crypto = __importStar(require("crypto"));
const jsdom_1 = require("jsdom");
const turndown_1 = __importDefault(require("turndown"));
const logger = (0, logger_1.createServiceLogger)('change-detection-engine');
class ChangeDetectionEngine {
    turndownService;
    config;
    initialized = false;
    constructor() {
        this.config = {
            minSignificantChange: 0.05,
            structuralChangeThreshold: 0.15,
            semanticAnalysisEnabled: true,
            ignoreMinorFormatting: true,
        };
        this.turndownService = new turndown_1.default({
            headingStyle: 'atx',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced',
        });
        if (this.config.ignoreMinorFormatting) {
            this.turndownService.remove(['style', 'script', 'noscript']);
            this.turndownService.addRule('removeSpans', {
                filter: 'span',
                replacement: (content) => content,
            });
        }
    }
    async initialize() {
        if (this.initialized)
            return;
        logger.info('Initializing change detection engine...');
        try {
            const testHtml = '<p>Test content</p>';
            const testMarkdown = this.turndownService.turndown(testHtml);
            if (!testMarkdown) {
                throw new Error('Turndown service not working properly');
            }
            this.initialized = true;
            logger.info('Change detection engine initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize change detection engine', { error });
            throw error;
        }
    }
    async analyzeChanges(request) {
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
            const normalizedOld = await this.normalizeContent(request.oldContent, request.documentType);
            const normalizedNew = await this.normalizeContent(request.newContent, request.documentType);
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
            const diffResult = this.generateDetailedDiff(normalizedOld, normalizedNew);
            const diffStats = this.calculateDiffStats(diffResult);
            const sections = await this.analyzeSections(normalizedOld, normalizedNew, diffResult);
            const changeType = this.determineChangeType(diffStats, sections);
            const riskChange = await this.calculateRiskChange(sections, request.documentType);
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
        }
        catch (error) {
            logger.error('Change analysis failed', { error });
            throw error;
        }
    }
    async normalizeContent(content, documentType) {
        let normalized = content;
        if (documentType === 'html' || content.includes('<html') || content.includes('<!DOCTYPE')) {
            const dom = new jsdom_1.JSDOM(content);
            const document = dom.window.document;
            const elementsToRemove = document.querySelectorAll('script, style, noscript, meta, link');
            elementsToRemove.forEach(el => el.remove());
            normalized = this.turndownService.turndown(document.body.innerHTML || content);
        }
        normalized = normalized
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/[ \t]+$/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        return normalized;
    }
    generateContentHash(content) {
        return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    }
    generateDetailedDiff(oldContent, newContent) {
        return diff.diffWordsWithSpace(oldContent, newContent, {
            ignoreCase: false,
            ignoreWhitespace: this.config.ignoreMinorFormatting,
        });
    }
    calculateDiffStats(diffResult) {
        const stats = {
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
                if (this.isStructuralChange(change.value)) {
                    stats.structuralChanges++;
                }
            }
            else if (change.removed) {
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
    isStructuralChange(text) {
        const structuralPatterns = [
            /^#{1,6}\s/,
            /^\s*[-*+]\s/,
            /^\s*\d+\.\s/,
            /^\s*>\s/,
            /^```/,
            /^\|.*\|/,
        ];
        return structuralPatterns.some(pattern => pattern.test(text));
    }
    async analyzeSections(oldContent, newContent, diffResult) {
        const sections = {
            added: [],
            removed: [],
            modified: [],
        };
        let position = 0;
        for (const change of diffResult) {
            const content = change.value;
            const startPosition = position;
            const endPosition = position + content.length;
            if (change.added) {
                const section = {
                    content: content.trim(),
                    startPosition,
                    endPosition,
                    category: this.categorizeContent(content),
                    severity: await this.assessSeverity(content, 'added'),
                };
                sections.added.push(section);
            }
            else if (change.removed) {
                const section = {
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
        sections.modified = this.identifyModifiedSections(sections.added, sections.removed);
        return sections;
    }
    categorizeContent(content) {
        const text = content.toLowerCase();
        if (text.includes('privacy') || text.includes('data'))
            return 'privacy';
        if (text.includes('terms') || text.includes('agreement'))
            return 'terms';
        if (text.includes('cookie') || text.includes('tracking'))
            return 'cookies';
        if (text.includes('liability') || text.includes('disclaimer'))
            return 'liability';
        if (text.includes('payment') || text.includes('billing'))
            return 'payment';
        if (text.includes('refund') || text.includes('cancellation'))
            return 'refund';
        if (text.includes('intellectual property') || text.includes('copyright'))
            return 'ip';
        if (text.includes('dispute') || text.includes('arbitration'))
            return 'dispute';
        return 'general';
    }
    async assessSeverity(content, changeType) {
        const text = content.toLowerCase();
        const criticalKeywords = [
            'class action', 'arbitration', 'waive', 'waiver',
            'jurisdiction', 'governing law', 'dispute resolution',
            'automatically renew', 'auto-renewal', 'cancellation fee'
        ];
        const highKeywords = [
            'liability', 'damages', 'indemnify', 'indemnification',
            'third party', 'personal data', 'sensitive information',
            'termination', 'suspend', 'disable account'
        ];
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
        if (changeType === 'removed' && content.length > 100) {
            return 'high';
        }
        return 'low';
    }
    identifyModifiedSections(added, removed) {
        const modified = [];
        const usedAdded = new Set();
        const usedRemoved = new Set();
        for (let i = 0; i < removed.length; i++) {
            if (usedRemoved.has(i))
                continue;
            const removedSection = removed[i];
            for (let j = 0; j < added.length; j++) {
                if (usedAdded.has(j))
                    continue;
                const addedSection = added[j];
                if (removedSection.category === addedSection.category &&
                    this.calculateSimilarity(removedSection.content, addedSection.content) > 0.3) {
                    modified.push({
                        content: `${removedSection.content} → ${addedSection.content}`,
                        startPosition: removedSection.startPosition,
                        endPosition: addedSection.endPosition,
                        category: removedSection.category,
                        severity: this.getHigherSeverity(removedSection.severity, addedSection.severity),
                    });
                    usedAdded.add(j);
                    usedRemoved.add(i);
                    break;
                }
            }
        }
        return modified;
    }
    calculateSimilarity(text1, text2) {
        const words1 = text1.toLowerCase().split(/\s+/);
        const words2 = text2.toLowerCase().split(/\s+/);
        const commonWords = words1.filter(word => words2.includes(word));
        const totalWords = Math.max(words1.length, words2.length);
        return totalWords > 0 ? commonWords.length / totalWords : 0;
    }
    getHigherSeverity(severity1, severity2) {
        const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
        const higher = Math.max(severityOrder[severity1], severityOrder[severity2]);
        return Object.keys(severityOrder).find(key => severityOrder[key] === higher);
    }
    determineChangeType(diffStats, sections) {
        const totalWords = diffStats.totalChanges;
        if (diffStats.structuralChanges > 0 ||
            sections.added.some((s) => s.severity === 'critical') ||
            sections.removed.some((s) => s.severity === 'critical')) {
            return 'structural';
        }
        const changePercentage = totalWords / Math.max(totalWords + 1000, 1000);
        if (changePercentage > this.config.structuralChangeThreshold) {
            return 'major';
        }
        if (changePercentage > this.config.minSignificantChange) {
            return 'major';
        }
        return 'minor';
    }
    async calculateRiskChange(sections, documentType) {
        let riskChange = 0;
        for (const section of sections.added) {
            switch (section.severity) {
                case 'critical':
                    riskChange += 25;
                    break;
                case 'high':
                    riskChange += 15;
                    break;
                case 'medium':
                    riskChange += 5;
                    break;
                case 'low':
                    riskChange += 1;
                    break;
            }
        }
        for (const section of sections.removed) {
            switch (section.severity) {
                case 'critical':
                    riskChange -= 20;
                    break;
                case 'high':
                    riskChange -= 10;
                    break;
                case 'medium':
                    riskChange -= 3;
                    break;
                case 'low':
                    riskChange -= 1;
                    break;
            }
        }
        return Math.max(-100, Math.min(100, riskChange));
    }
    generateChangeSummary(diffStats, sections, changeType) {
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
    extractSignificantChanges(sections) {
        const significant = [];
        for (const section of [...sections.added, ...sections.removed, ...sections.modified]) {
            if (section.severity === 'critical' || section.severity === 'high') {
                const changeType = sections.added.includes(section) ? 'Added' :
                    sections.removed.includes(section) ? 'Removed' : 'Modified';
                significant.push(`${changeType}: ${section.content.substring(0, 100)}...`);
            }
        }
        return significant.slice(0, 10);
    }
    async healthCheck() {
        if (!this.initialized) {
            throw new Error('Change detection engine not initialized');
        }
        const testResult = await this.analyzeChanges({
            oldContent: 'test content',
            newContent: 'test content modified',
            documentType: 'text',
        });
        if (!testResult) {
            throw new Error('Change detection engine health check failed');
        }
    }
    async shutdown() {
        logger.info('Shutting down change detection engine...');
        this.initialized = false;
        logger.info('Change detection engine shutdown complete');
    }
}
exports.changeDetectionEngine = new ChangeDetectionEngine();
//# sourceMappingURL=changeDetection.js.map