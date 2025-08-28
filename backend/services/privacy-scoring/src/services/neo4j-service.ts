import neo4j, { Driver, Session } from 'neo4j-driver';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Website, PrivacyScore } from '../types';

export class Neo4jService {
  private driver: Driver;

  constructor() {
    this.driver = neo4j.driver(
      config.neo4j.uri,
      neo4j.auth.basic(config.neo4j.username, config.neo4j.password)
    );
  }

  /**
   * Update website score in the knowledge graph
   */
  async updateWebsiteScore(website: any, score: PrivacyScore): Promise<void> {
    const session = this.driver.session();

    try {
      await session.run(
        `
        MERGE (w:Website {id: $websiteId})
        SET w.name = $name,
            w.domain = $domain,
            w.category = $category,
            w.rank = $rank,
            w.currentScore = $score,
            w.currentGrade = $grade,
            w.lastUpdated = datetime()
        
        WITH w
        CREATE (s:Score {
          id: $scoreId,
          value: $score,
          grade: $grade,
          calculatedAt: datetime($calculatedAt),
          trending: $trending
        })
        
        CREATE (w)-[:HAS_SCORE {current: true}]->(s)
        
        WITH w
        MATCH (w)-[r:HAS_SCORE]->(oldScore:Score)
        WHERE r.current = true AND oldScore.id <> $scoreId
        SET r.current = false
        `,
        {
          websiteId: website.id,
          name: website.name,
          domain: website.domain,
          category: website.category,
          rank: website.rank,
          scoreId: score.id,
          score: score.overallScore,
          grade: score.grade,
          calculatedAt: score.calculatedAt.toISOString(),
          trending: score.trending,
        }
      );

      // Add pattern relationships
      for (const pattern of score.patternDetections) {
        await session.run(
          `
          MATCH (s:Score {id: $scoreId})
          MERGE (p:Pattern {id: $patternId})
          SET p.name = $patternName,
              p.severity = $severity
          
          CREATE (s)-[:DETECTED_PATTERN {
            impact: $impact,
            location: $location,
            description: $description
          }]->(p)
          `,
          {
            scoreId: score.id,
            patternId: pattern.patternId,
            patternName: pattern.patternName,
            severity: pattern.severity,
            impact: pattern.impact,
            location: pattern.location,
            description: pattern.description,
          }
        );
      }

      logger.info(`Updated Neo4j graph for ${website.name}`);
    } finally {
      await session.close();
    }
  }

  /**
   * Get website comparison data
   */
  async getWebsiteComparison(websiteIds: string[]): Promise<any[]> {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        MATCH (w:Website)-[:HAS_SCORE {current: true}]->(s:Score)
        WHERE w.id IN $websiteIds
        RETURN w.id as websiteId,
               w.name as name,
               w.category as category,
               s.value as score,
               s.grade as grade,
               s.trending as trending
        ORDER BY s.value DESC
        `,
        { websiteIds }
      );

      return result.records.map(record => ({
        websiteId: record.get('websiteId'),
        name: record.get('name'),
        category: record.get('category'),
        score: record.get('score'),
        grade: record.get('grade'),
        trending: record.get('trending'),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get category rankings
   */
  async getCategoryRankings(category: string): Promise<any[]> {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        MATCH (w:Website {category: $category})-[:HAS_SCORE {current: true}]->(s:Score)
        RETURN w.id as websiteId,
               w.name as name,
               w.rank as globalRank,
               s.value as score,
               s.grade as grade
        ORDER BY s.value DESC
        `,
        { category }
      );

      return result.records.map((record, index) => ({
        websiteId: record.get('websiteId'),
        name: record.get('name'),
        globalRank: record.get('globalRank'),
        categoryRank: index + 1,
        score: record.get('score'),
        grade: record.get('grade'),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get trending websites
   */
  async getTrendingWebsites(trend: 'improving' | 'declining'): Promise<any[]> {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        MATCH (w:Website)-[:HAS_SCORE {current: true}]->(s:Score {trending: $trend})
        MATCH (w)-[:HAS_SCORE]->(oldScore:Score)
        WHERE oldScore.calculatedAt < s.calculatedAt
        WITH w, s, oldScore
        ORDER BY oldScore.calculatedAt DESC
        LIMIT 1
        RETURN w.id as websiteId,
               w.name as name,
               w.category as category,
               s.value as currentScore,
               s.grade as currentGrade,
               oldScore.value as previousScore,
               (s.value - oldScore.value) as change
        ORDER BY abs(s.value - oldScore.value) DESC
        LIMIT 10
        `,
        { trend }
      );

      return result.records.map(record => ({
        websiteId: record.get('websiteId'),
        name: record.get('name'),
        category: record.get('category'),
        currentScore: record.get('currentScore'),
        currentGrade: record.get('currentGrade'),
        previousScore: record.get('previousScore'),
        change: record.get('change'),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get pattern statistics
   */
  async getPatternStatistics(): Promise<any[]> {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        MATCH (p:Pattern)<-[r:DETECTED_PATTERN]-(s:Score)<-[:HAS_SCORE {current: true}]-(w:Website)
        WITH p, count(DISTINCT w) as websiteCount, avg(r.impact) as avgImpact
        RETURN p.id as patternId,
               p.name as patternName,
               p.severity as severity,
               websiteCount,
               avgImpact
        ORDER BY websiteCount DESC, avgImpact DESC
        `
      );

      return result.records.map(record => ({
        patternId: record.get('patternId'),
        patternName: record.get('patternName'),
        severity: record.get('severity'),
        websiteCount: record.get('websiteCount').toNumber(),
        avgImpact: record.get('avgImpact'),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Close the Neo4j connection
   */
  async close(): Promise<void> {
    await this.driver.close();
  }
}

export const neo4jService = new Neo4jService();