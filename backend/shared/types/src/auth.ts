export interface JWTPayload {
  sub: string; // user ID
  email: string;
  role: string;
  subscriptionTier: string;
  teamId?: string;
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}

export interface RefreshTokenPayload {
  sub: string;
  tokenId: string;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  user: UserProfile;
  tokens: TokenPair;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  subscriptionTier: string;
  emailVerified: boolean;
  preferences: Record<string, any>;
  createdAt: Date;
}

export interface SignupRequest {
  email: string;
  password: string;
  displayName?: string;
  acceptTerms: boolean;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ApiKeyCreate {
  name: string;
  permissions: Record<string, any>;
  expiresIn?: string; // e.g., '30d', '1y'
  rateLimit?: number;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key: string; // only returned on creation
  keyPrefix: string;
  permissions: Record<string, any>;
  rateLimit: number;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface SessionInfo {
  id: string;
  deviceInfo: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  lastActivityAt: Date;
  createdAt: Date;
  isCurrent: boolean;
}

// Role-based access control
export enum Role {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator'
}

export enum Permission {
  // User management
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',
  
  // Document management
  DOCUMENT_READ = 'document:read',
  DOCUMENT_WRITE = 'document:write',
  DOCUMENT_DELETE = 'document:delete',
  
  // Analysis management
  ANALYSIS_READ = 'analysis:read',
  ANALYSIS_WRITE = 'analysis:write',
  ANALYSIS_DELETE = 'analysis:delete',
  
  // Admin operations
  ADMIN_READ = 'admin:read',
  ADMIN_WRITE = 'admin:write',
  SYSTEM_CONFIG = 'system:config',
  
  // Team management
  TEAM_READ = 'team:read',
  TEAM_WRITE = 'team:write',
  TEAM_MANAGE = 'team:manage'
}

export interface RolePermissions {
  [Role.USER]: Permission[];
  [Role.MODERATOR]: Permission[];
  [Role.ADMIN]: Permission[];
}