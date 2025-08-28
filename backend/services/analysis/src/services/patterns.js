"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patternLibrary = exports.PatternLibrary = void 0;
const shared_logger_1 = require("@fineprintai/shared-logger");
const logger = (0, shared_logger_1.createServiceLogger)('pattern-library');
class PatternLibrary {
    patterns = new Map();
    initialized = false;
    constructor() {
        this.initializePatterns();
    }
    initializePatterns() {
        if (this.initialized)
            return;
        logger.info('Initializing legal pattern library');
        this.addPattern({
            id: 'dp_001',
            category: 'Data Privacy',
            name: 'Unlimited Data Collection',
            description: 'Service claims right to collect unlimited or excessive personal data',
            patternRegex: null,
            patternKeywords: [
                'collect.*all.*information',
                'unlimited.*data.*collection',
                'any.*information.*you.*provide',
                'all.*personal.*data',
                'comprehensive.*data.*collection'
            ],
            severity: 'critical',
            explanation: 'This clause allows the service to collect an unreasonable amount of personal information without clear limitations.',
            recommendation: 'Look for services that clearly specify what data they collect and why.',
            legalContext: 'GDPR Article 5 requires data minimization - only necessary data should be collected.',
            examples: ['We may collect all information you provide to us through any means'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'dp_002',
            category: 'Data Privacy',
            name: 'Third-Party Data Sharing',
            description: 'Broad authorization to share personal data with third parties',
            patternRegex: null,
            patternKeywords: [
                'share.*information.*third.*parties',
                'disclose.*data.*partners',
                'provide.*information.*affiliates',
                'sell.*personal.*information',
                'transfer.*data.*third.*parties'
            ],
            severity: 'high',
            explanation: 'Your personal data may be shared with unknown third parties without your explicit consent.',
            recommendation: 'Choose services that limit data sharing and require explicit consent.',
            legalContext: 'GDPR requires explicit consent for data sharing with third parties.',
            examples: ['We may share your personal information with our business partners'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'dp_003',
            category: 'Data Privacy',
            name: 'Data Retention Indefinite',
            description: 'No clear data retention period specified',
            patternRegex: null,
            patternKeywords: [
                'retain.*information.*indefinitely',
                'keep.*data.*necessary',
                'store.*information.*required',
                'maintain.*records.*business.*purposes',
                'retain.*data.*legal.*requirements'
            ],
            severity: 'high',
            explanation: 'Your data may be stored indefinitely without clear deletion timelines.',
            recommendation: 'Look for services with clear data retention and deletion policies.',
            legalContext: 'GDPR Article 5 requires storage limitation - data should not be kept longer than necessary.',
            examples: ['We will retain your information for as long as necessary for our business purposes'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'dp_004',
            category: 'Data Privacy',
            name: 'Location Tracking',
            description: 'Collection of location data without clear purpose',
            patternRegex: null,
            patternKeywords: [
                'collect.*location.*data',
                'track.*your.*location',
                'geographical.*information',
                'GPS.*coordinates',
                'precise.*location.*information'
            ],
            severity: 'medium',
            explanation: 'The service may track your location, potentially compromising your privacy.',
            recommendation: 'Review location permissions carefully and disable if not necessary.',
            legalContext: 'Location data is considered sensitive personal data under GDPR.',
            examples: ['We may collect precise location information from your device'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'dp_005',
            category: 'Data Privacy',
            name: 'Biometric Data Collection',
            description: 'Collection of biometric identifiers',
            patternRegex: null,
            patternKeywords: [
                'biometric.*data',
                'fingerprint.*information',
                'facial.*recognition',
                'voice.*patterns',
                'biological.*characteristics'
            ],
            severity: 'critical',
            explanation: 'Biometric data collection poses significant privacy risks as this data cannot be changed if compromised.',
            recommendation: 'Be extremely cautious about services collecting biometric data.',
            legalContext: 'Biometric data is classified as sensitive personal data under GDPR Article 9.',
            examples: ['We may collect biometric data including facial recognition patterns'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'ur_001',
            category: 'User Rights',
            name: 'No Data Portability',
            description: 'Users cannot export or transfer their data',
            patternRegex: null,
            patternKeywords: [
                'cannot.*export.*data',
                'no.*data.*portability',
                'unable.*to.*transfer',
                'data.*not.*transferable',
                'export.*not.*available'
            ],
            severity: 'high',
            explanation: 'You may not be able to move your data to another service, creating vendor lock-in.',
            recommendation: 'Choose services that allow data export and portability.',
            legalContext: 'GDPR Article 20 grants users the right to data portability.',
            examples: ['Data export functionality is not available to users'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'ur_002',
            category: 'User Rights',
            name: 'Limited Deletion Rights',
            description: 'Restrictions on user\'s right to delete their data',
            patternRegex: null,
            patternKeywords: [
                'cannot.*delete.*all.*data',
                'some.*information.*retained',
                'deletion.*not.*guaranteed',
                'may.*retain.*certain.*information',
                'complete.*deletion.*not.*possible'
            ],
            severity: 'high',
            explanation: 'You may not be able to completely delete your personal information from the service.',
            recommendation: 'Look for services that guarantee complete data deletion upon request.',
            legalContext: 'GDPR Article 17 grants users the right to erasure (right to be forgotten).',
            examples: ['We may retain certain information even after account deletion'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'ur_003',
            category: 'User Rights',
            name: 'No Access Rights',
            description: 'Users cannot access their personal data',
            patternRegex: null,
            patternKeywords: [
                'no.*access.*to.*data',
                'cannot.*view.*information',
                'data.*access.*not.*provided',
                'information.*not.*accessible',
                'no.*data.*visibility'
            ],
            severity: 'high',
            explanation: 'You cannot see what personal data the service has collected about you.',
            recommendation: 'Choose services that provide clear access to your personal data.',
            legalContext: 'GDPR Article 15 grants users the right to access their personal data.',
            examples: ['Users do not have access to view their stored personal information'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'l_001',
            category: 'Liability',
            name: 'Complete Liability Waiver',
            description: 'Service disclaims all liability for damages',
            patternRegex: null,
            patternKeywords: [
                'not.*liable.*for.*any.*damages',
                'disclaim.*all.*liability',
                'no.*responsibility.*for.*losses',
                'exclude.*all.*liability',
                'not.*responsible.*for.*any.*harm'
            ],
            severity: 'critical',
            explanation: 'The service attempts to avoid responsibility for any damages, including those caused by their negligence.',
            recommendation: 'Be wary of services that completely disclaim liability.',
            legalContext: 'Complete liability waivers may not be enforceable in many jurisdictions.',
            examples: ['We are not liable for any damages of any kind arising from use of the service'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'l_002',
            category: 'Liability',
            name: 'User Indemnification',
            description: 'Users must compensate the service for legal costs',
            patternRegex: null,
            patternKeywords: [
                'you.*indemnify.*us',
                'hold.*harmless',
                'defend.*against.*claims',
                'compensate.*for.*legal.*costs',
                'reimburse.*legal.*expenses'
            ],
            severity: 'high',
            explanation: 'You may be required to pay the company\'s legal costs if they are sued because of your use of the service.',
            recommendation: 'Look for services with reasonable indemnification clauses or none at all.',
            legalContext: 'Broad indemnification clauses may be unfair to consumers.',
            examples: ['You agree to indemnify us against any claims arising from your use'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'tc_001',
            category: 'Terms Changes',
            name: 'Unilateral Terms Changes',
            description: 'Service can change terms without notice or consent',
            patternRegex: null,
            patternKeywords: [
                'change.*terms.*at.*any.*time',
                'modify.*agreement.*without.*notice',
                'update.*terms.*unilaterally',
                'revise.*terms.*sole.*discretion',
                'alter.*conditions.*without.*consent'
            ],
            severity: 'high',
            explanation: 'The service can change the terms at any time without your consent or advance notice.',
            recommendation: 'Look for services that provide reasonable notice of terms changes.',
            legalContext: 'Unilateral terms changes may be unfair under consumer protection laws.',
            examples: ['We may change these terms at any time without prior notice'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'tc_002',
            category: 'Terms Changes',
            name: 'Retroactive Terms Changes',
            description: 'Changes to terms apply retroactively',
            patternRegex: null,
            patternKeywords: [
                'changes.*apply.*retroactively',
                'modifications.*effective.*immediately',
                'updates.*apply.*to.*past.*use',
                'retroactive.*application',
                'changes.*effective.*upon.*posting'
            ],
            severity: 'high',
            explanation: 'Terms changes may apply to your past use of the service, not just future use.',
            recommendation: 'Avoid services that apply terms changes retroactively.',
            legalContext: 'Retroactive application of terms changes may be legally problematic.',
            examples: ['Any changes to these terms will apply retroactively to all past usage'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'at_001',
            category: 'Account Termination',
            name: 'Arbitrary Account Termination',
            description: 'Service can terminate accounts without reason',
            patternRegex: null,
            patternKeywords: [
                'terminate.*account.*without.*reason',
                'suspend.*service.*at.*discretion',
                'close.*account.*any.*time',
                'discontinue.*service.*without.*cause',
                'end.*access.*sole.*discretion'
            ],
            severity: 'high',
            explanation: 'Your account can be terminated at any time without explanation or appeal process.',
            recommendation: 'Look for services with clear termination policies and appeal processes.',
            legalContext: 'Arbitrary termination clauses may be unfair under consumer protection laws.',
            examples: ['We may terminate your account at any time for any reason or no reason'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'at_002',
            category: 'Account Termination',
            name: 'No Refund on Termination',
            description: 'No refunds provided when account is terminated',
            patternRegex: null,
            patternKeywords: [
                'no.*refund.*upon.*termination',
                'fees.*not.*refundable',
                'no.*compensation.*for.*suspension',
                'payments.*non-refundable',
                'no.*reimbursement.*account.*closure'
            ],
            severity: 'medium',
            explanation: 'You will not receive refunds for unused service time if your account is terminated.',
            recommendation: 'Consider services that offer prorated refunds for unused time.',
            legalContext: 'Unfair refund policies may violate consumer protection regulations.',
            examples: ['No refunds will be provided upon account termination for any reason'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'dr_001',
            category: 'Dispute Resolution',
            name: 'Mandatory Arbitration',
            description: 'All disputes must go through arbitration, not courts',
            patternRegex: null,
            patternKeywords: [
                'disputes.*resolved.*through.*arbitration',
                'binding.*arbitration.*clause',
                'no.*court.*proceedings',
                'arbitration.*only',
                'waive.*right.*to.*jury.*trial'
            ],
            severity: 'high',
            explanation: 'You cannot take the company to court and must use potentially biased arbitration instead.',
            recommendation: 'Consider the implications of giving up your right to court proceedings.',
            legalContext: 'Mandatory arbitration clauses may limit your legal rights.',
            examples: ['All disputes must be resolved through binding arbitration'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'dr_002',
            category: 'Dispute Resolution',
            name: 'Class Action Waiver',
            description: 'Users cannot participate in class action lawsuits',
            patternRegex: null,
            patternKeywords: [
                'waive.*class.*action.*rights',
                'no.*class.*action.*lawsuits',
                'individual.*disputes.*only',
                'cannot.*join.*class.*action',
                'collective.*action.*waiver'
            ],
            severity: 'high',
            explanation: 'You cannot join with other users in a class action lawsuit, weakening your legal position.',
            recommendation: 'Understand that you\'ll have to pursue legal action individually.',
            legalContext: 'Class action waivers may limit access to justice for consumers.',
            examples: ['You waive your right to participate in any class action lawsuit'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'ar_001',
            category: 'Auto-Renewal',
            name: 'Automatic Subscription Renewal',
            description: 'Subscriptions automatically renew without explicit consent',
            patternRegex: null,
            patternKeywords: [
                'automatically.*renew',
                'auto-renewal.*subscription',
                'continuous.*billing',
                'recurring.*charges',
                'subscription.*automatically.*extends'
            ],
            severity: 'medium',
            explanation: 'Your subscription will automatically renew and charge your payment method without asking.',
            recommendation: 'Set reminders to cancel before renewal if you don\'t want to continue.',
            legalContext: 'Auto-renewal practices must comply with consumer protection laws.',
            examples: ['Your subscription will automatically renew unless cancelled'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'ar_002',
            category: 'Auto-Renewal',
            name: 'Difficult Cancellation Process',
            description: 'Complex or hidden cancellation procedures',
            patternRegex: null,
            patternKeywords: [
                'contact.*customer.*service.*to.*cancel',
                'cancellation.*requires.*phone.*call',
                'written.*notice.*required',
                'cancel.*before.*renewal.*period',
                'specific.*cancellation.*procedure'
            ],
            severity: 'medium',
            explanation: 'Cancelling your subscription may require complex steps or contacting customer service.',
            recommendation: 'Ensure you understand the cancellation process before subscribing.',
            legalContext: 'Difficult cancellation processes may violate consumer protection laws.',
            examples: ['To cancel, you must call customer service during business hours'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'cr_001',
            category: 'Content Rights',
            name: 'Broad Content License',
            description: 'Service claims extensive rights to user-generated content',
            patternRegex: null,
            patternKeywords: [
                'grant.*us.*license.*to.*content',
                'use.*modify.*distribute.*content',
                'royalty-free.*license',
                'perpetual.*rights.*to.*content',
                'sublicense.*your.*content'
            ],
            severity: 'high',
            explanation: 'The service may use, modify, and distribute your content without compensation.',
            recommendation: 'Be cautious about uploading valuable or sensitive content.',
            legalContext: 'Broad content licenses should be proportionate to the service provided.',
            examples: ['You grant us a perpetual, royalty-free license to use your content'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'cr_002',
            category: 'Content Rights',
            name: 'Content Ownership Transfer',
            description: 'User content ownership transfers to the service',
            patternRegex: null,
            patternKeywords: [
                'transfer.*ownership.*of.*content',
                'content.*becomes.*our.*property',
                'assign.*rights.*to.*us',
                'relinquish.*ownership',
                'content.*owned.*by.*service'
            ],
            severity: 'critical',
            explanation: 'You may lose ownership of content you upload to the service.',
            recommendation: 'Avoid services that claim ownership of your content.',
            legalContext: 'Content ownership transfer clauses may be unreasonable and unenforceable.',
            examples: ['All content uploaded becomes the exclusive property of the service'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'pf_001',
            category: 'Payment',
            name: 'Hidden Fees',
            description: 'Additional fees not clearly disclosed upfront',
            patternRegex: null,
            patternKeywords: [
                'additional.*fees.*may.*apply',
                'processing.*fees',
                'service.*charges',
                'transaction.*fees',
                'administrative.*costs'
            ],
            severity: 'medium',
            explanation: 'You may be charged additional fees that weren\'t clearly disclosed initially.',
            recommendation: 'Ask for a complete breakdown of all potential fees.',
            legalContext: 'Hidden fees may violate consumer protection and advertising laws.',
            examples: ['Additional processing fees and service charges may apply'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'pf_002',
            category: 'Payment',
            name: 'Price Change Rights',
            description: 'Service can change prices at any time',
            patternRegex: null,
            patternKeywords: [
                'change.*prices.*at.*any.*time',
                'modify.*fees.*without.*notice',
                'price.*increases.*effective.*immediately',
                'adjust.*pricing.*sole.*discretion',
                'alter.*subscription.*costs'
            ],
            severity: 'medium',
            explanation: 'Prices can be increased at any time, potentially without advance notice.',
            recommendation: 'Look for services that guarantee price stability or provide advance notice.',
            legalContext: 'Sudden price changes may be restricted by consumer protection laws.',
            examples: ['We may change our prices at any time without prior notice'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'ae_001',
            category: 'Age Restrictions',
            name: 'Minimum Age Requirements',
            description: 'Service has age restrictions that may not be clearly communicated',
            patternRegex: null,
            patternKeywords: [
                'must.*be.*18.*years.*old',
                'minimum.*age.*requirement',
                'age.*of.*majority',
                'under.*13.*prohibited',
                'parental.*consent.*required'
            ],
            severity: 'low',
            explanation: 'There are age restrictions for using this service that users should be aware of.',
            recommendation: 'Ensure you meet the age requirements before using the service.',
            legalContext: 'Age restrictions are often required by laws like COPPA.',
            examples: ['You must be at least 18 years old to use this service'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.addPattern({
            id: 'jgl_001',
            category: 'Jurisdiction',
            name: 'Unfavorable Jurisdiction',
            description: 'Legal disputes must be resolved in potentially inconvenient jurisdiction',
            patternRegex: null,
            patternKeywords: [
                'governed.*by.*laws.*of',
                'jurisdiction.*of.*courts',
                'disputes.*resolved.*in',
                'exclusive.*jurisdiction',
                'venue.*for.*legal.*proceedings'
            ],
            severity: 'medium',
            explanation: 'Legal disputes may need to be resolved in a jurisdiction that is inconvenient or unfavorable to you.',
            recommendation: 'Consider the practical implications of the chosen jurisdiction.',
            legalContext: 'Jurisdiction clauses determine where legal disputes will be resolved.',
            examples: ['All disputes will be resolved in the courts of Delaware'],
            isActive: true,
            isCustom: false,
            version: 1
        });
        this.initialized = true;
        logger.info(`Legal pattern library initialized with ${this.patterns.size} patterns`);
    }
    addPattern(pattern) {
        this.patterns.set(pattern.id, pattern);
    }
    async analyzeText(text) {
        const startTime = Date.now();
        logger.info('Starting pattern analysis', { textLength: text.length });
        const matches = [];
        const lowerText = text.toLowerCase();
        for (const pattern of this.patterns.values()) {
            if (!pattern.isActive)
                continue;
            const patternMatches = await this.findPatternMatches(lowerText, text, pattern);
            if (patternMatches.length > 0) {
                matches.push({
                    patternId: pattern.id,
                    category: pattern.category,
                    name: pattern.name,
                    severity: pattern.severity,
                    confidence: this.calculateConfidence(patternMatches, pattern),
                    matches: patternMatches
                });
            }
        }
        const categorizedMatches = this.categorizeMatches(matches);
        const riskScore = this.calculateRiskScore(matches);
        const highestSeverity = this.getHighestSeverity(matches);
        const affectedTextPercentage = this.calculateAffectedTextPercentage(matches, text.length);
        const processingTime = Date.now() - startTime;
        logger.info('Pattern analysis completed', {
            totalMatches: matches.length,
            categoriesFound: Object.keys(categorizedMatches).length,
            riskScore,
            highestSeverity,
            processingTime
        });
        return {
            totalMatches: matches.length,
            categorizedMatches,
            riskScore,
            highestSeverity,
            affectedTextPercentage
        };
    }
    async findPatternMatches(lowerText, originalText, pattern) {
        const matches = [];
        if (pattern.patternRegex) {
            try {
                const regex = new RegExp(pattern.patternRegex, 'gi');
                let match;
                while ((match = regex.exec(originalText)) !== null) {
                    matches.push({
                        text: match[0],
                        start: match.index,
                        end: match.index + match[0].length,
                        context: this.extractContext(originalText, match.index, match[0].length)
                    });
                }
            }
            catch (error) {
                logger.warn('Invalid regex pattern', { patternId: pattern.id, error: error.message });
            }
        }
        for (const keyword of pattern.patternKeywords) {
            try {
                const keywordRegex = new RegExp(keyword, 'gi');
                let match;
                while ((match = keywordRegex.exec(originalText)) !== null) {
                    const isDuplicate = matches.some(m => m.start <= match.index && m.end >= match.index + match[0].length);
                    if (!isDuplicate) {
                        matches.push({
                            text: match[0],
                            start: match.index,
                            end: match.index + match[0].length,
                            context: this.extractContext(originalText, match.index, match[0].length)
                        });
                    }
                }
            }
            catch (error) {
                logger.warn('Invalid keyword pattern', {
                    patternId: pattern.id,
                    keyword,
                    error: error.message
                });
            }
        }
        return matches;
    }
    extractContext(text, start, length, contextLength = 150) {
        const contextStart = Math.max(0, start - contextLength);
        const contextEnd = Math.min(text.length, start + length + contextLength);
        let context = text.substring(contextStart, contextEnd);
        if (contextStart > 0)
            context = '...' + context;
        if (contextEnd < text.length)
            context = context + '...';
        return context.trim();
    }
    calculateConfidence(matches, pattern) {
        if (matches.length === 0)
            return 0;
        let confidence = Math.min(0.9, 0.3 + (matches.length * 0.1));
        const exactMatches = matches.filter(match => pattern.patternKeywords.some(keyword => match.text.toLowerCase().includes(keyword.replace(/\.\*/g, ''))));
        if (exactMatches.length > 0) {
            confidence = Math.min(1.0, confidence + 0.2);
        }
        const commonWords = ['the', 'and', 'or', 'but', 'may', 'can', 'will', 'shall'];
        if (matches.some(match => commonWords.some(word => match.text.toLowerCase().includes(word)))) {
            confidence = Math.max(0.1, confidence - 0.1);
        }
        return Math.round(confidence * 100) / 100;
    }
    categorizeMatches(matches) {
        const categorized = {};
        for (const match of matches) {
            if (!categorized[match.category]) {
                categorized[match.category] = [];
            }
            categorized[match.category].push(match);
        }
        return categorized;
    }
    calculateRiskScore(matches) {
        if (matches.length === 0)
            return 0;
        const severityWeights = {
            'low': 1,
            'medium': 3,
            'high': 7,
            'critical': 15
        };
        let totalScore = 0;
        let maxPossibleScore = 0;
        for (const match of matches) {
            const weight = severityWeights[match.severity];
            const confidence = match.confidence;
            const score = weight * confidence * match.matches.length;
            totalScore += score;
            maxPossibleScore += weight * match.matches.length;
        }
        const normalizedScore = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;
        const finalScore = Math.min(100, normalizedScore * 0.8 + Math.sqrt(normalizedScore) * 2);
        return Math.round(finalScore);
    }
    getHighestSeverity(matches) {
        const severityOrder = ['low', 'medium', 'high', 'critical'];
        let highest = 'low';
        for (const match of matches) {
            if (severityOrder.indexOf(match.severity) > severityOrder.indexOf(highest)) {
                highest = match.severity;
            }
        }
        return highest;
    }
    calculateAffectedTextPercentage(matches, totalTextLength) {
        if (totalTextLength === 0)
            return 0;
        const affectedChars = new Set();
        for (const match of matches) {
            for (const textMatch of match.matches) {
                for (let i = textMatch.start; i < textMatch.end; i++) {
                    affectedChars.add(i);
                }
            }
        }
        return Math.round((affectedChars.size / totalTextLength) * 10000) / 100;
    }
    getPattern(patternId) {
        return this.patterns.get(patternId);
    }
    getAllPatterns() {
        return Array.from(this.patterns.values());
    }
    getPatternsByCategory(category) {
        return Array.from(this.patterns.values()).filter(p => p.category === category);
    }
    getActivePatterns() {
        return Array.from(this.patterns.values()).filter(p => p.isActive);
    }
    addCustomPattern(pattern) {
        const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const customPattern = {
            ...pattern,
            id,
            isCustom: true,
            version: 1
        };
        this.patterns.set(id, customPattern);
        logger.info('Custom pattern added', { patternId: id, name: pattern.name });
        return id;
    }
    updatePattern(patternId, updates) {
        const pattern = this.patterns.get(patternId);
        if (!pattern)
            return false;
        const updatedPattern = {
            ...pattern,
            ...updates,
            id: patternId,
            version: pattern.version + 1
        };
        this.patterns.set(patternId, updatedPattern);
        logger.info('Pattern updated', { patternId, version: updatedPattern.version });
        return true;
    }
    removePattern(patternId) {
        const removed = this.patterns.delete(patternId);
        if (removed) {
            logger.info('Pattern removed', { patternId });
        }
        return removed;
    }
    getPatternStats() {
        const patterns = Array.from(this.patterns.values());
        const byCategory = {};
        const bySeverity = {};
        for (const pattern of patterns) {
            byCategory[pattern.category] = (byCategory[pattern.category] || 0) + 1;
            bySeverity[pattern.severity] = (bySeverity[pattern.severity] || 0) + 1;
        }
        return {
            total: patterns.length,
            active: patterns.filter(p => p.isActive).length,
            byCategory,
            bySeverity,
            custom: patterns.filter(p => p.isCustom).length
        };
    }
}
exports.PatternLibrary = PatternLibrary;
exports.patternLibrary = new PatternLibrary();
//# sourceMappingURL=patterns.js.map