export interface PasswordConfig {
  saltRounds: number;
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventCommonPasswords: boolean;
  preventUserInfoInPassword: boolean;
  maxPasswordAge: number; // in days
  passwordHistoryCount: number;
}

export interface PasswordValidationResult {
  valid: boolean;
  score: number; // 0-4 (zxcvbn score)
  feedback: string[];
  warnings: string[];
  errors: string[];
}

export interface PasswordHashResult {
  hash: string;
  salt: string;
  algorithm: string;
  rounds: number;
  createdAt: Date;
}

export interface PasswordHistoryEntry {
  hash: string;
  createdAt: Date;
  algorithm: string;
  rounds: number;
}

export interface PasswordResetToken {
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  used: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export interface PasswordChangeEvent {
  userId: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  reason: 'user-initiated' | 'admin-reset' | 'security-required' | 'expired';
  success: boolean;
  failureReason?: string;
}