export interface EncryptionConfig {
    algorithm: string;
    keyLength: number;
    ivLength: number;
    tagLength: number;
    saltLength: number;
    iterations: number;
    masterKey: string;
    kmsEndpoint?: string;
    hsmEnabled: boolean;
}
export interface EncryptedData {
    data: string;
    algorithm: string;
    iv: string;
    tag: string;
    salt: string;
    keyId: string;
    createdAt: Date;
    expiresAt?: Date;
}
export interface KeyRotationPolicy {
    rotationInterval: number;
    gracePeriod: number;
    maxKeyAge: number;
    autoRotate: boolean;
}
export interface PlatformKeyStorage {
    web: {
        sessionStorage: boolean;
        localStorage: boolean;
        indexedDB: boolean;
        webCrypto: boolean;
    };
    mobile: {
        keychain: boolean;
        keystore: boolean;
        secureEnclave: boolean;
        biometricProtected: boolean;
    };
    extension: {
        secureStorage: boolean;
        manifestEncryption: boolean;
        contextIsolation: boolean;
    };
}
export interface EncryptionMetrics {
    encryptionOperations: number;
    decryptionOperations: number;
    keyRotations: number;
    failedOperations: number;
    averageEncryptionTime: number;
    averageDecryptionTime: number;
}
export declare class AdvancedEncryptionService {
    private config;
    private keyCache;
    private rotationPolicy;
    private metrics;
    constructor(config: EncryptionConfig, rotationPolicy: KeyRotationPolicy);
    encryptData(data: string | Buffer, context: {
        userId?: string;
        platform: 'web' | 'mobile' | 'extension';
        sensitivity: 'low' | 'medium' | 'high' | 'critical';
        expiresIn?: number;
    }): Promise<EncryptedData>;
    decryptData(encryptedData: EncryptedData, context: {
        userId?: string;
        platform: 'web' | 'mobile' | 'extension';
    }): Promise<Buffer>;
    encryptForPlatform(data: string, platform: 'web' | 'mobile' | 'extension', options?: {
        useHardwareAcceleration?: boolean;
        useBiometricProtection?: boolean;
        storeInSecureEnclave?: boolean;
    }): Promise<{
        encryptedData: string;
        storageHint: any;
    }>;
    private encryptForWeb;
    private encryptForMobile;
    private encryptForExtension;
    encryptDocument(documentData: Buffer, metadata: {
        userId: string;
        documentId: string;
        classification: 'public' | 'internal' | 'confidential' | 'restricted';
    }): Promise<{
        encryptedDocument: EncryptedData;
        encryptedMetadata: EncryptedData;
        keyId: string;
    }>;
    encryptPII(piiData: Record<string, any>, userId: string, options: {
        anonymize: boolean;
        pseudonymize: boolean;
        retention: number;
    }): Promise<{
        encrypted: EncryptedData;
        anonymized?: Record<string, any>;
        pseudonyms?: Record<string, string>;
    }>;
    rotateKeys(): Promise<{
        rotatedKeys: number;
        newKeyId: string;
        migratedData: number;
    }>;
    private deriveKey;
    private generateKeyId;
    private mapClassificationToSensitivity;
    private generateDocumentKey;
    private anonymizePII;
    private pseudonymizePII;
    private generatePseudonym;
    private maskEmail;
    private maskPhone;
    private startKeyRotationScheduler;
    private updateAverageTime;
    private deriveKeyFromMaster;
    getMetrics(): EncryptionMetrics;
    clearKeyCache(): void;
}
export declare const createAdvancedEncryption: (config: EncryptionConfig, rotationPolicy: KeyRotationPolicy) => AdvancedEncryptionService;
//# sourceMappingURL=advanced-encryption.d.ts.map