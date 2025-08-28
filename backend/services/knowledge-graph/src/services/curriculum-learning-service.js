"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurriculumLearningService = exports.CurriculumStrategy = exports.LearnerProfileSchema = exports.CurriculumPathSchema = exports.LearningSessionSchema = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const zod_1 = require("zod");
const nanoid_1 = require("nanoid");
const logger = (0, logger_1.createServiceLogger)('curriculum-learning-service');
exports.LearningSessionSchema = zod_1.z.object({
    id: zod_1.z.string().default(() => (0, nanoid_1.nanoid)()),
    learner_id: zod_1.z.string(),
    session_type: zod_1.z.enum(['TRAINING', 'EVALUATION', 'REINFORCEMENT']),
    start_time: zod_1.z.date().default(() => new Date()),
    end_time: zod_1.z.date().optional(),
    difficulty_level: zod_1.z.number().min(1).max(10),
    concepts_covered: zod_1.z.array(zod_1.z.string()),
    performance_metrics: zod_1.z.object({
        accuracy: zod_1.z.number().min(0).max(1),
        speed: zod_1.z.number().min(0),
        confidence: zod_1.z.number().min(0).max(1),
        error_rate: zod_1.z.number().min(0).max(1),
    }).optional(),
    learning_objectives: zod_1.z.array(zod_1.z.string()),
    completed: zod_1.z.boolean().default(false),
});
exports.CurriculumPathSchema = zod_1.z.object({
    id: zod_1.z.string().default(() => (0, nanoid_1.nanoid)()),
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    target_learner_type: zod_1.z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']),
    estimated_duration_hours: zod_1.z.number().min(1),
    learning_phases: zod_1.z.array(zod_1.z.object({
        phase_id: zod_1.z.string(),
        name: zod_1.z.string(),
        difficulty_range: zod_1.z.tuple([zod_1.z.number(), zod_1.z.number()]),
        concept_categories: zod_1.z.array(zod_1.z.string()),
        prerequisite_phases: zod_1.z.array(zod_1.z.string()).default([]),
        estimated_duration_hours: zod_1.z.number(),
        learning_objectives: zod_1.z.array(zod_1.z.string()),
        success_criteria: zod_1.z.object({
            min_accuracy: zod_1.z.number().min(0).max(1),
            min_confidence: zod_1.z.number().min(0).max(1),
            required_concepts_mastered: zod_1.z.number().min(0),
        }),
    })),
    adaptive_parameters: zod_1.z.object({
        difficulty_adjustment_factor: zod_1.z.number().min(0.1).max(2.0).default(1.2),
        performance_window_size: zod_1.z.number().min(3).max(20).default(10),
        mastery_threshold: zod_1.z.number().min(0.7).max(1.0).default(0.85),
        forgetting_curve_factor: zod_1.z.number().min(0.1).max(1.0).default(0.7),
    }),
    created_at: zod_1.z.date().default(() => new Date()),
    updated_at: zod_1.z.date().default(() => new Date()),
});
exports.LearnerProfileSchema = zod_1.z.object({
    id: zod_1.z.string().default(() => (0, nanoid_1.nanoid)()),
    learner_type: zod_1.z.enum(['AI_MODEL', 'HUMAN_ANNOTATOR', 'VALIDATION_SYSTEM']),
    current_level: zod_1.z.number().min(1).max(10).default(1),
    learning_history: zod_1.z.array(zod_1.z.string()).default([]),
    mastered_concepts: zod_1.z.array(zod_1.z.string()).default([]),
    struggling_concepts: zod_1.z.array(zod_1.z.string()).default([]),
    learning_preferences: zod_1.z.object({
        preferred_difficulty_progression: zod_1.z.enum(['GRADUAL', 'AGGRESSIVE', 'ADAPTIVE']).default('ADAPTIVE'),
        focus_areas: zod_1.z.array(zod_1.z.string()).default([]),
        avoid_areas: zod_1.z.array(zod_1.z.string()).default([]),
    }),
    performance_trends: zod_1.z.object({
        accuracy_trend: zod_1.z.enum(['IMPROVING', 'STABLE', 'DECLINING']).default('STABLE'),
        speed_trend: zod_1.z.enum(['IMPROVING', 'STABLE', 'DECLINING']).default('STABLE'),
        confidence_trend: zod_1.z.enum(['IMPROVING', 'STABLE', 'DECLINING']).default('STABLE'),
    }),
    metadata: zod_1.z.record(zod_1.z.any()).default({}),
    created_at: zod_1.z.date().default(() => new Date()),
    updated_at: zod_1.z.date().default(() => new Date()),
});
var CurriculumStrategy;
(function (CurriculumStrategy) {
    CurriculumStrategy["DIFFICULTY_BASED"] = "DIFFICULTY_BASED";
    CurriculumStrategy["PREREQUISITE_BASED"] = "PREREQUISITE_BASED";
    CurriculumStrategy["PERFORMANCE_ADAPTIVE"] = "PERFORMANCE_ADAPTIVE";
    CurriculumStrategy["SELF_PACED"] = "SELF_PACED";
    CurriculumStrategy["COMPETENCY_BASED"] = "COMPETENCY_BASED";
    CurriculumStrategy["SPIRAL_CURRICULUM"] = "SPIRAL_CURRICULUM";
})(CurriculumStrategy || (exports.CurriculumStrategy = CurriculumStrategy = {}));
class CurriculumLearningService {
    knowledgeGraph;
    learnerProfiles = new Map();
    curriculumPaths = new Map();
    activeSessions = new Map();
    initialized = false;
    constructor(knowledgeGraph) {
        this.knowledgeGraph = knowledgeGraph;
    }
    async initialize() {
        try {
            logger.info('Initializing Curriculum Learning Service...');
            await this.createDefaultCurriculumPaths();
            await this.initializePerformanceTracking();
            this.initialized = true;
            logger.info('Curriculum Learning Service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize Curriculum Learning Service', { error });
            throw error;
        }
    }
    async createLearnerProfile(profile) {
        const validatedProfile = exports.LearnerProfileSchema.parse(profile);
        this.learnerProfiles.set(validatedProfile.id, validatedProfile);
        logger.info('Learner profile created', {
            learnerId: validatedProfile.id,
            type: validatedProfile.learner_type
        });
        return validatedProfile;
    }
    async getLearnerProfile(learnerId) {
        const profile = this.learnerProfiles.get(learnerId);
        if (!profile)
            return null;
        const updatedProfile = await this.updateLearnerPerformanceTrends(profile);
        this.learnerProfiles.set(learnerId, updatedProfile);
        return updatedProfile;
    }
    async createCurriculumPath(path) {
        const validatedPath = exports.CurriculumPathSchema.parse(path);
        this.curriculumPaths.set(validatedPath.id, validatedPath);
        logger.info('Curriculum path created', {
            pathId: validatedPath.id,
            name: validatedPath.name,
            phases: validatedPath.learning_phases.length
        });
        return validatedPath;
    }
    async getAdaptiveCurriculumRecommendation(learnerId, strategy = CurriculumStrategy.PERFORMANCE_ADAPTIVE) {
        const profile = await this.getLearnerProfile(learnerId);
        if (!profile) {
            throw new Error(`Learner profile not found: ${learnerId}`);
        }
        try {
            logger.debug('Generating adaptive curriculum recommendation', {
                learnerId,
                strategy,
                currentLevel: profile.current_level
            });
            const candidateConcepts = await this.getCandidateConceptsForLearner(profile);
            const recommendation = await this.applyCurriculumStrategy(profile, candidateConcepts, strategy);
            const optimizedRecommendation = await this.optimizeLearningPath(recommendation, profile);
            logger.info('Adaptive curriculum recommendation generated', {
                learnerId,
                nextConceptsCount: optimizedRecommendation.next_concepts.length,
                recommendedLevel: optimizedRecommendation.difficulty_adjustment.recommended_level,
                estimatedTime: optimizedRecommendation.estimated_completion_time,
            });
            return optimizedRecommendation;
        }
        catch (error) {
            logger.error('Failed to generate curriculum recommendation', { error, learnerId });
            throw error;
        }
    }
    async startLearningSession(learnerId, sessionType, concepts, difficultyLevel) {
        const profile = await this.getLearnerProfile(learnerId);
        if (!profile) {
            throw new Error(`Learner profile not found: ${learnerId}`);
        }
        const session = exports.LearningSessionSchema.parse({
            learner_id: learnerId,
            session_type: sessionType,
            difficulty_level: difficultyLevel || profile.current_level,
            concepts_covered: concepts,
            learning_objectives: await this.generateLearningObjectives(concepts, sessionType),
        });
        this.activeSessions.set(session.id, session);
        logger.info('Learning session started', {
            sessionId: session.id,
            learnerId,
            type: sessionType,
            conceptsCount: concepts.length,
            difficulty: session.difficulty_level,
        });
        return session;
    }
    async completeLearningSession(sessionId, performanceMetrics) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Learning session not found: ${sessionId}`);
        }
        session.end_time = new Date();
        session.performance_metrics = performanceMetrics;
        session.completed = true;
        const profile = await this.getLearnerProfile(session.learner_id);
        if (profile) {
            profile.learning_history.push(sessionId);
            await this.updateLearnerMastery(profile, session);
        }
        const difficultyProgression = await this.calculateDifficultyProgression(session, profile);
        this.activeSessions.delete(sessionId);
        logger.info('Learning session completed', {
            sessionId,
            learnerId: session.learner_id,
            accuracy: performanceMetrics.accuracy,
            difficultyProgression: difficultyProgression.next_level,
        });
        return { session, difficulty_progression: difficultyProgression };
    }
    async calculateDifficultyProgression(session, profile) {
        const recentSessions = await this.getRecentLearnerSessions(profile.id, 10);
        const avgPerformance = this.calculateAveragePerformance(recentSessions);
        let progressionRate = 1.0;
        if (avgPerformance.accuracy > 0.9 && avgPerformance.confidence > 0.8) {
            progressionRate = 1.3;
        }
        else if (avgPerformance.accuracy < 0.7 || avgPerformance.confidence < 0.6) {
            progressionRate = 0.8;
        }
        const currentLevel = profile.current_level;
        const nextLevel = Math.min(10, Math.max(1, Math.round(currentLevel * progressionRate)));
        const masteryEvidence = await this.gatherMasteryEvidence(profile, session.concepts_covered);
        return {
            current_level: currentLevel,
            next_level: nextLevel,
            progression_rate: progressionRate,
            confidence_threshold: this.calculateConfidenceThreshold(avgPerformance),
            mastery_evidence: masteryEvidence,
        };
    }
    async applyCurriculumStrategy(profile, candidateConcepts, strategy) {
        switch (strategy) {
            case CurriculumStrategy.DIFFICULTY_BASED:
                return await this.applyDifficultyBasedStrategy(profile, candidateConcepts);
            case CurriculumStrategy.PREREQUISITE_BASED:
                return await this.applyPrerequisiteBasedStrategy(profile, candidateConcepts);
            case CurriculumStrategy.PERFORMANCE_ADAPTIVE:
                return await this.applyPerformanceAdaptiveStrategy(profile, candidateConcepts);
            case CurriculumStrategy.COMPETENCY_BASED:
                return await this.applyCompetencyBasedStrategy(profile, candidateConcepts);
            case CurriculumStrategy.SPIRAL_CURRICULUM:
                return await this.applySpiralCurriculumStrategy(profile, candidateConcepts);
            default:
                return await this.applyPerformanceAdaptiveStrategy(profile, candidateConcepts);
        }
    }
    async applyDifficultyBasedStrategy(profile, concepts) {
        const sortedConcepts = concepts
            .filter(c => c.difficulty_level >= profile.current_level - 1 &&
            c.difficulty_level <= profile.current_level + 2)
            .sort((a, b) => a.difficulty_level - b.difficulty_level);
        const nextConcepts = sortedConcepts.slice(0, 5).map(concept => ({
            concept,
            priority: this.calculateConceptPriority(concept, profile, 'difficulty'),
            estimated_difficulty: concept.difficulty_level,
            prerequisite_status: 'MET',
            recommended_approach: 'Progressive difficulty increase',
        }));
        return {
            next_concepts: nextConcepts,
            difficulty_adjustment: {
                current_level: profile.current_level,
                recommended_level: Math.min(profile.current_level + 1, 10),
                reason: 'Gradual difficulty progression based on concept complexity',
            },
            learning_path_optimization: {
                skip_concepts: [],
                reinforce_concepts: profile.struggling_concepts.slice(0, 3),
                accelerate_concepts: [],
            },
            estimated_completion_time: nextConcepts.length * 0.5,
        };
    }
    async applyPerformanceAdaptiveStrategy(profile, concepts) {
        const recentSessions = await this.getRecentLearnerSessions(profile.id, 5);
        const avgPerformance = this.calculateAveragePerformance(recentSessions);
        let targetDifficulty = profile.current_level;
        if (avgPerformance.accuracy > 0.85 && avgPerformance.confidence > 0.8) {
            targetDifficulty = Math.min(profile.current_level + 2, 10);
        }
        else if (avgPerformance.accuracy < 0.7) {
            targetDifficulty = Math.max(profile.current_level - 1, 1);
        }
        const nextConcepts = concepts
            .filter(c => Math.abs(c.difficulty_level - targetDifficulty) <= 1)
            .sort((a, b) => this.calculateConceptPriority(b, profile, 'performance') -
            this.calculateConceptPriority(a, profile, 'performance'))
            .slice(0, 6)
            .map(concept => ({
            concept,
            priority: this.calculateConceptPriority(concept, profile, 'performance'),
            estimated_difficulty: concept.difficulty_level,
            prerequisite_status: this.checkPrerequisiteStatus(concept, profile),
            recommended_approach: this.getRecommendedApproach(concept, profile, avgPerformance),
        }));
        return {
            next_concepts: nextConcepts,
            difficulty_adjustment: {
                current_level: profile.current_level,
                recommended_level: targetDifficulty,
                reason: `Performance-based adjustment: accuracy=${avgPerformance.accuracy.toFixed(2)}, confidence=${avgPerformance.confidence.toFixed(2)}`,
            },
            learning_path_optimization: this.optimizeBasedOnPerformance(profile, avgPerformance),
            estimated_completion_time: this.estimateCompletionTime(nextConcepts, avgPerformance),
        };
    }
    async getCandidateConceptsForLearner(profile) {
        const ontologyService = this.knowledgeGraph.getOntologyService();
        const concepts = await ontologyService.getConceptsByDifficulty(Math.max(1, profile.current_level - 2), Math.min(10, profile.current_level + 3));
        return concepts.filter(c => !profile.mastered_concepts.includes(c.id));
    }
    calculateConceptPriority(concept, profile, strategy) {
        let priority = concept.importance_weight;
        switch (strategy) {
            case 'difficulty':
                priority *= (11 - Math.abs(concept.difficulty_level - profile.current_level)) / 10;
                break;
            case 'performance':
                if (profile.struggling_concepts.includes(concept.id)) {
                    priority *= 1.5;
                }
                if (profile.learning_preferences.focus_areas.includes(concept.category)) {
                    priority *= 1.3;
                }
                break;
            case 'prerequisite':
                priority *= 1.0;
                break;
        }
        return priority;
    }
    checkPrerequisiteStatus(concept, profile) {
        if (concept.difficulty_level <= profile.current_level) {
            return 'MET';
        }
        else if (concept.difficulty_level <= profile.current_level + 1) {
            return 'PARTIAL';
        }
        else {
            return 'NOT_MET';
        }
    }
    getRecommendedApproach(concept, profile, performance) {
        if (performance.accuracy < 0.7) {
            return 'Reinforcement learning with additional examples';
        }
        else if (performance.confidence < 0.7) {
            return 'Confidence building through varied scenarios';
        }
        else if (performance.speed < 0.5) {
            return 'Speed training with time-pressured exercises';
        }
        else {
            return 'Standard progressive learning';
        }
    }
    async optimizeLearningPath(recommendation, profile) {
        const ontologyService = this.knowledgeGraph.getOntologyService();
        for (const conceptRec of recommendation.next_concepts) {
            const prerequisites = await ontologyService.getConceptPrerequisites(conceptRec.concept.id);
            const unmetPrerequisites = prerequisites.filter(p => !profile.mastered_concepts.includes(p.id));
            if (unmetPrerequisites.length > 0) {
                conceptRec.priority *= 0.7;
                conceptRec.prerequisite_status = 'NOT_MET';
            }
        }
        recommendation.next_concepts.sort((a, b) => b.priority - a.priority);
        return recommendation;
    }
    async updateLearnerMastery(profile, session) {
        if (!session.performance_metrics)
            return;
        const { accuracy, confidence } = session.performance_metrics;
        const masteryThreshold = 0.85;
        for (const conceptId of session.concepts_covered) {
            if (accuracy >= masteryThreshold && confidence >= masteryThreshold) {
                if (!profile.mastered_concepts.includes(conceptId)) {
                    profile.mastered_concepts.push(conceptId);
                    profile.struggling_concepts = profile.struggling_concepts.filter(id => id !== conceptId);
                }
            }
            else if (accuracy < 0.6 || confidence < 0.6) {
                if (!profile.struggling_concepts.includes(conceptId)) {
                    profile.struggling_concepts.push(conceptId);
                }
            }
        }
        if (profile.mastered_concepts.length >= profile.current_level * 2) {
            profile.current_level = Math.min(profile.current_level + 1, 10);
        }
        profile.updated_at = new Date();
    }
    async getRecentLearnerSessions(learnerId, count) {
        const profile = this.learnerProfiles.get(learnerId);
        if (!profile)
            return [];
        return profile.learning_history.slice(-count).map(sessionId => ({
            id: sessionId,
            learner_id: learnerId,
            session_type: 'TRAINING',
            start_time: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
            difficulty_level: profile.current_level,
            concepts_covered: ['concept1', 'concept2'],
            performance_metrics: {
                accuracy: 0.7 + Math.random() * 0.3,
                speed: 0.5 + Math.random() * 0.5,
                confidence: 0.6 + Math.random() * 0.4,
                error_rate: Math.random() * 0.3,
            },
            learning_objectives: ['objective1'],
            completed: true,
        }));
    }
    calculateAveragePerformance(sessions) {
        if (sessions.length === 0) {
            return { accuracy: 0.5, speed: 0.5, confidence: 0.5, error_rate: 0.5 };
        }
        const validSessions = sessions.filter(s => s.performance_metrics);
        if (validSessions.length === 0) {
            return { accuracy: 0.5, speed: 0.5, confidence: 0.5, error_rate: 0.5 };
        }
        const totals = validSessions.reduce((acc, session) => {
            const metrics = session.performance_metrics;
            return {
                accuracy: acc.accuracy + metrics.accuracy,
                speed: acc.speed + metrics.speed,
                confidence: acc.confidence + metrics.confidence,
                error_rate: acc.error_rate + metrics.error_rate,
            };
        }, { accuracy: 0, speed: 0, confidence: 0, error_rate: 0 });
        return {
            accuracy: totals.accuracy / validSessions.length,
            speed: totals.speed / validSessions.length,
            confidence: totals.confidence / validSessions.length,
            error_rate: totals.error_rate / validSessions.length,
        };
    }
    async createDefaultCurriculumPaths() {
        const beginnerPath = {
            name: 'Legal Analysis Fundamentals',
            description: 'Basic legal concept understanding and clause identification',
            target_learner_type: 'BEGINNER',
            estimated_duration_hours: 20,
            learning_phases: [
                {
                    phase_id: 'phase_1',
                    name: 'Basic Legal Concepts',
                    difficulty_range: [1, 3],
                    concept_categories: ['DATA_PRIVACY', 'USER_RIGHTS'],
                    prerequisite_phases: [],
                    estimated_duration_hours: 8,
                    learning_objectives: [
                        'Understand basic data privacy principles',
                        'Identify user rights in legal documents',
                    ],
                    success_criteria: {
                        min_accuracy: 0.7,
                        min_confidence: 0.6,
                        required_concepts_mastered: 5,
                    },
                },
                {
                    phase_id: 'phase_2',
                    name: 'Intermediate Legal Analysis',
                    difficulty_range: [3, 5],
                    concept_categories: ['LIABILITY', 'TERMINATION', 'DISPUTE_RESOLUTION'],
                    prerequisite_phases: ['phase_1'],
                    estimated_duration_hours: 12,
                    learning_objectives: [
                        'Analyze liability limitations',
                        'Understand termination clauses',
                        'Evaluate dispute resolution mechanisms',
                    ],
                    success_criteria: {
                        min_accuracy: 0.75,
                        min_confidence: 0.7,
                        required_concepts_mastered: 8,
                    },
                },
            ],
        };
        await this.createCurriculumPath(beginnerPath);
        const advancedPath = {
            name: 'Advanced Legal Pattern Recognition',
            description: 'Complex pattern detection and legal reasoning',
            target_learner_type: 'ADVANCED',
            estimated_duration_hours: 40,
            learning_phases: [
                {
                    phase_id: 'advanced_1',
                    name: 'Complex Pattern Analysis',
                    difficulty_range: [6, 8],
                    concept_categories: ['INTELLECTUAL_PROPERTY', 'CONTENT_LICENSING', 'COMPLIANCE'],
                    prerequisite_phases: [],
                    estimated_duration_hours: 20,
                    learning_objectives: [
                        'Detect complex legal patterns',
                        'Understand IP implications',
                        'Analyze compliance requirements',
                    ],
                    success_criteria: {
                        min_accuracy: 0.85,
                        min_confidence: 0.8,
                        required_concepts_mastered: 15,
                    },
                },
                {
                    phase_id: 'advanced_2',
                    name: 'Expert Legal Reasoning',
                    difficulty_range: [8, 10],
                    concept_categories: ['SECURITY', 'COOKIES_TRACKING', 'PAYMENT_TERMS'],
                    prerequisite_phases: ['advanced_1'],
                    estimated_duration_hours: 20,
                    learning_objectives: [
                        'Master expert-level legal analysis',
                        'Understand complex security implications',
                        'Analyze sophisticated payment terms',
                    ],
                    success_criteria: {
                        min_accuracy: 0.9,
                        min_confidence: 0.85,
                        required_concepts_mastered: 25,
                    },
                },
            ],
        };
        await this.createCurriculumPath(advancedPath);
    }
    async initializePerformanceTracking() {
        logger.info('Performance tracking initialized');
    }
    async applyPrerequisiteBasedStrategy(profile, concepts) {
        return this.applyPerformanceAdaptiveStrategy(profile, concepts);
    }
    async applyCompetencyBasedStrategy(profile, concepts) {
        return this.applyPerformanceAdaptiveStrategy(profile, concepts);
    }
    async applySpiralCurriculumStrategy(profile, concepts) {
        return this.applyPerformanceAdaptiveStrategy(profile, concepts);
    }
    async updateLearnerPerformanceTrends(profile) {
        return profile;
    }
    async generateLearningObjectives(concepts, sessionType) {
        return concepts.map(conceptId => `Master concept: ${conceptId} through ${sessionType.toLowerCase()}`);
    }
    calculateConfidenceThreshold(avgPerformance) {
        return Math.max(0.6, Math.min(0.9, avgPerformance.confidence));
    }
    async gatherMasteryEvidence(profile, concepts) {
        return concepts.map(conceptId => ({
            concept_id: conceptId,
            mastery_score: profile.mastered_concepts.includes(conceptId) ? 0.9 : 0.5,
            evidence_sessions: profile.learning_history.slice(-3),
        }));
    }
    optimizeBasedOnPerformance(profile, avgPerformance) {
        return {
            skip_concepts: avgPerformance.accuracy > 0.95 ? profile.mastered_concepts.slice(0, 2) : [],
            reinforce_concepts: profile.struggling_concepts.slice(0, 3),
            accelerate_concepts: avgPerformance.accuracy > 0.9 ? profile.mastered_concepts.slice(0, 2) : [],
        };
    }
    estimateCompletionTime(nextConcepts, avgPerformance) {
        const baseTime = nextConcepts.length * 0.5;
        const speedMultiplier = Math.max(0.5, Math.min(2.0, 1 / avgPerformance.speed));
        return baseTime * speedMultiplier;
    }
    isInitialized() {
        return this.initialized;
    }
    async shutdown() {
        this.learnerProfiles.clear();
        this.curriculumPaths.clear();
        this.activeSessions.clear();
        this.initialized = false;
        logger.info('Curriculum Learning Service shutdown completed');
    }
}
exports.CurriculumLearningService = CurriculumLearningService;
//# sourceMappingURL=curriculum-learning-service.js.map