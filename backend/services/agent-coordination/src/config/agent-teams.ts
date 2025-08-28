import { AgentTeam, TeamRole, TeamCoordinationType, TeamPriority } from '../types/teams';
import { AgentType } from '../types';

export const AGENT_TEAMS: Record<string, AgentTeam> = {
  DESIGN_TEAM: {
    id: 'design-team',
    name: 'Design Team',
    description: 'UI/UX design and frontend architecture team for creating user interfaces',
    members: [
      {
        agentType: AgentType.UI_UX_DESIGN as any,
        role: TeamRole.LEADER,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['ui-design', 'ux-research', 'prototyping', 'design-systems']
      },
      {
        agentType: AgentType.FRONTEND_ARCHITECTURE as any,
        role: TeamRole.COORDINATOR,
        required: true,
        minInstances: 1,
        maxInstances: 3,
        capabilities: ['react', 'typescript', 'state-management', 'performance']
      },
      {
        agentType: AgentType.ACCESSIBILITY_COMPLIANCE as any,
        role: TeamRole.SPECIALIST,
        required: false,
        minInstances: 0,
        maxInstances: 1,
        capabilities: ['wcag-compliance', 'screen-reader', 'accessibility-testing']
      }
    ],
    capabilities: ['ui-design', 'frontend-development', 'user-experience', 'accessibility'],
    coordinationType: TeamCoordinationType.PARALLEL,
    maxParallelTasks: 5,
    priority: TeamPriority.HIGH
  },

  MARKETING_TEAM: {
    id: 'marketing-team',
    name: 'Marketing Team',
    description: 'Content creation, analytics, and communication team for marketing operations',
    members: [
      {
        agentType: AgentType.CONTENT_MANAGEMENT as any,
        role: TeamRole.LEADER,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['content-creation', 'seo', 'copywriting', 'content-strategy']
      },
      {
        agentType: AgentType.ANALYTICS_IMPLEMENTATION as any,
        role: TeamRole.COORDINATOR,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['analytics', 'tracking', 'reporting', 'data-visualization']
      },
      {
        agentType: AgentType.EMAIL_COMMUNICATION as any,
        role: TeamRole.EXECUTOR,
        required: true,
        minInstances: 1,
        maxInstances: 3,
        capabilities: ['email-marketing', 'automation', 'segmentation', 'campaigns']
      },
      {
        agentType: AgentType.MARKETING_CONTEXT,
        role: TeamRole.SPECIALIST,
        required: false,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['campaign-analysis', 'customer-segmentation', 'performance-tracking']
      }
    ],
    capabilities: ['content-marketing', 'analytics', 'email-campaigns', 'seo'],
    coordinationType: TeamCoordinationType.HYBRID,
    maxParallelTasks: 8,
    priority: TeamPriority.MEDIUM
  },

  DEVELOPMENT_TEAM: {
    id: 'development-team',
    name: 'Development Team',
    description: 'Backend architecture, database, and performance engineering team',
    members: [
      {
        agentType: AgentType.BACKEND_ARCHITECTURE as any,
        role: TeamRole.LEADER,
        required: true,
        minInstances: 1,
        maxInstances: 3,
        capabilities: ['api-design', 'microservices', 'system-architecture', 'scalability']
      },
      {
        agentType: AgentType.DATABASE_ARCHITECT as any,
        role: TeamRole.COORDINATOR,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['database-design', 'optimization', 'data-modeling', 'migrations']
      },
      {
        agentType: AgentType.PERFORMANCE_ENGINEER as any,
        role: TeamRole.SPECIALIST,
        required: false,
        minInstances: 0,
        maxInstances: 2,
        capabilities: ['performance-testing', 'optimization', 'profiling', 'monitoring']
      },
      {
        agentType: AgentType.DEVOPS_INFRASTRUCTURE as any,
        role: TeamRole.SUPPORT,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['kubernetes', 'ci-cd', 'infrastructure', 'deployment']
      }
    ],
    capabilities: ['backend-development', 'api-development', 'database-management', 'devops'],
    coordinationType: TeamCoordinationType.SEQUENTIAL,
    maxParallelTasks: 10,
    priority: TeamPriority.CRITICAL
  },

  SECURITY_TEAM: {
    id: 'security-team',
    name: 'Security Team',
    description: 'Application security, authentication, and operations security team',
    members: [
      {
        agentType: AgentType.SECURITY_ENGINEER as any,
        role: TeamRole.LEADER,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['security-audit', 'vulnerability-assessment', 'compliance', 'encryption']
      },
      {
        agentType: AgentType.AUTH_SECURITY as any,
        role: TeamRole.COORDINATOR,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['authentication', 'authorization', 'oauth', 'jwt']
      },
      {
        agentType: AgentType.SECURITY_OPERATIONS as any,
        role: TeamRole.EXECUTOR,
        required: true,
        minInstances: 1,
        maxInstances: 3,
        capabilities: ['monitoring', 'incident-response', 'threat-detection', 'logging']
      }
    ],
    capabilities: ['security-assessment', 'authentication', 'threat-monitoring', 'compliance'],
    coordinationType: TeamCoordinationType.CONSENSUS,
    maxParallelTasks: 4,
    priority: TeamPriority.CRITICAL
  },

  MOBILE_TEAM: {
    id: 'mobile-team',
    name: 'Mobile Team',
    description: 'Mobile app development, debugging, and QA team',
    members: [
      {
        agentType: AgentType.MOBILE_DEVELOPER as any,
        role: TeamRole.LEADER,
        required: true,
        minInstances: 1,
        maxInstances: 3,
        capabilities: ['react-native', 'expo', 'mobile-ui', 'native-apis']
      },
      {
        agentType: AgentType.MOBILE_DEBUG as any,
        role: TeamRole.SPECIALIST,
        required: false,
        minInstances: 0,
        maxInstances: 2,
        capabilities: ['debugging', 'performance', 'crash-analytics', 'device-testing']
      },
      {
        agentType: AgentType.QA_AUTOMATION as any,
        role: TeamRole.REVIEWER,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['mobile-testing', 'automation', 'test-planning', 'bug-tracking']
      }
    ],
    capabilities: ['mobile-development', 'cross-platform', 'mobile-testing', 'app-deployment'],
    coordinationType: TeamCoordinationType.SEQUENTIAL,
    maxParallelTasks: 6,
    priority: TeamPriority.HIGH
  },

  BUSINESS_OPERATIONS_TEAM: {
    id: 'business-operations-team',
    name: 'Business Operations Team',
    description: 'Business intelligence, payments, and integrations team',
    members: [
      {
        agentType: AgentType.BUSINESS_INTELLIGENCE,
        role: TeamRole.LEADER,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['data-analysis', 'reporting', 'dashboards', 'insights']
      },
      {
        agentType: AgentType.PAYMENT_INTEGRATION as any,
        role: TeamRole.SPECIALIST,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['payment-processing', 'stripe-integration', 'billing', 'subscriptions']
      },
      {
        agentType: AgentType.INTEGRATION_PLATFORM as any,
        role: TeamRole.EXECUTOR,
        required: true,
        minInstances: 1,
        maxInstances: 3,
        capabilities: ['api-integration', 'webhooks', 'data-sync', 'third-party-apis']
      },
      {
        agentType: AgentType.KNOWLEDGE_GRAPH,
        role: TeamRole.SUPPORT,
        required: false,
        minInstances: 1,
        maxInstances: 1,
        capabilities: ['relationship-analysis', 'pattern-recognition', 'business-intelligence']
      }
    ],
    capabilities: ['business-analytics', 'payment-processing', 'integrations', 'reporting'],
    coordinationType: TeamCoordinationType.PIPELINE,
    maxParallelTasks: 12,
    priority: TeamPriority.HIGH
  },

  LEGAL_COMPLIANCE_TEAM: {
    id: 'legal-compliance-team',
    name: 'Legal & Compliance Team',
    description: 'Legal document analysis and compliance verification team',
    members: [
      {
        agentType: AgentType.LEGAL_ANALYSIS,
        role: TeamRole.LEADER,
        required: true,
        minInstances: 1,
        maxInstances: 3,
        capabilities: ['document-analysis', 'clause-detection', 'risk-assessment', 'legal-research']
      },
      {
        agentType: AgentType.LEGAL_COMPLIANCE as any,
        role: TeamRole.SPECIALIST,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['gdpr', 'ccpa', 'compliance-checking', 'privacy-analysis']
      },
      {
        agentType: AgentType.DOCUMENT_PROCESSING as any,
        role: TeamRole.SUPPORT,
        required: true,
        minInstances: 1,
        maxInstances: 4,
        capabilities: ['ocr', 'text-extraction', 'document-parsing', 'format-conversion']
      }
    ],
    capabilities: ['legal-analysis', 'compliance', 'document-processing', 'risk-assessment'],
    coordinationType: TeamCoordinationType.SEQUENTIAL,
    maxParallelTasks: 8,
    priority: TeamPriority.CRITICAL
  },

  DATA_PIPELINE_TEAM: {
    id: 'data-pipeline-team',
    name: 'Data Pipeline Team',
    description: 'Data processing, ETL, and analytics pipeline team',
    members: [
      {
        agentType: AgentType.DATA_PIPELINE as any,
        role: TeamRole.LEADER,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['etl', 'data-transformation', 'pipeline-orchestration', 'streaming']
      },
      {
        agentType: AgentType.DATABASE_ARCHITECT as any,
        role: TeamRole.COORDINATOR,
        required: true,
        minInstances: 1,
        maxInstances: 2,
        capabilities: ['data-warehousing', 'schema-design', 'query-optimization', 'indexing']
      },
      {
        agentType: AgentType.ANALYTICS_IMPLEMENTATION as any,
        role: TeamRole.EXECUTOR,
        required: true,
        minInstances: 1,
        maxInstances: 3,
        capabilities: ['data-visualization', 'reporting', 'metrics', 'dashboards']
      }
    ],
    capabilities: ['data-processing', 'etl', 'analytics', 'real-time-processing'],
    coordinationType: TeamCoordinationType.PIPELINE,
    maxParallelTasks: 15,
    priority: TeamPriority.HIGH
  }
};

// Helper function to get team by capability
export function getTeamsByCapability(capability: string): AgentTeam[] {
  return Object.values(AGENT_TEAMS).filter(team => 
    team.capabilities.includes(capability) ||
    team.members.some(member => member.capabilities.includes(capability))
  );
}

// Helper function to get teams that include a specific agent type
export function getTeamsByAgentType(agentType: AgentType): AgentTeam[] {
  return Object.values(AGENT_TEAMS).filter(team =>
    team.members.some(member => member.agentType === agentType)
  );
}

// Helper function to calculate team capacity
export function calculateTeamCapacity(team: AgentTeam): number {
  return team.members.reduce((total, member) => 
    total + (member.maxInstances * (member.required ? 1 : 0.5)), 0
  );
}

// Define team workflows
export const TEAM_WORKFLOWS = {
  PRODUCT_LAUNCH: {
    teams: ['design-team', 'development-team', 'marketing-team', 'security-team'],
    coordinationType: TeamCoordinationType.PARALLEL,
    description: 'Coordinate design, development, and marketing for product launch'
  },
  SECURITY_AUDIT: {
    teams: ['security-team', 'development-team', 'legal-compliance-team'],
    coordinationType: TeamCoordinationType.SEQUENTIAL,
    description: 'Comprehensive security audit across application layers'
  },
  MARKETING_CAMPAIGN: {
    teams: ['marketing-team', 'design-team', 'business-operations-team'],
    coordinationType: TeamCoordinationType.HYBRID,
    description: 'Launch and track marketing campaign with analytics'
  },
  FEATURE_DEVELOPMENT: {
    teams: ['development-team', 'design-team', 'mobile-team', 'security-team'],
    coordinationType: TeamCoordinationType.PIPELINE,
    description: 'End-to-end feature development across platforms'
  },
  COMPLIANCE_REVIEW: {
    teams: ['legal-compliance-team', 'security-team', 'data-pipeline-team'],
    coordinationType: TeamCoordinationType.CONSENSUS,
    description: 'Review and ensure compliance across all systems'
  }
};