export interface MFAConfig {
  totp: {
    enabled: boolean;
    issuer: string;
    window: number; // Time window for TOTP validation (in steps)
    stepSize: number; // TOTP step size in seconds (usually 30)
  };
  sms: {
    enabled: boolean;
    provider: 'twilio' | 'aws-sns';
    from: string;
    rateLimitPerHour: number;
    codeLength: number;
    codeExpiry: number; // in seconds
  };
  email: {
    enabled: boolean;
    from: string;
    rateLimitPerHour: number;
    codeLength: number;
    codeExpiry: number; // in seconds
    template: string;
  };
  backup: {
    enabled: boolean;
    codeCount: number;
    codeLength: number;
  };
  enforcement: {
    requireForNewDevices: boolean;
    requireForSensitiveOperations: boolean;
    maxFailedAttempts: number;
    lockoutDuration: number; // in seconds
  };
}

export interface MFAMethod {
  id: string;
  userId: string;
  type: 'totp' | 'sms' | 'email' | 'backup';
  enabled: boolean;
  verified: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
  metadata: {
    // TOTP specific
    secret?: string;
    qrCode?: string;
    
    // SMS specific
    phoneNumber?: string;
    countryCode?: string;
    
    // Email specific
    email?: string;
    
    // Backup codes specific
    codes?: string[];
    usedCodes?: string[];
  };
}

export interface MFAChallenge {
  id: string;
  userId: string;
  sessionId: string;
  type: 'totp' | 'sms' | 'email' | 'backup';
  code?: string; // For SMS/email challenges
  createdAt: Date;
  expiresAt: Date;
  verified: boolean;
  attempts: number;
  maxAttempts: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface MFAVerificationResult {
  success: boolean;
  challengeId?: string;
  method?: MFAMethod;
  error?: string;
  remainingAttempts?: number;
  lockoutUntil?: Date;
}

export interface MFASetupRequest {
  type: 'totp' | 'sms' | 'email';
  phoneNumber?: string; // For SMS
  email?: string; // For email
}

export interface MFASetupResponse {
  method: MFAMethod;
  setupData?: {
    qrCode?: string; // For TOTP
    secret?: string; // For TOTP
    backupCodes?: string[]; // For backup codes
  };
}

export interface BackupCode {
  code: string;
  used: boolean;
  usedAt?: Date;
}

export interface MFAStats {
  totalUsers: number;
  enabledUsers: number;
  methodDistribution: Record<string, number>;
  verificationAttempts: number;
  successfulVerifications: number;
  failedVerifications: number;
  lockedOutUsers: number;
}