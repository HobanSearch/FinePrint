import { Socket } from 'socket.io';
export interface AuthToken {
    userId: string;
    email: string;
    name?: string;
    teamId?: string;
    roles?: string[];
    permissions?: string[];
    exp: number;
    iat: number;
}
export interface AuthContext {
    userId: string;
    email: string;
    name?: string;
    teamId?: string;
    isAdmin: boolean;
    roles: string[];
    permissions: string[];
}
export declare class AuthenticationService {
    private initialized;
    private jwtSecret;
    private tokenBlacklist;
    constructor();
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    authenticateSocket(socket: Socket): Promise<void>;
    validatePermission(socketId: string, requiredPermission: string): Promise<boolean>;
    validateRole(socketId: string, requiredRole: string): Promise<boolean>;
    validateTeamAccess(socketId: string, targetTeamId: string): Promise<boolean>;
    validateResourceAccess(socketId: string, resourceType: string, resourceId: string): Promise<boolean>;
    revokeToken(token: string): Promise<void>;
    refreshAuthContext(socketId: string): Promise<AuthContext | null>;
    private extractToken;
    private verifyToken;
    private validateUser;
    private hasAdminRole;
    private cacheAuthContext;
    private getAuthContext;
    private validateDocumentAccess;
    private validateAnalysisAccess;
    private loadTokenBlacklist;
    private saveTokenBlacklist;
    private startTokenCleanup;
    private cleanupExpiredTokens;
    private hashToken;
}
//# sourceMappingURL=authService.d.ts.map