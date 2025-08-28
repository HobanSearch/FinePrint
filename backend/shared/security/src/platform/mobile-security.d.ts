export interface MobileSecurityConfig {
    certificatePinning: {
        enabled: boolean;
        pins: string[];
        backupPins: string[];
        enforceOnSubdomains: boolean;
        reportFailures: boolean;
    };
    deviceIntegrity: {
        jailbreakDetection: boolean;
        rootDetection: boolean;
        debuggerDetection: boolean;
        emulatorDetection: boolean;
        hookingDetection: boolean;
    };
    appIntegrity: {
        signatureValidation: boolean;
        antiTampering: boolean;
        codeObfuscation: boolean;
        runtimeProtection: boolean;
    };
    secureStorage: {
        useKeychain: boolean;
        useKeystore: boolean;
        biometricProtection: boolean;
        encryptionAlgorithm: string;
    };
    network: {
        disableHTTP: boolean;
        validateCertificates: boolean;
        allowInsecureConnections: boolean;
        proxyDetection: boolean;
    };
    biometric: {
        touchIdEnabled: boolean;
        faceIdEnabled: boolean;
        fingerprintEnabled: boolean;
        fallbackToPasscode: boolean;
    };
}
export interface DeviceSecurityStatus {
    isJailbroken: boolean;
    isRooted: boolean;
    isDebuggerAttached: boolean;
    isEmulator: boolean;
    isHooked: boolean;
    isProxyUsed: boolean;
    deviceId: string;
    osVersion: string;
    appVersion: string;
    securityScore: number;
    threats: string[];
}
export interface BiometricAuthConfig {
    type: 'touchId' | 'faceId' | 'fingerprint';
    fallbackTitle: string;
    description: string;
    subtitle?: string;
    negativeButtonText?: string;
    disableBackup?: boolean;
}
export interface SecureStorageOptions {
    service: string;
    key: string;
    value: string;
    accessGroup?: string;
    accessLevel?: 'whenUnlocked' | 'whenUnlockedThisDeviceOnly' | 'afterFirstUnlock' | 'afterFirstUnlockThisDeviceOnly';
    biometricProtection?: boolean;
    invalidateOnBiometryChange?: boolean;
}
export interface CertificatePinningConfig {
    hostname: string;
    pins: string[];
    includeSubdomains: boolean;
    enforceBackupPin: boolean;
    reportURI?: string;
}
export declare class MobileSecurityService {
    private config;
    private securityChecks;
    constructor(config: MobileSecurityConfig);
    assessDeviceSecurity(): Promise<DeviceSecurityStatus>;
    configureCertificatePinning(domains: CertificatePinningConfig[]): void;
    storeSecurely(options: SecureStorageOptions): Promise<void>;
    retrieveSecurely(service: string, key: string): Promise<string | null>;
    authenticateWithBiometrics(config: BiometricAuthConfig): Promise<{
        success: boolean;
        error?: string;
        biometryType?: string;
    }>;
    validateAppIntegrity(): Promise<{
        valid: boolean;
        issues: string[];
    }>;
    private initializeSecurityChecks;
    private detectJailbreak;
    private detectRoot;
    private detectDebugger;
    private detectIOSDebugger;
    private detectAndroidDebugger;
    private detectEmulator;
    private detectIOSSimulator;
    private detectAndroidEmulator;
    private detectHooking;
    private detectProxy;
    private isIOS;
    private isAndroid;
    private fileExists;
    private canOpenURL;
    private isPackageInstalled;
    private executeCommand;
    private checkProcessFlags;
    private isAppDebuggable;
    private isJDWPActive;
    private getPlatform;
    private getBuildFingerprint;
    private getBuildModel;
    private getBuildBrand;
    private isLibraryLoaded;
    private checkMemoryIntegrity;
    private getProxySettings;
    private getDeviceId;
    private getOSVersion;
    private getAppVersion;
    private validateCertificatePins;
    private setPinningRules;
    private encryptForStorage;
    private decryptFromStorage;
    private storeInKeychain;
    private retrieveFromKeychain;
    private storeInKeystore;
    private retrieveFromKeystore;
    private isBiometricAvailable;
    private authenticateWithTouchIdFaceId;
    private authenticateWithFingerprint;
    private validateAppSignature;
    private detectTampering;
    private detectRuntimeThreats;
}
export declare const createMobileSecurity: (config: MobileSecurityConfig) => MobileSecurityService;
export declare const defaultMobileSecurityConfig: MobileSecurityConfig;
//# sourceMappingURL=mobile-security.d.ts.map