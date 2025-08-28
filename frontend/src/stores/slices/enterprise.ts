import { StateCreator } from 'zustand'
import type { RootStore } from '../types'
import type {
  Organization,
  OrganizationUser,
  OrganizationRole,
  Permission,
  MFAConfiguration,
  UserMFAStatus,
  UserSession,
  AuditLog,
  SecurityEvent,
  DataExportRequest,
  DataDeletionRequest,
  ReportTemplate,
  GeneratedReport,
  OrganizationApiKey,
  WebhookEndpoint,
  SSOProvider,
  UsageMetrics
} from '../../types/enterprise'
import { apiClient } from '../../lib/api-client'

export interface EnterpriseState {
  // Current organization context
  currentOrganization: Organization | null;
  organizations: Organization[];
  
  // User management
  organizationUsers: OrganizationUser[];
  pendingInvitations: OrganizationUser[];
  
  // RBAC
  availableRoles: OrganizationRole[];
  availablePermissions: Permission[];
  currentUserPermissions: Permission[];
  
  // Security & Authentication
  mfaConfig: MFAConfiguration | null;
  userMfaStatus: UserMFAStatus | null;
  activeSessions: UserSession[];
  ssoProviders: SSOProvider[];
  
  // Audit & Compliance
  auditLogs: AuditLog[];
  securityEvents: SecurityEvent[];
  dataExportRequests: DataExportRequest[];
  dataDeletionRequests: DataDeletionRequest[];
  
  // Reporting
  reportTemplates: ReportTemplate[];
  generatedReports: GeneratedReport[];
  
  // API Management
  apiKeys: OrganizationApiKey[];
  webhookEndpoints: WebhookEndpoint[];
  
  // Analytics
  usageMetrics: UsageMetrics | null;
  
  // UI State
  isLoading: boolean;
  error: string | null;
  selectedUserId: string | null;
  auditFilters: Record<string, any>;
}

export interface EnterpriseActions {
  // Organization Management
  setCurrentOrganization: (org: Organization) => void;
  fetchOrganizations: () => Promise<void>;
  createOrganization: (data: Partial<Organization>) => Promise<Organization>;
  updateOrganization: (id: string, data: Partial<Organization>) => Promise<void>;
  deleteOrganization: (id: string) => Promise<void>;
  
  // User Management
  fetchOrganizationUsers: (orgId: string) => Promise<void>;
  inviteUser: (email: string, role: OrganizationRole, permissions?: Permission[]) => Promise<void>;
  updateUserRole: (userId: string, role: OrganizationRole, permissions?: Permission[]) => Promise<void>;
  removeUser: (userId: string) => Promise<void>;
  resendInvitation: (invitationId: string) => Promise<void>;
  
  // RBAC
  fetchRolesAndPermissions: () => Promise<void>;
  checkPermission: (permission: Permission) => boolean;
  hasRole: (role: OrganizationRole) => boolean;
  
  // MFA & Security
  fetchMFAConfig: () => Promise<void>;
  updateMFAConfig: (config: Partial<MFAConfiguration>) => Promise<void>;
  setupMFA: (method: 'totp' | 'sms') => Promise<{ qrCode?: string; backupCodes?: string[] }>;
  verifyMFA: (code: string, method: string) => Promise<void>;
  disableMFA: () => Promise<void>;
  
  // Session Management
  fetchActiveSessions: () => Promise<void>;
  terminateSession: (sessionId: string) => Promise<void>;
  terminateAllSessions: () => Promise<void>;
  
  // SSO Configuration
  fetchSSOProviders: () => Promise<void>;
  createSSOProvider: (provider: Partial<SSOProvider>) => Promise<SSOProvider>;
  updateSSOProvider: (id: string, provider: Partial<SSOProvider>) => Promise<void>;
  deleteSSOProvider: (id: string) => Promise<void>;
  testSSOConnection: (id: string) => Promise<{ success: boolean; error?: string }>;
  
  // Audit & Compliance
  fetchAuditLogs: (filters?: Record<string, any>) => Promise<void>;
  exportAuditLogs: (format: 'csv' | 'json', filters?: Record<string, any>) => Promise<string>;
  fetchSecurityEvents: () => Promise<void>;
  acknowledgeSecurityEvent: (eventId: string) => Promise<void>;
  resolveSecurityEvent: (eventId: string, resolution: string) => Promise<void>;
  
  // Data Export/Deletion (GDPR/CCPA)
  requestDataExport: (type: 'gdpr' | 'ccpa' | 'general', options: any) => Promise<DataExportRequest>;
  requestDataDeletion: (options: any) => Promise<DataDeletionRequest>;
  fetchDataRequests: () => Promise<void>;
  downloadDataExport: (requestId: string) => Promise<void>;
  verifyDataDeletion: (requestId: string, code: string) => Promise<void>;
  
  // Reporting
  fetchReportTemplates: () => Promise<void>;
  createReportTemplate: (template: Partial<ReportTemplate>) => Promise<ReportTemplate>;
  updateReportTemplate: (id: string, template: Partial<ReportTemplate>) => Promise<void>;
  deleteReportTemplate: (id: string) => Promise<void>;
  generateReport: (templateId: string, filters?: any) => Promise<GeneratedReport>;
  fetchGeneratedReports: () => Promise<void>;
  downloadReport: (reportId: string) => Promise<void>;
  scheduleReport: (templateId: string, schedule: any) => Promise<void>;
  
  // API Management
  fetchApiKeys: () => Promise<void>;
  createApiKey: (data: Partial<OrganizationApiKey>) => Promise<{ key: string; apiKey: OrganizationApiKey }>;
  updateApiKey: (id: string, data: Partial<OrganizationApiKey>) => Promise<void>;
  revokeApiKey: (id: string) => Promise<void>;
  
  // Webhook Management
  fetchWebhookEndpoints: () => Promise<void>;
  createWebhookEndpoint: (endpoint: Partial<WebhookEndpoint>) => Promise<WebhookEndpoint>;
  updateWebhookEndpoint: (id: string, endpoint: Partial<WebhookEndpoint>) => Promise<void>;
  deleteWebhookEndpoint: (id: string) => Promise<void>;
  testWebhookEndpoint: (id: string) => Promise<{ success: boolean; error?: string }>;
  
  // Analytics
  fetchUsageMetrics: (period?: { start: Date; end: Date }) => Promise<void>;
  
  // Utility
  clearError: () => void;
  setLoading: (loading: boolean) => void;
  setAuditFilters: (filters: Record<string, any>) => void;
  setSelectedUserId: (userId: string | null) => void;
}

type EnterpriseSlice = EnterpriseState & EnterpriseActions

export const createEnterpriseSlice: StateCreator<
  RootStore,
  [],
  [],
  EnterpriseSlice
> = (set, get) => ({
  // Initial State
  currentOrganization: null,
  organizations: [],
  organizationUsers: [],
  pendingInvitations: [],
  availableRoles: [],
  availablePermissions: [],
  currentUserPermissions: [],
  mfaConfig: null,
  userMfaStatus: null,
  activeSessions: [],
  ssoProviders: [],
  auditLogs: [],
  securityEvents: [],
  dataExportRequests: [],
  dataDeletionRequests: [],
  reportTemplates: [],
  generatedReports: [],
  apiKeys: [],
  webhookEndpoints: [],
  usageMetrics: null,
  isLoading: false,
  error: null,
  selectedUserId: null,
  auditFilters: {},

  // Organization Management
  setCurrentOrganization: (org: Organization) => {
    set({ currentOrganization: org })
  },

  fetchOrganizations: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get<Organization[]>('/enterprise/organizations')
      set({ organizations: response.data, isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  createOrganization: async (data: Partial<Organization>) => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<Organization>('/enterprise/organizations', data)
      const newOrg = response.data
      set(state => ({
        organizations: [...state.organizations, newOrg],
        isLoading: false
      }))
      return newOrg
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  updateOrganization: async (id: string, data: Partial<Organization>) => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.put<Organization>(`/enterprise/organizations/${id}`, data)
      const updatedOrg = response.data
      set(state => ({
        organizations: state.organizations.map(org => 
          org.id === id ? updatedOrg : org
        ),
        currentOrganization: state.currentOrganization?.id === id ? updatedOrg : state.currentOrganization,
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  deleteOrganization: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.delete(`/enterprise/organizations/${id}`)
      set(state => ({
        organizations: state.organizations.filter(org => org.id !== id),
        currentOrganization: state.currentOrganization?.id === id ? null : state.currentOrganization,
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  // User Management
  fetchOrganizationUsers: async (orgId: string) => {
    set({ isLoading: true, error: null })
    try {
      const [usersResponse, invitationsResponse] = await Promise.all([
        apiClient.get<OrganizationUser[]>(`/enterprise/organizations/${orgId}/users`),
        apiClient.get<OrganizationUser[]>(`/enterprise/organizations/${orgId}/invitations`)
      ])
      set({
        organizationUsers: usersResponse.data,
        pendingInvitations: invitationsResponse.data,
        isLoading: false
      })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  inviteUser: async (email: string, role: OrganizationRole, permissions?: Permission[]) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<OrganizationUser>(
        `/enterprise/organizations/${currentOrganization.id}/users/invite`,
        { email, role, permissions }
      )
      set(state => ({
        pendingInvitations: [...state.pendingInvitations, response.data],
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  updateUserRole: async (userId: string, role: OrganizationRole, permissions?: Permission[]) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.put<OrganizationUser>(
        `/enterprise/organizations/${currentOrganization.id}/users/${userId}`,
        { role, permissions }
      )
      set(state => ({
        organizationUsers: state.organizationUsers.map(user =>
          user.userId === userId ? response.data : user
        ),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  removeUser: async (userId: string) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      await apiClient.delete(`/enterprise/organizations/${currentOrganization.id}/users/${userId}`)
      set(state => ({
        organizationUsers: state.organizationUsers.filter(user => user.userId !== userId),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  resendInvitation: async (invitationId: string) => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.post(`/enterprise/invitations/${invitationId}/resend`)
      set({ isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  // RBAC
  fetchRolesAndPermissions: async () => {
    set({ isLoading: true, error: null })
    try {
      const [rolesResponse, permissionsResponse, userPermissionsResponse] = await Promise.all([
        apiClient.get<OrganizationRole[]>('/enterprise/roles'),
        apiClient.get<Permission[]>('/enterprise/permissions'),
        apiClient.get<Permission[]>('/enterprise/user/permissions')
      ])
      set({
        availableRoles: rolesResponse.data,
        availablePermissions: permissionsResponse.data,
        currentUserPermissions: userPermissionsResponse.data,
        isLoading: false
      })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  checkPermission: (permission: Permission): boolean => {
    const { currentUserPermissions } = get().enterprise
    return currentUserPermissions.includes(permission)
  },

  hasRole: (role: OrganizationRole): boolean => {
    const { currentOrganization } = get().enterprise
    const { user } = get().auth
    if (!currentOrganization || !user) return false
    
    const orgUser = currentOrganization.users.find(u => u.userId === user.id)
    return orgUser?.role === role
  },

  // MFA & Security
  fetchMFAConfig: async () => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) return

    set({ isLoading: true, error: null })
    try {
      const [configResponse, statusResponse] = await Promise.all([
        apiClient.get<MFAConfiguration>(`/enterprise/organizations/${currentOrganization.id}/mfa/config`),
        apiClient.get<UserMFAStatus>('/auth/mfa/status')
      ])
      set({
        mfaConfig: configResponse.data,
        userMfaStatus: statusResponse.data,
        isLoading: false
      })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  updateMFAConfig: async (config: Partial<MFAConfiguration>) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.put<MFAConfiguration>(
        `/enterprise/organizations/${currentOrganization.id}/mfa/config`,
        config
      )
      set({ mfaConfig: response.data, isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  setupMFA: async (method: 'totp' | 'sms') => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<{ qrCode?: string; backupCodes?: string[] }>(
        '/auth/mfa/setup',
        { method }
      )
      set({ isLoading: false })
      return response.data
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  verifyMFA: async (code: string, method: string) => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.post('/auth/mfa/verify', { code, method })
      // Refresh MFA status
      await get().enterprise.fetchMFAConfig()
      set({ isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  disableMFA: async () => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.post('/auth/mfa/disable')
      await get().enterprise.fetchMFAConfig()
      set({ isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  // Session Management
  fetchActiveSessions: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get<UserSession[]>('/auth/sessions')
      set({ activeSessions: response.data, isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  terminateSession: async (sessionId: string) => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.delete(`/auth/sessions/${sessionId}`)
      set(state => ({
        activeSessions: state.activeSessions.filter(session => session.id !== sessionId),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  terminateAllSessions: async () => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.delete('/auth/sessions')
      set({ activeSessions: [], isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  // SSO Configuration
  fetchSSOProviders: async () => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) return

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get<SSOProvider[]>(`/enterprise/organizations/${currentOrganization.id}/sso`)
      set({ ssoProviders: response.data, isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  createSSOProvider: async (provider: Partial<SSOProvider>) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<SSOProvider>(
        `/enterprise/organizations/${currentOrganization.id}/sso`,
        provider
      )
      set(state => ({
        ssoProviders: [...state.ssoProviders, response.data],
        isLoading: false
      }))
      return response.data
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  updateSSOProvider: async (id: string, provider: Partial<SSOProvider>) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.put<SSOProvider>(
        `/enterprise/organizations/${currentOrganization.id}/sso/${id}`,
        provider
      )
      set(state => ({
        ssoProviders: state.ssoProviders.map(p => p.id === id ? response.data : p),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  deleteSSOProvider: async (id: string) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      await apiClient.delete(`/enterprise/organizations/${currentOrganization.id}/sso/${id}`)
      set(state => ({
        ssoProviders: state.ssoProviders.filter(p => p.id !== id),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  testSSOConnection: async (id: string) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<{ success: boolean; error?: string }>(
        `/enterprise/organizations/${currentOrganization.id}/sso/${id}/test`
      )
      set({ isLoading: false })
      return response.data
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  // Audit & Compliance
  fetchAuditLogs: async (filters?: Record<string, any>) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) return

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get<AuditLog[]>(
        `/enterprise/organizations/${currentOrganization.id}/audit-logs`,
        { params: filters }
      )
      set({ auditLogs: response.data, isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  exportAuditLogs: async (format: 'csv' | 'json', filters?: Record<string, any>) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<{ downloadUrl: string }>(
        `/enterprise/organizations/${currentOrganization.id}/audit-logs/export`,
        { format, filters }
      )
      set({ isLoading: false })
      return response.data.downloadUrl
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  fetchSecurityEvents: async () => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) return

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get<SecurityEvent[]>(
        `/enterprise/organizations/${currentOrganization.id}/security-events`
      )
      set({ securityEvents: response.data, isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  acknowledgeSecurityEvent: async (eventId: string) => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.post(`/enterprise/security-events/${eventId}/acknowledge`)
      set(state => ({
        securityEvents: state.securityEvents.map(event =>
          event.id === eventId ? { ...event, status: 'investigating' as const } : event
        ),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  resolveSecurityEvent: async (eventId: string, resolution: string) => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.post(`/enterprise/security-events/${eventId}/resolve`, { resolution })
      set(state => ({
        securityEvents: state.securityEvents.map(event =>
          event.id === eventId ? { 
            ...event, 
            status: 'resolved' as const,
            resolution,
            resolvedAt: new Date()
          } : event
        ),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  // Data Export/Deletion (GDPR/CCPA)
  requestDataExport: async (type: 'gdpr' | 'ccpa' | 'general', options: any) => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<DataExportRequest>('/privacy/data-export', { type, ...options })
      set(state => ({
        dataExportRequests: [...state.dataExportRequests, response.data],
        isLoading: false
      }))
      return response.data
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  requestDataDeletion: async (options: any) => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<DataDeletionRequest>('/privacy/data-deletion', options)
      set(state => ({
        dataDeletionRequests: [...state.dataDeletionRequests, response.data],
        isLoading: false
      }))
      return response.data
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  fetchDataRequests: async () => {
    set({ isLoading: true, error: null })
    try {
      const [exportResponse, deletionResponse] = await Promise.all([
        apiClient.get<DataExportRequest[]>('/privacy/data-export'),
        apiClient.get<DataDeletionRequest[]>('/privacy/data-deletion')
      ])
      set({
        dataExportRequests: exportResponse.data,
        dataDeletionRequests: deletionResponse.data,
        isLoading: false
      })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  downloadDataExport: async (requestId: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get(`/privacy/data-export/${requestId}/download`, {
        responseType: 'blob'
      })
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `data-export-${requestId}.zip`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      set({ isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  verifyDataDeletion: async (requestId: string, code: string) => {
    set({ isLoading: true, error: null })
    try {
      await apiClient.post(`/privacy/data-deletion/${requestId}/verify`, { code })
      set(state => ({
        dataDeletionRequests: state.dataDeletionRequests.map(request =>
          request.id === requestId ? { ...request, verification: { ...request.verification, verifiedAt: new Date() } } : request
        ),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  // Reporting
  fetchReportTemplates: async () => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) return

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get<ReportTemplate[]>(`/enterprise/organizations/${currentOrganization.id}/reports/templates`)
      set({ reportTemplates: response.data, isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  createReportTemplate: async (template: Partial<ReportTemplate>) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<ReportTemplate>(
        `/enterprise/organizations/${currentOrganization.id}/reports/templates`,
        template
      )
      set(state => ({
        reportTemplates: [...state.reportTemplates, response.data],
        isLoading: false
      }))
      return response.data
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  updateReportTemplate: async (id: string, template: Partial<ReportTemplate>) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.put<ReportTemplate>(
        `/enterprise/organizations/${currentOrganization.id}/reports/templates/${id}`,
        template
      )
      set(state => ({
        reportTemplates: state.reportTemplates.map(t => t.id === id ? response.data : t),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  deleteReportTemplate: async (id: string) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      await apiClient.delete(`/enterprise/organizations/${currentOrganization.id}/reports/templates/${id}`)
      set(state => ({
        reportTemplates: state.reportTemplates.filter(t => t.id !== id),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  generateReport: async (templateId: string, filters?: any) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<GeneratedReport>(
        `/enterprise/organizations/${currentOrganization.id}/reports/generate`,
        { templateId, filters }
      )
      set(state => ({
        generatedReports: [...state.generatedReports, response.data],
        isLoading: false
      }))
      return response.data
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  fetchGeneratedReports: async () => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) return

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get<GeneratedReport[]>(`/enterprise/organizations/${currentOrganization.id}/reports`)
      set({ generatedReports: response.data, isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  downloadReport: async (reportId: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get(`/enterprise/reports/${reportId}/download`, {
        responseType: 'blob'
      })
      
      const contentDisposition = response.headers['content-disposition']
      const filename = contentDisposition ? 
        contentDisposition.split('filename=')[1]?.replace(/"/g, '') : 
        `report-${reportId}.pdf`
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      set({ isLoading: false })
      
      // Update download count
      set(state => ({
        generatedReports: state.generatedReports.map(report =>
          report.id === reportId ? { ...report, downloadCount: report.downloadCount + 1 } : report
        )
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  scheduleReport: async (templateId: string, schedule: any) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      await apiClient.post(`/enterprise/organizations/${currentOrganization.id}/reports/templates/${templateId}/schedule`, schedule)
      // Refresh templates to get updated schedule
      await get().enterprise.fetchReportTemplates()
      set({ isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  // API Management
  fetchApiKeys: async () => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) return

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get<OrganizationApiKey[]>(`/enterprise/organizations/${currentOrganization.id}/api-keys`)
      set({ apiKeys: response.data, isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  createApiKey: async (data: Partial<OrganizationApiKey>) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<{ key: string; apiKey: OrganizationApiKey }>(
        `/enterprise/organizations/${currentOrganization.id}/api-keys`,
        data
      )
      set(state => ({
        apiKeys: [...state.apiKeys, response.data.apiKey],
        isLoading: false
      }))
      return response.data
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  updateApiKey: async (id: string, data: Partial<OrganizationApiKey>) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.put<OrganizationApiKey>(
        `/enterprise/organizations/${currentOrganization.id}/api-keys/${id}`,
        data
      )
      set(state => ({
        apiKeys: state.apiKeys.map(key => key.id === id ? response.data : key),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  revokeApiKey: async (id: string) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      await apiClient.delete(`/enterprise/organizations/${currentOrganization.id}/api-keys/${id}`)
      set(state => ({
        apiKeys: state.apiKeys.map(key => 
          key.id === id ? { ...key, status: 'revoked' as const } : key
        ),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  // Webhook Management
  fetchWebhookEndpoints: async () => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) return

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get<WebhookEndpoint[]>(`/enterprise/organizations/${currentOrganization.id}/webhooks`)
      set({ webhookEndpoints: response.data, isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  createWebhookEndpoint: async (endpoint: Partial<WebhookEndpoint>) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<WebhookEndpoint>(
        `/enterprise/organizations/${currentOrganization.id}/webhooks`,
        endpoint
      )
      set(state => ({
        webhookEndpoints: [...state.webhookEndpoints, response.data],
        isLoading: false
      }))
      return response.data
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  updateWebhookEndpoint: async (id: string, endpoint: Partial<WebhookEndpoint>) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.put<WebhookEndpoint>(
        `/enterprise/organizations/${currentOrganization.id}/webhooks/${id}`,
        endpoint
      )
      set(state => ({
        webhookEndpoints: state.webhookEndpoints.map(w => w.id === id ? response.data : w),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  deleteWebhookEndpoint: async (id: string) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      await apiClient.delete(`/enterprise/organizations/${currentOrganization.id}/webhooks/${id}`)
      set(state => ({
        webhookEndpoints: state.webhookEndpoints.filter(w => w.id !== id),
        isLoading: false
      }))
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  testWebhookEndpoint: async (id: string) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) throw new Error('No organization selected')

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.post<{ success: boolean; error?: string }>(
        `/enterprise/organizations/${currentOrganization.id}/webhooks/${id}/test`
      )
      set({ isLoading: false })
      return response.data
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
      throw error
    }
  },

  // Analytics
  fetchUsageMetrics: async (period?: { start: Date; end: Date }) => {
    const { currentOrganization } = get().enterprise
    if (!currentOrganization) return

    set({ isLoading: true, error: null })
    try {
      const response = await apiClient.get<UsageMetrics>(
        `/enterprise/organizations/${currentOrganization.id}/usage-metrics`,
        { params: period }
      )
      set({ usageMetrics: response.data, isLoading: false })
    } catch (error: any) {
      set({ error: error.message, isLoading: false })
    }
  },

  // Utility
  clearError: () => set({ error: null }),
  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setAuditFilters: (filters: Record<string, any>) => set({ auditFilters: filters }),
  setSelectedUserId: (userId: string | null) => set({ selectedUserId: userId })
})