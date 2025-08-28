import { z } from 'zod';
export declare const commonSchemas: {
    uuid: any;
    id: any;
    name: any;
    title: any;
    description: any;
    comment: any;
    slug: any;
    email: any;
    phone: any;
    url: any;
    ipAddress: any;
    userAgent: any;
    sessionId: any;
    token: any;
    filename: any;
    mimeType: any;
    fileSize: any;
    isoDate: any;
    timestamp: any;
    base64: any;
    hex: any;
    page: any;
    limit: any;
    offset: any;
    sortBy: any;
    sortOrder: any;
    search: any;
    password: any;
    confirmPassword: (passwordField: string) => any;
    mfaCode: any;
    role: any;
    permission: any;
    status: any;
    boolean: any;
    country: any;
    timezone: any;
    eventName: any;
    eventData: any;
    apiKey: any;
    bearerToken: any;
    content: any;
    markdown: any;
    json: any;
    port: any;
    domain: any;
    tag: any;
    tags: any;
    category: any;
};
export declare const authSchemas: {
    login: any;
    register: any;
    forgotPassword: any;
    resetPassword: any;
    changePassword: any;
    setupMFA: any;
    verifyMFA: any;
};
export declare const userSchemas: {
    createUser: any;
    updateUser: any;
    userProfile: any;
};
export declare const documentSchemas: {
    uploadDocument: any;
    analyzeDocument: any;
    documentQuery: any;
};
export declare const apiSchemas: {
    paginationQuery: any;
    idParam: any;
    bulkAction: any;
    analyticsEvent: any;
};
export declare const adminSchemas: {
    systemSettings: any;
    userManagement: any;
    securityAudit: any;
};
export declare const integrationSchemas: {
    webhook: any;
    apiKeyGeneration: any;
};
export declare const fileUploadSchemas: {
    validateFile: any;
    chunkedUpload: any;
};
export declare class ZodSecurityValidator {
    static validateRequest<T>(schema: z.ZodSchema<T>, data: unknown, options?: {
        allowUnknown?: boolean;
    }): T;
    static safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): {
        success: true;
        data: T;
    } | {
        success: false;
        errors: string[];
    };
    static createMiddleware<T>(schema: z.ZodSchema<T>, target?: 'body' | 'query' | 'params'): (request: any, reply: any) => Promise<any>;
    static validateFileUpload(file: any): unknown;
    static withRateLimit<T extends z.ZodSchema>(schema: T, limits: {
        windowMs: number;
        maxRequests: number;
    }): any;
}
export declare const schemas: {
    common: {
        uuid: any;
        id: any;
        name: any;
        title: any;
        description: any;
        comment: any;
        slug: any;
        email: any;
        phone: any;
        url: any;
        ipAddress: any;
        userAgent: any;
        sessionId: any;
        token: any;
        filename: any;
        mimeType: any;
        fileSize: any;
        isoDate: any;
        timestamp: any;
        base64: any;
        hex: any;
        page: any;
        limit: any;
        offset: any;
        sortBy: any;
        sortOrder: any;
        search: any;
        password: any;
        confirmPassword: (passwordField: string) => any;
        mfaCode: any;
        role: any;
        permission: any;
        status: any;
        boolean: any;
        country: any;
        timezone: any;
        eventName: any;
        eventData: any;
        apiKey: any;
        bearerToken: any;
        content: any;
        markdown: any;
        json: any;
        port: any;
        domain: any;
        tag: any;
        tags: any;
        category: any;
    };
    auth: {
        login: any;
        register: any;
        forgotPassword: any;
        resetPassword: any;
        changePassword: any;
        setupMFA: any;
        verifyMFA: any;
    };
    user: {
        createUser: any;
        updateUser: any;
        userProfile: any;
    };
    document: {
        uploadDocument: any;
        analyzeDocument: any;
        documentQuery: any;
    };
    api: {
        paginationQuery: any;
        idParam: any;
        bulkAction: any;
        analyticsEvent: any;
    };
    admin: {
        systemSettings: any;
        userManagement: any;
        securityAudit: any;
    };
    integration: {
        webhook: any;
        apiKeyGeneration: any;
    };
    fileUpload: {
        validateFile: any;
        chunkedUpload: any;
    };
};
export { z } from 'zod';
export default ZodSecurityValidator;
//# sourceMappingURL=zod-schemas.d.ts.map