import { prisma, dbLogger as logger } from './client.js'
import { cacheService } from './cache.js'
import { vectorService } from './vector.js'
import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'

// GDPR request types and schemas
export const GDPRRequestTypes = {
  DATA_EXPORT: 'gdpr_export',
  DATA_DELETION: 'gdpr_deletion',
  DATA_RECTIFICATION: 'gdpr_rectification',
  PROCESSING_RESTRICTION: 'gdpr_restriction',
  DATA_PORTABILITY: 'gdpr_portability',
  PROCESSING_OBJECTION: 'gdpr_objection'
} as const

export const GDPRRequestSchema = z.object({
  userId: z.string().uuid(),
  requestType: z.enum(Object.values(GDPRRequestTypes) as [string, ...string[]]),
  reason: z.string().optional(),
  specificData: z.array(z.string()).optional(),
  requestedFormat: z.enum(['json', 'csv', 'xml']).default('json'),
  includeDeletedData: z.boolean().default(false)
})

export const DataExportSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    displayName: z.string().nullable(),
    subscriptionTier: z.string(),
    createdAt: z.string(),
    lastLoginAt: z.string().nullable(),
    preferences: z.record(z.any()),
    privacySettings: z.record(z.any())
  }),
  documents: z.array(z.object({
    id: z.string(),
    title: z.string(),
    documentType: z.string(),
    documentHash: z.string(),
    url: z.string().nullable(),
    monitoringEnabled: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string()
  })),
  analyses: z.array(z.object({
    id: z.string(),
    documentId: z.string(),
    status: z.string(),
    overallRiskScore: z.number().nullable(),
    executiveSummary: z.string().nullable(),
    keyFindings: z.array(z.string()),
    recommendations: z.array(z.string()),
    createdAt: z.string(),
    completedAt: z.string().nullable()
  })),
  actions: z.array(z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    recipientEmail: z.string().nullable(),
    recipientCompany: z.string().nullable(),
    createdAt: z.string(),
    sentAt: z.string().nullable()
  })),
  sessions: z.array(z.object({
    id: z.string(),
    deviceInfo: z.record(z.any()).nullable(),
    ipAddress: z.string().nullable(),
    lastActivityAt: z.string(),
    createdAt: z.string()
  })),
  notifications: z.array(z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    message: z.string(),
    readAt: z.string().nullable(),
    createdAt: z.string()
  })),
  auditLogs: z.array(z.object({
    id: z.string(),
    action: z.string(),
    resourceType: z.string().nullable(),
    resourceId: z.string().nullable(),
    createdAt: z.string()
  })),
  metadata: z.object({
    exportedAt: z.string(),
    exportId: z.string(),
    dataRetentionPolicy: z.string(),
    legalBasis: z.string(),
    exportFormat: z.string(),
    includesDeletedData: z.boolean()
  })
})

// GDPR compliance service
export class GDPRService {
  private static instance: GDPRService

  static getInstance(): GDPRService {
    if (!GDPRService.instance) {
      GDPRService.instance = new GDPRService()
    }
    return GDPRService.instance
  }

  // Article 15: Right of Access - Generate complete data export
  async generateDataExport(
    userId: string,
    requestOptions: {
      format?: 'json' | 'csv' | 'xml'
      includeDeletedData?: boolean
      specificDataTypes?: string[]
    } = {}
  ): Promise<{
    exportId: string
    filePath: string
    fileSize: number
    expiresAt: Date
  }> {
    try {
      const exportId = this.generateExportId()
      logger.info({ userId, exportId }, 'Starting GDPR data export')

      // Create export request record
      const exportRequest = await prisma.dataExportRequest.create({
        data: {
          userId,
          requestType: GDPRRequestTypes.DATA_EXPORT,
          status: 'processing'
        }
      })

      // Collect all user data
      const userData = await this.collectUserData(userId, requestOptions.includeDeletedData || false)
      
      // Validate data structure
      const validatedData = DataExportSchema.parse(userData)

      // Generate export file
      const { filePath, fileSize } = await this.generateExportFile(
        exportId,
        validatedData,
        requestOptions.format || 'json'
      )

      // Update export request
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      await prisma.dataExportRequest.update({
        where: { id: exportRequest.id },
        data: {
          status: 'completed',
          filePath,
          fileSize,
          completedAt: new Date(),
          expiresAt
        }
      })

      // Log the export
      await this.logGDPRAction(userId, 'DATA_EXPORT_GENERATED', {
        exportId,
        fileSize,
        dataTypes: Object.keys(validatedData).filter(key => key !== 'metadata')
      })

      logger.info({ userId, exportId, fileSize }, 'GDPR data export completed')

      return {
        exportId,
        filePath,
        fileSize,
        expiresAt
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate GDPR data export')
      throw error
    }
  }

  // Article 17: Right to Erasure - Complete data deletion
  async processDataDeletion(
    userId: string,
    verificationToken: string,
    reason?: string
  ): Promise<{
    deletionId: string
    scheduledFor: Date
    itemsToDelete: number
  }> {
    try {
      logger.info({ userId }, 'Starting GDPR data deletion process')

      // Verify deletion request
      const deletionRequest = await prisma.dataDeletionRequest.findFirst({
        where: {
          userId,
          verificationToken,
          status: 'pending'
        }
      })

      if (!deletionRequest) {
        throw new Error('Invalid or expired deletion request')
      }

      // Count items to be deleted
      const itemsToDelete = await this.countUserData(userId)

      // Schedule deletion (48-hour delay for safety)
      const scheduledFor = new Date(Date.now() + 48 * 60 * 60 * 1000)
      
      await prisma.dataDeletionRequest.update({
        where: { id: deletionRequest.id },
        data: {
          status: 'verified',
          verifiedAt: new Date(),
          reason,
          scheduledFor
        }
      })

      const deletionId = deletionRequest.id

      // Log the deletion request
      await this.logGDPRAction(userId, 'DATA_DELETION_SCHEDULED', {
        deletionId,
        scheduledFor: scheduledFor.toISOString(),
        itemsToDelete,
        reason
      })

      logger.info({ userId, deletionId, scheduledFor, itemsToDelete }, 'GDPR data deletion scheduled')

      return {
        deletionId,
        scheduledFor,
        itemsToDelete
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process GDPR data deletion')
      throw error
    }
  }

  // Execute scheduled data deletion
  async executeDataDeletion(deletionId: string): Promise<{
    deletedItems: Record<string, number>
    completedAt: Date
  }> {
    try {
      const deletionRequest = await prisma.dataDeletionRequest.findUnique({
        where: { id: deletionId },
        include: { user: true }
      })

      if (!deletionRequest || deletionRequest.status !== 'verified') {
        throw new Error('Invalid deletion request')
      }

      const userId = deletionRequest.userId
      logger.info({ userId, deletionId }, 'Executing GDPR data deletion')

      const deletedItems: Record<string, number> = {}

      // Delete in specific order to respect foreign key constraints
      
      // 1. Delete from vector database
      try {
        await this.deleteUserVectorData(userId)
        deletedItems.vectorData = 1
      } catch (error) {
        logger.warn({ error, userId }, 'Failed to delete vector data')
      }

      // 2. Delete user sessions and invalidate cache
      const sessionCount = await prisma.userSession.count({ where: { userId } })
      await prisma.userSession.deleteMany({ where: { userId } })
      await cacheService.invalidateUserCache(userId)
      deletedItems.sessions = sessionCount

      // 3. Delete notifications
      const notificationCount = await prisma.notification.count({ where: { userId } })
      await prisma.notification.deleteMany({ where: { userId } })
      deletedItems.notifications = notificationCount

      // 4. Delete user actions
      const actionCount = await prisma.userAction.count({ where: { userId } })
      await prisma.userAction.deleteMany({ where: { userId } })
      deletedItems.actions = actionCount

      // 5. Delete analysis findings and analyses
      const analyses = await prisma.documentAnalysis.findMany({
        where: { userId },
        select: { id: true }
      })
      const analysisIds = analyses.map(a => a.id)
      
      if (analysisIds.length > 0) {
        const findingCount = await prisma.analysisFinding.count({
          where: { analysisId: { in: analysisIds } }
        })
        await prisma.analysisFinding.deleteMany({
          where: { analysisId: { in: analysisIds } }
        })
        deletedItems.findings = findingCount
      }

      const analysisCount = await prisma.documentAnalysis.count({ where: { userId } })
      await prisma.documentAnalysis.deleteMany({ where: { userId } })
      deletedItems.analyses = analysisCount

      // 6. Delete documents
      const documentCount = await prisma.document.count({ where: { userId } })
      await prisma.document.deleteMany({ where: { userId } })
      deletedItems.documents = documentCount

      // 7. Delete team memberships (but not teams owned)
      const membershipCount = await prisma.teamMember.count({ where: { userId } })
      await prisma.teamMember.deleteMany({ where: { userId } })
      deletedItems.teamMemberships = membershipCount

      // 8. Delete API keys
      const apiKeyCount = await prisma.apiKey.count({ where: { userId } })
      await prisma.apiKey.deleteMany({ where: { userId } })
      deletedItems.apiKeys = apiKeyCount

      // 9. Delete notification preferences
      const prefCount = await prisma.notificationPreference.count({ where: { userId } })
      await prisma.notificationPreference.deleteMany({ where: { userId } })
      deletedItems.preferences = prefCount

      // 10. Anonymize audit logs (don't delete for legal compliance)
      const auditLogCount = await prisma.auditLog.updateMany({
        where: { userId },
        data: { 
          userId: null,
          oldValues: null,
          newValues: null,
          ipAddress: null,
          userAgent: 'ANONYMIZED_GDPR_DELETION'
        }
      })
      deletedItems.auditLogsAnonymized = auditLogCount.count

      // 11. Finally, delete the user record
      await prisma.user.delete({ where: { id: userId } })
      deletedItems.user = 1

      // 12. Update deletion request
      const completedAt = new Date()
      await prisma.dataDeletionRequest.update({
        where: { id: deletionId },
        data: {
          status: 'completed',
          completedAt
        }
      })

      // Final cache cleanup
      await cacheService.deletePattern(`*${userId}*`)

      logger.info({ userId, deletionId, deletedItems }, 'GDPR data deletion completed')

      return {
        deletedItems,
        completedAt
      }
    } catch (error) {
      logger.error({ error, deletionId }, 'Failed to execute GDPR data deletion')
      
      // Update deletion request with error
      await prisma.dataDeletionRequest.update({
        where: { id: deletionId },
        data: { status: 'failed' }
      }).catch(() => {}) // Ignore update errors

      throw error
    }
  }

  // Article 16: Right to Rectification - Data correction
  async processDataRectification(
    userId: string,
    corrections: Record<string, any>
  ): Promise<{ corrected: string[]; errors: string[] }> {
    try {
      logger.info({ userId, corrections }, 'Processing GDPR data rectification')

      const corrected: string[] = []
      const errors: string[] = []

      // Update user profile fields
      const userFields = ['displayName', 'timezone', 'language', 'preferences', 'privacySettings']
      const userUpdates: Record<string, any> = {}

      for (const [field, value] of Object.entries(corrections)) {
        if (userFields.includes(field)) {
          userUpdates[field] = value
          corrected.push(`user.${field}`)
        }
      }

      if (Object.keys(userUpdates).length > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: userUpdates
        })
      }

      // Update notification preferences if provided
      if (corrections.notificationPreferences) {
        try {
          await prisma.notificationPreference.upsert({
            where: { userId },
            update: corrections.notificationPreferences,
            create: {
              userId,
              ...corrections.notificationPreferences
            }
          })
          corrected.push('notificationPreferences')
        } catch (error) {
          errors.push(`notificationPreferences: ${error}`)
        }
      }

      // Log the rectification
      await this.logGDPRAction(userId, 'DATA_RECTIFICATION', {
        correctedFields: corrected,
        errorFields: errors
      })

      // Invalidate user cache
      await cacheService.invalidateUserCache(userId)

      logger.info({ userId, corrected, errors }, 'GDPR data rectification completed')

      return { corrected, errors }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process GDPR data rectification')
      throw error
    }
  }

  // Article 18: Right to Restriction of Processing
  async restrictProcessing(
    userId: string,
    restrictionType: 'temporary' | 'permanent',
    reason: string
  ): Promise<{ restrictionId: string }> {
    try {
      logger.info({ userId, restrictionType, reason }, 'Processing GDPR processing restriction')

      // Update user status to restrict processing
      await prisma.user.update({
        where: { id: userId },
        data: {
          status: 'suspended',
          privacySettings: {
            processingRestricted: true,
            restrictionType,
            restrictionReason: reason,
            restrictionDate: new Date().toISOString()
          }
        }
      })

      // Create processing record
      const restrictionId = randomBytes(16).toString('hex')
      await prisma.dataProcessingRecord.create({
        data: {
          userId,
          processingType: 'restriction',
          legalBasis: 'gdpr_article_18',
          dataCategories: ['all_user_data'],
          retentionPeriod: restrictionType === 'temporary' ? '6 months' : 'indefinite'
        }
      })

      // Log the restriction
      await this.logGDPRAction(userId, 'PROCESSING_RESTRICTED', {
        restrictionId,
        restrictionType,
        reason
      })

      // Invalidate user cache
      await cacheService.invalidateUserCache(userId)

      logger.info({ userId, restrictionId }, 'GDPR processing restriction applied')

      return { restrictionId }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process GDPR processing restriction')
      throw error
    }
  }

  // Article 20: Right to Data Portability
  async generatePortableData(userId: string): Promise<{
    exportId: string
    data: any
    format: 'json'
  }> {
    try {
      logger.info({ userId }, 'Generating GDPR portable data')

      const exportId = this.generateExportId()
      
      // Collect structured data in portable format
      const portableData = await this.collectPortableUserData(userId)

      // Log the portability request
      await this.logGDPRAction(userId, 'DATA_PORTABILITY_EXPORT', {
        exportId,
        dataSize: JSON.stringify(portableData).length
      })

      logger.info({ userId, exportId }, 'GDPR portable data generated')

      return {
        exportId,
        data: portableData,
        format: 'json'
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate GDPR portable data')
      throw error
    }
  }

  // Check GDPR compliance status
  async checkComplianceStatus(userId: string): Promise<{
    compliant: boolean
    issues: string[]
    dataRetention: {
      oldestRecord: string
      recordsNearExpiry: number
    }
    userRights: {
      hasExportRequest: boolean
      hasDeletionRequest: boolean
      processingRestricted: boolean
    }
  }> {
    try {
      const issues: string[] = []

      // Check user data
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          dataExportRequests: true,
          dataDeletionRequests: true
        }
      })

      if (!user) {
        throw new Error('User not found')
      }

      // Check data retention policy compliance
      const oldestAnalysis = await prisma.documentAnalysis.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' }
      })

      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      const recordsNearExpiry = await prisma.documentAnalysis.count({
        where: {
          userId,
          expiresAt: {
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Expires in 7 days
          }
        }
      })

      // Check for old records that should be deleted
      if (oldestAnalysis && oldestAnalysis.createdAt < ninetyDaysAgo) {
        issues.push('Analysis records older than 90 days detected')
      }

      // Check consent and legal basis
      if (!user.privacySettings || Object.keys(user.privacySettings).length === 0) {
        issues.push('Missing privacy settings and consent records')
      }

      const compliant = issues.length === 0

      return {
        compliant,
        issues,
        dataRetention: {
          oldestRecord: oldestAnalysis?.createdAt.toISOString() || 'N/A',
          recordsNearExpiry
        },
        userRights: {
          hasExportRequest: user.dataExportRequests.length > 0,
          hasDeletionRequest: user.dataDeletionRequests.length > 0,
          processingRestricted: (user.privacySettings as any)?.processingRestricted === true
        }
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to check GDPR compliance status')
      throw error
    }
  }

  // Private helper methods
  private async collectUserData(userId: string, includeDeleted: boolean) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        documents: {
          where: includeDeleted ? {} : { deletedAt: null }
        },
        documentAnalyses: {
          include: {
            findings: true
          }
        },
        userActions: true,
        sessions: true,
        notifications: true,
        notificationPreference: true,
        auditLogs: true,
        apiKeys: true,
        teamMemberships: {
          include: {
            team: true
          }
        }
      }
    })

    if (!user) {
      throw new Error('User not found')
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        subscriptionTier: user.subscriptionTier,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() || null,
        preferences: user.preferences,
        privacySettings: user.privacySettings
      },
      documents: user.documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        documentType: doc.documentType,
        documentHash: doc.documentHash,
        url: doc.url,
        monitoringEnabled: doc.monitoringEnabled,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString()
      })),
      analyses: user.documentAnalyses.map(analysis => ({
        id: analysis.id,
        documentId: analysis.documentId,
        status: analysis.status,
        overallRiskScore: analysis.overallRiskScore,
        executiveSummary: analysis.executiveSummary,
        keyFindings: analysis.keyFindings,
        recommendations: analysis.recommendations,
        createdAt: analysis.createdAt.toISOString(),
        completedAt: analysis.completedAt?.toISOString() || null
      })),
      actions: user.userActions.map(action => ({
        id: action.id,
        title: action.title,
        status: action.status,
        recipientEmail: action.recipientEmail,
        recipientCompany: action.recipientCompany,
        createdAt: action.createdAt.toISOString(),
        sentAt: action.sentAt?.toISOString() || null
      })),
      sessions: user.sessions.map(session => ({
        id: session.id,
        deviceInfo: session.deviceInfo,
        ipAddress: session.ipAddress?.toString() || null,
        lastActivityAt: session.lastActivityAt.toISOString(),
        createdAt: session.createdAt.toISOString()
      })),
      notifications: user.notifications.map(notification => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        readAt: notification.readAt?.toISOString() || null,
        createdAt: notification.createdAt.toISOString()
      })),
      auditLogs: user.auditLogs.map(log => ({
        id: log.id,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        createdAt: log.createdAt.toISOString()
      })),
      metadata: {
        exportedAt: new Date().toISOString(),
        exportId: this.generateExportId(),
        dataRetentionPolicy: '90 days for analysis data, indefinite for user profile',
        legalBasis: 'GDPR Article 15 - Right of Access',
        exportFormat: 'json',
        includesDeletedData: includeDeleted
      }
    }
  }

  private async collectPortableUserData(userId: string) {
    // Similar to collectUserData but in a more structured, portable format
    // This would return data in a format suitable for importing into another system
    const userData = await this.collectUserData(userId, false)
    
    return {
      version: '1.0',
      userId: userData.user.id,
      exportedAt: new Date().toISOString(),
      profile: userData.user,
      documents: userData.documents,
      analyses: userData.analyses,
      preferences: userData.user.preferences
    }
  }

  private async countUserData(userId: string): Promise<number> {
    const counts = await Promise.all([
      prisma.document.count({ where: { userId } }),
      prisma.documentAnalysis.count({ where: { userId } }),
      prisma.userAction.count({ where: { userId } }),
      prisma.userSession.count({ where: { userId } }),
      prisma.notification.count({ where: { userId } }),
      prisma.apiKey.count({ where: { userId } }),
      prisma.teamMember.count({ where: { userId } })
    ])

    return counts.reduce((total, count) => total + count, 1) // +1 for user record
  }

  private async deleteUserVectorData(userId: string): Promise<void> {
    try {
      // Delete document embeddings
      const userDocuments = await prisma.document.findMany({
        where: { userId },
        select: { id: true }
      })

      for (const doc of userDocuments) {
        await vectorService.deleteDocument(doc.id)
        await vectorService.deleteDocumentClauses(doc.id)
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to delete vector data')
    }
  }

  private async generateExportFile(
    exportId: string,
    data: any,
    format: 'json' | 'csv' | 'xml'
  ): Promise<{ filePath: string; fileSize: number }> {
    // In a real implementation, this would write to a file system or cloud storage
    // For now, we'll simulate the file generation
    const content = JSON.stringify(data, null, 2)
    const fileSize = Buffer.byteLength(content, 'utf8')
    const filePath = `/exports/${exportId}.${format}`

    // Here you would actually write the file to storage
    // fs.writeFileSync(filePath, content)

    return { filePath, fileSize }
  }

  private generateExportId(): string {
    return `export_${Date.now()}_${randomBytes(8).toString('hex')}`
  }

  private async logGDPRAction(
    userId: string,
    action: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: `GDPR_${action}`,
          resourceType: 'gdpr_request',
          newValues: metadata
        }
      })
    } catch (error) {
      logger.error({ error, userId, action }, 'Failed to log GDPR action')
    }
  }
}

// Export singleton instance
export const gdprService = GDPRService.getInstance()

// Utility functions for GDPR compliance
export class GDPRUtils {
  // Generate verification token for sensitive operations
  static generateVerificationToken(): string {
    return randomBytes(32).toString('hex')
  }

  // Hash verification token for storage
  static hashVerificationToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  // Validate data retention periods
  static isDataExpired(createdAt: Date, retentionDays: number = 90): boolean {
    const expiryDate = new Date(createdAt.getTime() + retentionDays * 24 * 60 * 60 * 1000)
    return new Date() > expiryDate
  }

  // Anonymize sensitive data
  static anonymizeData(data: any): any {
    const anonymized = { ...data }
    
    // Remove or hash sensitive fields
    const sensitiveFields = ['email', 'ipAddress', 'deviceInfo', 'userAgent']
    
    for (const field of sensitiveFields) {
      if (anonymized[field]) {
        if (field === 'email') {
          anonymized[field] = GDPRUtils.anonymizeEmail(anonymized[field])
        } else {
          anonymized[field] = '[ANONYMIZED]'
        }
      }
    }

    return anonymized
  }

  // Anonymize email addresses
  static anonymizeEmail(email: string): string {
    const [localPart, domain] = email.split('@')
    const anonymizedLocal = localPart.charAt(0) + '*'.repeat(localPart.length - 2) + localPart.charAt(localPart.length - 1)
    return `${anonymizedLocal}@${domain}`
  }

  // Check if user has given consent for processing
  static hasValidConsent(user: any, processingType: string): boolean {
    const consent = user.privacySettings?.consent?.[processingType]
    return consent?.granted === true && new Date(consent.grantedAt) > new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  }

  // Generate consent record
  static generateConsentRecord(
    processingType: string,
    legalBasis: string,
    granted: boolean = true
  ): any {
    return {
      processingType,
      legalBasis,
      granted,
      grantedAt: new Date().toISOString(),
      version: '1.0',
      ipAddress: null, // Should be set by caller
      userAgent: null  // Should be set by caller
    }
  }
}