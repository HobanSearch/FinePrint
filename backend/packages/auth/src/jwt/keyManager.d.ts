import { CacheManager } from '@fineprintai/cache';
import { JWTKeyPair, KeyRotationConfig } from './types';
export declare class JWTKeyManager {
    private cache;
    private config;
    private rotationTimer?;
    constructor(cache: CacheManager, config: KeyRotationConfig);
    generateKeyPair(): Promise<JWTKeyPair>;
    getCurrentKeyPair(): Promise<JWTKeyPair>;
    getPreviousKeyPair(): Promise<JWTKeyPair | null>;
    rotateKeys(reason?: string): Promise<void>;
    private storeKeyPair;
    private isKeyValid;
    private startAutoRotation;
    stopAutoRotation(): void;
    forceRotation(reason: string): Promise<void>;
    getRotationStatus(): Promise<{
        lastRotation?: Date;
        nextRotation?: Date;
        keyAge: number;
        autoRotationEnabled: boolean;
    }>;
    private auditKeyRotation;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=keyManager.d.ts.map