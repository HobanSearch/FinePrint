import { KnowledgeGraphService } from './knowledge-graph-service';
import { LegalConcept } from './legal-ontology-service';
import { z } from 'zod';
export declare const LearningSessionSchema: any;
export declare const CurriculumPathSchema: any;
export declare const LearnerProfileSchema: any;
export type LearningSession = z.infer<typeof LearningSessionSchema>;
export type CurriculumPath = z.infer<typeof CurriculumPathSchema>;
export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;
export declare enum CurriculumStrategy {
    DIFFICULTY_BASED = "DIFFICULTY_BASED",
    PREREQUISITE_BASED = "PREREQUISITE_BASED",
    PERFORMANCE_ADAPTIVE = "PERFORMANCE_ADAPTIVE",
    SELF_PACED = "SELF_PACED",
    COMPETENCY_BASED = "COMPETENCY_BASED",
    SPIRAL_CURRICULUM = "SPIRAL_CURRICULUM"
}
export interface DifficultyProgression {
    current_level: number;
    next_level: number;
    progression_rate: number;
    confidence_threshold: number;
    mastery_evidence: Array<{
        concept_id: string;
        mastery_score: number;
        evidence_sessions: string[];
    }>;
}
export interface AdaptiveCurriculumRecommendation {
    next_concepts: Array<{
        concept: LegalConcept;
        priority: number;
        estimated_difficulty: number;
        prerequisite_status: 'MET' | 'PARTIAL' | 'NOT_MET';
        recommended_approach: string;
    }>;
    difficulty_adjustment: {
        current_level: number;
        recommended_level: number;
        reason: string;
    };
    learning_path_optimization: {
        skip_concepts: string[];
        reinforce_concepts: string[];
        accelerate_concepts: string[];
    };
    estimated_completion_time: number;
}
export declare class CurriculumLearningService {
    private knowledgeGraph;
    private learnerProfiles;
    private curriculumPaths;
    private activeSessions;
    private initialized;
    constructor(knowledgeGraph: KnowledgeGraphService);
    initialize(): Promise<void>;
    createLearnerProfile(profile: Partial<LearnerProfile>): Promise<LearnerProfile>;
    getLearnerProfile(learnerId: string): Promise<LearnerProfile | null>;
    createCurriculumPath(path: Partial<CurriculumPath>): Promise<CurriculumPath>;
    getAdaptiveCurriculumRecommendation(learnerId: string, strategy?: CurriculumStrategy): Promise<AdaptiveCurriculumRecommendation>;
    startLearningSession(learnerId: string, sessionType: 'TRAINING' | 'EVALUATION' | 'REINFORCEMENT', concepts: string[], difficultyLevel?: number): Promise<LearningSession>;
    completeLearningSession(sessionId: string, performanceMetrics: {
        accuracy: number;
        speed: number;
        confidence: number;
        error_rate: number;
    }): Promise<{
        session: LearningSession;
        difficulty_progression: DifficultyProgression;
    }>;
    private calculateDifficultyProgression;
    private applyCurriculumStrategy;
    private applyDifficultyBasedStrategy;
    private applyPerformanceAdaptiveStrategy;
    private getCandidateConceptsForLearner;
    private calculateConceptPriority;
    private checkPrerequisiteStatus;
    private getRecommendedApproach;
    private optimizeLearningPath;
    private updateLearnerMastery;
    private getRecentLearnerSessions;
    private calculateAveragePerformance;
    private createDefaultCurriculumPaths;
    private initializePerformanceTracking;
    private applyPrerequisiteBasedStrategy;
    private applyCompetencyBasedStrategy;
    private applySpiralCurriculumStrategy;
    private updateLearnerPerformanceTrends;
    private generateLearningObjectives;
    private calculateConfidenceThreshold;
    private gatherMasteryEvidence;
    private optimizeBasedOnPerformance;
    private estimateCompletionTime;
    isInitialized(): boolean;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=curriculum-learning-service.d.ts.map