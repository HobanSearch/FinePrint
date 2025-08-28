/**
 * Biometric Authentication Service
 * Enhanced Face ID, Touch ID, and Android fingerprint support
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { logger } from '../utils/logger';
import { performanceMonitor } from '../utils/performance';

const BIOMETRIC_SETTINGS_KEY = 'biometric_settings';
const BIOMETRIC_TOKEN_KEY = 'biometric_token';
const AUTH_ATTEMPTS_KEY = 'auth_attempts';
const LOCKOUT_KEY = 'auth_lockout';

export interface BiometricSettings {
  enabled: boolean;
  authMethod: 'any' | 'biometric_only' | 'passcode_fallback';
  requireAuthOnLaunch: boolean;
  requireAuthForSensitiveActions: boolean;
  lockoutAfterFailures: number;
  lockoutDuration: number; // minutes
  enableHapticFeedback: boolean;
  showFallbackButton: boolean;
  maxRetries: number;
}

export interface BiometricCapabilities {
  hasHardware: boolean;
  hasEnrolledBiometrics: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  securityLevel: 'none' | 'biometric_weak' | 'biometric_strong' | 'device_credential';
  isAvailable: boolean;
}

export interface AuthenticationResult {
  success: boolean;
  authMethod?: 'biometric' | 'passcode' | 'cancelled';
  error?: string;
  errorCode?: string;
  canRetry: boolean;
  remainingAttempts?: number;
  lockoutUntil?: string;
}

export interface AuthAttempt {
  timestamp: string;
  success: boolean;
  method: string;
  errorCode?: string;
  deviceInfo: {
    platform: string;
    model?: string;
  };
}

class BiometricAuthService {
  private settings: BiometricSettings;
  private capabilities: BiometricCapabilities | null = null;
  private isInitialized = false;
  private authAttempts: AuthAttempt[] = [];

  constructor() {
    this.settings = {
      enabled: false,
      authMethod: 'any',
      requireAuthOnLaunch: true,
      requireAuthForSensitiveActions: true,
      lockoutAfterFailures: 5,
      lockoutDuration: 30, // 30 minutes
      enableHapticFeedback: true,
      showFallbackButton: true,
      maxRetries: 3,
    };
  }

  /**
   * Initialize biometric authentication service
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing biometric authentication service...');

      // Load settings and check capabilities
      await this.loadSettings();
      await this.checkCapabilities();
      await this.loadAuthAttempts();

      this.isInitialized = true;
      logger.info('Biometric authentication service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize biometric authentication service:', error);
      throw error;
    }
  }

  /**
   * Check device biometric capabilities
   */
  async checkCapabilities(): Promise<BiometricCapabilities> {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const hasEnrolledBiometrics = await LocalAuthentication.isEnrolledAsync();
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();

      this.capabilities = {
        hasHardware,
        hasEnrolledBiometrics,
        supportedTypes,
        securityLevel,
        isAvailable: hasHardware && hasEnrolledBiometrics,
      };

      logger.info('Biometric capabilities checked:', this.capabilities);
      return this.capabilities;
    } catch (error) {
      logger.error('Failed to check biometric capabilities:', error);
      
      this.capabilities = {
        hasHardware: false,
        hasEnrolledBiometrics: false,
        supportedTypes: [],
        securityLevel: 'none',
        isAvailable: false,
      };
      
      return this.capabilities;
    }
  }

  /**
   * Authenticate user with biometrics
   */
  async authenticate(
    options: {
      promptMessage?: string;
      cancelLabel?: string;
      fallbackLabel?: string;
      disableDeviceFallback?: boolean;
      requireConfirmation?: boolean;
    } = {}
  ): Promise<AuthenticationResult> {
    const startTime = Date.now();
    performanceMonitor.startTimer('biometric_auth');

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Check if biometrics are available
      if (!this.capabilities?.isAvailable) {
        return {
          success: false,
          error: 'Biometric authentication not available',
          errorCode: 'NOT_AVAILABLE',
          canRetry: false,
        };
      }

      // Check for lockout
      const lockoutCheck = await this.checkLockout();
      if (lockoutCheck.isLocked) {
        return {
          success: false,
          error: `Authentication locked until ${lockoutCheck.lockoutUntil}`,
          errorCode: 'LOCKED_OUT',
          canRetry: false,
          lockoutUntil: lockoutCheck.lockoutUntil,
        };
      }

      const {
        promptMessage = 'Use your biometric to authenticate',
        cancelLabel = 'Cancel',
        fallbackLabel = 'Use Passcode',
        disableDeviceFallback = false,
        requireConfirmation = false,
      } = options;

      // Configure authentication options
      const authOptions: LocalAuthentication.LocalAuthenticationOptions = {
        promptMessage,
        cancelLabel,
        fallbackLabel: this.settings.showFallbackButton ? fallbackLabel : undefined,
        disableDeviceFallback: disableDeviceFallback || this.settings.authMethod === 'biometric_only',
        requireConfirmation,
      };

      // Perform authentication
      const result = await LocalAuthentication.authenticateAsync(authOptions);

      const authTime = performanceMonitor.endTimer('biometric_auth');
      
      // Process result
      const authResult = await this.processAuthResult(result, authTime);
      
      // Record attempt
      await this.recordAuthAttempt(authResult);

      return authResult;
    } catch (error) {
      logger.error('Biometric authentication failed:', error);
      
      const authResult: AuthenticationResult = {
        success: false,
        error: error.message,
        errorCode: 'AUTHENTICATION_ERROR',
        canRetry: true,
      };

      await this.recordAuthAttempt(authResult);
      return authResult;
    }
  }

  /**
   * Process authentication result
   */
  private async processAuthResult(
    result: LocalAuthentication.LocalAuthenticationResult,
    authTime: number
  ): Promise<AuthenticationResult> {
    if (result.success) {
      // Success
      await this.clearFailedAttempts();
      
      if (this.settings.enableHapticFeedback) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Store authentication token
      await this.storeAuthToken();

      logger.info(`Biometric authentication successful in ${authTime}ms`);

      return {
        success: true,
        authMethod: 'biometric',
        canRetry: false,
      };
    } else {
      // Failure or cancellation
      const errorCode = result.error;
      let canRetry = true;
      let authMethod: 'biometric' | 'passcode' | 'cancelled' = 'cancelled';
      let error = 'Authentication failed';

      switch (errorCode) {
        case 'UserCancel':
          error = 'Authentication cancelled by user';
          authMethod = 'cancelled';
          canRetry = false;
          break;
        
        case 'SystemCancel':
          error = 'Authentication cancelled by system';
          authMethod = 'cancelled';
          canRetry = true;
          break;
        
        case 'UserFallback':
          error = 'User selected fallback authentication';
          authMethod = 'passcode';
          canRetry = false;
          break;
        
        case 'BiometricUnavailable':
          error = 'Biometric authentication unavailable';
          canRetry = false;
          break;
        
        case 'PasscodeNotSet':
          error = 'Device passcode not set';
          canRetry = false;
          break;
        
        case 'NotEnrolled':
          error = 'No biometrics enrolled';
          canRetry = false;
          break;
        
        default:
          error = `Authentication failed: ${errorCode}`;
          break;
      }

      // Record failed attempt
      if (errorCode !== 'UserCancel' && errorCode !== 'SystemCancel') {
        await this.recordFailedAttempt();
      }

      if (this.settings.enableHapticFeedback && authMethod !== 'cancelled') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      const remainingAttempts = await this.getRemainingAttempts();

      return {
        success: false,
        authMethod,
        error,
        errorCode,
        canRetry,
        remainingAttempts,
      };
    }
  }

  /**
   * Check if user is currently locked out
   */
  private async checkLockout(): Promise<{
    isLocked: boolean;
    lockoutUntil?: string;
    remainingTime?: number;
  }> {
    try {
      const lockoutData = await AsyncStorage.getItem(LOCKOUT_KEY);
      if (!lockoutData) {
        return { isLocked: false };
      }

      const { lockoutUntil } = JSON.parse(lockoutData);
      const lockoutTime = new Date(lockoutUntil);
      const now = new Date();

      if (now < lockoutTime) {
        return {
          isLocked: true,
          lockoutUntil,
          remainingTime: lockoutTime.getTime() - now.getTime(),
        };
      } else {
        // Lockout expired, clear it
        await AsyncStorage.removeItem(LOCKOUT_KEY);
        await this.clearFailedAttempts();
        return { isLocked: false };
      }
    } catch (error) {
      logger.error('Failed to check lockout status:', error);
      return { isLocked: false };
    }
  }

  /**
   * Record failed authentication attempt
   */
  private async recordFailedAttempt(): Promise<void> {
    try {
      const attemptsData = await AsyncStorage.getItem(AUTH_ATTEMPTS_KEY);
      const attempts = attemptsData ? JSON.parse(attemptsData) : { count: 0, lastAttempt: null };
      
      attempts.count++;
      attempts.lastAttempt = new Date().toISOString();

      await AsyncStorage.setItem(AUTH_ATTEMPTS_KEY, JSON.stringify(attempts));

      // Check if lockout is needed
      if (attempts.count >= this.settings.lockoutAfterFailures) {
        await this.initiateLockout();
      }
    } catch (error) {
      logger.error('Failed to record failed attempt:', error);
    }
  }

  /**
   * Clear failed attempts
   */
  private async clearFailedAttempts(): Promise<void> {
    try {
      await AsyncStorage.removeItem(AUTH_ATTEMPTS_KEY);
    } catch (error) {
      logger.error('Failed to clear failed attempts:', error);
    }
  }

  /**
   * Get remaining attempts before lockout
   */
  private async getRemainingAttempts(): Promise<number> {
    try {
      const attemptsData = await AsyncStorage.getItem(AUTH_ATTEMPTS_KEY);
      if (!attemptsData) {
        return this.settings.lockoutAfterFailures;
      }

      const attempts = JSON.parse(attemptsData);
      return Math.max(0, this.settings.lockoutAfterFailures - attempts.count);
    } catch (error) {
      logger.error('Failed to get remaining attempts:', error);
      return this.settings.lockoutAfterFailures;
    }
  }

  /**
   * Initiate authentication lockout
   */
  private async initiateLockout(): Promise<void> {
    try {
      const lockoutUntil = new Date(Date.now() + this.settings.lockoutDuration * 60 * 1000);
      
      await AsyncStorage.setItem(LOCKOUT_KEY, JSON.stringify({
        lockoutUntil: lockoutUntil.toISOString(),
        reason: 'too_many_failures',
      }));

      logger.warn(`Authentication locked out until ${lockoutUntil.toISOString()}`);
    } catch (error) {
      logger.error('Failed to initiate lockout:', error);
    }
  }

  /**
   * Store authentication token
   */
  private async storeAuthToken(): Promise<void> {
    try {
      const token = {
        authenticated: true,
        timestamp: new Date().toISOString(),
        method: 'biometric',
      };

      await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, JSON.stringify(token));
    } catch (error) {
      logger.error('Failed to store auth token:', error);
    }
  }

  /**
   * Check if user is currently authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const tokenData = await SecureStore.getItemAsync(BIOMETRIC_TOKEN_KEY);
      if (!tokenData) {
        return false;
      }

      const token = JSON.parse(tokenData);
      return token.authenticated === true;
    } catch (error) {
      logger.error('Failed to check authentication status:', error);
      return false;
    }
  }

  /**
   * Clear authentication
   */
  async clearAuthentication(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
      logger.info('Authentication cleared');
    } catch (error) {
      logger.error('Failed to clear authentication:', error);
    }
  }

  /**
   * Record authentication attempt for analytics
   */
  private async recordAuthAttempt(result: AuthenticationResult): Promise<void> {
    try {
      const attempt: AuthAttempt = {
        timestamp: new Date().toISOString(),
        success: result.success,
        method: result.authMethod || 'unknown',
        errorCode: result.errorCode,
        deviceInfo: {
          platform: Platform.OS,
        },
      };

      this.authAttempts.unshift(attempt);
      
      // Keep only last 50 attempts
      this.authAttempts = this.authAttempts.slice(0, 50);
      
      await this.saveAuthAttempts();
    } catch (error) {
      logger.error('Failed to record auth attempt:', error);
    }
  }

  /**
   * Get biometric type names for UI display
   */
  getBiometricTypeNames(): string[] {
    if (!this.capabilities) {
      return [];
    }

    const typeNames: string[] = [];
    
    this.capabilities.supportedTypes.forEach(type => {
      switch (type) {
        case LocalAuthentication.AuthenticationType.FINGERPRINT:
          typeNames.push(Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint');
          break;
        case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
          typeNames.push(Platform.OS === 'ios' ? 'Face ID' : 'Face Recognition');
          break;
        case LocalAuthentication.AuthenticationType.IRIS:
          typeNames.push('Iris Recognition');
          break;
      }
    });

    return typeNames;
  }

  /**
   * Enable/disable biometric authentication
   */
  async setBiometricEnabled(enabled: boolean): Promise<boolean> {
    try {
      if (enabled && !this.capabilities?.isAvailable) {
        throw new Error('Biometric authentication not available');
      }

      this.settings.enabled = enabled;
      await this.saveSettings();

      logger.info(`Biometric authentication ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    } catch (error) {
      logger.error('Failed to set biometric enabled status:', error);
      return false;
    }
  }

  /**
   * Update settings
   */
  async updateSettings(newSettings: Partial<BiometricSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
  }

  /**
   * Storage methods
   */
  private async loadSettings(): Promise<void> {
    try {
      const settingsString = await AsyncStorage.getItem(BIOMETRIC_SETTINGS_KEY);
      if (settingsString) {
        this.settings = { ...this.settings, ...JSON.parse(settingsString) };
      }
    } catch (error) {
      logger.error('Failed to load biometric settings:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem(BIOMETRIC_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      logger.error('Failed to save biometric settings:', error);
    }
  }

  private async loadAuthAttempts(): Promise<void> {
    try {
      const attemptsString = await AsyncStorage.getItem('auth_attempts_history');
      if (attemptsString) {
        this.authAttempts = JSON.parse(attemptsString);
      }
    } catch (error) {
      logger.error('Failed to load auth attempts:', error);
    }
  }

  private async saveAuthAttempts(): Promise<void> {
    try {
      await AsyncStorage.setItem('auth_attempts_history', JSON.stringify(this.authAttempts));
    } catch (error) {
      logger.error('Failed to save auth attempts:', error);
    }
  }

  /**
   * Public getters
   */
  getSettings(): BiometricSettings {
    return { ...this.settings };
  }

  getCapabilities(): BiometricCapabilities | null {
    return this.capabilities ? { ...this.capabilities } : null;
  }

  getAuthAttempts(): AuthAttempt[] {
    return [...this.authAttempts];
  }

  isEnabled(): boolean {
    return this.settings.enabled && (this.capabilities?.isAvailable || false);
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    try {
      await this.saveSettings();
      await this.saveAuthAttempts();
      logger.info('Biometric auth service cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup biometric auth service:', error);
    }
  }
}

export const biometricAuthService = new BiometricAuthService();