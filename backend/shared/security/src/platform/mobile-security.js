"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultMobileSecurityConfig = exports.createMobileSecurity = exports.MobileSecurityService = void 0;
const crypto = __importStar(require("crypto"));
class MobileSecurityService {
    config;
    securityChecks;
    constructor(config) {
        this.config = config;
        this.securityChecks = new Map();
        this.initializeSecurityChecks();
    }
    async assessDeviceSecurity() {
        const status = {
            isJailbroken: false,
            isRooted: false,
            isDebuggerAttached: false,
            isEmulator: false,
            isHooked: false,
            isProxyUsed: false,
            deviceId: await this.getDeviceId(),
            osVersion: await this.getOSVersion(),
            appVersion: await this.getAppVersion(),
            securityScore: 100,
            threats: []
        };
        if (this.config.deviceIntegrity.jailbreakDetection) {
            status.isJailbroken = await this.detectJailbreak();
            if (status.isJailbroken) {
                status.threats.push('Device is jailbroken');
                status.securityScore -= 30;
            }
        }
        if (this.config.deviceIntegrity.rootDetection) {
            status.isRooted = await this.detectRoot();
            if (status.isRooted) {
                status.threats.push('Device is rooted');
                status.securityScore -= 30;
            }
        }
        if (this.config.deviceIntegrity.debuggerDetection) {
            status.isDebuggerAttached = await this.detectDebugger();
            if (status.isDebuggerAttached) {
                status.threats.push('Debugger detected');
                status.securityScore -= 20;
            }
        }
        if (this.config.deviceIntegrity.emulatorDetection) {
            status.isEmulator = await this.detectEmulator();
            if (status.isEmulator) {
                status.threats.push('Running on emulator');
                status.securityScore -= 25;
            }
        }
        if (this.config.deviceIntegrity.hookingDetection) {
            status.isHooked = await this.detectHooking();
            if (status.isHooked) {
                status.threats.push('Code hooking detected');
                status.securityScore -= 35;
            }
        }
        if (this.config.network.proxyDetection) {
            status.isProxyUsed = await this.detectProxy();
            if (status.isProxyUsed) {
                status.threats.push('Proxy connection detected');
                status.securityScore -= 15;
            }
        }
        return status;
    }
    configureCertificatePinning(domains) {
        for (const domain of domains) {
            if (!this.config.certificatePinning.enabled)
                continue;
            this.validateCertificatePins(domain.pins);
            this.setPinningRules(domain);
        }
    }
    async storeSecurely(options) {
        try {
            const encryptedValue = await this.encryptForStorage(options.value, options.key);
            if (this.isIOS() && this.config.secureStorage.useKeychain) {
                await this.storeInKeychain({
                    ...options,
                    value: encryptedValue
                });
            }
            else if (this.isAndroid() && this.config.secureStorage.useKeystore) {
                await this.storeInKeystore({
                    ...options,
                    value: encryptedValue
                });
            }
            else {
                throw new Error('Secure storage not available on this platform');
            }
        }
        catch (error) {
            throw new Error(`Secure storage failed: ${error.message}`);
        }
    }
    async retrieveSecurely(service, key) {
        try {
            let encryptedValue = null;
            if (this.isIOS() && this.config.secureStorage.useKeychain) {
                encryptedValue = await this.retrieveFromKeychain(service, key);
            }
            else if (this.isAndroid() && this.config.secureStorage.useKeystore) {
                encryptedValue = await this.retrieveFromKeystore(service, key);
            }
            if (!encryptedValue)
                return null;
            return await this.decryptFromStorage(encryptedValue, key);
        }
        catch (error) {
            throw new Error(`Secure retrieval failed: ${error.message}`);
        }
    }
    async authenticateWithBiometrics(config) {
        try {
            const isAvailable = await this.isBiometricAvailable(config.type);
            if (!isAvailable) {
                return {
                    success: false,
                    error: 'Biometric authentication not available'
                };
            }
            if (this.isIOS()) {
                return await this.authenticateWithTouchIdFaceId(config);
            }
            else if (this.isAndroid()) {
                return await this.authenticateWithFingerprint(config);
            }
            return {
                success: false,
                error: 'Platform not supported'
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    async validateAppIntegrity() {
        const issues = [];
        if (this.config.appIntegrity.signatureValidation) {
            const signatureValid = await this.validateAppSignature();
            if (!signatureValid) {
                issues.push('Invalid app signature');
            }
        }
        if (this.config.appIntegrity.antiTampering) {
            const isTampered = await this.detectTampering();
            if (isTampered) {
                issues.push('App tampering detected');
            }
        }
        if (this.config.appIntegrity.runtimeProtection) {
            const runtimeThreats = await this.detectRuntimeThreats();
            issues.push(...runtimeThreats);
        }
        return {
            valid: issues.length === 0,
            issues
        };
    }
    initializeSecurityChecks() {
        this.securityChecks.set('jailbreak', () => this.detectJailbreak());
        this.securityChecks.set('root', () => this.detectRoot());
        this.securityChecks.set('debugger', () => this.detectDebugger());
        this.securityChecks.set('emulator', () => this.detectEmulator());
        this.securityChecks.set('hooking', () => this.detectHooking());
    }
    async detectJailbreak() {
        if (!this.isIOS())
            return false;
        const jailbreakPaths = [
            '/Applications/Cydia.app',
            '/Applications/FakeCarrier.app',
            '/Applications/Icy.app',
            '/Applications/IntelliScreen.app',
            '/Applications/MxTube.app',
            '/Applications/RockApp.app',
            '/Applications/SBSettings.app',
            '/Applications/WinterBoard.app',
            '/Library/MobileSubstrate/DynamicLibraries/LiveClock.plist',
            '/Library/MobileSubstrate/DynamicLibraries/Veency.plist',
            '/private/var/lib/apt',
            '/private/var/lib/cydia',
            '/private/var/mobile/Library/SBSettings/Themes',
            '/private/var/stash',
            '/private/var/tmp/cydia.log',
            '/System/Library/LaunchDaemons/com.ikey.bbot.plist',
            '/System/Library/LaunchDaemons/com.saurik.Cydia.Startup.plist',
            '/usr/bin/sshd',
            '/usr/libexec/sftp-server',
            '/usr/sbin/sshd',
            '/etc/apt',
            '/bin/bash',
            '/usr/sbin/frida-server'
        ];
        for (const path of jailbreakPaths) {
            try {
                if (await this.fileExists(path)) {
                    return true;
                }
            }
            catch (error) {
                if (error.message.includes('permission')) {
                    continue;
                }
            }
        }
        try {
            const canOpenCydia = await this.canOpenURL('cydia://');
            if (canOpenCydia)
                return true;
        }
        catch (error) {
        }
        const suspiciousEnvVars = ['DYLD_INSERT_LIBRARIES'];
        for (const envVar of suspiciousEnvVars) {
            if (process.env[envVar]) {
                return true;
            }
        }
        return false;
    }
    async detectRoot() {
        if (!this.isAndroid())
            return false;
        const rootPaths = [
            '/system/app/Superuser.apk',
            '/sbin/su',
            '/system/bin/su',
            '/system/xbin/su',
            '/data/local/xbin/su',
            '/data/local/bin/su',
            '/system/sd/xbin/su',
            '/system/bin/failsafe/su',
            '/data/local/su',
            '/su/bin/su',
            '/system/etc/init.d/99SuperSUDaemon',
            '/dev/com.koushikdutta.superuser.daemon/',
            '/system/xbin/daemonsu'
        ];
        for (const path of rootPaths) {
            if (await this.fileExists(path)) {
                return true;
            }
        }
        const rootApps = [
            'com.noshufou.android.su',
            'com.noshufou.android.su.elite',
            'eu.chainfire.supersu',
            'com.koushikdutta.superuser',
            'com.thirdparty.superuser',
            'com.yellowes.su',
            'com.koushikdutta.rommanager',
            'com.koushikdutta.rommanager.license',
            'com.dimonvideo.luckypatcher',
            'com.chelpus.lackypatch',
            'com.ramdroid.appquarantine',
            'com.ramdroid.appquarantinepro'
        ];
        for (const app of rootApps) {
            if (await this.isPackageInstalled(app)) {
                return true;
            }
        }
        try {
            const result = await this.executeCommand('su');
            if (result.includes('uid=0')) {
                return true;
            }
        }
        catch (error) {
        }
        return false;
    }
    async detectDebugger() {
        if (this.isIOS()) {
            return await this.detectIOSDebugger();
        }
        else if (this.isAndroid()) {
            return await this.detectAndroidDebugger();
        }
        return false;
    }
    async detectIOSDebugger() {
        try {
            if (process.env.DYLD_INSERT_LIBRARIES) {
                return true;
            }
            const isBeingDebugged = await this.checkProcessFlags();
            return isBeingDebugged;
        }
        catch (error) {
            return false;
        }
    }
    async detectAndroidDebugger() {
        try {
            const isDebuggable = await this.isAppDebuggable();
            if (isDebuggable)
                return true;
            const jdwpActive = await this.isJDWPActive();
            return jdwpActive;
        }
        catch (error) {
            return false;
        }
    }
    async detectEmulator() {
        if (this.isIOS()) {
            return await this.detectIOSSimulator();
        }
        else if (this.isAndroid()) {
            return await this.detectAndroidEmulator();
        }
        return false;
    }
    async detectIOSSimulator() {
        try {
            const platform = await this.getPlatform();
            return platform.includes('Simulator') || platform.includes('x86_64');
        }
        catch (error) {
            return false;
        }
    }
    async detectAndroidEmulator() {
        const emulatorIndicators = [
            'goldfish',
            'ranchu',
            'vbox',
            'ttVM_x86',
            'nox',
            'andy',
            'BlueStacks'
        ];
        try {
            const buildFingerprint = await this.getBuildFingerprint();
            const buildModel = await this.getBuildModel();
            const buildBrand = await this.getBuildBrand();
            for (const indicator of emulatorIndicators) {
                if (buildFingerprint.toLowerCase().includes(indicator) ||
                    buildModel.toLowerCase().includes(indicator) ||
                    buildBrand.toLowerCase().includes(indicator)) {
                    return true;
                }
            }
            const emulatorFiles = [
                '/dev/socket/qemud',
                '/system/lib/libc_malloc_debug_qemu.so',
                '/sys/qemu_trace',
                '/system/bin/qemu-props'
            ];
            for (const file of emulatorFiles) {
                if (await this.fileExists(file)) {
                    return true;
                }
            }
            return false;
        }
        catch (error) {
            return false;
        }
    }
    async detectHooking() {
        try {
            const hookingLibraries = [
                'frida',
                'xposed',
                'substrate',
                'cydia',
                'SSLKillSwitch'
            ];
            for (const lib of hookingLibraries) {
                if (await this.isLibraryLoaded(lib)) {
                    return true;
                }
            }
            const memoryIntegrityCheck = await this.checkMemoryIntegrity();
            return !memoryIntegrityCheck;
        }
        catch (error) {
            return false;
        }
    }
    async detectProxy() {
        try {
            const proxyInfo = await this.getProxySettings();
            return proxyInfo.enabled;
        }
        catch (error) {
            return false;
        }
    }
    isIOS() {
        return process.platform === 'ios' || process.env.PLATFORM === 'ios';
    }
    isAndroid() {
        return process.platform === 'android' || process.env.PLATFORM === 'android';
    }
    async fileExists(path) {
        return false;
    }
    async canOpenURL(url) {
        return false;
    }
    async isPackageInstalled(packageName) {
        return false;
    }
    async executeCommand(command) {
        throw new Error('Command execution not available');
    }
    async checkProcessFlags() {
        return false;
    }
    async isAppDebuggable() {
        return false;
    }
    async isJDWPActive() {
        return false;
    }
    async getPlatform() {
        return process.platform;
    }
    async getBuildFingerprint() {
        return '';
    }
    async getBuildModel() {
        return '';
    }
    async getBuildBrand() {
        return '';
    }
    async isLibraryLoaded(libraryName) {
        return false;
    }
    async checkMemoryIntegrity() {
        return true;
    }
    async getProxySettings() {
        return { enabled: false };
    }
    async getDeviceId() {
        return 'device-id';
    }
    async getOSVersion() {
        return '1.0.0';
    }
    async getAppVersion() {
        return '1.0.0';
    }
    validateCertificatePins(pins) {
        for (const pin of pins) {
            if (!/^sha256\/[A-Za-z0-9+/]{43}=$/.test(pin)) {
                throw new Error(`Invalid certificate pin format: ${pin}`);
            }
        }
    }
    setPinningRules(domain) {
    }
    async encryptForStorage(value, key) {
        const cipher = crypto.createCipher('aes-256-gcm', key);
        let encrypted = cipher.update(value, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag();
        return `${encrypted}:${tag.toString('hex')}`;
    }
    async decryptFromStorage(encryptedValue, key) {
        const [encrypted, tagHex] = encryptedValue.split(':');
        const tag = Buffer.from(tagHex, 'hex');
        const decipher = crypto.createDecipher('aes-256-gcm', key);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    async storeInKeychain(options) {
    }
    async retrieveFromKeychain(service, key) {
        return null;
    }
    async storeInKeystore(options) {
    }
    async retrieveFromKeystore(service, key) {
        return null;
    }
    async isBiometricAvailable(type) {
        return false;
    }
    async authenticateWithTouchIdFaceId(config) {
        return { success: false, error: 'Not implemented' };
    }
    async authenticateWithFingerprint(config) {
        return { success: false, error: 'Not implemented' };
    }
    async validateAppSignature() {
        return true;
    }
    async detectTampering() {
        return false;
    }
    async detectRuntimeThreats() {
        return [];
    }
}
exports.MobileSecurityService = MobileSecurityService;
const createMobileSecurity = (config) => {
    return new MobileSecurityService(config);
};
exports.createMobileSecurity = createMobileSecurity;
exports.defaultMobileSecurityConfig = {
    certificatePinning: {
        enabled: true,
        pins: [],
        backupPins: [],
        enforceOnSubdomains: true,
        reportFailures: true
    },
    deviceIntegrity: {
        jailbreakDetection: true,
        rootDetection: true,
        debuggerDetection: true,
        emulatorDetection: true,
        hookingDetection: true
    },
    appIntegrity: {
        signatureValidation: true,
        antiTampering: true,
        codeObfuscation: true,
        runtimeProtection: true
    },
    secureStorage: {
        useKeychain: true,
        useKeystore: true,
        biometricProtection: true,
        encryptionAlgorithm: 'AES-256-GCM'
    },
    network: {
        disableHTTP: true,
        validateCertificates: true,
        allowInsecureConnections: false,
        proxyDetection: true
    },
    biometric: {
        touchIdEnabled: true,
        faceIdEnabled: true,
        fingerprintEnabled: true,
        fallbackToPasscode: true
    }
};
//# sourceMappingURL=mobile-security.js.map