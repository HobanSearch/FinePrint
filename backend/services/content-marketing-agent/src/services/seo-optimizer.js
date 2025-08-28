"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEOOptimizer = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
class SEOOptimizer {
    ahrefsApiKey;
    semrushApiKey;
    constructor() {
        this.ahrefsApiKey = config_1.config.seo.ahrefs.apiKey;
        this.semrushApiKey = config_1.config.seo.semrush.apiKey;
    }
    async optimizeContent(content, title, keywords) {
        try {
            logger_1.logger.info('Starting SEO optimization', { title, keywordCount: keywords.length });
            const analysis = await this.analyzeContent(content, title, keywords);
            const suggestions = this.generateOptimizationSuggestions(analysis);
            const optimizedContent = await this.applyContentOptimizations(content, keywords, suggestions);
            const optimizedTitle = await this.optimizeTitle(title, keywords);
            const finalAnalysis = await this.analyzeContent(optimizedContent, optimizedTitle, keywords);
            logger_1.logger.info('SEO optimization completed', {
                originalScore: analysis.score,
                finalScore: finalAnalysis.score,
                improvementPct: Math.round(((finalAnalysis.score - analysis.score) / analysis.score) * 100)
            });
            return {
                optimizedContent,
                optimizedTitle,
                score: finalAnalysis.score,
                suggestions: suggestions.filter(s => !s.includes('APPLIED:'))
            };
        }
        catch (error) {
            logger_1.logger.error('SEO optimization failed', { error });
            return {
                optimizedContent: content,
                optimizedTitle: title,
                score: 50,
                suggestions: ['Unable to complete SEO optimization']
            };
        }
    }
    async analyzeContent(content, title, keywords) {
        const keywordDensity = this.calculateKeywordDensity(content, keywords);
        const readabilityScore = this.calculateReadabilityScore(content);
        const headingStructure = this.analyzeHeadingStructure(content);
        const links = this.extractLinks(content);
        const imageAltTags = this.extractImageAltTags(content);
        const metaDescription = this.generateMetaDescription(content, keywords);
        const metaTitle = title.length <= 60 ? title : title.substring(0, 57) + '...';
        let score = 0;
        const suggestions = [];
        if (title.length >= 30 && title.length <= 60) {
            score += 15;
        }
        else {
            suggestions.push(title.length < 30 ? 'Title is too short (should be 30-60 characters)' : 'Title is too long (should be 30-60 characters)');
        }
        const primaryKeyword = keywords[0]?.toLowerCase() || '';
        if (primaryKeyword && title.toLowerCase().includes(primaryKeyword)) {
            score += 5;
        }
        else if (primaryKeyword) {
            suggestions.push(`Include primary keyword "${keywords[0]}" in title`);
        }
        if (metaDescription.length >= 120 && metaDescription.length <= 160) {
            score += 10;
        }
        else {
            suggestions.push('Meta description should be 120-160 characters');
        }
        for (const keyword of keywords.slice(0, 3)) {
            const density = keywordDensity[keyword.toLowerCase()] || 0;
            if (density >= 0.5 && density <= 2.5) {
                score += 8;
            }
            else if (density < 0.5) {
                suggestions.push(`Increase usage of keyword "${keyword}" (current: ${density.toFixed(1)}%)`);
            }
            else {
                suggestions.push(`Reduce usage of keyword "${keyword}" to avoid over-optimization (current: ${density.toFixed(1)}%)`);
            }
        }
        if (readabilityScore >= 60) {
            score += 15;
        }
        else {
            score += Math.max(0, Math.floor(readabilityScore / 4));
            suggestions.push('Improve readability by using shorter sentences and simpler words');
        }
        if (headingStructure.length > 0) {
            const hasH1 = headingStructure.some(h => h.level === 1);
            const hasH2 = headingStructure.some(h => h.level === 2);
            if (hasH1)
                score += 8;
            else
                suggestions.push('Add an H1 heading');
            if (hasH2)
                score += 7;
            else
                suggestions.push('Add H2 headings to structure content');
        }
        else {
            suggestions.push('Add headings to structure your content');
        }
        const wordCount = content.trim().split(/\s+/).length;
        if (wordCount >= 800) {
            score += 10;
        }
        else if (wordCount >= 500) {
            score += 5;
        }
        else {
            suggestions.push('Content should be at least 800 words for better SEO performance');
        }
        if (links.internal.length > 0 || links.external.length > 0) {
            score += 5;
        }
        else {
            suggestions.push('Add relevant internal and external links');
        }
        return {
            keywordDensity,
            readabilityScore,
            metaDescription,
            metaTitle,
            headingStructure,
            internalLinks: links.internal,
            externalLinks: links.external,
            imageAltTags,
            suggestions,
            score: Math.min(100, score)
        };
    }
    async researchKeywords(topic, targetAudience, contentType) {
        const keywords = [];
        try {
            const seedKeywords = await this.generateSeedKeywords(topic, targetAudience, contentType);
            for (const seedKeyword of seedKeywords) {
                try {
                    const keywordData = await this.getKeywordData(seedKeyword);
                    if (keywordData) {
                        keywords.push(keywordData);
                    }
                }
                catch (error) {
                    logger_1.logger.warn('Failed to get keyword data', { keyword: seedKeyword, error });
                }
            }
            const topKeywords = keywords
                .sort((a, b) => b.searchVolume - a.searchVolume)
                .slice(0, 3);
            for (const topKeyword of topKeywords) {
                const relatedKeywords = await this.getRelatedKeywords(topKeyword.keyword);
                for (const related of relatedKeywords.slice(0, 5)) {
                    const relatedData = await this.getKeywordData(related);
                    if (relatedData && !keywords.find(k => k.keyword === related)) {
                        keywords.push(relatedData);
                    }
                }
            }
            logger_1.logger.info('Keyword research completed', {
                topic,
                keywordsFound: keywords.length,
                avgSearchVolume: keywords.reduce((acc, k) => acc + k.searchVolume, 0) / keywords.length
            });
            return keywords.sort((a, b) => b.searchVolume - a.searchVolume);
        }
        catch (error) {
            logger_1.logger.error('Keyword research failed', { error, topic });
            return this.getFallbackKeywords(topic);
        }
    }
    async generateSEOTitle(content, keywords) {
        const titles = [];
        const primaryKeyword = keywords[0] || '';
        const contentPreview = content.substring(0, 300);
        const topic = await this.extractMainTopic(contentPreview);
        const templates = [
            `${primaryKeyword}: ${topic}`,
            `How ${primaryKeyword} ${topic}`,
            `${topic} - ${primaryKeyword} Guide`,
            `Ultimate Guide to ${primaryKeyword}`,
            `${primaryKeyword} Best Practices for ${topic}`,
            `Why ${primaryKeyword} Matters for ${topic}`,
            `${topic}: Everything About ${primaryKeyword}`,
            `${primaryKeyword} Tips for ${topic}`
        ];
        for (const template of templates) {
            if (template.length >= 30 && template.length <= 60) {
                titles.push(template);
            }
        }
        if (titles.length < 3) {
            titles.push(`${topic} - Complete Guide`, `Understanding ${topic}`, `${topic} Best Practices`);
        }
        return titles.slice(0, 5);
    }
    async generateSeedKeywords(topic, targetAudience, contentType) {
        const baseKeywords = [];
        const topicVariations = [
            topic,
            topic.toLowerCase(),
            topic.replace(/\s+/g, ' ').trim()
        ];
        baseKeywords.push(...topicVariations);
        const legalTechKeywords = [
            'terms of service',
            'privacy policy',
            'legal document analysis',
            'document review',
            'legal compliance',
            'gdpr compliance',
            'data privacy',
            'user rights',
            'legal protection',
            'document scanning'
        ];
        for (const legalTerm of legalTechKeywords) {
            if (topic.toLowerCase().includes(legalTerm))
                continue;
            baseKeywords.push(`${topic} ${legalTerm}`, `${legalTerm} ${topic}`, `${topic} legal`, `legal ${topic}`);
        }
        const contentTypeKeywords = {
            blog_post: ['guide', 'how to', 'tips', 'best practices', 'tutorial'],
            social_media_post: ['news', 'update', 'alert', 'warning'],
            email_campaign: ['newsletter', 'update', 'announcement'],
            case_study: ['case study', 'analysis', 'review', 'evaluation'],
            whitepaper: ['research', 'study', 'report', 'analysis']
        };
        const typeKeywords = contentTypeKeywords[contentType] || [];
        for (const typeKeyword of typeKeywords) {
            baseKeywords.push(`${topic} ${typeKeyword}`, `${typeKeyword} ${topic}`);
        }
        if (targetAudience.toLowerCase().includes('business')) {
            baseKeywords.push(`${topic} business`, `business ${topic}`, `${topic} enterprise`, `${topic} company`);
        }
        if (targetAudience.toLowerCase().includes('individual')) {
            baseKeywords.push(`${topic} personal`, `personal ${topic}`, `${topic} consumer`, `consumer ${topic}`);
        }
        return [...new Set(baseKeywords)]
            .filter(keyword => keyword.length > 3 && keyword.length < 100)
            .slice(0, 20);
    }
    async getKeywordData(keyword) {
        try {
            if (this.semrushApiKey) {
                const semrushData = await this.getSemrushKeywordData(keyword);
                if (semrushData)
                    return semrushData;
            }
            if (this.ahrefsApiKey) {
                const ahrefsData = await this.getAhrefsKeywordData(keyword);
                if (ahrefsData)
                    return ahrefsData;
            }
            return this.getEstimatedKeywordData(keyword);
        }
        catch (error) {
            logger_1.logger.warn('Failed to get keyword data from APIs', { keyword, error });
            return this.getEstimatedKeywordData(keyword);
        }
    }
    async getSemrushKeywordData(keyword) {
        if (!this.semrushApiKey)
            return null;
        try {
            const response = await axios_1.default.get('https://api.semrush.com/', {
                params: {
                    type: 'phrase_this',
                    key: this.semrushApiKey,
                    phrase: keyword,
                    database: 'us',
                    export_columns: 'Ph,Nq,Cp,Co,Tr'
                }
            });
            const lines = response.data.split('\n');
            if (lines.length < 2)
                return null;
            const data = lines[1].split('\t');
            if (data.length < 5)
                return null;
            return {
                keyword,
                searchVolume: parseInt(data[1]) || 0,
                difficulty: this.mapCompetitionToDifficulty(data[4]),
                cpc: parseFloat(data[2]) || 0,
                competition: this.mapCompetitionLevel(data[3]),
                trend: 'stable',
                relatedKeywords: [],
                intent: this.determineSearchIntent(keyword),
                source: 'semrush'
            };
        }
        catch (error) {
            logger_1.logger.warn('Semrush API error', { keyword, error });
            return null;
        }
    }
    async getAhrefsKeywordData(keyword) {
        if (!this.ahrefsApiKey)
            return null;
        try {
            const response = await axios_1.default.get('https://apiv2.ahrefs.com/v2/keywords-explorer/overview', {
                headers: {
                    'Authorization': `Bearer ${this.ahrefsApiKey}`,
                    'Accept': 'application/json'
                },
                params: {
                    target: keyword,
                    country: 'US'
                }
            });
            const data = response.data.keywords?.[0];
            if (!data)
                return null;
            return {
                keyword,
                searchVolume: data.search_volume || 0,
                difficulty: data.keyword_difficulty || 50,
                cpc: data.cpc || 0,
                competition: this.mapDifficultyToCompetition(data.keyword_difficulty),
                trend: 'stable',
                relatedKeywords: [],
                intent: this.determineSearchIntent(keyword),
                source: 'ahrefs'
            };
        }
        catch (error) {
            logger_1.logger.warn('Ahrefs API error', { keyword, error });
            return null;
        }
    }
    getEstimatedKeywordData(keyword) {
        let estimatedVolume = 1000;
        let difficulty = 50;
        const wordCount = keyword.split(' ').length;
        if (wordCount === 1) {
            estimatedVolume = 5000;
            difficulty = 80;
        }
        else if (wordCount >= 4) {
            estimatedVolume = 200;
            difficulty = 30;
        }
        const legalKeywords = ['legal', 'privacy', 'terms', 'gdpr', 'compliance'];
        if (legalKeywords.some(lk => keyword.toLowerCase().includes(lk))) {
            estimatedVolume = Math.floor(estimatedVolume * 0.7);
            difficulty = Math.min(difficulty + 10, 90);
        }
        return {
            keyword,
            searchVolume: estimatedVolume,
            difficulty,
            cpc: 2.5,
            competition: difficulty > 60 ? 'high' : difficulty > 30 ? 'medium' : 'low',
            trend: 'stable',
            relatedKeywords: [],
            intent: this.determineSearchIntent(keyword),
            source: 'semrush'
        };
    }
    async getRelatedKeywords(keyword) {
        const related = [];
        const keywordLower = keyword.toLowerCase();
        const questionPrefixes = ['how to', 'what is', 'why', 'when', 'where'];
        for (const prefix of questionPrefixes) {
            related.push(`${prefix} ${keyword}`);
        }
        const actionWords = ['check', 'analyze', 'review', 'understand', 'protect'];
        for (const action of actionWords) {
            related.push(`${action} ${keyword}`);
        }
        const comparativeTerms = ['best', 'vs', 'alternative', 'comparison'];
        for (const term of comparativeTerms) {
            related.push(`${keyword} ${term}`);
            related.push(`${term} ${keyword}`);
        }
        if (keywordLower.includes('terms')) {
            related.push(keyword.replace('terms', 'privacy policy'), keyword.replace('terms', 'agreement'), keyword.replace('terms', 'contract'));
        }
        return [...new Set(related)].slice(0, 10);
    }
    getFallbackKeywords(topic) {
        const fallbackKeywords = [
            'terms of service analysis',
            'privacy policy review',
            'legal document scanner',
            'gdpr compliance checker',
            'user agreement analyzer',
            'data privacy protection',
            'legal rights protection',
            'document analysis tool',
            'privacy policy analysis',
            'terms and conditions review'
        ];
        return fallbackKeywords.map((keyword, index) => ({
            keyword,
            searchVolume: 1000 - (index * 100),
            difficulty: 40 + (index * 5),
            cpc: 2.0 + (index * 0.5),
            competition: index < 3 ? 'medium' : 'low',
            trend: 'stable',
            relatedKeywords: [],
            intent: 'informational',
            source: 'semrush'
        }));
    }
    calculateKeywordDensity(content, keywords) {
        const density = {};
        const words = content.toLowerCase().split(/\s+/);
        const totalWords = words.length;
        for (const keyword of keywords) {
            const keywordLower = keyword.toLowerCase();
            const keywordWords = keywordLower.split(/\s+/);
            let count = 0;
            if (keywordWords.length === 1) {
                count = words.filter(word => word.includes(keywordWords[0])).length;
            }
            else {
                const keywordPattern = keywordWords.join('\\s+');
                const regex = new RegExp(keywordPattern, 'gi');
                const matches = content.match(regex);
                count = matches ? matches.length : 0;
            }
            density[keywordLower] = (count / totalWords) * 100;
        }
        return density;
    }
    calculateReadabilityScore(content) {
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = content.split(/\s+/).filter(w => w.length > 0);
        const syllables = words.reduce((acc, word) => acc + this.countSyllables(word), 0);
        if (sentences.length === 0 || words.length === 0)
            return 0;
        const avgSentenceLength = words.length / sentences.length;
        const avgSyllablesPerWord = syllables / words.length;
        const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
        return Math.max(0, Math.min(100, score));
    }
    countSyllables(word) {
        word = word.toLowerCase();
        if (word.length <= 3)
            return 1;
        const vowels = 'aeiouy';
        let count = 0;
        let previousWasVowel = false;
        for (let i = 0; i < word.length; i++) {
            const isVowel = vowels.includes(word[i]);
            if (isVowel && !previousWasVowel) {
                count++;
            }
            previousWasVowel = isVowel;
        }
        if (word.endsWith('e')) {
            count--;
        }
        return Math.max(1, count);
    }
    analyzeHeadingStructure(content) {
        const headings = [];
        const headingRegex = /^(#{1,6})\s+(.+)$/gm;
        let match;
        while ((match = headingRegex.exec(content)) !== null) {
            headings.push({
                level: match[1].length,
                text: match[2].trim()
            });
        }
        return headings;
    }
    extractLinks(content) {
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const internal = [];
        const external = [];
        let match;
        while ((match = linkRegex.exec(content)) !== null) {
            const url = match[2];
            if (url.startsWith('http://') || url.startsWith('https://')) {
                external.push(url);
            }
            else {
                internal.push(url);
            }
        }
        return { internal, external };
    }
    extractImageAltTags(content) {
        const imageRegex = /!\[([^\]]*)\]\([^)]+\)/g;
        const altTags = [];
        let match;
        while ((match = imageRegex.exec(content)) !== null) {
            if (match[1])
                altTags.push(match[1]);
        }
        return altTags;
    }
    generateMetaDescription(content, keywords) {
        const paragraphs = content.split('\n\n').filter(p => p.trim().length > 50);
        let description = paragraphs[0] || content.substring(0, 200);
        description = description
            .replace(/[#*_`]/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .trim();
        const primaryKeyword = keywords[0];
        if (primaryKeyword && !description.toLowerCase().includes(primaryKeyword.toLowerCase())) {
            description = `${primaryKeyword}: ${description}`;
        }
        if (description.length > 160) {
            description = description.substring(0, 157) + '...';
        }
        else if (description.length < 120) {
            description = description + ' Learn more about protecting your digital rights.';
        }
        return description;
    }
    generateOptimizationSuggestions(analysis) {
        const suggestions = [...analysis.suggestions];
        if (analysis.score < 70) {
            suggestions.push('Consider rewriting content to improve overall SEO score');
        }
        if (analysis.headingStructure.length === 0) {
            suggestions.push('APPLY: Add proper heading structure with H1 and H2 tags');
        }
        if (analysis.internalLinks.length === 0) {
            suggestions.push('APPLY: Add relevant internal links to improve site structure');
        }
        const primaryKeywordDensity = Object.values(analysis.keywordDensity)[0] || 0;
        if (primaryKeywordDensity < 0.5) {
            suggestions.push('APPLY: Increase primary keyword usage naturally throughout content');
        }
        return suggestions;
    }
    async applyContentOptimizations(content, keywords, suggestions) {
        let optimizedContent = content;
        for (const suggestion of suggestions) {
            if (suggestion.startsWith('APPLY:')) {
                if (suggestion.includes('heading structure')) {
                    optimizedContent = this.addHeadingStructure(optimizedContent);
                }
                if (suggestion.includes('internal links')) {
                    optimizedContent = this.addInternalLinks(optimizedContent);
                }
                if (suggestion.includes('keyword usage')) {
                    optimizedContent = this.improveKeywordUsage(optimizedContent, keywords[0]);
                }
            }
        }
        return optimizedContent;
    }
    async optimizeTitle(title, keywords) {
        const primaryKeyword = keywords[0];
        if (!primaryKeyword)
            return title;
        if (title.toLowerCase().includes(primaryKeyword.toLowerCase()) &&
            title.length >= 30 && title.length <= 60) {
            return title;
        }
        let optimizedTitle = title;
        if (!title.toLowerCase().includes(primaryKeyword.toLowerCase())) {
            optimizedTitle = `${primaryKeyword}: ${title}`;
        }
        if (optimizedTitle.length > 60) {
            optimizedTitle = optimizedTitle.substring(0, 57) + '...';
        }
        return optimizedTitle;
    }
    addHeadingStructure(content) {
        const lines = content.split('\n');
        const optimizedLines = [];
        let hasH1 = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!hasH1 && line.length > 50 && !line.startsWith('#')) {
                optimizedLines.push(`# ${line}`);
                hasH1 = true;
                continue;
            }
            if (line.length > 20 && line.length < 100 &&
                !line.includes('.') && !line.startsWith('#') &&
                lines[i + 1] && lines[i + 1].length > 100) {
                optimizedLines.push(`## ${line}`);
                continue;
            }
            optimizedLines.push(line);
        }
        return optimizedLines.join('\n');
    }
    addInternalLinks(content) {
        const legalTerms = [
            { term: 'terms of service', link: '/terms-of-service' },
            { term: 'privacy policy', link: '/privacy-policy' },
            { term: 'legal analysis', link: '/how-it-works' },
            { term: 'document scanner', link: '/features' },
            { term: 'user rights', link: '/user-rights' }
        ];
        let optimizedContent = content;
        for (const { term, link } of legalTerms) {
            const regex = new RegExp(`\\b${term}\\b`, 'gi');
            if (regex.test(optimizedContent) && !optimizedContent.includes(`[${term}]`)) {
                optimizedContent = optimizedContent.replace(regex, `[${term}](${link})`);
                break;
            }
        }
        return optimizedContent;
    }
    improveKeywordUsage(content, keyword) {
        if (!keyword)
            return content;
        const keywordLower = keyword.toLowerCase();
        const currentDensity = this.calculateKeywordDensity(content, [keyword])[keywordLower] || 0;
        if (currentDensity >= 0.5)
            return content;
        const paragraphs = content.split('\n\n');
        if (paragraphs.length > 0 && !paragraphs[0].toLowerCase().includes(keywordLower)) {
            paragraphs[0] = `${keyword} is crucial for understanding. ${paragraphs[0]}`;
        }
        return paragraphs.join('\n\n');
    }
    async extractMainTopic(content) {
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
        if (sentences.length === 0)
            return 'Legal Documents';
        const firstSentence = sentences[0].trim();
        const words = firstSentence.split(' ').slice(0, 5).join(' ');
        return words.replace(/[^\w\s]/g, '').trim() || 'Legal Documents';
    }
    mapCompetitionToDifficulty(competition) {
        const comp = parseFloat(competition);
        return Math.round(comp * 100);
    }
    mapCompetitionLevel(competition) {
        const comp = parseFloat(competition);
        if (comp < 0.3)
            return 'low';
        if (comp < 0.7)
            return 'medium';
        return 'high';
    }
    mapDifficultyToCompetition(difficulty) {
        if (difficulty < 30)
            return 'low';
        if (difficulty < 60)
            return 'medium';
        return 'high';
    }
    determineSearchIntent(keyword) {
        const keywordLower = keyword.toLowerCase();
        if (keywordLower.includes('how to') || keywordLower.includes('what is') ||
            keywordLower.includes('guide') || keywordLower.includes('tutorial')) {
            return 'informational';
        }
        if (keywordLower.includes('buy') || keywordLower.includes('price') ||
            keywordLower.includes('cost') || keywordLower.includes('purchase')) {
            return 'transactional';
        }
        if (keywordLower.includes('best') || keywordLower.includes('review') ||
            keywordLower.includes('compare') || keywordLower.includes('vs')) {
            return 'commercial';
        }
        return 'informational';
    }
}
exports.SEOOptimizer = SEOOptimizer;
//# sourceMappingURL=seo-optimizer.js.map