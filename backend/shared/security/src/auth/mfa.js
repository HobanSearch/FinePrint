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
exports.mfaService = exports.MFAService = exports.MFAType = void 0;
const otplib_1 = require("otplib");
const QRCode = __importStar(require("qrcode"));
const crypto = __importStar(require("crypto"));
const index_1 = require("../index");
var MFAType;
(function (MFAType) {
    MFAType["TOTP"] = "totp";
    MFAType["SMS"] = "sms";
    MFAType["EMAIL"] = "email";
    MFAType["BACKUP_CODES"] = "backup_codes";
})(MFAType || (exports.MFAType = MFAType = {}));
class MFAService {
    appName = 'Fine Print AI';
    issuer = 'fineprintai.com';
    async setupTOTP(userId, email) {
        try {
            const secret = otplib_1.authenticator.generateSecret();
            const service = `${this.appName} (${email})`;
            const otpAuthUrl = otplib_1.authenticator.keyuri(email, this.issuer, secret);
            const qrCodeUrl = await QRCode.toDataURL(otpAuthUrl);
            const backupCodes = this.generateBackupCodes();
            return {
                secret,
                qrCodeUrl,
                backupCodes
            };
        }
        catch (error) {
            throw new index_1.SecurityError('Failed to setup TOTP MFA', 'MFA_SETUP_ERROR');
        }
    }
    verifyTOTP(token, secret, window = 1) {
        try {
            const cleanToken = token.replace(/\s/g, '');
            if (!/^\d{6}$/.test(cleanToken)) {
                return false;
            }
            return otplib_1.authenticator.verify({
                token: cleanToken,
                secret,
                encoding: 'base32',
                window
            });
        }
        catch (error) {
            return false;
        }
    }
    generateBackupCodes(count = 10) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            const code = crypto.randomBytes(4).toString('hex').toUpperCase();
            codes.push(code);
        }
        return codes;
    }
    verifyBackupCode(code, validCodes) {
        const cleanCode = code.replace(/\s/g, '').toUpperCase();
        return validCodes.includes(cleanCode);
    }
    generateSMSToken() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    verifySMSEmailToken(token, storedToken, createdAt, expirationMinutes = 5) {
        const now = new Date();
        const expirationTime = new Date(createdAt.getTime() + expirationMinutes * 60 * 1000);
        if (now > expirationTime) {
            return false;
        }
        return token === storedToken;
    }
    generateDeviceFingerprint(userAgent, ipAddress) {
        const data = `${userAgent}|${ipAddress}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    createTrustedDevice(userAgent, ipAddress, deviceName) {
        const deviceId = this.generateDeviceFingerprint(userAgent, ipAddress);
        return {
            deviceId,
            deviceName: deviceName || this.parseDeviceName(userAgent),
            createdAt: new Date(),
            lastUsedAt: new Date(),
            ipAddress,
            userAgent
        };
    }
    parseDeviceName(userAgent) {
        const UAParser = require('ua-parser-js');
        const parser = new UAParser(userAgent);
        const browser = parser.getBrowser();
        const os = parser.getOS();
        return `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`;
    }
    shouldRequireMFA(context) {
        if (context.isHighRiskAction) {
            return true;
        }
        if (context.suspiciousActivity) {
            return true;
        }
        if (context.isNewDevice) {
            return true;
        }
        if (context.lastLoginAt) {
            const daysSinceLastLogin = (Date.now() - context.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceLastLogin > 7) {
                return true;
            }
        }
        return false;
    }
    generateRecoveryCodes(count = 8) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            const code = crypto.randomBytes(8).toString('hex').toUpperCase();
            const formatted = code.match(/.{1,4}/g)?.join('-') || code;
            codes.push(formatted);
        }
        return codes;
    }
    encryptSecret(secret, masterKey) {
        const cipher = crypto.createCipher('aes-256-gcm', masterKey);
        let encrypted = cipher.update(secret, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }
    decryptSecret(encryptedSecret, masterKey) {
        const decipher = crypto.createDecipher('aes-256-gcm', masterKey);
        let decrypted = decipher.update(encryptedSecret, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    checkMFARateLimit(userId, attempts, windowMinutes = 15) {
        const maxAttempts = 5;
        return attempts < maxAttempts;
    }
    generateTimeBasedChallenge() {
        const timestamp = Math.floor(Date.now() / 1000);
        const challenge = crypto.createHmac('sha256', process.env.MFA_CHALLENGE_SECRET || 'default-secret')
            .update(timestamp.toString())
            .digest('hex')
            .substring(0, 8);
        return challenge.toUpperCase();
    }
}
exports.MFAService = MFAService;
exports.mfaService = new MFAService();
//# sourceMappingURL=mfa.js.map