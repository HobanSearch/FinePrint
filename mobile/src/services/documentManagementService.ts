/**
 * Document Management Service
 * Handles document history, favorites, and export functionality
 */

import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import * as MailComposer from 'expo-mail-composer';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { performanceMonitor } from '../utils/performance';
import { ProcessedDocument } from './documentProcessor';
import { AnalysisResult } from './offlineAnalysisEngine';
import { shareIntegrationService, ShareExportOptions } from './shareIntegrationService';

const FAVORITES_KEY = 'document_favorites';
const SETTINGS_KEY = 'document_management_settings';

export interface DocumentFolder {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  parentId?: string;
  children?: DocumentFolder[];
}

export interface DocumentTag {
  id: string;
  name: string;
  color: string;
  description?: string;
  createdAt: string;
  usageCount: number;
}

export interface DocumentMetric {
  id: string;
  documentId: string;
  metricType: 'view' | 'share' | 'export' | 'analysis' | 'favorite';
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface DocumentHistory {
  id: string;
  documentId: string;
  action: 'created' | 'viewed' | 'edited' | 'shared' | 'exported' | 'analyzed' | 'deleted';
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface DocumentManagementSettings {
  defaultFolder?: string;
  autoDeleteAfterDays: number;
  maxStorageSize: number; // MB
  enableCloudBackup: boolean;
  compressionLevel: number;
  thumbnailQuality: number;
  enableAnalytics: boolean;
  defaultExportFormat: 'pdf' | 'images' | 'text' | 'json';
}

export interface DocumentSearchOptions {
  query?: string;
  folderId?: string;
  tags?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  sortBy?: 'name' | 'date' | 'size' | 'relevance';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface DocumentStats {
  totalDocuments: number;
  totalSize: number;
  averageSize: number;
  documentsByType: Record<string, number>;
  documentsByMonth: Record<string, number>;
  mostUsedTags: DocumentTag[];
  favoriteCount: number;
  storageUsage: {
    used: number;
    available: number;
    percentage: number;
  };
}

class DocumentManagementService {
  private db: SQLite.WebSQLDatabase | null = null;
  private settings: DocumentManagementSettings;
  private favorites: Set<string> = new Set();
  private isInitialized = false;

  constructor() {
    this.settings = {
      autoDeleteAfterDays: 365, // 1 year
      maxStorageSize: 1024, // 1 GB
      enableCloudBackup: false,
      compressionLevel: 80,
      thumbnailQuality: 70,
      enableAnalytics: true,
      defaultExportFormat: 'pdf',
    };
  }

  /**
   * Initialize document management service
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing document management service...');

      // Initialize database
      await this.initializeDatabase();

      // Load settings and favorites
      await this.loadSettings();
      await this.loadFavorites();

      // Set up cleanup tasks
      this.scheduleCleanupTasks();

      this.isInitialized = true;
      logger.info('Document management service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize document management service:', error);
      throw error;
    }
  }

  /**
   * Create a new folder
   */
  async createFolder(
    name: string,
    description?: string,
    parentId?: string,
    color?: string
  ): Promise<DocumentFolder> {
    try {
      const folder: DocumentFolder = {
        id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        description,
        color: color || '#007AFF',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        documentCount: 0,
        parentId,
      };

      await this.executeSql(
        `INSERT INTO folders (id, name, description, color, parent_id, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [folder.id, folder.name, folder.description, folder.color, folder.parentId, folder.createdAt, folder.updatedAt]
      );

      logger.info(`Created folder: ${folder.name}`);
      return folder;
    } catch (error) {
      logger.error('Failed to create folder:', error);
      throw error;
    }
  }

  /**
   * Get all folders
   */
  async getFolders(): Promise<DocumentFolder[]> {
    try {
      const result = await this.executeSql('SELECT * FROM folders ORDER BY name');
      const folders: DocumentFolder[] = [];

      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        const documentCount = await this.getDocumentCountInFolder(row.id);
        
        folders.push({
          id: row.id,
          name: row.name,
          description: row.description,
          color: row.color,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          documentCount,
          parentId: row.parent_id,
        });
      }

      return folders;
    } catch (error) {
      logger.error('Failed to get folders:', error);
      return [];
    }
  }

  /**
   * Create a new tag
   */
  async createTag(name: string, color: string, description?: string): Promise<DocumentTag> {
    try {
      const tag: DocumentTag = {
        id: `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        color,
        description,
        createdAt: new Date().toISOString(),
        usageCount: 0,
      };

      await this.executeSql(
        'INSERT INTO tags (id, name, color, description, created_at) VALUES (?, ?, ?, ?, ?)',
        [tag.id, tag.name, tag.color, tag.description, tag.createdAt]
      );

      logger.info(`Created tag: ${tag.name}`);
      return tag;
    } catch (error) {
      logger.error('Failed to create tag:', error);
      throw error;
    }
  }

  /**
   * Get all tags
   */
  async getTags(): Promise<DocumentTag[]> {
    try {
      const result = await this.executeSql(`
        SELECT t.*, COUNT(dt.document_id) as usage_count 
        FROM tags t 
        LEFT JOIN document_tags dt ON t.id = dt.tag_id 
        GROUP BY t.id 
        ORDER BY usage_count DESC, t.name
      `);
      
      const tags: DocumentTag[] = [];
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        tags.push({
          id: row.id,
          name: row.name,
          color: row.color,
          description: row.description,
          createdAt: row.created_at,
          usageCount: row.usage_count || 0,
        });
      }

      return tags;
    } catch (error) {
      logger.error('Failed to get tags:', error);
      return [];
    }
  }

  /**
   * Add document to folder
   */
  async addDocumentToFolder(documentId: string, folderId: string): Promise<void> {
    try {
      await this.executeSql(
        'INSERT OR REPLACE INTO document_folders (document_id, folder_id) VALUES (?, ?)',
        [documentId, folderId]
      );

      logger.info(`Added document ${documentId} to folder ${folderId}`);
    } catch (error) {
      logger.error('Failed to add document to folder:', error);
      throw error;
    }
  }

  /**
   * Add tags to document
   */
  async addTagsToDocument(documentId: string, tagIds: string[]): Promise<void> {
    try {
      // Remove existing tags first
      await this.executeSql('DELETE FROM document_tags WHERE document_id = ?', [documentId]);

      // Add new tags
      for (const tagId of tagIds) {
        await this.executeSql(
          'INSERT INTO document_tags (document_id, tag_id) VALUES (?, ?)',
          [documentId, tagId]
        );
      }

      logger.info(`Added ${tagIds.length} tags to document ${documentId}`);
    } catch (error) {
      logger.error('Failed to add tags to document:', error);
      throw error;
    }
  }

  /**
   * Add/remove document from favorites
   */
  async toggleFavorite(documentId: string): Promise<boolean> {
    try {
      const isFavorite = this.favorites.has(documentId);
      
      if (isFavorite) {
        this.favorites.delete(documentId);
        await this.executeSql('DELETE FROM favorites WHERE document_id = ?', [documentId]);
      } else {
        this.favorites.add(documentId);
        await this.executeSql(
          'INSERT INTO favorites (document_id, created_at) VALUES (?, ?)',
          [documentId, new Date().toISOString()]
        );
      }

      await this.saveFavorites();
      await this.recordMetric(documentId, 'favorite', { isFavorite: !isFavorite });

      logger.info(`Document ${documentId} ${isFavorite ? 'removed from' : 'added to'} favorites`);
      return !isFavorite;
    } catch (error) {
      logger.error('Failed to toggle favorite:', error);
      throw error;
    }
  }

  /**
   * Search documents
   */
  async searchDocuments(options: DocumentSearchOptions): Promise<{
    documents: ProcessedDocument[];
    totalCount: number;
    hasMore: boolean;
  }> {
    try {
      const {
        query,
        folderId,
        tags,
        dateRange,
        sortBy = 'date',
        sortOrder = 'desc',
        limit = 20,
        offset = 0,
      } = options;

      let sql = `
        SELECT DISTINCT dm.document_data, dm.created_at 
        FROM document_metadata dm
      `;
      const params: any[] = [];
      const conditions: string[] = [];

      // Join with folders if needed
      if (folderId) {
        sql += ' INNER JOIN document_folders df ON dm.document_id = df.document_id';
        conditions.push('df.folder_id = ?');
        params.push(folderId);
      }

      // Join with tags if needed
      if (tags && tags.length > 0) {
        sql += ' INNER JOIN document_tags dt ON dm.document_id = dt.document_id';
        conditions.push(`dt.tag_id IN (${tags.map(() => '?').join(', ')})`);
        params.push(...tags);
      }

      // Text search
      if (query) {
        conditions.push('(dm.document_data LIKE ? OR dm.document_data LIKE ?)');
        params.push(`%${query}%`, `%${query}%`);
      }

      // Date range
      if (dateRange) {
        conditions.push('dm.created_at BETWEEN ? AND ?');
        params.push(dateRange.start, dateRange.end);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      // Sorting
      let orderBy = 'dm.created_at DESC';
      switch (sortBy) {
        case 'name':
          orderBy = `JSON_EXTRACT(dm.document_data, '$.title') ${sortOrder.toUpperCase()}`;
          break;
        case 'size':
          orderBy = `JSON_EXTRACT(dm.document_data, '$.totalSize') ${sortOrder.toUpperCase()}`;
          break;
        case 'date':
          orderBy = `dm.created_at ${sortOrder.toUpperCase()}`;
          break;
      }

      sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const result = await this.executeSql(sql, params);
      const documents: ProcessedDocument[] = [];

      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        const document = JSON.parse(row.document_data);
        documents.push(document);
      }

      // Get total count
      const countSql = sql.replace(/SELECT DISTINCT.*?FROM/, 'SELECT COUNT(DISTINCT dm.document_id) as count FROM')
                          .replace(/ORDER BY.*$/, '');
      const countResult = await this.executeSql(countSql, params.slice(0, -2)); // Remove limit and offset
      const totalCount = countResult.rows.item(0).count;

      return {
        documents,
        totalCount,
        hasMore: offset + documents.length < totalCount,
      };
    } catch (error) {
      logger.error('Document search failed:', error);
      return { documents: [], totalCount: 0, hasMore: false };
    }
  }

  /**
   * Export document with options
   */
  async exportDocument(
    document: ProcessedDocument,
    options: ShareExportOptions & {
      destination?: 'share' | 'save' | 'email' | 'cloud';
      emailRecipients?: string[];
      emailSubject?: string;
      emailBody?: string;
    }
  ): Promise<string> {
    try {
      logger.info(`Exporting document ${document.id}`);
      performanceMonitor.startTimer('document_export');

      // Export document using share integration service
      const exportPath = await shareIntegrationService.exportDocument(document, options);

      // Handle different destinations
      switch (options.destination) {
        case 'share':
          await shareIntegrationService.shareExportedDocument(exportPath);
          break;
        
        case 'save':
          await this.saveToDeviceStorage(exportPath, document.title);
          break;
        
        case 'email':
          await this.sendViaEmail(exportPath, document, options);
          break;
        
        case 'cloud':
          await this.uploadToCloud(exportPath, document);
          break;
      }

      // Record metrics
      await this.recordMetric(document.id, 'export', {
        format: options.format,
        destination: options.destination,
      });

      const exportTime = performanceMonitor.endTimer('document_export');
      logger.info(`Document exported in ${exportTime}ms`);

      return exportPath;
    } catch (error) {
      logger.error('Document export failed:', error);
      throw error;
    }
  }

  /**
   * Get document statistics
   */
  async getDocumentStats(): Promise<DocumentStats> {
    try {
      const result = await this.executeSql(`
        SELECT 
          COUNT(*) as total_documents,
          SUM(JSON_EXTRACT(document_data, '$.totalSize')) as total_size,
          AVG(JSON_EXTRACT(document_data, '$.totalSize')) as average_size
        FROM document_metadata
      `);

      const row = result.rows.item(0);
      const totalDocuments = row.total_documents || 0;
      const totalSize = row.total_size || 0;
      const averageSize = row.average_size || 0;

      // Get documents by type
      const typeResult = await this.executeSql(`
        SELECT 
          JSON_EXTRACT(document_data, '$.metadata.source') as type,
          COUNT(*) as count
        FROM document_metadata 
        GROUP BY type
      `);

      const documentsByType: Record<string, number> = {};
      for (let i = 0; i < typeResult.rows.length; i++) {
        const typeRow = typeResult.rows.item(i);
        documentsByType[typeRow.type || 'unknown'] = typeRow.count;
      }

      // Get documents by month
      const monthResult = await this.executeSql(`
        SELECT 
          strftime('%Y-%m', created_at) as month,
          COUNT(*) as count
        FROM document_metadata 
        GROUP BY month 
        ORDER BY month DESC 
        LIMIT 12
      `);

      const documentsByMonth: Record<string, number> = {};
      for (let i = 0; i < monthResult.rows.length; i++) {
        const monthRow = monthResult.rows.item(i);
        documentsByMonth[monthRow.month] = monthRow.count;
      }

      // Get most used tags
      const mostUsedTags = await this.getTags();
      mostUsedTags.sort((a, b) => b.usageCount - a.usageCount);

      // Get favorite count
      const favoriteCount = this.favorites.size;

      // Calculate storage usage
      const storageUsage = await this.calculateStorageUsage();

      return {
        totalDocuments,
        totalSize,
        averageSize,
        documentsByType,
        documentsByMonth,
        mostUsedTags: mostUsedTags.slice(0, 10),
        favoriteCount,
        storageUsage,
      };
    } catch (error) {
      logger.error('Failed to get document stats:', error);
      return {
        totalDocuments: 0,
        totalSize: 0,
        averageSize: 0,
        documentsByType: {},
        documentsByMonth: {},
        mostUsedTags: [],
        favoriteCount: 0,
        storageUsage: { used: 0, available: 0, percentage: 0 },
      };
    }
  }

  /**
   * Clean up old documents
   */
  async cleanupOldDocuments(): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.settings.autoDeleteAfterDays);

      const result = await this.executeSql(
        'SELECT document_id FROM document_metadata WHERE created_at < ?',
        [cutoffDate.toISOString()]
      );

      let deletedCount = 0;
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        try {
          await this.deleteDocument(row.document_id);
          deletedCount++;
        } catch (error) {
          logger.error(`Failed to delete old document ${row.document_id}:`, error);
        }
      }

      logger.info(`Cleaned up ${deletedCount} old documents`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to clean up old documents:', error);
      return 0;
    }
  }

  /**
   * Private helper methods
   */
  private async initializeDatabase(): Promise<void> {
    this.db = SQLite.openDatabase('document_management.db');

    // Create tables
    await this.executeSql(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#007AFF',
        parent_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES folders(id)
      )
    `);

    await this.executeSql(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL
      )
    `);

    await this.executeSql(`
      CREATE TABLE IF NOT EXISTS document_metadata (
        document_id TEXT PRIMARY KEY,
        document_data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    await this.executeSql(`
      CREATE TABLE IF NOT EXISTS document_folders (
        document_id TEXT,
        folder_id TEXT,
        PRIMARY KEY (document_id, folder_id),
        FOREIGN KEY (document_id) REFERENCES document_metadata(document_id),
        FOREIGN KEY (folder_id) REFERENCES folders(id)
      )
    `);

    await this.executeSql(`
      CREATE TABLE IF NOT EXISTS document_tags (
        document_id TEXT,
        tag_id TEXT,
        PRIMARY KEY (document_id, tag_id),
        FOREIGN KEY (document_id) REFERENCES document_metadata(document_id),
        FOREIGN KEY (tag_id) REFERENCES tags(id)
      )
    `);

    await this.executeSql(`
      CREATE TABLE IF NOT EXISTS favorites (
        document_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES document_metadata(document_id)
      )
    `);

    await this.executeSql(`
      CREATE TABLE IF NOT EXISTS document_history (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        action TEXT NOT NULL,
        metadata TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES document_metadata(document_id)
      )
    `);

    await this.executeSql(`
      CREATE TABLE IF NOT EXISTS document_metrics (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        metadata TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES document_metadata(document_id)
      )
    `);
  }

  private async executeSql(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.transaction(tx => {
        tx.executeSql(
          sql,
          params,
          (_, result) => resolve(result),
          (_, error) => {
            reject(error);
            return false;
          }
        );
      });
    });
  }

  private async getDocumentCountInFolder(folderId: string): Promise<number> {
    try {
      const result = await this.executeSql(
        'SELECT COUNT(*) as count FROM document_folders WHERE folder_id = ?',
        [folderId]
      );
      return result.rows.item(0).count;
    } catch (error) {
      return 0;
    }
  }

  private async recordMetric(
    documentId: string,
    metricType: DocumentMetric['metricType'],
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const metric: DocumentMetric = {
        id: `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        documentId,
        metricType,
        timestamp: new Date().toISOString(),
        metadata,
      };

      await this.executeSql(
        'INSERT INTO document_metrics (id, document_id, metric_type, metadata, timestamp) VALUES (?, ?, ?, ?, ?)',
        [metric.id, metric.documentId, metric.metricType, JSON.stringify(metric.metadata), metric.timestamp]
      );
    } catch (error) {
      logger.error('Failed to record metric:', error);
    }
  }

  private async saveToDeviceStorage(filePath: string, fileName: string): Promise<void> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Media library permissions not granted');
      }

      const asset = await MediaLibrary.createAssetAsync(filePath);
      await MediaLibrary.createAlbumAsync('Fine Print AI', asset, false);
      
      logger.info(`Document saved to device storage: ${fileName}`);
    } catch (error) {
      logger.error('Failed to save to device storage:', error);
      throw error;
    }
  }

  private async sendViaEmail(
    filePath: string,
    document: ProcessedDocument,
    options: any
  ): Promise<void> {
    try {
      const isAvailable = await MailComposer.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Email is not available on this device');
      }

      await MailComposer.composeAsync({
        recipients: options.emailRecipients || [],
        subject: options.emailSubject || `Fine Print Analysis: ${document.title}`,
        body: options.emailBody || `Please find attached the analysis for "${document.title}".`,
        attachments: [filePath],
      });

      logger.info('Document sent via email');
    } catch (error) {
      logger.error('Failed to send via email:', error);
      throw error;
    }
  }

  private async uploadToCloud(filePath: string, document: ProcessedDocument): Promise<void> {
    // Cloud upload implementation would go here
    logger.info('Cloud upload not implemented yet');
  }

  private async calculateStorageUsage(): Promise<{
    used: number;
    available: number;
    percentage: number;
  }> {
    try {
      const documentsDir = `${FileSystem.documentDirectory}documents/`;
      const info = await FileSystem.getInfoAsync(documentsDir);
      const used = info.size || 0;
      const maxSize = this.settings.maxStorageSize * 1024 * 1024; // Convert MB to bytes
      const available = maxSize - used;
      const percentage = (used / maxSize) * 100;

      return { used, available, percentage };
    } catch (error) {
      return { used: 0, available: 0, percentage: 0 };
    }
  }

  private async deleteDocument(documentId: string): Promise<void> {
    try {
      // Delete from database
      await this.executeSql('DELETE FROM document_metadata WHERE document_id = ?', [documentId]);
      await this.executeSql('DELETE FROM document_folders WHERE document_id = ?', [documentId]);
      await this.executeSql('DELETE FROM document_tags WHERE document_id = ?', [documentId]);
      await this.executeSql('DELETE FROM favorites WHERE document_id = ?', [documentId]);
      await this.executeSql('DELETE FROM document_history WHERE document_id = ?', [documentId]);
      await this.executeSql('DELETE FROM document_metrics WHERE document_id = ?', [documentId]);

      // Remove from favorites set
      this.favorites.delete(documentId);

      logger.info(`Document ${documentId} deleted from management system`);
    } catch (error) {
      logger.error(`Failed to delete document ${documentId}:`, error);
      throw error;
    }
  }

  private scheduleCleanupTasks(): void {
    // Run cleanup every 24 hours
    setInterval(() => {
      this.cleanupOldDocuments().catch(error => {
        logger.error('Scheduled cleanup failed:', error);
      });
    }, 24 * 60 * 60 * 1000);
  }

  private async loadSettings(): Promise<void> {
    try {
      const settingsString = await AsyncStorage.getItem(SETTINGS_KEY);
      if (settingsString) {
        this.settings = { ...this.settings, ...JSON.parse(settingsString) };
      }
    } catch (error) {
      logger.error('Failed to load document management settings:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      logger.error('Failed to save document management settings:', error);
    }
  }

  private async loadFavorites(): Promise<void> {
    try {
      const result = await this.executeSql('SELECT document_id FROM favorites');
      this.favorites.clear();
      
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        this.favorites.add(row.document_id);
      }
    } catch (error) {
      logger.error('Failed to load favorites:', error);
    }
  }

  private async saveFavorites(): Promise<void> {
    try {
      const favoritesArray = Array.from(this.favorites);
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favoritesArray));
    } catch (error) {
      logger.error('Failed to save favorites:', error);
    }
  }

  /**
   * Public getters and methods
   */
  getSettings(): DocumentManagementSettings {
    return { ...this.settings };
  }

  async updateSettings(newSettings: Partial<DocumentManagementSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
  }

  getFavorites(): string[] {
    return Array.from(this.favorites);
  }

  isFavorite(documentId: string): boolean {
    return this.favorites.has(documentId);
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    try {
      await this.saveSettings();
      await this.saveFavorites();
      logger.info('Document management service cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup document management service:', error);
    }
  }
}

export const documentManagementService = new DocumentManagementService();