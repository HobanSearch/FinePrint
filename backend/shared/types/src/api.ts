// Fastify types - these are defined here to avoid importing the full Fastify package
export interface FastifyRequest {
  user?: any;
  log: any;
  headers: Record<string, string | string[] | undefined>;
  ip: string;
  url: string;
  method: string;
}

export interface FastifyReply {
  status(code: number): FastifyReply;
  send(payload: any): FastifyReply;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
    role: string;
    subscriptionTier: string;
    teamId?: string;
  };
}

export interface ApiRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<any>;
  preHandler?: any[];
  schema?: {
    tags?: string[];
    summary?: string;
    description?: string;
    querystring?: any;
    params?: any;
    body?: any;
    response?: any;
    security?: any[];
  };
}

export interface RateLimitConfig {
  max: number;
  timeWindow: string;
  skipOnError?: boolean;
  errorResponseBuilder?: (request: FastifyRequest, context: any) => any;
}

export interface SecurityHeaders {
  contentSecurityPolicy?: string;
  crossOriginEmbedderPolicy?: string;
  crossOriginOpenerPolicy?: string;
  crossOriginResourcePolicy?: string;
  originAgentCluster?: string;
  referrerPolicy?: string;
  strictTransportSecurity?: string;
  xContentTypeOptions?: string;
  xDnsPrefetchControl?: string;
  xDownloadOptions?: string;
  xFrameOptions?: string;
  xPermittedCrossDomainPolicies?: string;
  xXssProtection?: string;
}

export interface ApiKeyPermissions {
  analyses: {
    create: boolean;
    read: boolean;
    list: boolean;
  };
  documents: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
    list: boolean;
  };
  monitoring: {
    enable: boolean;
    disable: boolean;
    list: boolean;
  };
  actions: {
    create: boolean;
    read: boolean;
    list: boolean;
  };
  webhooks: {
    create: boolean;
    update: boolean;
    delete: boolean;
    list: boolean;
  };
}