export interface ExtensionSecurityConfig {
    permissions: {
        minimal: boolean;
        requestedPermissions: string[];
        optionalPermissions: string[];
        hostPermissions: string[];
    };
    contentSecurity: {
        isolatedWorlds: boolean;
        sandboxing: boolean;
        cspEnabled: boolean;
        strictMode: boolean;
    };
    communication: {
        encryptMessages: boolean;
        validateOrigin: boolean;
        rateLimit: boolean;
        messageTimeout: number;
    };
    storage: {
        encrypted: boolean;
        localOnly: boolean;
        syncEnabled: boolean;
        quotaManagement: boolean;
    };
    webRequest: {
        filteringEnabled: boolean;
        blockMalicious: boolean;
        validateCertificates: boolean;
        headerSecurity: boolean;
    };
}
export interface ExtensionManifest {
    manifest_version: 3;
    name: string;
    version: string;
    description: string;
    permissions: string[];
    optional_permissions?: string[];
    host_permissions?: string[];
    content_security_policy?: {
        extension_pages: string;
        sandbox?: string;
    };
    background?: {
        service_worker: string;
        type?: 'module';
    };
    content_scripts?: ContentScript[];
    web_accessible_resources?: WebAccessibleResource[];
    externally_connectable?: {
        matches: string[];
        ids?: string[];
    };
}
export interface ContentScript {
    matches: string[];
    js: string[];
    css?: string[];
    run_at: 'document_start' | 'document_end' | 'document_idle';
    all_frames?: boolean;
    world?: 'ISOLATED' | 'MAIN';
}
export interface WebAccessibleResource {
    resources: string[];
    matches: string[];
    extension_ids?: string[];
}
export interface SecureMessage {
    id: string;
    type: string;
    payload: any;
    timestamp: number;
    signature: string;
    nonce: string;
    origin?: string;
}
export interface ExtensionSecurityMetrics {
    messagesProcessed: number;
    messagesBlocked: number;
    permissionRequests: number;
    securityViolations: number;
    maliciousSitesBlocked: number;
    contentScriptInjections: number;
}
export declare class ExtensionSecurityService {
    private config;
    private messageQueue;
    private rateLimiters;
    private securityKey;
    private metrics;
    constructor(config: ExtensionSecurityConfig);
    generateSecureManifest(baseManifest: Partial<ExtensionManifest>): ExtensionManifest;
    sendSecureMessage(target: 'background' | 'content' | 'popup', type: string, payload: any, origin?: string): Promise<any>;
    processIncomingMessage(message: any, sender: any): Promise<any>;
    storeSecurely(key: string, value: any, options?: {
        sync?: boolean;
        encrypted?: boolean;
    }): Promise<void>;
    retrieveSecurely(key: string, options?: {
        sync?: boolean;
        encrypted?: boolean;
    }): Promise<any>;
    injectSecureContentScript(tabId: number, scriptConfig: {
        file?: string;
        code?: string;
        allFrames?: boolean;
    }): Promise<void>;
    filterWebRequest(request: {
        url: string;
        method: string;
        headers: Record<string, string>;
        type: string;
    }): Promise<{
        action: 'allow' | 'block' | 'redirect';
        reason?: string;
        redirectUrl?: string;
    }>;
    requestPermission(permission: string): Promise<boolean>;
    getSecurityMetrics(): ExtensionSecurityMetrics;
    performSecurityAudit(): Promise<{
        score: number;
        issues: string[];
        recommendations: string[];
    }>;
    private initializeSecurity;
    private generateSecurityKey;
    private getMinimalPermissions;
    private generateStrictCSP;
    private validateOrigin;
    private checkRateLimit;
    private encryptPayload;
    private decryptPayload;
    private signMessage;
    private verifyMessageSignature;
    private validateMessageStructure;
    private validateSender;
    private sendMessageWithTimeout;
    private encryptStorageValue;
    private decryptStorageValue;
    private checkStorageQuota;
    private storeValue;
    private retrieveValue;
    private hasTabPermission;
    private getTabInfo;
    private isMaliciousSite;
    private injectScript;
    private isMaliciousUrl;
    private validateCertificate;
    private addSecurityHeaders;
    private requestUserPermission;
    private setupSecurityListeners;
    private performPeriodicSecurityCheck;
    private auditManifest;
    private auditPermissions;
    private auditContentScripts;
}
export declare const createExtensionSecurity: (config: ExtensionSecurityConfig) => ExtensionSecurityService;
export declare const defaultExtensionSecurityConfig: ExtensionSecurityConfig;
//# sourceMappingURL=extension-security.d.ts.map