import { Client as PgClient } from 'pg';
import Redis from 'ioredis';
import { Kafka, Producer, Admin } from 'kafkajs';
import { faker } from '@faker-js/faker';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

export interface TestOrganization {
  id: string;
  name: string;
  plan: 'starter' | 'professional' | 'enterprise';
  apiKey: string;
  webhookUrl?: string;
}

export interface TestAgent {
  id: string;
  organizationId: string;
  type: 'marketing' | 'sales' | 'support' | 'analytics';
  modelVersion: string;
  config: Record<string, any>;
  isActive: boolean;
}

export interface TestExperiment {
  id: string;
  organizationId: string;
  agentId: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  variantA: Record<string, any>;
  variantB: Record<string, any>;
  startedAt: Date;
  metrics: Record<string, any>;
}

export interface TestContent {
  id: string;
  organizationId: string;
  agentId: string;
  type: string;
  content: string;
  metadata: Record<string, any>;
  performance: {
    impressions: number;
    clicks: number;
    conversions: number;
  };
}

export class TestDataSeeder {
  private pgClient: PgClient;
  private redisClient: Redis;
  private kafkaProducer: Producer;
  private kafkaAdmin: Admin;

  constructor() {
    this.pgClient = new PgClient({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5433'),
      user: process.env.PG_USER || 'testuser',
      password: process.env.PG_PASSWORD || 'testpass',
      database: process.env.PG_DATABASE || 'fineprint_test'
    });

    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6380')
    });

    const kafka = new Kafka({
      clientId: 'test-seeder',
      brokers: [process.env.KAFKA_BROKER || 'localhost:9093']
    });

    this.kafkaProducer = kafka.producer();
    this.kafkaAdmin = kafka.admin();
  }

  async initialize(): Promise<void> {
    try {
      await this.pgClient.connect();
      await this.kafkaProducer.connect();
      await this.kafkaAdmin.connect();
      
      logger.info('Test data seeder initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize test data seeder');
      throw error;
    }
  }

  async createSchema(): Promise<void> {
    const schemas = [
      // Organizations table
      `CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        plan VARCHAR(50) NOT NULL,
        api_key VARCHAR(255) UNIQUE NOT NULL,
        webhook_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Agents table
      `CREATE TABLE IF NOT EXISTS agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID REFERENCES organizations(id),
        type VARCHAR(50) NOT NULL,
        model_version VARCHAR(50) NOT NULL,
        config JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Experiments table
      `CREATE TABLE IF NOT EXISTS experiments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID REFERENCES organizations(id),
        agent_id UUID REFERENCES agents(id),
        name VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        variant_a JSONB NOT NULL,
        variant_b JSONB NOT NULL,
        traffic_split DECIMAL(3,2) DEFAULT 0.5,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        metrics JSONB DEFAULT '{}',
        winner VARCHAR(1),
        confidence_level DECIMAL(5,4)
      )`,

      // Content table
      `CREATE TABLE IF NOT EXISTS content (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID REFERENCES organizations(id),
        agent_id UUID REFERENCES agents(id),
        type VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        performance JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Feedback table
      `CREATE TABLE IF NOT EXISTS feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID REFERENCES organizations(id),
        agent_id UUID REFERENCES agents(id),
        experiment_id UUID REFERENCES experiments(id),
        type VARCHAR(50) NOT NULL,
        rating INTEGER,
        comment TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Model improvements table
      `CREATE TABLE IF NOT EXISTS model_improvements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES agents(id),
        experiment_id UUID REFERENCES experiments(id),
        trigger_reason VARCHAR(100) NOT NULL,
        old_version VARCHAR(50) NOT NULL,
        new_version VARCHAR(50) NOT NULL,
        improvement_metrics JSONB NOT NULL,
        status VARCHAR(50) NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        deployed_at TIMESTAMP,
        rollback_at TIMESTAMP
      )`,

      // Events table for tracking
      `CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID REFERENCES organizations(id),
        event_type VARCHAR(100) NOT NULL,
        event_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const schema of schemas) {
      await this.pgClient.query(schema);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_agents_org ON agents(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_experiments_org ON experiments(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_experiments_agent ON experiments(agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status)',
      'CREATE INDEX IF NOT EXISTS idx_content_org ON content(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_feedback_experiment ON feedback(experiment_id)',
      'CREATE INDEX IF NOT EXISTS idx_events_org ON events(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)'
    ];

    for (const index of indexes) {
      await this.pgClient.query(index);
    }

    logger.info('Database schema created successfully');
  }

  async createKafkaTopics(): Promise<void> {
    const topics = [
      'feedback-events',
      'experiment-updates',
      'model-improvements',
      'content-optimization',
      'agent-metrics',
      'system-events'
    ];

    await this.kafkaAdmin.createTopics({
      topics: topics.map(topic => ({
        topic,
        numPartitions: 3,
        replicationFactor: 1
      }))
    });

    logger.info({ topics }, 'Kafka topics created');
  }

  async seedOrganizations(count = 3): Promise<TestOrganization[]> {
    const organizations: TestOrganization[] = [];

    for (let i = 0; i < count; i++) {
      const org: TestOrganization = {
        id: faker.string.uuid(),
        name: faker.company.name(),
        plan: faker.helpers.arrayElement(['starter', 'professional', 'enterprise']),
        apiKey: `test_${faker.string.alphanumeric(32)}`,
        webhookUrl: faker.internet.url()
      };

      await this.pgClient.query(
        `INSERT INTO organizations (id, name, plan, api_key, webhook_url) 
         VALUES ($1, $2, $3, $4, $5)`,
        [org.id, org.name, org.plan, org.apiKey, org.webhookUrl]
      );

      organizations.push(org);
    }

    logger.info({ count: organizations.length }, 'Organizations seeded');
    return organizations;
  }

  async seedAgents(organizations: TestOrganization[]): Promise<TestAgent[]> {
    const agents: TestAgent[] = [];
    const agentTypes = ['marketing', 'sales', 'support', 'analytics'];

    for (const org of organizations) {
      for (const type of agentTypes) {
        const agent: TestAgent = {
          id: faker.string.uuid(),
          organizationId: org.id,
          type: type as any,
          modelVersion: `v${faker.number.int({ min: 1, max: 3 })}.0.0`,
          config: {
            temperature: faker.number.float({ min: 0.1, max: 1.0 }),
            maxTokens: faker.number.int({ min: 100, max: 2000 }),
            topP: faker.number.float({ min: 0.5, max: 1.0 })
          },
          isActive: true
        };

        await this.pgClient.query(
          `INSERT INTO agents (id, organization_id, type, model_version, config, is_active) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [agent.id, agent.organizationId, agent.type, agent.modelVersion, 
           JSON.stringify(agent.config), agent.isActive]
        );

        agents.push(agent);
      }
    }

    logger.info({ count: agents.length }, 'Agents seeded');
    return agents;
  }

  async seedExperiments(agents: TestAgent[]): Promise<TestExperiment[]> {
    const experiments: TestExperiment[] = [];

    for (const agent of agents) {
      // Create 2 experiments per agent
      for (let i = 0; i < 2; i++) {
        const experiment: TestExperiment = {
          id: faker.string.uuid(),
          organizationId: agent.organizationId,
          agentId: agent.id,
          name: `${agent.type} optimization ${i + 1}`,
          status: faker.helpers.arrayElement(['running', 'completed', 'failed']),
          variantA: {
            prompt: faker.lorem.paragraph(),
            temperature: 0.7
          },
          variantB: {
            prompt: faker.lorem.paragraph(),
            temperature: 0.9
          },
          startedAt: faker.date.recent({ days: 7 }),
          metrics: {
            impressions: faker.number.int({ min: 1000, max: 10000 }),
            conversions: faker.number.int({ min: 10, max: 500 }),
            revenue: faker.number.float({ min: 1000, max: 50000 })
          }
        };

        await this.pgClient.query(
          `INSERT INTO experiments 
           (id, organization_id, agent_id, name, status, variant_a, variant_b, started_at, metrics) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [experiment.id, experiment.organizationId, experiment.agentId, experiment.name,
           experiment.status, JSON.stringify(experiment.variantA), 
           JSON.stringify(experiment.variantB), experiment.startedAt,
           JSON.stringify(experiment.metrics)]
        );

        experiments.push(experiment);
      }
    }

    logger.info({ count: experiments.length }, 'Experiments seeded');
    return experiments;
  }

  async seedContent(agents: TestAgent[]): Promise<TestContent[]> {
    const contents: TestContent[] = [];

    for (const agent of agents) {
      // Create content based on agent type
      const contentCount = faker.number.int({ min: 5, max: 10 });
      
      for (let i = 0; i < contentCount; i++) {
        const content: TestContent = {
          id: faker.string.uuid(),
          organizationId: agent.organizationId,
          agentId: agent.id,
          type: this.getContentType(agent.type),
          content: this.generateContent(agent.type),
          metadata: {
            version: faker.number.int({ min: 1, max: 5 }),
            tags: faker.helpers.arrayElements(['promotional', 'educational', 'support', 'analytical'], 2)
          },
          performance: {
            impressions: faker.number.int({ min: 100, max: 5000 }),
            clicks: faker.number.int({ min: 10, max: 500 }),
            conversions: faker.number.int({ min: 1, max: 100 })
          }
        };

        await this.pgClient.query(
          `INSERT INTO content 
           (id, organization_id, agent_id, type, content, metadata, performance) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [content.id, content.organizationId, content.agentId, content.type,
           content.content, JSON.stringify(content.metadata), 
           JSON.stringify(content.performance)]
        );

        contents.push(content);
      }
    }

    logger.info({ count: contents.length }, 'Content items seeded');
    return contents;
  }

  private getContentType(agentType: string): string {
    const typeMap: Record<string, string[]> = {
      marketing: ['email', 'social_post', 'blog_article', 'ad_copy'],
      sales: ['pitch', 'proposal', 'follow_up', 'demo_script'],
      support: ['response', 'faq', 'troubleshooting', 'escalation'],
      analytics: ['report', 'dashboard', 'insight', 'prediction']
    };

    return faker.helpers.arrayElement(typeMap[agentType] || ['generic']);
  }

  private generateContent(agentType: string): string {
    const contentGenerators: Record<string, () => string> = {
      marketing: () => `${faker.company.catchPhrase()}. ${faker.lorem.paragraph()}`,
      sales: () => `Dear ${faker.person.firstName()}, ${faker.lorem.paragraphs(2)}`,
      support: () => `Thank you for contacting us. ${faker.lorem.paragraph()}`,
      analytics: () => `Analysis shows ${faker.number.int({ min: 10, max: 50 })}% increase in ${faker.commerce.department()}`
    };

    const generator = contentGenerators[agentType] || (() => faker.lorem.paragraph());
    return generator();
  }

  async seedRedisCache(agents: TestAgent[]): Promise<void> {
    for (const agent of agents) {
      // Cache agent configurations
      await this.redisClient.set(
        `agent:${agent.id}`,
        JSON.stringify(agent),
        'EX',
        3600
      );

      // Cache some metrics
      await this.redisClient.hset(
        `metrics:${agent.id}`,
        'requests', faker.number.int({ min: 100, max: 10000 }),
        'successes', faker.number.int({ min: 90, max: 9500 }),
        'failures', faker.number.int({ min: 5, max: 500 }),
        'avg_latency', faker.number.float({ min: 10, max: 200 })
      );
    }

    logger.info('Redis cache seeded');
  }

  async seedKafkaEvents(experiments: TestExperiment[]): Promise<void> {
    const messages = [];

    for (const experiment of experiments) {
      messages.push({
        topic: 'experiment-updates',
        messages: [{
          key: experiment.id,
          value: JSON.stringify({
            experimentId: experiment.id,
            status: experiment.status,
            timestamp: new Date().toISOString()
          })
        }]
      });
    }

    await this.kafkaProducer.sendBatch({ topicMessages: messages });
    logger.info({ count: messages.length }, 'Kafka events seeded');
  }

  async seedAll(): Promise<{
    organizations: TestOrganization[];
    agents: TestAgent[];
    experiments: TestExperiment[];
    contents: TestContent[];
  }> {
    await this.initialize();
    await this.createSchema();
    await this.createKafkaTopics();

    const organizations = await this.seedOrganizations();
    const agents = await this.seedAgents(organizations);
    const experiments = await this.seedExperiments(agents);
    const contents = await this.seedContent(agents);

    await this.seedRedisCache(agents);
    await this.seedKafkaEvents(experiments);

    logger.info('All test data seeded successfully');

    return {
      organizations,
      agents,
      experiments,
      contents
    };
  }

  async cleanup(): Promise<void> {
    try {
      // Drop all tables
      await this.pgClient.query('DROP SCHEMA public CASCADE');
      await this.pgClient.query('CREATE SCHEMA public');

      // Clear Redis
      await this.redisClient.flushall();

      // Delete Kafka topics
      const topics = await this.kafkaAdmin.listTopics();
      await this.kafkaAdmin.deleteTopics({ topics });

      logger.info('Test data cleaned up');
    } catch (error) {
      logger.error({ error }, 'Error during cleanup');
    } finally {
      await this.pgClient.end();
      this.redisClient.disconnect();
      await this.kafkaProducer.disconnect();
      await this.kafkaAdmin.disconnect();
    }
  }
}

// CLI execution
if (require.main === module) {
  const seeder = new TestDataSeeder();
  
  seeder.seedAll()
    .then(() => {
      logger.info('Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Seeding failed');
      process.exit(1);
    });
}