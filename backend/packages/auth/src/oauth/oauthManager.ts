import * as crypto from 'crypto';
import axios from 'axios';
import { CacheManager } from '@fineprintai/cache';
import { createServiceLogger } from '@fineprintai/logger';
import {
  OAuth2Config,
  OAuth2Provider,
  OAuth2State,
  OAuth2AuthorizationRequest,
  OAuth2AuthorizationResponse,
  OAuth2TokenRequest,
  OAuth2TokenResponse,
  OAuth2UserInfo,
  OAuth2Account,
  OAuth2AuthResult,
  OAuth2Stats
} from './types';

const logger = createServiceLogger('oauth-manager');

export class OAuth2Manager {
  private cache: CacheManager;
  private config: OAuth2Config;
  private providers: Map<string, OAuth2Provider> = new Map();

  constructor(cache: CacheManager, config: OAuth2Config) {
    this.cache = cache;
    this.config = config;
    this.initializeProviders();
  }

  /**
   * Initialize OAuth2 providers
   */
  private initializeProviders(): void {
    // Google OAuth2 provider
    if (this.config.google.enabled) {
      this.providers.set('google', {
        id: 'google',
        name: 'Google',
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
        scopes: this.config.google.scopes,
        enabled: true
      });
      logger.info('Google OAuth2 provider initialized');
    }

    // Microsoft OAuth2 provider
    if (this.config.microsoft.enabled) {
      const tenantId = this.config.microsoft.tenantId || 'common';
      this.providers.set('microsoft', {
        id: 'microsoft',
        name: 'Microsoft',
        authorizationUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
        scopes: this.config.microsoft.scopes,
        enabled: true
      });
      logger.info('Microsoft OAuth2 provider initialized');
    }
  }

  /**
   * Get available OAuth2 providers
   */
  getProviders(): OAuth2Provider[] {
    return Array.from(this.providers.values()).filter(p => p.enabled);
  }

  /**
   * Generate OAuth2 authorization URL
   */
  async generateAuthorizationUrl(
    request: OAuth2AuthorizationRequest,
    ipAddress?: string,
    userAgent?: string
  ): Promise<OAuth2AuthorizationResponse> {
    try {
      const provider = this.providers.get(request.provider);
      if (!provider) {
        throw new Error(`Provider ${request.provider} not found or not enabled`);
      }

      // Check rate limiting
      await this.checkRateLimit(ipAddress);

      // Generate state and nonce for security
      const state = crypto.randomUUID();
      const nonce = crypto.randomBytes(16).toString('hex');

      // Store OAuth2 state
      const oauthState: OAuth2State = {
        id: state,
        provider: request.provider,
        nonce,
        redirectUrl: request.redirectUrl,
        userId: request.userId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (this.config.security.stateExpiry * 1000)),
        ipAddress,
        userAgent
      };

      await this.cache.set(
        `oauth-state:${state}`,
        oauthState,
        this.config.security.stateExpiry
      );

      // Build authorization URL
      const scopes = request.scopes || provider.scopes;
      const params = new URLSearchParams({
        client_id: this.getClientId(request.provider),
        redirect_uri: this.getRedirectUri(request.provider),
        response_type: 'code',
        scope: scopes.join(' '),
        state,
        nonce,
        access_type: 'offline', // For refresh tokens
        prompt: 'consent' // Force consent to get refresh token
      });

      const authorizationUrl = `${provider.authorizationUrl}?${params.toString()}`;

      logger.info('OAuth2 authorization URL generated', {
        provider: request.provider,
        state: state.substring(0, 8) + '...',
        ipAddress
      });

      return {
        authorizationUrl,
        state,
        nonce
      };
    } catch (error) {
      logger.error('Failed to generate OAuth2 authorization URL', {
        error,
        provider: request.provider
      });
      throw new Error(`Authorization URL generation failed: ${error.message}`);
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    request: OAuth2TokenRequest,
    ipAddress?: string,
    userAgent?: string
  ): Promise<OAuth2TokenResponse> {
    try {
      const provider = this.providers.get(request.provider);
      if (!provider) {
        throw new Error(`Provider ${request.provider} not found`);
      }

      // Validate state
      const oauthState = await this.cache.get<OAuth2State>(`oauth-state:${request.state}`);
      if (!oauthState) {
        throw new Error('Invalid or expired OAuth2 state');
      }

      if (oauthState.provider !== request.provider) {
        throw new Error('Provider mismatch in OAuth2 state');
      }

      // Check IP and user agent if available
      if (ipAddress && oauthState.ipAddress && oauthState.ipAddress !== ipAddress) {
        logger.warn('OAuth2 IP address mismatch', {
          expected: oauthState.ipAddress,
          actual: ipAddress,
          state: request.state.substring(0, 8) + '...'
        });
      }

      // Exchange code for tokens
      const tokenParams = {
        client_id: this.getClientId(request.provider),
        client_secret: this.getClientSecret(request.provider),
        code: request.code,
        grant_type: 'authorization_code',
        redirect_uri: this.getRedirectUri(request.provider)
      };

      const response = await axios.post(provider.tokenUrl, tokenParams, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      const tokenResponse: OAuth2TokenResponse = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type,
        scope: response.data.scope,
        idToken: response.data.id_token
      };

      // Clean up used state
      await this.cache.del(`oauth-state:${request.state}`);

      logger.info('OAuth2 tokens exchanged successfully', {
        provider: request.provider,
        hasRefreshToken: !!tokenResponse.refreshToken,
        expiresIn: tokenResponse.expiresIn
      });

      return tokenResponse;
    } catch (error) {
      logger.error('Failed to exchange OAuth2 code for tokens', {
        error: error.response?.data || error.message,
        provider: request.provider
      });
      throw new Error(`Token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Get user information from OAuth2 provider
   */
  async getUserInfo(provider: string, accessToken: string): Promise<OAuth2UserInfo> {
    try {
      const providerConfig = this.providers.get(provider);
      if (!providerConfig) {
        throw new Error(`Provider ${provider} not found`);
      }

      const response = await axios.get(providerConfig.userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      const rawData = response.data;
      let userInfo: OAuth2UserInfo;

      // Normalize user info based on provider
      switch (provider) {
        case 'google':
          userInfo = {
            id: rawData.id,
            email: rawData.email,
            emailVerified: rawData.verified_email,
            name: rawData.name,
            givenName: rawData.given_name,
            familyName: rawData.family_name,
            picture: rawData.picture,
            locale: rawData.locale,
            provider: 'google',
            rawData
          };
          break;

        case 'microsoft':
          userInfo = {
            id: rawData.id,
            email: rawData.mail || rawData.userPrincipalName,
            emailVerified: true, // Microsoft accounts are pre-verified
            name: rawData.displayName,
            givenName: rawData.givenName,
            familyName: rawData.surname,
            picture: rawData.photo?.value, // Requires additional API call
            locale: rawData.preferredLanguage,
            provider: 'microsoft',
            rawData
          };
          break;

        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      logger.info('OAuth2 user info retrieved', {
        provider,
        userId: userInfo.id,
        email: userInfo.email.substring(0, 3) + '***'
      });

      return userInfo;
    } catch (error) {
      logger.error('Failed to get OAuth2 user info', {
        error: error.response?.data || error.message,
        provider
      });
      throw new Error(`User info retrieval failed: ${error.message}`);
    }
  }

  /**
   * Authenticate user with OAuth2
   */
  async authenticateUser(
    request: OAuth2TokenRequest,
    ipAddress?: string,
    userAgent?: string
  ): Promise<OAuth2AuthResult> {
    try {
      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(request, ipAddress, userAgent);

      // Get user information
      const userInfo = await this.getUserInfo(request.provider, tokens.accessToken);

      // Check if account exists
      let existingAccount = await this.getAccountByProviderAndId(
        request.provider,
        userInfo.id
      );

      let isNewUser = false;
      let user: OAuth2AuthResult['user'];

      if (existingAccount) {
        // Update existing account
        existingAccount.lastUsedAt = new Date();
        existingAccount.accessToken = tokens.accessToken;
        existingAccount.refreshToken = tokens.refreshToken;
        existingAccount.expiresAt = tokens.expiresIn 
          ? new Date(Date.now() + (tokens.expiresIn * 1000))
          : undefined;

        await this.cache.set(`oauth-account:${existingAccount.id}`, existingAccount, 0);

        user = {
          id: existingAccount.userId,
          email: existingAccount.email,
          name: existingAccount.name,
          picture: existingAccount.picture,
          isNewUser: false
        };

        logger.info('Existing OAuth2 user authenticated', {
          provider: request.provider,
          userId: user.id.substring(0, 8) + '...',
          email: user.email.substring(0, 3) + '***'
        });
      } else {
        // Check if user exists with same email
        const existingUser = await this.getUserByEmail(userInfo.email);
        
        if (existingUser) {
          // Account linking required
          const linkToken = crypto.randomUUID();
          await this.cache.set(
            `oauth-link:${linkToken}`,
            {
              userInfo,
              tokens,
              provider: request.provider,
              existingUserId: existingUser.id
            },
            3600 // 1 hour
          );

          return {
            success: false,
            requiresLinking: true,
            linkToken,
            error: 'Account linking required'
          };
        }

        // Create new user and account
        const newUserId = crypto.randomUUID();
        const accountId = crypto.randomUUID();

        const newAccount: OAuth2Account = {
          id: accountId,
          userId: newUserId,
          provider: request.provider,
          providerAccountId: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresIn 
            ? new Date(Date.now() + (tokens.expiresIn * 1000))
            : undefined,
          tokenType: tokens.tokenType,
          scope: tokens.scope,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          metadata: {
            locale: userInfo.locale,
            emailVerified: userInfo.emailVerified
          }
        };

        await Promise.all([
          this.cache.set(`oauth-account:${accountId}`, newAccount, 0),
          this.cache.sadd(`user-oauth-accounts:${newUserId}`, accountId),
          this.cache.set(`oauth-account-by-provider:${request.provider}:${userInfo.id}`, accountId, 0)
        ]);

        user = {
          id: newUserId,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
          isNewUser: true
        };

        existingAccount = newAccount;
        isNewUser = true;

        logger.info('New OAuth2 user created and authenticated', {
          provider: request.provider,
          userId: user.id.substring(0, 8) + '...',
          email: user.email.substring(0, 3) + '***'
        });
      }

      return {
        success: true,
        user,
        account: existingAccount,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || '',
          expiresIn: tokens.expiresIn
        }
      };
    } catch (error) {
      logger.error('OAuth2 authentication failed', {
        error: error.message,
        provider: request.provider
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Link OAuth2 account to existing user
   */
  async linkAccount(
    linkToken: string,
    userId: string,
    confirmEmail: string
  ): Promise<OAuth2AuthResult> {
    try {
      const linkData = await this.cache.get(`oauth-link:${linkToken}`);
      if (!linkData) {
        throw new Error('Invalid or expired link token');
      }

      // Verify user and email
      if (linkData.existingUserId !== userId) {
        throw new Error('User ID mismatch');
      }

      if (linkData.userInfo.email !== confirmEmail) {
        throw new Error('Email mismatch');
      }

      // Create linked account
      const accountId = crypto.randomUUID();
      const linkedAccount: OAuth2Account = {
        id: accountId,
        userId,
        provider: linkData.provider,
        providerAccountId: linkData.userInfo.id,
        email: linkData.userInfo.email,
        name: linkData.userInfo.name,
        picture: linkData.userInfo.picture,
        accessToken: linkData.tokens.accessToken,
        refreshToken: linkData.tokens.refreshToken,
        expiresAt: linkData.tokens.expiresIn 
          ? new Date(Date.now() + (linkData.tokens.expiresIn * 1000))
          : undefined,
        tokenType: linkData.tokens.tokenType,
        scope: linkData.tokens.scope,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        metadata: {
          locale: linkData.userInfo.locale,
          emailVerified: linkData.userInfo.emailVerified,
          linkedAt: new Date()
        }
      };

      await Promise.all([
        this.cache.set(`oauth-account:${accountId}`, linkedAccount, 0),
        this.cache.sadd(`user-oauth-accounts:${userId}`, accountId),
        this.cache.set(`oauth-account-by-provider:${linkData.provider}:${linkData.userInfo.id}`, accountId, 0),
        this.cache.del(`oauth-link:${linkToken}`)
      ]);

      logger.info('OAuth2 account linked successfully', {
        provider: linkData.provider,
        userId: userId.substring(0, 8) + '...',
        accountId: accountId.substring(0, 8) + '...'
      });

      return {
        success: true,
        user: {
          id: userId,
          email: linkData.userInfo.email,
          name: linkData.userInfo.name,
          picture: linkData.userInfo.picture,
          isNewUser: false
        },
        account: linkedAccount,
        tokens: {
          accessToken: linkData.tokens.accessToken,
          refreshToken: linkData.tokens.refreshToken || '',
          expiresIn: linkData.tokens.expiresIn
        }
      };
    } catch (error) {
      logger.error('OAuth2 account linking failed', { error, linkToken });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Unlink OAuth2 account
   */
  async unlinkAccount(userId: string, accountId: string): Promise<boolean> {
    try {
      const account = await this.cache.get<OAuth2Account>(`oauth-account:${accountId}`);
      
      if (!account || account.userId !== userId) {
        return false;
      }

      // Remove account
      await Promise.all([
        this.cache.del(`oauth-account:${accountId}`),
        this.cache.srem(`user-oauth-accounts:${userId}`, accountId),
        this.cache.del(`oauth-account-by-provider:${account.provider}:${account.providerAccountId}`)
      ]);

      logger.info('OAuth2 account unlinked', {
        provider: account.provider,
        userId: userId.substring(0, 8) + '...',
        accountId: accountId.substring(0, 8) + '...'
      });

      return true;
    } catch (error) {
      logger.error('Failed to unlink OAuth2 account', { error, userId, accountId });
      return false;
    }
  }

  /**
   * Get user's OAuth2 accounts
   */
  async getUserAccounts(userId: string): Promise<OAuth2Account[]> {
    try {
      const accountIds = await this.cache.smembers(`user-oauth-accounts:${userId}`);
      const accounts: OAuth2Account[] = [];

      for (const accountId of accountIds) {
        const account = await this.cache.get<OAuth2Account>(`oauth-account:${accountId}`);
        if (account) {
          // Remove sensitive data
          const sanitizedAccount = { ...account };
          delete sanitizedAccount.accessToken;
          delete sanitizedAccount.refreshToken;
          accounts.push(sanitizedAccount);
        }
      }

      return accounts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    } catch (error) {
      logger.error('Failed to get user OAuth2 accounts', { error, userId });
      return [];
    }
  }

  /**
   * Refresh OAuth2 access token
   */
  async refreshAccessToken(accountId: string): Promise<OAuth2TokenResponse | null> {
    try {
      const account = await this.cache.get<OAuth2Account>(`oauth-account:${accountId}`);
      
      if (!account || !account.refreshToken) {
        return null;
      }

      const provider = this.providers.get(account.provider);
      if (!provider) {
        return null;
      }

      const tokenParams = {
        client_id: this.getClientId(account.provider),
        client_secret: this.getClientSecret(account.provider),
        refresh_token: account.refreshToken,
        grant_type: 'refresh_token'
      };

      const response = await axios.post(provider.tokenUrl, tokenParams, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      const tokens: OAuth2TokenResponse = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || account.refreshToken,
        expiresIn: response.data.expires_in,
        tokenType: response.data.token_type,
        scope: response.data.scope
      };

      // Update account with new tokens
      account.accessToken = tokens.accessToken;
      account.refreshToken = tokens.refreshToken;
      account.expiresAt = new Date(Date.now() + (tokens.expiresIn * 1000));
      account.lastUsedAt = new Date();

      await this.cache.set(`oauth-account:${accountId}`, account, 0);

      logger.info('OAuth2 access token refreshed', {
        provider: account.provider,
        accountId: accountId.substring(0, 8) + '...'
      });

      return tokens;
    } catch (error) {
      logger.error('Failed to refresh OAuth2 access token', {
        error: error.response?.data || error.message,
        accountId
      });
      return null;
    }
  }

  /**
   * Get account by provider and provider ID
   */
  private async getAccountByProviderAndId(
    provider: string,
    providerAccountId: string
  ): Promise<OAuth2Account | null> {
    try {
      const accountId = await this.cache.get(
        `oauth-account-by-provider:${provider}:${providerAccountId}`
      );
      
      if (!accountId) {
        return null;
      }

      return await this.cache.get<OAuth2Account>(`oauth-account:${accountId}`);
    } catch (error) {
      logger.error('Failed to get OAuth2 account by provider', { error, provider, providerAccountId });
      return null;
    }
  }

  /**
   * Mock function to get user by email (should be implemented with actual user service)
   */
  private async getUserByEmail(email: string): Promise<{ id: string } | null> {
    // This should integrate with the actual user service
    // For now, return null to indicate no existing user
    return null;
  }

  /**
   * Get client ID for provider
   */
  private getClientId(provider: string): string {
    switch (provider) {
      case 'google':
        return this.config.google.clientId;
      case 'microsoft':
        return this.config.microsoft.clientId;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Get client secret for provider
   */
  private getClientSecret(provider: string): string {
    switch (provider) {
      case 'google':
        return this.config.google.clientSecret;
      case 'microsoft':
        return this.config.microsoft.clientSecret;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Get redirect URI for provider
   */
  private getRedirectUri(provider: string): string {
    switch (provider) {
      case 'google':
        return this.config.google.redirectUri;
      case 'microsoft':
        return this.config.microsoft.redirectUri;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Check rate limiting for OAuth2 requests
   */
  private async checkRateLimit(ipAddress?: string): Promise<void> {
    if (!ipAddress) return;

    const key = `oauth-rate-limit:${ipAddress}`;
    const current = await this.cache.get(key) || 0;
    
    if (current >= this.config.security.rateLimitPerHour) {
      throw new Error('Rate limit exceeded for OAuth2 requests');
    }

    await this.cache.increment(key);
    await this.cache.expire(key, 3600); // 1 hour
  }

  /**
   * Get OAuth2 statistics
   */
  async getOAuth2Stats(): Promise<OAuth2Stats> {
    try {
      const accountKeys = await this.cache.keys('oauth-account:*');
      const userAccountKeys = await this.cache.keys('user-oauth-accounts:*');
      
      let totalAccounts = 0;
      const accountsByProvider: Record<string, number> = {};
      let linkedAccounts = 0;

      for (const key of accountKeys) {
        const account = await this.cache.get<OAuth2Account>(key);
        if (account) {
          totalAccounts++;
          accountsByProvider[account.provider] = (accountsByProvider[account.provider] || 0) + 1;
          
          if (account.metadata.linkedAt) {
            linkedAccounts++;
          }
        }
      }

      // Get recent login stats from audit logs
      const recentLogins = 0; // Would need to implement audit log tracking
      const failedAttempts = 0; // Would need to implement failed attempt tracking

      return {
        totalAccounts,
        accountsByProvider,
        recentLogins,
        failedAttempts,
        linkedAccounts
      };
    } catch (error) {
      logger.error('Failed to get OAuth2 stats', { error });
      return {
        totalAccounts: 0,
        accountsByProvider: {},
        recentLogins: 0,
        failedAttempts: 0,
        linkedAccounts: 0
      };
    }
  }

  /**
   * Cleanup expired states and perform maintenance
   */
  async performMaintenance(): Promise<void> {
    try {
      logger.info('Starting OAuth2 maintenance');

      // Clean up expired states
      const stateKeys = await this.cache.keys('oauth-state:*');
      let cleanedStates = 0;

      for (const key of stateKeys) {
        const state = await this.cache.get<OAuth2State>(key);
        if (state && state.expiresAt < new Date()) {
          await this.cache.del(key);
          cleanedStates++;
        }
      }

      // Clean up expired link tokens
      const linkKeys = await this.cache.keys('oauth-link:*');
      let cleanedLinks = 0;

      for (const key of linkKeys) {
        const ttl = await this.cache.ttl(key);
        if (ttl === -1 || ttl === 0) {
          await this.cache.del(key);
          cleanedLinks++;
        }
      }

      logger.info('OAuth2 maintenance completed', {
        cleanedStates,
        cleanedLinks
      });
    } catch (error) {
      logger.error('OAuth2 maintenance failed', { error });
    }
  }
}