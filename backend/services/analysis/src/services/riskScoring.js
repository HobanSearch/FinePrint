"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.riskScoringEngine = exports.RiskScoringEngine = void 0;
const shared_logger_1 = require("@fineprintai/shared-logger");
const logger = (0, shared_logger_1.createServiceLogger)('risk-scoring');
class RiskScoringEngine {
    DEFAULT_WEIGHTS = {
        patternMatches: 0.6,
        severityMultiplier: {
            low: 1.0,
            medium: 2.5,
            high: 5.0,
            critical: 10.0
        },
        confidenceThreshold: 0.3,
        categoryWeights: {
            'Data Privacy': 1.4,
            'User Rights': 1.3,
            'Liability': 1.2,
            'Terms Changes': 1.1,
            'Account Termination': 1.0,
            'Dispute Resolution': 1.2,
            'Auto-Renewal': 0.9,
            'Content Rights': 1.0,
            'Payment': 0.8,
            'Age Restrictions': 0.5,
            'Jurisdiction': 0.7
        },
        documentTypeModifiers: {
            'terms-of-service': 1.0,
            'privacy-policy': 1.2,
            'eula': 0.9,
            'cookie-policy': 0.7,
            'data-processing': 1.3,
            'general': 1.0
        },
        lengthAdjustment: {
            short: 0.9,
            medium: 1.0,
            long: 1.1
        }
    };
    scoringWeights;
    constructor(customWeights) {
        this.scoringWeights = {
            ...this.DEFAULT_WEIGHTS,
            ...customWeights,
            severityMultiplier: {
                ...this.DEFAULT_WEIGHTS.severityMultiplier,
                ...(customWeights?.severityMultiplier || {})
            },
            categoryWeights: {
                ...this.DEFAULT_WEIGHTS.categoryWeights,
                ...(customWeights?.categoryWeights || {})
            },
            documentTypeModifiers: {
                ...this.DEFAULT_WEIGHTS.documentTypeModifiers,
                ...(customWeights?.documentTypeModifiers || {})
            },
            lengthAdjustment: {
                ...this.DEFAULT_WEIGHTS.lengthAdjustment,
                ...(customWeights?.lengthAdjustment || {})
            }
        };
        logger.info('Risk Scoring Engine initialized', {
            customWeights: !!customWeights
        });
    }
    async calculateRiskScore(patternAnalysis, documentMetadata = {}) {
        const startTime = Date.now();
        logger.info('Starting risk assessment', {
            totalMatches: patternAnalysis.totalMatches,
            categories: Object.keys(patternAnalysis.categorizedMatches).length,
            documentType: documentMetadata.type,
            wordCount: documentMetadata.wordCount
        });
        try {
            const riskFactors = await this.calculateRiskFactors(patternAnalysis);
            const categoryScores = this.calculateCategoryScores(patternAnalysis.categorizedMatches);
            const baseScore = this.calculateBaseScore(riskFactors);
            const adjustedScore = this.applyDocumentAdjustments(baseScore, documentMetadata);
            const riskLevel = this.determineRiskLevel(adjustedScore);
            const confidence = this.calculateOverallConfidence(riskFactors);
            const recommendations = this.generateRecommendations(riskFactors, adjustedScore);
            const executiveSummary = this.generateExecutiveSummary(adjustedScore, riskLevel, riskFactors, patternAnalysis.totalMatches);
            const assessment = {
                overallScore: Math.round(adjustedScore),
                riskLevel,
                confidence: Math.round(confidence * 100) / 100,
                factors: riskFactors,
                categoryScores,
                trend: 'stable',
                recommendations,
                executiveSummary
            };
            const processingTime = Date.now() - startTime;
            logger.info('Risk assessment completed', {
                overallScore: assessment.overallScore,
                riskLevel: assessment.riskLevel,
                confidence: assessment.confidence,
                factorsCount: riskFactors.length,
                processingTime
            });
            return assessment;
        }
        catch (error) {
            logger.error('Risk assessment failed', {
                error: error.message,
                totalMatches: patternAnalysis.totalMatches
            });
            throw error;
        }
    }
    async calculateRiskFactors(patternAnalysis) {
        const riskFactors = [];
        for (const [category, matches] of Object.entries(patternAnalysis.categorizedMatches)) {
            for (const match of matches) {
                if (match.confidence < this.scoringWeights.confidenceThreshold) {
                    continue;
                }
                const categoryWeight = this.scoringWeights.categoryWeights[category] || 1.0;
                const severityMultiplier = this.scoringWeights.severityMultiplier[match.severity];
                const baseScore = match.confidence * severityMultiplier * match.matches.length;
                const weightedScore = baseScore * categoryWeight;
                const evidence = match.matches.map(m => m.text).slice(0, 3);
                riskFactors.push({
                    id: match.patternId,
                    name: match.name,
                    category,
                    weight: categoryWeight,
                    severity: match.severity,
                    score: Math.round(weightedScore * 100) / 100,
                    confidence: match.confidence,
                    description: this.getFactorDescription(match),
                    evidence,
                    recommendation: this.getFactorRecommendation(match)
                });
            }
        }
        riskFactors.sort((a, b) => b.score - a.score);
        logger.debug('Risk factors calculated', {
            totalFactors: riskFactors.length,
            averageScore: riskFactors.reduce((sum, f) => sum + f.score, 0) / riskFactors.length,
            highestScore: riskFactors[0]?.score || 0
        });
        return riskFactors;
    }
    calculateCategoryScores(categorizedMatches) {
        const categoryScores = {};
        for (const [category, matches] of Object.entries(categorizedMatches)) {
            let categoryScore = 0;
            let totalWeight = 0;
            for (const match of matches) {
                if (match.confidence >= this.scoringWeights.confidenceThreshold) {
                    const severityMultiplier = this.scoringWeights.severityMultiplier[match.severity];
                    const matchScore = match.confidence * severityMultiplier * match.matches.length;
                    categoryScore += matchScore;
                    totalWeight += 1;
                }
            }
            const normalizedScore = totalWeight > 0 ? categoryScore / totalWeight : 0;
            const categoryWeight = this.scoringWeights.categoryWeights[category] || 1.0;
            categoryScores[category] = Math.round(normalizedScore * categoryWeight * 10);
        }
        return categoryScores;
    }
    calculateBaseScore(riskFactors) {
        if (riskFactors.length === 0)
            return 0;
        const totalWeightedScore = riskFactors.reduce((sum, factor) => {
            return sum + (factor.score * factor.confidence);
        }, 0);
        const totalWeight = riskFactors.reduce((sum, factor) => {
            return sum + factor.confidence;
        }, 0);
        const baseScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
        const normalizedScore = Math.min(100, baseScore);
        const finalScore = normalizedScore * 0.85 + Math.sqrt(normalizedScore) * 1.5;
        return Math.min(100, finalScore);
    }
    applyDocumentAdjustments(baseScore, metadata) {
        let adjustedScore = baseScore;
        if (metadata.type) {
            const typeModifier = this.scoringWeights.documentTypeModifiers[metadata.type] || 1.0;
            adjustedScore *= typeModifier;
        }
        if (metadata.wordCount) {
            let lengthModifier = 1.0;
            if (metadata.wordCount < 1000) {
                lengthModifier = this.scoringWeights.lengthAdjustment.short;
            }
            else if (metadata.wordCount > 5000) {
                lengthModifier = this.scoringWeights.lengthAdjustment.long;
            }
            else {
                lengthModifier = this.scoringWeights.lengthAdjustment.medium;
            }
            adjustedScore *= lengthModifier;
        }
        if (metadata.language && metadata.language !== 'en') {
            adjustedScore *= 0.95;
        }
        if (metadata.jurisdiction) {
            const jurisdictionModifiers = {
                'US': 1.0,
                'EU': 0.9,
                'UK': 0.95,
                'CA': 0.92,
                'AU': 0.96,
                'default': 1.1
            };
            const modifier = jurisdictionModifiers[metadata.jurisdiction] || jurisdictionModifiers['default'];
            adjustedScore *= modifier;
        }
        return Math.min(100, Math.max(0, adjustedScore));
    }
    determineRiskLevel(score) {
        if (score >= 85)
            return 'critical';
        if (score >= 70)
            return 'high';
        if (score >= 50)
            return 'moderate';
        if (score >= 25)
            return 'low';
        return 'minimal';
    }
    calculateOverallConfidence(riskFactors) {
        if (riskFactors.length === 0)
            return 0.1;
        const avgConfidence = riskFactors.reduce((sum, f) => sum + f.confidence, 0) / riskFactors.length;
        const factorBonus = Math.min(0.3, riskFactors.length * 0.05);
        const criticalCount = riskFactors.filter(f => f.severity === 'critical').length;
        const severityBonus = Math.min(0.2, criticalCount * 0.1);
        const overallConfidence = avgConfidence + factorBonus + severityBonus;
        return Math.min(1.0, Math.max(0.1, overallConfidence));
    }
    generateRecommendations(riskFactors, overallScore) {
        const recommendations = [];
        if (overallScore >= 85) {
            recommendations.push('⚠️ CRITICAL: Strongly consider avoiding this service due to significant privacy and user rights concerns');
            recommendations.push('Seek alternative services with better terms and privacy practices');
        }
        else if (overallScore >= 70) {
            recommendations.push('⚠️ HIGH RISK: Carefully review the concerning clauses before accepting');
            recommendations.push('Consider contacting the service to negotiate better terms');
        }
        else if (overallScore >= 50) {
            recommendations.push('⚠️ MODERATE RISK: Review the identified issues and decide if the benefits outweigh the risks');
            recommendations.push('Stay informed about your rights and how to exercise them');
        }
        else if (overallScore >= 25) {
            recommendations.push('✓ MANAGEABLE RISK: Generally acceptable terms with some minor concerns');
            recommendations.push('Review the specific issues mentioned and understand your rights');
        }
        else {
            recommendations.push('✓ LOW RISK: Terms appear to be relatively user-friendly');
            recommendations.push('Continue to review terms periodically for changes');
        }
        const criticalFactors = riskFactors.filter(f => f.severity === 'critical');
        const dataPrivacyIssues = riskFactors.filter(f => f.category === 'Data Privacy');
        const liabilityIssues = riskFactors.filter(f => f.category === 'Liability');
        if (criticalFactors.length > 0) {
            recommendations.push(`Address ${criticalFactors.length} critical issue(s) before proceeding`);
        }
        if (dataPrivacyIssues.length >= 3) {
            recommendations.push('Consider using privacy-focused alternatives or additional privacy tools');
        }
        if (liabilityIssues.length >= 2) {
            recommendations.push('Review your insurance coverage and understand liability limitations');
        }
        const topFactors = riskFactors.slice(0, 3);
        topFactors.forEach(factor => {
            if (factor.recommendation && !recommendations.includes(factor.recommendation)) {
                recommendations.push(factor.recommendation);
            }
        });
        return recommendations.slice(0, 8);
    }
    generateExecutiveSummary(score, riskLevel, riskFactors, totalMatches) {
        const riskLevelText = riskLevel.toUpperCase();
        const criticalCount = riskFactors.filter(f => f.severity === 'critical').length;
        const highCount = riskFactors.filter(f => f.severity === 'high').length;
        let summary = `This document received a risk score of ${score}/100, indicating ${riskLevelText} risk to users. `;
        if (totalMatches === 0) {
            summary += 'No significant problematic clauses were identified in the analysis.';
        }
        else {
            summary += `The analysis identified ${totalMatches} potentially problematic clause(s) across ${riskFactors.length} categories. `;
            if (criticalCount > 0) {
                summary += `${criticalCount} critical issue(s) require immediate attention. `;
            }
            if (highCount > 0) {
                summary += `${highCount} high-severity issue(s) should be carefully reviewed. `;
            }
            const categoryGroups = this.groupFactorsByCategory(riskFactors);
            const topCategories = Object.entries(categoryGroups)
                .sort(([, a], [, b]) => b.length - a.length)
                .slice(0, 2)
                .map(([category]) => category);
            if (topCategories.length > 0) {
                summary += `Primary concerns involve ${topCategories.join(' and ')}.`;
            }
        }
        return summary;
    }
    groupFactorsByCategory(riskFactors) {
        const groups = {};
        for (const factor of riskFactors) {
            if (!groups[factor.category]) {
                groups[factor.category] = [];
            }
            groups[factor.category].push(factor);
        }
        return groups;
    }
    getFactorDescription(match) {
        const descriptions = {
            'Data Privacy': 'This clause may compromise your personal data protection rights',
            'User Rights': 'Your rights as a user may be limited or restricted',
            'Liability': 'The service attempts to limit their legal responsibility',
            'Terms Changes': 'Terms may be changed without adequate notice or consent',
            'Account Termination': 'Your account may be terminated under broad conditions',
            'Dispute Resolution': 'Your legal remedies may be restricted',
            'Auto-Renewal': 'Subscription charges may continue without clear consent',
            'Content Rights': 'Your content ownership or usage rights may be affected',
            'Payment': 'Additional or unexpected charges may apply',
            'Age Restrictions': 'Age-related usage restrictions apply',
            'Jurisdiction': 'Legal disputes must be resolved in specified jurisdiction'
        };
        return descriptions[match.category] || `Potentially problematic clause in ${match.category}`;
    }
    getFactorRecommendation(match) {
        const recommendations = {
            'critical': 'Consider avoiding this service or seeking alternative options',
            'high': 'Carefully review this clause and understand its implications before proceeding',
            'medium': 'Be aware of this limitation and consider how it affects your usage',
            'low': 'Note this clause but it likely has minimal impact on typical usage'
        };
        return recommendations[match.severity] || 'Review this clause carefully';
    }
    async addComparativeAnalysis(assessment, industryData) {
        if (!industryData)
            return assessment;
        const percentile = this.calculatePercentile(assessment.overallScore, industryData.scoreDistribution);
        assessment.comparativeAnalysis = {
            industryAverage: industryData.averageScore,
            percentile,
            similar_documents: industryData.documentCount
        };
        if (assessment.overallScore > industryData.averageScore * 1.2) {
            assessment.recommendations.unshift('This document scores significantly worse than industry average');
        }
        else if (assessment.overallScore < industryData.averageScore * 0.8) {
            assessment.recommendations.unshift('This document has better terms than the industry average');
        }
        return assessment;
    }
    calculatePercentile(score, distribution) {
        let lowerCount = 0;
        let totalCount = 0;
        for (const [range, count] of Object.entries(distribution)) {
            const [min, max] = range.split('-').map(Number);
            totalCount += count;
            if (max < score) {
                lowerCount += count;
            }
            else if (min <= score && score <= max) {
                lowerCount += count * ((score - min) / (max - min));
            }
        }
        return totalCount > 0 ? Math.round((lowerCount / totalCount) * 100) : 50;
    }
    updateScoringWeights(weights) {
        this.scoringWeights = {
            ...this.scoringWeights,
            ...weights,
            severityMultiplier: {
                ...this.scoringWeights.severityMultiplier,
                ...(weights.severityMultiplier || {})
            },
            categoryWeights: {
                ...this.scoringWeights.categoryWeights,
                ...(weights.categoryWeights || {})
            }
        };
        logger.info('Scoring weights updated', { updatedFields: Object.keys(weights) });
    }
    getScoringWeights() {
        return { ...this.scoringWeights };
    }
    async batchScore(analyses) {
        logger.info('Starting batch risk scoring', { count: analyses.length });
        const results = [];
        for (let i = 0; i < analyses.length; i++) {
            try {
                const assessment = await this.calculateRiskScore(analyses[i].patternAnalysis, analyses[i].metadata);
                results.push(assessment);
            }
            catch (error) {
                logger.error('Batch scoring failed for document', {
                    index: i,
                    error: error.message
                });
                results.push({
                    overallScore: 50,
                    riskLevel: 'moderate',
                    confidence: 0.1,
                    factors: [],
                    categoryScores: {},
                    trend: 'stable',
                    recommendations: ['Analysis failed - manual review recommended'],
                    executiveSummary: 'Risk assessment could not be completed due to analysis error'
                });
            }
        }
        logger.info('Batch risk scoring completed', {
            totalDocuments: analyses.length,
            successfulAssessments: results.filter(r => r.confidence > 0.1).length
        });
        return results;
    }
}
exports.RiskScoringEngine = RiskScoringEngine;
exports.riskScoringEngine = new RiskScoringEngine();
//# sourceMappingURL=riskScoring.js.map