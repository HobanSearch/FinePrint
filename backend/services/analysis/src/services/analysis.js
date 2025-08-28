"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisService = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("@fineprintai/shared-logger");
const cache_1 = require("@fineprintai/shared-cache");
const logger = (0, logger_1.createServiceLogger)('analysis-service');
const prisma = new client_1.PrismaClient();
class AnalysisService {
    async createAnalysis(data) {
        try {
            const analysis = await prisma.documentAnalysis.create({
                data: {
                    documentId: data.documentId,
                    userId: data.userId,
                    status: 'pending',
                    version: 1,
                },
            });
            logger.info('Analysis created', {
                analysisId: analysis.id,
                documentId: data.documentId,
                userId: data.userId
            });
            return analysis;
        }
        catch (error) {
            logger.error('Failed to create analysis', { error, data });
            throw error;
        }
    }
    async getAnalysisById(analysisId, userId) {
        try {
            const analysis = await prisma.documentAnalysis.findFirst({
                where: {
                    id: analysisId,
                    userId: userId,
                    deletedAt: null,
                },
                include: {
                    document: {
                        select: {
                            id: true,
                            title: true,
                            documentType: true,
                        },
                    },
                    findings: {
                        select: {
                            id: true,
                            category: true,
                            title: true,
                            description: true,
                            severity: true,
                            confidenceScore: true,
                            textExcerpt: true,
                            positionStart: true,
                            positionEnd: true,
                            recommendation: true,
                            impactExplanation: true,
                        },
                        orderBy: {
                            severity: 'desc',
                        },
                    },
                },
            });
            if (!analysis) {
                return null;
            }
            return {
                id: analysis.id,
                status: analysis.status,
                documentId: analysis.documentId,
                overallRiskScore: analysis.overallRiskScore,
                executiveSummary: analysis.executiveSummary,
                keyFindings: analysis.keyFindings,
                recommendations: analysis.recommendations,
                findings: analysis.findings.map(finding => ({
                    id: finding.id,
                    category: finding.category,
                    title: finding.title,
                    description: finding.description,
                    severity: finding.severity,
                    confidenceScore: finding.confidenceScore?.toNumber() || null,
                    textExcerpt: finding.textExcerpt,
                    positionStart: finding.positionStart,
                    positionEnd: finding.positionEnd,
                    recommendation: finding.recommendation,
                    impactExplanation: finding.impactExplanation,
                })),
                processingTimeMs: analysis.processingTimeMs,
                modelUsed: analysis.modelUsed,
                createdAt: analysis.createdAt,
                completedAt: analysis.completedAt,
            };
        }
        catch (error) {
            logger.error('Failed to get analysis', { error, analysisId, userId });
            throw error;
        }
    }
    async getUserAnalyses(userId, options) {
        try {
            const { page = 1, limit = 20, status } = options;
            const skip = (page - 1) * limit;
            const where = {
                userId,
                deletedAt: null,
                ...(status && { status }),
            };
            const [analyses, total] = await Promise.all([
                prisma.documentAnalysis.findMany({
                    where,
                    include: {
                        document: {
                            select: {
                                title: true,
                            },
                        },
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                    skip,
                    take: limit,
                }),
                prisma.documentAnalysis.count({ where }),
            ]);
            const totalPages = Math.ceil(total / limit);
            const pagination = {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            };
            return {
                analyses: analyses.map(analysis => ({
                    id: analysis.id,
                    status: analysis.status,
                    documentId: analysis.documentId,
                    documentTitle: analysis.document.title,
                    overallRiskScore: analysis.overallRiskScore,
                    createdAt: analysis.createdAt,
                    completedAt: analysis.completedAt,
                })),
                pagination,
            };
        }
        catch (error) {
            logger.error('Failed to get user analyses', { error, userId, options });
            throw error;
        }
    }
    async updateAnalysisStatus(analysisId, status, errorMessage) {
        try {
            const updateData = {
                status,
                ...(status === 'processing' && { startedAt: new Date() }),
                ...(status === 'completed' && { completedAt: new Date() }),
                ...(status === 'failed' && {
                    completedAt: new Date(),
                    errorMessage: errorMessage || 'Analysis failed',
                }),
            };
            const analysis = await prisma.documentAnalysis.update({
                where: { id: analysisId },
                data: updateData,
            });
            await cache_1.analysisCache.del(`analysis:${analysisId}`);
            logger.info('Analysis status updated', {
                analysisId,
                status,
                errorMessage
            });
            return analysis;
        }
        catch (error) {
            logger.error('Failed to update analysis status', {
                error,
                analysisId,
                status
            });
            throw error;
        }
    }
    async saveAnalysisResults(analysisId, results) {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.documentAnalysis.update({
                    where: { id: analysisId },
                    data: {
                        status: 'completed',
                        overallRiskScore: results.overallRiskScore,
                        executiveSummary: results.executiveSummary,
                        keyFindings: results.keyFindings,
                        recommendations: results.recommendations,
                        processingTimeMs: results.processingTimeMs,
                        modelUsed: results.modelUsed,
                        completedAt: new Date(),
                    },
                });
                if (results.findings.length > 0) {
                    await tx.analysisFinding.createMany({
                        data: results.findings.map(finding => ({
                            analysisId,
                            patternId: finding.patternId,
                            category: finding.category,
                            title: finding.title,
                            description: finding.description,
                            severity: finding.severity,
                            confidenceScore: finding.confidenceScore,
                            textExcerpt: finding.textExcerpt,
                            positionStart: finding.positionStart,
                            positionEnd: finding.positionEnd,
                            recommendation: finding.recommendation,
                            impactExplanation: finding.impactExplanation,
                        })),
                    });
                }
            });
            await cache_1.analysisCache.del(`analysis:${analysisId}`);
            logger.info('Analysis results saved', {
                analysisId,
                overallRiskScore: results.overallRiskScore,
                findingsCount: results.findings.length,
                processingTimeMs: results.processingTimeMs,
            });
        }
        catch (error) {
            logger.error('Failed to save analysis results', { error, analysisId });
            throw error;
        }
    }
    async getAnalysisStats(userId) {
        try {
            const where = userId ? { userId } : {};
            const [totalAnalyses, completedAnalyses, pendingAnalyses, failedAnalyses, avgRiskScore,] = await Promise.all([
                prisma.documentAnalysis.count({ where }),
                prisma.documentAnalysis.count({
                    where: { ...where, status: 'completed' }
                }),
                prisma.documentAnalysis.count({
                    where: { ...where, status: 'pending' }
                }),
                prisma.documentAnalysis.count({
                    where: { ...where, status: 'failed' }
                }),
                prisma.documentAnalysis.aggregate({
                    where: { ...where, status: 'completed' },
                    _avg: { overallRiskScore: true },
                }),
            ]);
            return {
                totalAnalyses,
                completedAnalyses,
                pendingAnalyses,
                failedAnalyses,
                avgRiskScore: avgRiskScore._avg.overallRiskScore?.toNumber() || 0,
                completionRate: totalAnalyses > 0
                    ? (completedAnalyses / totalAnalyses) * 100
                    : 0,
            };
        }
        catch (error) {
            logger.error('Failed to get analysis stats', { error, userId });
            throw error;
        }
    }
    async deleteAnalysis(analysisId, userId) {
        try {
            await prisma.documentAnalysis.update({
                where: {
                    id: analysisId,
                    userId,
                },
                data: {
                    deletedAt: new Date(),
                },
            });
            await cache_1.analysisCache.del(`analysis:${analysisId}`);
            logger.info('Analysis deleted', { analysisId, userId });
        }
        catch (error) {
            logger.error('Failed to delete analysis', { error, analysisId, userId });
            throw error;
        }
    }
    async getRecentAnalyses(userId, limit = 5) {
        try {
            const analyses = await prisma.documentAnalysis.findMany({
                where: {
                    userId,
                    status: 'completed',
                    deletedAt: null,
                },
                include: {
                    document: {
                        select: {
                            title: true,
                            documentType: true,
                        },
                    },
                },
                orderBy: {
                    completedAt: 'desc',
                },
                take: limit,
            });
            return analyses.map(analysis => ({
                id: analysis.id,
                documentTitle: analysis.document.title,
                documentType: analysis.document.documentType,
                overallRiskScore: analysis.overallRiskScore,
                completedAt: analysis.completedAt,
            }));
        }
        catch (error) {
            logger.error('Failed to get recent analyses', { error, userId });
            throw error;
        }
    }
}
exports.AnalysisService = AnalysisService;
//# sourceMappingURL=analysis.js.map