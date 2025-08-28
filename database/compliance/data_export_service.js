/**
 * GDPR Data Export Service for Fine Print AI
 * Handles automated data export requests and compliance workflows
 */

const fs = require('fs').promises;
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class GDPRDataExportService {
  constructor(options = {}) {
    this.prisma = options.prisma || new PrismaClient();
    this.exportPath = options.exportPath || './data-exports';
    this.encryptionKey = options.encryptionKey || process.env.ENCRYPTION_KEY;
    this.baseUrl = options.baseUrl || process.env.BASE_URL || 'https://api.fineprintai.com';
    
    // Supported export formats
    this.supportedFormats = ['json', 'xml', 'csv'];
    
    // Data retention settings
    this.exportRetentionDays = options.exportRetentionDays || 30;
    this.downloadLinkExpiryHours = options.downloadLinkExpiryHours || 72;
  }

  /**
   * Process GDPR data export request
   */
  async processDataExportRequest(userId, requestType = 'gdpr_export', options = {}) {
    const {
      format = 'json',
      includeMetadata = true,
      encryptExport = true,
      notifyUser = true,
    } = options;

    try {
      // Validate user and request
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { notificationPreference: true }
      });

      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      if (!this.supportedFormats.includes(format)) {
        throw new Error(`Unsupported export format: ${format}`);
      }

      // Create export request record
      const exportRequest = await this.prisma.dataExportRequest.create({
        data: {
          userId,
          requestType,
          status: 'processing',
          requestedAt: new Date(),
        }
      });

      // Generate comprehensive data export
      const exportData = await this.generateComprehensiveExport(userId, format, includeMetadata);
      
      // Create export file
      const exportFile = await this.createExportFile(exportData, format, exportRequest.id, encryptExport);
      
      // Update export request with file information
      await this.prisma.dataExportRequest.update({
        where: { id: exportRequest.id },
        data: {
          status: 'completed',
          filePath: exportFile.path,
          fileSize: exportFile.size,
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + (this.exportRetentionDays * 24 * 60 * 60 * 1000))
        }
      });

      // Generate secure download link
      const downloadLink = this.generateDownloadLink(exportRequest.id, exportFile.fileName);

      // Notify user if requested
      if (notifyUser && user.notificationPreference?.emailEnabled) {
        await this.sendExportNotification(user, downloadLink, exportRequest.id);
      }

      // Log the export in audit trail
      await this.logDataExport(userId, exportRequest.id, requestType);

      return {
        requestId: exportRequest.id,
        downloadLink,
        expiresAt: new Date(Date.now() + (this.downloadLinkExpiryHours * 60 * 60 * 1000)),
        fileSize: exportFile.size,
        format
      };

    } catch (error) {
      console.error('Data export failed:', error);
      
      // Update request status to failed if it exists
      if (exportRequest?.id) {
        await this.prisma.dataExportRequest.update({
          where: { id: exportRequest.id },
          data: {
            status: 'failed',
            completedAt: new Date()
          }
        }).catch(console.error);
      }

      throw error;
    }
  }

  /**
   * Generate comprehensive user data export
   */
  async generateComprehensiveExport(userId, format, includeMetadata) {
    const exportData = {
      metadata: includeMetadata ? {
        exportId: uuidv4(),
        userId,
        generatedAt: new Date().toISOString(),
        format,
        version: '1.0',
        legalBasis: 'GDPR Article 15 - Right of Access',
        dataController: 'Fine Print AI',
        contact: 'privacy@fineprintai.com'
      } : null,

      // Personal account information
      accountInformation: await this.exportAccountInformation(userId),

      // Document metadata (no content per privacy-first design)
      documents: await this.exportDocuments(userId),

      // Analysis results
      documentAnalyses: await this.exportDocumentAnalyses(userId),

      // User actions and templates used
      userActions: await this.exportUserActions(userId),

      // Notification preferences and history
      notifications: await this.exportNotifications(userId),

      // API usage data
      apiUsage: await this.exportApiUsage(userId),

      // Team memberships and collaborations
      teamMemberships: await this.exportTeamMemberships(userId),

      // Consent records
      consentRecords: await this.exportConsentRecords(userId),

      // Integration configurations
      integrations: await this.exportIntegrations(userId),

      // Audit log entries
      auditTrail: await this.exportAuditTrail(userId)
    };

    return exportData;
  }

  /**
   * Export user account information
   */
  async exportAccountInformation(userId) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        timezone: true,
        language: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        privacySettings: true,
        preferences: true,
        createdAt: true,
        lastLoginAt: true,
        loginCount: true
      }
    });

    return user;
  }

  /**
   * Export user documents metadata
   */
  async exportDocuments(userId) {
    const documents = await this.prisma.document.findMany({
      where: { 
        userId,
        deletedAt: null 
      },
      select: {
        id: true,
        title: true,
        url: true,
        documentType: true,
        language: true,
        monitoringEnabled: true,
        monitoringFrequency: true,
        sourceInfo: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return documents;
  }

  /**
   * Export document analyses
   */
  async exportDocumentAnalyses(userId) {
    const analyses = await this.prisma.documentAnalysis.findMany({
      where: { userId },
      include: {
        document: {
          select: { title: true, documentType: true }
        },
        findings: {
          select: {
            category: true,
            title: true,
            description: true,
            severity: true,
            recommendation: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return analyses.map(analysis => ({
      id: analysis.id,
      document: analysis.document,
      version: analysis.version,
      status: analysis.status,
      overallRiskScore: analysis.overallRiskScore,
      executiveSummary: analysis.executiveSummary,
      keyFindings: analysis.keyFindings,
      recommendations: analysis.recommendations,
      findings: analysis.findings,
      completedAt: analysis.completedAt,
      createdAt: analysis.createdAt
    }));
  }

  /**
   * Export user actions
   */
  async exportUserActions(userId) {
    const actions = await this.prisma.userAction.findMany({
      where: { userId },
      include: {
        template: {
          select: { name: true, category: true }
        },
        document: {
          select: { title: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return actions.map(action => ({
      id: action.id,
      title: action.title,
      recipientCompany: action.recipientCompany,
      status: action.status,
      template: action.template,
      document: action.document,
      sentAt: action.sentAt,
      responseReceivedAt: action.responseReceivedAt,
      createdAt: action.createdAt
    }));
  }

  /**
   * Export notifications
   */
  async exportNotifications(userId) {
    const [preferences, notifications] = await Promise.all([
      this.prisma.notificationPreference.findUnique({
        where: { userId }
      }),
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 1000 // Limit to last 1000 notifications
      })
    ]);

    return {
      preferences,
      notificationHistory: notifications.map(n => ({
        type: n.type,
        title: n.title,
        message: n.message,
        readAt: n.readAt,
        createdAt: n.createdAt
      }))
    };
  }

  /**
   * Export API usage data
   */
  async exportApiUsage(userId) {
    const [apiKeys, recentUsage] = await Promise.all([
      this.prisma.apiKey.findMany({
        where: { userId, isActive: true },
        select: {
          name: true,
          keyPrefix: true,
          permissions: true,
          usageCount: true,
          lastUsedAt: true,
          createdAt: true
        }
      }),
      this.prisma.apiUsage.findMany({
        where: {
          apiKey: { userId }
        },
        select: {
          endpoint: true,
          method: true,
          statusCode: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 10000 // Last 10k API calls
      })
    ]);

    return {
      apiKeys,
      recentUsage
    };
  }

  /**
   * Export team memberships
   */
  async exportTeamMemberships(userId) {
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId },
      include: {
        team: {
          select: {
            name: true,
            slug: true,
            subscriptionTier: true
          }
        }
      }
    });

    return memberships.map(m => ({
      team: m.team,
      role: m.role,
      joinedAt: m.joinedAt,
      createdAt: m.createdAt
    }));
  }

  /**
   * Export consent records
   */
  async exportConsentRecords(userId) {
    // This would query gdpr_consent_records table
    // Using raw query since it's not in Prisma schema yet
    const consentRecords = await this.prisma.$queryRaw`
      SELECT consent_type, consent_given, consent_method, processing_purposes,
             valid_from, valid_until, created_at
      FROM gdpr_consent_records 
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    return consentRecords;
  }

  /**
   * Export integrations
   */
  async exportIntegrations(userId) {
    const integrations = await this.prisma.integration.findMany({
      where: { userId },
      select: {
        type: true,
        name: true,
        configuration: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true
      }
    });

    return integrations;
  }

  /**
   * Export audit trail
   */
  async exportAuditTrail(userId) {
    const auditLogs = await this.prisma.auditLog.findMany({
      where: { userId },
      select: {
        action: true,
        resourceType: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 1000 // Last 1000 audit entries
    });

    return auditLogs;
  }

  /**
   * Create export file in specified format
   */
  async createExportFile(exportData, format, requestId, encrypt = true) {
    const fileName = `fineprintai-export-${requestId}.${format}${encrypt ? '.enc' : ''}`;
    const filePath = path.join(this.exportPath, fileName);

    // Ensure export directory exists
    await fs.mkdir(this.exportPath, { recursive: true });

    let fileContent;

    // Convert data to requested format
    switch (format) {
      case 'json':
        fileContent = JSON.stringify(exportData, null, 2);
        break;
      case 'xml':
        fileContent = this.convertToXML(exportData);
        break;
      case 'csv':
        fileContent = this.convertToCSV(exportData);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    // Encrypt if requested
    if (encrypt && this.encryptionKey) {
      fileContent = this.encryptData(fileContent);
    }

    // Write file
    await fs.writeFile(filePath, fileContent);

    // Get file stats
    const stats = await fs.stat(filePath);

    return {
      path: filePath,
      fileName,
      size: stats.size
    };
  }

  /**
   * Convert data to XML format
   */
  convertToXML(data) {
    const xmlBuilder = require('xmlbuilder');
    const root = xmlBuilder.create('FinePrintAIExport');
    
    this.buildXMLNode(root, data);
    
    return root.end({ pretty: true });
  }

  /**
   * Recursively build XML nodes
   */
  buildXMLNode(parent, obj, nodeName = null) {
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        const itemNode = parent.ele(nodeName || 'item');
        this.buildXMLNode(itemNode, item);
      });
    } else if (obj !== null && typeof obj === 'object') {
      Object.entries(obj).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          const childNode = parent.ele(key);
          this.buildXMLNode(childNode, value);
        }
      });
    } else {
      parent.txt(String(obj || ''));
    }
  }

  /**
   * Convert data to CSV format (simplified)
   */
  convertToCSV(data) {
    const csv = require('csv-stringify/sync');
    
    // Flatten the data structure for CSV
    const flatData = this.flattenForCSV(data);
    
    return csv(flatData, { 
      header: true,
      columns: Object.keys(flatData[0] || {})
    });
  }

  /**
   * Flatten nested object for CSV export
   */
  flattenForCSV(obj, prefix = '') {
    let result = [];
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        result = result.concat(this.flattenForCSV(item, `${prefix}[${index}]`));
      });
    } else if (obj !== null && typeof obj === 'object') {
      const flattened = {};
      Object.entries(obj).forEach(([key, value]) => {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (Array.isArray(value) && value.length > 0) {
          if (typeof value[0] === 'object') {
            result = result.concat(this.flattenForCSV(value, newKey));
          } else {
            flattened[newKey] = value.join('; ');
          }
        } else if (value !== null && typeof value === 'object') {
          Object.assign(flattened, this.flattenForCSV(value, newKey)[0] || {});
        } else {
          flattened[newKey] = value;
        }
      });
      
      if (Object.keys(flattened).length > 0) {
        result.push(flattened);
      }
    }
    
    return result.length > 0 ? result : [{ [prefix || 'value']: obj }];
  }

  /**
   * Encrypt sensitive data
   */
  encryptData(data) {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not provided');
    }

    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, this.encryptionKey);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      algorithm,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      data: encrypted
    });
  }

  /**
   * Generate secure download link
   */
  generateDownloadLink(requestId, fileName) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + (this.downloadLinkExpiryHours * 60 * 60 * 1000));
    
    // In production, store this token in Redis or database with expiry
    // For now, we'll use a simple signed token
    const payload = {
      requestId,
      fileName,
      expiresAt: expiresAt.getTime()
    };
    
    const signature = crypto
      .createHmac('sha256', this.encryptionKey || 'fallback-key')
      .update(JSON.stringify(payload))
      .digest('hex');
    
    const downloadToken = Buffer.from(JSON.stringify({ ...payload, signature })).toString('base64');
    
    return `${this.baseUrl}/api/v1/gdpr/download/${downloadToken}`;
  }

  /**
   * Send export notification to user
   */
  async sendExportNotification(user, downloadLink, requestId) {
    // This would integrate with your email service
    const emailData = {
      to: user.email,
      subject: 'Your Fine Print AI Data Export is Ready',
      template: 'data_export_ready',
      variables: {
        userName: user.displayName || user.email,
        downloadLink,
        expiresIn: `${this.downloadLinkExpiryHours} hours`,
        requestId
      }
    };

    // Integration point for email service (SendGrid, etc.)
    console.log('Email notification would be sent:', emailData);
    
    // Create notification record
    await this.prisma.notification.create({
      data: {
        userId: user.id,
        type: 'data_export_ready',
        title: 'Your data export is ready',
        message: `Your requested data export is now available for download. The download link will expire in ${this.downloadLinkExpiryHours} hours.`,
        actionUrl: downloadLink,
        expiresAt: new Date(Date.now() + (this.downloadLinkExpiryHours * 60 * 60 * 1000))
      }
    });
  }

  /**
   * Log data export in audit trail
   */
  async logDataExport(userId, requestId, requestType) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'GDPR_DATA_EXPORT',
        resourceType: 'user',
        newValues: {
          requestId,
          requestType,
          exportedAt: new Date(),
          legalBasis: 'GDPR Article 15'
        }
      }
    });
  }

  /**
   * Clean up expired export files
   */
  async cleanupExpiredExports() {
    const expiredRequests = await this.prisma.dataExportRequest.findMany({
      where: {
        expiresAt: {
          lt: new Date()
        },
        status: 'completed'
      }
    });

    let deletedCount = 0;

    for (const request of expiredRequests) {
      try {
        if (request.filePath) {
          await fs.unlink(request.filePath);
        }
        
        await this.prisma.dataExportRequest.update({
          where: { id: request.id },
          data: {
            status: 'expired',
            filePath: null
          }
        });
        
        deletedCount++;
      } catch (error) {
        console.error(`Failed to cleanup export ${request.id}:`, error);
      }
    }

    console.log(`Cleaned up ${deletedCount} expired data exports`);
    return deletedCount;
  }

  /**
   * Validate download token and serve file
   */
  async validateAndServeExport(downloadToken) {
    try {
      const payload = JSON.parse(Buffer.from(downloadToken, 'base64').toString());
      const { requestId, fileName, expiresAt, signature } = payload;
      
      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', this.encryptionKey || 'fallback-key')
        .update(JSON.stringify({ requestId, fileName, expiresAt }))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        throw new Error('Invalid download token');
      }
      
      // Check expiry
      if (Date.now() > expiresAt) {
        throw new Error('Download link has expired');
      }
      
      // Get export request
      const exportRequest = await this.prisma.dataExportRequest.findUnique({
        where: { id: requestId }
      });
      
      if (!exportRequest || exportRequest.status !== 'completed') {
        throw new Error('Export request not found or not completed');
      }
      
      // Check file exists
      const filePath = exportRequest.filePath;
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      
      if (!fileExists) {
        throw new Error('Export file not found');
      }
      
      return {
        filePath,
        fileName,
        fileSize: exportRequest.fileSize
      };
      
    } catch (error) {
      console.error('Download validation failed:', error);
      throw new Error('Invalid or expired download link');
    }
  }
}

module.exports = GDPRDataExportService;