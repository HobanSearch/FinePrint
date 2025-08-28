export interface OAuth2Config {
  google: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
  };
  microsoft: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
    tenantId?: string; // For Azure AD
  };
  security: {
    stateExpiry: number; // in seconds
    nonceExpiry: number; // in seconds
    maxRetries: number;
    rateLimitPerHour: number;
  };
}

export interface OAuth2Provider {
  id: string;
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  enabled: boolean;
}

export interface OAuth2State {
  id: string;
  provider: 'google' | 'microsoft';
  nonce: string;
  redirectUrl?: string;
  userId?: string; // For linking existing accounts
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface OAuth2AuthorizationRequest {
  provider: 'google' | 'microsoft';
  redirectUrl?: string;
  userId?: string; // For account linking
  scopes?: string[];
}

export interface OAuth2AuthorizationResponse {
  authorizationUrl: string;
  state: string;
  nonce: string;
}

export interface OAuth2TokenRequest {
  provider: 'google' | 'microsoft';
  code: string;
  state: string;
}

export interface OAuth2TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
  idToken?: string; // For OpenID Connect
}

export interface OAuth2UserInfo {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  locale?: string;
  provider: 'google' | 'microsoft';
  rawData: Record<string, any>;
}

export interface OAuth2Account {
  id: string;
  userId: string;
  provider: 'google' | 'microsoft';
  providerAccountId: string;
  email: string;
  name?: string;
  picture?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType: string;
  scope?: string;
  createdAt: Date;
  lastUsedAt: Date;
  metadata: Record<string, any>;
}

export interface OAuth2AuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name?: string;
    picture?: string;
    isNewUser: boolean;
  };
  account?: OAuth2Account;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  error?: string;
  requiresLinking?: boolean;
  linkToken?: string;
}

export interface OAuth2Stats {
  totalAccounts: number;
  accountsByProvider: Record<string, number>;
  recentLogins: number;
  failedAttempts: number;
  linkedAccounts: number;
}