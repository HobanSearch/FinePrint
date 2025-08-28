"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchitectureDecisionService = void 0;
const types_1 = require("@/types");
const ai_service_1 = require("./ai-service");
const logger_1 = require("@/utils/logger");
const cache_1 = require("@/utils/cache");
const config_1 = require("@/config");
class ArchitectureDecisionService {
    logger = logger_1.Logger.getInstance();
    cache = new cache_1.Cache('architecture-decisions');
    aiService;
    technologyProfiles = new Map();
    defaultWeights = {
        performance: 0.2,
        scalability: 0.2,
        maintainability: 0.15,
        cost: 0.1,
        complexity: 0.1,
        maturity: 0.1,
        teamExpertise: 0.1,
        timeConstraints: 0.05,
    };
    constructor() {
        this.aiService = new ai_service_1.AIService();
        this.initializeTechnologyProfiles();
    }
    async makeDecision(request) {
        const startTime = Date.now();
        const requestId = this.generateRequestId();
        try {
            this.logger.info(`Starting architecture decision: ${requestId}`, { request });
            const cacheKey = this.generateCacheKey(request);
            const cachedResult = await this.cache.get(cacheKey);
            if (cachedResult && this.isCacheValid(cachedResult)) {
                this.logger.info(`Returning cached decision: ${requestId}`);
                return cachedResult;
            }
            const weights = await this.calculateDecisionWeights(request);
            const analyzedOptions = await Promise.all(request.options.map(option => this.analyzeOption(option, request, weights)));
            const rankedOptions = this.rankOptions(analyzedOptions, weights);
            const recommendation = rankedOptions[0];
            const alternatives = rankedOptions.slice(1, 3);
            const impactAnalysis = await this.performImpactAnalysis(recommendation, request);
            const implementationGuide = await this.generateImplementationGuide(recommendation, request);
            const rationale = await this.generateRationale(recommendation, alternatives, request, weights);
            const result = {
                id: requestId,
                request,
                recommendation,
                alternatives,
                rationale,
                impactAnalysis,
                implementationGuide,
                timestamp: new Date(),
            };
            await this.cache.set(cacheKey, result, config_1.config.agent.architecture.decisionCacheTime);
            const processingTime = Date.now() - startTime;
            this.logger.info(`Architecture decision completed: ${requestId}`, {
                processingTime,
                recommendedOption: recommendation.option,
                confidence: recommendation.confidence,
            });
            return result;
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            this.logger.error(`Architecture decision failed: ${requestId}`, {
                error: error.message,
                processingTime,
            });
            throw error;
        }
    }
    async compareOptions(options, criteria, weights) {
        try {
            const finalWeights = { ...this.defaultWeights, ...weights };
            const comparison = [];
            for (const option of options) {
                const profile = await this.getTechnologyProfile(option.name);
                const scores = {};
                let totalScore = 0;
                for (const criterion of criteria) {
                    const score = this.getScoreForCriterion(profile, criterion);
                    scores[criterion] = score;
                    totalScore += score * (finalWeights[criterion] || 0.1);
                }
                comparison.push({
                    option: option.name,
                    scores,
                    totalScore,
                    rank: 0,
                });
            }
            comparison.sort((a, b) => b.totalScore - a.totalScore);
            comparison.forEach((item, index) => {
                item.rank = index + 1;
            });
            const insights = await this.generateComparisonInsights(comparison, criteria);
            return {
                comparison,
                recommendation: comparison[0].option,
                insights,
            };
        }
        catch (error) {
            this.logger.error('Option comparison failed', { error: error.message });
            throw error;
        }
    }
    async getRecommendationsForUseCase(useCase, constraints = [], preferences = {}) {
        try {
            this.logger.info('Getting recommendations for use case', { useCase, constraints });
            const relevantTechnologies = Array.from(this.technologyProfiles.values())
                .filter(tech => tech.useCases.some(uc => uc.toLowerCase().includes(useCase.toLowerCase()) ||
                useCase.toLowerCase().includes(uc.toLowerCase())));
            if (relevantTechnologies.length === 0) {
                const aiRecommendations = await this.getAIRecommendationsForUseCase(useCase, constraints);
                return aiRecommendations;
            }
            const weights = { ...this.defaultWeights, ...preferences };
            const scoredTechnologies = relevantTechnologies.map(tech => ({
                technology: tech,
                score: this.calculateTechnologyScore(tech, weights, constraints),
            }));
            scoredTechnologies.sort((a, b) => b.score - a.score);
            const recommendations = scoredTechnologies.slice(0, 3).map(st => st.technology);
            const alternatives = scoredTechnologies.slice(3, 6).map(st => st.technology);
            const reasoning = await this.generateUseCaseReasoning(useCase, recommendations, constraints, weights);
            return {
                recommendations,
                reasoning,
                alternatives,
            };
        }
        catch (error) {
            this.logger.error('Use case recommendation failed', { error: error.message });
            throw error;
        }
    }
    async validateDecision(decision, currentContext) {
        try {
            const concerns = [];
            const suggestions = [];
            let isValid = true;
            const ageInHours = (Date.now() - decision.timestamp.getTime()) / (1000 * 60 * 60);
            if (ageInHours > 168) {
                concerns.push('Decision is more than a week old and may be outdated');
                suggestions.push('Consider re-evaluating the decision with current context');
            }
            if (currentContext) {
                const contextValidation = await this.validateAgainstContext(decision, currentContext);
                concerns.push(...contextValidation.concerns);
                suggestions.push(...contextValidation.suggestions);
                if (contextValidation.concerns.length > 2) {
                    isValid = false;
                }
            }
            const newAlternatives = await this.checkForNewAlternatives(decision);
            if (newAlternatives.length > 0) {
                suggestions.push(`Consider evaluating new alternatives: ${newAlternatives.join(', ')}`);
            }
            let updatedRecommendation;
            if (!isValid) {
                updatedRecommendation = await this.generateUpdatedRecommendation(decision, currentContext);
            }
            return {
                isValid,
                concerns,
                suggestions,
                updatedRecommendation,
            };
        }
        catch (error) {
            this.logger.error('Decision validation failed', { error: error.message });
            throw error;
        }
    }
    async calculateDecisionWeights(request) {
        const weights = { ...this.defaultWeights };
        switch (request.context.scalabilityNeeds) {
            case 'large':
            case 'enterprise':
                weights.scalability = 0.3;
                weights.performance = 0.25;
                weights.cost = 0.05;
                break;
            case 'small':
                weights.cost = 0.2;
                weights.complexity = 0.05;
                weights.timeConstraints = 0.1;
                break;
        }
        if (request.context.performanceRequirements) {
            const perfReq = request.context.performanceRequirements;
            if (perfReq.latency && perfReq.latency < 100) {
                weights.performance = 0.35;
            }
            if (perfReq.availability && perfReq.availability > 0.999) {
                weights.scalability = 0.25;
                weights.maturity = 0.15;
            }
        }
        const hasTimeConstraints = request.context.constraints.some(c => c.toLowerCase().includes('time') || c.toLowerCase().includes('deadline'));
        if (hasTimeConstraints) {
            weights.timeConstraints = 0.15;
            weights.complexity = 0.05;
        }
        const hasBudgetConstraints = request.context.constraints.some(c => c.toLowerCase().includes('budget') || c.toLowerCase().includes('cost'));
        if (hasBudgetConstraints) {
            weights.cost = 0.25;
        }
        return weights;
    }
    async analyzeOption(option, request, weights) {
        try {
            const profile = await this.getTechnologyProfile(option.name);
            const baseScore = this.calculateTechnologyScore(profile, weights, request.context.constraints);
            const risks = await this.analyzeRisks(option, request, profile);
            const benefits = await this.analyzeBenefits(option, request, profile);
            const confidence = this.calculateConfidence(option, profile, risks, benefits);
            const reasoning = await this.generateOptionReasoning(option, profile, risks, benefits);
            return {
                option: option.name,
                confidence,
                score: baseScore,
                reasoning,
                risks,
                benefits,
            };
        }
        catch (error) {
            this.logger.warn('Option analysis failed', { option: option.name, error: error.message });
            return {
                option: option.name,
                confidence: 0.5,
                score: 50,
                reasoning: [`Analysis failed: ${error.message}`],
                risks: [{
                        type: types_1.RiskType.TECHNICAL,
                        severity: types_1.RiskSeverity.MEDIUM,
                        description: 'Insufficient data for analysis',
                        mitigation: 'Conduct thorough evaluation',
                        probability: 0.5,
                    }],
                benefits: [],
            };
        }
    }
    rankOptions(options, weights) {
        return options.sort((a, b) => {
            const scoreA = a.score * a.confidence;
            const scoreB = b.score * b.confidence;
            if (Math.abs(scoreA - scoreB) > 5) {
                return scoreB - scoreA;
            }
            const riskScoreA = this.calculateRiskScore(a.risks);
            const riskScoreB = this.calculateRiskScore(b.risks);
            return riskScoreA - riskScoreB;
        });
    }
    async performImpactAnalysis(recommendation, request) {
        try {
            const profile = await this.getTechnologyProfile(recommendation.option);
            return {
                performanceImpact: this.calculatePerformanceImpact(profile, request),
                scalabilityImpact: this.calculateScalabilityImpact(profile, request),
                maintainabilityImpact: this.calculateMaintainabilityImpact(profile, request),
                costImpact: this.calculateCostImpact(profile, request),
                timeToImplement: this.calculateTimeToImplement(profile, request),
                riskLevel: this.calculateOverallRiskLevel(recommendation.risks),
            };
        }
        catch (error) {
            this.logger.error('Impact analysis failed', { error: error.message });
            return {
                performanceImpact: 0,
                scalabilityImpact: 0,
                maintainabilityImpact: 0,
                costImpact: 0,
                timeToImplement: 30,
                riskLevel: types_1.RiskSeverity.MEDIUM,
            };
        }
    }
    async generateImplementationGuide(recommendation, request) {
        try {
            const profile = await this.getTechnologyProfile(recommendation.option);
            const steps = await this.generateImplementationSteps(recommendation.option, request.decisionType, request.context);
            const estimatedTime = steps.reduce((total, step) => total + step.estimatedTime, 0);
            const requiredSkills = await this.determineRequiredSkills(profile, request);
            const dependencies = await this.identifyDependencies(profile, request);
            const testingStrategy = await this.generateTestingStrategy(recommendation.option, request);
            const rollbackPlan = await this.generateRollbackPlan(recommendation.option, request);
            return {
                steps,
                estimatedTime,
                requiredSkills,
                dependencies,
                testingStrategy,
                rollbackPlan,
            };
        }
        catch (error) {
            this.logger.error('Implementation guide generation failed', { error: error.message });
            return {
                steps: [{
                        id: '1',
                        title: 'Initial Setup',
                        description: `Set up ${recommendation.option}`,
                        estimatedTime: 8,
                        dependencies: [],
                        deliverables: ['Basic setup completed'],
                        risks: ['Setup complexity'],
                    }],
                estimatedTime: 8,
                requiredSkills: ['General development'],
                dependencies: [],
                testingStrategy: 'Standard testing procedures',
                rollbackPlan: 'Revert to previous solution',
            };
        }
    }
    async generateRationale(recommendation, alternatives, request, weights) {
        const prompt = `
Generate a comprehensive rationale for the following architecture decision:

Recommended Option: ${recommendation.option}
Score: ${recommendation.score}
Confidence: ${recommendation.confidence}

Top Alternatives:
${alternatives.map(alt => `- ${alt.option} (Score: ${alt.score})`).join('\n')}

Decision Context:
- Type: ${request.decisionType}
- Project Type: ${request.context.projectType}
- Scalability Needs: ${request.context.scalabilityNeeds}
- Requirements: ${request.context.requirements.join(', ')}
- Constraints: ${request.context.constraints.join(', ')}

Decision Weights:
${Object.entries(weights).map(([key, value]) => `- ${key}: ${(value * 100).toFixed(1)}%`).join('\n')}

Main Benefits:
${recommendation.benefits.map(b => `- ${b.description}`).join('\n')}

Key Risks:
${recommendation.risks.map(r => `- ${r.description} (${r.severity})`).join('\n')}

Provide a clear, well-structured rationale explaining why this option was chosen over the alternatives.
    `;
        try {
            return await this.aiService.generateStructuredResponse(prompt);
        }
        catch (error) {
            this.logger.warn('AI rationale generation failed', { error: error.message });
            return `
${recommendation.option} was selected as the recommended option based on the following analysis:

**Key Strengths:**
${recommendation.benefits.map(b => `- ${b.description}`).join('\n')}

**Score Analysis:**
The option achieved a score of ${recommendation.score} with ${(recommendation.confidence * 100).toFixed(1)}% confidence, outperforming alternatives by considering the specific requirements and constraints of this project.

**Risk Mitigation:**
While there are ${recommendation.risks.length} identified risks, they can be effectively managed through proper planning and implementation strategies.
      `.trim();
        }
    }
    initializeTechnologyProfiles() {
        this.addTechnologyProfile({
            name: 'React',
            category: 'Frontend Framework',
            scores: {
                performance: 8,
                scalability: 9,
                maintainability: 8,
                cost: 9,
                complexity: 6,
                maturity: 9,
                teamExpertise: 8,
                timeConstraints: 8,
            },
            pros: [
                'Large ecosystem',
                'Strong community support',
                'Component-based architecture',
                'Virtual DOM performance',
                'Excellent tooling',
            ],
            cons: [
                'Steep learning curve',
                'Rapid ecosystem changes',
                'JSX syntax',
                'Bundle size can be large',
            ],
            useCases: [
                'Single Page Applications',
                'Progressive Web Apps',
                'Complex user interfaces',
                'Real-time applications',
            ],
            alternatives: ['Vue.js', 'Angular', 'Svelte'],
            learningCurve: 'medium',
            communitySupport: 'high',
            documentation: 'excellent',
            lastUpdated: new Date(),
        });
        this.addTechnologyProfile({
            name: 'Node.js',
            category: 'Backend Runtime',
            scores: {
                performance: 8,
                scalability: 9,
                maintainability: 7,
                cost: 9,
                complexity: 6,
                maturity: 9,
                teamExpertise: 8,
                timeConstraints: 9,
            },
            pros: [
                'JavaScript everywhere',
                'Fast development',
                'Large package ecosystem',
                'Event-driven architecture',
                'Good for real-time applications',
            ],
            cons: [
                'Single-threaded nature',
                'Callback complexity',
                'Package security concerns',
                'CPU-intensive task limitations',
            ],
            useCases: [
                'REST APIs',
                'Real-time applications',
                'Microservices',
                'Server-side rendering',
            ],
            alternatives: ['Python/Django', 'Java/Spring', 'Go', 'Rust'],
            learningCurve: 'low',
            communitySupport: 'high',
            documentation: 'excellent',
            lastUpdated: new Date(),
        });
        this.logger.info('Technology profiles initialized', {
            profileCount: this.technologyProfiles.size,
        });
    }
    addTechnologyProfile(profile) {
        this.technologyProfiles.set(profile.name.toLowerCase(), profile);
    }
    async getTechnologyProfile(name) {
        const profile = this.technologyProfiles.get(name.toLowerCase());
        if (profile) {
            return profile;
        }
        try {
            const aiProfile = await this.generateTechnologyProfileWithAI(name);
            this.addTechnologyProfile(aiProfile);
            return aiProfile;
        }
        catch (error) {
            this.logger.warn('Failed to generate technology profile', { name, error: error.message });
            return {
                name,
                category: 'Unknown',
                scores: {
                    performance: 5,
                    scalability: 5,
                    maintainability: 5,
                    cost: 5,
                    complexity: 5,
                    maturity: 5,
                    teamExpertise: 5,
                    timeConstraints: 5,
                },
                pros: ['Unknown benefits'],
                cons: ['Unknown drawbacks'],
                useCases: ['General purpose'],
                alternatives: [],
                learningCurve: 'medium',
                communitySupport: 'medium',
                documentation: 'good',
                lastUpdated: new Date(),
            };
        }
    }
    generateRequestId() {
        return `arch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    generateCacheKey(request) {
        const key = JSON.stringify({
            decisionType: request.decisionType,
            context: request.context,
            options: request.options.map(o => ({ name: o.name, description: o.description })),
        });
        return Buffer.from(key).toString('base64');
    }
    isCacheValid(result) {
        const maxAge = config_1.config.agent.architecture.decisionCacheTime;
        const age = Date.now() - result.timestamp.getTime();
        return age < maxAge;
    }
    calculateTechnologyScore(profile, weights, constraints) {
        let score = 0;
        score += profile.scores.performance * weights.performance;
        score += profile.scores.scalability * weights.scalability;
        score += profile.scores.maintainability * weights.maintainability;
        score += profile.scores.cost * weights.cost;
        score += profile.scores.complexity * weights.complexity;
        score += profile.scores.maturity * weights.maturity;
        score += profile.scores.teamExpertise * weights.teamExpertise;
        score += profile.scores.timeConstraints * weights.timeConstraints;
        constraints.forEach(constraint => {
            if (this.violatesConstraint(profile, constraint)) {
                score *= 0.8;
            }
        });
        return Math.round(score * 10);
    }
    violatesConstraint(profile, constraint) {
        const constraintLower = constraint.toLowerCase();
        if (constraintLower.includes('budget') && profile.scores.cost < 6) {
            return true;
        }
        if (constraintLower.includes('time') && profile.scores.timeConstraints < 6) {
            return true;
        }
        if (constraintLower.includes('performance') && profile.scores.performance < 7) {
            return true;
        }
        return false;
    }
    getScoreForCriterion(profile, criterion) {
        const criterionMap = {
            performance: 'performance',
            scalability: 'scalability',
            maintainability: 'maintainability',
            cost: 'cost',
            complexity: 'complexity',
            maturity: 'maturity',
            'team expertise': 'teamExpertise',
            'time constraints': 'timeConstraints',
        };
        const key = criterionMap[criterion.toLowerCase()];
        return key ? profile.scores[key] : 5;
    }
    async analyzeRisks(option, request, profile) { return []; }
    async analyzeBenefits(option, request, profile) { return []; }
    calculateConfidence(option, profile, risks, benefits) { return 0.8; }
    async generateOptionReasoning(option, profile, risks, benefits) { return []; }
    calculateRiskScore(risks) { return 0; }
    calculatePerformanceImpact(profile, request) { return 0; }
    calculateScalabilityImpact(profile, request) { return 0; }
    calculateMaintainabilityImpact(profile, request) { return 0; }
    calculateCostImpact(profile, request) { return 0; }
    calculateTimeToImplement(profile, request) { return 30; }
    calculateOverallRiskLevel(risks) { return types_1.RiskSeverity.MEDIUM; }
    async generateImplementationSteps(option, decisionType, context) { return []; }
    async determineRequiredSkills(profile, request) { return []; }
    async identifyDependencies(profile, request) { return []; }
    async generateTestingStrategy(option, request) { return ''; }
    async generateRollbackPlan(option, request) { return ''; }
    async generateComparisonInsights(comparison, criteria) { return []; }
    async getAIRecommendationsForUseCase(useCase, constraints) { return {}; }
    async generateUseCaseReasoning(useCase, recommendations, constraints, weights) { return ''; }
    async validateAgainstContext(decision, context) { return { concerns: [], suggestions: [] }; }
    async checkForNewAlternatives(decision) { return []; }
    async generateUpdatedRecommendation(decision, context) { return decision.recommendation; }
    async generateTechnologyProfileWithAI(name) {
        throw new Error('AI profile generation not implemented');
    }
}
exports.ArchitectureDecisionService = ArchitectureDecisionService;
//# sourceMappingURL=architecture-decision-service.js.map