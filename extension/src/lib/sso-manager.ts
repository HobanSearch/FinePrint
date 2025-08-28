import { Storage } from "@plasmohq/storage"

import { getApiClient } from "./api-client"
import { enterpriseManager } from "./enterprise-manager"
import type { 
  SSOConfig,
  EnterpriseConfig
} from "@/types"

export interface SSOUser {
  id: string
  email: string
  name: string
  roles: string[]
  attributes: Record<string, any>
  authenticated: boolean
  tokenExpiry: number
  provider: string
}

export interface SSOToken {
  accessToken: string
  refreshToken?: string
  tokenType: string
  expiresIn: number
  scope?: string
  issuedAt: number
}

export interface SAMLResponse {
  nameId: string
  attributes: Record<string, any>
  sessionIndex: string
  issuer: string
  audience: string
  notBefore: number
  notOnOrAfter: number
}

export class SSOManager {
  private storage = new Storage()
  private currentUser: SSOUser | null = null
  private authWindow: chrome.windows.Window | null = null

  constructor() {
    this.initialize()
  }

  /**
   * Initialize SSO manager
   */
  async initialize(): Promise<void> {
    try {
      // Check if user is already authenticated
      const storedUser = await this.getStoredUser()
      if (storedUser && await this.validateToken(storedUser)) {
        this.currentUser = storedUser
      }

      // Listen for SSO messages
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.name === 'SSO_CALLBACK') {
          this.handleSSOCallback(request.body)
        }
      })
    } catch (error) {
      console.error('Failed to initialize SSO manager:', error)
    }
  }

  /**
   * Check if SSO is configured
   */
  async isSSOConfigured(): Promise<boolean> {
    const config = await enterpriseManager.getEnterpriseConfig()
    return config?.ssoConfig?.isActive || false
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser(): SSOUser | null {
    return this.currentUser
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    if (!this.currentUser) {
      const storedUser = await this.getStoredUser()
      if (storedUser) {
        const isValid = await this.validateToken(storedUser)
        if (isValid) {
          this.currentUser = storedUser
          return true
        }
      }
      return false
    }

    return await this.validateToken(this.currentUser)
  }

  /**
   * Initiate SSO login
   */
  async login(): Promise<SSOUser> {
    const config = await this.getSSOConfig()
    if (!config) {
      throw new Error('SSO not configured')
    }

    switch (config.provider) {
      case 'saml':
        return await this.loginSAML(config)
      case 'oidc':
        return await this.loginOIDC(config)
      case 'azure-ad':
        return await this.loginAzureAD(config)
      case 'google-workspace':
        return await this.loginGoogleWorkspace(config)
      default:
        throw new Error(`Unsupported SSO provider: ${config.provider}`)
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    const config = await this.getSSOConfig()
    
    if (config && this.currentUser) {
      // Perform SSO logout if supported
      try {
        await this.performSSOLogout(config)
      } catch (error) {
        console.warn('SSO logout failed:', error)
      }
    }

    // Clear local session
    await this.clearSession()
    this.currentUser = null
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(): Promise<SSOToken | null> {
    if (!this.currentUser) return null

    const config = await this.getSSOConfig()
    if (!config) return null

    try {
      const newToken = await this.performTokenRefresh(config, this.currentUser)
      if (newToken) {
        this.currentUser.tokenExpiry = Date.now() + (newToken.expiresIn * 1000)
        await this.storeUser(this.currentUser)
        return newToken
      }
    } catch (error) {
      console.error('Token refresh failed:', error)
      await this.logout()
    }

    return null
  }

  /**
   * SAML login implementation
   */
  private async loginSAML(config: SSOConfig): Promise<SSOUser> {
    const samlRequest = this.buildSAMLRequest(config)
    const loginUrl = `${config.ssoUrl}?SAMLRequest=${encodeURIComponent(samlRequest)}`

    return new Promise((resolve, reject) => {
      // Open authentication window
      chrome.windows.create({
        url: loginUrl,
        type: 'popup',
        width: 600,
        height: 700,
        focused: true
      }).then(window => {
        this.authWindow = window

        // Monitor for callback
        const checkInterval = setInterval(async () => {
          if (!this.authWindow) {
            clearInterval(checkInterval)
            reject(new Error('Authentication window closed'))
            return
          }

          try {
            const tabs = await chrome.tabs.query({ windowId: this.authWindow.id })
            if (tabs.length === 0) {
              clearInterval(checkInterval)
              reject(new Error('Authentication cancelled'))
              return
            }

            const tab = tabs[0]
            if (tab.url?.includes(chrome.runtime.id)) {
              // User returned to our callback page
              clearInterval(checkInterval)
              // The actual SAML response will be handled by the callback handler
            }
          } catch (error) {
            // Window might be closed
            clearInterval(checkInterval)
            reject(error)
          }
        }, 1000)

        // Set up one-time callback handler
        const callbackHandler = (request: any) => {
          if (request.name === 'SAML_RESPONSE') {
            chrome.runtime.onMessage.removeListener(callbackHandler)
            clearInterval(checkInterval)
            
            this.processSAMLResponse(request.body)
              .then(resolve)
              .catch(reject)
              .finally(() => {
                if (this.authWindow) {
                  chrome.windows.remove(this.authWindow.id!)
                  this.authWindow = null
                }
              })
          }
        }

        chrome.runtime.onMessage.addListener(callbackHandler)
      })
    })
  }

  /**
   * OIDC login implementation
   */
  private async loginOIDC(config: SSOConfig): Promise<SSOUser> {
    const state = this.generateState()
    const nonce = this.generateNonce()
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.entityId,
      redirect_uri: chrome.runtime.getURL('sso-callback.html'),
      scope: 'openid profile email',
      state,
      nonce
    })

    const loginUrl = `${config.ssoUrl}?${params.toString()}`

    // Store state and nonce for validation
    await this.storage.set('oidc-state', state)
    await this.storage.set('oidc-nonce', nonce)

    return this.performAuthFlow(loginUrl, 'OIDC_CALLBACK')
  }

  /**
   * Azure AD login implementation
   */
  private async loginAzureAD(config: SSOConfig): Promise<SSOUser> {
    const tenantId = config.entityId
    const clientId = 'fine-print-ai-extension' // Would be configured
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: chrome.runtime.getURL('sso-callback.html'),
      scope: 'openid profile email',
      response_mode: 'fragment',
      state: this.generateState()
    })

    const loginUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`

    return this.performAuthFlow(loginUrl, 'AZURE_AD_CALLBACK')
  }

  /**
   * Google Workspace login implementation
   */
  private async loginGoogleWorkspace(config: SSOConfig): Promise<SSOUser> {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.entityId,
      redirect_uri: chrome.runtime.getURL('sso-callback.html'),
      scope: 'openid profile email',
      access_type: 'offline',
      state: this.generateState(),
      hd: config.attributeMappings.domain || '' // Hosted domain
    })

    const loginUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    return this.performAuthFlow(loginUrl, 'GOOGLE_WORKSPACE_CALLBACK')
  }

  /**
   * Generic OAuth flow handler
   */
  private async performAuthFlow(loginUrl: string, callbackType: string): Promise<SSOUser> {
    return new Promise((resolve, reject) => {
      chrome.windows.create({
        url: loginUrl,
        type: 'popup',
        width: 600,
        height: 700,
        focused: true
      }).then(window => {
        this.authWindow = window

        const callbackHandler = (request: any) => {
          if (request.name === callbackType) {
            chrome.runtime.onMessage.removeListener(callbackHandler)
            
            this.processOAuthCallback(request.body, callbackType)
              .then(resolve)
              .catch(reject)
              .finally(() => {
                if (this.authWindow) {
                  chrome.windows.remove(this.authWindow.id!)
                  this.authWindow = null
                }
              })
          }
        }

        chrome.runtime.onMessage.addListener(callbackHandler)

        // Monitor for window closure
        chrome.windows.onRemoved.addListener((windowId) => {
          if (window?.id === windowId) {
            chrome.runtime.onMessage.removeListener(callbackHandler)
            reject(new Error('Authentication cancelled'))
          }
        })
      })
    })
  }

  /**
   * Process SAML response
   */
  private async processSAMLResponse(samlResponse: string): Promise<SSOUser> {
    const config = await this.getSSOConfig()
    if (!config) throw new Error('SSO configuration not found')

    // Decode and parse SAML response
    const decodedResponse = atob(samlResponse)
    const parsedResponse = this.parseSAMLResponse(decodedResponse)

    // Validate response
    await this.validateSAMLResponse(parsedResponse, config)

    // Extract user information
    const user: SSOUser = {
      id: parsedResponse.nameId,
      email: parsedResponse.attributes[config.attributeMappings.email] || parsedResponse.nameId,
      name: parsedResponse.attributes[config.attributeMappings.name] || 'Unknown User',
      roles: this.extractRoles(parsedResponse.attributes, config.attributeMappings),
      attributes: parsedResponse.attributes,
      authenticated: true,
      tokenExpiry: parsedResponse.notOnOrAfter,
      provider: 'saml'
    }

    // Store user session
    await this.storeUser(user)
    this.currentUser = user

    return user
  }

  /**
   * Process OAuth callback
   */
  private async processOAuthCallback(callbackData: any, type: string): Promise<SSOUser> {
    const config = await this.getSSOConfig()
    if (!config) throw new Error('SSO configuration not found')

    // Exchange code for tokens
    const tokenResponse = await this.exchangeCodeForToken(callbackData.code, config, type)
    
    // Get user info from token
    const userInfo = await this.getUserInfoFromToken(tokenResponse.accessToken, config, type)

    const user: SSOUser = {
      id: userInfo.sub || userInfo.id,
      email: userInfo.email,
      name: userInfo.name || `${userInfo.given_name} ${userInfo.family_name}`,
      roles: this.extractRolesFromToken(userInfo, config.attributeMappings),
      attributes: userInfo,
      authenticated: true,
      tokenExpiry: Date.now() + (tokenResponse.expiresIn * 1000),
      provider: type.toLowerCase().replace('_callback', '')
    }

    // Store user session
    await this.storeUser(user)
    this.currentUser = user

    return user
  }

  /**
   * Build SAML request
   */
  private buildSAMLRequest(config: SSOConfig): string {
    const requestId = `_${Math.random().toString(36).substring(2)}`
    const timestamp = new Date().toISOString()
    
    const samlRequest = `
      <samlp:AuthnRequest 
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="${requestId}"
        Version="2.0"
        IssueInstant="${timestamp}"
        Destination="${config.ssoUrl}"
        AssertionConsumerServiceURL="${chrome.runtime.getURL('sso-callback.html')}">
        <saml:Issuer>${config.entityId}</saml:Issuer>
        <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
      </samlp:AuthnRequest>
    `

    return btoa(samlRequest.trim())
  }

  /**
   * Parse SAML response
   */
  private parseSAMLResponse(response: string): SAMLResponse {
    const parser = new DOMParser()
    const doc = parser.parseFromString(response, 'text/xml')

    // Extract assertion
    const assertion = doc.querySelector('Assertion')
    if (!assertion) throw new Error('Invalid SAML response: No assertion found')

    // Extract name ID
    const nameId = assertion.querySelector('Subject NameID')?.textContent
    if (!nameId) throw new Error('Invalid SAML response: No NameID found')

    // Extract attributes
    const attributes: Record<string, any> = {}
    const attributeStatements = assertion.querySelectorAll('AttributeStatement Attribute')
    
    attributeStatements.forEach(attr => {
      const name = attr.getAttribute('Name')
      const value = attr.querySelector('AttributeValue')?.textContent
      if (name && value) {
        attributes[name] = value
      }
    })

    // Extract conditions
    const conditions = assertion.querySelector('Conditions')
    const notBefore = conditions?.getAttribute('NotBefore')
    const notOnOrAfter = conditions?.getAttribute('NotOnOrAfter')

    return {
      nameId,
      attributes,
      sessionIndex: assertion.querySelector('AuthnStatement')?.getAttribute('SessionIndex') || '',
      issuer: assertion.querySelector('Issuer')?.textContent || '',
      audience: conditions?.querySelector('AudienceRestriction Audience')?.textContent || '',
      notBefore: notBefore ? new Date(notBefore).getTime() : Date.now(),
      notOnOrAfter: notOnOrAfter ? new Date(notOnOrAfter).getTime() : Date.now() + (24 * 60 * 60 * 1000)
    }
  }

  /**
   * Validate SAML response
   */
  private async validateSAMLResponse(response: SAMLResponse, config: SSOConfig): Promise<void> {
    // Validate timing
    const now = Date.now()
    if (now < response.notBefore || now > response.notOnOrAfter) {
      throw new Error('SAML response is not valid at this time')
    }

    // Validate audience
    if (response.audience && response.audience !== config.entityId) {
      throw new Error('SAML response audience mismatch')
    }

    // Additional validation would include signature verification
    // This would require implementing XML signature validation
  }

  /**
   * Exchange authorization code for token
   */
  private async exchangeCodeForToken(code: string, config: SSOConfig, type: string): Promise<SSOToken> {
    let tokenEndpoint = ''
    let clientId = config.entityId

    switch (type) {
      case 'OIDC_CALLBACK':
        tokenEndpoint = config.ssoUrl.replace('/auth', '/token')
        break
      case 'AZURE_AD_CALLBACK':
        tokenEndpoint = `https://login.microsoftonline.com/${config.entityId}/oauth2/v2.0/token`
        clientId = 'fine-print-ai-extension'
        break
      case 'GOOGLE_WORKSPACE_CALLBACK':
        tokenEndpoint = 'https://oauth2.googleapis.com/token'
        break
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: chrome.runtime.getURL('sso-callback.html')
    })

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    })

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`)
    }

    const tokenData = await response.json()

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
      issuedAt: Date.now()
    }
  }

  /**
   * Get user info from access token
   */
  private async getUserInfoFromToken(accessToken: string, config: SSOConfig, type: string): Promise<any> {
    let userInfoEndpoint = ''

    switch (type) {
      case 'OIDC_CALLBACK':
        userInfoEndpoint = config.ssoUrl.replace('/auth', '/userinfo')
        break
      case 'AZURE_AD_CALLBACK':
        userInfoEndpoint = 'https://graph.microsoft.com/v1.0/me'
        break
      case 'GOOGLE_WORKSPACE_CALLBACK':
        userInfoEndpoint = 'https://www.googleapis.com/oauth2/v2/userinfo'
        break
    }

    const response = await fetch(userInfoEndpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`)
    }

    return await response.json()
  }

  /**
   * Utility methods
   */
  private generateState(): string {
    return btoa(JSON.stringify({
      timestamp: Date.now(),
      random: Math.random().toString(36)
    }))
  }

  private generateNonce(): string {
    return Math.random().toString(36).substring(2)
  }

  private extractRoles(attributes: Record<string, any>, mappings: Record<string, string>): string[] {
    const roleAttribute = mappings.roles || 'roles'
    const roles = attributes[roleAttribute]
    
    if (Array.isArray(roles)) return roles
    if (typeof roles === 'string') return roles.split(',').map(r => r.trim())
    return []
  }

  private extractRolesFromToken(userInfo: any, mappings: Record<string, string>): string[] {
    const roleAttribute = mappings.roles || 'roles'
    const roles = userInfo[roleAttribute] || userInfo.groups
    
    if (Array.isArray(roles)) return roles
    if (typeof roles === 'string') return roles.split(',').map(r => r.trim())
    return []
  }

  private async getSSOConfig(): Promise<SSOConfig | null> {
    const config = await enterpriseManager.getEnterpriseConfig()
    return config?.ssoConfig || null
  }

  private async getStoredUser(): Promise<SSOUser | null> {
    try {
      const user = await this.storage.get('sso-user')
      return user
    } catch {
      return null
    }
  }

  private async storeUser(user: SSOUser): Promise<void> {
    await this.storage.set('sso-user', user)
  }

  private async validateToken(user: SSOUser): Promise<boolean> {
    if (!user.tokenExpiry) return false
    
    const now = Date.now()
    const bufferTime = 5 * 60 * 1000 // 5 minutes buffer

    return user.tokenExpiry > (now + bufferTime)
  }

  private async clearSession(): Promise<void> {
    await this.storage.remove('sso-user')
    await this.storage.remove('oidc-state')
    await this.storage.remove('oidc-nonce')
  }

  private async performSSOLogout(config: SSOConfig): Promise<void> {
    if (config.provider === 'saml') {
      // Implement SAML logout if supported
      const logoutUrl = config.ssoUrl.replace('/login', '/logout')
      chrome.tabs.create({ url: logoutUrl })
    }
  }

  private async performTokenRefresh(config: SSOConfig, user: SSOUser): Promise<SSOToken | null> {
    // Implementation would depend on the SSO provider
    // This is a placeholder for token refresh logic
    return null
  }

  private async handleSSOCallback(data: any): Promise<void> {
    // This method handles callbacks from the SSO callback page
    console.log('SSO callback received:', data)
  }
}

// Export singleton instance
export const ssoManager = new SSOManager()