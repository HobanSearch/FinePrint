export interface EncryptionResult {
    encryptedData: string;
    keyId: string;
    algorithm: string;
    iv: string;
    tag?: string;
}
export interface DecryptionRequest {
    encryptedData: string;
    keyId: string;
    algorithm: string;
    iv: string;
    tag?: string;
}
export interface EncryptionKey {
    keyId: string;
    algorithm: string;
    keyMaterial: Buffer;
    createdAt: Date;
    expiresAt?: Date;
    isActive: boolean;
    purpose: KeyPurpose;
}
export declare enum KeyPurpose {
    DATA_ENCRYPTION = "data_encryption",
    TOKEN_SIGNING = "token_signing",
    DATABASE_ENCRYPTION = "database_encryption",
    FILE_ENCRYPTION = "file_encryption",
    PII_ENCRYPTION = "pii_encryption",
    BACKUP_ENCRYPTION = "backup_encryption"
}
export interface KeyRotationPolicy {
    purpose: KeyPurpose;
    rotationIntervalDays: number;
    maxKeyAge: number;
    autoRotate: boolean;
}
export declare class KeyManagementService {
    private keys;
    private masterKey;
    private keyDerivationSalt;
    constructor(masterPassword?: string);
    private initializeMasterKey;
    generateKey(purpose: KeyPurpose, algorithm?: string): Promise<string>;
    encryptData(data: string | Buffer, keyId: string): Promise<EncryptionResult>;
    decryptData(request: DecryptionRequest): Promise<Buffer>;
    encryptPII(data: any, keyId?: string): Promise<EncryptionResult>;
    decryptPII(request: DecryptionRequest): Promise<any>;
    encryptDatabaseField(value: string, tableName: string, fieldName: string): Promise<string>;
    decryptDatabaseField(encryptedValue: string): Promise<string>;
    rotateKey(oldKeyId: string): Promise<string>;
    private getOrCreateKey;
    private generateKeyId;
    private encryptKeyMaterial;
    private decryptKeyMaterial;
    getRotationPolicies(): KeyRotationPolicy[];
    getKeysForRotation(): string[];
    exportKey(keyId: string, backupPassword: string): Promise<string>;
    importKey(exportedKey: string, backupPassword: string): Promise<string>;
}
export declare const kmsService: KeyManagementService;
//# sourceMappingURL=kms.d.ts.map