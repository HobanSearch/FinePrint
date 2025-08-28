import { PrismaClient } from '@prisma/client';
import { WebsiteScore, ScoreComparison, AnalysisDetails } from '../types';

export class WebsiteService {
  constructor(private prisma: PrismaClient) {}

  async getScores(options: {
    limit: number;
    offset: number;
    category?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
  }): Promise<{
    websites: WebsiteScore[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const where = options.category ? { category: options.category } : {};
    
    const [websites, total] = await Promise.all([
      this.prisma.website.findMany({
        where,
        include: {
          scores: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              patterns: true
            }
          }
        },
        skip: options.offset,
        take: options.limit,
        orderBy: options.sortBy === 'score' 
          ? undefined // Will sort manually after fetching
          : { [options.sortBy || 'rank']: options.order || 'asc' }
      }),
      this.prisma.website.count({ where })
    ]);
    
    const websiteScores: WebsiteScore[] = websites.map(website => {
      const latestScore = website.scores[0];
      return {
        id: website.id,
        name: website.name,
        domain: website.domain,
        category: website.category,
        rank: website.rank,
        score: latestScore?.score || null,
        grade: latestScore?.grade || null,
        lastAnalyzed: latestScore?.createdAt.toISOString() || null,
        findings: latestScore?.findings as any[] || [],
        patterns: latestScore?.patterns.map(p => ({
          type: p.type,
          severity: p.severity,
          description: p.description
        })) || [],
        scoreTrend: this.calculateTrend(website.scores.map(s => s.score))
      };
    });
    
    // Sort by score if requested
    if (options.sortBy === 'score') {
      websiteScores.sort((a, b) => {
        const scoreA = a.score || 0;
        const scoreB = b.score || 0;
        return options.order === 'desc' ? scoreB - scoreA : scoreA - scoreB;
      });
    }
    
    return {
      websites: websiteScores,
      total,
      limit: options.limit,
      offset: options.offset
    };
  }

  async getScore(websiteId: string): Promise<WebsiteScore | null> {
    const website = await this.prisma.website.findUnique({
      where: { id: websiteId },
      include: {
        scores: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            patterns: true
          }
        }
      }
    });
    
    if (!website) {
      return null;
    }
    
    const latestScore = website.scores[0];
    return {
      id: website.id,
      name: website.name,
      domain: website.domain,
      category: website.category,
      rank: website.rank,
      score: latestScore?.score || null,
      grade: latestScore?.grade || null,
      lastAnalyzed: latestScore?.createdAt.toISOString() || null,
      findings: latestScore?.findings as any[] || [],
      patterns: latestScore?.patterns.map(p => ({
        type: p.type,
        severity: p.severity,
        description: p.description
      })) || [],
      scoreTrend: this.calculateTrend(website.scores.map(s => s.score))
    };
  }

  async compareWebsites(websiteIds: string[]): Promise<ScoreComparison> {
    const websites = await Promise.all(
      websiteIds.map(id => this.getScore(id))
    );
    
    const validWebsites = websites.filter(w => w !== null) as WebsiteScore[];
    
    if (validWebsites.length < 2) {
      throw new Error('Not enough valid websites to compare');
    }
    
    // Find common patterns
    const allPatterns = validWebsites.flatMap(w => w.patterns.map(p => p.type));
    const patternCounts = allPatterns.reduce((acc, pattern) => {
      acc[pattern] = (acc[pattern] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const commonPatterns = Object.entries(patternCounts)
      .filter(([_, count]) => count >= 2)
      .map(([pattern]) => pattern);
    
    // Calculate differences
    const scores = validWebsites.map(w => w.score || 0);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    
    return {
      websites: validWebsites.map(w => ({
        id: w.id,
        name: w.name,
        score: w.score || 0,
        grade: w.grade || 'N/A'
      })),
      commonPatterns,
      averageScore: Math.round(avgScore),
      scoreDifference: maxScore - minScore,
      best: validWebsites.find(w => w.score === maxScore)!.id,
      worst: validWebsites.find(w => w.score === minScore)!.id
    };
  }

  async getAnalysisDetails(websiteId: string): Promise<AnalysisDetails | null> {
    const website = await this.prisma.website.findUnique({
      where: { id: websiteId },
      include: {
        scores: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            patterns: true,
            documents: {
              include: {
                document: true
              }
            }
          }
        }
      }
    });
    
    if (!website || !website.scores[0]) {
      return null;
    }
    
    const score = website.scores[0];
    const privacyDoc = score.documents.find(d => d.document.type === 'privacy_policy');
    
    return {
      websiteId: website.id,
      documentContent: privacyDoc?.document.content || '',
      patterns: score.patterns.map(p => ({
        type: p.type,
        severity: p.severity,
        description: p.description,
        location: p.location
      })),
      findings: score.findings as any[],
      summary: score.summary || '',
      recommendations: score.recommendations as string[]
    };
  }

  private calculateTrend(scores: number[]): 'improving' | 'declining' | 'stable' {
    if (scores.length < 2) return 'stable';
    
    const recent = scores.slice(0, 3);
    const older = scores.slice(3, 6);
    
    if (recent.length === 0 || older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const difference = recentAvg - olderAvg;
    
    if (difference > 5) return 'improving';
    if (difference < -5) return 'declining';
    return 'stable';
  }
}